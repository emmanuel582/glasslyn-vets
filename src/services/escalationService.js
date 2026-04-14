// ============================================
// Glasslyn Vets — Escalation Service
// ============================================
// Orchestrates the entire vet notification and
// failover workflow for urgent cases.

const logger = require('../utils/logger');
const { config } = require('../config');
const caseService = require('./caseService');
const whatsappService = require('./whatsappService');
const retellService = require('./retellService');
const db = require('../database');
const { normalisePhone } = require('../utils/helpers');

// Active escalation timers — keyed by case ID
const escalationTimers = new Map();

/**
 * Start the full escalation workflow for an urgent case.
 * 1. Notify primary vet (call + WhatsApp)
 * 2. Start 15-minute timeout
 * 3. If no response or rejection → escalate to secondary vet
 *
 * @param {string} caseId - The case ID to escalate
 */
async function escalateCase(caseId) {
  const caseData = caseService.getCase(caseId);
  if (!caseData) {
    logger.error(`Cannot escalate — case not found: ${caseId}`);
    return;
  }

  // Determine which vet to notify based on escalation level
  const currentLevel = (caseData.escalation_level || 0) + 1;
  const vetIndex = currentLevel - 1;

  // Fetch all vets dynamically from the database
  const allVets = db.getAllVets();

  if (vetIndex >= allVets.length) {
    // All vets exhausted
    logger.error(`All ${allVets.length} vets exhausted for case ${caseId}. Manual intervention required.`);
    db.addAuditLog(caseId, 'all_vets_exhausted', {
      message: 'All configured vets failed to respond or rejected.',
    });
    db.updateCase(caseId, { status: 'closed' });
    return;
  }

  const vet = allVets[vetIndex];

  if (!vet.phone) {
    logger.error(`No phone number configured for level ${currentLevel} vet`);
    // Try next level
    db.updateCase(caseId, { escalation_level: currentLevel });
    return escalateCase(caseId);
  }

  logger.info(`Escalating case ${caseId} to level ${currentLevel}: ${vet.name}`, {
    caseId,
    vetName: vet.name,
    vetPhone: vet.phone,
    level: currentLevel,
  });

  // Update case with assigned vet
  caseService.startEscalation(caseId, vet.name, vet.phone, currentLevel);

  // Refresh case data after update
  const updatedCase = caseService.getCase(caseId);

  try {
    // Step 1: Make outbound call to vet — "Check your WhatsApp"
    try {
      await retellService.callVetNotification(vet.phone, vet.name, caseId);
      db.addAuditLog(caseId, 'vet_call_initiated', { vetName: vet.name, vetPhone: vet.phone });
    } catch (callErr) {
      logger.error(`Outbound call to vet failed, continuing with WhatsApp`, {
        caseId,
        error: callErr.message,
      });
      db.addAuditLog(caseId, 'vet_call_failed', { error: callErr.message });
    }

    // Step 2: Send WhatsApp message with case details + response options
    try {
      await whatsappService.sendCaseToVet(vet.phone, updatedCase);
      db.addAuditLog(caseId, 'whatsapp_sent_to_vet', { vetName: vet.name, vetPhone: vet.phone });
    } catch (waErr) {
      logger.error(`WhatsApp message to vet failed`, {
        caseId,
        error: waErr.message,
      });
      db.addAuditLog(caseId, 'whatsapp_send_failed', { error: waErr.message });
    }

    // Step 3: Start failover timer
    startFailoverTimer(caseId);
  } catch (err) {
    logger.error(`Escalation failed for case ${caseId}`, { error: err.message });
    db.addAuditLog(caseId, 'escalation_error', { error: err.message });
  }
}

/**
 * Start a 15-minute failover timer for a case.
 * If the vet doesn't respond, escalates to the next vet.
 */
function startFailoverTimer(caseId) {
  // Clear any existing timer for this case
  cancelFailoverTimer(caseId);

  const timeoutMs = config.escalation.timeoutMinutes * 60 * 1000;

  logger.info(`Failover timer started for case ${caseId}: ${config.escalation.timeoutMinutes} minutes`, {
    caseId,
  });

  const timer = setTimeout(async () => {
    escalationTimers.delete(caseId);

    // Check current case status — maybe the vet already responded
    const currentCase = caseService.getCase(caseId);
    if (!currentCase) return;

    if (currentCase.status === 'accepted' || currentCase.status === 'closed') {
      logger.info(`Failover timer fired but case ${caseId} is already ${currentCase.status}`);
      return;
    }

    logger.warn(`Failover timer expired for case ${caseId}. No vet response.`, { caseId });
    db.addAuditLog(caseId, 'failover_timeout', {
      previousVet: currentCase.assigned_vet_name,
      previousLevel: currentCase.escalation_level,
    });

    // Notify the current vet that the case has been escalated
    try {
      if (currentCase.assigned_vet_phone) {
        await whatsappService.notifyVetEscalated(currentCase.assigned_vet_phone, caseId);
      }
    } catch (err) {
      logger.error(`Failed to notify vet of escalation`, { error: err.message });
    }

    // Escalate to next vet
    await escalateCase(caseId);
  }, timeoutMs);

  escalationTimers.set(caseId, timer);
}

/**
 * Cancel the failover timer for a case (e.g., vet responded).
 */
function cancelFailoverTimer(caseId) {
  if (escalationTimers.has(caseId)) {
    clearTimeout(escalationTimers.get(caseId));
    escalationTimers.delete(caseId);
    logger.info(`Failover timer cancelled for case ${caseId}`);
  }
}

/**
 * Handle vet response from WhatsApp.
 * Called when a vet replies with 1, 2, or 3.
 *
 * @param {string} vetPhone - The vet's phone number (from WhatsApp message)
 * @param {string} response - The vet's response ("1", "2", or "3")
 */
async function handleVetResponse(vetPhone, response) {
  const cleanedPhone = normalisePhone(vetPhone);

  // Find the active case assigned to this vet
  let activeCase = db.findActiveCaseForVet(cleanedPhone);

  if (!activeCase) {
    // FALLBACK: If WPPConnect obscures the vet's phone behind a Linked Device ID (@lid) 
    // and we couldn't resolve it, check if there are escalating cases.
    // If so, we safely assume they are the vet responding to the most recent one.
    const escalatingCases = db.getActiveCases().filter(c => c.status === 'escalating');

    if (escalatingCases.length > 0) {
      // getActiveCases() returns cases ordered by created_at DESC, so index 0 is the newest
      activeCase = escalatingCases[0];
      logger.info(`Fallback: Matched unidentified vet response to the most recent escalating case`, {
        caseId: activeCase.id,
        totalEscalating: escalatingCases.length
      });
    } else {
      logger.warn(`Received vet response but no active case found for phone: ${cleanedPhone}. (No escalating cases found)`);
      return null;
    }
  }

  const caseId = activeCase.id;
  logger.info(`Vet response received for case ${caseId}`, { vetPhone: cleanedPhone, response });

  const trimmedResponse = response.trim();

  if (trimmedResponse === '1') {
    // Accept — arrive within 1 hour
    cancelFailoverTimer(caseId);
    caseService.vetAccepted(caseId, 'within_1_hour');
    db.addAuditLog(caseId, 'vet_response', { response: 'accept_within_1_hour' });

    // Notify caller
    const updatedCase = caseService.getCase(caseId);
    const callerWhatsapp = updatedCase.caller_whatsapp || updatedCase.caller_phone;
    try {
      await whatsappService.notifyCallerAccepted(callerWhatsapp, updatedCase, 'within_1_hour');
      db.addAuditLog(caseId, 'caller_notified', { eta: 'within_1_hour', sentTo: callerWhatsapp });
    } catch (err) {
      logger.error(`Failed to notify caller`, { caseId, error: err.message });
    }

    return { action: 'accepted', eta: 'within_1_hour', caseId };

  } else if (trimmedResponse === '2') {
    // Accept — arrive in over 1 hour
    cancelFailoverTimer(caseId);
    caseService.vetAccepted(caseId, 'over_1_hour');
    db.addAuditLog(caseId, 'vet_response', { response: 'accept_over_1_hour' });

    // Notify caller
    const updatedCase = caseService.getCase(caseId);
    const callerWhatsapp = updatedCase.caller_whatsapp || updatedCase.caller_phone;
    try {
      await whatsappService.notifyCallerAccepted(callerWhatsapp, updatedCase, 'over_1_hour');
      db.addAuditLog(caseId, 'caller_notified', { eta: 'over_1_hour', sentTo: callerWhatsapp });
    } catch (err) {
      logger.error(`Failed to notify caller`, { caseId, error: err.message });
    }

    return { action: 'accepted', eta: 'over_1_hour', caseId };

  } else if (trimmedResponse === '3') {
    // Reject
    cancelFailoverTimer(caseId);
    caseService.vetRejected(caseId);
    db.addAuditLog(caseId, 'vet_response', { response: 'rejected' });

    // Escalate to next vet
    logger.info(`Vet rejected case ${caseId}. Escalating to next vet.`);
    await escalateCase(caseId);

    return { action: 'rejected', caseId };

  } else {
    // Unrecognised response — send help text
    logger.warn(`Unrecognised vet response for case ${caseId}: "${trimmedResponse}"`);

    try {
      await whatsappService.sendMessage(
        cleanedPhone,
        `⚠️ Unrecognised response. Please reply with:\n\n` +
        `*1* → Accept (within 1 hour)\n` +
        `*2* → Accept (over 1 hour)\n` +
        `*3* → Reject`

      );
    } catch (err) {
      logger.error(`Failed to send help message to vet`, { error: err.message });
    }

    return null;
  }
}

module.exports = {
  escalateCase,
  handleVetResponse,
  cancelFailoverTimer,
};

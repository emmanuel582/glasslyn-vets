// ============================================
// Glasslyn Vets — Case Service
// ============================================
// High-level case management operations.

const logger = require('../utils/logger');
const { generateCaseId } = require('../utils/helpers');
const db = require('../database');

/**
 * Create a new case from collected call data.
 */
function openCase({ callerPhone, callerName, eircode, issueDescription, urgency, retellCallId }) {
  const caseId = generateCaseId();

  const newCase = db.createCase({
    id: caseId,
    caller_phone: callerPhone,
    caller_name: callerName || null,
    eircode: eircode || null,
    issue_description: issueDescription || null,
    urgency: urgency || 'pending',
    status: 'open',
    retell_call_id: retellCallId || null,
  });

  // Also upsert the caller record for future lookups
  if (callerPhone) {
    db.upsertCaller(callerPhone, callerName, eircode);
  }

  db.addAuditLog(caseId, 'case_created', {
    callerPhone,
    callerName,
    eircode,
    urgency,
    retellCallId,
  });

  logger.info(`Case created: ${caseId}`, { caseId, callerPhone, urgency });
  return newCase;
}

/**
 * Mark the case as escalating and assign a vet.
 */
function startEscalation(caseId, vetName, vetPhone, level) {
  const updated = db.updateCase(caseId, {
    status: 'escalating',
    assigned_vet_name: vetName,
    assigned_vet_phone: vetPhone,
    escalation_level: level,
  });

  db.addAuditLog(caseId, 'escalation_started', {
    vetName,
    vetPhone,
    level,
  });

  logger.info(`Escalation started for case ${caseId}`, { caseId, vetName, level });
  return updated;
}

/**
 * Record vet acceptance.
 */
function vetAccepted(caseId, eta) {
  const updated = db.updateCase(caseId, {
    status: 'accepted',
    vet_response: 'accepted',
    vet_eta: eta,
  });

  db.addAuditLog(caseId, 'vet_accepted', { eta });
  logger.info(`Vet accepted case ${caseId}`, { caseId, eta });
  return updated;
}

/**
 * Record vet rejection.
 */
function vetRejected(caseId) {
  const updated = db.updateCase(caseId, {
    vet_response: 'rejected',
    status: 'failover',
  });

  db.addAuditLog(caseId, 'vet_rejected', {});
  logger.info(`Vet rejected case ${caseId}`, { caseId });
  return updated;
}

/**
 * Mark a non-urgent case as logged for follow-up.
 */
function logForFollowUp(caseId) {
  const updated = db.updateCase(caseId, {
    status: 'logged',
  });

  db.addAuditLog(caseId, 'logged_for_followup', {});
  logger.info(`Case ${caseId} logged for follow-up`, { caseId });
  return updated;
}

/**
 * Close a case.
 */
function closeCase(caseId, reason) {
  const updated = db.updateCase(caseId, {
    status: 'closed',
  });

  db.addAuditLog(caseId, 'case_closed', { reason });
  logger.info(`Case ${caseId} closed`, { caseId, reason });
  return updated;
}

/**
 * Look up a caller by phone number.
 */
function lookupCaller(phone) {
  return db.findCallerByPhone(phone);
}

/**
 * Get a case by ID.
 */
function getCase(caseId) {
  return db.getCaseById(caseId);
}

module.exports = {
  openCase,
  startEscalation,
  vetAccepted,
  vetRejected,
  logForFollowUp,
  closeCase,
  lookupCaller,
  getCase,
};

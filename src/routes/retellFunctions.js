// ============================================
// Glasslyn Vets — Retell Custom Functions
// ============================================
// Handles function calls from the Retell AI agent
// during live calls. These are triggered by the LLM
// when it decides it needs external data or actions.

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const caseService = require('../services/caseService');
const triageService = require('../services/triageService');
const escalationService = require('../services/escalationService');
const whatsappService = require('../services/whatsappService');
const { normalisePhone } = require('../utils/helpers');
const db = require('../database');

/**
 * POST /retell/functions
 * Receives custom function calls from the Retell AI agent.
 *
 * Retell sends:
 * {
 *   "args": { ...function arguments... },
 *   "call_id": "call_xxx"
 * }
 *
 * We must return:
 * {
 *   "result": "string that the LLM will use"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Extract function name from various possible formats
    const functionName = body.function_name || body.name || body.tool_name || '';
    const args = body.args || body.arguments || body.parameters || {};
    const callId = body.call_id || body.call?.call_id || '';

    logger.info(`Retell function call: ${functionName}`, {
      functionName,
      args,
      callId,
    });

    let result;

    switch (functionName) {
      case 'lookup_caller':
        result = handleLookupCaller(args, callId);
        break;

      case 'save_case_details':
        result = handleSaveCaseDetails(args, callId);
        break;

      case 'determine_urgency':
        result = handleDetermineUrgency(args, callId);
        break;

      case 'trigger_escalation':
        result = await handleTriggerEscalation(args, callId);
        break;

      case 'log_non_urgent_case':
        result = await handleLogNonUrgentCase(args, callId);
        break;

      default:
        logger.warn(`Unknown function called: ${functionName}`);
        result = { error: `Unknown function: ${functionName}` };
    }

    // Retell expects a "result" field as a string
    const responsePayload = {
      result: typeof result === 'string' ? result : JSON.stringify(result),
    };

    logger.info(`Retell function response: ${functionName}`, { result: responsePayload });
    return res.status(200).json(responsePayload);
  } catch (err) {
    logger.error('Error handling Retell function call', { error: err.message, stack: err.stack });
    return res.status(200).json({
      result: JSON.stringify({
        error: 'An internal error occurred. Please continue the conversation.',
      }),
    });
  }
});

// ─── Function Handlers ────────────────────────────────

/**
 * lookup_caller — Check if the caller exists in our database.
 * Args: { phone: string }
 * Returns: { found: boolean, name?: string, eircode?: string }
 */
function handleLookupCaller(args, callId) {
  const phone = args.phone || '';
  if (!phone) {
    return { found: false, message: 'No phone number provided.' };
  }

  const caller = caseService.lookupCaller(phone);

  if (caller) {
    logger.info(`Caller found in database`, { phone, name: caller.name });
    return {
      found: true,
      name: caller.name || null,
      eircode: caller.eircode || null,
    };
  }

  logger.info(`Caller not found in database`, { phone });
  return { found: false };
}

/**
 * save_case_details — Save collected caller info and issue.
 * Args: { name, phone, whatsapp_number, eircode, issue_description, clinic_id }
 * Returns: { case_id, status }
 */
function handleSaveCaseDetails(args, callId) {
  const { name, phone, whatsapp_number, eircode, issue_description, clinic_id } = args;

  if (!phone) {
    return { error: 'Phone number is required to save a case.' };
  }

  // If the caller provided a separate WhatsApp number, use it.
  // Otherwise, their calling phone IS their WhatsApp number.
  let whatsappPhone = whatsapp_number ? normalisePhone(whatsapp_number) : normalisePhone(phone);
  if (whatsappPhone === 'OnFile') whatsappPhone = normalisePhone(phone);
  const parsedClinicId = parseInt(clinic_id, 10);

  // Overwrite name and eircode from CSV/database if the caller exists
  const existingCaller = db.findCallerByPhone(normalisePhone(phone));
  let finalName = name || null;
  let finalEircode = eircode || null;
  
  if (existingCaller) {
    finalName = existingCaller.name || finalName;
    finalEircode = existingCaller.eircode || finalEircode;
    logger.info('Caller found in CSV, using database name and eircode', { finalName, finalEircode });
  }

  if (finalName === 'On File' || finalName === 'OnFile') finalName = 'Unknown';
  if (finalEircode === 'On File' || finalEircode === 'OnFile') finalEircode = 'Unknown';

  logger.info('Saving case details', {
    callerPhone: normalisePhone(phone),
    whatsappPhone,
    whatsappProvided: !!whatsapp_number,
    clinicId: parsedClinicId || 1
  });

  const newCase = caseService.openCase({
    callerPhone: normalisePhone(phone),
    callerWhatsapp: whatsappPhone,
    callerName: finalName,
    eircode: finalEircode,
    issueDescription: issue_description || null,
    urgency: 'pending',
    retellCallId: callId,
    clinicId: isNaN(parsedClinicId) ? 1 : parsedClinicId,
  });

  return {
    case_id: newCase.id,
    status: newCase.status,
    message: `Case ${newCase.id} has been created successfully.`,
  };
}

/**
 * determine_urgency — Run triage on the issue description.
 * Args: { issue_description: string, case_id?: string }
 * Returns: { urgency, reason }
 */
function handleDetermineUrgency(args, callId) {
  const { issue_description, case_id } = args;

  const triageResult = triageService.determineUrgency(issue_description);

  // If we have a case_id, update the case with the urgency
  if (case_id) {
    db.updateCase(case_id, { urgency: triageResult.urgency });
    db.addAuditLog(case_id, 'triage_completed', triageResult);
  }

  return {
    urgency: triageResult.urgency,
    reason: triageResult.reason,
  };
}

/**
 * trigger_escalation — Start the vet notification workflow.
 * Args: { case_id: string }
 * Returns: { status, message }
 */
async function handleTriggerEscalation(args, callId) {
  const { case_id } = args;

  if (!case_id) {
    return { error: 'Case ID is required to trigger escalation.' };
  }

  const caseData = caseService.getCase(case_id);
  if (!caseData) {
    return { error: `Case ${case_id} not found.` };
  }

  // Update case urgency to urgent if not already
  db.updateCase(case_id, { urgency: 'urgent' });

  // Start escalation asynchronously (don't block the call)
  escalationService.escalateCase(case_id).catch((err) => {
    logger.error(`Escalation failed for case ${case_id}`, { error: err.message });
  });

  return {
    status: 'escalating',
    message: 'The on-call veterinarian is being contacted now. They will receive a call and a WhatsApp message with your case details.',
  };
}

/**
 * log_non_urgent_case — Log a non-urgent case for follow-up.
 * Args: { case_id: string }
 * Returns: { status, message }
 */
async function handleLogNonUrgentCase(args, callId) {
  const { case_id } = args;

  if (!case_id) {
    return { error: 'Case ID is required to log a non-urgent case.' };
  }

  const caseData = caseService.getCase(case_id);
  if (!caseData) {
    return { error: `Case ${case_id} not found.` };
  }

  // Mark case as logged
  caseService.logForFollowUp(case_id);

  // Send WhatsApp confirmation to caller (use WhatsApp number if available)
  try {
    const updatedCase = caseService.getCase(case_id);
    const callerWhatsapp = updatedCase.caller_whatsapp || updatedCase.caller_phone;
    if (callerWhatsapp) {
      const clinic = caseData.clinic_id ? db.getClinicById(caseData.clinic_id) : null;
      const clinicName = clinic ? clinic.name : undefined;
      await whatsappService.notifyCallerLogged(callerWhatsapp, updatedCase, clinicName);
    }
  } catch (err) {
    logger.warn(`Failed to send non-urgent WhatsApp to caller`, { error: err.message });
  }

  return {
    status: 'logged',
    message: 'Your case has been logged. The clinic will follow up when they reopen.',
  };
}

module.exports = router;

// ============================================
// Glasslyn Vets — Retell Webhook Handler
// ============================================
// Handles Retell call lifecycle events:
// call_started, call_ended, call_analyzed

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const db = require('../database');
const { normalisePhone } = require('../utils/helpers');

/**
 * POST /retell/webhook
 * Receives call lifecycle events from Retell AI.
 *
 * Events:
 * - call_started: Call has begun
 * - call_ended: Call has ended (includes transcript)
 * - call_analyzed: Post-call analysis complete
 */
router.post('/', (req, res) => {
  try {
    const { event, call } = req.body;

    if (!event) {
      logger.warn('Retell webhook received with no event type');
      return res.status(400).json({ error: 'Missing event type' });
    }

    logger.info(`Retell webhook: ${event}`, {
      callId: call?.call_id,
      fromNumber: call?.from_number,
      toNumber: call?.to_number,
    });

    switch (event) {
      case 'call_started':
        handleCallStarted(call);
        break;

      case 'call_ended':
        handleCallEnded(call);
        break;

      case 'call_analyzed':
        handleCallAnalyzed(call);
        break;

      default:
        logger.info(`Unhandled Retell webhook event: ${event}`);
    }

    // Retell expects a quick acknowledgement
    return res.status(204).send();
  } catch (err) {
    logger.error('Error processing Retell webhook', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle call_started event.
 * Log that a new call has been received.
 */
function handleCallStarted(call) {
  if (!call) return;

  logger.info('Call started', {
    callId: call.call_id,
    direction: call.direction,
    fromNumber: call.from_number,
    toNumber: call.to_number,
    agentId: call.agent_id,
  });

  db.addAuditLog(null, 'call_started', {
    callId: call.call_id,
    fromNumber: call.from_number,
    toNumber: call.to_number,
    direction: call.direction,
  });
}

/**
 * Handle call_ended event.
 * Log call completion and transcript summary.
 */
function handleCallEnded(call) {
  if (!call) return;

  logger.info('Call ended', {
    callId: call.call_id,
    duration: call.duration_ms,
    disconnectionReason: call.disconnection_reason,
  });

  db.addAuditLog(null, 'call_ended', {
    callId: call.call_id,
    duration: call.duration_ms,
    disconnectionReason: call.disconnection_reason,
    transcript: call.transcript ? call.transcript.substring(0, 500) : null,
  });
}

/**
 * Handle call_analyzed event.
 * Store post-call analysis (sentiment, summary, etc.)
 */
function handleCallAnalyzed(call) {
  if (!call) return;

  logger.info('Call analyzed', {
    callId: call.call_id,
    callAnalysis: call.call_analysis,
  });

  db.addAuditLog(null, 'call_analyzed', {
    callId: call.call_id,
    analysis: call.call_analysis,
  });
}

/**
 * POST /retell/webhook/inbound
 * Receives the initial inbound webhook from Retell BEFORE a call connects.
 * Used to extract the caller's phone number and the dialled DID to
 * determine which clinic they reached.
 */
router.post('/inbound', (req, res) => {
  try {
    const body = req.body || {};
    
    // DEBUG: Log the full raw body to understand Retell's exact payload structure
    logger.info(`[DEBUG] Raw Retell Inbound Webhook Payload:`, { rawPayload: JSON.stringify(body) });

    const callObj = body.call_inbound || body.call || body;
    const from_number = callObj.from_number || body.from || body.caller_number || body.fromNumber || "unknown";
    const to_number = callObj.to_number || body.to || body.dialed_number || body.toNumber || "unknown";
    const call_id = callObj.call_id || body.call_id || "unknown";

    logger.info(`Retell inbound webhook extracted values`, { from_number, to_number, call_id });

    // Look up caller
    const caller = db.findCallerByPhone(normalisePhone(from_number));
    let caller_name = "Unknown";
    let caller_found = "false";
    if (caller && caller.name) {
      caller_name = caller.name;
      caller_found = "true";
    }

    // Look up which clinic this DID belongs to
    const clinic = db.findClinicByDID(normalisePhone(to_number));
    
    if (clinic) {
      logger.info(`Call routed to clinic: ${clinic.name}`, { clinicId: clinic.id });
    } else {
      logger.warn(`DID ${to_number} not found in clinics table. Falling back to default.`);
    }

    const { config } = require('../config');

    // Inject the dynamic variables into the LLM context
    return res.status(200).json({
      override_agent_id: config.retell.agentId,
      dynamic_variables: {
        caller_phone: from_number || "Unknown",
        caller_name: caller_name,
        caller_found: caller_found,
        clinic_id: clinic ? clinic.id.toString() : "1",
        clinic_name: clinic ? clinic.name : "Glasslyn Vets"
      }
    });

  } catch (err) {
    logger.error('Error processing Retell inbound webhook', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

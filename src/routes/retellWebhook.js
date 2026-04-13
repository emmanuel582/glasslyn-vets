// ============================================
// Glasslyn Vets — Retell Webhook Handler
// ============================================
// Handles Retell call lifecycle events:
// call_started, call_ended, call_analyzed

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const db = require('../database');

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
});
}

/**
 * POST /inbound
 * Receives the initial inbound webhook from Retell BEFORE a call connects.
 * Used to extract the caller's phone number and inject it into the LLM context.
 */
router.post('/inbound', (req, res) => {
  try {
    const { from_number, to_number, call_id } = req.body;

    logger.info(`Retell inbound webhook received`, { from_number, to_number, call_id });

    // Inject the from_number as a dynamic variable into the LLM context
    return res.status(200).json({
      dynamic_variables: {
        caller_phone: from_number || "Unknown"
      }
    });
  } catch (err) {
    logger.error('Error processing Retell inbound webhook', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

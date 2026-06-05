// ============================================
// Glasslyn Vets — Telnyx Webhook Handler
// ============================================
// Handles outbound vet notification call events:
// call.answered → speak, call.machine.greeting.ended → speak (voicemail),
// call.speak.ended → hangup

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const db = require('../database');
const telnyxService = require('../services/telnyxService');

/**
 * POST /telnyx/webhook
 * Receives Call Control events from Telnyx Voice API.
 */
router.post('/', async (req, res) => {
  res.sendStatus(200);

  try {
    const eventData = req.body?.data;
    if (!eventData) {
      logger.warn('Telnyx webhook received with no data payload');
      return;
    }

    const eventType = eventData.event_type;
    const payload = eventData.payload || {};
    const callControlId = payload.call_control_id;

    logger.info(`Telnyx webhook: ${eventType}`, {
      callControlId,
      from: payload.from,
      to: payload.to,
    });

    const state = telnyxService.decodeClientState(payload.client_state);
    if (!telnyxService.isVetNotificationState(state)) {
      return;
    }

    switch (eventType) {
      case 'call.answered':
        await handleCallAnswered(callControlId, state);
        break;

      case 'call.machine.greeting.ended':
        await handleVoicemailGreetingEnded(callControlId, state);
        break;

      case 'call.speak.ended':
        await handleSpeakEnded(callControlId, state);
        break;

      default:
        break;
    }
  } catch (err) {
    logger.error('Error handling Telnyx webhook', {
      error: err.message,
      stack: err.stack,
    });
  }
});

async function handleCallAnswered(callControlId, state) {
  if (!callControlId || !state || state.stage !== telnyxService.VET_NOTIFICATION_STAGE) return;

  try {
    await telnyxService.speakVetNotification(callControlId, state);
    db.addAuditLog(state.caseId, 'telnyx_call_answered', {
      callControlId,
      vetName: state.vetName,
    });
  } catch (err) {
    logger.error('Failed to speak vet notification on call.answered', {
      callControlId,
      caseId: state.caseId,
      error: err.message,
    });
  }
}

async function handleVoicemailGreetingEnded(callControlId, state) {
  if (!callControlId || !state || state.stage !== telnyxService.VET_NOTIFICATION_STAGE) return;

  try {
    await telnyxService.speakVetNotification(callControlId, state);
    db.addAuditLog(state.caseId, 'telnyx_voicemail_message', {
      callControlId,
      vetName: state.vetName,
    });
  } catch (err) {
    logger.error('Failed to speak vet notification on voicemail', {
      callControlId,
      caseId: state.caseId,
      error: err.message,
    });
  }
}

async function handleSpeakEnded(callControlId, state) {
  if (!callControlId || !state || state.stage !== 'speaking') return;

  try {
    await telnyxService.hangupCall(callControlId);
    if (state?.caseId) {
      db.addAuditLog(state.caseId, 'telnyx_call_completed', {
        callControlId,
        vetName: state.vetName,
      });
    }
  } catch (err) {
    logger.error('Failed to hang up after vet notification', {
      callControlId,
      caseId: state?.caseId,
      error: err.message,
    });
  }
}

module.exports = router;

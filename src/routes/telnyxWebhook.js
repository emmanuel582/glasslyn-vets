// ============================================
// Glasslyn Vets — Telnyx Webhook Handler
// ============================================
// Handles outbound vet notification call events:
// call.answered → wait for AMD (if enabled), call.machine.detection.ended → human/machine,
// call.machine.greeting.ended → speak (voicemail), call.speak.ended → hangup,
// call.hangup → redial on no-answer

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { config } = require('../config');
const db = require('../database');
const telnyxService = require('../services/telnyxService');
const escalationService = require('../services/escalationService');

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
      hangupCause: payload.hangup_cause,
      amdResult: payload.result,
    });

    const state = telnyxService.decodeClientState(payload.client_state);
    if (!telnyxService.isVetNotificationState(state)) {
      return;
    }

    switch (eventType) {
      case 'call.answered':
        await handleCallAnswered(callControlId, state);
        break;

      case 'call.machine.detection.ended':
      case 'call.machine.premium.detection.ended':
        await handleMachineDetectionEnded(callControlId, state, payload);
        break;

      case 'call.machine.greeting.ended':
        await handleVoicemailGreetingEnded(callControlId, state);
        break;

      case 'call.speak.ended':
        await handleSpeakEnded(callControlId, state);
        break;

      case 'call.hangup':
        await handleCallHangup(payload, state);
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

  if (config.telnyx.amd) {
    logger.info('Telnyx call answered — waiting for AMD before delivery', {
      callControlId,
      caseId: state.caseId,
    });
    return;
  }

  try {
    await deliverVetNotification(callControlId, state, 'telnyx_call_answered');
  } catch (err) {
    logger.error('Failed to speak vet notification on call.answered', {
      callControlId,
      caseId: state.caseId,
      error: err.message,
    });
  }
}

async function handleMachineDetectionEnded(callControlId, state, payload) {
  if (!callControlId || !state || state.stage !== telnyxService.VET_NOTIFICATION_STAGE) return;
  if (state.delivered) return;

  const result = (payload.result || '').toLowerCase();

  logger.info('Telnyx AMD result received', {
    callControlId,
    caseId: state.caseId,
    result,
  });

  if (result === 'human') {
    try {
      await deliverVetNotification(callControlId, state, 'telnyx_call_answered');
    } catch (err) {
      logger.error('Failed to speak vet notification after human AMD', {
        callControlId,
        caseId: state.caseId,
        error: err.message,
      });
    }
    return;
  }

  // machine, not_sure, no_speech, etc. — wait for greeting.ended to leave voicemail message
  logger.info('Telnyx AMD detected machine or uncertain — waiting for voicemail greeting', {
    callControlId,
    caseId: state.caseId,
    result,
  });
}

async function handleVoicemailGreetingEnded(callControlId, state) {
  if (!callControlId || !state || state.stage !== telnyxService.VET_NOTIFICATION_STAGE) return;
  if (state.delivered) return;

  try {
    await deliverVetNotification(callControlId, state, 'telnyx_voicemail_message');
  } catch (err) {
    logger.error('Failed to speak vet notification on voicemail', {
      callControlId,
      caseId: state.caseId,
      error: err.message,
    });
  }
}

async function deliverVetNotification(callControlId, state, auditEventType) {
  await telnyxService.speakVetNotification(callControlId, state);
  db.addAuditLog(state.caseId, auditEventType, {
    callControlId,
    vetName: state.vetName,
    fromNumber: state.fromNumber,
    callerIdSource: state.callerIdSource,
  });
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

async function handleCallHangup(payload, state) {
  if (!state?.caseId) return;

  if (state.delivered || state.stage === 'speaking') {
    return;
  }

  if (!config.telnyx.redialOnNoAnswer || !telnyxService.isUnansweredHangup(payload)) {
    db.addAuditLog(state.caseId, 'telnyx_call_unanswered', {
      vetPhone: state.vetPhone,
      hangupCause: payload.hangup_cause,
      sipHangupCause: payload.sip_hangup_cause,
    });
    return;
  }

  logger.warn('Telnyx vet call ended without delivery — attempting redial', {
    caseId: state.caseId,
    hangupCause: payload.hangup_cause,
    dialAttempt: state.dialAttempt,
  });

  await escalationService.retryVetCallFromWebhook(state);
}

module.exports = router;

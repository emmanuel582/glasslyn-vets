// ============================================
// Glasslyn Vets — Telnyx Service
// ============================================
// Outbound vet notification calls via Telnyx Call Control.
// Supports dynamic caller ID passthrough (original caller) with landline fallback.

const Telnyx = require('telnyx');
const { config } = require('../config');
const logger = require('../utils/logger');
const { toE164 } = require('../utils/helpers');

let telnyxClient = null;

const VET_NOTIFICATION_STAGE = 'vet_notification';

/**
 * Initialise the Telnyx SDK client.
 */
function initTelnyx() {
  telnyxClient = new Telnyx({
    apiKey: config.telnyx.apiKey,
  });
  logger.info('Telnyx client initialised');
  return telnyxClient;
}

function getTelnyxClient() {
  if (!telnyxClient) {
    throw new Error('Telnyx client not initialised. Call initTelnyx() first.');
  }
  return telnyxClient;
}

function buildVetNotificationMessage(vetName, caseId, clinicName) {
  const resolvedClinicName = clinicName || 'Glasslyn Vets';
  return (
    `Hello ${vetName}, this is an urgent notification from ${resolvedClinicName}. ` +
    `You have a new urgent case that requires your attention. ` +
    `Please check your WhatsApp immediately for the full case details and response options. ` +
    `The case reference is ${caseId}. Thank you.`
  );
}

function encodeClientState(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeClientState(clientState) {
  if (!clientState) return null;
  try {
    return JSON.parse(Buffer.from(clientState, 'base64').toString('utf8'));
  } catch (err) {
    logger.warn('Failed to decode Telnyx client_state', { error: err.message });
    return null;
  }
}

function isVetNotificationState(state) {
  return state && (state.stage === VET_NOTIFICATION_STAGE || state.stage === 'speaking');
}

function isCallerIdRejectedError(err) {
  const message = (err?.message || '').toLowerCase();
  const body = JSON.stringify(err?.raw?.errors || err?.errors || err?.response?.data || '').toLowerCase();
  return (
    message.includes('403') ||
    message.includes('invalid') ||
    message.includes('caller') ||
    body.includes('403') ||
    body.includes('d35') ||
    body.includes('origination')
  );
}

/**
 * Resolve outbound CLI for vet notification calls.
 * @returns {{ fromNumber: string, callerIdSource: string, displayName?: string }}
 */
function resolveOutboundCallerId({ callerPhone, callerName, clinicDid }) {
  const landline = toE164(config.telnyx.fromNumber);
  const mode = config.telnyx.callerIdMode;

  if (mode === 'landline') {
    return { fromNumber: landline, callerIdSource: 'landline' };
  }

  if (mode === 'clinic' && clinicDid) {
    return { fromNumber: toE164(clinicDid), callerIdSource: 'clinic' };
  }

  if (callerPhone && (mode === 'passthrough' || mode === 'auto')) {
    const callerId = toE164(callerPhone);
    return {
      fromNumber: callerId,
      callerIdSource: 'passthrough',
      displayName: callerName || undefined,
    };
  }

  return { fromNumber: landline, callerIdSource: 'landline' };
}

function buildClientState(baseState, fromNumber, callerIdSource, dialAttempt) {
  return encodeClientState({
    ...baseState,
    stage: VET_NOTIFICATION_STAGE,
    fromNumber,
    callerIdSource,
    dialAttempt,
    delivered: false,
  });
}

async function dialVetCall({ vetPhone, fromNumber, displayName, clientState }) {
  const client = getTelnyxClient();
  const toNumber = toE164(vetPhone);

  const dialParams = {
    connection_id: config.telnyx.connectionId,
    from: fromNumber,
    to: toNumber,
    client_state: clientState,
  };

  if (displayName) {
    dialParams.from_display_name = displayName.substring(0, 128);
  }

  if (config.telnyx.amd) {
    dialParams.answering_machine_detection = config.telnyx.amd;
  }

  const response = await client.calls.dial(dialParams);
  const data = response.data || response;

  return {
    call_control_id: data.call_control_id,
    call_session_id: data.call_session_id,
  };
}

/**
 * Make an outbound call to the vet to tell them to check WhatsApp.
 *
 * @param {string} vetPhone
 * @param {string} vetName
 * @param {string} caseId
 * @param {string} clinicName
 * @param {Object} options
 * @param {string} [options.callerPhone] - Original inbound caller for CLI passthrough
 * @param {string} [options.callerName]
 * @param {string} [options.clinicDid]
 * @param {number} [options.dialAttempt]
 */
async function callVetNotification(vetPhone, vetName, caseId, clinicName, options = {}) {
  const {
    callerPhone,
    callerName,
    clinicDid,
    dialAttempt = 1,
  } = options;

  const resolvedClinicName = clinicName || 'Glasslyn Vets';
  const landline = toE164(config.telnyx.fromNumber);
  const primary = resolveOutboundCallerId({ callerPhone, callerName, clinicDid });

  const baseState = {
    vetName,
    vetPhone: toE164(vetPhone),
    caseId,
    clinicName: resolvedClinicName,
    callerPhone: callerPhone ? toE164(callerPhone) : null,
    callerName: callerName || null,
    clinicDid: clinicDid ? toE164(clinicDid) : null,
  };

  logger.info('Making outbound notification call to vet via Telnyx', {
    vetName,
    vetPhone: toE164(vetPhone),
    caseId,
    clinicName: resolvedClinicName,
    fromNumber: primary.fromNumber,
    callerIdSource: primary.callerIdSource,
    dialAttempt,
  });

  try {
    const result = await dialVetCall({
      vetPhone,
      fromNumber: primary.fromNumber,
      displayName: primary.displayName,
      clientState: buildClientState(baseState, primary.fromNumber, primary.callerIdSource, dialAttempt),
    });

    logger.info('Outbound Telnyx call initiated successfully', {
      ...result,
      vetPhone: toE164(vetPhone),
      caseId,
      fromNumber: primary.fromNumber,
      callerIdSource: primary.callerIdSource,
    });

    return result;
  } catch (err) {
    const shouldFallback =
      config.telnyx.callerIdFallback &&
      primary.callerIdSource === 'passthrough' &&
      primary.fromNumber !== landline &&
      isCallerIdRejectedError(err);

    if (shouldFallback) {
      logger.warn('Telnyx rejected passthrough caller ID — retrying with landline fallback', {
        caseId,
        attemptedFrom: primary.fromNumber,
        fallbackFrom: landline,
        error: err.message,
      });

      const result = await dialVetCall({
        vetPhone,
        fromNumber: landline,
        displayName: resolvedClinicName,
        clientState: buildClientState(baseState, landline, 'landline_fallback', dialAttempt),
      });

      logger.info('Outbound Telnyx call initiated with landline fallback', {
        ...result,
        caseId,
        fromNumber: landline,
      });

      return result;
    }

    logger.error('Failed to make outbound Telnyx call to vet', {
      vetPhone: toE164(vetPhone),
      caseId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Redial a vet notification after trunk no-answer / busy (single retry per escalation step).
 */
async function redialVetNotification(state) {
  if (!state?.vetPhone || !state?.caseId) {
    throw new Error('Missing vet call context for redial');
  }

  const nextAttempt = (state.dialAttempt || 1) + 1;
  if (nextAttempt > config.telnyx.dialMaxAttempts) {
    logger.warn('Telnyx vet call redial limit reached', { caseId: state.caseId, dialAttempt: nextAttempt });
    return null;
  }

  return callVetNotification(state.vetPhone, state.vetName, state.caseId, state.clinicName, {
    callerPhone: state.callerPhone,
    callerName: state.callerName,
    clinicDid: state.clinicDid,
    dialAttempt: nextAttempt,
  });
}

async function speakVetNotification(callControlId, state) {
  const client = getTelnyxClient();
  const message = buildVetNotificationMessage(state.vetName, state.caseId, state.clinicName);

  await client.calls.actions.speak(callControlId, {
    payload: message,
    voice: config.telnyx.voice,
    language: config.telnyx.voiceLanguage,
    client_state: encodeClientState({ ...state, stage: 'speaking', delivered: true }),
  });

  logger.info('Telnyx speak command sent for vet notification', {
    callControlId,
    caseId: state.caseId,
  });
}

async function hangupCall(callControlId) {
  const client = getTelnyxClient();
  await client.calls.actions.hangup(callControlId, {});
  logger.info('Telnyx hangup command sent', { callControlId });
}

/**
 * Returns true if hangup cause indicates the vet never meaningfully answered.
 */
function isUnansweredHangup(payload) {
  const cause = `${payload.hangup_cause || ''} ${payload.sip_hangup_cause || ''}`.toLowerCase();
  return (
    cause.includes('no_answer') ||
    cause.includes('no answer') ||
    cause.includes('busy') ||
    cause.includes('unallocated') ||
    cause.includes('rejected') ||
    cause.includes('failed')
  );
}

module.exports = {
  initTelnyx,
  getTelnyxClient,
  callVetNotification,
  redialVetNotification,
  buildVetNotificationMessage,
  encodeClientState,
  decodeClientState,
  isVetNotificationState,
  isUnansweredHangup,
  speakVetNotification,
  hangupCall,
  VET_NOTIFICATION_STAGE,
};

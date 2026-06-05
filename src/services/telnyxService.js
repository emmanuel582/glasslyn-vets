// ============================================
// Glasslyn Vets — Telnyx Service
// ============================================
// Outbound vet notification calls via Telnyx Call Control.

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

/**
 * Get the Telnyx client instance.
 */
function getTelnyxClient() {
  if (!telnyxClient) {
    throw new Error('Telnyx client not initialised. Call initTelnyx() first.');
  }
  return telnyxClient;
}

/**
 * Build the vet notification TTS script (matches Retell outbound agent prompt).
 */
function buildVetNotificationMessage(vetName, caseId, clinicName) {
  const resolvedClinicName = clinicName || 'Glasslyn Vets';
  return (
    `Hello ${vetName}, this is an urgent notification from ${resolvedClinicName}. ` +
    `You have a new urgent case that requires your attention. ` +
    `Please check your WhatsApp immediately for the full case details and response options. ` +
    `The case reference is ${caseId}. Thank you.`
  );
}

/**
 * Encode call context for Telnyx client_state (Base64 JSON).
 */
function encodeClientState(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Decode Telnyx client_state from webhook payload.
 * @returns {Object|null}
 */
function decodeClientState(clientState) {
  if (!clientState) return null;
  try {
    return JSON.parse(Buffer.from(clientState, 'base64').toString('utf8'));
  } catch (err) {
    logger.warn('Failed to decode Telnyx client_state', { error: err.message });
    return null;
  }
}

/**
 * Check whether a webhook event belongs to a vet notification call.
 */
function isVetNotificationState(state) {
  return state && (state.stage === VET_NOTIFICATION_STAGE || state.stage === 'speaking');
}

/**
 * Make an outbound call to the vet to tell them to check WhatsApp.
 *
 * @param {string} vetPhone - Vet phone number
 * @param {string} vetName - Vet name for personalisation
 * @param {string} caseId - Case ID for context
 * @param {string} clinicName - Name of the clinic for the notification script
 * @param {string} _clinicDID - Unused; kept for call-site compatibility
 * @returns {Object} Telnyx dial response data
 */
async function callVetNotification(vetPhone, vetName, caseId, clinicName, _clinicDID) {
  const client = getTelnyxClient();
  const fromNumber = toE164(config.telnyx.fromNumber);
  const toNumber = toE164(vetPhone);
  const resolvedClinicName = clinicName || 'Glasslyn Vets';

  logger.info('Making outbound notification call to vet via Telnyx', {
    vetName,
    vetPhone: toNumber,
    caseId,
    clinicName: resolvedClinicName,
    fromNumber,
  });

  const clientState = encodeClientState({
    stage: VET_NOTIFICATION_STAGE,
    vetName,
    caseId,
    clinicName: resolvedClinicName,
  });

  const dialParams = {
    connection_id: config.telnyx.connectionId,
    from: fromNumber,
    to: toNumber,
    client_state: clientState,
  };

  if (config.telnyx.amd) {
    dialParams.answering_machine_detection = config.telnyx.amd;
  }

  try {
    const response = await client.calls.dial(dialParams);
    const data = response.data || response;

    logger.info('Outbound Telnyx call initiated successfully', {
      callControlId: data.call_control_id,
      callSessionId: data.call_session_id,
      vetPhone: toNumber,
      caseId,
    });

    return {
      call_control_id: data.call_control_id,
      call_session_id: data.call_session_id,
    };
  } catch (err) {
    logger.error('Failed to make outbound Telnyx call to vet', {
      vetPhone: toNumber,
      caseId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Speak the vet notification message on an active call leg.
 */
async function speakVetNotification(callControlId, state) {
  const client = getTelnyxClient();
  const message = buildVetNotificationMessage(state.vetName, state.caseId, state.clinicName);

  await client.calls.actions.speak(callControlId, {
    payload: message,
    voice: 'female',
    language: 'en-GB',
    client_state: encodeClientState({ ...state, stage: 'speaking' }),
  });

  logger.info('Telnyx speak command sent for vet notification', {
    callControlId,
    caseId: state.caseId,
  });
}

/**
 * Hang up an active call leg.
 */
async function hangupCall(callControlId) {
  const client = getTelnyxClient();
  await client.calls.actions.hangup(callControlId, {});
  logger.info('Telnyx hangup command sent', { callControlId });
}

module.exports = {
  initTelnyx,
  getTelnyxClient,
  callVetNotification,
  buildVetNotificationMessage,
  encodeClientState,
  decodeClientState,
  isVetNotificationState,
  speakVetNotification,
  hangupCall,
  VET_NOTIFICATION_STAGE,
};

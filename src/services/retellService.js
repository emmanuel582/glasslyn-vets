// ============================================
// Glasslyn Vets — Retell AI Service
// ============================================
// Wraps the Retell SDK for making outbound calls
// to notify on-call vets.

const Retell = require('retell-sdk');
const { config } = require('../config');
const logger = require('../utils/logger');
const { toE164 } = require('../utils/helpers');

let retellClient = null;

/**
 * Initialise the Retell SDK client.
 */
function initRetell() {
  retellClient = new Retell({
    apiKey: config.retell.apiKey,
  });
  logger.info('Retell AI client initialised');
  return retellClient;
}

/**
 * Get the Retell client instance.
 */
function getRetellClient() {
  if (!retellClient) {
    throw new Error('Retell client not initialised. Call initRetell() first.');
  }
  return retellClient;
}

/**
 * Make an outbound call to the vet to tell them to check WhatsApp.
 * Uses the outbound notification agent configured in Retell.
 *
 * @param {string} vetPhone - Vet phone number
 * @param {string} vetName - Vet name for personalisation
 * @param {string} caseId - Case ID for context
 * @param {string} clinicName - Name of the clinic for the notification script
 * @param {string} clinicDID - Optional. If provided, used as fromNumber for caller ID
 * @returns {Object} The call response from Retell
 */
async function callVetNotification(vetPhone, vetName, caseId, clinicName, clinicDID) {
  const client = getRetellClient();
  
  // Use clinic's DID if multiple numbers imported, otherwise fallback to default
  const fromNumberConfig = clinicDID || config.retell.fromNumber;
  const fromNumber = toE164(fromNumberConfig);
  
  const toNumber = toE164(vetPhone);
  const resolvedClinicName = clinicName || 'Glasslyn Vets';

  logger.info(`Making outbound notification call to vet`, {
    vetName,
    vetPhone: toNumber,
    caseId,
    clinicName: resolvedClinicName,
    fromNumber
  });

  try {
    const callResponse = await client.call.createPhoneCall({
      from_number: fromNumber,
      to_number: toNumber,
      override_agent_id: config.retell.outboundAgentId,
      retell_llm_dynamic_variables: {
        vet_name: vetName,
        case_id: caseId,
        clinic_name: resolvedClinicName,
      },
    });

    logger.info(`Outbound call initiated successfully`, {
      callId: callResponse.call_id,
      vetPhone: toNumber,
      caseId,
    });

    return callResponse;
  } catch (err) {
    logger.error(`Failed to make outbound call to vet`, {
      vetPhone: toNumber,
      caseId,
      error: err.message,
    });
    throw err;
  }
}

module.exports = {
  initRetell,
  getRetellClient,
  callVetNotification,
};

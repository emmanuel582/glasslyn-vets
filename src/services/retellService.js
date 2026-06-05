// ============================================
// Glasslyn Vets — Retell AI Service
// ============================================
// Wraps the Retell SDK for inbound call handling.

const Retell = require('retell-sdk');
const { config } = require('../config');
const logger = require('../utils/logger');

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

module.exports = {
  initRetell,
  getRetellClient,
};

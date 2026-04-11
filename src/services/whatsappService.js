// ============================================
// Glasslyn Vets — WhatsApp Service (WPP Connect)
// ============================================
// Manages the WPP Connect client and provides
// methods for sending WhatsApp messages.

const wppconnect = require('@wppconnect-team/wppconnect');
const logger = require('../utils/logger');
const { config } = require('../config');
const { toWhatsAppId } = require('../utils/helpers');

let wppClient = null;
let isReady = false;

/**
 * Initialise WPP Connect client.
 * Generates a QR code in the terminal for first-time auth.
 * Returns a Promise that resolves when the client is ready.
 */
async function initWhatsApp() {
  return new Promise((resolve, reject) => {
    logger.info('Initialising WPP Connect...');

    wppconnect
      .create({
        session: config.whatsapp.sessionName,
        autoClose: 0, // Never auto-close (0 = disabled)
        headless: true,
        useChrome: true, // Use system Google Chrome installation
        logQR: true, // Print QR code in terminal
        updatesLog: false,
        catchQR: (base64Qr, asciiQR) => {
          // QR code is printed in the terminal by logQR
          logger.info('╔════════════════════════════════════════╗');
          logger.info('║  SCAN THIS QR CODE WITH WHATSAPP       ║');
          logger.info('║  Open WhatsApp > Linked Devices > Link ║');
          logger.info('╚════════════════════════════════════════╝');
          console.log(asciiQR); // Print ASCII QR to console
        },
        statusFind: (statusSession, session) => {
          logger.info(`WPP Connect status: ${statusSession}`, { session });
        },
      })
      .then((client) => {
        wppClient = client;
        isReady = true;
        logger.info('WPP Connect client is READY');

        // Handle disconnection
        client.onStateChange((state) => {
          logger.info(`WhatsApp state changed: ${state}`);
          if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
            logger.warn('WhatsApp session conflict detected. Restarting...');
            client.useHere();
          }
          if (state === 'UNPAIRED') {
            isReady = false;
            logger.error('WhatsApp session unpaired. QR code scan required.');
          }
        });

        resolve(client);
      })
      .catch((err) => {
        logger.error('Failed to initialise WPP Connect', { error: err.message });
        reject(err);
      });
  });
}

/**
 * Get the WPP Connect client instance.
 */
function getClient() {
  return wppClient;
}

/**
 * Check if WhatsApp is connected and ready.
 */
function isWhatsAppReady() {
  return isReady && wppClient !== null;
}

/**
 * Send a text message via WhatsApp.
 * @param {string} phone - Phone number (digits only, e.g. "353871234567")
 * @param {string} message - Message text
 */
async function sendMessage(phone, message) {
  if (!isWhatsAppReady()) {
    logger.error('WhatsApp is not ready. Cannot send message.', { phone });
    throw new Error('WhatsApp is not connected. Please scan the QR code.');
  }

  const chatId = toWhatsAppId(phone);
  logger.info(`Sending WhatsApp message to ${chatId}`);

  try {
    const result = await wppClient.sendText(chatId, message);
    logger.info(`WhatsApp message sent successfully`, { to: chatId, messageId: result.id });
    return result;
  } catch (err) {
    logger.error(`Failed to send WhatsApp message`, { to: chatId, error: err.message });
    throw err;
  }
}

/**
 * Send urgent case details to the on-call vet.
 * Includes formatted case info and response options.
 */
async function sendCaseToVet(vetPhone, caseData) {
  const clinicName = config.clinic.name;

  const message =
    `🚨 *URGENT VET CASE — ${clinicName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 *Case ID:* ${caseData.id}\n` +
    `👤 *Caller:* ${caseData.caller_name || 'Unknown'}\n` +
    `📞 *Phone:* ${caseData.caller_phone}\n` +
    `📍 *Eircode:* ${caseData.eircode || 'Not provided'}\n\n` +
    `🐾 *Issue:*\n${caseData.issue_description || 'No description provided'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏰ *Please respond within 15 minutes*\n\n` +
    `Reply with a number:\n` +
    `*1* → ✅ Accept (arrive within 1 hour)\n` +
    `*2* → ✅ Accept (arrive in over 1 hour)\n` +
    `*3* → ❌ Reject\n\n` +
    `_If no response, the case will be escalated to the backup vet._`;

  return await sendMessage(vetPhone, message);
}

/**
 * Notify the caller that a vet has accepted and is on the way.
 */
async function notifyCallerAccepted(callerPhone, caseData, eta) {
  const clinicName = config.clinic.name;
  const clinicPhone = config.clinic.phone;

  const etaText = eta === 'within_1_hour'
    ? 'within 1 hour'
    : 'in over 1 hour (we will keep you updated)';

  const message =
    `✅ *${clinicName} — Vet Update*\n\n` +
    `Hi ${caseData.caller_name || 'there'},\n\n` +
    `A vet has accepted your case and is on the way.\n\n` +
    `📋 *Case ID:* ${caseData.id}\n` +
    `📍 *Estimated arrival:* ${etaText}\n\n` +
    `If you need to reach us, please call ${clinicPhone || 'the clinic'}.\n\n` +
    `— ${clinicName}`;

  return await sendMessage(callerPhone, message);
}

/**
 * Notify the caller that their non-urgent case has been logged.
 */
async function notifyCallerLogged(callerPhone, caseData) {
  const clinicName = config.clinic.name;
  const clinicPhone = config.clinic.phone;

  const message =
    `📝 *${clinicName} — Case Logged*\n\n` +
    `Hi ${caseData.caller_name || 'there'},\n\n` +
    `Thank you for calling. Your case has been logged and the clinic ` +
    `will follow up with you when they reopen.\n\n` +
    `📋 *Case ID:* ${caseData.id}\n\n` +
    `If your pet's condition worsens, please call us back immediately.\n\n` +
    `— ${clinicName}`;

  return await sendMessage(callerPhone, message);
}

/**
 * Notify the vet that the case has been escalated to the backup.
 */
async function notifyVetEscalated(vetPhone, caseId) {
  const message =
    `ℹ️ Case ${caseId} has been escalated to the backup vet due to no response or rejection.\n` +
    `No further action required from you.`;

  return await sendMessage(vetPhone, message);
}

/**
 * Register a message handler for incoming WhatsApp messages.
 * @param {Function} handler - Callback receiving (message) objects
 */
function onMessage(handler) {
  if (!wppClient) {
    logger.error('Cannot register onMessage handler — WPP client not initialised');
    return;
  }

  wppClient.onMessage((message) => {
    // Only process individual (non-group) messages
    if (!message.isGroupMsg) {
      handler(message);
    }
  });

  logger.info('WhatsApp onMessage handler registered');
}

module.exports = {
  initWhatsApp,
  getClient,
  isWhatsAppReady,
  sendMessage,
  sendCaseToVet,
  notifyCallerAccepted,
  notifyCallerLogged,
  notifyVetEscalated,
  onMessage,
};

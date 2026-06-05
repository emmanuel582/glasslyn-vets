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

const WHATSAPP_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-features=MemorySaverMode',
  '--memory-pressure-off',
];

const SEND_MAX_RETRIES = 3;
const SEND_RETRY_DELAY_MS = 2000;
const CONNECTED_WAIT_TIMEOUT_MS = 30000;
const CONNECTED_POLL_INTERVAL_MS = 500;

function isDetachedFrameError(err) {
  const message = err?.message || '';
  return message.includes('detached Frame') || message.includes('detached frame');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until WPPConnect reports CONNECTED (or timeout).
 * Avoids sending while WhatsApp Web iframes are still loading.
 */
async function waitForConnected(client) {
  const deadline = Date.now() + CONNECTED_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const state = await client.getConnectionState();
      if (state === 'CONNECTED') {
        return;
      }
      logger.info(`WhatsApp waiting for CONNECTED (current: ${state})`);
    } catch (err) {
      logger.warn('WhatsApp connection state check failed', { error: err.message });
    }
    await delay(CONNECTED_POLL_INTERVAL_MS);
  }

  logger.warn(`WhatsApp did not reach CONNECTED within ${CONNECTED_WAIT_TIMEOUT_MS / 1000}s — proceeding anyway`);
}

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
        browserArgs: WHATSAPP_BROWSER_ARGS,
        logQR: true, // Print QR code in terminal
        updatesLog: false,
        catchQR: (base64Qr, asciiQR) => {
          logger.info('╔════════════════════════════════════════╗');
          logger.info('║  SCAN THIS QR CODE WITH WHATSAPP       ║');
          logger.info('║  Open WhatsApp > Linked Devices > Link ║');
          logger.info('╚════════════════════════════════════════╝');
          console.log(asciiQR);
        },
        statusFind: (statusSession, session) => {
          logger.info(`WPP Connect status: ${statusSession}`, { session });
        },
      })
      .then(async (client) => {
        wppClient = client;

        client.onStateChange((state) => {
          logger.info(`WhatsApp state changed: ${state}`);
          if (state === 'CONNECTED') {
            isReady = true;
          }
          if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
            isReady = false;
            logger.warn('WhatsApp session conflict detected. Restarting...');
            client.useHere();
          }
          if (state === 'UNPAIRED') {
            isReady = false;
            logger.error('WhatsApp session unpaired. QR code scan required.');
          }
        });

        await waitForConnected(client);
        isReady = true;
        logger.info('WPP Connect client is READY');

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
 * Send a text message via WhatsApp (single attempt).
 */
async function sendMessageOnce(phone, message) {
  if (!isWhatsAppReady()) {
    throw new Error('WhatsApp is not connected. Please scan the QR code.');
  }

  const chatId = toWhatsAppId(phone);
  const result = await wppClient.sendText(chatId, message);
  logger.info('WhatsApp message sent successfully', { to: chatId, messageId: result.id });
  return result;
}

/**
 * Send a text message via WhatsApp with retry on transient Puppeteer frame errors.
 * @param {string} phone - Phone number (digits only, e.g. "353871234567")
 * @param {string} message - Message text
 */
async function sendMessage(phone, message) {
  const chatId = toWhatsAppId(phone);
  logger.info(`Sending WhatsApp message to ${chatId}`);

  let lastError;

  for (let attempt = 1; attempt <= SEND_MAX_RETRIES; attempt++) {
    try {
      return await sendMessageOnce(phone, message);
    } catch (err) {
      lastError = err;
      logger.error('Failed to send WhatsApp message', {
        to: chatId,
        attempt,
        error: err.message,
      });

      if (isDetachedFrameError(err) && attempt < SEND_MAX_RETRIES) {
        logger.warn(`WhatsApp detached frame — retrying (${attempt}/${SEND_MAX_RETRIES})`);
        await delay(SEND_RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  if (isDetachedFrameError(lastError)) {
    logger.error('WhatsApp detached frame persisted after retries. Restarting process for PM2 recovery.');
    setTimeout(() => process.exit(1), 1000);
  }

  throw lastError;
}

/**
 * Send urgent case details to the on-call vet.
 * Includes formatted case info and response options.
 */
async function sendCaseToVet(vetPhone, caseData, clinicNameParam) {
  const clinicName = clinicNameParam || 'Glasslyn Vets';

  const callerContactPhone = caseData.caller_whatsapp || caseData.caller_phone;

  const message =
    `🚨 *URGENT VET CASE — ${clinicName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 *Case ID:* ${caseData.id}\n` +
    `👤 *Caller:* ${caseData.caller_name || 'Unknown'}\n` +
    `📞 *Phone:* ${callerContactPhone}\n` +
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
async function notifyCallerAccepted(callerPhone, caseData, eta, clinicNameParam) {
  const clinicName = clinicNameParam || 'Glasslyn Vets';

  const etaText = eta === 'within_1_hour'
    ? 'within 1 hour'
    : 'in over 1 hour (we will keep you updated)';

  const message =
    `✅ *${clinicName} — Vet Update*\n\n` +
    `Hi ${caseData.caller_name || 'there'},\n\n` +
    `A vet has accepted your case and is on the way.\n\n` +
    `📋 *Case ID:* ${caseData.id}\n` +
    `📍 *Estimated arrival:* ${etaText}\n\n` +
    `— ${clinicName}`;

  return await sendMessage(callerPhone, message);
}

/**
 * Notify the caller that their non-urgent case has been logged.
 */
async function notifyCallerLogged(callerPhone, caseData, clinicNameParam) {
  const clinicName = clinicNameParam || 'Glasslyn Vets';

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

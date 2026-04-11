// ============================================
// Glasslyn Vets — WhatsApp Webhook Handler
// ============================================
// Processes incoming WhatsApp messages from vets
// responding to escalation notifications.

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const escalationService = require('../services/escalationService');
const { normalisePhone } = require('../utils/helpers');

/**
 * POST /whatsapp/webhook
 * Receives incoming WhatsApp messages forwarded by
 * the WPP Connect onMessage handler in index.js.
 *
 * This endpoint is called internally by our app
 * (not directly by WPP Connect — we wire it up in index.js).
 */
router.post('/', async (req, res) => {
  try {
    const { from, body: messageBody, senderName } = req.body;

    if (!from || !messageBody) {
      return res.status(400).json({ error: 'Missing required fields: from, body' });
    }

    // Clean the phone number (remove @c.us suffix if present)
    const phone = normalisePhone(from.replace('@c.us', ''));
    const message = messageBody.trim();

    logger.info(`WhatsApp message received`, {
      from: phone,
      senderName,
      message: message.substring(0, 50),
    });

    // Check if this is a vet response (1, 2, or 3)
    if (['1', '2', '3'].includes(message)) {
      const result = await escalationService.handleVetResponse(phone, message);

      if (result) {
        logger.info(`Vet response processed`, { result });
        return res.status(200).json({ status: 'processed', result });
      } else {
        return res.status(200).json({ status: 'no_active_case' });
      }
    }

    // Not a valid response number — might be a general message
    logger.info(`Non-response WhatsApp message from ${phone}: "${message.substring(0, 100)}"`);
    return res.status(200).json({ status: 'ignored', reason: 'Not a valid response' });
  } catch (err) {
    logger.error('Error processing WhatsApp webhook', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

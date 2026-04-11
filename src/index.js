// ============================================
// Glasslyn Vets — AI Voice Receptionist
// ============================================
// Main entry point. Starts Express server,
// initialises database, Retell AI, and WPP Connect.

const express = require('express');
const path = require('path');
const { config, validateConfig } = require('./config');
const logger = require('./utils/logger');
const { initDatabase, closeDatabase } = require('./database');
const { initRetell } = require('./services/retellService');
const whatsappService = require('./services/whatsappService');
const { normalisePhone } = require('./utils/helpers');

// Import routes
const retellWebhookRouter = require('./routes/retellWebhook');
const retellFunctionsRouter = require('./routes/retellFunctions');
const whatsappWebhookRouter = require('./routes/whatsappWebhook');
const apiRouter = require('./routes/api');

// ─── Validate Config ──────────────────────────────────
validateConfig();

// ─── Express App ──────────────────────────────────────
const app = express();

// Parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req, res, next) => {
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      contentType: req.headers['content-type'],
    });
  }
  next();
});

// ─── Routes ───────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Glasslyn Vets AI Receptionist',
    whatsapp: whatsappService.isWhatsAppReady() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Retell AI webhooks (call events)
app.use('/retell/webhook', retellWebhookRouter);

// Retell AI custom functions (called during live calls)
app.use('/retell/functions', retellFunctionsRouter);

// WhatsApp incoming message webhook (internal)
app.use('/whatsapp/webhook', whatsappWebhookRouter);

// Frontend API Data
app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup ──────────────────────────────────────────

async function startServer() {
  logger.info('╔════════════════════════════════════════════╗');
  logger.info('║   Glasslyn Vets — AI Voice Receptionist    ║');
  logger.info('╚════════════════════════════════════════════╝');

  // Step 1: Initialise database
  logger.info('Step 1/3: Initialising database...');
  initDatabase();

  // Step 2: Initialise Retell AI client
  logger.info('Step 2/3: Initialising Retell AI...');
  initRetell();

  // Step 3: Start Express server first (so health check works)
  const server = app.listen(config.server.port, () => {
    logger.info(`Server running on port ${config.server.port}`);
    logger.info(`Health check: http://localhost:${config.server.port}/health`);
    logger.info(`Retell webhook URL: ${config.server.baseUrl}/retell/webhook`);
    logger.info(`Retell functions URL: ${config.server.baseUrl}/retell/functions`);
  });

  // Step 4: Initialise WPP Connect (WhatsApp)
  logger.info('Step 3/3: Initialising WhatsApp (WPP Connect)...');
  logger.info('If this is the first time, a QR code will appear below.');
  logger.info('Scan it with WhatsApp to link this device.');

  try {
    await whatsappService.initWhatsApp();

    // Register incoming message handler
    whatsappService.onMessage(async (message) => {
      try {
        const from = message.from || '';
        const body = message.body || '';
        const senderName = message.sender?.pushname || message.sender?.name || 'Unknown';

        // Process via the WhatsApp webhook handler (internal HTTP call)
        // This keeps the logic in the route handler for consistency
        const phone = normalisePhone(from.replace('@c.us', ''));

        logger.info(`Incoming WhatsApp message`, {
          from: phone,
          senderName,
          body: body.substring(0, 50),
        });

        // Check if this is a valid vet response
        const trimmedBody = body.trim();
        if (['1', '2', '3'].includes(trimmedBody)) {
          const escalationService = require('./services/escalationService');
          const result = await escalationService.handleVetResponse(phone, trimmedBody);
          if (result) {
            logger.info(`Vet response processed via onMessage`, { result });
          }
        }
      } catch (err) {
        logger.error('Error processing incoming WhatsApp message', {
          error: err.message,
          stack: err.stack,
        });
      }
    });

    logger.info('');
    logger.info('✅ All systems initialised successfully!');
    logger.info('');
    logger.info('════════════════════════════════════════════');
    logger.info(' ENDPOINTS:');
    logger.info(`  Health:     GET  ${config.server.baseUrl}/health`);
    logger.info(`  Webhook:    POST ${config.server.baseUrl}/retell/webhook`);
    logger.info(`  Functions:  POST ${config.server.baseUrl}/retell/functions`);
    logger.info('════════════════════════════════════════════');
    logger.info('');
    logger.info('Configure these URLs in your Retell dashboard:');
    logger.info(`  Agent Webhook URL:  ${config.server.baseUrl}/retell/webhook`);
    logger.info(`  Custom Function URLs — set each function endpoint to:`);
    logger.info(`    ${config.server.baseUrl}/retell/functions`);
    logger.info('');
  } catch (err) {
    logger.error('WhatsApp initialisation failed', { error: err.message });
    logger.warn('Server is running but WhatsApp is NOT connected.');
    logger.warn('You can still receive calls — WhatsApp features will be unavailable.');
  }

  // ─── Graceful Shutdown ────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    server.close(() => {
      logger.info('Express server closed');
    });

    closeDatabase();

    const wppClient = whatsappService.getClient();
    if (wppClient) {
      try {
        await wppClient.close();
        logger.info('WPP Connect client closed');
      } catch (err) {
        logger.error('Error closing WPP Connect', { error: err.message });
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run
startServer().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});

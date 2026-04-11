// ============================================
// Glasslyn Vets — Configuration Loader
// ============================================
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  // --- Retell AI ---
  retell: {
    apiKey: process.env.RETELL_API_KEY || '',
    agentId: process.env.RETELL_AGENT_ID || '',
    outboundAgentId: process.env.RETELL_OUTBOUND_AGENT_ID || '',
    fromNumber: process.env.RETELL_FROM_NUMBER || '',
    webhookSecret: process.env.RETELL_WEBHOOK_SECRET || '',
  },

  // --- WPP Connect (WhatsApp) ---
  whatsapp: {
    sessionName: process.env.WPP_SESSION_NAME || 'glasslyn-vets',
  },

  // --- On-Call Vets ---
  vets: [
    {
      name: process.env.VET_1_NAME || "Dr. O'Connor",
      phone: process.env.VET_1_PHONE || '',
    },
    {
      name: process.env.VET_2_NAME || 'Dr. Murphy',
      phone: process.env.VET_2_PHONE || '',
    },
    {
      name: process.env.VET_3_NAME || 'Dr. Kelly',
      phone: process.env.VET_3_PHONE || '',
    },
    {
      name: process.env.VET_4_NAME || 'Dr. Byrne',
      phone: process.env.VET_4_PHONE || '',
    }
  ],

  // --- Server ---
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },

  // --- Clinic ---
  clinic: {
    name: process.env.CLINIC_NAME || 'Glasslyn Vets',
    phone: process.env.CLINIC_PHONE || '',
  },

  // --- Escalation ---
  escalation: {
    timeoutMinutes: parseInt(process.env.ESCALATION_TIMEOUT_MINUTES, 10) || 15,
  },
};

// Validate critical config on startup
function validateConfig() {
  const missing = [];

  if (!config.retell.apiKey) missing.push('RETELL_API_KEY');
  if (!config.retell.agentId) missing.push('RETELL_AGENT_ID');
  if (!config.retell.outboundAgentId) missing.push('RETELL_OUTBOUND_AGENT_ID');
  if (!config.retell.fromNumber) missing.push('RETELL_FROM_NUMBER');
  if (!config.vets[0].phone) missing.push('VET_1_PHONE');
  if (!config.vets[1].phone) missing.push('VET_2_PHONE');
  if (!config.vets[2].phone) missing.push('VET_3_PHONE');
  if (!config.vets[3].phone) missing.push('VET_4_PHONE');
  if (!config.server.baseUrl || config.server.baseUrl === 'http://localhost:3000') {
    console.warn('[CONFIG] WARNING: BASE_URL is set to localhost. Retell webhooks will not work without a public URL (use ngrok for dev).');
  }

  if (missing.length > 0) {
    console.error(`[CONFIG] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('[CONFIG] Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };

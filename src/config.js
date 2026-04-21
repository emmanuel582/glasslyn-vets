// ============================================
// Glasslyn Vets — Configuration Loader
// ============================================
// Multi-Clinic Edition — parses clinic locations
// and vet seed data from environment variables.
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

  // --- Clinic Locations ---
  // Parsed from CLINIC_1_*, CLINIC_2_*, CLINIC_3_*, CLINIC_4_*
  clinics: [],

  // --- Vet seed data ---
  // Parsed from VET_1_* through VET_8_*
  // Only used for initial database seeding.
  vetSeeds: [],

  // --- Server ---
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },

  // --- Escalation ---
  escalation: {
    timeoutMinutes: parseInt(process.env.ESCALATION_TIMEOUT_MINUTES, 10) || 15,
  },
};

// ─── Parse Clinics from ENV ───────────────────────────
for (let i = 1; i <= 4; i++) {
  const name = process.env[`CLINIC_${i}_NAME`];
  const did = process.env[`CLINIC_${i}_DID`];
  if (name && did) {
    config.clinics.push({ id: i, name, did });
  }
}

// ─── Parse Vet Seeds from ENV ─────────────────────────
for (let i = 1; i <= 8; i++) {
  const name = process.env[`VET_${i}_NAME`];
  const phone = process.env[`VET_${i}_PHONE`];
  const clinicNum = parseInt(process.env[`VET_${i}_CLINIC`], 10) || 1;
  if (name && phone) {
    config.vetSeeds.push({ name, phone, clinicNumber: clinicNum });
  }
}

// Validate critical config on startup
function validateConfig() {
  const missing = [];

  if (!config.retell.apiKey) missing.push('RETELL_API_KEY');
  if (!config.retell.agentId) missing.push('RETELL_AGENT_ID');
  if (!config.retell.outboundAgentId) missing.push('RETELL_OUTBOUND_AGENT_ID');
  if (!config.retell.fromNumber) missing.push('RETELL_FROM_NUMBER');

  if (config.clinics.length === 0) {
    console.warn('[CONFIG] WARNING: No clinics configured. At least CLINIC_1_NAME and CLINIC_1_DID are required.');
  }

  if (config.server.baseUrl === 'http://localhost:3000') {
    console.warn('[CONFIG] WARNING: BASE_URL is set to localhost. Retell webhooks will not work without a public URL (use ngrok for dev).');
  }

  if (missing.length > 0) {
    console.error(`[CONFIG] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('[CONFIG] Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };

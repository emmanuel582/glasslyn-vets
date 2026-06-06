#!/usr/bin/env node
/**
 * Telnyx outbound vet notification test script.
 *
 * Usage:
 *   node scripts/test-telnyx-outbound.js                    # config + CLI preview (dry run)
 *   node scripts/test-telnyx-outbound.js --dial             # live call using default numbers
 *   node scripts/test-telnyx-outbound.js --dial +353VET +353CALLER
 *   node scripts/test-telnyx-outbound.js --landline --dial # force landline CLI only
 */

require('dotenv').config();

function parseArgs(argv) {
  const args = {
    dryRun: true,
    landlineOnly: false,
    vetPhone: process.env.VET_1_PHONE || '+353838333501',
    callerPhone: '+353871234567',
    vetPhoneSet: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dial') args.dryRun = false;
    else if (arg === '--landline') args.landlineOnly = true;
    else if (arg.startsWith('+') || /^\d{10,}$/.test(arg)) {
      if (!args.vetPhoneSet) {
        args.vetPhone = arg;
        args.vetPhoneSet = true;
      } else {
        args.callerPhone = arg;
      }
    }
  }

  return args;
}

const args = parseArgs(process.argv);
if (args.landlineOnly) {
  process.env.TELNYX_CALLER_ID_MODE = 'landline';
}

const { config } = require('../src/config');
const { initTelnyx, callVetNotification, resolveOutboundCallerId } = require('../src/services/telnyxService');

function printHeader(title) {
  console.log('');
  console.log('='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function validateTelnyxConfig() {
  const missing = [];
  if (!config.telnyx.apiKey) missing.push('TELNYX_API_KEY');
  if (!config.telnyx.connectionId) missing.push('TELNYX_CONNECTION_ID');
  if (!config.telnyx.fromNumber) missing.push('TELNYX_FROM_NUMBER');
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}

function printConfigSummary() {
  printHeader('Telnyx configuration');
  console.log(`Connection ID:     ${config.telnyx.connectionId}`);
  console.log(`Fallback landline: ${config.telnyx.fromNumber}`);
  console.log(`Caller ID mode:    ${config.telnyx.callerIdMode}`);
  console.log(`CLI fallback:      ${config.telnyx.callerIdFallback}`);
  console.log(`TTS voice:         ${config.telnyx.voice}`);
  console.log(`Webhook URL:       ${config.server.baseUrl}/telnyx/webhook`);
  console.log(`Redial on no-ans:  ${config.telnyx.redialOnNoAnswer}`);
}

function printCallerIdPreview(vetPhone, callerPhone) {
  printHeader('Caller ID preview');

  const clinicDid = config.retell.fromNumber || config.clinics[0]?.did;
  const preview = resolveOutboundCallerId({
    callerPhone: args.landlineOnly ? null : callerPhone,
    callerName: 'Test Caller',
    clinicDid,
  });

  console.log(`Vet phone (to):       ${vetPhone}`);
  console.log(`Simulated caller:     ${callerPhone}`);
  console.log(`Primary from (CLI):   ${preview.fromNumber}`);
  console.log(`Caller ID source:     ${preview.callerIdSource}`);
  if (preview.displayName) console.log(`Display name:         ${preview.displayName}`);
  console.log('');
  console.log('If passthrough is rejected by Telnyx, the app retries with:');
  console.log(`  ${config.telnyx.fromNumber} (landline fallback)`);
}

async function runLiveDial(vetPhone, callerPhone) {
  printHeader('Live Telnyx dial test');

  console.log('NOTE: npm start must be running so Telnyx can reach your webhook.');
  console.log(`      Webhook: ${config.server.baseUrl}/telnyx/webhook`);
  console.log('');

  initTelnyx();

  const options = args.landlineOnly
    ? {}
    : {
        callerPhone,
        callerName: 'Test Caller',
        clinicDid: config.retell.fromNumber,
      };

  const started = Date.now();
  const result = await callVetNotification(
    vetPhone,
    'Test Vet',
    `TEST-${Date.now()}`,
    'Glasslyn Vets Test',
    options
  );

  console.log('Call initiated successfully.');
  console.log(`  call_control_id:  ${result.call_control_id}`);
  console.log(`  call_session_id:  ${result.call_session_id}`);
  console.log(`  elapsed:          ${Date.now() - started}ms`);
  console.log('');
  console.log('Answer the vet phone and check:');
  console.log('  1. Caller ID shows caller mobile OR landline fallback');
  console.log('  2. NaturalHD TTS plays the WhatsApp notification message');
  console.log('');
  console.log('Watch server logs for: Telnyx webhook: call.answered / call.speak.ended');
}

async function main() {
  try {
    validateTelnyxConfig();
    printConfigSummary();
    printCallerIdPreview(args.vetPhone, args.callerPhone);

    if (args.dryRun) {
      printHeader('Dry run complete — no call placed');
      console.log('To place a real test call:');
      console.log('  node scripts/test-telnyx-outbound.js --dial');
      console.log('  node scripts/test-telnyx-outbound.js --dial +353VETPHONE +353CALLERPHONE');
      console.log('  node scripts/test-telnyx-outbound.js --landline --dial');
      return;
    }

    await runLiveDial(args.vetPhone, args.callerPhone);
    printHeader('Live dial test PASSED (API accepted the call)');
  } catch (err) {
    console.error('');
    console.error('TEST FAILED:', err.message);
    if (err.raw?.errors) {
      console.error('Telnyx errors:', JSON.stringify(err.raw.errors, null, 2));
    } else if (err.response?.data) {
      console.error('Telnyx API:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();

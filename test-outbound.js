require('dotenv').config();
const { initTelnyx, callVetNotification } = require('./src/services/telnyxService');
const { config } = require('./src/config');

const DEFAULT_TEST_NUMBER = '+2348123328628';

async function testOutbound() {
  const targetNumber = process.argv[2] || DEFAULT_TEST_NUMBER;

  try {
    initTelnyx();

    console.log(`Starting test outbound Telnyx call to: ${targetNumber}`);
    console.log(`From number: ${config.telnyx.fromNumber}`);
    console.log('');
    console.log('IMPORTANT: The server must be running and reachable at BASE_URL');
    console.log(`so Telnyx can deliver webhooks to: ${config.server.baseUrl}/telnyx/webhook`);
    console.log('Start the server in another terminal: npm start');
    console.log('');

    const result = await callVetNotification(
      targetNumber,
      'Test Doctor',
      'test-case-1234',
      'Glasslyn Vets Test Clinic'
    );

    console.log('Outbound call initiated successfully!');
    console.log('Result:', result);
    console.log('');
    console.log('When the call is answered, you should hear the urgent WhatsApp-check notification.');
  } catch (err) {
    console.error('Outbound call failed:', err.message);
    if (err.response?.data) {
      console.error('Telnyx API error:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

testOutbound();

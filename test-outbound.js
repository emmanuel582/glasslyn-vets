require('dotenv').config();
const { initRetell, callVetNotification } = require('./src/services/retellService');
const logger = require('./src/utils/logger');

async function testOutbound() {
  const targetNumber = process.argv[2];
  
  if (!targetNumber) {
    console.error('Usage: node test-outbound.js <phone-number>');
    process.exit(1);
  }

  try {
    initRetell();
    
    console.log(`Starting test outbound call to: ${targetNumber}`);
    
    // Simulate an escalation call
    // (vetPhone, vetName, caseId, clinicName, clinicDID)
    const fromNumber = process.argv[3] || null;
    const result = await callVetNotification(
      targetNumber, 
      'Test Doctor', 
      'test-case-1234', 
      'Glasslyn Vets Test Clinic', 
      fromNumber
    );
    
    console.log('Outbound call successful! Result:', result);
  } catch (err) {
    console.error('Outbound call failed:', err);
  }
}

testOutbound();

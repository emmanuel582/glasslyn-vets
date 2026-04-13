const { validateConfig } = require('./src/config');
const { initRetell, callVetNotification } = require('./src/services/retellService');

// Validate environment variables using the app's standard configuration loader
validateConfig();

async function testCall() {
  try {
    // Initialise Retell client using app config
    initRetell();
    
    const testNumber = '+2348123328628';
    
    console.log(`Setting up outbound test call to ${testNumber} ...`);
    
    // callVetNotification(vetPhone, vetName, caseId)
    const response = await callVetNotification(testNumber, 'Test Vet (Manual Script)', 'TEST-CASE-001');
    
    console.log("Call successfully initiated!");
    console.log("Call ID:", response.call_id);
    console.log("Call details:", JSON.stringify(response, null, 2));
    
  } catch (error) {
    console.error("\nFailed to make the test call.");
    console.error(error);
  }
}

testCall();

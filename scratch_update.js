const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, 'data', 'clinic.db');

try {
  const db = new Database(dbPath);
  
  // Update Clinic 2 payload exact format E.164
  db.prepare('UPDATE clinics SET did = ? WHERE id = ?').run('+353212296063', 2);
  
  // Update Clinic 3 payload exact format E.164
  db.prepare('UPDATE clinics SET did = ? WHERE id = ?').run('+353212296062', 3);
  
  console.log('Database updated: Corrected leading zeros in Irish phone numbers.');
  db.close();
} catch (e) {
  console.error('Error updating DB:', e);
}

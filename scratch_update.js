const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, 'data', 'clinic.db');

try {
  const db = new Database(dbPath);
  
  // Update Clinic 2
  db.prepare('UPDATE clinics SET did = ? WHERE id = ?').run('+3530212296063', 2);
  
  // Update Clinic 3 
  db.prepare('UPDATE clinics SET did = ? WHERE id = ?').run('+3530212296062', 3);
  
  // Update Clinic 4
  db.prepare('UPDATE clinics SET did = ? WHERE id = ?').run('+3532955925', 4);
  
  console.log('Database updated with new phone numbers.');
  db.close();
} catch (e) {
  console.error('Error updating DB:', e);
}

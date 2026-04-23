const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, 'data', 'clinic.db');

try {
  const db = new Database(dbPath);

  console.log("Loading default Clinics into the database...");
  
  // Prepare insert
  const insertClinic = db.prepare(`
    INSERT OR REPLACE INTO clinics (id, name, did) 
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertClinic.run(1, 'Glasslyn Vets Bandon', '+3532955835');
    insertClinic.run(2, 'Muskery Vets', '+353212296063');
    insertClinic.run(3, 'Carbery Vets', '+353212296062');
    insertClinic.run(4, 'Glasslyn Vets Kinsale', '+3532955930');
    
    // Auto-migrate stranded older vets to Clinic 1 (Glasslyn Vets Bandon)
    const info = db.prepare(`UPDATE vets SET clinic_id = 1 WHERE clinic_id IS NULL`).run();
    if (info.changes > 0) {
      console.log(`Auto-migrated ${info.changes} unassigned legacy Vets directly to Glasslyn Vets Bandon (Clinic 1).`);
    }
  });

  tx();

  console.log("Database successfully loaded with the 4 Clinics!");
  db.close();
} catch (e) {
  console.error("Failed to load database:", e);
}

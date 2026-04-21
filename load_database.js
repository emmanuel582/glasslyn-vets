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
    insertClinic.run(1, 'Glasslyn Main', '+353000000000'); // Fallback number for Main if none provided
    insertClinic.run(2, 'Glasslyn Southside', '+353212296063');
    insertClinic.run(3, 'Glasslyn Northside', '+353212296062');
    insertClinic.run(4, 'Glasslyn West', '+3532955925');
    
    // Auto-migrate stranded older vets to Clinic 1 (Glasslyn Main)
    const info = db.prepare(`UPDATE vets SET clinic_id = 1 WHERE clinic_id IS NULL`).run();
    if (info.changes > 0) {
      console.log(`Auto-migrated ${info.changes} unassigned legacy Vets directly to Glasslyn Main (Clinic 1).`);
    }
  });

  tx();

  console.log("Database successfully loaded with the 4 Clinics!");
  db.close();
} catch (e) {
  console.error("Failed to load database:", e);
}

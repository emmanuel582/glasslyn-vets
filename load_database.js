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
    insertClinic.run(1, 'Glasslyn Vets', '+353000000000'); // Fills requirement for Clinic 1 just in case
    insertClinic.run(2, 'Glasslyn Southside', '+353212296063');
    insertClinic.run(3, 'Glasslyn Northside', '+353212296062');
    insertClinic.run(4, 'Glasslyn West', '+3532955925');
  });

  tx();

  console.log("Database successfully loaded with the 4 Clinics!");
  db.close();
} catch (e) {
  console.error("Failed to load database:", e);
}

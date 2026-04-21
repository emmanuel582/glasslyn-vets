// ============================================
// Glasslyn Vets — SQLite Database
// ============================================
// Multi-Clinic Edition — clinics table, per-clinic
// vet assignments, and DID-based routing queries.

const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./utils/logger');

const { config } = require('./config');
const DB_PATH = path.resolve(__dirname, '..', 'data', 'clinic.db');

let db;

/**
 * Initialise the SQLite database and create tables if they don't exist.
 */
function initDatabase() {
  // Ensure the data directory exists
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      did TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS callers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      eircode TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      caller_phone TEXT NOT NULL,
      caller_whatsapp TEXT,
      caller_name TEXT,
      eircode TEXT,
      issue_description TEXT,
      urgency TEXT CHECK(urgency IN ('urgent', 'non_urgent', 'pending')) DEFAULT 'pending',
      status TEXT CHECK(status IN ('open', 'collecting', 'escalating', 'accepted', 'rejected', 'failover', 'closed', 'logged')) DEFAULT 'open',
      clinic_id INTEGER,
      dialled_number TEXT,
      assigned_vet_name TEXT,
      assigned_vet_phone TEXT,
      vet_response TEXT,
      vet_eta TEXT,
      escalation_level INTEGER DEFAULT 0,
      retell_call_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      clinic_id INTEGER REFERENCES clinics(id),
      level_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clinics_did ON clinics(did);
    CREATE INDEX IF NOT EXISTS idx_callers_phone ON callers(phone);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_caller_phone ON cases(caller_phone);
    CREATE INDEX IF NOT EXISTS idx_audit_case_id ON audit_log(case_id);
  `);

  // ─── Migrations ─────────────────────────────────────
  runMigrations();

  // Create indexes that depend on columns added by migrations
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cases_clinic_id ON cases(clinic_id);
    CREATE INDEX IF NOT EXISTS idx_vets_clinic_id ON vets(clinic_id);
  `);

  // ─── Migrations ─────────────────────────────────────
  runMigrations();

  logger.info('Database initialised', { path: DB_PATH });

  // Seed clinics from config
  seedClinics();

  // Seed vets from config
  seedVets();

  return db;
}

/**
 * Run schema migrations for existing databases being upgraded
 * from the single-clinic version to multi-clinic.
 */
function runMigrations() {
  const columns = db.prepare("PRAGMA table_info(cases)").all();
  const columnNames = columns.map(c => c.name);

  // Migration: Add caller_whatsapp to cases
  if (!columnNames.includes('caller_whatsapp')) {
    db.exec("ALTER TABLE cases ADD COLUMN caller_whatsapp TEXT");
    logger.info('Migration: Added caller_whatsapp column to cases table');
  }

  // Migration: Add clinic_id to cases
  if (!columnNames.includes('clinic_id')) {
    db.exec("ALTER TABLE cases ADD COLUMN clinic_id INTEGER");
    logger.info('Migration: Added clinic_id column to cases table');
  }

  // Migration: Add dialled_number to cases
  if (!columnNames.includes('dialled_number')) {
    db.exec("ALTER TABLE cases ADD COLUMN dialled_number TEXT");
    logger.info('Migration: Added dialled_number column to cases table');
  }

  // Migration: Add clinic_id to vets
  const vetColumns = db.prepare("PRAGMA table_info(vets)").all();
  const vetColumnNames = vetColumns.map(c => c.name);
  if (!vetColumnNames.includes('clinic_id')) {
    db.exec("ALTER TABLE vets ADD COLUMN clinic_id INTEGER REFERENCES clinics(id)");
    logger.info('Migration: Added clinic_id column to vets table');
  }

  // Migration: Create clinics table if it doesn't exist (in case of upgrade)
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      did TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clinics_did ON clinics(did);
  `);
}

/**
 * Seed clinics table from config if empty.
 */
function seedClinics() {
  const clinicCount = db.prepare('SELECT COUNT(*) as count FROM clinics').get().count;
  if (clinicCount === 0 && config.clinics.length > 0) {
    logger.info('Clinics table is empty. Seeding from config...');
    const insertClinic = db.prepare('INSERT INTO clinics (name, did) VALUES (?, ?)');
    for (const clinic of config.clinics) {
      insertClinic.run(clinic.name, clinic.did);
      logger.info(`  Seeded clinic: ${clinic.name} (DID: ${clinic.did})`);
    }
  }
}

/**
 * Seed vets table from config if empty.
 * Each vet is assigned to a clinic via clinic_id.
 */
function seedVets() {
  const vetCount = db.prepare('SELECT COUNT(*) as count FROM vets').get().count;
  if (vetCount === 0 && config.vetSeeds.length > 0) {
    logger.info('Vets table is empty. Seeding from config...');

    // Build a lookup: clinicNumber (1-4) → clinic DB id
    const allClinics = db.prepare('SELECT * FROM clinics ORDER BY id ASC').all();
    const clinicIdMap = {};
    allClinics.forEach((c, idx) => {
      clinicIdMap[idx + 1] = c.id; // clinicNumber 1 → first clinic's DB id, etc.
    });

    const insertVet = db.prepare('INSERT INTO vets (name, phone, clinic_id, level_order) VALUES (?, ?, ?, ?)');

    // Track per-clinic order so level_order is scoped to each clinic
    const clinicOrder = {};

    for (const vet of config.vetSeeds) {
      const clinicDbId = clinicIdMap[vet.clinicNumber] || allClinics[0]?.id || 1;
      clinicOrder[clinicDbId] = (clinicOrder[clinicDbId] || 0) + 1;

      insertVet.run(vet.name, vet.phone, clinicDbId, clinicOrder[clinicDbId]);
      logger.info(`  Seeded vet: ${vet.name} → Clinic ${vet.clinicNumber} (level ${clinicOrder[clinicDbId]})`);
    }
  }
}

/**
 * Get the database instance.
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialised. Call initDatabase() first.');
  }
  return db;
}

// ─── Clinic Queries ───────────────────────────────────

/**
 * Find a clinic by its DID (inbound phone number).
 * Strips formatting chars to do a normalised match.
 */
function findClinicByDID(did) {
  const cleaned = did.replace(/[\s\-\(\)\+]/g, '');
  return getDb().prepare(`
    SELECT * FROM clinics 
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(did, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
  `).get(cleaned);
}

/**
 * Get all clinics.
 */
function getAllClinics() {
  return getDb().prepare('SELECT * FROM clinics ORDER BY id ASC').all();
}

/**
 * Get a clinic by ID.
 */
function getClinicById(clinicId) {
  return getDb().prepare('SELECT * FROM clinics WHERE id = ?').get(clinicId);
}

/**
 * Add a new clinic.
 */
function addClinic(name, did) {
  const result = getDb().prepare('INSERT INTO clinics (name, did) VALUES (?, ?)').run(name, did);
  return { id: result.lastInsertRowid, name, did };
}

/**
 * Update a clinic.
 */
function updateClinic(id, updates) {
  const expected = ['name', 'did'];
  const clauses = [];
  const args = [];
  for (const k of expected) {
    if (updates[k] !== undefined) {
      clauses.push(`${k} = ?`);
      args.push(updates[k]);
    }
  }
  if (clauses.length === 0) return true;
  args.push(id);
  getDb().prepare(`UPDATE clinics SET ${clauses.join(', ')} WHERE id = ?`).run(...args);
  return true;
}

// ─── Caller Queries ───────────────────────────────────

/**
 * Look up a caller by phone number.
 */
function findCallerByPhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  return getDb().prepare(`
    SELECT * FROM callers 
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
  `).get(cleaned);
}

/**
 * Create or update a caller record.
 */
function upsertCaller(phone, name, eircode) {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  const existing = findCallerByPhone(cleaned);

  if (existing) {
    getDb().prepare(`
      UPDATE callers SET name = ?, eircode = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name || existing.name, eircode || existing.eircode, existing.id);
    return { ...existing, name: name || existing.name, eircode: eircode || existing.eircode };
  } else {
    const result = getDb().prepare(`
      INSERT INTO callers (phone, name, eircode) VALUES (?, ?, ?)
    `).run(cleaned, name, eircode);
    return { id: result.lastInsertRowid, phone: cleaned, name, eircode };
  }
}

// ─── Case Queries ─────────────────────────────────────

/**
 * Create a new case.
 */
function createCase(caseData) {
  const stmt = getDb().prepare(`
    INSERT INTO cases (id, caller_phone, caller_whatsapp, caller_name, eircode, issue_description, urgency, status, clinic_id, dialled_number, retell_call_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    caseData.id,
    caseData.caller_phone,
    caseData.caller_whatsapp || null,
    caseData.caller_name || null,
    caseData.eircode || null,
    caseData.issue_description || null,
    caseData.urgency || 'pending',
    caseData.status || 'open',
    caseData.clinic_id || null,
    caseData.dialled_number || null,
    caseData.retell_call_id || null
  );
  return getCaseById(caseData.id);
}

/**
 * Get a case by ID.
 */
function getCaseById(caseId) {
  return getDb().prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
}

/**
 * Update case fields.
 */
function updateCase(caseId, updates) {
  const allowedFields = [
    'caller_name', 'caller_phone', 'caller_whatsapp', 'eircode', 'issue_description',
    'urgency', 'status', 'clinic_id', 'dialled_number',
    'assigned_vet_name', 'assigned_vet_phone',
    'vet_response', 'vet_eta', 'escalation_level', 'retell_call_id'
  ];

  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return getCaseById(caseId);

  setClauses.push("updated_at = datetime('now')");
  values.push(caseId);

  getDb().prepare(`
    UPDATE cases SET ${setClauses.join(', ')} WHERE id = ?
  `).run(...values);

  return getCaseById(caseId);
}

/**
 * Find active/escalating case for a given vet phone.
 */
function findActiveCaseForVet(vetPhone) {
  const cleaned = vetPhone.replace(/[\s\-\(\)\+]/g, '');
  return getDb().prepare(`
    SELECT * FROM cases 
    WHERE status = 'escalating' 
    AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(assigned_vet_phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(cleaned);
}

/**
 * Get all open/escalating cases.
 */
function getActiveCases() {
  return getDb().prepare(`
    SELECT * FROM cases 
    WHERE status IN ('open', 'collecting', 'escalating', 'failover')
    ORDER BY created_at DESC
  `).all();
}

// ─── Vet Queries ──────────────────────────────────────

/**
 * Get all vets (all clinics), with clinic name joined.
 */
function getAllVets() {
  return getDb().prepare(`
    SELECT vets.*, clinics.name as clinic_name 
    FROM vets 
    LEFT JOIN clinics ON vets.clinic_id = clinics.id
    ORDER BY vets.clinic_id ASC, vets.level_order ASC
  `).all();
}

/**
 * Get vets for a specific clinic, ordered by escalation priority.
 * This is the key function for multi-clinic routing.
 */
function getVetsByClinic(clinicId) {
  return getDb().prepare(`
    SELECT vets.*, clinics.name as clinic_name
    FROM vets
    LEFT JOIN clinics ON vets.clinic_id = clinics.id
    WHERE vets.clinic_id = ?
    ORDER BY vets.level_order ASC
  `).all(clinicId);
}

function addVet(name, phone, level_order, clinic_id) {
  const result = getDb().prepare(
    'INSERT INTO vets (name, phone, level_order, clinic_id) VALUES (?, ?, ?, ?)'
  ).run(name, phone, level_order, clinic_id || null);
  return { id: result.lastInsertRowid, name, phone, level_order, clinic_id };
}

function updateVet(id, updates) {
  const expected = ['name', 'phone', 'level_order', 'clinic_id'];
  const clauses = [];
  const args = [];
  for (const k of expected) {
    if (updates[k] !== undefined) {
      clauses.push(`${k} = ?`);
      args.push(updates[k]);
    }
  }
  if (clauses.length === 0) return true;
  args.push(id);
  getDb().prepare(`UPDATE vets SET ${clauses.join(', ')} WHERE id = ?`).run(...args);
  return true;
}

function deleteVet(id) {
  getDb().prepare('DELETE FROM vets WHERE id = ?').run(id);
  return true;
}

// ─── Audit Log ────────────────────────────────────────

/**
 * Add an entry to the audit log.
 */
function addAuditLog(caseId, eventType, eventData) {
  getDb().prepare(`
    INSERT INTO audit_log (case_id, event_type, event_data) VALUES (?, ?, ?)
  `).run(caseId, eventType, typeof eventData === 'string' ? eventData : JSON.stringify(eventData));
}

/**
 * Get audit log for a case.
 */
function getAuditLog(caseId) {
  return getDb().prepare(`
    SELECT * FROM audit_log WHERE case_id = ? ORDER BY created_at ASC
  `).all(caseId);
}

// ─── Cleanup ──────────────────────────────────────────

function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getDb,
  // Clinics
  findClinicByDID,
  getAllClinics,
  getClinicById,
  addClinic,
  updateClinic,
  // Callers
  findCallerByPhone,
  upsertCaller,
  // Cases
  createCase,
  getCaseById,
  updateCase,
  findActiveCaseForVet,
  getActiveCases,
  // Vets
  getAllVets,
  getVetsByClinic,
  addVet,
  updateVet,
  deleteVet,
  // Audit
  addAuditLog,
  getAuditLog,
  // Lifecycle
  closeDatabase,
};

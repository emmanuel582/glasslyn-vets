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
      level_order INTEGER NOT NULL,
      vet_profile_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS vet_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clinics_did ON clinics(did);
    CREATE INDEX IF NOT EXISTS idx_callers_phone ON callers(phone);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_caller_phone ON cases(caller_phone);
    CREATE INDEX IF NOT EXISTS idx_audit_case_id ON audit_log(case_id);

    CREATE TABLE IF NOT EXISTS vet_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_date TEXT NOT NULL,
      clinic_id INTEGER NOT NULL,
      level_order INTEGER NOT NULL,
      vet_profile_id INTEGER NOT NULL,
      UNIQUE(shift_date, clinic_id, level_order)
    );
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

  // Migration: Correct known clinic spelling that affects TTS pronunciation.
  const clinicRenameInfo = db.prepare(`
    UPDATE clinics
    SET name = REPLACE(name, 'Muskerry', 'Muskery')
    WHERE name LIKE '%Muskerry%'
  `).run();
  if (clinicRenameInfo.changes > 0) {
    logger.info(`Migration: Renamed ${clinicRenameInfo.changes} clinic record(s) from Muskerry to Muskery`);
  }

  // Migration: Add vet_profile_id to vets
  if (!vetColumnNames.includes('vet_profile_id')) {
    db.exec("ALTER TABLE vets ADD COLUMN vet_profile_id INTEGER");
    logger.info('Migration: Added vet_profile_id column to vets table');
  }

  // Migration: Create vet_profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vet_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );
  `);

  // Migration: Create vet_shifts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vet_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_date TEXT NOT NULL,
      clinic_id INTEGER NOT NULL,
      level_order INTEGER NOT NULL,
      vet_profile_id INTEGER NOT NULL,
      UNIQUE(shift_date, clinic_id, level_order)
    );
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

/**
 * Clear all callers.
 */
function clearCallers() {
  getDb().prepare('DELETE FROM callers').run();
  return true;
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
 * Checks for a specific rota for today (YYYY-MM-DD). If found, uses it.
 * Otherwise, falls back to the default vets table.
 */
function getVetsByClinic(clinicId) {
  const today = new Date().toISOString().split('T')[0];
  const shifts = getDb().prepare(`
    SELECT vet_shifts.id as shift_id, vet_shifts.level_order, vet_profiles.name, vet_profiles.phone, clinics.name as clinic_name, vet_shifts.vet_profile_id
    FROM vet_shifts
    JOIN vet_profiles ON vet_shifts.vet_profile_id = vet_profiles.id
    LEFT JOIN clinics ON vet_shifts.clinic_id = clinics.id
    WHERE vet_shifts.clinic_id = ? AND vet_shifts.shift_date = ?
    ORDER BY vet_shifts.level_order ASC
  `).all(clinicId, today);

  if (shifts && shifts.length > 0) {
    return shifts;
  }

  // Fallback to static vets
  return getDb().prepare(`
    SELECT vets.*, clinics.name as clinic_name
    FROM vets
    LEFT JOIN clinics ON vets.clinic_id = clinics.id
    WHERE vets.clinic_id = ?
    ORDER BY vets.level_order ASC
  `).all(clinicId);
}

function addVet(name, phone, level_order, clinic_id, vet_profile_id) {
  const result = getDb().prepare(
    'INSERT INTO vets (name, phone, level_order, clinic_id, vet_profile_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, phone, level_order, clinic_id || null, vet_profile_id || null);
  return { id: result.lastInsertRowid, name, phone, level_order, clinic_id, vet_profile_id };
}

function updateVet(id, updates) {
  const expected = ['name', 'phone', 'level_order', 'clinic_id', 'vet_profile_id'];
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

// ─── Vet Profiles ─────────────────────────────────────

function getAllVetProfiles() {
  return getDb().prepare('SELECT * FROM vet_profiles ORDER BY name ASC').all();
}

function addVetProfile(name, phone) {
  const result = getDb().prepare('INSERT INTO vet_profiles (name, phone) VALUES (?, ?)').run(name, phone);
  return { id: result.lastInsertRowid, name, phone };
}

function updateVetProfile(id, name, phone) {
  getDb().prepare('UPDATE vet_profiles SET name = ?, phone = ? WHERE id = ?').run(name, phone, id);
  // Also update any vets in the roster that use this profile
  getDb().prepare('UPDATE vets SET name = ?, phone = ? WHERE vet_profile_id = ?').run(name, phone, id);
  return true;
}

function deleteVetProfile(id) {
  getDb().prepare('DELETE FROM vet_profiles WHERE id = ?').run(id);
  return true;
}

// ─── Vet Shifts ───────────────────────────────────────

function getVetShifts(clinicId, monthPrefix) {
  return getDb().prepare(`
    SELECT vet_shifts.*, vet_profiles.name, vet_profiles.phone 
    FROM vet_shifts
    JOIN vet_profiles ON vet_shifts.vet_profile_id = vet_profiles.id
    WHERE clinic_id = ? AND shift_date LIKE ?
    ORDER BY shift_date ASC, level_order ASC
  `).all(clinicId, `${monthPrefix}%`);
}

function upsertVetShift(shift_date, clinic_id, level_order, vet_profile_id) {
  getDb().prepare(`
    INSERT INTO vet_shifts (shift_date, clinic_id, level_order, vet_profile_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(shift_date, clinic_id, level_order) DO UPDATE SET vet_profile_id = excluded.vet_profile_id
  `).run(shift_date, clinic_id, level_order, vet_profile_id);
  return true;
}

function deleteVetShift(shift_date, clinic_id, level_order) {
  getDb().prepare(`
    DELETE FROM vet_shifts WHERE shift_date = ? AND clinic_id = ? AND level_order = ?
  `).run(shift_date, clinic_id, level_order);
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
  clearCallers,
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
  // Vet Profiles
  getAllVetProfiles,
  addVetProfile,
  updateVetProfile,
  deleteVetProfile,
  // Vet Shifts
  getVetShifts,
  upsertVetShift,
  deleteVetShift,
  // Audit
  addAuditLog,
  getAuditLog,
  // Lifecycle
  closeDatabase,
};

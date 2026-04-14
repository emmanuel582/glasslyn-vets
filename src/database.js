// ============================================
// Glasslyn Vets — SQLite Database
// ============================================
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
      level_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_callers_phone ON callers(phone);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_caller_phone ON cases(caller_phone);
    CREATE INDEX IF NOT EXISTS idx_audit_case_id ON audit_log(case_id);
  `);

  // ─── Migrations ─────────────────────────────────────
  // Add caller_whatsapp column if it doesn't exist (for existing databases)
  try {
    const columns = db.prepare("PRAGMA table_info(cases)").all();
    const hasWhatsappCol = columns.some(c => c.name === 'caller_whatsapp');
    if (!hasWhatsappCol) {
      db.exec("ALTER TABLE cases ADD COLUMN caller_whatsapp TEXT");
      logger.info('Migration: Added caller_whatsapp column to cases table');
    }
  } catch (migrationErr) {
    logger.warn('Migration check for caller_whatsapp failed (may already exist)', { error: migrationErr.message });
  }

  logger.info('Database initialised', { path: DB_PATH });

  // Seed vets table if it's empty
  const vetCount = db.prepare('SELECT COUNT(*) as count FROM vets').get().count;
  if (vetCount === 0 && config.vets && config.vets.length > 0) {
    logger.info('Vets table is empty. Seeding from config...');
    const insertVet = db.prepare('INSERT INTO vets (name, phone, level_order) VALUES (?, ?, ?)');
    config.vets.forEach((vet, index) => {
      // Only insert if it has a valid-looking phone or name
      if (vet.name && vet.phone) {
        insertVet.run(vet.name, vet.phone, index + 1);
      }
    });
  }

  return db;
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
    INSERT INTO cases (id, caller_phone, caller_whatsapp, caller_name, eircode, issue_description, urgency, status, retell_call_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    'urgency', 'status', 'assigned_vet_name', 'assigned_vet_phone',
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

function getAllVets() {
  return getDb().prepare('SELECT * FROM vets ORDER BY level_order ASC').all();
}

function addVet(name, phone, level_order) {
  const result = getDb().prepare('INSERT INTO vets (name, phone, level_order) VALUES (?, ?, ?)').run(name, phone, level_order);
  return { id: result.lastInsertRowid, name, phone, level_order };
}

function updateVet(id, updates) {
  const expected = ['name', 'phone', 'level_order'];
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
  findCallerByPhone,
  upsertCaller,
  createCase,
  getCaseById,
  updateCase,
  findActiveCaseForVet,
  getActiveCases,
  getAllVets,
  addVet,
  updateVet,
  deleteVet,
  addAuditLog,
  getAuditLog,
  closeDatabase,
};

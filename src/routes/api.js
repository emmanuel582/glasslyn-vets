const express = require('express');
const db = require('../database');
const router = express.Router();

// ============================================
// Vets
// ============================================
router.get('/vets', (req, res) => {
  try {
    const vets = db.getAllVets();
    res.json(vets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vets', (req, res) => {
  try {
    const { name, phone, level_order } = req.body;
    if (!name || !phone || typeof level_order === 'undefined') {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const newVet = db.addVet(name, phone, level_order);
    res.json(newVet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/vets/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.updateVet(id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/vets/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteVet(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Cases
// ============================================
router.get('/cases', (req, res) => {
  try {
    const cases = db.getDb().prepare('SELECT * FROM cases ORDER BY created_at DESC').all();
    res.json(cases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Callers
// ============================================
router.get('/callers', (req, res) => {
  try {
    const callers = db.getDb().prepare('SELECT * FROM callers ORDER BY created_at DESC').all();
    res.json(callers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Audit Logs
// ============================================
router.get('/logs', (req, res) => {
  try {
    const logs = db.getDb().prepare(`
      SELECT audit_log.*, cases.caller_name 
      FROM audit_log 
      LEFT JOIN cases ON audit_log.case_id = cases.id 
      ORDER BY audit_log.created_at DESC LIMIT 500
    `).all();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

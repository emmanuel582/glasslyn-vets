const express = require('express');
const db = require('../database');
const router = express.Router();

// ============================================
// Clinics
// ============================================
router.get('/clinics', (req, res) => {
  try {
    const clinics = db.getAllClinics();
    res.json(clinics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/clinics', (req, res) => {
  try {
    const { name, did } = req.body;
    if (!name || !did) {
      return res.status(400).json({ error: 'Missing clinic name or DID' });
    }
    const newClinic = db.addClinic(name, did);
    res.json(newClinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/clinics/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.updateClinic(id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Vets
// ============================================
router.get('/vets', (req, res) => {
  try {
    const { clinic_id } = req.query;
    let vets;
    if (clinic_id) {
      vets = db.getVetsByClinic(clinic_id);
    } else {
      vets = db.getAllVets();
    }
    res.json(vets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vets', (req, res) => {
  try {
    const { name, phone, level_order, clinic_id } = req.body;
    if (!name || !phone || typeof level_order === 'undefined') {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const newVet = db.addVet(name, phone, level_order, clinic_id);
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
    const cases = db.getDb().prepare(`
      SELECT cases.*, clinics.name as clinic_name
      FROM cases 
      LEFT JOIN clinics ON cases.clinic_id = clinics.id
      ORDER BY cases.created_at DESC
    `).all();
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

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const db = require('../database');
const router = express.Router();

const upload = multer({ dest: 'tmp/' });

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
    const { name, phone, level_order, clinic_id, vet_profile_id } = req.body;
    if (!name || !phone || typeof level_order === 'undefined') {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const newVet = db.addVet(name, phone, level_order, clinic_id, vet_profile_id);
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
// Vet Profiles
// ============================================
router.get('/vet-profiles', (req, res) => {
  try {
    res.json(db.getAllVetProfiles());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vet-profiles', (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Missing name or phone' });
    res.json(db.addVetProfile(name, phone));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/vet-profiles/:id', (req, res) => {
  try {
    const { name, phone } = req.body;
    db.updateVetProfile(req.params.id, name, phone);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/vet-profiles/:id', (req, res) => {
  try {
    db.deleteVetProfile(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Vet Shifts
// ============================================
router.get('/vet-shifts', (req, res) => {
  try {
    const { clinic_id, month } = req.query;
    if (!clinic_id || !month) return res.status(400).json({ error: 'Missing clinic_id or month (YYYY-MM)' });
    res.json(db.getVetShifts(clinic_id, month));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vet-shifts', (req, res) => {
  try {
    const { shift_date, clinic_id, level_order, vet_profile_id } = req.body;
    if (!shift_date || !clinic_id || !level_order || !vet_profile_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    db.upsertVetShift(shift_date, clinic_id, level_order, vet_profile_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/vet-shifts', (req, res) => {
  try {
    const { shift_date, clinic_id, level_order } = req.body;
    db.deleteVetShift(shift_date, clinic_id, level_order);
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
// Callers & CSV
// ============================================
router.get('/callers', (req, res) => {
  try {
    const callers = db.getDb().prepare('SELECT * FROM callers ORDER BY created_at DESC').all();
    res.json(callers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/callers/clear', (req, res) => {
  try {
    db.clearCallers();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/callers/csv-upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      // Look for phone, name, address/eircode columns
      results.forEach(row => {
        let name = row.Name || row.name || row.CustomerName || row.customerName || '';
        let phone = row.Phone || row.phone || row.PhoneNumber || row.phoneNumber || '';
        let address = row.Address || row.address || row.Eircode || row.eircode || '';
        if (phone) {
          db.upsertCaller(phone, name, address);
        }
      });
      fs.unlinkSync(req.file.path); // remove temp file
      res.json({ success: true, count: results.length });
    });
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

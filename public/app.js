let currentDate = new Date();
document.addEventListener('DOMContentLoaded', () => {
  // Navigation Defaults
  initTabs();
  
  // Data Fetching
  fetchClinics().then(() => {
    refreshAllData();
  });

  // Polling for live updates every 15 seconds (keeps latest on top naturally)
  setInterval(() => {
    refreshAllData();
  }, 15000);

  // Setup Vet Form
  document.getElementById('vetForm').addEventListener('submit', handleVetSubmit);
  document.getElementById('rotaForm')?.addEventListener('submit', handleRotaSubmit);

  // Make all datagrids sortable
  makeTableSortable('casesTable');
  makeTableSortable('logsTable');
  makeTableSortable('callersTable');
});

// ─── TAB NAVIGATION ─────────────────────────────────────
function initTabs() {
  const btns = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      target.classList.add('active');
    });
  });
}

function refreshAllData() {
  fetchCases();
  fetchLogs();
  fetchCallers();
  fetchVets();
  fetchVetProfiles();
  renderCalendar();
}

let globalClinics = [];
let globalVetProfiles = [];

// ─── FETCH & RENDER: CLINICS ────────────────────────────
async function fetchClinics() {
  try {
    const res = await fetch('/api/clinics');
    globalClinics = await res.json();
    
    // Populate filters and dropdowns
    const filterSelect = document.getElementById('vetClinicFilter');
    const modalSelect = document.getElementById('vetClinicId');
    if (filterSelect && modalSelect) {
      filterSelect.innerHTML = '';
      modalSelect.innerHTML = '';
      
      globalClinics.forEach(c => {
        filterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        modalSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
      renderCalendar();
    }
  } catch (err) {
    console.error('Failed to fetch clinics', err);
  }
}

// ─── FETCH & RENDER: CASES ──────────────────────────────
async function fetchCases() {
  try {
    const res = await fetch('/api/cases');
    const cases = await res.json();
    const tbody = document.querySelector('#casesTable tbody');
    tbody.innerHTML = '';

    cases.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; letter-spacing: 1px;">${c.id}</td>
        <td>${formatDate(c.created_at)}</td>
        <td style="font-weight: 500; color: var(--text-main);">${c.clinic_name || 'Glasslyn Vets'}</td>
        <td>${renderUrgency(c.urgency)}</td>
        <td style="text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">${c.status}</td>
        <td>${c.caller_name || c.caller_phone}</td>
        <td>${c.assigned_vet_name || '-'}</td>
        <td><button class="btn btn-ghost" style="padding: 4px 10px; font-size: 11px;" onclick="viewCaseDetails('${c.id}')">View</button></td>
      `;
      tbody.appendChild(tr);
    });
    reapplySort('casesTable');
  } catch (err) {
    console.error('Failed to fetch cases', err);
  }
}

// ─── FETCH & RENDER: AUDIT LOGS ────────────────────────
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';

    logs.forEach(l => {
      let detailsHTML = '-';
      try {
        const parsed = JSON.parse(l.event_data);
        detailsHTML = Object.entries(parsed).map(([k, v]) => `<b>${k}:</b> ${v}`).join(' | ');
      } catch(e) {
        detailsHTML = l.event_data;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width: 150px; color: var(--text-muted);">${formatDate(l.created_at)}</td>
        <td style="width: 150px; font-family: monospace;">${l.case_id || '-'}</td>
        <td style="width: 150px;">${l.caller_name || '-'}</td>
        <td style="width: 200px;">
          <span style="background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; color: var(--text-main);">
            ${l.event_type.replace(/_/g, ' ')}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 13px;">${detailsHTML}</td>
      `;
      tbody.appendChild(tr);
    });
    reapplySort('logsTable');
  } catch (err) {
    console.error('Failed to fetch logs', err);
  }
}

// ─── FETCH & RENDER: CALLERS ──────────────────────────
async function fetchCallers() {
  try {
    const res = await fetch('/api/callers');
    const callers = await res.json();
    const tbody = document.querySelector('#callersTable tbody');
    tbody.innerHTML = '';

    callers.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace;">${c.phone}</td>
        <td>${c.name || '<span style="color: var(--text-muted)">Unknown</span>'}</td>
        <td>${c.eircode || '-'}</td>
        <td style="color: var(--text-muted);">${formatDate(c.created_at)}</td>
        <td>${formatDate(c.updated_at)}</td>
      `;
      tbody.appendChild(tr);
    });
    reapplySort('callersTable');
  } catch (err) {
    console.error('Failed to fetch callers', err);
  }
}

// ─── FETCH & RENDER: VETS ─────────────────────────────
async function fetchVets() {
  try {
    const filter = document.getElementById('vetClinicFilter');
    let url = '/api/vets';
    if (filter && filter.value) {
      url += '?clinic_id=' + filter.value;
    }
    const res = await fetch(url);
    const vets = await res.json();
    const grid = document.getElementById('vetsGrid');
    grid.innerHTML = '';

    vets.forEach(v => {
      const card = document.createElement('div');
      card.className = 'glass-panel vet-card';
      const clinicDisplay = v.clinic_name ? `<div style="font-size: 11px; margin-bottom: 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 1px;">${v.clinic_name}</div>` : '';
      card.innerHTML = `
        <div class="vet-level">Level ${v.level_order}</div>
        ${clinicDisplay}
        <h3>${v.name}</h3>
        <p>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          ${v.phone}
        </p>
        <div class="vet-actions">
          <button class="btn btn-ghost" onclick="editVet(${v.id}, '${v.name.replace(/'/g, "\\'")}', '${v.phone}', ${v.level_order}, ${v.clinic_id}, ${v.vet_profile_id})">Edit</button>
          <button class="btn btn-danger" onclick="deleteVet(${v.id})">Remove</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to fetch vets', err);
  }
}

// ─── CALENDAR ROTA ─────────────────────────────────────
let monthlyShifts = [];

async function fetchMonthlyShifts() {
  const clinicId = document.getElementById('vetClinicFilter')?.value;
  if (!clinicId) return;
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  try {
    const res = await fetch(`/api/vet-shifts?clinic_id=${clinicId}&month=${year}-${month}`);
    monthlyShifts = await res.json();
  } catch(err) {
    console.error(err);
  }
}

window.changeMonth = function(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
};

window.renderCalendar = async function() {
  await fetchMonthlyShifts();
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  document.getElementById('currentMonthLabel').innerText = `${monthName} ${year}`;

  const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Day headers
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach(d => {
    grid.innerHTML += `<div style="text-align:center; font-size:11px; font-weight:600; color:var(--text-muted); padding:5px;">${d}</div>`;
  });

  // Empty cells for offset
  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const shiftsForDay = monthlyShifts.filter(s => s.shift_date === dateStr);
    
    let content = '';
    shiftsForDay.forEach(s => {
      content += `<div style="font-size:9px; font-weight:600; background:rgba(0,102,255,0.1); border:1px solid rgba(0,102,255,0.2); border-radius:4px; padding:2px 4px; margin-top:4px; color:var(--accent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Level ${s.level_order}: ${s.name}">L${s.level_order}: ${s.name.split(' ')[0]}</div>`;
    });

    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    const bg = isToday ? 'rgba(0,102,255,0.05)' : 'rgba(255,255,255,0.4)';
    const border = isToday ? '2px solid var(--accent)' : '1px solid var(--glass-border)';

    grid.innerHTML += `
      <div onclick="openRotaModal('${dateStr}')" class="calendar-day" style="background:${bg}; border:${border}; border-radius:8px; padding:8px; min-height:65px; display:flex; flex-direction:column; cursor:pointer; transition:all 0.2s; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
        <div style="font-size:12px; font-weight:700; color:var(--text-main);">${day}</div>
        ${content}
      </div>
    `;
  }
};

window.openRotaModal = function(dateStr) {
  const clinicId = document.getElementById('vetClinicFilter')?.value;
  if (!clinicId) {
    alert('Please select a specific clinic first to manage its calendar.');
    return;
  }

  document.getElementById('rotaDate').value = dateStr;
  document.getElementById('rotaModalTitle').innerText = 'Assign Vets for ' + dateStr;
  
  // reset
  document.getElementById('rotaLevel1').value = '';
  document.getElementById('rotaLevel2').value = '';

  const shiftsForDay = monthlyShifts.filter(s => s.shift_date === dateStr);
  const l1 = shiftsForDay.find(s => s.level_order === 1);
  const l2 = shiftsForDay.find(s => s.level_order === 2);

  if (l1) document.getElementById('rotaLevel1').value = l1.vet_profile_id;
  if (l2) document.getElementById('rotaLevel2').value = l2.vet_profile_id;

  document.getElementById('rotaModalOverlay').classList.add('active');
};

window.closeRotaModal = function() {
  document.getElementById('rotaModalOverlay').classList.remove('active');
};

async function handleRotaSubmit(e) {
  e.preventDefault();
  const clinicId = document.getElementById('vetClinicFilter').value;
  const dateStr = document.getElementById('rotaDate').value;
  const l1 = document.getElementById('rotaLevel1').value;
  const l2 = document.getElementById('rotaLevel2').value;

  const updates = [];
  if (l1) updates.push({ shift_date: dateStr, clinic_id: clinicId, level_order: 1, vet_profile_id: l1 });
  else updates.push({ _delete: true, shift_date: dateStr, clinic_id: clinicId, level_order: 1 });

  if (l2) updates.push({ shift_date: dateStr, clinic_id: clinicId, level_order: 2, vet_profile_id: l2 });
  else updates.push({ _delete: true, shift_date: dateStr, clinic_id: clinicId, level_order: 2 });

  try {
    for (const update of updates) {
      if (update._delete) {
        await fetch('/api/vet-shifts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update)
        });
      } else {
        await fetch('/api/vet-shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update)
        });
      }
    }
    closeRotaModal();
    renderCalendar();
  } catch(err) {
    alert('Failed to save rota: ' + err.message);
  }
}

// ─── VET MODAL & CRUD ─────────────────────────────────
function openVetModal() {
  document.getElementById('vetForm').reset();
  document.getElementById('vetId').value = '';
  const filter = document.getElementById('vetClinicFilter');
  if (filter && filter.value) {
    document.getElementById('vetClinicId').value = filter.value;
  }
  document.getElementById('modalTitle').innerText = 'Add Veterinarian';
  document.getElementById('vetModalOverlay').classList.add('active');
}

function closeVetModal() {
  document.getElementById('vetModalOverlay').classList.remove('active');
}

function editVet(id, name, phone, level, clinicId, profileId) {
  document.getElementById('vetId').value = id;
  document.getElementById('vetProfileId').value = profileId || '';
  document.getElementById('vetName').value = name;
  document.getElementById('vetClinicId').value = clinicId || globalClinics[0]?.id || 1;
  document.getElementById('vetPhone').value = phone;
  document.getElementById('vetLevel').value = level;
  document.getElementById('modalTitle').innerText = 'Edit Veterinarian';
  document.getElementById('vetModalOverlay').classList.add('active');
}

async function handleVetSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('vetId').value;
  const profileId = document.getElementById('vetProfileId').value;
  const data = {
    name: document.getElementById('vetName').value,
    phone: document.getElementById('vetPhone').value,
    level_order: parseInt(document.getElementById('vetLevel').value, 10),
    clinic_id: parseInt(document.getElementById('vetClinicId').value, 10),
    vet_profile_id: profileId ? parseInt(profileId, 10) : null
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? '/api/vets/' + id : '/api/vets';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('API Error');
    closeVetModal();
    fetchVets(); // re-render
  } catch (err) {
    alert('Failed to save Vet: ' + err.message);
  }
}

async function deleteVet(id) {
  if (!confirm('Are you sure you want to completely remove this Vet from the roster?')) return;
  
  try {
    const res = await fetch('/api/vets/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('API Error');
    fetchVets(); // re-render
  } catch (err) {
    alert('Failed to delete Vet: ' + err.message);
  }
}

// ─── CASE DETAILS MODAL ────────────────────────────────
window.viewCaseDetails = async function(id) {
  try {
    const [caseRes, logsRes] = await Promise.all([
      fetch('/api/cases'),
      fetch('/api/logs')
    ]);
    
    const allCases = await caseRes.json();
    const allLogs = await logsRes.json();
    
    const caseData = allCases.find(c => c.id === id);
    if (!caseData) return;

    const caseLogs = allLogs.filter(l => l.case_id === id);

    const body = document.getElementById('detailsBody');
    body.innerHTML = `
      <div class="detail-list" style="margin-bottom: 24px;">
        <div class="detail-item">
          <div class="detail-label">Status & Priority</div>
          <div class="detail-value">
             ${renderUrgency(caseData.urgency)} &nbsp;
             <span style="opacity: 0.6; font-size: 12px; margin-left: 8px;">[${caseData.status.toUpperCase()}]</span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Caller Profile</div>
          <div class="detail-value">
            ${caseData.caller_name || 'Unknown'} <br>
            <span style="color: var(--text-muted); font-size: 13px;">${caseData.caller_phone} | ${caseData.eircode || 'No Eircode'}</span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Reported Issue</div>
          <div class="detail-value" style="font-style: italic; opacity: 0.9;">"${caseData.issue_description}"</div>
        </div>
      </div>
    `;

    document.getElementById('detailsModalOverlay').classList.add('active');
  } catch (err) {
    console.error(err);
  }
};

window.closeDetailsModal = function() {
  document.getElementById('detailsModalOverlay').classList.remove('active');
};


// ─── SORTABLE TABLES (Airtable-style) ───────────────────
// Keeps track of the current sort state per table
const tableSortState = {};

function makeTableSortable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const headers = table.querySelectorAll('th');
  
  headers.forEach((th, index) => {
    // Only sort if it's not the actions column
    if (th.innerText === 'Actions') return;

    th.style.cursor = 'pointer';
    th.title = 'Click to sort';
    
    th.addEventListener('click', () => {
      const isAsc = th.classList.contains('sort-asc');
      sortTable(tableId, index, !isAsc);
    });
  });
}

function sortTable(tableId, colIndex, asc) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector('tbody');
  const headers = table.querySelectorAll('th');
  
  // Update state
  tableSortState[tableId] = { colIndex, asc };
  
  // Update UI indicators
  headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
  headers[colIndex].classList.add(asc ? 'sort-asc' : 'sort-desc');
  
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  rows.sort((a, b) => {
    const aText = (a.cells[colIndex].textContent || '').trim();
    const bText = (b.cells[colIndex].textContent || '').trim();
    
    // Date/Time sort (rudimentary detection)
    if (aText.includes('202') && aText.includes(':')) {
      const d1 = new Date(aText);
      const d2 = new Date(bText);
      if (!isNaN(d1) && !isNaN(d2)) {
        return asc ? d1 - d2 : d2 - d1;
      }
    }
    
    // Numeric sort
    const aNum = parseFloat(aText);
    const bNum = parseFloat(bText);
    if (!isNaN(aNum) && !isNaN(bNum) && !(aText.startsWith('GV-'))) {
      return asc ? aNum - bNum : bNum - aNum;
    }
    
    // Alphabetical sort
    return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
  });
  
  tbody.append(...rows);
}

function reapplySort(tableId) {
  const state = tableSortState[tableId];
  if (state) {
    sortTable(tableId, state.colIndex, state.asc);
  }
}


// ─── UTILITIES ────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const date = new Date(isoStr);
  return date.toLocaleString('en-IE', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function renderUrgency(urgency) {
  if (urgency === 'urgent') {
    return '<span class="badge-urgent">URGENT</span>';
  } else if (urgency === 'non_urgent') {
    return '<span class="badge-normal">NON-URGENT</span>';
  } else {
    return '<span class="badge-normal" style="opacity:0.5">PENDING</span>';
  }
}

// ─── VET PROFILES ─────────────────────────────────────
async function fetchVetProfiles() {
  try {
    const res = await fetch('/api/vet-profiles');
    globalVetProfiles = await res.json();
    const select = document.getElementById('vetProfileId');
    if (select) {
      const currentVal = select.value;
      select.innerHTML = '<option value="">-- Select Vet --</option>';
      globalVetProfiles.forEach(p => {
        select.innerHTML += `<option value="${p.id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-phone="${p.phone}">${p.name}</option>`;
      });
      select.value = currentVal;
    }

    const rota1 = document.getElementById('rotaLevel1');
    const rota2 = document.getElementById('rotaLevel2');
    if (rota1 && rota2) {
      const r1Val = rota1.value;
      const r2Val = rota2.value;
      rota1.innerHTML = '<option value="">-- None (use fallback) --</option>';
      rota2.innerHTML = '<option value="">-- None (use fallback) --</option>';
      globalVetProfiles.forEach(p => {
        const opt = `<option value="${p.id}">${p.name}</option>`;
        rota1.innerHTML += opt;
        rota2.innerHTML += opt;
      });
      rota1.value = r1Val;
      rota2.value = r2Val;
    }
    
    const poolTbody = document.querySelector('#vetPoolTable tbody');
    if (poolTbody) {
      poolTbody.innerHTML = '';
      globalVetProfiles.forEach(p => {
        poolTbody.innerHTML += `
          <tr>
            <td>${p.name}</td>
            <td>${p.phone}</td>
            <td>
              <button class="btn btn-danger" onclick="deleteVetProfile(${p.id})">Delete</button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    console.error('Failed to fetch vet profiles', err);
  }
}

function populateVetFromProfile() {
  const select = document.getElementById('vetProfileId');
  if (!select.value) return;
  const option = select.options[select.selectedIndex];
  document.getElementById('vetName').value = option.dataset.name;
  document.getElementById('vetPhone').value = option.dataset.phone;
}

window.openVetPoolModal = function() {
  document.getElementById('vetProfileForm').reset();
  document.getElementById('profileId').value = '';
  document.getElementById('vetPoolModalOverlay').classList.add('active');
  fetchVetProfiles();
};

window.closeVetPoolModal = function() {
  document.getElementById('vetPoolModalOverlay').classList.remove('active');
  fetchVetProfiles(); 
};

document.getElementById('vetProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('profileId').value;
  const name = document.getElementById('profileName').value;
  const phone = document.getElementById('profilePhone').value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? '/api/vet-profiles/' + id : '/api/vet-profiles';
  try {
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });
    document.getElementById('vetProfileForm').reset();
    document.getElementById('profileId').value = '';
    fetchVetProfiles();
    fetchVets(); 
  } catch (err) {
    alert('Error saving profile');
  }
});

window.deleteVetProfile = async function(id) {
  if (!confirm('Delete this saved vet? This will also remove them from rosters if used.')) return;
  try {
    await fetch('/api/vet-profiles/' + id, { method: 'DELETE' });
    fetchVetProfiles();
    fetchVets();
  } catch (err) {
    alert('Error deleting profile');
  }
};

// ─── CSV OPERATIONS ─────────────────────────────────────
window.uploadCSV = async function() {
  const fileInput = document.getElementById('csvFileInput');
  if (!fileInput.files.length) return;
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/callers/csv-upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    alert(`Successfully uploaded ${data.count} callers!`);
    fetchCallers();
  } catch (err) {
    alert('Failed to upload CSV: ' + err.message);
  }
  fileInput.value = '';
};

window.clearCSVData = async function() {
  if (!confirm('Are you sure you want to clear all caller data?')) return;
  try {
    const res = await fetch('/api/callers/clear', { method: 'DELETE' });
    if (!res.ok) throw new Error('Clear failed');
    fetchCallers();
  } catch (err) {
    alert('Failed to clear data: ' + err.message);
  }
};

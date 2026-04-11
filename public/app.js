document.addEventListener('DOMContentLoaded', () => {
  // Navigation Defaults
  initTabs();
  
  // Data Fetching
  refreshAllData();

  // Polling for live updates every 15 seconds (keeps latest on top naturally)
  setInterval(() => {
    refreshAllData();
  }, 15000);

  // Setup Vet Form
  document.getElementById('vetForm').addEventListener('submit', handleVetSubmit);

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
          <span style="background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase;">
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
    const res = await fetch('/api/vets');
    const vets = await res.json();
    const grid = document.getElementById('vetsGrid');
    grid.innerHTML = '';

    vets.forEach(v => {
      const card = document.createElement('div');
      card.className = 'glass-panel vet-card';
      card.innerHTML = `
        <div class="vet-level">Level ${v.level_order}</div>
        <h3>${v.name}</h3>
        <p>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          ${v.phone}
        </p>
        <div class="vet-actions">
          <button class="btn btn-ghost" onclick="editVet(${v.id}, '${v.name.replace(/'/g, "\\'")}', '${v.phone}', ${v.level_order})">Edit</button>
          <button class="btn btn-danger" onclick="deleteVet(${v.id})">Remove</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to fetch vets', err);
  }
}

// ─── VET MODAL & CRUD ─────────────────────────────────
function openVetModal() {
  document.getElementById('vetForm').reset();
  document.getElementById('vetId').value = '';
  document.getElementById('modalTitle').innerText = 'Add Veterinarian';
  document.getElementById('vetModalOverlay').classList.add('active');
}

function closeVetModal() {
  document.getElementById('vetModalOverlay').classList.remove('active');
}

function editVet(id, name, phone, level) {
  document.getElementById('vetId').value = id;
  document.getElementById('vetName').value = name;
  document.getElementById('vetPhone').value = phone;
  document.getElementById('vetLevel').value = level;
  document.getElementById('modalTitle').innerText = 'Edit Veterinarian';
  document.getElementById('vetModalOverlay').classList.add('active');
}

async function handleVetSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('vetId').value;
  const data = {
    name: document.getElementById('vetName').value,
    phone: document.getElementById('vetPhone').value,
    level_order: parseInt(document.getElementById('vetLevel').value, 10)
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

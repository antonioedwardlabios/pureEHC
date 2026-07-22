import {
  getFirestore, collection, collectionGroup, getDocs, query, orderBy, where,
  doc, getDoc, updateDoc, addDoc, setDoc, deleteDoc, serverTimestamp, deleteField,
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  getDocFromCache, getDocsFromCache
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";


const firebaseConfig = {
  apiKey: "AIzaSyAqZS99tsZwqtaNAAXxrRWPVVJ8rmcmJvI",
  authDomain: "pureehc-dev.firebaseapp.com",
  projectId: "pureehc-dev",
  storageBucket: "pureehc-dev.firebasestorage.app",
  messagingSenderId: "763739401251",
  appId: "1:763739401251:web:bb6f79c91b38bfadfb9596"
};
const app = initializeApp(firebaseConfig);

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
  });
} catch (err) {
  console.warn('Offline persistence unavailable, falling back to in-memory cache:', err);
  db = getFirestore(app);
}
const auth = getAuth(app);
const gp = new GoogleAuthProvider();
gp.setCustomParameters({ prompt: 'select_account' });
let currentUser = null;
let isAuthorized = false;
let currentRole = '';
let _addFormPatientId = null;
let _addFormVisitId = null;

const ROLES = {
  OWNER:        'owner',
  NURSE:        'nurse',
  RECEPTIONIST: 'receptionist',
};


const isOwner        = () => currentRole === ROLES.OWNER;
const isClinical     = () => [ROLES.OWNER, ROLES.NURSE].includes(currentRole);
const isAnyStaff     = () => Object.values(ROLES).includes(currentRole);
document.getElementById('footerYear').textContent = new Date().getFullYear();
window.calcAgeFromDOB = function(inputId, displayId, errId) {
  const el      = document.getElementById(inputId);
  const display = document.getElementById(displayId);
  const err     = document.getElementById(errId);
  if (!el || !display) return;

  const dob = new Date(el.value + 'T00:00:00');
  if (!el.value || isNaN(dob)) {
    display.textContent = '';
    return;
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  if (age < 0 || age > 120) {
    display.textContent = 'Invalid date of birth';
    display.style.color = 'var(--red)';
    return;
  }
  display.textContent = `Age: ${age} year${age !== 1 ? 's' : ''} old`;
  display.style.color = 'var(--blue)';
  if (err) err.classList.remove('show');
};

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}
const esc = s => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function _isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

async function _downloadAsPDF(el, filenameBase) {
  const target = el.firstElementChild;
  if (!target) { el.innerHTML = ''; return; }

  el.classList.add('printing');
  el.style.cssText = 'display:block; position:fixed; top:0; left:-10000px; z-index:-1; background:#fff;';

  try {
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');

    const widthIn = target.getBoundingClientRect().width / 96;
    const heightIn = widthIn * (canvas.height / canvas.width);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'in', format: [widthIn, heightIn] });
    pdf.addImage(imgData, 'PNG', 0, 0, widthIn, heightIn);
    pdf.save(filenameBase + '.pdf');
  } catch (err) {
    console.error('PDF generation failed:', err);
    showAlert('Could not generate the PDF. Please try again.', 'error');
  } finally {
    el.classList.remove('printing');
    el.style.cssText = '';
    el.innerHTML = '';
  }
}

function _printOrDownload(el, filenameBase) {
  if (_isMobileDevice()) {
    _downloadAsPDF(el, filenameBase);
  } else {
    _printViaNewTab(el);
  }
}

// =============================================================// PRINT HELPER (DESKTOP)
function _printViaNewTab(el) {
  const bodyHtml = el.innerHTML;
  el.classList.remove('printing');
  el.innerHTML = '';

  const styleEl = document.querySelector('style');
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showAlert('Please allow pop-ups for this site, then try printing again.', 'error');
    return;
  }

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      printWin.focus();
      printWin.print();
    } catch (err) {
      console.warn('Print via new tab failed:', err);
    }
  };

  printWin.document.open();
  printWin.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title>'
    + (styleEl ? styleEl.outerHTML : '')
    + '</head><body><div id="' + el.id + '" class="printing">' + bodyHtml + '</div></body></html>');
  printWin.document.close();
  printWin.onload = () => setTimeout(doPrint, 200);
  setTimeout(doPrint, 700);

  try {
    printWin.addEventListener('afterprint', () => printWin.close());
  } catch (err) { }
}

// =============================================================// AUTO-CAPITALIZE

function applyAutoCapitalize(input) {
  input.addEventListener('input', function () {
    const pos = this.selectionStart;
    this.value = this.value.replace(/(^|[\s\-\.])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
    this.setSelectionRange(pos, pos);
  });
}

// =============================================================// OCCUPATION AUTOCOMPLETE LIST
const OCCUPATION_LIST = [
  'Accountant', 'Architect', 'Baker', 'Banker', 'Barista', 'Carpenter', 'Chef',
  'Civil Engineer', 'Clerk', 'Construction Worker', 'Customer Service Representative',
  'Data Analyst', 'Dentist', 'Doctor', 'Driver', 'Electrician', 'Engineer',
  'Farmer', 'Firefighter', 'Fisherman', 'Graphic Designer', 'Security Guard', 'Housewife',
  'IT Specialist', 'Jeepney Driver', 'Laborer', 'Lawyer', 'Mechanic', 'Midwife',
  'Nurse', 'OFW', 'Office Worker', 'Pharmacist', 'Police Officer', 'Professor',
  'Programmer', 'Retired', 'Salesperson', 'Self-employed', 'Social Worker',
  'Software Developer', 'Student', 'Teacher', 'Technician', 'Tricycle Driver',
  'Unemployed', 'Vendor', 'Veterinarian', 'Welder'
];

// =============================================================// ADDRESS AUTOCOMPLETE LIST
const ADDRESS_LIST = [
  'Barangay Aguinaldo, Iloilo City', 'Barangay Bonifacio, Iloilo City',
  'Barangay Concepcion-Montes, Iloilo City', 'Barangay Don Esteban, Iloilo City','Barangay General Hughes, Iloilo City',
  'Barangay Hipodromo, Iloilo City', 'Barangay Jalandoni-Wilson, Iloilo City',
  'Barangay Kahirupan, Iloilo City', 'Barangay Kauswagan, Iloilo City',
  'Barangay Legaspi, Iloilo City', 'Barangay Liberation Road, Iloilo City',
  'Barangay Mabini, Iloilo City', 'Barangay Malipayon-Delgado, Iloilo City',
  'Barangay Maria Clara, Iloilo City', 'Barangay Muelle Loney-Montes, Iloilo City',
  'Barangay Nonoy, Iloilo City', 'Barangay Ortiz, Iloilo City',
  'Barangay Osmeña, Iloilo City', 'Barangay Quezon, Iloilo City',
  'Barangay Rizal, Iloilo City', 'Barangay Roxas Village, Iloilo City',
  'Barangay San Jose, Iloilo City', 'Barangay Santo Niño Norte, Iloilo City',
  'Barangay Santo Niño Sur, Iloilo City', 'Barangay Santo Rosario-Duran, Iloilo City',
  'Barangay Tanza-Esperanza, Iloilo City', 'Barangay Yulo-Arroyo, Iloilo City',
  'Barangay Zamora-Melliza, Iloilo City',
  'Barangay Baybay, Iloilo City', 'Barangay Bonifacio Arevalo, Iloilo City',
  'Barangay Buhang, Iloilo City', 'Barangay Buhang Taft North, Iloilo City',
  'Barangay Buntatala, Iloilo City', 'Barangay Dungon A, Iloilo City',
  'Barangay Dungon B, Iloilo City', 'Barangay Dungon C, Iloilo City',
  'Barangay Javellana, Iloilo City', 'Barangay Leganes, Iloilo City',
  'Barangay Loboc, Iloilo City', 'Barangay Montinola, Iloilo City',
  'Barangay Quintin Salas, Iloilo City', 'Barangay San Isidro, Iloilo City',
  'Barangay Santa Cruz, Iloilo City', 'Barangay Taft South, Iloilo City',
  'Barangay Balantang, Iloilo City', 'Barangay Camalig, Iloilo City',
  'Barangay Cubay North, Iloilo City', 'Barangay Cubay South, Iloilo City',
  'Barangay Democracia, Iloilo City', 'Barangay East Baluarte, Iloilo City',
  'Barangay East Timawa, Iloilo City', 'Barangay Fajardo, Iloilo City',
  'Barangay Flores, Iloilo City', 'Barangay Ingore, Iloilo City',
  'Barangay Inday Jaro, Iloilo City', 'Barangay Jalaud Norte, Iloilo City',
  'Barangay Jalaud Sur, Iloilo City', 'Barangay Lanit, Iloilo City',
  'Barangay Libertad, Iloilo City', 'Barangay Lico, Iloilo City',
  'Barangay Lopez Jaena Norte, Iloilo City', 'Barangay Lopez Jaena Sur, Iloilo City',
  'Barangay Luna, Iloilo City', 'Barangay Macatol, Iloilo City',
  'Barangay Mahipon, Iloilo City', 'Barangay Nabitasan, Iloilo City',
  'Barangay Pale Benedicto Rizal, Iloilo City', 'Barangay Poblacion Jaro, Iloilo City',
  'Barangay Presidente Roxas, Iloilo City', 'Barangay Rizal Jaro, Iloilo City',
  'Barangay San Nicolas, Iloilo City', 'Barangay San Pedro, Iloilo City',
  'Barangay Simon Ledesma, Iloilo City', 'Barangay Tabuc Suba, Iloilo City',
  'Barangay Tanza Jaro, Iloilo City', 'Barangay West Habog-habog, Iloilo City',
  'Barangay West Timawa, Iloilo City',
  'Barangay Bagumbayan Norte, Iloilo City', 'Barangay Bagumbayan Sur, Iloilo City',
  'Barangay Benedicto, Iloilo City', 'Barangay Bolilao, Iloilo City',
  'Barangay Burgos-Mabini, Iloilo City', 'Barangay Delgado-Jalandoni-Bagumbayan, Iloilo City',
  'Barangay Divinagracia, Iloilo City', 'Barangay East Baluarte La Paz, Iloilo City',
  'Barangay Gustilo, Iloilo City', 'Barangay Habog-habog Salvacion, Iloilo City',
  'Barangay Hinactacan, Iloilo City', 'Barangay Iloilo Reclamation Area, Iloilo City',
  'Barangay Jalandoni Estate, Iloilo City', 'Barangay Kauswagan La Paz, Iloilo City',
  'Barangay Lapaz, Iloilo City', 'Barangay Libertad La Paz, Iloilo City',
  'Barangay Magsaysay Village, Iloilo City', 'Barangay Mansaya-Lapuz, Iloilo City',
  'Barangay Maquinaya, Iloilo City', 'Barangay Matico, Iloilo City',
  'Barangay Melliza, Iloilo City', 'Barangay Molo Boulevard, Iloilo City',
  'Barangay Naga-naga, Iloilo City', 'Barangay Poblacion Molo, Iloilo City',
  'Barangay San Juan, Iloilo City', 'Barangay San Nicolas Molo, Iloilo City',
  'Barangay San Pedro Molo, Iloilo City', 'Barangay Santa Filomena, Iloilo City',
  'Barangay Santo Domingo, Iloilo City', 'Barangay Yulo Drive, Iloilo City',
  'Barangay Airport, Iloilo City', 'Barangay Arguelles, Iloilo City',
  'Barangay Arsenal Aduana, Iloilo City', 'Barangay Bakhaw, Iloilo City',
  'Barangay Balabago, Iloilo City', 'Barangay Banuyao, Iloilo City',
  'Barangay Caingin, Iloilo City', 'Barangay Compania, Iloilo City',
  'Barangay Cor-Jesus, Iloilo City', 'Barangay Cuartero, Iloilo City',
  'Barangay Danao, Iloilo City', 'Barangay Dulonan, Iloilo City',
  'Barangay Dungon C Mandurriao, Iloilo City', 'Barangay Guzman, Iloilo City',
  'Barangay Hibao-an Norte, Iloilo City', 'Barangay Hibao-an Sur, Iloilo City',
  'Barangay Komunidad, Iloilo City', 'Barangay Lapuz Norte, Iloilo City',
  'Barangay Lapuz Sur, Iloilo City', 'Barangay Loboc Mandurriao, Iloilo City',
  'Barangay Madrangca, Iloilo City', 'Barangay Magsaysay, Iloilo City',
  'Barangay Navais, Iloilo City', 'Barangay Oñate de Leon, Iloilo City',
  'Barangay Pale Beneficio, Iloilo City', 'Barangay Poblacion Mandurriao, Iloilo City',
  'Barangay San Agustin, Iloilo City', 'Barangay San Jose Mandurriao, Iloilo City',
  'Barangay San Vicente, Iloilo City', 'Barangay Tabucan, Iloilo City',
  'Barangay Tacas, Iloilo City', 'Barangay Ungka, Iloilo City',
  'Barangay Yulo-Arroyo Mandurriao, Iloilo City',
  'Cabatuan, Iloilo', 'Calabazas, Iloilo', 'Dingle, Iloilo',
  'Duenas, Iloilo', 'Dumangas, Iloilo', 'Guimbal, Iloilo',
  'Igbaras, Iloilo', 'Janiuay, Iloilo', 'Lambunao, Iloilo',
  'Leganes, Iloilo', 'Leon, Iloilo', 'Miagao, Iloilo',
  'Mina, Iloilo', 'New Lucena, Iloilo', 'Oton, Iloilo',
  'Passi City, Iloilo', 'Pavia, Iloilo', 'Pototan, Iloilo',
  'San Joaquin, Iloilo', 'San Miguel, Iloilo', 'San Rafael, Iloilo',
  'Santa Barbara, Iloilo', 'Sara, Iloilo', 'Tigbauan, Iloilo',
  'Tubungan, Iloilo', 'Zarraga, Iloilo'
];

// =============================================================// GENERIC AUTOCOMPLETE DROPDOWN BUILDER
function createAutocomplete(inputEl, list) {
  const parent = inputEl.parentNode;
  if (getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }

  const dropdown = document.createElement('ul');
  dropdown.style.cssText = [
    'position:absolute', 'z-index:9999', 'background:#fff',
    'border:1px solid #d1d5db', 'border-radius:8px', 'margin-top:2px',
    'padding:4px 0', 'max-height:200px', 'overflow-y:auto',
    'width:100%', 'box-shadow:0 4px 12px rgba(0,0,0,0.12)',
    'display:none', 'list-style:none', 'margin:0'
  ].join(';');
  parent.appendChild(dropdown);

  let activeIdx = -1;

  inputEl.addEventListener('input', function () {
    const val = this.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    activeIdx = -1;
    if (!val) { dropdown.style.display = 'none'; return; }
    const matches = list.filter(item => item.toLowerCase().includes(val)).slice(0, 8);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    matches.forEach((item, i) => {
      const li = document.createElement('li');
      li.textContent = item;
      li.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:13px;color:#1e293b;';
      li.addEventListener('mouseenter', () => {
        dropdown.querySelectorAll('li').forEach(l => l.style.background = '');
        li.style.background = '#f1f5f9';
        activeIdx = i;
      });
      li.addEventListener('mouseleave', () => { li.style.background = ''; });
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        inputEl.value = item;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(li);
    });
    dropdown.style.display = 'block';
  });

  inputEl.addEventListener('keydown', function (e) {
    const items = dropdown.querySelectorAll('li');
    if (!items.length || dropdown.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      inputEl.value = items[activeIdx].textContent;
      dropdown.style.display = 'none';
    } else if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    items.forEach((l, i) => l.style.background = i === activeIdx ? '#f1f5f9' : '');
  });

  document.addEventListener('click', e => {
    if (!parent.contains(e.target)) dropdown.style.display = 'none';
  });
}

// =============================================================// FORM FIELD ENHANCEMENTS
function initFormEnhancements() {
  ['fFirstName', 'fLastName', 'fAddress', 'fOccupation',
    'eFirstName', 'eLastName', 'eAddress', 'eOccupation',
    'aFirstName', 'aLastName', 'eaFirstName', 'eaLastName'].forEach(id => {
      const el = document.getElementById(id);
      if (el) applyAutoCapitalize(el);
    });
  ['fOccupation', 'eOccupation'].forEach(id => {
    const el = document.getElementById(id);
    if (el) createAutocomplete(el, OCCUPATION_LIST);
  });
  ['fAddress', 'eAddress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) createAutocomplete(el, ADDRESS_LIST);
  });
}

// =============================================================// RATE LIMITING

const _rl = {};
function rateLimit(key, max, winMs) {
  const now = Date.now();
  _rl[key] = (_rl[key] || []).filter(t => now - t < winMs);
  if (_rl[key].length >= max) return false;
  _rl[key].push(now); return true;
}
function showRateBanner(sec = 30) {
  const b = document.getElementById('rateBanner');
  b.style.display = 'block';
  setTimeout(() => b.style.display = 'none', sec * 1000);
}

// =============================================================// PAYLOAD SIZE CHECK
const MAX_BYTES = 50 * 1024;
function sizeOk(data) {
  return new TextEncoder().encode(JSON.stringify(data)).length <= MAX_BYTES;
}
const _audit = [];
let _auditViewDate = null;
function _renderAudit() {
  const container = document.getElementById('auditListItems');

  if (!container) return;

  if (_audit.length === 0) {
    container.innerHTML = `<div style="padding:10px;color:#94a3b8;">No audit logs yet.</div>`;
    return;
  }

  container.innerHTML = _audit.map(entry => {
    const time = new Date(entry.time).toLocaleString();

    return `
      <div class="audit-row">
        <div class="a-dot ${entry.type}"></div>
        <div>
          <div class="a-action">${esc(entry.action)}</div>
          <div class="a-meta">
            ${esc(entry.user)} • ${time}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
// =============================================================// LOAD AUDIT HISTORY 
function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
async function loadAuditHistory(dateStr = null) {
  const targetDate = dateStr || _todayStr();
  const dayStart = new Date(`${targetDate}T00:00:00`);
  const dayEnd = new Date(`${targetDate}T23:59:59.999`);

  const label = document.getElementById('auditDateLabel');
  const resetBtn = document.getElementById('auditResetBtn');
  if (label) label.textContent = dateStr ? `Showing: ${targetDate}` : 'Showing: Today';
  if (resetBtn) resetBtn.style.display = dateStr ? '' : 'none';

  try {
    const snap = await getDocs(
      query(collection(db, 'auditLogs'),
        where('time', '>=', dayStart),
        where('time', '<=', dayEnd),
        orderBy('time', 'desc'))
    );
    _audit.length = 0;
    snap.docs.forEach(s => {
      const d = s.data();
      _audit.push({
        action: d.action,
        type: d.type,
        user: d.user,
        patientId: d.patientId || null,
        time: d.time?.toDate ? d.time.toDate() : new Date(d.time)
      });
    });
    _auditViewDate = dateStr;
    _renderAudit();
  } catch (err) {
    console.warn('Audit history load failed:', err);
  }
}
window.searchAuditByDate = () => {
  const val = document.getElementById('auditDateSearch')?.value;
  if (!val) { showAlert('Pick a date to search first.', 'error'); return; }
  loadAuditHistory(val);
};
window.resetAuditToday = () => {
  const input = document.getElementById('auditDateSearch');
  if (input) input.value = '';
  loadAuditHistory();
};
window.toggleAudit = function () {
  const list = document.getElementById('auditList');
  if (!list) return;
  list.style.display = list.style.display === 'none' ? 'block' : 'none';
};
async function logAudit(action, type = 'add', patientId = null) {
  const entry = {
    action,
    type,
    user: currentUser?.email || 'unknown',
    userId: currentUser?.uid || null,
    time: new Date(),
    patientId
  };
  if (_auditViewDate === null) {
    _audit.unshift(entry);
    if (typeof _renderAudit === 'function') {
      _renderAudit();
    }
  }
  try {
    await addDoc(collection(db, 'auditLogs'), {
      ...entry,
      time: serverTimestamp()
    });
  } catch (err) {
    console.error('AUDIT LOG WRITE FAILED — action was performed but not recorded:', err);
  }
}

// =============================================================// AUTHORIZED EMAILS

const NAME_RE = /^[a-zA-ZÀ-ÿ\s'\-.]{1,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\+\d\s\-()\[\]]{0,20}$/;
const INIT_RE = /^[a-zA-Z]?$/;
const V_GENDER = ['Male', 'Female', 'Other'];
const V_CONSULT = ['General Checkup', 'Follow-up', 'Consultation', 'Emergency', 'Vaccination', 'Medication Refill'];
function validate(d, pfx = '') {
  const errs = [];
  if (!NAME_RE.test(d.firstName)) errs.push({ f: `${pfx}FirstName`, m: 'Invalid first name.' });
  if (!NAME_RE.test(d.lastName)) errs.push({ f: `${pfx}LastName`, m: 'Invalid last name.' });
  if (d.middleInitial && !INIT_RE.test(d.middleInitial)) errs.push({ f: `${pfx}Middle`, m: 'Single letter only.' });
  if (!d.address || d.address.trim() === '') errs.push({ f: `${pfx}Address`, m: 'Address is required.' });
  if (!d.dateOfBirth) errs.push({ f: `${pfx}DOB`, m: 'Date of birth is required.' });
  else if (computeAge(d.dateOfBirth) === null) errs.push({ f: `${pfx}DOB`, m: 'Invalid date of birth.' });
  if (!V_GENDER.includes(d.gender)) errs.push({ f: `${pfx}Gender`, m: 'Select sex.' });
  if (!V_CONSULT.includes(d.consultationType)) errs.push({ f: `${pfx}Consult`, m: 'Select a type.' });
  if (d.description?.length > 1000) errs.push({ f: `${pfx}Desc`, m: 'Max 1,000 chars.' });
  if (d.subjectiveFindings?.length > 3000) errs.push({ f: `${pfx}SubjectiveFindings`, m: 'Max 3,000 chars.' });
  if (d.physicalExam?.length > 3000) errs.push({ f: `${pfx}PhysicalExam`, m: 'Max 3,000 chars.' });
  if (d.diagnosis?.length > 2000) errs.push({ f: `${pfx}Diagnosis`, m: 'Max 2,000 chars.' });
  if (d.therapeuticPlan?.length > 3000) errs.push({ f: `${pfx}TherapeuticPlan`, m: 'Max 3,000 chars.' });
  if (d.email && !EMAIL_RE.test(d.email)) errs.push({ f: `${pfx}Email`, m: 'Invalid email.' });
  if (d.phone && !PHONE_RE.test(d.phone)) errs.push({ f: `${pfx}Phone`, m: 'Invalid phone.' });
  return errs;
}

function clearErrs() {
  document.querySelectorAll('.field-err').forEach(e => e.classList.remove('show'));
  document.querySelectorAll('.field-error').forEach(e => e.classList.remove('field-error'));
}
function showErrs(errs, pfx = '') {
  errs.forEach(({ f, m }) => {
    const err = document.getElementById(`fe-${pfx}${f}`) || document.getElementById(`fe-${f}`);
    const inp = document.getElementById(`${pfx}${f}`) || document.getElementById(f);
    if (inp) inp.classList.add('field-error');
    if (err) { err.textContent = m; err.classList.add('show'); }
  });
}
let _busy = false;
function lockBtn(id, lbl) {
  _busy = true;
  const b = document.getElementById(id);
  if (b) { b.disabled = true; b.innerHTML = `<span class="spin"></span> ${lbl}`; }
}
function unlockBtn(id, lbl) {
  _busy = false;
  const b = document.getElementById(id);
  if (b) { b.disabled = false; b.textContent = lbl; }
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showAlert(msg, type = 'info') {
  document.getElementById('alertMsg').textContent = msg;
  const w = document.getElementById('alertIconWrap');
  w.className = `alert-icon-wrap ${type}`;
  document.getElementById('alertModal').classList.add('open');
}
window.closeAlert = () => document.getElementById('alertModal').classList.remove('open');

// =============================================================// CONFIRM DIALOG
function showConfirm(message, { confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    let modal = document.getElementById('confirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirmModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:380px;text-align:center;padding:28px 24px;">
          <p id="confirmModalMsg" style="font-size:14.5px;color:var(--g800);margin:0 0 20px;line-height:1.5;"></p>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button id="confirmModalCancel" class="btn-row" style="padding:8px 18px;">Cancel</button>
            <button id="confirmModalOk" class="btn-row" style="padding:8px 18px;">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('confirmModalMsg').textContent = message;
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    okBtn.style.background = danger ? 'var(--red, #dc2626)' : '';
    okBtn.style.color = danger ? '#fff' : '';

    const cleanup = (result) => {
      modal.classList.remove('open');
      okBtn.replaceWith(okBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      resolve(result);
    };
    document.getElementById('confirmModalOk').addEventListener('click', () => cleanup(true), { once: true });
    document.getElementById('confirmModalCancel').addEventListener('click', () => cleanup(false), { once: true });
    modal.classList.add('open');
  });
}
window.showConfirm = showConfirm;

window.doLogin = async () => {
  try {
    const result = await signInWithPopup(auth, gp);
  } catch (error) {
    console.error('Login error:', error.code, error.message);
    let msg = 'Login failed. Please try again.';
    if (error.code === 'auth/popup-blocked') {
      msg = 'Popup was blocked by your browser. Please allow popups for this site.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      msg = 'Login popup was closed. Please try again.';
    } else if (error.code === 'auth/cancelled-popup-request') {
      msg = 'Another login is already in progress. Please wait.';
    } else if (error.code === 'auth/network-request-failed') {
      msg = 'Network error. Please check your internet connection.';
    } else if (error.code === 'auth/unauthorized-domain') {
      msg = 'This domain is not authorized for login. Please contact support.';
    }
    showAlert(msg, 'error');
  }
};

window.switchAccount = async () => {
  try {
    await signOut(auth);
    showScreen('screenLogin');
  } catch {
    showAlert('Could not switch accounts. Please try again.', 'error');
  }
};

// =============================================================// AUTH STATE LISTENER

onAuthStateChanged(auth, async user => {
  if (!user) {
    showScreen('screenLogin');
    return;
  }
  try {
    let userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      const inviteEmail = (user.email || '').toLowerCase();
      try {
        const inviteSnap = await getDoc(doc(db, 'staffInvites', inviteEmail));
        if (inviteSnap.exists() && inviteSnap.data().active === true) {
          const invite = inviteSnap.data();
          await setDoc(doc(db, 'users', user.uid), {
            name: invite.name || user.displayName || '',
            email: user.email,
            role: invite.role,
            active: true,
            createdAt: serverTimestamp()
          });
          userDoc = await getDoc(doc(db, 'users', user.uid));
        }
      } catch (provisionErr) {
        console.warn('Self-provisioning skipped:', provisionErr.code || provisionErr);
      }
    }

    if (!userDoc.exists() || userDoc.data().active !== true) {
      showAlert('Access denied. Contact the clinic administrator.', 'error');
      await signOut(auth);
      showScreen('screenLogin');
      return;
    }

    const userData = userDoc.data();
    currentUser = user;
    currentRole = userData.role || ROLES.RECEPTIONIST;
    isAuthorized = true;

// =============================================================// NAVBAR USER CHIP
const adminName = document.getElementById('adminName');
const adminEmail = document.getElementById('adminEmail');
const adminAvatar = document.getElementById('adminAvatar');

if (adminName) adminName.textContent = userData.name || user.displayName || '—';
if (adminEmail) adminEmail.textContent = user.email || '—';
if (adminAvatar) {
  adminAvatar.innerHTML = '';
  if (user.photoURL) {
    const img = document.createElement('img');
    img.src = user.photoURL;
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
    img.alt = '';
    adminAvatar.appendChild(img);
  } else {
    const name = userData.name || user.displayName || '?';
    adminAvatar.textContent = name.charAt(0).toUpperCase();
  }
}
const lastActivity = Number(localStorage.getItem('lastActivity') || 0);
const MAX_IDLE = 15 * 60 * 1000;
if (lastActivity && (Date.now() - lastActivity > MAX_IDLE)) {
    await signOut(auth);
    localStorage.removeItem('lastActivity');
    showAlert(
        'Session expired. Please sign in again.',
        'error'
    );

    return;
}
    applyRoleUI(currentRole);
    await loadClinicSettings();
    _startSessionWatcher();
    if (isOwner()) await loadAuditHistory();
    logAudit(`Login: ${user.email} (${currentRole})`, 'add');
    loadDashboardStats();
    loadPatients();
    loadAppointments();
    renderCalendar();
    setMinDates();
    initFormEnhancements();
    showScreen('dashboard');

  } catch (err) {
    console.error('Auth check failed:', err);
    showAlert('Login error. Please try again.', 'error');
    showScreen('screenLogin');
  }
});

// =============================================================// APPLY ROLE UI

function applyRoleUI(role) {
  document.querySelectorAll('.role-owner-only').forEach(el => {
    el.style.display = role === ROLES.OWNER ? '' : 'none';
  });

  document.querySelectorAll('.role-clinical').forEach(el => {
    el.style.display = [ROLES.OWNER, ROLES.NURSE].includes(role) ? '' : 'none';
  });

  const roleBadge = document.getElementById('currentRoleBadge');
  if (roleBadge) {
    const labels = {
      [ROLES.OWNER]:        'Doctor',
      [ROLES.NURSE]:        'Nurse',
      [ROLES.RECEPTIONIST]: 'Receptionist'
    };
    roleBadge.textContent = labels[role] || role;
    roleBadge.style.display = '';
  }
}


window.doLogout = () => {
    localStorage.removeItem('lastActivity');
    _stopSessionWatcher();
    logAudit('Manual logout', 'edit');
    signOut(auth);
    location.reload();

}

// =============================================================// SESSION TIMEOUT

const SESSION_TIMEOUT_MS  = 15 * 60 * 1000;
const SESSION_WARNING_MS  = 14 * 60 * 1000;
let _sessionTimer  = null;
let _sessionWarned = false;

function _resetSessionTimer() {
  if (!isAuthorized) return;
  updateLastActivity();
  clearTimeout(_sessionTimer);
  _sessionWarned = false;

  _sessionTimer = setTimeout(() => {
    if (!isAuthorized) return;
    _sessionWarned = true;
    showAlert(
      'You will be automatically signed out in 60 seconds due to inactivity. Click OK to stay logged in.',
      'error'
    );
    _sessionTimer = setTimeout(() => {
      if (!isAuthorized) return;
      logAudit('Auto sign-out: session timeout after 15 min inactivity', 'edit');
      showAlert('Session expired. You have been signed out for security.', 'error');
      setTimeout(() => { signOut(auth); location.reload(); }, 2000);
    }, 60 * 1000);
  }, SESSION_WARNING_MS);
}
function updateLastActivity() {
  localStorage.setItem('lastActivity', Date.now().toString());
}

function _startSessionWatcher() {
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach(ev => document.addEventListener(ev, _resetSessionTimer, { passive: true }));
  _resetSessionTimer();
}

function _stopSessionWatcher() {
  clearTimeout(_sessionTimer);
  _sessionWarned = false;
}

// =============================================================// FORM STEP NAVIGATION

window.goToFormStep = (step) => {
  if (step === 2) {
    const required = ['fFirstName', 'fLastName', 'fAddress', 'fDOB', 'fGender', 'fConsult'];
    const errs = [];
    required.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value.trim()) errs.push(id);
    });
    if (errs.length) {
      showAlert('Please complete all required fields in Patient Info before continuing.', 'error');
      errs.forEach(id => {
        const fe = document.getElementById('fe-' + id);
        if (fe) fe.classList.add('show');
      });
      return;
    }
  }

  document.getElementById('formStep1').style.display = step === 1 ? '' : 'none';
  document.getElementById('formStep2').style.display = step === 2 ? '' : 'none';

  const pill1 = document.getElementById('formStepPill1');
  const pill2 = document.getElementById('formStepPill2');
  pill1.classList.toggle('active', step === 1);
  pill1.classList.toggle('complete', step === 2);
  pill2.classList.toggle('active', step === 2);
  pill2.classList.remove('complete');

  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// =============================================================// ADD PATIENT
window.submitAddPatient = async e => {
  e.preventDefault();
  if (!isAuthorized) { doLogout(); return; }
  if (_busy) return;
  if (!rateLimit('add', 10, 60 * 1000)) {
    showRateBanner(30);
    showAlert("Too many submissions. Please slow down.", 'error');
    return;
  }

  clearErrs();

  const dobValue = document.getElementById('fDOB').value;
  const computedAge = computeAge(dobValue);
  const bpData = getBPData('f');
  const data = {
    firstName: document.getElementById('fFirstName').value.trim(),
    lastName: document.getElementById('fLastName').value.trim(),
    middleInitial: document.getElementById('fMiddle').value.trim().toUpperCase(),
    address: document.getElementById('fAddress').value.trim(),
    dateOfBirth: dobValue,
    age: computedAge,
    gender: document.getElementById('fGender').value,
    occupation: document.getElementById('fOccupation').value.trim(),
    civilStatus: document.getElementById('fCivilStatus').value,
    bp: bpData.bp,
    bpStatus: bpData.bpStatus,
    rr: document.getElementById('fRR').value.trim(),
    cr: document.getElementById('fCR').value.trim(),
    temperature: document.getElementById('fTemp').value.trim(),
    o2Sat: document.getElementById('fO2Sat').value.trim(),
    subjectiveFindings: document.getElementById('fSubjective').value.trim(),
    complaintCategory: document.getElementById('fComplaintCategory')?.value || '',
    physicalExam: document.getElementById('fPhysicalExam').value.trim(),
    diagnosis: document.getElementById('fDiagnosis').value.trim(),
    therapeuticPlan: document.getElementById('fTherapeuticPlan').value.trim(),
    allergen: document.getElementById('fAllergen').value.trim(),
    consultationType: document.getElementById('fConsult').value,
    description: document.getElementById('fDesc').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    phone: document.getElementById('fPhone').value.trim(),
    createdAt: serverTimestamp(),
    deleted: false
  };

  const errs = validate(data, 'f');
  if (errs.length) {
    document.getElementById('formStep1').style.display = '';
    document.getElementById('formStep2').style.display = 'none';
    document.getElementById('formStepPill1').classList.add('active');
    document.getElementById('formStepPill1').classList.remove('complete');
    document.getElementById('formStepPill2').classList.remove('active');
    showErrs(errs);
    return;
  }
  if (!sizeOk(data)) { showAlert('Submission too large.', 'error'); return; }
  try {
    const dupSnap = await getDocs(query(
      collection(db, 'patients'),
      where('firstName', '==', data.firstName),
      where('lastName', '==', data.lastName)
    ));
    const otherDocs = dupSnap.docs.filter(d => d.id !== _addFormPatientId);

    if (otherDocs.length) {
      const exactMatch = otherDocs.find(d => {
        const p = d.data();
        return !p.deleted &&
          p.dateOfBirth === data.dateOfBirth && 
          p.address?.toLowerCase().trim() === data.address?.toLowerCase().trim();
      });

      if (exactMatch) {
        showAlert(
          `A patient named "${data.firstName} ${data.lastName}" with the same date of birth and address already exists. Please check existing records before adding.`,
          'error'
        );
        return;
      }

      const sameNameOnly = otherDocs.find(d => !d.data().deleted);
      if (sameNameOnly) {
        const proceed = confirm(
          `A patient named "${data.firstName} ${data.lastName}" already exists.\n\nAre you sure this is a different person?`
        );
        if (!proceed) return;
      }
    }
  } catch (err) {
    console.warn('Duplicate check failed:', err);
  }

  lockBtn('btnAdd', 'Adding…');

  try {
    const profileData = {
      firstName: data.firstName,
      lastName: data.lastName,
      middleInitial: data.middleInitial,
      address: data.address,
      dateOfBirth: data.dateOfBirth, 
      gender: data.gender,
      occupation: data.occupation,
      civilStatus: data.civilStatus,
      allergen: data.allergen,
      description: data.description,
      email: data.email,
      phone: data.phone,
      createdAt: data.createdAt,
      deleted: false
    };
    const medications = collectStructuredRxLines('#addFormRxContainer .rx-line-card');
    const feeAmount = parseFloat(document.getElementById('fFeeAmount')?.value || 0) || 0;
    const feeMethod = document.getElementById('fFeeMethod')?.value || 'Cash';
    const feeStatus = document.getElementById('fFeeStatus')?.value || 'Paid';
    const firstVisit = {
      consultationType: data.consultationType,
      bp: data.bp,
      bpStatus: data.bpStatus,
      rr: data.rr,
      cr: data.cr,
      temperature: data.temperature,
      o2Sat: data.o2Sat,
      subjectiveFindings: data.subjectiveFindings,
      complaintCategory: data.complaintCategory,
      physicalExam: data.physicalExam,
      diagnosis: data.diagnosis,
      therapeuticPlan: data.therapeuticPlan,
      description: data.description,
      visitDate: serverTimestamp(),
      addedBy: currentUser?.email || 'unknown',
      medications: medications,
      hasPrescription: medications.length > 0,
      fee: feeAmount,
      feeMethod,
      feeStatus
    };
    initAddFormRxLines();
    let patientDocId;
    if (_addFormPatientId) {
      patientDocId = _addFormPatientId;
      await updateDoc(doc(db, 'patients', patientDocId), profileData);
    } else {
      const docRef = await addDoc(collection(db, 'patients'), profileData);
      patientDocId = docRef.id;
    }
    if (!_addFormVisitId) {
      await addDoc(collection(db, 'patients', patientDocId, 'visits'), firstVisit);
    } else {
      await setDoc(doc(db, 'patients', patientDocId, 'visits', _addFormVisitId), firstVisit, { merge: true });
    }

    const r = document.getElementById('addResult');
    r.innerHTML = `<span style="color:#059669;font-weight:600;">Patient record added successfully (ID: ${patientDocId})</span>`;
    setTimeout(() => { r.innerHTML = ''; }, 4000);
    document.getElementById('addForm').reset();
    _addFormPatientId = null;
    _addFormVisitId = null;
    const fFeeAmountEl = document.getElementById('fFeeAmount');
    if (fFeeAmountEl) fFeeAmountEl.value = '';
    const fFeeMethodEl = document.getElementById('fFeeMethod');
    if (fFeeMethodEl) fFeeMethodEl.value = 'Cash';
    const fFeeStatusEl = document.getElementById('fFeeStatus');
    if (fFeeStatusEl) fFeeStatusEl.value = 'Paid';
    goToFormStep(1);
    const fBpBadge = document.getElementById('fBP-badge');
    if (fBpBadge) { fBpBadge.className = 'vs-badge empty'; fBpBadge.textContent = ''; }
    ['fRR-badge','fCR-badge','fTemp-badge','fO2Sat-badge'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.className = 'vs-badge empty'; b.textContent = ''; }
    });
    logAudit(`Added: ${esc(data.firstName)} ${esc(data.lastName)}`, 'add', patientDocId);
    clearErrs();
    loadPatients();
    loadDashboardStats(); 
  } catch (err) {
    console.error(err);
    showAlert(err.message || 'Failed to add record. Please try again.', 'error');
  } finally {
    unlockBtn('btnAdd', 'Save Patient Record');
  }
};

// =============================================================// GET BP DATA

function getBPData(prefix) {
  const sysRaw = (document.getElementById(prefix + 'BPSys')?.value || '').trim();
  const diaRaw = (document.getElementById(prefix + 'BPDia')?.value || '').trim();
  if (!sysRaw || !diaRaw) return { bp: '', bpStatus: '' };

  const sys = parseFloat(sysRaw);
  const dia = parseFloat(diaRaw);
  if (isNaN(sys) || isNaN(dia)) return { bp: '', bpStatus: '' };

  let bpStatus;
  if (sys > 180 || dia > 120) bpStatus = 'Hypertensive Crisis';
  else if (sys >= 140 || dia >= 90) bpStatus = 'High Blood Pressure Stage 2';
  else if (sys >= 130 || dia >= 80) bpStatus = 'High Blood Pressure Stage 1';
  else if (sys >= 120 && dia < 80) bpStatus = 'Elevated';
  else bpStatus = 'Normal';

  return { bp: `${sysRaw}/${diaRaw}`, bpStatus };
}

// =============================================================// COLLECT STRUCTURED RX LINES
function collectStructuredRxLines(cardSelector) {
  const medications = [];
  document.querySelectorAll(cardSelector).forEach((card, i) => {
    const drug = card.querySelector('.rx-drug-name')?.value.trim();
    if (!drug) return;
    const dosage = card.querySelector('.rx-dosage')?.value.trim() || '';
    const frequency = card.querySelector('.rx-frequency')?.value.trim() || '';
    const duration = card.querySelector('.rx-duration')?.value.trim() || '';
    const instructions = card.querySelector('.rx-instructions')?.value.trim() || '';

    const sigParts = [dosage, frequency, duration ? `for ${duration}` : '', instructions].filter(Boolean);
    const sig = sigParts.join(' — ');

    medications.push({ num: i + 1, drug, dosage, frequency, duration, instructions, sig });
  });
  return medications;
}

function bClass(t) {
  if (!t) return 'badge-default';
  const l = t.toLowerCase();
  if (l.includes('general') || l.includes('checkup')) return 'badge-general';
  if (l.includes('follow')) return 'badge-followup';
  if (l.includes('consultation')) return 'badge-consultation';
  if (l.includes('emergency')) return 'badge-emergency';
  if (l.includes('vaccination')) return 'badge-vaccination';
  if (l.includes('refill') || l.includes('medication')) return 'badge-refill';
  return 'badge-default';
}

// =============================================================// PAGINATION HELPER
function renderPagination(container, totalItems, currentPage, pageSize, onPageChange) {
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems === 0) { container.innerHTML = ''; return; }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sortedPages = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  let btnsHtml = '';
  let prevPage = 0;
  sortedPages.forEach(p => {
    if (prevPage && p - prevPage > 1) {
      btnsHtml += `<span class="page-ellipsis">…</span>`;
    }
    btnsHtml += `<button type="button" class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
    prevPage = p;
  });

  container.innerHTML = `
    <div class="pagination-info">Showing ${startItem}–${endItem} of ${totalItems}</div>
    <div class="pagination-controls">
      <button type="button" class="page-btn page-btn-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
      ${btnsHtml}
      <button type="button" class="page-btn page-btn-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    </div>`;

  container.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages && p !== currentPage) onPageChange(p);
    });
  });
}

// =============================================================// LOAD PATIENTS
const PATIENTS_PER_PAGE = 10;
let _patientPage = 1;

window.loadPatients = async (resetPage = true) => {
  if (resetPage) _patientPage = 1;
  const tbody = document.getElementById('patientTbody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:#94a3b8;font-size:13px;">Loading…</td></tr>`;

  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const sortOpt = document.getElementById('sortSelect').value;
  const showArch = document.getElementById('showArchivedChk').checked;

  let q;
  if (sortOpt === 'name') q = query(collection(db, 'patients'), orderBy('lastName'));
  else if (sortOpt === 'age') q = query(collection(db, 'patients'), orderBy('dateOfBirth', 'desc'));
  else q = query(collection(db, 'patients'), orderBy('createdAt', 'desc'));

  try {
    const snap = await getDocs(q);
    const matched = [];
    snap.forEach(s => {
      const d = s.data();
      if (showArch && !d.deleted) return;  
      if (!showArch && d.deleted) return;  

      const name = isAuthorized ?
        `${d.firstName || ''} ${d.middleInitial ? d.middleInitial + '. ' : ''}${d.lastName || ''}`.trim() :
        'Unknown Patient';
      const occupation = isAuthorized ? (d.occupation || '—') : '—';

      if (search && !name.toLowerCase().includes(search) && !occupation.toLowerCase().includes(search)) return;

      matched.push({ id: s.id, d, name, occupation });
    });
    const totalPages = Math.max(1, Math.ceil(matched.length / PATIENTS_PER_PAGE));
    _patientPage = Math.min(Math.max(1, _patientPage), totalPages);
    const startIdx = (_patientPage - 1) * PATIENTS_PER_PAGE;
    const pageItems = matched.slice(startIdx, startIdx + PATIENTS_PER_PAGE);

    tbody.innerHTML = '';

    pageItems.forEach(({ id, d, name, occupation }) => {
      const ageSex = isAuthorized
        ? `${d.dateOfBirth ? computeAge(d.dateOfBirth) : (d.age || '—')}/${d.gender || '—'}`
        : '—/—';
      const civilStatus = isAuthorized ? (d.civilStatus || '—') : '—';
      const date = isAuthorized && d.createdAt ?
        new Date(d.createdAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

      const row = document.createElement('tr');
      if (d.deleted) row.classList.add('row-archived');

      const mk = (txt, cls) => {
        const t = document.createElement('td');
        if (cls) t.className = cls;
        t.textContent = txt;
        return t;
      };

      const actTd = document.createElement('td');
      const acts = document.createElement('div');
      acts.className = 'row-actions';

      if (!d.deleted && isAuthorized) {
        if (isClinical()) {
          const hb = document.createElement('button');
          hb.className = 'btn-row btn-history role-clinical';
          hb.textContent = 'Profile';
          const fullName = `${d.firstName || ''} ${d.middleInitial ? d.middleInitial + '. ' : ''}${d.lastName || ''}`.trim();
          hb.onclick = () => openPatientProfile(id, fullName);
          acts.appendChild(hb);
        }
      }

      if (isOwner()) {
        const ab = document.createElement('button');
        if (d.deleted) {
          ab.className = 'btn-row btn-restore role-owner-only';
          ab.textContent = 'Restore';
          ab.onclick = () => restorePatient(id);
        } else {
          ab.className = 'btn-row btn-archive role-owner-only';
          ab.textContent = 'Archive';
          ab.onclick = () => archivePatient(id);
        }
        acts.appendChild(ab);
      }
      actTd.appendChild(acts);

      row.appendChild(mk(date, 'td-date'));
      row.appendChild(mk(name, 'td-name'));
      row.appendChild(mk(ageSex));
      row.appendChild(mk(occupation));
      row.appendChild(mk(civilStatus));
      row.appendChild(actTd);

      // Row click/tap opens the Patient Profile (desktop click + mobile tap).
      // Action buttons (Profile/Archive/Restore) inside .row-actions are excluded
      // so they keep working independently of the row click.
      if (!d.deleted && isAuthorized && isClinical()) {
        row.classList.add('patient-row-clickable');
        row.addEventListener('click', (e) => {
          if (e.target.closest('.row-actions')) return;
          openPatientProfile(id, name);
        });
      }

      tbody.appendChild(row);
    });

    if (!matched.length) {
      const er = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg><p>${search ? 'No patients match your search.' : 'No records found.'}</p></div>`;
      er.appendChild(td);
      tbody.appendChild(er);
    }

    renderPagination(
      document.getElementById('patientPagination'),
      matched.length, _patientPage, PATIENTS_PER_PAGE,
      (newPage) => { _patientPage = newPage; loadPatients(false); }
    );
  } catch (err) {
    if (err.code === 'permission-denied') {
      showAlert('Access denied. You are not authorized to view records.', 'error');
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:32px;font-size:13px;font-weight:600;">Access Denied</td></tr>`;
    } else {
      showAlert('Failed to load records. Please try again.', 'error');
    }
  }
};

// =============================================================// OPEN EDIT MODAL
window.openEdit = async id => {
  if (!isAuthorized) { doLogout(); return; }
  if (!rateLimit('editOpen', 20, 60 * 1000)) { showRateBanner(15); return; }

  try {
    const snap = await getDoc(doc(db, 'patients', id));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById('eDocId').value = id;
      document.getElementById('eFirstName').value = d.firstName || '';
      document.getElementById('eLastName').value = d.lastName || '';
      document.getElementById('eMiddleName').value = d.middleInitial || '';
      document.getElementById('eAddress').value = d.address || '';
      document.getElementById('eDOB').value = d.dateOfBirth || '';
      if (d.dateOfBirth) calcAgeFromDOB('eDOB', 'eAgeDisplay', 'fe-eDOB');
      document.getElementById('eGender').value = d.gender || 'Male';
      document.getElementById('eOccupation').value = d.occupation || '';
      document.getElementById('eCivilStatus').value = d.civilStatus || '';
      document.getElementById('eAllergen').value = d.allergen || '';
      document.getElementById('eDesc').value = d.description || '';
      document.getElementById('eEmail').value = d.email || '';
      document.getElementById('ePhone').value = d.phone || '';
      clearErrs();
      document.getElementById('editModal').classList.add('open');
    }
    } catch (err) {
  console.error('openEdit error:', err);
  showAlert('Failed to load patient data: ' + err.message, 'error');
  }
};

window.closeEditModal = () => document.getElementById('editModal').classList.remove('open');

// =============================================================// SUBMIT EDIT
window.submitEdit = async e => {
  e.preventDefault();
  if (!isAuthorized) { doLogout(); return; }
  if (_busy) return;
  if (!rateLimit('update', 15, 60 * 1000)) {
    showRateBanner(20);
    showAlert('Too many updates. Please wait.', 'error');
    return;
  }

  clearErrs();
  const id = document.getElementById('eDocId').value;
  const eDobVal = document.getElementById('eDOB').value;
  const data = {
    firstName: document.getElementById('eFirstName').value.trim(),
    lastName: document.getElementById('eLastName').value.trim(),
    middleInitial: document.getElementById('eMiddleName').value.trim().toUpperCase(),
    address: document.getElementById('eAddress').value.trim(),
    dateOfBirth: eDobVal,
    gender: document.getElementById('eGender').value,
    occupation: document.getElementById('eOccupation').value.trim(),
    civilStatus: document.getElementById('eCivilStatus').value,
    allergen: document.getElementById('eAllergen').value,
    description: document.getElementById('eDesc').value.trim(),
    email: document.getElementById('eEmail').value.trim(),
    phone: document.getElementById('ePhone').value.trim()
  }; 

  const errs = [];
  if (!data.firstName || !/^[a-zA-ZÀ-ÿ\s'\-.]{1,50}$/.test(data.firstName))
    errs.push({ f: 'eFirstName', m: 'Invalid first name.' });
  if (!data.lastName || !/^[a-zA-ZÀ-ÿ\s'\-.]{1,50}$/.test(data.lastName))
    errs.push({ f: 'eLastName', m: 'Invalid last name.' });
  if (!data.address)
    errs.push({ f: 'eAddress', m: 'Address is required.' });
  if (!data.dateOfBirth || computeAge(data.dateOfBirth) === null)
    errs.push({ f: 'eDOB', m: 'Valid date of birth is required.' });
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email))
    errs.push({ f: 'eEmail', m: 'Invalid email.' });
  if (data.phone && !/^[\+\d\s\-()\[\]]{0,20}$/.test(data.phone))
    errs.push({ f: 'ePhone', m: 'Invalid phone.' });
  if (errs.length) { showErrs(errs); return; }
  if (!sizeOk(data)) { showAlert('Submission too large.', 'error'); return; }
  lockBtn('btnSave', 'Saving…');
  try {
    await updateDoc(doc(db, 'patients', id), { ...data, age: deleteField() });
    logAudit(`Edited: ${esc(data.firstName)} ${esc(data.lastName)}`, 'edit',id);
    showAlert('Record updated successfully.');
    closeEditModal();
    loadPatients();
  } catch {
    showAlert('Failed to update. Please try again.', 'error');
  } finally {
    unlockBtn('btnSave', 'Save Changes');
  }
};

// =============================================================// ARCHIVE PATIENT
window.archivePatient = async id => {
  if (!isOwner()) {
  showAlert('Only the doctor can archive records.', 'error');
  return;
}
  if (!isAuthorized) { doLogout(); return; }
  if (!rateLimit('archive', 10, 60 * 1000)) { showRateBanner(20); showAlert('Too many actions.', 'error'); return; }
  if (!(await showConfirm('Archive this patient record? You can restore it later.', { confirmText: 'Archive', danger: true }))) return;

  try {
    await updateDoc(doc(db, 'patients', id), {
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    });
    logAudit(`Archived record …${id.slice(-6)}`, 'delete',id);
    loadPatients();
    loadDashboardStats();
  } catch {
    showAlert('Failed to archive. Please try again.', 'error');
  }
};

// =============================================================// RESTORE PATIENT
window.restorePatient = async id => {
  if (!isAuthorized) { doLogout(); return; }
  if (!(await showConfirm('Restore this patient record?', { confirmText: 'Restore' }))) return;

  try {
    await updateDoc(doc(db, 'patients', id), {
      deleted: false,
      deletedAt: null,
      deletedBy: null
    });
    logAudit(`Restored record …${id.slice(-6)}`, 'restore',id);
    loadPatients();
  } catch {
    showAlert('Failed to restore. Please try again.', 'error');
  }
};
const _exportSelectedPatients = new Set();
let _todayExportPatients = [];  
let _todayApptPatients = []; 
async function _fetchTodayPatients() {
  const today = new Date().toISOString().split('T')[0];
  const seen = new Set();
  const results = [];
  try {
    const apptSnap = await getDocs(
      query(collection(db, 'appointments'),
        where('date', '==', today),
        where('deleted', '==', false))
    );
    apptSnap.forEach(s => {
      const d = s.data();
      const id = d.patientId || null;
      const key = id || `${(d.patientFirstName||'').toLowerCase()}_${(d.patientLastName||'').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: id,
          patientId: id,
          firstName: d.patientFirstName || '',
          lastName: d.patientLastName || '',
          middleInitial: d.patientMiddleInitial || '',
          source: 'appointment',
          key
        });
      }
    });
  } catch (err) {
    console.warn('Appointment fetch failed:', err);
  }


  try {
    const patSnap = await getDocs(
      query(collection(db, 'patients'),
        where('deleted', '==', false),
        orderBy('createdAt', 'desc'))
    );
    patSnap.forEach(s => {
      const d = s.data();
      if (!d.createdAt) return;
      const createdDate = d.createdAt.toDate
        ? d.createdAt.toDate().toISOString().split('T')[0]
        : new Date(d.createdAt).toISOString().split('T')[0];
      if (createdDate !== today) return;
      const key = s.id;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: s.id,
          patientId: s.id,
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          middleInitial: d.middleInitial || '',
          age: d.dateOfBirth ? computeAge(d.dateOfBirth) : (d.age || null),
          gender: d.gender,
          address: d.address,
          source: 'new',
          key
        });
      }
    });
  } catch (err) {
    console.warn('New patients fetch failed:', err);
  }

  try {
    const auditSnap = await getDocs(
      query(collection(db, 'auditLogs'),
        where('type', '==', 'add'),
        orderBy('time', 'desc'))
    );
    const visitPatientIds = [];
    auditSnap.forEach(s => {
      const d = s.data();
      if (!d.action?.startsWith('Visit added:')) return;
      if (!d.patientId) return;
      const logDate = d.time?.toDate
        ? d.time.toDate().toISOString().split('T')[0]
        : new Date(d.time).toISOString().split('T')[0];
      if (logDate === today && !seen.has(d.patientId)) {
        visitPatientIds.push(d.patientId);
        seen.add(d.patientId);
      }
    });
    for (const pid of visitPatientIds) {
      try {
        const pSnap = await getDoc(doc(db, 'patients', pid));
        if (!pSnap.exists()) continue;
        const d = pSnap.data();
        if (d.deleted) continue;
        results.push({
          id: pid,
          patientId: pid,
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          middleInitial: d.middleInitial || '',
          age: d.dateOfBirth ? computeAge(d.dateOfBirth) : (d.age || null),
          gender: d.gender,
          address: d.address,
          source: 'visit',
          key: pid
        });
      } catch { continue; }
    }
  } catch (err) {
    console.warn('Visit patients fetch failed:', err);
  }

  return results;
}
function _renderExportList(patients) {
  const box = document.getElementById('exportPickerList');
  const label = document.getElementById('exportStatusLabel');

  if (!patients || patients.length === 0) {
    box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">No patients scheduled for today.</p>';
    return;
  }

  box.innerHTML = patients.map(p => {
    const name = `${p.firstName||''} ${p.middleInitial ? p.middleInitial+'. ' : ''}${p.lastName||''}`.trim();
    const id = p.id || p.patientId || p.key;
    const checked = _exportSelectedPatients.has(id);
    return `
      <div id="epickrow_${id}" class="export-pick-row"
        style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:11px 14px;border-bottom:1px solid var(--g100);transition:background .1s;${checked?'background:var(--blue-pale)':''}"
        onclick="toggleExportPatient('${id}')">
        <input type="checkbox" id="epick_${id}" ${checked ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--blue);flex-shrink:0;cursor:pointer"
          onclick="event.stopPropagation();toggleExportPatient('${id}')">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:600;color:var(--g800)">${esc(name)}</div>
          <div style="font-size:11.5px;color:var(--g400);font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${p.age||'—'}/${p.gender||'—'} · ${p.address ? esc(p.address).slice(0,40)+'…' : '—'}
            ${p.source === 'new'
              ? '<span style="background:#f0fdf4;color:#166534;font-size:10px;padding:1px 6px;border-radius:10px;font-family:Inter,sans-serif;font-weight:600">New Patient</span>'
              : p.source === 'visit'
              ? '<span style="background:#eef4ff;color:#1748b8;font-size:10px;padding:1px 6px;border-radius:10px;font-family:Inter,sans-serif;font-weight:600">Had Visit</span>'
              : p.source === 'appointment'
              ? '<span style="background:#fff7ed;color:#c2410c;font-size:10px;padding:1px 6px;border-radius:10px;font-family:Inter,sans-serif;font-weight:600">Appointment</span>'
              : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}
window.doExport = async () => {
  if (!isAuthorized) { doLogout(); return; }
  _exportSelectedPatients.clear();
  document.getElementById('exportPickerSearch').value = '';
  _updateExportBtn();
  document.getElementById('exportPickerModal').classList.add('open');

  const label = document.getElementById('exportStatusLabel');
  if (label) label.textContent = "Showing Today's Patients";

  document.getElementById('exportPickerList').innerHTML =
    '<p style="color:var(--g400);font-size:13px;padding:8px 10px">Loading today\'s patients…</p>';

  _todayExportPatients = await _fetchTodayPatients();

const enriched = [];
  for (const p of _todayExportPatients) {
    if (p.patientId) {
      try {
        const snap = await getDoc(doc(db, 'patients', p.patientId));
        if (snap.exists()) {
          enriched.push({ id: snap.id, ...snap.data() });
          continue;
        }
      } catch { }
    }
    try {
      const matchSnap = await getDocs(query(
        collection(db, 'patients'),
        where('firstName', '==', p.firstName),
        where('lastName', '==', p.lastName)
      ));
      const match = matchSnap.docs.find(d => !d.data().deleted);
      if (match) {
        enriched.push({ id: match.id, ...match.data() });
      }
    } catch {
    }
  }

  _todayExportPatients = enriched;
  _renderExportList(_todayExportPatients);
};

window.closeExportPickerModal = () => {
  document.getElementById('exportPickerModal').classList.remove('open');
  _exportSelectedPatients.clear();
};

function _updateExportBtn() {
  const btn = document.getElementById('btnDoExportPDF');
  if (!btn) return;
  const count = _exportSelectedPatients.size;
  btn.textContent = count > 0 ? `Export PDF (${count} patient${count > 1 ? 's' : ''})` : 'Export PDF';
  btn.disabled = count === 0;
  btn.style.opacity = count === 0 ? '.4' : '1';
  btn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
  const countEl = document.getElementById('exportSelectedCount');
  if (countEl) {
    countEl.textContent = `Selected: ${count} patient${count !== 1 ? 's' : ''}`;
  }
}

window.toggleExportPatient = (id) => {
  if (_exportSelectedPatients.has(id)) {
    _exportSelectedPatients.delete(id);
  } else {
    _exportSelectedPatients.add(id);
  }
  const cb = document.getElementById(`epick_${id}`);
  if (cb) cb.checked = _exportSelectedPatients.has(id);
  const row = document.getElementById(`epickrow_${id}`);
  if (row) row.style.background = _exportSelectedPatients.has(id) ? 'var(--blue-pale)' : '';
  _updateExportBtn();
};

window.searchExportPatient = async () => {
  const raw = document.getElementById('exportPickerSearch').value.trim();
  const box = document.getElementById('exportPickerList');
  const label = document.getElementById('exportStatusLabel');

  if (raw.length === 0) {
    if (label) label.textContent = "Showing Today's Patients";
    _renderExportList(_todayExportPatients);
    return;
  }

  if (raw.length < 2) return;

  if (label) label.textContent = 'Search Results';

  const term = raw.toLowerCase();
  const cached = _todayExportPatients.filter(p => {
    const full = `${(p.firstName||p.first||'').toLowerCase()} ${(p.lastName||p.last||'').toLowerCase()}`;
    const rev  = `${(p.lastName||p.last||'').toLowerCase()} ${(p.firstName||p.first||'').toLowerCase()}`;
    return full.includes(term) || rev.includes(term);
  });

  if (cached.length > 0) {
    _renderExportList(cached);
    return;
  }

  box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">Searching all patients…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'patients'), orderBy('lastName')));
    const matches = [];
    snap.forEach(s => {
      const d = s.data();
      if (d.deleted) return;
      const full = `${(d.firstName||'').toLowerCase()} ${(d.lastName||'').toLowerCase()}`;
      const rev  = `${(d.lastName||'').toLowerCase()} ${(d.firstName||'').toLowerCase()}`;
      if (full.includes(term) || rev.includes(term))
        matches.push({ id: s.id, ...d });
    });
    if (!matches.length) {
      box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">No patients found.</p>';
      return;
    }
    _renderExportList(matches.slice(0, 15));
  } catch {
    box.innerHTML = '<p style="color:var(--red);font-size:13px;padding:8px 10px">Search failed. Please try again.</p>';
  }
};

window.toggleSelectAllExport = (checked) => {
  document.querySelectorAll('#exportPickerList .export-pick-row').forEach(row => {
    const id = row.id.replace('epickrow_', '');
    if (checked && !_exportSelectedPatients.has(id)) toggleExportPatient(id);
    if (!checked && _exportSelectedPatients.has(id)) toggleExportPatient(id);
  });
};

window.clearExportSelection = () => {
  _exportSelectedPatients.clear();
  document.querySelectorAll('#exportPickerList .export-pick-row').forEach(row => {
    const id = row.id.replace('epickrow_', '');
    const cb = document.getElementById(`epick_${id}`);
    if (cb) cb.checked = false;
    row.style.background = '';
  });
  const selectAll = document.getElementById('exportSelectAll');
  if (selectAll) selectAll.checked = false;
  _updateExportBtn();
};
window.generatePatientPDF = async () => {
  if (_exportSelectedPatients.size === 0) return;
  const selectedIds = [..._exportSelectedPatients];
  closeExportPickerModal();
  showAlert('Generating PDF… please wait.', 'info');

  const now = new Date();
  const dateGenerated = now.toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });
  const timeGenerated = now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
  const isoDate = now.toISOString().slice(0,10);
  const generatedBy = currentUser?.displayName || currentUser?.email || 'unknown';
  const ACCENT = '#0b3d66'; 

  const infoRow = (label, value) =>
    `<div class="emr-info-row"><span class="emr-info-label">${esc(label)}</span><span class="emr-info-value">${esc(value || '—')}</span></div>`;

  try {
    let allPagesHtml = '';
    let firstPatientName = '';

    for (const patientId of selectedIds) {
      const pSnap = await getDoc(doc(db, 'patients', patientId));
      if (!pSnap.exists()) continue;
      const p = pSnap.data();
      const fullName = `${p.firstName||''} ${p.middleInitial ? p.middleInitial+'. ' : ''}${p.lastName||''}`.trim();
      if (!firstPatientName) firstPatientName = fullName;

      const vSnap = await getDocs(
        query(collection(db,'patients',patientId,'visits'), orderBy('visitDate','desc'))
      );

      const visitsHtml = vSnap.empty
        ? '<p style="font-size:10.5px;font-style:italic;color:#555;margin:6px 0">No visit history recorded.</p>'
        : vSnap.docs.map((s, i) => {
            const v = s.data();
            const visitNum = vSnap.docs.length - i;
            const vDate = v.visitDate
              ? new Date(v.visitDate.toDate()).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})
              : '—';

            const vitalsRows = [
              v.bp ? `<tr><td>BP</td><td>${esc(v.bp)} mmHg${v.bpStatus?' ('+esc(v.bpStatus)+')':''}</td></tr>` : '',
              v.rr ? `<tr><td>RR</td><td>${esc(v.rr)}</td></tr>` : '',
              v.cr ? `<tr><td>HR</td><td>${esc(v.cr)}</td></tr>` : '',
              v.temperature ? `<tr><td>Temperature</td><td>${esc(v.temperature)}</td></tr>` : '',
              v.o2Sat ? `<tr><td>O2 Sat</td><td>${esc(v.o2Sat)}</td></tr>` : ''
            ].filter(Boolean).join('');
            const vitalsHtml = vitalsRows
              ? `<div class="emr-sub-title">Vital Signs</div><table class="emr-vitals-table">${vitalsRows}</table>`
              : '';

            const rxHtml = v.medications?.length
              ? `<div class="emr-sub-title">Prescription</div><ol class="emr-rx-list">${
                  v.medications.map(m => `<li><div>${esc(m.drug||'')}</div>${m.sig?`<div class="emr-rx-sig">Sig: ${esc(m.sig)}</div>`:''}</li>`).join('')
                }</ol>`
              : `<div class="emr-sub-title">Prescription</div><div class="emr-body-text" style="font-style:italic;color:#555">No prescription issued.</div>`;

            return `
              <div class="emr-visit">
                <div class="emr-visit-head"><span>VISIT ${visitNum}</span><span>${vDate}</span></div>
                <div class="emr-visit-meta">Attending Physician: ${esc(v.addedBy || generatedBy)}${v.consultationType?' &nbsp;|&nbsp; Type: '+esc(v.consultationType):''}</div>
                ${v.subjectiveFindings?`<div class="emr-sub-title">Chief Complaint</div><div class="emr-body-text">${esc(v.subjectiveFindings)}</div>`:''}
                ${vitalsHtml}
                ${v.diagnosis?`<div class="emr-sub-title">Diagnosis</div><div class="emr-body-text">${esc(v.diagnosis)}</div>`:''}
                ${v.therapeuticPlan?`<div class="emr-sub-title">Therapeutic Plan</div><div class="emr-body-text">${esc(v.therapeuticPlan)}</div>`:''}
                ${rxHtml}
              </div>`;
          }).join('');

      const allergyHtml = p.allergen
        ? `<div class="emr-allergy-warn">Known Allergies<br>${esc(p.allergen)}</div>`
        : `<div class="emr-info-row"><span class="emr-info-label">Allergies</span><span class="emr-info-value">None</span></div>`;

      allPagesHtml += `
        <div class="emr-page">
          <div class="emr-header">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div class="emr-logo">pure<br>EHC</div>
              <div>
                <div class="emr-clinic-name">${esc(RX_CONFIG.clinicName)}</div>
                <div class="emr-doc-type">Electronic Health Record</div>
                <div class="emr-clinic-sub">${esc(RX_CONFIG.address)}</div>
                <div class="emr-clinic-sub">${[RX_CONFIG.contactNumber, RX_CONFIG.email].filter(Boolean).map(esc).join(' · ')}</div>
              </div>
            </div>
            <div class="emr-meta">
              <div>Date Generated: ${dateGenerated}</div>
              <div>Time Generated: ${timeGenerated}</div>
              <div>Generated By: ${esc(generatedBy)}</div>
            </div>
          </div>

          <div class="emr-section-title">Patient Information</div>
          <div class="emr-info-grid">
            ${infoRow('Patient ID', p.patientCode)}
            ${infoRow('Full Name', fullName)}
            ${infoRow('Sex', p.gender)}
            ${infoRow('Age', p.age != null ? String(p.age) : computeAge(p.dateOfBirth))}
            ${infoRow('Date of Birth', p.dateOfBirth)}
            ${infoRow('Civil Status', p.civilStatus)}
            ${infoRow('Contact Number', p.phone)}
            ${infoRow('Address', p.address)}
          </div>
          ${allergyHtml}

          <div class="emr-section-title">Visit History (${vSnap.size} visit${vSnap.size!==1?'s':''}, newest first)</div>
          ${visitsHtml}

          <div class="emr-footer">
            <span>CONFIDENTIAL MEDICAL RECORD</span>
            <span>Generated by pureEHC</span>
          </div>
        </div>`;
    }

    const safeName = (firstPatientName || 'Patient').trim().replace(/\s+/g, '_');
    const fileTitle = selectedIds.length === 1
      ? `pureEHC_PatientRecord_${safeName}_${isoDate}`
      : `pureEHC_PatientRecords_${selectedIds.length}patients_${isoDate}`;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fileTitle}</title>
      <style>
        @page { size: A4; margin: 16mm 16mm 20mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:10.5px; margin:0; }
        .emr-page { page-break-after: always; padding-bottom: 26px; }
        .emr-page:last-child { page-break-after: auto; }
        .emr-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.5px solid #000; padding-bottom:8px; margin-bottom:12px; }
        .emr-logo { width:38px; height:38px; border:1.5px solid ${ACCENT}; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:8.5px; font-weight:700; color:${ACCENT}; line-height:1.15; text-align:center; flex-shrink:0; }
        .emr-clinic-name { font-size:14px; font-weight:700; }
        .emr-doc-type { font-size:9.5px; font-weight:700; color:${ACCENT}; text-transform:uppercase; letter-spacing:.4px; }
        .emr-clinic-sub { font-size:9px; color:#333; }
        .emr-meta { text-align:right; font-size:9px; color:#333; line-height:1.5; }
        .emr-section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid #000; padding-bottom:3px; margin:14px 0 6px; color:${ACCENT}; }
        .emr-info-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:20px; }
        .emr-info-row { display:flex; border-bottom:1px dotted #ccc; padding:2.5px 0; }
        .emr-info-label { font-weight:700; width:120px; flex-shrink:0; }
        .emr-info-value { flex:1; word-break:break-word; }
        .emr-allergy-warn { border:1.3px solid #b91c1c; padding:5px 8px; font-size:10.5px; font-weight:700; color:#b91c1c; margin:8px 0 2px; }
        .emr-visit { border-top:1px solid #000; padding:8px 0; page-break-inside:avoid; }
        .emr-visit-head { display:flex; justify-content:space-between; font-size:11px; font-weight:700; margin-bottom:3px; }
        .emr-visit-meta { font-size:9px; color:#333; margin-bottom:6px; }
        .emr-sub-title { font-size:9px; font-weight:700; text-transform:uppercase; margin:6px 0 2px; }
        .emr-body-text { font-size:10.5px; white-space:pre-wrap; word-break:break-word; margin-bottom:2px; }
        .emr-vitals-table { border-collapse:collapse; font-size:9.5px; margin:2px 0 4px; }
        .emr-vitals-table td { border:1px solid #999; padding:2px 6px; }
        .emr-rx-list { margin:2px 0 4px; padding-left:16px; }
        .emr-rx-list li { margin-bottom:4px; }
        .emr-rx-sig { color:#333; font-size:9.5px; }
        .emr-footer { margin-top:14px; padding-top:4px; border-top:1px solid #000; font-size:8.5px; color:#333; display:flex; justify-content:space-between; }
        @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
      </style>
      </head><body>${allPagesHtml}</body></html>`);
    win.onload = () => { win.focus(); win.print(); };
    win.document.close();
    setTimeout(() => { if (!win.closed) { win.focus(); win.print(); } }, 1000);
    logAudit(`Exported PDF for ${selectedIds.length} patient(s)`, 'edit');
  } catch (err) {
    showAlert('Failed to generate PDF: ' + err.message, 'error');
  }
};

// =============================================================// PATIENT SEARCH (Return Visit)
window.searchExistingPatient = async () => {
  const raw = document.getElementById('patientSearchInput').value.trim();
  const resultsBox = document.getElementById('patientSearchResults');
  if (!raw || raw.length < 2) {
    resultsBox.innerHTML = '';
    resultsBox.style.display = 'none';
    return;
  }

  const term = raw.toLowerCase();
  resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--g400)">Searching…</div>';
  resultsBox.style.display = 'block';

  try {
    const snap = await getDocs(query(collection(db, 'patients'), orderBy('lastName')));
    const matches = [];
    snap.forEach(s => {
      const d = s.data();
      if (d.deleted) return;
      const full = `${(d.firstName || '').toLowerCase()} ${(d.lastName || '').toLowerCase()}`;
      const rev = `${(d.lastName || '').toLowerCase()} ${(d.firstName || '').toLowerCase()}`;
      if (full.includes(term) || rev.includes(term)) {
        matches.push({ id: s.id, ...d });
      }
    });

    if (!matches.length) {
      resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--g400)">No existing patient found. Fill the form below to register as new.</div>';
      return;
    }

    resultsBox.innerHTML = matches.slice(0, 6).map(p => `
        <div class="search-result-row" onclick="selectPatientForVisit('${p.id}', '${esc(p.firstName)}', '${esc(p.lastName)}')">
          <div class="sr-name">${esc(p.firstName)} ${p.middleInitial ? esc(p.middleInitial) + '. ' : ''}${esc(p.lastName)}</div>
          <div class="sr-meta">${p.age || '—'}/${p.gender || '—'} &nbsp;·&nbsp; ${p.address ? esc(p.address).slice(0, 40) + '…' : '—'}</div>
        </div>`).join('');
  } catch (err) {
    resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--red)">Search failed. Please try again.</div>';
  }
};

// =============================================================// SELECT PATIENT FOR RETURN VISIT
window.selectPatientForVisit = async (patientId, firstName, lastName) => {
  document.getElementById('patientSearchResults').style.display = 'none';
  document.getElementById('patientSearchInput').value = '';
  try {
    const snap = await getDoc(doc(db, 'patients', patientId));
    if (!snap.exists()) { showAlert('Patient not found.', 'error'); return; }
    const d = snap.data();
    document.getElementById('vPatientId').value = patientId;
    document.getElementById('vPatientName').textContent =
      `${d.firstName || ''} ${d.middleInitial ? d.middleInitial + '. ' : ''}${d.lastName || ''}`;
    document.getElementById('vPatientMeta').textContent =
      `${d.dateOfBirth ? computeAge(d.dateOfBirth) : (d.age || '—')} yrs · ${d.gender || '—'} · ${d.address || '—'}`;
    const allergenEl = document.getElementById('vPatientAllergen');
    if (allergenEl) {
      if (d.allergen) {
        allergenEl.textContent = `ALLERGEN ALERT: ${d.allergen} — Review before prescribing.`;
        allergenEl.classList.add('has-allergen');
      } else {
        allergenEl.textContent = '';
        allergenEl.classList.remove('has-allergen');
      }
    }
    ['vBPSys', 'vBPDia', 'vRR', 'vCR', 'vTemp', 'vO2Sat', 'vSubjective', 'vComplaintCategory',
      'vPhysicalExam', 'vDiagnosis', 'vTherapeuticPlan', 'vConsult', 'vDesc',
      'vAllergen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    const vBpBadge = document.getElementById('vBP-badge');
    if (vBpBadge) { vBpBadge.className = 'vs-badge empty'; vBpBadge.textContent = ''; }
    const feeAmountEl = document.getElementById('vFeeAmount');
    if (feeAmountEl) feeAmountEl.value = '';
    const feeStatusEl = document.getElementById('vFeeStatus');
    if (feeStatusEl) feeStatusEl.value = 'Paid';
    const feeMethodEl = document.getElementById('vFeeMethod');
    if (feeMethodEl) feeMethodEl.value = 'Cash';
    document.getElementById('vAge').value = d.age || '';

    initVisitRxLines();
    _loadLastRxForRefill(patientId);
    document.getElementById('visitModal').classList.add('open');
    logAudit(`Opened visit for: ${firstName} ${lastName}`, 'edit',patientId);
  } catch (err) {
    showAlert('Failed to load patient. Please try again.', 'error');
  }
};

window.closeVisitModal = () => document.getElementById('visitModal').classList.remove('open');

// =============================================================// SUBMIT VISIT
window.submitVisit = async () => {
  if (!isAuthorized) { doLogout(); return; }
  if (!rateLimit('visit', 10, 60 * 1000)) {
    showAlert('Too many submissions. Please slow down.', 'error'); return;
  }

  const patientId = document.getElementById('vPatientId').value;
  if (!patientId) { showAlert('No patient selected.', 'error'); return; }
  const medications = collectStructuredRxLines('#visitRxContainer .rx-line-card');

  const newAge = parseInt(document.getElementById('vAge').value, 10);
  const updatedAllergen = document.getElementById('vAllergen').value.trim();
  const vBpData = getBPData('v');

  const feeAmount  = parseFloat(document.getElementById('vFeeAmount')?.value || 0) || 0;
  const feeMethod  = document.getElementById('vFeeMethod')?.value  || 'Cash';
  const feeStatus  = document.getElementById('vFeeStatus')?.value  || 'Paid';

  const visitData = {
    bp: vBpData.bp,
    bpStatus: vBpData.bpStatus,
    rr: document.getElementById('vRR').value.trim(),
    cr: document.getElementById('vCR').value.trim(),
    temperature: document.getElementById('vTemp').value.trim(),
    o2Sat: document.getElementById('vO2Sat').value.trim(),
    subjectiveFindings: document.getElementById('vSubjective').value.trim(),
    complaintCategory: document.getElementById('vComplaintCategory')?.value || '',
    physicalExam: document.getElementById('vPhysicalExam').value.trim(),
    diagnosis: document.getElementById('vDiagnosis').value.trim(),
    therapeuticPlan: document.getElementById('vTherapeuticPlan').value.trim(),
    consultationType: document.getElementById('vConsult').value,
    description: document.getElementById('vDesc').value.trim(),
    medications: medications,
    hasPrescription: medications.length > 0,
    fee: feeAmount,
    feeMethod,
    feeStatus,
    visitDate: serverTimestamp(),
    addedBy: currentUser.email,
  };

  if (!visitData.consultationType) {
    showAlert('Please select a consultation type.', 'error'); return;
  }

  const saveBtn = document.getElementById('btnSaveVisit');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spin"></span> Saving…';

  try {
    const visitsRef = collection(db, 'patients', patientId, 'visits');
    await addDoc(visitsRef, visitData);

    const patientRef = doc(db, 'patients', patientId);
    const profileUpdates = {};
    if (newAge && newAge >= 1 && newAge <= 120) {
      profileUpdates.age = newAge;
    }
    if (updatedAllergen) {
      profileUpdates.allergen = updatedAllergen;
    }
    if (Object.keys(profileUpdates).length > 0) {
      await updateDoc(patientRef, profileUpdates);
    }

    const pName = document.getElementById('vPatientName').textContent;
    const rxNote = medications.length > 0 ? ` + ${medications.length} Rx item(s)` : '';
    logAudit(`Visit added: ${pName}${rxNote}`, 'add',patientId);
    closeVisitModal();
    showAlert('Visit recorded successfully!' + (rxNote ? ' Prescription saved with visit.' : ''), 'info');
    loadPatients();
  } catch (err) {
    showAlert('Failed to save visit: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Visit';
  }
};
// =============================================================// VIEW VISIT HISTORY
window.viewHistory = async (patientId, patientName) => {
  if (!isAuthorized) { doLogout(); return; }

  document.getElementById('historyPatientName').textContent = patientName;
  document.getElementById('historyPatientId').value = patientId;
  document.getElementById('historyList').innerHTML =
    '<p style="color:var(--g400);font-size:13px;padding:16px 0">Loading visits…</p>';
  document.getElementById('historyModal').classList.add('open');

  try {
    const snap = await getDocs(
      query(collection(db, 'patients', patientId, 'visits'), orderBy('visitDate', 'desc'))
    );

    if (snap.empty) {
      document.getElementById('historyList').innerHTML =
        '<p style="color:var(--g400);font-size:13px;padding:16px 0">No visit history yet. This patient&#39;s first visit was recorded as the original record.</p>';
      return;
    }

    const histPtName = document.getElementById('historyPatientName').textContent;

    document.getElementById('historyList').innerHTML = snap.docs.map((s, i) => {
      const v = s.data();
      const visitId = s.id;
      const dateStr = v.visitDate
        ? new Date(v.visitDate.toDate()).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Unknown date';
      const patId = document.getElementById('historyPatientId').value;
      return `
          <div class="history-entry">
            <div class="history-entry-header">
              <span class="history-num">Visit #${snap.docs.length - i}</span>
              <span class="history-date">${dateStr}</span>
              <span class="badge ${bClass(v.consultationType)}">${esc(v.consultationType || '')}</span>
              ${v.hasPrescription
          ? `<button class="btn-row btn-rx role-owner-only" style="padding:3px 10px;font-size:11px"
                    onclick="viewRxForVisit('${patId}','${visitId}','${esc(histPtName)}','${esc(dateStr)}')">
                    ℞ View Rx
                   </button>`
          : '<span style="font-size:11px;color:var(--g400);font-style:italic">No Rx</span>'}
            </div>
            <div class="history-grid">
              ${v.bp || v.rr || v.cr || v.temperature || v.o2Sat ? `
              <div class="hg-section">
                <div class="hg-label">Vital Signs</div>
                <div class="hg-body">
                  ${v.bp ? `<span><b>BP:</b> ${esc(v.bp)} mmHg${v.bpStatus ? ` <span class="bp-status-tag bp-${esc((v.bpStatus||'').replace(/\s+/g,'-').toLowerCase())}">${esc(v.bpStatus)}</span>` : ''}</span>` : ''}
                  ${v.rr ? `<span><b>RR:</b> ${esc(v.rr)}</span>` : ''}
                  ${v.cr ? `<span><b>CR:</b> ${esc(v.cr)}</span>` : ''}
                  ${v.temperature ? `<span><b>Temp:</b> ${esc(v.temperature)}</span>` : ''}
                  ${v.o2Sat ? `<span><b>O2 Sat:</b> ${esc(v.o2Sat)}</span>` : ''}
                </div>
              </div>` : ''}
              ${v.subjectiveFindings ? `<div class="hg-section"><div class="hg-label">Subjective Findings</div><div class="hg-body">${esc(v.subjectiveFindings)}</div></div>` : ''}
              ${v.diagnosis ? `<div class="hg-section"><div class="hg-label">Diagnosis</div><div class="hg-body">${esc(v.diagnosis)}</div></div>` : ''}
              ${v.therapeuticPlan ? `<div class="hg-section"><div class="hg-label">Therapeutic Plan</div><div class="hg-body">${esc(v.therapeuticPlan)}</div></div>` : ''}
              ${v.description ? `<div class="hg-section"><div class="hg-label">Notes</div><div class="hg-body">${esc(v.description)}</div></div>` : ''}
              ${v.fee ? `<div class="hg-section"><div class="hg-label">Consultation Fee</div><div class="hg-body"><span style="font-weight:700;color:var(--green)">₱${Number(v.fee).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</span> &nbsp;·&nbsp; ${esc(v.feeMethod||'Cash')} &nbsp;·&nbsp; <span class="billing-status-badge ${(v.feeStatus||'paid').toLowerCase()}">${esc(v.feeStatus||'Paid')}</span></div></div>` : ''}
            </div>
            <div style="font-size:11px;color:var(--g400);margin-top:8px">Recorded by: ${esc(v.addedBy || 'unknown')}</div>
          </div>`;
    }).join('');

  } catch (err) {
    document.getElementById('historyList').innerHTML =
      '<p style="color:var(--red);font-size:13px;padding:16px 0">Failed to load history.</p>';
  }
};

window.printVisitRx = async () => {
  if (!isOwner()) {
    showAlert('Only the doctor can print prescriptions.', 'error');
    return;
  }
  const lines = collectStructuredRxLines('#visitRxContainer .rx-line-card');
  if (!lines.length) {
    showAlert('Add at least one medication before printing.', 'error'); return;
  }
  validatePTRBeforePrint(() => _doPrintVisitRx(lines));
};

async function _doPrintVisitRx(lines) {
  const patientId = document.getElementById('vPatientId').value;
  const patientName = document.getElementById('vPatientName').textContent;
  const meta = document.getElementById('vPatientMeta').textContent;
  const [ageRaw, genderRaw] = meta.split('·').map(s => s.trim());
  const patientAge = (ageRaw || '').replace(/\s*yrs$/i, '');
  const patientGender = genderRaw || '';
  const diagnosis = document.getElementById('vDiagnosis')?.value.trim() || '';
  const doctor = RX_CONFIG.doctorName || currentUser.displayName || currentUser.email;

  const today = new Date();
  const dateStr = _formatDatePH(today);
  const timeStr = _formatTimePH(today);

  showAlert('Generating prescription…', 'info');

  let patientCode = '';
  try {
    const pSnap = await getDoc(doc(db, 'patients', patientId));
    const pData = pSnap.exists() ? pSnap.data() : {};
    patientCode = await ensurePatientCode(patientId, pData);
  } catch (err) {
    console.warn('Could not load/assign patient code:', err);
  }
  const { rxId, rxYear } = await generateRxId();

  await savePrescriptionRecord({
    rxId, rxYear, patientId, patientCode, patientName,
    patientAge, patientGender, diagnosis, medications: lines, doctor
  });

  document.getElementById('prescriptionPrintArea').innerHTML = buildRxHtml({
    rxId, patientName, patientAge, patientGender, patientCode,
    date: dateStr, time: timeStr,
    diagnosis, medications: lines, doctor
  });

  closeAlert();
  const rxPrintArea1 = document.getElementById('prescriptionPrintArea');
  rxPrintArea1.classList.add('printing');
  _printOrDownload(rxPrintArea1, `Prescription_${rxId}`);
  logAudit(`Prescription ${rxId} (Visit Rx) printed for: ${patientName}`, 'edit', patientId);
};
function updateVisitPrintBtn() {
  const anyFilled = [...document.querySelectorAll('#visitRxContainer .rx-drug-name')]
    .some(el => el.value.trim().length > 0);
  const btn = document.getElementById('btnPrintVisitRx');
  if (!btn) return;
  btn.disabled = !anyFilled;
  btn.style.opacity = anyFilled ? '1' : '.4';
  btn.style.cursor = anyFilled ? 'pointer' : 'not-allowed';
}

window.updateTherapeuticPrintBtn = function() {
  const anyFilled = [...document.querySelectorAll('#addFormRxContainer .rx-drug-name')]
    .some(el => el.value.trim().length > 0);
  const btn = document.getElementById('btnPrintTherapeuticRx');
  if (!btn) return;
  btn.disabled = !anyFilled;
  btn.style.opacity = anyFilled ? '1' : '.4';
  btn.style.cursor = anyFilled ? 'pointer' : 'not-allowed';
};

// =============================================================// PRINT THERAPEUTIC PLAN RX
window.printTherapeuticPlanRx = async () => {
  if (!isOwner()) {
    showAlert('Only the doctor can print prescriptions.', 'error');
    return;
  }
  const lines = collectStructuredRxLines('#addFormRxContainer .rx-line-card');
  if (!lines.length) {
    showAlert('Add at least one medication before printing.', 'error'); return;
  }
  validatePTRBeforePrint(() => _doPrintTherapeuticPlanRx(lines));
};

async function _doPrintTherapeuticPlanRx(lines) {
  const patientName = [
    document.getElementById('fFirstName')?.value.trim(),
    document.getElementById('fMiddle')?.value.trim(),
    document.getElementById('fLastName')?.value.trim()
  ].filter(Boolean).join(' ') || 'New Patient';

  const patientAge = computeAge(document.getElementById('fDOB')?.value) || '';
  const patientGender = document.getElementById('fGender')?.value || '';
  const diagnosis = document.getElementById('fDiagnosis')?.value.trim() || '';
  const doctor = RX_CONFIG.doctorName || currentUser?.displayName || currentUser?.email;

  const today = new Date();
  const dateStr = _formatDatePH(today);
  const timeStr = _formatTimePH(today);

  showAlert('Generating prescription…', 'info');
  let patientId = _addFormPatientId;
  let patientCode = null;
  if (!patientId) {
    try {
      const bpData = getBPData('f');
      const profileData = {
        firstName: document.getElementById('fFirstName')?.value.trim() || '',
        lastName: document.getElementById('fLastName')?.value.trim() || '',
        middleInitial: (document.getElementById('fMiddle')?.value.trim() || '').toUpperCase(),
        address: document.getElementById('fAddress')?.value.trim() || '',
        dateOfBirth: document.getElementById('fDOB')?.value || '',
        gender: patientGender,
        occupation: document.getElementById('fOccupation')?.value.trim() || '',
        civilStatus: document.getElementById('fCivilStatus')?.value || '',
        allergen: document.getElementById('fAllergen')?.value.trim() || '',
        description: document.getElementById('fDesc')?.value.trim() || '',
        email: document.getElementById('fEmail')?.value.trim() || '',
        phone: document.getElementById('fPhone')?.value.trim() || '',
        createdAt: serverTimestamp(),
        deleted: false
      };
      const docRef = await addDoc(collection(db, 'patients'), profileData);
      patientId = docRef.id;
      _addFormPatientId = patientId;
    } catch (err) {
      console.warn('Could not create patient before printing:', err);
    }
  }

  if (patientId) {
    try {
      const patientRef = doc(db, 'patients', patientId);
      const pSnap = navigator.onLine
        ? await getDoc(patientRef)
        : await getDocFromCache(patientRef);
      const pData = pSnap.exists() ? pSnap.data() : {};
      patientCode = await ensurePatientCode(patientId, pData);
    } catch (err) {
      console.warn('Could not load/assign patient code:', err);
    }
  }

  const { rxId, rxYear } = await generateRxId();

  const usedVisitId = await savePrescriptionRecord({
    rxId, rxYear,
    patientId,
    patientCode,
    patientName, patientAge, patientGender,
    diagnosis, medications: lines, doctor,
    followUpDate: null,
    visitId: _addFormVisitId
  });
  _addFormVisitId = usedVisitId;

  document.getElementById('prescriptionPrintArea').innerHTML = buildRxHtml({
    rxId, patientName, patientAge, patientGender,
    patientCode,
    date: dateStr, time: timeStr,
    diagnosis, medications: lines, doctor
  });

  closeAlert();
  const rxPrintArea2 = document.getElementById('prescriptionPrintArea');
  rxPrintArea2.classList.add('printing');
  _printOrDownload(rxPrintArea2, `Prescription_${rxId}`);
  logAudit(`Prescription ${rxId} (Therapeutic Plan) printed for: ${patientName}`, 'add', patientId);
};
window.closeHistoryModal = () => document.getElementById('historyModal').classList.remove('open');
// =============================================================// PATIENT PROFILE
window.openPatientProfile = async (patientId, patientName) => {
  if (!isAuthorized) { doLogout(); return; }
  logAudit(`Viewed profile: ${patientName}`, 'edit', patientId);
  document.getElementById('profilePatientId').value = patientId;
  document.getElementById('profilePatientName').textContent = patientName;
  document.getElementById('profileInfo').innerHTML =
    '<div class="ppm-empty"><div class="ppm-empty-icon"></div>Loading…</div>';
  document.getElementById('profileVisitList').innerHTML =
    '<div class="ppm-empty"><div class="ppm-empty-icon"></div>Loading visits…</div>';
  document.getElementById('patientProfileModal').classList.add('open');

  try {
    const pSnap = await getDoc(doc(db, 'patients', patientId));
    if (!pSnap.exists()) { showAlert('Patient not found.', 'error'); return; }
    const p = pSnap.data();

    const initials = `${(p.firstName||'?')[0]}${(p.lastName||'')[0]||''}`.toUpperCase();
    document.getElementById('profileAvatar').textContent = initials;

    document.getElementById('profilePatientName').textContent =
      `${p.firstName||''} ${p.middleInitial ? p.middleInitial+'. ' : ''}${p.lastName||''}`.trim();
    document.getElementById('profilePatientAddress').value = p.address || '';

    const age  = p.dateOfBirth ? computeAge(p.dateOfBirth) : (p.age || null);
    document.getElementById('profilePatientAge').value    = age != null ? age : '';
    document.getElementById('profilePatientGender').value = p.gender || '';

    const meta = [
      age != null ? `${age} yrs` : null,
      p.gender   || null,
      p.civilStatus || null,
      p.occupation  || null,
    ].filter(Boolean);
    document.getElementById('profilePatientMeta').innerHTML =
      meta.map((m,i) => i===0 ? esc(m) : `<span class="ppm-meta-dot"></span>${esc(m)}`).join('');

    const allergenEl = document.getElementById('profilePatientAllergen');
    if (p.allergen) {
      allergenEl.querySelector('span').textContent = `Allergen: ${p.allergen}`;
      allergenEl.classList.add('visible');
    } else {
      allergenEl.classList.remove('visible');
    }

    const dobDisplay = p.dateOfBirth
      ? new Date(p.dateOfBirth + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const registeredDisplay = p.createdAt
      ? new Date(p.createdAt.toDate()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    document.getElementById('profileInfo').innerHTML = `
      <div class="ppm-info-grid">
        <div class="ppm-info-card">
          <div class="ppm-info-label">Patient ID</div>
          <div class="ppm-info-value ${p.patientCode?'':'empty'}">${esc(p.patientCode||'Not yet assigned')}</div>
        </div>
        <div class="ppm-info-card">
          <div class="ppm-info-label">Date of Birth</div>
          <div class="ppm-info-value ${dobDisplay?'':'empty'}">${esc(dobDisplay||'Not provided')}</div>
        </div>
        <div class="ppm-info-card">
          <div class="ppm-info-label">Phone</div>
          <div class="ppm-info-value ${p.phone?'':'empty'}">${esc(p.phone||'Not provided')}</div>
        </div>
        <div class="ppm-info-card">
          <div class="ppm-info-label">Email</div>
          <div class="ppm-info-value ${p.email?'':'empty'}">${esc(p.email||'Not provided')}</div>
        </div>
        <div class="ppm-info-card full">
          <div class="ppm-info-label">Address</div>
          <div class="ppm-info-value ${p.address?'':'empty'}">${esc(p.address||'Not provided')}</div>
        </div>
        ${p.description ? `<div class="ppm-info-card full">
          <div class="ppm-info-label">Notes</div>
          <div class="ppm-info-value">${esc(p.description)}</div>
        </div>` : ''}
        <div class="ppm-info-card">
          <div class="ppm-info-label">Registered</div>
          <div class="ppm-info-value ${registeredDisplay?'':'empty'}">${esc(registeredDisplay||'Unknown')}</div>
        </div>
      </div>`;

    // Upcoming Appointments — single equality filter (patientId) needs no
    // composite index; status/date filtering + sort happen client-side.
    try {
      const aSnap = await getDocs(query(collection(db, 'appointments'), where('patientId', '==', patientId)));
      const todayStr = new Date().toISOString().slice(0, 10);
      const upcoming = aSnap.docs
        .map(s => ({ id: s.id, ...s.data() }))
        .filter(a => !a.deleted && a.status !== 'Cancelled' && a.date >= todayStr)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

      document.getElementById('profileAppointments').innerHTML = upcoming.length
        ? `<div class="ppm-visit-list">${upcoming.map(a => `
          <div class="ppm-visit-item">
            <div class="ppm-visit-dot-col"><div class="ppm-visit-dot">${new Date(a.date+'T00:00:00').getDate()}</div></div>
            <div class="ppm-visit-card">
              <div class="ppm-visit-head">
                <div class="ppm-visit-head-left">
                  <span class="ppm-visit-date">${esc(fmtApptDate(a.date))} · ${esc(fmtApptTime(a.time))}</span>
                  <span class="badge ${apptStatusClass(a.status)}">${esc(a.status||'Scheduled')}</span>
                </div>
              </div>
              <div class="ppm-visit-body">
                ${a.type ? `<div class="ppm-visit-field"><div class="ppm-visit-field-label">Type</div><div class="ppm-visit-field-value">${esc(a.type)}</div></div>` : ''}
                ${a.notes ? `<div class="ppm-visit-field"><div class="ppm-visit-field-label">Notes</div><div class="ppm-visit-field-value">${esc(a.notes)}</div></div>` : ''}
              </div>
            </div>
          </div>`).join('')}</div>`
        : '<div class="ppm-empty"><div class="ppm-empty-icon"></div>No upcoming appointments.</div>';
    } catch (err) {
      document.getElementById('profileAppointments').innerHTML =
        '<div class="ppm-empty" style="color:var(--red)"><div class="ppm-empty-icon"></div>Failed to load appointments.</div>';
    }

    const vSnap = await getDocs(
      query(collection(db,'patients',patientId,'visits'), orderBy('visitDate','desc'))
    );
    if (vSnap.empty) {
      document.getElementById('profileVisitList').innerHTML =
        '<div class="ppm-empty"><div class="ppm-empty-icon"></div>No visits recorded yet.</div>';
      return;
    }

    document.getElementById('profileVisitList').innerHTML =
      `<div class="ppm-visit-list">${vSnap.docs.map((s,i) => {
        const v = s.data(); const vid = s.id;
        const dateStr = v.visitDate
          ? new Date(v.visitDate.toDate()).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
          : 'Unknown date';
        const visitNum = vSnap.docs.length - i;

        const vitalsHtml = (v.bp||v.rr||v.cr||v.temperature||v.o2Sat) ? `
          <div class="ppm-visit-field">
            <div class="ppm-visit-field-label">Vital Signs</div>
            <div class="ppm-visit-vitals">
              ${v.bp        ? `<span class="ppm-vital-chip"><b>BP</b> ${esc(v.bp)}</span>` : ''}
              ${v.rr        ? `<span class="ppm-vital-chip"><b>RR</b> ${esc(v.rr)}</span>` : ''}
              ${v.cr        ? `<span class="ppm-vital-chip"><b>CR</b> ${esc(v.cr)}</span>` : ''}
              ${v.temperature?`<span class="ppm-vital-chip"><b>Temp</b> ${esc(v.temperature)}</span>` : ''}
              ${v.o2Sat     ? `<span class="ppm-vital-chip"><b>O₂</b> ${esc(v.o2Sat)}</span>` : ''}
            </div>
          </div>` : '';

        const field = (label, val) => val ? `
          <div class="ppm-visit-field">
            <div class="ppm-visit-field-label">${label}</div>
            <div class="ppm-visit-field-value">${esc(val)}</div>
          </div>` : '';

        const medsHtml = v.medications?.length ? `
          <div class="ppm-visit-field">
            <div class="ppm-visit-field-label">Medications</div>
            <div class="ppm-visit-vitals">
              ${v.medications.map(m=>`<span class="ppm-vital-chip">${esc(m.drug)}${m.sig?' — '+esc(m.sig):''}</span>`).join('')}
            </div>
          </div>` : '';

        const feeHtml = v.fee ? `
          <div class="ppm-fee-chip">
            <span class="ppm-fee-amount">₱${Number(v.fee).toLocaleString('en-PH',{minimumFractionDigits:2})}</span>
            <span style="color:var(--g400)">·</span>
            <span>${esc(v.feeMethod||'Cash')}</span>
            <span style="color:var(--g400)">·</span>
            <span class="billing-status-badge ${(v.feeStatus||'paid').toLowerCase()}">${esc(v.feeStatus||'Paid')}</span>
          </div>` : '';

        const rxBtn = v.hasPrescription ? `
          <button class="ppm-rx-btn role-owner-only"
            onclick="viewRxForVisit('${patientId}','${vid}','${esc(patientName)}','${esc(dateStr)}')">
            ℞ View Rx
          </button>` : `<span style="font-size:11px;color:var(--g400);font-style:italic">No Rx</span>`;

        return `
          <div class="ppm-visit-item">
            <div class="ppm-visit-dot-col">
              <div class="ppm-visit-dot">#${visitNum}</div>
            </div>
            <div class="ppm-visit-card">
              <div class="ppm-visit-head">
                <div class="ppm-visit-head-left">
                  <span class="ppm-visit-date">${dateStr}</span>
                  <span class="badge ${bClass(v.consultationType)}">${esc(v.consultationType||'')}</span>
                </div>
                ${rxBtn}
              </div>
              <div class="ppm-visit-body">
                ${vitalsHtml}
                ${field('Subjective', v.subjectiveFindings)}
                ${field('Diagnosis', v.diagnosis)}
                ${field('Therapeutic Plan', v.therapeuticPlan)}
                ${medsHtml}
              </div>
              <div class="ppm-visit-foot">
                <span class="ppm-recorded-by">Recorded by ${esc(v.addedBy||'unknown')}</span>
                ${feeHtml}
              </div>
            </div>
          </div>`;
      }).join('')}</div>`;

  } catch(err) {
    document.getElementById('profileVisitList').innerHTML =
      '<div class="ppm-empty" style="color:var(--red)"><div class="ppm-empty-icon"></div>Failed to load profile.</div>';
  }
};

window.closePatientProfileModal = () =>
  document.getElementById('patientProfileModal').classList.remove('open');

window.selectPatientForVisitFromProfile = () => {
  const id = document.getElementById('profilePatientId').value;
  const name = document.getElementById('profilePatientName').textContent;
  const parts = name.split(' ');
  closePatientProfileModal();
  selectPatientForVisit(id, parts[0]||'', parts[parts.length-1]||'');
};

// =============================================================// VISIT RX LINES

let _visitRxCount = 0;
let _addFormRxCount = 0;

function initAddFormRxLines() {
  _addFormRxCount = 0;
  document.getElementById('addFormRxContainer').innerHTML = '';
}

const RX_FREQUENCY_OPTIONS = [
  'Once daily (OD)', 'Twice daily (BID)', 'Three times daily (TID)',
  'Four times daily (QID)', 'Every 4 hours', 'Every 6 hours', 'Every 8 hours',
  'Every 12 hours', 'As needed (PRN)', 'At bedtime (HS)', 'Before meals',
  'After meals', 'Other'
];

window.addAddFormRxLine = () => {
  if (_addFormRxCount >= 8) { showAlert('Maximum 8 medication lines.', 'error'); return; }
  _addFormRxCount++;
  const n = _addFormRxCount;
  const container = document.getElementById('addFormRxContainer');
  const div = document.createElement('div');
  div.className = 'rx-line-card';
  div.id = `addFormRxLine${n}`;
  div.innerHTML = `
    <div class="rx-line-card-head">
      <span class="rx-line-card-num">Medication ${n}</span>
      <button type="button" class="visit-rx-remove" title="Remove"
        onclick="document.getElementById('addFormRxLine${n}').remove(); updateTherapeuticPrintBtn();">✕</button>
    </div>
    <div class="rx-line-grid">
      <input class="rx-drug-name" type="text"
        placeholder="Drug name (e.g. Amoxicillin)" maxlength="100">
      <input class="rx-dosage" type="text"
        placeholder="Dosage (e.g. 500mg)" maxlength="40">
      <select class="rx-frequency">
        <option value="">Frequency…</option>
        ${RX_FREQUENCY_OPTIONS.map(f => `<option>${f}</option>`).join('')}
      </select>
      <input class="rx-duration" type="text"
        placeholder="Duration (e.g. 7 days)" maxlength="40">
      <input class="rx-instructions" type="text"
        placeholder="Additional instructions (e.g. Take with food)" maxlength="150">
    </div>`;
  container.appendChild(div);
  const drugInput = div.querySelector('.rx-drug-name');
  applyAutoCapitalize(drugInput);
  drugInput.addEventListener('input', updateTherapeuticPrintBtn);
};

function initVisitRxLines() {
  _visitRxCount = 0;
  document.getElementById('visitRxContainer').innerHTML = '';
  addVisitRxLine();
}

window.addVisitRxLine = () => {
  if (_visitRxCount >= 8) {
    showAlert('Maximum 8 medication lines.', 'error'); return;
  }
  _visitRxCount++;
  const n = _visitRxCount;
  const container = document.getElementById('visitRxContainer');
  const div = document.createElement('div');
  div.className = 'rx-line-card';
  div.id = `visitRxLine${n}`;
  div.innerHTML = `
    <div class="rx-line-card-head">
      <span class="rx-line-card-num">Medication ${n}</span>
      <button type="button" class="visit-rx-remove" title="Remove"
        onclick="removeVisitRxLine('visitRxLine${n}')">✕</button>
    </div>
    <div class="rx-line-grid">
      <input class="rx-drug-name" type="text"
        placeholder="Drug name (e.g. Amoxicillin)" maxlength="100">
      <input class="rx-dosage" type="text"
        placeholder="Dosage (e.g. 500mg)" maxlength="40">
      <select class="rx-frequency">
        <option value="">Frequency…</option>
        ${RX_FREQUENCY_OPTIONS.map(f => `<option>${f}</option>`).join('')}
      </select>
      <input class="rx-duration" type="text"
        placeholder="Duration (e.g. 7 days)" maxlength="40">
      <input class="rx-instructions" type="text"
        placeholder="Additional instructions (e.g. Take with food)" maxlength="150">
    </div>`;
  container.appendChild(div);
  const drugInput = div.querySelector('.rx-drug-name');
  applyAutoCapitalize(drugInput);
  drugInput.addEventListener('input', updateVisitPrintBtn);
};

window.removeVisitRxLine = (lineId) => {
  const el = document.getElementById(lineId);
  if (el) el.remove();
  updateVisitPrintBtn();
};

async function _loadLastRxForRefill(patientId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'patients', patientId, 'visits'),
        orderBy('visitDate', 'desc'))
    );
    const lastWithRx = snap.docs.find(s => s.data().hasPrescription);
    const btn = document.getElementById('btnRefillLastRx');
    if (!btn) return;
    if (lastWithRx) {
      btn.style.display = 'inline-flex';
      btn.onclick = () => {
        const meds = lastWithRx.data().medications || [];
        document.getElementById('visitRxContainer').innerHTML = '';
        _visitRxCount = 0;
        meds.forEach(m => {
          addVisitRxLine();
          const cards = document.querySelectorAll('#visitRxContainer .rx-line-card');
          const last = cards[cards.length - 1];
          if (last) {
            last.querySelector('.rx-drug-name').value = m.drug || '';
            last.querySelector('.rx-dosage').value = m.dosage || '';
            const freqSel = last.querySelector('.rx-frequency');
            if (freqSel && m.frequency) {
              const match = [...freqSel.options].find(o => o.value === m.frequency);
              if (match) freqSel.value = m.frequency;
            }
            last.querySelector('.rx-duration').value = m.duration || '';
            last.querySelector('.rx-instructions').value = m.instructions || '';
          }
        });
        updateVisitPrintBtn();
        showAlert('Last prescription loaded. Review before saving.', 'info');
      };
    } else {
      btn.style.display = 'none';
    }
  } catch {
  }
}

// =============================================================// VIEW RX FOR VISIT

window.viewRxForVisit = async (patientId, visitId, patientName, visitDate) => {
  document.getElementById('viewRxPatientName').textContent = patientName;
  document.getElementById('viewRxVisitDate').textContent = visitDate;
  document.getElementById('viewRxList').innerHTML =
    '<p style="color:var(--g400);font-size:13px">Loading prescription…</p>';
  document.getElementById('viewRxModal').classList.add('open');
  document.getElementById('viewRxPatientId').value = patientId;
  try {
    const snap = await getDoc(doc(db, 'patients', patientId, 'visits', visitId));
    if (!snap.exists()) {
      document.getElementById('viewRxList').innerHTML =
        '<p style="color:var(--red);font-size:13px">Visit not found.</p>';
      return;
    }
    const v = snap.data();
    const meds = v.medications || [];

    document.getElementById('viewRxPatientMeta').textContent =
      v.addedBy ? `Recorded by: ${v.addedBy}` : '—';
    document.getElementById('viewRxDiagnosis').textContent =
      v.diagnosis || 'Not specified';
    document.getElementById('viewRxDoctor').textContent =
      RX_CONFIG.doctorName || v.addedBy || 'Unknown';
    document.getElementById('viewRxModal').dataset.rxId = v.rxId || '';

    if (!meds.length) {
      document.getElementById('viewRxList').innerHTML =
        '<p style="color:var(--g400);font-size:13px">No medications were recorded for this visit.</p>';
      return;
    }

    document.getElementById('viewRxList').innerHTML = meds.map(m => `
        <div class="rx-view-line">
          <span class="rx-view-num">${m.num}.</span>
          <div>
            <div class="rx-view-drug">${esc(m.drug)}</div>
            ${m.sig ? `<div class="rx-view-sig">Sig: ${esc(m.sig)}</div>` : ''}
          </div>
        </div>`).join('');

  } catch (err) {
    document.getElementById('viewRxList').innerHTML =
      '<p style="color:var(--red);font-size:13px">Failed to load prescription.</p>';
  }
};

window.closeViewRxModal = () => document.getElementById('viewRxModal').classList.remove('open');

// =============================================================// PRINT VIEWED RX
window.printViewedRx = async () => {
  if (!isOwner()) {
    showAlert('Only the doctor can print prescriptions.', 'error');
    return;
  }
  const lines = [];
  document.querySelectorAll('.rx-view-line').forEach((row, i) => {
    const drug = row.querySelector('.rx-view-drug')?.textContent?.trim();
    const sig = row.querySelector('.rx-view-sig')?.textContent?.replace('Sig: ', '').trim() || '';
    if (drug) lines.push({ num: i + 1, drug, sig });
  });
  if (!lines.length) { showAlert('No medications to print.', 'error'); return; }
  validatePTRBeforePrint(() => _doPrintViewedRx(lines));
};

async function _doPrintViewedRx(lines) {
  const patientName = document.getElementById('viewRxPatientName').textContent;
  const visitDate = document.getElementById('viewRxVisitDate').textContent;
  const diagnosis = document.getElementById('viewRxDiagnosis').textContent;
  const doctor = document.getElementById('viewRxDoctor').textContent;
  const patientId = document.getElementById('viewRxPatientId').value;
  const existingRxId = document.getElementById('viewRxModal').dataset.rxId;
  const rxId = existingRxId || ('REPRINT-' + Date.now().toString(36).toUpperCase());

  let patientCode = '';
  let patientAge = '', patientGender = '';
  try {
    const pSnap = await getDoc(doc(db, 'patients', patientId));
    if (pSnap.exists()) {
      const pData = pSnap.data();
      patientCode = pData.patientCode || await ensurePatientCode(patientId, pData);
      patientAge = pData.dateOfBirth ? computeAge(pData.dateOfBirth) : (pData.age || '');
      patientGender = pData.gender || '';
    }
  } catch (err) {
    console.warn('Could not load patient code for reprint:', err);
  }

  document.getElementById('prescriptionPrintArea').innerHTML = buildRxHtml({
    rxId, patientName, patientAge, patientGender, patientCode,
    date: visitDate, time: '',
    diagnosis: (diagnosis === 'Not specified' ? '' : diagnosis),
    medications: lines, doctor
  });
  const rxPrintArea3 = document.getElementById('prescriptionPrintArea');
  rxPrintArea3.classList.add('printing');
  _printOrDownload(rxPrintArea3, `Prescription_${rxId}`);
  logAudit(`Prescription ${rxId} reprinted for: ${patientName}`, 'edit', patientId);
};

// =============================================================// DOCTOR LICENSE MANAGEMENT

let RX_CONFIG = {
  doctorName:    'Attending Physician',
  specialty:     'Family Medicine',
  clinicName:    'pureEHC Clinic Service',
  address:       'Iloilo City, Iloilo',
  contactNumber: '',
  prcNo:         '',
  ptrNo:         '',
  ptrDateIssued: '',
  ptrValidUntil: '',
  ptrPlaceIssued:'',
  s2No:          '',
};

// =============================================================// MEDICAL CERTIFICATE
let _mcPatientData = {};

window.openMedCertModal = () => {
  const patientId      = document.getElementById('profilePatientId').value;
  const name           = document.getElementById('profilePatientName')?.textContent?.trim() || '—';
  const address        = document.getElementById('profilePatientAddress')?.value?.trim() || '—';
  const ageVal         = document.getElementById('profilePatientAge')?.value?.trim();
  const age            = ageVal ? `${ageVal} yrs` : '—';
  const gender         = document.getElementById('profilePatientGender')?.value?.trim() || '—';

  const dxEls = document.querySelectorAll('#profileVisitList .ppm-visit-field-value');
  let lastDiagnosis = '';
  dxEls.forEach(el => {
    const label = el.previousElementSibling?.textContent?.trim() || '';
    if ((label.toLowerCase().includes('diagnosis') || label.toLowerCase().includes('impression'))
        && !lastDiagnosis) {
      lastDiagnosis = el.textContent?.trim() || '';
    }
  });

  _mcPatientData = { patientId, name, age, gender, address, lastDiagnosis };

  document.getElementById('mcPatientName').textContent    = name;
  document.getElementById('mcPatientAge').textContent     = age;
  document.getElementById('mcPatientAddress').textContent = address;
  document.getElementById('mcLastDiagnosis').textContent  = lastDiagnosis || 'Not recorded';

  document.getElementById('mcDiagnosisOverride').value = '';
  document.getElementById('mcRestDays').value          = '';
  document.getElementById('mcNotes').value             = '';
  document.getElementById('mcPurpose').value           = 'whatever legal purpose this may serve';
  document.getElementById('mcRestStart').value         =
    new Date().toISOString().split('T')[0]; 

  document.getElementById('medcertModal').classList.add('open');
};

window.closeMedCertModal = () => {
  document.getElementById('medcertModal').classList.remove('open');
};

window.printMedCert = () => {
  const restDays = parseInt(document.getElementById('mcRestDays').value, 10);
  const restStart = document.getElementById('mcRestStart').value;

  if (!restDays || restDays < 1) {
    showAlert('Please enter the number of rest days.', 'error'); return;
  }
  if (!restStart) {
    showAlert('Please select the rest start date.', 'error'); return;
  }

  const diagnosisOverride = document.getElementById('mcDiagnosisOverride').value.trim();
  const finalDiagnosis    = diagnosisOverride || _mcPatientData.lastDiagnosis || 'As clinically evaluated';
  const purpose           = document.getElementById('mcPurpose').value;
  const notes             = document.getElementById('mcNotes').value.trim();

  const startDate = new Date(restStart + 'T00:00:00');
  const endDate   = new Date(startDate);
  endDate.setDate(endDate.getDate() + restDays - 1);

  const fmtDate = d => d.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = buildMedCertHtml({
    patientName:    _mcPatientData.name,
    patientAge:     _mcPatientData.age,
    patientGender:  _mcPatientData.gender,
    patientAddress: _mcPatientData.address,
    diagnosis:      finalDiagnosis,
    restDays,
    restStart:  fmtDate(startDate),
    restEnd:    fmtDate(endDate),
    purpose,
    notes,
    dateIssued: fmtDate(new Date()),
  });

  const printArea = document.getElementById('medcertPrintArea');
  printArea.innerHTML = html;
  printArea.classList.add('printing');
  _printOrDownload(printArea, `MedicalCertificate_${(_mcPatientData.name || 'patient').replace(/\s+/g, '_')}`);

  closeMedCertModal();
  logAudit(`Medical Certificate printed for: ${_mcPatientData.name}`, 'edit',
    _mcPatientData.patientId || null);
};

function buildMedCertHtml({ patientName, patientAge, patientGender, patientAddress,
  diagnosis, restDays, restStart, restEnd, purpose, notes, dateIssued }) {

  const prcBlock = (RX_CONFIG.prcNo || RX_CONFIG.ptrNo)
    ? `<div class="medcert-prc">
        ${RX_CONFIG.prcNo ? `PRC No.: ${esc(RX_CONFIG.prcNo)}<br>` : ''}
        ${RX_CONFIG.ptrNo ? `PTR No.: ${esc(RX_CONFIG.ptrNo)}` : ''}
       </div>`
    : '';

  const notesBlock = notes
    ? `<p style="margin-top:6px;font-size:10.5px;font-style:italic">${esc(notes)}</p>`
    : '';

  const restPeriod = restDays === 1
    ? `on <strong>${esc(restStart)}</strong>`
    : `from <strong>${esc(restStart)}</strong> to <strong>${esc(restEnd)}</strong>`;

  return `
  <div class="medcert-page">

    <div class="medcert-clinic-name">${esc(RX_CONFIG.clinicName)}</div>
    <div class="medcert-clinic-addr">${esc(RX_CONFIG.address)}${RX_CONFIG.contactNumber ? ' · ' + esc(RX_CONFIG.contactNumber) : ''}</div>

    <div class="medcert-title">Medical Certificate</div>

    <div class="medcert-body">
      <p>This is to certify that:</p>

      <table style="width:100%;font-size:11px;line-height:1.8;margin:6px 0 4px">
        <tr>
          <td style="width:110px;color:#555;vertical-align:top">Full Name</td>
          <td><span class="medcert-field">${esc(patientName)}</span></td>
        </tr>
        <tr>
          <td style="color:#555;vertical-align:top">Age / Sex</td>
          <td><span class="medcert-field">${esc(String(patientAge))} / ${esc(patientGender)}</span></td>
        </tr>
        <tr>
          <td style="color:#555;vertical-align:top">Address</td>
          <td><span class="medcert-field">${esc(patientAddress)}</span></td>
        </tr>
      </table>

      <p style="margin-top:8px">
        was examined on <strong>${esc(dateIssued)}</strong> and was found to be
        suffering from / diagnosed with:
      </p>

      <div class="medcert-diagnosis-box">${esc(diagnosis)}</div>

      <p style="margin-top:8px">
        Patient is advised to rest for
        <strong>${restDays} day${restDays > 1 ? 's' : ''}</strong>
        ${restPeriod}
        and is considered <strong>unfit for work / school</strong> during said period.
      </p>

      ${notesBlock}

      <p style="margin-top:10px">
        This Medical Certificate is issued upon the patient's request
        for <em>${esc(purpose)}</em>.
      </p>
    </div>

    <div class="medcert-footer">
      <div class="medcert-sig-label">Physician's Signature</div>
      <div class="medcert-sig-line"></div>
      <div class="medcert-doctor-name">${esc(RX_CONFIG.doctorName)}</div>
      <div class="medcert-doctor-title">${esc(RX_CONFIG.specialty)}</div>
      ${prcBlock}
    </div>

    <div class="medcert-issued">Date Issued: ${esc(dateIssued)}</div>

    <div class="medcert-end">
      — End of Medical Certificate —<br>
      Issued by ${esc(RX_CONFIG.clinicName)}.
      Any alteration renders this certificate void and invalid.
    </div>

  </div>`;
}

// =============================================================// LOAD CLINIC SETTINGS
window.loadClinicSettings = async () => {
  try {
    const snap = await getDoc(doc(db, 'clinicSettings', 'doctorProfile'));
    if (snap.exists()) {
      const d = snap.data();
      RX_CONFIG = {
        doctorName:    d.doctorName    || RX_CONFIG.doctorName,
        specialty:     d.specialty     || RX_CONFIG.specialty,
        clinicName:    d.clinicName    || RX_CONFIG.clinicName,
        address:       d.address       || RX_CONFIG.address,
        contactNumber: d.contactNumber || '',
        prcNo:         d.prcNo         || '',
        ptrNo:         d.ptrNo         || '',
        ptrDateIssued: d.ptrDateIssued || '',
        ptrValidUntil: d.ptrValidUntil || '',
        ptrPlaceIssued:d.ptrPlaceIssued|| '',
        s2No:          d.s2No          || '',
      };
    }
    _populateSettingsForm();
    checkPTRExpiry();
  } catch (err) {
    console.warn('Could not load clinic settings:', err);
  }
};

// =============================================================// POPULATE SETTINGS FORM
function _populateSettingsForm() {
  const fields = {
    stDoctorName:    RX_CONFIG.doctorName,
    stSpecialty:     RX_CONFIG.specialty,
    stClinicName:    RX_CONFIG.clinicName,
    stClinicAddress: RX_CONFIG.address,
    stContactNumber: RX_CONFIG.contactNumber,
    stPRCNo:         RX_CONFIG.prcNo,
    stPTRNo:         RX_CONFIG.ptrNo,
    stPTRDateIssued: RX_CONFIG.ptrDateIssued,
    stPTRValidUntil: RX_CONFIG.ptrValidUntil,
    stPTRPlaceIssued:RX_CONFIG.ptrPlaceIssued,
    stS2No:          RX_CONFIG.s2No,
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });
  _updatePTRStatusPill();
}

// =============================================================// UPDATE PTR STATUS PILL
function _updatePTRStatusPill() {
  const pill = document.getElementById('ptrStatusPill');
  if (!pill) return;

  if (!RX_CONFIG.ptrValidUntil) {
    pill.style.display = 'none'; return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(RX_CONFIG.ptrValidUntil + 'T00:00:00');
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  pill.style.display = 'inline-flex';
  if (daysLeft < 0) {
    pill.className = 'ptr-status-pill expired';
    pill.textContent = `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`;
  } else if (daysLeft <= 30) {
    pill.className = 'ptr-status-pill warn';
    pill.textContent = `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  } else {
    pill.className = 'ptr-status-pill ok';
    pill.textContent = `Valid — ${daysLeft} days remaining`;
  }
}

// =============================================================// SAVE CLINIC SETTINGS
window.saveClinicSettings = async () => {
  const doctorName = document.getElementById('stDoctorName')?.value.trim();
  const clinicName = document.getElementById('stClinicName')?.value.trim();

  if (!doctorName) { showAlert('Doctor name is required.', 'error'); return; }
  if (!clinicName) { showAlert('Clinic name is required.', 'error'); return; }

  const statusEl = document.getElementById('settingsSaveStatus');
  if (statusEl) statusEl.textContent = 'Saving…';

  const data = {
    doctorName,
    specialty:     document.getElementById('stSpecialty')?.value.trim()     || '',
    clinicName,
    address:       document.getElementById('stClinicAddress')?.value.trim() || '',
    contactNumber: document.getElementById('stContactNumber')?.value.trim() || '',
    prcNo:         document.getElementById('stPRCNo')?.value.trim()         || '',
    ptrNo:         document.getElementById('stPTRNo')?.value.trim()         || '',
    ptrDateIssued: document.getElementById('stPTRDateIssued')?.value        || '',
    ptrValidUntil: document.getElementById('stPTRValidUntil')?.value        || '',
    ptrPlaceIssued:document.getElementById('stPTRPlaceIssued')?.value.trim()|| '',
    s2No:          document.getElementById('stS2No')?.value.trim()          || '',
    updatedAt:     serverTimestamp(),
    updatedBy:     currentUser?.email || 'unknown',
  };

  try {
    await setDoc(doc(db, 'clinicSettings', 'doctorProfile'), data, { merge: true });

    RX_CONFIG = { ...RX_CONFIG, ...data };

    _updatePTRStatusPill();
    checkPTRExpiry();

    if (statusEl) {
      statusEl.textContent = 'Saved successfully';
      statusEl.style.color = 'var(--green)';
      setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, 3000);
    }

    logAudit('Clinic settings updated', 'edit');
    showAlert('Clinic settings saved successfully.', 'success');
  } catch (err) {
    console.error('Save settings failed:', err);
    if (statusEl) { statusEl.textContent = 'Failed to save.'; statusEl.style.color = 'var(--red)'; }
    showAlert('Failed to save settings: ' + err.message, 'error');
  }
};

// =============================================================// CHECK PTR EXPIRY
window.checkPTRExpiry = () => {
  const banner = document.getElementById('bannerPTR');
  const msg    = document.getElementById('bannerPTRMsg');
  const icon   = document.getElementById('bannerPTRIcon');
  if (!banner || !msg) return;

  if (!RX_CONFIG.ptrValidUntil) { banner.classList.remove('show'); return; }

  const today  = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(RX_CONFIG.ptrValidUntil + 'T00:00:00');
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    banner.className = 'banner-ptr show expired';
    icon.textContent = '';
    msg.textContent  = `Your PTR number (${RX_CONFIG.ptrNo || 'not set'}) expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago. Official documents printed with an expired PTR may be invalid.`;
  } else if (daysLeft <= 30) {
    banner.className = 'banner-ptr show expiring';
    icon.textContent = '';
    msg.textContent  = `Your PTR number (${RX_CONFIG.ptrNo || 'not set'}) expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${expiry.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}). Renew and update it to avoid printing issues.`;
  } else {
    banner.classList.remove('show');
  }
};

window.dismissPTRBanner = () => {
  const banner = document.getElementById('bannerPTR');
  if (banner) banner.classList.remove('show');
};

// =============================================================// VALIDATE PTR BEFORE PRINTING
window.validatePTRBeforePrint = (printCallback) => {
  if (!RX_CONFIG.ptrValidUntil) {
    return _showPTRConfirm(
      'No PTR expiry date is set in Clinic Settings. Please update your PTR information to ensure documents are valid.',
      printCallback
    );
  }

  const today  = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(RX_CONFIG.ptrValidUntil + 'T00:00:00');
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return _showPTRConfirm(
      `Your PTR number expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago. Documents printed with an expired PTR may be considered invalid by pharmacies, employers, and government agencies.`,
      printCallback
    );
  }

  printCallback();
};

function _showPTRConfirm(message, printCallback) {
  const modal = document.getElementById('ptrConfirmModal');
  const msgEl = document.getElementById('ptrConfirmMsg');
  const btn   = document.getElementById('ptrConfirmPrintBtn');
  if (!modal) { printCallback(); return; }

  msgEl.textContent = message;
  modal.classList.add('open');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    modal.classList.remove('open');
    printCallback();
  });
}

window.closePTRConfirmModal = () => {
  document.getElementById('ptrConfirmModal')?.classList.remove('open');
};

// =============================================================// PATIENT ID GENERATOR
async function ensurePatientCode(patientId, patientData) {
  if (patientData.patientCode) return patientData.patientCode;

  const year = new Date().getFullYear();
  let nextNum = 1;
  try {
    const codeQuery = query(collection(db, 'patients'), where('patientCodeYear', '==', year));
    const snap = navigator.onLine
      ? await getDocs(codeQuery)
      : await getDocsFromCache(codeQuery);
    nextNum = snap.size + 1;
  } catch {
    nextNum = Number(String(Date.now()).slice(-4));
  }
  const code = `PAT-${year}-${String(nextNum).padStart(4, '0')}`;

  try {
    await updateDoc(doc(db, 'patients', patientId), {
      patientCode: code,
      patientCodeYear: year
    });
  } catch (err) {
    console.warn('Could not save patient code, using it for this Rx only:', err);
  }
  return code;
}

// =============================================================// RX ID GENERATOR
async function generateRxId() {
  const year = new Date().getFullYear();
  try {
    const rxQuery = query(collection(db, 'prescriptions'), where('rxYear', '==', year));
    const snap = navigator.onLine
      ? await getDocs(rxQuery)
      : await getDocsFromCache(rxQuery);
    const num = snap.size + 1;
    return { rxId: `RX-${year}-${String(num).padStart(6, '0')}`, rxYear: year };
  } catch {
    return { rxId: `RX-${year}-${Date.now().toString(36).toUpperCase()}`, rxYear: year };
  }
}

// =============================================================// SAVE PRESCRIPTION RECORD
async function savePrescriptionRecord({ rxId, rxYear, patientId, patientCode, patientName,
  patientAge, patientGender, diagnosis, medications, doctor, followUpDate, visitId }) {
  try {
    await setDoc(doc(db, 'prescriptions', rxId), {
      rxId, rxYear,
      patientId: patientId || null,
      patientCode: patientCode || null,
      patientName, patientAge: patientAge || null, patientGender: patientGender || null,
      diagnosis: diagnosis || '',
      medications,
      doctor: doctor || RX_CONFIG.doctorName,
      followUpDate: followUpDate || null,
      issuedBy: currentUser?.email || 'unknown',
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Failed to save prescription record:', err);
  }

  let usedVisitId = visitId || null;
  if (patientId) {
    try {
      const visitData = {
        visitDate: serverTimestamp(),
        consultationType: 'Prescription',
        diagnosis: diagnosis || '',
        medications,
        rxId,
        addedBy: currentUser?.email || 'unknown'
      };
      if (visitId) {
        await setDoc(doc(db, 'patients', patientId, 'visits', visitId), visitData, { merge: true });
      } else {
        const visitRef = await addDoc(collection(db, 'patients', patientId, 'visits'), visitData);
        usedVisitId = visitRef.id;
      }
    } catch (err) {
      console.warn('Failed to attach prescription to patient history:', err);
    }
  }
  return usedVisitId;
}

function _formatDatePH(d = new Date()) {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function _formatTimePH(d = new Date()) {
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}


function buildRxHtml({ rxId, patientName, patientAge, patientGender, patientCode, date, time,
  diagnosis, medications, doctor, followUpDate }) {

  const drugLines = medications.map(m => `
      <div class="print-drug-block">
        <div class="print-drug-name">${esc(m.drug)}</div>
        ${m.sig ? `<div class="print-drug-sig">Sig: ${esc(m.sig)}</div>` : ''}
      </div>`).join('');

  const prcLine = (RX_CONFIG.prcNo || RX_CONFIG.ptrNo)
    ? `<div class="print-rx-prc">
        ${RX_CONFIG.prcNo ? `PRC No.: ${esc(RX_CONFIG.prcNo)}<br>` : ''}
        ${RX_CONFIG.ptrNo ? `PTR No.: ${esc(RX_CONFIG.ptrNo)}` : ''}
       </div>`
    : '';
  const followUpBlock = followUpDate
    ? `<div class="print-rx-followup">Follow-Up Date: <b>${esc(followUpDate)}</b></div>`
    : '';

  return `
      <div class="print-rx-page">

        <!-- Logo (left) · Prescription ID (center) · spacer (right, keeps ID centered) -->
        <div class="print-rx-header-row">
          <div class="print-rx-logo-box">pure<br>EHC</div>
          <div class="print-rx-qr-block">
            <div class="print-rx-id">PRESCRIPTION ID: ${esc(rxId)}</div>
          </div>
          <div class="print-rx-header-spacer"></div>
        </div>

        <!-- Doctor / Clinic identity, centered below QR -->
        <div class="print-rx-doctor-name-hdr">${esc(doctor || RX_CONFIG.doctorName)}</div>
        <div class="print-rx-clinic-specialty">${esc(RX_CONFIG.specialty)}</div>
        <div class="print-rx-clinic-name-hdr">${esc(RX_CONFIG.clinicName)}</div>
        <div class="print-rx-clinic-addr">${esc(RX_CONFIG.address)}</div>

        <div class="print-rx-divider"></div>

        <!-- Date / time issued, right aligned -->
        <div class="print-rx-date-line">
          Date Issued: ${esc(date)}<br>
          Time Issued: ${esc(time)}
        </div>

        <!-- Patient info -->
        <div class="print-rx-patient-box">
          <b>Patient Name:</b> ${esc(patientName)}<br>
          <b>Age:</b> ${esc(String(patientAge || '—'))} &nbsp;&nbsp; <b>Sex:</b> ${esc(patientGender || '—')}<br>
          <b>Patient ID:</b> ${esc(patientCode || '—')}
        </div>

        ${diagnosis ? `<div class="print-rx-dx-label">Diagnosis</div><div class="print-rx-dx">${esc(diagnosis)}</div>` : ''}

        <div class="print-rx-rx-label">&#x211E;</div>
        <div class="print-rx-drugs">${drugLines}</div>

        ${followUpBlock}

        <!-- Signature footer — blank line for physical signature -->
        <div class="print-rx-footer">
          <div class="print-rx-sig-label">Physician's Signature</div>
          <div class="print-rx-sig-line"></div>
          <div class="print-rx-doctor-name">${esc(doctor || RX_CONFIG.doctorName)}</div>
          <div class="print-rx-doctor-title">${esc(RX_CONFIG.specialty)}</div>
          ${prcLine}
        </div>

        <div class="print-rx-end">(End of Prescription)</div>

        <div class="print-rx-note">Note to User: The information contained in this electronic prescription is for the prescriber's use only and does not constitute an endorsement. If any information is suspected to have been altered, please contact the issuing clinic to verify this Prescription ID against its records.</div>
      </div>`;
}

// =============================================================// PRESCRIPTION PRINTER
window.openPrescription = async (patientId) => {
  if (!isAuthorized) { doLogout(); return; }

  try {
    const snap = await getDoc(doc(db, 'patients', patientId));
    if (!snap.exists()) { showAlert('Patient not found.', 'error'); return; }
    const d = snap.data();

    const fullName = `${d.firstName || ''} ${d.middleInitial ? d.middleInitial + '. ' : ''}${d.lastName || ''}`.trim();
    const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const liveAge = d.dateOfBirth ? computeAge(d.dateOfBirth) : (d.age || '');
    document.getElementById('rxPatientName').textContent = fullName;
    document.getElementById('rxPatientAge').textContent = `${liveAge || '—'} yrs`;
    document.getElementById('rxPatientGender').textContent = d.gender || '—';
    document.getElementById('rxPatientAddr').textContent = d.address || '—';
    document.getElementById('rxDate').textContent = today;
    document.getElementById('rxDiagnosis').textContent = d.diagnosis || '';
    document.getElementById('rxAddedBy').textContent = RX_CONFIG.doctorName || currentUser.displayName || currentUser.email;
    document.getElementById('rxModal').dataset.patientId = patientId;
    document.getElementById('rxModal').dataset.patientAge = String(liveAge || '');
    document.getElementById('rxModal').dataset.patientGender = d.gender || '';
    const followUpEl = document.getElementById('rxFollowUpDate');
    if (followUpEl) followUpEl.value = '';

    renderRxLines(3);
    document.getElementById('rxModal').classList.add('open');
    const rxAllergenBanner = document.getElementById('rxAllergenBanner');
    if (rxAllergenBanner) {
      if (d.allergen) {
        rxAllergenBanner.textContent = `ALLERGEN ALERT: ${d.allergen} — Review carefully before prescribing.`;
        rxAllergenBanner.style.display = 'block';
      } else {
        rxAllergenBanner.style.display = 'none';
      }
    }
  } catch (err) {
    showAlert('Failed to load patient for prescription.', 'error');
  }
};

function renderRxLines(count) {
  const container = document.getElementById('rxLineContainer');
  container.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    container.innerHTML += `
        <div class="rx-line" id="rxLine${i}">
          <span class="rx-num">${i}.</span>
          <div class="rx-fields">
            <input class="rx-drug" type="text" placeholder="Drug name (e.g. Amoxicillin 500mg)" maxlength="100">
            <input class="rx-sig" type="text" placeholder="Sig: e.g. 1 cap TID x 7 days" maxlength="100">
          </div>
        </div>`;
  }
  container.dataset.count = count;
  container.querySelectorAll('.rx-drug').forEach(el => applyAutoCapitalize(el));
}

window.addRxLine = () => {
  const container = document.getElementById('rxLineContainer');
  const current = parseInt(container.dataset.count || 3);
  if (current >= 8) { showAlert('Maximum 8 medication lines allowed.', 'error'); return; }
  renderRxLines(current + 1);
};

window.closePrescriptionModal = () => document.getElementById('rxModal').classList.remove('open');

// =============================================================// PRINT PRESCRIPTION
window.printPrescription = async function(patientId) {
  if (!isOwner()) {
    showAlert('Only the doctor can print prescriptions.', 'error');
    return;
  }
  const lines = [];
  document.querySelectorAll('.rx-line').forEach((row, i) => {
    const drug = row.querySelector('.rx-drug')?.value.trim();
    const sig = row.querySelector('.rx-sig')?.value.trim();
    if (drug) lines.push({ num: i + 1, drug, sig });
  });
  if (!lines.length) {
    showAlert('Please enter at least one medication.', 'error');
    return;
  }
  validatePTRBeforePrint(() => _doPrintPrescription(patientId, lines));
};

async function _doPrintPrescription(patientId, lines) {
  const patientName = document.getElementById('rxPatientName').textContent;
  const modalEl = document.getElementById('rxModal');
  const patientAge = modalEl.dataset.patientAge || '';
  const patientGender = modalEl.dataset.patientGender || '';
  const diagnosis = document.getElementById('rxDiagnosis').textContent;
  const doctor = document.getElementById('rxAddedBy').textContent;
  const followUpDate = (document.getElementById('rxFollowUpDate')?.value || '').trim();

  const today = new Date();
  const dateStr = _formatDatePH(today);
  const timeStr = _formatTimePH(today);

  showAlert('Generating prescription…', 'info');

  let patientCode = '';
  try {
    const pSnap = await getDoc(doc(db, 'patients', patientId));
    const pData = pSnap.exists() ? pSnap.data() : {};
    patientCode = await ensurePatientCode(patientId, pData);
  } catch (err) {
    console.warn('Could not load/assign patient code:', err);
  }
  const { rxId, rxYear } = await generateRxId();

  await savePrescriptionRecord({
    rxId, rxYear, patientId, patientCode, patientName,
    patientAge, patientGender, diagnosis, medications: lines, doctor, followUpDate
  });

  document.getElementById('prescriptionPrintArea').innerHTML = buildRxHtml({
    rxId,
    patientName,
    patientAge,
    patientGender,
    patientCode,
    date: dateStr,
    time: timeStr,
    diagnosis,
    medications: lines,
    doctor,
    followUpDate
  });

  closeAlert();
  const rxPrintArea4 = document.getElementById('prescriptionPrintArea');
  rxPrintArea4.classList.add('printing');
  _printOrDownload(rxPrintArea4, `Prescription_${rxId}`);

  logAudit(`Prescription ${rxId} printed for: ${patientName}`, 'edit', patientId);
};
function setMinDates() {
  const today = new Date().toISOString().split('T')[0];
  const aDate = document.getElementById('aDate');
  const eaDate = document.getElementById('eaDate');
  if (aDate) aDate.min = today;
  if (eaDate) eaDate.min = today;
  const fDOB = document.getElementById('fDOB');
  const eDOB = document.getElementById('eDOB');
  if (fDOB) fDOB.max = today;
  if (eDOB) eDOB.max = today;
}


window.switchTab = function (tabName) {
  const cap = tabName.charAt(0).toUpperCase() + tabName.slice(1);
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tabBtn = document.getElementById('tab' + cap + 'Btn') || document.getElementById('tab' + cap);
  if (tabBtn) tabBtn.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  const tabContent = document.getElementById('tabContent' + cap);
  if (tabContent) tabContent.classList.add('active');

  if (tabName === 'appointments') {
    if (typeof loadAppointments === 'function') loadAppointments();
    if (typeof renderCalendar === 'function') renderCalendar();
  }
  if (tabName === 'dashboard') {
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
  }
  if (tabName === 'settings') {
    if (typeof loadClinicSettings === 'function') loadClinicSettings();
  }
  if (tabName === 'reports') {
    if (typeof initMorbidityReportTab === 'function') initMorbidityReportTab();
  }
  if (tabName === 'staff') {
    if (typeof loadStaffList === 'function') loadStaffList();
  }
};


// =============================================================// CHIEF COMPLAINT CATEGORIES (for morbidity reporting)
const CHIEF_COMPLAINT_CATEGORIES = [
  'Acute Respiratory Infection (Cough/Colds)',
  'Hypertension',
  'Fever',
  'Urinary Tract Infection',
  'Acute Gastroenteritis / Diarrhea',
  'Diabetes Mellitus',
  'Skin Disease / Allergy',
  'Headache / Migraine',
  'Musculoskeletal Pain (Back/Joint Pain)',
  'Bronchitis / Pneumonia',
  'Wounds / Injuries',
  'Dyspepsia / Abdominal Pain',
  'Asthma',
  'Ear Infection (Otitis Media)',
  'Allergic Rhinitis',
  'Other'
];

function _populateComplaintCategorySelect(selectEl) {
  if (!selectEl || selectEl.dataset.populated) return;
  selectEl.innerHTML = '<option value="">Select category (optional)</option>' +
    CHIEF_COMPLAINT_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  selectEl.dataset.populated = '1';
}

function initComplaintCategorySelects() {
  _populateComplaintCategorySelect(document.getElementById('fComplaintCategory'));
  _populateComplaintCategorySelect(document.getElementById('vComplaintCategory'));
}

// =============================================================// MORBIDITY REPORT (Reports tab)
let _lastMorbidityReport = null;

function _fmtDateInput(d) {
  return d.toISOString().slice(0, 10);
}

window.applyReportQuickRange = () => {
  const sel = document.getElementById('repQuickRange');
  const startEl = document.getElementById('repStartDate');
  const endEl = document.getElementById('repEndDate');
  const now = new Date();
  let start, end;

  switch (sel.value) {
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'last30':
      end = now;
      start = new Date(now);
      start.setDate(start.getDate() - 29);
      break;
    case 'thisYear':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    default:
      return;
  }
  startEl.value = _fmtDateInput(start);
  endEl.value = _fmtDateInput(end);
};

function initMorbidityReportTab() {
  const startEl = document.getElementById('repStartDate');
  const endEl = document.getElementById('repEndDate');
  if (!startEl || !endEl) return;
  let isFirstOpen = false;
  if (!startEl.value && !endEl.value) {
    applyReportQuickRange();
    isFirstOpen = true;
  }
  loadReportsSummaryStats();
  if (isFirstOpen || !_lastMorbidityReport) generateMorbidityReport();
}

async function loadReportsSummaryStats() {
  const totalPatientsEl = document.getElementById('repStatTotalPatients');
  const cashTodayEl = document.getElementById('repStatCashToday');
  if (!totalPatientsEl || !cashTodayEl) return;
  try {
    const patSnap = await getDocs(
      query(collection(db, 'patients'), where('deleted', '==', false))
    );
    totalPatientsEl.textContent = patSnap.size;

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const visitsTodaySnap = await getDocs(
      query(collectionGroup(db, 'visits'),
        where('visitDate', '>=', startOfDay),
        where('visitDate', '<=', endOfDay))
    );
    let cashTotal = 0;
    visitsTodaySnap.forEach(vDoc => {
      const v = vDoc.data();
      if (v.feeMethod === 'Cash' && v.feeStatus !== 'Waived') {
        cashTotal += (v.fee || 0);
      }
    });
    cashTodayEl.textContent = '₱' + cashTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 });
  } catch (err) {
    console.warn('Reports summary stats failed:', err);
    totalPatientsEl.textContent = '—';
    cashTodayEl.textContent = '—';
  }
}

window.generateMorbidityReport = async () => {
  const startEl = document.getElementById('repStartDate');
  const endEl = document.getElementById('repEndDate');
  const tbody = document.getElementById('morbidityReportTbody');
  const summaryEl = document.getElementById('morbidityReportSummary');

  if (!startEl.value || !endEl.value) {
    showAlert('Please choose a start and end date.', 'error');
    return;
  }
  const startDate = new Date(startEl.value + 'T00:00:00');
  const endDate = new Date(endEl.value + 'T23:59:59.999');
  if (startDate > endDate) {
    showAlert('Start date must be before end date.', 'error');
    return;
  }

  const btn = document.getElementById('btnGenerateMorbidityReport');
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--g400);padding:20px;">Loading visits…</td></tr>';
  summaryEl.textContent = '';

  try {
    const snap = await getDocs(
      query(collectionGroup(db, 'visits'),
        where('visitDate', '>=', startDate),
        where('visitDate', '<=', endDate))
    );

    const counts = {};
    let totalVisits = 0;
    snap.forEach(vDoc => {
      const v = vDoc.data();
      totalVisits++;
      const cat = (v.complaintCategory && v.complaintCategory.trim()) || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const rows = Object.entries(counts)
      .map(([category, count]) => ({
        category,
        count,
        pct: totalVisits ? (count / totalVisits * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    _lastMorbidityReport = { startDate: startEl.value, endDate: endEl.value, totalVisits, rows };

    const top10 = rows.slice(0, 10);
    if (top10.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--g400);padding:20px;">No visits recorded in this date range.</td></tr>';
    } else {
      tbody.innerHTML = top10.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(r.category)}</td>
          <td>${r.count}</td>
          <td>${r.pct.toFixed(1)}%</td>
        </tr>
      `).join('');
    }

    summaryEl.textContent = `${totalVisits} visit${totalVisits === 1 ? '' : 's'} from ${startEl.value} to ${endEl.value}` +
      (rows.length > 10 ? ` — showing top 10 of ${rows.length} categories.` : '') +
      (counts['Uncategorized'] ? ` ${counts['Uncategorized']} visit(s) have no chief complaint category recorded.` : '');
  } catch (err) {
    console.warn('Morbidity report failed:', err);
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--g400);padding:20px;">Could not load report — check console.</td></tr>';
    showAlert('Failed to generate report. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
};

window.exportMorbidityReportCSV = () => {
  if (!_lastMorbidityReport || !_lastMorbidityReport.rows.length) {
    showAlert('Generate a report first before exporting.', 'error');
    return;
  }
  const { startDate, endDate, totalVisits, rows } = _lastMorbidityReport;
  const top10 = rows.slice(0, 10);
  const lines = [
    ['Leading Causes of Morbidity'],
    [`Period: ${startDate} to ${endDate}`],
    [`Total Visits: ${totalVisits}`],
    [],
    ['Rank', 'Chief Complaint Category', 'Number', 'Percent'],
    ...top10.map((r, i) => [i + 1, r.category, r.count, r.pct.toFixed(1) + '%'])
  ];
  const csv = lines.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `morbidity-report_${startDate}_to_${endDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// =============================================================// APPOINTMENT SCHEDULING MODULE

const APPT_STATUS = ['Scheduled', 'Confirmed', 'Checked-in', 'Completed', 'Cancelled', 'No-show'];
const APPT_TYPES = ['General Checkup', 'Follow-up', 'Consultation', 'Emergency', 'Vaccination', 'Lab Review'];


// =============================================================// PATIENT SEARCH FOR APPOINTMENTS
window.searchPatientForAppointment = async () => {
  const raw = document.getElementById('apptPatientSearch').value.trim();
  const resultsBox = document.getElementById('apptPatientResults');

  if (!raw || raw.length < 2) {
    resultsBox.style.display = 'none';
    resultsBox.innerHTML = '';
    return;
  }

  const term = raw.toLowerCase();
  resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--g400)">Searching…</div>';
  resultsBox.style.display = 'block';

  try {
    const snap = await getDocs(query(collection(db, 'patients'), orderBy('lastName')));
    const matches = [];

    snap.forEach(s => {
      const d = s.data();
      if (d.deleted) return;
      const full = `${(d.firstName || '').toLowerCase()} ${(d.lastName || '').toLowerCase()}`;
      const rev = `${(d.lastName || '').toLowerCase()} ${(d.firstName || '').toLowerCase()}`;
      if (full.includes(term) || rev.includes(term)) {
        matches.push({ id: s.id, ...d });
      }
    });

    if (!matches.length) {
      resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--g400)">No existing patient found. Fill form manually.</div>';
      return;
    }

    resultsBox.innerHTML = matches.slice(0, 6).map(p => `
      <div class="search-result-row" onclick="selectPatientForAppointment('${p.id}', '${esc(p.firstName)}', '${esc(p.lastName)}', '${esc(p.middleInitial || '')}', '${esc(p.phone || '')}')">
        <div class="sr-name">${esc(p.firstName)} ${p.middleInitial ? esc(p.middleInitial) + '. ' : ''}${esc(p.lastName)}</div>
        <div class="sr-meta">${p.age || '—'}/${p.gender || '—'} &nbsp;·&nbsp; ${p.phone ? esc(p.phone) : '—'}</div>
      </div>`).join('');
  } catch (err) {
    console.error('Patient search error:', err);
    resultsBox.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--red)">Search failed.</div>';
  }
};

window.selectPatientForAppointment = (patientId, firstName, lastName, middleInitial, phone) => {
  document.getElementById('apptPatientId').value = patientId;
  document.getElementById('aFirstName').value = firstName || '';
  document.getElementById('aLastName').value = lastName || '';
  document.getElementById('aMiddle').value = middleInitial || '';
  document.getElementById('aPhone').value = phone || '';
  document.getElementById('apptPatientSearch').value =
    `${firstName || ''} ${middleInitial ? middleInitial + '. ' : ''}${lastName || ''}`.trim();
  document.getElementById('apptPatientResults').style.display = 'none';

  ['aFirstName', 'aLastName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
};
function validateAppointment(data) {
  const errs = [];
  const today = new Date().toISOString().split('T')[0];
  if (!NAME_RE.test(data.patientFirstName)) errs.push({ f: 'aFirstName', m: 'Invalid first name.' });
  if (!NAME_RE.test(data.patientLastName)) errs.push({ f: 'aLastName', m: 'Invalid last name.' });
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errs.push({ f: 'aDate', m: 'Pick a valid date.' });
  } else if (data.date < today) {
    errs.push({ f: 'aDate', m: 'Appointment date cannot be in the past.' });
  }
  if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) errs.push({ f: 'aTime', m: 'Pick a valid time.' });
  if (!APPT_TYPES.includes(data.type)) errs.push({ f: 'aType', m: 'Select appointment type.' });
  if (data.phone && !PHONE_RE.test(data.phone)) errs.push({ f: 'aPhone', m: 'Invalid phone.' });
  if (data.notes?.length > 1000) errs.push({ f: 'aNotes', m: 'Max 1,000 chars.' });
  return errs;
}
function fmtApptDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtApptTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function apptStatusClass(status) {
  const map = {
    'Scheduled': 'badge-general',
    'Confirmed': 'badge-followup',
    'Checked-in': 'badge-vaccination',
    'Completed': 'badge-consultation',
    'Cancelled': 'badge-emergency',
    'No-show': 'badge-default'
  };
  return map[status] || 'badge-default';
}
window.submitAppointment = async (e) => {
  e.preventDefault();
  if (!isAuthorized) { doLogout(); return; }
  if (_busy) return;
  if (!rateLimit('appointment', 10, 60 * 1000)) {
    showRateBanner(30);
    showAlert('Too many submissions. Please slow down.', 'error');
    return;
  }

  clearErrs();

  const data = {
    patientId: document.getElementById('apptPatientId').value || null,
    patientFirstName: document.getElementById('aFirstName').value.trim(),
    patientLastName: document.getElementById('aLastName').value.trim(),
    patientMiddleInitial: document.getElementById('aMiddle').value.trim().toUpperCase(),
    date: document.getElementById('aDate').value,
    time: document.getElementById('aTime').value,
    type: document.getElementById('aType').value,
    phone: document.getElementById('aPhone').value.trim(),
    notes: document.getElementById('aNotes').value.trim(),
    status: 'Scheduled',
    createdAt: serverTimestamp(),
    createdBy: currentUser?.email || 'unknown',
    deleted: false
  };

  const errs = validateAppointment(data);
  if (errs.length) { showErrs(errs); return; }
  if (!sizeOk(data)) { showAlert('Submission too large.', 'error'); return; }
  try {
    const conflictQ = query(
      collection(db, 'appointments'),
      where('date', '==', data.date),
      where('time', '==', data.time),
      where('deleted', '==', false)
    );
    const conflictSnap = await getDocs(conflictQ);
    if (!conflictSnap.empty) {
      showAlert('This time slot is already booked. Please choose another time.', 'error');
      return;
    }
  } catch (err) {
    console.warn('Conflict check failed:', err);
  }

  lockBtn('btnAddAppt', 'Booking…');

  try {
    const docRef = await addDoc(collection(db, 'appointments'), data);
    const apptResult = document.getElementById('appointmentResult');
    apptResult.innerHTML = `<span style="color:#059669;font-weight:600;">Appointment booked successfully (ID: ${docRef.id})</span>`;
    setTimeout(() => { apptResult.innerHTML = ''; }, 4000);
    document.getElementById('appointmentForm').reset();
    clearErrs();
    logAudit(`Appointment booked: ${esc(data.patientFirstName)} ${esc(data.patientLastName)} — ${data.date} ${data.time}`, 'add');
    loadAppointments();
    renderCalendar();
    loadDashboardStats(); 
  } catch (err) {
    console.error(err);
    showAlert(err.message || 'Failed to book appointment.', 'error');
  } finally {
    unlockBtn('btnAddAppt', 'Book Appointment');
  }
};

// =============================================================// LOAD APPOINTMENTS

const APPTS_PER_PAGE = 10;
let _apptPage = 1;

window.loadAppointments = async (resetPage = true) => {
  if (resetPage) _apptPage = 1;
  const tbody = document.getElementById('appointmentTbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:#94a3b8;font-size:13px;">Loading appointments…</td></tr>`;

  const search = document.getElementById('apptSearchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('apptStatusFilter').value;
  const dateFilter = document.getElementById('apptDateFilter').value;
  const sortOpt = document.getElementById('apptSortSelect').value;

  let q;
    if (sortOpt === 'date') {
      q = query(collection(db, 'appointments'), orderBy('date'));
    } else if (sortOpt === 'name') {
      q = query(collection(db, 'appointments'), orderBy('patientLastName'));
    } else {
      q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
    }


  try {
    const snap = await getDocs(q);

    const matched = [];
    snap.forEach(s => {
      const d = s.data();
      if (d.deleted) return;

      const name = `${d.patientFirstName || ''} ${d.patientMiddleInitial ? d.patientMiddleInitial + '. ' : ''}${d.patientLastName || ''}`.trim();

      if (search && !name.toLowerCase().includes(search) && !d.phone?.includes(search)) return;
      if (statusFilter && d.status !== statusFilter) return;
      if (dateFilter && d.date !== dateFilter) return;

      matched.push({ id: s.id, d, name });
    });

    const totalPages = Math.max(1, Math.ceil(matched.length / APPTS_PER_PAGE));
    _apptPage = Math.min(Math.max(1, _apptPage), totalPages);
    const startIdx = (_apptPage - 1) * APPTS_PER_PAGE;
    const pageItems = matched.slice(startIdx, startIdx + APPTS_PER_PAGE);

    tbody.innerHTML = '';

    pageItems.forEach(({ id, d, name }) => {
      const row = document.createElement('tr');
      const mk = (txt, cls) => {
        const t = document.createElement('td');
        if (cls) t.className = cls;
        t.textContent = txt;
        return t;
      };

      const actTd = document.createElement('td');
      const acts = document.createElement('div');
      acts.className = 'row-actions';

      const statusSelect = document.createElement('select');
      statusSelect.className = 'appt-status-select';
      statusSelect.style.cssText = 'padding:4px 8px;border:1.5px solid var(--g200);border-radius:4px;font-size:12px;font-family:Inter,sans-serif;color:var(--g700);background:var(--g0);cursor:pointer;';
      APPT_STATUS.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (d.status === st) opt.selected = true;
        statusSelect.appendChild(opt);
      });
      statusSelect.onchange = () => updateAppointmentStatus(id, statusSelect.value);
      acts.appendChild(statusSelect);

      const eb = document.createElement('button');
      eb.className = 'btn-row btn-edit';
      eb.textContent = 'Edit';
      eb.onclick = () => openEditAppointment(id);
      acts.appendChild(eb);

      const db_ = document.createElement('button');
      db_.className = 'btn-row btn-archive';
      db_.textContent = 'Cancel';
      db_.onclick = () => cancelAppointment(id, name);
      acts.appendChild(db_);

      actTd.appendChild(acts);

      row.appendChild(mk(fmtApptDate(d.date), 'td-date'));
      row.appendChild(mk(fmtApptTime(d.time)));
      row.appendChild(mk(name, 'td-name'));
      row.appendChild(mk(d.type || '—'));
      row.appendChild(mk(d.phone || '—'));
      const statusTd = document.createElement('td');
      statusTd.innerHTML = `<span class="badge ${apptStatusClass(d.status)}">${esc(d.status || 'Scheduled')}</span>`;
      row.appendChild(statusTd);
      row.appendChild(actTd);
      tbody.appendChild(row);
    });

    if (!matched.length) {
      const er = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg><p>${search || statusFilter || dateFilter ? 'No appointments match your filters.' : 'No appointments scheduled yet.'}</p></div>`;
      er.appendChild(td);
      tbody.appendChild(er);
    }

    renderPagination(
      document.getElementById('apptPagination'),
      matched.length, _apptPage, APPTS_PER_PAGE,
      (newPage) => { _apptPage = newPage; loadAppointments(false); }
    );
  } catch (err) {
    console.error(err);
    showAlert('Failed to load appointments.', 'error');
  }
};

// =============================================================// UPDATE APPOINTMENT STATUS
window.updateAppointmentStatus = async (id, newStatus) => {
  if (!isAuthorized) { doLogout(); return; }
  if (!rateLimit('apptStatus', 20, 60 * 1000)) return;

  try {
    await updateDoc(doc(db, 'appointments', id), {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || 'unknown'
    });
    logAudit(`Status updated to ${newStatus} for appointment …${id.slice(-6)}`, 'edit');
    loadAppointments();
    renderCalendar();
    loadDashboardStats(); 
  } catch {
    showAlert('Failed to update status.', 'error');
  }
};

// =============================================================// CANCEL APPOINTMENT
window.cancelAppointment = async (id, patientName) => {
  if (!isAuthorized) { doLogout(); return; }
  if (!(await showConfirm(`Cancel appointment for ${patientName || 'this patient'}?`, { confirmText: 'Cancel Appointment', danger: true }))) return;

  try {
    await updateDoc(doc(db, 'appointments', id), {
      deleted: true,
      status: 'Cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: currentUser?.email || 'unknown'
    });
    logAudit(`Cancelled appointment for: ${patientName || 'unknown'}`, 'delete');
    loadAppointments();
    renderCalendar();
    loadDashboardStats(); 
  } catch {
    showAlert('Failed to cancel appointment.', 'error');
  }
};

// =============================================================// OPEN EDIT APPOINTMENT MODAL
window.openEditAppointment = async (id) => {
  if (!isAuthorized) { doLogout(); return; }
  if (!rateLimit('apptEdit', 15, 60 * 1000)) { showRateBanner(15); return; }

  try {
    const snap = await getDoc(doc(db, 'appointments', id));
    if (!snap.exists()) { showAlert('Appointment not found.', 'error'); return; }
    const d = snap.data();

    document.getElementById('eaDocId').value = id;
    document.getElementById('eaFirstName').value = d.patientFirstName || '';
    document.getElementById('eaLastName').value = d.patientLastName || '';
    document.getElementById('eaMiddle').value = d.patientMiddleInitial || '';
    document.getElementById('eaDate').value = d.date || '';
    document.getElementById('eaTime').value = d.time || '';
    document.getElementById('eaType').value = d.type || '';
    document.getElementById('eaPhone').value = d.phone || '';
    document.getElementById('eaNotes').value = d.notes || '';
    document.getElementById('eaStatus').value = d.status || 'Scheduled';

    clearErrs();
    document.getElementById('editApptModal').classList.add('open');
  } catch {
    showAlert('Failed to load appointment.', 'error');
  }
};

window.closeEditApptModal = () => document.getElementById('editApptModal').classList.remove('open');

// =============================================================// SUBMIT EDIT APPOINTMENT
window.submitEditAppointment = async (e) => {
  e.preventDefault();
  if (!isAuthorized) { doLogout(); return; }
  if (_busy) return;

  clearErrs();
  const id = document.getElementById('eaDocId').value;

  const data = {
    patientFirstName: document.getElementById('eaFirstName').value.trim(),
    patientLastName: document.getElementById('eaLastName').value.trim(),
    patientMiddleInitial: document.getElementById('eaMiddle').value.trim().toUpperCase(),
    date: document.getElementById('eaDate').value,
    time: document.getElementById('eaTime').value,
    type: document.getElementById('eaType').value,
    phone: document.getElementById('eaPhone').value.trim(),
    notes: document.getElementById('eaNotes').value.trim(),
    status: document.getElementById('eaStatus').value,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || 'unknown'
  };

  const errs = validateAppointment(data);
  if (errs.length) { showErrs(errs); return; }

  lockBtn('btnSaveAppt', 'Saving…');
  try {
    await updateDoc(doc(db, 'appointments', id), data);
    logAudit(`Edited appointment: ${esc(data.patientFirstName)} ${esc(data.patientLastName)}`, 'edit');
    closeEditApptModal();
    showAlert('Appointment updated successfully.');
    loadAppointments();
    renderCalendar();
  } catch {
    showAlert('Failed to update appointment.', 'error');
  } finally {
    unlockBtn('btnSaveAppt', 'Save Changes');
  }
};

// =============================================================// CALENDAR VIEW
let _calCurrentDate = new Date();

window.renderCalendar = async () => {
  const year = _calCurrentDate.getFullYear();
  const month = _calCurrentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  document.getElementById('calMonthYear').textContent =
    firstDay.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach(dn => {
    const th = document.createElement('div');
    th.className = 'cal-day-header';
    th.textContent = dn;
    grid.appendChild(th);
  });

  const monthStr = String(month + 1).padStart(2, '0');
  const yearStr = String(year);
  let monthAppointments = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'appointments'), where('deleted', '==', false), orderBy('date'))
    );
    snap.forEach(s => {
      const d = s.data();
      if (d.date && d.date.startsWith(`${yearStr}-${monthStr}`)) {
        monthAppointments.push({ id: s.id, ...d });
      }
    });
  } catch (err) {
    console.warn('Calendar fetch error:', err);
  }

  for (let i = 0; i < startDayOfWeek; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day-empty';
    grid.appendChild(empty);
  }

  const today = new Date();
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day' + (isToday(day) ? ' cal-day-today' : '');

    const dayNum = document.createElement('div');
    dayNum.className = 'cal-day-num';
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    const dayAppts = monthAppointments.filter(a => {
      const aDay = parseInt(a.date.split('-')[2], 10);
      return aDay === day;
    });

    if (dayAppts.length) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      dayAppts.slice(0, 4).forEach(a => {
        const dot = document.createElement('span');
        dot.className = 'cal-dot ' + apptStatusClass(a.status).replace('badge-', 'cal-dot-');
        dot.title = `${a.patientFirstName} ${a.patientLastName} — ${a.time} — ${a.status}`;
        dots.appendChild(dot);
      });
      if (dayAppts.length > 4) {
        const more = document.createElement('span');
        more.className = 'cal-dot cal-dot-more';
        more.textContent = '+' + (dayAppts.length - 4);
        dots.appendChild(more);
      }
      cell.appendChild(dots);

      cell.style.cursor = 'pointer';
      cell.onclick = () => {
        document.getElementById('apptDateFilter').value =
          `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
        loadAppointments();
        document.getElementById('appointmentTbody').scrollIntoView({ behavior: 'smooth' });
      };
    }

    grid.appendChild(cell);
  }
};

window.prevMonth = () => {
  _calCurrentDate.setMonth(_calCurrentDate.getMonth() - 1);
  renderCalendar();
};
window.nextMonth = () => {
  _calCurrentDate.setMonth(_calCurrentDate.getMonth() + 1);
  renderCalendar();
};
window.goToToday = () => {
  _calCurrentDate = new Date();
  renderCalendar();
};

// =============================================================// APPOINTMENT PDF EXPORT
const _exportSelectedApptPatients = new Set();

window.exportAppointments = async () => {
  if (!isAuthorized) { doLogout(); return; }
  _exportSelectedApptPatients.clear();
  document.getElementById('apptExportPickerSearch').value = '';
  _updateApptExportBtn();

  document.getElementById('apptExportPickerModal').classList.add('open');

  const label = document.getElementById('apptExportStatusLabel');
  if (label) label.textContent = "Showing Today's Patients";

  document.getElementById('apptExportPickerList').innerHTML =
    '<p style="color:var(--g400);font-size:13px;padding:8px 10px">Loading today\'s patients…</p>';

  _todayApptPatients = await _fetchTodayPatients();
  _renderApptExportList(_todayApptPatients);
};

window.closeApptExportPickerModal = () => {
  document.getElementById('apptExportPickerModal').classList.remove('open');
  _exportSelectedApptPatients.clear();
};

function _updateApptExportBtn() {
  const btn = document.getElementById('btnDoApptExportPDF');
  if (!btn) return;
  const count = _exportSelectedApptPatients.size;
  btn.textContent = count > 0 ? `Export PDF (${count} patient${count > 1 ? 's' : ''})` : 'Export PDF';
  btn.disabled = count === 0;
  btn.style.opacity = count === 0 ? '.4' : '1';
  btn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
  const countEl = document.getElementById('apptExportSelectedCount');
  if (countEl) countEl.textContent = `Selected: ${count} patient${count !== 1 ? 's' : ''}`;
}

window.toggleApptExportPatient = (key) => {
  if (_exportSelectedApptPatients.has(key)) {
    _exportSelectedApptPatients.delete(key);
  } else {
    _exportSelectedApptPatients.add(key);
  }
  const safeKey = key.replace(/[^a-z0-9_]/g, '_');
  const cb = document.getElementById(`aepick_${safeKey}`);
  if (cb) cb.checked = _exportSelectedApptPatients.has(key);
  const row = document.getElementById(`aepickrow_${safeKey}`);
  if (row) row.style.background = _exportSelectedApptPatients.has(key) ? 'var(--blue-pale)' : '';
  _updateApptExportBtn();
};
function _renderApptExportList(patients) {
  const box = document.getElementById('apptExportPickerList');
  if (!patients || patients.length === 0) {
    box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">No patients scheduled for today.</p>';
    return;
  }
  box.innerHTML = patients.map(p => {
    const name = `${p.firstName||''} ${p.middleInitial ? p.middleInitial+'. ' : ''}${p.lastName||''}`.trim();
    const key = p.key || `${(p.firstName||'').toLowerCase()}_${(p.lastName||'').toLowerCase()}`;
    const safeKey = key.replace(/[^a-z0-9_]/g, '_');
    const checked = _exportSelectedApptPatients.has(key);
    return `
      <div id="aepickrow_${safeKey}" class="export-pick-row"
        style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:11px 14px;border-bottom:1px solid var(--g100);transition:background .1s;${checked?'background:var(--blue-pale)':''}"
        onclick="toggleApptExportPatient('${key}')">
        <input type="checkbox" id="aepick_${safeKey}" ${checked ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--blue);flex-shrink:0;cursor:pointer"
          onclick="event.stopPropagation();toggleApptExportPatient('${key}')">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:600;color:var(--g800)">${esc(name)}</div>
          <div style="font-size:11.5px;color:var(--g400)">Appointment today</div>
        </div>
      </div>`;
  }).join('');
}
window.searchApptExportPatient = async () => {
  const raw = document.getElementById('apptExportPickerSearch').value.trim();
  const box = document.getElementById('apptExportPickerList');
  const label = document.getElementById('apptExportStatusLabel');

  if (raw.length === 0) {
    if (label) label.textContent = "Showing Today's Patients";
    _renderApptExportList(_todayApptPatients);
    return;
  }

  if (raw.length < 2) return;

  if (label) label.textContent = 'Search Results';

  const term = raw.toLowerCase();

  const cached = _todayApptPatients.filter(p => {
    const full = `${(p.firstName||'').toLowerCase()} ${(p.lastName||'').toLowerCase()}`;
    const rev  = `${(p.lastName||'').toLowerCase()} ${(p.firstName||'').toLowerCase()}`;
    return full.includes(term) || rev.includes(term);
  });

  if (cached.length > 0) {
    _renderApptExportList(cached);
    return;
  }

  box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">Searching all appointments…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'appointments'), orderBy('patientLastName')));
    const seen = new Set();
    const matches = [];
    snap.forEach(s => {
      const d = s.data();
      if (d.deleted) return;
      const full = `${(d.patientFirstName||'').toLowerCase()} ${(d.patientLastName||'').toLowerCase()}`;
      const rev  = `${(d.patientLastName||'').toLowerCase()} ${(d.patientFirstName||'').toLowerCase()}`;
      const key  = `${(d.patientFirstName||'').toLowerCase()}_${(d.patientLastName||'').toLowerCase()}`;
      if ((full.includes(term) || rev.includes(term)) && !seen.has(key)) {
        seen.add(key);
        matches.push({ key, firstName: d.patientFirstName, lastName: d.patientLastName, middleInitial: d.patientMiddleInitial||'' });
      }
    });
    if (!matches.length) {
      box.innerHTML = '<p style="color:var(--g400);font-size:13px;padding:8px 10px">No patients found.</p>';
      return;
    }
    _renderApptExportList(matches.slice(0, 15));
  } catch {
    box.innerHTML = '<p style="color:var(--red);font-size:13px;padding:8px 10px">Search failed. Please try again.</p>';
  }
};
window.toggleSelectAllAppt = (checked) => {
  document.querySelectorAll('#apptExportPickerList .export-pick-row').forEach(row => {
    const safeKey = row.id.replace('aepickrow_', '');
    const cb = document.getElementById(`aepick_${safeKey}`);
    if (!cb) return;
    const rowEl = document.getElementById(`aepickrow_${safeKey}`);
    const onclickVal = rowEl?.getAttribute('onclick') || '';
    const match = onclickVal.match(/toggleApptExportPatient\('(.+?)'\)/);
    if (!match) return;
    const key = match[1];
    if (checked && !_exportSelectedApptPatients.has(key)) toggleApptExportPatient(key);
    if (!checked && _exportSelectedApptPatients.has(key)) toggleApptExportPatient(key);
  });
};

window.clearApptExportSelection = () => {
  _exportSelectedApptPatients.clear();
  document.querySelectorAll('#apptExportPickerList .export-pick-row').forEach(row => {
    const safeKey = row.id.replace('aepickrow_', '');
    const cb = document.getElementById(`aepick_${safeKey}`);
    if (cb) cb.checked = false;
    row.style.background = '';
  });
  const selectAll = document.getElementById('apptExportSelectAll');
  if (selectAll) selectAll.checked = false;
  _updateApptExportBtn();
};
window.generateApptPDF = async () => {
  if (_exportSelectedApptPatients.size === 0) return;
  const selectedKeys = [..._exportSelectedApptPatients];
  closeApptExportPickerModal();
  showAlert('Generating PDF… please wait.', 'info');

  const exportDate = new Date().toLocaleDateString('en-PH', {
    year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'
  });

  try {
    let allPagesHtml = '';

    for (const key of selectedKeys) {
      const [firstName, lastName] = key.split('_');
      const snap = await getDocs(query(collection(db, 'appointments'), orderBy('date')));
      const appts = [];
      snap.forEach(s => {
        const d = s.data();
        if (d.deleted) return;
        if ((d.patientFirstName||'').toLowerCase() === firstName &&
            (d.patientLastName||'').toLowerCase() === lastName)
          appts.push(d);
      });

      const fullName = appts[0]
        ? `${appts[0].patientFirstName||''} ${appts[0].patientMiddleInitial ? appts[0].patientMiddleInitial+'. ' : ''}${appts[0].patientLastName||''}`.trim()
        : `${firstName} ${lastName}`;

      const rows = !appts.length
        ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;font-style:italic">No appointments found.</td></tr>`
        : appts.map(a => `
          <tr>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:11px">${fmtApptDate(a.date)}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:11px">${fmtApptTime(a.time)}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:11px">${a.type||'—'}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:11px">
              <span style="background:${a.status==='Completed'?'#f0fdf4':a.status==='Cancelled'?'#fff1f2':'#eef4ff'};color:${a.status==='Completed'?'#166534':a.status==='Cancelled'?'#dc2626':'#1748b8'};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">${a.status||'Scheduled'}</span>
            </td>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${a.notes||'—'}</td>
          </tr>`).join('');

      allPagesHtml += `
        <div style="page-break-after:always;padding:16mm 18mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#1e293b">
          <div style="border-bottom:3px solid #0b1d3a;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:20px;font-weight:900;color:#0b1d3a">pureEHC Clinic Service</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px">University of Iloilo, Iloilo City</div>
              <div style="font-size:11px;color:#64748b">Appointment History Export</div>
            </div>
            <div style="font-size:10px;color:#94a3b8;text-align:right">
              <div>Exported by: ${currentUser?.email||'unknown'}</div>
              <div>Date: ${exportDate}</div>
              <div style="font-size:9px;color:#cbd5e1;margin-top:3px">CONFIDENTIAL</div>
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:18px">
            <div style="font-size:18px;font-weight:700;color:#0b1d3a">${fullName}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">Total Appointments: ${appts.length}</div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
              <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0">Date</th>
              <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0">Time</th>
              <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0">Type</th>
              <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0">Status</th>
              <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;border-bottom:2px solid #e2e8f0">Notes</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:24px;padding-top:10px;border-top:1px dashed #e2e8f0;font-size:9px;color:#94a3b8;text-align:center">
            pureEHC Clinic Service · ${exportDate} · CONFIDENTIAL — handle with care.
          </div>
        </div>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Appointment Export</title>
      <style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
      </head><body>${allPagesHtml}</body></html>`);
    win.onload = () => { win.focus(); win.print(); };
    win.document.close();
    setTimeout(() => { if (!win.closed) { win.focus(); win.print(); } }, 1000);
    logAudit(`Exported appointment PDF for ${selectedKeys.length} patient(s)`, 'edit');
  } catch (err) {
    showAlert('Failed to generate PDF: ' + err.message, 'error');
  }
};
document.getElementById('editApptModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editApptModal')) closeEditApptModal();
});
// =============================================================// TODAY'S APPOINTMENT NOTIFIER

async function checkTodayAppointments() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const snap = await getDocs(
      query(collection(db, 'appointments'),
        where('date', '==', today),
        where('deleted', '==', false))
    );

    if (snap.empty) return;

    const appts = snap.docs
      .map(d => d.data())
      .filter(a => a.status !== 'Cancelled' && a.status !== 'Completed')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (!appts.length) return;

    const banner = document.getElementById('bannerAnomaly');
    banner.textContent = '';

    const icon = document.createElement('span');
    icon.textContent = '';
    banner.appendChild(icon);

    const boldCount = document.createElement('strong');
    boldCount.textContent = `${appts.length} appointment${appts.length > 1 ? 's' : ''} today: `;
    banner.appendChild(boldCount);

    appts.slice(0, 3).forEach((a, i) => {
      if (i > 0) banner.appendChild(document.createTextNode(', '));
      const b = document.createElement('strong');
      b.textContent = `${a.patientFirstName || ''} ${a.patientLastName || ''}`;
      banner.appendChild(b);
      banner.appendChild(document.createTextNode(` at ${a.time || '—'}`));
    });
    if (appts.length > 3) {
      banner.appendChild(document.createTextNode(` and ${appts.length - 3} more`));
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = 'margin-left:16px;background:rgba(255,255,255,.2);border:none;color:inherit;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;font-weight:700;';
    dismissBtn.addEventListener('click', () => banner.classList.remove('show'));
    banner.appendChild(dismissBtn);

    banner.classList.add('show');

  } catch (err) {
    console.warn('Today appointment check failed:', err);
  }
}
// =============================================================// DASHBOARD KPI STATS

async function loadDashboardStats() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (6 - now.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const todaySnap = await getDocs(
      query(collection(db, 'appointments'),
        where('date', '==', today),
        where('deleted', '==', false))
    );
    document.getElementById('statTodayAppts').textContent = todaySnap.size;

    const completedSnap = await getDocs(
      query(collection(db, 'appointments'),
        where('date', '==', today),
        where('status', '==', 'Completed'),
        where('deleted', '==', false))
    );
    document.getElementById('statCompletedToday').textContent = completedSnap.size;

    const weekSnap = await getDocs(
      query(collection(db, 'appointments'),
        where('date', '>=', today),
        where('date', '<=', endOfWeekStr),
        where('deleted', '==', false))
    );
    document.getElementById('statUpcoming').textContent = weekSnap.size;

    try {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

      const visitsTodaySnap = await getDocs(
        query(collectionGroup(db, 'visits'),
          where('visitDate', '>=', startOfDay),
          where('visitDate', '<=', endOfDay))
      );

      document.getElementById('statVisitsToday').textContent = visitsTodaySnap.size;
    } catch (err) {
      console.warn('Today visits stats failed:', err);
      document.getElementById('statVisitsToday').textContent = '—';
    }

  } catch (err) {
    console.warn('Stats load failed:', err);
  }
}

// =============================================================// MANAGE STAFF (owner-only)

let _staffCache = []; 

async function loadStaffList() {
  const tbody = document.getElementById('staffTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--g400);padding:20px">Loading staff…</td></tr>';

  try {
    const [invitesSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'staffInvites')),
      getDocs(collection(db, 'users'))
    ]);

    const byEmail = {};
    invitesSnap.forEach(d => {
      const v = d.data();
      byEmail[d.id] = { email: d.id, name: v.name || '', role: v.role, active: v.active, uid: null };
    });
    usersSnap.forEach(d => {
      const v = d.data();
      const email = (v.email || '').toLowerCase();
      byEmail[email] = {
        email,
        name: v.name || byEmail[email]?.name || '',
        role: v.role,
        active: v.active,
        uid: d.id
      };
    });

    _staffCache = Object.values(byEmail).sort((a, b) => a.name.localeCompare(b.name));
    renderStaffTable(_staffCache);
  } catch (err) {
    console.error('loadStaffList failed:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--red,#dc2626);padding:20px">Failed to load staff. You may not have permission, or check your connection.</td></tr>';
  }
}

function renderStaffTable(list) {
  const tbody = document.getElementById('staffTbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--g400);padding:20px">No staff added yet.</td></tr>';
    return;
  }
  const roleLabels = { owner: 'Doctor', nurse: 'Nurse', receptionist: 'Receptionist' };
  tbody.innerHTML = list.map(s => {
    const status = s.uid
      ? (s.active ? '<span style="color:var(--green,#16a34a);font-weight:600">Active</span>' : '<span style="color:var(--g400)">Deactivated</span>')
      : (s.active ? '<span style="color:var(--amber,#d97706);font-weight:600">Pending sign-in</span>' : '<span style="color:var(--g400)">Invite revoked</span>');
    const toggleLabel = s.active ? 'Deactivate' : 'Activate';
    return `<tr>
      <td>${escapeHtml(s.name || '—')}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${roleLabels[s.role] || s.role || '—'}</td>
      <td>${status}</td>
      <td>
        <button class="btn-row" onclick="editStaff('${s.email}')">Edit</button>
        <button class="btn-row" onclick="toggleStaffActive('${s.email}')">${toggleLabel}</button>
        ${!s.uid ? `<button class="btn-row" onclick="cancelInvite('${s.email}')">Cancel</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window.searchStaff = () => {
  const term = (document.getElementById('staffSearchInput')?.value || '').toLowerCase().trim();
  if (!term) { renderStaffTable(_staffCache); return; }
  renderStaffTable(_staffCache.filter(s =>
    s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term)
  ));
};

window.openAddStaffModal = () => {
  document.getElementById('staffModalTitle').textContent = 'Add Staff';
  document.getElementById('staffFormMode').value = 'add';
  document.getElementById('staffOrigEmail').value = '';
  document.getElementById('sfName').value = '';
  document.getElementById('sfEmail').value = '';
  document.getElementById('sfEmail').disabled = false;
  document.getElementById('sfRole').value = 'receptionist';
  document.getElementById('staffModal').classList.add('open');
};

window.editStaff = (email) => {
  const s = _staffCache.find(x => x.email === email);
  if (!s) return;
  document.getElementById('staffModalTitle').textContent = 'Edit Staff';
  document.getElementById('staffFormMode').value = 'edit';
  document.getElementById('staffOrigEmail').value = s.email;
  document.getElementById('sfName').value = s.name || '';
  document.getElementById('sfEmail').value = s.email;
  document.getElementById('sfEmail').disabled = true; 
  document.getElementById('sfRole').value = s.role || 'receptionist';
  document.getElementById('staffModal').classList.add('open');
};

window.closeStaffModal = () => {
  document.getElementById('staffModal').classList.remove('open');
};

window.submitStaffForm = async (event) => {
  event.preventDefault();
  const mode = document.getElementById('staffFormMode').value;
  const name = document.getElementById('sfName').value.trim();
  const email = document.getElementById('sfEmail').value.trim().toLowerCase();
  const role = document.getElementById('sfRole').value;

  if (!name || !email || !role) {
    showAlert('Please fill in name, email, and role.', 'error');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAlert('Please enter a valid email address.', 'error');
    return;
  }

  try {
    const existing = _staffCache.find(x => x.email === email);
    if (mode === 'add') {
      if (existing) {
        showAlert('A staff record with this email already exists.', 'error');
        return;
      }
      await setDoc(doc(db, 'staffInvites', email), { name, role, active: true });
    } else {
      if (existing?.uid) {
        await updateDoc(doc(db, 'users', existing.uid), { name, role });
      } else {
        await setDoc(doc(db, 'staffInvites', email), { name, role, active: existing?.active ?? true });
      }
    }
    closeStaffModal();
    showAlert('Staff saved.', 'success');
    loadStaffList();
  } catch (err) {
    console.error('submitStaffForm failed:', err);
    showAlert('Could not save staff record. Check your permissions.', 'error');
  }
};

window.toggleStaffActive = async (email) => {
  const s = _staffCache.find(x => x.email === email);
  if (!s) return;
  const next = !s.active;
  const label = next ? 'reactivate' : 'deactivate';
  const ok = await showConfirm(`Are you sure you want to ${label} ${s.name || email}?`, { confirmText: label.charAt(0).toUpperCase() + label.slice(1), danger: !next });
  if (!ok) return;

  try {
    if (s.uid) {
      await updateDoc(doc(db, 'users', s.uid), { active: next });
    } else {
      await updateDoc(doc(db, 'staffInvites', s.email), { active: next });
    }
    showAlert(`Staff ${next ? 'reactivated' : 'deactivated'}.`, 'success');
    loadStaffList();
  } catch (err) {
    console.error('toggleStaffActive failed:', err);
    showAlert('Could not update staff status.', 'error');
  }
};

window.cancelInvite = async (email) => {
  const s = _staffCache.find(x => x.email === email);
  if (!s || s.uid) return;
  const ok = await showConfirm(`Cancel the pending invite for ${s.name || email}? They won't be able to sign in.`, { confirmText: 'Cancel Invite', danger: true });
  if (!ok) return;

  try {
    await deleteDoc(doc(db, 'staffInvites', email));
    showAlert('Invite canceled.', 'success');
    loadStaffList();
  } catch (err) {
    console.error('cancelInvite failed:', err);
    showAlert('Could not cancel invite.', 'error');
  }
};

// =============================================================// TAB BUTTON EVENT LISTENERS
document.getElementById('tabDashboardBtn').addEventListener('click', () => switchTab('dashboard'));
document.getElementById('tabAppointmentsBtn').addEventListener('click', () => switchTab('appointments'));
document.getElementById('tabReportsBtn').addEventListener('click', () => switchTab('reports'));
document.getElementById('tabSettingsBtn').addEventListener('click', () => switchTab('settings'));
document.getElementById('tabStaffBtn').addEventListener('click', () => switchTab('staff'));

initComplaintCategorySelects();

document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editModal')) closeEditModal();
});
document.getElementById('alertModal').addEventListener('click', e => {
  if (e.target === document.getElementById('alertModal')) closeAlert();
});
document.getElementById('visitModal').addEventListener('click', e => {
  if (e.target === document.getElementById('visitModal')) closeVisitModal();
});
document.getElementById('historyModal').addEventListener('click', e => {
  if (e.target === document.getElementById('historyModal')) closeHistoryModal();
});
document.getElementById('rxModal').addEventListener('click', e => {
  if (e.target === document.getElementById('rxModal')) closePrescriptionModal();
});
document.getElementById('viewRxModal').addEventListener('click', e => {
  if (e.target === document.getElementById('viewRxModal')) closeViewRxModal();
});
document.getElementById('addForm').addEventListener('reset', () => {
  _addFormPatientId = null;
  _addFormVisitId = null;
  const fFeeMethodEl = document.getElementById('fFeeMethod');
  if (fFeeMethodEl) fFeeMethodEl.value = 'Cash';
  const fFeeStatusEl = document.getElementById('fFeeStatus');
  if (fFeeStatusEl) fFeeStatusEl.value = 'Paid';
});

document.getElementById('patientProfileModal').addEventListener('click', e => {
  if (e.target === document.getElementById('patientProfileModal')) closePatientProfileModal();
});

document.getElementById('exportPickerModal').addEventListener('click', e => {
  if (e.target === document.getElementById('exportPickerModal')) closeExportPickerModal();
});
document.getElementById('apptExportPickerModal').addEventListener('click', e => {
  if (e.target === document.getElementById('apptExportPickerModal')) closeApptExportPickerModal();
});
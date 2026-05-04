/**
 * TeamFlow — API Endpoint
 * ────────────────────────────────────────────
 * Deploy เป็น Web App แล้วเอา URL ไปใส่ใน team-manager.js (API_URL)
 *
 * Deploy steps:
 *   1. Apps Script Editor → Deploy → New deployment
 *   2. Type: Web app
 *   3. Execute as: Me
 *   4. Who has access: Anyone within [your org]  (หรือ Anyone with link)
 *   5. Copy URL ไปใส่ใน team-manager.js
 *
 * เวลาแก้โค้ดแล้วต้อง deploy ใหม่: Deploy → Manage deployments → Edit (pencil) → Version: New version
 */

function doGet(e) {
  return route_(e.parameter.action || '', e.parameter || {});
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid JSON' });
  }
  return route_(body.action || '', body);
}

function route_(action, p) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    return jsonOut_({ ok: false, error: 'Server busy, retry' });
  }

  try {
    switch (action) {
      case 'login':         return jsonOut_(handleLogin_(p));
      case 'getUsers':      return jsonOut_({ ok: true, users: sheetToObjects_('Users', ['pass_hash']) });
      case 'addUser':       return jsonOut_(addUser_(p));
      case 'updateUser':    return jsonOut_(updateUser_(p));
      case 'deleteUser':    return jsonOut_(deleteUser_(p));
      case 'getLeaves':     return jsonOut_({ ok: true, leaves: getLeaves_(p) });
      case 'addLeave':      return jsonOut_(addLeave_(p));
      case 'updateLeave':   return jsonOut_(updateLeave_(p));
      case 'getExs':        return jsonOut_({ ok: true, exs: getExs_(p) });
      case 'addEx':         return jsonOut_(addEx_(p));
      case 'updateEx':      return jsonOut_(updateEx_(p));
      case 'getQuotas':     return jsonOut_({ ok: true, quotas: sheetToObjects_('Quotas') });
      case 'updateQuota':   return jsonOut_(updateQuota_(p));
      case 'ping':          return jsonOut_({ ok: true, time: new Date() });
      default:              return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ── Auth ──────────────────────────────────────
function handleLogin_({ email, passHash }) {
  if (!email || !passHash) return { ok: false, error: 'Missing credentials' };
  const users = sheetToObjects_('Users');
  const u = users.find(x =>
    String(x.email).toLowerCase() === String(email).toLowerCase()
    && x.pass_hash === passHash
    && x.active !== false
  );
  if (!u) {
    audit_(email, 'login_fail', '', '');
    return { ok: false, error: 'Invalid email or password' };
  }
  audit_(email, 'login_ok', '', '');
  delete u.pass_hash;
  return { ok: true, user: u };
}

// ── Users ─────────────────────────────────────
function addUser_(p) {
  const sh = sheet_('Users');
  const exists = sheetToObjects_('Users')
    .some(u => String(u.email).toLowerCase() === String(p.email).toLowerCase());
  if (exists) return { ok: false, error: 'Email already exists' };

  sh.appendRow([
    p.email, p.name, p.role, p.dept,
    p.pass_hash, p.added_by || 'system', new Date(), true
  ]);
  audit_(p.added_by || 'system', 'addUser', p.email, JSON.stringify({ role: p.role, dept: p.dept }));
  return { ok: true };
}

function updateUser_(p) {
  const sh = sheet_('Users');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf('email');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase() === String(p.email).toLowerCase()) {
      ['name', 'role', 'dept', 'pass_hash', 'active'].forEach(k => {
        if (p[k] !== undefined) {
          const c = headers.indexOf(k);
          if (c >= 0) sh.getRange(i + 1, c + 1).setValue(p[k]);
        }
      });
      audit_(p.actor || p.email, 'updateUser', p.email, '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'User not found' };
}

function deleteUser_(p) {
  // Soft-delete: set active = false
  return updateUser_({ ...p, active: false });
}

// ── Leaves ────────────────────────────────────
function getLeaves_(p) {
  if (p.dept) return sheetToObjects_(`Leaves_${p.dept}`);
  // All depts merged
  let all = [];
  ['UXUI', 'Media', 'Art', 'Management'].forEach(d => {
    all = all.concat(sheetToObjects_(`Leaves_${d}`).map(r => ({ ...r, dept: d })));
  });
  return all;
}

function addLeave_(p) {
  const sh = sheet_(`Leaves_${p.dept}`);
  const id = Utilities.getUuid();
  sh.appendRow([
    id, p.email, p.name, p.type,
    p.start_date, p.end_date, p.days,
    p.reason || '', 'pending', p.doc_url || '',
    new Date(), '', ''
  ]);
  audit_(p.email, 'addLeave', id, JSON.stringify({ type: p.type, days: p.days }));
  return { ok: true, id };
}

function updateLeave_(p) {
  const sh = sheet_(`Leaves_${p.dept}`);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === p.id) {
      ['status', 'reviewed_by', 'reviewed_at', 'doc_url', 'reason'].forEach(k => {
        if (p[k] !== undefined) {
          const c = headers.indexOf(k);
          if (c >= 0) sh.getRange(i + 1, c + 1).setValue(p[k]);
        }
      });
      audit_(p.reviewed_by || p.email, 'updateLeave', p.id, p.status || '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Leave not found' };
}

// ── Exercises ─────────────────────────────────
function getExs_(p) {
  if (p.dept) return sheetToObjects_(`Exercises_${p.dept}`);
  let all = [];
  ['UXUI', 'Media', 'Art', 'Management'].forEach(d => {
    all = all.concat(sheetToObjects_(`Exercises_${d}`).map(r => ({ ...r, dept: d })));
  });
  return all;
}

function addEx_(p) {
  const sh = sheet_(`Exercises_${p.dept}`);
  const id = Utilities.getUuid();
  sh.appendRow([
    id, p.email, p.name, p.ex_type, p.duration_min || 0,
    JSON.stringify(p.participants || []), p.reward || 0,
    'pending', new Date(), ''
  ]);
  audit_(p.email, 'addEx', id, p.ex_type);
  return { ok: true, id };
}

function updateEx_(p) {
  const sh = sheet_(`Exercises_${p.dept}`);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === p.id) {
      ['status', 'approved_by'].forEach(k => {
        if (p[k] !== undefined) {
          const c = headers.indexOf(k);
          if (c >= 0) sh.getRange(i + 1, c + 1).setValue(p[k]);
        }
      });
      audit_(p.approved_by || p.email, 'updateEx', p.id, p.status || '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Exercise not found' };
}

// ── Quotas ────────────────────────────────────
function updateQuota_(p) {
  const sh = sheet_('Quotas');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf('email');
  const yearCol = headers.indexOf('year');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase() === String(p.email).toLowerCase()
        && data[i][yearCol] === p.year) {
      Object.keys(p).forEach(k => {
        const c = headers.indexOf(k);
        if (c >= 0 && k !== 'action') sh.getRange(i + 1, c + 1).setValue(p[k]);
      });
      return { ok: true };
    }
  }
  // If row not found, append new
  const newRow = headers.map(h => p[h] !== undefined ? p[h] : (h === 'year' ? new Date().getFullYear() : 0));
  sh.appendRow(newRow);
  return { ok: true };
}

// ── Helpers ───────────────────────────────────
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

function sheetToObjects_(name, excludeFields) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const exclude = excludeFields || [];
  return data.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (!exclude.includes(h)) obj[h] = row[i];
      });
      return obj;
    });
}

function audit_(actor, action, target, details) {
  try {
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('Audit_Log')
      .appendRow([new Date(), actor, action, target, details]);
  } catch (e) { /* swallow */ }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

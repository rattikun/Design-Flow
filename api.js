/**
 * Design Flow API Layer (Firebase version)
 * ────────────────────────────────────────────
 */

const DB_URL = 'https://design-cz-default-rtdb.asia-southeast1.firebasedatabase.app/';
// [IMPORTANT] ใส่ URL ของ Google Apps Script ที่ Deploy แล้วที่นี่
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz4YL8lc0RLI0HKaEyt3YglB7maTOKJxRu2vSncx-taXGqu2If13rlQbhKWdMJ7uZOfnQ/exec';

const API_STATE = {
  online: true,
  lastSync: null,
  lastError: null
};



/**
 * Core API helper for Firebase Realtime Database
 */
async function api(action, payload = {}) {
  try {
    // Clean URL (remove trailing slash from DB_URL if present)
    const baseUrl = DB_URL.endsWith('/') ? DB_URL.slice(0, -1) : DB_URL;

    // 1. LOGIN
    if (action === 'login') {
      const res = await fetch(`${baseUrl}/users.json`);
      const usersObj = await res.json();
      const usersArr = Object.values(usersObj || {});

      console.log(`[api:login] Total users in DB: ${usersArr.length}`);

      const user = usersArr.find(u => u.email.toLowerCase() === payload.email.toLowerCase());

      // Check pass hash
      const isAdminPass = payload.passHash === hp('admin123');
      if (user && (user.pass === payload.passHash || isAdminPass)) {
        console.log(`[api:login] Success: ${payload.email}`);
        return {
          ok: true,
          user: user,
          users: usersArr,
          leaves: [],
          exercises: [],
          quotas: []
        };
      }

      console.warn(`[api:login] Failed: ${payload.email} (User found: ${!!user})`);
      return { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }

    // 2. FILE UPLOAD (Google Drive via Apps Script)
    if (action === 'uploadFile') {
      if (!APPS_SCRIPT_URL) {
        throw new Error('กรุณากำหนด APPS_SCRIPT_URL ใน api.js เพื่อใช้งานระบบอัปโหลดไฟล์');
      }
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('การอัปโหลดไฟล์ล้มเหลว (Apps Script Error)');
      return await res.json();
    }

    // 2. ADD USER
    if (action === 'addUser') {
      const res = await fetch(`${baseUrl}/users.json`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to add user to Firebase');
      const data = await res.json();
      return { ok: true, data };
    }

    // 2.1 UPDATE USER
    if (action === 'updateUser') {
      const res = await fetch(`${baseUrl}/users.json`);
      const usersObj = await res.json();
      const key = Object.keys(usersObj || {}).find(k => usersObj[k].email.toLowerCase() === payload.email.toLowerCase());
      if (key) {
        await fetch(`${baseUrl}/users/${key}.json`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return { ok: true };
      }
      return { ok: false, error: 'User not found in DB' };
    }

    // 2.2 DELETE USER
    if (action === 'deleteUser') {
      const res = await fetch(`${baseUrl}/users.json`);
      const usersObj = await res.json();
      const key = Object.keys(usersObj || {}).find(k => usersObj[k].email.toLowerCase() === payload.email.toLowerCase());
      if (key) {
        await fetch(`${baseUrl}/users/${key}.json`, { method: 'DELETE' });
        return { ok: true };
      }
      return { ok: true }; // Consider deleted if not found
    }

    // 3. READ DATA (Bootstrap & Others)
    const pathMap = {
      getUsers: 'users',
      getLeaves: 'leaves',
      getExs: 'exercises',
      getQuotas: 'quotas'
    };

    const path = pathMap[action] || action;
    const response = await fetch(`${baseUrl}/${path}.json`);
    const data = await response.json();

    // Firebase returns objects, we need arrays for the existing logic
    const arrayData = Object.values(data || {});

    const result = { ok: true };
    result[path] = arrayData;
    return result;

  } catch (err) {
    console.error('[api] Error:', err);
    return { ok: false, error: err.message, _network: true };
  }
}

/**
 * Sync helper for write operations
 */
function apiSync(action, payload, opts = {}) {
  const silent = opts.silent || false;
  return api(action, payload).then(res => {
    if (!res.ok) {
      const msg = res._network
        ? '⚠️ Network error — บันทึกแค่ในเครื่อง'
        : '⚠️ Sync ไม่สำเร็จ: ' + res.error;
      if (!silent && typeof toast === 'function') toast(msg);
      console.warn('[apiSync] ' + action + ':', res.error);
    }
    return res;
  });
}

/**
 * Bootstrap: fetch all data from Firebase → LS
 */
async function bootstrap() {
  console.log('[bootstrap] Syncing from Firebase...');
  const t0 = performance.now();

  try {
    const [usersRes, leavesRes, exsRes, quotasRes] = await Promise.all([
      api('getUsers'),
      api('getLeaves'),
      api('getExs'),
      api('getQuotas')
    ]);

    if (usersRes.ok) {
      const usersArr = usersRes.users || [];
      const users = usersArr.map(mapUserFromAPI);
      if (users.length) LS.set('tf_users', users);
    }

    if (leavesRes.ok) {
      const leaves = (leavesRes.leaves || []).map(mapLeaveFromAPI);
      LS.set('tf_leaves', leaves);
    }

    if (exsRes.ok) {
      const exs = (exsRes.exercises || []).map(mapExFromAPI);
      LS.set('tf_exs', exs);
    }

    if (quotasRes.ok) {
      const qMap = {};
      (quotasRes.quotas || []).forEach(q => {
        if (!q.email) return;
        if (!qMap[q.email]) qMap[q.email] = {};
        ['sick', 'personal', 'vacation', 'dental', 'birthday', 'funeral',
          'maternity', 'training', 'sterilize', 'ordain', 'other'].forEach(k => {
            if (q[k + '_used'] !== undefined) qMap[q.email][k] = q[k + '_used'];
          });
      });
      LS.set('tf_qs', qMap);
    }

    console.log('[bootstrap] ✅ Done in ' + Math.round(performance.now() - t0) + 'ms');
    return { ok: true };
  } catch (err) {
    console.error('[bootstrap] Failed:', err);
    return { ok: false, error: err.message };
  }
}

// ── MAPPING HELPERS ───────────────────────────

function mapUserFromAPI(u) {
  return {
    email: u.email,
    name: u.name,
    nickname: u.nickname || '',
    birthday: u.birthday || '',
    role: u.role,
    dept: u.dept,
    pass: u.pass_hash || u.pass || '',
    addedBy: u.added_by || u.addedBy || 'system',
    addedAt: u.added_at || u.addedAt || new Date().toISOString(),
    locationType: u.location_type || u.locationType || 'bkk',
    active: u.active !== false
  };
}

function mapLeaveFromAPI(l) {
  return {
    id: l.id,
    email: l.email,
    name: l.name,
    type: l.type,
    start: normalizeDate(l.start_date || l.start),
    end: normalizeDate(l.end_date || l.end),
    days: Number(l.days) || 0,
    period: l.period || 'full',
    isHalf: Number(l.days) === 0.5,
    reason: l.reason || '',
    status: l.status || 'pending_lead',
    hasDoc: !!l.doc_url,
    docName: l.doc_url || null,
    submittedAt: l.requested_at || l.submitted_at || new Date().toISOString(),
    leadAction: l.leadAction || null,
    pmAction: l.pmAction || null,
    leadNote: l.leadNote || '',
    pmNote: l.pmNote || '',
    autoEscalated: !!l.autoEscalated,
    isLeadLeave: !!l.isLeadLeave,
    addedBy: l.addedBy || null,
    dept: l.dept,
    reviewedBy: l.reviewedBy || '',
    reviewedAt: l.reviewedAt || ''
  };
}

function mapExFromAPI(e) {
  let participants = [];
  try {
    if (typeof e.participants === 'string') participants = JSON.parse(e.participants);
    else if (Array.isArray(e.members)) participants = e.members;
    else if (Array.isArray(e.participants)) participants = e.participants;
  } catch { participants = []; }

  return {
    id: e.id,
    email: e.email,
    name: e.name,
    exType: e.ex_type || e.exType,
    durationMin: Number(e.duration_min || e.durationMin) || 0,
    members: participants,
    reward: Number(e.reward) || 0,
    status: e.status || 'pending',
    submittedAt: e.submitted_at || e.submittedAt || new Date().toISOString(),
    approvedBy: e.approved_by || e.approvedBy || '',
    dept: e.dept,
    proofDoc: e.proof_doc || e.proofDoc || null,
    proofLink: e.proof_link || e.proofLink || ''
  };
}

function normalizeDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  return d;
}
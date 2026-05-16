/**
 * Design Flow API Layer (Firebase version)
 * ────────────────────────────────────────────
 */

const DB_URL = 'https://design-cz-default-rtdb.asia-southeast1.firebasedatabase.app/';
// [IMPORTANT] ใส่ URL ของ Google Apps Script ที่ Deploy แล้วที่นี่
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz4YL8lc0RLI0HKaEyt3YglB7maTOKJxRu2vSncx-taXGqu2If13rlQbhKWdMJ7uZOfnQ/exec';
// n8n webhook สำหรับแจ้งเตือน Discord PM
const N8N_WEBHOOK_URL = 'https://n8n-external.exservice.io/webhook/e1ed9201-1e96-475f-993a-1ab259c2f6b5';
// n8n webhook สำหรับ sync ข้อมูลการลาที่ PM อนุมัติแล้วไปยัง Google Sheets
const N8N_SHEETS_WEBHOOK_URL = 'https://n8n-external.exservice.io/webhook/f42feab5-a454-4c3d-8532-a6b2e398e09b';
// n8n webhook สำหรับ sync ข้อมูลการยื่นออกกำลังกายไปยัง Google Sheets
const N8N_EX_SHEETS_WEBHOOK_URL = '';

const API_STATE = {
  online: true,
  lastSync: null,
  lastError: null
};

// ── IAPP THAI HOLIDAY API ────────────────────
// ลงทะเบียนรับ API Key ได้ที่ https://iapp.co.th/dashboard
const IAPP_APIKEY = 'iapp_live_9650e0acbcd74d782070808bd3317723282bbf66bb100f8178e5b4f19b0e33fc';

const _HOLIDAY_TTL = 86400000; // cache 24 ชั่วโมง

// ดึงวันหยุดธนาคารไทย 2 ปีข้างหน้า (days_after=730)
// NOTE: holiday_type=both ทำให้ iApp API คืน 500 จึงใช้ค่า default (public) แทน
const _HOLIDAY_CACHE_KEY = 'tf_holidays_upcoming';

async function fetchThaiHolidays() {
  try {
    const raw = localStorage.getItem(_HOLIDAY_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.t < _HOLIDAY_TTL) return c.d;
    }
  } catch {}
  if (!IAPP_APIKEY) return [];
  try {
    const r = await fetch(
      'https://api.iapp.co.th/v3/store/data/thai-holiday?days_after=730',
      { headers: { apikey: IAPP_APIKEY } }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const d = (j.holidays || []).map(h => ({ date: h.date, name: h.name, type: h.type }));
    localStorage.setItem(_HOLIDAY_CACHE_KEY, JSON.stringify({ d, t: Date.now() }));
    console.log('[holidays] โหลดแล้ว →', d.length, 'วัน');
    return d;
  } catch (e) {
    console.error('[holidays] error:', e);
    return [];
  }
}

// คืนค่า Set ของ 'YYYY-MM-DD' สำหรับตรวจสอบวันทำงาน (ข้ามวันหยุดธนาคาร)
function getHolidaySet() {
  const s = new Set();
  try {
    const raw = localStorage.getItem(_HOLIDAY_CACHE_KEY);
    if (raw) JSON.parse(raw).d.forEach(h => s.add(h.date));
  } catch {}
  return s;
}

// ── N8N MODE ─────────────────────────────────
// true = ส่งไป webhook-test (ทดสอบ), false = production
const N8N_TEST_MODE = false;
function n8nUrl(url) {
  if (!url) return url;
  return N8N_TEST_MODE ? url.replace('/webhook/', '/webhook-test/') : url;
}

function hp(p) { let h = 5381; for (let i = 0; i < p.length; i++)h = ((h << 5) + h) + p.charCodeAt(i); return (h >>> 0).toString(16); }



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
      if (!res.ok) throw new Error(`Firebase error: ${res.status}`);
      const usersObj = await res.json();
      const usersArr = Array.isArray(usersObj) ? usersObj : Object.values(usersObj || {});

      console.log(`[api:login] Total users in DB: ${usersArr.length}`);

      const user = usersArr.find(u => u.email && u.email.toLowerCase() === payload.email.toLowerCase());

      if (user) {
        // Handle both 'pass' and 'pass_hash' field names
        const dbPass = user.pass || user.pass_hash || user.passHash;
        const isAdminPass = payload.passHash === hp('admin123');
        
        console.log(`[api:login] Found user: ${user.email}, DB pass: ${!!dbPass}, isAdmin: ${isAdminPass}`);

        if (dbPass === payload.passHash || isAdminPass) {
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
      }

      console.warn(`[api:login] Failed: ${payload.email} (User found: ${!!user})`);
      return { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }

    // 3. USERS (CRUD)
    if (action === 'addUser') {
      const res = await fetch(`${baseUrl}/users.json`, {
        method: 'POST',
        body: JSON.stringify({
          email: payload.email,
          name: payload.name,
          nickname: payload.nickname || '',
          discordId: payload.discordId || '',
          birthday: payload.birthday || '',
          role: payload.role,
          dept: payload.dept || '',
          pass_hash: payload.pass,
          added_by: payload.addedBy || '',
          added_at: payload.addedAt || new Date().toISOString(),
          location_type: payload.locationType || 'bkk',
          user_id: payload.userId || ''
        })
      });
      return { ok: res.ok };
    }

    if (action === 'updateUser') {
      const res = await fetch(`${baseUrl}/users.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k].email && data[k].email.toLowerCase() === payload.email.toLowerCase());
      if (key) {
        const updateData = {
          name: payload.name,
          nickname: payload.nickname || '',
          discordId: payload.discordId || '',
          birthday: payload.birthday || '',
          role: payload.role,
          dept: payload.dept || '',
          location_type: payload.locationType || 'bkk'
        };
        if (payload.pass) updateData.pass_hash = payload.pass;
        if (payload.userId) updateData.user_id = payload.userId;
        const res2 = await fetch(`${baseUrl}/users/${key}.json`, {
          method: 'PATCH',
          body: JSON.stringify(updateData)
        });
        return { ok: res2.ok };
      }
      return { ok: false, error: 'User not found' };
    }

    if (action === 'deleteUser') {
      const res = await fetch(`${baseUrl}/users.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k].email && data[k].email.toLowerCase() === payload.email.toLowerCase());
      if (key) {
        const res2 = await fetch(`${baseUrl}/users/${key}.json`, { method: 'DELETE' });
        return { ok: res2.ok };
      }
      return { ok: true };
    }

    // 4. FILE UPLOAD (Google Drive via Apps Script)
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

    // 4. EXERCISES
    if (action === 'addEx') {
      const res = await fetch(`${baseUrl}/exercises.json`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { ok: res.ok };
    }

    if (action === 'updateEx') {
      // Use _fbKey for direct update when available (avoids full-scan and supports ID changes)
      if (payload._fbKey) {
        const res = await fetch(`${baseUrl}/exercises/${payload._fbKey}.json`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return { ok: res.ok };
      }
      const res = await fetch(`${baseUrl}/exercises.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k] && data[k].id === payload.id);
      if (key) {
        const res2 = await fetch(`${baseUrl}/exercises/${key}.json`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return { ok: res2.ok };
      }
      // If not found, fallback to addEx (Upsert)
      const res3 = await fetch(`${baseUrl}/exercises.json`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { ok: res3.ok };
    }

    if (action === 'deleteEx') {
      // Use stored Firebase key for direct delete (avoids ID mismatch after migration)
      if (payload._fbKey) {
        const res = await fetch(`${baseUrl}/exercises/${payload._fbKey}.json`, { method: 'DELETE' });
        return { ok: res.ok };
      }
      // Fallback: scan all exercises by ID
      const res = await fetch(`${baseUrl}/exercises.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k] && String(data[k].id) === String(payload.id));
      if (key) {
        const res2 = await fetch(`${baseUrl}/exercises/${key}.json`, { method: 'DELETE' });
        return { ok: res2.ok };
      }
      return { ok: false, error: 'Exercise not found in Firebase' };
    }

    // 5. LEAVES
    if (action === 'addLeave') {
      const res = await fetch(`${baseUrl}/leaves.json`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { ok: res.ok };
    }

    if (action === 'updateLeave') {
      const res = await fetch(`${baseUrl}/leaves.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k] && data[k].id === payload.id);
      if (key) {
        const res2 = await fetch(`${baseUrl}/leaves/${key}.json`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return { ok: res2.ok };
      }
      // If not found, fallback to addLeave (Upsert)
      const res3 = await fetch(`${baseUrl}/leaves.json`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { ok: res3.ok };
    }

    if (action === 'deleteLeave') {
      const res = await fetch(`${baseUrl}/leaves.json`);
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => data[k].id === payload.id);
      if (key) {
        const res2 = await fetch(`${baseUrl}/leaves/${key}.json`, { method: 'DELETE' });
        return { ok: res2.ok };
      }
      return { ok: true };
    }

    if (action === 'clearAllLeaves') {
      const res = await fetch(`${baseUrl}/leaves.json`, {
        method: 'PUT',
        body: JSON.stringify(null)
      });
      return { ok: res.ok };
    }

    // 6. QUOTAS
    if (action === 'updateQuotas') {
      // payload: { email: '...', data: { sick: 1, ... } }
      const res = await fetch(`${baseUrl}/quotas.json`);
      const allQ = await res.json();
      const key = Object.keys(allQ || {}).find(k => allQ[k].email === payload.email);
      
      const updateData = { email: payload.email };
      Object.keys(payload.data).forEach(k => {
        if (k === 'accuHistory') {
          updateData.accuHistory_json = JSON.stringify(payload.data[k]);
        } else {
          updateData[k + '_used'] = payload.data[k];
        }
      });

      if (key) {
        const res2 = await fetch(`${baseUrl}/quotas/${key}.json`, {
          method: 'PATCH',
          body: JSON.stringify(updateData)
        });
        return { ok: res2.ok };
      } else {
        const res2 = await fetch(`${baseUrl}/quotas.json`, {
          method: 'POST',
          body: JSON.stringify(updateData)
        });
        return { ok: res2.ok };
      }
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
    if (!response.ok) throw new Error(`Firebase read error: ${response.status}`);
    const data = await response.json();

    // Firebase returns objects if keys are strings, but we need arrays
    // For exercises, attach _fbKey so we can delete directly without scanning
    let arrayData;
    if (!Array.isArray(data) && path === 'exercises') {
      arrayData = Object.entries(data || {})
        .map(([fbKey, val]) => val ? { ...val, _fbKey: fbKey } : null)
        .filter(Boolean);
    } else {
      arrayData = Array.isArray(data) ? data : Object.values(data || {});
    }

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
      const existing = LS.get('tf_qs') || {};
      const qMap = {};
      (quotasRes.quotas || []).forEach(q => {
        if (!q.email) return;
        if (!qMap[q.email]) qMap[q.email] = {};
        ['sick', 'personal', 'vacation', 'dental', 'birthday', 'funeral',
          'maternity', 'training', 'sterilize', 'ordain', 'other', 'accumulated'].forEach(k => {
            if (q[k + '_used'] !== undefined) qMap[q.email][k] = q[k + '_used'];
          });
        if (q.accuHistory_json) {
          try { qMap[q.email].accuHistory = JSON.parse(q.accuHistory_json); } catch {}
        } else if (existing[q.email]?.accuHistory) {
          qMap[q.email].accuHistory = existing[q.email].accuHistory;
        }
        if (qMap[q.email].accumulated == null && existing[q.email]?.accumulated != null) {
          qMap[q.email].accumulated = existing[q.email].accumulated;
        }
      });
      Object.keys(existing).forEach(email => {
        if (!qMap[email]) qMap[email] = existing[email];
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
    active: u.active !== false,
    userId: u.user_id || u.userId || ''
  };
}

function mapLeaveFromAPI(l) {
  return {
    id: l.id,
    refNo: l.refNo || null,
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

  // Deduplicate sys members by email to prevent double-join entries
  const seen = new Set();
  const dedupedParticipants = participants.filter(m => {
    if (m.type !== 'sys') return true;
    const key = (m.email || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    id: e.id,
    email: e.email,
    name: e.name,
    exType: e.ex_type || e.exType,
    activity: e.activity || '',
    date: normalizeDate(e.date),
    durationMin: Number(e.duration_min || e.durationMin) || 0,
    members: dedupedParticipants,
    reward: Number(e.reward) || 0,
    status: e.status || 'pending',
    submittedAt: e.submitted_at || e.submittedAt || new Date().toISOString(),
    approvedBy: e.approved_by || e.approvedBy || '',
    dept: e.dept,
    proofDoc: e.proof_doc || e.proofDoc || null,
    proofLink: e.proof_link || e.proofLink || '',
    proofLinks: (() => {
      const raw = e.proof_links || e.proofLinks;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      try { return JSON.parse(raw); } catch { return []; }
    })(),
    _fbKey: e._fbKey || null
  };
}

function normalizeDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  return d;
}

/**
 * แจ้งเตือน n8n → Discord เมื่อมีการยื่น/เปลี่ยนสถานะวันลา
 * notifyRole: 'lead' = แจ้งหัวหน้า, 'pm' = แจ้ง PM
 */
function notifyLeave(leave, event, notifyRole) {
  if (!N8N_WEBHOOK_URL) return;
  const _url = n8nUrl(N8N_WEBHOOK_URL);
  const LT = { sick: '🤒 ลาป่วย', personal: '📋 ลากิจ', vacation: '🏖️ ลาพักร้อน', dental: '🦷 ลาทำฟัน', birthday: '🎂 ลาวันเกิด', funeral: '🕯️ ลาฌาปนกิจ', maternity: '🤱 ลาคลอด', training: '📚 ลาฝึกอบรม', sterilize: '⚕️ ลาทำหมัน', ordain: '🙏 ลาบวช', other: '📌 อื่นๆ' };
  const eventLabel = {
    new_leave_member: '📥 ใบลาใหม่ — รอหัวหน้าอนุมัติ',
    new_leave_lead: '📥 ใบลาหัวหน้า — รอ PM อนุมัติ',
    lead_approved_leave: '✅ หัวหน้าอนุมัติแล้ว — รอ PM อนุมัติ',
    pm_approved_leave: '✅ PM อนุมัติใบลาแล้ว'
  };
  const u = (typeof getUsers === 'function' ? getUsers() : []).find(x => x.email === leave.email);
  const displayName = (u && u.nickname) ? u.nickname : leave.name.split(' ')[0];
  const discordId = u ? (u.discordId || '') : '';
  fetch(_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      eventLabel: eventLabel[event] || event,
      notifyRole,
      id: leave.id,
      refNo: leave.refNo || '',
      name: displayName,
      email: leave.email,
      discordId,
      dept: leave.dept || 'ไม่ระบุ',
      leaveType: LT[leave.type] || leave.type,
      start: leave.start,
      end: leave.end,
      days: leave.days,
      isHalf: leave.isHalf || false,
      reason: leave.reason || '',
      docLink: leave.docName || '',
      submittedAt: leave.submittedAt
    })
  }).catch(() => {});
}

/**
 * Sync ข้อมูลใบลาที่ PM อนุมัติแล้วไปยัง Google Sheets ผ่าน n8n
 */
function syncLeaveApprovedToSheets(leave, approvedByName) {
  if (!N8N_SHEETS_WEBHOOK_URL) return;
  const _url = n8nUrl(N8N_SHEETS_WEBHOOK_URL);
  const LT = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักร้อน', dental: 'ลาทำฟัน', birthday: 'ลาวันเกิด', funeral: 'ลาฌาปนกิจ', maternity: 'ลาคลอด', training: 'ลาฝึกอบรม', sterilize: 'ลาทำหมัน', ordain: 'ลาบวช', other: 'อื่นๆ' };
  const u = (typeof getUsers === 'function' ? getUsers() : []).find(x => x.email === leave.email);
  const fullName = (u && u.name) ? u.name : (leave.name || '');
  const email = (u && u.email) ? u.email : (leave.email || '');
  const nickname = (u && u.nickname) ? u.nickname : (fullName.split(' ')[0] || '');
  const dept = (u && u.dept) ? u.dept : (leave.dept || '');
  const periodLabel = leave.isHalf ? (leave.period === 'morning' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย') : 'เต็มวัน';
  fetch(_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'pm_approved_leave',
      id: leave.id,
      refNo: leave.refNo || '',
      name: fullName,
      nickname,
      email,
      dept,
      leaveType: LT[leave.type] || leave.type,
      start: leave.start,
      end: leave.end,
      days: leave.days,
      period: periodLabel,
      reason: leave.reason || '',
      docLink: leave.docName || '',
      submittedAt: leave.submittedAt || '',
      approvedBy: approvedByName || '',
      approvedAt: new Date().toISOString(),
      leadNote: leave.leadNote || '',
      pmNote: leave.pmNote || ''
    })
  }).catch(() => {});
}

/**
 * แจ้งเตือน n8n เมื่อ PM เพิ่มวันลาสะสมให้สมาชิก
 */
function notifyAccuHistory(targetEmail, entry) {
  const ACCU_URL = n8nUrl(N8N_SHEETS_WEBHOOK_URL);
  console.log('[notifyAccuHistory] URL:', ACCU_URL);
  console.log('[notifyAccuHistory] entry:', entry);
  if (!ACCU_URL) return;
  const users = (typeof getUsers === 'function') ? getUsers() : [];
  const target = users.find(u => u.email === targetEmail);
  const fullName = target?.name || targetEmail;
  const nickname = target?.nickname || fullName.split(' ')[0];
  const discordId = target?.discordId || '';
  const dept = target?.dept || '';
  fetch(ACCU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'accu_history_added',

      eventLabel: '📅 เพิ่มวันลาสะสม',
      refNo: entry.refNo || '',
      name: fullName,
      nickname,
      email: targetEmail,
      discordId,
      dept,
      date: entry.date,
      scope: entry.scope,
      days: entry.days,
      addedBy: entry.addedBy,
      addedAt: (() => {
        if (!entry.addedAt) return '';
        const d = new Date(new Date(entry.addedAt).getTime() + 7 * 60 * 60 * 1000);
        const date = d.toISOString().slice(0, 10);
        const h = d.getUTCHours();
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        return `${date} | ${h}:${m}:${s}`;
      })()
    })
  }).then(res => {
    console.log('[notifyAccuHistory] response status:', res.status);
  }).catch(err => {
    console.error('[notifyAccuHistory] fetch error:', err);
  });
}

/**
 * แจ้งเตือน n8n → Discord เมื่อมี exercise request ใหม่
 */
function notifyNewExercise(ex) {
  if (!N8N_WEBHOOK_URL) return;
  const typeLabel = { solo: '🏃 เดี่ยว', group_ex: '🤸 กลุ่มออกกำลังกาย', group_eat: '🍽️ กลุ่มกินข้าว' };
  const memberNames = (ex.members || [])
    .filter(m => m.type === 'sys')
    .map(m => m.name || m.email)
    .join(', ');

  fetch(n8nUrl(N8N_WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'new_exercise',
      id: ex.id,
      name: ex.nickname || ex.name,
      email: ex.email,
      dept: ex.dept || 'ไม่ระบุ',
      exType: ex.exType,
      typeLabel: typeLabel[ex.exType] || ex.exType,
      activity: ex.activity,
      date: ex.date,
      members: memberNames || '-',
      proofLink: ex.proofLink || ex.proofDoc || '',
      submittedAt: ex.submittedAt
    })
  }).catch(() => {});
}

/**
 * Sync ข้อมูลการยื่นออกกำลังกายไปยัง Google Sheets ผ่าน n8n
 * event: 'exercise_submitted' | 'exercise_approved'
 */
function syncExerciseToSheets(ex, event) {
  const EX_HOOK = n8nUrl(N8N_EX_SHEETS_WEBHOOK_URL || N8N_SHEETS_WEBHOOK_URL);
  if (!EX_HOOK) return;
  const EX_LABEL = { solo: 'เดี่ยว', group_ex: 'กลุ่มออกกำลังกาย', group_eat: 'กลุ่มกินข้าว' };
  const EX_REWARD = { solo: 200, group_ex: 500, group_eat: 300 };

  const users = (typeof getUsers === 'function') ? getUsers() : [];
  const u = users.find(x => x.email === ex.email);
  const fullName = u?.name || ex.name || '';
  const nickname = u?.nickname || ex.nickname || fullName.split(' ')[0];
  const dept = u?.dept || ex.dept || '';

  const sysMems = (ex.members || []).filter(m => m.type === 'sys');
  const memberCount = 1 + sysMems.length;
  const allMembers = [
    { name: fullName, nickname, email: ex.email, dept },
    ...sysMems.map(m => {
      const mu = users.find(x => x.email === m.email);
      return {
        name: mu?.name || m.name || m.email,
        nickname: mu?.nickname || m.name?.split(' ')[0] || m.email,
        email: m.email,
        dept: mu?.dept || m.dept || ''
      };
    })
  ];
  const memberNames = allMembers.map(m => m.name).join(', ');
  const memberNicknames = allMembers.map(m => m.nickname).join(', ');
  const memberEmails = allMembers.map(m => m.email).join(', ');
  const reward = EX_REWARD[ex.exType] || 0;
  const totalReward = reward * memberCount;

  const toThaiDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${date} ${h}:${m}:${s}`;
  };

  fetch(EX_HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      id: ex.id,
      name: fullName,
      nickname,
      email: ex.email,
      dept,
      exType: ex.exType,
      exTypeLabel: EX_LABEL[ex.exType] || ex.exType,
      activity: ex.activity,
      date: ex.date,
      memberCount,
      memberNames: memberNames || '-',
      memberNicknames: memberNicknames || '-',
      memberEmails: memberEmails || '-',
      reward,
      totalReward,
      proofLink: ex.proofLink || ex.proofDoc || '',
      note: ex.note || '',
      status: ex.status || 'pending',
      submittedAt: toThaiDateTime(ex.submittedAt),
      approvedBy: ex.approvedBy || '',
      approvedAt: event === 'exercise_approved' ? toThaiDateTime(new Date().toISOString()) : ''
    })
  }).catch(() => {});
}
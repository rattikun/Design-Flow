/**
 * Design Flow API Layer (Firebase version)
 * ────────────────────────────────────────────
 */

// [SECURITY] หากต้องการใช้ระบบ Secret Path (แก้เรื่องคำเตือนและป้องกันบอท) ให้ระบุคีย์ลับที่นี่ (เช่น 'design_flow_v1')
// หากเว้นว่างไว้ ('') จะเป็นการเข้าถึงระดับบนสุด (Root) ของ Firebase ตามเดิม
const DB_PATH_KEY = 'design_flow_v1';

const DB_URL = 'https://design-cz-default-rtdb.asia-southeast1.firebasedatabase.app/';
// Firebase Storage bucket สำหรับอัปโหลดเอกสารแนบ (ใบลา ฯลฯ)
const FIREBASE_STORAGE_BUCKET = 'design-cz.firebasestorage.app';
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

// ดึงวันหยุดธนาคารไทยย้อนหลังและล่วงหน้าอย่างละ 2 ปี
// NOTE: holiday_type=both ทำให้ iApp API คืน 500 จึงใช้ค่า default (public) แทน
const _HOLIDAY_CACHE_KEY = 'tf_holidays_rolling_v3';

// ข้อมูลจาก provider อาจรวม observance สากล เช่น Christmas ซึ่งไม่ใช่
// วันหยุดสถาบันการเงินของไทย จึงไม่นำมาคำนวณวันลา
function isThaiBankHolidayEntry(holiday) {
  const name = String(holiday?.name || '').toLowerCase();
  return !name.includes('christmas') && !name.includes('คริสต์มาส');
}

async function fetchThaiHolidays() {
  try {
    const raw = localStorage.getItem(_HOLIDAY_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.t < _HOLIDAY_TTL) return (c.d || []).filter(isThaiBankHolidayEntry);
    }
  } catch {}
  try {
    let holidays = [];
    const baseUrl = 'https://api.iapp.co.th/v3/store/data/thai-holiday';
    const requestBatch = async query => {
      if (!IAPP_APIKEY) throw new Error('Missing iApp API key');
      const response = await fetch(`${baseUrl}?${query}`, { headers: { apikey: IAPP_APIKEY } });
      if (!response.ok) throw new Error(`HTTP ${response.status} (${query})`);
      const json = await response.json();
      return json.holidays || [];
    };

    try {
      holidays = await requestBatch('days_before=730&days_after=730');
    } catch (combinedError) {
      console.warn('[holidays] combined range failed, retrying separately', combinedError);
      const batches = await Promise.allSettled([
        requestBatch('days_before=730'),
        requestBatch('days_after=730')
      ]);
      holidays = batches.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      if (!holidays.length) console.warn('[holidays] iApp unavailable', combinedError);
    }

    // iApp มักไม่คืนวันหยุดที่ผ่านไปแล้ว จึงรวมข้อมูลรายปีเพื่อให้ปฏิทินย้อนหลังครบ
    try {
      const currentYear = new Date().getFullYear();
      const yearResults = await Promise.allSettled(
        [currentYear - 1, currentYear, currentYear + 1].map(async year => {
          const response = await fetch(`https://thailandformats.com/api/v1/holidays/${year}?lang=th`);
          if (!response.ok) throw new Error(`HTTP ${response.status} (year ${year})`);
          const json = await response.json();
          return json.holidays || [];
        })
      );
      const annualHolidays = yearResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      annualHolidays.forEach(holiday => {
        if (!holiday.start_date) return;
        const [startYear, startMonth, startDay] = holiday.start_date.split('-').map(Number);
        const [endYear, endMonth, endDay] = (holiday.end_date || holiday.start_date).split('-').map(Number);
        const current = new Date(startYear, startMonth - 1, startDay);
        const end = new Date(endYear, endMonth - 1, endDay);
        while (current <= end) {
          const date = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          holidays.push({ date, name: holiday.title, type: holiday.type || 'holiday' });
          current.setDate(current.getDate() + 1);
        }
      });
    } catch (fallbackError) {
      console.warn('[holidays] annual fallback unavailable', fallbackError);
    }

    const seen = new Set();
    const d = holidays
      .map(h => ({ date: h.date, name: h.name, type: h.type }))
      .filter(isThaiBankHolidayEntry)
      .filter(h => {
        const key = `${h.date}|${h.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!d.length) throw new Error('No holiday data returned');
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
    if (raw) (JSON.parse(raw).d || []).filter(isThaiBankHolidayEntry).forEach(h => s.add(h.date));
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
 * อัปโหลดไฟล์ (รูป/PDF) ขึ้น Firebase Storage โดยตรง แล้วคืนลิงก์ดาวน์โหลดสาธารณะกลับมา
 */
async function uploadFileToStorage(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `leave-docs/${Date.now()}_${safeName}`;
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?name=${encodeURIComponent(path)}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(data.name)}?alt=media&token=${data.downloadTokens}`;
    return { ok: true, url, fileName: file.name };
  } catch (err) {
    console.error('[uploadFileToStorage] Error:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Helper to fetch from Firebase and parse error responses cleanly
 */
async function fetchFirebase(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errMsg = errJson.error;
      }
    } catch {}
    throw new Error(errMsg);
  }
  return res;
}

/**
 * Core API helper for Firebase Realtime Database
 */
async function api(action, payload = {}) {
  const fetch = fetchFirebase; // Shadow global fetch inside api function to catch errors
  try {
    // Clean URL (remove trailing slash from DB_URL if present)
    let baseUrl = DB_URL.endsWith('/') ? DB_URL.slice(0, -1) : DB_URL;
    if (typeof DB_PATH_KEY !== 'undefined' && DB_PATH_KEY) {
      baseUrl = `${baseUrl}/${DB_PATH_KEY}`;
    }

    const requirePmAuth = async () => {
      const reviewerEmail = String(payload.reviewerEmail || '').toLowerCase();
      const reviewerPassHash = String(payload.reviewerPassHash || '');
      if (!reviewerEmail || !reviewerPassHash) return false;
      const authRes = await fetch(`${baseUrl}/users.json`);
      const authData = await authRes.json();
      return Object.values(authData || {}).some(user =>
        String(user.email || '').toLowerCase() === reviewerEmail &&
        user.role === 'pm' && user.active !== false &&
        String(user.pass_hash || user.pass || '') === reviewerPassHash
      );
    };

    const getDepartmentNames = async () => {
      const defaults = ['UXUI', 'Media', 'Art', 'PM'];
      const [departmentsRes, usersRes] = await Promise.all([
        fetch(`${baseUrl}/departments.json`),
        fetch(`${baseUrl}/users.json`)
      ]);
      const departmentsData = await departmentsRes.json();
      const usersData = await usersRes.json();
      const stored = Object.values(departmentsData || {}).filter(dept => dept && dept.active !== false).map(dept => String(dept.name || '').trim());
      const usedByMembers = Object.values(usersData || {}).map(user => String(user.dept || '').trim());
      return [...new Set([...defaults, ...stored, ...usedByMembers].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    };

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
          if (user.active === false) {
            console.warn(`[api:login] Failed: ${payload.email} (User suspended)`);
            return { ok: false, error: 'บัญชีนี้ถูกระงับการใช้งาน' };
          }
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

    // 3. DEPARTMENTS
    if (action === 'listDepartments') {
      return { ok: true, departments: await getDepartmentNames() };
    }

    if (action === 'addDepartment') {
      if (!(await requirePmAuth())) return { ok: false, error: 'ไม่มีสิทธิ์เพิ่มแผนก' };
      const name = String(payload.name || '').trim().replace(/\s+/g, ' ');
      if (!name || name.length > 40 || /[\u0000-\u001f<>]/.test(name)) return { ok: false, error: 'ชื่อแผนกไม่ถูกต้อง' };
      const departments = await getDepartmentNames();
      if (departments.some(dept => dept.toLocaleLowerCase('th') === name.toLocaleLowerCase('th'))) return { ok: false, error: 'มีแผนกนี้อยู่แล้ว' };
      const res = await fetch(`${baseUrl}/departments.json`, {
        method: 'POST',
        body: JSON.stringify({ name, active: true, created_by: payload.reviewerEmail, created_at: new Date().toISOString() })
      });
      return { ok: res.ok, name };
    }

    // 4. INVITE-ONLY REGISTRATION
    if (action === 'createRegistrationInvite') {
      if (!(await requirePmAuth())) return { ok: false, error: 'ไม่มีสิทธิ์สร้างลิงก์ลงทะเบียน' };
      const token = String(payload.token || '');
      if (!/^[a-f0-9]{48}$/i.test(token)) return { ok: false, error: 'Invalid invite token' };
      const invite = { token, status: 'open', created_by: payload.reviewerEmail, created_at: new Date().toISOString() };
      const res = await fetch(`${baseUrl}/registrationInvites/${token}.json`, { method: 'PUT', body: JSON.stringify(invite) });
      return { ok: res.ok };
    }

    if (action === 'validateRegistrationInvite') {
      const token = String(payload.token || '');
      if (!/^[a-f0-9]{48}$/i.test(token)) return { ok: false, error: 'ลิงก์ลงทะเบียนไม่ถูกต้อง' };
      const res = await fetch(`${baseUrl}/registrationInvites/${token}.json`);
      const invite = await res.json();
      if (!invite || invite.status !== 'open') return { ok: false, error: 'ลิงก์นี้ถูกใช้งานแล้วหรือไม่สามารถใช้งานได้' };
      return { ok: true };
    }

    if (action === 'submitRegistration') {
      const token = String(payload.token || '');
      const email = String(payload.email || '').trim().toLowerCase();
      if (!/^[a-f0-9]{48}$/i.test(token)) return { ok: false, error: 'ลิงก์ลงทะเบียนไม่ถูกต้อง' };
      if (!email || !payload.name || !payload.passHash) return { ok: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ' };
      const usersRes = await fetch(`${baseUrl}/users.json`);
      const usersData = await usersRes.json();
      if (Object.values(usersData || {}).some(user => String(user.email || '').toLowerCase() === email)) return { ok: false, error: 'อีเมลนี้มีบัญชีในระบบแล้ว' };

      const inviteUrl = `${baseUrl}/registrationInvites/${token}.json`;
      const inviteRes = await globalThis.fetch(inviteUrl, { headers: { 'X-Firebase-ETag': 'true' } });
      const invite = inviteRes.ok ? await inviteRes.json() : null;
      const etag = inviteRes.headers.get('etag');
      if (!invite || invite.status !== 'open' || !etag) return { ok: false, error: 'ลิงก์นี้ถูกใช้งานแล้วหรือไม่สามารถใช้งานได้' };
      const publicDepartments = (await getDepartmentNames()).filter(dept => dept.toLocaleLowerCase('th') !== 'pm');
      const submittedInvite = {
        ...invite,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        registration: {
          email, name: String(payload.name).trim(), nickname: String(payload.nickname || '').trim(),
          phone: String(payload.phone || '').trim(),
          birthday: /^\d{4}-\d{2}-\d{2}$/.test(payload.birthday || '') && payload.birthday <= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` ? payload.birthday : '',
          dept: publicDepartments.includes(payload.dept) ? payload.dept : '',
          location_type: payload.locationType || 'bkk', pass_hash: payload.passHash
        }
      };
      const consumeRes = await globalThis.fetch(inviteUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(submittedInvite)
      });
      if (consumeRes.status === 412) return { ok: false, error: 'ลิงก์นี้เพิ่งถูกใช้งานไปแล้ว' };
      if (!consumeRes.ok) return { ok: false, error: 'ส่งคำขอลงทะเบียนไม่สำเร็จ' };
      const pmUsers = Object.values(usersData || {}).filter(user => user.role === 'pm' && user.active !== false && user.email);
      await Promise.allSettled(pmUsers.map(pm => globalThis.fetch(`${baseUrl}/notifications.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          toEmail: pm.email, title: '👤 คำขอลงทะเบียนใหม่', message: `${submittedInvite.registration.name} (${email}) รอการอนุมัติ`,
          link: '#members', read: false, createdAt: new Date().toISOString()
        })
      })));
      return { ok: true };
    }

    if (action === 'listPendingRegistrations') {
      if (!(await requirePmAuth())) return { ok: false, error: 'ไม่มีสิทธิ์ดูคำขอลงทะเบียน' };
      const res = await fetch(`${baseUrl}/registrationInvites.json`);
      const data = await res.json();
      const registrations = Object.entries(data || {}).filter(([, invite]) => invite.status === 'submitted' && invite.registration).map(([token, invite]) => ({
        token, email: invite.registration.email, name: invite.registration.name, nickname: invite.registration.nickname || '',
        phone: invite.registration.phone || '', birthday: invite.registration.birthday || '', dept: invite.registration.dept || '',
        locationType: invite.registration.location_type || 'bkk', submittedAt: invite.submitted_at || ''
      }));
      return { ok: true, registrations };
    }

    if (action === 'reviewRegistration') {
      if (!(await requirePmAuth())) return { ok: false, error: 'ไม่มีสิทธิ์อนุมัติคำขอลงทะเบียน' };
      const token = String(payload.token || '');
      const inviteRes = await fetch(`${baseUrl}/registrationInvites/${token}.json`);
      const invite = await inviteRes.json();
      if (!invite || invite.status !== 'submitted' || !invite.registration) return { ok: false, error: 'ไม่พบคำขอที่รออนุมัติ' };
      if (payload.decision === 'reject') {
        await fetch(`${baseUrl}/registrationInvites/${token}.json`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected', reviewed_by: payload.reviewerEmail, reviewed_at: new Date().toISOString(), registration: null }) });
        return { ok: true };
      }
      const registration = invite.registration;
      const usersRes = await fetch(`${baseUrl}/users.json`);
      const usersData = await usersRes.json();
      if (Object.values(usersData || {}).some(user => String(user.email || '').toLowerCase() === registration.email)) return { ok: false, error: 'อีเมลนี้มีบัญชีในระบบแล้ว' };
      const newUser = {
        email: registration.email, name: registration.name, nickname: registration.nickname || '', phone: registration.phone || '',
        birthday: registration.birthday || '', start_date: payload.startDate || '', discordId: '', role: payload.role || 'junior',
        dept: registration.dept || '', pass_hash: registration.pass_hash, added_by: payload.reviewerEmail,
        added_at: new Date().toISOString(), location_type: registration.location_type || 'bkk', user_id: payload.userId || '', active: true
      };
      await fetch(`${baseUrl}/users.json`, { method: 'POST', body: JSON.stringify(newUser) });
      await fetch(`${baseUrl}/registrationInvites/${token}.json`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', reviewed_by: payload.reviewerEmail, reviewed_at: new Date().toISOString(), registration: null }) });
      return { ok: true, user: newUser };
    }

    // 5. USERS (CRUD)
    if (action === 'addUser') {
      const res = await fetch(`${baseUrl}/users.json`, {
        method: 'POST',
        body: JSON.stringify({
          email: payload.email,
          name: payload.name,
          nickname: payload.nickname || '',
          discordId: payload.discordId || '',
          birthday: payload.birthday || '',
          start_date: payload.startDate || '',
          phone: payload.phone || '',
          role: payload.role,
          dept: payload.dept || '',
          pass_hash: payload.pass,
          added_by: payload.addedBy || '',
          added_at: payload.addedAt || new Date().toISOString(),
          location_type: payload.locationType || 'bkk',
          user_id: payload.userId || '',
          active: payload.active !== false,
          suspended_at: payload.suspendedAt || ''
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
          start_date: payload.startDate || '',
          phone: payload.phone || '',
          role: payload.role,
          dept: payload.dept || '',
          location_type: payload.locationType || 'bkk'
        };
        if (payload.pass) updateData.pass_hash = payload.pass;
        if (payload.userId) updateData.user_id = payload.userId;
        if (payload.active !== undefined) updateData.active = payload.active;
        if (payload.suspendedAt !== undefined) updateData.suspended_at = payload.suspendedAt || '';
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

    // 7. NOTIFICATIONS (in-app)
    if (action === 'addNotification') {
      const res = await fetch(`${baseUrl}/notifications.json`, {
        method: 'POST',
        body: JSON.stringify({
          toEmail: payload.toEmail,
          title: payload.title,
          message: payload.message || '',
          link: payload.link || '',
          read: false,
          createdAt: new Date().toISOString()
        })
      });
      return { ok: res.ok };
    }

    if (action === 'markNotificationRead') {
      if (!payload._fbKey) return { ok: false, error: 'missing _fbKey' };
      const res = await fetch(`${baseUrl}/notifications/${payload._fbKey}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true })
      });
      return { ok: res.ok };
    }

    // 3. READ DATA (Bootstrap & Others)
    const pathMap = {
      getUsers: 'users',
      getLeaves: 'leaves',
      getExs: 'exercises',
      getQuotas: 'quotas',
      getNotifications: 'notifications'
    };

    const path = pathMap[action] || action;
    const response = await fetch(`${baseUrl}/${path}.json`);
    if (!response.ok) throw new Error(`Firebase read error: ${response.status}`);
    const data = await response.json();

    // Firebase returns objects if keys are strings, but we need arrays
    // For exercises/notifications, attach _fbKey so we can update/delete directly without scanning
    let arrayData;
    if (!Array.isArray(data) && (path === 'exercises' || path === 'notifications')) {
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
        : '⚠️ Sync ไม่สำเร็จ [' + action + ']: ' + (res.error || 'unknown');
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
    discordId: u.discordId || u.discord_id || '',
    birthday: u.birthday || '',
    startDate: u.startDate || u.start_date || '',
    phone: u.phone || '',
    role: u.role,
    dept: u.dept,
    pass: u.pass_hash || u.pass || '',
    addedBy: u.added_by || u.addedBy || 'system',
    addedAt: u.added_at || u.addedAt || new Date().toISOString(),
    locationType: u.location_type || u.locationType || 'bkk',
    active: u.active !== false,
    suspendedAt: u.suspendedAt || u.suspended_at || '',
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
    hasDoc: l.hasDoc !== undefined ? !!l.hasDoc : !!l.doc_url,
    docName: l.docName || l.doc_url || null,
    submittedAt: l.submittedAt || l.requested_at || l.submitted_at || new Date().toISOString(),
    leadAction: l.leadAction || null,
    pmAction: l.pmAction || null,
    leadNote: l.leadNote || '',
    pmNote: l.pmNote || '',
    autoEscalated: !!l.autoEscalated,
    isLeadLeave: !!l.isLeadLeave,
    addedBy: l.addedBy || null,
    dept: l.dept,
    reviewedBy: l.reviewedBy || '',
    reviewedAt: l.reviewedAt || '',
    rejectReason: l.rejectReason || l.reject_reason || '',
    rejectedBy: l.rejectedBy || l.rejected_by || '',
    docRejectReason: l.docRejectReason || '',
    pendingDocReview: !!l.pendingDocReview
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
    rejectReason: e.reject_reason || e.rejectReason || '',
    rejectedBy: e.rejected_by || e.rejectedBy || '',
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
 * สร้างการแจ้งเตือนภายในระบบให้ user คนใดคนหนึ่ง (แสดงที่กระดิ่งแจ้งเตือนมุมขวาบน)
 */
function notifyUser(toEmail, title, message, link) {
  if (typeof api !== 'function' || !toEmail) return;
  api('addNotification', { toEmail, title, message, link }).catch(() => {});
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
    pm_approved_leave: '✅ PM อนุมัติใบลาแล้ว',
    pm_rejected_leave: '❌ PM ไม่อนุมัติใบลา',
    pm_rejected_doc: '📎 เอกสารไม่ผ่าน — กรุณาแนบใหม่'
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
      rejectReason: leave.rejectReason || leave.docRejectReason || '',
      rejectedBy: leave.rejectedBy || '',
      submittedAt: leave.submittedAt
    })
  }).catch(() => {});
}

/**
 * เช็คใบลาทำฟันที่ยังไม่แนบหลักฐาน เกิน 2 วันจากวันที่ยื่น → ยิงแจ้งเตือน n8n รวมเป็นก้อนเดียว
 * ส่งได้สูงสุดวันละ 1 ครั้ง (กันซ้ำด้วย flag lastDentalReminderDate ใน Firebase)
 */
async function checkDentalDocReminders() {
  if (!N8N_WEBHOOK_URL) return;
  try {
    let baseUrl = DB_URL.endsWith('/') ? DB_URL.slice(0, -1) : DB_URL;
    if (typeof DB_PATH_KEY !== 'undefined' && DB_PATH_KEY) baseUrl = `${baseUrl}/${DB_PATH_KEY}`;
    const flagUrl = `${baseUrl}/system/lastDentalReminderDate.json`;

    const today = new Date().toISOString().slice(0, 10);
    const flagRes = await fetchFirebase(flagUrl);
    const lastSent = await flagRes.json();
    if (lastSent === today) return;

    const leaves = (typeof getLeaves === 'function') ? getLeaves() : [];
    const users = (typeof getUsers === 'function') ? getUsers() : [];
    const todayMs = new Date(today + 'T00:00:00').getTime();

    const overdue = leaves.reduce((acc, r) => {
      if (r.type !== 'dental' || r.docName || r.status === 'rejected') return acc;
      const ref = (r.submittedAt || r.start || '').slice(0, 10);
      if (!ref) return acc;
      const daysWaiting = Math.floor((todayMs - new Date(ref + 'T00:00:00').getTime()) / 864e5);
      if (daysWaiting < 2) return acc;
      const u = users.find(x => x.email === r.email);
      acc.push({
        id: r.id,
        refNo: r.refNo || '',
        name: (u && u.name) || r.name || '',
        nickname: (u && u.nickname) || (r.name || '').split(' ')[0],
        email: r.email,
        discordId: (u && u.discordId) || '',
        dept: (u && u.dept) || r.dept || '',
        start: r.start,
        end: r.end,
        submittedAt: r.submittedAt || '',
        daysWaiting
      });
      return acc;
    }, []);

    if (!overdue.length) return;

    await fetch(n8nUrl(N8N_WEBHOOK_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'dental_doc_reminder',
        eventLabel: '⚠️ แจ้งเตือน — รอแนบหลักฐานลาทำฟัน',
        date: today,
        count: overdue.length,
        reminders: overdue
      })
    });

    await fetchFirebase(flagUrl, { method: 'PUT', body: JSON.stringify(today) });
  } catch (e) {
    console.error('[checkDentalDocReminders]', e);
  }
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
  const EX_POLICY_V2_START = '2026-09-01';
  const rewardRates = String(ex.date || '') >= EX_POLICY_V2_START
    ? { solo: 100, group_ex: 300, group_eat: 200 }
    : { solo: 100, group_ex: 500, group_eat: 300 };

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
  // Use the same date-based calculator as the UI when available so the
  // dashboard, approval screen, leaderboard and Sheets always agree.
  const reward = typeof getExerciseReward === 'function'
    ? getExerciseReward(ex)
    : (rewardRates[ex.exType] || 0);
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

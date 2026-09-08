/**
 * Design Flow API Layer (Firebase version)
 * ────────────────────────────────────────────
 */

// Firebase Storage bucket สำหรับอัปโหลดเอกสารแนบ (ใบลา ฯลฯ)
const FIREBASE_STORAGE_BUCKET = 'design-cz.firebasestorage.app';

const API_STATE = {
  online: true,
  lastSync: null,
  lastError: null
};

const _HOLIDAY_TTL = 86400000; // cache 24 ชั่วโมง

const _HOLIDAY_CACHE_KEY = 'tf_holidays_server_v4';

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
    const result = await api('getThaiHolidays');
    if (!result.ok || !Array.isArray(result.holidays)) throw new Error(result.error || 'Holiday service unavailable');
    const seen = new Set();
    const d = result.holidays
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

// All Realtime Database access goes through the authenticated server gateway.
const DESIGN_FLOW_GATEWAY_URL = /^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)
  ? 'http://localhost:8765/design-flow-api'
  : 'https://design-cz.web.app/design-flow-api';
const DESIGN_FLOW_SESSION_TOKEN_KEY = 'design_flow_gateway_session_v1';
const DESIGN_FLOW_SESSION_EMAIL_KEY = 'design_flow_gateway_email_v1';
const DESIGN_FLOW_PUBLIC_ACTIONS = new Set([
  'listDepartments',
  'validateRegistrationInvite',
  'submitRegistration',
]);

function designFlowSessionToken() {
  try { return String(localStorage.getItem(DESIGN_FLOW_SESSION_TOKEN_KEY) || ''); }
  catch { return ''; }
}

function clearDesignFlowSession() {
  try {
    localStorage.removeItem(DESIGN_FLOW_SESSION_TOKEN_KEY);
    localStorage.removeItem(DESIGN_FLOW_SESSION_EMAIL_KEY);
  } catch {}
}

function storeDesignFlowSession(result) {
  if (!result?.ok || !result.token) return;
  localStorage.setItem(DESIGN_FLOW_SESSION_TOKEN_KEY, result.token);
  localStorage.setItem(DESIGN_FLOW_SESSION_EMAIL_KEY, String(result.user?.email || '').toLowerCase());
}

async function callDesignFlowGateway(path, body, token = '') {
  const response = await fetch(`${DESIGN_FLOW_GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ ok: false, error: `HTTP_${response.status}` }));
  if (response.status === 401) clearDesignFlowSession();
  if (!response.ok && result.ok !== false) result.ok = false;
  return result;
}

async function prepareGoogleLogin() {
  const [configResult, appModule, authModule] = await Promise.all([
    callDesignFlowGateway('/auth/config', {}),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
  ]);
  if (!configResult.ok || !configResult.googleEnabled || !configResult.firebase?.apiKey) {
    throw new Error('Google Sign-In ยังไม่ได้เปิดใช้งาน');
  }
  const appName = 'design-flow-google-auth';
  const app = appModule.getApps().find(item => item.name === appName)
    || appModule.initializeApp(configResult.firebase, appName);
  const auth = authModule.getAuth(app);
  await authModule.setPersistence(auth, authModule.inMemoryPersistence);
  return { auth, authModule };
}

const googleLoginSetupPromise = prepareGoogleLogin()
  .then(value => ({ value }), error => {
    console.warn('[google-auth-setup]', error.message);
    return { error };
  });

async function loginWithGoogle() {
  const setup = await googleLoginSetupPromise;
  if (setup.error) throw setup.error;
  const { auth, authModule } = setup.value;
  const provider = new authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let credential;
  try {
    credential = await authModule.signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken(true);
    const result = await callDesignFlowGateway('/auth/google', { idToken });
    storeDesignFlowSession(result);
    return result;
  } catch (error) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      return { ok: false, error: 'บัญชีนี้ต้องเชื่อม Google กับรหัสผ่านเดิมก่อน กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' };
    }
    if (error.code === 'auth/popup-closed-by-user') return { ok: false, error: 'ยกเลิกการเข้าสู่ระบบ Google' };
    throw error;
  } finally {
    if (credential) await authModule.signOut(auth).catch(() => {});
  }
}

async function api(action, payload = {}) {
  try {
    if (action === 'login') {
      const result = await callDesignFlowGateway('/auth/login', {
        email: payload.email,
        password: payload.password,
      });
      storeDesignFlowSession(result);
      return result;
    }

    if (DESIGN_FLOW_PUBLIC_ACTIONS.has(action) && !designFlowSessionToken()) {
      return callDesignFlowGateway('/public', { action, payload });
    }

    const token = designFlowSessionToken();
    if (!token) return { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', code: 'AUTH_REQUIRED' };
    return callDesignFlowGateway('/action', { action, payload }, token);
  } catch (error) {
    console.error('[design-flow-gateway]', error);
    return { ok: false, error: 'ไม่สามารถเชื่อมต่อระบบได้', _network: true };
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

// ── UNIFIED NOTIFICATION ROUTER ────────────────────────────────────────────
// Design Flow decides who receives each notification and prepares the final
// message. n8n receives only the minimum delivery payload and sends Discord DM.
const NOTIFICATION_APP_URL = 'https://design-cz.com/';

function _activeNotificationUsers() {
  return (typeof getUsers === 'function' ? getUsers() : []).filter(u => u && u.active !== false);
}

function _discordIds(users) {
  return [...new Set(users.map(u => String(u.discordId || '').trim()).filter(Boolean))];
}

function _resolveNotificationRoute(event, context = {}) {
  const users = _activeNotificationUsers();
  const pms = () => _discordIds(users.filter(u => u.role === 'pm'));
  const member = () => _discordIds(users.filter(u => String(u.email || '').toLowerCase() === String(context.email || '').toLowerCase()));
  const deptLeads = () => _discordIds(users.filter(u =>
    u.role === 'lead' && u.dept && context.dept &&
    u.dept.trim().toLowerCase() === String(context.dept).trim().toLowerCase()
  ));

  if (event === 'new_leave_member') {
    if (context.status === 'pending_pm') return { recipientDiscordIds: pms(), resolvedAs: 'pm_fallback_no_lead' };
    const leads = deptLeads();
    return leads.length
      ? { recipientDiscordIds: leads, resolvedAs: 'department_lead' }
      : { recipientDiscordIds: pms(), resolvedAs: 'pm_fallback_no_lead' };
  }
  if (['new_leave_lead', 'lead_submitted_for_member', 'lead_approved_leave', 'new_exercise'].includes(event)) {
    return { recipientDiscordIds: pms(), resolvedAs: 'pm' };
  }
  if (['lead_rejected_leave', 'pm_approved_leave', 'pm_rejected_leave', 'pm_rejected_doc', 'dental_doc_reminder', 'accu_history_added', 'exercise_approved', 'exercise_rejected'].includes(event)) {
    return { recipientDiscordIds: member(), resolvedAs: 'member' };
  }
  return { recipientDiscordIds: [], resolvedAs: 'unresolved' };
}

function _notificationCopy(event, context = {}) {
  const nickname = context.nickname || 'สมาชิก';
  const displayDate = value => {
    const raw = normalizeDate(value);
    const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
  };
  const dateRange = context.start && context.end && context.start !== context.end
    ? `${displayDate(context.start)} – ${displayDate(context.end)}`
    : displayDate(context.start || context.date || '');
  const leaveDays = Number(context.days || 0);
  const leaveAmount = leaveDays > 0 ? `${leaveDays} วัน` : 'ตามวันที่ระบุ';
  const leaveDept = context.dept || 'ไม่ระบุแผนก';
  const leaveReason = context.reason || 'ไม่ระบุเหตุผล';
  const decisionNote = context.decisionNote || 'ไม่ระบุเหตุผล';
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const copy = {
    new_leave_member: {
      title: context.status === 'pending_pm' ? '📋 คำขอลา — รอ PM อนุมัติ' : '📋 คำขอลา — รอหัวหน้าอนุมัติ',
      body: `${divider}\n\n👤 ${nickname} (${leaveDept}) ต้องการ ${context.typeLabel || 'ลา'} จำนวน ${leaveAmount}\n📅 วันที่: ${dateRange}\n📝 เหตุผล: ${leaveReason}`,
      page: context.status === 'pending_pm' ? 'leave-pm' : 'leave-review'
    },
    new_leave_lead: { title: '📋 คำขอลาหัวหน้า — รอ PM อนุมัติ', body: `${divider}\n\n👤 ${nickname} (${leaveDept}) ต้องการ ${context.typeLabel || 'ลา'} จำนวน ${leaveAmount}\n📅 วันที่: ${dateRange}\n📝 เหตุผล: ${leaveReason}`, page: 'leave-pm' },
    lead_submitted_for_member: { title: '📋 หัวหน้ายื่นลาแทนสมาชิก — รอ PM อนุมัติ', body: `${divider}\n\n👤 ${context.submittedBy || 'หัวหน้าทีม'} ยื่นแทน ${nickname} (${leaveDept})\n🏷️ ${context.typeLabel || 'ลา'} จำนวน ${leaveAmount}\n📅 วันที่: ${dateRange}\n📝 เหตุผล: ${leaveReason}`, page: 'leave-pm' },
    lead_approved_leave: { title: '✅ หัวหน้าอนุมัติแล้ว — รอ PM', body: `${divider}\n\n👤 ${nickname} (${leaveDept}) — ${context.typeLabel || 'ใบลา'} จำนวน ${leaveAmount}\n📅 วันที่: ${dateRange}\n📝 เหตุผล: ${leaveReason}`, page: 'leave-pm' },
    lead_rejected_leave: { title: '❌ คำขอลาของคุณไม่ได้รับการอนุมัติจากหัวหน้า', body: `${divider}\n🏷️ ประเภท: ${context.typeLabel || 'ใบลา'}\n📅 วันที่: ${dateRange}\n🚫 เหตุผลที่ปฏิเสธ: ${decisionNote}`, page: 'leave-history' },
    pm_approved_leave: { title: 'คำขอลาของคุณได้รับการอนุมัติแล้ว! 🎉', body: `${divider}\n🏷️ ประเภท: ${context.typeLabel || 'ใบลา'}\n📅 วันที่: ${dateRange}\n⏱️ จำนวน: ${leaveAmount}`, page: 'leave-history', includeLink: false },
    pm_rejected_leave: { title: '❌ คำขอลาของคุณไม่ได้รับการอนุมัติจาก PM', body: `${divider}\n🏷️ ประเภท: ${context.typeLabel || 'ใบลา'}\n📅 วันที่: ${dateRange}\n🚫 เหตุผลที่ปฏิเสธ: ${decisionNote}`, page: 'leave-history' },
    pm_rejected_doc: { title: '❌ เอกสารแนบไม่ผ่านการตรวจสอบ', body: `${divider}\n🏷️ ประเภท: ${context.typeLabel || 'ใบลา'}\n📅 วันที่: ${dateRange}\n🚫 เหตุผล: ${decisionNote}\n📎 กรุณาแนบเอกสารใหม่`, page: 'leave-history' },
    dental_doc_reminder: { title: '⚠️ กรุณาแนบหลักฐานลาทำฟัน', body: `${divider}\n🦷 ประเภท: ลาทำฟัน\n📅 วันที่: ${dateRange}\n📎 สถานะ: ยังไม่ได้แนบเอกสาร`, page: 'leave-history' },
    accu_history_added: { title: '📅 มีการเพิ่มวันลาสะสม', body: `เปิด Design Flow เพื่อตรวจสอบยอดวันลา`, page: 'my-balance' },
    new_exercise: { title: '📥 คำขอเบิกออกกำลังกายใหม่', body: `${nickname} ยื่น${context.typeLabel || 'กิจกรรม'} ${dateRange}`, page: 'exercise-review' },
    exercise_approved: { title: '✅ PM อนุมัติกิจกรรมแล้ว', body: `${context.typeLabel || 'กิจกรรม'} ${dateRange} ได้รับการอนุมัติแล้ว`, page: 'exercise-log' },
    exercise_rejected: { title: '❌ PM ไม่อนุมัติกิจกรรม', body: `${context.typeLabel || 'กิจกรรม'} ${dateRange}\nเปิด Design Flow เพื่อดูรายละเอียด`, page: 'exercise-log' }
  };
  const selected = copy[event] || { title: '🔔 การแจ้งเตือนจาก Design Flow', body: 'เปิดระบบเพื่อตรวจสอบรายละเอียด', page: 'dashboard' };
  const link = `${NOTIFICATION_APP_URL}#${selected.page}`;
  const description = selected.body.split('\n').filter(line => line !== divider).join('\n').trim();
  const messageParts = [selected.title, description];
  if (selected.includeLink !== false) messageParts.push(`🔗 ${link}`);
  const message = messageParts.join('\n');
  return { ...selected, description, link, message };
}

function _notificationColor(event) {
  if (['pm_approved_leave', 'exercise_approved'].includes(event)) return '#57F287';
  if (['lead_rejected_leave', 'pm_rejected_leave', 'pm_rejected_doc', 'exercise_rejected'].includes(event)) return '#ED4245';
  if (['dental_doc_reminder'].includes(event)) return '#FEE75C';
  return '#5865F2';
}

function sendN8nNotification(event, context = {}) {
  const route = _resolveNotificationRoute(event, context);
  const copy = _notificationCopy(event, context);
  const entityId = context.id || context.email || 'event';
  const payload = {
    schemaVersion: 'design-flow.notification.v1',
    kind: 'notification',
    event,
    eventId: `${event}:${entityId}:${Date.now()}`,
    occurredAt: new Date().toISOString(),
    destination: 'discord',
    deliveryMode: 'direct_message',
    resolvedAs: route.resolvedAs,
    recipientDiscordIds: route.recipientDiscordIds,
    title: copy.title,
    description: copy.description,
    color: _notificationColor(event),
    message: copy.message,
    link: copy.link
  };
  if (!route.recipientDiscordIds.length) console.warn('[notification] no Discord recipient resolved:', event);
  return api('dispatchN8nNotification', { payload });
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
  const LT = { sick: '🤒 ลาป่วย', personal: '📋 ลากิจ', vacation: '🏖️ ลาพักร้อน', dental: '🦷 ลาทำฟัน', birthday: '🎂 ลาวันเกิด', funeral: '🕯️ ลาฌาปนกิจ', maternity: '🤱 ลาคลอด', training: '📚 ลาฝึกอบรม', sterilize: '⚕️ ลาทำหมัน', ordain: '🙏 ลาบวช', other: '📌 อื่นๆ' };
  const u = (typeof getUsers === 'function' ? getUsers() : []).find(x => x.email === leave.email);
  const displayName = (u && u.nickname) ? u.nickname : leave.name.split(' ')[0];
  return sendN8nNotification(event, {
    id: leave.id,
    email: leave.email,
    dept: leave.dept || '',
    status: leave.status || '',
    nickname: displayName,
    typeLabel: LT[leave.type] || leave.type,
    start: leave.start,
    end: leave.end,
    days: leave.days,
    reason: leave.reason || '',
    submittedBy: leave.addedBy || '',
    decisionNote: event === 'lead_rejected_leave'
      ? (leave.leadNote || '')
      : (['pm_rejected_leave', 'pm_rejected_doc'].includes(event) ? (leave.pmNote || '') : '')
  });
}

/**
 * เช็คใบลาทำฟันที่ยังไม่แนบหลักฐาน เกิน 2 วันจากวันที่ลา → แจ้งเตือนผ่าน n8n
 * ส่งได้สูงสุดวันละ 1 ครั้ง (กันซ้ำด้วย flag lastDentalReminderDate ใน Firebase)
 */
async function checkDentalDocReminders() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const flagResult = await api('getDentalReminderDate');
    if (!flagResult.ok) return;
    const lastSent = flagResult.date;
    if (lastSent === today) return;

    const leaves = (typeof getLeaves === 'function') ? getLeaves() : [];
    const users = (typeof getUsers === 'function') ? getUsers() : [];
    const todayMs = new Date(today + 'T00:00:00').getTime();

    const overdue = leaves.reduce((acc, r) => {
      if (r.type !== 'dental' || r.docName || r.status === 'rejected') return acc;
      const ref = normalizeDate(r.start || r.submittedAt || '');
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

    const deliveries = await Promise.all(overdue.map(reminder => sendN8nNotification('dental_doc_reminder', {
      id: reminder.id,
      email: reminder.email,
      start: reminder.start,
      end: reminder.end
    })));
    if (!deliveries.some(result => result.ok)) throw new Error('ไม่สามารถส่งการแจ้งเตือนเอกสารลาทำฟันได้');

    await api('setDentalReminderDate', { date: today });
  } catch (e) {
    console.error('[checkDentalDocReminders]', e);
  }
}

/**
 * Sync ข้อมูลใบลาที่ PM อนุมัติแล้วไปยัง Google Sheets ผ่าน n8n
 */
function syncLeaveApprovedToSheets(leave, approvedByName) {
  const LT = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักร้อน', dental: 'ลาทำฟัน', birthday: 'ลาวันเกิด', funeral: 'ลาฌาปนกิจ', maternity: 'ลาคลอด', training: 'ลาฝึกอบรม', sterilize: 'ลาทำหมัน', ordain: 'ลาบวช', other: 'อื่นๆ' };
  const u = (typeof getUsers === 'function' ? getUsers() : []).find(x => x.email === leave.email);
  const fullName = (u && u.name) ? u.name : (leave.name || '');
  const email = (u && u.email) ? u.email : (leave.email || '');
  const nickname = (u && u.nickname) ? u.nickname : (fullName.split(' ')[0] || '');
  const dept = (u && u.dept) ? u.dept : (leave.dept || '');
  const periodLabel = leave.isHalf ? (leave.period === 'morning' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย') : 'เต็มวัน';
  api('syncN8nLeaveSheet', { payload: {
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
  }}).catch(() => {});
}

/**
 * แจ้งเตือน n8n เมื่อ PM เพิ่มวันลาสะสมให้สมาชิก
 */
function notifyAccuHistory(targetEmail, entry) {
  return sendN8nNotification('accu_history_added', {
    id: entry.refNo || entry.addedAt || targetEmail,
    email: targetEmail
  });
}

/**
 * แจ้งเตือน n8n → Discord เมื่อมี exercise request ใหม่
 */
function notifyNewExercise(ex) {
  const typeLabel = { solo: '🏃 เดี่ยว', group_ex: '🤸 กลุ่มออกกำลังกาย', group_eat: '🍽️ กลุ่มกินข้าว' };
  return sendN8nNotification('new_exercise', {
    id: ex.id,
    nickname: ex.nickname || (ex.name || '').split(' ')[0],
    typeLabel: typeLabel[ex.exType] || ex.exType,
    date: ex.date
  });
}

/**
 * Sync ข้อมูลการยื่นออกกำลังกายไปยัง Google Sheets ผ่าน n8n
 * event: 'exercise_submitted' | 'exercise_approved'
 */
function syncExerciseToSheets(ex, event) {
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

  api('syncN8nExerciseSheet', { payload: {
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
  }}).catch(() => {});
}

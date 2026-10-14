/* ==========================================================================
   Design Flow v3 — บันทึกกิจกรรม (audit log) · PM เท่านั้น
   READ-ONLY: อ่านอย่างเดียวผ่าน api('getAuditLog') — ไม่มีปุ่มแก้/ลบบันทึก
   ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.DFV3) return;
  var D = window.DFV3, esc = D.esc;

  var VERB = {
    login: 'เข้าระบบ', submitRegistration: 'ส่งฟอร์มลงทะเบียน',
    addLeave: 'ยื่นใบลา', updateLeave: 'แก้ไขใบลา', deleteLeave: 'ลบใบลา',
    addEx: 'ยื่นเบิกออกกำลังกาย', updateEx: 'แก้ไขรายการออกกำลังกาย', deleteEx: 'ลบรายการออกกำลังกาย',
    addUser: 'เพิ่มสมาชิก', updateUser: 'แก้ไขข้อมูลสมาชิก', deleteUser: 'ปิดบัญชีสมาชิก',
    updateMyProfile: 'เปลี่ยนรูปโปรไฟล์', updateQuotas: 'แก้โควต้าวันลา',
    reviewRegistration: 'ตรวจคำขอลงทะเบียน', createRegistrationInvite: 'สร้างลิงก์เชิญ',
    addDepartment: 'เพิ่มแผนก', setDentalReminderDate: 'ระบบส่งแจ้งเตือนเอกสารลาทำฟัน (อัตโนมัติ)',
    'drive:report-config': 'ตั้งไฟล์รายงานออกกำลังกาย', 'drive:export-exercise': 'ส่งข้อมูลเข้าไฟล์รายงาน',
    'drive:finalize': 'อัปโหลดไฟล์หลักฐานเข้า Drive'
  };
  var FIELD = {
    status: 'สถานะ', reason: 'เหตุผล', rejectReason: 'เหตุผลที่ไม่อนุมัติ', type: 'ประเภท', name: 'ชื่อ', nickname: 'ชื่อเล่น',
    role: 'ตำแหน่ง', dept: 'แผนก', active: 'บัญชีใช้งาน', phone: 'เบอร์โทร', birthday: 'วันเกิด', start_date: 'วันเริ่มงาน',
    start: 'ตั้งแต่วันที่', end: 'ถึงวันที่', activity: 'กิจกรรม', duration_min: 'ระยะเวลา (นาที)', id: 'รหัสรายการ', refNo: 'เลขที่', reward: 'ยอดเบิก', ex_type: 'รูปแบบ', submittedAt: 'ยื่นเมื่อ', proof_link: 'ลิงก์หลักฐาน',
    startDate: 'วันเริ่ม', endDate: 'วันสิ้นสุด', date: 'วันที่', days: 'จำนวนวัน', amount: 'จำนวนเงิน', members: 'สมาชิกในกลุ่ม',
    approvedBy: 'อนุมัติโดย', rejectedBy: 'ไม่อนุมัติโดย', leadAction: 'ผลจากหัวหน้าทีม', pmAction: 'ผลจาก PM', location_type: 'พื้นที่',
    docRejectReason: 'เหตุผลที่ตีกลับเอกสาร', pendingDocReview: 'รอตรวจเอกสาร', reviewedAt: 'ตรวจเมื่อ', reviewedBy: 'ตรวจโดย', docStatus: 'สถานะเอกสาร',
    avatar_url: 'รูปโปรไฟล์', avatar_frame: 'กรอบรูป', discordId: 'Discord', email: 'อีเมล', suspended_at: 'ปิดบัญชีเมื่อ'
  };
  var ACTION_VAL = { approve: 'อนุมัติ', reject: 'ไม่อนุมัติ' };
  function isEmpty(v) { return v === null || v === undefined || v === ''; }
  function typeTh(label) {
    // แปลงรหัสประเภทลา (เช่น vacation) ท้ายป้ายรายการเป็นชื่อไทย
    return String(label || '').split(' · ').map(function (part) {
      return (typeof LT !== 'undefined' && LT[part]) ? D.plainType(part) : part;
    }).join(' · ');
  }
  var STATUS = { approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', pending: 'รออนุมัติ', pending_lead: 'รอหัวหน้าทีม', pending_pm: 'รอ PM', submitted: 'รอตรวจ', open: 'เปิดอยู่' };
  var CATS = [['all', 'ทั้งหมด'], ['leave', 'การลา'], ['exercise', 'ออกกำลังกาย'], ['member', 'สมาชิก'], ['login', 'เข้าระบบ'], ['other', 'อื่น ๆ']];
  var KIND = { create: 'สร้าง', update: 'แก้ไข', delete: 'ลบ', event: 'เหตุการณ์' };

  var state = { month: '', months: [], entries: [], loading: false, error: '', cat: 'all', who: '', q: '', open: {} };
  var cache = {};

  function cat(e) {
    if (e.target === 'leaves') return 'leave';
    if (e.target === 'exercises' || e.target === 'drive') return 'exercise';
    if (e.target === 'session') return 'login';
    if (['users', 'registrationInvites', 'departments', 'quotas'].indexOf(e.target) >= 0) return 'member';
    return 'other';
  }
  function verb(e) {
    var st = e.changes && e.changes.status && e.changes.status.to;
    var what = e.action === 'updateLeave' ? 'ใบลา' : 'การเบิกออกกำลังกาย';
    if ((e.action === 'updateLeave' || e.action === 'updateEx') && (st === 'approved' || st === 'rejected')) {
      return (st === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ') + what;
    }
    if (e.action === 'updateLeave' && st === 'pending_pm') {
      var la = e.changes.leadAction && e.changes.leadAction.to;
      if (la === 'approve' || (e.changes.status.from === 'pending_lead' && la !== 'reject')) return 'อนุมัติใบลา (หัวหน้าทีม · ส่งต่อ PM)';
    }
    if (e.action === 'updateLeave' && e.changes && e.changes.pendingDocReview && e.changes.pendingDocReview.to === false && !st) return 'ตรวจเอกสารใบลา';
    if (e.action === 'reviewRegistration' && e.note) return e.note;
    return VERB[e.action] || e.action;
  }
  function fmtVal(k, v) {
    if (v === null || v === undefined || v === '') return '<span class="df-au-empty">ว่าง</span>';
    if (k === 'status' && STATUS[v]) return esc(STATUS[v]);
    if ((k === 'leadAction' || k === 'pmAction') && ACTION_VAL[v]) return esc(ACTION_VAL[v]);
    if (v === true) return 'ใช่'; if (v === false) return 'ไม่';
    if (k === 'avatar_url') return 'รูปใหม่';
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { var d = new Date(s); if (!isNaN(d)) return esc(d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })); }
    return esc(s.length > 160 ? s.slice(0, 160) + '…' : s);
  }
  function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); }
  function dayOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function monthLabel(m) { var p = m.split('-'); return D.TH_MONTHS[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543); }
  function actorUser(e) { return D.userByEmail(e.actor) || { email: e.actor, name: e.actorName || e.actor }; }
  function actorName(e) { var u = D.userByEmail(e.actor); return (u && (D.nick(u) || u.name)) || e.actorName || e.actor || 'ระบบ'; }

  function detail(e) {
    var rows = '';
    if (e.changes) {
      Object.keys(e.changes).forEach(function (k) {
        var c = e.changes[k];
        if (isEmpty(c.from) && isEmpty(c.to)) return; // ว่าง → ว่าง ไม่ใช่การเปลี่ยนแปลงจริง
        rows += '<tr><th>' + esc(FIELD[k] || k) + '</th><td class="df-au-from">' + fmtVal(k, c.from) + '</td><td class="df-au-arrow">→</td><td class="df-au-to">' + fmtVal(k, c.to) + '</td></tr>';
      });
      return '<table class="df-au-table"><thead><tr><th>ช่อง</th><th>ก่อน</th><th></th><th>หลัง</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    var snap = e.before || e.after;
    if (snap) {
      Object.keys(snap).forEach(function (k) { rows += '<tr><th>' + esc(FIELD[k] || k) + '</th><td colspan="3">' + fmtVal(k, snap[k]) + '</td></tr>'; });
      return (e.kind === 'delete' ? '<p class="df-au-hint">ข้อมูลที่ถูกลบ (เก็บไว้ในบันทึกนี้)</p>' : '') + '<table class="df-au-table"><tbody>' + rows + '</tbody></table>';
    }
    return '<p class="df-au-hint">ไม่มีรายละเอียดเพิ่มเติม</p>';
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.entries.filter(function (e) {
      if (state.cat !== 'all' && cat(e) !== state.cat) return false;
      if (state.who && e.actor !== state.who) return false;
      if (q && (actorName(e) + ' ' + e.actor + ' ' + verb(e) + ' ' + (e.label || '') + ' ' + (e.note || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function render(view) {
    view.classList.add('df-au-view');
    if (!cu || cu.role !== 'pm') { view.innerHTML = D.header({ eyebrow: 'ทีม', title: 'บันทึกกิจกรรม' }) + '<section class="df-card"><p>หน้านี้สำหรับ PM เท่านั้น</p></section>'; return; }
    if (!state.month && !state.loading) { load(''); }
    var months = state.months.length ? state.months : [state.month || ''];
    var monthSel = '<select class="df-au-month" aria-label="เลือกเดือน" onchange="__dfAudit.month(this.value)">' + months.filter(Boolean).map(function (m) {
      return '<option value="' + m + '"' + (m === state.month ? ' selected' : '') + '>' + esc(monthLabel(m)) + '</option>';
    }).join('') + '</select>';
    var actors = {};
    state.entries.forEach(function (e) { if (e.actor) actors[e.actor] = actorName(e); });
    var whoSel = '<select class="df-au-who" aria-label="กรองตามคน" onchange="__dfAudit.who(this.value)"><option value="">ทุกคน</option>' +
      Object.keys(actors).sort(function (a, b) { return actors[a].localeCompare(actors[b], 'th'); }).map(function (k) {
        return '<option value="' + esc(k) + '"' + (k === state.who ? ' selected' : '') + '>' + esc(actors[k]) + '</option>';
      }).join('') + '</select>';
    var chips = CATS.map(function (c) {
      return '<button type="button" class="df-au-chip' + (state.cat === c[0] ? ' on' : '') + '" onclick="__dfAudit.cat(\'' + c[0] + '\')">' + c[1] + '</button>';
    }).join('');

    var body;
    if (state.loading) body = '<div class="df-au-state">กำลังโหลด…</div>';
    else if (state.error) body = '<div class="df-au-state df-au-err">โหลดไม่สำเร็จ: ' + esc(state.error) + ' <button type="button" class="btn btn-ghost" onclick="__dfAudit.reload()">ลองใหม่</button></div>';
    else {
      var list = filtered();
      if (!list.length) body = '<div class="df-au-state">ยังไม่มีบันทึกในช่วงนี้</div>';
      else {
        var html = '', lastDay = '';
        list.forEach(function (e) {
          var day = dayOf(e.at);
          if (day !== lastDay) { if (lastDay) html += '</ol>'; html += '<h3 class="df-au-day">' + esc(day) + '</h3><ol class="df-au-list">'; lastDay = day; }
          var open = !!state.open[e.id];
          var hasDetail = e.kind !== 'event' || e.note;
          html += '<li class="df-au-row k-' + esc(e.kind || 'event') + (open ? ' open' : '') + '">' +
            '<button type="button" class="df-au-main"' + (hasDetail ? ' aria-expanded="' + open + '" onclick="__dfAudit.toggle(\'' + esc(e.id) + '\')"' : ' disabled') + '>' +
              '<span class="df-au-time">' + esc(timeOf(e.at)) + '</span>' + D.avatar(actorUser(e), 32) +
              '<span class="df-au-text"><b>' + esc(actorName(e)) + '</b> ' + esc(verb(e)) +
                (e.label && e.action !== 'setDentalReminderDate' ? ' <span class="df-au-label">' + esc(typeTh(e.label)) + '</span>' : '') +
                (e.note && e.action !== 'reviewRegistration' ? ' <span class="df-au-note">· ' + esc(e.note) + '</span>' : '') + '</span>' +
              '<span class="df-au-kind">' + esc(KIND[e.kind] || '') + '</span>' +
              (hasDetail && e.kind !== 'event' ? '<svg class="df-au-caret" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>' : '') +
            '</button>' + (open && e.kind !== 'event' ? '<div class="df-au-detail">' + detail(e) + '</div>' : '') + '</li>';
        });
        body = html + '</ol>';
      }
    }
    var count = state.loading ? '' : filtered().length + ' รายการ';
    view.innerHTML = D.header({ eyebrow: 'ทีม · PM เท่านั้น', title: 'บันทึกกิจกรรม',
      actions: monthSel + '<button type="button" class="btn btn-ghost" onclick="__dfAudit.reload()">รีเฟรช</button>' }) +
      '<p class="df-au-sub">บันทึกทุกการเพิ่ม แก้ไข ลบ และการเข้าระบบ · เก็บย้อนหลัง 1 ปี · ไม่มีใครแก้หรือลบบันทึกได้</p>' +
      '<section class="df-card df-au-card"><div class="df-au-tools"><div class="df-au-chips" role="group" aria-label="ประเภท">' + chips + '</div>' +
      '<div class="df-au-filters"><input type="search" class="df-au-q" placeholder="ค้นหาชื่อ / รายการ" value="' + esc(state.q) + '" oninput="__dfAudit.q(this.value)">' + whoSel +
      '<span class="df-au-count">' + count + '</span></div></div>' + body + '</section>';
  }

  function rerender(keepFocus) {
    var active = keepFocus && document.activeElement && document.activeElement.classList.contains('df-au-q');
    var pos = active ? document.activeElement.selectionStart : 0;
    D.renderPage('audit-log');
    if (active) { var el = document.querySelector('.df-au-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
  }

  function load(month, force) {
    if (!force && month && cache[month]) { state.month = month; state.entries = cache[month].entries; state.months = cache[month].months; rerender(); return; }
    state.loading = true; state.error = ''; if (month) state.month = month;
    api('getAuditLog', month ? { month: month } : {}).then(function (res) {
      state.loading = false;
      if (!res || !res.ok) { state.error = (res && (res.error || res.code)) || 'unknown'; rerender(); return; }
      state.month = res.month; state.months = res.months || []; state.entries = res.entries || [];
      cache[res.month] = { entries: state.entries, months: state.months };
      rerender();
    });
  }

  window.__dfAudit = {
    month: function (m) { state.open = {}; load(m); },
    reload: function () { load(state.month, true); },
    cat: function (c) { state.cat = c; rerender(); },
    who: function (w) { state.who = w; rerender(); },
    q: function (v) { state.q = v; rerender(true); },
    toggle: function (id) { state.open[id] = !state.open[id]; rerender(); }
  };

  D.registerPage('audit-log', { create: true, render: render });
  try { if (typeof PAGE_ROLES !== 'undefined') PAGE_ROLES['audit-log'] = ['pm']; } catch (e) {}

  // เมนู "บันทึกกิจกรรม" — แสดงเฉพาะ PM
  function syncNav() {
    var nav = document.getElementById('nav-audit');
    if (nav) nav.style.display = (typeof cu !== 'undefined' && cu && cu.role === 'pm') ? '' : 'none';
  }
  if (D.hook) { ['setupSidebar', 'launchApp'].forEach(function (fn) { try { D.hook(fn, syncNav); } catch (e) {} }); }
  document.addEventListener('DOMContentLoaded', syncNav);
  setTimeout(syncNav, 0);
})();

/* ==========================================================================
   Design Flow v3 — บันทึกกิจกรรม (audit log) · PM เท่านั้น
   READ-ONLY: อ่านอย่างเดียวผ่าน api('getAuditLog') — ไม่มีปุ่มแก้/ลบบันทึก
   ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.DFV3) return;
  var D = window.DFV3, esc = D.esc;

  /* ---------- คำที่ใช้แสดง (ภาษาคน ไม่ใช่ชื่อช่องในระบบ) ---------- */
  var VERB = {
    login: 'เข้าสู่ระบบ', submitRegistration: 'สมัครสมาชิกผ่านลิงก์เชิญ',
    addLeave: 'ยื่นใบลา', updateLeave: 'แก้ไขรายละเอียดใบลา', deleteLeave: 'ลบใบลา',
    addEx: 'ยื่นเบิกค่าออกกำลังกาย', updateEx: 'แก้ไขรายการเบิกออกกำลังกาย', deleteEx: 'ลบรายการเบิกออกกำลังกาย',
    addUser: 'เพิ่มสมาชิกใหม่', updateUser: 'แก้ไขข้อมูลสมาชิก', deleteUser: 'ระงับบัญชีสมาชิก',
    updateMyProfile: 'เปลี่ยนรูปโปรไฟล์', updateQuotas: 'ปรับวันลาคงเหลือ',
    reviewRegistration: 'ตรวจผู้สมัครใหม่', createRegistrationInvite: 'สร้างลิงก์เชิญสมาชิกใหม่',
    addDepartment: 'เพิ่มแผนกใหม่', setDentalReminderDate: 'ส่งแจ้งเตือนคนที่ยังไม่แนบเอกสารลาทำฟัน',
    'drive:report-config': 'ตั้งค่าไฟล์รายงานออกกำลังกาย', 'drive:export-exercise': 'ส่งยอดออกกำลังกายเข้าไฟล์รายงาน',
    'drive:finalize': 'แนบไฟล์หลักฐาน (เก็บใน Google Drive)'
  };
  var FIELD = {
    status: 'สถานะ', reason: 'เหตุผลการลา', rejectReason: 'เหตุผลที่ไม่อนุมัติ', type: 'ประเภทการลา', name: 'ชื่อ-นามสกุล', nickname: 'ชื่อเล่น',
    role: 'ตำแหน่ง', dept: 'แผนก', active: 'สถานะบัญชี', phone: 'เบอร์โทร', birthday: 'วันเกิด', start_date: 'วันเริ่มงาน',
    start: 'ลาตั้งแต่', end: 'ลาถึง', startDate: 'ลาตั้งแต่', endDate: 'ลาถึง', days: 'จำนวนวันลา', period: 'ช่วงเวลา',
    date: 'วันที่', activity: 'กิจกรรม', duration_min: 'ระยะเวลา (นาที)', durationMin: 'ระยะเวลา (นาที)', reward: 'ยอดเบิก (บาท)', amount: 'จำนวนเงิน',
    ex_type: 'รูปแบบ', exType: 'รูปแบบ', members: 'คนในกลุ่ม', participants: 'คนในกลุ่ม',
    refNo: 'เลขที่ใบลา', submittedAt: 'ยื่นเมื่อ', addedBy: 'ยื่นแทนโดย',
    proof_link: 'ลิงก์หลักฐาน', proofLink: 'ลิงก์หลักฐาน', proofLinks: 'ลิงก์หลักฐาน', proofDoc: 'ไฟล์หลักฐาน', proof_doc: 'ไฟล์หลักฐาน',
    hasDoc: 'แนบเอกสาร', docName: 'ไฟล์เอกสาร', doc_url: 'ไฟล์เอกสาร',
    approvedBy: 'อนุมัติโดย', rejectedBy: 'ไม่อนุมัติโดย', leadAction: 'ผลจากหัวหน้าทีม', pmAction: 'ผลจาก PM',
    leadNote: 'หมายเหตุจากหัวหน้าทีม', pmNote: 'หมายเหตุจาก PM', autoEscalated: 'ส่งต่อ PM อัตโนมัติ', isLeadLeave: 'ใบลาของหัวหน้าทีม',
    docRejectReason: 'เหตุผลที่ตีกลับเอกสาร', pendingDocReview: 'เอกสารรอตรวจ', reviewedAt: 'ตรวจเอกสารเมื่อ', reviewedBy: 'ตรวจเอกสารโดย', docStatus: 'สถานะเอกสาร',
    location_type: 'พื้นที่ทำงาน', user_id: 'รหัสพนักงาน', discordId: 'Discord', email: 'สมาชิก',
    suspended_at: 'ระงับบัญชีเมื่อ', archived_at: 'ระงับบัญชีเมื่อ', archived_by: 'ระงับบัญชีโดย', added_by: 'เพิ่มโดย', added_at: 'เพิ่มเมื่อ',
    avatar_url: 'รูปโปรไฟล์', avatar_frame: 'กรอบรูป', avatar_updated_at: 'เปลี่ยนรูปเมื่อ',
    accuHistory_json: 'ประวัติวันลาสะสม', decision: 'ผลการตรวจ', registration: 'ข้อมูลผู้สมัคร'
  };
  // ช่องเทคนิคที่ไม่มีความหมายกับคนอ่าน — ไม่แสดง
  var HIDDEN = { id: 1, _fbKey: 1, firebase_uid: 1, firebaseUid: 1, isHalf: 1, token: 1 };
  var STATUS = { approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', pending: 'รออนุมัติ', pending_lead: 'รอหัวหน้าทีมอนุมัติ', pending_pm: 'รอ PM อนุมัติ', submitted: 'รอตรวจ', open: 'ยังไม่ได้ใช้' };
  var VALUE = {
    leadAction: { approve: 'อนุมัติ', reject: 'ไม่อนุมัติ' }, pmAction: { approve: 'อนุมัติ', reject: 'ไม่อนุมัติ' },
    location_type: { bkk: 'กรุงเทพ', province: 'ต่างจังหวัด' },
    period: { full: 'เต็มวัน', morning: 'ครึ่งเช้า', afternoon: 'ครึ่งบ่าย', am: 'ครึ่งเช้า', pm: 'ครึ่งบ่าย' },
    ex_type: { solo: 'ออกคนเดียว', group_ex: 'ออกกับทีม', group: 'ออกกับทีม', meal: 'ทานอาหาร' },
    avatar_frame: { brand: 'กรอบสีแบรนด์', sparkle: 'กรอบประกาย', plain: 'กรอบเรียบ', none: 'ไม่มีกรอบ' },
    active: { 'true': 'ใช้งานอยู่', 'false': 'ระงับแล้ว' }
  };
  VALUE.exType = VALUE.ex_type;
  var CATS = [['all', 'ทั้งหมด'], ['leave', 'การลา'], ['exercise', 'ออกกำลังกาย'], ['member', 'สมาชิก'], ['login', 'เข้าสู่ระบบ'], ['other', 'อื่น ๆ']];

  var state = { month: '', months: [], entries: [], loading: false, error: '', cat: 'all', who: '', q: '', open: {} };
  var cache = {};

  function isEmpty(v) { return v === null || v === undefined || v === ''; }
  function nickOf(email) { var u = D.userByEmail(email); return u ? (D.nick(u) || u.name) : ''; }
  function typeName(t) { return (typeof LT !== 'undefined' && LT[t]) ? D.plainType(t) : ''; }
  function thDate(ds) { return D.thDate ? D.thDate(ds, { year: true }) : ds; }
  // ป้ายรายการ: "ชื่อ · ประเภทลา (ไทย) · วันที่" — ตัดอีเมลออกเมื่อมีชื่อแล้ว
  function niceLabel(label) {
    var parts = String(label || '').split(' · ').filter(Boolean), out = [], hasName = false;
    parts.forEach(function (part) {
      if (/^[^\s@]+@[^\s@]+$/.test(part)) { if (!hasName) out.push(nickOf(part) || part); return; }
      if (typeName(part)) { out.push(typeName(part)); return; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(part)) { out.push(thDate(part)); return; }
      out.push(part); hasName = true;
    });
    return out.join(' · ');
  }
  function fieldName(k) {
    if (FIELD[k]) return FIELD[k];
    var m = /^(.+)_used$/.exec(k);
    if (m) return 'ใช้วันลา' + (typeName(m[1]) ? ' · ' + typeName(m[1]) : ' (' + m[1] + ')');
    return k;
  }

  function cat(e) {
    if (e.target === 'leaves') return 'leave';
    if (e.target === 'exercises' || e.target === 'drive') return 'exercise';
    if (e.target === 'session') return 'login';
    if (['users', 'registrationInvites', 'departments', 'quotas'].indexOf(e.target) >= 0) return 'member';
    return 'other';
  }
  function ch(e, k) { return e.changes && e.changes[k]; }
  function verb(e) {
    var st = ch(e, 'status') && e.changes.status.to;
    if (e.action === 'updateLeave') {
      if (st === 'approved') return 'อนุมัติใบลา';
      if (st === 'rejected') return 'ไม่อนุมัติใบลา';
      if (st === 'pending_pm' && (e.changes.status.from === 'pending_lead' || (ch(e, 'leadAction') && e.changes.leadAction.to === 'approve'))) return 'อนุมัติใบลา · ส่งต่อให้ PM';
      if (ch(e, 'docRejectReason') && !isEmpty(e.changes.docRejectReason.to)) return 'ตีกลับเอกสารใบลา';
      if (ch(e, 'pendingDocReview') && e.changes.pendingDocReview.to === true) return 'แนบเอกสารใบลา';
      if (ch(e, 'pendingDocReview') && e.changes.pendingDocReview.to === false && ch(e, 'reviewedBy')) return 'ตรวจเอกสารใบลาแล้ว';
      if (ch(e, 'docName') || ch(e, 'hasDoc')) return 'แนบเอกสารใบลา';
    }
    if (e.action === 'updateEx') {
      if (st === 'approved') return 'อนุมัติการเบิกออกกำลังกาย';
      if (st === 'rejected') return 'ไม่อนุมัติการเบิกออกกำลังกาย';
      var keys = Object.keys(e.changes || {});
      if (keys.length && keys.every(function (k) { return k === 'members' || k === 'participants'; })) return 'เข้าร่วมกิจกรรมกลุ่ม';
      if (keys.length && keys.every(function (k) { return /^proof/.test(k); })) return 'แนบหลักฐานออกกำลังกาย';
    }
    if (e.action === 'addLeave' && e.after && e.after.email && e.after.email !== e.actor) return 'ยื่นใบลาแทน';
    if (e.action === 'updateUser') {
      if (ch(e, 'active')) return e.changes.active.to === false ? 'ระงับบัญชีสมาชิก' : 'เปิดใช้บัญชีสมาชิกอีกครั้ง';
      if (ch(e, 'role') && Object.keys(e.changes).length <= 2) return 'เปลี่ยนตำแหน่งสมาชิก';
      if (!e.changes && e.note === 'เปลี่ยนรหัสผ่าน') return 'เปลี่ยนรหัสผ่าน';
    }
    if (e.action === 'updateMyProfile' && e.changes && !ch(e, 'avatar_url') && ch(e, 'avatar_frame')) return 'เปลี่ยนกรอบรูปโปรไฟล์';
    if (e.action === 'reviewRegistration') return e.note === 'ไม่อนุมัติผู้สมัคร' ? 'ปฏิเสธผู้สมัครใหม่' : 'อนุมัติผู้สมัครใหม่';
    if (e.action === 'login') return e.label === 'เข้าระบบด้วย Google' ? 'เข้าสู่ระบบ (Google)' : 'เข้าสู่ระบบ (รหัสผ่าน)';
    return VERB[e.action] || e.action;
  }
  // ป้ายด้านขวา: บอกผลของรายการเป็นคำสั้น ๆ
  function badge(e) {
    var v = verb(e);
    if (/^ไม่อนุมัติ|^ปฏิเสธ|^ตีกลับ/.test(v)) return ['ไม่อนุมัติ', 'b-no'];
    if (/^อนุมัติ/.test(v)) return ['อนุมัติ', 'b-ok'];
    if (e.action === 'login') return ['เข้าระบบ', 'b-info'];
    if (e.action === 'setDentalReminderDate') return ['อัตโนมัติ', 'b-info'];
    if (/^drive:/.test(e.action)) return ['Google Drive', 'b-info'];
    if (e.kind === 'delete' || /^ระงับ/.test(v)) return [e.kind === 'delete' ? 'ลบ' : 'ระงับ', 'b-del'];
    if (e.kind === 'create' || /^ยื่น|^เพิ่ม|^สร้าง|^สมัคร|^แนบ/.test(v)) return ['ใหม่', 'b-new'];
    if (e.kind === 'event') return ['ระบบ', 'b-info'];
    return ['แก้ไข', 'b-edit'];
  }
  function fmtVal(k, v) {
    if (isEmpty(v)) return '<span class="df-au-empty">—</span>';
    if (k === 'status' && STATUS[v]) return esc(STATUS[v]);
    if (VALUE[k] && VALUE[k][String(v)] !== undefined) return esc(VALUE[k][String(v)]);
    if (k === 'type' && typeName(v)) return esc(typeName(v));
    if (k === 'role' && D.ROLE_LABEL && D.ROLE_LABEL[v]) return esc(D.ROLE_LABEL[v]);
    if (k === 'avatar_url') return 'รูปใหม่';
    if (/By$|_by$|^email$/.test(k) && /@/.test(String(v))) return esc(nickOf(v) || v);
    if (v === true) return 'ใช่'; if (v === false) return 'ไม่ใช่';
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(thDate(s));
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { var d = new Date(s); if (!isNaN(d)) return esc(d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })); }
    if (/^[\[{]/.test(s)) {
      try { var arr = JSON.parse(s); if (Array.isArray(arr)) return esc(arr.map(function (m) { return (m && (nickOf(m.email) || m.name)) || m; }).join(', ') || '—'); } catch (err) {}
    }
    return esc(s.length > 160 ? s.slice(0, 160) + '…' : s);
  }
  function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); }
  function dayOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function monthLabel(m) { var p = m.split('-'); return D.TH_MONTHS[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543); }
  function actorUser(e) { if (e.action === 'setDentalReminderDate') return { email: '', name: 'ระบบ' }; return D.userByEmail(e.actor) || { email: e.actor, name: e.actorName || e.actor }; }
  function actorName(e) { if (e.action === 'setDentalReminderDate') return 'ระบบ'; var u = D.userByEmail(e.actor); return (u && (D.nick(u) || u.name)) || e.actorName || e.actor || 'ระบบ'; }

  function detail(e) {
    var rows = '';
    if (e.changes) {
      Object.keys(e.changes).forEach(function (k) {
        var c = e.changes[k];
        if (HIDDEN[k] || (isEmpty(c.from) && isEmpty(c.to))) return; // ว่าง → ว่าง ไม่ใช่การเปลี่ยนแปลงจริง
        rows += '<tr><th>' + esc(fieldName(k)) + '</th><td class="df-au-from">' + fmtVal(k, c.from) + '</td><td class="df-au-arrow">→</td><td class="df-au-to">' + fmtVal(k, c.to) + '</td></tr>';
      });
      if (!rows) return '<p class="df-au-hint">' + (e.note ? esc(e.note) : 'ไม่มีข้อมูลที่เปลี่ยน') + '</p>';
      return '<table class="df-au-table"><thead><tr><th>ข้อมูล</th><th>เดิม</th><th></th><th>เปลี่ยนเป็น</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    var snap = e.before || e.after;
    if (snap) {
      Object.keys(snap).forEach(function (k) { if (HIDDEN[k] || isEmpty(snap[k])) return; rows += '<tr><th>' + esc(fieldName(k)) + '</th><td colspan="3">' + fmtVal(k, snap[k]) + '</td></tr>'; });
      return (e.kind === 'delete' ? '<p class="df-au-hint">ข้อมูลของรายการที่ถูกลบ (เก็บสำเนาไว้ในบันทึกนี้)</p>' : '<p class="df-au-hint">ข้อมูลที่บันทึก</p>') + '<table class="df-au-table"><tbody>' + rows + '</tbody></table>';
    }
    return '<p class="df-au-hint">ไม่มีรายละเอียดเพิ่มเติม</p>';
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.entries.filter(function (e) {
      if (state.cat !== 'all' && cat(e) !== state.cat) return false;
      if (state.who && e.actor !== state.who) return false;
      if (q && (actorName(e) + ' ' + e.actor + ' ' + verb(e) + ' ' + niceLabel(e.label) + ' ' + (e.note || '')).toLowerCase().indexOf(q) < 0) return false;
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
    state.entries.forEach(function (e) { if (e.actor) actors[e.actor] = nickOf(e.actor) || e.actorName || e.actor; });
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
      if (!list.length) body = '<div class="df-au-state">ยังไม่มีรายการในเดือนนี้</div>';
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
                (e.label && ['setDentalReminderDate', 'login', 'drive:report-config', 'drive:export-exercise', 'drive:finalize', 'createRegistrationInvite'].indexOf(e.action) < 0 ? ' <span class="df-au-label">' + esc(niceLabel(e.label)) + '</span>' : '') +
                (e.action === 'setDentalReminderDate' ? ' <span class="df-au-note">· เริ่มทำงานตอน ' + esc(nickOf(e.actor) || e.actor) + ' เปิดเว็บ</span>' : '') +
                (e.note && ['reviewRegistration', 'updateUser'].indexOf(e.action) < 0 ? ' <span class="df-au-note">· ' + (e.action === 'drive:export-exercise' ? 'ชีต ' : '') + esc(e.note) + '</span>' : '') + '</span>' +
              '<span class="df-au-kind ' + badge(e)[1] + '">' + esc(badge(e)[0]) + '</span>' +
              (hasDetail && e.kind !== 'event' ? '<svg class="df-au-caret" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>' : '') +
            '</button>' + (open && e.kind !== 'event' ? '<div class="df-au-detail">' + detail(e) + '</div>' : '') + '</li>';
        });
        body = html + '</ol>';
      }
    }
    var count = state.loading ? '' : filtered().length + ' รายการ';
    view.innerHTML = D.header({ eyebrow: 'ทีม · PM เท่านั้น', title: 'บันทึกกิจกรรม',
      actions: monthSel + '<button type="button" class="btn btn-ghost" onclick="__dfAudit.reload()">รีเฟรช</button>' }) +
      '<p class="df-au-sub">ดูได้ว่าใครทำอะไรในระบบ เมื่อไหร่ · กดที่รายการเพื่อดูว่าเปลี่ยนจากอะไรเป็นอะไร · เก็บย้อนหลัง 1 ปี และไม่มีใครแก้หรือลบได้</p>' +
      '<section class="df-card df-au-card"><div class="df-au-tools"><div class="df-au-chips" role="group" aria-label="ประเภท">' + chips + '</div>' +
      '<div class="df-au-filters"><input type="search" class="df-au-q" placeholder="ค้นหาชื่อคน หรือสิ่งที่ทำ" value="' + esc(state.q) + '" oninput="__dfAudit.q(this.value)">' + whoSel +
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

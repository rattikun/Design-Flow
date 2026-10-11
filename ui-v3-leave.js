/* ==========================================================================
   Design Flow v3 — LEAVE area (L1–L6)
   Pages: leave-new (create), leave-review, leave-pm, leave-history,
          leave-balance, team-hist, leave-detail (create)

   SAFETY: this file never writes data. Every write goes through the
   existing legacy action functions, called exactly like the legacy UI:
     submit/edit  -> legacy #modal-leave form state + goToLeaveStep2() + submitLeave()
     approve/rej  -> lAct(id, action) / pAct(id, action)
     cancel/del   -> cancelLeave(id) / pmDeleteLeave(id)
     documents    -> handleDoc (legacy #doc-file input) / attachDentalDoc(id)
     quotas       -> openQuotaModal / openTeamQuotaModal / confirmReset / confirmClearLeaves
   Reads only: getLeaves/getUsers/getQs/getVisibleEmails/getMyTeamMembers ...
   ========================================================================== */
(function () {
  'use strict';
  var D = window.DFV3;
  if (!D || typeof document === 'undefined') return;
  var esc = D.esc;

  /* ------------------------------------------------------------------ utils */
  var DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var DOW_S = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var MAIN_TYPES = ['vacation', 'personal', 'sick', 'dental', 'birthday', 'accumulated'];
  var OTHER_TYPES = ['funeral', 'maternity', 'ordain', 'training', 'sterilize', 'other'];
  var KUNIIZ = 'kuniiz.ka@gmail.com';
  var S = {
    form: null,          // 'new' | 'edit' while leave-new is in use
    suppress: false,
    showOther: false,
    detailId: null, detailFrom: 'leave-history', detailSeen: false,
    myTab: 'all', myYear: '',
    rev: { 'leave-review': 'wait', 'leave-pm': 'wait' },
    th: { tab: 'all', q: '', type: 'all', month: 'all', page: 1 },
    balAll: false
  };

  function $(id) { return document.getElementById(id); }
  function num(n) { return D.num(n); }
  function today() { return toLocalDateString(new Date()); }
  function isMgr() { return cu && (cu.role === 'lead' || cu.role === 'pm'); }
  function lv(id) { return getLeaves().find(function (r) { return sameRecordId(r.id, id); }) || null; }
  function jsArg(v) { return esc(JSON.stringify(v)); }
  function isPending(r) { return String(r.status || '').indexOf('pending') === 0; }
  function userOf(email) { return D.userByEmail(email); }
  function nickOf(r) { var u = userOf(r.email); return (u && D.nick(u)) || r.nickname || String(r.name || '').split(' ')[0] || r.email; }
  function avatarOf(email, name, size) { return D.avatar(userOf(email) || { email: email, name: name }, size); }
  function editingId() { try { return _editingLeaveId; } catch (e) { return null; } }
  function needsDocMissing(r) { return r.status === 'approved' && leaveNeedsDoc(r) && !r.docName; }

  function thFull(ds) { if (!ds) return '—'; var d = new Date(ds + 'T00:00:00'); return DOW[d.getDay()] + ' ' + D.thDate(ds, { year: true }); }
  function thShortDow(ds) { var d = new Date(ds + 'T00:00:00'); return DOW_S[d.getDay()] + ' ' + D.thDate(ds, { year: true }); }
  function rangeYear(a, b) {
    if (!a) return '—';
    if (!b || a === b) return D.thDate(a, { year: true });
    var ya = a.slice(0, 4), yb = b.slice(0, 4);
    if (ya !== yb) return D.thDate(a, { year: true }) + ' – ' + D.thDate(b, { year: true });
    return D.range(a, b) + ' ' + (Number(yb) + 543);
  }
  function dayLabel(r) {
    if (r.isHalf) return '½ ' + (r.period === 'morning' ? 'เช้า' : 'บ่าย');
    return num(effectiveLeaveDays(r)) + ' วัน';
  }
  function periodLabel(r) { return r.isHalf ? (r.period === 'morning' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย') : 'เต็มวัน'; }
  function balLabel(t) { return (t === 'vacation' ? 'พักร้อน' : t === 'dental' ? 'ทำฟัน' : D.plainType(t)) + 'คงเหลือ'; }
  function roleText(u) { return u ? (D.ROLE_LABEL[u.role] || u.role || '') : ''; }

  /* status chip (v3) — same states legacy shows */
  function statusChip(r, big) {
    var t, c;
    if (r.status === 'pending_lead') { t = 'รอหัวหน้า'; c = 'pending'; }
    else if (r.status === 'pending_pm') { t = r.pendingDocReview ? 'รอ PM ตรวจเอกสาร' : 'รอ PM'; c = 'pm'; }
    else if (r.status === 'rejected') { t = 'ไม่อนุมัติ'; c = 'no'; }
    else if (r.status === 'approved') {
      if (needsDocMissing(r)) { t = 'อนุมัติ · รอเอกสาร'; c = 'pending'; }
      else if (r.start > today()) { t = 'อนุมัติ · รอถึงวัน'; c = 'ok'; }
      else { t = 'อนุมัติแล้ว'; c = 'ok'; }
    } else { t = r.status || '—'; c = 'pm'; }
    return '<span class="df-chip ' + c + (big ? ' df-leave-chip-big' : '') + '">' + esc(t) + '</span>';
  }
  function refBtn(r, from) {
    return '<button type="button" class="df-leave-ref" onclick="DFLeave.open(' + jsArg(r.id) + ',\'' + from + '\')">' + esc(r.refNo || ('#' + r.id)) + ' <span aria-hidden="true">›</span></button>';
  }
  function docLink(r) {
    if (!r.hasDoc || !r.docName) return '';
    if (String(r.docName).indexOf('http') === 0) return '<button type="button" class="df-leave-doclink" onclick="viewDocPopup(' + jsArg(r.docName) + ')">' + ICON.file + 'เอกสาร</button>';
    return '<span class="df-leave-doclink is-static">' + ICON.file + esc(r.docName) + '</span>';
  }

  /* quota/balance for any member — same formula as renderMyBal() (all leaves of that person) */
  function quotaOf(email, type) {
    var def = LQ[type]; if (!def) return null;
    var qs = getQs(), cq = (qs[email] && qs[email][type] != null) ? qs[email][type] : null;
    return cq !== null ? cq : def.q;
  }
  function balOf(email, type) {
    var q = quotaOf(email, type);
    var mine = getLeaves().filter(function (r) { return r.email === email && r.type === type; });
    var appr = mine.filter(function (r) { return r.status === 'approved'; });
    var used = appr.reduce(function (s, r) { return s + effectiveLeaveDays(r); }, 0);
    var pending = mine.filter(isPending).length;
    if (q === null || q === undefined) return { type: type, quota: null, used: used, count: appr.length, pending: pending };
    var left = Math.max(0, q - used);
    return { type: type, quota: q, used: used, left: left, pending: pending, pct: q > 0 ? Math.round(left / q * 100) : 0 };
  }

  var ICON = {
    file: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>',
    check: '<svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>',
    search: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>',
    upload: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"></path></svg>',
    info: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg>',
    trash: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>',
    doc: '<svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path></svg>',
    plus: '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>'
  };

  /* =================================================================
     L1 — ยื่นใบลา (leave-new). Drives the legacy #modal-leave form.
     ================================================================= */
  function initNewForm() {
    // same reset the legacy "ยื่นใบลา" button performs
    S.form = 'new'; S.showOther = false; // set first: openLeaveModal() can trigger a re-render of this page
    S.suppress = true;
    try { openLeaveModal(); } finally { S.suppress = false; }
    closeModal('modal-leave');
  }
  function legacyOpt(t) { var sel = $('leave-type'); return sel && sel.querySelector('option[value="' + t + '"]'); }
  function targetEmail() {
    var fm = (!editingId() && $('for-member-select')) ? $('for-member-select').value : '';
    if (S.form === 'edit') { var r = lv(editingId()); if (r) return r.email; }
    return fm || cu.email;
  }

  function renderNew(view) {
    if (!S.form) initNewForm();
    var editing = S.form === 'edit' && editingId() != null;
    var type = $('leave-type').value;
    var start = $('leave-start').value, end = $('leave-end').value || start;
    var period = $('leave-period').value || 'full';
    var isHalf = period !== 'full';
    var tEmail = targetEmail();
    var fmVal = !editing && $('for-member-select') ? $('for-member-select').value : '';
    var forMember = !!fmVal;

    /* ---- 1. type cards (state comes from the legacy <select> options) */
    function card(t) {
      var opt = legacyOpt(t); if (!opt || !LQ[t]) return '';
      var hidden = opt.hidden, disabled = opt.disabled || hidden;
      var b = balOf(tEmail, t), sub, subCls = '';
      if (hidden) sub = t === 'accumulated' ? 'ยังไม่มีวันลาสะสม' : 'เฉพาะหัวหน้า/PM';
      else if (b.quota !== null) {
        if (b.left <= 0) { sub = 'ใช้ครบแล้ว'; }
        else { sub = 'เหลือ ' + num(b.left) + ' / ' + num(b.quota) + ' วัน'; if (b.pct < 35) subCls = ' warn'; }
      } else sub = LQ[t].n || 'แจ้ง/อนุมัติ';
      var on = type === t;
      return '<button type="button" role="radio" aria-checked="' + on + '"' + (disabled ? ' disabled aria-disabled="true"' : '') +
        ' class="df-leave-type' + (on ? ' on' : '') + (disabled ? ' off' : '') + '" onclick="DFLeave.pickType(\'' + t + '\')">' +
        D.tile(D.TYPE_ICON[t] || 'ic-acc', 36) + '<span class="df-leave-type-text"><span class="df-leave-type-name">' + esc(D.plainType(t)) + '</span>' +
        '<span class="df-leave-type-sub' + subCls + '">' + esc(sub) + '</span></span></button>';
    }
    var otherVisible = OTHER_TYPES.filter(function (t) { var o = legacyOpt(t); return o && !o.hidden; });
    if (OTHER_TYPES.indexOf(type) >= 0) S.showOther = true;
    var typeHtml = MAIN_TYPES.map(card).join('') + (S.showOther ? otherVisible.map(card).join('') : '');
    var otherBtn = otherVisible.length ? '<button type="button" class="df-leave-linkbtn" onclick="DFLeave.toggleOther()">' +
      (S.showOther ? '− ซ่อนประเภทอื่น' : '+ ประเภทอื่น (' + otherVisible.map(function (t) { return D.plainType(t); }).slice(0, 3).join(', ') + (otherVisible.length > 3 ? ' ...' : '') + ')') + '</button>' : '';

    /* ---- 2. calendar (same rules as renderLeaveCalendar) */
    var cm = _leaveCalendarMonth, y = cm.getFullYear(), m = cm.getMonth();
    var first = new Date(y, m, 1), gridStart = new Date(y, m, 1 - first.getDay());
    var hset = getHolidaySet(), hnames = {};
    D.holidays().forEach(function (h) { hnames[h.date] = h.name; });
    var t0 = today();
    var vis = isMgr() ? D.visibleSet() : new Set([cu.email]);
    var eid = editing ? editingId() : null;
    var marks = getLeaves().filter(function (r) {
      return r.status !== 'rejected' && !sameRecordId(r.id, eid) && (r.email === tEmail || r.email === cu.email || (vis === null || vis.has(r.email)));
    });
    var cells = [];
    var count = getMonthCalendarCellCount(y, m);
    for (var i = 0; i < count; i++) {
      var dt = new Date(gridStart); dt.setDate(gridStart.getDate() + i);
      var ds = toLocalDateString(dt);
      var other = dt.getMonth() !== m, we = dt.getDay() === 0 || dt.getDay() === 6, hol = hset.has(ds);
      var isStart = !!start && ds === start, isEnd = !isHalf && ds === end && end !== start;
      var inRange = !isHalf && start && end && ds > start && ds < end;
      var on = marks.filter(function (r) { return r.start <= ds && r.end >= ds; });
      var cls = ['df-leave-day'], tag = '';
      if (other) cls.push('is-other');
      if (we) cls.push('is-we');
      if (isStart || isEnd) cls.push('is-sel');
      else if (inRange) cls.push((we || hol) ? 'is-range is-skip' : 'is-range');
      else if (hol) cls.push('is-hol');
      else if (on.length && !other) cls.push('is-team');
      if (ds === t0) cls.push('is-today');
      if (hol) tag = 'หยุด';
      else if (on.length && !other) tag = on.map(function (r) { return r.email === tEmail ? (r.email === cu.email ? 'คุณ' : nickOf(r)) : nickOf(r); }).filter(function (v, k, a) { return a.indexOf(v) === k; }).slice(0, 2).join(', ') + (on.length > 2 ? '+' : '');
      else if (ds === t0) tag = 'วันนี้';
      var lbl = dt.getDate() + ' ' + D.TH_MONTHS[dt.getMonth()] + ' ' + (dt.getFullYear() + 543) + (we || hol ? ' (' + (hol ? (hnames[ds] || 'วันหยุดธนาคาร') : 'วันหยุดสุดสัปดาห์') + ' ไม่นับเป็นวันลา)' : '');
      var tip = [];
      if (hol) tip.push((hnames[ds] || 'วันหยุดธนาคาร') + ' — ไม่นับเป็นวันลา');
      on.forEach(function (r) { tip.push((r.email === cu.email ? 'คุณ' : nickOf(r)) + ' · ' + D.plainType(r.type)); });
      cells.push('<button type="button" class="' + cls.join(' ') + '" aria-label="' + esc(lbl) + '" aria-pressed="' + (isStart || isEnd) + '"' + (tip.length ? ' title="' + esc(tip.join(' · ')) + '"' : '') +
        ' onclick="DFLeave.pickDate(\'' + ds + '\')"><span>' + dt.getDate() + '</span><small>' + esc(tag) + '</small></button>');
    }
    var instr = ($('leave-range-instruction') || {}).textContent || '';

    /* ---- 3. reason + documents */
    var reason = $('leave-reason').value;
    var docG = $('doc-group'), needDoc = docG && docG.style.display !== 'none';
    var docHtml = '';
    if (needDoc) {
      var link = $('leave-link').value;
      docHtml = '<section class="df-card df-leave-sec" id="df-leave-docsec"><div class="df-leave-sec-head"><span class="df-leave-step">4</span><h2>แนบเอกสาร</h2>' +
        '<span class="df-leave-req">' + (type === 'dental' ? 'แนบภายหลังได้' : 'จำเป็น') + '</span></div>' +
        '<div class="df-leave-notice">' + ICON.info + '<span>' + esc(($('doc-reason') || {}).textContent || '').trim() + '</span></div>' +
        '<div class="df-leave-drop" role="button" tabindex="0" onclick="DFLeave.pickFile()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();DFLeave.pickFile();}">' + ICON.upload +
        '<strong>' + esc(($('doc-text') || {}).textContent || 'เลือกรูปภาพ/ไฟล์') + '</strong><span>รองรับ PNG, JPG, PDF ขนาดไม่เกิน 10MB · อัปโหลดอัตโนมัติ</span></div>' +
        '<label class="df-leave-label" for="df-leave-link">หรือวางลิงก์เอกสาร</label>' +
        '<input id="df-leave-link" class="df-leave-input" type="text" placeholder="https://..." value="' + esc(link) + '" oninput="DFLeave.mirror(\'leave-link\', this.value)"></section>';
    }

    /* ---- summary */
    var days = start ? (isHalf ? 0.5 : countWorkingDays(start, end)) : 0;
    var b = type ? balOf(tEmail, type) : null;
    var spanLabel = isHalf ? (period === 'morning' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย') : 'เต็มวัน';
    var dateText = !start ? 'ยังไม่ได้เลือกวัน' : (isHalf || start === end) ? thFull(start) : rangeYear(start, end);
    var afterTxt = '';
    if (b && b.quota !== null && start) {
      var after = b.left - days;
      afterTxt = ' · คงเหลือหลังลา <strong' + (after < 0 ? ' class="df-leave-neg"' : '') + '>' + num(after) + ' / ' + num(b.quota) + ' วัน</strong>';
    }
    var checks = [];
    if (type && start) {
      var t00 = new Date(); t00.setHours(0, 0, 0, 0);
      var da = Math.ceil((new Date(start) - t00) / 864e5);
      var needAdv = type !== 'sick' && !forMember && !isMgr() && !editing;
      if (editing) { /* legacy does not re-check advance notice when editing */ }
      else if (needAdv) checks.push(da >= 7 ? ['ok', 'ลาล่วงหน้า ' + da + ' วัน ผ่านเงื่อนไข 7 วัน'] : ['warn', 'ต้องลาล่วงหน้า 7 วัน — ขาดอีก ' + Math.max(0, 7 - da) + ' วัน (แจ้งหัวหน้าทีมโดยตรงหากเร่งด่วน)']);
      else if (type === 'sick' && !isMgr() && !forMember) checks.push(da >= -7 ? ['ok', 'ลาป่วยย้อนหลังได้ไม่เกิน 7 วัน'] : ['warn', 'ลาป่วยย้อนหลังได้ไม่เกิน 7 วัน — เกินกำหนด ' + Math.max(0, Math.abs(da) - 7) + ' วัน']);
      else checks.push(['ok', 'ไม่มีข้อกำหนดลาล่วงหน้า 7 วัน (หัวหน้า/PM)']);
      var conf = leaveConflict(tEmail, start, isHalf ? start : end, isHalf, period, eid);
      if (conf) checks.push(['warn', 'มีใบลาที่ทับซ้อนอยู่แล้ว (' + D.plainType(conf.type) + ' ' + D.range(conf.start, conf.end) + ')']);
      if (isMgr() && vis) {
        var e2 = isHalf ? start : end;
        var mates = getLeaves().filter(function (r) { return r.status !== 'rejected' && r.email !== tEmail && vis.has(r.email) && r.start <= e2 && r.end >= start; })
          .map(nickOf).filter(function (v, k, a) { return a.indexOf(v) === k; });
        checks.push(mates.length ? ['hol', 'ช่วงเดียวกันมี ' + mates.join(', ') + ' ลาด้วย'] : ['team', 'วันที่เลือกไม่มีเพื่อนในทีมลาซ้อน']);
      }
      if (needDoc) checks.push(['warn', type === 'dental' ? 'ลาทำฟันต้องแนบใบเสร็จ/ใบรับรองแพทย์ (แนบภายหลังได้)' : 'ต้องแนบใบรับรองแพทย์ก่อนส่ง']);
    }
    var route;
    if (editing) route = 'แก้ไขใบลาที่ยังรออนุมัติ · สถานะเดิมไม่เปลี่ยน';
    else if (cu.role === 'pm') route = forMember ? 'PM ยื่นให้สมาชิก · <strong>อนุมัติทันที</strong>' : 'ใบลาของ PM · <strong>อนุมัติอัตโนมัติ</strong>';
    else if (cu.role === 'lead') route = 'ส่งให้ <strong>PM</strong> พิจารณา';
    else {
      var tu = userOf(tEmail), dept = (tu && tu.dept) || cu.dept || '';
      route = deptHasLead(dept) ? 'ส่งให้ <strong>หัวหน้าทีม</strong> พิจารณา แล้วส่งต่อ PM' : 'ส่งให้ <strong>PM</strong> พิจารณา';
    }
    checks.push(['info', route]);

    var memberSel = '';
    if (isMgr() && !editing && $('for-member-select')) {
      var opts = Array.from($('for-member-select').options).map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (o.value === fmVal ? ' selected' : '') + '>' + esc(o.value ? o.textContent : 'ตัวเอง (' + D.nick(cu) + ')') + '</option>';
      }).join('');
      memberSel = '<label class="df-leave-label" for="df-leave-for">ยื่นลาให้</label><select id="df-leave-for" class="df-leave-input" onchange="DFLeave.pickMember(this.value)">' + opts + '</select>' +
        (forMember ? '<p class="df-muted">ไม่มีข้อกำหนดลาล่วงหน้า 7 วันเมื่อยื่นให้สมาชิก</p>' : '');
    }
    var eyebrow = '<a href="javascript:void(0)" onclick="showPage(\'leave-history\')">วันลาของฉัน</a> › ' + (editing ? 'แก้ไขใบลา' : 'ยื่นใบลา');
    var er = editing ? lv(editingId()) : null;

    view.innerHTML = '<div class="df-leave df-leave-new">' + D.header({ eyebrow: eyebrow, title: editing ? 'แก้ไขใบลา' + (er && er.refNo ? ' ' + esc(er.refNo) : '') : 'ยื่นใบลา' }) +
      '<div class="df-leave-cols">' +
      '<div class="df-leave-main">' +
      '<section class="df-card df-leave-sec"><div class="df-leave-sec-head"><span class="df-leave-step">1</span><h2>เลือกประเภทการลา</h2></div>' +
      '<div class="df-leave-types" role="radiogroup" aria-label="ประเภทการลา">' + typeHtml + '</div>' + otherBtn + '</section>' +
      '<section class="df-card df-leave-sec"><div class="df-leave-sec-head"><span class="df-leave-step">2</span><h2>เลือกวัน</h2><span class="df-leave-hint">ไม่นับเสาร์–อาทิตย์และวันหยุด</span></div>' +
      '<div class="df-leave-seg" role="radiogroup" aria-label="ช่วงเวลา">' + [['full', 'เต็มวัน'], ['morning', 'ครึ่งเช้า'], ['afternoon', 'ครึ่งบ่าย']].map(function (s) {
        return '<button type="button" role="radio" aria-checked="' + (period === s[0]) + '" class="' + (period === s[0] ? 'on' : '') + '" onclick="DFLeave.mode(\'' + s[0] + '\')">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="df-leave-calhead"><span class="df-leave-calmonth">' + D.TH_MONTHS[m] + ' ' + (y + 543) + '</span><div class="df-leave-nav">' +
      '<button type="button" aria-label="เดือนก่อนหน้า" onclick="DFLeave.month(-1)">‹</button><button type="button" aria-label="เดือนถัดไป" onclick="DFLeave.month(1)">›</button></div></div>' +
      '<div class="df-leave-cal"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span>' + cells.join('') + '</div>' +
      '<div class="df-leave-legend"><span><i class="sel"></i>วันที่เลือก</span><span><i class="team"></i>' + (isMgr() ? 'เพื่อนในทีมลา' : 'วันลาของคุณ') + '</span><span><i class="hol"></i>วันหยุด</span>' +
      '<span class="df-leave-legend-hint" aria-live="polite">' + esc(instr) + '</span></div></section>' +
      '<section class="df-card df-leave-sec"><div class="df-leave-sec-head"><span class="df-leave-step">3</span><h2>เหตุผล</h2><span class="df-leave-req">จำเป็น</span></div>' +
      '<label for="df-leave-reason" class="df-sr">เหตุผลการลา</label>' +
      '<textarea id="df-leave-reason" class="df-leave-input df-leave-textarea" rows="3" placeholder="เช่น ไปต่างจังหวัด, ธุระครอบครัว" oninput="DFLeave.mirror(\'leave-reason\', this.value)">' + esc(reason) + '</textarea>' +
      '<div class="df-leave-quick">' + ['ธุระส่วนตัว', 'ไปต่างจังหวัด', 'พาครอบครัวไปหาหมอ', 'พักผ่อน'].map(function (q) {
        return '<button type="button" onclick="DFLeave.quick(' + jsArg(q) + ')">' + q + '</button>';
      }).join('') + '</div></section>' + docHtml +
      '</div>' +
      '<aside class="df-card df-leave-aside" aria-label="สรุปใบลา"><h2>สรุปก่อนส่ง</h2>' + memberSel +
      '<div class="df-leave-sumbox"><span class="df-leave-sum-k">' + esc(type ? D.plainType(type) : 'ยังไม่ได้เลือกประเภท') + ' · ' + spanLabel + '</span>' +
      '<span class="df-leave-sum-v">' + esc(dateText) + '</span>' +
      '<span class="df-leave-sum-n">' + (start ? 'ใช้ <strong>' + num(days) + ' วัน</strong>' + afterTxt : 'เลือกวันจากปฏิทิน') + '</span></div>' +
      '<ul class="df-leave-checks">' + checks.map(function (c) { return '<li class="' + c[0] + '"><i aria-hidden="true"></i><span>' + (c[0] === 'info' ? c[1] : esc(c[1])) + '</span></li>'; }).join('') + '</ul>' +
      '<button type="button" class="df-leave-send" onclick="DFLeave.submit()">' + (editing ? 'บันทึกการแก้ไข' : 'ส่งใบลา') + '</button>' +
      '<button type="button" class="df-leave-cancel" onclick="DFLeave.back()">ยกเลิก</button>' +
      '<p class="df-muted df-leave-foot">ลาล่วงหน้า 7 วัน ยกเว้นกรณีลาป่วย — หากมีเหตุกะทันหัน กรุณาแจ้งหัวหน้าทีมโดยตรง</p>' +
      '</aside></div></div>';
  }

  function rerenderNew() { if (isActive('leave-new')) D.renderPage('leave-new'); }
  function isActive(id) { var p = $('page-' + id); return !!(p && p.classList.contains('active')); }

  /* =================================================================
     L2 — อนุมัติการลา (leave-review = lead, leave-pm = pm)
     ================================================================= */
  function approveLists(kind) {
    var ve = getVisibleEmails();
    var inVe = function (r) { return ve === null || ve.has(r.email); };
    var all = getLeaves();
    var wait = kind === 'lead'
      ? all.filter(function (r) { return r.status === 'pending_lead' && inVe(r); })             // renderLR()
      : all.filter(function (r) { return r.status === 'pending_pm' && (cu.email.toLowerCase() === KUNIIZ || String(r.email).toLowerCase() !== KUNIIZ); }); // renderLP()
    var byStartDesc = function (a, b) { return String(b.start).localeCompare(String(a.start)); };
    var second = kind === 'lead'
      ? all.filter(function (r) { return r.status === 'pending_pm' && inVe(r); })
      : all.filter(function (r) { return r.status === 'pending_lead' && inVe(r); });
    return {
      wait: wait,
      second: second.sort(byStartDesc),
      doc: all.filter(function (r) { return needsDocMissing(r) && inVe(r); }).sort(byStartDesc),
      done: all.filter(function (r) { return r.status === 'approved' && inVe(r); }).sort(byStartDesc)
    };
  }

  function overlapText(r) {
    var ve = getVisibleEmails();
    var mates = getLeaves().filter(function (x) {
      return x.status !== 'rejected' && x.email !== r.email && (ve === null || ve.has(x.email)) && x.start <= r.end && x.end >= r.start;
    }).map(nickOf).filter(function (v, k, a) { return a.indexOf(v) === k; });
    return mates.length ? ['hol', 'ช่วงเดียวกันมี ' + mates.join(', ') + ' ลาด้วย'] : ['team', 'ช่วงเดียวกันไม่มีเพื่อนในทีมลา'];
  }

  function reviewCard(r, kind, from) {
    var u = userOf(r.email), b = balOf(r.email, r.type);
    var balTxt = b.quota !== null ? num(b.left) + ' / ' + num(b.quota) + ' วัน' : (b.count ? b.count + ' ครั้ง' : '—');
    var ov = overlapText(r);
    var flow = kind === 'lead' ? 'อนุมัติแล้วจะส่งต่อให้ PM พิจารณาขั้นสุดท้าย' : (r.isLeadLeave ? 'ใบลาของหัวหน้าทีม · ส่งตรงถึง PM' : 'หัวหน้าทีมอนุมัติแล้ว');
    var notes = [];
    if (r.pendingDocReview) notes.push(['pm', 'ยื่นเอกสารเพิ่มเติม — ตรวจเอกสารที่แนบใหม่']);
    if (r.autoEscalated) notes.push(['pm', 'ส่งอัตโนมัติ — ลาเกิน 3 วัน']);
    if (r.addedBy) notes.push(['pm', 'เพิ่มโดย ' + r.addedBy]);
    if (kind === 'pm' && r.leadNote) notes.push(['team', 'หัวหน้า: ' + r.leadNote]);
    if (!r.hasDoc && leaveNeedsDoc(r)) notes.push(['warn', 'ยังไม่แนบเอกสาร' + (r.type === 'dental' ? 'ใบเสร็จ/ใบรับรองแพทย์' : 'ใบรับรองแพทย์')]);
    var noteId = (kind === 'lead' ? 'df-leave-ln-' : 'df-leave-pn-') + r.id;
    var doc = r.pendingDocReview;
    var fn = kind === 'lead' ? 'lead' : 'pm';
    return '<article class="df-card df-leave-rcard">' +
      '<div class="df-leave-rmain">' +
      '<div class="df-leave-rwho">' + avatarOf(r.email, r.name, 48) + '<div class="df-leave-rname"><b>' + esc(nickOf(r)) + (u ? ' · ' + esc(roleText(u)) + (u.dept ? ' ' + esc(u.dept) : '') : '') + '</b>' +
      '<span>ยื่นเมื่อ ' + esc(r.submittedAt ? D.thDate(String(r.submittedAt).slice(0, 10), { year: true }) : '—') + ' · ' + esc(r.refNo || '') + '</span></div>' + D.typeChip(r.type) + '</div>' +
      '<div class="df-leave-facts g3"><div><span>วันที่</span><b>' + esc(rangeYear(r.start, r.end)) + '</b></div><div><span>จำนวน</span><b>' + esc(r.isHalf ? periodLabel(r) : dayLabel(r)) + '</b></div>' +
      '<div><span>' + esc(balLabel(r.type)) + '</span><b>' + esc(balTxt) + '</b></div></div>' +
      '<div class="df-leave-reason"><span>เหตุผล:</span> ' + esc(r.reason || '—') + (docLink(r) ? ' ' + docLink(r) : '') + '</div>' +
      notes.map(function (n) { return '<div class="df-leave-flag ' + n[0] + '"><i aria-hidden="true"></i>' + esc(n[1]) + '</div>'; }).join('') +
      '<div class="df-leave-flag ' + ov[0] + '"><i aria-hidden="true"></i>' + esc(ov[1]) + ' · ' + esc(flow) + '</div>' +
      '</div>' +
      '<div class="df-leave-ractions">' +
      '<button type="button" class="df-leave-send" onclick="DFLeave.act(\'' + fn + '\',' + jsArg(r.id) + ',\'approve\')">' + (doc ? 'อนุมัติเอกสาร' : (kind === 'lead' ? 'อนุมัติ' : 'อนุมัติการลา')) + '</button>' +
      '<label class="df-sr" for="' + noteId + '">' + (kind === 'lead' ? 'หมายเหตุ (ไม่บังคับ)' : 'หมายเหตุ PM') + '</label>' +
      '<input type="text" class="df-leave-input df-leave-rnote" id="' + noteId + '" placeholder="' + (kind === 'lead' ? 'หมายเหตุ (ไม่บังคับ)' : 'หมายเหตุ PM') + '">' +
      '<button type="button" class="df-leave-danger" onclick="DFLeave.act(\'' + fn + '\',' + jsArg(r.id) + ',\'reject\')">' + (doc ? 'เอกสารไม่ผ่าน (ต้องใส่เหตุผล)' : 'ปฏิเสธ (ต้องใส่เหตุผล)') + '</button>' +
      '<button type="button" class="df-leave-more" onclick="DFLeave.open(' + jsArg(r.id) + ',\'' + from + '\')">ดูรายละเอียดและเอกสารแนบ ›</button>' +
      '</div></article>';
  }

  function listRows(rows, from, opts) {
    opts = opts || {};
    if (!rows.length) return '';
    var cap = opts.cap || 0, shown = cap ? rows.slice(0, cap) : rows;
    return '<div class="df-card df-leave-list">' + shown.map(function (r) {
      return '<div class="df-leave-lrow">' + '<span class="df-leave-who">' + avatarOf(r.email, r.name, 32) + '<b>' + esc(nickOf(r)) + '</b></span>' +
        '<span>' + D.typeChip(r.type) + '</span><span class="df-leave-date">' + esc(D.range(r.start, r.end)) + '</span><span>' + esc(dayLabel(r)) + '</span>' +
        '<span>' + statusChip(r) + '</span><span>' + refBtn(r, from) + '</span></div>';
    }).join('') + (cap && rows.length > cap ? '<div class="df-leave-lfoot">แสดง ' + cap + ' จาก ' + rows.length + ' รายการ · <a href="javascript:void(0)" onclick="showPage(\'team-hist\')">ดูทั้งหมดในประวัติการลาทีม</a></div>' : '') + '</div>';
  }

  function renderApprove(view, pageId) {
    var kind = pageId === 'leave-review' ? 'lead' : 'pm';
    var L = approveLists(kind);
    var tabsDef = kind === 'lead'
      ? [['wait', 'รอพิจารณา', L.wait], ['second', 'ส่งต่อ PM', L.second], ['doc', 'รอเอกสาร', L.doc], ['done', 'อนุมัติแล้ว', L.done]]
      : [['wait', 'รอพิจารณา', L.wait], ['second', 'รอหัวหน้า', L.second], ['doc', 'รอเอกสาร', L.doc], ['done', 'อนุมัติแล้ว', L.done]];
    var tab = S.rev[pageId];
    var cur = tabsDef.find(function (t) { return t[0] === tab; }) || tabsDef[0];
    var rules = kind === 'lead'
      ? ['ลาไม่เกิน 3 วัน → พิจารณาได้เลย', 'ลาป่วย/ลากิจ เกิน 3 วัน → ส่งต่อ PM', 'หัวหน้าอนุมัติแล้ว → PM อนุมัติขั้นสุดท้าย']
      : ['ใบลาที่หัวหน้าอนุมัติ และใบลาของหัวหน้า → PM อนุมัติขั้นสุดท้าย', 'แนบเอกสารใหม่ → ตรวจเอกสารอีกครั้ง'];
    var body;
    if (cur[0] === 'wait') {
      body = L.wait.length ? L.wait.map(function (r) { return reviewCard(r, kind, pageId); }).join('')
        : '<section class="df-card df-leave-empty"><span class="df-leave-empty-ic">' + ICON.check + '</span><h2>ไม่มีใบลารอพิจารณา</h2><p>เมื่อมีคนยื่นใบลา จะแจ้งเตือนคุณทันที และแสดงที่นี่</p></section>';
    } else {
      body = cur[2].length ? listRows(cur[2], pageId, { cap: cur[0] === 'done' ? 30 : 0 })
        : '<section class="df-card df-leave-empty"><span class="df-leave-empty-ic">' + ICON.check + '</span><h2>ไม่มีรายการ</h2><p>' + esc(cur[1]) + ' · ยังไม่มีใบลาในสถานะนี้</p></section>';
    }
    view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: kind === 'lead' ? 'สำหรับหัวหน้าทีม' : 'สำหรับ PM', title: 'อนุมัติการลา' }) +
      '<div class="df-leave-rules"><b>กติกาการอนุมัติ</b>' + rules.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
      tabs(tabsDef.map(function (t) { return [t[0], t[1], t[2].length]; }), cur[0], 'DFLeave.revTab(\'' + pageId + '\',') +
      body + '</div>';
  }

  function tabs(defs, active, call) {
    return '<div class="df-leave-tabs" role="tablist">' + defs.map(function (t) {
      var on = t[0] === active;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" onclick="' + call + '\'' + t[0] + '\')">' + esc(t[1]) +
        (t[2] !== undefined && t[2] !== null ? ' <span>' + t[2] + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /* =================================================================
     L3 — วันลาของฉัน (leave-history)
     ================================================================= */
  function renderMy(view) {
    var t0 = today();
    var main = ['vacation', 'personal', 'sick', 'dental'].map(function (t) { return balOf(cu.email, t); }).filter(function (b) { return b.quota !== null; });
    var cards = main.map(function (b) {
      var low = b.pct < 35, tag = '', tcls = '';
      if (b.left === 0) { tag = 'หมดแล้ว'; tcls = 'warn'; }
      else if (low) { tag = 'ใกล้หมด'; tcls = 'warn'; }
      else if (b.pending) { tag = 'รอ ' + b.pending; tcls = 'info'; }
      else if (LQ[b.type].n) { tag = LQ[b.type].n === 'ส่งบิล' ? 'ต้องแนบบิล' : LQ[b.type].n; }
      return '<div class="df-leave-bal' + (low ? ' low' : '') + '"><div class="df-leave-bal-top"><span>' + D.tile(D.TYPE_ICON[b.type], 36) + esc(D.plainType(b.type)) + '</span>' +
        (tag ? '<em class="' + tcls + '">' + esc(tag) + '</em>' : '') + '</div>' +
        '<div class="df-leave-bal-num"><b>' + num(b.left) + '</b> <span>/ ' + num(b.quota) + ' วัน</span></div>' +
        '<div class="df-leave-bar"><i style="width:' + b.pct + '%"></i></div><span class="df-leave-bal-foot">ใช้ไป ' + num(b.used) + ' วัน' + (b.pending && tag !== 'รอ ' + b.pending ? ' · รออนุมัติ ' + b.pending : '') + '</span></div>';
    }).join('');

    var mine = getLeaves().filter(function (r) { return r.email === cu.email; });
    var years = mine.map(function (r) { return String(r.start || '').slice(0, 4); }).filter(Boolean).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort().reverse();
    var cy = String(new Date().getFullYear());
    if (years.indexOf(cy) < 0) years.unshift(cy);
    if (!S.myYear || years.indexOf(S.myYear) < 0) S.myYear = cy;
    var data = mine.filter(function (r) { return S.myYear === 'all' || String(r.start || '').indexOf(S.myYear) === 0; });
    var hasDoc = mine.some(needsDocMissing);
    var defs = [['all', 'ทั้งหมด'], ['pending', 'รออนุมัติ'], ['next', 'กำลังจะถึง'], ['done', 'ผ่านมาแล้ว']];
    if (hasDoc) defs.push(['need_doc', 'รอเอกสาร']);
    if (!defs.some(function (d) { return d[0] === S.myTab; })) S.myTab = 'all';
    data = data.filter(function (r) {
      if (S.myTab === 'pending') return isPending(r);
      if (S.myTab === 'next') return r.end >= t0 && r.status !== 'rejected';
      if (S.myTab === 'done') return r.end < t0;
      if (S.myTab === 'need_doc') return needsDocMissing(r);
      return true;
    }).sort(function (a, b) { return String(b.start).localeCompare(String(a.start)); });
    var rows = data.map(function (r) {
      var acts = '';
      if (isPending(r)) acts += '<button type="button" class="df-leave-mini" onclick="editLeave(' + jsArg(r.id) + ')">แก้ไข</button><button type="button" class="df-leave-mini danger" onclick="cancelLeave(' + jsArg(r.id) + ')">ยกเลิก</button>';
      if (needsDocMissing(r)) acts += '<button type="button" class="df-leave-mini ok" onclick="attachDentalDoc(' + jsArg(r.id) + ')">แนบเอกสาร</button>';
      var extra = '';
      if (r.status === 'rejected') extra = '<small class="df-leave-why">' + esc((r.rejectedBy ? 'โดย ' + r.rejectedBy + ': ' : '') + (r.rejectReason || 'ไม่ได้ระบุเหตุผล')) + '</small>';
      else if (!r.hasDoc && r.docRejectReason) extra = '<small class="df-leave-why">เอกสารไม่ผ่าน: ' + esc(r.docRejectReason) + '</small>';
      return '<div class="df-leave-hrow"><span>' + D.typeChip(r.type) + '</span><span class="df-leave-date">' + esc(D.range(r.start, r.end)) + '</span><span>' + esc(dayLabel(r)) + '</span>' +
        '<span class="df-leave-st">' + statusChip(r) + extra + '</span><span class="df-leave-refcell">' + refBtn(r, 'leave-history') + docLink(r) + (acts ? '<span class="df-leave-acts">' + acts + '</span>' : '') + '</span></div>';
    }).join('') || '<div class="df-leave-none">ไม่มีรายการ</div>';

    var hiddenForMember = ['training', 'sterilize', 'ordain', 'other', 'maternity', 'funeral'];
    var others = Object.keys(LQ).filter(function (t) { return (isMgr() || hiddenForMember.indexOf(t) < 0) && ['vacation', 'personal', 'sick', 'dental'].indexOf(t) < 0; }).map(function (t) {
      var b = balOf(cu.email, t), txt;
      if (b.quota !== null) txt = b.left <= 0 ? 'ใช้แล้ว ' + num(b.used) + '/' + num(b.quota) : num(b.left) + ' วัน';
      else txt = b.count ? b.count + ' ครั้ง' : '—';
      return '<div class="df-leave-orow"><span>' + esc(D.plainType(t)) + (LQ[t].n ? ' <small>' + esc(LQ[t].n) + '</small>' : '') + (b.pending ? ' <em class="df-chip pending">รอ ' + b.pending + '</em>' : '') + '</span><b>' + esc(txt) + '</b></div>';
    }).join('');

    view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: 'ปี ' + (Number(cy) + 543), title: 'วันลาของฉัน', actions: '<button type="button" class="btn btn-primary" onclick="openLeaveModal()">+ ยื่นใบลา</button>' }) +
      '<section class="df-leave-bals" aria-label="โควต้าหลัก">' + cards + '</section>' +
      '<div class="df-leave-cols wide">' +
      '<section class="df-card df-leave-hist"><div class="df-leave-hist-head"><h2>ประวัติการลา</h2><div class="df-leave-hist-tools">' +
      '<div class="df-leave-ftabs" role="tablist">' + defs.map(function (d) { var on = d[0] === S.myTab; return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" onclick="DFLeave.myTab(\'' + d[0] + '\')">' + d[1] + '</button>'; }).join('') + '</div>' +
      '<label class="df-sr" for="df-leave-myyear">ปี</label><select id="df-leave-myyear" class="df-leave-select sm" onchange="DFLeave.myYear(this.value)">' +
      years.map(function (yv) { return '<option value="' + yv + '"' + (yv === S.myYear ? ' selected' : '') + '>' + (Number(yv) + 543) + '</option>'; }).join('') + '<option value="all"' + (S.myYear === 'all' ? ' selected' : '') + '>ทุกปี</option></select></div></div>' +
      '<div class="df-leave-hrow head"><span>ประเภท</span><span>วันที่</span><span>จำนวน</span><span>สถานะ</span><span>เลขที่</span></div>' + rows + '</section>' +
      '<section class="df-card df-leave-others"><h2>ประเภทอื่น</h2>' + others + '</section>' +
      '</div></div>';
  }

  /* =================================================================
     L4 — ปฏิทินวันลาของทีม (leave-balance)
     ================================================================= */
  function balOverviewData(members, selYear) {
    // copy of renderBalOverview() computation (read only)
    var isPM = cu.role === 'pm', mgr = isPM || cu.role === 'lead';
    var ls = getLeaves().filter(function (r) { return r.start && r.start.indexOf(selYear) === 0; }), qs = getQs();
    var fixedTypes = Object.keys(LQ).filter(function (t) { return LQ[t].q !== null; });
    var nullTypes = Object.keys(LQ).filter(function (t) { return LQ[t].q === null; });
    var allTypes = mgr ? fixedTypes.concat(nullTypes) : fixedTypes;
    var md = members.map(function (u) {
      var cols = {};
      allTypes.forEach(function (type) {
        var def = LQ[type], cq = (qs[u.email] && qs[u.email][type] != null) ? qs[u.email][type] : null;
        var appr = ls.filter(function (r) { return r.email === u.email && r.type === type && r.status === 'approved'; });
        var used = appr.reduce(function (s, r) { return s + effectiveLeaveDays(r); }, 0);
        if (def.q === null && cq === null) cols[type] = { display: appr.length || 0, isCount: true };
        else { var effQ = cq !== null ? cq : def.q; cols[type] = { rem: Math.max(0, effQ - used), effQ: effQ, used: used }; }
      });
      return { u: u, cols: cols };
    });
    md.sort(function (a, b) {
      var va, vb, c = _balSort.col;
      if (c === 'name') { va = uName(a.u.email, a.u.name).toLowerCase(); vb = uName(b.u.email, b.u.name).toLowerCase(); }
      else { var ca = a.cols[c] || {}, cb = b.cols[c] || {}; va = ca.rem != null ? ca.rem : (ca.display != null ? ca.display : 0); vb = cb.rem != null ? cb.rem : (cb.display != null ? cb.display : 0); }
      return _balSort.dir === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    });
    return { rows: md, allTypes: allTypes };
  }

  function renderTeam(view) {
    var isPM = cu.role === 'pm';
    var members = getMyTeamMembers();
    var actions = isPM ? '<button type="button" class="btn btn-ghost" onclick="openTeamQuotaModal()">ปรับโควต้าทั้งทีม</button>' +
      '<button type="button" class="btn btn-ghost" onclick="confirmReset()">รีเซ็ตประจำปี</button>' +
      '<button type="button" class="btn btn-ghost df-danger" onclick="confirmClearLeaves()">ล้างข้อมูลการลาทั้งหมด</button>' : '';
    var calMembers = [cu].concat(members).filter(function (mm, k, a) { return a.findIndex(function (x) { return x.email === mm.email; }) === k; });
    var eyebrow = (isPM ? 'ทุกทีม' : 'ทีม ' + esc(cu.dept || '')) + ' · ' + calMembers.length + ' คน';
    if (!members.length) {
      view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: eyebrow, title: 'ปฏิทินวันลาของทีม', actions: actions }) +
        '<section class="df-card df-leave-empty"><span class="df-leave-empty-ic">' + ICON.check + '</span><h2>ยังไม่มีสมาชิกในทีม</h2><p>เพิ่มสมาชิกได้ที่หน้า สมาชิกทีม</p></section></div>';
      return;
    }
    /* calendar — same data as renderTeamCalendar() */
    var cm = _teamCalMonth, y = cm.getFullYear(), m = cm.getMonth();
    var byEmail = new Map(calMembers.map(function (x) { return [x.email, x]; }));
    var hol = new Map(getCachedDashboardHolidays().map(function (h) { return [h.date, h]; }));
    var tl = getLeaves().filter(function (r) { return byEmail.has(r.email) && r.status !== 'rejected'; });
    var gridStart = new Date(y, m, 1 - new Date(y, m, 1).getDay()), t0 = today();
    var statusName = { pending_lead: 'รอหัวหน้าอนุมัติ', pending_pm: 'รอ PM อนุมัติ', approved: 'อนุมัติแล้ว' };
    var cells = [];
    for (var i = 0, n = getMonthCalendarCellCount(y, m); i < n; i++) {
      var dt = new Date(gridStart); dt.setDate(gridStart.getDate() + i);
      var ds = toLocalDateString(dt), h = hol.get(ds), we = dt.getDay() === 0 || dt.getDay() === 6;
      var dl = tl.filter(function (r) { return r.start <= ds && r.end >= ds; }).sort(function (a, b) { return nickOf(a).localeCompare(nickOf(b), 'th'); });
      var cls = ['df-leave-tday'];
      if (dt.getMonth() !== m) cls.push('is-other'); else if (we) cls.push('is-we');
      if (ds === t0) cls.push('is-today');
      var items = dl.slice(0, 3).map(function (r) {
        var u = byEmail.get(r.email);
        var who = r.email === cu.email ? 'คุณ' : nickOf(r);
        return '<button type="button" class="df-leave-tchip' + (isPending(r) ? ' pending' : '') + '" title="' + esc(uName(r.email, (u && u.name) || r.name) + ' — ' + D.plainType(r.type) + ' (' + (statusName[r.status] || r.status) + ')') + '" onclick="DFLeave.open(' + jsArg(r.id) + ',\'leave-balance\')">' +
          avatarOf(r.email, r.name, 18) + '<span>' + esc(who) + '</span></button>';
      }).join('') + (dl.length > 3 ? '<span class="df-leave-tmore">+' + (dl.length - 3) + ' คน</span>' : '');
      cells.push('<div class="' + cls.join(' ') + '"><b>' + dt.getDate() + '</b>' + (h ? '<span class="df-leave-thol" title="' + esc(h.name || 'วันหยุดธนาคาร') + '">' + esc(h.name || 'วันหยุดธนาคาร') + '</span>' : '') + items + '</div>');
    }
    /* balance heat table — renderBalOverview() data */
    var yrSel = $('bal-year-sel');
    var years = yrSel ? Array.from(yrSel.options).map(function (o) { return o.value; }) : [String(y)];
    var selYear = (yrSel && yrSel.value) || String(new Date().getFullYear());
    var data = balOverviewData(members, selYear);
    var mainCols = ['vacation', 'personal', 'sick', 'dental', 'birthday', 'accumulated'].filter(function (t) { return data.allTypes.indexOf(t) >= 0; });
    var cols = S.balAll ? data.allTypes : mainCols;
    var arrow = function (c) { return _balSort.col === c ? (_balSort.dir === 'asc' ? '↑' : '↓') : '↕'; };
    var thead = '<tr><th scope="col" class="l"><button type="button" onclick="_balSortBy(\'name\')">สมาชิก <span>' + arrow('name') + '</span></button></th>' + cols.map(function (t) {
      return '<th scope="col"><button type="button" onclick="_balSortBy(\'' + t + '\')">' + D.tile(D.TYPE_ICON[t] || 'ic-acc', 24) + esc(D.plainType(t).replace(/^ลาพักร้อน$/, 'พักร้อน')) + ' <span>' + arrow(t) + '</span></button></th>';
    }).join('') + (isPM ? '<th scope="col" class="r">โควต้า</th>' : '') + '</tr>';
    var tbody = data.rows.map(function (row) {
      var u = row.u;
      return '<tr><th scope="row" class="l"><span class="df-leave-who">' + D.avatar(u, 34) + '<span><b>' + esc(D.nick(u) || u.name) + '</b><small>' + esc(roleText(u)) + (isPM && u.dept ? ' · ' + esc(u.dept) : '') + '</small></span></span></th>' +
        cols.map(function (t) {
          var d = row.cols[t];
          if (!d) return '<td class="none">—</td>';
          if (d.isCount) return '<td class="' + (d.display ? '' : 'none') + '">' + (d.display ? d.display + ' ครั้ง' : '—') + '</td>';
          if (!d.effQ) return '<td class="none">—</td>';
          var low = d.rem === 0 || d.rem / d.effQ <= 0.34;
          return '<td class="' + (low ? 'low' : '') + '">' + num(d.rem) + ' / ' + num(d.effQ) + '</td>';
        }).join('') +
        (isPM ? '<td class="r"><button type="button" class="df-leave-mini" onclick="openQuotaModal(' + jsArg(u.email) + ')">แก้ไข</button></td>' : '') + '</tr>';
    }).join('');
    /* PM: accumulated-day history (renderAccuHistoryPanel data) */
    var accu = '';
    if (isPM) {
      var qs = getQs(), arows = [];
      members.forEach(function (u) { ((qs[u.email] && qs[u.email].accuHistory) || []).forEach(function (h) { arows.push({ u: u, h: h }); }); });
      arows.sort(function (a, b) { return String(b.h.date || '').localeCompare(String(a.h.date || '')); });
      if (arows.length) accu = '<section class="df-card"><div class="df-card-head"><h2>ประวัติการเพิ่มวันลาสะสม</h2><span class="df-muted">แก้ไขได้ในหน้าต่าง "แก้ไข" ของสมาชิก</span></div><div class="df-leave-tablewrap"><table class="df-leave-table"><thead><tr><th>รหัส</th><th>สมาชิก</th><th>วันที่</th><th>ชิ้นงาน / เหตุผล</th><th>วัน</th><th>เพิ่มโดย</th><th>เพิ่มเมื่อ</th></tr></thead><tbody>' +
        arows.map(function (x) {
          return '<tr><td>' + esc(x.h.refNo || '—') + '</td><td><b>' + esc(D.nick(x.u) || x.u.name) + '</b> <small class="df-muted">' + esc(x.u.dept || '') + '</small></td><td>' + esc(x.h.date ? D.thDate(x.h.date, { year: true }) : '—') + '</td><td>' + esc(x.h.scope || '—') + '</td><td>' + esc(x.h.days) + ' วัน</td><td>' + esc(x.h.addedBy || '—') + '</td><td>' + esc(x.h.addedAt ? D.thDate(String(x.h.addedAt).slice(0, 10), { year: true }) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }

    view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: eyebrow, title: 'ปฏิทินวันลาของทีม', actions: actions }) +
      '<section class="df-card df-leave-tcal"><div class="df-leave-tcal-head"><div class="df-leave-nav">' +
      '<button type="button" aria-label="เดือนก่อนหน้า" onclick="changeTeamCalMonth(-1)">‹</button><h2>' + D.TH_MONTHS[m] + ' ' + (y + 543) + '</h2>' +
      '<button type="button" aria-label="เดือนถัดไป" onclick="changeTeamCalMonth(1)">›</button><button type="button" class="df-leave-todaybtn" onclick="DFLeave.teamToday()">วันนี้</button></div>' +
      '<div class="df-leave-legend"><span><i class="team"></i>อนุมัติแล้ว</span><span><i class="pend"></i>รออนุมัติ</span><span><i class="hol"></i>วันหยุดธนาคาร</span></div></div>' +
      '<div class="df-leave-tgrid"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span>' + cells.join('') + '</div></section>' +
      '<section class="df-card df-leave-heat"><div class="df-leave-heat-head"><h2>วันลาคงเหลือของทีม</h2><span class="df-muted">คงเหลือ / โควต้า · สีส้ม = เหลือน้อย · คลิกหัวคอลัมน์เพื่อเรียง</span>' +
      '<span class="df-leave-heat-tools"><label class="df-sr" for="df-leave-balyear">ปี</label><select id="df-leave-balyear" class="df-leave-select sm" onchange="DFLeave.balYear(this.value)">' +
      years.map(function (yv) { return '<option value="' + esc(yv) + '"' + (yv === selYear ? ' selected' : '') + '>ปี ' + (Number(yv) + 543) + '</option>'; }).join('') + '</select>' +
      (data.allTypes.length > mainCols.length ? '<button type="button" class="df-leave-mini" onclick="DFLeave.balAll()">' + (S.balAll ? 'แสดงเฉพาะประเภทหลัก' : 'แสดงทุกประเภท') + '</button>' : '') + '</span></div>' +
      '<div class="df-leave-tablewrap"><table class="df-leave-heattable"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div></section>' + accu + '</div>';
  }

  /* =================================================================
     L5 — ประวัติการลาทีม (team-hist)
     ================================================================= */
  function teamHistBase() {
    // same scope as renderTeamHist(), minus the status tab and search
    var users = getUsers(), isLead = cu.role === 'lead', isPM = cu.role === 'pm';
    var yrSel = $('team-hist-year');
    var selYear = (yrSel && yrSel.value) || String(new Date().getFullYear());
    var myTeam = isLead ? new Set([cu.email].concat(getMyTeamMembers().map(function (u) { return u.email; }))) : null;
    var active = new Set(users.filter(function (u) { return u.active !== false; }).map(function (u) { return u.email; }));
    var data = getLeaves().filter(function (r) { return r.start && r.start.indexOf(selYear) === 0 && active.has(r.email); });
    if (cu.email.toLowerCase() !== KUNIIZ) data = data.filter(function (r) { return String(r.email).toLowerCase() !== KUNIIZ; });
    if (isLead) data = data.filter(function (r) { return myTeam.has(r.email); });
    else if (isPM && _teamHistDept !== 'all') {
      var de = new Set(users.filter(function (u) { return u.active !== false && u.dept === _teamHistDept; }).map(function (u) { return u.email; }));
      data = data.filter(function (r) { return de.has(r.email); });
    }
    return { data: data, selYear: selYear, users: users };
  }
  function thMatches(r, f, uMap) {
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.month !== 'all' && !(String(r.start).slice(5, 7) <= f.month && String(r.end).slice(5, 7) >= f.month)) return false;
    var q = f.q.trim().toLowerCase();
    if (q) {
      var u = uMap.get(r.email), dept = ((u && u.dept) || r.dept || '').toLowerCase(), typeTh = String(LT[r.type] || r.type || '').toLowerCase();
      var nick = (u && D.nick(u) || '').toLowerCase();
      if (!((r.refNo || '').toLowerCase().indexOf(q) >= 0 || (r.name || '').toLowerCase().indexOf(q) >= 0 || nick.indexOf(q) >= 0 || (r.email || '').toLowerCase().indexOf(q) >= 0 ||
        dept.indexOf(q) >= 0 || typeTh.indexOf(q) >= 0 || (r.reason || '').toLowerCase().indexOf(q) >= 0)) return false;
    }
    return true;
  }
  function thStatus(r, tab) {
    if (tab === 'pending') return isPending(r);
    if (tab === 'need_doc') return needsDocMissing(r);
    if (tab === 'approved') return r.status === 'approved';
    if (tab === 'rejected') return r.status === 'rejected';
    return true;
  }
  var TH_PER = 12;
  function thFiltered() {
    var base = teamHistBase(), uMap = new Map(base.users.map(function (u) { return [u.email, u]; }));
    var f = S.th;
    var pre = base.data.filter(function (r) { return thMatches(r, f, uMap); });
    var rows = pre.filter(function (r) { return thStatus(r, f.tab); });
    var c = _teamHistSort.col, d = _teamHistSort.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (c === 'start') { va = a.start || ''; vb = b.start || ''; }
      else if (c === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); }
      else if (c === 'dept') { va = (a.dept || '').toLowerCase(); vb = (b.dept || '').toLowerCase(); }
      else if (c === 'type') { va = a.type || ''; vb = b.type || ''; }
      else if (c === 'days') { va = effectiveLeaveDays(a); vb = effectiveLeaveDays(b); }
      else if (c === 'refNo') { va = a.refNo || ''; vb = b.refNo || ''; }
      else { va = ''; vb = ''; }
      return d === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    });
    return { base: base, pre: pre, rows: rows, uMap: uMap };
  }
  function thResults(F) {
    var isPM = cu.role === 'pm';
    var pages = Math.max(1, Math.ceil(F.rows.length / TH_PER));
    if (S.th.page > pages) S.th.page = pages;
    var from = (S.th.page - 1) * TH_PER, shown = F.rows.slice(from, from + TH_PER);
    var arrow = function (c) { return _teamHistSort.col === c ? (_teamHistSort.dir === 'asc' ? ' ↑' : ' ↓') : ''; };
    var th = function (label, col) { return '<th scope="col">' + (col ? '<button type="button" onclick="_teamHistSortBy(\'' + col + '\')">' + label + '<span>' + (arrow(col) || ' ↕') + '</span></button>' : label) + '</th>'; };
    var body = shown.map(function (r) {
      var u = F.uMap.get(r.email);
      return '<tr><td><span class="df-leave-who">' + avatarOf(r.email, r.name, 32) + '<span><b>' + esc(nickOf(r)) + '</b>' + (isPM ? '<small>' + esc((u && u.dept) || r.dept || '') + '</small>' : '') + '</span></span></td>' +
        '<td>' + D.typeChip(r.type) + '</td><td class="nw">' + esc(D.range(r.start, r.end)) + '</td><td class="nw">' + esc(dayLabel(r)) + '</td>' +
        '<td class="muted">' + esc(r.reason || '—') + '</td><td>' + statusChip(r) + '</td>' +
        '<td class="nw">' + refBtn(r, 'team-hist') + docLink(r) + '</td>' +
        (isPM ? '<td class="r"><button type="button" class="df-leave-icon danger" aria-label="ลบใบลา ' + esc(r.refNo || '') + '" title="ลบใบลา (PM)" onclick="pmDeleteLeave(' + jsArg(r.id) + ')">' + ICON.trash + '</button></td>' : '') + '</tr>';
    }).join('') || '<tr><td colspan="' + (isPM ? 8 : 7) + '" class="df-leave-none">ไม่มีรายการ</td></tr>';
    return '<table class="df-leave-table df-leave-thtable"><thead><tr>' + th('สมาชิก', 'name') + th('ประเภท', 'type') + th('วันที่', 'start') + th('จำนวน', 'days') + th('เหตุผล') + th('สถานะ') + th('เลขที่', 'refNo') + (isPM ? '<th scope="col"><span class="df-sr">ลบ</span></th>' : '') + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="df-leave-pager"><span>' + (F.rows.length ? 'แสดง ' + (from + 1) + '–' + Math.min(from + TH_PER, F.rows.length) + ' จาก ' + F.rows.length : 'แสดง 0 จาก 0') + '</span><div>' +
      '<button type="button" aria-label="หน้าก่อนหน้า"' + (S.th.page <= 1 ? ' disabled' : '') + ' onclick="DFLeave.thPage(-1)">‹</button><button type="button" aria-label="หน้าถัดไป"' + (S.th.page >= pages ? ' disabled' : '') + ' onclick="DFLeave.thPage(1)">›</button></div></div>';
  }
  function thTabsHtml(F) {
    var defs = [['all', 'ทั้งหมด'], ['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ปฏิเสธ'], ['need_doc', 'รอเอกสาร']].map(function (d) {
      return [d[0], d[1], F.pre.filter(function (r) { return thStatus(r, d[0]); }).length];
    });
    return tabs(defs, S.th.tab, 'DFLeave.thTab(');
  }
  function renderTeamHistV3(view) {
    var F = thFiltered(), isPM = cu.role === 'pm';
    var yrSel = $('team-hist-year');
    var years = yrSel ? Array.from(yrSel.options).map(function (o) { return o.value; }) : [F.base.selYear];
    var typeOpts = Object.keys(LT).map(function (t) { return '<option value="' + t + '"' + (S.th.type === t ? ' selected' : '') + '>' + esc(D.plainType(t)) + '</option>'; }).join('');
    var monthOpts = D.TH_MONTHS.map(function (mn, i) { var v = String(i + 1).padStart(2, '0'); return '<option value="' + v + '"' + (S.th.month === v ? ' selected' : '') + '>' + mn + '</option>'; }).join('');
    var deptSel = '';
    if (isPM) {
      var depts = getUsers().map(function (u) { return u.dept; }).filter(Boolean).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort();
      deptSel = '<label class="df-leave-flabel">แผนก<select class="df-leave-select" onchange="filterTeamHistDept(this.value)"><option value="all">ทุกแผนก</option>' +
        depts.map(function (d) { return '<option value="' + esc(d) + '"' + (_teamHistDept === d ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label>';
    }
    view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: 'ปี ' + (Number(F.base.selYear) + 543) + ' · ' + F.base.data.length + ' รายการ', title: 'ประวัติการลาทีม',
      actions: '<button type="button" class="btn btn-ghost" onclick="DFLeave.exportCsv()">ดาวน์โหลด Excel</button>' }) +
      '<div class="df-leave-filters"><label class="df-leave-search">' + ICON.search + '<span class="df-sr">ค้นหา</span><input id="df-leave-thq" type="search" placeholder="ค้นหาชื่อ, เลขที่ใบลา, เหตุผล" value="' + esc(S.th.q) + '" oninput="DFLeave.thSearch(this.value)"></label>' +
      '<label class="df-leave-flabel">ปี<select class="df-leave-select" onchange="DFLeave.thYear(this.value)">' + years.map(function (yv) { return '<option value="' + esc(yv) + '"' + (yv === F.base.selYear ? ' selected' : '') + '>' + (Number(yv) + 543) + '</option>'; }).join('') + '</select></label>' +
      deptSel +
      '<label class="df-leave-flabel">ประเภท<select class="df-leave-select" onchange="DFLeave.thFilter(\'type\', this.value)"><option value="all">ทั้งหมด</option>' + typeOpts + '</select></label>' +
      '<label class="df-leave-flabel">เดือน<select class="df-leave-select" onchange="DFLeave.thFilter(\'month\', this.value)"><option value="all">ทุกเดือน</option>' + monthOpts + '</select></label></div>' +
      '<div id="df-leave-thtabs">' + thTabsHtml(F) + '</div>' +
      '<section class="df-card df-leave-thcard" id="df-leave-thres">' + thResults(F) + '</section></div>';
  }
  function refreshThResults() {
    var F = thFiltered();
    var r = $('df-leave-thres'), t = $('df-leave-thtabs');
    if (r) r.innerHTML = thResults(F);
    if (t) t.innerHTML = thTabsHtml(F);
  }

  /* =================================================================
     L6 — รายละเอียดใบลา (leave-detail)
     ================================================================= */
  function canSee(r) {
    if (!r || !cu) return false;
    if (r.email === cu.email) return true;
    if (!isMgr()) return false;
    var ve = getVisibleEmails();
    if (ve === null || ve.has(r.email)) return true;
    if (cu.role === 'pm' && r.status === 'pending_pm' && String(r.email).toLowerCase() !== KUNIIZ) return true; // renderLP scope
    return false;
  }
  var FROM_LABEL = { 'leave-history': 'วันลาของฉัน', 'team-hist': 'ประวัติการลาทีม', 'leave-review': 'อนุมัติการลา', 'leave-pm': 'อนุมัติการลา', 'leave-balance': 'ปฏิทินทีม' };

  function renderDetail(view) {
    var r = S.detailId != null ? lv(S.detailId) : null;
    var from = S.detailFrom && canAccessPage(S.detailFrom) ? S.detailFrom : 'leave-history';
    var crumb = '<a href="javascript:void(0)" onclick="showPage(\'' + from + '\')">' + esc(FROM_LABEL[from] || 'ย้อนกลับ') + '</a>';
    if (!r || !canSee(r)) {
      if (S.detailSeen && r === null) { S.detailSeen = false; setTimeout(function () { if (isActive('leave-detail')) showPage(from); }, 0); }
      view.innerHTML = '<div class="df-leave">' + D.header({ eyebrow: crumb, title: 'รายละเอียดใบลา' }) +
        '<section class="df-card df-leave-empty"><h2>ไม่พบใบลา</h2><p>ใบลานี้อาจถูกยกเลิก/ลบแล้ว หรือคุณไม่มีสิทธิ์ดู</p></section></div>';
      return;
    }
    S.detailSeen = true;
    var u = userOf(r.email), owner = r.email === cu.email, pend = isPending(r);
    var leadOfMember = cu.role === 'lead' && getMyTeamMembers().some(function (x) { return x.email === r.email; });
    var b = balOf(r.email, r.type);
    var balTxt = b.quota !== null ? num(b.left) + ' / ' + num(b.quota) + ' วัน' : (b.count ? b.count + ' ครั้ง' : '—');
    var facts = [['วันที่ลา', r.start === r.end ? thShortDow(r.start) : rangeYear(r.start, r.end)], ['จำนวน', r.isHalf ? '0.5 วัน' : dayLabel(r)], ['ช่วงเวลา', periodLabel(r)],
      [balLabel(r.type), balTxt]];
    var loc = u ? (u.locationType === 'province' ? 'ต่างจังหวัด' : 'กรุงเทพ') : '';

    /* header actions (same permissions as legacy rows) */
    var hActs = '<button type="button" class="btn btn-ghost" onclick="window.print()">พิมพ์ / PDF</button>';
    if (owner && pend) hActs += '<button type="button" class="btn btn-ghost" onclick="editLeave(' + jsArg(r.id) + ')">แก้ไขใบลา</button>';
    if ((owner || leadOfMember) && pend) hActs += '<button type="button" class="btn btn-ghost df-leave-warnbtn" onclick="cancelLeave(' + jsArg(r.id) + ')">ยกเลิกใบลา</button>';
    if (cu.role === 'pm' && !(owner && pend)) hActs += '<button type="button" class="btn btn-ghost df-leave-warnbtn" onclick="pmDeleteLeave(' + jsArg(r.id) + ')">ลบใบลา (PM)</button>';

    /* notices */
    var notices = '';
    if (leaveNeedsDoc(r)) {
      var nt = r.type === 'dental' ? 'ลาทำฟันต้องแนบ <strong>ใบเสร็จ/ใบรับรองแพทย์</strong> — แนบภายหลังได้ หลังจากแนบ PM จะพิจารณาอีกครั้ง'
        : 'ลาป่วยตั้งแต่ 2 วัน หรือต่อเนื่องจากวันลาก่อนหน้า ต้องแนบ <strong>ใบรับรองแพทย์</strong>';
      notices += '<div class="df-leave-notice">' + ICON.info + '<span>' + nt + '</span></div>';
    }
    if (r.status === 'rejected') notices += '<div class="df-leave-notice no">' + ICON.info + '<span>ไม่อนุมัติ' + (r.rejectedBy ? ' โดย ' + esc(r.rejectedBy) : '') + ': ' + esc(r.rejectReason || 'ไม่ได้ระบุเหตุผล') + '</span></div>';
    if (!r.hasDoc && r.docRejectReason) notices += '<div class="df-leave-notice no">' + ICON.info + '<span>เอกสารครั้งก่อนไม่ผ่าน: ' + esc(r.docRejectReason) + '</span></div>';
    var noteRows = '';
    if (r.addedBy) noteRows += '<div class="df-leave-kv"><span>ยื่นแทนโดย</span><b>' + esc(r.addedBy) + '</b></div>';
    if (r.leadNote) noteRows += '<div class="df-leave-kv"><span>หมายเหตุหัวหน้า</span><b>' + esc(r.leadNote) + '</b></div>';
    if (r.pmNote) noteRows += '<div class="df-leave-kv"><span>หมายเหตุ PM</span><b>' + esc(r.pmNote) + '</b></div>';

    /* documents (a leave stores at most one document link) */
    var canAttach = owner && needsDocMissing(r);
    var files = r.hasDoc && r.docName ? 1 : 0;
    var isUrl = files && String(r.docName).indexOf('http') === 0;
    var fname = files ? (isUrl ? decodeURIComponent(String(r.docName).split('?')[0].split('/').pop() || 'เอกสารแนบ') : r.docName) : '';
    var ext = files ? ((/\.(pdf)$/i.test(fname) ? 'PDF' : /\.(png|jpe?g|gif|webp)$/i.test(fname) ? 'IMG' : 'ไฟล์')) : '';
    var docCard = '<section class="df-card df-leave-docs"><div class="df-card-head"><h2>เอกสารแนบ <small>' + files + ' ไฟล์</small></h2>' +
      (canAttach ? '<button type="button" class="df-leave-upbtn" onclick="attachDentalDoc(' + jsArg(r.id) + ')">' + ICON.upload + 'อัปโหลดเอกสาร</button>' : '') + '</div>' +
      '<div class="df-leave-files">' +
      (files ? '<div class="df-leave-file"><button type="button" class="df-leave-file-prev"' + (isUrl ? ' onclick="viewDocPopup(' + jsArg(r.docName) + ')" aria-label="เปิดดู ' + esc(fname) + '"' : ' disabled') + '>' + ICON.doc + '<b>' + esc(ext) + '</b></button>' +
        '<div class="df-leave-file-meta"><b title="' + esc(fname) + '">' + esc(fname) + '</b><span>' + (r.pendingDocReview ? 'รอ PM ตรวจเอกสาร' : 'แนบแล้ว') + '</span></div></div>' : '') +
      (canAttach ? '<button type="button" class="df-leave-file-add" onclick="attachDentalDoc(' + jsArg(r.id) + ')">' + ICON.plus + '<strong>เพิ่มรูปหรือ PDF</strong><span>ใบเสร็จ · ใบรับรองแพทย์<br>สูงสุด 10 MB ต่อไฟล์</span></button>' : '') +
      (!files && !canAttach ? '<p class="df-muted">ยังไม่มีเอกสารแนบ</p>' : '') +
      '</div></section>';

    /* status timeline */
    var st = r.status, steps = [];
    var subDate = r.submittedAt ? ' · ' + D.thDate(String(r.submittedAt).slice(0, 10), { year: true }) : '';
    steps.push(['done', 'ยื่นใบลา', (r.addedBy ? 'ยื่นแทนโดย ' + r.addedBy : nickOf(r) + ' · ยื่นผ่านระบบ') + subDate]);
    var leadRejected = st === 'rejected' && r.leadAction === 'reject';
    if (!r.isLeadLeave) {
      var ls = st === 'pending_lead' ? 'now' : leadRejected ? 'no' : (st === 'pending_pm' || st === 'approved' || (st === 'rejected' && !leadRejected)) ? 'done' : 'todo';
      steps.push([ls, ls === 'no' ? 'หัวหน้าทีมไม่อนุมัติ' : ls === 'done' ? 'หัวหน้าทีมอนุมัติ' : 'หัวหน้าทีมพิจารณา', r.leadNote ? r.leadNote : (ls === 'now' ? 'รอหัวหน้าทีมพิจารณา' : ls === 'done' ? 'ส่งต่อ PM' : '')]);
    }
    var pmS = st === 'approved' ? 'done' : (st === 'pending_pm' && !r.pendingDocReview) ? 'now' : (st === 'rejected' && !leadRejected) ? 'no' : st === 'pending_pm' ? 'done' : 'todo';
    steps.push([pmS, pmS === 'no' ? 'PM ไม่อนุมัติ' : pmS === 'done' ? 'PM อนุมัติ' : 'PM พิจารณา', r.pmNote ? r.pmNote : (pmS === 'now' ? 'รอ PM พิจารณา' : pmS === 'done' ? 'บันทึกลงวันลาคงเหลือ' : '')]);
    if (leaveNeedsDoc(r) && st !== 'rejected') {
      var dS = r.pendingDocReview ? 'now' : (r.docName && st === 'approved') ? 'done' : st === 'approved' ? 'now' : 'todo';
      steps.push([dS, 'ตรวจเอกสาร', r.pendingDocReview ? 'มีเอกสาร 1 ไฟล์ · รอ PM ตรวจ' : dS === 'done' ? 'เอกสารครบแล้ว' : (st === 'approved' ? 'รอแนบเอกสาร' : 'แนบเอกสารหลังอนุมัติได้')]);
    }
    var tl = steps.map(function (s, i) {
      var mark = s[0] === 'done' ? '✓' : s[0] === 'no' ? '✕' : String(i + 1);
      return '<li class="' + s[0] + '"><span class="df-leave-dot">' + mark + '</span><div><b>' + esc(s[1]) + '</b>' + (s[2] ? '<span>' + esc(s[2]) + '</span>' : '') + '</div></li>';
    }).join('');

    /* action card for the viewer's role */
    var act = '';
    var leadCan = cu.role === 'lead' && st === 'pending_lead' && (function () { var ve = getVisibleEmails(); return ve === null || ve.has(r.email); })();
    var pmCan = cu.role === 'pm' && st === 'pending_pm' && (cu.email.toLowerCase() === KUNIIZ || String(r.email).toLowerCase() !== KUNIIZ);
    if (leadCan || pmCan) {
      var fn = leadCan ? 'lead' : 'pm', doc = r.pendingDocReview;
      act = '<section class="df-card df-leave-actcard"><h2>' + (leadCan ? 'สำหรับหัวหน้าทีม' : 'สำหรับ PM') + '</h2>' +
        '<button type="button" class="df-leave-send" onclick="DFLeave.act(\'' + fn + '\',' + jsArg(r.id) + ',\'approve\',\'df-leave-dnote\')">' + (doc ? 'อนุมัติเอกสาร' : leadCan ? 'อนุมัติ · ส่งต่อ PM' : 'อนุมัติการลา') + '</button>' +
        '<button type="button" class="df-leave-danger" onclick="DFLeave.act(\'' + fn + '\',' + jsArg(r.id) + ',\'reject\',\'df-leave-dnote\')">' + (doc ? 'เอกสารไม่ผ่าน (ต้องใส่เหตุผล)' : 'ปฏิเสธ (ต้องใส่เหตุผล)') + '</button>' +
        '<label class="df-leave-label strong" for="df-leave-dnote">' + (leadCan ? 'หมายเหตุ (ไม่บังคับ)' : 'หมายเหตุ PM') + '<textarea id="df-leave-dnote" class="df-leave-input df-leave-textarea" rows="3" placeholder="เขียนถึงผู้ยื่น..."></textarea></label></section>';
    } else if (owner && (pend || needsDocMissing(r))) {
      act = '<section class="df-card df-leave-actcard"><h2>สำหรับผู้ยื่น</h2>' +
        (needsDocMissing(r) ? '<button type="button" class="df-leave-send" onclick="attachDentalDoc(' + jsArg(r.id) + ')">แนบเอกสาร</button>' : '') +
        (pend ? '<button type="button" class="df-leave-cancel" onclick="editLeave(' + jsArg(r.id) + ')">แก้ไขใบลา</button><button type="button" class="df-leave-danger" onclick="cancelLeave(' + jsArg(r.id) + ')">ยกเลิกใบลา</button>' : '') +
        '<p class="df-muted">แก้ไข/ยกเลิกได้เฉพาะใบลาที่ยังรออนุมัติ</p></section>';
    }

    view.innerHTML = '<div class="df-leave df-leave-detail">' +
      '<header class="df-ph"><div class="df-ph-text"><span class="df-eyebrow">' + crumb + ' › ' + esc(r.refNo || '') + '</span>' +
      '<h1 class="df-h1 df-leave-dtitle">ใบลา ' + esc(r.refNo || '#' + r.id) + ' ' + statusChip(r, true) + '</h1></div><div class="df-ph-actions">' + hActs + '</div></header>' +
      '<div class="df-leave-cols">' +
      '<div class="df-leave-main">' +
      '<section class="df-card df-leave-dcard"><div class="df-leave-dwho">' + avatarOf(r.email, r.name, 52) + '<div><b>' + esc(nickOf(r)) + ' · ' + esc((u && u.name) || r.name || '') + '</b><span>' +
      esc([roleText(u), (u && u.dept) || r.dept, loc].filter(Boolean).join(' · ')) + '</span></div>' + D.typeChip(r.type) + '</div>' +
      '<div class="df-leave-facts g4">' + facts.map(function (f) { return '<div><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="df-leave-kv block"><span>เหตุผล</span><b>' + esc(r.reason || '—') + '</b></div>' + noteRows + notices + '</section>' +
      docCard + '</div>' +
      '<aside class="df-leave-side"><section class="df-card df-leave-status"><h2>สถานะ</h2><ol class="df-leave-tl">' + tl + '</ol></section>' + act + '</aside>' +
      '</div></div>';
  }

  /* =================================================================
     actions (UI only — every write is a legacy function)
     ================================================================= */
  var A = window.DFLeave = {
    open: function (id, from) {
      S.detailId = id; S.detailFrom = from || 'leave-history'; S.detailSeen = false;
      showPage('leave-detail');
    },
    /* L1 */
    pickType: function (t) {
      var o = legacyOpt(t); if (!o || o.disabled || o.hidden) return;
      setVal('leave-type', t); onLeaveChange(); rerenderNew();
    },
    toggleOther: function () { S.showOther = !S.showOther; rerenderNew(); },
    mode: function (mde) { setLeaveMode(mde); rerenderNew(); },
    month: function (o) { changeLeaveCalendarMonth(o); rerenderNew(); },
    pickDate: function (ds) { selectLeaveCalendarDate(ds); rerenderNew(); },
    pickMember: function (v) { var s = $('for-member-select'); if (!s) return; s.value = v; onLeaveChange(); rerenderNew(); },
    mirror: function (id, v) { var el = $(id); if (el) el.value = v; },
    quick: function (q) {
      var el = $('leave-reason'); if (!el) return;
      el.value = el.value.trim() ? el.value.trim() + ' ' + q : q;
      var ta = $('df-leave-reason'); if (ta) { ta.value = el.value; ta.focus(); }
    },
    pickFile: function () { var f = $('doc-file'); if (f) f.click(); },
    back: function () { showPage('leave-history'); },
    submit: function () {
      var ta = $('df-leave-reason'); if (ta) $('leave-reason').value = ta.value;
      var lk = $('df-leave-link'); if (lk) $('leave-link').value = lk.value;
      var wasEditing = editingId() != null, before = getLeaves().length;
      // legacy two-step flow: step 1 validation ("ถัดไป") then submit
      goToLeaveStep2();
      if (($('modal-leave') || {}).dataset.step !== '2') return;
      submitLeave();
      var ok = wasEditing ? editingId() == null : getLeaves().length > before;
      if (ok) { S.form = null; showPage('leave-history'); }
      else { setLeaveFormStep(1); rerenderNew(); }
    },
    /* L2 / L6 approve + reject via lAct / pAct (note copied into the legacy note input) */
    act: function (kind, id, action, noteEl) {
      var mine = $(noteEl || ((kind === 'lead' ? 'df-leave-ln-' : 'df-leave-pn-') + id));
      var legacyId = (kind === 'lead' ? 'ln-' : 'pn-') + id;
      if (!$(legacyId)) { if (kind === 'lead') renderLR(); else renderLP(); }
      var legacy = $(legacyId);
      if (legacy && mine) legacy.value = mine.value;
      if (kind === 'lead') lAct(id, action); else pAct(id, action);
    },
    revTab: function (page, t) { S.rev[page] = t; D.renderPage(page); },
    /* L3 */
    myTab: function (t) { S.myTab = t; D.renderPage('leave-history'); },
    myYear: function (v) { S.myYear = v; D.renderPage('leave-history'); },
    /* L4 */
    teamToday: function () {
      var n = new Date(), off = (n.getFullYear() - _teamCalMonth.getFullYear()) * 12 + (n.getMonth() - _teamCalMonth.getMonth());
      if (off) changeTeamCalMonth(off);
    },
    balYear: function (v) { var s = $('bal-year-sel'); if (s) { s.value = v; renderBal(); } },
    balAll: function () { S.balAll = !S.balAll; D.renderPage('leave-balance'); },
    /* L5 */
    thTab: function (t) { S.th.tab = t; S.th.page = 1; refreshThResults(); },
    thFilter: function (k, v) { S.th[k] = v; S.th.page = 1; refreshThResults(); },
    thSearch: function (v) { S.th.q = v; S.th.page = 1; refreshThResults(); },
    thPage: function (d) { S.th.page += d; refreshThResults(); },
    thYear: function (v) { var s = $('team-hist-year'); if (s) { s.value = v; S.th.page = 1; renderTeamHist(); } },
    exportCsv: function () {
      var F = thFiltered();
      var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var stTxt = function (r) { var m = /<span[^>]*>([^<]*)<\/span>/.exec(statusChip(r)); return m ? m[1] : r.status; };
      var lines = [['เลขที่', 'ชื่อ', 'อีเมล', 'แผนก', 'ประเภท', 'วันเริ่ม', 'วันสิ้นสุด', 'จำนวน(วัน)', 'ช่วงเวลา', 'เหตุผล', 'สถานะ'].join(',')].concat(F.rows.map(function (r) {
        var u = F.uMap.get(r.email);
        return [r.refNo, r.name, r.email, (u && u.dept) || r.dept, D.plainType(r.type), r.start, r.end, effectiveLeaveDays(r), periodLabel(r), r.reason, stTxt(r)].map(q).join(',');
      }));
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leave-history-' + F.base.selYear + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
  };

  /* =================================================================
     install
     ================================================================= */
  function install() {
    D.registerPage('leave-new', { create: true, render: renderNew, refreshOn: ['renderLeaveCalendar'] });
    D.registerPage('leave-review', { render: function (v) { renderApprove(v, 'leave-review'); }, refreshOn: ['renderLR'] });
    D.registerPage('leave-pm', { render: function (v) { renderApprove(v, 'leave-pm'); }, refreshOn: ['renderLP'] });
    D.registerPage('leave-history', { render: renderMy, refreshOn: ['renderMyBal', 'renderHist'] });
    D.registerPage('leave-balance', { render: renderTeam, refreshOn: ['renderBal', 'renderTeamCalendar'] });
    D.registerPage('team-hist', { render: renderTeamHistV3, refreshOn: ['renderTeamHist'] });
    D.registerPage('leave-detail', { create: true, render: renderDetail, refreshOn: ['renderMyBal', 'renderHist', 'renderLR', 'renderLP', 'renderTeamHist', 'renderBal'] });

    // "ยื่นใบลา" (every entry point calls openLeaveModal) → full page
    D.hook('openLeaveModal', function () {
      if (S.suppress) return;
      var mdl = $('modal-leave');
      if (!mdl || !mdl.classList.contains('open')) return;
      closeModal('modal-leave');
      S.form = 'new'; S.showOther = false;
      showPage('leave-new');
    });
    // "แก้ไข" a pending leave → same page in edit mode (legacy editLeave already loaded the form)
    D.hook('editLeave', function (id) {
      var mdl = $('modal-leave');
      if (!mdl || !mdl.classList.contains('open') || !sameRecordId(editingId(), id)) return;
      closeModal('modal-leave');
      S.form = 'edit'; S.showOther = false;
      showPage('leave-new');
    });
    D.hook('showPage', function (id) {
      if (id !== 'leave-new') S.form = null;
      // highlight the parent menu item for pages without their own nav entry
      var parent = id === 'leave-new' ? 'leave-history' : id === 'leave-detail' ? S.detailFrom : null;
      if (parent) {
        var nv = document.querySelector('[onclick="showPage(\'' + parent + '\')"]');
        if (nv && nv.classList.contains('nav-item')) nv.classList.add('active');
      }
    });
    // document upload progress inside the (hidden) legacy form → refresh the page view
    var dt = $('doc-text');
    if (dt && window.MutationObserver) new MutationObserver(function () { if (isActive('leave-new')) rerenderNew(); }).observe(dt, { childList: true, characterData: true, subtree: true });
    var lk = $('leave-link');
    if (lk) lk.addEventListener('change', function () { var m = $('df-leave-link'); if (m && m.value !== lk.value) m.value = lk.value; });
  }
  install();
})();

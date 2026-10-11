/* ==========================================================================
   Design Flow v3 — EXERCISE area (ข้อมูลของฉัน · ยื่นเบิก · แชร์กิจกรรม ·
   Leaderboard · อนุมัติออกกำลังกาย)

   SAFETY: this file never writes data. It only READS (getExs/getUsers/...)
   and every write goes through the existing legacy action functions, called
   exactly the way the legacy UI calls them:
     submitEx()            (after driving the legacy #modal-ex-form inputs /
                            setters: updateExType, selectExerciseCalendarDate,
                            addExSysMember, addExOutMember, removeExMember)
     editEx(id) deleteEx(id) viewExDetail(id)
     joinExGroup(id) leaveExGroup(id)
     apprEx(id) rejEx(id) revertExToPending(id)
   UI-state setters used (no data): onExLogMonthChange, onExShareMonthChange,
   setExShareTab, applyExShareAllFilter, setLBMonth, setLBSort,
   setExReviewMonth, setExReviewTab, setExReviewSearch, setExReviewDeptTab.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.DFV3) return;
  var D = window.DFV3, esc = D.esc;
  var MON = D.TH_MON_S, MONL = D.TH_MONTHS;
  var WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TYPES = [
    { id: 'solo', name: 'เดี่ยว', icon: 'ic-solo' },
    { id: 'group_ex', name: 'กลุ่มออกกำลังกาย', icon: 'ic-run' },
    { id: 'group_eat', name: 'กลุ่มกินข้าว', icon: 'ic-eat' }
  ];
  var TNAME = { solo: 'เดี่ยว', group_ex: 'กลุ่มออกกำลังกาย', group_eat: 'กลุ่มกินข้าว' };
  var TICON = { solo: 'ic-solo', group_ex: 'ic-run', group_eat: 'ic-eat' };
  var HIDDEN_ACCOUNT = 'kuniiz.ka@gmail.com'; // same special-case as legacy updateLB / updateExSysMemberSelect

  /* ---------------- small helpers (read-only) ---------------- */
  /* read-only access to legacy top-level `let` state (shared global lexical scope) */
  var LEG = {
    quotaViewDate: function () { return typeof quotaViewDate !== 'undefined' ? quotaViewDate : undefined; },
    exMembers: function () { return typeof exMembers !== 'undefined' ? exMembers : undefined; },
    _editingExId: function () { return typeof _editingExId !== 'undefined' ? _editingExId : null; },
    _lbMonth: function () { return typeof _lbMonth !== 'undefined' ? _lbMonth : undefined; },
    _lbSortField: function () { return typeof _lbSortField !== 'undefined' ? _lbSortField : undefined; },
    _lbSortDir: function () { return typeof _lbSortDir !== 'undefined' ? _lbSortDir : undefined; },
    _exReviewMonth: function () { return typeof _exReviewMonth !== 'undefined' ? _exReviewMonth : undefined; },
    _exReviewTab: function () { return typeof _exReviewTab !== 'undefined' ? _exReviewTab : undefined; },
    _exReviewSearch: function () { return typeof _exReviewSearch !== 'undefined' ? _exReviewSearch : undefined; },
    _exReviewDeptTab: function () { return typeof _exReviewDeptTab !== 'undefined' ? _exReviewDeptTab : undefined; }
  };
  function g(name) { try { return LEG[name](); } catch (e) { return undefined; } }
  function $(id) { return document.getElementById(id); }
  function today() { return toLocalDateString(new Date()); }
  function pd(ds) { var p = String(ds || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
  function money(n) { return '฿' + Number(n || 0).toLocaleString(); }
  function dShort(d) { return d.getDate() + ' ' + MON[d.getMonth()]; }
  function dsShort(ds) { return ds ? dShort(pd(ds)) : '—'; }
  function dsWd(ds) { var d = pd(ds); return WD[d.getDay()] + ' ' + dShort(d); }
  function dsFull(ds) { var d = pd(ds); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
  function cycleOf(mk) { var p = mk.split('-').map(Number); return { y: p[0], m: p[1], start: new Date(p[0], p[1] - 1, 19), end: new Date(p[0], p[1], 18) }; }
  function rangeTxt(a, b, dash) {
    dash = dash || '–';
    if (a.getMonth() === b.getMonth()) return a.getDate() + dash + b.getDate() + ' ' + MON[b.getMonth()];
    return dShort(a) + dash + dShort(b);
  }
  function cycleLabel(mk) { var c = cycleOf(mk); return MON[c.m - 1] + ' ' + (c.y + 543) + ' · ' + dShort(c.start) + '–' + dShort(c.end); }
  function cycleLong(mk) { var c = cycleOf(mk); return dShort(c.start) + ' – ' + dShort(c.end) + ' ' + (c.end.getFullYear() + 543); }
  function monthName(mk) { var c = cycleOf(mk); return MONL[c.m - 1] + ' ' + (c.y + 543); }
  function me() { return cu && cu.email; }
  function users() { return getUsers() || []; }
  function uByEmail(email) { return D.userByEmail(email); }
  function nickOf(email, fallback) {
    var u = uByEmail(email);
    return (u && (u.nickname || String(u.name || '').split(' ')[0])) || String(fallback || '').split(' ')[0] || email || '';
  }
  function first(n) { n = String(n || '?').trim(); return /^[เแโใไ]/.test(n) ? n.charAt(1) : n.charAt(0).toUpperCase(); }
  var TINTS = ['#DAD8FF', '#F8DFD3', '#D6E6FF', '#F6E7C4', '#E3DDF5'];
  function av(name, key, size, extra) {
    key = String(key || name || ''); var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return '<span class="df-ex-av' + (extra ? ' ' + extra : '') + '" aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px;background:' + TINTS[h % TINTS.length] + '">' + esc(first(name)) + '</span>';
  }
  function tile(icon, size) { return '<span class="df-tile ' + icon + '" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true"><span class="ic"></span></span>'; }
  function tchip(type) { return '<span class="df-tchip ' + (TICON[type] || 'ic-run') + '"><span class="ic"></span>' + esc(TNAME[type] || type) + '</span>'; }
  function statusChip(s) { return D.chip(s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending'); }
  function bar(pct, cls) { pct = Math.max(0, Math.min(100, pct || 0)); return '<div class="df-ex-bar"><div class="df-ex-bar-fill' + (cls ? ' ' + cls : '') + '" style="width:' + pct + '%"></div></div>'; }
  function q(js) { return esc(JSON.stringify(String(js))); } // safe single argument for inline handlers
  function icoSvg(path, size) { return '<svg aria-hidden="true" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; }
  function isActive(id) { var p = $('page-' + id); return !!(p && p.classList.contains('active')); }

  /* keep focus/caret when a view re-renders (e.g. search box, background sync) */
  function paint(view, html) {
    var a = document.activeElement, key = null, s = null, e = null;
    if (a && view.contains(a) && a.dataset && a.dataset.k) { key = a.dataset.k; try { s = a.selectionStart; e = a.selectionEnd; } catch (x) {} }
    view.innerHTML = html;
    if (key) {
      var n = view.querySelector('[data-k="' + key + '"]');
      if (n) { n.focus({ preventScroll: true }); try { if (s != null) n.setSelectionRange(s, e); } catch (x) {} }
    }
  }
  /* coalesce several legacy refresh calls into one render */
  var _pending = {};
  function schedule(id) {
    if (_pending[id]) return; _pending[id] = true;
    Promise.resolve().then(function () { _pending[id] = false; if (isActive(id)) D.renderPage(id); });
  }
  function selectHtml(opts, cur, attrs, cls) {
    return '<select class="df-ex-select' + (cls ? ' ' + cls : '') + '" ' + attrs + '>' + opts.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + (o.dis ? ' disabled' : '') + '>' + esc(o.l) + '</option>';
    }).join('') + '</select>';
  }

  /* ---------------- quota maths (same formulas as legacy updateQuota/submitEx) ---------------- */
  function quotaFor(vDate) {
    var loc = cu.locationType || 'bkk', isBkk = loc === 'bkk', em = cu.email;
    var editing = g('_editingExId');
    var all = (editing !== null && editing !== undefined) ? getExs().filter(function (e) { return String(e.id) !== String(editing); }) : getExs();
    var wk = wkKey(vDate), mk = monthKey(vDate), qk = quarterKey(vDate);
    var mine = all.filter(function (e) { return isUserInvolved(e, em) && e.status !== 'rejected'; });
    var cnt = function (f) { return mine.filter(f).length; };
    var solo = function (e) { return getExType(e) === 'solo'; }, grp = function (e) { return isGroupEx(getExType(e)); };
    var c = cycleOf(mk);
    // week range clamped to the cycle (as legacy)
    var weekOpts = [], cur = new Date(c.start);
    while (cur <= c.end) { var k = wkKey(cur); if (weekOpts.indexOf(k) < 0) weekOpts.push(k); cur.setDate(cur.getDate() + 1); }
    var w = wkKey(vDate); if (weekOpts.indexOf(w) < 0) w = weekOpts[0];
    var ws = pd(w), we = new Date(ws); we.setDate(ws.getDate() + 6); if (we > c.end) we = new Date(c.end);
    var prev = c.m - 1, py = c.y; if (prev === 0) { prev = 12; py--; }
    var prevMk = py + '-' + String(prev).padStart(2, '0');
    var moneyOf = function (k) { return mine.filter(function (e) { return monthKey(e.date) === k; }).reduce(function (s, e) { return s + getExerciseReward(e); }, 0); };
    var monthItems = mine.filter(function (e) { return monthKey(e.date) === mk; });
    return {
      loc: loc, isBkk: isBkk, locLabel: isBkk ? 'กทม.' : 'ตจว.', mk: mk, wk: wk, qk: qk, cycle: c,
      wkNum: weekOpts.indexOf(w) + 1, ws: ws, we: we,
      wkLimit: getSoloWeeklyLimit(vDate, loc), moLimit: getSoloMonthlyLimit(vDate, loc),
      wkSolo: cnt(function (e) { return solo(e) && wkKey(e.date) === wk; }),
      moSolo: cnt(function (e) { return solo(e) && monthKey(e.date) === mk; }),
      wkGrp: cnt(function (e) { return grp(e) && wkKey(e.date) === wk; }),
      moGrp: cnt(function (e) { return grp(e) && monthKey(e.date) === mk; }),
      qGrp: cnt(function (e) { return grp(e) && quarterKey(e.date) === qk; }),
      colaThresh: getColaThreshold(vDate, isBkk),
      total: moneyOf(mk), prevTotal: moneyOf(prevMk), count: monthItems.length,
      soloMoney: monthItems.filter(solo).reduce(function (s, e) { return s + getExerciseReward(e); }, 0),
      grpMoney: monthItems.filter(grp).reduce(function (s, e) { return s + getExerciseReward(e); }, 0)
    };
  }
  /* remaining claims for a type at a date: {n, scope:'wk'|'mo'} */
  function remaining(Q, type) {
    if (type === 'solo') {
      var rw = Q.wkLimit === null ? Infinity : Q.wkLimit - Q.wkSolo, rm = Q.moLimit - Q.moSolo;
      return rw <= rm ? { n: Math.max(0, rw), scope: 'wk', used: Q.wkSolo, lim: Q.wkLimit } : { n: Math.max(0, rm), scope: 'mo', used: Q.moSolo, lim: Q.moLimit };
    }
    var gw = 1 - Q.wkGrp, gm = 4 - Q.moGrp;
    return gw <= gm ? { n: Math.max(0, gw), scope: 'wk', used: Q.wkGrp, lim: 1 } : { n: Math.max(0, gm), scope: 'mo', used: Q.moGrp, lim: 4 };
  }
  function cutoffs() {
    var t = new Date();
    var daysUntilSat = (6 - t.getDay() + 7) % 7 || 7;
    var next18 = new Date(t.getFullYear(), t.getMonth(), 18);
    if (t > next18) next18.setMonth(next18.getMonth() + 1);
    return { sat: daysUntilSat, d18: Math.ceil((next18 - t) / 86400000) };
  }

  /* ======================= X1 · ข้อมูลของฉัน (exercise-log) ======================= */
  var _histSort = 'desc';
  window.__dfExSetHistSort = function (v) { _histSort = v === 'asc' ? 'asc' : 'desc'; D.renderPage('exercise-log'); };

  function renderLog(view) {
    var vDate = g('quotaViewDate') || today();
    var Q = quotaFor(vDate), mk = Q.mk, isCur = mk === monthKey(today());
    var C = cutoffs();
    // cycle options: same set as legacy updateQuota (last 6 .. next 2)
    var opts = [], now = new Date();
    for (var i = -6; i <= 2; i++) { var k = monthKey(new Date(now.getFullYear(), now.getMonth() + i, 20)); if (opts.indexOf(k) < 0) opts.push(k); }
    opts.reverse();
    var sel = '<label class="df-ex-lbl">รอบ' + selectHtml(opts.map(function (k) { return { v: k, l: cycleLabel(k) }; }), mk, 'aria-label="เลือกรอบ" onchange="onExLogMonthChange(this.value)"') + '</label>';
    var head = D.header({ eyebrow: 'ออกกำลังกาย', title: 'ข้อมูลของฉัน',
      actions: sel + '<button type="button" class="df-ex-cta" onclick="openExModal()">+ ยื่นเบิกใหม่</button>' });

    var v2 = usesExercisePolicyV2(vDate);
    var diff = Q.total - Q.prevTotal;
    var line = Q.count
      ? 'เดือนก่อน <strong>' + money(Q.prevTotal) + '</strong> · ' + (diff >= 0 ? 'เพิ่มขึ้น ' : 'ลดลง ') + money(Math.abs(diff))
      : 'เดือนก่อน <strong>' + money(Q.prevTotal) + '</strong> · ยังไม่มีกิจกรรมในรอบนี้';
    var moneyCard = '<section class="df-ex-money">' +
      '<div class="df-ex-money-main"><span class="df-ex-mut">ยอดเงินรอบนี้ (คาดการณ์)</span><span class="df-ex-big">' + money(Q.total) + '</span><span class="df-ex-line">' + line + '</span>' +
      (Q.count ? '<span class="df-ex-mut df-ex-sm">เดี่ยว ' + money(Q.soloMoney) + ' · ' + Q.moSolo + ' ครั้ง · กลุ่ม ' + money(Q.grpMoney) + ' · ' + Q.moGrp + ' ครั้ง</span>' : '') + '</div>' +
      '<div class="df-ex-money-rate"><span class="df-ex-mut df-ex-sm">เรตเบิก (' + (v2 ? 'ตั้งแต่' : 'ก่อน') + ' 1 ก.ย. 2569)</span><div class="df-ex-pills">' +
      '<span>เดี่ยว ' + money(getExerciseReward('solo', vDate)) + '</span><span>กลุ่มออก ' + money(getExerciseReward('group_ex', vDate)) + '</span><span>กลุ่มกิน ' + money(getExerciseReward('group_eat', vDate)) + '</span></div></div></section>';
    var cut = '<section class="df-ex-cuts">' +
      '<div class="df-ex-cut"><span class="df-ex-mut df-ex-sm">ตัดรอบรายสัปดาห์</span><b>อีก ' + C.sat + ' วัน</b><span class="df-ex-mut df-ex-sm">ทุกวันเสาร์</span></div>' +
      '<div class="df-ex-cut"><span class="df-ex-mut df-ex-sm">ตัดรอบรายเดือน</span><b>อีก ' + C.d18 + ' วัน</b><span class="df-ex-mut df-ex-sm">ทุกวันที่ 18</span></div></section>';

    var wkLabel = (isCur ? 'สัปดาห์นี้' : 'สัปดาห์ที่ ' + Q.wkNum) + ' (' + rangeTxt(Q.ws, Q.we) + ')';
    var qrow = function (label, used, lim) {
      var txt = lim === null ? used + ' ครั้ง' : used + ' / ' + lim;
      return '<div class="df-ex-qrow"><div class="df-ex-qtop"><span>' + label + '</span><strong>' + txt + '</strong></div>' + bar(lim ? used / lim * 100 : 0) + '</div>';
    };
    var note = function (type) {
      if (!isCur) return '<span class="df-ex-qnote mut">รอบ ' + cycleLong(mk) + '</span>';
      var r = remaining(Q, type);
      if (r.n > 0) return '<span class="df-ex-qnote">ยังเบิกได้อีก ' + r.n + ' ครั้ง' + (r.scope === 'wk' ? 'ในสัปดาห์นี้' : 'ในรอบนี้') + '</span>';
      return '<span class="df-ex-qnote ok">ครบโควต้า' + (r.scope === 'wk' ? 'สัปดาห์นี้' : 'รอบนี้') + 'แล้ว</span>';
    };
    var qcard = function (icon, name, rate, rows, type) {
      return '<section class="df-ex-qcard"><div class="df-ex-qhead"><h2>' + tile(icon, 40) + name + '</h2><span class="df-ex-mut df-ex-sm">' + rate + '</span></div>' + rows + note(type) + '</section>';
    };
    var soloCard = qcard('ic-solo', 'แบบเดี่ยว', Q.locLabel + ' · ' + money(getExerciseReward('solo', vDate)) + '/ครั้ง',
      qrow(wkLabel, Q.wkSolo, Q.wkLimit) + qrow('ทั้งรอบ', Q.moSolo, Q.moLimit), 'solo');
    var grpCard = qcard('ic-run', 'แบบกลุ่ม', Q.locLabel + ' · ออก ' + money(getExerciseReward('group_ex', vDate)) + ' · กิน ' + money(getExerciseReward('group_eat', vDate)),
      qrow(wkLabel, Q.wkGrp, 1) + qrow('ทั้งรอบ', Q.moGrp, 4), 'group_ex');
    // quarterly bonus (legacy "Cola")
    var qp = Q.qk.split('-Q').map(Number), qs = new Date(qp[0], (qp[1] - 1) * 3, 19), qe = new Date(qp[0], qp[1] * 3, 18);
    var colaOk = Q.qGrp >= Q.colaThresh;
    var bonus = '<section class="df-ex-qcard df-ex-bonus"><div class="df-ex-qhead"><h2>โบนัสไตรมาส Q' + qp[1] + '</h2>' +
      (colaOk ? '<span class="df-ex-badge ok">ผ่านแล้ว</span>' : '<span class="df-ex-badge">อีก ' + (Q.colaThresh - Q.qGrp) + ' ครั้ง</span>') + '</div>' +
      '<span class="df-ex-mut df-ex-sm">' + dShort(qs) + ' – ' + dShort(qe) + ' ' + (qe.getFullYear() + 543) + ' · แบบกลุ่ม</span>' +
      '<div class="df-ex-qtop"><span>กิจกรรมกลุ่ม</span><strong>' + Q.qGrp + ' / ' + Q.colaThresh + ' ครั้ง</strong></div>' + bar(Q.qGrp / Q.colaThresh * 100) +
      (colaOk ? '<span class="df-ex-bonus-t">ได้โบนัส <strong>฿1,500/เดือน</strong> ในไตรมาสถัดไป</span>'
              : '<span class="df-ex-bonus-t">ร่วมกลุ่มให้ครบ ' + Q.colaThresh + ' ครั้ง/ไตรมาส รับโบนัส <strong>฿1,500/เดือน</strong> ในไตรมาสถัดไป</span>') + '</section>';

    // history — same set as legacy renderExHistory (all my involvements in the selected cycle)
    var list = getExs().filter(function (e) { return isUserInvolved(e, cu.email) && monthKey(e.date) === mk; });
    list.sort(function (a, b) { var c = String(a.date).localeCompare(String(b.date)) || String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')); return _histSort === 'asc' ? c : -c; });
    var hist = list.length ? '<div class="df-ex-hlist">' + list.map(histRow).join('') + '</div>' :
      '<div class="df-ex-empty"><b>ยังไม่มีกิจกรรมในรอบนี้</b><span>ออกกำลังกายแล้ว ถ่ายวิดีโอ แล้วยื่นเบิกได้เลย · ร่วมกิจกรรมกลุ่มกับเพื่อนได้ที่ <a href="#exercise-share" onclick="event.preventDefault();showPage(\'exercise-share\')">แชร์กิจกรรม</a></span></div>';
    var histCard = '<section class="df-card df-ex-hist"><div class="df-ex-hhead"><h2>ประวัติกิจกรรม</h2><label class="df-ex-lbl">เรียง' +
      selectHtml([{ v: 'desc', l: 'ใหม่ → เก่า' }, { v: 'asc', l: 'เก่า → ใหม่' }], _histSort, 'aria-label="เรียงลำดับ" onchange="__dfExSetHistSort(this.value)"') + '</label></div>' + hist + '</section>';

    paint(view, '<div class="df-ex df-ex-log">' + head +
      '<div class="df-ex-row1">' + moneyCard + cut + '</div>' +
      '<div class="df-ex-row2">' + soloCard + grpCard + bonus + '</div>' + histCard + '</div>');
  }

  function histRow(e) {
    var et = getExType(e), d = pd(e.date), isRej = e.status === 'rejected';
    var others = [{ email: e.email, name: e.name, type: 'sys' }].concat(e.members || [])
      .filter(function (m) { return !(m.type === 'sys' && String(m.email || '').toLowerCase() === cu.email.toLowerCase()); })
      .map(function (m) { return m.type === 'out' ? (m.name || '') + ' (นอก)' : nickOf(m.email, m.name); });
    var seen = {}; others = others.filter(function (n) { if (seen[n]) return false; seen[n] = 1; return true; });
    var own = e.email === cu.email;
    var canEdit = (own && e.status === 'pending') || (cu.role === 'pm' && e.status === 'approved');
    var canDel = (own && e.status === 'pending') || cu.role === 'pm';
    var sub = [dsWd(e.date) + ' · W' + getWkNum(e.date)];
    if (isGroupEx(et)) sub.push(others.length ? 'ร่วมกับ ' + others.join(', ') : '');
    else if (!own) sub.push('โดย ' + nickOf(e.email, e.name));
    var acts = (canEdit ? '<button type="button" class="df-ex-mini" onclick="editEx(' + q(e.id) + ')">แก้ไข</button>' : '') +
      (canDel ? '<button type="button" class="df-ex-mini warn" onclick="deleteEx(' + q(e.id) + ')">ลบ</button>' : '') +
      '<button type="button" class="df-ex-link" onclick="viewExDetail(' + q(e.id) + ')">รายละเอียด ›</button>';
    return '<div class="df-ex-hrow' + (isRej ? ' rej' : '') + '">' +
      '<div class="df-ex-datebox"><b>' + d.getDate() + '</b><span>' + MON[d.getMonth()] + '</span></div>' +
      '<div class="df-ex-hmain"><div class="df-ex-htitle"><span>' + esc(e.activity || 'กิจกรรม') + '</span>' + tchip(et) + '</div>' +
      '<div class="df-ex-hsub">' + esc(sub.filter(Boolean).join(' · ')) + '</div>' +
      (isRej ? '<div class="df-ex-rej">ไม่อนุมัติ' + (e.rejectedBy ? ' โดย ' + esc(e.rejectedBy) : '') + ': ' + esc(e.rejectReason || 'ไม่ได้ระบุเหตุผล') + '</div>' : '') + '</div>' +
      '<div class="df-ex-hmoney' + (isRej ? ' strike' : '') + '">' + money(getExerciseReward(e)) + '</div>' +
      '<div class="df-ex-hstat">' + statusChip(e.status) + '</div>' +
      '<div class="df-ex-hact">' + acts + '</div></div>';
  }

  /* ======================= X2 · ยื่นเบิกใหม่ (ex-new) ======================= */
  var _armed = null;            // 'new' | 'edit' while the legacy form is driven by this page
  var _ext = { name: '', dept: '' };
  function formModal() { return $('modal-ex-form'); }
  function hideFormModal() { var m = formModal(); if (m) m.classList.add('df-ex-driven'); }
  function releaseFormModal() {
    var m = formModal(); if (!m) return;
    if (m.classList.contains('df-ex-driven')) { m.classList.remove('df-ex-driven'); closeModal('modal-ex-form'); }
  }
  function afterLegacyOpen(mode) {
    var m = formModal();
    if (!m || !m.classList.contains('open')) return; // legacy refused (e.g. no permission) — nothing to do
    hideFormModal(); // keep the legacy form "open" (so legacy quota checks use the chosen date) but invisible
    _armed = mode; _ext = { name: '', dept: '' };
    if (isActive('ex-new')) D.renderPage('ex-new'); else showPage('ex-new');
  }

  function val(id) { var el = $(id); return el ? el.value : ''; }
  window.__dfExForm = {
    type: function (t) { var s = $('ex-type'); if (!s || s.value === t) return; s.value = t; updateExType(); D.renderPage('ex-new'); },
    date: function (ds) { selectExerciseCalendarDate(ds); D.renderPage('ex-new'); },
    text: function (id, v) { var el = $(id); if (el) el.value = v; if (id === 'ex-act') clearExErr(); },
    addSys: function (email) { var s = $('ex-sys-member'); if (!s) return; s.value = email; if (s.value !== email) return; addExSysMember(); D.renderPage('ex-new'); },
    remove: function (id) { removeExMember(id); D.renderPage('ex-new'); },
    extInput: function (k, v) {
      _ext[k] = v;
      var b = document.querySelector('.df-ex-extadd'); if (b) b.disabled = !(_ext.name.trim() && _ext.dept.trim());
    },
    addExt: function () {
      var n = $('ex-out-name'), d = $('ex-out-dept'); if (!n || !d) return;
      n.value = _ext.name; d.value = _ext.dept;
      var before = (g('exMembers') || []).length;
      addExOutMember();
      if ((g('exMembers') || []).length > before) _ext = { name: '', dept: '' };
      D.renderPage('ex-new');
    },
    submit: function () { submitEx(); D.renderPage('ex-new'); },
    cancel: function () { showPage('exercise-log'); }
  };

  function renderNew(view) {
    if (!_armed) { openExModal(); return; } // initialises the legacy form exactly like the old "ยื่นเบิกใหม่" button
    var editing = g('_editingExId'), isEdit = editing !== null && editing !== undefined;
    var type = val('ex-type') || 'solo', isGrp = isGroupEx(type);
    var date = val('ex-date') || today();
    var Q = quotaFor(date);
    var C = cutoffs();
    var t = today();

    // type cards
    var types = TYPES.map(function (T) {
      var on = T.id === type, r = remaining(Q, T.id);
      var noteTxt = r.n > 0 ? (r.scope === 'wk' ? 'สัปดาห์นี้' : 'รอบนี้') + 'เหลือ ' + r.n + ' ครั้ง' : (r.scope === 'wk' ? 'สัปดาห์นี้' : 'รอบนี้') + 'ครบแล้ว';
      return '<button type="button" role="radio" aria-checked="' + on + '" class="df-ex-type' + (on ? ' on' : '') + '" onclick="__dfExForm.type(\'' + T.id + '\')">' +
        tile(T.icon, 44) + '<span class="df-ex-type-n">' + T.name + '</span><span class="df-ex-type-m">' + money(getExerciseReward(T.id, date)) + '</span>' +
        '<span class="df-ex-type-q' + (r.n > 0 ? '' : ' full') + '">' + noteTxt + '</span></button>';
    }).join('');

    // date options: days of open submission cycles up to today (legacy calendar rules)
    var dupFor = function (ds) { return getExs().some(function (e) { return String(e.id) !== String(editing) && e.status !== 'rejected' && e.date === ds && isUserInvolved(e, cu.email); }); };
    var dOpts = [], seen = {};
    var startCycle = cycleOf(monthKey(t)).start, prevCycleStart = new Date(startCycle); prevCycleStart.setMonth(prevCycleStart.getMonth() - 1);
    for (var dt = new Date(pd(t)); dt >= prevCycleStart; dt.setDate(dt.getDate() - 1)) {
      var ds = toLocalDateString(dt);
      if (!_isExerciseCycleOpenForSubmission(monthKey(ds), t)) continue;
      var dup = dupFor(ds);
      seen[ds] = 1;
      dOpts.push({ v: ds, l: dsWd(ds) + (ds === t ? ' (วันนี้)' : '') + (dup ? ' · ยื่นแล้ว' : ''), dis: dup && ds !== date });
    }
    if (!seen[date]) dOpts.unshift({ v: date, l: dsWd(date) + ' ' + (pd(date).getFullYear() + 543) });
    var cyc = cycleOf(monthKey(t)), dayBefore = new Date(cyc.start); dayBefore.setDate(dayBefore.getDate() - 1);
    var prevOpen = _isExerciseCycleOpenForSubmission(monthKey(dayBefore), t);
    var dateHint = 'เลือกได้เฉพาะวันในรอบนี้ (' + dShort(cyc.start) + ' – ' + dShort(cyc.end) + ') และไม่เกินวันนี้' + (prevOpen ? ' · วันนี้ยังยื่นย้อนหลังรอบก่อนได้' : '');

    // group members (from the legacy select, so availability rules are the legacy ones)
    var groupHtml = '';
    if (isGrp) {
      updateExSysMemberSelect();
      var mem = g('exMembers') || [];
      var count = 1 + mem.length, ok = count >= 3;
      var chips = '<span class="df-ex-mchip me">' + av(cu.nickname || cu.name, cu.email, 32) + '<span class="df-ex-mtxt"><b>' + esc(D.nick(cu) || cu.name) + '</b><small>ตัวคุณ · ใส่อัตโนมัติ</small></span></span>' +
        mem.map(function (m) {
          var isOut = m.type === 'out';
          var u = !isOut && uByEmail(m.email);
          var name = isOut ? m.name : nickOf(m.email, m.name);
          var sub = isOut ? 'นอกระบบ · ' + (m.dept || '—') : ((u && u.dept) || '');
          return '<span class="df-ex-mchip' + (isOut ? ' out' : '') + '">' + (isOut ? '<span class="df-ex-av out" style="width:32px;height:32px;font-size:13px">' + esc(first(name)) + '</span>' : av(name, m.email, 32)) +
            '<span class="df-ex-mtxt"><b>' + esc(name) + '</b><small>' + esc(sub) + '</small></span>' +
            '<button type="button" class="df-ex-mx" aria-label="ลบ ' + esc(name) + '" onclick="__dfExForm.remove(' + q(m.id) + ')">×</button></span>';
        }).join('');
      var sel = $('ex-sys-member');
      var people = sel ? Array.prototype.slice.call(sel.options).filter(function (o) { return o.value; }).map(function (o) {
        var u = uByEmail(o.value) || {};
        var nick = u.nickname || String(u.name || o.value).split(' ')[0];
        var reason = (o.textContent.match(/\(([^()]*เต็ม[^()]*)\)\s*$/) || [])[1] || '';
        var why = reason.indexOf('สป.') >= 0 ? 'ทำกลุ่มแล้วสัปดาห์นี้' : reason ? 'ทำกลุ่มครบแล้วเดือนนี้' : '';
        if (o.disabled && !why) why = 'เพิ่มไม่ได้';
        return '<button type="button" class="df-ex-person"' + (o.disabled ? ' disabled title="' + esc(why) + '"' : ' title="เพิ่ม ' + esc(nick) + '"') +
          ' onclick="__dfExForm.addSys(' + q(o.value) + ')">' + av(nick, o.value, 28) + '<span class="df-ex-ptxt"><span>' + esc(nick) + '</span><small>' + esc(o.disabled ? why : (u.dept || '')) + '</small></span></button>';
      }).join('') : '';
      groupHtml = '<div class="df-ex-group">' +
        '<div class="df-ex-ghead"><span>สมาชิกในกลุ่ม</span><span class="df-ex-gnote' + (ok ? ' ok' : '') + '">' + (ok ? 'ครบ ' + count + ' คนแล้ว — ส่งได้' : 'มี ' + count + ' คน · ต้องเพิ่มอีก ' + (3 - count) + ' คน') + '</span></div>' +
        '<span class="df-ex-mut df-ex-sm">คุณถูกใส่ชื่อให้อัตโนมัติ · ต้องเพิ่มอีกอย่างน้อย 2 คน ที่ยังไม่ได้ทำกิจกรรมกลุ่มในเดือนนี้</span>' +
        '<div class="df-ex-chosen">' + chips + '</div>' +
        '<div class="df-ex-pick"><span class="df-ex-pick-h">เพิ่มเพื่อนในระบบ <span>ทุกแผนก</span></span><div class="df-ex-people">' + (people || '<span class="df-ex-mut df-ex-sm">ไม่มีสมาชิกที่เพิ่มได้</span>') + '</div></div>' +
        '<div class="df-ex-pick dashed"><span class="df-ex-pick-h">เพิ่มคนนอกระบบ <span>เช่น เพื่อนต่างทีม ที่ยังไม่มีบัญชี</span></span><div class="df-ex-extrow">' +
        '<input data-k="ext-name" class="df-ex-input" placeholder="ชื่อ–นามสกุล" aria-label="ชื่อ–นามสกุล" value="' + esc(_ext.name) + '" oninput="__dfExForm.extInput(\'name\',this.value)">' +
        '<input data-k="ext-dept" class="df-ex-input" placeholder="แผนก / ตำแหน่ง" aria-label="แผนก / ตำแหน่ง" value="' + esc(_ext.dept) + '" oninput="__dfExForm.extInput(\'dept\',this.value)">' +
        '<button type="button" class="df-ex-extadd"' + (_ext.name.trim() && _ext.dept.trim() ? '' : ' disabled') + ' onclick="__dfExForm.addExt()">+ เพิ่ม</button></div></div></div>';
    }

    // summary
    var r = remaining(Q, type);
    var reward = getExerciseReward(type, date);
    var wkUsed = type === 'solo' ? Q.wkSolo : Q.wkGrp, wkLim = type === 'solo' ? Q.wkLimit : 1;
    var errEl = $('ex-err'), warnEl = $('ex-warn'), btnL = $('btn-submit-ex');
    var err = errEl && errEl.style.display !== 'none' ? errEl.innerHTML : '';
    var warn = warnEl && warnEl.style.display !== 'none' ? warnEl.textContent : '';
    var mem2 = g('exMembers') || [];
    var blocked = (isGrp && 1 + mem2.length < 3) || !!(btnL && btnL.disabled);
    var dupNow = dupFor(date);
    var summary = '<aside class="df-card df-ex-sum" aria-label="สรุปการเบิก"><h2>สรุปก่อนส่ง</h2>' +
      '<div class="df-ex-sumbox"><span class="df-ex-mut df-ex-sm">' + TNAME[type] + ' · ' + dsWd(date) + '</span><span class="df-ex-sumbig">' + money(reward) + '</span>' +
      '<span>ใช้โควต้าสัปดาห์นี้ <strong>' + (wkLim === null ? (wkUsed + 1) + ' ครั้ง' : Math.min(wkUsed + 1, wkLim) + ' / ' + wkLim) + '</strong></span></div>' +
      '<ul class="df-ex-sumlist"><li>ยอดรอบนี้จะเป็น <strong>' + money(Q.total + reward) + '</strong> (จาก ' + money(Q.total) + ')</li>' +
      '<li>ตัดรอบรายสัปดาห์วันเสาร์ — อีก ' + C.sat + ' วัน</li><li>PM จะตรวจวิดีโอก่อนอนุมัติ</li></ul>' +
      (warn ? '<div class="df-ex-alert warn" role="status">' + esc(warn) + '</div>' : (r.n <= 0 ? '<div class="df-ex-alert warn" role="status">โควต้า' + TNAME[type] + (r.scope === 'wk' ? 'สัปดาห์นี้' : 'รอบนี้') + 'เต็มแล้ว</div>' : '')) +
      (dupNow && !err ? '<div class="df-ex-alert warn" role="status">วันที่นี้มีรายการยื่นแล้ว กรุณาเลือกวันอื่น</div>' : '') +
      (err ? '<div class="df-ex-alert err" role="alert">' + err + '</div>' : '') +
      '<button type="button" class="df-ex-send"' + (blocked ? ' disabled' : '') + ' onclick="__dfExForm.submit()">' + (isEdit ? 'บันทึกการแก้ไข' : 'ยื่นเบิก') + '</button>' +
      '<button type="button" class="df-ex-cancel" onclick="__dfExForm.cancel()">ยกเลิก</button></aside>';

    var form = '<div class="df-ex-form">' +
      '<section class="df-card"><h2>ประเภท</h2><div class="df-ex-types" role="radiogroup" aria-label="ประเภทการเบิก">' + types + '</div></section>' +
      '<section class="df-card"><h2>รายละเอียด</h2><div class="df-ex-fields">' +
      '<label class="df-ex-f grow2">กิจกรรม<input data-k="act" class="df-ex-input lg" placeholder="เช่น วิ่ง 5 กม., ว่ายน้ำ, โยคะ" value="' + esc(val('ex-act')) + '" oninput="__dfExForm.text(\'ex-act\',this.value)"></label>' +
      '<label class="df-ex-f grow1">วันที่ทำกิจกรรม' + selectHtml(dOpts, date, 'onchange="__dfExForm.date(this.value)"', 'lg') + '</label></div>' +
      '<span class="df-ex-mut df-ex-sm">' + dateHint + '</span>' + groupHtml +
      '<label class="df-ex-f">ลิงก์วิดีโอหลักฐาน <span class="df-ex-req">* จำเป็น</span><input data-k="link" class="df-ex-input lg" type="url" placeholder="วางลิงก์ Google Drive หรือ YouTube" value="' + esc(val('ex-link')) + '" oninput="__dfExForm.text(\'ex-link\',this.value)"></label>' +
      '<span class="df-ex-mut df-ex-sm">ระบบอัปโหลดไฟล์ปิดชั่วคราว — อัปโหลดวิดีโอขึ้น Google Drive แล้ววางลิงก์แทน (ตั้งสิทธิ์ให้ทุกคนที่มีลิงก์ดูได้)</span>' +
      '<label class="df-ex-f">หมายเหตุ <span class="df-ex-opt">ไม่บังคับ</span><textarea data-k="note" class="df-ex-input" rows="2" oninput="__dfExForm.text(\'ex-note\',this.value)">' + esc(val('ex-note')) + '</textarea></label>' +
      '</section></div>';

    var head = D.header({ eyebrow: '<a href="#exercise-log" onclick="event.preventDefault();showPage(\'exercise-log\')">ข้อมูลของฉัน</a> › ' + (isEdit ? 'แก้ไขใบเบิก' : 'ยื่นเบิกใหม่'),
      title: isEdit ? 'แก้ไขใบเบิกออกกำลังกาย' : 'ยื่นเบิกออกกำลังกาย' });
    paint(view, '<div class="df-ex df-ex-new">' + head + '<div class="df-ex-newgrid">' + form + summary + '</div></div>');
  }

  /* ======================= X3 · แชร์กิจกรรมกลุ่ม (exercise-share) ======================= */
  window.__dfExShare = {
    tab: function (t) { setExShareTab(t); schedule('exercise-share'); },
    filter: function (on) { var c = $('ex-share-filter-joinable'); if (c) c.checked = !!on; applyExShareAllFilter(); schedule('exercise-share'); },
    month: function (mk) { var s = $('ex-share-month-select'); if (s) s.value = mk; onExShareMonthChange(); },
    open: function () { openExModal(); if (_armed) window.__dfExForm.type('group_ex'); }
  };
  function renderShare(view) {
    var tab = window._exShareTab || 'mine';
    var mine = window._exShareMine || [], allSorted = window._exShareAllSorted || [], canJoin = window._exShareCanJoin || [];
    var chk = $('ex-share-filter-joinable'), useFilter = chk ? chk.checked : true;
    var ms = $('ex-share-month-select');
    var mOpts = ms ? Array.prototype.slice.call(ms.options).map(function (o) { return { v: o.value, l: cycleLabel(o.value) }; }) : [];
    var curMk = ms ? ms.value : '';
    var head = D.header({ eyebrow: 'ลงชื่อร่วมได้เอง · ล็อกอัตโนมัติเมื่อครบ 3 คน', title: 'แชร์กิจกรรมกลุ่ม',
      actions: (mOpts.length ? '<label class="df-ex-lbl">รอบ' + selectHtml(mOpts, curMk, 'aria-label="เลือกรอบ" onchange="__dfExShare.month(this.value)"') + '</label>' : '') +
        '<button type="button" class="df-ex-cta" onclick="__dfExShare.open()">+ เปิดกิจกรรมใหม่</button>' });
    var tabBtn = function (id, label, n) {
      var on = tab === id;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="df-ex-tab' + (on ? ' on' : '') + '" onclick="__dfExShare.tab(\'' + id + '\')">' + label + ' <span>' + n + '</span></button>';
    };
    var bar = '<div class="df-ex-tabrow"><div class="df-ex-tabs" role="tablist" aria-label="มุมมอง">' + tabBtn('mine', 'มีชื่อฉัน', mine.length) + tabBtn('all', 'กิจกรรมของทีม', allSorted.length) + '</div>' +
      (tab === 'all' ? '<label class="df-ex-check"><input type="checkbox"' + (useFilter ? ' checked' : '') + ' onchange="__dfExShare.filter(this.checked)">แสดงเฉพาะที่ยังเข้าร่วมได้</label>' : '') + '</div>';
    var list = tab === 'mine' ? mine : (useFilter ? canJoin : allSorted);
    var body;
    if (!list.length) {
      body = tab === 'mine'
        ? '<section class="df-card df-ex-blank"><h2>ยังไม่มีกิจกรรมที่มีชื่อคุณ</h2><p>ดูกิจกรรมของทีมแล้วกด "ร่วมด้วย" หรือเปิดกิจกรรมใหม่ชวนเพื่อน</p><button type="button" class="df-ex-ghost" onclick="__dfExShare.tab(\'all\')">ดูกิจกรรมของทีม (' + allSorted.length + ')</button></section>'
        : '<section class="df-card df-ex-blank"><h2>' + (useFilter ? 'ไม่มีกิจกรรมที่เข้าร่วมได้ในขณะนี้' : 'ยังไม่มีกิจกรรมกลุ่มในรอบนี้') + '</h2><p>' + (useFilter ? 'โควต้าเต็มหรือไม่มีคำขอใหม่ · เปิดกิจกรรมใหม่ชวนเพื่อนได้เลย' : 'เปิดกิจกรรมใหม่ชวนเพื่อนได้เลย') + '</p></section>';
    } else {
      var label = tab === 'mine' ? 'ที่มีชื่อฉัน' : useFilter ? 'ที่เปิดรับ' : 'ทั้งหมดในทีม';
      body = '<div class="df-ex-mut df-ex-count">พบ ' + list.length + ' กิจกรรม' + label + '</div><div class="df-ex-sgrid">' + list.map(shareCard).join('') + '</div>';
    }
    paint(view, '<div class="df-ex df-ex-share">' + head + bar + body + '</div>');
  }
  function shareCard(e) {
    var et = getExType(e), locked = e.status !== 'pending';
    var count = 1 + (e.members || []).length;
    var isSub = e.email === cu.email;
    var inMem = (e.members || []).some(function (m) { return m.type === 'sys' && m.email === cu.email; });
    var involved = isSub || inMem;
    var canAct = !locked || (cu.role === 'pm' && e.status === 'approved'); // same gate as legacy renderExShare
    var people = [{ email: e.email, name: e.name, type: 'sys', lead: true }].concat(e.members || []);
    var slots = people.map(function (m) {
      var n = m.type === 'out' ? m.name : nickOf(m.email, m.name);
      var isMe = m.type === 'sys' && m.email === cu.email;
      return '<span class="df-ex-slot' + (isMe ? ' me' : '') + (m.type === 'out' ? ' out' : '') + '" title="' + esc(n + (m.lead ? ' · ผู้เปิดกิจกรรม' : m.type === 'out' ? ' · นอกระบบ' : '')) + '">' + esc(first(n)) + '</span>';
    });
    for (var i = people.length; i < 3; i++) slots.push('<span class="df-ex-slot empty" aria-hidden="true">+</span>');
    var names = people.map(function (m) { return m.type === 'out' ? m.name + ' (นอก)' : nickOf(m.email, m.name); }).join(', ');
    var badge = e.status === 'approved' ? ['อนุมัติแล้ว · ล็อก', 'lock'] : e.status === 'rejected' ? ['ไม่อนุมัติ', 'no'] :
      count < 3 ? ['ขาดอีก ' + (3 - count) + ' คน', 'open'] : ['ครบแล้ว · รออนุมัติ', 'full'];
    var btn;
    if (canAct && !involved) btn = '<button type="button" class="df-ex-join" onclick="joinExGroup(' + q(e.id) + ')">ร่วมด้วย</button>';
    else if (canAct && involved && !isSub) btn = '<button type="button" class="df-ex-leave" onclick="leaveExGroup(' + q(e.id) + ')">ถอนตัว</button>';
    else if (canAct && isSub) btn = '<span class="df-ex-off">คุณเป็นผู้เปิดกิจกรรม</span>';
    else btn = '<span class="df-ex-off">' + (e.status === 'approved' ? 'ล็อกแล้ว' : 'ไม่อนุมัติ') + '</span>';
    return '<article class="df-ex-scard"><div class="df-ex-shead"><div class="df-ex-stext"><span class="df-ex-mut df-ex-sm">' + TNAME[et] + ' · ' + money(getExerciseReward(e)) + '</span>' +
      '<h2>' + esc(e.activity || 'กิจกรรม') + '</h2><span class="df-ex-mut">' + dsWd(e.date) + ' ' + (pd(e.date).getFullYear() + 543) + ' · W' + getWkNum(e.date) + '</span></div>' +
      '<span class="df-ex-sbadge ' + badge[1] + '">' + badge[0] + '</span></div>' +
      '<div class="df-ex-slots">' + slots.join('') + '<span class="df-ex-mut">' + (count < 3 ? count + ' / 3 คน' : count + ' คน') + '</span></div>' +
      '<div class="df-ex-snames">' + esc(names) + '</div>' +
      (e.note ? '<div class="df-ex-snote">' + esc(e.note) + '</div>' : '') +
      btn + '<button type="button" class="df-ex-link center" onclick="viewExDetail(' + q(e.id) + ')">ดูรายละเอียด ›</button></article>';
  }

  /* ======================= X4 · Leaderboard ======================= */
  var _lbDept = 'all';
  window.__dfExLB = {
    dept: function (d) { _lbDept = d; D.renderPage('leaderboard'); },
    sort: function (f) { setLBSort(f); }
  };
  function lbVisible(email) {
    if (cu && cu.email.toLowerCase() !== HIDDEN_ACCOUNT && String(email).toLowerCase() === HIDDEN_ACCOUNT) return false;
    var u = getUsers().find(function (x) { return x.email === email; });
    return !!(u && u.active !== false);
  }
  function renderLB(view) {
    var mk = g('_lbMonth') || monthKey(today());
    var a = getExs().filter(function (e) { return e.status !== 'rejected' && monthKey(e.date) === mk; });
    var sm = {}, gxm = {}, gem = {};
    var add = function (t, email, e) { if (!t[email]) t[email] = { count: 0, reward: 0 }; t[email].count++; t[email].reward += getExerciseReward(e); };
    a.forEach(function (e) {
      var et = getExType(e);
      if (et === 'solo') add(sm, e.email, e);
      else [{ email: e.email }].concat((e.members || []).filter(function (m) { return m.type === 'sys'; })).forEach(function (p) {
        if (et === 'group_ex') add(gxm, p.email, e); else if (et === 'group_eat') add(gem, p.email, e);
      });
    });
    var rate = toLocalDateString(cycleOf(mk).end); // reward rate shown for this cycle
    var board = function (icon, title, type, data) {
      var rows = Object.keys(data).filter(lbVisible).map(function (k) { return [k, data[k]]; }).sort(function (x, y) { return y[1].count - x[1].count; });
      var body = rows.length ? '<div class="df-ex-lbrows">' + rows.map(function (r, i) {
        var u = uByEmail(r[0]) || {}, n = u.nickname || u.name || r[0];
        return '<div class="df-ex-lbrow' + (r[0] === cu.email ? ' me' : '') + '"><span class="df-ex-rank r' + (i < 3 ? i + 1 : 0) + '">' + (i + 1) + '</span>' + av(n, r[0], 36) +
          '<div class="df-ex-lbname"><b>' + esc(n) + '</b><small>' + esc(u.dept || '—') + ' · ' + r[1].count + ' ครั้ง</small></div><span class="df-ex-lbmoney">' + money(r[1].reward) + '</span></div>';
      }).join('') + '</div>' : '<div class="df-ex-lbempty">ยังไม่มีข้อมูลในเดือนนี้</div>';
      return '<section class="df-ex-lbcard"><div class="df-ex-lbhead"><h2>' + tile(icon, 36) + title + '</h2><span class="df-ex-mut df-ex-sm">' + money(getExerciseReward(type, rate)) + '/ครั้ง</span></div>' + body + '</section>';
    };
    // per-person table — same user set / stats / sort as legacy updateLB
    var us = getUsers().filter(function (u) { return u.active !== false; });
    if (cu && cu.email.toLowerCase() !== HIDDEN_ACCOUNT) us = us.filter(function (u) { return u.email.toLowerCase() !== HIDDEN_ACCOUNT; });
    us = us.slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'th'); });
    var stats = us.map(function (u) {
      var s = { email: u.email, name: u.name, nick: u.nickname || String(u.name).split(' ')[0], dept: u.dept || '', locationType: u.locationType || 'bkk', sC: 0, sR: 0, gexC: 0, gexR: 0, geC: 0, geR: 0 };
      a.filter(function (e) { return isUserInvolved(e, u.email); }).forEach(function (e) {
        var et = getExType(e), r = getExerciseReward(e);
        if (et === 'solo') { s.sC++; s.sR += r; } else if (et === 'group_ex') { s.gexC++; s.gexR += r; } else if (et === 'group_eat') { s.geC++; s.geR += r; }
      });
      s.groupC = s.gexC + s.geC; s.total = s.sR + s.gexR + s.geR; return s;
    });
    var sf = g('_lbSortField') || 'name', sd = g('_lbSortDir') || 1;
    stats.sort(function (x, y) { var A = x[sf], B = y[sf]; if (typeof A === 'string') return sd * A.localeCompare(B, 'th'); return sd * (A - B); });
    var depts = []; us.forEach(function (u) { if (u.dept && depts.indexOf(u.dept) < 0) depts.push(u.dept); });
    if (_lbDept !== 'all' && depts.indexOf(_lbDept) < 0) _lbDept = 'all';
    var shown = stats.filter(function (s) { return _lbDept === 'all' || s.dept === _lbDept; });
    var chips = [['all', 'ทั้งหมด']].concat(depts.map(function (d) { return [d, d]; })).map(function (d) {
      return '<button type="button" role="tab" aria-selected="' + (_lbDept === d[0]) + '" class="df-ex-dchip' + (_lbDept === d[0] ? ' on' : '') + '" onclick="__dfExLB.dept(' + q(d[0]) + ')">' + esc(d[1]) + '</button>';
    }).join('');
    var th = function (label, f, right) {
      var on = sf === f || (f === 'nick' && sf === 'name');
      return '<th scope="col" class="' + (right ? 'r' : '') + '" aria-sort="' + (sf === f ? (sd === 1 ? 'ascending' : 'descending') : 'none') + '"><button type="button" onclick="__dfExLB.sort(\'' + f + '\')">' + label +
        '<span class="df-ex-sort' + (sf === f ? ' on' : '') + '">' + (sf === f ? (sd === 1 ? '▲' : '▼') : '↕') + '</span></button></th>';
    };
    var cell = function (c, r) { return c ? c + ' · ' + money(r) : '—'; };
    var table = '<div class="df-ex-tablewrap"><table class="df-ex-table"><thead><tr>' + th('ชื่อ', 'nick') + th('เดี่ยว', 'sC', 1) + th('กลุ่มออก', 'gexC', 1) + th('กลุ่มกิน', 'geC', 1) + th('รวม', 'total', 1) + '</tr></thead><tbody>' +
      shown.map(function (s) {
        return '<tr' + (s.email === cu.email ? ' class="me"' : '') + '><td><span class="df-ex-who">' + av(s.nick, s.email, 32) + '<span><b>' + esc(s.nick) + '</b><small>' + esc(s.dept || '—') + ' · ' + (s.locationType === 'bkk' ? 'กทม.' : 'ตจว.') + '</small></span></span></td>' +
          '<td class="r">' + cell(s.sC, s.sR) + '</td><td class="r">' + cell(s.gexC, s.gexR) + '</td><td class="r">' + cell(s.geC, s.geR) + '</td><td class="r b">' + money(s.total) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var ls = $('lb-month-select');
    var mOpts = ls ? Array.prototype.slice.call(ls.options).map(function (o) { return { v: o.value, l: monthName(o.value) }; }) : [{ v: mk, l: monthName(mk) }];
    var head = D.header({ eyebrow: 'รอบ ' + cycleLong(mk) + ' · ' + (_lbDept === 'all' ? 'ทุกแผนก' : esc(_lbDept)), title: 'Leaderboard',
      actions: '<label class="df-ex-lbl">เดือน' + selectHtml(mOpts, mk, 'aria-label="เลือกเดือน" onchange="setLBMonth(this.value)"') + '</label>' });
    paint(view, '<div class="df-ex df-ex-lb">' + head + '<div class="df-ex-lbgrid">' + board('ic-solo', 'เดี่ยว', 'solo', sm) + board('ic-run', 'กลุ่มออกกำลังกาย', 'group_ex', gxm) + board('ic-eat', 'กลุ่มกินข้าว', 'group_eat', gem) + '</div>' +
      '<section class="df-ex-lbtable"><div class="df-ex-lbthead"><h2>สรุปเงินรางวัลรายบุคคล</h2><div class="df-ex-dchips" role="tablist" aria-label="แผนก">' + chips + '</div></div>' + table +
      '<span class="df-ex-lbfoot">แสดง ' + shown.length + ' จาก ' + stats.length + ' คน · ตัวเลข = ครั้ง · ยอดเงิน · กดหัวคอลัมน์เพื่อเรียง</span></section></div>');
  }

  /* ======================= อนุมัติออกกำลังกาย (exercise-review, PM) ======================= */
  window.__dfExR = {
    tab: function (t) { setExReviewTab(t); },
    month: function (mk) { setExReviewMonth(mk); },
    search: function (v) { setExReviewSearch(v); },
    dept: function (d) { setExReviewDeptTab(d); }
  };
  function renderReview(view) {
    if (cu.role !== 'pm') { // same gate as legacy renderExR
      paint(view, '<div class="df-ex">' + D.header({ eyebrow: 'สำหรับ PM', title: 'อนุมัติออกกำลังกาย' }) + '<section class="df-card df-ex-blank"><h2>เฉพาะ PM เท่านั้น</h2></section></div>');
      return;
    }
    var active = new Set(getUsers().filter(function (u) { return u.active !== false; }).map(function (u) { return u.email; }));
    var all = getExs().filter(function (e) { return active.has(e.email); });
    var t = today(), now = new Date(), opts = [];
    for (var i = -6; i <= 1; i++) { var k = monthKey(new Date(now.getFullYear(), now.getMonth() + i, 20)); if (opts.indexOf(k) < 0) opts.push(k); }
    var mk = g('_exReviewMonth'); if (!mk || opts.indexOf(mk) < 0) mk = monthKey(t);
    var search = g('_exReviewSearch') || '', tab = g('_exReviewTab') || 'pending', deptTab = g('_exReviewDeptTab') || 'ทั้งหมด';
    var raw = search.trimStart(), allMode = /^all\s/i.test(raw), qq = allMode ? raw.slice(4).toLowerCase().trim() : raw.toLowerCase();
    var pool = allMode ? all : all.filter(function (e) { return monthKey(e.date) === mk; });
    var nickMap = {}; getUsers().forEach(function (u) { nickMap[u.email] = (u.nickname || '').toLowerCase(); });
    var filtered = pool.filter(function (e) {
      if (!qq) return true;
      var n = nickMap[e.email] || '';
      if ((e.name || '').toLowerCase().indexOf(qq) >= 0 || n.indexOf(qq) >= 0 || (e.email || '').toLowerCase().indexOf(qq) >= 0 ||
        (e.activity || '').toLowerCase().indexOf(qq) >= 0 || String(e.id || '').toLowerCase().indexOf(qq) >= 0) return true;
      return (e.members || []).some(function (m) { return (m.name || '').toLowerCase().indexOf(qq) >= 0 || (m.email || '').toLowerCase().indexOf(qq) >= 0 || (nickMap[m.email] || '').indexOf(qq) >= 0; });
    });
    var sorted = filtered.slice().sort(function (a, b) { return new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date); });
    var pending = sorted.filter(function (e) { return e.status === 'pending'; });
    var approved = sorted.filter(function (e) { return e.status === 'approved'; });
    var rejected = sorted.filter(function (e) { return e.status === 'rejected'; });
    var totalMoney = approved.reduce(function (s, e) { return s + getExerciseReward(e) * (1 + (e.members || []).length); }, 0);

    var head = D.header({ eyebrow: 'สำหรับ PM', title: 'อนุมัติออกกำลังกาย',
      actions: '<label class="df-ex-lbl">รอบ' + selectHtml(opts.map(function (k) { return { v: k, l: cycleLabel(k) }; }), mk, 'aria-label="เลือกรอบ" onchange="__dfExR.month(this.value)"') + '</label>' });
    var rules = '<div class="df-ex-rules"><span class="df-ex-rules-h">กติกาการอนุมัติ</span><span>กลุ่มต้องมีอย่างน้อย 3 คน</span><span>กลุ่ม 1 ครั้ง/สัปดาห์ · 4 ครั้ง/รอบ</span><span>ตรวจวิดีโอหลักฐานก่อนอนุมัติ</span></div>';
    var tabBtn = function (id, label, n) {
      var on = tab === id;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="df-ex-tab' + (on ? ' on' : '') + '" onclick="__dfExR.tab(\'' + id + '\')">' + label + ' <span>' + n + '</span></button>';
    };
    var tools = '<div class="df-ex-tabrow"><div class="df-ex-tabs" role="tablist" aria-label="สถานะ">' + tabBtn('pending', 'รออนุมัติ', pending.length) + tabBtn('approved', 'อนุมัติแล้ว', approved.length) + '</div>' +
      '<div class="df-ex-rstats"><span>ไม่อนุมัติ <b>' + rejected.length + '</b></span><span>ยอดเงินที่อนุมัติ <b>' + money(totalMoney) + '</b></span></div></div>' +
      '<div class="df-ex-search"><input data-k="exr-search" class="df-ex-input" type="search" placeholder="ค้นหาชื่อ, ชื่อเล่น, อีเมล, กิจกรรม หรือรหัส DS..." aria-label="ค้นหา" value="' + esc(search) + '" oninput="__dfExR.search(this.value)">' +
      '<span class="df-ex-mut df-ex-sm">พิมพ์ <code>all คำค้นหา</code> เพื่อค้นหาจากข้อมูลทุกเดือน' + (allMode ? ' · กำลังค้นหาทุกเดือน' : '') + '</span></div>';

    var listFor = tab === 'pending' ? pending : approved;
    var grp = listFor.filter(function (e) { return isGroupEx(getExType(e)); }), solo = listFor.filter(function (e) { return !isGroupEx(getExType(e)); });
    var deptOf = function (e) { if (e.dept) return e.dept; var u = uByEmail(e.email); return (u && u.dept) ? u.dept : 'ไม่ระบุ'; };
    var body;
    if (!listFor.length) {
      body = '<section class="df-card df-ex-blank"><span class="df-ex-blank-ic" aria-hidden="true">' + icoSvg('<path d="M20 6L9 17l-5-5"></path>', 30) + '</span><h2>' +
        (tab === 'pending' ? 'ไม่มีคำขอรออนุมัติ' : 'ยังไม่มีรายการที่อนุมัติ') + '</h2><p>' + (tab === 'pending' ? 'เมื่อมีคนยื่นเบิก จะแจ้งเตือนคุณทันที และแสดงที่นี่' : 'รายการที่อนุมัติในรอบนี้จะแสดงที่นี่') + '</p></section>';
    } else {
      var section = function (title, items, withDept) {
        if (!items.length) return '<div class="df-ex-rsec"><h2>' + title + ' <span>0</span></h2><div class="df-ex-rnone">— ไม่มีรายการ —</div></div>';
        var dtabs = '', shownItems = items;
        if (withDept) {
          var depts = ['ทั้งหมด']; items.forEach(function (e) { var d = deptOf(e); if (depts.indexOf(d) < 0) depts.push(d); });
          depts.sort(function (a, b) { return a === 'ทั้งหมด' ? -1 : b === 'ทั้งหมด' ? 1 : a === 'ไม่ระบุ' ? 1 : b === 'ไม่ระบุ' ? -1 : a.localeCompare(b, 'th'); });
          var cur = depts.indexOf(deptTab) >= 0 ? deptTab : 'ทั้งหมด';
          shownItems = cur === 'ทั้งหมด' ? items : items.filter(function (e) { return deptOf(e) === cur; });
          dtabs = '<div class="df-ex-dchips">' + depts.map(function (d) {
            var n = d === 'ทั้งหมด' ? items.length : items.filter(function (e) { return deptOf(e) === d; }).length;
            return '<button type="button" class="df-ex-dchip' + (d === cur ? ' on' : '') + '" onclick="__dfExR.dept(' + q(d) + ')">' + esc(d) + ' <span>' + n + '</span></button>';
          }).join('') + '</div>';
        }
        return '<div class="df-ex-rsec"><h2>' + title + ' <span>' + items.length + '</span></h2>' + dtabs + '<div class="df-ex-rlist">' + shownItems.map(function (e) { return reviewCard(e, tab); }).join('') + '</div></div>';
      };
      body = section('แบบกลุ่ม', grp, false) + section('แบบเดี่ยว', solo, true);
    }
    paint(view, '<div class="df-ex df-ex-review">' + head + rules + tools + body + '</div>');
  }
  function reviewCard(e, tab) {
    var et = getExType(e), u = uByEmail(e.email) || {};
    var nick = u.nickname || String(e.name || '').split(' ')[0];
    var people = [{ email: e.email, name: e.name, type: 'sys' }].concat(e.members || []);
    var proof = e.proofLink || (String(e.proofDoc || '').indexOf('http') === 0 ? e.proofDoc : '') || ((e.proofLinks || [])[0] || {}).url || '';
    var nLinks = (e.proofLink || (String(e.proofDoc || '').indexOf('http') === 0) ? 1 : 0) + (e.proofLinks || []).length;
    var memberChips = isGroupEx(et) ? '<div class="df-ex-rmembers">' + people.map(function (m) {
      var out = m.type === 'out', n = out ? m.name : nickOf(m.email, m.name);
      return '<span class="df-ex-rmem' + (out ? ' out' : '') + '">' + esc(n) + (out ? ' <small>(นอก' + (m.dept ? ' · ' + esc(m.dept) : '') + ')</small>' : '') + '</span>';
    }).join('') + '</div>' : '';
    var acts = tab === 'pending'
      ? '<button type="button" class="df-ex-approve" onclick="apprEx(' + q(e.id) + ')">อนุมัติ</button>' +
        '<button type="button" class="df-ex-reject" onclick="rejEx(' + q(e.id) + ')">ปฏิเสธ (ต้องใส่เหตุผล)</button>'
      : '<button type="button" class="df-ex-ghost" onclick="revertExToPending(' + q(e.id) + ')">ย้อนกลับเป็นรออนุมัติ</button>';
    return '<article class="df-ex-rcard"><div class="df-ex-rleft">' +
      '<div class="df-ex-rwho">' + av(nick, e.email, 48) + '<div class="df-ex-rname"><b>' + esc(nick) + (u.dept || e.dept ? ' · ' + esc(u.dept || e.dept) : '') + '</b><small>ยื่นเมื่อ ' + (e.submittedAt ? dsShort(toLocalDateString(new Date(e.submittedAt))) : '—') + ' · ' + esc(e.id) + '</small></div>' + tchip(et) + '</div>' +
      '<div class="df-ex-rboxes"><div><small>วันที่ทำกิจกรรม</small><b>' + dsFull(e.date) + ' · W' + getWkNum(e.date) + '</b></div><div><small>เงินรางวัล</small><b>' + money(getExerciseReward(e)) + (isGroupEx(et) ? ' / คน' : '') + '</b></div>' +
      '<div><small>' + (isGroupEx(et) ? 'สมาชิก' : 'ผู้ยื่น') + '</small><b>' + (isGroupEx(et) ? people.length + ' คน' : esc(nick)) + '</b></div></div>' +
      '<div class="df-ex-ract"><span class="df-ex-mut">กิจกรรม:</span> ' + esc(e.activity || '—') + (e.note ? ' <span class="df-ex-mut">· ' + esc(e.note) + '</span>' : '') + '</div>' + memberChips +
      '<div class="df-ex-rproof"><span class="df-ex-dot' + (proof ? '' : ' none') + '"></span>' + (proof ? 'หลักฐาน ' + nLinks + ' ลิงก์ · <a href="' + esc(proof) + '" target="_blank" rel="noopener">เปิดวิดีโอหลักฐาน ↗</a>' : 'ยังไม่มีลิงก์หลักฐาน') + '</div>' +
      (e.rejectReason ? '<div class="df-ex-rej">เหตุผลเดิม: ' + esc(e.rejectReason) + '</div>' : '') + '</div>' +
      '<div class="df-ex-rright">' + acts + '<button type="button" class="df-ex-link center" onclick="viewExDetail(' + q(e.id) + ')">ดูรายละเอียดและหลักฐาน ›</button></div></article>';
  }

  /* ======================= install ======================= */
  function install() {
    D.registerPage('exercise-log', { render: renderLog, refreshOn: [] });
    D.registerPage('ex-new', { create: true, render: renderNew });
    D.registerPage('exercise-share', { render: renderShare, refreshOn: [] });
    D.registerPage('leaderboard', { render: renderLB, refreshOn: [] });
    D.registerPage('exercise-review', { render: renderReview, refreshOn: [] });
    // coalesced re-render after the legacy renderers refresh their (hidden) DOM
    ['updateQuota', 'renderExHistory'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-log'); schedule('ex-new'); }); });
    ['renderExMembers'].forEach(function (fn) { D.hook(fn, function () { schedule('ex-new'); }); });
    ['renderExShare', 'setExShareTab', 'applyExShareAllFilter'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-share'); }); });
    ['updateLB'].forEach(function (fn) { D.hook(fn, function () { schedule('leaderboard'); }); });
    ['renderExR'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-review'); }); });
    // the claim form is a full page now: legacy openers redirect to it
    D.hook('openExModal', function () { afterLegacyOpen('new'); });
    D.hook('editEx', function () { afterLegacyOpen('edit'); });
    D.hook('showPage', function (id) {
      if (id !== 'ex-new') { _armed = null; releaseFormModal(); }
      else { var nv = document.querySelector('[onclick="showPage(\'exercise-log\')"]'); if (nv) nv.classList.add('active'); }
    });
    // after a successful legacy submit, go back to "ข้อมูลของฉัน"
    var orig = window.doSubmitEx;
    if (typeof orig === 'function' && !orig.__dfex) {
      var wrapped = function () {
        var fromPage = isActive('ex-new');
        var p = orig.apply(this, arguments);
        if (fromPage) Promise.resolve(p).then(function () { if (isActive('ex-new')) showPage('exercise-log'); }, function () {});
        return p;
      };
      wrapped.__dfex = true; window.doSubmitEx = wrapped;
    }
    // legacy detail modal's approve button calls appEx(), which does not exist (only apprEx). Alias it.
    if (typeof window.appEx !== 'function' && typeof window.apprEx === 'function') window.appEx = function (id) { return window.apprEx(id); };
  }
  install();
})();

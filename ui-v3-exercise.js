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
  var _inlineOpen = false;      // set while the share page initialises the legacy form for its side form
  function pageOfMode(m) { return m === 'share' ? 'exercise-share' : 'ex-new'; }
  function afterLegacyOpen(mode) {
    var m = formModal();
    if (!m || !m.classList.contains('open')) return; // legacy refused (e.g. no permission) — nothing to do
    hideFormModal(); // keep the legacy form "open" (so legacy quota checks use the chosen date) but invisible
    _ext = { name: '', dept: '' };
    if (_inlineOpen && mode === 'new') { _armed = 'share'; return; }
    _armed = mode;
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

  /* date options: days of open submission cycles up to today (legacy calendar rules: selectExerciseCalendarDate) */
  function dateOptions(date, editing) {
    var t = today();
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
    return { opts: dOpts, dupFor: dupFor, cyc: cyc,
      hint: 'เลือกได้เฉพาะวันในรอบนี้ (' + dShort(cyc.start) + ' – ' + dShort(cyc.end) + ') และไม่เกินวันนี้' + (prevOpen ? ' · วันนี้ยังยื่นย้อนหลังรอบก่อนได้' : '') };
  }
  /* in-system people for a group, read from the legacy #ex-sys-member select (legacy availability rules) */
  function legacyPeople() {
    updateExSysMemberSelect();
    var sel = $('ex-sys-member');
    return sel ? Array.prototype.slice.call(sel.options).filter(function (o) { return o.value; }).map(function (o) {
      var u = uByEmail(o.value) || {};
      var reason = (o.textContent.match(/\(([^()]*เต็ม[^()]*)\)\s*$/) || [])[1] || '';
      var why = reason.indexOf('สป.') >= 0 ? 'ทำกลุ่มแล้วสัปดาห์นี้' : reason ? 'ทำกลุ่มครบแล้วเดือนนี้' : (o.disabled ? 'เพิ่มไม่ได้' : '');
      return { email: o.value, nick: u.nickname || String(u.name || o.value).split(' ')[0], dept: u.dept || '', off: o.disabled, why: why };
    }) : [];
  }

  function renderNew(view) {
    if (!_armed || _armed === 'share') { _armed = null; openExModal(); return; } // initialises the legacy form exactly like the old "ยื่นเบิกใหม่" button
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

    var DO = dateOptions(date, editing), dOpts = DO.opts, dateHint = DO.hint, dupFor = DO.dupFor;

    // group members (from the legacy select, so availability rules are the legacy ones)
    var groupHtml = '';
    if (isGrp) {
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
      var people = legacyPeople().map(function (p) {
        return '<button type="button" class="df-ex-person"' + (p.off ? ' disabled title="' + esc(p.why) + '"' : ' title="เพิ่ม ' + esc(p.nick) + '"') +
          ' onclick="__dfExForm.addSys(' + q(p.email) + ')">' + av(p.nick, p.email, 28) + '<span class="df-ex-ptxt"><span>' + esc(p.nick) + '</span><small>' + esc(p.off ? p.why : p.dept) + '</small></span></button>';
      }).join('');
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

  /* ======================= X3B · แชร์กิจกรรมกลุ่ม (exercise-share) — list + side form =======================
     Lists come from legacy renderExShare (window._exShareMine / _exShareAllSorted / _exShareCanJoin).
     Join/leave: legacy joinExGroup / leaveExGroup with the legacy visibility gates.
     Side form: drives the hidden legacy #modal-ex-form exactly like the ex-new page, then submitEx(). */
  var SH = { wk: 'all' };
  var IDEAS = { group_ex: ['วิ่ง 5 กม.', 'ตีแบด 1 ชม.', 'ฟุตซอล', 'โยคะ 45 นาที'], group_eat: ['สลัดมื้อกลางวัน', 'ข้าวกล่องคลีน', 'ผลไม้บ่ายสาม'] };
  function shareView() { var tab = window._exShareTab || 'mine', c = $('ex-share-filter-joinable'); return tab === 'mine' ? 'mine' : (c && !c.checked ? 'all' : 'open'); }
  function rerenderShare() { D.renderPage('exercise-share'); }
  window.__dfExShare = {
    view: function (v) {               // legacy UI state: tab 'mine' | 'all' + "เข้าร่วมได้" checkbox
      var c = $('ex-share-filter-joinable');
      if (v === 'mine') setExShareTab('mine');
      else { if (c) c.checked = v === 'open'; setExShareTab('all'); applyExShareAllFilter(); }
      schedule('exercise-share');
    },
    wk: function (w) { SH.wk = w; rerenderShare(); },
    month: function (mk) { var s = $('ex-share-month-select'); if (s) s.value = mk; SH.wk = 'all'; onExShareMonthChange(); },
    type: function (t) { var s = $('ex-type'); if (!s || s.value === t) return; s.value = t; updateExType(); rerenderShare(); },
    idea: function (t) { var el = $('ex-act'); if (el) el.value = t; clearExErr(); rerenderShare(); },
    text: function (id, v) { var el = $(id); if (el) el.value = v; if (id === 'ex-act') clearExErr(); },
    date: function (ds) { selectExerciseCalendarDate(ds); rerenderShare(); },
    friend: function (email) {
      var m = (g('exMembers') || []).find(function (x) { return x.type === 'sys' && x.email === email; });
      if (m) removeExMember(m.id);
      else { var s = $('ex-sys-member'); if (!s) return; s.value = email; if (s.value !== email) return; addExSysMember(); }
      rerenderShare();
    },
    submit: function () { submitEx(); rerenderShare(); },
    full: function () { _armed = 'new'; showPage('ex-new'); }   // continue in the full form (outside people, note) with the same legacy form state
  };
  function armShareForm() {
    if (_armed === 'share') return true;
    if (_armed) return false;
    _inlineOpen = true;
    try { openExModal(); } finally { _inlineOpen = false; }
    if (_armed !== 'share') return false;
    var s = $('ex-type'); if (s) { s.value = 'group_ex'; updateExType(); }
    return true;
  }

  function renderShare(view) {
    if (!SH.init) { SH.init = true; window.__dfExShare.view('open'); } // board default tab: เปิดรับอยู่
    var v = shareView();
    var mine = window._exShareMine || [], allSorted = window._exShareAllSorted || [], canJoin = window._exShareCanJoin || [];
    var ms = $('ex-share-month-select');
    var mOpts = ms ? Array.prototype.slice.call(ms.options).map(function (o) { return { v: o.value, l: cycleLong(o.value) }; }) : [];
    var curMk = (ms && ms.value) || monthKey(today()), isCur = curMk === monthKey(today());
    var head = D.header({ eyebrow: 'ชวนเพื่อนออกกำลังกาย · กลุ่มละอย่างน้อย 3 คน · PM ตรวจและอนุมัติ', title: 'แชร์กิจกรรมกลุ่ม',
      actions: mOpts.length ? '<label class="df-ex-lbl">รอบ' + selectHtml(mOpts, curMk, 'aria-label="เลือกรอบ" onchange="__dfExShare.month(this.value)"') + '</label>' : '' });

    // summary strip — same quota maths as legacy updateQuota, for the selected cycle
    var Q = quotaFor(isCur ? today() : curMk + '-20');
    var segs = [0, 1, 2, 3].map(function (k) { return '<span class="' + (k < Q.moGrp ? 'on' : '') + '"></span>'; }).join('');
    var wkTxt = !isCur ? '<strong class="df-ex-ssmut">รอบที่ผ่านมา</strong>' : Q.wkGrp >= 1 ? '<strong class="ok">มีกลุ่มแล้ว ✓</strong>' : Q.moGrp >= 4 ? '<strong class="ok">ครบ 4 ครั้งในรอบนี้แล้ว</strong>' : '<strong>ยังว่าง · ร่วมได้ 1 กลุ่ม</strong>';
    var strip = '<section class="df-ex-sstrip"><div class="df-ex-ssq">' + tile('ic-run', 48) + '<div><span>กลุ่มของฉันรอบนี้</span><div class="df-ex-ssbar"><div role="img" aria-label="ใช้ไป ' + Q.moGrp + ' จาก 4 ครั้ง">' + segs + '</div><strong>' + Q.moGrp + '/4 ครั้ง</strong></div></div></div>' +
      '<div class="df-ex-ssk"><span>' + (isCur ? 'สัปดาห์นี้ (W' + Q.wkNum + ' · ' + rangeTxt(Q.ws, Q.we) + ')' : 'สัปดาห์') + '</span>' + wkTxt + '</div>' +
      '<div class="df-ex-ssk"><span>เงินที่จะได้ถ้าอนุมัติ</span><strong class="plain">' + money(Q.grpMoney) + '</strong></div></section>';

    // list (legacy lists) + week filter
    var base = v === 'mine' ? mine : v === 'open' ? canJoin : allSorted;
    var c = cycleOf(curMk), nW = getWkNum(toLocalDateString(isCur ? new Date(Math.min(Date.now(), c.end.getTime())) : c.end));
    if (SH.wk !== 'all' && SH.wk > nW) SH.wk = 'all';
    var list = base.filter(function (e) { return SH.wk === 'all' || getWkNum(e.date) === SH.wk; });
    var tabBtn = function (id, label, n) { var on = v === id; return '<button type="button" role="tab" aria-selected="' + on + '" class="df-ex-xtab' + (on ? ' on dark' : '') + '" onclick="__dfExShare.view(\'' + id + '\')">' + label + ' <span>' + n + '</span></button>'; };
    var wks = [['all', 'ทุกสัปดาห์']]; for (var w = nW; w >= 1; w--) wks.push([w, 'W' + w]);
    var tools = '<div class="df-ex-stools"><div class="df-ex-xtabs df-ex-stabs" role="tablist" aria-label="มุมมอง">' + tabBtn('open', 'เปิดรับอยู่', canJoin.length) + tabBtn('mine', 'มีชื่อฉัน', mine.length) + tabBtn('all', 'ทั้งหมด', allSorted.length) + '</div>' +
      '<div class="df-ex-swks" role="group" aria-label="สัปดาห์">' + wks.map(function (x) { var on = SH.wk === x[0]; return '<button type="button" aria-pressed="' + on + '" class="df-ex-xflt' + (on ? ' on' : '') + '" onclick="__dfExShare.wk(' + (x[0] === 'all' ? "'all'" : x[0]) + ')">' + x[1] + '</button>'; }).join('') + '</div></div>';
    var cards = list.length ? list.map(shareCard).join('') :
      '<div class="df-ex-sempty"><strong>' + (v === 'mine' ? 'ยังไม่มีกิจกรรมที่มีชื่อคุณ' : v === 'open' ? 'ไม่มีกิจกรรมที่เข้าร่วมได้ในขณะนี้' : 'ยังไม่มีกิจกรรมกลุ่มในรอบนี้') + '</strong><span>' +
      (v === 'open' ? 'โควต้าเต็มหรือไม่มีคำขอใหม่ · เปิดกิจกรรมใหม่ทางขวาแล้วใส่ชื่อเพื่อนอีก 2 คน' : 'เปิดกิจกรรมใหม่ทางขวา แล้วใส่ชื่อเพื่อนอีก 2 คน') + '</span></div>';

    paint(view, '<div class="df-ex df-ex-share2">' + head + strip + '<div class="df-ex-sgrid2"><section class="df-ex-slist" aria-label="กิจกรรม">' + tools + cards + '</section>' +
      '<aside class="df-ex-sside">' + shareForm() + shareHow() + '</aside></div></div>');
  }

  function shareCard(e) {
    var et = getExType(e), locked = e.status !== 'pending';
    var count = 1 + (e.members || []).length;
    var isSub = e.email === cu.email;
    var inMem = (e.members || []).some(function (m) { return m.type === 'sys' && m.email === cu.email; });
    var involved = isSub || inMem;
    var canAct = !locked || (cu.role === 'pm' && e.status === 'approved'); // same gates as legacy renderExShare
    var d = pd(e.date), su = uByEmail(e.email) || {};
    var people = [{ email: e.email, name: e.name, type: 'sys', lead: true }].concat(e.members || []);
    var seats = people.map(function (m, k) {
      var n = m.type === 'out' ? m.name : nickOf(m.email, m.name), isMe = m.type === 'sys' && m.email === cu.email;
      var md = m.type === 'out' ? '' : ((uByEmail(m.email) || {}).dept || '');
      var tip = n + (m.lead ? ' · ผู้เปิด' : m.type === 'out' ? ' · นอกระบบ' : md && su.dept && md !== su.dept ? ' · นอกแผนก' : '');
      return av(n, m.email || m.name, 38, 'df-ex-seat' + (isMe ? ' me' : '') + (m.type === 'out' ? ' out' : '')).replace('aria-hidden="true"', 'title="' + esc(tip) + '"');
    });
    for (var i = people.length; i < 3; i++) seats.push('<span class="df-ex-av df-ex-seat empty" aria-hidden="true" style="width:38px;height:38px;font-size:15px">+</span>');
    var names = people.map(function (m) { return m.type === 'sys' && m.email === cu.email ? 'คุณ' : m.type === 'out' ? m.name : nickOf(m.email, m.name); });
    var badge = e.status === 'approved' ? ['อนุมัติแล้ว · ล็อก', 'done'] : e.status === 'rejected' ? ['ไม่อนุมัติ', 'no'] : count < 3 ? ['ขาดอีก ' + (3 - count) + ' คน', 'open'] : ['ครบแล้ว · รออนุมัติ', 'full'];
    // join hint uses the same checks as legacy canJoin / joinExGroup
    var hint = '', dis = false;
    if (canAct && !involved) {
      var grpAll = getExs().filter(function (x) { return isGroupEx(getExType(x)) && x.status !== 'rejected' && isUserInvolved(x, cu.email); });
      if (grpAll.filter(function (x) { return wkKey(x.date) === wkKey(e.date); }).length >= 1) { dis = true; hint = 'สัปดาห์นั้นคุณมีกลุ่มแล้ว'; }
      else if (grpAll.filter(function (x) { return monthKey(x.date) === monthKey(e.date); }).length >= 4) { dis = true; hint = 'ครบ 4 ครั้งในรอบนี้แล้ว'; }
    }
    var act;
    if (canAct && !involved) act = '<button type="button" class="df-ex-sbtn primary"' + (dis ? ' disabled' : '') + ' onclick="joinExGroup(' + q(e.id) + ')">ร่วมด้วย</button>';
    else if (canAct && involved && !isSub) act = '<button type="button" class="df-ex-sbtn" onclick="leaveExGroup(' + q(e.id) + ')">ถอนตัว</button>';
    else if (canAct && isSub) act = '<button type="button" class="df-ex-sbtn" onclick="viewExDetail(' + q(e.id) + ')">แนบหลักฐาน / รายละเอียด</button>';
    else act = '<span class="df-ex-soff">' + (e.status === 'approved' ? (involved ? 'คุณได้ ' + money(getExerciseReward(e)) : 'ล็อกแล้ว') : 'ไม่อนุมัติ') + '</span>';
    return '<article class="df-ex-scard2' + (involved ? ' me' : '') + (e.status !== 'pending' ? ' closed' : '') + '">' +
      '<div class="df-ex-sdate"><span>' + WD[d.getDay()] + '</span><b>' + d.getDate() + '</b><span>' + MON[d.getMonth()] + '</span></div>' +
      '<div class="df-ex-smain"><div class="df-ex-stop"><div class="df-ex-stxt"><span class="df-ex-skind">' + tile(TICON[et], 20) + TNAME[et] + ' · ' + money(getExerciseReward(e)) + '/คน · W' + getWkNum(e.date) + '</span>' +
      '<h2>' + esc(e.activity || 'กิจกรรม') + '</h2><span class="df-ex-sby">เปิดโดย ' + (isSub ? 'คุณ' : esc(nickOf(e.email, e.name)) + (su.dept ? ' (' + esc(su.dept) + ')' : '')) + (e.note ? ' · “' + esc(e.note) + '”' : '') + '</span></div>' +
      '<span class="df-ex-spill ' + badge[1] + '">' + badge[0] + '</span></div>' +
      '<div class="df-ex-sbottom"><div class="df-ex-sppl"><div class="df-ex-seats">' + seats.join('') + '</div><span>' + esc(names.join(', ')) + ' · ' + count + (count < 3 ? '/3 คน' : ' คน') + '</span></div>' +
      '<div class="df-ex-sacts">' + (hint ? '<span class="df-ex-shint">' + hint + '</span>' : '') + act +
      (canAct && isSub ? '' : '<button type="button" class="df-ex-link" onclick="viewExDetail(' + q(e.id) + ')">รายละเอียด</button>') + '</div></div></div></article>';
  }

  function shareForm() {
    if (!armShareForm()) return '<section class="df-ex-sform"><h2>เปิดกิจกรรมใหม่</h2><span class="df-ex-mut df-ex-sm">กำลังใช้ฟอร์มยื่นเบิกอยู่ — <a href="#ex-new" onclick="event.preventDefault();showPage(\'ex-new\')">กลับไปที่ฟอร์ม</a></span></section>';
    var type = val('ex-type'); if (!isGroupEx(type)) type = 'group_ex';
    var date = val('ex-date') || today(), DO = dateOptions(date, g('_editingExId'));
    var mem = g('exMembers') || [], count = 1 + mem.length, need = Math.max(0, 3 - count);
    var outs = mem.filter(function (m) { return m.type === 'out'; });
    var types = [['group_ex', 'ออกกำลังกาย', 'ic-run'], ['group_eat', 'กินข้าว', 'ic-eat']].map(function (T) {
      var on = T[0] === type;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="df-ex-stype' + (on ? ' on' : '') + '" onclick="__dfExShare.type(\'' + T[0] + '\')">' + tile(T[2], 32) +
        '<span><b>' + T[1] + '</b><small>' + money(getExerciseReward(T[0], date)) + '/คน</small></span></button>';
    }).join('');
    var ppl = legacyPeople(), chosen = mem.filter(function (m) { return m.type === 'sys'; });
    var friends = chosen.map(function (m) {
      var n = nickOf(m.email, m.name);
      return '<button type="button" aria-pressed="true" class="df-ex-sfr on" onclick="__dfExShare.friend(' + q(m.email) + ')" title="เอาออก">' + av(n, m.email, 22) + esc(n) + ' ×</button>';
    }).concat(ppl.map(function (p) {
      return '<button type="button" aria-pressed="false" class="df-ex-sfr"' + (p.off ? ' disabled title="' + esc(p.why) + '"' : '') + ' onclick="__dfExShare.friend(' + q(p.email) + ')">' + av(p.nick, p.email, 22) + esc(p.nick) + '</button>';
    })).join('') + outs.map(function (m) { return '<span class="df-ex-sfr out">' + esc(m.name) + ' · นอกระบบ</span>'; }).join('');
    var errEl = $('ex-err'), warnEl = $('ex-warn'), btnL = $('btn-submit-ex');
    var err = errEl && errEl.style.display !== 'none' ? errEl.innerHTML : '';
    var warn = warnEl && warnEl.style.display !== 'none' ? warnEl.textContent : '';
    var dup = DO.dupFor(date);
    var blocked = need > 0 || !!(btnL && btnL.disabled);
    var label = need > 0 ? 'เปิดกิจกรรม · ใส่ชื่อเพื่อนอีก ' + need + ' คน' : 'เปิดกิจกรรม · ' + count + ' คน · ' + money(getExerciseReward(type, date)) + '/คน';
    var ideas = (IDEAS[type] || []).map(function (t) { return '<button type="button" class="df-ex-sidea" onclick="__dfExShare.idea(' + q(t) + ')">' + esc(t) + '</button>'; }).join('');
    return '<section class="df-ex-sform" aria-label="เปิดกิจกรรมใหม่"><h2>เปิดกิจกรรมใหม่</h2>' +
      '<div class="df-ex-stypes" role="radiogroup" aria-label="ประเภท">' + types + '</div>' +
      '<label class="df-ex-sf">กิจกรรม<input data-k="sh-act" class="df-ex-input" placeholder="เช่น วิ่งสวนเบญจกิติ 5 กม." value="' + esc(val('ex-act')) + '" oninput="__dfExShare.text(\'ex-act\',this.value)"></label>' +
      '<div class="df-ex-sideas">' + ideas + '</div>' +
      '<label class="df-ex-sf">วันที่ทำกิจกรรม' + selectHtml(DO.opts, date, 'onchange="__dfExShare.date(this.value)"', 'sf') + '</label>' +
      '<span class="df-ex-mut df-ex-sm">' + DO.hint + '</span>' +
      '<div class="df-ex-sf">ชวนเพื่อน (ใส่ชื่อในกลุ่ม · รวมคุณ ' + count + ' คน)<div class="df-ex-sfrs">' + (friends || '<span class="df-ex-mut df-ex-sm">ไม่มีสมาชิกที่เพิ่มได้</span>') + '</div></div>' +
      '<label class="df-ex-sf">ลิงก์วิดีโอหลักฐาน <span class="df-ex-req">* จำเป็น</span><input data-k="sh-link" class="df-ex-input" type="url" placeholder="วางลิงก์ Google Drive หรือ YouTube" value="' + esc(val('ex-link')) + '" oninput="__dfExShare.text(\'ex-link\',this.value)"></label>' +
      (warn ? '<div class="df-ex-alert warn" role="status">' + esc(warn) + '</div>' : '') +
      (dup && !err ? '<div class="df-ex-alert warn" role="status">วันที่นี้คุณมีรายการยื่นแล้ว กรุณาเลือกวันอื่น</div>' : '') +
      (err ? '<div class="df-ex-alert err" role="alert">' + err + '</div>' : '') +
      '<button type="button" class="df-ex-send"' + (blocked ? ' disabled' : '') + ' onclick="__dfExShare.submit()">' + label + '</button>' +
      '<button type="button" class="df-ex-link center" onclick="__dfExShare.full()">ใช้ฟอร์มเต็ม (เพิ่มคนนอกระบบ · หมายเหตุ) ›</button></section>';
  }
  function shareHow() {
    return '<section class="df-ex-show"><strong>ทำงานยังไง</strong>' +
      '<span>1 · ทำกิจกรรมเสร็จแล้วเปิดกิจกรรม ใส่ชื่อเพื่อนอย่างน้อย 2 คน (รวมคุณ 3 คน) และแนบลิงก์วิดีโอ</span>' +
      '<span>2 · เพื่อนที่ยังไม่มีชื่อกด “ร่วมด้วย” ได้ระหว่างรออนุมัติ · ถอนตัวได้ถ้ากลุ่มยังเหลืออย่างน้อย 3 คน</span>' +
      '<span>3 · PM ตรวจวิดีโอแล้วอนุมัติ — อนุมัติแล้วรายการจะล็อก</span>' +
      '<span class="df-ex-mut">กลุ่มได้ 1 ครั้ง/สัปดาห์ · 4 ครั้ง/รอบ ต่อคน · ทุกคนในกลุ่มได้ ' + money(getExerciseReward('group_ex', today())) + ' (ออก) / ' + money(getExerciseReward('group_eat', today())) + ' (กิน)</span></section>';
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

  /* ======================= อนุมัติออกกำลังกาย (exercise-review, PM) — board X5B: list + detail =======================
     Writes only through legacy apprEx / rejEx (+ its own reason dialog) / revertExToPending.
     Rule checks reproduce the legacy quota/validation logic (submitEx, apprEx, getSoloWeeklyLimit, getSoloMonthlyLimit). */
  var R = { tab: 'pending', flt: 'all', sel: null, clip: 0, checked: {}, rejecting: false, reason: '', listIds: [] };
  var QUICK = ['วิดีโอไม่เห็นสมาชิกครบ 3 คน', 'ไม่มีวิดีโอหลักฐาน', 'เกินโควตากลุ่มสัปดาห์นี้', 'วันที่ไม่อยู่ในรอบ'];
  function rr() { D.renderPage('exercise-review'); }
  function nextAfter(id) {
    var ids = R.listIds, i = ids.indexOf(String(id)); if (i < 0) return null;
    var rest = ids.filter(function (x, k) { return k !== i; });
    return rest.length ? (rest[i] || rest[rest.length - 1]) : null;
  }
  function statusOf(id) { var e = getExs().find(function (x) { return String(x.id) === String(id); }); return e ? e.status : null; }
  window.__dfExR = {
    month: function (mk) { R.sel = null; R.checked = {}; setExReviewMonth(mk); },
    search: function (v) { setExReviewSearch(v); },
    tab: function (t) { R.tab = t; R.sel = null; R.checked = {}; R.rejecting = false; R.reason = ''; R.flt = 'all'; rr(); },
    flt: function (f) { R.flt = f; rr(); },
    pick: function (id) { if (R.sel !== id) { R.sel = id; R.clip = 0; R.rejecting = false; R.reason = ''; } rr(); },
    clip: function (k) { R.clip = k; rr(); },
    check: function (id, on) { if (on) R.checked[id] = true; else delete R.checked[id]; rr(); },
    checkAll: function (on) { R.checked = {}; if (on) (R.readyIds || []).forEach(function (id) { R.checked[id] = true; }); rr(); },
    approve: function (id) {
      var next = nextAfter(id);
      apprEx(id);                                   // exactly what the legacy อนุมัติ button calls
      if (statusOf(id) === 'approved') R.sel = next;
      rr();
    },
    bulk: function () {                             // N sequential legacy approvals, same as N single clicks
      var ids = R.listIds.filter(function (id) { return R.checked[id] && (R.readyIds || []).indexOf(id) >= 0; });
      ids.forEach(function (id) { if (statusOf(id) === 'pending') apprEx(id); });
      R.checked = {}; R.sel = null; rr();
    },
    startReject: function () { R.rejecting = true; R.reason = R.suggest || ''; rr(); },
    cancelReject: function () { R.rejecting = false; R.reason = ''; rr(); },
    quick: function (t) { R.reason = t; rr(); },
    reason: function (v) { R.reason = v; var b = document.querySelector('.df-ex-xconfirm'); if (b) b.disabled = !v.trim(); },
    confirmReject: function (id) {
      var reason = (R.reason || '').trim(); if (!reason) return;
      var next = nextAfter(id);
      rejEx(id);                                    // opens the legacy reason dialog …
      var inp = $('reject-reason-input'), ok = $('conf-ok');
      if (!inp || !ok) return;
      inp.value = reason;                           // … fill it with the PM's reason and confirm it, as the legacy dialog does
      ok.click();
      if (statusOf(id) === 'rejected') { R.sel = next; R.rejecting = false; R.reason = ''; }
      rr();
    },
    revert: function (id) { revertExToPending(id); rr(); }
  };

  function proofLinks(e) {
    var out = [], p = e.proofLink || (String(e.proofDoc || '').indexOf('http') === 0 ? e.proofDoc : '');
    if (p) out.push(p);
    (e.proofLinks || []).forEach(function (x) { if (x && x.url) out.push(x.url); });
    return out;
  }
  /* rule checklist — every rule mirrors a legacy check:
     - group ≥ 3 people           : submitEx + apprEx (1 + members.length)
     - group 1/week · 4/cycle      : submitEx (submitter) + updateExSysMemberSelect / joinExGroup (members) — non-rejected, involvement-based
     - no approved group same week : apprEx conflict confirm
     - solo n/week · m/cycle       : submitEx with getSoloWeeklyLimit / getSoloMonthlyLimit by the submitter's location
     - one claim per date          : submitEx duplicate-date check
     - proof link                  : submitEx (link required)
     Ordering for "ครั้งที่ k": by submittedAt (then id) — the item submitted earlier keeps the quota. */
  function rulesFor(e) {
    var es = getExs(), et = getExType(e), grp = isGroupEx(et), out = [];
    var key = function (x) { return String(x.submittedAt || x.date || '') + '|' + String(x.id); };
    var pos = function (email, pred) {
      var l = es.filter(function (x) { return (x.status !== 'rejected' || String(x.id) === String(e.id)) && isUserInvolved(x, email) && pred(x); });
      l.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
      return l.findIndex(function (x) { return String(x.id) === String(e.id); }) + 1;
    };
    var wk = wkKey(e.date), mk = monthKey(e.date), wn = getWkNum(e.date);
    if (grp) {
      var n = 1 + (e.members || []).length;
      out.push(['สมาชิกอย่างน้อย 3 คน', n + ' คน', n >= 3]);
      var parts = [e.email]; (e.members || []).forEach(function (m) { if (m.type === 'sys' && m.email && parts.indexOf(m.email) < 0) parts.push(m.email); });
      var isG = function (x) { return isGroupEx(getExType(x)); };
      var wkOver = parts.filter(function (em) { return pos(em, function (x) { return isG(x) && wkKey(x.date) === wk; }) > 1; });
      var moOver = parts.filter(function (em) { return pos(em, function (x) { return isG(x) && monthKey(x.date) === mk; }) > 4; });
      var names = function (l) { return l.map(function (em) { return nickOf(em); }).join(', '); };
      out.push(['กลุ่มไม่เกิน 1 ครั้ง/สัปดาห์', wkOver.length ? 'เกิน: ' + names(wkOver) : 'ครั้งที่ ' + pos(e.email, function (x) { return isG(x) && wkKey(x.date) === wk; }) + ' ของ W' + wn, !wkOver.length]);
      out.push(['กลุ่มไม่เกิน 4 ครั้ง/รอบ', moOver.length ? 'เกิน: ' + names(moOver) : 'ครั้งที่ ' + pos(e.email, function (x) { return isG(x) && monthKey(x.date) === mk; }) + '/4', !moOver.length]);
      var conf = parts.filter(function (em) { return es.some(function (x) { return x.id !== e.id && isG(x) && x.status === 'approved' && wkKey(x.date) === wk && isUserInvolved(x, em); }); });
      out.push(['ไม่มีใครมีกลุ่มที่อนุมัติแล้วใน W' + wn, conf.length ? names(conf) : 'ไม่มี', !conf.length]);
    } else {
      var su = uByEmail(e.email) || {}, loc = su.locationType || 'bkk', locL = loc === 'bkk' ? 'กทม.' : 'ตจว.';
      var wl = getSoloWeeklyLimit(e.date, loc), ml = getSoloMonthlyLimit(e.date, loc);
      var isS = function (x) { return getExType(x) === 'solo'; };
      var pw = pos(e.email, function (x) { return isS(x) && wkKey(x.date) === wk; }), pm = pos(e.email, function (x) { return isS(x) && monthKey(x.date) === mk; });
      if (wl !== null) out.push(['เดี่ยวไม่เกิน ' + wl + ' ครั้ง/สัปดาห์ (' + locL + ')', 'ครั้งที่ ' + pw + ' ของ W' + wn, pw <= wl]);
      out.push(['เดี่ยวไม่เกิน ' + ml + ' ครั้ง/รอบ (' + locL + ')', 'ครั้งที่ ' + pm + '/' + ml, pm <= ml]);
    }
    var pd1 = pos(e.email, function (x) { return x.date === e.date; });
    out.push(['ไม่ยื่นซ้ำวันเดียวกัน', pd1 > 1 ? 'ซ้ำกับรายการก่อนหน้า' : 'ไม่ซ้ำ', pd1 <= 1]);
    var nl = proofLinks(e).length;
    out.push(['มีวิดีโอหลักฐาน', nl ? nl + ' ลิงก์' : 'ไม่มี', nl > 0]);
    return out;
  }
  function amountOf(e) { return getExerciseReward(e) * (isGroupEx(getExType(e)) ? 1 + (e.members || []).length : 1); } // = legacy renderExR money formula
  function sentTxt(e) {
    if (!e.submittedAt) return '—';
    var d = new Date(e.submittedAt); if (isNaN(d)) return '—';
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderReview(view) {
    if (cu.role !== 'pm') { // same gate as legacy renderExR
      paint(view, '<div class="df-ex">' + D.header({ eyebrow: 'สำหรับ PM', title: 'อนุมัติออกกำลังกาย' }) + '<section class="df-card df-ex-blank"><h2>เฉพาะ PM เท่านั้น</h2></section></div>');
      return;
    }
    // pool + search: identical to legacy renderExR
    var active = new Set(getUsers().filter(function (u) { return u.active !== false; }).map(function (u) { return u.email; }));
    var all = getExs().filter(function (e) { return active.has(e.email); });
    var t = today(), now = new Date(), opts = [];
    for (var i = -6; i <= 1; i++) { var k = monthKey(new Date(now.getFullYear(), now.getMonth() + i, 20)); if (opts.indexOf(k) < 0) opts.push(k); }
    var mk = g('_exReviewMonth'); if (!mk || opts.indexOf(mk) < 0) mk = monthKey(t);
    var search = g('_exReviewSearch') || '';
    var raw = search.trimStart(), allMode = /^all\s/i.test(raw), qq = allMode ? raw.slice(4).toLowerCase().trim() : raw.toLowerCase();
    var pool = allMode ? all : all.filter(function (e) { return monthKey(e.date) === mk; });
    var nickMap = {}; getUsers().forEach(function (u) { nickMap[u.email] = (u.nickname || '').toLowerCase(); });
    var hit = function (e) {
      if (!qq) return true;
      var n = nickMap[e.email] || '';
      if ((e.name || '').toLowerCase().indexOf(qq) >= 0 || n.indexOf(qq) >= 0 || (e.email || '').toLowerCase().indexOf(qq) >= 0 ||
        (e.activity || '').toLowerCase().indexOf(qq) >= 0 || String(e.id || '').toLowerCase().indexOf(qq) >= 0) return true;
      return (e.members || []).some(function (m) { return (m.name || '').toLowerCase().indexOf(qq) >= 0 || (m.email || '').toLowerCase().indexOf(qq) >= 0 || (nickMap[m.email] || '').indexOf(qq) >= 0; });
    };
    var bySent = function (a, b) { return new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date); };
    var failsOf = {}; pool.forEach(function (e) { if (e.status === 'pending') failsOf[e.id] = rulesFor(e).filter(function (c) { return !c[2]; }).length; });
    var pending = pool.filter(function (e) { return e.status === 'pending'; });
    var ready = pending.filter(function (e) { return !failsOf[e.id]; });
    var approvedMoney = pool.filter(function (e) { return e.status === 'approved'; }).reduce(function (s, e) { return s + amountOf(e); }, 0);
    var cnt = function (s) { return pool.filter(function (e) { return e.status === s && hit(e); }).length; };

    var inTab = pool.filter(function (e) { return e.status === R.tab && hit(e); }).sort(bySent);
    var isG = function (e) { return isGroupEx(getExType(e)); };
    if (R.tab !== 'pending' && R.flt === 'check') R.flt = 'all';
    var list = inTab.filter(function (e) { return R.flt === 'all' || (R.flt === 'group' && isG(e)) || (R.flt === 'solo' && !isG(e)) || (R.flt === 'check' && failsOf[e.id]); });
    R.listIds = list.map(function (e) { return String(e.id); });
    R.readyIds = R.tab === 'pending' ? list.filter(function (e) { return !failsOf[e.id]; }).map(function (e) { return String(e.id); }) : [];
    Object.keys(R.checked).forEach(function (id) { if (R.readyIds.indexOf(id) < 0) delete R.checked[id]; });
    if (!R.sel || R.listIds.indexOf(String(R.sel)) < 0) { R.sel = R.listIds[0] || null; R.clip = 0; R.rejecting = false; }

    var head = D.header({ eyebrow: 'สำหรับ PM', title: 'อนุมัติออกกำลังกาย',
      actions: '<label class="df-ex-lbl">รอบ' + selectHtml(opts.map(function (k) { return { v: k, l: cycleLong(k) }; }), mk, 'aria-label="เลือกรอบ" onchange="__dfExR.month(this.value)"') + '</label>' });
    var stat = function (cls, glyph, label, value) { return '<div class="df-ex-xstat"><span class="df-ex-xdot ' + cls + '" aria-hidden="true">' + glyph + '</span><div><span>' + label + '</span><b>' + value + '</b></div></div>'; };
    var stats = '<section class="df-ex-xstats">' + stat('p', '•', 'รออนุมัติ', pending.length + ' รายการ') + stat('ok', '✓', 'พร้อมอนุมัติ', ready.length + ' รายการ') +
      stat('w', '!', 'ต้องตรวจเพิ่ม', (pending.length - ready.length) + ' รายการ') + stat('m', '฿', allMode ? 'อนุมัติแล้ว (ทุกรอบ)' : 'อนุมัติแล้วรอบนี้', money(approvedMoney)) + '</section>';

    var tabs = [['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ไม่อนุมัติ']].map(function (x) {
      var on = R.tab === x[0];
      return '<button type="button" role="tab" aria-selected="' + on + '" class="df-ex-xtab' + (on ? ' on' : '') + '" onclick="__dfExR.tab(\'' + x[0] + '\')">' + x[1] + ' <span>' + cnt(x[0]) + '</span></button>';
    }).join('');
    var fl = [['all', 'ทั้งหมด ' + inTab.length], ['group', 'กลุ่ม ' + inTab.filter(isG).length], ['solo', 'เดี่ยว ' + inTab.filter(function (e) { return !isG(e); }).length]];
    if (R.tab === 'pending') fl.push(['check', 'ต้องตรวจ ' + inTab.filter(function (e) { return failsOf[e.id]; }).length]);
    var filters = fl.map(function (f) { return '<button type="button" aria-pressed="' + (R.flt === f[0]) + '" class="df-ex-xflt' + (R.flt === f[0] ? ' on' : '') + (f[0] === 'check' ? ' chk' : '') + '" onclick="__dfExR.flt(\'' + f[0] + '\')">' + f[1] + '</button>'; }).join('');
    var nChecked = Object.keys(R.checked).length, allChecked = R.readyIds.length > 0 && nChecked === R.readyIds.length;
    var bulk = R.tab === 'pending' && list.length ? '<div class="df-ex-xbulk"><label><input type="checkbox"' + (allChecked ? ' checked' : '') + (R.readyIds.length ? '' : ' disabled') + ' onchange="__dfExR.checkAll(this.checked)"><span>' +
      (nChecked ? 'เลือกแล้ว ' + nChecked + ' รายการ · ' + money(list.filter(function (e) { return R.checked[String(e.id)]; }).reduce(function (s, e) { return s + amountOf(e); }, 0)) : 'เลือกทั้งหมดที่ผ่านเกณฑ์ (' + R.readyIds.length + ')') + '</span></label>' +
      (nChecked ? '<button type="button" class="df-ex-xbulkbtn" onclick="__dfExR.bulk()">อนุมัติที่เลือก</button>' : '') + '</div>' : '';
    var rows = list.map(function (e) {
      var id = String(e.id), sel = id === String(R.sel), f = failsOf[e.id] || 0, u = uByEmail(e.email) || {}, nick = u.nickname || String(e.name || '').split(' ')[0];
      var flag = e.status === 'approved' ? ['อนุมัติแล้ว', 'ok'] : e.status === 'rejected' ? ['ไม่อนุมัติ', 'no'] : f ? ['ไม่ผ่าน ' + f + ' ข้อ', 'no'] : ['ผ่านเกณฑ์', 'ok'];
      return '<div role="option" aria-selected="' + sel + '" class="df-ex-xrow' + (sel ? ' sel' : '') + '" onclick="__dfExR.pick(' + q(id) + ')">' +
        (R.tab === 'pending' ? '<input type="checkbox" aria-label="เลือก ' + esc(nick) + '"' + (R.checked[id] ? ' checked' : '') + (f ? ' disabled title="ไม่ผ่านเกณฑ์ — ตรวจทีละรายการ"' : '') + ' onclick="event.stopPropagation()" onchange="__dfExR.check(' + q(id) + ',this.checked)">' : '') +
        av(nick, e.email, 40) + '<div class="df-ex-xmain"><span class="df-ex-xname">' + esc(nick) + ' <span>· ' + esc(u.dept || e.dept || '—') + '</span></span>' +
        '<span class="df-ex-xact">' + tile(TICON[getExType(e)], 20) + '<span>' + esc(e.activity || 'กิจกรรม') + '</span></span></div>' +
        '<div class="df-ex-xside"><b>' + money(amountOf(e)) + '</b><span class="df-ex-xflag ' + flag[1] + '">' + flag[0] + '</span></div></div>';
    }).join('');
    var empty = !list.length ? '<div class="df-ex-xempty">' + tile('ic-run', 52) + '<strong>' + (R.tab === 'pending' ? 'ไม่มีคำขอรออนุมัติ' : R.tab === 'approved' ? 'ยังไม่มีรายการที่อนุมัติ' : 'ไม่มีรายการที่ไม่อนุมัติ') + '</strong><span>' +
      (qq ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : allMode ? 'ทุกรอบ' : 'รอบ ' + cycleLong(mk)) + '</span></div>' : '';
    var listHtml = '<section class="df-ex-xlist" aria-label="รายการคำขอ"><div class="df-ex-xtools"><div class="df-ex-xtabs" role="tablist" aria-label="สถานะ">' + tabs + '</div>' +
      '<label class="df-ex-xsearch">' + icoSvg('<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>', 18) +
      '<input data-k="exr-search" class="df-ex-xq" type="search" aria-label="ค้นหาคำขอ" placeholder="ค้นหาชื่อ กิจกรรม หรือรหัส DS · พิมพ์ all เพื่อค้นทุกรอบ" value="' + esc(search) + '" oninput="__dfExR.search(this.value)"></label>' +
      '<div class="df-ex-xflts" role="group" aria-label="กรอง">' + filters + '</div></div>' + bulk + '<div role="listbox" aria-label="คำขอ" class="df-ex-xrows">' + rows + empty + '</div></section>';

    var e = list.find(function (x) { return String(x.id) === String(R.sel); });
    var detail = e ? reviewDetail(e) : '';
    paint(view, '<div class="df-ex df-ex-review">' + head + stats + '<div class="df-ex-xgrid">' + listHtml + detail + '</div></div>');
  }

  function reviewDetail(e) {
    var et = getExType(e), grp = isGroupEx(et), u = uByEmail(e.email) || {}, nick = u.nickname || String(e.name || '').split(' ')[0], dept = u.dept || e.dept || '';
    var checks = rulesFor(e), fails = checks.filter(function (c) { return !c[2]; });
    var links = proofLinks(e), clip = Math.min(R.clip, Math.max(0, links.length - 1));
    var n = 1 + (e.members || []).length, reward = getExerciseReward(e);
    var dom = function (url) { try { return new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch (x) { return ''; } };
    var safeUrl = function (url) { return /^https?:\/\//i.test(url) ? url : 'https://' + url; };
    var proof = links.length
      ? '<div class="df-ex-xproof"><a class="df-ex-xclip" href="' + esc(safeUrl(links[clip])) + '" target="_blank" rel="noopener noreferrer" aria-label="เปิดวิดีโอหลักฐาน คลิปที่ ' + (clip + 1) + ' ในแท็บใหม่">' +
        '<span class="df-ex-xplay"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M8 5v14l11-7z"></path></svg></span>' +
        '<span class="df-ex-xcliplbl">คลิปที่ ' + (clip + 1) + ' จาก ' + links.length + ' · เปิดในแท็บใหม่ ↗</span>' + (dom(links[clip]) ? '<span class="df-ex-xdom">' + esc(dom(links[clip])) + '</span>' : '') + '</a>' +
        (links.length > 1 ? '<div class="df-ex-xclips">' + links.map(function (l, k) { return '<button type="button" aria-pressed="' + (k === clip) + '" class="' + (k === clip ? 'on' : '') + '" onclick="__dfExR.clip(' + k + ')">คลิป ' + (k + 1) + '</button>'; }).join('') + '</div>' : '') + '</div>'
      : '<div class="df-ex-xnoproof">' + icoSvg('<rect x="3" y="5" width="13" height="14" rx="2"></rect><path d="M16 10l5-3v10l-5-3M3 3l18 18"></path>', 22) + 'ยังไม่มีวิดีโอหลักฐาน</div>';
    var members = '';
    if (grp) {
      var people = [{ type: 'sys', email: e.email, name: e.name }].concat(e.members || []);
      members = '<div class="df-ex-xmembers"><span class="df-ex-xsub">สมาชิก ' + n + ' คน</span><div>' + people.map(function (m) {
        if (m.type === 'out') return '<span class="df-ex-xmem out">' + av(m.name, m.name, 24) + esc(m.name) + ' · นอกระบบ' + (m.dept ? ' (' + esc(m.dept) + ')' : '') + '</span>';
        var mu = uByEmail(m.email) || {}, nn = nickOf(m.email, m.name), md = mu.dept || '';
        var outDept = md && dept && md !== dept;
        return '<span class="df-ex-xmem' + (outDept ? ' out' : '') + '">' + av(nn, m.email, 24) + esc(nn) + (outDept ? ' · นอกแผนก (' + esc(md) + ')' : '') + '</span>';
      }).join('') + '</div></div>';
    }
    // show only the rules that fail; when everything passes, say so in one line
    var failed = checks.filter(function (c) { return !c[2]; });
    var checkHtml = failed.length
      ? '<div class="df-ex-xchecks"><span class="df-ex-xsub">ไม่ผ่านกติกา ' + failed.length + ' ข้อ · จากทั้งหมด ' + checks.length + ' ข้อ</span>' + failed.map(function (c) {
          return '<div class="df-ex-xck"><span class="df-ex-xckdot no" aria-hidden="true">✕</span><span class="df-ex-xcklbl">' + esc(c[0]) + '</span><span class="df-ex-xckval no">' + esc(c[1]) + '</span></div>';
        }).join('') + '</div>'
      : '<div class="df-ex-xchecks df-ex-xallok"><div class="df-ex-xck"><span class="df-ex-xckdot" aria-hidden="true">✓</span><span class="df-ex-xcklbl">ผ่านกติกาทั้งหมด ' + checks.length + ' ข้อ</span><span class="df-ex-xckval">ระบบเช็กให้อัตโนมัติ</span></div></div>';
    var id = String(e.id), foot;
    if (e.status === 'pending' && !R.rejecting) {
      R.suggest = fails.length ? (fails.some(function (c) { return c[0] === 'มีวิดีโอหลักฐาน'; }) ? 'ไม่มีวิดีโอหลักฐาน' : fails.some(function (c) { return c[0].indexOf('กลุ่มไม่เกิน 1') === 0; }) ? 'เกินโควตากลุ่มสัปดาห์นี้' : '') : '';
      foot = (fails.length ? '<span class="df-ex-xwarn">ไม่ผ่านกติกา ' + fails.length + ' ข้อ · แนะนำให้ปฏิเสธพร้อมแจ้งเหตุผล</span>' : '') +
        '<div class="df-ex-xbtns"><button type="button" class="df-ex-xrej' + (fails.length ? ' strong' : '') + '" onclick="__dfExR.startReject()">ปฏิเสธ</button>' +
        '<button type="button" class="df-ex-xok' + (fails.length ? ' soft' : '') + '" onclick="__dfExR.approve(' + q(id) + ')">อนุมัติ · ไปรายการถัดไป</button></div>';
    } else if (e.status === 'pending') {
      foot = '<span class="df-ex-xwarn b">เลือกเหตุผล หรือพิมพ์เอง</span><div class="df-ex-xquick">' + QUICK.map(function (l) {
        return '<button type="button" aria-pressed="' + (R.reason === l) + '" class="' + (R.reason === l ? 'on' : '') + '" onclick="__dfExR.quick(' + q(l) + ')">' + esc(l) + '</button>';
      }).join('') + '</div><textarea data-k="exr-reason" class="df-ex-xreason" rows="2" aria-label="เหตุผลที่ไม่อนุมัติ" placeholder="เหตุผลจะส่งไปให้ผู้ยื่นทันที" oninput="__dfExR.reason(this.value)">' + esc(R.reason) + '</textarea>' +
        '<div class="df-ex-xbtns"><button type="button" class="df-ex-xcancel" onclick="__dfExR.cancelReject()">ยกเลิก</button><button type="button" class="df-ex-xconfirm"' + (R.reason.trim() ? '' : ' disabled') + ' onclick="__dfExR.confirmReject(' + q(id) + ')">ยืนยันปฏิเสธ</button></div>';
    } else if (e.status === 'approved') {
      foot = '<div class="df-ex-xclosed"><span class="ok">✓ อนุมัติแล้ว' + (e.approvedBy ? ' · โดย ' + esc(e.approvedBy) : '') + '</span><button type="button" class="df-ex-xcancel" onclick="__dfExR.revert(' + q(id) + ')">ย้อนกลับเป็นรออนุมัติ</button></div>';
    } else {
      foot = '<div class="df-ex-xclosed"><span class="no">✕ ไม่อนุมัติ' + (e.rejectedBy ? ' · โดย ' + esc(e.rejectedBy) : '') + '</span></div>';
    }
    return '<section class="df-ex-xdetail" aria-label="รายละเอียดคำขอ"><div class="df-ex-xbody">' +
      '<div class="df-ex-xwho">' + av(nick, e.email, 52) + '<div><b>' + esc(nick) + (dept ? ' · ' + esc(dept) : '') + '</b><span>ยื่นเมื่อ ' + sentTxt(e) + ' · ' + esc(id) + '</span></div>' + tchip(et) + '</div>' +
      '<div class="df-ex-xtitle"><b>' + esc(e.activity || 'กิจกรรม') + '</b><span class="df-ex-xmeta"><span>' + dsWd(e.date) + ' · W' + getWkNum(e.date) + '</span><span><strong>' + money(amountOf(e)) + '</strong> <em>(' + (grp ? money(reward) + ' × ' + n + ' คน' : 'ต่อครั้ง') + ')</em></span></span>' +
      (e.note ? '<span class="df-ex-xnote">“' + esc(e.note) + '”</span>' : '') + '</div>' +
      proof + members + checkHtml +
      (e.status === 'rejected' ? '<div class="df-ex-xrejbox"><strong>ไม่อนุมัติ:</strong> ' + esc(e.rejectReason || '—') + '</div>' : (e.rejectReason ? '<div class="df-ex-xprev"><strong>ยื่นใหม่ · ครั้งก่อนถูกปฏิเสธเพราะ:</strong> ' + esc(e.rejectReason) + '</div>' : '')) +
      '<button type="button" class="df-ex-link" onclick="viewExDetail(' + q(id) + ')">ดูรายละเอียดเต็ม · แนบ/แก้ลิงก์ ›</button>' +
      '</div><div class="df-ex-xfoot">' + foot + '</div></section>';
  }

  /* ======================= install ======================= */
  function install() {
    D.registerPage('exercise-log', { render: renderLog, refreshOn: [] });
    D.registerPage('ex-new', { create: true, render: renderNew });
    D.registerPage('exercise-share', { render: renderShare, refreshOn: [] });
    D.registerPage('leaderboard', { render: renderLB, refreshOn: [] });
    D.registerPage('exercise-review', { render: renderReview, refreshOn: [] });
    // coalesced re-render after the legacy renderers refresh their (hidden) DOM
    ['updateQuota', 'renderExHistory'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-log'); schedule('ex-new'); schedule('exercise-share'); }); });
    ['renderExMembers'].forEach(function (fn) { D.hook(fn, function () { schedule('ex-new'); schedule('exercise-share'); }); });
    ['renderExShare', 'setExShareTab', 'applyExShareAllFilter'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-share'); }); });
    ['updateLB'].forEach(function (fn) { D.hook(fn, function () { schedule('leaderboard'); }); });
    ['renderExR'].forEach(function (fn) { D.hook(fn, function () { schedule('exercise-review'); }); });
    // the claim form is a full page now: legacy openers redirect to it
    D.hook('openExModal', function () { afterLegacyOpen('new'); });
    D.hook('editEx', function () { afterLegacyOpen('edit'); });
    D.hook('showPage', function (id) {
      if (_armed && id !== pageOfMode(_armed)) { _armed = null; releaseFormModal(); }
      if (id === 'ex-new') { var nv = document.querySelector('[onclick="showPage(\'exercise-log\')"]'); if (nv) nv.classList.add('active'); }
    });
    // after a successful legacy submit, go back to "ข้อมูลของฉัน"
    var orig = window.doSubmitEx;
    if (typeof orig === 'function' && !orig.__dfex) {
      var wrapped = function () {
        var fromPage = isActive('ex-new'), fromShare = _armed === 'share' && isActive('exercise-share');
        var p = orig.apply(this, arguments);
        if (fromPage) Promise.resolve(p).then(function () { if (isActive('ex-new')) showPage('exercise-log'); }, function () {});
        if (fromShare) Promise.resolve(p).then(function () { _armed = null; releaseFormModal(); try { renderExShare(); } catch (x) {} schedule('exercise-share'); }, function () {}); // legacy doSubmitEx does not refresh the share lists
        return p;
      };
      wrapped.__dfex = true; window.doSubmitEx = wrapped;
    }
    // legacy detail modal's approve button calls appEx(), which does not exist (only apprEx). Alias it.
    if (typeof window.appEx !== 'function' && typeof window.apprEx === 'function') window.appEx = function (id) { return window.apprEx(id); };
  }
  install();
})();

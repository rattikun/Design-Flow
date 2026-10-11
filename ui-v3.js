/* ==========================================================================
   Design Flow v3 — UI layer (READ-ONLY)
   Loaded after team-manager.js. Adds the v3 dashboard widgets, "my leave"
   balance cards and the mobile tab bar.

   SAFETY RULES for this file:
   - Never call api()/apiSync(), never call any save- or set- data helper,
     never write LS/localStorage (except the UI-only 'df-theme' key elsewhere).
   - Only READ via getLeaves()/getExs()/getQs()/getUsers()/getVisibleEmails().
   - Every hook runs after the original function and is wrapped in try/catch,
     so a failure here can never block the original behaviour.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var TH_MON_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var TYPE_ICON = { vacation: 'ic-vac', personal: 'ic-biz', sick: 'ic-sick', dental: 'ic-dent', birthday: 'ic-bday', accumulated: 'ic-acc' };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function plainType(t) { return String((typeof LT !== 'undefined' && LT[t]) || t || '').replace(/^[^฀-๿A-Za-z]+/, '').trim(); }
  function num(n) { return Number(n).toFixed(1).replace(/\.0$/, ''); }
  function todayStr() { return toLocalDateString(new Date()); }
  function nick(u) { return (u && (u.nickname || (u.name || '').split(' ')[0])) || ''; }
  function userByEmail(email) {
    var e = String(email || '').toLowerCase();
    return (getUsers() || []).find(function (u) { return String(u.email || '').toLowerCase() === e; });
  }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (err) { console.warn('[ui-v3]', err); } }; }
  function hook(name, after) {
    var cur = window[name];
    if (typeof cur !== 'function') return;
    if (cur.__dfv3) { cur.__afters.push(after); return; }
    var orig = cur;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      var args = arguments, self = this;
      wrapped.__afters.forEach(function (fn) { safe(fn).apply(self, args); });
      return r;
    };
    wrapped.__dfv3 = true;
    wrapped.__afters = [after];
    window[name] = wrapped;
  }

  function holidays() {
    try { return typeof getCachedDashboardHolidays === 'function' ? getCachedDashboardHolidays() : []; } catch (e) { return []; }
  }
  function visibleSet() {
    try { return typeof getVisibleEmails === 'function' ? getVisibleEmails() : null; } catch (e) { return null; }
  }

  /* ---- leave balance, same formula as renderMyBal() ---- */
  function balanceFor(type) {
    if (!cu || typeof LQ === 'undefined' || !LQ[type]) return null;
    var def = LQ[type], qs = getQs(), cq = (qs[cu.email] && qs[cu.email][type] != null) ? qs[cu.email][type] : null;
    var quota = cq !== null ? cq : def.q;
    if (quota === null || quota === undefined) return null;
    var mine = getLeaves().filter(function (r) { return r.email === cu.email && r.type === type; });
    var used = mine.filter(function (r) { return r.status === 'approved'; }).reduce(function (s, r) { return s + effectiveLeaveDays(r); }, 0);
    var pending = mine.filter(function (r) { return String(r.status).indexOf('pending') === 0; }).length;
    var left = Math.max(0, quota - used);
    return { type: type, quota: quota, used: used, left: left, pending: pending, pct: quota > 0 ? Math.round(left / quota * 100) : 0 };
  }
  function tile(icon, size) {
    return '<span class="df-tile ' + (icon || '') + '" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true"><span class="ic"></span></span>';
  }

  /* ======================= DASHBOARD ======================= */
  function greetingWord() {
    var h = new Date().getHours();
    return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  }

  function renderDashExtras() {
    if (!cu) return;
    var g = document.getElementById('dashboard-greeting');
    if (g) g.textContent = greetingWord() + ' ' + nick(cu);

    renderDashHero();

    // card 1: vacation balance
    var vac = balanceFor('vacation');
    var vEl = document.getElementById('df-vac-left'), vQ = document.getElementById('df-vac-quota'), vN = document.getElementById('df-vac-note');
    if (vEl && vac) {
      vEl.textContent = num(vac.left);
      if (vQ) vQ.textContent = '/ ' + num(vac.quota) + ' วัน';
      if (vN) {
        var low = vac.pct < 35;
        vN.textContent = vac.left === 0 ? 'ใช้ครบแล้ว' : low ? 'ใกล้หมดแล้ว' : 'ใช้ไป ' + num(vac.used) + ' วัน';
        vN.classList.toggle('warn', low);
      }
    }

    // card 3: exercise money this cycle (same as "ข้อมูลของฉัน": non-rejected, current cycle)
    var mk = monthKey(todayStr());
    var mineEx = getExs().filter(function (e) { return isUserInvolved(e, cu.email) && e.status !== 'rejected'; });
    var money = mineEx.filter(function (e) { return monthKey(e.date) === mk; }).reduce(function (s, e) { return s + getExerciseReward(e); }, 0);
    var mEl = document.getElementById('df-ex-money');
    if (mEl) mEl.textContent = '฿' + money.toLocaleString();

    // right column: leave balance bars
    var balEl = document.getElementById('df-dash-balance');
    if (balEl) {
      balEl.innerHTML = ['vacation', 'personal', 'sick', 'dental'].map(balanceFor).filter(Boolean).map(function (b) {
        var low = b.pct < 35;
        return '<div class="df-bal-row"><div class="df-bal-top"><span class="df-bal-name">' + tile(TYPE_ICON[b.type], 26) + esc(plainType(b.type)) + '</span>' +
          '<span class="df-bal-num' + (low ? ' warn' : '') + '">' + num(b.left) + ' / ' + num(b.quota) + ' วัน</span></div>' +
          '<div class="df-bar"><div class="df-bar-fill' + (low ? ' warn' : '') + '" style="width:' + b.pct + '%"></div></div></div>';
      }).join('') || '<div class="dashboard-empty">ไม่มีข้อมูลโควต้า</div>';
    }

    // right column: upcoming (visible team leaves + bank holidays)
    var upEl = document.getElementById('df-dash-upcoming');
    if (upEl) {
      var t = todayStr(), vis = visibleSet();
      var items = getLeaves().filter(function (r) {
        return r.status !== 'rejected' && r.end >= t && (vis === null || vis.has(r.email));
      }).map(function (r) {
        var u = userByEmail(r.email), who = r.email === cu.email ? 'คุณ' : nick(u) || r.name || '';
        var range = r.start === r.end ? '' : ' – ' + fmtShort(r.end);
        return { date: r.start < t ? t : r.start, kind: 'leave', user: u || { email: r.email, name: r.name }, title: who + ' · ' + plainType(r.type),
          sub: (String(r.status).indexOf('pending') === 0 ? 'รออนุมัติ · ' : '') + num(effectiveLeaveDays(r)) + ' วัน' + range };
      });
      holidays().filter(function (h) { return h.date >= t; }).forEach(function (h) {
        items.push({ date: h.date, kind: 'hol', title: h.name || 'วันหยุดธนาคาร', sub: 'วันหยุดธนาคาร' });
      });
      items.sort(function (a, b) { return a.date.localeCompare(b.date); });
      upEl.innerHTML = items.slice(0, 5).map(function (it) {
        var d = new Date(it.date + 'T00:00:00');
        return '<div class="df-up-row"><div class="df-datebox ' + it.kind + '"><b>' + d.getDate() + '</b><span>' + TH_MON_S[d.getMonth()] + '</span></div>' +
          '<div class="df-up-main"><div class="df-up-title">' + esc(it.title) + '</div><div class="df-up-sub">' + esc(it.sub) + '</div></div>' + (it.user ? DFV3.avatar(it.user, 32) : '') + '</div>';
      }).join('') || '<div class="dashboard-empty">ยังไม่มีวันลาหรือวันหยุดที่จะถึง</div>';
    }

    // keep "ใบลาที่ต้องติดตาม" panel only when there is something to follow up
    var exPanel = document.getElementById('d-exercise-metrics');
    exPanel = exPanel && exPanel.closest('.dashboard-panel');
    if (exPanel) exPanel.hidden = true; // not part of the v3 dashboard design
    var att = document.getElementById('d-leave-actions');
    var attPanel = att && att.closest('.dashboard-panel');
    if (attPanel) attPanel.hidden = !att.querySelector('.dashboard-list-item');
  }
  /* ---- J dashboard hero: team summary + team photo (static, no animation) ---- */
  function renderDashHero() {
    var stats = document.querySelector('#page-dashboard .dashboard-stats');
    if (!stats) return;
    var hero = document.getElementById('df-dash-hero');
    if (!hero) {
      hero = document.createElement('section');
      hero.id = 'df-dash-hero'; hero.className = 'df-hero-card';
      hero.setAttribute('aria-label', 'สรุปทีมสัปดาห์นี้');
      stats.parentNode.insertBefore(hero, stats);
    }
    var t = todayStr(), isMgr = cu.role === 'pm' || cu.role === 'lead';
    var team = (getUsers() || []).filter(function (u) { return u.active !== false && cu.dept && u.dept === cu.dept; });
    if (!team.some(function (u) { return u.email === cu.email; })) team.unshift(cu);
    // leave visibility stays as legacy: managers see their scope, others only themselves
    var vis = isMgr ? visibleSet() : new Set([cu.email]);
    var leaves = getLeaves().filter(function (r) { return r.status !== 'rejected' && (vis === null || vis.has(r.email)); });
    var awayToday = isMgr ? team.filter(function (u) { return leaves.some(function (r) { return r.email === u.email && r.start <= t && r.end >= t; }); }) : [];
    var pending = leaves.filter(function (r) { return String(r.status).indexOf('pending') === 0 && (isMgr || r.email === cu.email); }).length;

    var title;
    if (isMgr) title = (awayToday.length ? 'วันนี้ลา ' + awayToday.length + ' คน' : 'ทีมอยู่ครบ') + (pending ? ' · ใบลารออนุมัติ ' + pending + ' ใบ' : ' ไม่มีใบลาค้าง');
    else title = pending ? 'ใบลาของคุณรออนุมัติ ' + pending + ' ใบ' : 'ไม่มีใบลาค้าง';

    // sub line: my next leave (+ a holiday right after it), else the next holiday
    var mine = leaves.filter(function (r) { return r.email === cu.email && r.end >= t; }).sort(function (a, b) { return a.start.localeCompare(b.start); })[0];
    var hol = holidays().filter(function (h) { return h.date >= t; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var whenTxt = function (ds) {
      var diff = Math.round((new Date(ds + 'T00:00:00') - new Date(t + 'T00:00:00')) / 86400000);
      return diff <= 0 ? 'วันนี้' : diff === 1 ? 'พรุ่งนี้' : fmtShort(ds);
    };
    var sub;
    if (mine) {
      var after = new Date(mine.end + 'T00:00:00'); after.setDate(after.getDate() + 1);
      var nextDay = toLocalDateString(after), hNext = hol.filter(function (h) { return h.date === nextDay; })[0];
      sub = whenTxt(mine.start < t ? t : mine.start) + 'คุณ' + plainType(mine.type) + (String(mine.status).indexOf('pending') === 0 ? ' (รออนุมัติ)' : '') + (hNext ? ' ต่อด้วยวันหยุด ' + fmtShort(hNext.date) : '');
    } else sub = hol.length ? 'ยังไม่มีวันลาที่กำลังจะถึง · วันหยุดถัดไป ' + fmtShort(hol[0].date) + ' ' + (hol[0].name || '') : 'ยังไม่มีวันลาที่กำลังจะถึง';

    var shown = team.slice(0, 6);
    var faces = shown.map(function (u, i) {
      return DFV3.avatar(u, 36).replace('aria-hidden="true"', 'title="' + esc(nick(u)) + '"').replace('style="', 'style="' + (i ? 'margin-left:-8px;' : '') + 'box-shadow:0 0 0 2px var(--ds-tint);');
    }).join('') + (team.length > 6 ? '<span class="df-hero-more">+' + (team.length - 6) + '</span>' : '');
    var countTxt = team.length + ' คน' + (isMgr ? (awayToday.length ? ' · ลา ' + awayToday.length : ' · อยู่ครบ') : '');

    hero.innerHTML = '<div class="df-hero-text"><span class="df-hero-eyebrow">' + esc(cu.dept ? 'ทีม ' + cu.dept : 'ทีมของฉัน') + ' · สัปดาห์นี้</span>' +
      '<h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p>' +
      '<div class="df-hero-team">' + faces + '<span class="df-hero-count">' + esc(countTxt) + '</span></div></div>' +
      '<div class="df-hero-photo" aria-hidden="true"><img src="team-photo.jpg?v=20261011" alt="" loading="lazy"></div>';
  }

  function fmtShort(ds) { var d = new Date(ds + 'T00:00:00'); return d.getDate() + ' ' + TH_MON_S[d.getMonth()]; }

  /* Calendar in v3 style: filled day tiles with a short tag.
     Managers see the leaves they are already allowed to see (getVisibleEmails);
     everyone else sees only their own leaves — same as before. */
  function renderCalendarV3() {
    var grid = document.getElementById('dashboard-calendar-days');
    var label = document.getElementById('dashboard-calendar-month');
    if (!grid || !label || !cu || typeof _dashboardCalendarMonth === 'undefined') return;
    var year = _dashboardCalendarMonth.getFullYear(), month = _dashboardCalendarMonth.getMonth();
    var t = todayStr();
    label.textContent = TH_MONTHS[month] + ' ' + (year + 543);
    var ttl = label.parentNode && label.parentNode.querySelector('.dashboard-panel-title');
    if (ttl) ttl.textContent = (cu.role === 'pm' || cu.role === 'lead') ? 'ปฏิทินทีม' : 'ปฏิทินของฉัน';
    var hol = new Map(holidays().map(function (h) { return [h.date, h]; }));
    var isMgr = cu.role === 'pm' || cu.role === 'lead';
    var vis = isMgr ? visibleSet() : new Set([cu.email]);
    var leaves = getLeaves().filter(function (r) { return r.status !== 'rejected' && (vis === null || vis.has(r.email)); });
    var first = new Date(year, month, 1);
    var start = new Date(year, month, 1 - first.getDay());
    var count = typeof getMonthCalendarCellCount === 'function' ? getMonthCalendarCellCount(year, month) : 42;
    var statusName = { pending_lead: 'รอหัวหน้าอนุมัติ', pending_pm: 'รอ PM อนุมัติ', approved: 'อนุมัติแล้ว' };
    var cells = [];
    for (var i = 0; i < count; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var ds = toLocalDateString(d), h = hol.get(ds);
      var on = leaves.filter(function (r) { return r.start <= ds && r.end >= ds; });
      var cls = ['dashboard-calendar-day', 'df-day'];
      if (d.getMonth() !== month) cls.push('other');
      if (ds === t) cls.push('today');
      var tag = '';
      if (h) { cls.push('holiday'); tag = 'หยุด'; }
      else if (on.length) {
        cls.push('on-leave');
        if (on.some(function (r) { return String(r.status).indexOf('pending') === 0; })) cls.push('leave-pending');
        tag = on.map(function (r) { return r.email === cu.email ? (isMgr ? 'คุณ' : plainType(r.type)) : nick(userByEmail(r.email)) || r.name; }).slice(0, 2).join(', ') + (on.length > 2 ? ' +' + (on.length - 2) : '');
      }
      var det = [];
      if (h) det.push(h.name || 'วันหยุดธนาคาร');
      on.forEach(function (r) { det.push((r.email === cu.email ? 'คุณ' : nick(userByEmail(r.email)) || r.name) + ' · ' + plainType(r.type) + ' — ' + (statusName[r.status] || r.status)); });
      cells.push('<div class="' + cls.join(' ') + '"' + (det.length ? ' title="' + esc(det.join(' · ')) + '"' : '') + '><b>' + d.getDate() + '</b>' + (tag ? '<span class="df-day-tag">' + esc(tag) + '</span>' : '') + '</div>');
    }
    grid.innerHTML = cells.join('');
  }

  /* ======================= MY LEAVE (วันลาของฉัน) ======================= */
  function renderMyBalCards() {
    var host = document.getElementById('df-mybal-cards');
    if (!host) {
      var tbody = document.getElementById('my-bal-tbody');
      var card = tbody && tbody.closest('.card');
      if (!card || !card.parentNode) return;
      host = document.createElement('div');
      host.id = 'df-mybal-cards';
      host.className = 'df-mybal-cards';
      card.parentNode.insertBefore(host, card);
    }
    host.innerHTML = ['vacation', 'personal', 'sick', 'dental'].map(balanceFor).filter(Boolean).map(function (b) {
      var low = b.pct < 35;
      var badge = b.pending ? '<span class="df-pill info">รอ ' + b.pending + '</span>' : low ? '<span class="df-pill warn">' + (b.left === 0 ? 'หมดแล้ว' : 'ใกล้หมด') + '</span>' : '';
      return '<div class="df-bal-card"><div class="df-bal-card-head">' + tile(TYPE_ICON[b.type], 34) + '<b>' + esc(plainType(b.type)) + '</b>' + badge + '</div>' +
        '<div class="df-bal-card-num"><b>' + num(b.left) + '</b> <span>/ ' + num(b.quota) + ' วัน</span></div>' +
        '<div class="df-bar"><div class="df-bar-fill' + (low ? ' warn' : '') + '" style="width:' + b.pct + '%"></div></div>' +
        '<div class="df-bal-card-foot">ใช้ไป ' + num(b.used) + ' วัน</div></div>';
    }).join('');
  }

  /* ======================= MOBILE TAB BAR ======================= */
  var TABS = [
    { id: 'dashboard', label: 'ภาพรวม', icon: 'fa-solid fa-table-cells-large', match: ['dashboard'] },
    { id: 'leave-history', label: 'การลา', icon: 'fa-regular fa-calendar', match: ['leave-history', 'my-balance', 'leave-review', 'leave-pm', 'leave-balance', 'team-hist', 'leave-new', 'leave-detail'] },
    { id: 'exercise-log', label: 'ออกกำลังกาย', icon: 'fa-solid fa-person-running', match: ['exercise-log', 'exercise-share', 'exercise-review', 'ex-new'] },
    { id: 'leaderboard', label: 'อันดับ', icon: 'fa-solid fa-trophy', match: ['leaderboard'], fallback: 'exercise-share', fallbackLabel: 'แชร์' },
    { id: 'members', label: 'ทีม', icon: 'fa-solid fa-user-group', match: ['members'], menu: true }
  ];
  function buildTabBar() {
    var app = document.getElementById('main-app');
    if (!app || document.getElementById('df-tabbar')) return;
    var nav = document.createElement('nav');
    nav.id = 'df-tabbar';
    nav.setAttribute('aria-label', 'เมนูด่วน');
    app.appendChild(nav);
    refreshTabBar();
  }
  function allowed(id) { try { return typeof canAccessPage === 'function' ? canAccessPage(id) : true; } catch (e) { return true; } }
  function refreshTabBar() {
    var nav = document.getElementById('df-tabbar');
    if (!nav || !cu) return;
    var current = (document.querySelector('.page.active') || {}).id || '';
    current = current.replace(/^page-/, '');
    nav.innerHTML = TABS.map(function (t) {
      var id = t.id, label = t.label, icon = t.icon;
      if (!allowed(id)) {
        if (t.fallback) { id = t.fallback; label = t.fallbackLabel; icon = 'fa-solid fa-people-pulling'; }
        else if (t.menu) { return '<button type="button" onclick="toggleSidebar()"><i class="fa-solid fa-bars" aria-hidden="true"></i><span>เมนู</span></button>'; }
      }
      var on = t.match.indexOf(current) >= 0 || current === id;
      return '<button type="button"' + (on ? ' aria-current="page"' : '') + ' onclick="showPage(\'' + id + '\')"><i class="' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
    }).join('');
  }


  /* ======================= SHARED KIT (window.DFV3) ======================= */
  var DFV3 = window.DFV3 = window.DFV3 || {};
  DFV3.esc = esc; DFV3.plainType = function (t) { return plainType(t); }; DFV3.num = function (n) { return num(n); };
  DFV3.nick = function (u) { return nick(u); }; DFV3.userByEmail = function (e) { return userByEmail(e); };
  DFV3.balanceFor = function (t) { return balanceFor(t); }; DFV3.tile = function (i, s) { return tile(i, s); };
  DFV3.TYPE_ICON = TYPE_ICON; DFV3.TH_MONTHS = TH_MONTHS; DFV3.TH_MON_S = TH_MON_S;
  DFV3.fmtShort = function (ds) { return fmtShort(ds); };
  DFV3.hook = hook; DFV3.safe = safe; DFV3.holidays = holidays; DFV3.visibleSet = visibleSet;
  DFV3.ROLE_LABEL = { junior: 'Junior', senior: 'Senior', lead: 'Team Lead', pm: 'PM' };
  var AV_TINTS = ['#DAD8FF', '#F8DFD3', '#D6E6FF', '#F6E7C4', '#E3DDF5', '#D8EEDF', '#FBE7F6'];
  /* avatar: profile photo (with the owner's chosen frame) or a coloured initial; colour is stable per email */
  var FRAMES = { brand: 'ไล่สีแบรนด์', sparkle: 'ประกาย', plain: 'เรียบ', none: 'ไม่มีกรอบ' };
  function frameOf(u) { var f = u && u.avatarFrame; return FRAMES[f] ? f : 'brand'; }
  function photoOf(u) {
    if (!u) return null;
    var x = (u.email && userByEmail(u.email)) || u;
    var url = String(u.avatarUrl || x.avatarUrl || '');
    if (!/^(?:https:\/\/firebasestorage\.googleapis\.com\/|blob:|data:image\/(?:jpeg|png|webp);base64,)/.test(url)) return null;
    return { url: url, frame: frameOf(u.avatarFrame ? u : x) };
  }
  function photoHtml(p, size, cls, attrs) {
    var ring = p.frame === 'none' ? 0 : size >= 80 ? 5 : size >= 40 ? 2 : 1.5;
    return '<span class="' + cls + ' df-av-photo f-' + p.frame + '" ' + (attrs || 'aria-hidden="true"') + ' style="width:' + size + 'px;height:' + size + 'px;--ring:' + ring + 'px">' +
      '<img src="' + esc(p.url) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>';
  }
  DFV3.photoOf = function (u) { return photoOf(u); };
  DFV3.photoHtml = function (p, size, cls, attrs) { return photoHtml(p, size, cls || 'df-av', attrs); };
  DFV3.FRAMES = FRAMES;
  DFV3.avatar = function (u, size) {
    size = size || 36;
    var p = photoOf(u);
    if (p) return photoHtml(p, size, 'df-av');
    var key = String((u && u.email) || ''), h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    var letter = (nick(u) || (u && u.name) || '?').trim().replace(/^[\u0E40-\u0E44]+/, '').charAt(0).toUpperCase() || '?';
    return '<span class="df-av" aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px;background:' + AV_TINTS[h % AV_TINTS.length] + '">' + esc(letter) + '</span>';
  };
  DFV3.chip = function (status) {
    var m = { pending_lead: ['รอหัวหน้า', 'pending'], pending_pm: ['รอ PM', 'pm'], approved: ['อนุมัติแล้ว', 'ok'], rejected: ['ไม่อนุมัติ', 'no'], pending: ['รออนุมัติ', 'pending'] }[status] || [status, 'pm'];
    return '<span class="df-chip ' + m[1] + '">' + m[0] + '</span>';
  };
  DFV3.typeChip = function (type) {
    return '<span class="df-tchip ' + (TYPE_ICON[type] || 'ic-acc') + '"><span class="ic"></span>' + esc(plainType(type)) + '</span>';
  };
  DFV3.thDate = function (ds, opts) {
    if (!ds) return '—';
    var d = new Date(ds + 'T00:00:00');
    var s = d.getDate() + ' ' + TH_MON_S[d.getMonth()];
    if (opts && opts.year) s += ' ' + (d.getFullYear() + 543);
    return s;
  };
  DFV3.range = function (a, b) {
    if (!a) return '—';
    if (!b || a === b) return DFV3.thDate(a);
    var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) return da.getDate() + '–' + db.getDate() + ' ' + TH_MON_S[db.getMonth()];
    return DFV3.thDate(a) + ' – ' + DFV3.thDate(b);
  };
  DFV3.header = function (o) {
    /* o: {eyebrow, title, actions(html)} — standard v3 page header */
    return '<header class="df-ph"><div class="df-ph-text">' + (o.eyebrow ? '<span class="df-eyebrow">' + o.eyebrow + '</span>' : '') +
      '<h1 class="df-h1">' + o.title + '</h1></div>' + (o.actions ? '<div class="df-ph-actions">' + o.actions + '</div>' : '') + '</header>';
  };

  /* ---- page registry: v3 views live next to the (hidden) legacy markup ----
     DFV3.registerPage(id, { render: fn(viewEl), refreshOn: ['renderLR', ...], create: bool })
     - existing page: legacy children are moved into a hidden .df-legacy box, so the
       original render functions keep working (they still find their element ids).
     - create:true makes a brand-new page element. */
  var PAGES = {};
  DFV3.registerPage = function (id, def) {
    PAGES[id] = def;
    (def.refreshOn || []).forEach(function (fn) {
      hook(fn, function () { if (isActive(id)) renderPage(id); });
    });
    try { if (typeof VALID_PAGES !== 'undefined' && def.create) VALID_PAGES.add(id); } catch (e) {}
  };
  function isActive(id) { var p = document.getElementById('page-' + id); return !!(p && p.classList.contains('active')); }
  function viewFor(id) {
    var page = document.getElementById('page-' + id);
    if (!page) {
      if (!PAGES[id] || !PAGES[id].create) return null;
      var main = document.querySelector('.main');
      if (!main) return null;
      page = document.createElement('div');
      page.id = 'page-' + id; page.className = 'page';
      main.appendChild(page);
    }
    var view = page.querySelector(':scope > .df-view');
    if (!view) {
      if (!PAGES[id].create) {
        var legacy = document.createElement('div');
        legacy.className = 'df-legacy'; legacy.hidden = true;
        while (page.firstChild) legacy.appendChild(page.firstChild);
        page.appendChild(legacy);
      }
      view = document.createElement('div');
      view.className = 'df-view';
      page.insertBefore(view, page.firstChild);
    }
    return view;
  }
  function renderPage(id) {
    var def = PAGES[id]; if (!def || !cu) return;
    var view = viewFor(id); if (!view) return;
    try { def.render(view); } catch (err) { console.warn('[ui-v3] page ' + id, err); }
  }
  DFV3.renderPage = renderPage;
  DFV3.go = function (id) { showPage(id); };
  var _lastPage = null;
  function onShowPage(id) {
    if (PAGES[id]) {
      var page = document.getElementById('page-' + id);
      if (!page && PAGES[id].create) {
        viewFor(id);
        // original showPage could not activate a page that did not exist yet
        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        document.getElementById('page-' + id).classList.add('active');
        var nv = document.querySelector('[onclick="showPage(\'' + id + '\')"]'); if (nv) nv.classList.add('active');
      }
      renderPage(id);
      if (_lastPage !== id) window.scrollTo(0, 0);
    }
    _lastPage = id;
  }

  /* ======================= SIDEBAR / PROFILE ======================= */
  function decorateSidebar() {
    if (!cu) return;
    var role = document.getElementById('sb-role');
    if (role) role.textContent = (DFV3.ROLE_LABEL[cu.role] || cu.role) + (cu.dept ? ' · ' + cu.dept : '');
    var av = document.getElementById('sb-avatar');
    var me = userByEmail(cu.email) || cu, myPhoto = photoOf(me);
    var letter = (nick(cu) || cu.name || '?').replace(/^[\u0E40-\u0E44]+/, '').charAt(0).toUpperCase();
    var paintAv = function (el) {
      if (!el) return;
      el.classList.toggle('df-has-photo', !!myPhoto);
      if (myPhoto) el.innerHTML = '<img src="' + esc(myPhoto.url) + '" alt="" referrerpolicy="no-referrer">'; else el.textContent = letter;
      el.style.color = '';
    };
    paintAv(av);
    // the whole "ขุนทอง" menu (นัดตีแบด, เรียกเก็บเงิน) is for PM and Team Lead only
    var khun = document.getElementById('nav-sec-khun');
    if (khun) khun.style.display = (cu.role === 'pm' || cu.role === 'lead') ? '' : 'none';
    // "UXUI Work Space" (Quick Panel) — UXUI department only
    var ws = document.getElementById('nav-sec-uxui');
    if (ws) ws.style.display = String(cu.dept || '').trim().toUpperCase() === 'UXUI' ? '' : 'none';
    // mobile top bar: avatar shortcut to the profile (theme + text size live there)
    var bar = document.querySelector('.mobile-nav-bar');
    if (bar && !document.getElementById('df-m-avatar')) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'df-m-avatar'; b.setAttribute('aria-label', 'โปรไฟล์และการแสดงผล');
      b.onclick = function () { showPage('profile'); };
      bar.appendChild(b);
    }
    var mav = document.getElementById('df-m-avatar');
    paintAv(mav);
    var team = document.getElementById('df-sb-team');
    if (team) team.textContent = cu.dept ? 'ทีม ' + cu.dept : 'ระบบจัดการทีม';
  }

  function serviceText(start) {
    if (!start) return '—';
    var s = new Date(start + 'T00:00:00'), n = new Date();
    var months = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth()) - (n.getDate() < s.getDate() ? 1 : 0);
    if (months < 0) return '—';
    var y = Math.floor(months / 12), m = months % 12;
    return (y ? y + ' ปี ' : '') + m + ' เดือน';
  }
  DFV3.serviceText = serviceText;

  var _profileTab = 'info';
  DFV3.profileTab = function (t) { _profileTab = t === 'display' ? 'display' : 'info'; renderPage('profile'); };
  /* ======================= GUIDED TOUR ("วิธีใช้งาน", design J) =======================
     UI only. Shown once on the first visit to the dashboard (remembered in localStorage df-tour-done),
     and any time from the "วิธีใช้งาน" button. */
  var TOUR_ALL = [
    null,
    ['nav', 'เมนูหลัก', 'ทุกอย่างอยู่ในเมนูนี้ — การลา, ออกกำลังกาย, Leaderboard และสมาชิกทีม บนมือถือจะอยู่แถบด้านล่าง'],
    ['display', 'ปรับการแสดงผล', 'เลือกโหมดสว่าง/มืด และขนาดตัวอักษร (เล็กลง · ปกติ · ใหญ่ขึ้น) ได้ที่ปุ่ม "การแสดงผล" ใต้ชื่อของคุณ — บนมือถือกดรูปโปรไฟล์มุมบนขวา แล้วเลือกแท็บ "การแสดงผล"'],
    ['leave', 'ยื่นใบลา', 'กดที่นี่เพื่อยื่นใบลา ระบบบอกวันคงเหลือ และเช็กให้ว่าลาล่วงหน้าครบ 7 วันหรือยัง ก่อนส่ง'],
    ['exercise', 'ยื่นเบิกออกกำลังกาย', 'ออกกำลังกายแล้วกดที่นี่เพื่อเบิกเงิน เลือกประเภท วันที่ แล้วแนบวิดีโอหรือรูปหลักฐาน ระบบเช็กโควต้าให้ก่อนส่ง'],
    ['approve', 'งานอนุมัติของคุณ', 'ใบลาและการเบิกออกกำลังกายที่รอคุณอนุมัติอยู่ในเมนูนี้ ตัวเลขสีแดงคือจำนวนรายการที่รออยู่'],
    ['cards', 'ตัวเลขสำคัญของคุณ', 'วันลาคงเหลือ ใบลารออนุมัติ เงินออกกำลังกาย และวันหยุดถัดไป ดูได้ทันทีที่เข้าระบบ'],
    ['cal', 'ปฏิทินทีม', 'เห็นว่าใครลาวันไหน และวันหยุดธนาคาร ช่วยให้วางแผนลาไม่ชนกับเพื่อน'],
    ['bell', 'การแจ้งเตือน', 'ผลอนุมัติใบลา ตัดรอบเบิก และวันเกิดเพื่อน จะแจ้งที่กระดิ่งนี้'],
    [null, 'พร้อมใช้งานแล้ว', 'เคล็ดลับ: ตั้งรูปโปรไฟล์และกรอบรูปได้ที่ปุ่ม "โปรไฟล์" ใต้ชื่อของคุณ · เปิดทัวร์นี้อีกครั้งที่ปุ่ม "วิธีใช้งาน"']
  ];
  var TOUR = TOUR_ALL, tourStep = -1, tourEl = null, holeEl = null;
  function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== 'hidden'; }
  function tourTarget(k) {
    var q = function (sel) { return document.querySelector(sel); };
    if (k === 'nav') { var tb = q('#df-tabbar'); return visible(tb) ? tb : q('.df-sidebar .nav-section:nth-of-type(2)') ? q('.df-sidebar') : null; }
    if (k === 'leave') return q('#page-dashboard .dashboard-head-actions .btn-primary');
    if (k === 'exercise') return q('#page-dashboard .dashboard-head-actions [onclick^="openExModal"]');
    if (k === 'approve') { var a = ['#nav-leave-review', '#nav-leave-pm', '#nav-ex-review'].map(q).filter(function (n) { return n && n.style.display !== 'none' && visible(n); }); return a[0] ? a[0].parentNode : null; }
    if (k === 'cards') return q('#page-dashboard .dashboard-stats');
    if (k === 'cal') { var d = q('#dashboard-calendar-days'); return d && d.closest('.dashboard-panel'); }
    if (k === 'bell') return q('#notif-bell');
    if (k === 'display') { var ua = q('.df-user-actions .df-ua:nth-child(2)'); return visible(ua) ? ua : q('#df-m-avatar'); }
    return null;
  }
  function placeHole() {
    if (!holeEl || tourStep < 1) return;
    var cur = TOUR[tourStep], t = cur && cur[0] && tourTarget(cur[0]);
    if (!t || !visible(t)) { holeEl.className = 'df-tour-hole full'; holeEl.removeAttribute('style'); return; }
    var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var r = t.getBoundingClientRect(), pad = 6;
    holeEl.className = 'df-tour-hole';
    holeEl.style.left = ((r.left - pad) / z) + 'px'; holeEl.style.top = ((r.top - pad) / z) + 'px';
    holeEl.style.width = ((r.width + pad * 2) / z) + 'px'; holeEl.style.height = ((r.height + pad * 2) / z) + 'px';
  }
  function tourKey() { return 'df-tour-done:' + String((typeof cu !== 'undefined' && cu && cu.email) || '').toLowerCase(); }
  function finishTour() {
    try { localStorage.setItem(tourKey(), '1'); localStorage.setItem('df-tour-done', '1'); } catch (e) {}
    tourStep = -1;
    if (tourEl) tourEl.hidden = true;
    if (holeEl) holeEl.hidden = true;
  }
  function paintTour() {
    if (!tourEl) {
      tourEl = document.createElement('div'); tourEl.id = 'df-tour';
      holeEl = document.createElement('div'); holeEl.className = 'df-tour-hole';
      document.body.appendChild(holeEl); document.body.appendChild(tourEl);
      tourEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-t-next]')) { if (tourStep >= TOUR.length - 1) finishTour(); else { tourStep++; paintTour(); } }
        else if (e.target.closest('[data-t-back]')) { tourStep = Math.max(1, tourStep - 1); paintTour(); }
        else if (e.target.closest('[data-t-skip]')) finishTour();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tourStep >= 0) finishTour(); });
      window.addEventListener('resize', placeHole); window.addEventListener('scroll', placeHole, true);
    }
    var last = TOUR.length - 1;
    tourEl.hidden = false; holeEl.hidden = false;
    if (tourStep === 0) {
      holeEl.className = 'df-tour-hole full'; holeEl.removeAttribute('style');
      tourEl.className = 'df-tour-welcome';
      var who = (typeof cu !== 'undefined' && cu) ? (nick(cu) || '') : '';
      var burst = '';
      for (var bi = 0; bi < 14; bi++) burst += '<i style="--a:' + (bi * 360 / 14) + 'deg;--d:' + (bi % 3) * 60 + 'ms;--c:' + ['#8B8BF5', '#F29AD0', '#7EC8FF', '#FFC56B', '#9DE0B5'][bi % 5] + '"></i>';
      tourEl.innerHTML = '<div class="df-tour-fx" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b4"></span></div>' +
        '<div class="df-tour-card welcome" role="dialog" aria-modal="true" aria-labelledby="df-tour-w">' +
        '<div class="df-tour-logo"><span class="ring"></span><span class="burst" aria-hidden="true">' + burst + '</span><img src="brand-v3.png?v=20261011" alt="" width="72" height="72"></div>' +
        (who ? '<span class="df-tour-hi">สวัสดี ' + esc(who) + ' 👋</span>' : '') +
        '<h2 id="df-tour-w">ยินดีต้อนรับสู่ Design Flow</h2><p>ระบบลา ออกกำลังกาย และข้อมูลทีม รวมไว้ในที่เดียว<br>ใช้เวลาแนะนำแค่ 1 นาที</p>' +
        '<button type="button" class="df-tour-go" data-t-next>เริ่มทัวร์</button>' +
        '<button type="button" class="df-tour-skip" data-t-skip>ข้ามไปก่อน · ดูได้ภายหลังที่ปุ่ม "วิธีใช้งาน"</button></div>';
      var g = tourEl.querySelector('[data-t-next]'); if (g) g.focus();
      return;
    }
    var cur = TOUR[tourStep], t = cur[0] && tourTarget(cur[0]);
    if (t && t.scrollIntoView) { var r = t.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) t.scrollIntoView({ block: 'center' }); }
    tourEl.className = 'df-tour-stepwrap';
    var dots = TOUR.slice(1).map(function (_, i) { return '<span class="' + (i + 1 === tourStep ? 'on' : '') + '"></span>'; }).join('');
    tourEl.innerHTML = '<div class="df-tour-card step" role="dialog" aria-live="polite" aria-labelledby="df-tour-t">' +
      '<div class="df-tour-top"><span>ขั้นที่ ' + tourStep + ' / ' + last + '</span><button type="button" class="df-tour-x" data-t-skip aria-label="ปิดทัวร์">×</button></div>' +
      '<h2 id="df-tour-t">' + esc(cur[1]) + '</h2><p>' + esc(cur[2]) + '</p>' +
      '<div class="df-tour-foot"><span class="df-tour-dots" aria-hidden="true">' + dots + '</span><span class="df-tour-btns">' +
      (tourStep > 1 ? '<button type="button" class="df-tour-back" data-t-back>ย้อนกลับ</button>' : '') +
      '<button type="button" class="df-tour-next" data-t-next>' + (tourStep === last ? 'เริ่มใช้งาน' : 'ถัดไป') + '</button></span></div></div>';
    placeHole();
    setTimeout(placeHole, 350);
    var n = tourEl.querySelector('[data-t-next]'); if (n) n.focus();
  }
  function buildTour() {
    TOUR = TOUR_ALL.filter(function (st) { return !st || !st[0] || visible(tourTarget(st[0])); });
  }
  DFV3.startTour = function () {
    if (typeof showPage === 'function' && !(document.getElementById('page-dashboard') || {}).classList.contains('active')) showPage('dashboard');
    tourStep = 0; setTimeout(function () { buildTour(); paintTour(); }, 50);
  };
  function maybeAutoTour() {
    if (typeof cu === 'undefined' || !cu) return;
    var seen = false; try { seen = localStorage.getItem(tourKey()) === '1'; } catch (e) { seen = true; }
    if (seen || tourStep >= 0) return;
    var dash = document.getElementById('page-dashboard');
    if (dash && dash.classList.contains('active')) { buildTour(); tourStep = 0; paintTour(); }
  }

  /* logout confirmation (calls the legacy doLogout only after the user confirms) */
  DFV3.confirmLogout = function () {
    var m = document.getElementById('df-logout');
    if (!m) {
      m = document.createElement('div'); m.id = 'df-logout'; m.className = 'df-inv-scrim';
      m.innerHTML = '<div class="df-confirm" role="alertdialog" aria-modal="true" aria-labelledby="df-logout-t" aria-describedby="df-logout-d">' +
        '<span class="df-confirm-ic" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"></path><path d="M10 16l-4-4 4-4M6 12h10"></path></svg></span>' +
        '<h2 id="df-logout-t">ออกจากระบบ?</h2><p id="df-logout-d">ครั้งหน้าเข้าใหม่ได้ด้วยปุ่ม "เข้าสู่ระบบด้วย Google"</p>' +
        '<div class="df-confirm-act"><button type="button" class="df-confirm-no" data-x>ยกเลิก</button><button type="button" class="df-confirm-yes" data-go>ออกจากระบบ</button></div></div>';
      m.addEventListener('click', function (e) {
        if (e.target === m || e.target.closest('[data-x]')) { m.hidden = true; return; }
        if (e.target.closest('[data-go]')) { m.hidden = true; if (typeof window.doLogout === 'function') window.doLogout(); }
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) m.hidden = true; });
      document.body.appendChild(m);
    }
    m.hidden = false;
    var b = m.querySelector('[data-x]'); if (b) b.focus();
  };
  DFV3.openDisplaySettings = function () { _profileTab = 'display'; showPage('profile'); };

  /* ======================= PROFILE PHOTO + FRAME =======================
     The only writes this layer makes itself (new feature, no legacy equivalent):
       1. uploadFileToStorage(file, { kind: 'avatar' })  -> new file under avatars/ (nothing overwritten)
       2. api('updateMyProfile', { avatarUrl, avatarFrame }) -> gateway merges ONLY avatar_* fields of the signed-in user
     Then the local users cache is refreshed for this user only. */
  var PHOTO = { busy: false, msg: '', msgType: 'ok' };
  var AVATAR_MAX = 5 * 1024 * 1024;
  function photoMsg(text, type) { PHOTO.msg = text; PHOTO.msgType = type || 'ok'; }
  function rerenderProfile() { try { DFV3.renderPage('profile'); } catch (e) {} try { decorateSidebar(); } catch (e) {} }
  function applyLocal(fields) {
    try {
      var users = getUsers(), i = users.findIndex(function (x) { return String(x.email).toLowerCase() === String(cu.email).toLowerCase(); });
      if (i >= 0) { Object.assign(users[i], fields); saveUsers(users); }
    } catch (e) {}
    try { Object.assign(cu, fields); } catch (e) {}
  }
  function squareJpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(512, side);
          var c = document.createElement('canvas'); c.width = c.height = out;
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out, out);
          g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
          c.toBlob(function (b) { URL.revokeObjectURL(url); b ? resolve(new File([b], 'avatar.jpg', { type: 'image/jpeg' })) : reject(new Error('แปลงรูปไม่สำเร็จ')); }, 'image/jpeg', 0.88);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่สำเร็จ')); };
      img.src = url;
    });
  }
  function saveProfile(fields) {
    return Promise.resolve(api('updateMyProfile', fields)).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'บันทึกไม่สำเร็จ');
      applyLocal({ avatarUrl: r.avatarUrl != null ? r.avatarUrl : fields.avatarUrl, avatarFrame: r.avatarFrame || fields.avatarFrame || frameOf(cu) });
      return r;
    });
  }
  function onPhotoFile(file) {
    if (!file || PHOTO.busy) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { photoMsg('รองรับเฉพาะรูป JPG, PNG หรือ WebP', 'err'); return rerenderProfile(); }
    if (file.size > AVATAR_MAX) { photoMsg('รูปใหญ่เกิน 5 MB', 'err'); return rerenderProfile(); }
    PHOTO.busy = true; photoMsg(''); rerenderProfile();
    squareJpeg(file).then(function (jpg) { return uploadFileToStorage(jpg, { kind: 'avatar' }); }).then(function (up) {
      if (!up || !up.ok) throw new Error((up && up.error) || 'อัปโหลดไม่สำเร็จ');
      return saveProfile({ avatarUrl: up.url, avatarFrame: frameOf(userByEmail(cu.email) || cu) });
    }).then(function () { photoMsg('บันทึกรูปโปรไฟล์ใหม่แล้ว', 'ok'); }, function (e) { photoMsg('⚠️ ' + (e && e.message || 'บันทึกรูปไม่สำเร็จ'), 'err'); })
      .then(function () { PHOTO.busy = false; rerenderProfile(); refreshViews(); });
  }
  DFV3.pickPhoto = function () {
    if (PHOTO.busy) return;
    var inp = document.getElementById('df-photo-input');
    if (!inp) {
      inp = document.createElement('input'); inp.type = 'file'; inp.id = 'df-photo-input'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.hidden = true;
      inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.value = ''; onPhotoFile(f); });
      document.body.appendChild(inp);
    }
    inp.click();
  };
  DFV3.setFrame = function (f) {
    if (PHOTO.busy || !FRAMES[f] || frameOf(userByEmail(cu.email) || cu) === f) return;
    PHOTO.busy = true; photoMsg(''); rerenderProfile();
    saveProfile({ avatarFrame: f }).then(function () { photoMsg('เปลี่ยนกรอบรูปแล้ว', 'ok'); }, function (e) { photoMsg('⚠️ ' + (e && e.message || 'บันทึกไม่สำเร็จ'), 'err'); })
      .then(function () { PHOTO.busy = false; rerenderProfile(); refreshViews(); });
  };
  DFV3.clearPhoto = function () {
    if (PHOTO.busy) return;
    PHOTO.busy = true; photoMsg(''); rerenderProfile();
    saveProfile({ avatarUrl: '' }).then(function () { photoMsg('กลับไปใช้ตัวอักษรแล้ว', 'ok'); }, function (e) { photoMsg('⚠️ ' + (e && e.message || 'บันทึกไม่สำเร็จ'), 'err'); })
      .then(function () { PHOTO.busy = false; rerenderProfile(); refreshViews(); });
  };
  function refreshViews() { /* other pages pick up the new photo on their next render */ }

  /* Google Drive for exercise proof — connect card, shown to the Drive owner only (server enforces it too) */
  var DRIVE_OWNER = 'rattikun.k@gmail.com';
  var DRV = { loading: false, loaded: false, connected: false, configured: true, email: '', err: '' };
  function drivePost(path) {
    var token = typeof designFlowSessionToken === 'function' ? designFlowSessionToken() : '';
    return fetch(DESIGN_FLOW_GATEWAY_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.ok === false) throw new Error(d.error || 'HTTP_' + r.status); return d; }); });
  }
  function loadDrive() {
    if (DRV.loading) return; DRV.loading = true;
    drivePost('/drive/status').then(function (d) { DRV.connected = !!d.connected; DRV.configured = d.configured !== false; DRV.email = d.email || ''; DRV.err = ''; },
      function (e) { DRV.err = e.message === 'NOT_FOUND' || /HTTP_404/.test(e.message) ? 'NOT_DEPLOYED' : e.message; })
      .then(function () { DRV.loading = false; DRV.loaded = true; rerenderProfile(); });
  }
  DFV3.connectDrive = function () {
    drivePost('/drive/connect').then(function (d) { location.href = d.url; }, function (e) { DRV.err = e.message; rerenderProfile(); });
  };
  function driveCard() {
    if (!cu || String(cu.email).toLowerCase() !== DRIVE_OWNER) return '';
    if (!DRV.loaded) { loadDrive(); }
    var st = !DRV.loaded ? '<span class="df-muted">กำลังตรวจสอบ…</span>'
      : DRV.err === 'NOT_DEPLOYED' || !DRV.configured ? '<span class="df-drive-st off">ยังไม่พร้อม · ต้องตั้งค่าระบบหลังบ้านก่อน</span>'
      : DRV.connected ? '<span class="df-drive-st on">เชื่อมแล้ว · ' + esc(DRV.email) + '</span>'
      : '<span class="df-drive-st off">ยังไม่ได้เชื่อม</span>';
    var canConnect = DRV.loaded && DRV.configured && DRV.err !== 'NOT_DEPLOYED';
    return '<section class="df-card"><div class="df-card-head"><h2>Google Drive สำหรับหลักฐานออกกำลังกาย</h2>' + st + '</div>' +
      '<p class="df-muted">ไฟล์ที่ทีมอัปโหลดตอนยื่นเบิกจะเก็บใน Drive นี้ แยกโฟลเดอร์ตามแผนก → คน → เดือน ระบบเห็นเฉพาะไฟล์ที่ระบบสร้างเอง</p>' +
      (DRV.err && DRV.err !== 'NOT_DEPLOYED' ? '<div class="df-photo-msg err" style="margin:0">⚠️ ' + esc(DRV.err) + '</div>' : '') +
      (canConnect ? '<div class="df-profile-actions"><button type="button" class="btn ' + (DRV.connected ? 'btn-ghost' : 'btn-primary') + '" onclick="DFV3.connectDrive()">' + (DRV.connected ? 'เชื่อมใหม่' : 'เชื่อม Google Drive') + '</button></div>' : '') +
      '</section>';
  }

  function renderProfile(view) {
    var u = userByEmail(cu.email) || cu;
    var loc = u.locationType === 'province' ? 'ต่างจังหวัด' : 'กรุงเทพ';
    var bday = u.birthday ? (function () { var d = new Date(u.birthday + 'T00:00:00'); return d.getDate() + ' ' + TH_MON_S[d.getMonth()]; })() : '—';
    var field = function (k, v) { return '<div class="df-field"><span>' + k + '</span><b>' + esc(v || '—') + '</b></div>'; };
    var tab = function (id, label) {
      var on = _profileTab === id;
      return '<button type="button" role="tab" id="df-ptab-' + id + '" aria-selected="' + on + '" aria-controls="df-ppanel" class="df-ptab' + (on ? ' on' : '') + '" onclick="DFV3.profileTab(\'' + id + '\')">' + label + '</button>';
    };
    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var font = document.documentElement.getAttribute('data-font') || 'md';
    var seg = function (attr, val, cur, fn, icon, label, hint) {
      var on = val === cur;
      return '<button type="button" class="df-opt' + (on ? ' on' : '') + '" ' + attr + '="' + val + '" aria-pressed="' + on + '" onclick="' + fn + '(\'' + val + '\');DFV3.renderPage(\'profile\')">' +
        '<span class="df-opt-ic" aria-hidden="true">' + icon + '</span><b>' + label + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</button>';
    };
    var SUN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
    var MOON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg>';
    var A = function (px) { return '<span style="font-size:' + px + 'px;font-weight:700;line-height:1">ก</span>'; };

    var info = '<section class="df-card"><div class="df-card-head"><h2>ข้อมูลส่วนตัวและการทำงาน</h2><span class="df-lock"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>แก้ไขได้โดยหัวหน้าทีม / PM เท่านั้น</span></div>' +
      '<div class="df-fields">' + field('ชื่อ–นามสกุล', u.name) + field('ชื่อเล่น', u.nickname) + field('อีเมล', u.email) +
      field('ตำแหน่ง', DFV3.ROLE_LABEL[u.role] || u.role) + field('ทีม', u.dept) + field('พื้นที่', loc) +
      field('วันเริ่มงาน', u.startDate ? DFV3.thDate(u.startDate, { year: true }) : '—') + field('อายุงาน', serviceText(u.startDate)) + field('วันเกิด', bday) + '</div>' +
      '<p class="df-muted">ข้อมูลไม่ถูกต้อง? แจ้งหัวหน้าทีมหรือ PM เพื่อแก้ไข</p></section>';

    var display = '<section class="df-card"><div class="df-card-head"><h2>ธีม</h2></div>' +
      '<div class="df-opts" role="group" aria-label="ธีม">' +
      seg('data-df-theme', 'light', theme, 'dfSetTheme', SUN, 'สว่าง', '') + seg('data-df-theme', 'dark', theme, 'dfSetTheme', MOON, 'มืด', '') + '</div></section>' +
      '<section class="df-card"><div class="df-card-head"><h2>ขนาดตัวอักษร</h2><span class="df-muted">ใช้กับทุกหน้าในเว็บ · จำค่าไว้ในเครื่องนี้</span></div>' +
      '<div class="df-opts df-opts-3" role="group" aria-label="ขนาดตัวอักษร">' +
      seg('data-df-font', 'sm', font, 'dfSetFont', A(15), 'เล็กลง', '87.5%') + seg('data-df-font', 'md', font, 'dfSetFont', A(20), 'ปกติ', '100%') + seg('data-df-font', 'lg', font, 'dfSetFont', A(25), 'ใหญ่ขึ้น', '112.5%') + '</div>' +
      '<div class="df-font-sample"><b>ตัวอย่างข้อความ</b><span>ลาพักร้อน 2 วัน · 12–13 ต.ค. · รออนุมัติจากหัวหน้าทีม</span></div></section>';

    var p = photoOf(u), fr = frameOf(u), busy = PHOTO.busy;
    var CAM = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>';
    var inner = p ? '<img src="' + esc(p.url) + '" alt="รูปโปรไฟล์ของคุณ" referrerpolicy="no-referrer">'
      : DFV3.avatar({ email: u.email, nickname: u.nickname, name: u.name }, 122).replace('class="df-av"', 'class="df-av df-ring-letter" role="img" aria-label="รูปโปรไฟล์ของคุณ"').replace('aria-hidden="true" ', '');
    var frames = Object.keys(FRAMES).map(function (id) {
      var on = fr === id;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="df-frame' + (on ? ' on' : '') + '"' + (busy ? ' disabled' : '') + ' onclick="DFV3.setFrame(\'' + id + '\')"><span class="sw f-' + id + '" aria-hidden="true"></span>' + FRAMES[id] + '</button>';
    }).join('');
    var account = '<section class="df-card"><div class="df-card-head"><h2>บัญชี</h2></div><div class="df-profile-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="openChangePass()">เปลี่ยนรหัสผ่าน</button><button type="button" class="btn btn-ghost df-danger" onclick="DFV3.confirmLogout()">ออกจากระบบ</button></div></section>';
    view.innerHTML = DFV3.header({ eyebrow: 'บัญชีของฉัน', title: 'โปรไฟล์ของฉัน' }) +
      '<section class="df-card df-profile-hero"><div class="df-profile-cover" aria-hidden="true"><img src="team-photo.jpg?v=20261011" alt=""></div>' +
      '<div class="df-profile-row"><div class="df-pava">' +
      '<div class="df-ring f-' + fr + (busy ? ' is-busy' : '') + '"><span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span><div class="inner">' + inner + '</div></div>' +
      '<span class="df-online"><i></i>ออนไลน์</span>' +
      '<button type="button" class="df-pcam" onclick="DFV3.pickPhoto()" aria-label="เปลี่ยนรูปโปรไฟล์"' + (busy ? ' disabled' : '') + '>' + CAM + '</button></div>' +
      '<div class="df-profile-name"><h2>' + esc(nick(u)) + '</h2><span>' + esc(u.name) + ' · ' + esc(DFV3.ROLE_LABEL[u.role] || u.role) + (u.dept ? ' · ' + esc(u.dept) : '') + '</span></div>' +
      '<div class="df-profile-actions">' + (p ? '<button type="button" class="btn btn-ghost" onclick="DFV3.clearPhoto()"' + (busy ? ' disabled' : '') + '>ใช้ตัวอักษรแทน</button>' : '') +
      '<button type="button" class="btn btn-primary" onclick="DFV3.pickPhoto()"' + (busy ? ' disabled' : '') + '>' + (busy ? 'กำลังบันทึก…' : 'อัปโหลดรูปใหม่') + '</button></div></div>' +
      '<div class="df-frames"><span class="lbl">กรอบรูป</span><div role="radiogroup" aria-label="กรอบรูปโปรไฟล์" class="df-frame-list">' + frames + '</div></div>' +
      '<p class="df-photo-hint">รองรับ JPG, PNG ไม่เกิน 5 MB · แนะนำรูปสี่เหลี่ยมจัตุรัส เห็นหน้าชัด · รูปนี้จะแสดงในปฏิทินทีม ใบลา และ Leaderboard</p>' +
      (PHOTO.msg ? '<div role="status" class="df-photo-msg ' + PHOTO.msgType + '">' + esc(PHOTO.msg) + '</div>' : '') +
      '<div class="df-ptabs" role="tablist" aria-label="หมวดโปรไฟล์">' + tab('info', 'ข้อมูลส่วนตัว') + tab('display', 'การแสดงผล') + '</div></section>' +
      '<div id="df-ppanel" role="tabpanel" aria-labelledby="df-ptab-' + _profileTab + '" class="df-view">' + (_profileTab === 'display' ? display + driveCard() + account : info) + '</div>';
  }

  /* ======================= CALENDAR TOOLTIP =======================
     Instant styled tooltip for calendar cells (holiday name, who is on leave).
     Uses the cell's own title text; UI only. */
  var TIP_SEL = '.df-leave-day, .dashboard-calendar-day, .df-leave-thol, .df-leave-tchip, button.df-ex-cal';
  var tipEl = null, tipFor = null;
  function tipText(el) {
    if (el.hasAttribute('title')) { el.setAttribute('data-df-tip', el.getAttribute('title')); el.removeAttribute('title'); }
    return el.getAttribute('data-df-tip') || '';
  }
  function showTip(el) {
    var text = tipText(el);
    if (!text) return hideTip();
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'df-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.textContent = text;
    tipEl.hidden = false; tipFor = el;
    var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    var r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    // rects are in screen px; fixed offsets are scaled by the root zoom (text-size setting)
    var left = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    var top = r.top - t.height - 8;
    tipEl.classList.toggle('below', top < 8);
    if (top < 8) top = r.bottom + 8;
    tipEl.style.left = (left / z) + 'px'; tipEl.style.top = (top / z) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; tipFor = null; }
  function installTips() {
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest(TIP_SEL);
      if (el && (el.hasAttribute('title') || el.hasAttribute('data-df-tip'))) { if (el !== tipFor) showTip(el); }
      else if (tipFor) hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var el = e.target.closest && e.target.closest(TIP_SEL);
      if (el && (el.hasAttribute('title') || el.hasAttribute('data-df-tip'))) showTip(el); else hideTip();
    });
    ['scroll', 'click'].forEach(function (ev) { window.addEventListener(ev, hideTip, true); });
  }

  /* ======================= INSTALL ======================= */
  function install() {
    if (typeof renderDashboardCalendar === 'function') window.renderDashboardCalendar = safe(renderCalendarV3);
    installTips();
    // documents stored in Google Drive: show Drive's own preview inside the legacy popup (view only)
    hook('viewDocPopup', function (url) {
      var m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(String(url || ''));
      var body = document.getElementById('doc-preview-body');
      if (!m || !body) return;
      body.innerHTML = '<iframe src="https://drive.google.com/file/d/' + m[1] + '/preview" style="width:100%;height:75vh;border:none;border-radius:8px;" allow="autoplay" title="เอกสาร"></iframe>' +
        '<p class="df-muted" style="margin:8px 0 0;font-size:13px">ถ้าไม่แสดง ให้กด "เปิดในแท็บใหม่" แล้วล็อกอิน Google ด้วยอีเมลที่ใช้ในระบบ</p>';
    });
    hook('updateDashboard', renderDashExtras);
    hook('showPage', function (id) { onShowPage(id); refreshTabBar(); if (id === 'dashboard') setTimeout(maybeAutoTour, 900); });
    hook('setupSidebar', decorateSidebar);
    DFV3.registerPage('profile', { create: true, render: renderProfile });
    hook('launchApp', function () { buildTabBar(); refreshTabBar(); setTimeout(maybeAutoTour, 1200); });
    if (document.getElementById('main-app') && document.getElementById('main-app').style.display !== 'none') { buildTabBar(); setTimeout(maybeAutoTour, 1500); }
  }
  install();
})();

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
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__dfv3) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      safe(after).apply(this, arguments);
      return r;
    };
    wrapped.__dfv3 = true;
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
        return { date: r.start < t ? t : r.start, kind: 'leave', title: who + ' · ' + plainType(r.type),
          sub: (String(r.status).indexOf('pending') === 0 ? 'รออนุมัติ · ' : '') + num(effectiveLeaveDays(r)) + ' วัน' + range };
      });
      holidays().filter(function (h) { return h.date >= t; }).forEach(function (h) {
        items.push({ date: h.date, kind: 'hol', title: h.name || 'วันหยุดธนาคาร', sub: 'วันหยุดธนาคาร' });
      });
      items.sort(function (a, b) { return a.date.localeCompare(b.date); });
      upEl.innerHTML = items.slice(0, 5).map(function (it) {
        var d = new Date(it.date + 'T00:00:00');
        return '<div class="df-up-row"><div class="df-datebox ' + it.kind + '"><b>' + d.getDate() + '</b><span>' + TH_MON_S[d.getMonth()] + '</span></div>' +
          '<div class="df-up-main"><div class="df-up-title">' + esc(it.title) + '</div><div class="df-up-sub">' + esc(it.sub) + '</div></div></div>';
      }).join('') || '<div class="dashboard-empty">ยังไม่มีวันลาหรือวันหยุดที่จะถึง</div>';
    }

    // keep "ใบลาที่ต้องติดตาม" panel only when there is something to follow up
    var att = document.getElementById('d-leave-actions');
    var attPanel = att && att.closest('.dashboard-panel');
    if (attPanel) attPanel.hidden = !att.querySelector('.dashboard-list-item');
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
    { id: 'leave-history', label: 'การลา', icon: 'fa-regular fa-calendar', match: ['leave-history', 'my-balance', 'leave-review', 'leave-pm', 'leave-balance', 'team-hist'] },
    { id: 'exercise-log', label: 'ออกกำลังกาย', icon: 'fa-solid fa-person-running', match: ['exercise-log', 'exercise-share', 'exercise-review'] },
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

  /* ======================= INSTALL ======================= */
  function install() {
    if (typeof renderDashboardCalendar === 'function') window.renderDashboardCalendar = safe(renderCalendarV3);
    hook('updateDashboard', renderDashExtras);
    hook('renderMyBal', renderMyBalCards);
    hook('showPage', refreshTabBar);
    hook('launchApp', function () { buildTabBar(); refreshTabBar(); });
    if (document.getElementById('main-app') && document.getElementById('main-app').style.display !== 'none') { buildTabBar(); }
  }
  install();
})();

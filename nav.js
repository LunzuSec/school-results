// ============================================================
// nav.js — Shared navigation + auth helper for Lunzu SS
// Hosted at: /nav.js  (GitHub Pages root)
// Used by: index.html, results.html, Subscribe.html,
//          fee-portal.html, admin.html, admin-reports.html,
//          admin-teachers.html, AdminAlerts.html
// ============================================================
(function (global) {
  'use strict';

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbwSe_HeUAigVjBiN-rmcq0FPiJRKsLBBtw2VGGhLWlMCrIvT3WeQ0MpjdMdI4HDGnkbZQ/exec';
  var PW_KEY = 'lss_admin_pw';
  var BASE = ''; // pages live at repo root — no base needed

  var LONG_ACTIONS = {
    generateClassPDF: true,
    generateNoticeBoardPDF: true,
    generateAllNoticeBoardPDF: true,
    generatePDF: true,
    generatePDFAdmin: true
  };
  var QUICK_TIMEOUT_MS = 20000;
  var LONG_TIMEOUT_MS  = 300000;

  // ============================================================
  // Auth helpers
  // ============================================================
  function getAdminPassword() {
    try { return sessionStorage.getItem(PW_KEY) || null; }
    catch (e) { return null; }
  }
  function setAdminPassword(pw) {
    try { sessionStorage.setItem(PW_KEY, pw); } catch (e) {}
  }
  function clearAdminPassword() {
    try { sessionStorage.removeItem(PW_KEY); } catch (e) {}
  }
  function hasAdminSession() { return !!getAdminPassword(); }

  /**
   * Redirect to admin.html if no admin session exists.
   * Call this at the very top of any admin-only page.
   */
  function requireAdmin() {
    if (hasAdminSession()) return true;
    // preserve intended destination
    try {
      sessionStorage.setItem('lss_after_login',
        location.pathname.split('/').pop() + location.search);
    } catch (e) {}
    location.replace('admin.html');
    return false;
  }

  // ============================================================
  // JSONP caller
  // ============================================================
  function callGAS(action, params, attempt) {
    attempt = attempt || 1;

    var isLong = LONG_ACTIONS[action] === true;
    var MAX = isLong ? 1 : 5;
    var PER_ATTEMPT_MS = isLong ? LONG_TIMEOUT_MS : QUICK_TIMEOUT_MS;
    var BACKOFF = isLong ? [0] : [0, 500, 1500, 4000, 8000];

    return new Promise(function (resolve, reject) {
      var cb = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var globalName = '__gasResponse_' + cb;
      var p = Object.assign({}, params || {});
      p.action = action;
      p.callback = cb;

      // auto-inject admin password for admin actions
      if (!p.password && !p.adminPassword && isAdminAction(action) && hasAdminSession()) {
        p.password = getAdminPassword();
      }

      var qs = Object.keys(p)
        .filter(function (k) { return p[k] !== undefined && p[k] !== null; })
        .map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
        })
        .join('&');

      var s = document.createElement('script');
      s.src = GAS_URL + '?' + qs;
      var settled = false;

      function cleanup() {
        try { delete window[globalName]; } catch (e) { window[globalName] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      function attemptFailed(reason) {
        if (settled) return;
        settled = true;
        cleanup();
        if (attempt < MAX) {
          setTimeout(function () {
            callGAS(action, params, attempt + 1).then(resolve, reject);
          }, BACKOFF[attempt] || 0);
        } else {
          reject(new Error(reason));
        }
      }

      var timeoutId = setTimeout(function () {
        attemptFailed('Request timeout after ' + Math.round(PER_ATTEMPT_MS / 1000) + 's');
      }, PER_ATTEMPT_MS);

      s.onload = function () {
        setTimeout(function () {
          if (settled) return;
          var hasProp = Object.prototype.hasOwnProperty.call(window, globalName);
          var resp = hasProp ? window[globalName] : undefined;

          if (!hasProp || resp === undefined || resp === null) {
            clearTimeout(timeoutId);
            attemptFailed('No response from server');
            return;
          }
          clearTimeout(timeoutId);
          settled = true;
          cleanup();

          if (resp && resp.error) reject(new Error(resp.error));
          else resolve(resp);
        }, 30);
      };
      s.onerror = function () {
        clearTimeout(timeoutId);
        attemptFailed('Network error');
      };
      document.head.appendChild(s);
    });
  }

  function isAdminAction(action) {
    return typeof action === 'string' &&
      (action.indexOf('admin') === 0 ||
       action === 'sendResultAlertsNow' ||
       action === 'initEmailHeaders' ||
       action === 'getTermSubscriberStats' ||
       action === 'listTermSubscribers' ||
       action === 'getRecentResultBatches');
  }

  // ============================================================
  // Navigation renderers
  // ============================================================
  var PUBLIC_LINKS = [
    { href: 'index.html',     label: '🏠 Home',       key: 'home' },
    { href: 'results.html',   label: '🎓 Results',    key: 'results' },
    { href: 'Subscribe.html', label: '📬 Subscribe',  key: 'subscribe' },
    { href: 'fee-portal.html',label: '💳 Fee Portal', key: 'fee' }
  ];

  var ADMIN_LINKS = [
    { href: 'admin.html',          label: '🔧 Hub',      key: 'hub' },
    { href: 'admin-reports.html',  label: '📊 Reports',  key: 'reports' },
    { href: 'admin-teachers.html', label: '👥 Teachers', key: 'teachers' },
    { href: 'AdminAlerts.html',    label: '📧 Alerts',   key: 'alerts' }
  ];

  function injectStyles() {
    if (document.getElementById('lss-nav-styles')) return;
    var css =
      '#lssPublicNav,#lssAdminNav{' +
        'max-width:1200px;margin:0 auto 14px;padding:10px 16px;' +
        'background:rgba(20,35,55,0.85);backdrop-filter:blur(12px);' +
        '-webkit-backdrop-filter:blur(12px);' +
        'border:1px solid rgba(255,215,0,0.18);border-radius:14px;' +
        'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' +
        'box-shadow:0 8px 24px rgba(0,0,0,0.35);' +
        'font-family:"Segoe UI",Roboto,Arial,sans-serif;' +
        'font-size:13.5px;position:relative;z-index:100;' +
      '}' +
      '#lssAdminNav{border-color:rgba(139,92,246,0.35);' +
        'background:rgba(30,20,55,0.85);' +
      '}' +
      '.lssNavBrand{' +
        'font-weight:800;font-size:14px;color:#fbbf24;' +
        'letter-spacing:0.4px;margin-right:8px;white-space:nowrap;' +
      '}' +
      '#lssAdminNav .lssNavBrand{color:#c4b5fd;}' +
      '.lssNavLink{' +
        'padding:7px 12px;border-radius:9px;color:#cbd5e1;' +
        'text-decoration:none;font-weight:600;font-size:13px;' +
        'transition:0.15s;white-space:nowrap;border:1px solid transparent;' +
      '}' +
      '.lssNavLink:hover{' +
        'background:rgba(255,255,255,0.06);color:#fff;' +
        'border-color:rgba(255,255,255,0.08);' +
      '}' +
      '.lssNavLink.active{' +
        'background:rgba(251,191,36,0.18);color:#fbbf24;' +
        'border-color:rgba(251,191,36,0.35);' +
      '}' +
      '#lssAdminNav .lssNavLink.active{' +
        'background:rgba(139,92,246,0.28);color:#e9d5ff;' +
        'border-color:rgba(139,92,246,0.5);' +
      '}' +
      '.lssNavSpacer{flex:1;}' +
      '.lssNavBtn{' +
        'padding:7px 12px;border-radius:9px;border:1px solid transparent;' +
        'background:rgba(139,92,246,0.35);color:#e9d5ff;' +
        'font-weight:700;font-size:12.5px;cursor:pointer;' +
        'text-decoration:none;font-family:inherit;transition:0.15s;' +
        'white-space:nowrap;' +
      '}' +
      '.lssNavBtn:hover{background:rgba(139,92,246,0.6);color:#fff;}' +
      '.lssNavBtn.logout{background:rgba(220,38,38,0.35);color:#fecaca;}' +
      '.lssNavBtn.logout:hover{background:rgba(220,38,38,0.6);color:#fff;}' +
      '.lssNavBtn.home{background:rgba(37,99,235,0.4);color:#dbeafe;}' +
      '.lssNavBtn.home:hover{background:rgba(37,99,235,0.7);color:#fff;}' +
      '@media(max-width:640px){' +
        '#lssPublicNav,#lssAdminNav{padding:8px 10px;gap:4px;font-size:12px;}' +
        '.lssNavLink,.lssNavBtn{padding:6px 9px;font-size:11.5px;}' +
        '.lssNavBrand{font-size:12.5px;}' +
      '}';
    var style = document.createElement('style');
    style.id = 'lss-nav-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildPublicNavHTML(activeKey) {
    var h = '<span class="lssNavBrand">🎓 LUNZU SS</span>';
    PUBLIC_LINKS.forEach(function (l) {
      h += '<a href="' + l.href + '" class="lssNavLink' +
           (l.key === activeKey ? ' active' : '') + '">' + l.label + '</a>';
    });
    h += '<span class="lssNavSpacer"></span>';
    if (hasAdminSession()) {
      h += '<a href="admin.html" class="lssNavBtn">🔧 Admin Tools</a>';
    } else {
      h += '<a href="admin.html" class="lssNavBtn">🔧 Admin</a>';
    }
    return h;
  }

  function buildAdminNavHTML(activeKey) {
    var h = '<span class="lssNavBrand">🔧 ADMIN</span>';
    ADMIN_LINKS.forEach(function (l) {
      h += '<a href="' + l.href + '" class="lssNavLink' +
           (l.key === activeKey ? ' active' : '') + '">' + l.label + '</a>';
    });
    h += '<span class="lssNavSpacer"></span>';
    h += '<a href="index.html" class="lssNavBtn home">🏠 Public Site</a>';
    h += '<button type="button" class="lssNavBtn logout" onclick="LSS.logout()">🚪 Log out</button>';
    return h;
  }

  function renderPublicNav(activeKey) {
    injectStyles();
    var host = document.getElementById('lssPublicNav');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lssPublicNav';
      var body = document.body;
      body.insertBefore(host, body.firstChild);
    }
    host.innerHTML = buildPublicNavHTML(activeKey || '');
    return host;
  }

  function renderAdminNav(activeKey) {
    injectStyles();
    var host = document.getElementById('lssAdminNav');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lssAdminNav';
      var body = document.body;
      body.insertBefore(host, body.firstChild);
    }
    host.innerHTML = buildAdminNavHTML(activeKey || '');
    return host;
  }

  function logout() {
    clearAdminPassword();
    try { sessionStorage.removeItem('adminPw'); } catch (e) {}
    try { sessionStorage.removeItem('lss_after_login'); } catch (e) {}
    location.href = 'index.html';
  }

  // ============================================================
  // Export
  // ============================================================
  global.LSS = {
    GAS_URL: GAS_URL,
    getAdminPassword: getAdminPassword,
    setAdminPassword: setAdminPassword,
    clearAdminPassword: clearAdminPassword,
    hasAdminSession: hasAdminSession,
    requireAdmin: requireAdmin,
    callGAS: callGAS,
    renderPublicNav: renderPublicNav,
    renderAdminNav: renderAdminNav,
    logout: logout
  };

  // Convenience: expose gasCall for legacy pages
  global.gasCall = global.gasCall || callGAS;

})(window);

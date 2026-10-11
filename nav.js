// ============================================================
// nav.js — Shared navigation + auth helper for Lunzu SS
// Uses fetch() + POST — mobile-safe, cache-proof.
// Backend: GAS with doGet/doPost both routing via handleApiRequest.
// ============================================================
(function (global) {
  'use strict';

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbwSe_HeUAigVjBiN-rmcq0FPiJRKsLBBtw2VGGhLWlMCrIvT3WeQ0MpjdMdI4HDGnkbZQ/exec';
  var PW_KEY = 'lss_admin_pw';

  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent);

  var LONG_ACTIONS = {
    generateClassPDF: true,
    generateNoticeBoardPDF: true,
    generateAllNoticeBoardPDF: true,
    generatePDF: true,
    generatePDFAdmin: true
  };
  var MEDIUM_ACTIONS = {
    getAvailableTerms: true,
    getStudentNames: true,
    getStudentResults: true,
    getStudentResultsAdmin: true
  };

  // Timeouts — generous on mobile
  var QUICK_TIMEOUT_MS  = IS_MOBILE ? 60000 : 30000;
  var MEDIUM_TIMEOUT_MS = IS_MOBILE ? 120000 : 90000;
  var LONG_TIMEOUT_MS   = 300000;
  var QUICK_RETRIES     = IS_MOBILE ? 3 : 4;
  var MEDIUM_RETRIES    = 3;
  var LONG_RETRIES      = 1;

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

  function requireAdmin() {
    if (hasAdminSession()) return true;
    try {
      sessionStorage.setItem('lss_after_login',
        location.pathname.split('/').pop() + location.search);
    } catch (e) {}
    location.replace('admin.html');
    return false;
  }

  // ============================================================
  // callGAS — fetch + POST
  // ============================================================
  function callGAS(action, params, attempt) {
    attempt = attempt || 1;

    var isLong   = LONG_ACTIONS[action] === true;
    var isMedium = MEDIUM_ACTIONS[action] === true;

    var MAX, PER_ATTEMPT_MS, BACKOFF;
    if (isLong) {
      MAX = LONG_RETRIES;     PER_ATTEMPT_MS = LONG_TIMEOUT_MS;
      BACKOFF = [0];
    } else if (isMedium) {
      MAX = MEDIUM_RETRIES;   PER_ATTEMPT_MS = MEDIUM_TIMEOUT_MS;
      BACKOFF = [0, 2000, 5000];
    } else {
      MAX = QUICK_RETRIES;    PER_ATTEMPT_MS = QUICK_TIMEOUT_MS;
      BACKOFF = IS_MOBILE ? [0, 1500, 4000] : [0, 800, 2000, 5000];
    }

    return new Promise(function (resolve, reject) {
      var payload = Object.assign({}, params || {});
      payload.action = action;
      payload._nocache = Date.now();

      if (!payload.password && !payload.adminPassword && isAdminAction(action) && hasAdminSession()) {
        payload.password = getAdminPassword();
      }

      var formBody = new URLSearchParams();
      Object.keys(payload).forEach(function (k) {
        if (payload[k] !== undefined && payload[k] !== null) {
          formBody.append(k, String(payload[k]));
        }
      });

      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, PER_ATTEMPT_MS);

      fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        },
        body: formBody.toString(),
        redirect: 'follow',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store'
      })
      .then(function (response) {
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          var m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (!m) throw new Error('Invalid response from server');
          data = JSON.parse(m[0]);
        }
        if (data && data.error) throw new Error(data.error);
        resolve(data);
      })
      .catch(function (err) {
        clearTimeout(timeoutId);

        var msg = (err && err.message) || '';
        var retryable =
          err.name === 'AbortError' ||
          msg.indexOf('Failed to fetch') !== -1 ||
          msg.indexOf('NetworkError') !== -1 ||
          msg.indexOf('HTTP 5') !== -1 ||
          msg.indexOf('timeout') !== -1;

        if (retryable && attempt < MAX) {
          setTimeout(function () {
            callGAS(action, params, attempt + 1).then(resolve, reject);
          }, BACKOFF[attempt] || 0);
        } else {
          reject(err);
        }
      });
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
  // Navigation renderers (unchanged, kept for other pages)
  // ============================================================
  var PUBLIC_LINKS = [
    { href: 'index.html',     label: '🏠 Home',      key: 'home' },
    { href: 'results.html',   label: '🎓 Results',   key: 'results' },
    { href: 'Subscribe.html', label: '📬 Subscribe', key: 'subscribe' },
    { href: 'https://lunzusec.github.io/bursar', label: '💳 Fee Portal', key: 'fee', external: true },
    { href: 'teachers.html',  label: '👨‍🏫 Teacher Login', key: 'teachers' }
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
      '#lssAdminNav{border-color:rgba(139,92,246,0.35);background:rgba(30,20,55,0.85);}' +
      '.lssNavBrand{font-weight:800;font-size:14px;color:#fbbf24;letter-spacing:0.4px;margin-right:8px;white-space:nowrap;}' +
      '#lssAdminNav .lssNavBrand{color:#c4b5fd;}' +
      '.lssNavLink{padding:7px 12px;border-radius:9px;color:#cbd5e1;text-decoration:none;font-weight:600;font-size:13px;transition:0.15s;white-space:nowrap;border:1px solid transparent;}' +
      '.lssNavLink:hover{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.08);}' +
      '.lssNavLink.active{background:rgba(251,191,36,0.18);color:#fbbf24;border-color:rgba(251,191,36,0.35);}' +
      '#lssAdminNav .lssNavLink.active{background:rgba(139,92,246,0.28);color:#e9d5ff;border-color:rgba(139,92,246,0.5);}' +
      '.lssNavSpacer{flex:1;}' +
      '.lssNavBtn{padding:7px 12px;border-radius:9px;border:1px solid transparent;background:rgba(139,92,246,0.35);color:#e9d5ff;font-weight:700;font-size:12.5px;cursor:pointer;text-decoration:none;font-family:inherit;transition:0.15s;white-space:nowrap;}' +
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
    h += hasAdminSession()
      ? '<a href="admin.html" class="lssNavBtn">🔧 Admin Tools</a>'
      : '<a href="admin.html" class="lssNavBtn">🔧 Admin</a>';
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
      document.body.insertBefore(host, document.body.firstChild);
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
      document.body.insertBefore(host, document.body.firstChild);
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

  global.gasCall = global.gasCall || callGAS;

})(window);

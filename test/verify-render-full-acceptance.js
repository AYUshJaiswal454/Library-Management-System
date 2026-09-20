const https = require('https');

const BASE_URL = 'https://library-management-system-x2u8.onrender.com';

async function makeRequest({ path, method = 'GET', data = null, cookies = '' }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = data ? (typeof data === 'string' ? data : new URLSearchParams(data).toString()) : null;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ...(cookies ? { Cookie: cookies } : {}),
      ...(postData ? {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      } : {})
    };

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: requestHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const rawSetCookie = res.headers['set-cookie'] || [];
        const cookiesReceived = rawSetCookie.map(c => c.split(';')[0]).join('; ');
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          setCookie: cookiesReceived,
          rawSetCookie,
          body
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runProductionAcceptanceTest() {
  console.log('======================================================================');
  console.log('  LIVE PRODUCTION ACCEPTANCE TEST SUITE: RENDER DEPLOYMENT');
  console.log('  Target: ' + BASE_URL);
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`>>> [PASS] ${message}`);
      passed++;
    } else {
      console.error(`>>> [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Unauthenticated access protection
    console.log('--- Step 1: Verify Protected Routes Guard Unauthenticated Users ---');
    const unauthDash = await makeRequest({ path: '/member/dashboard' });
    assert(unauthDash.statusCode === 302 && unauthDash.headers.location === '/auth/login', 'GET /member/dashboard redirects unauthenticated users to /auth/login (302)');

    // 2. Register New Member on Live Production
    console.log('\n--- Step 2: Register New Patron on Live Production ---');
    const randomSuffix = Math.floor(Math.random() * 900000) + 100000;
    const testEmail = `prod.member.${randomSuffix}@institution.edu`;
    const testPassword = 'Password@2026';
    const testName = `Aditi Rao ${randomSuffix}`;

    const regRes = await makeRequest({
      path: '/auth/register',
      method: 'POST',
      data: {
        name: testName,
        email: testEmail,
        departmentOrBatch: 'Computer Science Dept / Batch 2026',
        phone: '+91 9876543210',
        password: testPassword,
        confirmPassword: testPassword
      }
    });

    assert(regRes.statusCode === 302, 'POST /auth/register returned HTTP 302 Found');
    assert(regRes.headers.location === '/member/dashboard', 'POST /auth/register redirected to /member/dashboard');
    assert(Boolean(regRes.setCookie && regRes.setCookie.includes('connect.sid')), 'Set-Cookie header received with secure session cookie');
    console.log(`[Cookie]: ${regRes.setCookie}`);

    const registerSessionCookie = regRes.setCookie;

    // 3. Verify immediate dashboard access via registration session
    console.log('\n--- Step 3: Access Member Dashboard with Registration Session ---');
    const dashRes = await makeRequest({
      path: '/member/dashboard',
      cookies: registerSessionCookie
    });
    assert(dashRes.statusCode === 200, 'GET /member/dashboard loaded with 200 OK');
    assert(dashRes.body.includes(testName), `Dashboard successfully renders new member name "${testName}"`);
    assert(dashRes.body.includes('Member Account Overview'), 'Dashboard content rendered properly');

    // 4. Test Member Navigation & Session Persistence on Refresh
    console.log('\n--- Step 4: Verify Session Persistence on Refresh & Protected Pages ---');
    const refreshDash = await makeRequest({ path: '/member/dashboard', cookies: registerSessionCookie });
    assert(refreshDash.statusCode === 200 && refreshDash.body.includes(testName), 'Dashboard remains fully accessible and authenticated on page refresh');

    const holdsRes = await makeRequest({ path: '/member/holds', cookies: registerSessionCookie });
    assert(holdsRes.statusCode === 200 && holdsRes.body.includes('My Hold Queue'), 'Protected holds page accessible with session');

    const notifRes = await makeRequest({ path: '/member/notifications', cookies: registerSessionCookie });
    assert(notifRes.statusCode === 200 && notifRes.body.includes('Notifications'), 'Protected notifications page accessible with session');

    // 5. Test Logout
    console.log('\n--- Step 5: Test Member Logout & Session Invalidation ---');
    const logoutRes = await makeRequest({
      path: '/auth/logout',
      method: 'POST',
      cookies: registerSessionCookie
    });
    assert(logoutRes.statusCode === 302 && logoutRes.headers.location === '/auth/login', 'POST /auth/logout redirected to /auth/login');

    const postLogoutAccess = await makeRequest({
      path: '/member/dashboard',
      cookies: registerSessionCookie
    });
    assert(postLogoutAccess.statusCode === 302 && postLogoutAccess.headers.location === '/auth/login', 'Member dashboard inaccessible after logout (session destroyed)');

    // 6. Test Sign In with newly registered credentials
    console.log('\n--- Step 6: Test Sign In with Newly Created Account ---');
    const loginRes = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: testEmail,
        password: testPassword
      }
    });

    assert(loginRes.statusCode === 302, 'POST /auth/login returned HTTP 302 Found');
    assert(loginRes.headers.location === '/member/dashboard', 'POST /auth/login redirected to /member/dashboard');
    assert(Boolean(loginRes.setCookie && loginRes.setCookie.includes('connect.sid')), 'New session cookie generated on Sign In');

    const loginSessionCookie = loginRes.setCookie;
    const loginDash = await makeRequest({
      path: '/member/dashboard',
      cookies: loginSessionCookie
    });
    assert(loginDash.statusCode === 200 && loginDash.body.includes(testName), 'Member dashboard successfully accessed after Sign In');

    // 7. Test Staff / Librarian Login Flow & Desk Operations
    console.log('\n--- Step 7: Test Librarian Staff Login & Desk Operations ---');
    const libLogin = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: 'librarian@library.gov.in',
        password: 'Librarian@2026'
      }
    });

    assert(libLogin.statusCode === 302 && libLogin.headers.location === '/librarian/desk', 'Librarian login redirected to /librarian/desk');
    assert(Boolean(libLogin.setCookie && libLogin.setCookie.includes('connect.sid')), 'Session cookie generated for Librarian');

    const libCookie = libLogin.setCookie;
    const deskRes = await makeRequest({
      path: '/librarian/desk',
      cookies: libCookie
    });
    assert(deskRes.statusCode === 200, 'GET /librarian/desk loaded with 200 OK');
    assert(deskRes.body.includes('Circulation Desk'), 'Circulation Desk dashboard loaded successfully');

    // 8. Test Role Separation / RBAC on Production
    console.log('\n--- Step 8: Verify Role Separation (Member Cannot Access Desk) ---');
    const memberDeskAttempt = await makeRequest({
      path: '/librarian/desk',
      cookies: loginSessionCookie
    });
    assert(memberDeskAttempt.statusCode === 403, 'Member attempting to access /librarian/desk receives HTTP 403 Forbidden');

    // 9. Test Invalid Login Handling (Error Messaging)
    console.log('\n--- Step 9: Verify Failed Login Error Handling ---');
    const badLogin = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: testEmail,
        password: 'WrongPassword@123'
      }
    });
    assert(badLogin.statusCode === 302 && badLogin.headers.location === '/auth/login', 'Bad credentials redirect to /auth/login without granting session');

  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  }

  console.log('\n======================================================================');
  console.log(`  PRODUCTION ACCEPTANCE RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================');
}

runProductionAcceptanceTest();

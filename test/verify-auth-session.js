const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const BASE_URL = 'http://localhost:3000';

// Helper for HTTP requests with cookie jar
async function makeRequest({ path, method = 'GET', data = null, cookies = '', headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = data ? (typeof data === 'string' ? data : new URLSearchParams(data).toString()) : null;

    const requestHeaders = {
      ...headers,
      ...(cookies ? { Cookie: cookies } : {}),
      ...(postData ? {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      } : {})
    };

    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3000,
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

async function runAuthTests() {
  console.log('===============================================================');
  console.log('  AUTOMATED VERIFICATION: AUTHENTICATION & SESSION PERSISTENCE ');
  console.log('===============================================================');

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
    // 1. Unauthenticated access to protected route redirects to login
    console.log('\n--- 1. Testing Unauthenticated Access Protection ---');
    const unauthRes = await makeRequest({ path: '/member/dashboard' });
    assert(unauthRes.statusCode === 302, 'Unauthenticated /member/dashboard returned 302 redirect');
    assert(unauthRes.headers.location === '/auth/login', 'Redirect destination is /auth/login');

    // 2. Register New Member
    console.log('\n--- 2. Testing Member Registration & Session Creation ---');
    const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
    const testEmail = `test.member.${randomSuffix}@institution.edu`;
    const testPassword = 'Password@2026';
    const testName = `Test User ${randomSuffix}`;

    const regRes = await makeRequest({
      path: '/auth/register',
      method: 'POST',
      data: {
        name: testName,
        email: testEmail,
        departmentOrBatch: 'Computer Science & Engineering',
        phone: '+91 9876543210',
        password: testPassword,
        confirmPassword: testPassword
      }
    });

    assert(regRes.statusCode === 302, 'Registration returned 302 redirect');
    assert(regRes.headers.location === '/member/dashboard', 'Redirects to /member/dashboard on success');
    assert(Boolean(regRes.setCookie && regRes.setCookie.includes('connect.sid')), 'Set-Cookie header received with session connect.sid');

    const memberCookies = regRes.setCookie;

    // 3. Access Member Dashboard with registered session cookie
    console.log('\n--- 3. Testing Member Dashboard with Registered Session ---');
    const dashRes = await makeRequest({
      path: '/member/dashboard',
      cookies: memberCookies
    });
    assert(dashRes.statusCode === 200, 'Member dashboard loaded with 200 OK');
    assert(dashRes.body.includes('Member Account Overview'), 'Dashboard content rendered properly');
    assert(dashRes.body.includes(testName), `Dashboard includes user name "${testName}"`);

    // 4. Session Persistence Across Multiple Page Requests & Refresh
    console.log('\n--- 4. Testing Session Persistence on Refresh & Member Routes ---');
    const holdsRes = await makeRequest({ path: '/member/holds', cookies: memberCookies });
    assert(holdsRes.statusCode === 200 && holdsRes.body.includes('My Hold Queue'), 'Holds page accessible');

    const historyRes = await makeRequest({ path: '/member/history', cookies: memberCookies });
    assert(historyRes.statusCode === 200 && historyRes.body.includes('Borrowing History'), 'History page accessible');

    // 5. Test Logout
    console.log('\n--- 5. Testing Member Logout ---');
    const logoutRes = await makeRequest({
      path: '/auth/logout',
      method: 'POST',
      cookies: memberCookies
    });
    assert(logoutRes.statusCode === 302, 'Logout returned 302 redirect');
    assert(logoutRes.headers.location === '/auth/login', 'Logout redirected to /auth/login');

    // 6. Verify Dashboard Inaccessible After Logout
    console.log('\n--- 6. Verifying Dashboard Inaccessible After Logout ---');
    const postLogoutDash = await makeRequest({
      path: '/member/dashboard',
      cookies: memberCookies
    });
    assert(postLogoutDash.statusCode === 302 && postLogoutDash.headers.location === '/auth/login', 'Dashboard protected after logout');

    // 7. Login with newly registered credentials
    console.log('\n--- 7. Testing Login with New Member Credentials ---');
    const loginRes = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: testEmail,
        password: testPassword
      }
    });
    assert(loginRes.statusCode === 302, 'Login returned 302 redirect');
    assert(loginRes.headers.location === '/member/dashboard', 'Login redirected to /member/dashboard');
    assert(Boolean(loginRes.setCookie && loginRes.setCookie.includes('connect.sid')), 'New session cookie issued on login');

    const newSessionCookie = loginRes.setCookie;
    const newDashRes = await makeRequest({
      path: '/member/dashboard',
      cookies: newSessionCookie
    });
    assert(newDashRes.statusCode === 200 && newDashRes.body.includes(testName), 'Logged in dashboard renders user account');

    // 8. Test Librarian Login & Role Authorization
    console.log('\n--- 8. Testing Librarian Login & Role-Based Access ---');
    const libLoginRes = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: 'librarian@library.gov.in',
        password: 'Librarian@2026'
      }
    });
    assert(libLoginRes.statusCode === 302, 'Librarian login returned 302 redirect');
    assert(libLoginRes.headers.location === '/librarian/desk', 'Librarian redirected to /librarian/desk');
    assert(Boolean(libLoginRes.setCookie), 'Session cookie issued for Librarian');

    const libCookies = libLoginRes.setCookie;
    const deskRes = await makeRequest({
      path: '/librarian/desk',
      cookies: libCookies
    });
    assert(deskRes.statusCode === 200 && deskRes.body.includes('Circulation Desk'), 'Librarian desk accessible');

    // 9. Verify Member CANNOT Access Librarian Desk (403 Forbidden)
    console.log('\n--- 9. Testing RBAC: Member Cannot Access Librarian Desk ---');
    const forbiddenRes = await makeRequest({
      path: '/librarian/desk',
      cookies: newSessionCookie
    });
    assert(forbiddenRes.statusCode === 403, 'Member accessing /librarian/desk received 403 Forbidden');

    // 10. Test Invalid Login Credentials
    console.log('\n--- 10. Testing Invalid Login Credentials ---');
    const badLoginRes = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: 'nonexistent@institution.edu',
        password: 'WrongPassword@123'
      }
    });
    assert(badLoginRes.statusCode === 302 && badLoginRes.headers.location === '/auth/login', 'Invalid login redirects back to /auth/login');

    // 11. Test Proxy / HTTPS Header Simulation
    console.log('\n--- 11. Testing Reverse Proxy Trust & HTTPS Header Simulation ---');
    const proxyLoginRes = await makeRequest({
      path: '/auth/login',
      method: 'POST',
      data: {
        email: 'librarian@library.gov.in',
        password: 'Librarian@2026'
      },
      headers: {
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': '203.0.113.195'
      }
    });
    assert(proxyLoginRes.statusCode === 302, 'Proxied HTTPS request returned 302 redirect');
    assert(Boolean(proxyLoginRes.setCookie && proxyLoginRes.setCookie.includes('connect.sid')), 'Session cookie successfully generated behind reverse proxy');

  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  }

  console.log('\n===============================================================');
  console.log(`  RESULTS: ${passed} / ${total} CHECKS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('===============================================================');
}

runAuthTests();

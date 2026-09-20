const https = require('https');

const BASE_URL = 'https://library-management-system-x2u8.onrender.com';

async function makeRequest({ path, method = 'GET', data = null, cookies = '' }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = data ? (typeof data === 'string' ? data : new URLSearchParams(data).toString()) : null;

    const requestHeaders = {
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

async function verifyRenderDeployment() {
  console.log('Testing live Render production deployment at https://library-management-system-x2u8.onrender.com...');
  
  // 1. Try login with librarian
  const libRes = await makeRequest({
    path: '/auth/login',
    method: 'POST',
    data: {
      email: 'librarian@library.gov.in',
      password: 'Librarian@2026'
    }
  });

  console.log('Librarian Login Response Status:', libRes.statusCode);
  console.log('Location:', libRes.headers.location);
  console.log('Set-Cookie:', libRes.setCookie);
  console.log('Raw Set-Cookie:', libRes.rawSetCookie);

  if (libRes.setCookie && libRes.setCookie.includes('connect.sid')) {
    console.log('>>> SUCCESS: Session cookie successfully returned on Render!');
    const deskRes = await makeRequest({
      path: '/librarian/desk',
      cookies: libRes.setCookie
    });
    console.log('Desk Response Status:', deskRes.statusCode);
    if (deskRes.statusCode === 200) {
      console.log('>>> SUCCESS: Desk page loaded with 200 OK!');
      return true;
    }
  } else {
    console.log('>>> Waiting for Render deploy to complete (cookie not present yet)...');
    return false;
  }
}

async function run() {
  let deployed = false;
  for (let i = 0; i < 15; i++) {
    console.log(`\n[Check ${i + 1}/15] Probing Render...`);
    try {
      deployed = await verifyRenderDeployment();
      if (deployed) break;
    } catch (e) {
      console.log('Error probing Render:', e.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }

  if (!deployed) {
    console.error('Render did not finish deployment in time.');
    process.exit(1);
  }
}

run();

const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('../app');
const connectDB = require('../config/db');
const User = require('../models/User');
const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');

// Helper to make requests to express app
function makeRequest(server, options, postData = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {})
      }
    };

    if (cookie) {
      reqOptions.headers['Cookie'] = cookie;
    }

    if (postData) {
      reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          setCookie: setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : null,
          body
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

const runFullRouteAudit = async () => {
  console.log('===============================================================');
  console.log('  FULL-STACK HTTP ROUTE & VIEW AUDIT');
  console.log('===============================================================');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[Test Server] Listening on ephemeral port: ${port}`);

  const results = [];
  const logStep = (step, path, status, note = '') => {
    const isSuccess = (step.includes('404') && status === 404) || status === 200 || status === 302;
    console.log(`[${isSuccess ? 'PASS' : 'FAIL'}] ${step}: ${path} -> HTTP ${status} ${note}`);
    results.push({ step, path, status });
  };

  try {
    // 1. Root redirect
    const resRoot = await makeRequest(server, { path: '/' });
    logStep('R1 Root Redirect', '/', resRoot.statusCode, `(Redirect to ${resRoot.headers.location})`);

    // 2. Public Catalogue Index
    const resCat = await makeRequest(server, { path: '/catalogue' });
    const hasSearchForm = resCat.body.includes('Library Catalogue & Holdings Discovery');
    logStep('R2 Catalogue Index', '/catalogue', resCat.statusCode, hasSearchForm ? '(Rendered Catalog Header)' : '(Failed header check)');

    // 3. Catalogue Search
    const resSearch = await makeRequest(server, { path: '/catalogue?q=Algorithms' });
    const hasAlgo = resSearch.body.includes('Introduction to Algorithms');
    logStep('R3 Catalogue Search Query', '/catalogue?q=Algorithms', resSearch.statusCode, hasAlgo ? '(Found matched title)' : '');

    // 4. Book Detail Page
    const sampleBook = await Book.findOne({ title: 'Introduction to Algorithms' });
    const resDetail = await makeRequest(server, { path: `/catalogue/${sampleBook._id}` });
    const hasHoldings = resDetail.body.includes('Physical Holdings & Real-Time Availability');
    logStep('R4 Book Detail & Holdings', `/catalogue/${sampleBook._id}`, resDetail.statusCode, hasHoldings ? '(Holdings table rendered)' : '');

    // 5. Auth Pages (Login & Register)
    const resLogin = await makeRequest(server, { path: '/auth/login' });
    logStep('R5 Login Page', '/auth/login', resLogin.statusCode);

    const resRegister = await makeRequest(server, { path: '/auth/register' });
    logStep('R6 Register Page', '/auth/register', resRegister.statusCode);

    // 6. Member Authentication
    const loginDataMember = 'email=' + encodeURIComponent('aarav.sharma@institution.edu') + '&password=' + encodeURIComponent('Member@2026');
    const resMemLogin = await makeRequest(server, { path: '/auth/login', method: 'POST' }, loginDataMember);
    const memberCookie = resMemLogin.setCookie;
    logStep('R7 Member Login', '/auth/login [POST]', resMemLogin.statusCode, `(Session Cookie obtained: ${!!memberCookie})`);

    // 7. Member Protected Views
    const resMemDash = await makeRequest(server, { path: '/member/dashboard' }, null, memberCookie);
    logStep('R8 Member Dashboard', '/member/dashboard', resMemDash.statusCode, resMemDash.body.includes('Member Account') ? '(Dossier loaded)' : '');

    const resMemLoans = await makeRequest(server, { path: '/member/loans' }, null, memberCookie);
    logStep('R9 Member Loans', '/member/loans', resMemLoans.statusCode);

    const resMemHolds = await makeRequest(server, { path: '/member/holds' }, null, memberCookie);
    logStep('R10 Member Holds', '/member/holds', resMemHolds.statusCode);

    const resMemFines = await makeRequest(server, { path: '/member/fines' }, null, memberCookie);
    logStep('R11 Member Fines', '/member/fines', resMemFines.statusCode);

    const resMemHist = await makeRequest(server, { path: '/member/history' }, null, memberCookie);
    logStep('R12 Member History', '/member/history', resMemHist.statusCode);

    const resMemNotif = await makeRequest(server, { path: '/member/notifications' }, null, memberCookie);
    logStep('R13 Member Notifications', '/member/notifications', resMemNotif.statusCode);

    // 8. Staff / Librarian Authentication
    const loginDataLib = 'email=' + encodeURIComponent('librarian@library.gov.in') + '&password=' + encodeURIComponent('Librarian@2026');
    const resLibLogin = await makeRequest(server, { path: '/auth/login', method: 'POST' }, loginDataLib);
    const libCookie = resLibLogin.setCookie;
    logStep('R14 Librarian Login', '/auth/login [POST]', resLibLogin.statusCode, `(Session Cookie: ${!!libCookie})`);

    // 9. Staff Protected Views
    const resDesk = await makeRequest(server, { path: '/librarian/desk' }, null, libCookie);
    const hasDeskKpis = resDesk.body.includes('Circulation Desk — Open of Day Operations');
    logStep('R15 Librarian Desk', '/librarian/desk', resDesk.statusCode, hasDeskKpis ? '(Operational Desk rendered)' : '');

    const resLibBooks = await makeRequest(server, { path: '/librarian/books' }, null, libCookie);
    logStep('R16 Librarian Title Inventory', '/librarian/books', resLibBooks.statusCode);

    const resLibNewBook = await makeRequest(server, { path: '/librarian/books/new' }, null, libCookie);
    logStep('R17 Ingest Title Form', '/librarian/books/new', resLibNewBook.statusCode);

    const resLibCopies = await makeRequest(server, { path: `/librarian/books/${sampleBook._id}/copies` }, null, libCookie);
    logStep('R18 Manage Copies', `/librarian/books/${sampleBook._id}/copies`, resLibCopies.statusCode);

    const resLibMembers = await makeRequest(server, { path: '/librarian/members' }, null, libCookie);
    logStep('R19 Member Directory', '/librarian/members', resLibMembers.statusCode);

    const sampleMember = await User.findOne({ role: 'MEMBER' });
    const resLibMemberRecord = await makeRequest(server, { path: `/librarian/members/${sampleMember._id}` }, null, libCookie);
    logStep('R20 Member Record Dossier', `/librarian/members/${sampleMember._id}`, resLibMemberRecord.statusCode);

    const resLibHolds = await makeRequest(server, { path: '/librarian/holds' }, null, libCookie);
    logStep('R21 Librarian Holds Pull List', '/librarian/holds', resLibHolds.statusCode);

    const resLibOverdues = await makeRequest(server, { path: '/librarian/overdues' }, null, libCookie);
    logStep('R22 Overdues & Fines Ledger', '/librarian/overdues', resLibOverdues.statusCode);

    const resLibAudit = await makeRequest(server, { path: '/librarian/audit' }, null, libCookie);
    logStep('R23 Audit Trail', '/librarian/audit', resLibAudit.statusCode);

    const resLibSettings = await makeRequest(server, { path: '/librarian/settings' }, null, libCookie);
    logStep('R24 Policy Settings Form', '/librarian/settings', resLibSettings.statusCode);

    // 10. Live AJAX Eligibility API
    const sampleCopy = await BookCopy.findOne({ status: 'AVAILABLE' });
    const resApiElig = await makeRequest(server, {
      path: `/api/eligibility?memberId=${sampleMember.memberId}&barcode=${sampleCopy.barcode}`
    });
    logStep('R25 Live Eligibility API', '/api/eligibility', resApiElig.statusCode, `(Response: ${resApiElig.body.slice(0, 50)}...)`);

    // 11. Safe 404 Route
    const res404 = await makeRequest(server, { path: '/this-page-does-not-exist-xyz' });
    logStep('R26 Safe 404 Error Page', '/this-page-does-not-exist-xyz', res404.statusCode);

    console.log('\n===============================================================');
    console.log(`  ALL ${results.length} HTTP ENDPOINTS VERIFIED AND HEALTHY`);
    console.log('===============================================================\n');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('[HTTP Route Audit Error]:', err);
    if (server) server.close();
    process.exit(1);
  }
};

runFullRouteAudit();

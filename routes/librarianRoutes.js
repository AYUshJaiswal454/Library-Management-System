const express = require('express');
const router = express.Router();
const LibrarianController = require('../controllers/librarianController');
const { isAuthenticated, isLibrarian, isAdmin } = require('../middlewares/auth');
const { validateBook, validateCopy, validateSettings } = require('../middlewares/validation');

// Staff-level protected routes
router.use(isAuthenticated, isLibrarian);

// Circulation Desk Main Dashboard & Desk Actions
router.get('/desk', LibrarianController.getDesk);
router.post('/issue', LibrarianController.postIssue);
router.post('/return', LibrarianController.postReturn);

// Title Catalogue & Inventory Management
router.get('/books', LibrarianController.getBooks);
router.get('/books/new', LibrarianController.getNewBook);
router.post('/books', validateBook, LibrarianController.postNewBook);
router.get('/books/:id/edit', LibrarianController.getEditBook);
router.post('/books/:id', validateBook, LibrarianController.postEditBook);

// Copy Level Inventory Management
router.get('/books/:id/copies', LibrarianController.getCopies);
router.post('/books/:id/copies', validateCopy, LibrarianController.postAddCopy);
router.post('/books/:id/copies/status', LibrarianController.postUpdateCopyStatus);

// Member Records & Account Management
router.get('/members', LibrarianController.getMembers);
router.get('/members/:id', LibrarianController.getMemberRecord);
router.post('/members/:id/restriction', LibrarianController.postToggleRestriction);

// Holds Queue & Pull List
router.get('/holds', LibrarianController.getHolds);
router.post('/holds/:id/cancel', LibrarianController.postCancelHold);

// Overdues & Fines Management
router.get('/overdues', LibrarianController.getOverdues);
router.post('/fines/pay', LibrarianController.postPayFine);
router.post('/fines/waive', LibrarianController.postWaiveFine);

// Audit Trail
router.get('/audit', LibrarianController.getAuditLogs);

// Circulation Policy Settings
router.get('/settings', LibrarianController.getSettings);
router.post('/settings', validateSettings, LibrarianController.postSettings);

module.exports = router;

const express = require('express');
const router = express.Router();
const MemberController = require('../controllers/memberController');
const { isAuthenticated } = require('../middlewares/auth');

router.use(isAuthenticated);

router.get('/dashboard', MemberController.getDashboard);
router.get('/loans', MemberController.getLoans);
router.post('/loans/:id/renew', MemberController.renewLoan);
router.get('/holds', MemberController.getHolds);
router.post('/holds/:id/cancel', MemberController.cancelHold);
router.get('/fines', MemberController.getFines);
router.get('/history', MemberController.getHistory);
router.get('/notifications', MemberController.getNotifications);

module.exports = router;

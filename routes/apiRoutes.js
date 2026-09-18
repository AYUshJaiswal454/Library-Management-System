const express = require('express');
const router = express.Router();
const ApiController = require('../controllers/apiController');
const { apiLimiter } = require('../middlewares/rateLimiter');
const { isAuthenticated } = require('../middlewares/auth');

router.use(apiLimiter);

router.get('/eligibility', ApiController.checkEligibility);
router.get('/copies/:barcode', ApiController.lookupCopy);
router.get('/members/:identifier', ApiController.lookupMember);

module.exports = router;

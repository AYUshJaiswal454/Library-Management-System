const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimiter');
const { validateRegister, validateLogin } = require('../middlewares/validation');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/login', AuthController.getLogin);
router.post('/login', authLimiter, validateLogin, AuthController.postLogin);

router.get('/register', AuthController.getRegister);
router.post('/register', authLimiter, validateRegister, AuthController.postRegister);

router.get('/logout', AuthController.logout);
router.post('/logout', AuthController.logout);

router.get('/profile', isAuthenticated, AuthController.getProfile);

module.exports = router;

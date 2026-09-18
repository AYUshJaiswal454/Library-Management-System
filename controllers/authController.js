const { validationResult } = require('express-validator');
const User = require('../models/User');
const AuditService = require('../services/AuditService');

class AuthController {
  static getLogin(req, res) {
    if (req.user) {
      return res.redirect(req.user.role === 'MEMBER' ? '/member/dashboard' : '/librarian/desk');
    }
    res.render('auth/login', {
      title: 'Sign In - Library Circulation System'
    });
  }

  static async postLogin(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array()[0].msg);
      return res.redirect('/auth/login');
    }

    const { email, password } = req.body;

    try {
      const user = await User.findOne({
        $or: [
          { email: email.trim().toLowerCase() },
          { memberId: email.trim().toUpperCase() }
        ]
      });

      if (!user) {
        req.flash('error', 'Invalid email / Member ID or password.');
        return res.redirect('/auth/login');
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        req.flash('error', 'Invalid email / Member ID or password.');
        return res.redirect('/auth/login');
      }

      // Establish session
      req.session.userId = user._id;

      await AuditService.log({
        actor: user,
        action: 'USER_LOGIN',
        targetType: 'User',
        targetId: user._id,
        details: { email: user.email, role: user.role }
      });

      req.flash('success', `Welcome back, ${user.name}!`);

      const returnTo = req.session.returnTo || (user.role === 'MEMBER' ? '/member/dashboard' : '/librarian/desk');
      delete req.session.returnTo;
      res.redirect(returnTo);
    } catch (err) {
      console.error('[Auth Login Error]:', err);
      req.flash('error', 'An error occurred during authentication. Please try again.');
      res.redirect('/auth/login');
    }
  }

  static getRegister(req, res) {
    if (req.user) {
      return res.redirect('/member/dashboard');
    }
    res.render('auth/register', {
      title: 'Member Registration - Library Platform'
    });
  }

  static async postRegister(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array()[0].msg);
      return res.redirect('/auth/register');
    }

    const { name, email, password, departmentOrBatch, phone } = req.body;

    try {
      const cleanEmail = email.trim().toLowerCase();
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        req.flash('error', 'An account with this email address already exists.');
        return res.redirect('/auth/register');
      }

      // Generate systematic member ID: MEM-YYYY-XXXX
      const currentYear = new Date().getFullYear();
      const userCount = await User.countDocuments();
      const memberId = `MEM-${currentYear}-${(userCount + 101).toString().padStart(4, '0')}`;

      const passwordHash = await User.hashPassword(password);

      const user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: 'MEMBER',
        memberId,
        departmentOrBatch: departmentOrBatch ? departmentOrBatch.trim() : '',
        phone: phone ? phone.trim() : ''
      });

      req.session.userId = user._id;

      await AuditService.log({
        actor: user,
        action: 'USER_REGISTERED',
        targetType: 'User',
        targetId: user._id,
        details: { memberId: user.memberId, email: user.email }
      });

      req.flash('success', `Registration successful! Your Member ID is ${memberId}.`);
      res.redirect('/member/dashboard');
    } catch (err) {
      console.error('[Auth Register Error]:', err);
      req.flash('error', 'Registration failed. Please check your details and try again.');
      res.redirect('/auth/register');
    }
  }

  static async logout(req, res) {
    if (req.user) {
      await AuditService.log({
        actor: req.user,
        action: 'USER_LOGOUT',
        targetType: 'User',
        targetId: req.user._id,
        details: { memberId: req.user.memberId }
      });
    }

    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  }

  static async getProfile(req, res) {
    res.render('auth/profile', {
      title: 'My Profile & Account Status',
      user: req.user
    });
  }
}

module.exports = AuthController;

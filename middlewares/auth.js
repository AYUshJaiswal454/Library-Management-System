const User = require('../models/User');

const loadUser = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.user = null;
    res.locals.currentUser = null;
    return next();
  }

  try {
    const user = await User.findById(req.session.userId).select('-passwordHash');
    if (!user) {
      req.session.destroy();
      req.user = null;
      res.locals.currentUser = null;
      return next();
    }
    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error] Failed to load user session:', err);
    next(err);
  }
};

const isAuthenticated = (req, res, next) => {
  if (req.user) {
    return next();
  }
  req.flash('error', 'Authentication required. Please sign in to continue.');
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
};

const isLibrarian = (req, res, next) => {
  if (req.user && ['LIBRARIAN', 'ADMIN'].includes(req.user.role)) {
    return next();
  }
  req.flash('error', 'Access denied. Circulation Desk / Staff credentials required.');
  res.status(403).render('errors/403', {
    title: '403 Forbidden - Staff Access Only',
    message: 'You do not have staff permissions to access this circulation desk area.'
  });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  req.flash('error', 'Access denied. Administrative privileges required.');
  res.status(403).render('errors/403', {
    title: '403 Forbidden - Admin Access Only',
    message: 'Administrative privileges are required for system policy modifications.'
  });
};

module.exports = {
  loadUser,
  isAuthenticated,
  isLibrarian,
  isAdmin
};

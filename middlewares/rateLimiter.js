const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login/register requests per 15 mins
  message: 'Too many authentication attempts from this IP, please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    req.flash('error', options.message);
    res.status(429).redirect('/auth/login');
  }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: 'Rate limit exceeded. Please throttle requests.' }
});

module.exports = {
  authLimiter,
  apiLimiter
};

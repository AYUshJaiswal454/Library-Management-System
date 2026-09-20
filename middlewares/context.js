const SettingService = require('../services/SettingService');
const NotificationService = require('../services/NotificationService');

const contextMiddleware = async (req, res, next) => {
  try {
    const settings = await SettingService.getSettings();
    res.locals.settings = settings;
    res.locals.currentPath = req.path;
    res.locals.success = (req.session && typeof req.flash === 'function') ? req.flash('success') : [];
    res.locals.error = (req.session && typeof req.flash === 'function') ? req.flash('error') : [];
    res.locals.warning = (req.session && typeof req.flash === 'function') ? req.flash('warning') : [];
    res.locals.info = (req.session && typeof req.flash === 'function') ? req.flash('info') : [];

    // Notification count for authenticated user
    if (req.user) {
      res.locals.unreadNotificationCount = await NotificationService.getUnreadCount(req.user._id);
    } else {
      res.locals.unreadNotificationCount = 0;
    }

    // Helper formatters
    res.locals.formatDate = (date) => {
      if (!date) return '—';
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    res.locals.formatDateTime = (date) => {
      if (!date) return '—';
      return new Date(date).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    res.locals.formatCurrency = (amount) => {
      return `${settings.currencySymbol}${(amount || 0).toLocaleString('en-IN')}`;
    };

    next();
  } catch (err) {
    console.error('[Context Middleware Error]:', err);
    next(err);
  }
};

module.exports = contextMiddleware;

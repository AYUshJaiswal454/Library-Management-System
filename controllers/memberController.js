const Loan = require('../models/Loan');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const Notification = require('../models/Notification');
const SettingService = require('../services/SettingService');
const FineService = require('../services/FineService');
const ReservationService = require('../services/ReservationService');
const NotificationService = require('../services/NotificationService');
const CirculationService = require('../services/CirculationService');

class MemberController {
  static async getDashboard(req, res, next) {
    try {
      const userId = req.user._id;
      const settings = await SettingService.getSettings();

      // Ensure overdue fines are synced
      await FineService.syncOverdues();

      // Active & Overdue Loans
      const activeLoans = await Loan.find({
        user: userId,
        status: { $in: ['ACTIVE', 'OVERDUE'] }
      }).populate({
        path: 'bookCopy',
        populate: { path: 'book' }
      }).populate('book').sort({ dueDate: 1 });

      // Active Holds
      const activeHolds = await Reservation.find({
        user: userId,
        status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
      }).populate('book bookCopy').sort({ requestDate: 1 });

      // Pending Fines
      const pendingFines = await Fine.find({
        user: userId,
        status: 'PENDING'
      }).populate('book loan');

      const totalUnpaidFine = pendingFines.reduce((sum, f) => sum + f.amount, 0);

      // Recent Notifications
      const recentNotifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(5);

      // Identify loans due soon (within 3 days) or overdue
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const dueSoonLoans = activeLoans.filter(l => new Date(l.dueDate) <= threeDaysLater && l.status === 'ACTIVE');
      const overdueLoans = activeLoans.filter(l => l.status === 'OVERDUE' || new Date(l.dueDate) < now);

      res.render('member/dashboard', {
        title: 'Member Account Overview',
        activeLoans,
        activeHolds,
        pendingFines,
        totalUnpaidFine,
        recentNotifications,
        dueSoonLoans,
        overdueLoans,
        settings
      });
    } catch (err) {
      console.error('[Member Dashboard Error]:', err);
      next(err);
    }
  }

  static async getLoans(req, res, next) {
    try {
      const userId = req.user._id;
      const loans = await Loan.find({
        user: userId,
        status: { $in: ['ACTIVE', 'OVERDUE'] }
      }).populate({
        path: 'bookCopy',
        populate: { path: 'book' }
      }).populate('book').sort({ dueDate: 1 });

      res.render('member/loans', {
        title: 'My Active Borrowings & Due Dates',
        loans
      });
    } catch (err) {
      next(err);
    }
  }

  static async renewLoan(req, res, next) {
    try {
      const loanId = req.params.id;
      const loan = await Loan.findOne({ _id: loanId, user: req.user._id });
      if (!loan) {
        req.flash('error', 'Loan record not found.');
        return res.redirect('/member/loans');
      }

      await CirculationService.renewLoan(loan._id, req.user);
      req.flash('success', 'Loan renewed successfully. New due date assigned.');
      res.redirect('/member/loans');
    } catch (err) {
      req.flash('error', err.message || 'Could not renew loan.');
      res.redirect('/member/loans');
    }
  }

  static async getHolds(req, res, next) {
    try {
      const userId = req.user._id;
      const holds = await Reservation.find({
        user: userId,
        status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
      }).populate('book bookCopy').sort({ requestDate: 1 });

      res.render('member/holds', {
        title: 'My Hold Queue & Pickup Requests',
        holds
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelHold(req, res, next) {
    try {
      const holdId = req.params.id;
      const hold = await Reservation.findOne({ _id: holdId, user: req.user._id });
      if (!hold) {
        req.flash('error', 'Hold record not found.');
        return res.redirect('/member/holds');
      }

      await ReservationService.cancelHold(hold._id, req.user, 'Cancelled by patron from self-service portal');
      req.flash('success', 'Your hold reservation has been cancelled.');
      res.redirect('/member/holds');
    } catch (err) {
      req.flash('error', err.message || 'Could not cancel hold.');
      res.redirect('/member/holds');
    }
  }

  static async getFines(req, res, next) {
    try {
      const userId = req.user._id;
      const fines = await Fine.find({ user: userId })
        .populate('book loan')
        .sort({ createdAt: -1 });

      const totalPending = fines
        .filter(f => f.status === 'PENDING')
        .reduce((sum, f) => sum + f.amount, 0);

      res.render('member/fines', {
        title: 'Fines & Account Ledger',
        fines,
        totalPending
      });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req, res, next) {
    try {
      const userId = req.user._id;
      const historyLoans = await Loan.find({
        user: userId,
        status: 'RETURNED'
      }).populate('book bookCopy').sort({ returnedAt: -1 });

      res.render('member/history', {
        title: 'Borrowing History & Past Returns',
        loans: historyLoans
      });
    } catch (err) {
      next(err);
    }
  }

  static async getNotifications(req, res, next) {
    try {
      const userId = req.user._id;
      const notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 });

      // Mark all as read
      await NotificationService.markAllAsRead(userId);

      res.render('member/notifications', {
        title: 'Notifications & Circulation Alerts',
        notifications
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = MemberController;

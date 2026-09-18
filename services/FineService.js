const Fine = require('../models/Fine');
const Loan = require('../models/Loan');
const SettingService = require('./SettingService');
const AuditService = require('./AuditService');
const NotificationService = require('./NotificationService');

class FineService {
  /**
   * Calculate fine and overdue days for a given loan against policy
   */
  static calculateFineForLoan(loan, settings, targetDate = new Date()) {
    const returnOrTargetDate = loan.returnedAt ? new Date(loan.returnedAt) : new Date(targetDate);
    const d1 = new Date(loan.dueDate);
    d1.setHours(0, 0, 0, 0);
    const d2 = new Date(returnOrTargetDate);
    d2.setHours(0, 0, 0, 0);

    const diffMs = d2.getTime() - d1.getTime();
    if (diffMs <= 0) {
      return { daysOverdue: 0, chargeableDays: 0, amount: 0, isOverdue: false };
    }

    const daysOverdue = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (daysOverdue <= settings.gracePeriodDays) {
      return {
        daysOverdue,
        chargeableDays: 0,
        amount: 0,
        isOverdue: true,
        inGracePeriod: true
      };
    }

    // After grace period lapses, charge for overdue days
    const chargeableDays = daysOverdue - settings.gracePeriodDays;
    const rawAmount = chargeableDays * settings.finePerDay;
    const amount = Math.min(rawAmount, settings.maxFineAmount);

    return {
      daysOverdue,
      chargeableDays,
      amount,
      isOverdue: true,
      inGracePeriod: false
    };
  }

  /**
   * Sync active loans that have passed due dates, mark as OVERDUE, update fines
   */
  static async syncOverdues() {
    const settings = await SettingService.getSettings();
    const now = new Date();

    const overdueLoans = await Loan.find({
      status: { $in: ['ACTIVE', 'OVERDUE'] },
      dueDate: { $lt: now }
    }).populate('book user');

    for (const loan of overdueLoans) {
      const { daysOverdue, amount } = this.calculateFineForLoan(loan, settings, now);
      loan.status = 'OVERDUE';
      loan.fineCalculated = amount;
      await loan.save();

      if (amount > 0) {
        let fine = await Fine.findOne({ loan: loan._id });
        if (!fine) {
          fine = await Fine.create({
            user: loan.user._id,
            loan: loan._id,
            book: loan.book._id,
            amount,
            daysOverdue,
            status: 'PENDING'
          });

          await NotificationService.send({
            userId: loan.user._id,
            title: 'Overdue Notice & Fine Accrual',
            message: `Your loan for "${loan.book.title}" is ${daysOverdue} days overdue. Fine accrued: ${settings.currencySymbol}${amount}.`,
            type: 'OVERDUE_ALERT',
            link: '/member/fines'
          });
        } else if (fine.status === 'PENDING' && fine.amount !== amount) {
          fine.amount = amount;
          fine.daysOverdue = daysOverdue;
          await fine.save();
        }
      }
    }
  }

  /**
   * Get total outstanding unpaid fines for a member
   */
  static async getUserUnpaidFineTotal(userId) {
    const result = await Fine.aggregate([
      { $match: { user: userId, status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Process a fine payment
   */
  static async payFine(fineId, processedBy, { paymentMethod = 'CASH', receiptNumber = '' } = {}) {
    const fine = await Fine.findById(fineId).populate('user loan book');
    if (!fine) {
      throw new Error('Fine record not found');
    }
    if (fine.status === 'PAID') {
      throw new Error('This fine has already been paid');
    }

    fine.status = 'PAID';
    fine.paidAt = new Date();
    fine.processedBy = processedBy._id;
    fine.paymentMethod = paymentMethod;
    fine.receiptNumber = receiptNumber || `REC-${Date.now()}`;
    await fine.save();

    // Check if all fines for the loan are paid
    const remainingLoanFines = await Fine.countDocuments({ loan: fine.loan._id, status: 'PENDING' });
    if (remainingLoanFines === 0) {
      await Loan.findByIdAndUpdate(fine.loan._id, { finePaid: true });
    }

    await AuditService.log({
      actor: processedBy,
      action: 'FINE_PAID',
      targetType: 'Fine',
      targetId: fine._id,
      details: {
        fineId: fine._id,
        memberId: fine.user.memberId,
        memberName: fine.user.name,
        amount: fine.amount,
        receiptNumber: fine.receiptNumber,
        paymentMethod
      }
    });

    await NotificationService.send({
      userId: fine.user._id,
      title: 'Fine Payment Acknowledged',
      message: `Fine of ₹${fine.amount} for "${fine.book ? fine.book.title : 'item'}" was recorded as paid. Receipt: ${fine.receiptNumber}.`,
      type: 'ACCOUNT_STATUS',
      link: '/member/fines'
    });

    return fine;
  }

  /**
   * Waive a fine
   */
  static async waiveFine(fineId, processedBy, waivedReason) {
    const fine = await Fine.findById(fineId).populate('user loan book');
    if (!fine) {
      throw new Error('Fine record not found');
    }
    if (fine.status !== 'PENDING') {
      throw new Error(`Cannot waive fine with status ${fine.status}`);
    }

    fine.status = 'WAIVED';
    fine.processedBy = processedBy._id;
    fine.waivedReason = waivedReason || 'Librarian administrative waiver';
    await fine.save();

    await Loan.findByIdAndUpdate(fine.loan._id, { finePaid: true });

    await AuditService.log({
      actor: processedBy,
      action: 'FINE_WAIVED',
      targetType: 'Fine',
      targetId: fine._id,
      details: {
        fineId: fine._id,
        memberId: fine.user.memberId,
        memberName: fine.user.name,
        amount: fine.amount,
        waivedReason: fine.waivedReason
      }
    });

    await NotificationService.send({
      userId: fine.user._id,
      title: 'Fine Waived',
      message: `Fine of ₹${fine.amount} for "${fine.book ? fine.book.title : 'item'}" was waived by library administration.`,
      type: 'ACCOUNT_STATUS',
      link: '/member/fines'
    });

    return fine;
  }
}

module.exports = FineService;

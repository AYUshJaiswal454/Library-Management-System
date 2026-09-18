const Loan = require('../models/Loan');
const BookCopy = require('../models/BookCopy');
const Book = require('../models/Book');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const EligibilityService = require('./EligibilityService');
const SettingService = require('./SettingService');
const FineService = require('./FineService');
const ReservationService = require('./ReservationService');
const AuditService = require('./AuditService');
const NotificationService = require('./NotificationService');

class CirculationService {
  /**
   * Issue a book copy to a member
   */
  static async issueBook({ memberIdentifier, copyBarcode, librarianUser, notes = '' }) {
    const eligibility = await EligibilityService.evaluateIssueEligibility(memberIdentifier, copyBarcode);

    if (!eligibility.eligible) {
      const err = new Error(eligibility.primaryMessage || 'Issue blocked by circulation policy.');
      err.eligibility = eligibility;
      throw err;
    }

    const { member, copy } = eligibility;
    const settings = await SettingService.getSettings();

    const issuedAt = new Date();
    const dueDate = new Date(issuedAt.getTime() + settings.loanPeriodDays * 24 * 60 * 60 * 1000);

    // Create Loan record
    const loan = await Loan.create({
      bookCopy: copy._id,
      book: copy.book._id,
      user: member._id,
      issuedBy: librarianUser._id,
      issuedAt,
      dueDate,
      status: 'ACTIVE',
      notes: notes.trim()
    });

    // Update BookCopy status
    copy.status = 'ISSUED';
    copy.issueHistory.push({
      loan: loan._id,
      user: member._id,
      action: 'ISSUED',
      performedBy: librarianUser._id,
      timestamp: issuedAt,
      notes: `Issued by ${librarianUser.name}`
    });
    await copy.save();

    // If this checkout fulfills an active pickup hold for this member
    const fulfilledHold = await Reservation.findOneAndUpdate(
      {
        bookCopy: copy._id,
        user: member._id,
        status: 'AVAILABLE_FOR_PICKUP'
      },
      {
        status: 'FULFILLED',
        fulfilledAt: issuedAt,
        bookCopy: copy._id
      },
      { new: true }
    );

    // Audit Log
    await AuditService.log({
      actor: librarianUser,
      action: 'LOAN_ISSUED',
      targetType: 'Loan',
      targetId: loan._id,
      details: {
        loanId: loan._id,
        barcode: copy.barcode,
        bookId: copy.book._id,
        bookTitle: copy.book.title,
        memberId: member.memberId,
        memberName: member.name,
        dueDate: dueDate.toISOString(),
        fulfilledHoldId: fulfilledHold ? fulfilledHold._id : null
      }
    });

    // Notify Member
    await NotificationService.send({
      userId: member._id,
      title: 'Book Issued Successfully',
      message: `"${copy.book.title}" (Barcode: ${copy.barcode}) has been checked out. Return due date: ${dueDate.toLocaleDateString()}.`,
      type: 'GENERAL',
      link: '/member/loans'
    });

    return {
      loan,
      copy,
      member,
      dueDate,
      fulfilledHold
    };
  }

  /**
   * Process check-in / return of a circulating book copy
   */
  static async returnBook({ copyBarcode, librarianUser, conditionUpdate = null, notes = '' }) {
    const cleanBarcode = copyBarcode.trim().toUpperCase();
    const copy = await BookCopy.findOne({ barcode: cleanBarcode }).populate('book');

    if (!copy) {
      throw new Error(`Item copy with barcode "${cleanBarcode}" was not found.`);
    }

    const loan = await Loan.findOne({
      bookCopy: copy._id,
      status: { $in: ['ACTIVE', 'OVERDUE'] }
    }).populate('user book');

    const returnTime = new Date();
    const settings = await SettingService.getSettings();
    let fineRecord = null;
    let fineCalculated = 0;

    if (loan) {
      // Calculate final fine
      const fineResult = FineService.calculateFineForLoan(loan, settings, returnTime);
      fineCalculated = fineResult.amount;

      loan.returnedAt = returnTime;
      loan.status = 'RETURNED';
      loan.fineCalculated = fineCalculated;
      await loan.save();

      if (fineCalculated > 0) {
        fineRecord = await Fine.findOne({ loan: loan._id });
        if (!fineRecord) {
          fineRecord = await Fine.create({
            user: loan.user._id,
            loan: loan._id,
            book: copy.book._id,
            amount: fineCalculated,
            daysOverdue: fineResult.daysOverdue,
            status: 'PENDING'
          });
        } else {
          fineRecord.amount = fineCalculated;
          fineRecord.daysOverdue = fineResult.daysOverdue;
          await fineRecord.save();
        }

        await NotificationService.send({
          userId: loan.user._id,
          title: 'Overdue Fine Due on Returned Item',
          message: `Item "${copy.book.title}" returned ${fineResult.daysOverdue} days late. Overdue fine assessed: ${settings.currencySymbol}${fineCalculated}.`,
          type: 'OVERDUE_ALERT',
          link: '/member/fines'
        });
      } else {
        await NotificationService.send({
          userId: loan.user._id,
          title: 'Book Return Confirmed',
          message: `"${copy.book.title}" (Barcode: ${copy.barcode}) returned successfully on ${returnTime.toLocaleDateString()}.`,
          type: 'GENERAL',
          link: '/member/history'
        });
      }

      copy.issueHistory.push({
        loan: loan._id,
        user: loan.user._id,
        action: 'RETURNED',
        performedBy: librarianUser._id,
        timestamp: returnTime,
        notes: notes || `Returned to desk. Condition: ${conditionUpdate || copy.condition}`
      });
    }

    // Update physical condition if specified
    if (conditionUpdate) {
      copy.condition = conditionUpdate;
    }

    let holdTargetResult = null;

    if (conditionUpdate === 'DAMAGED') {
      copy.status = 'DAMAGED';
      await copy.save();
    } else {
      // Evaluate hold queue and target next waiting member
      holdTargetResult = await ReservationService.targetNextHoldForBook(copy.book._id, copy);
    }

    await copy.save();

    await AuditService.log({
      actor: librarianUser,
      action: 'LOAN_RETURNED',
      targetType: 'BookCopy',
      targetId: copy._id,
      details: {
        barcode: copy.barcode,
        bookTitle: copy.book.title,
        loanId: loan ? loan._id : null,
        memberId: loan ? loan.user.memberId : null,
        fineAssessed: fineCalculated,
        targetedNextHold: holdTargetResult ? holdTargetResult.targeted : false,
        condition: copy.condition,
        status: copy.status
      }
    });

    return {
      copy,
      loan,
      fine: fineRecord,
      fineCalculated,
      holdTargetResult
    };
  }

  /**
   * Renew an active loan
   */
  static async renewLoan(loanId, actorUser) {
    const loan = await Loan.findById(loanId).populate('book bookCopy user');
    if (!loan) {
      throw new Error('Loan record not found');
    }
    if (loan.status !== 'ACTIVE') {
      throw new Error(`Cannot renew loan with status "${loan.status}". Overdue or returned items must be processed at the desk.`);
    }

    // Check if other patrons have reserved this title
    const pendingHoldsCount = await Reservation.countDocuments({
      book: loan.book._id,
      status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
    });
    if (pendingHoldsCount > 0) {
      throw new Error(`Renewal blocked: There are ${pendingHoldsCount} active hold reservation(s) waiting for this title.`);
    }

    const settings = await SettingService.getSettings();
    const currentDue = new Date(loan.dueDate);
    const newDueDate = new Date(currentDue.getTime() + settings.loanPeriodDays * 24 * 60 * 60 * 1000);

    loan.dueDate = newDueDate;
    loan.renewedCount = (loan.renewedCount || 0) + 1;
    await loan.save();

    await AuditService.log({
      actor: actorUser,
      action: 'LOAN_RENEWED',
      targetType: 'Loan',
      targetId: loan._id,
      details: {
        barcode: loan.bookCopy.barcode,
        bookTitle: loan.book.title,
        newDueDate: newDueDate.toISOString(),
        renewedCount: loan.renewedCount
      }
    });

    await NotificationService.send({
      userId: loan.user._id,
      title: 'Loan Renewed',
      message: `Your loan for "${loan.book.title}" has been extended until ${newDueDate.toLocaleDateString()}.`,
      type: 'GENERAL',
      link: '/member/loans'
    });

    return loan;
  }
}

module.exports = CirculationService;

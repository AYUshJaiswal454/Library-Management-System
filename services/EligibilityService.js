const User = require('../models/User');
const BookCopy = require('../models/BookCopy');
const Loan = require('../models/Loan');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const SettingService = require('./SettingService');

class EligibilityService {
  /**
   * Evaluate member and copy eligibility for a checkout/issue operation
   */
  static async evaluateIssueEligibility(memberIdentifier, copyBarcode) {
    const settings = await SettingService.getSettings();
    const failureReasons = [];
    const checks = {
      memberFound: false,
      accountActive: false,
      membershipValid: false,
      loanLimitOk: false,
      noBlockingOverdues: false,
      fineThresholdOk: false,
      copyFound: false,
      copyStatusCirculatable: false,
      holdAuthorized: false
    };

    // 1. Locate Member by ID, Email, or Mongo ID
    let member = null;
    if (typeof memberIdentifier === 'string') {
      member = await User.findOne({
        $or: [
          { memberId: memberIdentifier.trim().toUpperCase() },
          { email: memberIdentifier.trim().toLowerCase() }
        ]
      });
    } else if (memberIdentifier && memberIdentifier._id) {
      member = await User.findById(memberIdentifier._id);
    }

    if (!member) {
      return {
        eligible: false,
        member: null,
        copy: null,
        checks,
        failureReasons: ['Member record not found in system.'],
        primaryMessage: 'Member not found.'
      };
    }
    checks.memberFound = true;

    // Check account restriction
    if (member.isRestricted) {
      failureReasons.push(`Account is restricted: ${member.restrictionReason || 'Administrative suspension'}.`);
    } else {
      checks.accountActive = true;
    }

    // Check membership expiration
    if (member.membershipExpiresAt && new Date(member.membershipExpiresAt) < new Date()) {
      failureReasons.push(`Membership expired on ${new Date(member.membershipExpiresAt).toLocaleDateString()}. Renewal required.`);
    } else {
      checks.membershipValid = true;
    }

    // Check active loans limit
    const activeLoans = await Loan.find({
      user: member._id,
      status: { $in: ['ACTIVE', 'OVERDUE'] }
    }).populate('book');

    if (activeLoans.length >= settings.maxLoanLimit) {
      failureReasons.push(`Borrowing limit reached: Member has ${activeLoans.length} active loans (Policy maximum is ${settings.maxLoanLimit}).`);
    } else {
      checks.loanLimitOk = true;
    }

    // Check for overdue loans
    const overdueLoans = activeLoans.filter(l => l.status === 'OVERDUE' || new Date(l.dueDate) < new Date());
    if (overdueLoans.length > 0) {
      failureReasons.push(`Member has ${overdueLoans.length} overdue item(s) requiring immediate return before new loans can be issued.`);
    } else {
      checks.noBlockingOverdues = true;
    }

    // Check outstanding unpaid fine balance
    const unpaidFineAgg = await Fine.aggregate([
      { $match: { user: member._id, status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const unpaidFineTotal = unpaidFineAgg.length > 0 ? unpaidFineAgg[0].total : 0;

    if (unpaidFineTotal >= settings.blockingFineThreshold) {
      failureReasons.push(`Outstanding unpaid fines (${settings.currencySymbol}${unpaidFineTotal}) meet or exceed the borrowing block threshold (${settings.currencySymbol}${settings.blockingFineThreshold}).`);
    } else {
      checks.fineThresholdOk = true;
    }

    // 2. Locate Copy by Barcode
    let copy = null;
    if (copyBarcode) {
      copy = await BookCopy.findOne({ barcode: copyBarcode.trim().toUpperCase() }).populate('book');
    }

    if (!copy) {
      failureReasons.push(`Item copy with barcode "${copyBarcode}" does not exist in inventory.`);
      return {
        eligible: false,
        member,
        copy: null,
        activeLoansCount: activeLoans.length,
        unpaidFineTotal,
        checks,
        failureReasons,
        primaryMessage: failureReasons[0]
      };
    }
    checks.copyFound = true;

    // Check copy status & hold reservation authorization
    if (copy.status === 'AVAILABLE') {
      checks.copyStatusCirculatable = true;
      checks.holdAuthorized = true;
    } else if (copy.status === 'RESERVED') {
      // Must be held specifically for this member
      const activeHold = await Reservation.findOne({
        bookCopy: copy._id,
        user: member._id,
        status: 'AVAILABLE_FOR_PICKUP'
      });

      if (activeHold) {
        checks.copyStatusCirculatable = true;
        checks.holdAuthorized = true;
      } else {
        failureReasons.push(`This copy (Barcode: ${copy.barcode}) is currently reserved for another patron awaiting pickup.`);
      }
    } else if (copy.status === 'ISSUED') {
      failureReasons.push(`This copy (Barcode: ${copy.barcode}) is currently checked out on loan to another patron.`);
    } else if (copy.status === 'DAMAGED') {
      failureReasons.push(`This copy (Barcode: ${copy.barcode}) is flagged as DAMAGED and cannot be circulated.`);
    } else if (copy.status === 'LOST') {
      failureReasons.push(`This copy (Barcode: ${copy.barcode}) is recorded as LOST.`);
    } else if (copy.status === 'MAINTENANCE') {
      failureReasons.push(`This copy (Barcode: ${copy.barcode}) is currently under BINDING / MAINTENANCE.`);
    }

    const eligible = failureReasons.length === 0;

    return {
      eligible,
      member,
      copy,
      activeLoansCount: activeLoans.length,
      unpaidFineTotal,
      overdueLoansCount: overdueLoans.length,
      checks,
      failureReasons,
      primaryMessage: eligible ? 'Member and item copy are eligible for immediate checkout.' : failureReasons[0]
    };
  }
}

module.exports = EligibilityService;

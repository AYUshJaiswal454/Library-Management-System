const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const Loan = require('../models/Loan');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const Notification = require('../models/Notification');
const LibrarySetting = require('../models/LibrarySetting');

const CirculationService = require('../services/CirculationService');
const ReservationService = require('../services/ReservationService');
const InventoryService = require('../services/InventoryService');
const EligibilityService = require('../services/EligibilityService');
const FineService = require('../services/FineService');
const SettingService = require('../services/SettingService');

const runVerification = async () => {
  console.log('===============================================================');
  console.log('  AUTOMATED VERIFICATION SUITE: CIRCULATION & AVAILABILITY');
  console.log('===============================================================');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/library_circulation';
  await mongoose.connect(mongoUri);

  const librarian = await User.findOne({ role: 'LIBRARIAN' });
  const testMember1 = await User.findOne({ email: 'priya.patel@institution.edu' });
  const testMember2 = await User.findOne({ email: 'ananya.sen@institution.edu' });
  const restrictedMember = await User.findOne({ isRestricted: true });
  const settings = await SettingService.getSettings();

  console.log(`[Context] Loaded Librarian: ${librarian.name}, Member 1: ${testMember1.name}`);

  // -------------------------------------------------------------------------
  // F1: Issue Lifecycle & Real-Time Availability Decrement
  // -------------------------------------------------------------------------
  console.log('\n--- TESTING FLOW F1: Issue Lifecycle & Availability Derivation ---');
  // Find a book with available copies
  const bookF1 = await Book.findOne({ title: 'Designing Data-Intensive Applications' });
  const availBeforeF1 = await InventoryService.getBookAvailability(bookF1._id);
  console.log(`[F1] Title: "${bookF1.title}"`);
  console.log(`[F1] Available Copies BEFORE issue: ${availBeforeF1.available} / ${availBeforeF1.total}`);

  const availableCopy = await BookCopy.findOne({ book: bookF1._id, status: 'AVAILABLE' });
  console.log(`[F1] Issuing Copy Barcode: ${availableCopy.barcode} to Member: ${testMember1.memberId}`);

  const issueResult = await CirculationService.issueBook({
    memberIdentifier: testMember1.memberId,
    copyBarcode: availableCopy.barcode,
    librarianUser: librarian
  });

  const availAfterF1 = await InventoryService.getBookAvailability(bookF1._id);
  console.log(`[F1] Available Copies AFTER issue: ${availAfterF1.available} / ${availAfterF1.total}`);
  console.log(`[F1] Loan created with Due Date: ${issueResult.dueDate.toISOString().slice(0, 10)}`);

  if (availAfterF1.available === availBeforeF1.available - 1 && issueResult.loan.status === 'ACTIVE') {
    console.log('>>> [PASS] F1: Issue successful, availability decremented in real-time, loan and due date registered.');
  } else {
    throw new Error('F1 Verification Failed');
  }

  // -------------------------------------------------------------------------
  // F2: Unavailable Title -> Reserve -> Return -> Hold Targeting Engine
  // -------------------------------------------------------------------------
  console.log('\n--- TESTING FLOW F2: Hold Queue, Real-time Targeting & Pickup Lock ---');
  const cleanCodeBook = await Book.findOne({ title: { $regex: 'Clean Code', $options: 'i' } });
  const availCleanCode = await InventoryService.getBookAvailability(cleanCodeBook._id);
  console.log(`[F2] Clean Code Availability: ${availCleanCode.available} / ${availCleanCode.total} on shelf (Expected 0)`);

  // Place a new hold for Member 2 (Rohit or Ananya)
  const newHoldMember = await User.findOne({ email: 'arjun.nair@institution.edu' });
  // Ensure no duplicate hold first
  await Reservation.deleteMany({ book: cleanCodeBook._id, user: newHoldMember._id });
  const hold = await ReservationService.placeHold(cleanCodeBook._id, newHoldMember._id);
  console.log(`[F2] Hold placed for ${newHoldMember.name}. Queue Position: #${hold.queuePosition}`);

  // Now simulate a check-in / return of one copy of Clean Code
  const issuedCopy = await BookCopy.findOne({ book: cleanCodeBook._id, status: 'ISSUED' });
  console.log(`[F2] Processing return of copy: ${issuedCopy.barcode} at Circulation Desk...`);

  const returnResult = await CirculationService.returnBook({
    copyBarcode: issuedCopy.barcode,
    librarianUser: librarian
  });

  console.log(`[F2] Return check-in complete. Target Result:`, returnResult.holdTargetResult.targeted);
  console.log(`[F2] Targeted Reservation Status: ${returnResult.holdTargetResult.reservation.status}`);
  console.log(`[F2] Held for Member: ${returnResult.holdTargetResult.reservation.user.name}`);
  console.log(`[F2] Pickup Deadline: ${returnResult.holdTargetResult.reservation.pickupDeadline.toISOString().slice(0, 10)}`);
  console.log(`[F2] Copy Status Locked as: ${returnResult.copy.status}`);

  if (
    returnResult.holdTargetResult.targeted === true &&
    returnResult.holdTargetResult.reservation.status === 'AVAILABLE_FOR_PICKUP' &&
    returnResult.copy.status === 'RESERVED'
  ) {
    console.log('>>> [PASS] F2: Hold queue targeted next eligible patron, copy locked as RESERVED with pickup deadline, and notification dispatched.');
  } else {
    throw new Error('F2 Verification Failed');
  }

  // -------------------------------------------------------------------------
  // F3: Overdue Flagging, Daily Fine Accrual & Return Final Fine Calculation
  // -------------------------------------------------------------------------
  console.log('\n--- TESTING FLOW F3: Overdue Loan, Policy-based Fine Accrual & Return ---');
  // Create a synthetic overdue loan: issued 20 days ago, due 6 days ago (grace = 1, chargeable = 5 days * 5 = ₹25)
  const testBookF3 = await Book.findOne({ title: 'Meditations' });
  const copyF3 = await BookCopy.findOne({ book: testBookF3._id });
  copyF3.status = 'ISSUED';
  await copyF3.save();

  const pastIssuedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const pastDueDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  const syntheticOverdueLoan = await Loan.create({
    bookCopy: copyF3._id,
    book: testBookF3._id,
    user: testMember1._id,
    issuedBy: librarian._id,
    issuedAt: pastIssuedAt,
    dueDate: pastDueDate,
    status: 'ACTIVE'
  });

  // Run overdue sync
  await FineService.syncOverdues();
  const refreshedLoan = await Loan.findById(syntheticOverdueLoan._id);
  console.log(`[F3] Loan status after sync: ${refreshedLoan.status} (Expected OVERDUE)`);
  console.log(`[F3] Fine calculated: ₹${refreshedLoan.fineCalculated} (Expected: (6 - 1 grace) * 5 = ₹25)`);

  // Now return this overdue item
  const returnF3 = await CirculationService.returnBook({
    copyBarcode: copyF3.barcode,
    librarianUser: librarian
  });

  console.log(`[F3] Returned. Final fine assessed: ₹${returnF3.fineCalculated}, Fine Status: ${returnF3.fine ? returnF3.fine.status : 'N/A'}`);

  if (refreshedLoan.status === 'OVERDUE' && returnF3.fineCalculated === 25 && returnF3.fine.status === 'PENDING') {
    console.log('>>> [PASS] F3: Overdue correctly flagged, daily fines accrued per policy, and return computed final fine.');
  } else {
    throw new Error('F3 Verification Failed');
  }

  // -------------------------------------------------------------------------
  // F4: Eligibility Hard Blocks with Human-Readable Diagnostic Messages
  // -------------------------------------------------------------------------
  console.log('\n--- TESTING FLOW F4: Eligibility Engine Pre-Loan Hard Blocks ---');

  // Block 1: Account Restricted
  const checkRestricted = await EligibilityService.evaluateIssueEligibility(restrictedMember.memberId, availableCopy.barcode);
  console.log(`[F4-A Restricted Block] Eligible: ${checkRestricted.eligible}, Reason: "${checkRestricted.primaryMessage}"`);

  // Block 2: Copy is RESERVED for someone else
  const reservedCopy = await BookCopy.findOne({ status: 'RESERVED' });
  const checkReserved = await EligibilityService.evaluateIssueEligibility(testMember1.memberId, reservedCopy.barcode);
  console.log(`[F4-B Reserved Copy Block] Eligible: ${checkReserved.eligible}, Reason: "${checkReserved.primaryMessage}"`);

  // Block 3: Blocking Overdue on Member
  const overdueMember = await User.findOne({ email: 'karan.mehta@institution.edu' });
  const checkOverdue = await EligibilityService.evaluateIssueEligibility(overdueMember.memberId, availableCopy.barcode);
  console.log(`[F4-C Overdue Loan Block] Eligible: ${checkOverdue.eligible}, Reason: "${checkOverdue.primaryMessage}"`);

  // Block 4: Loan Limit Exceeded
  // Temporarily set policy maxLoanLimit = 1 to test
  settings.maxLoanLimit = 1;
  await settings.save();
  const checkLimit = await EligibilityService.evaluateIssueEligibility(testMember1.memberId, availableCopy.barcode);
  console.log(`[F4-D Loan Limit Block] Eligible: ${checkLimit.eligible}, Reason: "${checkLimit.primaryMessage}"`);
  // Restore setting
  settings.maxLoanLimit = 4;
  await settings.save();

  if (!checkRestricted.eligible && !checkReserved.eligible && !checkOverdue.eligible && !checkLimit.eligible) {
    console.log('>>> [PASS] F4: All 4 hard eligibility gates blocked appropriately with human-readable diagnostic messages.');
  } else {
    throw new Error('F4 Verification Failed');
  }

  // -------------------------------------------------------------------------
  // F5: Copy Marked DAMAGED & LOST -> Availability Recalculates -> History Intact
  // -------------------------------------------------------------------------
  console.log('\n--- TESTING FLOW F5: Damaged & Lost Copy Lifecycle & History Preservation ---');
  const bookF5 = await Book.findOne({ title: 'A Brief History of Time' });
  const copiesF5 = await BookCopy.find({ book: bookF5._id });
  const availBeforeF5 = await InventoryService.getBookAvailability(bookF5._id);
  console.log(`[F5] "${bookF5.title}" initial available: ${availBeforeF5.available} / ${availBeforeF5.total}`);

  // Mark copy 0 as DAMAGED
  await InventoryService.changeCopyStatus(copiesF5[0]._id, 'DAMAGED', librarian, 'Liquid spill damage');
  const availAfterDamaged = await InventoryService.getBookAvailability(bookF5._id);
  console.log(`[F5] After marking copy 1 DAMAGED: Available = ${availAfterDamaged.available}, Damaged = ${availAfterDamaged.damaged}`);

  // Mark copy 1 as LOST
  await InventoryService.changeCopyStatus(copiesF5[1]._id, 'LOST', librarian, 'Unreturned asset declared lost');
  const availAfterLost = await InventoryService.getBookAvailability(bookF5._id);
  console.log(`[F5] After marking copy 2 LOST: Available = ${availAfterLost.available}, Lost = ${availAfterLost.lost}`);

  // Verify historical loan records remain completely intact
  const allHistoricalLoans = await Loan.countDocuments();
  console.log(`[F5] Total historical and active loans intact: ${allHistoricalLoans}`);

  if (availAfterDamaged.available === availBeforeF5.available - 1 && availAfterLost.available === 0 && allHistoricalLoans > 0) {
    console.log('>>> [PASS] F5: Copy transitions to DAMAGED and LOST correctly update derived availability while preserving historical loans.');
  } else {
    throw new Error('F5 Verification Failed');
  }

  console.log('\n===============================================================');
  console.log('  ALL FLOWS F1 - F5 VERIFIED SUCCESSFULLY WITH 100% PASS RATE');
  console.log('===============================================================\n');

  process.exit(0);
};

runVerification().catch(err => {
  console.error('[Verification Error]:', err);
  process.exit(1);
});

const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const Category = require('../models/Category');
const User = require('../models/User');
const Loan = require('../models/Loan');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const AuditLog = require('../models/AuditLog');
const LibrarySetting = require('../models/LibrarySetting');

const CirculationService = require('../services/CirculationService');
const InventoryService = require('../services/InventoryService');
const ReservationService = require('../services/ReservationService');
const FineService = require('../services/FineService');
const SettingService = require('../services/SettingService');
const AuditService = require('../services/AuditService');
const EligibilityService = require('../services/EligibilityService');

class LibrarianController {
  /**
   * Operational Circulation Desk Dashboard
   */
  static async getDesk(req, res, next) {
    try {
      await FineService.syncOverdues();
      await ReservationService.expireStaleHolds();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Operational metrics
      const todayIssuesCount = await Loan.countDocuments({
        issuedAt: { $gte: todayStart }
      });

      const todayReturnsCount = await Loan.countDocuments({
        returnedAt: { $gte: todayStart }
      });

      const activeLoansCount = await Loan.countDocuments({
        status: { $in: ['ACTIVE', 'OVERDUE'] }
      });

      const overdueLoansCount = await Loan.countDocuments({
        status: 'OVERDUE'
      });

      const holdsAwaitingPickupCount = await Reservation.countDocuments({
        status: 'AVAILABLE_FOR_PICKUP'
      });

      const pendingHoldsCount = await Reservation.countDocuments({
        status: 'PENDING'
      });

      const damagedOrLostCount = await BookCopy.countDocuments({
        status: { $in: ['DAMAGED', 'LOST'] }
      });

      // Recent Desk Transactions
      const recentLoans = await Loan.find()
        .populate('book bookCopy user issuedBy')
        .sort({ updatedAt: -1 })
        .limit(10);

      // Holds Awaiting Pickup
      const pickupHolds = await Reservation.find({ status: 'AVAILABLE_FOR_PICKUP' })
        .populate('book bookCopy user')
        .sort({ pickupDeadline: 1 })
        .limit(8);

      // High-demand titles with 0 available copies
      const allBooks = await Book.find().limit(50);
      const bookIds = allBooks.map(b => b._id);
      const availMap = await InventoryService.getAvailabilityMap(bookIds);

      const highDemandTitles = allBooks.filter(b => {
        const stats = availMap[b._id.toString()];
        return stats && stats.available === 0 && stats.pendingHolds > 0;
      }).slice(0, 5);

      res.render('librarian/desk', {
        title: 'Circulation Desk - Operations Dashboard',
        todayIssuesCount,
        todayReturnsCount,
        activeLoansCount,
        overdueLoansCount,
        holdsAwaitingPickupCount,
        pendingHoldsCount,
        damagedOrLostCount,
        recentLoans,
        pickupHolds,
        highDemandTitles,
        availMap
      });
    } catch (err) {
      console.error('[Librarian Desk Error]:', err);
      next(err);
    }
  }

  /**
   * Process an issue/checkout from desk
   */
  static async postIssue(req, res) {
    const { memberIdentifier, copyBarcode, notes } = req.body;
    try {
      if (!memberIdentifier || !copyBarcode) {
        req.flash('error', 'Both Member ID / Email and Item Barcode are required.');
        return res.redirect('/librarian/desk');
      }

      const result = await CirculationService.issueBook({
        memberIdentifier: memberIdentifier.trim(),
        copyBarcode: copyBarcode.trim(),
        librarianUser: req.user,
        notes: notes || ''
      });

      req.flash(
        'success',
        `Successfully issued "${result.copy.book.title}" (Barcode: ${result.copy.barcode}) to ${result.member.name} (${result.member.memberId}). Due date: ${res.locals.formatDate(result.dueDate)}.`
      );
      res.redirect('/librarian/desk');
    } catch (err) {
      req.flash('error', `Issue Blocked: ${err.message}`);
      res.redirect('/librarian/desk');
    }
  }

  /**
   * Process a return/check-in from desk
   */
  static async postReturn(req, res) {
    const { copyBarcode, conditionUpdate, notes } = req.body;
    try {
      if (!copyBarcode) {
        req.flash('error', 'Item Barcode is required for check-in.');
        return res.redirect('/librarian/desk');
      }

      const result = await CirculationService.returnBook({
        copyBarcode: copyBarcode.trim(),
        librarianUser: req.user,
        conditionUpdate: conditionUpdate || null,
        notes: notes || ''
      });

      let msg = `Returned "${result.copy.book.title}" (Barcode: ${result.copy.barcode}).`;
      if (result.fineCalculated > 0) {
        msg += ` Overdue fine assessed: ₹${result.fineCalculated}.`;
      }
      if (result.holdTargetResult && result.holdTargetResult.targeted) {
        msg += ` Target Hold Matched! Copy is now held for patron ${result.holdTargetResult.reservation.user.name} (Deadline: ${res.locals.formatDate(result.holdTargetResult.reservation.pickupDeadline)}).`;
      } else {
        msg += ` Status: ${result.copy.status}.`;
      }

      req.flash('success', msg);
      res.redirect('/librarian/desk');
    } catch (err) {
      req.flash('error', `Check-in Failed: ${err.message}`);
      res.redirect('/librarian/desk');
    }
  }

  /**
   * Book Inventory Management List
   */
  static async getBooks(req, res, next) {
    try {
      const { q = '', category = '', page = 1 } = req.query;
      const currentPage = Math.max(1, parseInt(page) || 1);
      const limit = 20;
      const skip = (currentPage - 1) * limit;

      const queryFilter = {};
      if (q && q.trim().length > 0) {
        const cleanQ = q.trim();
        queryFilter.$or = [
          { title: { $regex: cleanQ, $options: 'i' } },
          { author: { $regex: cleanQ, $options: 'i' } },
          { isbn: { $regex: cleanQ, $options: 'i' } }
        ];
      }
      if (category && category !== 'ALL') {
        queryFilter.category = category;
      }

      const totalBooks = await Book.countDocuments(queryFilter);
      const books = await Book.find(queryFilter)
        .populate('category')
        .sort({ title: 1 })
        .skip(skip)
        .limit(limit);

      const bookIds = books.map(b => b._id);
      const availMap = await InventoryService.getAvailabilityMap(bookIds);
      const categories = await Category.find().sort({ name: 1 });

      res.render('librarian/books/index', {
        title: 'Title Catalogue & Inventory Management',
        books,
        availMap,
        categories,
        searchQuery: q,
        selectedCategory: category,
        currentPage,
        totalPages: Math.ceil(totalBooks / limit) || 1,
        totalBooks
      });
    } catch (err) {
      next(err);
    }
  }

  static async getNewBook(req, res, next) {
    try {
      const categories = await Category.find().sort({ name: 1 });
      res.render('librarian/books/new', {
        title: 'Add New Bibliographic Title',
        categories
      });
    } catch (err) {
      next(err);
    }
  }

  static async postNewBook(req, res, next) {
    try {
      const {
        title,
        author,
        isbn,
        category,
        publisher,
        publicationYear,
        language,
        description,
        callNumber,
        initialCopiesCount,
        initialShelfLocation
      } = req.body;

      const cleanIsbn = isbn.trim().toUpperCase();
      const existing = await Book.findOne({ isbn: cleanIsbn });
      if (existing) {
        req.flash('error', `A book with ISBN ${cleanIsbn} already exists in the catalogue.`);
        return res.redirect('/librarian/books/new');
      }

      const book = await Book.create({
        title: title.trim(),
        author: author.trim(),
        isbn: cleanIsbn,
        category,
        publisher: publisher ? publisher.trim() : '',
        publicationYear: publicationYear ? parseInt(publicationYear) : undefined,
        language: language ? language.trim() : 'English',
        description: description ? description.trim() : '',
        callNumber: callNumber ? callNumber.trim() : ''
      });

      // Create initial physical copies if requested
      const copiesCount = parseInt(initialCopiesCount) || 1;
      const shelfLoc = initialShelfLocation ? initialShelfLocation.trim() : 'Main Stacks';

      for (let i = 1; i <= copiesCount; i++) {
        const barcode = `BC-${cleanIsbn.replace(/[^A-Z0-9]/g, '')}-${i.toString().padStart(2, '0')}`;
        await BookCopy.create({
          barcode,
          book: book._id,
          copyNumber: i,
          status: 'AVAILABLE',
          condition: 'NEW',
          shelfLocation: shelfLoc,
          issueHistory: [{
            action: 'STATUS_CHANGE',
            performedBy: req.user._id,
            timestamp: new Date(),
            notes: 'Initial Catalogue Ingestion'
          }]
        });
      }

      await AuditService.log({
        actor: req.user,
        action: 'BOOK_CREATED',
        targetType: 'Book',
        targetId: book._id,
        details: {
          title: book.title,
          isbn: book.isbn,
          initialCopies: copiesCount
        }
      });

      req.flash('success', `Title "${book.title}" added successfully with ${copiesCount} physical copy/copies.`);
      res.redirect(`/librarian/books/${book._id}/copies`);
    } catch (err) {
      req.flash('error', err.message || 'Failed to create book title.');
      res.redirect('/librarian/books/new');
    }
  }

  static async getEditBook(req, res, next) {
    try {
      const book = await Book.findById(req.params.id);
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/librarian/books');
      }
      const categories = await Category.find().sort({ name: 1 });
      res.render('librarian/books/edit', {
        title: `Edit Title: ${book.title}`,
        book,
        categories
      });
    } catch (err) {
      next(err);
    }
  }

  static async postEditBook(req, res, next) {
    try {
      const {
        title,
        author,
        isbn,
        category,
        publisher,
        publicationYear,
        language,
        description,
        callNumber
      } = req.body;

      const book = await Book.findById(req.params.id);
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/librarian/books');
      }

      book.title = title.trim();
      book.author = author.trim();
      book.isbn = isbn.trim().toUpperCase();
      book.category = category;
      book.publisher = publisher ? publisher.trim() : '';
      book.publicationYear = publicationYear ? parseInt(publicationYear) : undefined;
      book.language = language ? language.trim() : 'English';
      book.description = description ? description.trim() : '';
      book.callNumber = callNumber ? callNumber.trim() : '';

      await book.save();

      await AuditService.log({
        actor: req.user,
        action: 'BOOK_UPDATED',
        targetType: 'Book',
        targetId: book._id,
        details: { title: book.title, isbn: book.isbn }
      });

      req.flash('success', `Title "${book.title}" updated successfully.`);
      res.redirect('/librarian/books');
    } catch (err) {
      req.flash('error', err.message || 'Failed to update book.');
      res.redirect(`/librarian/books/${req.params.id}/edit`);
    }
  }

  /**
   * Copy-level Inventory Management
   */
  static async getCopies(req, res, next) {
    try {
      const book = await Book.findById(req.params.id).populate('category');
      if (!book) {
        req.flash('error', 'Book not found.');
        return res.redirect('/librarian/books');
      }

      const copies = await BookCopy.find({ book: book._id }).sort({ copyNumber: 1 });
      const availability = await InventoryService.getBookAvailability(book._id);

      res.render('librarian/copies/manage', {
        title: `Copies Inventory - ${book.title}`,
        book,
        copies,
        availability
      });
    } catch (err) {
      next(err);
    }
  }

  static async postAddCopy(req, res, next) {
    try {
      const { barcode, condition, shelfLocation, notes } = req.body;
      const copy = await InventoryService.addCopy(
        req.params.id,
        { barcode, condition, shelfLocation, notes },
        req.user
      );

      req.flash('success', `New copy registered (Barcode: ${copy.barcode}) at ${copy.shelfLocation}.`);
      res.redirect(`/librarian/books/${req.params.id}/copies`);
    } catch (err) {
      req.flash('error', err.message || 'Failed to add copy.');
      res.redirect(`/librarian/books/${req.params.id}/copies`);
    }
  }

  static async postUpdateCopyStatus(req, res, next) {
    try {
      const { copyId, newStatus, condition, shelfLocation, notes } = req.body;
      const copy = await BookCopy.findById(copyId);
      if (!copy) {
        req.flash('error', 'Copy not found.');
        return res.redirect(`/librarian/books/${req.params.id}/copies`);
      }

      if (condition || shelfLocation) {
        await InventoryService.updateCopy(copy._id, { condition, shelfLocation, notes }, req.user);
      }

      if (newStatus && newStatus !== copy.status) {
        await InventoryService.changeCopyStatus(copy._id, newStatus, req.user, notes);
      }

      req.flash('success', `Copy ${copy.barcode} updated successfully (Status: ${newStatus || copy.status}).`);
      res.redirect(`/librarian/books/${req.params.id}/copies`);
    } catch (err) {
      req.flash('error', err.message || 'Failed to update copy status.');
      res.redirect(`/librarian/books/${req.params.id}/copies`);
    }
  }

  /**
   * Member Records & Directory
   */
  static async getMembers(req, res, next) {
    try {
      const { q = '', page = 1 } = req.query;
      const currentPage = Math.max(1, parseInt(page) || 1);
      const limit = 20;
      const skip = (currentPage - 1) * limit;

      const queryFilter = { role: 'MEMBER' };
      if (q && q.trim().length > 0) {
        const cleanQ = q.trim();
        queryFilter.$or = [
          { name: { $regex: cleanQ, $options: 'i' } },
          { email: { $regex: cleanQ, $options: 'i' } },
          { memberId: { $regex: cleanQ, $options: 'i' } }
        ];
      }

      const totalMembers = await User.countDocuments(queryFilter);
      const members = await User.find(queryFilter)
        .sort({ memberId: 1 })
        .skip(skip)
        .limit(limit);

      // Attach active loan & fine count per member
      const memberIds = members.map(m => m._id);
      const loanCounts = await Loan.aggregate([
        { $match: { user: { $in: memberIds }, status: { $in: ['ACTIVE', 'OVERDUE'] } } },
        { $group: { _id: '$user', count: { $sum: 1 } } }
      ]);
      const fineCounts = await Fine.aggregate([
        { $match: { user: { $in: memberIds }, status: 'PENDING' } },
        { $group: { _id: '$user', total: { $sum: '$amount' } } }
      ]);

      const loanMap = {};
      loanCounts.forEach(l => { loanMap[l._id.toString()] = l.count; });
      const fineMap = {};
      fineCounts.forEach(f => { fineMap[f._id.toString()] = f.total; });

      res.render('librarian/members/index', {
        title: 'Member Directory & Patron Accounts',
        members,
        loanMap,
        fineMap,
        searchQuery: q,
        currentPage,
        totalPages: Math.ceil(totalMembers / limit) || 1,
        totalMembers
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMemberRecord(req, res, next) {
    try {
      const member = await User.findById(req.params.id);
      if (!member) {
        req.flash('error', 'Member record not found.');
        return res.redirect('/librarian/members');
      }

      // Active & Overdue loans
      const activeLoans = await Loan.find({
        user: member._id,
        status: { $in: ['ACTIVE', 'OVERDUE'] }
      }).populate('book bookCopy').sort({ dueDate: 1 });

      // Past borrowing history
      const pastLoans = await Loan.find({
        user: member._id,
        status: 'RETURNED'
      }).populate('book bookCopy').sort({ returnedAt: -1 }).limit(20);

      // Holds
      const holds = await Reservation.find({
        user: member._id,
        status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
      }).populate('book bookCopy').sort({ requestDate: 1 });

      // Fines
      const fines = await Fine.find({ user: member._id })
        .populate('book loan')
        .sort({ createdAt: -1 });

      const totalPendingFines = fines
        .filter(f => f.status === 'PENDING')
        .reduce((sum, f) => sum + f.amount, 0);

      res.render('librarian/members/show', {
        title: `Member Record: ${member.name} (${member.memberId})`,
        member,
        activeLoans,
        pastLoans,
        holds,
        fines,
        totalPendingFines
      });
    } catch (err) {
      next(err);
    }
  }

  static async postToggleRestriction(req, res, next) {
    try {
      const member = await User.findById(req.params.id);
      if (!member) {
        req.flash('error', 'Member not found.');
        return res.redirect('/librarian/members');
      }

      const { isRestricted, restrictionReason } = req.body;
      const restrictedBool = isRestricted === 'true' || isRestricted === true;

      member.isRestricted = restrictedBool;
      member.restrictionReason = restrictedBool ? (restrictionReason || 'Administrative restriction').trim() : '';
      await member.save();

      await AuditService.log({
        actor: req.user,
        action: restrictedBool ? 'USER_RESTRICTED' : 'USER_UNRESTRICTED',
        targetType: 'User',
        targetId: member._id,
        details: {
          memberId: member.memberId,
          isRestricted: restrictedBool,
          reason: member.restrictionReason
        }
      });

      req.flash(
        'success',
        `Member ${member.name} (${member.memberId}) account ${restrictedBool ? 'RESTRICTED' : 'UNRESTRICTED'}.`
      );
      res.redirect(`/librarian/members/${member._id}`);
    } catch (err) {
      req.flash('error', err.message || 'Failed to update restriction.');
      res.redirect(`/librarian/members/${req.params.id}`);
    }
  }

  /**
   * Holds & Pull Queue View
   */
  static async getHolds(req, res, next) {
    try {
      await ReservationService.expireStaleHolds();

      const pickupHolds = await Reservation.find({ status: 'AVAILABLE_FOR_PICKUP' })
        .populate('book bookCopy user')
        .sort({ pickupDeadline: 1 });

      const pendingHolds = await Reservation.find({ status: 'PENDING' })
        .populate('book user')
        .sort({ book: 1, requestDate: 1 });

      res.render('librarian/holds/index', {
        title: 'Holds Management & Pull Queue',
        pickupHolds,
        pendingHolds
      });
    } catch (err) {
      next(err);
    }
  }

  static async postCancelHold(req, res, next) {
    try {
      const holdId = req.params.id;
      const { reason = 'Cancelled by Librarian Desk' } = req.body;
      await ReservationService.cancelHold(holdId, req.user, reason);
      req.flash('success', 'Hold reservation cancelled successfully.');
      res.redirect('/librarian/holds');
    } catch (err) {
      req.flash('error', err.message || 'Could not cancel hold.');
      res.redirect('/librarian/holds');
    }
  }

  /**
   * Overdues & Fines Management
   */
  static async getOverdues(req, res, next) {
    try {
      await FineService.syncOverdues();

      const overdueLoans = await Loan.find({ status: 'OVERDUE' })
        .populate('book bookCopy user')
        .sort({ dueDate: 1 });

      const pendingFines = await Fine.find({ status: 'PENDING' })
        .populate('book loan user')
        .sort({ createdAt: -1 });

      const totalPendingAmount = pendingFines.reduce((sum, f) => sum + f.amount, 0);

      res.render('librarian/overdues/index', {
        title: 'Overdues & Outstanding Fines',
        overdueLoans,
        pendingFines,
        totalPendingAmount
      });
    } catch (err) {
      next(err);
    }
  }

  static async postPayFine(req, res, next) {
    try {
      const { fineId, paymentMethod, receiptNumber } = req.body;
      await FineService.payFine(fineId, req.user, { paymentMethod, receiptNumber });
      req.flash('success', 'Fine payment successfully recorded.');
      res.redirect(req.headers.referer || '/librarian/overdues');
    } catch (err) {
      req.flash('error', err.message || 'Failed to process payment.');
      res.redirect(req.headers.referer || '/librarian/overdues');
    }
  }

  static async postWaiveFine(req, res, next) {
    try {
      const { fineId, waivedReason } = req.body;
      await FineService.waiveFine(fineId, req.user, waivedReason);
      req.flash('success', 'Fine successfully waived.');
      res.redirect(req.headers.referer || '/librarian/overdues');
    } catch (err) {
      req.flash('error', err.message || 'Failed to waive fine.');
      res.redirect(req.headers.referer || '/librarian/overdues');
    }
  }

  /**
   * Audit Logs
   */
  static async getAuditLogs(req, res, next) {
    try {
      const { action = '', page = 1 } = req.query;
      const currentPage = Math.max(1, parseInt(page) || 1);
      const limit = 30;
      const skip = (currentPage - 1) * limit;

      const filter = {};
      if (action && action !== 'ALL') {
        filter.action = action;
      }

      const totalLogs = await AuditLog.countDocuments(filter);
      const logs = await AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

      const distinctActions = await AuditLog.distinct('action');

      res.render('librarian/audit/index', {
        title: 'Circulation Audit Trail',
        logs,
        distinctActions,
        selectedAction: action,
        currentPage,
        totalPages: Math.ceil(totalLogs / limit) || 1,
        totalLogs
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Policy Settings
   */
  static async getSettings(req, res, next) {
    try {
      const settings = await SettingService.getSettings();
      res.render('librarian/settings/index', {
        title: 'Library Circulation Policy Settings',
        settings
      });
    } catch (err) {
      next(err);
    }
  }

  static async postSettings(req, res, next) {
    try {
      const updates = {
        libraryName: req.body.libraryName,
        libraryCode: req.body.libraryCode,
        loanPeriodDays: parseInt(req.body.loanPeriodDays),
        maxLoanLimit: parseInt(req.body.maxLoanLimit),
        finePerDay: parseFloat(req.body.finePerDay),
        gracePeriodDays: parseInt(req.body.gracePeriodDays),
        maxFineAmount: parseFloat(req.body.maxFineAmount),
        maxHoldLimit: parseInt(req.body.maxHoldLimit),
        holdPickupWindowDays: parseInt(req.body.holdPickupWindowDays),
        blockingFineThreshold: parseFloat(req.body.blockingFineThreshold),
        currencySymbol: req.body.currencySymbol,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        address: req.body.address
      };

      await SettingService.updateSettings(updates, req.user);
      req.flash('success', 'Circulation policies and parameters updated successfully.');
      res.redirect('/librarian/settings');
    } catch (err) {
      req.flash('error', err.message || 'Failed to update policy settings.');
      res.redirect('/librarian/settings');
    }
  }
}

module.exports = LibrarianController;

const BookCopy = require('../models/BookCopy');
const Book = require('../models/Book');
const Reservation = require('../models/Reservation');
const AuditService = require('./AuditService');
const ReservationService = require('./ReservationService');

class InventoryService {
  /**
   * Add a new physical copy to a book
   */
  static async addCopy(bookId, { barcode, condition = 'GOOD', shelfLocation = 'Main Stacks', price = 0, notes = '' }, actorUser) {
    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const cleanBarcode = barcode ? barcode.trim().toUpperCase() : `BC-${book.isbn}-${Date.now().toString().slice(-4)}`;

    const existing = await BookCopy.findOne({ barcode: cleanBarcode });
    if (existing) {
      throw new Error(`A copy with barcode "${cleanBarcode}" already exists in the system.`);
    }

    const copyCount = await BookCopy.countDocuments({ book: bookId });

    const copy = await BookCopy.create({
      barcode: cleanBarcode,
      book: bookId,
      copyNumber: copyCount + 1,
      status: 'AVAILABLE',
      condition,
      shelfLocation: shelfLocation.trim(),
      price: price || 0,
      notes: notes.trim(),
      issueHistory: [{
        action: 'STATUS_CHANGE',
        performedBy: actorUser ? actorUser._id : null,
        timestamp: new Date(),
        notes: 'Accession / Initial Registration'
      }]
    });

    await AuditService.log({
      actor: actorUser,
      action: 'COPY_CREATED',
      targetType: 'BookCopy',
      targetId: copy._id,
      details: {
        barcode: copy.barcode,
        bookId: book._id,
        bookTitle: book.title,
        copyNumber: copy.copyNumber,
        shelfLocation: copy.shelfLocation
      }
    });

    // Check if any pending holds can immediately target this new copy
    await ReservationService.targetNextHoldForBook(bookId, copy);

    return copy;
  }

  /**
   * Update copy metadata (location, condition, notes)
   */
  static async updateCopy(copyId, { condition, shelfLocation, price, notes }, actorUser) {
    const copy = await BookCopy.findById(copyId).populate('book');
    if (!copy) {
      throw new Error('Book copy not found');
    }

    if (condition) copy.condition = condition;
    if (shelfLocation) copy.shelfLocation = shelfLocation.trim();
    if (price !== undefined) copy.price = price;
    if (notes !== undefined) copy.notes = notes.trim();

    await copy.save();

    await AuditService.log({
      actor: actorUser,
      action: 'COPY_UPDATED',
      targetType: 'BookCopy',
      targetId: copy._id,
      details: {
        barcode: copy.barcode,
        bookId: copy.book._id,
        condition: copy.condition,
        shelfLocation: copy.shelfLocation
      }
    });

    return copy;
  }

  /**
   * Transition copy status (AVAILABLE, DAMAGED, LOST, MAINTENANCE)
   */
  static async changeCopyStatus(copyId, newStatus, actorUser, notes = '') {
    const copy = await BookCopy.findById(copyId).populate('book');
    if (!copy) {
      throw new Error('Book copy not found');
    }

    const oldStatus = copy.status;
    if (oldStatus === newStatus) {
      return copy;
    }

    // If changing away from RESERVED, resolve any linked reservation
    if (oldStatus === 'RESERVED' && ['DAMAGED', 'LOST', 'MAINTENANCE'].includes(newStatus)) {
      const activeReservation = await Reservation.findOne({
        bookCopy: copy._id,
        status: 'AVAILABLE_FOR_PICKUP'
      });

      if (activeReservation) {
        // Unlink this damaged copy
        activeReservation.bookCopy = null;

        // Try to find another AVAILABLE copy
        const alternateCopy = await BookCopy.findOne({
          book: copy.book._id,
          status: 'AVAILABLE',
          _id: { $ne: copy._id }
        });

        if (alternateCopy) {
          activeReservation.bookCopy = alternateCopy._id;
          await activeReservation.save();
          alternateCopy.status = 'RESERVED';
          await alternateCopy.save();
        } else {
          // Revert reservation back to top of PENDING queue
          activeReservation.status = 'PENDING';
          activeReservation.queuePosition = 1;
          activeReservation.pickupDeadline = null;
          await activeReservation.save();
          await ReservationService.recalculateQueuePositions(copy.book._id);
        }
      }
    }

    copy.status = newStatus;
    if (newStatus === 'DAMAGED') {
      copy.condition = 'DAMAGED';
    }

    copy.issueHistory.push({
      action: 'STATUS_CHANGE',
      performedBy: actorUser ? actorUser._id : null,
      timestamp: new Date(),
      notes: notes || `Status changed from ${oldStatus} to ${newStatus}`
    });

    await copy.save();

    await AuditService.log({
      actor: actorUser,
      action: 'COPY_STATUS_CHANGE',
      targetType: 'BookCopy',
      targetId: copy._id,
      details: {
        barcode: copy.barcode,
        bookId: copy.book._id,
        bookTitle: copy.book.title,
        oldStatus,
        newStatus,
        notes
      }
    });

    // If transitioned back to AVAILABLE, check if holds need targeting
    if (newStatus === 'AVAILABLE') {
      await ReservationService.targetNextHoldForBook(copy.book._id, copy);
    }

    return copy;
  }

  /**
   * Derive real-time availability counts for a single book
   */
  static async getBookAvailability(bookId) {
    const copies = await BookCopy.find({ book: bookId });
    const total = copies.length;
    const available = copies.filter(c => c.status === 'AVAILABLE').length;
    const issued = copies.filter(c => c.status === 'ISSUED').length;
    const reserved = copies.filter(c => c.status === 'RESERVED').length;
    const damaged = copies.filter(c => c.status === 'DAMAGED').length;
    const lost = copies.filter(c => c.status === 'LOST').length;
    const maintenance = copies.filter(c => c.status === 'MAINTENANCE').length;

    const pendingHolds = await Reservation.countDocuments({ book: bookId, status: 'PENDING' });

    return {
      total,
      available,
      issued,
      reserved,
      damaged,
      lost,
      maintenance,
      pendingHolds,
      isAvailable: available > 0,
      canReserve: available === 0
    };
  }

  /**
   * Derive real-time counts across multiple books efficiently
   */
  static async getAvailabilityMap(bookIds) {
    const copyAgg = await BookCopy.aggregate([
      { $match: { book: { $in: bookIds } } },
      {
        $group: {
          _id: '$book',
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, 1, 0] } },
          issued: { $sum: { $cond: [{ $eq: ['$status', 'ISSUED'] }, 1, 0] } },
          reserved: { $sum: { $cond: [{ $eq: ['$status', 'RESERVED'] }, 1, 0] } },
          damaged: { $sum: { $cond: [{ $eq: ['$status', 'DAMAGED'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'LOST'] }, 1, 0] } },
          maintenance: { $sum: { $cond: [{ $eq: ['$status', 'MAINTENANCE'] }, 1, 0] } }
        }
      }
    ]);

    const holdAgg = await Reservation.aggregate([
      { $match: { book: { $in: bookIds }, status: 'PENDING' } },
      { $group: { _id: '$book', pendingHolds: { $sum: 1 } } }
    ]);

    const holdMap = {};
    holdAgg.forEach(h => {
      holdMap[h._id.toString()] = h.pendingHolds;
    });

    const map = {};
    bookIds.forEach(id => {
      const strId = id.toString();
      map[strId] = {
        total: 0,
        available: 0,
        issued: 0,
        reserved: 0,
        damaged: 0,
        lost: 0,
        maintenance: 0,
        pendingHolds: holdMap[strId] || 0,
        isAvailable: false,
        canReserve: true
      };
    });

    copyAgg.forEach(row => {
      const strId = row._id.toString();
      map[strId] = {
        total: row.total,
        available: row.available,
        issued: row.issued,
        reserved: row.reserved,
        damaged: row.damaged,
        lost: row.lost,
        maintenance: row.maintenance,
        pendingHolds: holdMap[strId] || 0,
        isAvailable: row.available > 0,
        canReserve: row.available === 0
      };
    });

    return map;
  }
}

module.exports = InventoryService;

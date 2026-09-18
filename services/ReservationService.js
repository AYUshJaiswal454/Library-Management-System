const Reservation = require('../models/Reservation');
const BookCopy = require('../models/BookCopy');
const Book = require('../models/Book');
const User = require('../models/User');
const SettingService = require('./SettingService');
const AuditService = require('./AuditService');
const NotificationService = require('./NotificationService');

class ReservationService {
  /**
   * Place a hold/reservation for a book
   */
  static async placeHold(bookId, userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Member record not found');
    }
    if (user.isRestricted) {
      throw new Error(`Account restricted: ${user.restrictionReason || 'Borrowing and hold privileges suspended'}`);
    }

    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const settings = await SettingService.getSettings();

    // Check duplicate active hold
    const existingHold = await Reservation.findOne({
      book: bookId,
      user: userId,
      status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
    });
    if (existingHold) {
      throw new Error('You already have an active hold or pickup request for this title.');
    }

    // Check user max active holds
    const userActiveHolds = await Reservation.countDocuments({
      user: userId,
      status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
    });
    if (userActiveHolds >= settings.maxHoldLimit) {
      throw new Error(`Hold limit reached. Maximum allowed active holds is ${settings.maxHoldLimit}.`);
    }

    // Determine queue position among PENDING holds
    const currentPendingCount = await Reservation.countDocuments({
      book: bookId,
      status: 'PENDING'
    });
    const queuePosition = currentPendingCount + 1;

    const reservation = await Reservation.create({
      book: bookId,
      user: userId,
      status: 'PENDING',
      queuePosition,
      requestDate: new Date()
    });

    await AuditService.log({
      actor: user,
      action: 'HOLD_PLACED',
      targetType: 'Reservation',
      targetId: reservation._id,
      details: {
        bookId: book._id,
        bookTitle: book.title,
        queuePosition
      }
    });

    await NotificationService.send({
      userId: user._id,
      title: 'Hold Request Placed',
      message: `Your hold for "${book.title}" was registered at queue position #${queuePosition}.`,
      type: 'GENERAL',
      link: '/member/holds'
    });

    return reservation;
  }

  /**
   * Target next eligible hold upon book copy return or hold cancellation
   */
  static async targetNextHoldForBook(bookId, bookCopy) {
    const settings = await SettingService.getSettings();

    // Find oldest PENDING hold
    const nextHold = await Reservation.findOne({
      book: bookId,
      status: 'PENDING'
    }).sort({ requestDate: 1 }).populate('user book');

    if (nextHold) {
      const pickupDeadline = new Date(Date.now() + settings.holdPickupWindowDays * 24 * 60 * 60 * 1000);

      nextHold.status = 'AVAILABLE_FOR_PICKUP';
      nextHold.bookCopy = bookCopy._id;
      nextHold.pickupDeadline = pickupDeadline;
      nextHold.notifiedAt = new Date();
      nextHold.queuePosition = 1;
      await nextHold.save();

      // Lock copy as RESERVED
      bookCopy.status = 'RESERVED';
      await bookCopy.save();

      // Recalculate queue positions for other pending holds
      await this.recalculateQueuePositions(bookId);

      await NotificationService.send({
        userId: nextHold.user._id,
        title: 'Book Ready for Pickup!',
        message: `Your reserved title "${nextHold.book.title}" (Barcode: ${bookCopy.barcode}) is ready at the circulation desk! Pickup deadline: ${pickupDeadline.toLocaleDateString()}.`,
        type: 'HOLD_READY',
        link: '/member/holds'
      });

      await AuditService.log({
        actorName: 'Circulation Engine',
        actorRole: 'SYSTEM',
        action: 'HOLD_TARGETED',
        targetType: 'Reservation',
        targetId: nextHold._id,
        details: {
          bookId: nextHold.book._id,
          bookTitle: nextHold.book.title,
          barcode: bookCopy.barcode,
          targetedUserId: nextHold.user._id,
          targetedMemberId: nextHold.user.memberId,
          pickupDeadline
        }
      });

      return { targeted: true, reservation: nextHold, copy: bookCopy };
    } else {
      // No pending holds -> return copy to AVAILABLE
      bookCopy.status = 'AVAILABLE';
      await bookCopy.save();
      return { targeted: false, copy: bookCopy };
    }
  }

  /**
   * Recalculate 1-indexed queue positions for all PENDING holds of a book
   */
  static async recalculateQueuePositions(bookId) {
    const pendingHolds = await Reservation.find({
      book: bookId,
      status: 'PENDING'
    }).sort({ requestDate: 1 });

    for (let i = 0; i < pendingHolds.length; i++) {
      pendingHolds[i].queuePosition = i + 1;
      await pendingHolds[i].save();
    }
  }

  /**
   * Cancel an existing hold
   */
  static async cancelHold(reservationId, actorUser, cancellationReason = 'Cancelled by patron') {
    const reservation = await Reservation.findById(reservationId).populate('book bookCopy user');
    if (!reservation) {
      throw new Error('Hold reservation record not found');
    }

    if (!['PENDING', 'AVAILABLE_FOR_PICKUP'].includes(reservation.status)) {
      throw new Error(`Cannot cancel reservation with status ${reservation.status}`);
    }

    const oldStatus = reservation.status;
    const bookCopy = reservation.bookCopy;

    reservation.status = 'CANCELLED';
    reservation.cancelledAt = new Date();
    reservation.cancellationReason = cancellationReason;
    reservation.bookCopy = null;
    await reservation.save();

    await this.recalculateQueuePositions(reservation.book._id);

    // If hold was already ready for pickup, release or retarget the locked copy
    if (oldStatus === 'AVAILABLE_FOR_PICKUP' && bookCopy) {
      const freshCopy = await BookCopy.findById(bookCopy._id);
      if (freshCopy && freshCopy.status === 'RESERVED') {
        await this.targetNextHoldForBook(reservation.book._id, freshCopy);
      }
    }

    await AuditService.log({
      actor: actorUser,
      action: 'HOLD_CANCELLED',
      targetType: 'Reservation',
      targetId: reservation._id,
      details: {
        bookId: reservation.book._id,
        bookTitle: reservation.book.title,
        memberId: reservation.user.memberId,
        cancellationReason
      }
    });

    await NotificationService.send({
      userId: reservation.user._id,
      title: 'Hold Reservation Cancelled',
      message: `Your hold on "${reservation.book.title}" was cancelled (${cancellationReason}).`,
      type: 'HOLD_CANCELLED',
      link: '/member/holds'
    });

    return reservation;
  }

  /**
   * Expire stale holds past pickup deadlines
   */
  static async expireStaleHolds() {
    const now = new Date();
    const expiredHolds = await Reservation.find({
      status: 'AVAILABLE_FOR_PICKUP',
      pickupDeadline: { $lt: now }
    }).populate('book bookCopy user');

    const processed = [];

    for (const hold of expiredHolds) {
      const copy = hold.bookCopy ? await BookCopy.findById(hold.bookCopy._id) : null;

      hold.status = 'EXPIRED';
      hold.cancellationReason = 'Unclaimed within pickup window';
      hold.bookCopy = null;
      await hold.save();

      await NotificationService.send({
        userId: hold.user._id,
        title: 'Hold Pickup Window Expired',
        message: `Your pickup window for "${hold.book.title}" has expired. The copy has been released to the next patron or shelf.`,
        type: 'HOLD_CANCELLED',
        link: '/member/holds'
      });

      await AuditService.log({
        actorName: 'Circulation Engine',
        actorRole: 'SYSTEM',
        action: 'HOLD_EXPIRED',
        targetType: 'Reservation',
        targetId: hold._id,
        details: {
          bookId: hold.book._id,
          bookTitle: hold.book.title,
          memberId: hold.user.memberId
        }
      });

      if (copy && copy.status === 'RESERVED') {
        await this.targetNextHoldForBook(hold.book._id, copy);
      }

      processed.push(hold._id);
    }

    return processed;
  }
}

module.exports = ReservationService;

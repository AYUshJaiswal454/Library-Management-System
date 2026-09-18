const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: [true, 'Book reference is required'],
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  bookCopy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookCopy',
    default: null,
    index: true
  },
  requestDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'AVAILABLE_FOR_PICKUP', 'FULFILLED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  queuePosition: {
    type: Number,
    default: 1
  },
  pickupDeadline: {
    type: Date,
    index: true
  },
  notifiedAt: {
    type: Date
  },
  fulfilledAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index to prevent multiple active reservations for same book and user
reservationSchema.index({ book: 1, user: 1, status: 1 });
reservationSchema.index({ book: 1, status: 1, requestDate: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);

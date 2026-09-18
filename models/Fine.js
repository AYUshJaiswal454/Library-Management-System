const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  loan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: [true, 'Loan reference is required'],
    index: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book'
  },
  amount: {
    type: Number,
    required: [true, 'Fine amount is required'],
    min: 0
  },
  daysOverdue: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'WAIVED'],
    default: 'PENDING',
    index: true
  },
  paidAt: {
    type: Date
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  waivedReason: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'ONLINE', 'DESK_WAIVER', 'CARD', 'OTHER'],
    default: 'CASH'
  },
  receiptNumber: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

fineSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Fine', fineSchema);

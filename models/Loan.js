const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  bookCopy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookCopy',
    required: [true, 'Book copy reference is required'],
    index: true
  },
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
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Issued by librarian reference is required']
  },
  issuedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
    index: true
  },
  returnedAt: {
    type: Date,
    index: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'RETURNED', 'OVERDUE'],
    default: 'ACTIVE',
    index: true
  },
  renewedCount: {
    type: Number,
    default: 0
  },
  fineCalculated: {
    type: Number,
    default: 0
  },
  finePaid: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

loanSchema.index({ user: 1, status: 1 });
loanSchema.index({ bookCopy: 1, status: 1 });
loanSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('Loan', loanSchema);

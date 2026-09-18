const mongoose = require('mongoose');

const copyHistorySchema = new mongoose.Schema({
  loan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    enum: ['ISSUED', 'RETURNED', 'RESERVED', 'DAMAGED_REPORTED', 'LOST_REPORTED', 'STATUS_CHANGE'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: String
}, { _id: false });

const bookCopySchema = new mongoose.Schema({
  barcode: {
    type: String,
    required: [true, 'Barcode / Accession number is required'],
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: [true, 'Book reference is required'],
    index: true
  },
  copyNumber: {
    type: Number,
    required: true,
    default: 1
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'ISSUED', 'RESERVED', 'DAMAGED', 'LOST', 'MAINTENANCE'],
    default: 'AVAILABLE',
    index: true
  },
  condition: {
    type: String,
    enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'],
    default: 'GOOD'
  },
  shelfLocation: {
    type: String,
    required: [true, 'Shelf location is required'],
    trim: true,
    default: 'Main Stacks'
  },
  price: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  },
  issueHistory: [copyHistorySchema]
}, {
  timestamps: true
});

// Compound index to ensure fast copy lookups per book
bookCopySchema.index({ book: 1, status: 1 });

module.exports = mongoose.model('BookCopy', bookCopySchema);

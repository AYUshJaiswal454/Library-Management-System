const mongoose = require('mongoose');

const librarySettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'DEFAULT_POLICY'
  },
  libraryName: {
    type: String,
    default: 'Central Institutional Library & Resource Centre'
  },
  libraryCode: {
    type: String,
    default: 'CIL-MAIN'
  },
  loanPeriodDays: {
    type: Number,
    required: true,
    default: 14,
    min: 1,
    max: 90
  },
  maxLoanLimit: {
    type: Number,
    required: true,
    default: 4,
    min: 1,
    max: 20
  },
  finePerDay: {
    type: Number,
    required: true,
    default: 5,
    min: 0
  },
  gracePeriodDays: {
    type: Number,
    required: true,
    default: 1,
    min: 0
  },
  maxFineAmount: {
    type: Number,
    required: true,
    default: 500,
    min: 0
  },
  maxHoldLimit: {
    type: Number,
    required: true,
    default: 3,
    min: 1,
    max: 10
  },
  holdPickupWindowDays: {
    type: Number,
    required: true,
    default: 5,
    min: 1,
    max: 30
  },
  blockingFineThreshold: {
    type: Number,
    required: true,
    default: 100,
    min: 0
  },
  currencySymbol: {
    type: String,
    default: '₹'
  },
  contactEmail: {
    type: String,
    default: 'librarian@library.gov.in'
  },
  contactPhone: {
    type: String,
    default: '+91 11 2345 6789'
  },
  address: {
    type: String,
    default: 'Knowledge Complex, Institutional Area, Sector 4'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LibrarySetting', librarySettingSchema);

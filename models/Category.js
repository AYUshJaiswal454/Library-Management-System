const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: 100
  },
  code: {
    type: String,
    required: [true, 'Category code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 20
  },
  description: {
    type: String,
    trim: true
  },
  deweyDecimalRange: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Category', categorySchema);

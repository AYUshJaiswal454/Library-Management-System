const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Book title is required'],
    trim: true,
    maxlength: 255,
    index: true
  },
  author: {
    type: String,
    required: [true, 'Author is required'],
    trim: true,
    maxlength: 255,
    index: true
  },
  isbn: {
    type: String,
    required: [true, 'ISBN is required'],
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
    index: true
  },
  publisher: {
    type: String,
    trim: true,
    maxlength: 150
  },
  publicationYear: {
    type: Number,
    min: 1000,
    max: 2100,
    index: true
  },
  edition: {
    type: String,
    trim: true
  },
  language: {
    type: String,
    default: 'English',
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  callNumber: {
    type: String,
    trim: true
  },
  coverUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Composite text index for full-text catalog search
bookSchema.index({
  title: 'text',
  author: 'text',
  isbn: 'text',
  description: 'text',
  publisher: 'text'
}, {
  weights: {
    title: 10,
    author: 5,
    isbn: 8,
    publisher: 2,
    description: 1
  },
  name: 'BookTextIndex'
});

// Virtual populate for copies
bookSchema.virtual('copies', {
  ref: 'BookCopy',
  localField: '_id',
  foreignField: 'book'
});

module.exports = mongoose.model('Book', bookSchema);

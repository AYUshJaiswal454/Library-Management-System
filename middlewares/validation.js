const { body, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');

const sanitizeBody = (req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key], {
          allowedTags: [],
          allowedAttributes: {}
        }).trim();
      }
    }
  }
  next();
};

const validateRegister = [
  body('name').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match.');
    }
    return true;
  }),
  body('departmentOrBatch').optional().trim(),
  body('phone').optional().trim()
];

const validateLogin = [
  body('email').trim().notEmpty().withMessage('Email / Username is required.'),
  body('password').notEmpty().withMessage('Password is required.')
];

const validateBook = [
  body('title').trim().notEmpty().withMessage('Book title is required.'),
  body('author').trim().notEmpty().withMessage('Author name is required.'),
  body('isbn').trim().notEmpty().withMessage('ISBN is required.'),
  body('category').trim().notEmpty().withMessage('Category selection is required.'),
  body('publicationYear').optional({ checkFalsy: true }).isInt({ min: 1000, max: 2100 }).withMessage('Valid 4-digit publication year required.'),
  body('language').optional().trim()
];

const validateCopy = [
  body('barcode').trim().notEmpty().withMessage('Barcode / Accession number is required.'),
  body('shelfLocation').trim().notEmpty().withMessage('Shelf location is required.'),
  body('condition').isIn(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).withMessage('Valid physical condition required.')
];

const validateSettings = [
  body('loanPeriodDays').isInt({ min: 1, max: 90 }).withMessage('Lending period must be between 1 and 90 days.'),
  body('maxLoanLimit').isInt({ min: 1, max: 20 }).withMessage('Loan limit must be between 1 and 20 books.'),
  body('finePerDay').isFloat({ min: 0 }).withMessage('Daily fine must be 0 or positive.'),
  body('gracePeriodDays').isInt({ min: 0, max: 30 }).withMessage('Grace period must be between 0 and 30 days.'),
  body('maxFineAmount').isFloat({ min: 0 }).withMessage('Maximum fine cap must be 0 or positive.'),
  body('maxHoldLimit').isInt({ min: 1, max: 10 }).withMessage('Hold limit must be between 1 and 10.'),
  body('holdPickupWindowDays').isInt({ min: 1, max: 30 }).withMessage('Pickup window must be between 1 and 30 days.'),
  body('blockingFineThreshold').isFloat({ min: 0 }).withMessage('Blocking fine threshold must be 0 or positive.')
];

module.exports = {
  sanitizeBody,
  validateRegister,
  validateLogin,
  validateBook,
  validateCopy,
  validateSettings
};

const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const Category = require('../models/Category');
const Reservation = require('../models/Reservation');
const InventoryService = require('../services/InventoryService');
const ReservationService = require('../services/ReservationService');

class CatalogueController {
  static async index(req, res, next) {
    try {
      const {
        q = '',
        category = '',
        available_only = '',
        language = '',
        sort = 'title_asc',
        page = 1
      } = req.query;

      const currentPage = Math.max(1, parseInt(page) || 1);
      const limit = 12;
      const skip = (currentPage - 1) * limit;

      const queryFilter = {};

      // Text / Search Filter
      if (q && q.trim().length > 0) {
        const cleanQ = q.trim();
        queryFilter.$or = [
          { title: { $regex: cleanQ, $options: 'i' } },
          { author: { $regex: cleanQ, $options: 'i' } },
          { isbn: { $regex: cleanQ, $options: 'i' } },
          { publisher: { $regex: cleanQ, $options: 'i' } }
        ];
      }

      // Category Filter
      if (category && category !== 'ALL') {
        queryFilter.category = category;
      }

      // Language Filter
      if (language && language !== 'ALL') {
        queryFilter.language = language;
      }

      // Sorting
      let sortOptions = { title: 1 };
      if (sort === 'title_desc') sortOptions = { title: -1 };
      else if (sort === 'year_desc') sortOptions = { publicationYear: -1 };
      else if (sort === 'year_asc') sortOptions = { publicationYear: 1 };
      else if (sort === 'newest') sortOptions = { createdAt: -1 };

      const totalBooksCount = await Book.countDocuments(queryFilter);
      const books = await Book.find(queryFilter)
        .populate('category')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit);

      // Derive availability map for all loaded books
      const bookIds = books.map(b => b._id);
      const availabilityMap = await InventoryService.getAvailabilityMap(bookIds);

      // Filter available_only in memory if requested
      let displayBooks = books;
      if (available_only === 'true' || available_only === '1') {
        displayBooks = books.filter(b => availabilityMap[b._id.toString()].available > 0);
      }

      const categories = await Category.find().sort({ name: 1 });
      const languages = await Book.distinct('language');

      res.render('catalogue/index', {
        title: 'Library Catalogue & Holdings Discovery',
        books: displayBooks,
        availabilityMap,
        categories,
        languages,
        selectedCategory: category,
        selectedLanguage: language,
        availableOnly: available_only === 'true' || available_only === '1',
        searchQuery: q,
        currentSort: sort,
        currentPage,
        totalPages: Math.ceil(totalBooksCount / limit) || 1,
        totalResults: totalBooksCount
      });
    } catch (err) {
      console.error('[Catalogue Index Error]:', err);
      next(err);
    }
  }

  static async show(req, res, next) {
    try {
      const book = await Book.findById(req.params.id).populate('category');
      if (!book) {
        req.flash('error', 'Book record not found.');
        return res.status(404).render('errors/404', {
          title: 'Book Not Found',
          message: 'The requested bibliographic record could not be found.'
        });
      }

      // Fetch all physical copies for this title
      const copies = await BookCopy.find({ book: book._id }).sort({ copyNumber: 1 });
      const availability = await InventoryService.getBookAvailability(book._id);

      // Check member's active hold state if logged in
      let userHold = null;
      if (req.user && req.user.role === 'MEMBER') {
        userHold = await Reservation.findOne({
          book: book._id,
          user: req.user._id,
          status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
        });
      }

      // Active hold count for this title
      const activeHolds = await Reservation.find({
        book: book._id,
        status: { $in: ['PENDING', 'AVAILABLE_FOR_PICKUP'] }
      }).populate('user', 'name memberId').sort({ requestDate: 1 });

      res.render('catalogue/show', {
        title: `${book.title} - Catalogue Details`,
        book,
        copies,
        availability,
        userHold,
        activeHolds
      });
    } catch (err) {
      console.error('[Catalogue Show Error]:', err);
      next(err);
    }
  }

  static async reserveBook(req, res, next) {
    try {
      if (!req.user) {
        req.flash('error', 'Please log in as a library member to reserve this title.');
        return res.redirect(`/auth/login?returnTo=/catalogue/${req.params.id}`);
      }

      if (req.user.role !== 'MEMBER') {
        req.flash('error', 'Only registered library members can place hold reservations.');
        return res.redirect(`/catalogue/${req.params.id}`);
      }

      const reservation = await ReservationService.placeHold(req.params.id, req.user._id);

      req.flash('success', `Hold placed successfully! Your position in the queue is #${reservation.queuePosition}. You will be notified when a copy is ready for pickup.`);
      res.redirect('/member/holds');
    } catch (err) {
      req.flash('error', err.message || 'Could not place hold reservation.');
      res.redirect(`/catalogue/${req.params.id}`);
    }
  }
}

module.exports = CatalogueController;

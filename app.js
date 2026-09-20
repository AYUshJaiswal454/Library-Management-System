const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const { loadUser } = require('./middlewares/auth');
const contextMiddleware = require('./middlewares/context');
const { sanitizeBody } = require('./middlewares/validation');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const catalogueRoutes = require('./routes/catalogueRoutes');
const memberRoutes = require('./routes/memberRoutes');
const librarianRoutes = require('./routes/librarianRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Logging & Static Assets
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.static(path.join(__dirname, 'public')));

// Request Parsing & Method Overrides
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(sanitizeBody);

// Session Store Configuration - Reusing active Mongoose client
const sessionStore = MongoStore.create({
  clientPromise: mongoose.connection.asPromise().then(conn => conn.getClient()),
  collectionName: 'sessions',
  ttl: 14 * 24 * 60 * 60 // 14 days
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'library_circulation_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  })
);

// Flash Messaging
app.use(flash());

// Authentication Session Loader & Global Context
app.use(loadUser);
app.use(contextMiddleware);

// Route Bindings
app.get('/', (req, res) => {
  res.redirect('/catalogue');
});

// Top-level convenience redirects
app.get('/login', (req, res) => res.redirect('/auth/login'));
app.get('/register', (req, res) => res.redirect('/auth/register'));
app.get('/logout', (req, res) => res.redirect('/auth/logout'));
app.get('/desk', (req, res) => res.redirect('/librarian/desk'));
app.get('/dashboard', (req, res) => res.redirect('/member/dashboard'));

app.use('/auth', authRoutes);
app.use('/catalogue', catalogueRoutes);
app.use('/member', memberRoutes);
app.use('/librarian', librarianRoutes);
app.use('/api', apiRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

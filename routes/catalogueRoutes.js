const express = require('express');
const router = express.Router();
const CatalogueController = require('../controllers/catalogueController');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/', CatalogueController.index);
router.get('/:id', CatalogueController.show);
router.post('/:id/reserve', isAuthenticated, CatalogueController.reserveBook);

module.exports = router;

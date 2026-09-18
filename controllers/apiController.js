const BookCopy = require('../models/BookCopy');
const User = require('../models/User');
const EligibilityService = require('../services/EligibilityService');

class ApiController {
  static async checkEligibility(req, res) {
    try {
      const { memberId, barcode } = req.query;
      if (!memberId || !barcode) {
        return res.status(400).json({
          eligible: false,
          primaryMessage: 'Both memberId and barcode are required for eligibility check.'
        });
      }

      const result = await EligibilityService.evaluateIssueEligibility(memberId, barcode);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        eligible: false,
        primaryMessage: err.message
      });
    }
  }

  static async lookupCopy(req, res) {
    try {
      const barcode = req.params.barcode.trim().toUpperCase();
      const copy = await BookCopy.findOne({ barcode }).populate('book');
      if (!copy) {
        return res.status(404).json({ error: 'Copy not found' });
      }
      return res.json(copy);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async lookupMember(req, res) {
    try {
      const query = req.params.identifier.trim();
      const member = await User.findOne({
        $or: [
          { memberId: query.toUpperCase() },
          { email: query.toLowerCase() }
        ]
      }).select('-passwordHash');

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      return res.json(member);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ApiController;

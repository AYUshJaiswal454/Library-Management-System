const LibrarySetting = require('../models/LibrarySetting');
const AuditLog = require('../models/AuditLog');

class SettingService {
  static async getSettings() {
    let settings = await LibrarySetting.findOne({ key: 'DEFAULT_POLICY' });
    if (!settings) {
      settings = await LibrarySetting.create({
        key: 'DEFAULT_POLICY',
        libraryName: 'Central Institutional Library & Resource Centre',
        libraryCode: 'CIL-MAIN',
        loanPeriodDays: 14,
        maxLoanLimit: 4,
        finePerDay: 5,
        gracePeriodDays: 1,
        maxFineAmount: 500,
        maxHoldLimit: 3,
        holdPickupWindowDays: 5,
        blockingFineThreshold: 100,
        currencySymbol: '₹',
        contactEmail: 'librarian@library.gov.in',
        contactPhone: '+91 11 2345 6789',
        address: 'Knowledge Complex, Institutional Area, Sector 4'
      });
    }
    return settings;
  }

  static async updateSettings(updates, actorUser = null) {
    let settings = await this.getSettings();
    const oldValues = settings.toObject();

    Object.assign(settings, updates);
    await settings.save();

    if (actorUser) {
      await AuditLog.create({
        actor: actorUser._id,
        actorName: actorUser.name,
        actorRole: actorUser.role,
        action: 'POLICY_UPDATED',
        targetType: 'LibrarySetting',
        targetId: settings._id,
        details: {
          previous: oldValues,
          updated: updates
        }
      });
    }

    return settings;
  }
}

module.exports = SettingService;

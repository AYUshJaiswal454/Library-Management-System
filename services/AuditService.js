const AuditLog = require('../models/AuditLog');

class AuditService {
  static async log({
    actor = null,
    actorName = 'System',
    actorRole = 'SYSTEM',
    action,
    targetType,
    targetId = null,
    details = {},
    ipAddress = null
  }) {
    try {
      if (actor && actor._id) {
        actorName = actor.name || actorName;
        actorRole = actor.role || actorRole;
      }

      const logEntry = await AuditLog.create({
        actor: actor ? actor._id : null,
        actorName,
        actorRole,
        action,
        targetType,
        targetId: targetId ? targetId.toString() : null,
        details,
        ipAddress
      });

      return logEntry;
    } catch (err) {
      console.error('[AuditService Error] Failed to write audit log:', err.message);
      // Non-blocking error for main application flow
      return null;
    }
  }

  static async getRecentLogs(limit = 100, filter = {}) {
    return AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('actor', 'name email role memberId');
  }
}

module.exports = AuditService;

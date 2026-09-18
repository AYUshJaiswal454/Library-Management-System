const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorName: {
    type: String,
    required: true,
    default: 'System'
  },
  actorRole: {
    type: String,
    default: 'SYSTEM'
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  targetType: {
    type: String,
    required: true,
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.Mixed
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

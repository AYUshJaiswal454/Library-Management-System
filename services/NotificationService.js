const Notification = require('../models/Notification');

class NotificationService {
  static async send({
    userId,
    title,
    message,
    type = 'GENERAL',
    link = ''
  }) {
    try {
      const notification = await Notification.create({
        user: userId,
        title,
        message,
        type,
        link
      });
      return notification;
    } catch (err) {
      console.error('[NotificationService Error] Failed to send notification:', err.message);
      return null;
    }
  }

  static async getUserNotifications(userId, limit = 20) {
    return Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  static async getUnreadCount(userId) {
    return Notification.countDocuments({ user: userId, isRead: false });
  }

  static async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    );
  }

  static async markAllAsRead(userId) {
    return Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );
  }
}

module.exports = NotificationService;

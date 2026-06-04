import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATIONS_KEY = '@maalem_notifications';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'mission_completed' | 'new_offer' | 'mission_assigned' | 'payment_received' | 'system';
  timestamp: number;
  read: boolean;
  data?: any;
}

export const notificationService = {
  // Save a new notification
  async addNotification(notification: Omit<Notification, 'id'>) {
    try {
      const existingNotifications = await this.getNotifications();
      const newNotification: Notification = {
        ...notification,
        id: Date.now().toString(),
        timestamp: Date.now(),
        read: false,
      };
      
      const updatedNotifications = [newNotification, ...existingNotifications];
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updatedNotifications));
      
      console.log('🔔 New notification added:', newNotification);
      return newNotification;
    } catch (error) {
      console.error('Error adding notification:', error);
      throw error;
    }
  },

  // Get all notifications
  async getNotifications(): Promise<Notification[]> {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      if (!stored) return [];
      
      const notifications = JSON.parse(stored);
      return Array.isArray(notifications) ? notifications : [];
    } catch (error) {
      console.error('Error getting notifications:', error);
      return [];
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string) {
    try {
      const notifications = await this.getNotifications();
      const updatedNotifications = notifications.map(notification =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      );
      
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updatedNotifications));
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read
  async markAllAsRead() {
    try {
      const notifications = await this.getNotifications();
      const updatedNotifications = notifications.map(notification => ({
        ...notification,
        read: true,
      }));
      
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updatedNotifications));
      console.log('✅ All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },

  // Clear all notifications
  async clearAllNotifications() {
    try {
      await AsyncStorage.removeItem(NOTIFICATIONS_KEY);
      console.log('🗑️ All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      throw error;
    }
  },

  // Get unread count
  async getUnreadCount(): Promise<number> {
    try {
      const notifications = await this.getNotifications();
      return notifications.filter(n => !n.read).length;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  },

  // Predefined notification creators
  createMissionCompletedNotification(missionId: string, missionTitle: string): Omit<Notification, 'id'> {
    return {
      title: 'Mission Terminée',
      message: `La mission "${missionTitle}" a été terminée avec succès.`,
      type: 'mission_completed',
      timestamp: Date.now(),
      read: false,
      data: { missionId, missionTitle },
    };
  },

  createNewOfferNotification(offerCount: number): Omit<Notification, 'id'> {
    return {
      title: 'Nouvelle(s) Offre(s)',
      message: `Vous avez reçu ${offerCount} nouvelle${offerCount > 1 ? 's' : ''} offre${offerCount > 1 ? 's' : ''}.`,
      type: 'new_offer',
      timestamp: Date.now(),
      read: false,
      data: { offerCount },
    };
  },

  createMissionAssignedNotification(missionTitle: string): Omit<Notification, 'id'> {
    return {
      title: 'Mission Assignée',
      message: `Un technicien a été assigné à votre mission "${missionTitle}".`,
      type: 'mission_assigned',
      timestamp: Date.now(),
      read: false,
      data: { missionTitle },
    };
  },

  createPaymentReceivedNotification(amount: number): Omit<Notification, 'id'> {
    return {
      title: 'Paiement Reçu',
      message: `Vous avez reçu un paiement de ${amount} DH.`,
      type: 'payment_received',
      timestamp: Date.now(),
      read: false,
      data: { amount },
    };
  },

  createSystemNotification(title: string, message: string): Omit<Notification, 'id'> {
    return {
      title,
      message,
      type: 'system',
      timestamp: Date.now(),
      read: false,
    };
  },
};

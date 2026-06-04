import { io } from 'socket.io-client';
import api from './api';
import { getAuthToken } from './firebaseAuth';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.fallbackInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  /**
   * Initialize socket connection with JWT authentication
   */
  async connect() {
    try {
      // Prevent duplicate connections
      if (this.socket && this.isConnected) {
        console.log('🔌 Socket already connected');
        return this.socket;
      }

      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Get server URL from API configuration
      const serverUrl = api.defaults.baseURL.replace('/api', '');

      console.log('🔌 Connecting to WebSocket server:', serverUrl);

      this.socket = io(serverUrl, {
        auth: {
          token: token
        },
        transports: ['websocket'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay
      });

      this.setupEventHandlers();

      // Wait until the socket is actually connected before resolving.
      if (this.socket.connected) {
        this.isConnected = true;
        return this.socket;
      }

      const CONNECT_WAIT_MS = 3000;
      const waitForConnect = new Promise((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (err) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          this.socket?.off('connect', onConnect);
          this.socket?.off('connect_error', onError);
        };
        this.socket?.once('connect', onConnect);
        this.socket?.once('connect_error', onError);
      });

      const timeout = new Promise((resolve) => setTimeout(resolve, CONNECT_WAIT_MS));
      const result = await Promise.race([waitForConnect, timeout]);
      if (result === undefined && !this.socket.connected) {
        console.log(`⏳ Socket connect still in progress after ${CONNECT_WAIT_MS}ms (continuing without blocking)`);
      }

      return this.socket;
    } catch (error) {
      console.error('❌ Socket connection error:', error);
      throw error;
    }
  }

  /**
   * Setup socket event handlers
   */
  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.stopFallbackPolling();
      this.emit('connection_status', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      this.isConnected = false;
      this.emit('connection_status', { connected: false, reason });
      
      // Start fallback polling if disconnection wasn't intentional
      if (reason !== 'io client disconnect') {
        this.startFallbackPolling();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('🔄 Max reconnect attempts reached, starting fallback polling');
        this.startFallbackPolling();
      }
      
      this.emit('connection_status', { connected: false, error });
    });

    // Business events
    this.socket.on('new_request', (data) => {
      console.log('📨 New request received:', data);
      this.emit('new_request', data);
    });

    this.socket.on('offer_accepted', (data) => {
      console.log('✅ Offer accepted:', data);
      this.emit('offer_accepted', data);
    });

    this.socket.on('request_updated', (data) => {
      console.log('🔄 Request updated:', data);
      
      // Handle specific status updates
      if (data.status === 'CANCELLED') {
        console.log('❌ Request cancelled:', data);
        this.emit('request_cancelled', data);
      } else {
        this.emit('request_updated', data);
      }
    });

    this.socket.on('request_deleted', (data) => {
      console.log('🗑️ Request deleted:', data);
      this.emit('request_deleted', data);
    });

    // Technician-specific events
    this.socket.on('technician_offer_accepted', (data) => {
      console.log('🎯 Technician offer accepted:', data);
      this.emit('offer_accepted', data);
    });

    this.socket.on('request_assigned', (data) => {
      console.log('📍 Request assigned to technician:', data);
      this.emit('request_updated', { ...data, status: 'ASSIGNED' });
    });
  }

  /**
   * Start fallback polling when socket disconnects
   */
  startFallbackPolling() {
    if (this.fallbackInterval) {
      return; // Already polling
    }

    console.log('🔄 Starting fallback polling every 5 seconds');
    this.fallbackInterval = setInterval(() => {
      this.emit('fallback_poll');
    }, 5000);
  }

  /**
   * Stop fallback polling
   */
  stopFallbackPolling() {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
      console.log('⏹️ Stopped fallback polling');
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit custom event
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in socket event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id,
      reconnectAttempts: this.reconnectAttempts,
      isPolling: !!this.fallbackInterval
    };
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    console.log('🔌 Disconnecting socket...');
    
    this.stopFallbackPolling();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.listeners.clear();
  }

  /**
   * Join technician-specific room
   */
  async joinTechnicianRoom() {
    if (!this.socket) return;
    // Socket.io will queue emits until connected, but we also call this after connect().
    this.socket.emit('join_technician_room');
    console.log('🏠 Joined technician room');
  }

  /**
   * Leave technician-specific room
   */
  leaveTechnicianRoom() {
    if (!this.socket) return;
    this.socket.emit('leave_technician_room');
    console.log('🚪 Left technician room');
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;

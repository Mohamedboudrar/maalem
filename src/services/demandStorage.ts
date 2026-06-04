import AsyncStorage from '@react-native-async-storage/async-storage';

const DEMANDS_KEY = '@maalem_demands';

export interface Demand {
  id: string;
  category: string;
  categoryName: string;
  description: string;
  budget: string;
  images: string[];
  location: {
    latitude: number;
    longitude: number;
  } | null;
  clientName: string;
  clientPhone: string;
  city: string;
  clientRating: number;
  urgency: 'Urgent' | 'Normal';
  timestamp: number;
  status: 'pending' | 'accepted' | 'completed';
}

export const demandStorage = {
  // Save a new demand
  async saveDemand(demand: Demand): Promise<void> {
    try {
      const existingDemands = await this.getDemands();
      const updatedDemands = [demand, ...existingDemands];
      await AsyncStorage.setItem(DEMANDS_KEY, JSON.stringify(updatedDemands));
    } catch (error) {
      console.error('Error saving demand:', error);
      throw error;
    }
  },

  // Get all demands
  async getDemands(): Promise<Demand[]> {
    try {
      const demandsJson = await AsyncStorage.getItem(DEMANDS_KEY);
      return demandsJson ? JSON.parse(demandsJson) : [];
    } catch (error) {
      console.error('Error getting demands:', error);
      return [];
    }
  },

  // Get pending demands (for workers to see)
  async getPendingDemands(): Promise<Demand[]> {
    try {
      const demands = await this.getDemands();
      return demands
        .filter(d => d.status === 'pending')
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error getting pending demands:', error);
      return [];
    }
  },

  // Get demands near a location
  async getDemandsNearLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 5
  ): Promise<Demand[]> {
    try {
      const demands = await this.getPendingDemands();
      return demands.filter(demand => {
        if (!demand.location) return false;
        const distance = calculateDistance(
          latitude,
          longitude,
          demand.location.latitude,
          demand.location.longitude
        );
        return distance <= radiusKm;
      });
    } catch (error) {
      console.error('Error getting nearby demands:', error);
      return [];
    }
  },

  // Update demand status
  async updateDemandStatus(
    demandId: string,
    status: Demand['status']
  ): Promise<void> {
    try {
      const demands = await this.getDemands();
      const updatedDemands = demands.map(d =>
        d.id === demandId ? { ...d, status } : d
      );
      await AsyncStorage.setItem(DEMANDS_KEY, JSON.stringify(updatedDemands));
    } catch (error) {
      console.error('Error updating demand status:', error);
      throw error;
    }
  },

  // Clear all demands (for testing)
  async clearDemands(): Promise<void> {
    try {
      await AsyncStorage.removeItem(DEMANDS_KEY);
    } catch (error) {
      console.error('Error clearing demands:', error);
      throw error;
    }
  },

  // Subscribe to demand changes (simple polling mechanism)
  subscribeToChanges(callback: (demands: Demand[]) => void, intervalMs: number = 2000) {
    const interval = setInterval(async () => {
      const demands = await this.getPendingDemands();
      callback(demands);
    }, intervalMs);

    return () => clearInterval(interval);
  },
};

// Calculate distance between two coordinates in km
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

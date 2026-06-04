import api from './api';
import { getAuthToken } from './firebaseAuth';

/**
 * Update worker's current location
 * Uses the technician profile location endpoint.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} - Updated location data
 */
export const updateLocation = async (lat, lng) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.put(
      '/api/technician/profile/location',
      { latitude: lat, longitude: lng },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error updating location:', error);
    throw error;
  }
};

export const updateAvailability = async (isAvailable) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.put(
      '/api/technician/profile/availability',
      { isAvailable: !!isAvailable },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error updating availability:', error);
    throw error;
  }
};

/**
 * Get a technician's latest known location (for client trip tracking).
 * Tries several possible backend endpoints for compatibility.
 * @param {string|number} workerId
 * @returns {Promise<{lat:number,lng:number,source?:string,raw?:any}>}
 */
export const getWorkerLocation = async (workerId) => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('No authenticated session found.');
  }

  if (workerId == null || workerId === '') {
    throw new Error('workerId is required.');
  }

  const id = String(workerId);
  const endpoints = [
    `/api/technician/${id}/profile/location`,
    `/api/technician/profile/${id}/location`,
    `/api/technician/profile/location/${id}`,
    `/api/technician/${id}/location`,
    `/api/technicians/${id}/location`,
    `/api/technician/location/${id}`,
    `/api/technicians/location/${id}`,
    `/api/technician/${id}`,
    `/api/technicians/${id}`,
  ];

  const extract = (data) => {
    const lat =
      data?.latitude ??
      data?.lat ??
      data?.location?.latitude ??
      data?.location?.lat ??
      data?.technicianProfile?.latitude ??
      data?.technicianProfile?.lat ??
      data?.profile?.latitude ??
      data?.profile?.lat ??
      null;

    const lng =
      data?.longitude ??
      data?.lng ??
      data?.location?.longitude ??
      data?.location?.lng ??
      data?.technicianProfile?.longitude ??
      data?.technicianProfile?.lng ??
      data?.profile?.longitude ??
      data?.profile?.lng ??
      null;

    if (lat == null || lng == null) return null;
    return { lat: Number(lat), lng: Number(lng) };
  };

  let lastError;
  for (const url of endpoints) {
    try {
      const response = await api.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const coords = extract(response.data);
      if (!coords) {
        throw new Error(`Location not found in response from ${url}`);
      }

      return { ...coords, source: url, raw: response.data };
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404 || status === 401 || status === 403) {
        lastError = error;
        continue;
      }
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to fetch worker location.');
};

/**
 * Get worker's sold/earnings data from database
 * @returns {Promise<Object>} - Worker's sold information including total sales, earnings, etc.
 */
export const getWorkerSoldData = async () => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.get('/api/technician/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const technicianData = response.data;
    
    // Extract sold field from technician profile
    const soldData = {
      sold: technicianData?.technicianProfile?.sold || technicianData?.sold || 0,
      totalEarnings: technicianData?.technicianProfile?.sold || technicianData?.totalEarnings || technicianData?.sold || 0,
      completedJobs: technicianData?.completedJobs || 0,
      rating: technicianData?.technicianProfile?.averageRating || technicianData?.rating || 0,
      // Include any other relevant fields from the profile
      ...technicianData
    };
    
    console.log('✅ Successfully fetched worker sold data from /api/technician/me');
    return soldData;
  } catch (error) {
    console.error('Error fetching worker sold data:', error);
    throw error;
  }
};

/**
 * Add credits to technician's balance
 * @param {number} amount - Amount to add to balance
 * @returns {Promise<{message: string, newBalance: number, addedAmount: number}>} - API response with new balance
 */
export const addToWorkerBalance = async (amount) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.post(
      '/api/technician/balance',
      { amount },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    
    console.log('✅ Successfully added balance:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding to worker balance:', error);
    throw error;
  }
};

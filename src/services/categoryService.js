import api from './api';
import { getAuthToken } from './firebaseAuth';

export const getCategories = async () => {
  try {
    const response = await api.get('/api/categories');
    return response.data;
  } catch (error) {
    // Handle timeout specifically
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.warn('Categories endpoint timed out, using fallback categories');
      // Return fallback categories when endpoint times out
      return [
        { id: 1, name: 'Réparation' },
        { id: 2, name: 'Électricité' },
        { id: 3, name: 'Climatisation' },
        { id: 4, name: 'Plomberie' },
        { id: 5, name: 'Services généraux' }
      ];
    }
    throw error; // Re-throw other errors
  }
};

export const getCategoryById = async (categoryId) => {
  const response = await api.get(`/api/categories/${categoryId}`);
  return response.data;
};

export const getTechnicianMe = async () => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('No authenticated session found.');
  }

  const response = await api.get('/api/technician/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getTechnicianRequests = async () => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('No authenticated session found.');
  }

  const response = await api.get('/api/technician/requests', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

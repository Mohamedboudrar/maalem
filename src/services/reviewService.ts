import { isAxiosError } from 'axios';
import api from './api';
import { getAuthToken } from './firebaseAuth';

export type CreateReviewPayload = {
  requestId: number;
  rating: number;
  comment?: string;
};

export type CreateReviewResponse = {
  message: string;
  review: Record<string, unknown>;
  newAverageRating?: number;
};

export const createReview = async (
  payload: CreateReviewPayload,
): Promise<CreateReviewResponse> => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('NO_AUTH_TOKEN');
  }

  const response = await api.post('/api/reviews', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.data;
};

export const getMyRequests = async (): Promise<any[]> => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('NO_AUTH_TOKEN');
  }

  const response = await api.get('/api/requests/my', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return Array.isArray(response.data) ? response.data : [];
};

export const getReviewErrorMessage = (error: unknown) => {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const message = String(error.response?.data?.message || '').toLowerCase();

    if (status === 400 && (message.includes('already') || message.includes('deja'))) {
      return "Vous avez deja note cette mission.";
    }
    if (status === 400 && message.includes('done')) {
      return 'La mission doit etre terminee avant de laisser un avis.';
    }
    if (status === 403) {
      return "Vous n'etes pas autorise a noter cette mission.";
    }
    if (status === 404) {
      return 'Mission introuvable. Veuillez actualiser puis reessayer.';
    }
    if (status === 401) {
      return 'Votre session a expire. Reconnectez-vous puis reessayez.';
    }
  }

  return "Impossible d'envoyer l'avis pour le moment.";
};

export const isDuplicateReviewError = (error: unknown) => {
  if (!isAxiosError(error)) return false;
  const message = String(error.response?.data?.message || '').toLowerCase();
  return error.response?.status === 400 && (message.includes('already') || message.includes('deja'));
};

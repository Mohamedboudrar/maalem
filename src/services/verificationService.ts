import api from './api';
import { getAuthToken } from './firebaseAuth';

export interface VerificationResponse {
  verified: boolean;
  confidence: number;
  message: string;
}

export const verifyIdentity = async (idImage: any, selfie: any): Promise<VerificationResponse> => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    // Create FormData properly for React Native
    const formData = new FormData();

    // In React Native, append files with the correct format
    if (idImage && idImage.uri) {
      formData.append('idImage', {
        uri: idImage.uri,
        type: idImage.mimeType || 'image/jpeg',
        name: idImage.fileName || 'idImage.jpg',
      } as any);
    }

    if (selfie && selfie.uri) {
      formData.append('selfie', {
        uri: selfie.uri,
        type: selfie.mimeType || 'image/jpeg',
        name: selfie.fileName || 'selfie.jpg',
      } as any);
    }

    const response = await api.post('/api/technician/verify-identity', formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        // Override global default so React Native sets multipart/form-data with boundary automatically
        'Content-Type': undefined,
      },
    });

    return response.data;
  } catch (error) {
    throw error;
  }
};

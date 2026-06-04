import api from './api';
import { getAuthToken, getCurrentUserId } from './firebaseAuth';

export const createRequest = async (payload) => {
  try {
    const response = await api.post('/api/requests', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating request:', error);
    throw error;
  }
};

export const getMyRequests = async (token) => {
  try {
    const response = await api.get('/api/requests/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching my requests:', error);
    throw error;
  }
};

export const getRequestById = async (requestId, token) => {
  try {
    const response = await api.get(`/api/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    if (error?.response?.status !== 404) {
      console.error('Error fetching request by id:', error);
    }
    throw error;
  }
};

export const cancelRequest = async (requestId, token) => {
  try {
    const response = await api.put(`/api/requests/${requestId}/cancel`, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Error cancelling request:', error);
    throw error;
  }
};

export const getWorkerOrders = async ({ latitude, longitude } = {}) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const params = {};
    if (latitude != null) params.latitude = latitude;
    if (longitude != null) params.longitude = longitude;

    const response = await api.get('/api/technician/requests', {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching technician requests:', error);
    throw error;
  }
};

export const acceptOrder = async (requestId, price, message = '', status = 'ACCEPTED') => {
  console.log('🎯 acceptOrder called with:', { requestId, price, message, status });
  let token;
  try {
    token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    // Create offer with specified status
    const offerResponse = await api.post(
      '/api/offers',
      {
        requestId: Number(requestId),
        price: Number(price),
        status: status, // PENDING for different prices, ACCEPTED for same price
        ...(message ? { message } : {}),
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log('✅ Offer created successfully - backend should handle status update to IN_PROGRESS');
    console.log('🔍 Offer response:', offerResponse.data);
    return offerResponse.data;
  } catch (error) {
    console.error('Error creating offer:', error);
    
    // If technician already sent an offer, cancel it first and create a new one
    if (error?.response?.status === 400) {
      const errorMessage = error?.response?.data?.message || '';
      console.log('🔄 Offer creation failed, checking if it\'s because of existing offer:', errorMessage);
      
      // Check for various possible error messages about existing offers
      if (errorMessage.includes('already sent an offer') || 
          errorMessage.includes('déjà envoyer une offre') ||
          errorMessage.includes('already sent') ||
          errorMessage.includes('already exists')) {
        
        console.log('🔄 Technician already sent offer, attempting to cancel and resend');
        
        try {
          const safeToken = token || (await getAuthToken());
          if (!safeToken) {
            throw new Error('No authenticated session found.');
          }

          // First, get the existing offer for this request
          const offersResponse = await api.get(`/api/offers/request/${requestId}`, {
            headers: { Authorization: `Bearer ${safeToken}` },
          });
          
          const currentUserId = await getCurrentUserId();
          const existingOffers = offersResponse.data || [];
          const technicianOffer = existingOffers.find(offer => 
            offer.technicianId && offer.technicianId.toString() === currentUserId
          );
          
          if (technicianOffer) {
            console.log('🗑️ Found existing offer, canceling it first:', technicianOffer.id);
            
            // Cancel the existing offer
            await api.put(
              `/api/offers/${technicianOffer.id}/cancel`,
              {},
              {
                headers: { Authorization: `Bearer ${safeToken}` },
              }
            );
            
            console.log('✅ Existing offer canceled, creating new one');
            
            // Now create the new offer - backend should automatically update request status to IN_PROGRESS
            const newResponse = await api.post(
              '/api/offers',
              {
                requestId: Number(requestId),
                price: Number(price),
                ...(message ? { message } : {}),
              },
              {
                headers: { Authorization: `Bearer ${safeToken}` },
              }
            );
            
            console.log('✅ New offer created successfully - backend should handle status update to IN_PROGRESS');
            console.log('🔍 New offer response:', newResponse.data);
            return newResponse.data;
          }
        } catch (resendError) {
          console.error('Error in cancel and resend process:', resendError);
        }
      }
    }
    
    throw error;
  }
};

export const cancelOrder = async (offerId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('🗑️ Attempting to cancel offer with ID:', offerId);
    console.log('🔑 Using token:', token.substring(0, 20) + '...');

    const response = await api.put(
      `/api/offers/${offerId}/cancel`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log('📞 Cancel API response status:', response.status);
    console.log('📞 Cancel API response data:', response.data);
    console.log('📋 Cancel API response headers:', response.headers);

    return { success: true, ...response.data };
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    console.log('📋 Error response status:', error.response?.status);
    console.log('📋 Error response data:', error.response?.data);
    console.log('📋 Error response headers:', error.response?.headers);
    
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Unable to cancel order',
    };
  }
};

export const cancelAcceptedOrder = async (offerId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('🗑️ Attempting to cancel ACCEPTED offer with ID:', offerId);
    console.log('🔑 Using token:', token.substring(0, 20) + '...');

    const response = await api.put(
      `/api/offers/${offerId}/cancel-accepted`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log('📞 Cancel-accepted API response status:', response.status);
    console.log('📞 Cancel-accepted API response data:', response.data);

    return { success: true, ...response.data };
  } catch (error) {
    console.error('❌ Error cancelling accepted order:', error);
    console.log('📋 Error response status:', error.response?.status);
    console.log('📋 Error response data:', error.response?.data);

    return {
      success: false,
      message:
        error?.response?.data?.message ||
        error?.message ||
        'Unable to cancel accepted order',
    };
  }
};


// Function to get worker's offers using the new technician-specific endpoint
export const getWorkerAcceptedOffers = async () => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.get('/api/technician/offers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    // Filter offers that are accepted (the endpoint only returns this technician's offers)
    const acceptedOffers = response.data.filter(offer => {
      const status = String(offer.status || '').toUpperCase();
      const isAccepted = ['ACCEPTED', 'ASSIGNED', 'SELECTED'].includes(status) ||
                        !!offer.acceptedAt ||
                        !!offer.selectedAt;
      
      return isAccepted;
    });
    return acceptedOffers;
  } catch (error) {
    // Don't log 404 errors - they just mean no offers exist for this worker
    if (error?.response?.status !== 404) {
      console.error('Error fetching technician offers:', error);
    }
    return []; // Return empty array instead of throwing
  }
};

// Function to get all worker offers (accepted/pending/refused/etc.)
export const getWorkerOffers = async () => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    const response = await api.get('/api/technician/offers', {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data || [];
  } catch (error) {
    if (error?.response?.status !== 404) {
      console.error('Error fetching technician offers:', error);
    }
    return [];
  }
};

export const completeMission = async (requestId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('🎯 Completing mission:', requestId);
    console.log('🔑 Using token:', token.substring(0, 20) + '...');

    const response = await api.put(`/api/requests/${requestId}/done`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    console.log('✅ Mission completed successfully:', response.data);
    console.log('🔍 Response status:', response.status);
    console.log('🔍 Response headers:', response.headers);
    console.log('🔍 Full response:', JSON.stringify(response, null, 2));
    
    // Check if the response contains updated status
    if (response.data && response.data.status) {
      console.log('🎯 Mission status updated to:', response.data.status);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error completing mission:', error);
    console.log('🔍 Error response status:', error?.response?.status);
    console.log('🔍 Error response data:', error?.response?.data);
    throw error;
  }
};

export const completeOffer = async (offerId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('🎯 Completing offer:', offerId);
    const response = await api.put(`/api/offers/${offerId}/done`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    console.log('✅ Offer completed successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error completing offer:', error);
    throw error;
  }
};

export const getPlatformFeeForRequest = async (requestId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('💰 Fetching platform fee for request:', requestId);
    const response = await api.get(`/api/platform-fees/request/${requestId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    console.log('✅ Platform fee fetched successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching platform fee:', error);
    throw error;
  }
};

/**
 * Check if worker's balance will stay positive after deducting 10% platform commission
 * @param {number} missionPrice - The total price of the mission
 * @param {number} currentBalance - Worker's current balance
 * @returns {Object} - Result with canAfford, remainingBalance, commissionAmount
 */
/**
 * Check if worker's balance will stay positive after deducting 10% platform commission
 * @param {number} missionPrice - The total price of the mission
 * @param {number} currentBalance - Worker's current balance
 * @returns {{canAfford: boolean, remainingBalance: number, commissionAmount: number, missionPrice: number, commissionRate: number}}
 */
export const checkBalanceAfterCommission = (missionPrice, currentBalance) => {
  const COMMISSION_RATE = 0.10; // 10% platform commission
  const commissionAmount = missionPrice * COMMISSION_RATE;
  const remainingBalance = currentBalance - commissionAmount;
  
  // Allow small negative balance (up to -5 DH) to accommodate commission rounding
  const MIN_BALANCE_THRESHOLD = -5; // Allow small negative balance
  
  return {
    canAfford: remainingBalance >= MIN_BALANCE_THRESHOLD,
    remainingBalance,
    commissionAmount,
    missionPrice,
    commissionRate: COMMISSION_RATE
  };
};

export const getPlatformFeesForTechnician = async (technicianId) => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authenticated session found.');
    }

    console.log('💰 Fetching platform fees for technician:', technicianId);
    const response = await api.get(`/api/platform-fees/technician/${technicianId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    console.log('✅ Technician platform fees fetched successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching technician platform fees:', error);
    throw error;
  }
};

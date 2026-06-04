import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import api from '@/src/services/api';
import { getAuthToken, getSessionUser } from '@/src/services/firebaseAuth';

type UserProfile = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  city?: string;
  averageRating?: number;
  createdAt?: number;
};

type Review = {
  id: string;
  rating: number;
  comment: string;
  clientName: string;
  createdAt: string;
  requestId: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isWorkerMode, setIsWorkerMode] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await getSessionUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        // Set user mode - debug full user object
        console.log('🔍 Full user object:', user);
        console.log('🔍 User properties:', {
          mode: user.mode,
          type: typeof user.mode,
          hasMode: 'mode' in user,
          id: user.id,
          fullName: user.fullName
        });
        
        // Check for worker mode - check both mode and role
        const workerMode = user.mode === 'worker' || user.role === 'TECHNICIAN';
        setIsWorkerMode(workerMode);
        console.log('🔍 User mode check:', {
          mode: user.mode,
          role: user.role,
          hasTechnicianProfile: !!user.technicianProfile,
          isWorkerMode: workerMode,
          userId: user.id
        });

        const token = await getAuthToken();
        setAuthToken(token || null);
        if (!token) {
          router.replace('/login');
          return;
        }

        const response = await api.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = response.data || {};
        
        // Set user ID from API response
        setUserId(data.id || data._id || null);
        
        // Get city from API or geocoding
        let detectedCity = data.city || data.address?.city || '-';
        console.log('🔍 Initial city check:', {
          apiCity: data.city,
          addressCity: data.address?.city,
          initialCity: detectedCity
        });
        
        // If no city from API, try to get coordinates for geocoding
        console.log('🔍 Checking for coordinates in data structure:', {
          technicianProfile: data.technicianProfile,
          TechnicianProfile: data.TechnicianProfile,
          hasTechnicianProfile: !!data.technicianProfile,
          hasTechnicianProfileCapital: !!data.TechnicianProfile,
          isWorkerMode
        });
        
        // Check multiple possible locations for coordinates
        let latitude = null;
        let longitude = null;
        
        if (data.technicianProfile?.latitude && data.technicianProfile?.longitude) {
          latitude = data.technicianProfile.latitude;
          longitude = data.technicianProfile.longitude;
        } else if (data.TechnicianProfile?.latitude && data.TechnicianProfile?.longitude) {
          latitude = data.TechnicianProfile.latitude;
          longitude = data.TechnicianProfile.longitude;
        } else if (data.technicianProfile?.isAvailable !== undefined) {
          // Found technician profile structure, check for coordinates
          latitude = data.technicianProfile.latitude;
          longitude = data.technicianProfile.longitude;
        } else if (!isWorkerMode) {
          // For clients, try to get current location
          try {
            const Location = require('expo-location');
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            });
            latitude = location.coords.latitude;
            longitude = location.coords.longitude;
            console.log('🔍 Got client current location:', { latitude, longitude });
          } catch (locationError) {
            console.log('⚠️ Could not get client location:', locationError);
          }
        }
        
        if (detectedCity === '-' && latitude && longitude) {
          console.log('🔍 Attempting geocoding from coordinates:', {
            latitude,
            longitude,
            source: isWorkerMode ? 'technician profile' : 'current location'
          });
          
          try {
            detectedCity = await getCityFromCoordinates(latitude, longitude);
            console.log('✅ Geocoding successful, city:', detectedCity);
          } catch (error) {
            console.error('❌ Error detecting city from coordinates:', error);
          }
        } else {
          console.log('🔍 Skipping geocoding - city already available or no coordinates:', {
            detectedCity,
            latitude,
            longitude,
            hasCoordinates: !!(latitude && longitude)
          });
        }
        
        // Get average rating from technician profile
        let averageRating = 0;
        if (data.technicianProfile?.averageRating) {
          averageRating = data.technicianProfile.averageRating;
        } else if (data.TechnicianProfile?.averageRating) {
          averageRating = data.TechnicianProfile.averageRating;
        } else if (data.averageRating) {
          averageRating = data.averageRating;
        }
        
        console.log('🔍 Rating detection:', {
          technicianProfileRating: data.technicianProfile?.averageRating,
          TechnicianProfileRating: data.TechnicianProfile?.averageRating,
          userRating: data.averageRating,
          finalRating: averageRating
        });
        
        setProfile({
          firstName: data.fullName?.split(' ')?.[0] || user.fullName.split(' ')?.[0] || '',
          lastName: data.fullName?.split(' ')?.slice(1).join(' ') || '',
          phone: data.phone || '',
          email: data.email || user.email,
          city: detectedCity,
          averageRating: averageRating,
          createdAt: data.createdAt ? new Date(data.createdAt).getTime() : undefined,
        });
        
        console.log('🔍 Final profile data set:', {
          city: detectedCity,
          phone: data.phone,
          email: data.email || user.email
        });
        
        // Set profile image if available
        console.log('🔍 Profile data received:', {
          profilePicture: data.profilePicture,
          profilePictureType: typeof data.profilePicture,
          hasProfilePicture: !!data.profilePicture
        });
        
        if (data.profilePicture) {
          // Convert relative path to absolute URL if needed
          const rawProfilePicture = String(data.profilePicture || '');
          const baseUrl = String(api.defaults.baseURL || '').replace(/\/+$/, '');
          const fullProfilePictureUrl = rawProfilePicture.startsWith('http')
            ? rawProfilePicture
            : `${baseUrl}/${rawProfilePicture.replace(/^\/+/, '')}`;
          
          console.log('Raw profile picture:', data.profilePicture);
          console.log('Final profile picture URL:', fullProfilePictureUrl);
          
          // Test different possible URL paths for profile pictures
          const possibleUrls = [
            fullProfilePictureUrl, // Original URL
            fullProfilePictureUrl.replace('/uploads/', '/uploads/profiles/'), // Option 1: profiles directory
            fullProfilePictureUrl.replace('/uploads/', '/uploads/requests/'), // Option 2: requests directory (current)
          ];
          
          let workingUrl = null;
          for (const testUrl of possibleUrls) {
            try {
              const testResponse = await fetch(testUrl, { 
                method: 'HEAD',
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
              });
              console.log('🔍 Testing profile image URL:', {
                url: testUrl,
                status: testResponse.status,
                ok: testResponse.ok,
                contentType: testResponse.headers.get('content-type')
              });
              
              if (testResponse.ok && testResponse.headers.get('content-type')?.startsWith('image/')) {
                workingUrl = testUrl;
                console.log('✅ Working profile image URL found:', testUrl);
                break;
              }
            } catch (networkError) {
              console.log('❌ Network error for URL:', testUrl, (networkError as Error).message);
            }
          }
          
          if (workingUrl) {
            setProfileImage(workingUrl);
            console.log('✅ Profile picture fetched with working URL:', workingUrl);
          } else {
            console.warn('⚠️ No working profile image URL found');
            setProfileImage(null);
          }
        } else {
          console.log('⚠️ No profile picture found in API response');
          setProfileImage(null);
        }
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const fetchReviews = async () => {
    if (!isWorkerMode || !userId || !authToken) return;
    
    try {
      setReviewsLoading(true);
      console.log('🔍 Fetching technician reviews for user:', userId);
      
      const response = await api.get(`/api/reviews/technician/${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      
      const reviewsData = response.data || [];
      console.log('✅ Technician reviews fetched:', reviewsData);
      setReviews(reviewsData);
    } catch (error) {
      console.error('❌ Error fetching technician reviews:', error);
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const getCityFromCoordinates = async (latitude: number, longitude: number): Promise<string> => {
    try {
      console.log('🔍 Getting city from coordinates:', { latitude, longitude });
      
      // Simple fallback for known coordinates (Morocco area based on lat: 30.396, lon: -9.553)
      if (latitude >= 30.0 && latitude <= 31.0 && longitude >= -10.0 && longitude <= -9.0) {
        console.log('🔍 Using Morocco region fallback');
        return 'Agadir';
      }
      
      // Using OpenStreetMap Nominatim API (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Maalem-App/1.0'
          }
        }
      );
      
      if (!response.ok) {
        console.log('⚠️ Geocoding API failed, using fallback');
        return 'Inconnue';
      }
      
      const data = await response.json();
      console.log('🔍 Geocoding response:', data);
      
      // Try to get city from different possible fields
      const city = data.address?.city || 
                   data.address?.town || 
                   data.address?.village || 
                   data.address?.municipality ||
                   data.name ||
                   'Inconnue';
      
      console.log('✅ City detected from coordinates:', city);
      return city;
    } catch (error) {
      console.error('❌ Error getting city from coordinates:', error);
      return 'Inconnue';
    }
  };

  useEffect(() => {
    if (isWorkerMode && userId && authToken) {
      fetchReviews();
    }
  }, [isWorkerMode, userId, authToken]);

  const pickProfileImage = async () => {
    try {
      // Request gallery permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.status !== 'granted') {
        Alert.alert('Permission refusée', 'Veuillez autoriser l\'accès à la galerie pour changer votre photo de profil.');
        return;
      }

      // Open image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        // Update UI instantly with selected image
        setProfileImage(result.assets[0].uri);
        console.log('Profile image selected:', result.assets[0].uri);
        
        // Add backend upload functionality here
        await uploadProfilePicture(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner une image. Veuillez réessayer.');
    }
  };

  const uploadProfilePicture = async (imageUri: string) => {
  try {
    setUploading(true);

    const token = await getAuthToken();

    const formData = new FormData();

    const filename = imageUri.split('/').pop() || 'profile.jpg';

    // Get file extension
    const match = /\.(\w+)$/.exec(filename);
    const ext = match?.[1]?.toLowerCase();

    // Detect mime type
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : 'image/jpeg';

    formData.append('profilePicture', {
      uri: imageUri,
      name: filename,
      type: mimeType,
    } as any);

    console.log('Uploading file:', {
      uri: imageUri,
      name: filename,
      type: mimeType,
    });

    const response = await fetch(
      `${api.defaults.baseURL}/api/auth/me/profile-picture`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: formData,
      }
    );

    const responseText = await response.text();

    console.log('Upload response:', responseText);

    if (!response.ok) {
      throw new Error(responseText || `HTTP ${response.status}`);
    }

    Alert.alert('Succès', 'Photo de profil mise à jour');
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    Alert.alert(
      'Erreur',
      'Impossible de télécharger votre photo.'
    );
  } finally {
    setUploading(false);
  }
};

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  const fullName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    profile?.email?.split('@')[0] ||
    'Utilisateur';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="#1a1a2e" />
          </TouchableOpacity>
          <Text style={styles.title}>Profil</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity 
              style={styles.avatarTouchable}
              onPress={pickProfileImage}
              disabled={uploading}
            >
              {(() => {
                console.log('🔍 Profile render check:', {
                  profileImage,
                  profileImageType: typeof profileImage,
                  isString: typeof profileImage === 'string',
                  hasLength: typeof profileImage === 'string' && profileImage.trim().length > 0,
                  shouldRender: profileImage && typeof profileImage === 'string' && profileImage.trim().length > 0
                });
                return profileImage && typeof profileImage === 'string' && profileImage.trim().length > 0;
              })() ? (
                <Image
                  source={{
                    uri: profileImage!,
                    ...(authToken && profileImage!.startsWith('http')
                      ? { headers: { Authorization: `Bearer ${authToken}` } }
                      : {}),
                  }}
                  style={styles.avatarImage}
                  onError={(error) => {
                    console.error('❌ Profile image load error in profile:', {
                      error,
                      uri: profileImage,
                      nativeEvent: error.nativeEvent
                    });
                  }}
                  onLoad={() => {
                    console.log('✅ Profile image loaded successfully in profile:', profileImage);
                  }}
                  onLoadStart={() => {
                    console.log('🔄 Profile image loading started in profile:', profileImage);
                  }}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Feather name="user" size={36} color="#1e40af" />
                </View>
              )}
              
              {/* Edit icon overlay */}
              <View style={styles.editIconOverlay}>
                {uploading ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Informations</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Téléphone</Text>
            <Text style={styles.value}>{profile?.phone || '-'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ville</Text>
            <Text style={styles.value}>{profile?.city || '-'}</Text>
          </View>

          {/* Rating - Only show for technicians */}
          {isWorkerMode && profile?.averageRating && profile.averageRating > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>Note Moyenne</Text>
              <View style={styles.ratingContainer}>
                <View style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Feather
                      key={star}
                      name="star"
                      size={16}
                      color={star <= Math.round(profile.averageRating || 0) ? "#fbbf24" : "#d1d5db"}
                      style={styles.ratingStar}
                    />
                  ))}
                </View>
                <Text style={styles.ratingValue}>{profile.averageRating.toFixed(1)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Technician Reviews Section - Only show in worker mode */}
        {(() => {
          console.log('🔍 Reviews section render check:', {
            isWorkerMode,
            reviewsLength: reviews.length,
            reviewsLoading
          });
          return isWorkerMode;
        })() && (
          <View style={styles.reviewsCard}>
            <Text style={styles.sectionTitle}>Avis Clients</Text>
            
            {reviewsLoading ? (
              <View style={styles.reviewsLoadingContainer}>
                <ActivityIndicator size="small" color="#1e40af" />
                <Text style={styles.reviewsLoadingText}>Chargement des avis...</Text>
              </View>
            ) : reviews.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reviewsContainer}
              >
                {reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.clientName}>{review.clientName}</Text>
                      <View style={styles.ratingContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Feather
                            key={star}
                            name="star"
                            size={14}
                            color={star <= review.rating ? "#fbbf24" : "#d1d5db"}
                            style={styles.star}
                          />
                        ))}
                      </View>
                    </View>
                    <Text style={styles.reviewComment} numberOfLines={3}>
                      {review.comment}
                    </Text>
                    <Text style={styles.reviewDate}>
                      {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.noReviewsContainer}>
                <Feather name="message-circle" size={32} color="#9ca3af" />
                <Text style={styles.noReviewsText}>Aucun avis pour le moment</Text>
                <Text style={styles.noReviewsSubtext}>Les avis apparaîtront ici une fois que vous aurez complété des missions</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 60 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  loadingText: { marginTop: 12, color: '#666' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a2e' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  avatarTouchable: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#dbeafe',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#1e40af',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  infoCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 16 },
  row: { marginBottom: 14 },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  value: { fontSize: 16, color: '#1a1a2e', fontWeight: '600' },
  reviewsCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: 16 },
  reviewsLoadingContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20,
    gap: 8 
  },
  reviewsLoadingText: { fontSize: 14, color: '#6b7280' },
  reviewsContainer: { gap: 12 },
  reviewCard: { 
    backgroundColor: '#f8f9fa', 
    borderRadius: 12, 
    padding: 16, 
    width: 280,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  reviewHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  clientName: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  ratingContainer: { flexDirection: 'row', gap: 2 },
  star: { },
  reviewComment: { 
    fontSize: 13, 
    color: '#4b5563', 
    lineHeight: 18,
    marginBottom: 8 
  },
  reviewDate: { fontSize: 11, color: '#9ca3af' },
  noReviewsContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 32,
    gap: 8 
  },
  noReviewsText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#6b7280',
    textAlign: 'center'
  },
  noReviewsSubtext: { 
    fontSize: 13, 
    color: '#9ca3af',
    textAlign: 'center',
    maxWidth: 250
  },
  starsContainer: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 2
  },
  ratingStar: { },
  ratingValue: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#1a1a2e',
    marginLeft: 8
  },
});

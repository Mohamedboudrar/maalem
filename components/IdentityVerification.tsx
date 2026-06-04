import { VerificationResponse, verifyIdentity } from '@/src/services/verificationService';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

interface IdentityVerificationProps {
  onVerificationComplete: (verified: boolean) => void;
  onReturn?: () => void;
  isVerified?: boolean;
}

const IdentityVerification: React.FC<IdentityVerificationProps> = ({
  onVerificationComplete,
  onReturn,
  isVerified = false,
}) => {
  const [idImage, setIdImage] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<'id' | 'selfie' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Auto-verify when both images are uploaded
  useEffect(() => {
    if (idImage && selfie && !isVerifying && !isUploading) {
      handleVerification();
    }
  }, [idImage, selfie]);

  const pickIDImage = async () => {
    setIsUploading('id');

    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      // Pick image from library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1.586, 1], // ID card ratio (roughly 16:10)
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIdImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick ID image');
    } finally {
      setIsUploading(null);
    }
  };

  const pickSelfie = async () => {
    setIsUploading('selfie');

    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      // Pick image from library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for selfie
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelfie(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick selfie');
    } finally {
      setIsUploading(null);
    }
  };

  const handleVerification = async () => {
    if (!idImage || !selfie) {
      Alert.alert('Missing Images', 'Please capture both ID card and selfie');
      return;
    }

    setIsVerifying(true);
    try {
      // Convert captured URIs to the format expected by the service
      const idImageFile = {
        uri: idImage,
        fileName: 'idImage.jpg',
        mimeType: 'image/jpeg',
      };
      
      const selfieFile = {
        uri: selfie,
        fileName: 'selfie.jpg',
        mimeType: 'image/jpeg',
      };

      const result: VerificationResponse = await verifyIdentity(idImageFile, selfieFile);
      
      if (result.verified) {
        // Auto-redirect to worker map after successful verification
        Alert.alert(
          'Verification Successful',
          'Your identity has been verified successfully! Redirecting to worker map...',
          [
            {
              text: 'OK',
              onPress: async () => {
                // Refresh user data to get updated verification status
                try {
                  const { refreshSessionUser } = await import('@/src/services/firebaseAuth');
                  await refreshSessionUser();
                } catch (error) {
                  console.error('Failed to refresh session after verification:', error);
                }
                onVerificationComplete(true);
                // Auto-redirect logic will be handled by parent component
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Verification Failed',
          result.message || 'Identity verification failed. Please try again.',
          [
            {
              text: 'Retry',
              onPress: () => {
                // Clear images for retry
                setIdImage(null);
                setSelfie(null);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      Alert.alert(
        'Verification Error',
        error.message || 'Verification service is currently unavailable. Please try again later.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  // Show verified state
  if (isVerified) {
    return (
      <View style={styles.verifiedContainer}>
        <View style={styles.verifiedIcon}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
        <Text style={styles.verifiedText}>Identity Verified</Text>
        <Text style={styles.verifiedSubtext}>Your identity has been successfully verified</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Identity Verification</Text>
        <Text style={styles.subtitle}>
          Upload your ID card and a selfie to verify your identity
        </Text>
      </View>

      <View style={styles.uploadSection}>
        <View style={styles.uploadItem}>
          <Text style={styles.uploadLabel}>ID Card</Text>
          <TouchableOpacity
            style={[styles.uploadButton, idImage && styles.uploadButtonSelected]}
            onPress={pickIDImage}
            disabled={isUploading !== null}
          >
            {idImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: idImage }} style={styles.previewImage} />
                <TouchableOpacity 
                  style={styles.removeButton}
                  onPress={() => setIdImage(null)}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={48} color="#3b82f6" />
                <Text style={styles.uploadText}>
                  {isUploading === 'id' ? 'Uploading...' : 'Upload ID Card'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.uploadItem}>
          <Text style={styles.uploadLabel}>Selfie</Text>
          <TouchableOpacity
            style={[styles.uploadButton, selfie && styles.uploadButtonSelected]}
            onPress={pickSelfie}
            disabled={isUploading !== null}
          >
            {selfie ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: selfie }} style={styles.previewImage} />
                <TouchableOpacity 
                  style={styles.removeButton}
                  onPress={() => setSelfie(null)}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="person" size={48} color="#3b82f6" />
                <Text style={styles.uploadText}>
                  {isUploading === 'selfie' ? 'Uploading...' : 'Upload Selfie'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTROLS */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.returnButton}
          onPress={onReturn || (() => onVerificationComplete(false))}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.returnButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>Requirements:</Text>
        <Text style={styles.infoItem}>• Position your ID card within the frame</Text>
        <Text style={styles.infoItem}>• Ensure good lighting and no glare</Text>
        <Text style={styles.infoItem}>• Face should be clearly visible in selfie</Text>
        <Text style={styles.infoItem}>• Keep your ID card flat and steady</Text>
        <Text style={styles.infoNote}>
          Verification will be processed automatically once both images are uploaded
        </Text>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  uploadSection: {
    padding: 20,
  },
  uploadItem: {
    marginBottom: 20,
  },
  uploadLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  uploadButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  uploadText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  controls: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  returnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6b7280',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  returnButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoNote: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  infoSection: {
    padding: 20,
    paddingTop: 0,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
    lineHeight: 20,
  },
  verifiedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  verifiedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkmark: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  verifiedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  verifiedSubtext: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default IdentityVerification;

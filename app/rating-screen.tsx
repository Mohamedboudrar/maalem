import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ReviewForm from '@/components/ReviewForm';
import {
  createReview,
  getReviewErrorMessage,
  isDuplicateReviewError,
} from '@/src/services/reviewService';

interface RatingScreenProps {
  visible: boolean;
  onClose: () => void;
  onReviewed: () => void;
  missionData: {
    requestId: number;
    title: string;
    status: string;
    category?: string;
    technician?: {
      id?: number | string;
      fullName?: string;
      avatar?: string;
    } | null;
    canRate: boolean;
  };
}

const RatingScreen: React.FC<RatingScreenProps> = ({
  visible,
  onClose,
  onReviewed,
  missionData
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canRenderForm = useMemo(
    () =>
      missionData.canRate &&
      String(missionData.status).toUpperCase() === 'DONE',
    [missionData],
  );

  const handleSubmitReview = async (payload: { rating: number; comment: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createReview({
        requestId: missionData.requestId,
        rating: payload.rating,
        comment: payload.comment,
      });

      Alert.alert('Avis envoye', 'Merci pour votre retour.', [
        { text: 'OK', onPress: onReviewed },
      ]);
    } catch (error) {
      if (isDuplicateReviewError(error)) {
        Alert.alert('Deja evaluee', 'Cette mission a deja ete notee.', [
          { text: 'OK', onPress: onReviewed },
        ]);
      } else {
        Alert.alert('Erreur', getReviewErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Evaluer le technicien</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{missionData.title || 'Mission'}</Text>
            <Text style={styles.summaryMeta}>{missionData.category || 'Service'}</Text>
            <Text style={styles.summaryStatus}>Statut: {missionData.status}</Text>
            <Text style={styles.summaryTech}>
              Technicien: {missionData.technician?.fullName || 'Non assigne'}
            </Text>
          </View>

          {canRenderForm ? (
            <ReviewForm isSubmitting={isSubmitting} onSubmit={handleSubmitReview} />
          ) : (
            <View style={styles.infoBox}>
              <Feather name="alert-circle" size={22} color="#d97706" />
              <Text style={styles.infoText}>
                La notation est disponible seulement quand la mission est terminee et assignee.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  summaryMeta: {
    color: '#6b7280',
    marginTop: 2,
  },
  summaryStatus: {
    marginTop: 10,
    color: '#374151',
    fontWeight: '600',
  },
  summaryTech: {
    marginTop: 4,
    fontWeight: '600',
    color: '#1e40af',
  },
  infoBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: '#374151',
    fontSize: 14,
  },
});

export default RatingScreen;

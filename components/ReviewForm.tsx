import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import RatingStars from './RatingStars';

type ReviewFormProps = {
  isSubmitting: boolean;
  onSubmit: (payload: { rating: number; comment: string }) => Promise<void>;
};

const COMMENT_MAX_LENGTH = 500;

export default function ReviewForm({ isSubmitting, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedComment = useMemo(() => comment.trim(), [comment]);
  const canSubmit = rating >= 1 && rating <= 5 && !isSubmitting;

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      setError('Veuillez selectionner une note entre 1 et 5.');
      return;
    }

    setError(null);
    await onSubmit({ rating, comment: trimmedComment });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notez votre technicien</Text>
      <Text style={styles.subtitle}>Votre avis aide les autres clients a mieux choisir.</Text>

      <RatingStars value={rating} onChange={setRating} disabled={isSubmitting} />
      <Text style={styles.ratingHint}>
        {rating > 0 ? `Votre note: ${rating}/5` : 'Selectionnez une note pour continuer'}
      </Text>

      <TextInput
        value={comment}
        onChangeText={(text) => setComment(text.slice(0, COMMENT_MAX_LENGTH))}
        placeholder="Ajouter un commentaire (optionnel)"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        style={styles.input}
        editable={!isSubmitting}
      />

      <View style={styles.metaRow}>
        <Text style={styles.counter}>{comment.length}/{COMMENT_MAX_LENGTH}</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="send" size={16} color="#fff" />
            <Text style={styles.submitText}>Envoyer mon avis</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  ratingHint: {
    textAlign: 'center',
    color: '#4b5563',
    fontSize: 13,
  },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    color: '#6b7280',
    fontSize: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e40af',
    borderRadius: 12,
    paddingVertical: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

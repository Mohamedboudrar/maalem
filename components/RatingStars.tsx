import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type RatingStarsProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: number;
};

export default function RatingStars({
  value,
  onChange,
  disabled = false,
  size = 34,
}: RatingStarsProps) {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onChange(star)}
          disabled={disabled}
          style={styles.starButton}
          activeOpacity={0.8}
        >
          <Feather name="star" size={size} color={star <= value ? '#f59e0b' : '#d1d5db'} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  starButton: {
    padding: 4,
  },
});

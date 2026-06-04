import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = "Chargement en cours..." }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image 
          source={require('../assets/images/logo-maalem.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      
      {/* Loading Message */}
      <View style={styles.contentContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  contentContainer: {
    alignItems: 'center',
  },
  message: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default LoadingScreen;

import { Platform } from 'react-native';

// Mock Firebase for Expo Go (web/native without native modules)
// In production build, this will use the real @react-native-firebase/auth

let auth: any;
let FirebaseAuthTypes: any;

// Check if we're in a native build with Firebase available
try {
  if (Platform.OS !== 'web') {
    const rnfb = require('@react-native-firebase/auth');
    auth = rnfb.default;
    FirebaseAuthTypes = rnfb.FirebaseAuthTypes;
  }
} catch (e) {
  console.warn('Firebase Auth not available, using mock implementation');
}

// Mock implementation for Expo Go
const mockAuth = {
  currentUser: null,
  onAuthStateChanged: (callback: any) => {
    callback(null);
    return () => {};
  },
  createUserWithEmailAndPassword: async (email: string, password: string) => {
    console.log('Mock: createUserWithEmailAndPassword', email);
    return {
      user: {
        uid: 'mock-uid-' + Date.now(),
        email,
        displayName: null,
        updateProfile: async () => {},
      },
    };
  },
  signInWithEmailAndPassword: async (email: string, password: string) => {
    console.log('Mock: signInWithEmailAndPassword', email);
    return {
      user: {
        uid: 'mock-uid',
        email,
        displayName: null,
      },
    };
  },
  signOut: async () => {
    console.log('Mock: signOut');
  },
  sendPasswordResetEmail: async (email: string) => {
    console.log('Mock: sendPasswordResetEmail', email);
  },
};

const firebaseAuth = auth || mockAuth;

/**
 * Firebase Authentication Service
 * Uses native React Native Firebase SDK when available, falls back to mock for Expo Go
 */

// Get current user
export const getCurrentUser = () => {
  return firebaseAuth.currentUser;
};

// Listen to auth state changes
export const onAuthStateChanged = (callback: any) => {
  return firebaseAuth.onAuthStateChanged(callback);
};

// Create user with email and password
export const createUserWithEmailAndPassword = async (email: string, password: string) => {
  return await firebaseAuth.createUserWithEmailAndPassword(email, password);
};

// Sign in with email and password
export const signInWithEmailAndPassword = async (email: string, password: string) => {
  return await firebaseAuth.signInWithEmailAndPassword(email, password);
};

// Sign out
export const signOut = async () => {
  return await firebaseAuth.signOut();
};

// Update user profile
export const updateUserProfile = async (displayName?: string, photoURL?: string) => {
  const user = firebaseAuth.currentUser;
  if (user && user.updateProfile) {
    await user.updateProfile({ displayName, photoURL });
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (email: string) => {
  return await firebaseAuth.sendPasswordResetEmail(email);
};

export default firebaseAuth;

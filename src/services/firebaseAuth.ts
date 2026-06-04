import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

type AuthUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  mode: 'client' | 'worker';
  phone?: string;
  technicianProfile?: Record<string, unknown> & {
    isWorkerMode?: boolean;
    sold?: number;
    freeMissionCount?: number;
    freeMissionMonth?: number;
    freeMissionYear?: number;
    remainingFreeMissions?: number;
  } | null;
};

type Session = {
  token: string;
  user: AuthUser;
};

const SESSION_KEY = '@maalem_session';

let currentSession: Session | null = null;
const listeners = new Set<(user: AuthUser | null) => void>();

const loadSession = async () => {
  if (currentSession) return currentSession;
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  
  const session = JSON.parse(raw) as Session;
  
  // Validate that cached user still exists in database
  if (session?.token && session?.user?.id) {
    try {
      const response = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      
      if (!response.data || !response.data.id) {
        console.log('🗑️ Cached user no longer exists in database, clearing session');
        await AsyncStorage.removeItem(SESSION_KEY);
        return null;
      }
      
      // Update cached session with fresh data
      currentSession = {
        token: session.token,
        user: response.data
      };
      return currentSession;
    } catch (error) {
      console.log('❌ Failed to validate cached session, clearing cache');
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
  }
  
  currentSession = session;
  return currentSession;
};

const persistSession = async (session: Session | null) => {
  currentSession = session;
  if (session) {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
  listeners.forEach((listener) => listener(session?.user ?? null));
};

export const getCurrentUser = () => currentSession?.user ?? null;

// Simple mode logic using user.mode field
export const getUserMode = (user: AuthUser | null): 'client' | 'worker' => {
  if (!user) return 'client';
  
  // Use the explicit mode field from backend
  return user.mode === 'worker' ? 'worker' : 'client';
};

export const isWorkerMode = async (): Promise<boolean> => {
  const user = await getSessionUser();
  return getUserMode(user) === 'worker';
};

export const isClientMode = async (): Promise<boolean> => {
  const user = await getSessionUser();
  return getUserMode(user) === 'client';
};

export const onAuthStateChanged = (callback: (user: AuthUser | null) => void) => {
  loadSession().then((session) => callback(session?.user ?? null));
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

export const createUserWithEmailAndPassword = async (
  email: string,
  password: string,
  fullName?: string,
  phone?: string
) => {
  const response = await api.post('/api/auth/register', {
    fullName: fullName || email.split('@')[0],
    email,
    password,
    role: 'CLIENT',
    ...(phone ? { phone } : {}),
  });

  const session: Session = {
    token: response.data.token,
    user: response.data.user,
  };
  await persistSession(session);

  return { user: { uid: String(session.user.id), email: session.user.email, displayName: session.user.fullName } };
};

export const createUserProfileRecord = async (_userData: {
  uid: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
}) => {
  return;
};

export const signInWithEmailAndPassword = async (email: string, password: string) => {
  const response = await api.post('/api/auth/login', { email, password });
  
  // Validate that user exists in database
  if (!response.data.user || !response.data.user.id) {
    throw new Error('User not found in database. Please register or contact support.');
  }
  
  const session: Session = {
    token: response.data.token,
    user: response.data.user,
  };
  await persistSession(session);
  return { user: { uid: String(session.user.id), email: session.user.email, displayName: session.user.fullName } };
};

export const promoteCurrentUserToTechnician = async (payload: {
  bio?: string;
  skillsText?: string;
  radiusKm?: number;
  latitude?: number;
  longitude?: number;
  isAvailable?: boolean;
}) => {
  const session = await loadSession();
  if (!session?.token) {
    throw new Error('No authenticated session found.');
  }

  const response = await api.put('/api/auth/me/role', payload ?? {}, {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  const refreshedMe = await api.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${response.data.token || session.token}`,
    },
  });

  console.log('[auth] technician promotion result', {
    role: refreshedMe.data?.role,
    hasTechnicianProfile: !!refreshedMe.data?.technicianProfile,
    tokenReturned: !!response.data?.token,
  });

  const nextSession: Session = {
    token: response.data.token || session.token,
    user: refreshedMe.data,
  };
  await persistSession(nextSession);

  return {
    ...response.data,
    user: refreshedMe.data,
  };
};

export const signOut = async () => {
  await persistSession(null);
};

export const updateUserProfile = async (_displayName?: string, _photoURL?: string) => {
  return;
};

export const sendPasswordResetEmailToUser = async (_email: string) => {
  throw new Error('Password reset is not implemented by the current backend.');
};

export const getAuthToken = async () => {
  const session = await loadSession();
  return session?.token ?? null;
};

export const getSessionUser = async () => {
  const session = await loadSession();
  return session?.user ?? null;
};

export const getCurrentUserId = async () => {
  const session = await loadSession();
  return session?.user?.id?.toString() ?? null;
};

export const refreshSessionUser = async () => {
  const session = await loadSession();
  if (!session?.token) {
    return null;
  }

  const response = await api.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  let userData = response.data;
  
  // Validate that user exists in database
  if (!userData || !userData.id) {
    console.error('❌ User not found in database');
    await persistSession(null); // Clear invalid session
    throw new Error('User not found in database. Please register or contact support.');
  }

  // Always fetch latest technician profile for verification status
  if (userData?.role === 'TECHNICIAN') {
    console.log('🔄 Fetching latest technician profile for verification status...');
    try {
      const profileResponse = await api.get('/api/technician/me', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      
      if (profileResponse.data) {
        userData = {
          ...userData,
          technicianProfile: profileResponse.data,
        };
        console.log('✅ Latest technician profile fetched');
        console.log('Technician profile verification status:', profileResponse.data?.isVerified);
      }
    } catch (profileError) {
      console.warn('❌ Failed to fetch technician profile:', profileError);
      // Don't throw error, continue with user data without profile
    }
  }

  const nextSession: Session = {
    token: session.token,
    user: userData,
  };
  await persistSession(nextSession);

  return nextSession.user;
};

export const setTechnicianWorkerMode = async (isWorkerMode: boolean) => {
  const session = await loadSession();
  if (!session?.token) {
    throw new Error('No authenticated session found.');
  }

  const response = await api.put(
    '/api/technician/profile/mode',
    { isWorkerMode },
    {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    }
  );

  const refreshedMe = await api.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  const nextSession: Session = {
    token: session.token,
    user: refreshedMe.data,
  };
  await persistSession(nextSession);

  return {
    ...response.data,
    user: refreshedMe.data,
  };
};

export default {
  currentUser: currentSession?.user ?? null,
};

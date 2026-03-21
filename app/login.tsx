import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { createUserWithEmailAndPassword, updateUserProfile } from '@/src/services/firebaseAuth';

export default function LoginScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Register form state
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [email, setEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const handleLogin = () => {
    // TODO: Implement actual authentication
    console.log('Login with:', phone, password);
    // Navigate to main app after successful login
    router.replace('/(tabs)');
  };

  const handleRegister = async () => {
    try {
      // Validate inputs
      if (!nom || !prenom || !registerPhone || !email || !registerPassword) {
        Alert.alert('Erreur', 'Veuillez remplir tous les champs');
        return;
      }
      
      if (registerPassword.length < 6) {
        Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
        return;
      }

      // Create user with Firebase
      const userCredential = await createUserWithEmailAndPassword(email, registerPassword);
      
      // Update user profile with display name
      await updateUserProfile(`${prenom} ${nom}`);
      
      console.log('User registered successfully:', userCredential.user.uid);
      Alert.alert('Succès', 'Compte créé avec succès !');
      
      // Navigate to main app after successful registration
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMessage = 'Une erreur est survenue lors de l\'inscription';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Cet email est déjà utilisé';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email invalide';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Mot de passe trop faible';
      }
      
      Alert.alert('Erreur', errorMessage);
    }
  };

  const handleGoogleLogin = () => {
    console.log('Google login');
  };

  const handleAppleLogin = () => {
    console.log('Apple login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="#1a1a2e" />
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <Feather name="zap" size={20} color="#fff" />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {activeTab === 'login' ? 'Bon retour !' : 'Créer un compte'}
        </Text>
        <Text style={styles.subtitle}>
          {activeTab === 'login'
            ? 'Connectez-vous pour gérer vos\ndemandes.'
            : 'Inscrivez-vous pour trouver des\nartisans qualifiés.'}
        </Text>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'login' && styles.activeTab]}
            onPress={() => setActiveTab('login')}>
            <Text style={[styles.tabText, activeTab === 'login' && styles.activeTabText]}>
              Connexion
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'register' && styles.activeTab]}
            onPress={() => setActiveTab('register')}>
            <Text style={[styles.tabText, activeTab === 'register' && styles.activeTabText]}>
              Inscription
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {activeTab === 'login' ? (
            // Login Form
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Numéro de téléphone</Text>
                <View style={styles.inputContainer}>
                  <Feather name="phone" size={18} color="#9ca3af" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="06 XX XX XX XX"
                    placeholderTextColor="#9ca3af"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mot de passe</Text>
                <View style={styles.inputContainer}>
                  <Feather name="lock" size={18} color="#9ca3af" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                <Text style={styles.loginButtonText}>Se connecter</Text>
                <Feather name="chevron-right" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            // Register Form
            <>
              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Nom</Text>
                  <View style={styles.inputContainer}>
                    <Feather name="user" size={18} color="#9ca3af" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Dupont"
                      placeholderTextColor="#9ca3af"
                      value={nom}
                      onChangeText={setNom}
                    />
                  </View>
                </View>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Prénom</Text>
                  <View style={styles.inputContainer}>
                    <Feather name="user" size={18} color="#9ca3af" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Jean"
                      placeholderTextColor="#9ca3af"
                      value={prenom}
                      onChangeText={setPrenom}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Numéro de téléphone</Text>
                <View style={styles.inputContainer}>
                  <Feather name="phone" size={18} color="#9ca3af" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="06 XX XX XX XX"
                    placeholderTextColor="#9ca3af"
                    keyboardType="phone-pad"
                    value={registerPhone}
                    onChangeText={setRegisterPhone}
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <Feather name="mail" size={18} color="#9ca3af" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="jean.dupont@email.com"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mot de passe</Text>
                <View style={styles.inputContainer}>
                  <Feather name="lock" size={18} color="#9ca3af" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showRegisterPassword}
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowRegisterPassword(!showRegisterPassword)}>
                    <Feather name={showRegisterPassword ? 'eye-off' : 'eye'} size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.loginButton} onPress={handleRegister}>
                <Text style={styles.loginButtonText}>S'inscrire</Text>
                <Feather name="chevron-right" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU CONTINUER AVEC</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social Login */}
        <View style={styles.socialButtons}>
          <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin}>
            <View style={styles.googleIcon}>
              <Text style={styles.googleText}>G</Text>
            </View>
            <Text style={styles.socialButtonText}>Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton} onPress={handleAppleLogin}>
            <View style={styles.appleIcon}>
              <Ionicons name="logo-apple" size={18} color="#fff" />
            </View>
            <Text style={styles.socialButtonText}>Apple</Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          En continuant, vous acceptez nos{' '}
          <Text style={styles.termsLink}>Conditions{'\n'}d'Utilisation</Text> et notre{' '}
          <Text style={styles.termsLink}>Politique de Confidentialité</Text>.
        </Text>

        {/* Bottom Logo */}
       
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    lineHeight: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#1e40af',
    fontWeight: '600',
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a2e',
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e40af',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 12,
    color: '#9ca3af',
    marginHorizontal: 12,
    fontWeight: '500',
  },
  socialButtons: {
    gap: 12,
    marginBottom: 24,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ea4335',
  },
  appleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  termsText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  termsLink: {
    color: '#1e40af',
    textDecorationLine: 'underline',
  },
  bottomLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  madeWith: {
    fontSize: 12,
    color: '#9ca3af',
  },
  visilyLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  visilyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
});

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "@/src/services/firebaseAuth";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register form state
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [email, setEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(loginEmail.trim(), password);
      
      // Refresh user data from backend to get latest verification status
      const { refreshSessionUser } = await import('@/src/services/firebaseAuth');
      const user = await refreshSessionUser();
      
      if (user && user.role === 'TECHNICIAN') {
        // Check if technician is verified from backend
        // The backend returns TechnicianProfile (capital T) directly
        const isVerified = (user as any)?.TechnicianProfile?.isVerified;
        
        if (isVerified === true) {
          console.log('✅ Verified technician - redirecting to worker-map');
          router.replace("/worker-map");
        } else {
          console.log('❌ Unverified technician - redirecting to verification');
          router.replace("/worker-registration");
        }
      } else if (user && user.role === 'CLIENT') {
        console.log('Redirecting client to map');
        router.replace("/map");
      } else {
        console.log('Unknown user role, redirecting to map');
        router.replace("/map");
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      
      // Handle timeout errors specifically
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        setAuthError("Le serveur met trop de temps à répondre. Veuillez réessayer.");
      } else {
        const status = error?.response?.status;
        if (status === 400) {
          setAuthError("Adresse email ou mot de passe invalide.");
        } else if (error?.response) {
          setAuthError("Erreur serveur. Veuillez réessayer plus tard.");
        } else {
          setAuthError("Erreur de connexion. Vérifiez votre réseau.");
        }
      }
    }
  };

  const handleRegister = async () => {
    setAuthError(null);
    try {
      const fullName = `${prenom.trim()} ${nom.trim()}`.trim();
      console.log('Registering user:', { email: email.trim(), fullName, phone: registerPhone.trim() });
      
      await createUserWithEmailAndPassword(
        email.trim(),
        registerPassword,
        fullName,
        registerPhone.trim() || undefined
      );
      
      console.log('Registration successful, redirecting to map');
      router.replace("/map");
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Error response:', error?.response?.data);
      console.error('Error status:', error?.response?.status);
      
      // Handle timeout errors specifically
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        setAuthError("Le serveur met trop de temps à répondre. Veuillez réessayer.");
      } else {
        const status = error?.response?.status;
        if (status === 400 && /email/i.test(error?.response?.data?.message || "")) {
          setAuthError("Cette adresse email est déjà utilisée ou invalide.");
        } else if (status === 400) {
          setAuthError("Impossible de créer le compte. Vérifiez les champs.");
        } else if (error?.response) {
          setAuthError("Erreur serveur. Veuillez réessayer plus tard.");
        } else {
          setAuthError("Erreur de connexion. Vérifiez votre réseau.");
        }
      }
      console.error("Registration failed:", error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={24} color="#1a1a2e" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/logo-M.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {activeTab === "login" ? "Bon retour !" : "Créer un compte"}
        </Text>
        <Text style={styles.subtitle}>
          {activeTab === "login"
            ? "Connectez-vous pour gérer vos\ndemandes."
            : "Inscrivez-vous pour trouver des\nartisans qualifiés."}
        </Text>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "login" && styles.activeTab]}
            onPress={() => setActiveTab("login")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "login" && styles.activeTabText,
              ]}
            >
              Connexion
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "register" && styles.activeTab]}
            onPress={() => setActiveTab("register")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "register" && styles.activeTabText,
              ]}
            >
              Inscription
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {authError ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color="#b91c1c" />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          ) : null}

          {activeTab === "login" ? (
            // Login Form
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <Feather
                    name="mail"
                    size={18}
                    color="#9ca3af"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="vous@email.com"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mot de passe</Text>
                <View style={styles.inputContainer}>
                  <Feather
                    name="lock"
                    size={18}
                    color="#9ca3af"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPassword}
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color="#9ca3af"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>
                  Mot de passe oublié ?
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
              >
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
                    <Feather
                      name="user"
                      size={18}
                      color="#9ca3af"
                      style={styles.inputIcon}
                    />
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
                    <Feather
                      name="user"
                      size={18}
                      color="#9ca3af"
                      style={styles.inputIcon}
                    />
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
                  <Feather
                    name="phone"
                    size={18}
                    color="#9ca3af"
                    style={styles.inputIcon}
                  />
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
                  <Feather
                    name="mail"
                    size={18}
                    color="#9ca3af"
                    style={styles.inputIcon}
                  />
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
                  <Feather
                    name="lock"
                    size={18}
                    color="#9ca3af"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showRegisterPassword}
                    autoCorrect={false}
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() =>
                      setShowRegisterPassword(!showRegisterPassword)
                    }
                  >
                    <Feather
                      name={showRegisterPassword ? "eye-off" : "eye"}
                      size={18}
                      color="#9ca3af"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleRegister}
              >
                <Text style={styles.loginButtonText}>S&apos;inscrire</Text>
                <Feather name="chevron-right" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          En continuant, vous acceptez nos{" "}
          <Text style={styles.termsLink}>Conditions{"\n"}d&apos;Utilisation</Text> et
          notre{" "}
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
    backgroundColor: "#f8f9fa",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    width: 84,
    height: 84,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    resizeMode: "cover",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    lineHeight: 24,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "#1e40af",
    fontWeight: "600",
  },
  form: {
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#991b1b",
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1a1a2e",
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  eyeIcon: {
    padding: 8,
    marginLeft: 8,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: "#1e40af",
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  termsText: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  termsLink: {
    color: "#1e40af",
    textDecorationLine: "underline",
  },
  bottomLogo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  madeWith: {
    fontSize: 12,
    color: "#9ca3af",
  },
  visilyLogo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  visilyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6366f1",
  },
});

import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
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

import IdentityVerification from "@/components/IdentityVerification";
import { getCategories } from "@/src/services/categoryService";
import {
  getSessionUser,
  refreshSessionUser,
} from "@/src/services/firebaseAuth";
import { useRouter } from "expo-router";

const { width, height } = Dimensions.get("window");

type ServiceCategory = {
  id: number;
  name: string;
  description?: string | null;
};

const FALLBACK_SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 1, name: "Réparation" },
  { id: 2, name: "Électricité" },
  { id: 3, name: "Climatisation" },
  { id: 4, name: "Plomberie" },
  { id: 5, name: "Nettoyage" },
  { id: 6, name: "Menuiserie" },
  { id: 7, name: "Peinture" },
  { id: 8, name: "Jardinage" },
];

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  // French (normalized)
  reparation: "tool",
  electricite: "zap",
  climatisation: "wind",
  plomberie: "droplet",
  nettoyage: "home",
  menuiserie: "box",
  peinture: "image",
  jardinage: "sun",

  // Common English synonyms (normalized)
  repair: "tool",
  maintenance: "tool",
  electrician: "zap",
  electricity: "zap",
  hvac: "wind",
  ac: "wind",
  plumbing: "droplet",
  cleaning: "home",
  carpentry: "box",
  woodworking: "box",
  painting: "image",
  gardener: "sun",
  gardening: "sun",
};

// Experience levels
const EXPERIENCE_LEVELS = [
  { id: "beginner", label: "Débutant", years: "0-2 ans" },
  { id: "intermediate", label: "Intermédiaire", years: "2-5 ans" },
  { id: "expert", label: "Expert", years: "5+ ans" },
];

export default function WorkerRegistrationScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(
    [],
  );

  // Step 1: Experience & Speciality
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [experienceLevel, setExperienceLevel] = useState<string>("");
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  // Step 2: KYC - Identity Verification
  const [isVerified, setIsVerified] = useState(false);

  // Animation for step transition
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const guardExistingTechnician = async () => {
      try {
        const user = (await refreshSessionUser()) || (await getSessionUser());
        if (
          user?.role === "TECHNICIAN" &&
          (user as any)?.TechnicianProfile?.isVerified === true
        ) {
          router.replace("/worker-map");
        }
      } catch (error) {
        // guardExistingTechnician error handled silently
      }
    };

    guardExistingTechnician();
  }, [router]);

  const normalizeCategoryKey = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

  const getCategoryIcon = (name: string) => {
    const key = normalizeCategoryKey(name);
    return CATEGORY_ICONS[key] || "tool";
  };

  const getSelectedCategory = () =>
    (serviceCategories.length > 0
      ? serviceCategories
      : FALLBACK_SERVICE_CATEGORIES
    ).find((category) => String(category.id) === selectedCategory);

  const getSelectedCategoryLabel = () =>
    getSelectedCategory()?.name || "Technicien";

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await getCategories();
        setServiceCategories(
          Array.isArray(categories) && categories.length > 0
            ? categories
            : FALLBACK_SERVICE_CATEGORIES,
        );
      } catch (error) {
        console.error("Error loading service categories:", error);
        setServiceCategories(FALLBACK_SERVICE_CATEGORIES);
      }
    };

    loadCategories();
  }, []);

  const animateToStep = (step: number) => {
    const direction = step > currentStep ? 1 : -1;

    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -width * direction,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: width * direction,
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    setCurrentStep(step);
  };

  const validateStep1 = () => {
    if (!selectedCategory) {
      Alert.alert(
        "Information manquante",
        "Veuillez sélectionner une spécialité.",
      );
      return false;
    }
    if (!experienceLevel) {
      Alert.alert(
        "Information manquante",
        "Veuillez sélectionner votre niveau d'expérience.",
      );
      return false;
    }
    if (!bio.trim()) {
      Alert.alert(
        "Information manquante",
        "Veuillez décrire votre expérience.",
      );
      return false;
    }
    if (!hourlyRate.trim()) {
      Alert.alert(
        "Information manquante",
        "Veuillez indiquer votre tarif horaire.",
      );
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    // Allow verification without photos for testing
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      animateToStep(2);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) {
      animateToStep(1);
    } else {
      router.push("/map");
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      <View style={styles.stepRow}>
        <View
          style={[
            styles.stepCircle,
            currentStep >= 1 && styles.stepCircleActive,
          ]}
        >
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 1 && styles.stepNumberActive,
            ]}
          >
            1
          </Text>
        </View>
        <View
          style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]}
        />
        <View
          style={[
            styles.stepCircle,
            currentStep >= 2 && styles.stepCircleActive,
          ]}
        >
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 2 && styles.stepNumberActive,
            ]}
          >
            2
          </Text>
        </View>
      </View>
      <View style={styles.stepLabels}>
        <Text
          style={[
            styles.stepLabel,
            currentStep === 1 && styles.stepLabelActive,
          ]}
        >
          Expérience
        </Text>
        <Text
          style={[
            styles.stepLabel,
            currentStep === 2 && styles.stepLabelActive,
          ]}
        >
          Vérification KYC
        </Text>
      </View>
    </View>
  );

  const renderStep1 = () => (
    <Animated.View
      style={[styles.stepContent, { transform: [{ translateX: slideAnim }] }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Speciality Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Votre spécialité *</Text>
          <View style={styles.categoriesGrid}>
            {(serviceCategories.length > 0
              ? serviceCategories
              : FALLBACK_SERVICE_CATEGORIES
            ).map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryCard,
                  selectedCategory === String(category.id) &&
                    styles.categoryCardActive,
                ]}
                onPress={() => setSelectedCategory(String(category.id))}
              >
                <View
                  style={[
                    styles.categoryIconContainer,
                    selectedCategory === String(category.id) &&
                      styles.categoryIconContainerActive,
                  ]}
                >
                  <Feather
                    name={getCategoryIcon(category.name)}
                    size={22}
                    color={
                      selectedCategory === String(category.id)
                        ? "#fff"
                        : "#1e40af"
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.categoryName,
                    selectedCategory === String(category.id) &&
                      styles.categoryNameActive,
                  ]}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Experience Level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Niveau d'expérience *</Text>
          <View style={styles.experienceContainer}>
            {EXPERIENCE_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.experienceCard,
                  experienceLevel === level.id && styles.experienceCardActive,
                ]}
                onPress={() => setExperienceLevel(level.id)}
              >
                <Text
                  style={[
                    styles.experienceLabel,
                    experienceLevel === level.id &&
                      styles.experienceLabelActive,
                  ]}
                >
                  {level.label}
                </Text>
                <Text
                  style={[
                    styles.experienceYears,
                    experienceLevel === level.id &&
                      styles.experienceYearsActive,
                  ]}
                >
                  {level.years}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Décrivez votre expérience *</Text>
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="Décrivez votre parcours, vos compétences et vos réalisations..."
              placeholderTextColor="#9ca3af"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Hourly Rate */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tarif horaire (DH) *</Text>
          <View style={styles.inputContainer}>
            <Feather
              name="dollar-sign"
              size={20}
              color="#9ca3af"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Ex: 150"
              placeholderTextColor="#9ca3af"
              value={hourlyRate}
              onChangeText={setHourlyRate}
              keyboardType="numeric"
            />
            <Text style={styles.currencyLabel}>DH/heure</Text>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View
      style={[styles.stepContent, { transform: [{ translateX: slideAnim }] }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <IdentityVerification
          onVerificationComplete={(verified: boolean) => {
            setIsVerified(verified);
            if (verified) {
              // Redirect directly to worker map after verification
              router.replace("/worker-map");
            }
          }}
          isVerified={isVerified}
        />
      </ScrollView>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Feather name="arrow-left" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo-maalem.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Content */}
      <View style={styles.content}>
        {currentStep === 1 ? renderStep1() : renderStep2()}
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {currentStep === 1 ? (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Continuer</Text>
            <Feather name="arrow-right" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.step2Actions}>
            <TouchableOpacity
              style={styles.backStepButton}
              onPress={handleBack}
            >
              <Feather name="arrow-left" size={20} color="#374151" />
              <Text style={styles.backStepButtonText}>Retour</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  placeholder: {
    width: 44,
  },
  stepIndicator: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: {
    backgroundColor: "#1e40af",
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  stepNumberActive: {
    color: "#fff",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
    maxWidth: 100,
  },
  stepLineActive: {
    backgroundColor: "#1e40af",
  },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 20,
  },
  stepLabel: {
    fontSize: 12,
    color: "#6b7280",
    flex: 1,
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#1e40af",
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryCard: {
    width: (width - 52) / 4,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  categoryCardActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#1e40af",
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryIconContainerActive: {
    backgroundColor: "#1e40af",
  },
  categoryName: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
  },
  categoryNameActive: {
    color: "#1e40af",
    fontWeight: "600",
  },
  experienceContainer: {
    flexDirection: "row",
    gap: 10,
  },
  experienceCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  experienceCardActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#1e40af",
  },
  experienceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  experienceLabelActive: {
    color: "#1e40af",
  },
  experienceYears: {
    fontSize: 12,
    color: "#6b7280",
  },
  experienceYearsActive: {
    color: "#1e40af",
  },
  textAreaContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
  },
  textArea: {
    fontSize: 14,
    color: "#1a1a2e",
    minHeight: 100,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1a1a2e",
  },
  currencyLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  kycHeader: {
    alignItems: "center",
    marginBottom: 24,
    paddingVertical: 16,
  },
  kycTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1a1a2e",
    marginTop: 12,
    marginBottom: 8,
  },
  kycDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  uploadCard: {
    height: 160,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#dbeafe",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  selfieCard: {
    height: 200,
  },
  uploadIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  selfieIconContainer: {
    backgroundColor: "#d1fae5",
  },
  uploadText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 4,
  },
  uploadHint: {
    fontSize: 13,
    color: "#6b7280",
  },
  uploadedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  selfieImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  changePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
  },
  changePhotoText: {
    fontSize: 14,
    color: "#1e40af",
    fontWeight: "500",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 24,
    gap: 10,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  bottomActions: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
    paddingVertical: 16,
    borderRadius: 12,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  step2Actions: {
    flexDirection: "row",
    gap: 12,
  },
  backStepButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f3f4f6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
  },
  backStepButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
});

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import RatingScreen from "@/app/rating-screen";
import api from "@/src/services/api";
import { getCategories } from "@/src/services/categoryService";
import { Demand, demandStorage } from "@/src/services/demandStorage";
import {
  getAuthToken,
  getSessionUser,
  refreshSessionUser,
  setTechnicianWorkerMode,
  signOut,
} from "@/src/services/firebaseAuth";
import { notificationService } from "@/src/services/notificationService";
import { getRequestById } from "@/src/services/orderService";
import { getMyRequests } from "@/src/services/reviewService";
import { WebView } from "react-native-webview";

// Define Region type
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const { width, height } = Dimensions.get("window");
const TOMTOM_API_KEY = "fNHGLTzpUrXxutlO1isAEKh8pNV1S645";

type ServiceCategory = {
  id: number;
  name: string;
  description?: string | null;
};

const buildAbsoluteUrl = (baseUrl: string, maybeRelative: string) => {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const value = String(maybeRelative || "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${base}/${value.replace(/^\/+/, "")}`;
};

const looksLikeApiHostedUrl = (baseUrl: string, url: string) => {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return false;
  return String(url || "").startsWith(base);
};

const CATEGORY_ICONS: { [key: string]: any } = {
  reparation: require("../assets/images/catmaalem/repar.png"),
  electricite: require("../assets/images/catmaalem/elec.png"),
  climatisation: require("../assets/images/catmaalem/clim.png"),
  plomberie: require("../assets/images/catmaalem/plom.png"),
  nettoyage: require("../assets/images/catmaalem/neto.png"),
  menuiserie: require("../assets/images/catmaalem/men.png"),
  peinture: require("../assets/images/catmaalem/pien.png"),
  jardinage: require("../assets/images/catmaalem/jard.png"),
};

const CATEGORY_ICONS_SELECTED: { [key: string]: any } = {
  reparation: require("../assets/images/catmaalem/repar1.png"),
  electricite: require("../assets/images/catmaalem/elec1.png"),
  climatisation: require("../assets/images/catmaalem/clim1.png"),
  plomberie: require("../assets/images/catmaalem/plom1.png"),
  nettoyage: require("../assets/images/catmaalem/neto1.png"),
  menuiserie: require("../assets/images/catmaalem/men1.png"),
  peinture: require("../assets/images/catmaalem/pien1.png"),
  jardinage: require("../assets/images/catmaalem/jard1.png"),
};

const normalizeCategoryKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

const getCategoryIcon = (name: string) =>
  CATEGORY_ICONS[normalizeCategoryKey(name)] ||
  require("../assets/images/catmaalem/repar.png");

// Quick suggestions (French)
const QUICK_SUGGESTIONS = [
  "Clim ne refroidit pas",
  "Coupure de courant",
  "Fuite d'eau",
  "Installer des lumières",
  "Serrure cassée",
];

// Mock service providers data
const SERVICE_PROVIDERS = [
  {
    id: "1",
    name: "Many Service Technicians",
    type: "electrician",
    latitude: 33.5731,
    longitude: -7.5898,
    icon: "zap",
    color: "#3b82f6",
  },
  {
    id: "2",
    name: "Fikra Services",
    type: "plumber",
    latitude: 33.5831,
    longitude: -7.5998,
    icon: "water",
    color: "#06b6d4",
  },
  {
    id: "3",
    name: "Nearby Service Requests",
    type: "request",
    latitude: 33.5631,
    longitude: -7.5798,
    icon: "map-pin",
    color: "#ef4444",
  },
  {
    id: "4",
    name: "Terra Services",
    type: "request",
    latitude: 33.5931,
    longitude: -7.6098,
    icon: "map-pin",
    color: "#ef4444",
  },
];

// Job card data - disabled
// const JOB_CARD = {
//   title: 'Installation Disjoncteur',
//   location: 'Quartier Gauthier, Casablanca',
//   distance: '0.8 km',
//   price: '350 DH',
//   applicants: 3,
// };

export default function MapScreen() {
  const router = useRouter();
  const debugLoggedProfileRef = useRef(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const tripAutoFitArmedRef = useRef(false);

  // Bottom drawer state
  const [selectedCategory, setSelectedCategory] =
    useState<ServiceCategory | null>(null);
  const [problemDescription, setProblemDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(
    [],
  );
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Saved request state
  const [savedRequest, setSavedRequest] = useState<{
    orderId?: string;
    category: ServiceCategory | null;
    categoryName: string;
    description: string;
    budget: string;
    images: string[];
    location: { latitude: number; longitude: number } | null;
    timestamp: number;
  } | null>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [resolvedOfferProfilePictures, setResolvedOfferProfilePictures] =
    useState<Record<string, string>>({});
  const [acceptedOfferId, setAcceptedOfferId] = useState<string | null>(null);
  const [assignedWorkerId, setAssignedWorkerId] = useState<string | null>(null);
  const [assignedWorkerDetails, setAssignedWorkerDetails] = useState<any>(null);
  const [resolvedWorkerProfilePicture, setResolvedWorkerProfilePicture] =
    useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const completionPromptedRef = useRef<string | null>(null);
  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("utilisateur@email.com");

  // Notification state
  const [notificationCount, setNotificationCount] = useState(0);

  // Side menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const menuAnimation = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    if (!authToken) return;
    if (!offers || offers.length === 0) return;

    let cancelled = false;
    const baseUrl = String(api.defaults.baseURL || "");

    const resolveOfferImages = async () => {
      try {
        const next: Record<string, string> = {};

        for (const offer of offers) {
          const offerId = String(offer?.id ?? "");
          if (!offerId) continue;

          const technicianData =
            offer?.technician || offer?.User || offer?.user;
          const raw = String(technicianData?.profilePicture || "").trim();
          if (!raw) continue;

          const initial = buildAbsoluteUrl(baseUrl, raw);
          const candidates = [initial].filter(Boolean);

          let resolved = candidates[0];

          // Probe candidates (HEAD then GET). Some servers don't support HEAD.
          for (const url of candidates) {
            const needsAuth = looksLikeApiHostedUrl(baseUrl, url);
            const headers: Record<string, string> = { Accept: "image/*" };
            if (needsAuth) headers.Authorization = `Bearer ${authToken}`;

            try {
              const head = await fetch(url, { method: "HEAD", headers });
              const contentType = head.headers.get("content-type") || "";
              if (head.ok && contentType.startsWith("image/")) {
                resolved = url;
                break;
              }
              const get = await fetch(url, { method: "GET", headers });
              const getType = get.headers.get("content-type") || "";
              if (get.ok && getType.startsWith("image/")) {
                resolved = url;
                break;
              }
            } catch {
              // Ignore probe errors; we'll keep trying other candidates.
            }
          }

          next[offerId] = resolved;
          if (__DEV__ && resolved !== candidates[0]) {
            console.log("🖼️ [technician-image] resolved offer avatar:", {
              offerId,
              rawProfilePicture: raw,
              initial: candidates[0],
              resolved,
            });
          }
        }

        if (!cancelled) {
          setResolvedOfferProfilePictures((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // Ignore; image resolution should never break the screen.
      }
    };

    resolveOfferImages();
    return () => {
      cancelled = true;
    };
  }, [offers, authToken]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await getCategories();
        const loadedCategories = Array.isArray(categories) ? categories : [];
        setServiceCategories(loadedCategories);
        setSelectedCategory(
          (current) => current || loadedCategories[0] || null,
        );
      } catch (error) {
        console.error("Error loading categories:", error);
      }
    };

    loadCategories();
  }, []);

  // Menu animation functions
  const openMenu = () => {
    setMenuVisible(true);
    Animated.spring(menuAnimation, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  const closeMenu = () => {
    Animated.spring(menuAnimation, {
      toValue: -width,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start(() => {
      setMenuVisible(false);
    });
  };

  // Handle publish request
  const fetchOffers = async (requestId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      // Prime session info (no noisy logs during polling)
      await getSessionUser();

      let response;
      let offers = [];

      try {
        // Try the direct offers endpoint first
        response = await api.get(`/api/offers/request/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        let rawOffers = response.data || [];
        // No noisy logs (this runs during polling)

        // Fetch detailed technician profiles using the new endpoint
        offers = await Promise.all(
          rawOffers.map(async (offer: any) => {
            try {
              // Fetch detailed technician profile using the new endpoint
              const techResponse = await api.get(
                `/api/technician/${offer.technicianId}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );

              const technicianProfile = techResponse.data;
              // Combine offer data with detailed technician profile
              return {
                ...offer,
                technician: {
                  id: technicianProfile.id,
                  fullName:
                    technicianProfile.fullName ||
                    technicianProfile.name ||
                    "Technicien",
                  phone: technicianProfile.phone || "",
                  averageRating: technicianProfile.averageRating || 0,
                  completedMissions: technicianProfile.completedMissions || 0,
                  profilePicture: technicianProfile.profilePicture,
                },
              };
            } catch {
              // Fallback to basic technician data from offer response
              const technicianData =
                offer.technician || offer.User || offer.user || {};
              return {
                ...offer,
                technician: {
                  id: offer.technicianId,
                  fullName:
                    technicianData.fullName ||
                    technicianData.name ||
                    "Technicien",
                  phone: technicianData.phone || "",
                  averageRating:
                    technicianData.averageRating || technicianData.rating || 0,
                  completedMissions:
                    technicianData.completedMissions ||
                    technicianData.missionsCount ||
                    0,
                  profilePicture: technicianData.profilePicture,
                },
              };
            }
          }),
        );
      } catch (offersError: any) {
        console.error("❌ Failed to fetch offers:", offersError);
        // Don't use fake data - let the error propagate so we can debug the real API
        throw offersError;
      }
      // Filter out refused and canceled offers to only show active ones
      const activeOffers = (offers || []).filter(
        (offer: any) =>
          offer.status !== "REFUSED" && offer.status !== "CANCELLED",
      );

      // Check for auto-acceptance offers (offers at original price)
      if (activeOffers.length > 0 && savedRequest) {
        const originalBudget = savedRequest.budget
          ? parseInt(savedRequest.budget.toString())
          : 0;

        for (const offer of activeOffers) {
          if (offer.status === "PENDING" && offer.price === originalBudget) {
            // Auto-accept the offer
            try {
              await api.put(
                `/api/offers/${offer.id}/accept`,
                {},
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );

              setAcceptedOfferId(String(offer.id));
              const techId =
                offer?.technicianId ?? offer?.technician?.id ?? null;
              if (techId != null) {
                setAssignedWorkerId(String(techId));
              }

              // Show notification to client
              Alert.alert(
                "Mission acceptée automatiquement !",
                `Le technicien a accepté le prix original (${offer.price} DH). La mission commence maintenant.`,
                [
                  {
                    text: "OK",
                    onPress: () => {
                      // Refresh offers to update the UI
                      fetchOffers(requestId);
                    },
                  },
                ],
              );

              // Update active order
              if (savedRequest?.orderId) {
                const updatedOrder = await getRequestById(
                  savedRequest.orderId,
                  token,
                );
                setActiveOrder(updatedOrder);
              }

              break; // Only auto-accept one offer per request
            } catch (acceptError) {
              console.error("❌ Failed to auto-accept offer:", acceptError);
            }
          }
        }
      }

      // Check if new offers were added to increment notification count
      const previousOfferCount = offers.length;
      setOffers(activeOffers);
      const newOfferCount = activeOffers.length;

      if (newOfferCount > previousOfferCount && previousOfferCount > 0) {
        const newOffersCount = newOfferCount - previousOfferCount;

        // Create notification for new offers
        try {
          await notificationService.addNotification(
            notificationService.createNewOfferNotification(newOffersCount),
          );
          setNotificationCount((prev) => prev + newOffersCount);
        } catch (error) {
          console.error("Error creating new offer notification:", error);
        }
      }
    } catch {
      // Silent: polling can trigger frequent retries
    }
  };

  const resolveSelectedOfferId = (order: any): string | null => {
    const candidate =
      order?.selectedOfferId ??
      order?.offerId ??
      order?.acceptedOfferId ??
      order?.activeOfferId ??
      null;
    return candidate != null ? String(candidate) : null;
  };

  const resolveAssignedWorkerId = (order: any): string | null => {
    const candidate =
      order?.workerId ??
      order?.technicianId ??
      order?.assignedWorkerId ??
      order?.assignedTechnicianId ??
      order?.technician?.id ??
      null;
    return candidate != null ? String(candidate) : null;
  };

  const isActiveTripStatus = (status: any) => {
    const s = String(status || "").toUpperCase();
    return (
      ["ASSIGNED", "IN_PROGRESS", "STARTED", "ONGOING", "ACCEPTED"].includes(
        s,
      ) && !["DONE", "COMPLETED", "CANCELLED"].includes(s)
    );
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await api.put(
        `/api/offers/${offerId}/accept`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      Alert.alert(
        "Succès",
        "L'offre a été acceptée. Le travailleur a été notifié.",
      );

      // Optimistically mark this offer as selected so the UI switches to trip mode immediately
      setAcceptedOfferId(String(offerId));
      setActiveOrder((prev: any) =>
        prev ? { ...prev, selectedOfferId: String(offerId) } : prev,
      );
      const localOffer = offers.find(
        (o: any) => String(o?.id) === String(offerId),
      );
      const localTechId =
        localOffer?.technicianId ?? localOffer?.technician?.id ?? null;
      if (localTechId != null) {
        setAssignedWorkerId(String(localTechId));
      }

      // Refresh the active order and offers
      if (savedRequest?.orderId) {
        const updatedOrder = await getRequestById(savedRequest.orderId, token);
        setActiveOrder(updatedOrder);
        await fetchOffers(savedRequest.orderId);
      }
    } catch (error: any) {
      console.error("Accept offer error:", error);
      // Handle the case where backend returns null but operation succeeds
      if (error?.response?.status === 200 || error?.response?.status === 204) {
        Alert.alert(
          "Succès",
          "L'offre a été acceptée. Le travailleur a été notifié.",
        );
        setAcceptedOfferId(String(offerId));
        setActiveOrder((prev: any) =>
          prev ? { ...prev, selectedOfferId: String(offerId) } : prev,
        );
        const localOffer = offers.find(
          (o: any) => String(o?.id) === String(offerId),
        );
        const localTechId =
          localOffer?.technicianId ?? localOffer?.technician?.id ?? null;
        if (localTechId != null) {
          setAssignedWorkerId(String(localTechId));
        }
        if (savedRequest?.orderId) {
          const token = await getAuthToken();
          if (token) {
            const updatedOrder = await getRequestById(
              savedRequest.orderId,
              token,
            );
            setActiveOrder(updatedOrder);
            await fetchOffers(savedRequest.orderId);
          }
        }
      } else {
        Alert.alert(
          "Erreur",
          error?.response?.data?.message || "Impossible d'accepter l'offre.",
        );
      }
    }
  };

  const handleRefuseOffer = async (offerId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      // Get session user for notification data
      const sessionUser = await getSessionUser();

      // Find the offer to get technician info for notification
      const offerToRefuse = offers.find((offer) => offer.id === offerId);

      // Immediately remove the offer from UI
      setOffers((prevOffers) =>
        prevOffers.filter((offer) => offer.id !== offerId),
      );

      const response = await api.put(
        `/api/offers/${offerId}/refuse`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("✅ Offer refused successfully:", {
        offerId,
        technicianId: offerToRefuse?.technicianId,
      });

      // Send notification to worker if we have technician info
      if (offerToRefuse?.technicianId || offerToRefuse?.technician?.id) {
        const technicianId =
          offerToRefuse?.technicianId || offerToRefuse?.technician?.id;
        try {
          console.log(
            "📱 Sending refusal notification to technician:",
            technicianId,
          );

          // Create a notification for the worker
          await api.post(
            "/api/notifications",
            {
              userId: technicianId,
              type: "offer_refused",
              title: "Offre refusée",
              message: `Votre offre pour la demande "${savedRequest?.categoryName || "service"}" a été refusée par le client.`,
              data: {
                offerId: offerId,
                requestId: savedRequest?.orderId,
                clientName: sessionUser?.fullName || "Client",
              },
            },
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          console.log("✅ Worker notification sent successfully");
        } catch (notificationError) {
          console.warn(
            "⚠️ Failed to send worker notification:",
            notificationError,
          );
          // Don't fail the whole operation if notification fails
        }
      }

      Alert.alert(
        "Succès",
        "L'offre a été refusée et le technicien a été notifié.",
      );

      // Refresh offers to ensure UI is in sync
      if (savedRequest?.orderId) {
        await fetchOffers(savedRequest.orderId);
      }
    } catch (error: any) {
      console.error("Refuse offer error:", error);
      // Handle the case where backend returns null but operation succeeds
      if (error?.response?.status === 200 || error?.response?.status === 204) {
        Alert.alert("Succès", "L'offre a été refusée.");
        // Already removed from UI above
      } else {
        Alert.alert(
          "Erreur",
          error?.response?.data?.message || "Impossible de refuser l'offre.",
        );
        // If error occurred, refresh offers to restore correct state
        if (savedRequest?.orderId) {
          await fetchOffers(savedRequest.orderId);
        }
      }
    }
  };

  const handlePublishRequest = async () => {
    if (!problemDescription.trim()) {
      Alert.alert("Information manquante", "Veuillez décrire votre problème.");
      return;
    }
    if (!location) {
      Alert.alert(
        "Localisation requise",
        "Nous avons besoin de votre position pour publier la demande.",
      );
      return;
    }

    const categoryInfo = selectedCategory;

    const newRequest = {
      category: selectedCategory,
      categoryName: categoryInfo?.name || "",
      description: problemDescription,
      budget: budget,
      images: uploadedImages,
      location: location
        ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }
        : null,
      timestamp: Date.now(),
    };

    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert("Session expirée", "Veuillez vous reconnecter.");
        router.replace("/login");
        return;
      }

      const sessionUser = await refreshSessionUser();

      // Use the simple user.mode field to check if user can publish requests
      if (sessionUser?.mode !== "client") {
        Alert.alert(
          "Mode travailleur actif",
          "Passez en mode client pour publier une demande.",
        );
        return;
      }

      // Create FormData for multipart/form-data
      const formData = new FormData();
      formData.append("categoryId", String(categoryInfo?.id || ""));
      formData.append("title", categoryInfo?.name || "");
      formData.append("description", newRequest.description);
      formData.append("budget", String(Number(budget) || 0));
      formData.append("latitude", String(location.coords.latitude));
      formData.append("longitude", String(location.coords.longitude));

      // Add images if any
      if (uploadedImages.length > 0) {
        for (let i = 0; i < uploadedImages.length; i++) {
          const imageUri = uploadedImages[i];
          const filename = imageUri.split("/").pop() || `image_${i}.jpg`;
          formData.append("images", {
            uri: imageUri,
            type: "image/jpeg",
            name: filename,
          } as any);
        }
      }

      const response = await api.post("/api/requests", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      const createdOrder = response.data;

      const demand: Demand = {
        id: Date.now().toString(),
        category: newRequest.category?.name || "",
        categoryName: newRequest.categoryName,
        description: newRequest.description,
        budget: newRequest.budget || "Non spécifié",
        images: newRequest.images,
        location: newRequest.location,
        clientName: "Vous",
        clientPhone: sessionUser?.phone || "",
        city: "-", // Will be updated when profile loads with city detection
        clientRating: 5.0,
        urgency: "Normal",
        timestamp: newRequest.timestamp,
        status: "pending",
      };
      await demandStorage.saveDemand(demand);
      const requestWithId = { ...newRequest, orderId: createdOrder.id };
      await AsyncStorage.setItem(
        "@maalem_active_order",
        JSON.stringify(requestWithId),
      );
      setSavedRequest(requestWithId);
      setActiveOrder(createdOrder);
      setOffers([]);
      setAcceptedOfferId(null);
      setAssignedWorkerId(null);
    } catch (error: any) {
      console.error("Error saving demand:", error);

      // Handle specific API errors with user-friendly messages
      if (error.response?.status === 400) {
        const errorMessage = error.response.data?.message || "";

        if (
          errorMessage.includes("Champs obligatoires manquants") ||
          errorMessage.includes("required")
        ) {
          Alert.alert(
            "Champs obligatoires",
            "Veuillez remplir tous les champs obligatoires:\n\n• Description du problème\n• Catégorie de service\n• Localisation",
          );
          return;
        }

        if (
          errorMessage.includes("category") ||
          errorMessage.includes("categoryId")
        ) {
          Alert.alert(
            "Catégorie requise",
            "Veuillez sélectionner une catégorie de service.",
          );
          return;
        }

        if (errorMessage.includes("description")) {
          Alert.alert(
            "Description requise",
            "Veuillez décrire votre problème en détail.",
          );
          return;
        }

        if (
          errorMessage.includes("location") ||
          errorMessage.includes("latitude")
        ) {
          Alert.alert(
            "Localisation requise",
            "Veuillez autoriser l'accès à votre position.",
          );
          return;
        }
      }

      // Generic error for other cases
      Alert.alert(
        "Publication partielle",
        "La demande a pu être enregistrée localement, mais la synchronisation avec le backend a échoué.",
      );
      setSavedRequest(newRequest);
    }

    // Collapse drawer to show map with request card
    animateDrawer(DRAWER_HEIGHTS.PEEK, 0);
  };

  // Image picker function
  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission requise",
        "Nous avons besoin de l'accès à vos photos pour ajouter des images.",
      );
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newImage = result.assets[0].uri;
      setUploadedImages([...uploadedImages, newImage]);
    }
  };

  // Drawer animation
  const drawerHeight = useRef(new Animated.Value(height * 0.55)).current;
  const drawerHeightValueRef = useRef(height * 0.55);
  const drawerState = useRef(1); // 0 = peek (10%), 1 = default (55%), 2 = expanded (88%)

  const DRAWER_HEIGHTS = {
    PEEK: height * 0.12,
    DEFAULT: height * 0.55,
    EXPANDED: height * 0.88,
  };

  // Sync animated value with state
  useEffect(() => {
    const listener = drawerHeight.addListener(({ value }) => {
      drawerHeightValueRef.current = value;
    });
    return () => drawerHeight.removeListener(listener);
  }, []);

  const animateDrawer = (toValue: number, state: number) => {
    drawerState.current = state;
    Animated.spring(drawerHeight, {
      toValue,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = drawerHeightValueRef.current - gestureState.dy;

        if (
          newHeight >= DRAWER_HEIGHTS.DEFAULT &&
          newHeight <= DRAWER_HEIGHTS.EXPANDED
        ) {
          drawerHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentHeight = drawerHeightValueRef.current;
        const velocity = gestureState.vy;

        if (velocity > 0.5 || currentHeight < DRAWER_HEIGHTS.DEFAULT) {
          animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
        } else if (
          velocity < -0.5 ||
          currentHeight > (DRAWER_HEIGHTS.DEFAULT + DRAWER_HEIGHTS.EXPANDED) / 2
        ) {
          animateDrawer(DRAWER_HEIGHTS.EXPANDED, 2);
        } else {
          animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
        }
      },
    }),
  ).current;

  useEffect(() => {
    requestLocationPermission();
  }, []);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await getSessionUser();
        setUserName(
          user?.fullName || user?.email?.split("@")[0] || "Utilisateur",
        );
        setUserEmail(user?.email || "utilisateur@email.com");

        // Fetch profile picture from API
        const token = await getAuthToken();
        setAuthToken(token || null);
        if (token) {
          const response = await api.get("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = response.data || {};
          console.log("🔍 Map profile data received:", {
            profilePicture: data.profilePicture,
            profilePictureType: typeof data.profilePicture,
            hasProfilePicture: !!data.profilePicture,
          });

          if (data.profilePicture) {
            // Convert relative path to absolute URL if needed
            const rawProfilePicture = String(data.profilePicture || "");
            const baseUrl = String(api.defaults.baseURL || "").replace(
              /\/+$/,
              "",
            );
            const fullProfilePictureUrl = rawProfilePicture.startsWith("http")
              ? rawProfilePicture
              : `${baseUrl}/${rawProfilePicture.replace(/^\/+/, "")}`;

            console.log("Raw profile picture:", data.profilePicture);
            console.log("Final profile picture URL:", fullProfilePictureUrl);

            // Test different possible URL paths for profile pictures
            const possibleUrls = [
              fullProfilePictureUrl, // Original URL
            ];

            let workingUrl = null;
            for (const testUrl of possibleUrls) {
              try {
                const testResponse = await fetch(testUrl, {
                  method: "HEAD",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                console.log("🔍 Map testing profile image URL:", {
                  url: testUrl,
                  status: testResponse.status,
                  ok: testResponse.ok,
                  contentType: testResponse.headers.get("content-type"),
                });

                if (
                  testResponse.ok &&
                  testResponse.headers.get("content-type")?.startsWith("image/")
                ) {
                  workingUrl = testUrl;
                  console.log(
                    "✅ Map working profile image URL found:",
                    testUrl,
                  );
                  break;
                }
              } catch (networkError) {
                console.log(
                  "❌ Map network error for URL:",
                  testUrl,
                  (networkError as Error).message,
                );
              }
            }

            if (workingUrl) {
              setProfilePicture(workingUrl);
              console.log(
                "✅ Map profile picture fetched with working URL:",
                workingUrl,
              );
            } else {
              console.warn("⚠️ Map no working profile image URL found");
              // Some servers/CDNs don't support HEAD; fall back to the resolved URL so <Image/> can try GET.
              setProfilePicture(fullProfilePictureUrl);
            }

            if (__DEV__ && !debugLoggedProfileRef.current) {
              debugLoggedProfileRef.current = true;
              console.log("🖼️ [profile-image] map debug:", {
                platform: Platform.OS,
                baseURL: String(api.defaults.baseURL || ""),
                rawProfilePicture: data.profilePicture,
                resolvedUri: workingUrl || fullProfilePictureUrl,
                usedHeadProbe: true,
                hasAuthToken: !!token,
              });
            }
          } else {
            console.log("⚠️ No profile picture found in map API response");
            setProfilePicture(null);
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    const restoreActiveRequest = async () => {
      try {
        const cached = await AsyncStorage.getItem("@maalem_active_order");
        if (!cached) return;

        const parsed = JSON.parse(cached);
        if (parsed?.orderId) {
          setSavedRequest(parsed);
        }
      } catch (error) {
        console.error("Error restoring active request:", error);
      }
    };

    restoreActiveRequest();
  }, []);

  useEffect(() => {
    if (!savedRequest?.orderId) return;

    const pollOrder = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const order = await getRequestById(savedRequest.orderId, token);

        setActiveOrder(order);
        setSavedRequest((prev) =>
          prev ? { ...prev, orderId: order.id } : prev,
        );

        // Fetch offers for this request
        if (savedRequest.orderId) {
          await fetchOffers(savedRequest.orderId);
        }

        if (order?.status === "ASSIGNED") {
          await AsyncStorage.setItem(
            "@maalem_active_order",
            JSON.stringify({
              ...savedRequest,
              orderId: order.id,
            }),
          );
        }

        // Handle mission completion: keep the mission card and show rating CTA/modal.
        if (order?.status === "DONE" || order?.status === "COMPLETED") {
          setAcceptedOfferId(null);
          setOffers([]);

          const requestId = String(order.id || savedRequest.orderId || "");
          if (requestId && completionPromptedRef.current !== requestId) {
            completionPromptedRef.current = requestId;
            // Create notification for mission completion
            try {
              const missionTitle = activeOrder?.title || "Mission";
              await notificationService.addNotification(
                notificationService.createMissionCompletedNotification(
                  String(order.id || savedRequest.orderId || ""),
                  missionTitle,
                ),
              );
              setNotificationCount((prev) => prev + 1);
            } catch (error) {
              console.error(
                "Error creating mission completion notification:",
                error,
              );
            }

            // Direct navigation to rating screen when mission is completed
            openRatingModal();
          }
        }
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setActiveOrder(null);
          setAcceptedOfferId(null);
          setAssignedWorkerId(null);
          setOffers([]);
          setSavedRequest((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            delete next.orderId;
            return next;
          });
          await AsyncStorage.removeItem("@maalem_active_order");
          return;
        } else {
          // Silent: polling can intermittently fail (network, race conditions)
        }
      }
    };

    pollOrder();
    const interval = setInterval(pollOrder, 2000); // Reduce to 2 seconds for better responsiveness
    return () => clearInterval(interval);
  }, [savedRequest?.orderId]);

  useEffect(() => {
    const selectedOfferId =
      acceptedOfferId || resolveSelectedOfferId(activeOrder);
    if (!selectedOfferId) return;
    setAcceptedOfferId(selectedOfferId);
  }, [activeOrder, acceptedOfferId]);

  useEffect(() => {
    const nextAssigned = resolveAssignedWorkerId(activeOrder);
    if (nextAssigned) {
      setAssignedWorkerId(nextAssigned);
    }
  }, [activeOrder]);

  useEffect(() => {
    if (!assignedWorkerDetails) {
      setResolvedWorkerProfilePicture(null);
      return;
    }

    let cancelled = false;
    const baseUrl = String(api.defaults.baseURL || "");

    const resolveWorkerImage = async () => {
      try {
        const raw = String(
          assignedWorkerDetails?.profilePicture ||
            assignedWorkerDetails?.User?.profilePicture ||
            assignedWorkerDetails?.user?.profilePicture ||
            "",
        ).trim();

        if (!raw) {
          setResolvedWorkerProfilePicture(null);
          return;
        }

        const initial = buildAbsoluteUrl(baseUrl, raw);
        const candidates = [initial].filter(Boolean);

        let resolved = candidates[0];

        for (const url of candidates) {
          const needsAuth = looksLikeApiHostedUrl(baseUrl, url);
          const headers: Record<string, string> = { Accept: "image/*" };
          if (needsAuth && authToken)
            headers.Authorization = `Bearer ${authToken}`;

          try {
            const head = await fetch(url, { method: "HEAD", headers });
            const contentType = head.headers.get("content-type") || "";
            if (head.ok && contentType.startsWith("image/")) {
              resolved = url;
              break;
            }
            const get = await fetch(url, { method: "GET", headers });
            const getType = get.headers.get("content-type") || "";
            if (get.ok && getType.startsWith("image/")) {
              resolved = url;
              break;
            }
          } catch {
            // Ignore probe errors
          }
        }

        if (!cancelled) {
          setResolvedWorkerProfilePicture(resolved);
        }
      } catch {
        // Ignore
      }
    };

    resolveWorkerImage();
    return () => {
      cancelled = true;
    };
  }, [assignedWorkerDetails, authToken]);

  useEffect(() => {
    if (!assignedWorkerId) return;

    let cancelled = false;
    const fetchWorkerDetails = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        // Fetch technician profile
        const response = await api.get(`/api/technician/${assignedWorkerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const techProfile = response.data || {};
        const userData = techProfile?.User || techProfile?.user;

        console.log("🔍 [worker-details] technician profile:", {
          techProfile,
          userData,
          phoneOnProfile: techProfile?.phone,
          phoneOnUser: userData?.phone,
          allKeys: Object.keys(techProfile),
          userKeys: userData ? Object.keys(userData) : null,
          userId: techProfile?.userId,
        });

        let mergedData = techProfile;

        // If no nested User and we have userId, fetch user directly
        if (!userData && techProfile?.userId) {
          try {
            const userResponse = await api.get(
              `/api/users/${techProfile.userId}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            mergedData = { ...techProfile, User: userResponse.data };
            console.log(
              "✅ [worker-details] fetched user separately:",
              userResponse.data,
            );
          } catch (userErr: any) {
            console.warn(
              "⚠️ [worker-details] could not fetch user:",
              userErr?.message,
            );
          }
        }

        if (!cancelled) {
          setAssignedWorkerDetails(mergedData);
        }
      } catch (error: any) {
        console.error(
          "❌ [worker-details] fetch error:",
          error?.message || error,
        );
      }
    };

    fetchWorkerDetails();
    return () => {
      cancelled = true;
    };
  }, [assignedWorkerId]);

  useEffect(() => {
    if (!acceptedOfferId) return;
    if (assignedWorkerId) return;
    if (!savedRequest?.orderId) return;

    let cancelled = false;
    const loadAcceptedOffer = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const offerResponse = await api.get(`/api/offers/${acceptedOfferId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const offer = offerResponse.data;
        const technicianId =
          offer?.technicianId ?? offer?.technician?.id ?? null;
        if (!cancelled && technicianId != null) {
          setAssignedWorkerId(String(technicianId));
        }
      } catch (error: any) {
        // Keep polling via order updates; don't block the UI.
        if (!cancelled) {
          console.warn(
            "Unable to resolve accepted offer technician id:",
            error?.message || error,
          );
        }
      }
    };

    loadAcceptedOffer();
    return () => {
      cancelled = true;
    };
  }, [acceptedOfferId, assignedWorkerId, savedRequest?.orderId]);

  const requestStatusLabel =
    isActiveTripStatus(activeOrder?.status) || !!acceptedOfferId
      ? "Travailleur en route"
      : activeOrder?.status === "OPEN"
        ? "En attente d'offres..."
        : savedRequest?.orderId
          ? `Statut: ${activeOrder?.status || "mise à jour..."}`
          : "En attente d'offres...";
  const isTripActive =
    isActiveTripStatus(activeOrder?.status) || !!acceptedOfferId;
  const isMissionDone = ["DONE", "COMPLETED"].includes(
    String(activeOrder?.status || "").toUpperCase(),
  );
  const hasAssignedTechnician = !!(
    activeOrder?.workerId ||
    activeOrder?.technicianId ||
    activeOrder?.assignedWorkerId ||
    activeOrder?.technician?.id ||
    assignedWorkerId
  );
  const currentRequestId = String(
    activeOrder?.id || savedRequest?.orderId || "",
  );

  const handleReviewMarkedAsDone = async () => {
    setShowRatingModal(false);
    await dismissCompletedRequest();
  };

  const dismissCompletedRequest = async () => {
    setShowRatingModal(false);
    setSavedRequest(null);
    setActiveOrder(null);
    setAcceptedOfferId(null);
    setAssignedWorkerId(null);
    setOffers([]);
    completionPromptedRef.current = null;

    // Clear form fields to empty the mission form
    setSelectedCategory(null);
    setProblemDescription("");
    setBudget("");
    setUploadedImages([]);

    await AsyncStorage.removeItem("@maalem_active_order");
    await AsyncStorage.removeItem("@maalem_draft_request");
  };

  const openRatingModal = async () => {
    if (!currentRequestId) return;
    try {
      const myRequests = await getMyRequests();
      const matchedRequest = myRequests.find(
        (item: any) => String(item?.id) === currentRequestId,
      );
      if (matchedRequest) {
        setActiveOrder((prev: any) => ({ ...prev, ...matchedRequest }));
      }
    } catch (error) {
      console.warn("Unable to refresh request before rating:", error);
    } finally {
      setShowRatingModal(true);
    }
  };

  useEffect(() => {
    if (savedRequest?.orderId && activeOrder?.status === "ASSIGNED") {
      console.log("Active order assigned:", activeOrder.workerId);
    }
  }, [savedRequest?.orderId, activeOrder?.status]);

  useEffect(() => {
    // Client view: when a request is accepted, show only the client's own location (no worker tracking).
    if (!isTripActive) return;
    if (!webViewRef.current) return;

    webViewRef.current.injectJavaScript(`
      try {
        if (window.clearTrip) window.clearTrip();
      } catch (e) {}
      true;
    `);
  }, [isTripActive]);

  useEffect(() => {
    if (!isTripActive) {
      tripAutoFitArmedRef.current = false;
    }
  }, [isTripActive]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission de localisation refusée");
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation(currentLocation);
      setRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      setLoading(false);
    } catch (error) {
      console.error("Location error:", error);
      setErrorMsg("Erreur de localisation");
      setLoading(false);
    }
  };

  // No default location - only use actual device location

  const centerOnUser = async () => {
    try {
      // Get current location
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;

      // Update state
      setLocation(currentLocation);
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });

      // Inject JavaScript to recenter the WebView map with max zoom
      if (webViewRef.current) {
        const jsCode = `
          if (typeof map !== 'undefined') {
            map.setView([${latitude}, ${longitude}], 18);
            // Update user marker position
            if (userMarker) {
              userMarker.setLatLng([${latitude}, ${longitude}]);
            }
          }
          true;
        `;
        webViewRef.current.injectJavaScript(jsCode);
      }
    } catch (error) {
      console.error("Error getting location:", error);
    }
  };

  const getMarkerIcon = (iconName: string, color: string) => {
    switch (iconName) {
      case "zap":
        return (
          <View style={[styles.markerContainer, { backgroundColor: color }]}>
            <Feather name="zap" size={20} color="#fff" />
          </View>
        );
      case "water":
        return (
          <View style={[styles.markerContainer, { backgroundColor: color }]}>
            <Feather name="droplet" size={20} color="#fff" />
          </View>
        );
      default:
        return (
          <View style={[styles.markerContainer, { backgroundColor: color }]}>
            <Feather name="map-pin" size={20} color="#fff" />
          </View>
        );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Chargement de la carte...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        {/* Menu Button */}
        <TouchableOpacity style={styles.menuButton} onPress={openMenu}>
          <Feather name="menu" size={24} color="#1a1a2e" />
        </TouchableOpacity>

        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              console.log(
                "🔔 Notifications pressed - count:",
                notificationCount,
              );
              router.push("/notifications");
              if (notificationCount > 0) {
                setNotificationCount(0);
              }
            }}
          >
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 99 ? "99+" : notificationCount}
                </Text>
              </View>
            )}
            <Feather name="bell" size={22} color="#1a1a2e" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Feather name="search" size={22} color="#1a1a2e" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Side Drawer Menu */}
      {menuVisible && (
        <>
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={closeMenu}
          />
          <Animated.View
            style={[
              styles.sideDrawer,
              { transform: [{ translateX: menuAnimation }] },
            ]}
          >
            {/* Menu Header */}
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                {profilePicture &&
                typeof profilePicture === "string" &&
                profilePicture.trim().length > 0 ? (
                  <ExpoImage
                    source={{
                      uri: profilePicture!,
                      ...(authToken && profilePicture!.startsWith("http")
                        ? { headers: { Authorization: `Bearer ${authToken}` } }
                        : {}),
                    }}
                    style={styles.menuProfileImage}
                    onError={(error) => {
                      console.error("❌ Profile image load error in map:", {
                        error,
                        uri: profilePicture,
                        platform: Platform.OS,
                        baseURL: String(api.defaults.baseURL || ""),
                        hasAuthToken: !!authToken,
                      });
                    }}
                    onLoad={() => {
                      if (__DEV__) {
                        console.log("✅ Profile image loaded in map:", {
                          uri: profilePicture,
                          platform: Platform.OS,
                        });
                      }
                    }}
                  />
                ) : (
                  <Feather name="user" size={40} color="#1e40af" />
                )}
              </View>
              <Text style={styles.menuName}>{userName}</Text>
              <Text style={styles.menuEmail}>{userEmail}</Text>
            </View>

            {/* Menu Items */}
            <View style={styles.menuItems}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  closeMenu();
                  router.push("/profile");
                }}
              >
                <Feather name="user" size={22} color="#374151" />
                <Text style={styles.menuItemText}>Profil</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                <Feather name="log-out" size={22} color="#ef4444" />
                <Text style={[styles.menuItemText, { color: "#ef4444" }]}>
                  Déconnexion
                </Text>
              </TouchableOpacity>
            </View>

            {/* Switch to Worker Button */}
            <TouchableOpacity
              style={styles.switchButton}
              onPress={async () => {
                closeMenu();
                try {
                  const user = await refreshSessionUser();
                  console.log("🔍 User data when switching to worker mode:", {
                    role: user?.role,
                    hasTechnicianProfile: !!user?.technicianProfile,
                    technicianProfile: user?.technicianProfile,
                    userId: user?.id,
                  });

                  if (user?.role === "TECHNICIAN") {
                    // Check if technician has a complete profile or if we need to verify
                    if (user?.technicianProfile) {
                      console.log(
                        "✅ Technician profile found, checking verification status...",
                      );

                      // Check if technician is verified
                      if (user.technicianProfile.isVerified) {
                        console.log(
                          "✅ Technician is verified, checking worker mode...",
                        );
                        if (!user.technicianProfile.isWorkerMode) {
                          console.log("🔄 Setting worker mode to true...");
                          await setTechnicianWorkerMode(true);
                          const updatedUser = await refreshSessionUser();
                          console.log(
                            "🔍 Updated user after setting worker mode:",
                            {
                              role: updatedUser?.role,
                              hasTechnicianProfile:
                                !!updatedUser?.technicianProfile,
                              isWorkerMode:
                                updatedUser?.technicianProfile?.isWorkerMode,
                            },
                          );
                        }
                        router.replace("/worker-map");
                        return;
                      } else {
                        console.log(
                          "⚠️ Technician is not verified, redirecting to registration",
                        );
                        router.replace("/worker-registration");
                        return;
                      }
                    } else {
                      // Technician role but no profile data - try to refresh once more
                      console.log(
                        "🔄 Technician without profile data, refreshing session...",
                      );
                      const refreshedUser = await refreshSessionUser();
                      console.log("🔍 Refreshed user data:", {
                        role: refreshedUser?.role,
                        hasTechnicianProfile:
                          !!refreshedUser?.technicianProfile,
                        technicianProfile: refreshedUser?.technicianProfile,
                      });

                      if (refreshedUser?.technicianProfile) {
                        console.log(
                          "✅ Technician profile found after refresh, checking verification...",
                        );

                        // Check if technician is verified
                        if (refreshedUser.technicianProfile.isVerified) {
                          console.log(
                            "✅ Technician is verified after refresh",
                          );
                          if (!refreshedUser.technicianProfile.isWorkerMode) {
                            await setTechnicianWorkerMode(true);
                            await refreshSessionUser();
                          }
                          router.replace("/worker-map");
                          return;
                        } else {
                          console.log(
                            "⚠️ Technician is not verified after refresh, redirecting to registration",
                          );
                          router.replace("/worker-registration");
                          return;
                        }
                      } else {
                        console.log(
                          "⚠️ Technician profile still missing after refresh, going to registration",
                        );
                        router.push("/worker-registration");
                        return;
                      }
                    }
                  } else {
                    // Non-technician user - automatically promote to technician
                    console.log(
                      "🔄 User is not a technician, promoting automatically...",
                    );
                    try {
                      // Import the promotion function
                      const firebaseAuth =
                        await import("@/src/services/firebaseAuth");
                      const { promoteCurrentUserToTechnician } = firebaseAuth;

                      // Promote user with default technician data
                      await promoteCurrentUserToTechnician({
                        bio: "Technicien prêt à travailler",
                        skillsText: "Services généraux",
                        radiusKm: 10,
                        isAvailable: true,
                      });

                      console.log(
                        "✅ User promoted to technician successfully",
                      );

                      // Refresh user data after promotion
                      const promotedUser = await refreshSessionUser();
                      console.log("🔍 User data after promotion:", {
                        role: promotedUser?.role,
                        hasTechnicianProfile: !!promotedUser?.technicianProfile,
                        technicianProfile: promotedUser?.technicianProfile,
                      });

                      // Set worker mode and redirect to verification
                      if (
                        promotedUser?.technicianProfile &&
                        !promotedUser.technicianProfile.isWorkerMode
                      ) {
                        await setTechnicianWorkerMode(true);
                        await refreshSessionUser();
                      }

                      router.replace("/worker-registration");
                      return;
                    } catch (error) {
                      console.error(
                        "❌ Failed to promote user to technician:",
                        error,
                      );
                      // If promotion fails, fall back to registration
                      router.push("/worker-registration");
                      return;
                    }
                  }
                } catch (error) {
                  console.warn("Unable to switch to worker mode:", error);
                  router.push("/worker-registration");
                }
              }}
            >
              <MaterialCommunityIcons
                name="briefcase-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.switchButtonText}>
                Passer en mode Travailleur
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* Map */}
      {region && (
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            style={styles.map}
            originWhitelist={["*"]}
            source={{
              html: `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { height: 100vh; width: 100vw; }
    .custom-marker {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }
    .custom-marker div {
      background: transparent !important;
    }
    #navCard {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 14px;
      z-index: 1000;
      background: rgba(255,255,255,0.95);
      border-radius: 16px;
      padding: 12px 14px;
      border: 1px solid rgba(0,0,0,0.06);
      box-shadow: 0 10px 24px rgba(0,0,0,0.22);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #navTitle {
      font-size: 12px;
      color: #6b7280;
      margin: 0 0 4px 0;
      font-weight: 600;
    }
    #navInstruction {
      font-size: 16px;
      color: #111827;
      margin: 0;
      font-weight: 800;
      line-height: 1.2;
    }
    #navMeta {
      margin-top: 6px;
      font-size: 12px;
      color: #374151;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="navCard" style="display:none;">
    <p id="navTitle">Prochaine étape</p>
    <p id="navInstruction">Calcul du trajet…</p>
    <div id="navMeta"></div>
  </div>
  <script>
    let map;
    let userMarker;
    window.__autoFit = true;
    window.setAutoFitEnabled = function(enabled) { window.__autoFit = !!enabled; };
    
    map = L.map('map').setView([${region?.latitude || 0}, ${region?.longitude || 0}], 16);
    
    L.tileLayer(
      'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}',
      {
        attribution: '© TomTom',
        maxZoom: 20,
        tileSize: 256,
      }
    ).addTo(map);

    // If the user manually pans/zooms the map, stop auto-fitting the route.
    function disableAutoFit() { window.__autoFit = false; }
    map.on('dragstart', disableAutoFit);
    map.on('zoomstart', disableAutoFit);
    map.on('movestart', disableAutoFit);


    // Add user location marker (store globally for updates)
    const userIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div style="font-size:32px;line-height:1;">📍</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
    userMarker = L.marker([${region?.latitude || 0}, ${region?.longitude || 0}], { icon: userIcon }).addTo(map)
      .bindPopup('Votre position');

    window.clearTrip = function() {
      // Client map cleanup - remove any trip-related elements
      window.__autoFit = true;
    };

    // Add service providers (hide them once a trip is active; client should see an "empty" map).
    const showProviders = ${!isTripActive};
    if (showProviders) {
      const providers = ${JSON.stringify(SERVICE_PROVIDERS)};
      providers.forEach(p => {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div style="background:' + p.color + ';width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">⚡</div>',
          iconSize: [40, 40]
        });
        L.marker([p.latitude, p.longitude], { icon: icon }).addTo(map)
          .bindPopup(p.name);
      });
    }
  </script>
</body>
</html>
              `,
            }}
          />

          {/* Location Button */}
          <TouchableOpacity
            style={styles.locationButton}
            onPress={centerOnUser}
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={24}
              color="#1a1a2e"
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Job Card - Removed */}
      {/* 
      <View style={styles.jobCard}>
        ... card content ...
      </View>
      */}

      {/* Bottom Drawer - Hidden when request is published */}
      {!savedRequest && (
        <Animated.View style={[styles.bottomDrawer, { height: drawerHeight }]}>
          {/* Drag Handle */}
          <View
            style={styles.dragHandleContainer}
            {...panResponder.panHandlers}
          >
            <View style={styles.dragHandle} />
          </View>

          {/* Scrollable Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.drawerScrollView}
            contentContainerStyle={styles.drawerScrollContent}
          >
            {/* Service Categories */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesContainer}
            >
              {serviceCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryChip,
                    selectedCategory?.id === category.id &&
                      styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Image
                    source={
                      selectedCategory?.id === category.id
                        ? CATEGORY_ICONS_SELECTED[
                            normalizeCategoryKey(category.name)
                          ]
                        : getCategoryIcon(category.name)
                    }
                    style={{
                      width: 60,
                      height: 60,
                    }}
                    resizeMode="contain"
                  />
                  <Text
                    style={[
                      styles.categoryName,
                      selectedCategory?.id === category.id &&
                        styles.categoryNameActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Main Input Area */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                De quoi avez-vous besoin & votre budget ?
              </Text>

              <View style={styles.inputContainer}>
                <Feather
                  name="edit-3"
                  size={18}
                  color="#9ca3af"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Décrivez votre problème..."
                  placeholderTextColor="#9ca3af"
                  value={problemDescription}
                  onChangeText={setProblemDescription}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.inputContainer}>
                <Feather
                  name="dollar-sign"
                  size={18}
                  color="#9ca3af"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Votre budget (ex: 500 DH)"
                  placeholderTextColor="#9ca3af"
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Image Upload Section */}
            <View style={styles.uploadSection}>
              <Text style={styles.uploadLabel}>Ajouter des photos (max 4)</Text>
              <View style={styles.uploadContainer}>
                {/* Upload Button */}
                {uploadedImages.length < 4 && (
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={pickImage}
                  >
                    <Feather name="camera" size={24} color="#1e40af" />
                    <Text style={styles.uploadButtonText}>Ajouter</Text>
                  </TouchableOpacity>
                )}
                {/* Uploaded Images */}
                {uploadedImages.map((image, index) => (
                  <View key={index} style={styles.uploadedImageContainer}>
                    <Image
                      source={{ uri: image }}
                      style={styles.uploadedImage}
                    />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => {
                        const newImages = [...uploadedImages];
                        newImages.splice(index, 1);
                        setUploadedImages(newImages);
                      }}
                    >
                      <Feather name="x" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* CTA Button - Sticky at bottom */}
          <TouchableOpacity
            style={styles.ctaButtonSticky}
            onPress={handlePublishRequest}
          >
            <Feather name="plus-circle" size={20} color="#fff" />
            <Text style={styles.ctaButtonText}>
              Publier la demande & Recevoir des offres
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Request Card - shown when request is published */}
      {savedRequest && (
        <View
          style={[styles.requestCard, isTripActive && styles.requestCardActive]}
        >
          <View style={styles.requestCardHeader}>
            <View
              style={[
                styles.requestCardIcon,
                isTripActive && styles.requestCardIconActive,
              ]}
            >
              <Feather
                name={isTripActive ? "navigation" : "check-circle"}
                size={20}
                color={isTripActive ? "#1d4ed8" : "#10b981"}
              />
            </View>
            <View style={styles.requestCardInfo}>
              <Text style={styles.requestCardTitle}>
                {isTripActive
                  ? "Mission en cours"
                  : isMissionDone
                    ? "Mission terminee"
                    : "Demande publiee"}
              </Text>
              <Text style={styles.requestCardCategory}>
                {savedRequest.categoryName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.requestCardClose}
              onPress={async () => {
                if (isMissionDone) {
                  await dismissCompletedRequest();
                  return;
                }
                try {
                  // Delete request from backend if it has an orderId
                  if (savedRequest?.orderId) {
                    const token = await getAuthToken();
                    if (token) {
                      await api.delete(
                        `/api/requests/${savedRequest.orderId}`,
                        {
                          headers: { Authorization: `Bearer ${token}` },
                        },
                      );
                    }
                  }
                  // Clear local state
                  setSavedRequest(null);
                  setActiveOrder(null);
                  setAcceptedOfferId(null);
                  setAssignedWorkerId(null);
                  setOffers([]);
                  await AsyncStorage.removeItem("@maalem_active_order");
                } catch (error) {
                  console.error("Error deleting request:", error);
                  // Still clear UI even if delete fails
                  setSavedRequest(null);
                  setActiveOrder(null);
                  setAcceptedOfferId(null);
                  setAssignedWorkerId(null);
                  setOffers([]);
                  await AsyncStorage.removeItem("@maalem_active_order");
                }
              }}
            >
              <Feather name="x" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.requestCardBody}>
            <Text style={styles.requestCardDescription} numberOfLines={2}>
              {savedRequest.description}
            </Text>
            {isTripActive ? (
              <>
                <Text style={styles.requestCardTracking}>
                  Le travailleur est en route vers vous.
                </Text>
                {/* Assigned Worker Info */}
                {(() => {
                  // Find accepted offer technician as fallback (same approach as offer screen)
                  const acceptedOffer = offers.find(
                    (o: any) =>
                      o.status === "ACCEPTED" ||
                      String(o?.id) === String(acceptedOfferId) ||
                      String(o?.id) === String(activeOrder?.selectedOfferId) ||
                      String(o?.id) === String(activeOrder?.offerId),
                  );
                  const offerTechnician =
                    acceptedOffer?.technician ||
                    acceptedOffer?.User ||
                    acceptedOffer?.user;

                  // Schema: TechnicianProfile has no phone/fullName; those are on User.
                  // TechnicianProfile has 'sold' for missions count.
                  const workerData =
                    assignedWorkerDetails ||
                    activeOrder?.technician ||
                    activeOrder?.worker ||
                    offerTechnician ||
                    {};
                  // API may return nested User object OR flattened fields
                  const userData =
                    workerData?.User || workerData?.user || workerData;
                  const workerName =
                    userData?.fullName ||
                    userData?.name ||
                    `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() ||
                    "Technicien";
                  const workerRating =
                    workerData?.averageRating ||
                    userData?.averageRating ||
                    workerData?.rating ||
                    0;
                  const workerMissions =
                    workerData?.sold ??
                    workerData?.completedMissions ??
                    workerData?.missionsCount ??
                    0;
                  const rawPic = String(
                    workerData?.profilePicture ||
                      userData?.profilePicture ||
                      "",
                  ).trim();
                  // Images are stored in /uploads/requests/ on the server
                  const processedPic = rawPic.includes("/uploads/")
                    ? rawPic.replace("/uploads/", "/uploads/requests/")
                    : rawPic;
                  const workerPic = processedPic
                    ? buildAbsoluteUrl(
                        String(api.defaults.baseURL || ""),
                        processedPic,
                      )
                    : null;
                  const workerPhone =
                    userData?.phone ||
                    userData?.phoneNumber ||
                    userData?.mobile ||
                    userData?.tel ||
                    "";

                  console.log("🔍 [active-card] worker data:", {
                    assignedWorkerDetails,
                    activeOrderTech: activeOrder?.technician,
                    offerTechName:
                      offerTechnician?.fullName || offerTechnician?.name,
                    workerDataKeys: Object.keys(workerData),
                    userDataKeys: userData ? Object.keys(userData) : null,
                    workerName,
                    workerPhone,
                    rawPic,
                    processedPic,
                    workerPic,
                    source: assignedWorkerDetails
                      ? "assignedWorkerDetails"
                      : offerTechnician
                        ? "offerTechnician"
                        : "none",
                  });

                  return (
                    <View style={styles.workerCardInline}>
                      <View style={styles.workerCardInlineHeader}>
                        {workerPic ? (
                          <ExpoImage
                            source={{ uri: workerPic }}
                            style={styles.workerCardInlineAvatar}
                            onError={() => {}}
                          />
                        ) : (
                          <View style={styles.workerCardInlineAvatarFallback}>
                            <Feather name="user" size={16} color="#6b7280" />
                          </View>
                        )}
                        <View style={styles.workerCardInlineDetails}>
                          <Text style={styles.workerCardInlineName}>
                            {workerName}
                          </Text>
                          <View style={styles.workerCardInlineStats}>
                            {workerRating > 0 && (
                              <View style={styles.workerCardInlineStat}>
                                <Feather
                                  name="star"
                                  size={12}
                                  color="#fbbf24"
                                />
                                <Text style={styles.workerCardInlineStatText}>
                                  {workerRating.toFixed(1)}
                                </Text>
                              </View>
                            )}
                            {workerMissions > 0 && (
                              <View style={styles.workerCardInlineStat}>
                                <Feather
                                  name="check-circle"
                                  size={12}
                                  color="#059669"
                                />
                                <Text style={styles.workerCardInlineStatText}>
                                  {workerMissions} missions
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={styles.workerCardInlinePhone}>
                        <Feather name="phone" size={12} color="#6b7280" />
                        <Text style={styles.workerCardInlinePhoneText}>
                          {workerPhone || "Numéro non disponible"}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </>
            ) : isMissionDone ? (
              <Text style={styles.requestCardTracking}>
                Mission terminee. Merci de noter votre technicien.
              </Text>
            ) : null}
            {savedRequest.budget ? (
              <Text style={styles.requestCardBudget}>
                Budget: {savedRequest.budget}
              </Text>
            ) : null}
            {savedRequest.images.length > 0 && (
              <Text style={styles.requestCardImages}>
                {savedRequest.images.length} photo
                {savedRequest.images.length > 1 ? "s" : ""}
              </Text>
            )}
          </View>

          {/* Offers Section */}
          {offers.length > 0 && !isTripActive && (
            <View style={styles.offersSection}>
              <Text style={styles.offersTitle}>
                Offres reçues ({offers.length})
              </Text>
              {offers.map((offer) => {
                // Get technician data from multiple possible sources
                const technicianData =
                  offer.technician || offer.User || offer.user;
                const technicianName =
                  technicianData?.fullName ||
                  technicianData?.name ||
                  `${technicianData?.firstName || ""} ${technicianData?.lastName || ""}`.trim() ||
                  "Technicien";

                // Get rating from multiple possible field names
                const averageRating =
                  technicianData?.averageRating ||
                  technicianData?.rating ||
                  technicianData?.totalRating ||
                  technicianData?.avgRating ||
                  0;

                // Get mission count from multiple possible field names
                const completedMissions =
                  technicianData?.completedMissions ||
                  technicianData?.missionsCount ||
                  technicianData?.totalMissions ||
                  technicianData?.missionsCompleted ||
                  0;

                const rawProfilePicture = String(
                  technicianData?.profilePicture || "",
                ).trim();
                const processedProfilePicture =
                  resolvedOfferProfilePictures[String(offer.id)] ||
                  (rawProfilePicture
                    ? buildAbsoluteUrl(
                        String(api.defaults.baseURL || ""),
                        rawProfilePicture,
                      )
                    : null);
                const processedProfilePictureNeedsAuth = !!(
                  processedProfilePicture &&
                  looksLikeApiHostedUrl(
                    String(api.defaults.baseURL || ""),
                    processedProfilePicture,
                  )
                );

                return (
                  <View key={offer.id} style={styles.offerCard}>
                    <View style={styles.offerHeader}>
                      <View style={styles.technicianInfo}>
                        {processedProfilePicture ? (
                          <ExpoImage
                            source={{
                              uri: processedProfilePicture,
                              ...(authToken && processedProfilePictureNeedsAuth
                                ? {
                                    headers: {
                                      Authorization: `Bearer ${authToken}`,
                                    },
                                  }
                                : {}),
                            }}
                            style={styles.technicianProfilePicture}
                            onError={(error) => {
                              // Silently handle image load errors
                            }}
                            onLoad={() => {
                              if (__DEV__) {
                                console.log(
                                  "✅ Technician profile image loaded:",
                                  {
                                    uri: processedProfilePicture,
                                    needsAuth: processedProfilePictureNeedsAuth,
                                    offerId: offer.id,
                                    technicianId: technicianData?.id,
                                  },
                                );
                              }
                            }}
                          />
                        ) : (
                          <View style={styles.defaultProfilePicture}>
                            <Feather name="user" size={16} color="#6b7280" />
                          </View>
                        )}
                        <View style={styles.technicianDetails}>
                          <View style={styles.technicianNameContainer}>
                            <Text style={styles.technicianName}>
                              {technicianName}
                            </Text>
                          </View>
                          <View style={styles.technicianStats}>
                            {averageRating && averageRating > 0 && (
                              <View style={styles.ratingContainer}>
                                <Feather
                                  name="star"
                                  size={12}
                                  color="#fbbf24"
                                />
                                <Text style={styles.ratingText}>
                                  {averageRating.toFixed(1)}
                                </Text>
                              </View>
                            )}
                            {completedMissions !== undefined &&
                              completedMissions > 0 && (
                                <View style={styles.missionContainer}>
                                  <Feather
                                    name="check-circle"
                                    size={12}
                                    color="#059669"
                                  />
                                  <Text style={styles.missionText}>
                                    {completedMissions} missions
                                  </Text>
                                </View>
                              )}
                          </View>
                          <Text style={styles.offerPrice}>
                            {offer.price} DH
                          </Text>
                          {(technicianData?.phone ||
                            technicianData?.phoneNumber) &&
                            (
                              technicianData?.phone ||
                              technicianData?.phoneNumber
                            ).trim() &&
                            activeOrder?.status !== "OPEN" && (
                              <View style={styles.technicianPhoneContainer}>
                                <Feather
                                  name="phone"
                                  size={12}
                                  color="#6b7280"
                                />
                                <Text style={styles.technicianPhone}>
                                  {technicianData?.phone ||
                                    technicianData?.phoneNumber}
                                </Text>
                              </View>
                            )}
                        </View>
                      </View>
                    </View>
                    {offer.message &&
                      !offer.message.toLowerCase().includes("test") && (
                        <Text style={styles.offerMessage}>{offer.message}</Text>
                      )}
                    <View style={styles.offerActions}>
                      <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={() => handleAcceptOffer(offer.id)}
                      >
                        <Feather name="check" size={16} color="#fff" />
                        <Text style={styles.acceptButtonText}>Accepter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.refuseButton}
                        onPress={() => handleRefuseOffer(offer.id)}
                      >
                        <Feather name="x" size={16} color="#ef4444" />
                        <Text style={styles.refuseButtonText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {isMissionDone && (
            <View style={styles.reviewActions}>
              {hasAssignedTechnician ? (
                <TouchableOpacity
                  style={styles.reviewButton}
                  onPress={openRatingModal}
                >
                  <Feather name="star" size={16} color="#fff" />
                  <Text style={styles.reviewButtonText}>
                    Noter le technicien
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.reviewedBadge}>
                  <Feather name="check-circle" size={15} color="#059669" />
                  <Text style={styles.reviewedText}>
                    Aucun technicien assigne
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.requestCardFooter}>
            <Text style={styles.requestCardStatus}>{requestStatusLabel}</Text>
            <View
              style={[
                styles.requestCardDot,
                isTripActive && styles.requestCardDotActive,
              ]}
            />
          </View>
        </View>
      )}

      {savedRequest && activeOrder && (
        <RatingScreen
          visible={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          onReviewed={handleReviewMarkedAsDone}
          missionData={{
            requestId: Number(activeOrder?.id || savedRequest?.orderId || 0),
            title:
              activeOrder?.title || savedRequest?.categoryName || "Mission",
            category:
              activeOrder?.ServiceCategory?.name ||
              savedRequest?.categoryName ||
              "Service",
            status: String(activeOrder?.status || ""),
            technician: {
              id:
                activeOrder?.technicianId ||
                activeOrder?.workerId ||
                assignedWorkerId ||
                undefined,
              fullName:
                activeOrder?.technician?.fullName ||
                activeOrder?.worker?.fullName ||
                "Technicien",
            },
            canRate: isMissionDone && hasAssignedTechnician,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: "#f8f9fa",
    gap: 8,
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Side Drawer Menu Styles
  menuBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 100,
  },
  sideDrawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: width * 0.75,
    maxWidth: 300,
    backgroundColor: "#fff",
    zIndex: 101,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  dropdownMenu: {
    position: "absolute",
    top: 110,
    left: 16,
    width: 260,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuHeader: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    marginBottom: 16,
  },
  menuAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  menuProfileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  menuName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  menuEmail: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  menuItems: {
    flex: 1,
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  menuItemText: {
    fontSize: 16,
    color: "#374151",
    fontWeight: "500",
  },
  menuFooter: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  switchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  switchButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  dropdownSwitchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    marginTop: 8,
  },
  dropdownSwitchButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10b981",
  },
  headerIcons: {
    flexDirection: "row",
    gap: 16,
  },
  iconButton: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    width: width,
    height: height * 0.5,
  },
  markerContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locationButton: {
    position: "absolute",
    right: 16,
    top: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  listContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  listPlaceholder: {
    fontSize: 16,
    color: "#666",
  },
  jobCard: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  jobCardContent: {
    gap: 12,
  },
  jobHeader: {
    flexDirection: "row",
    gap: 12,
  },
  jobImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  jobInfo: {
    flex: 1,
    justifyContent: "center",
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 4,
  },
  jobLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  jobLocationText: {
    fontSize: 13,
    color: "#666",
  },
  jobDistance: {
    fontSize: 13,
    color: "#9ca3af",
  },
  priceBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#16a34a",
  },
  jobFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  applicantsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  applicantAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatar1: {
    backgroundColor: "#fca5a5",
    zIndex: 3,
  },
  avatar2: {
    backgroundColor: "#86efac",
    marginLeft: -8,
    zIndex: 2,
  },
  avatar3: {
    backgroundColor: "#93c5fd",
    marginLeft: -8,
    zIndex: 1,
  },
  moreApplicants: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -8,
    zIndex: 0,
  },
  moreText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  newRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
  },
  newRequestText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  navItem: {
    alignItems: "center",
    gap: 4,
  },
  navIconContainer: {
    position: "relative",
  },
  navBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  navBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  navText: {
    fontSize: 12,
    color: "#666",
  },
  navTextActive: {
    color: "#1e40af",
    fontWeight: "500",
  },
  mapFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    padding: 24,
  },
  mapFallbackText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    textAlign: "center",
  },
  mapFallbackSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
  },
  mockMarkersContainer: {
    marginTop: 24,
    width: "100%",
  },
  mockMarkerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  mockMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  mockMarkerText: {
    fontSize: 14,
    color: "#374151",
  },
  // Bottom Drawer Styles
  bottomDrawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  drawerScrollView: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingBottom: 10,
  },
  dragHandleContainer: {
    paddingVertical: 8,
    alignItems: "center",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
  },
  categoriesContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  categoryChip: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    marginRight: 10,
    width: 100,
    height: 126,
  },
  categoryChipActive: {
    backgroundColor: "#1e40af",
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  categoryIconContainerActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  categoryName: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  categoryNameActive: {
    color: "#fff",
  },
  categoryPrice: {
    fontSize: 11,
    color: "#6b7280",
  },
  categoryPriceActive: {
    color: "rgba(255,255,255,0.8)",
  },
  inputSection: {
    marginTop: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1a1a2e",
  },
  suggestionsSection: {
    marginTop: 12,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 8,
  },
  suggestionsContainer: {
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  suggestionText: {
    fontSize: 12,
    color: "#1e40af",
  },
  // Image Upload Styles
  uploadSection: {
    marginTop: 12,
  },
  uploadLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 8,
  },
  uploadContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  uploadButton: {
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#dbeafe",
    borderStyle: "dashed",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  uploadButtonText: {
    fontSize: 11,
    color: "#1e40af",
    fontWeight: "500",
  },
  uploadedImageContainer: {
    width: 70,
    height: 70,
    position: "relative",
  },
  uploadedImagePlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadedImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  ctaButtonSticky: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // Request Card Styles
  requestCard: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  requestCardActive: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  requestCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  requestCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  requestCardIconActive: {
    backgroundColor: "#dbeafe",
  },
  requestCardInfo: {
    flex: 1,
  },
  requestCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  requestCardCategory: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  requestCardClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  requestCardBody: {
    marginBottom: 12,
  },
  requestCardDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  requestCardTracking: {
    fontSize: 13,
    color: "#1d4ed8",
    fontWeight: "600",
    marginTop: 8,
  },
  requestCardBudget: {
    fontSize: 13,
    color: "#1e40af",
    fontWeight: "500",
    marginTop: 6,
  },
  requestCardImages: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  requestCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  requestCardStatus: {
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
  requestCardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  requestCardDotActive: {
    backgroundColor: "#1d4ed8",
  },
  reviewActions: {
    marginTop: 12,
    marginBottom: 6,
  },
  reviewButton: {
    backgroundColor: "#1e40af",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  reviewButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  reviewedBadge: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewedText: {
    color: "#065f46",
    fontSize: 13,
    fontWeight: "600",
  },
  offersSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  offersTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  offerCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#10b981",
  },
  offerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  technicianInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  technicianName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 2,
  },
  technicianEmail: {
    fontSize: 13,
    color: "#6b7280",
  },
  technicianPhoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  technicianPhone: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  technicianStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  technicianProfilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  defaultProfilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  technicianDetails: {
    flex: 1,
  },
  technicianNameContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  missionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  missionText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  offerPrice: {
    fontSize: 18,
    fontWeight: "700",
    color: "#059669",
  },
  offerMessage: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 12,
    fontStyle: "italic",
  },
  offerActions: {
    flexDirection: "row",
    gap: 12,
  },
  workerCardInline: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  workerCardInlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workerCardInlineAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  workerCardInlineAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  workerCardInlineDetails: {
    flex: 1,
  },
  workerCardInlineName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  workerCardInlineStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  workerCardInlineStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  workerCardInlineStatText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  workerCardInlinePhone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  workerCardInlinePhoneText: {
    fontSize: 13,
    color: "#1e40af",
    fontWeight: "500",
  },
  acceptButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  refuseButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ef4444",
    gap: 6,
  },
  refuseButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
  },
});

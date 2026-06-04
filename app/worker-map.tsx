import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import api, { API_URL, testBackendConnection } from "@/src/services/api";
import { Demand } from "@/src/services/demandStorage";
import {
  getAuthToken,
  getCurrentUserId,
  getSessionUser,
  refreshSessionUser,
  setTechnicianWorkerMode,
  signOut,
} from "@/src/services/firebaseAuth";
import { notificationService } from "@/src/services/notificationService";
import {
  acceptOrder,
  cancelOrder,
  completeMission,
  getPlatformFeeForRequest,
  getWorkerAcceptedOffers,
  getWorkerOffers,
  getWorkerOrders,
} from "@/src/services/orderService";
import socketService from "@/src/services/socketService";
import {
  getWorkerSoldData,
  updateLocation,
} from "@/src/services/workerService";
import { useIsFocused } from "@react-navigation/native";
import { useFocusEffect, useRouter } from "expo-router";
import { WebView } from "react-native-webview";

// Memoized component for pending offer cards to prevent unnecessary re-renders
const PendingOfferCard = React.memo(
  ({ pendingOffer, index }: { pendingOffer: any; index: number }) => (
    <View key={pendingOffer.id} style={styles.pendingOfferCard}>
      <View style={styles.pendingOfferHeader}>
        <View style={styles.pendingOfferIcon}>
          <MaterialCommunityIcons name="clock" size={20} color="#f59e0b" />
        </View>
        <View style={styles.pendingOfferInfo}>
          <Text style={styles.pendingOfferTitle}>
            {pendingOffer.request?.title || "Offre"}
          </Text>
          <Text style={styles.pendingOfferPrice}>{pendingOffer.price} DH</Text>
        </View>
      </View>
    </View>
  ),
);
PendingOfferCard.displayName = "PendingOfferCard";
const API_POLLING_INTERVAL = 20000; // 20 seconds (reduced from 10 for performance)
const LOCATION_UPDATE_INTERVAL = 60000; // 60 seconds (reduced from 30 for performance)

const { width, height } = Dimensions.get("window");
const TOMTOM_API_KEY = "fNHGLTzpUrXxutlO1isAEKh8pNV1S645";

// Define Region type
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Job Offer type
interface JobOffer {
  id: string;
  source?: "backend" | "local";
  title: string;
  category: string | { name: string };
  description: string;
  location: string;
  distance: string;
  budget: string;
  clientName: string;
  clientPhone: string;
  clientProfilePicture?: string;
  clientCity: string;
  clientRating: number;
  urgency: string;
  status: string;
  latitude: number;
  longitude: number;
  request?: {
    images?: string[];
  };
  // Fields for accepted missions
  isAcceptedMission?: boolean;
  offerId?: string;
  originalPrice?: string;
  acceptedPrice?: string;
  // Navigation fields
  clientLocation?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  needsNavigation?: boolean;
}

// Convert Demand to JobOffer format
const convertDemandToJobOffer = (
  demand: Demand,
  workerLat: number,
  workerLon: number,
): JobOffer => {
  const distanceKm = demand.location
    ? computeDistanceKm(
        workerLat,
        workerLon,
        demand.location.latitude,
        demand.location.longitude,
      )
    : null;

  return {
    id: demand.id,
    source: "local",
    title: demand.categoryName,
    category: demand.categoryName,
    description: demand.description,
    location: demand.location ? "À proximité" : "Non spécifié",
    distance: formatDistance(distanceKm),
    budget: demand.budget.includes("DH")
      ? demand.budget
      : `${demand.budget} DH`,
    clientName: demand.clientName,
    clientPhone: demand.clientPhone || "",
    clientCity: demand.city || "",
    clientRating: demand.clientRating,
    urgency: demand.urgency,
    status: "OPEN",
    latitude: demand.location?.latitude || workerLat,
    longitude: demand.location?.longitude || workerLon,
  };
};

const formatBudgetForInput = (budget: string) => {
  const cleaned = budget
    .replace(/\s*DH\s*/gi, "")
    .replace(/[^0-9.,]/g, "")
    .trim();
  return cleaned || "";
};

const formatBudgetValue = (value: unknown) => {
  if (value == null || value === "") {
    return "Non spécifié";
  }

  if (typeof value === "number") {
    return `${value} DH`;
  }

  const text = String(value).trim();
  if (!text) return "Non spécifié";
  if (/dh/i.test(text)) return text;
  return `${text} DH`;
};

const computeDistanceKm = (
  workerLat: number,
  workerLon: number,
  orderLat?: number,
  orderLng?: number,
): number | null => {
  if (orderLat == null || orderLng == null) {
    return null;
  }
  if (!Number.isFinite(workerLat) || !Number.isFinite(workerLon)) {
    return null;
  }
  if (!Number.isFinite(orderLat) || !Number.isFinite(orderLng)) {
    return null;
  }

  const distance = calculateDistance(workerLat, workerLon, orderLat, orderLng);
  return distance;
};

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm == null) return "Localisation...";
  return `${distanceKm.toFixed(1)} km`;
};

// Calculate distance between coordinates
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

const toFiniteNumberOrNull = (value: any): number | null => {
  if (value == null) return null;
  const n =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
};

const resolveOrderLatitude = (order: any) =>
  toFiniteNumberOrNull(
    order?.latitude ??
      order?.lat ??
      order?.request?.latitude ??
      order?.request?.lat ??
      order?.location?.latitude ??
      order?.location?.lat,
  );

const resolveOrderLongitude = (order: any) =>
  toFiniteNumberOrNull(
    order?.longitude ??
      order?.lng ??
      order?.request?.longitude ??
      order?.request?.lng ??
      order?.location?.longitude ??
      order?.location?.lng,
  );

export default function WorkerMapScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(true);
  const navigationToNotificationsStartedAtRef = useRef<number | null>(null);
  const webSocketListenersCleanupRef = useRef<null | (() => void)>(null);
  const fallbackPollingCleanupRef = useRef<null | (() => void)>(null);
  const [isTransitioningAway, setIsTransitioningAway] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [region, setRegion] = useState<Region | null>(null);
  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("utilisateur@email.com");
  const [realUserName, setRealUserName] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const latestWorkerCoordsRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const webSocketInitializedRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const tripAutoFitArmedRef = useRef(false);
  const missionCompletionFeeRef = useRef<any>(null);
  const [storedFeeData, setStoredFeeData] = useState<any>(null);
  const [showRecenter, setShowRecenter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    console.log("🧩 [worker-map] mounted");

    // Fetch real user name and profile picture from database
    const fetchRealUserName = async () => {
      try {
        const user = await getSessionUser();
        if (user?.fullName) {
          setRealUserName(user.fullName);
          console.log("✅ Real user name fetched:", user.fullName);
        }

        // Fetch profile picture from API
        const token = await getAuthToken();
        authTokenRef.current = token || null;
        setAuthToken(token || null);
        if (token) {
          const response = await api.get("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = response.data || {};
          console.log("🔍 Worker-map profile data received:", {
            profilePicture: data.profilePicture,
            profilePictureType: typeof data.profilePicture,
            hasProfilePicture: !!data.profilePicture,
            technicianProfile: data.technicianProfile,
            quotaData: {
              sold: data.technicianProfile?.sold,
              freeMissionCount: data.technicianProfile?.freeMissionCount,
              freeMissionMonth: data.technicianProfile?.freeMissionMonth,
              freeMissionYear: data.technicianProfile?.freeMissionYear,
              remainingFreeMissions:
                data.technicianProfile?.remainingFreeMissions,
            },
          });

          // Store quota data in state
          if (data.technicianProfile) {
            setQuotaData({
              sold: data.technicianProfile.sold || 0,
              freeMissionCount: data.technicianProfile.freeMissionCount || 0,
              freeMissionMonth:
                data.technicianProfile.freeMissionMonth ||
                new Date().getMonth() + 1,
              freeMissionYear:
                data.technicianProfile.freeMissionYear ||
                new Date().getFullYear(),
              remainingFreeMissions:
                data.technicianProfile.remainingFreeMissions || 0,
            });
          }

          const profileImage =
            data.profilePicture ||
            data.TechnicianProfile?.profilePicture ||
            null;

          if (profileImage) {
            const rawProfilePicture = String(profileImage);
            const baseUrl = String(api.defaults.baseURL || "").replace(
              /\/+$/,
              "",
            );

            const fullProfilePictureUrl = rawProfilePicture.startsWith("http")
              ? rawProfilePicture
              : `${baseUrl}/${rawProfilePicture.replace(/^\/+/, "")}`;

            setProfilePicture(fullProfilePictureUrl);

            console.log(
              "✅ Worker-map profile picture set:",
              fullProfilePictureUrl,
            );
          } else {
            setProfilePicture(null);
          }
        }
      } catch (error) {
        console.error(
          "Error fetching real user name and profile picture:",
          error,
        );
      }
    };

    fetchRealUserName();

    return () => {
      console.log("🧩 [worker-map] unmounted");
      try {
        webSocketListenersCleanupRef.current?.();
      } catch {}
      webSocketListenersCleanupRef.current = null;
      try {
        fallbackPollingCleanupRef.current?.();
      } catch {}
      fallbackPollingCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    isFocusedRef.current = isFocused;
    console.log("👁️ [worker-map] focus:", {
      isFocused,
      ts: Date.now(),
      sinceNotificationsPressMs:
        navigationToNotificationsStartedAtRef.current != null
          ? Date.now() - navigationToNotificationsStartedAtRef.current
          : null,
    });

    if (!isFocused) {
      console.log(
        "🧹 [worker-map] blur cleanup: stopping WebView + intervals/listeners",
      );
      try {
        // Best-effort stop WebView work ASAP during transitions
        (webViewRef.current as any)?.stopLoading?.();
        webViewRef.current?.injectJavaScript?.(`
          try { if (window.clearTrip) window.clearTrip(); } catch (e) {}
          true;
        `);
      } catch {}

      try {
        webSocketListenersCleanupRef.current?.();
      } catch {}
      webSocketListenersCleanupRef.current = null;

      try {
        fallbackPollingCleanupRef.current?.();
      } catch {}
      fallbackPollingCleanupRef.current = null;
    } else {
      if (isTransitioningAway) {
        console.log(
          "✅ [worker-map] focus restore: clearing transition-away flag",
        );
        setIsTransitioningAway(false);
      }
      // Re-register listeners if we explicitly removed them on blur.
      if (
        workerId &&
        workerRole === "TECHNICIAN" &&
        webSocketInitializedRef.current &&
        !webSocketListenersCleanupRef.current
      ) {
        console.log(
          "🎧 [worker-map] focus restore: re-registering WebSocket listeners",
        );
        webSocketListenersCleanupRef.current = setupWebSocketListeners();
      }

      if (fallbackPolling && !fallbackPollingCleanupRef.current) {
        console.log(
          "🔁 [worker-map] focus restore: restarting fallback polling",
        );
        startFallbackPolling();
      }
    }
  }, [isFocused]);

  // Worker state
  const [credits, setCredits] = useState(150);
  const [jobOffers, setJobOffers] = useState<JobOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<JobOffer | null>(null);
  const [activeTrip, setActiveTrip] = useState<JobOffer | null>(null);
  const [activeTripOfferId, setActiveTripOfferId] = useState<string | null>(
    null,
  );
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerRole, setWorkerRole] = useState<string | null>(null);
  const [isCheckingVerification, setIsCheckingVerification] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [pendingOffers, setPendingOffers] = useState<any[]>([]);
  const [soldData, setSoldData] = useState<any>(null);
  const [balanceAlertVisible, setBalanceAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [proposedPrice, setProposedPrice] = useState("");
  const [quotaData, setQuotaData] = useState<{
    sold: number;
    freeMissionCount: number;
    freeMissionMonth: number;
    freeMissionYear: number;
    remainingFreeMissions: number;
  } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [completedMissionData, setCompletedMissionData] = useState({
    requestId: "",
    title: "",
    originalPrice: 0,
    feeAmount: 0,
    netAmount: 0,
  });

  // WebSocket state
  const [socketConnected, setSocketConnected] = useState(false);
  const [newRequestCount, setNewRequestCount] = useState(0);
  const [fallbackPolling, setFallbackPolling] = useState(false);

  // Helper function to check verification status consistently
  const isUserVerified = (user: any) => {
    return (
      user?.role === "TECHNICIAN" &&
      (user as any)?.TechnicianProfile?.isVerified === true
    );
  };

  // Bottom drawer state
  const drawerHeight = useRef(new Animated.Value(height * 0.35)).current;
  const drawerHeightValueRef = useRef(height * 0.35);
  const drawerState = useRef(1); // 0 = peek (10%), 1 = default (35%), 2 = expanded (75%)
  const isMapInteracting = useRef(false);
  const interactionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuAnimation = useRef(new Animated.Value(-width)).current;

  const DRAWER_HEIGHTS = {
    PEEK: height * 0.15, // Small but visible for navigation
    DEFAULT: height * 0.35, // Normal default height
    EXPANDED: height * 0.7, // Full expanded for details
  };

  // Sync animated value with state
  useEffect(() => {
    const listener = drawerHeight.addListener(({ value }) => {
      drawerHeightValueRef.current = value;
    });
    return () => drawerHeight.removeListener(listener);
  }, []);

  useEffect(() => {
    const latitude = location?.coords?.latitude ?? region?.latitude;
    const longitude = location?.coords?.longitude ?? region?.longitude;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      latestWorkerCoordsRef.current = {
        latitude: latitude as number,
        longitude: longitude as number,
      };
      if (__DEV__) {
        console.log(
          "📍 [worker-map] latestWorkerCoordsRef updated:",
          latestWorkerCoordsRef.current,
        );
      }
    }
  }, [
    location?.coords?.latitude,
    location?.coords?.longitude,
    region?.latitude,
    region?.longitude,
  ]);

  const animateDrawer = (toValue: number, state: number) => {
    drawerState.current = state;
    Animated.spring(drawerHeight, {
      toValue,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  // Handle map interaction
  const handleMapInteractionStart = () => {
    isMapInteracting.current = true;
    // Disable auto-recentering inside the WebView map once the user starts panning/zooming.
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        try {
          if (window.setAutoFitEnabled) window.setAutoFitEnabled(false);
          window.__autoFit = false;
        } catch (e) {}
        true;
      `);
    }
    // Don't automatically minimize drawer - let state management control it
  };

  const handleMapInteractionEnd = () => {
    isMapInteracting.current = false;
    if (interactionTimeout.current) {
      clearTimeout(interactionTimeout.current);
    }
    interactionTimeout.current = setTimeout(() => {
      if (
        !isMapInteracting.current &&
        drawerState.current === 0 &&
        !selectedOffer
      ) {
        animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
      }
    }, 500);
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

  // Menu animation
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

  // Consolidated initialization - single verification and setup
  useEffect(() => {
    const initializeWorkerMap = async () => {
      try {
        // Single API call for verification and user data
        const user = await refreshSessionUser();
        if (!isUserVerified(user)) {
          router.replace("/worker-registration");
          return;
        }

        // Set user data in parallel with other operations
        setWorkerId(user?.id ? String(user.id) : null);
        setWorkerRole(user?.role ?? null);
        setIsCheckingVerification(false);

        // Parallel initialization
        await Promise.all([
          requestLocationPermission(),
          testBackendConnection().then((isConnected) => {
            if (!isConnected) {
              console.warn("Backend not reachable");
            }
          }),
        ]);
      } catch (error) {
        console.error("❌ Worker map initialization failed:", error);
        router.replace("/worker-registration");
      }
    };

    initializeWorkerMap();
  }, [router]);

  // Initial load and WebSocket integration (initialize once; don't restart on GPS updates).
  useEffect(() => {
    if (!workerId || workerRole !== "TECHNICIAN") return;
    if (webSocketInitializedRef.current) return;
    webSocketInitializedRef.current = true;

    let disposed = false;
    let removeListeners: (() => void) | null = null;

    const waitForFirstFix = async () => {
      // Wait for first GPS fix so distances are correct immediately (no Casablanca fallback).
      if (latestWorkerCoordsRef.current) return;

      const startedAt = Date.now();
      const TIMEOUT_MS = 8000;
      while (!disposed) {
        if (latestWorkerCoordsRef.current) return;
        if (Date.now() - startedAt > TIMEOUT_MS) {
          console.warn(
            "⏳ [worker-map] Timed out waiting for first GPS fix; continuing anyway",
          );
          return;
        }
        await new Promise((res) => setTimeout(res, 250));
      }
    };

    const initializeWebSocket = async () => {
      try {
        console.log("🧷 [worker-map] Initializing WebSocket for technician:", {
          workerId,
          workerRole,
        });

        await waitForFirstFix();
        if (disposed) return;

        // Initial load with REST API
        await fetchInitialData();
        if (disposed) return;

        // Connect to WebSocket
        await socketService.connect();
        console.log("🔌 [worker-map] socketService.connect() done");
        await socketService.joinTechnicianRoom();
        console.log("👥 [worker-map] joined technicians room");

        // Setup WebSocket event listeners
        removeListeners = setupWebSocketListeners();
        webSocketListenersCleanupRef.current = removeListeners;
        console.log("🎧 [worker-map] WebSocket listeners registered");
      } catch (error) {
        console.error("❌ WebSocket initialization error:", error);
        // Start fallback polling if WebSocket fails
        startFallbackPolling();
      }
    };

    initializeWebSocket();

    return () => {
      disposed = true;
      // Do not disconnect the global socket here; just remove listeners / leave room for this screen.
      try {
        removeListeners?.();
      } catch {}
      if (webSocketListenersCleanupRef.current === removeListeners) {
        webSocketListenersCleanupRef.current = null;
      }
      try {
        fallbackPollingCleanupRef.current?.();
      } catch {}
      fallbackPollingCleanupRef.current = null;
      socketService.leaveTechnicianRoom();
    };
  }, [workerId, workerRole]);

  // Refresh data when screen comes into focus (disabled to prevent map flickering)
  useFocusEffect(
    React.useCallback(() => {
      if (workerId && workerRole === "TECHNICIAN") {
        console.log(
          "🎯 [worker-map] Screen focused - skipping refresh to prevent map flickering",
        );

        // Platform fee auto-test disabled to prevent annoying error logs
        // setTimeout(() => {
        //   console.log('🧪 AUTO-TEST: Testing platform fee endpoint for request ID 96...');
        //   getPlatformFeeForRequest('96').then(feeData => {
        //     console.log('💰 AUTO-TEST: Platform fee data for request 96:', feeData);
        //     console.log('🔍 AUTO-TEST: Fee data type:', typeof feeData);
        //     console.log('🔍 AUTO-TEST: Fee data keys:', feeData ? Object.keys(feeData) : 'null');
        //
        //     if (feeData) {
        //       console.log('✅ AUTO-TEST: Platform fee found:');
        //       console.log('   Original Price:', feeData.originalPrice);
        //       console.log('   Fee Amount:', feeData.feeAmount);
        //       console.log('   Net Amount:', feeData.netAmount);
        //       console.log('   Fee Percentage:', feeData.feePercentage);
        //     } else {
        //       console.log('❌ AUTO-TEST: No platform fee data found for request 96');
        //     }
        //   }).catch(error => {
        //     console.error('❌ AUTO-TEST: Error testing platform fee endpoint:', error);
        //   });
        // }, 2000);
      }
      return () => {
        console.log("🎯 [worker-map] Screen unfocused");
      };
    }, [workerId, workerRole]),
  );

  // API polling for real-time database updates
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!workerId || workerRole !== "TECHNICIAN") return;

    // Initial data fetch
    fetchInitialData().catch((error) => {
      console.error("❌ Error in initial data fetch:", error);
    });

    // Set up periodic polling every 5 seconds for near-instant updates
    const reloadInterval = setInterval(() => {
      fetchInitialData(true).catch((error) => {
        console.error("❌ Error in periodic polling:", error);
      });
    }, 5000); // 5 seconds

    return () => {
      clearInterval(reloadInterval);
    };
  }, [workerId, workerRole, isFocused, isTransitioningAway]);

  // Fetch initial data from REST API
  const fetchInitialData = async (isPollingRefresh = false) => {
    try {
      const workerLat = location?.coords?.latitude ?? region?.latitude;
      const workerLon = location?.coords?.longitude ?? region?.longitude;
      const [orderList, workerOffers] = await Promise.all([
        getWorkerOrders({
          ...(workerLat != null ? { latitude: workerLat } : {}),
          ...(workerLon != null ? { longitude: workerLon } : {}),
        }).catch((error) => {
          console.error("❌ Timeout in getWorkerOrders:", error.message);
          return []; // Return empty array on timeout
        }),
        getWorkerAcceptedOffers().catch((error) => {
          console.error(
            "❌ Timeout in getWorkerAcceptedOffers:",
            error.message,
          );
          return []; // Return empty array on timeout
        }),
      ]);

      processOrdersData(orderList, workerOffers, isPollingRefresh);
    } catch (error) {
      console.error("❌ Initial data fetch error:", error);
    }
  };

  // Process orders data and update state
  const processOrdersData = async (
    orderList: any[],
    workerOffers: any[],
    isPollingRefresh = false,
  ) => {
    const workerLat = location?.coords.latitude ?? region?.latitude;
    const workerLon = location?.coords.longitude ?? region?.longitude;

    // Filter out cancelled and deleted requests from database response
    // Backend already applies 15km Haversine filter
    const activeOrders = orderList.filter(
      (order) =>
        order.status !== "CANCELLED" &&
        order.status !== "DELETED" &&
        order.status !== "COMPLETED",
    );

    // Convert API orders to JobOffer format
    // Backend already applies 15km Haversine filter, no need to recalculate distances
    const openOffers = activeOrders.map((order: any) => {
      const orderLat = resolveOrderLatitude(order);
      const orderLon = resolveOrderLongitude(order);
      const distanceKm =
        workerLat != null && workerLon != null
          ? computeDistanceKm(
              workerLat,
              workerLon,
              orderLat ?? undefined,
              orderLon ?? undefined,
            )
          : null;
      return {
        id: order.id,
        source: "backend" as const,
        title: order.title || "Service Request",
        category: order.category || "General",
        description: order.description || "",
        location:
          order.addressText ||
          order.locationText ||
          order.request?.addressText ||
          order.request?.locationText ||
          "À proximité",
        distance: formatDistance(distanceKm),
        budget: formatBudgetValue(
          order.budget ?? order.price ?? order.request?.budget,
        ),
        clientName: order.clientName || "Client",
        clientPhone: order.User?.phone || order.clientPhone || "",
        clientCity: order.User?.city || order.city || "",
        clientRating: order.clientRating || 5.0,
        urgency: order.urgency || "Normal",
        latitude: orderLat ?? 33.5731,
        longitude: orderLon ?? -7.5898,
        status: "OPEN",
        request: {
          images: order.images || [],
        },
        isNew: false, // Track for UX animations
      };
    });

    // Convert accepted offers to JobOffer format
    const acceptedOffers = workerOffers.map((offer: any) => {
      const clientLat =
        offer.Request?.latitude || offer.Request?.location?.latitude || 33.5731;
      const clientLon =
        offer.Request?.longitude ||
        offer.Request?.location?.longitude ||
        -7.5898;
      const clientAddress =
        offer.Request?.addressText ||
        offer.Request?.location?.addressText ||
        "Client Location";
      const distanceKm =
        workerLat != null && workerLon != null
          ? computeDistanceKm(workerLat, workerLon, clientLat, clientLon)
          : null;

      const missionData = {
        id: `mission-${offer.id}`,
        source: "backend" as const,
        title: "Mission en cours",
        category: offer.Request?.category || "Service",
        description: offer.Request?.description || "Service en cours",
        location: clientAddress,
        distance: formatDistance(distanceKm),
        budget: formatBudgetValue(offer.price),
        clientName:
          offer.Client?.fullName || offer.Request?.User?.fullName || "Client",
        clientPhone:
          offer.Client?.phone ||
          offer.Request?.User?.phone ||
          offer.Request?.phone ||
          "",
        clientProfilePicture:
          offer.Client?.profilePicture ||
          offer.Request?.User?.profilePicture ||
          offer.Request?.clientProfilePicture ||
          "",
        clientCity:
          offer.Client?.city ||
          offer.Request?.User?.city ||
          offer.Request?.city ||
          "",
        clientRating: 5.0,
        urgency: "Normal" as const,
        status: String(offer.status ?? "ACCEPTED"),
        latitude: clientLat,
        longitude: clientLon,
        request: {
          images: offer.Request?.images || [],
        },
        isAcceptedMission: true,
        offerId: offer.id,
        originalPrice: "N/A",
        acceptedPrice: formatBudgetValue(offer.price),
        clientLocation: {
          latitude: clientLat,
          longitude: clientLon,
          address: clientAddress,
        },
        needsNavigation: true,
      };

      // Auto-start navigation for accepted missions, but preserve existing navigation during polling
      if (offer.status === "ACCEPTED") {
        setTimeout(() => {
          // Only start navigation if not already navigating to this mission OR if this is initial load
          if (
            !isPollingRefresh &&
            (!activeTrip || activeTrip.offerId !== offer.id)
          ) {
            startNavigationToClient(missionData);
          } else if (
            isPollingRefresh &&
            activeTrip &&
            activeTrip.offerId === offer.id
          ) {
          } else if (isPollingRefresh) {
          }
        }, 1000);
      }

      return missionData;
    });

    // Combine open requests and accepted offers
    const allOffers = [...openOffers, ...acceptedOffers];
    setJobOffers(allOffers);
  };

  // Setup WebSocket event listeners
  const setupWebSocketListeners = () => {
    console.log("🎛️ [worker-map] setupWebSocketListeners()");
    const cleanups: Array<() => void> = [];

    // Connection status
    const onConnectionStatus = (status: any) => {
      console.log("📡 [worker-map] connection_status:", status);
      setSocketConnected(status.connected);
      setFallbackPolling(!status.connected);
    };
    socketService.on("connection_status", onConnectionStatus);
    cleanups.push(() =>
      socketService.off("connection_status", onConnectionStatus),
    );

    // New request received
    const onNewRequest = (requestData: any) => {
      console.log("📨 New request via WebSocket:", requestData);

      // Convert to JobOffer format
      const reqLat = resolveOrderLatitude(requestData);
      const reqLon = resolveOrderLongitude(requestData);
      console.log("🧮 [worker-map] new_request coords:", {
        worker: latestWorkerCoordsRef.current,
        request: {
          lat: reqLat,
          lon: reqLon,
          latType: typeof reqLat,
          lonType: typeof reqLon,
        },
      });

      const workerLat = latestWorkerCoordsRef.current?.latitude;
      const workerLon = latestWorkerCoordsRef.current?.longitude;
      const distanceKm =
        workerLat != null && workerLon != null
          ? computeDistanceKm(
              workerLat,
              workerLon,
              reqLat ?? undefined,
              reqLon ?? undefined,
            )
          : null;

      // Filter requests beyond 15km to match backend Haversine filter
      if (distanceKm !== null && distanceKm > 15) {
        console.log(
          "📍 [worker-map] new_request filtered out: distance > 15km",
          { distance: distanceKm },
        );
        return;
      }

      const newOffer = {
        id: requestData.id,
        source: "backend" as const,
        title: requestData.title || "Service Request",
        category: requestData.category || "General",
        description: requestData.description || "",
        location:
          requestData.addressText || requestData.locationText || "À proximité",
        distance: formatDistance(distanceKm),
        budget: formatBudgetValue(requestData.budget || requestData.price),
        clientName:
          requestData.Client?.fullName || requestData.clientName || "Client",
        clientPhone:
          requestData.Client?.phone ||
          requestData.User?.phone ||
          requestData.clientPhone ||
          "",
        clientProfilePicture:
          requestData.Client?.profilePicture ||
          requestData.User?.profilePicture ||
          "",
        clientCity:
          requestData.Client?.city ||
          requestData.User?.city ||
          requestData.city ||
          "",
        clientRating: requestData.clientRating || 5.0,
        urgency: requestData.urgency || "Normal",
        latitude: reqLat ?? 33.5731,
        longitude: reqLon ?? -7.5898,
        status: "OPEN",
        request: {
          images: requestData.images || [],
        },
        isNew: true, // Mark as new for UX animations
      };

      // Add to job offers instantly (avoid duplicates)
      setJobOffers((prev) => {
        console.log(
          "🔄 [worker-map] setJobOffers called with prev count:",
          prev.length,
        );

        if (prev.some((offer) => offer.id === newOffer.id)) {
          if (__DEV__)
            console.log(
              "⏭️ [worker-map] new_request ignored (duplicate):",
              newOffer.id,
            );
          return prev; // Avoid duplicates
        }

        const newOffers = [newOffer, ...prev];
        console.log(
          "🔄 [worker-map] New jobOffers state after update:",
          newOffers.length,
        );
        console.log("🔄 [worker-map] jobOffers array after update:", newOffers);

        return newOffers;
      });

      // Increment new request count for badge
      setNewRequestCount((count) => count + 1);

      // Create notification for new request
      notificationService
        .addNotification(
          notificationService.createSystemNotification(
            "Nouvelle Demande",
            `Nouvelle demande disponible: ${newOffer.title || "Service requis"}`,
          ),
        )
        .catch((error: any) => {
          console.error("Error creating new request notification:", error);
        });

      console.log("➕ [worker-map] new_request added to jobOffers:", {
        id: newOffer.id,
        latitude: newOffer.latitude,
        longitude: newOffer.longitude,
      });

      // Also trigger immediate data refresh to ensure this request appears in API fetch results
      setTimeout(() => {
        console.log(
          "🔄 [worker-map] Triggering immediate data refresh after new request",
        );
        fetchInitialData().catch((error) => {
          console.error(
            "❌ Error in immediate refresh after new request:",
            error,
          );
        });
      }, 500); // Small delay to ensure WebSocket event is processed
    };
    socketService.on("new_request", onNewRequest);
    cleanups.push(() => socketService.off("new_request", onNewRequest));

    // Offer accepted
    const onOfferAccepted = (offerData: any) => {
      console.log("✅ Offer accepted via WebSocket:", offerData);
      console.log(
        "🔍 Marking request as accepted (keeping it visible):",
        offerData.requestId,
      );

      // Find the accepted request in jobOffers to convert to active trip
      setJobOffers((prev) => {
        const acceptedRequest = prev.find(
          (offer) => offer.id === offerData.requestId,
        );
        const next = prev.map((offer) =>
          offer.id === offerData.requestId
            ? {
                ...offer,
                isAcceptedMission: true,
                offerId: String(offerData.offerId ?? offer.offerId ?? ""),
                status: "ACCEPTED",
              }
            : offer,
        );
        console.log(
          "🔍 JobOffers after marking accepted:",
          next.map((o) => ({
            id: o.id,
            title: o.title,
            accepted: !!o.isAcceptedMission,
          })),
        );

        // Set the accepted request as active trip for navigation
        if (acceptedRequest) {
          console.log(
            "🚀 Setting active trip for accepted request:",
            acceptedRequest,
          );

          // Ensure clientLocation is properly set for navigation
          const missionWithLocation: JobOffer = {
            ...acceptedRequest,
            isAcceptedMission: true,
            offerId: String(offerData.offerId ?? acceptedRequest.offerId ?? ""),
            status: "ACCEPTED",
            clientLocation: {
              latitude: acceptedRequest.latitude,
              longitude: acceptedRequest.longitude,
              address: acceptedRequest.location ?? "",
            },
          };

          console.log("🔍 Mission with clientLocation:", missionWithLocation);

          setActiveTrip(missionWithLocation);
          setActiveTripOfferId(String(offerData.offerId));
          setSelectedOffer(null);
          setProposedPrice("");

          // Start navigation immediately
          setTimeout(() => {
            startNavigationToClient(missionWithLocation);
          }, 500);
        }

        // Keep the accepted request in the list (it will move to "accepted missions")
        return acceptedRequest ? next : prev;
      });

      // Also clear from pending offers if it exists there
      setPendingOffers((prev) => {
        const filtered = prev.filter(
          (offer) => offer.request?.id !== offerData.requestId,
        );
        console.log(
          "🔍 Pending offers after removing accepted request:",
          filtered.map((o) => ({ id: o.id, requestId: o.request?.id })),
        );
        return filtered;
      });
    };
    socketService.on("offer_accepted", onOfferAccepted);
    cleanups.push(() => socketService.off("offer_accepted", onOfferAccepted));

    // Request updated
    const onRequestUpdated = (requestData: any) => {
      console.log("🔄 Request updated via WebSocket:", requestData);

      // Handle mission completion (status: DONE)
      if (requestData.status === "DONE") {
        console.log("🎯 Mission completed, opening rating screen");
        console.log("🔍 requestData:", requestData);
        console.log("🔍 activeTrip before clearing:", activeTrip);

        // Rating screen is already opened directly from handleCompleteMission
        // Just clear the state and refresh data

        // Clear active trip and related state
        setActiveTrip(null);
        setActiveTripOfferId(null);
        setSelectedOffer(null);
        setShowRecenter(false);

        // Clear completed mission from job offers
        setJobOffers((prev) =>
          prev.filter((offer) => {
            const requestIdMatch = offer.request?.id !== requestData.id;
            const requestStatusMatch =
              offer.request?.status !== "DONE" &&
              offer.request?.status !== "COMPLETED";
            const offerStatusMatch =
              offer.status !== "DONE" && offer.status !== "COMPLETED";
            return requestIdMatch && requestStatusMatch && offerStatusMatch;
          }),
        );

        // Clear completed mission from pending offers
        setPendingOffers((prev) =>
          prev.filter((offer) => {
            const requestIdMatch = offer.request?.id !== requestData.id;
            const requestStatusMatch =
              offer.request?.status !== "DONE" &&
              offer.request?.status !== "COMPLETED";
            const offerStatusMatch =
              offer.status !== "DONE" && offer.status !== "COMPLETED";
            return requestIdMatch && requestStatusMatch && offerStatusMatch;
          }),
        );

        // Force drawer to default state
        animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);

        // Clear stored fee data
        missionCompletionFeeRef.current = null;
        setStoredFeeData(null);

        return; // Don't update job offers for completed missions
      }

      // Find and update the request
      setJobOffers((prev) =>
        prev.map((offer) =>
          offer.id === requestData.id ? { ...offer, ...requestData } : offer,
        ),
      );
    };
    socketService.on("request_updated", onRequestUpdated);
    cleanups.push(() => socketService.off("request_updated", onRequestUpdated));

    // Request cancelled
    const onRequestCancelled = (requestData: any) => {
      console.log("❌ Request cancelled via WebSocket:", requestData);
      console.log("🔍 Current activeTrip before cleanup:", activeTrip);
      console.log(
        "🔍 Current jobOffers before cleanup:",
        jobOffers.map((o) => ({ id: o.id, title: o.title })),
      );

      // Remove the cancelled request from jobOffers completely
      setJobOffers((prev) => {
        const filtered = prev.filter((offer) => offer.id !== requestData.id);
        console.log(
          "🔍 JobOffers after filtering:",
          filtered.map((o) => ({ id: o.id, title: o.title })),
        );
        return filtered;
      });

      // Clear active trip if it matches the cancelled request
      setActiveTrip((prev) => {
        console.log("🔍 Checking active trip:", prev);
        console.log("🔍 Against cancelled request ID:", requestData.id);
        console.log("🔍 Against mission ID:", `mission-${requestData.id}`);

        if (
          prev &&
          (prev.id === requestData.id ||
            prev.id === `mission-${requestData.id}`)
        ) {
          console.log(
            "🛑 MATCH FOUND - Clearing active trip for cancelled request:",
            requestData.id,
          );

          // Clear map navigation
          webViewRef.current?.injectJavaScript(`
            console.log('🧹 Clearing trip from map...');
            if (window.clearTrip) {
              window.clearTrip();
            }
          `);

          // Clear active trip state
          setActiveTripOfferId(null);
          setSelectedOffer(null);
          setProposedPrice("");

          console.log("🔍 Active trip state cleared");
          return null;
        } else {
          console.log("🔍 No match found - active trip remains:", prev);
          return prev;
        }
      });

      // Also clear from pending offers
      setPendingOffers((prev) => {
        const filtered = prev.filter(
          (offer) => offer.request?.id !== requestData.id,
        );
        console.log(
          "🔍 Pending offers after filtering:",
          filtered.map((o) => ({ id: o.id, requestId: o.request?.id })),
        );
        return filtered;
      });
    };
    socketService.on("request_cancelled", onRequestCancelled);
    cleanups.push(() =>
      socketService.off("request_cancelled", onRequestCancelled),
    );

    // Request deleted
    const onRequestDeleted = (deletedData: any) => {
      console.log("🗑️ Request deleted via WebSocket:", deletedData);

      // Extract the correct request ID from the payload
      const requestId = deletedData.id || deletedData.requestId;
      console.log("🔍 Extracted request ID:", requestId);

      console.log("🔍 Current activeTrip before cleanup:", activeTrip);
      console.log(
        "🔍 Current jobOffers before cleanup:",
        jobOffers.map((o) => ({ id: o.id, title: o.title })),
      );

      // Remove the request from jobOffers
      setJobOffers((prev) => {
        const filtered = prev.filter((offer) => offer.id !== requestId);
        console.log(
          "🔍 JobOffers after filtering:",
          filtered.map((o) => ({ id: o.id, title: o.title })),
        );
        return filtered;
      });

      // Clear active trip if it matches the deleted request
      setActiveTrip((prev) => {
        console.log("🔍 Checking active trip:", prev);
        console.log("🔍 Against deleted request ID:", requestId);
        console.log("🔍 Against mission ID:", `mission-${requestId}`);

        if (
          prev &&
          (prev.id === requestId || prev.id === `mission-${requestId}`)
        ) {
          console.log(
            "🛑 MATCH FOUND - Clearing active trip for deleted request:",
            requestId,
          );

          // Clear map navigation
          webViewRef.current?.injectJavaScript(`
            console.log('🧹 Clearing trip from map...');
            if (window.clearTrip) {
              window.clearTrip();
            }
          `);

          // Clear active trip state
          setActiveTripOfferId(null);
          setSelectedOffer(null);
          setProposedPrice("");

          console.log("🔍 Active trip state cleared");
          return null;
        } else {
          console.log("🔍 No match found - active trip remains:", prev);
          return prev;
        }
      });

      // Also clear from pending offers
      setPendingOffers((prev) => {
        const filtered = prev.filter(
          (offer) => offer.request?.id !== requestId,
        );
        console.log(
          "🔍 Pending offers after filtering:",
          filtered.map((o) => ({ id: o.id, requestId: o.request?.id })),
        );
        return filtered;
      });
    };
    socketService.on("request_deleted", onRequestDeleted);
    cleanups.push(() => socketService.off("request_deleted", onRequestDeleted));

    // Offer refused by client
    const onOfferRefused = (refusedData: any) => {
      console.log("❌ Offer refused by client via WebSocket:", refusedData);

      const offerId = refusedData.offerId || refusedData.id;
      const requestId = refusedData.requestId;

      console.log("🔍 Processing refused offer:", { offerId, requestId });

      // Remove the refused offer from jobOffers
      setJobOffers((prev) => {
        const filtered = prev.filter((offer) => {
          // Remove if it's the exact refused offer
          if (offer.id === offerId) return false;
          // Also remove if it's an offer for the same request that was refused
          if (requestId && offer.request?.id === requestId) return false;
          return true;
        });
        console.log(
          "🔍 JobOffers after removing refused offer:",
          filtered.map((o) => ({ id: o.id, title: o.title })),
        );
        return filtered;
      });

      // Also remove from pending offers to fix the count
      setPendingOffers((prev) => {
        const filtered = prev.filter((offer) => {
          // Remove if it's the exact refused offer
          if (offer.id === offerId) return false;
          // Also remove if it's an offer for the same request that was refused
          if (requestId && offer.request?.id === requestId) return false;
          return true;
        });
        console.log(
          "🔍 PendingOffers after removing refused offer:",
          filtered.map((o) => ({ id: o.id, title: o.title })),
        );
        return filtered;
      });

      // Clear selected offer if it was the refused one
      setSelectedOffer((prev) => {
        if (prev?.id === offerId) {
          console.log("🧹 Clearing selected refused offer");
          return null;
        }
        return prev;
      });
    };
    socketService.on("offer_refused", onOfferRefused);
    cleanups.push(() => socketService.off("offer_refused", onOfferRefused));

    // Check for refused offers and return worker to active requests
    const checkRefusedOffers = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        // Get current worker's offers to check their status
        const currentOffers = [...jobOffers, ...pendingOffers];

        for (const offer of currentOffers) {
          try {
            // Check each offer's current status in the database
            const response = await api.get(`/api/offers/${offer.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            const currentOffer = response.data;
            console.log("🔍 Checking offer status:", {
              offerId: offer.id,
              currentStatus: currentOffer.status,
              previousStatus: offer.status,
            });

            // If offer is refused in database, remove it from worker's active state
            if (currentOffer.status === "REFUSED") {
              console.log(
                "❌ Found refused offer in database, removing from worker state:",
                offer.id,
              );

              // Remove from jobOffers
              setJobOffers((prev) => prev.filter((o) => o.id !== offer.id));

              // Remove from pendingOffers
              setPendingOffers((prev) => prev.filter((o) => o.id !== offer.id));

              // Clear selected offer if it was the refused one
              setSelectedOffer((prev) => (prev?.id === offer.id ? null : prev));

              // Clear active trip if it was the refused offer
              setActiveTrip((prev) => (prev?.id === offer.id ? null : prev));

              console.log(
                "✅ Worker returned to active requests after refused offer removal",
              );
            }
          } catch (offerCheckError) {
            console.warn(
              "⚠️ Failed to check offer status:",
              offer.id,
              offerCheckError,
            );
          }
        }
      } catch (error) {
        console.error("❌ Error checking refused offers:", error);
      }
    };

    // Fallback polling
    const onFallbackPoll = async () => {
      try {
        await fetchInitialData();
        // Also check for refused offers during fallback polling
        await checkRefusedOffers();
      } catch (error) {
        console.error("❌ Fallback polling error:", error);
        // If backend has data inconsistencies, clear orphaned active trips
        if (
          (error as any)?.message?.includes("PrismaClientUnknownRequestError")
        ) {
          console.log(
            "🔧 Backend data inconsistency detected, cleaning up orphaned trips",
          );
          setActiveTrip(null);
          setActiveTripOfferId(null);
          setSelectedOffer(null);
          setProposedPrice("");

          // Clear map navigation
          webViewRef.current?.injectJavaScript(`
            if (window.clearTrip) {
              window.clearTrip();
            }
          `);
        }
      }
    };
    socketService.on("fallback_poll", onFallbackPoll);
    cleanups.push(() => socketService.off("fallback_poll", onFallbackPoll));

    return () => {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
  };

  // Start fallback polling
  const startFallbackPolling = () => {
    console.log("🔄 Starting fallback polling");
    setFallbackPolling(true);

    const pollInterval = setInterval(async () => {
      try {
        await fetchInitialData();
      } catch (error) {
        console.error("❌ Fallback polling error:", error);
      }
    }, 30000); // 30 seconds (reduced frequency to prevent map flickering)

    const cleanup = () => clearInterval(pollInterval);
    fallbackPollingCleanupRef.current = cleanup;
    return cleanup;
  };

  // Fetch worker sold data
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!workerId || workerRole !== "TECHNICIAN") return;

    const fetchSoldData = async () => {
      try {
        const data = await getWorkerSoldData();
        setSoldData(data);
        const profile =
          (data as any)?.technicianProfile ??
          (data as any)?.TechnicianProfile ??
          null;
        if (profile) {
          setQuotaData({
            sold: profile?.sold || 0,
            freeMissionCount: profile?.freeMissionCount || 0,
            freeMissionMonth:
              profile?.freeMissionMonth || new Date().getMonth() + 1,
            freeMissionYear:
              profile?.freeMissionYear || new Date().getFullYear(),
            remainingFreeMissions:
              profile?.remainingFreeMissions ??
              Math.max(0, 3 - (profile?.freeMissionCount || 0)),
          });
        }
        console.log("✅ Sold data fetched:", data);
      } catch (error) {
        console.error("❌ Error fetching sold data:", error);
      }
    };

    fetchSoldData();
  }, [workerId, workerRole, isFocused, isTransitioningAway]);

  // Monitor and remove completed missions from all states
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    // Check for any completed missions that might still be in the offers
    const cleanupCompletedMissions = () => {
      // Remove completed missions from job offers (check both request and offer status)
      setJobOffers((prev) =>
        prev.filter((offer) => {
          const requestDone =
            offer.status !== "DONE" && offer.status !== "COMPLETED";
          const offerDone =
            offer.Request?.status !== "DONE" &&
            offer.Request?.status !== "COMPLETED";
          return requestDone && offerDone;
        }),
      );

      // Remove completed missions from pending offers (check both request and offer status)
      setPendingOffers((prev) =>
        prev.filter((offer) => {
          const requestDone =
            offer.request?.status !== "DONE" &&
            offer.request?.status !== "COMPLETED";
          const offerDone =
            offer.status !== "DONE" && offer.status !== "COMPLETED";
          return requestDone && offerDone;
        }),
      );

      // Clear active trip if it's a completed mission (check both request and offer status)
      setActiveTrip((prev) => {
        if (
          prev &&
          (prev.status === "DONE" ||
            prev.status === "COMPLETED" ||
            prev.Request?.status === "DONE" ||
            prev.Request?.status === "COMPLETED")
        ) {
          console.log("🧹 Clearing completed active trip:", prev.id);
          // Clear navigation if there's an active trip that's completed
          webViewRef.current?.injectJavaScript(`
            if (window.clearTrip) {
              window.clearTrip();
            }
          `);
          return null;
        }
        return prev;
      });
    };

    // Run cleanup immediately and then periodically
    cleanupCompletedMissions();

    const cleanupInterval = setInterval(cleanupCompletedMissions, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, [isFocused, isTransitioningAway]);

  // Periodically refresh sold data to ensure balance updates
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!workerId || workerRole !== "TECHNICIAN") return;

    const refreshSoldData = async () => {
      try {
        const data = await getWorkerSoldData();
        const profile =
          (data as any)?.technicianProfile ??
          (data as any)?.TechnicianProfile ??
          null;
        if (profile) {
          setQuotaData({
            sold: profile?.sold || 0,
            freeMissionCount: profile?.freeMissionCount || 0,
            freeMissionMonth:
              profile?.freeMissionMonth || new Date().getMonth() + 1,
            freeMissionYear:
              profile?.freeMissionYear || new Date().getFullYear(),
            remainingFreeMissions:
              profile?.remainingFreeMissions ??
              Math.max(0, 3 - (profile?.freeMissionCount || 0)),
          });
        }
        setSoldData((prevData: any) => {
          // Only update if the sold value actually changed
          if (prevData?.sold !== data.sold) {
            console.log("✅ Sold data updated:", data);
            return data;
          }
          return prevData;
        });
      } catch (error) {
        console.error("❌ Error refreshing sold data:", error);
      }
    };

    // Refresh every 30 seconds (reduced frequency to prevent map flickering)
    const interval = setInterval(refreshSoldData, 30000);

    return () => clearInterval(interval);
  }, [workerId, workerRole, isFocused, isTransitioningAway]);

  // Check pending offers status every 5 seconds
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (pendingOffers.length === 0) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      // Verification already done during initialization

      interval = setInterval(checkPendingOffersStatus, 5000); // Optimized for faster acceptance detection
    })();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingOffers, workerId, workerRole, isFocused, isTransitioningAway]);

  // Periodically check for refused offers and return worker to active requests
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!workerId) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      // Check refused offers every 10 seconds
      interval = setInterval(async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;

          // Get current worker's offers to check their status
          const currentOffers = [...jobOffers, ...pendingOffers];

          for (const offer of currentOffers) {
            try {
              // Check each offer's current status in the database
              const response = await api.get(`/api/offers/${offer.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });

              const currentOffer = response.data;
              console.log("🔍 Checking offer status:", {
                offerId: offer.id,
                currentStatus: currentOffer.status,
                previousStatus: offer.status,
              });

              // If offer is refused in database, remove it from worker's active state
              if (currentOffer.status === "REFUSED") {
                console.log(
                  "❌ Found refused offer in database, removing from worker state:",
                  offer.id,
                );

                // Remove from jobOffers
                setJobOffers((prev) => prev.filter((o) => o.id !== offer.id));

                // Remove from pendingOffers
                setPendingOffers((prev) =>
                  prev.filter((o) => o.id !== offer.id),
                );

                // Clear selected offer if it was the refused one
                setSelectedOffer((prev) =>
                  prev?.id === offer.id ? null : prev,
                );

                // Clear active trip if it was the refused offer
                setActiveTrip((prev) => (prev?.id === offer.id ? null : prev));

                console.log(
                  "✅ Worker returned to active requests after refused offer removal",
                );
              }
            } catch (offerCheckError) {
              console.warn(
                "⚠️ Failed to check offer status:",
                offer.id,
                offerCheckError,
              );
            }
          }
        } catch (error) {
          console.error("❌ Error checking refused offers:", error);
        }
      }, 10000); // Check every 10 seconds
    })();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobOffers, pendingOffers, workerId, isFocused, isTransitioningAway]);

  // Unified state management for offers and requests
  const manageWorkerState = (
    openOffers: any[],
    acceptedOffers: any[],
    currentPendingOffers: any[],
  ) => {
    const hasOpenRequests = openOffers.length > 0;
    const hasAcceptedMissions = acceptedOffers.length > 0;
    const hasPendingOffers = currentPendingOffers.length > 0;
    const hasAnyActivity = activeTrip || selectedOffer;

    // Reduced logging to prevent spamming

    // State decision logic - validate active trip first
    if (activeTrip && !hasAcceptedMissions) {
      // Clear invalid active trip (orphaned state) - request was canceled by client
      setActiveTrip(null);
      setActiveTripOfferId(null);

      // Clear map display of client location and directions
      webViewRef.current?.injectJavaScript(`
        if (window.clearTrip) {
          window.clearTrip();
        }
        true;
      `);
    }

    // ABSOLUTE PRIORITY: Active trip always wins - no intermediate screens
    if (activeTrip) {
      // Active trip - show minimized navigation (direct to directions)
      animateDrawer(DRAWER_HEIGHTS.PEEK, 1);
      return; // Exit early to prevent any other state changes
    }

    // Only run these checks if there's no active trip
    if (selectedOffer) {
      // User has selected an offer - keep expanded for details
      animateDrawer(DRAWER_HEIGHTS.EXPANDED, 2);
    } else if (hasAcceptedMissions) {
      // Show accepted missions
      animateDrawer(DRAWER_HEIGHTS.EXPANDED, 1);
    } else if (hasPendingOffers) {
      // Show pending offers waiting for client acceptance
      animateDrawer(DRAWER_HEIGHTS.EXPANDED, 1);
    } else if (hasOpenRequests) {
      // Show available requests to accept
      animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
    } else {
      // No offers or requests - return to default worker map
      animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
    }
  };

  // Enhanced state listener that monitors all data sources (optimized)
  useEffect(() => {
    if (!workerId || workerRole !== "TECHNICIAN") return;

    // Separate open requests from accepted missions in jobOffers
    const openRequests = jobOffers.filter((offer) => !offer.isAcceptedMission);
    const acceptedMissions = jobOffers.filter(
      (offer) =>
        offer.isAcceptedMission &&
        !["DONE", "COMPLETED"].includes(
          String(offer.status || "").toUpperCase(),
        ) &&
        !["DONE", "COMPLETED"].includes(
          String(offer.Request?.status || "").toUpperCase(),
        ),
    );

    // Additional safety check: clear orphaned active trip
    if (activeTrip && acceptedMissions.length === 0) {
      setActiveTrip(null);
      setActiveTripOfferId(null);

      // Clear map display of client location and directions
      webViewRef.current?.injectJavaScript(`
        if (window.clearTrip) {
          window.clearTrip();
        }
        true;
      `);
      return;
    }

    manageWorkerState(openRequests, acceptedMissions, pendingOffers);
  }, [
    jobOffers.length,
    pendingOffers.length,
    activeTrip,
    selectedOffer,
    workerId,
    workerRole,
  ]); // Only re-run when lengths change, not entire arrays

  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!activeTrip || !location || !webViewRef.current) return;

    const pushRoute = async () => {
      // Verification already done during initialization

      // Re-enable a single auto-fit when a new trip starts (until the user touches the map).
      if (!tripAutoFitArmedRef.current) {
        webViewRef.current?.injectJavaScript(`
          try { if (window.setAutoFitEnabled) window.setAutoFitEnabled(true); window.__autoFit = true; } catch (e) {}
          try { if (window.setFollowEnabled) window.setFollowEnabled(true); window.__follow = true; } catch (e) {}
          true;
        `);
        tripAutoFitArmedRef.current = true;
        setShowRecenter(false);
      }
      const jsCode = `
        if (window.renderTrip) {
          window.renderTrip(
            ${activeTrip.latitude},
            ${activeTrip.longitude},
            ${location.coords.latitude},
            ${location.coords.longitude}
          );
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(jsCode);
    };

    pushRoute();
    const interval = setInterval(pushRoute, 12000); // Reduced from 8 to 12 seconds
    return () => clearInterval(interval);
  }, [activeTrip, location, isFocused, isTransitioningAway]);

  useEffect(() => {
    if (!activeTrip) {
      tripAutoFitArmedRef.current = false;
      setShowRecenter(false);
    }
  }, [activeTrip, location]);

  // (Legacy behavior) Distance is computed when offers are created/refreshed,
  // so the UI shows km immediately once GPS is ready.

  // Update location every 10 seconds
  useEffect(() => {
    if (!isFocused || isTransitioningAway) return;
    if (!workerId || workerRole !== "TECHNICIAN") return;

    // Additional verification check - ensure technician is verified
    const sendLocationUpdate = async () => {
      try {
        // Additional verification check - ensure technician is verified
        const user = await getSessionUser();
        if (!isUserVerified(user)) {
          router.replace("/worker-registration");
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(currentLocation);
        setRegion((prev) =>
          prev
            ? {
                ...prev,
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
              }
            : {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
        );

        await updateLocation(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
        );
        console.log("🛰️ [worker-map] GPS update:", {
          lat: currentLocation.coords.latitude,
          lon: currentLocation.coords.longitude,
          accuracy: (currentLocation.coords as any)?.accuracy,
        });

        // Keep the worker marker updated even when there's no active trip.
        if (!activeTrip && webViewRef.current) {
          const jsCode = `
            try {
              if (typeof workerMarker !== 'undefined' && workerMarker) {
                workerMarker.setLatLng([${currentLocation.coords.latitude}, ${currentLocation.coords.longitude}]);
              }
            } catch (e) {}
            true;
          `;
          webViewRef.current.injectJavaScript(jsCode);
        }
      } catch (error: any) {
        // Silently handle location update errors
        if (error?.response?.status === 404) {
          // Endpoint not ready yet
        } else if (
          error?.code === "ECONNABORTED" ||
          error?.message?.includes("Network Error")
        ) {
          // Network error - will retry on next interval
        } else {
          console.error("Failed to update location:", error?.message || error);
        }
      }
    };

    // Send immediately on mount
    sendLocationUpdate();

    // Then every 10 seconds
    const interval = setInterval(sendLocationUpdate, LOCATION_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [workerId, workerRole, activeTrip, isFocused, isTransitioningAway]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission de localisation refusée");
        setDefaultLocation();
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
      setDefaultLocation();
    }
  };

  const setDefaultLocation = () => {
    setRegion({
      latitude: 33.5731,
      longitude: -7.5898,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    });
    setLoading(false);
  };

  const centerOnUser = async () => {
    try {
      // Verification already done during initialization

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;
      setLocation(currentLocation);
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });

      if (webViewRef.current) {
        const jsCode = `
          if (typeof map !== 'undefined') {
            map.setView([${latitude}, ${longitude}], 18);
            try {
              if (typeof workerMarker !== 'undefined' && workerMarker) {
                workerMarker.setLatLng([${latitude}, ${longitude}]);
              }
            } catch (e) {}
          }
          true;
        `;
        webViewRef.current.injectJavaScript(jsCode);
      }
    } catch (error) {
      console.error("Error getting location:", error);
    }
  };

  const startNavigationToClient = async (mission: JobOffer) => {
    let currentLocation = location;
    if (!currentLocation) {
      try {
        currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(currentLocation);
      } catch (error) {
        console.error(
          "Missing location data for navigation (worker location unavailable):",
          error,
        );
        return;
      }
    }

    const clientLocation = mission.clientLocation ?? {
      latitude: mission.latitude,
      longitude: mission.longitude,
      address: mission.location ?? "",
    };

    if (
      !Number.isFinite(clientLocation?.latitude) ||
      !Number.isFinite(clientLocation?.longitude) ||
      !Number.isFinite(currentLocation.coords.latitude) ||
      !Number.isFinite(currentLocation.coords.longitude)
    ) {
      console.error(
        "Missing location data for navigation (invalid coordinates):",
        {
          worker: currentLocation?.coords,
          clientLocation,
          missionId: mission?.id,
        },
      );
      return;
    }

    const workerLat = currentLocation.coords.latitude;
    const workerLon = currentLocation.coords.longitude;
    const clientLat = clientLocation.latitude;
    const clientLon = clientLocation.longitude;

    console.log("🚀 Starting navigation to client:", {
      from: `${workerLat}, ${workerLon}`,
      to: `${clientLat}, ${clientLon}`,
      mission: mission.title,
      missionId: mission.id,
      missionType: typeof mission.id,
    });

    console.log("🔍 Setting active trip:", mission);
    console.log("🔍 Current activeTrip before setting:", activeTrip);

    // Set as active trip
    setActiveTrip(mission);
    // Keep the offer id (used for cancellation). Do not overwrite it with the request id.
    if (mission.offerId) {
      setActiveTripOfferId(String(mission.offerId));
    }

    console.log("🔍 Active trip set to:", mission);

    // Update WebView to show route
    if (webViewRef.current) {
      const title = JSON.stringify(mission.title ?? "Mission");
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof window.startTrip === 'function') {
            window.startTrip(${workerLat}, ${workerLon}, ${clientLat}, ${clientLon}, ${title});
          } else if (typeof window.renderTrip === 'function') {
            window.renderTrip(${clientLat}, ${clientLon}, ${workerLat}, ${workerLon});
          } else {
            console.warn('No routing function available (startTrip/renderTrip)');
          }
        } catch (e) {
          console.error('Failed to inject routing JS:', e);
        }
        true;
      `);
    }
  };

  const handleOfferPress = (offer: JobOffer) => {
    setSelectedOffer(offer);
    setProposedPrice(formatBudgetForInput(offer.budget));
    animateDrawer(DRAWER_HEIGHTS.EXPANDED, 2);
  };

  const showBalanceAlert = (message: string) => {
    setAlertMessage(message);
    setBalanceAlertVisible(true);
  };

  const handleSendProposal = async () => {
    // Additional verification check - ensure technician is verified
    const user = await getSessionUser();
    if (!isUserVerified(user)) {
      console.log("⚠️ Technician is not verified, redirecting to registration");
      router.replace("/worker-registration");
      return;
    }

    try {
      if (!selectedOffer) return;
      if (selectedOffer.source === "local") return;

      const trimmedPrice = String(proposedPrice ?? "").trim();
      if (!trimmedPrice) return;

      if (!workerId || workerRole !== "TECHNICIAN") {
        return;
      }

      // Check if worker can afford mission after commission deduction
      const missionPrice = parseInt(trimmedPrice, 10);
      if (!Number.isFinite(missionPrice)) {
        Alert.alert("Prix invalide", "Veuillez entrer un prix valide.");
        return;
      }

      const currentBalance = Number(soldData?.sold ?? 0);
      const commissionRate = 0.1;

      const remainingFreeMissions =
        quotaData?.remainingFreeMissions ??
        Math.max(0, 3 - Number(quotaData?.freeMissionCount ?? 0));

      // Backend rule: allow offer creation if sold >= 20 OR remainingFreeMissions > 0
      const hasPaidBalance = currentBalance >= 20;
      const canUseFreeQuota = !hasPaidBalance && remainingFreeMissions > 0;

      if (!hasPaidBalance && !canUseFreeQuota) {
        showBalanceAlert(
          "Veuillez recharger votre solde pour accepter plus de missions",
        );
        return;
      }

      const canAcceptJob = (balance: number, price: number, rate: number) => {
        const commission = price * rate;
        const remainingBalance = balance - commission;
        const ok = remainingBalance >= 0;

        console.log("💰 Balance validation:", {
          balance,
          price,
          commission,
          remainingBalance,
          canAccept: ok,
        });

        return {
          canAccept: ok,
          remainingBalance,
          commission,
          missingAmount: ok ? 0 : Math.abs(remainingBalance),
        };
      };

      // Only enforce commission affordability when using paid balance (quota flow allows sold=0)
      if (hasPaidBalance) {
        const validation = canAcceptJob(
          currentBalance,
          missionPrice,
          commissionRate,
        );
        if (!validation.canAccept) {
          Alert.alert(
            "Solde insuffisant après commission",
            `Votre solde actuel: ${currentBalance} DH\nCommission (10%): ${validation.commission} DH\nSolde restant: ${validation.remainingBalance} DH\nMontant manquant: ${validation.missingAmount} DH`,
          );
          return;
        }
        console.log("✅ Balance validation passed:", validation);
      } else {
        console.log("🎟️ Using free quota for offer creation:", {
          currentBalance,
          remainingFreeMissions,
        });
      }

      // Determine status based on price comparison
      const originalBudget = selectedOffer.budget
        ? parseInt(String(selectedOffer.budget), 10)
        : 0;
      const offerStatus =
        missionPrice === originalBudget ? "ACCEPTED" : "PENDING";

      console.log("💰 Creating offer with status:", {
        originalBudget,
        proposedPrice: missionPrice,
        status: offerStatus,
      });

      const response = await acceptOrder(
        selectedOffer.id,
        missionPrice,
        "",
        offerStatus,
      );

      if (offerStatus === "ACCEPTED") {
        if (canUseFreeQuota) {
          // Quota is consumed only when offer is accepted (auto-accepted flow bypasses client step).
          setQuotaData((prev) => {
            if (!prev) return prev;
            const nextFreeMissionCount = Number(prev.freeMissionCount || 0) + 1;
            return {
              ...prev,
              freeMissionCount: nextFreeMissionCount,
              remainingFreeMissions: Math.max(0, 3 - nextFreeMissionCount),
            };
          });
        }

        const acceptedMission: JobOffer = {
          ...selectedOffer,
          isAcceptedMission: true,
          offerId: String(response?.id ?? ""),
          status: "ACCEPTED",
          clientLocation: {
            latitude: selectedOffer.latitude,
            longitude: selectedOffer.longitude,
            address: selectedOffer.location ?? "",
          },
        };

        setActiveTrip(acceptedMission);
        setActiveTripOfferId(String(response?.id ?? ""));
        setJobOffers((prev) =>
          prev.map((o) => (o.id === selectedOffer.id ? acceptedMission : o)),
        );
      } else {
        console.log("⏳ Different price - waiting for client approval");

        const pendingOffer = {
          ...response,
          request: selectedOffer,
          price: missionPrice,
          status: "PENDING",
          originalPrice: originalBudget,
          proposedPrice: missionPrice,
        };

        setActiveTrip(pendingOffer);
      }

      // Clear any pending state for this request
      setPendingOffers((prev) =>
        prev.filter((o) => String(o?.request?.id) !== String(selectedOffer.id)),
      );
      setSelectedOffer(null);
      animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
    } catch (error: any) {
      console.error("Error accepting order:", error);

      // Check if error is related to 20 crédits balance requirement
      if (
        error?.response?.data?.message?.includes("20 crédits") ||
        error?.message?.includes("20 crédits") ||
        error?.response?.data?.message?.includes("20 credits") ||
        error?.message?.includes("20 credits") ||
        error?.response?.data?.message?.includes("crédits déposés") ||
        error?.message?.includes("crédits déposés") ||
        error?.response?.data?.message?.includes("balance") ||
        error?.message?.includes("balance") ||
        error?.response?.data?.message?.includes("solde") ||
        error?.message?.includes("solde")
      ) {
        showBalanceAlert(
          "Vous devez avoir au moins 20 crédits déposés pour faire une offre",
        );
      }
    }
  };

  const checkPendingOffersStatus = async () => {
    if (pendingOffers.length === 0) return;

    // Additional verification check - ensure technician is verified
    const user = await getSessionUser();
    if (!isUserVerified(user)) {
      router.replace("/worker-registration");
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) return;

      // Prefer checking offer statuses directly (more reliable than inferring from request lists)
      try {
        const workerOffers = (await getWorkerOffers()) as any[];
        const offerById = new Map<string, any>(
          (workerOffers || []).map((o: any) => [String(o.id), o]),
        );

        const updatedPendingOffers: any[] = [];

        for (const pendingOffer of pendingOffers) {
          // Try to find the offer by ID first
          let current: any = offerById.get(String(pendingOffer.id));

          // If not found by ID, try to match by request ID (new endpoint structure)
          if (!current && pendingOffer.request?.id) {
            current = workerOffers.find(
              (offer: any) =>
                String(offer?.request?.id ?? "") ===
                String(pendingOffer.request?.id ?? ""),
            );
          }

          const statusRaw = current?.status ?? pendingOffer?.status ?? "";
          const status = String(statusRaw).toUpperCase();

          const isAccepted =
            (["ACCEPTED", "ASSIGNED", "SELECTED"].includes(status) ||
              !!current?.acceptedAt ||
              !!current?.selectedAt) &&
            !["DONE", "COMPLETED"].includes(status);

          const isClosed = [
            "REFUSED",
            "CANCELLED",
            "DONE",
            "COMPLETED",
          ].includes(status);

          // If we can't even find the offer anymore, treat it as closed (client deleted request or backend removed offer).
          const isMissing = !current;

          if (isAccepted) {
            if (pendingOffer?.request) {
              setActiveTrip(pendingOffer.request);
              setActiveTripOfferId(String(pendingOffer.id));
              setSelectedOffer(null);
              // Go directly to minimized navigation state (no intermediate screens)
              animateDrawer(DRAWER_HEIGHTS.PEEK, 1);
            }
            continue;
          }

          if (isClosed || isMissing) {
            continue;
          }

          // Still pending: best-effort verify request still exists and isn't closed.
          let keepPending = true;
          const pendingRequestId =
            pendingOffer.request?.id ?? current?.request?.id ?? null;

          if (pendingRequestId != null) {
            try {
              const requestResponse = await api.get(
                `/api/requests/${pendingRequestId}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              const req = requestResponse.data;
              const reqStatus = String(req?.status || "").toUpperCase();
              if (
                ["CANCELLED", "DELETED", "DONE", "COMPLETED"].includes(
                  reqStatus,
                )
              ) {
                keepPending = false;
              }
            } catch (e: any) {
              // If request is missing, drop it. Otherwise keep it to avoid flicker on transient errors.
              if (e?.response?.status === 404) keepPending = false;
            }
          }

          if (keepPending) {
            updatedPendingOffers.push(pendingOffer);
          }
        }

        setPendingOffers(updatedPendingOffers);

        if (updatedPendingOffers.length === 0 && pendingOffers.length > 0) {
          animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
        }

        return;
      } catch (offerStatusError: any) {
        // Fall back to legacy request-based checks if the offers endpoint isn't available
        if (offerStatusError?.response?.status !== 404) {
          console.warn(
            "⚠️ Unable to check offer statuses directly, falling back:",
            offerStatusError?.message || offerStatusError,
          );
        }
      }

      const updatedPendingOffers: any[] = [];
      const requestsToAddBack: any[] = [];

      for (const pendingOffer of pendingOffers) {
        const pendingRequestId = pendingOffer.request?.id;
        try {
          // First, check if the request is still in the technician's open requests list
          const workerLat = location?.coords?.latitude ?? region?.latitude;
          const workerLon = location?.coords?.longitude ?? region?.longitude;

          // Skip API call if location is not available
          if (!workerLat || !workerLon) {
            console.log(
              "⚠️ Location not available, skipping technician requests check",
            );
            continue;
          }

          const techRequestsResponse = await api.get(
            "/api/technician/requests",
            {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                latitude: workerLat,
                longitude: workerLon,
              },
              timeout: 10000, // Shorter timeout for this specific call
            },
          );

          const openRequests = techRequestsResponse.data || [];
          const isRequestStillOpen = openRequests.some(
            (req: any) => req.id.toString() === pendingRequestId.toString(),
          );

          console.log(
            "📊 Request",
            pendingRequestId,
            "still in open list:",
            isRequestStillOpen,
          );

          if (!isRequestStillOpen) {
            // Request is no longer in open requests - check what happened
            console.log("🔍 Request no longer open, checking final status...");

            try {
              const requestResponse = await api.get(
                `/api/requests/${pendingRequestId}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );

              const request = requestResponse.data;
              console.log(
                "📋 Final request status:",
                request?.status,
                "selectedOfferId:",
                request?.selectedOfferId,
              );

              if (request?.status === "ASSIGNED" || request?.selectedOfferId) {
                // Request was assigned - check if it was assigned to this technician
                const currentUserId = await getCurrentUserId();
                if (request?.selectedOfferId) {
                  // Try to get the offer details to see if it belongs to this technician
                  try {
                    const offerResponse = await api.get(
                      `/api/offers/${request.selectedOfferId}`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );

                    const offer = offerResponse.data;
                    if (offer?.technicianId?.toString() === currentUserId) {
                      console.log(
                        "✅ This technician's offer was accepted, starting active trip",
                      );
                      setActiveTrip(pendingOffer.request);
                      // Don't keep as pending since it's now active
                    } else {
                      console.log(
                        "❌ Another technician's offer was accepted, adding request back to job offers",
                      );
                      if (pendingOffer.request) {
                        requestsToAddBack.push(pendingOffer.request);
                      }
                    }
                  } catch {
                    console.log(
                      "❌ Cannot check offer details, assuming another technician was selected",
                    );
                    if (pendingOffer.request) {
                      requestsToAddBack.push(pendingOffer.request);
                    }
                  }
                } else {
                  console.log(
                    "❌ Request was assigned but no selectedOfferId, adding back to job offers",
                  );
                  if (pendingOffer.request) {
                    requestsToAddBack.push(pendingOffer.request);
                  }
                }
              } else {
                // Request was closed but not assigned - likely all offers refused
                console.log(
                  "❌ Request closed without assignment, adding back to job offers",
                );
                if (pendingOffer.request) {
                  requestsToAddBack.push(pendingOffer.request);
                }
              }
            } catch (requestCheckError) {
              console.error(
                "Error checking request details:",
                requestCheckError,
              );
              console.log(
                "❌ Cannot verify request status, adding back to job offers for safety",
              );
              if (pendingOffer.request) {
                requestsToAddBack.push(pendingOffer.request);
              }
            }
          } else {
            // Request is still open - but need to check if our specific offer was cancelled
            console.log(
              "🔄 Request still open, checking if our offer was cancelled",
            );

            try {
              // Try to get the request details to see if there are any indicators of cancellation
              const requestResponse = await api.get(
                `/api/requests/${pendingRequestId}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );

              const request = requestResponse.data;
              console.log("📋 Request details while still open:", {
                status: request?.status,
                selectedOfferId: request?.selectedOfferId,
                createdAt: request?.createdAt,
                updatedAt: request?.updatedAt,
              });

              // Check if the request was recently updated (might indicate client action)
              const now = new Date();
              const updatedAt = new Date(request?.updatedAt);
              const createdAt = new Date(request?.createdAt);
              const timeSinceUpdate =
                (now.getTime() - updatedAt.getTime()) / 1000; // seconds
              const timeSinceCreation =
                (now.getTime() - createdAt.getTime()) / 1000; // seconds

              // If request was updated very recently (within last 10 seconds) and still open
              // it might indicate a cancellation or other client action
              const recentClientAction =
                timeSinceCreation > 30 && // existed for more than 30 seconds
                timeSinceUpdate < 10 && // updated in last 10 seconds
                !request?.selectedOfferId && // no offer selected
                request?.status === "OPEN"; // still open

              if (recentClientAction) {
                console.log(
                  "🔍 Recent client action detected, our offer might have been cancelled",
                );
                console.log(
                  "❌ Adding request back to job offers due to likely cancellation",
                );
                if (pendingOffer.request) {
                  requestsToAddBack.push(pendingOffer.request);
                }
              } else {
                // No recent action detected, keep as pending
                console.log(
                  "⏳ No recent client action, keeping offer as pending",
                );
                updatedPendingOffers.push(pendingOffer);
              }
            } catch (requestDetailsError: any) {
              // If we can't verify request details, drop the pending offer to avoid stale UI.
              if (requestDetailsError?.response?.status === 404) {
                continue;
              }
              updatedPendingOffers.push(pendingOffer);
            }
          }
        } catch {
          updatedPendingOffers.push(pendingOffer);
        }
      }

      // Update pending offers
      setPendingOffers(updatedPendingOffers);

      // Add refused requests back to job offers
      if (requestsToAddBack.length > 0) {
        setJobOffers((prevOffers) => {
          const existingIds = new Set(prevOffers.map((offer) => offer.id));
          const newOffers = requestsToAddBack.filter(
            (request) => !existingIds.has(request.id),
          );
          console.log("📝 Adding new offers to job list:", newOffers.length);
          return [...prevOffers, ...newOffers];
        });
      }

      // If all pending offers were removed, ensure fallback to default state
      if (updatedPendingOffers.length === 0 && pendingOffers.length > 0) {
        console.log(
          "🏠 All pending offers cleared, returning to default state",
        );
        animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
      }
    } catch (error) {
      console.error("❌ Error checking pending offers:", error);
    }
  };

  const handleCancelPendingOffer = async (offerId: string) => {
    console.log("🗑️ Attempting to cancel pending offer:", offerId);

    // Check if this offer has become an active trip (accepted)
    const pendingOffer = pendingOffers.find((offer) => offer.id === offerId);
    if (activeTrip && pendingOffer?.request?.id === activeTrip.id) {
      console.log(
        "Offer has been accepted and is now active - cannot be canceled",
      );
      return;
    }

    // Directly cancel without confirmation dialog
    const cancelPendingOffer = async () => {
      try {
        const response = await cancelOrder(offerId);
        console.log("Cancel order response:", response);

        if (response.success) {
          setPendingOffers(
            pendingOffers.filter((offer) => offer.id !== offerId),
          );

          // Return the request to job offers if it exists
          if (pendingOffer?.request) {
            setJobOffers((prev) => [...prev, pendingOffer.request]);
            animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
          }
          console.log("Offer cancelled successfully");
        } else {
          console.log("Cancel order failed:", response.message);
        }
      } catch (error: any) {
        console.error("Error canceling order:", error);
      }
    };

    cancelPendingOffer();
  };

  const handleIncreasePrice = () => {
    const current = parseInt(proposedPrice) || 0;
    setProposedPrice((current + 10).toString());
  };

  // Test function to check platform fee for completed mission
  const testPlatformFee = async () => {
    try {
      console.log("🧪 Testing platform fee endpoint for request ID 96...");
      const feeData = await getPlatformFeeForRequest("96");
      console.log("💰 Platform fee data for request 96:", feeData);
      console.log("🔍 Fee data type:", typeof feeData);
      console.log("🔍 Fee data keys:", feeData ? Object.keys(feeData) : "null");

      if (feeData) {
        console.log("✅ Platform fee found:");
        console.log("   Original Price:", feeData.originalPrice);
        console.log("   Fee Amount:", feeData.feeAmount);
        console.log("   Net Amount:", feeData.netAmount);
        console.log("   Fee Percentage:", feeData.feePercentage);
      } else {
        console.log("❌ No platform fee data found for request 96");
      }
    } catch (error) {
      console.error("❌ Error testing platform fee endpoint:", error);
    }
  };

  const handleCompleteMission = async () => {
    console.log("🎯 handleCompleteMission called!");

    if (!activeTrip) {
      console.error("No active trip to complete");
      return;
    }

    // Extract the correct request ID - try multiple approaches
    let requestId;

    // Try 1: Check if requestId exists in activeTrip
    if (activeTrip.requestId) {
      requestId = String(activeTrip.requestId);
      console.log("🎯 Using requestId from activeTrip:", requestId);
    }
    // Try 2: Check if request object has an id
    else if (activeTrip.request?.id) {
      requestId = String(activeTrip.request.id);
      console.log("🎯 Using request.id from activeTrip:", requestId);
    }
    // Try 3: Get request ID from offer data
    else if (activeTrip.offerId) {
      // The offer should have a requestId field
      requestId = String(activeTrip.offerId); // This is the offer ID, we need to get the requestId from the offer
      console.log(
        "🎯 Using offerId as fallback (may not be correct):",
        requestId,
      );
    }
    // Try 4: Use the extracted ID from mission- prefix
    else {
      requestId = String(activeTrip.id).replace("mission-", "");
      console.log("🎯 Using extracted ID from activeTrip.id:", requestId);
    }

    console.log("🎯 Completing mission:", requestId);
    console.log("🔍 Mission completion details:", {
      requestId,
      activeTripId: activeTrip.id,
      activeTripOfferId: activeTrip.offerId,
      endpoint: `/api/requests/${requestId}/done`,
    });

    try {
      // Fetch active requests using the new endpoint
      let actualRequestId = null;

      const token = await getAuthToken();
      const activeRequestsResponse = await api.get(
        "/api/technician/active-requests",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log(
        "🔍 Active requests from database:",
        activeRequestsResponse.data,
      );
      console.log("🔍 Active trip details for matching:", {
        activeTripId: activeTrip.id,
        activeTripOfferId: activeTrip.offerId,
        lookingForId: activeTrip.offerId,
      });

      // Log all active request IDs for debugging
      if (
        activeRequestsResponse.data &&
        Array.isArray(activeRequestsResponse.data)
      ) {
        console.log("✌🏻 Available active request IDs:");
        activeRequestsResponse.data.forEach((request, index) => {
          console.log(
            `  ${index + 1}. Request ID: ${request.id}, Offer ID: ${request.offerId}, Title: ${request.title}, Status: ${request.status}`,
          );
        });

        // Find the request that matches the active trip by offerId
        const matchingRequest = activeRequestsResponse.data.find(
          (request) =>
            request.offerId === activeTrip.offerId ||
            String(request.offerId) === String(activeTrip.offerId),
        );

        if (matchingRequest) {
          actualRequestId = String(matchingRequest.id);
          console.log(
            "🎯 Found actual request ID from active requests:",
            actualRequestId,
          );
          console.log("🔍 Matching request details:", matchingRequest);
        } else {
          console.log("⚠️ No matching active request found");
          console.log(
            "🔍 Available offer IDs:",
            activeRequestsResponse.data.map((req) => req.offerId),
          );
        }
      } else {
        console.log("⚠️ No active requests data received from database");
      }

      // Use the actual request ID if found, otherwise fallback
      const finalRequestId = actualRequestId || requestId;
      console.log("🎯 Trying to complete request with ID:", finalRequestId);
      const completionResponse = await completeMission(finalRequestId);
      console.log("✅ Mission completed successfully");

      console.log(
        "🔍 Completion API response structure:",
        JSON.stringify(completionResponse, null, 2),
      );

      // Create notification for mission completion
      notificationService
        .addNotification(
          notificationService.createMissionCompletedNotification(
            finalRequestId,
            activeTrip?.title || "Mission",
          ),
        )
        .catch((error: any) => {
          console.error(
            "Error creating mission completion notification:",
            error,
          );
        });
      console.log("🔍 API response keys:", Object.keys(completionResponse));
      console.log(
        "🔍 platformFee exists:",
        "platformFee" in completionResponse,
      );
      console.log("🔍 platformFee value:", completionResponse.platformFee);

      // Direct approach: Immediately open rating screen with fee data
      if (completionResponse.platformFee) {
        console.log(
          "💰 Fee details from mission completion API:",
          completionResponse.platformFee,
        );

        // Store trip data before clearing
        const tripData = { ...activeTrip };
        const refreshSoldData = async () => {
          try {
            const data = await getWorkerSoldData();
            const currentSoldData = soldData as any;
            const newData = data as any;
            setSoldData(data);
            console.log(
              "💰 Balance refreshed after mission completion:",
              (data as any).sold,
            );

            // Create notification for payment received if balance increased
            if (currentSoldData && newData.sold > currentSoldData.sold) {
              const paymentAmount = newData.sold - currentSoldData.sold;
              notificationService
                .addNotification(
                  notificationService.createPaymentReceivedNotification(
                    paymentAmount,
                  ),
                )
                .catch((error: any) => {
                  console.error("Error creating payment notification:", error);
                });
            }
          } catch (error) {
            console.error("❌ Error refreshing balance:", error);
          }
        };

        refreshSoldData();

        console.log("🎯 Rating screen opened directly with fee data");

        // Balance is automatically updated by backend when mission is completed
        // No need for manual balance update since backend handles fee deduction

        // Trigger fresh data fetch after a short delay
        setTimeout(() => {
          console.log("🔄 Fetching fresh data after mission completion");
          fetchInitialData()
            .then(() => {
              console.log(
                "✅ Fresh data fetched successfully after mission completion",
              );
              console.log("🔍 Job offers after fetch:", jobOffers.length);
              console.log(
                "🔍 Open requests count:",
                jobOffers.filter((offer) => !offer.isAcceptedMission).length,
              );

              // Force drawer to default state to show open requests
              setTimeout(() => {
                console.log(
                  "🎯 Forcing drawer to default state to show open requests",
                );
                animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
              }, 500);
            })
            .catch((error) => {
              console.error(
                "❌ Error fetching fresh data after mission completion:",
                error,
              );
            });
        }, 1000);
      } else {
        console.log(
          "❌ No platformFee found in API response, trying dedicated endpoint...",
        );

        // Fallback: Try to get fee data from dedicated platform fee endpoint
        try {
          console.log(
            "🔍 Testing platform fee endpoint for requestId:",
            requestId,
          );
          const feeData = await getPlatformFeeForRequest(requestId);
          console.log("💰 Fee data from dedicated endpoint:", feeData);
          console.log("🔍 Fee data type:", typeof feeData);
          console.log(
            "🔍 Fee data keys:",
            feeData ? Object.keys(feeData) : "null",
          );

          if (feeData) {
            // Store trip data before clearing
            const tripData = { ...activeTrip };

            // Clear active trip immediately
            setActiveTrip(null);
            setActiveTripOfferId(null);

            // Show payment details modal with fee data
            setPaymentModalVisible(true);
            setCompletedMissionData({
              requestId: requestId,
              title: activeTrip.title || "Mission",
              originalPrice: feeData.originalAmount,
              feeAmount: feeData.feeAmount,
              netAmount: feeData.netAmount,
            });

            console.log(
              "🎯 Rating screen opened with fee data from dedicated endpoint",
            );

            // Do not mutate technician balance client-side.
            // Backend is the source of truth for sold/platform fee/quota accounting.

            // Trigger fresh data fetch after a short delay
            setTimeout(() => {
              console.log("🔄 Fetching fresh data after mission completion");
              fetchInitialData()
                .then(() => {
                  console.log(
                    "✅ Fresh data fetched successfully after mission completion",
                  );
                  // Force drawer to default state to show open requests
                  setTimeout(() => {
                    animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
                  }, 500);
                })
                .catch((error) => {
                  console.error(
                    "❌ Error fetching fresh data after mission completion:",
                    error,
                  );
                });
            }, 1000);
          } else {
            console.log("❌ No fee data found in dedicated endpoint either");
            Alert.alert(
              "Erreur",
              "Impossible de récupérer les détails de paiement. Veuillez réessayer.",
              [{ text: "OK" }],
            );
          }
        } catch (feeError) {
          console.error(
            "❌ Error fetching fee data from dedicated endpoint:",
            feeError,
          );
          Alert.alert(
            "Erreur",
            "Impossible de récupérer les détails de paiement. Veuillez réessayer.",
            [{ text: "OK" }],
          );
        }
      }

      // Navigation will be cleared and rating screen will open via WebSocket event
    } catch (error) {
      console.error("❌ Error completing mission:", error);
      Alert.alert(
        "Erreur",
        "Une erreur est survenue lors de la finalisation de la mission. Veuillez réessayer.",
        [{ text: "OK" }],
      );
    }
  };

  const handleDecreasePrice = () => {
    const current = parseInt(proposedPrice) || 0;
    if (current > 10) {
      setProposedPrice((current - 10).toString());
    }
  };

  if (isCheckingVerification) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Vérification du compte...</Text>
      </View>
    );
  }

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
        <TouchableOpacity style={styles.menuButton} onPress={openMenu}>
          <Feather name="menu" size={24} color="#1a1a2e" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {soldData && (
            <TouchableOpacity
              style={styles.soldContainer}
              onPress={() => router.push("/balance-screen")}
            >
              <MaterialCommunityIcons name="wallet" size={20} color="#10b981" />
              <Text style={styles.soldText}>{soldData.sold || 0} DH</Text>
            </TouchableOpacity>
          )}

          {quotaData && (
            <TouchableOpacity
              style={[
                styles.freeMissionsContainer,
                quotaData.sold <= 0 &&
                  quotaData.remainingFreeMissions === 0 &&
                  styles.freeMissionsContainerExhausted,
              ]}
              onPress={() => {
                if (quotaData.sold > 0) {
                  Alert.alert(
                    "Missions",
                    "Votre solde est actif. Vous pouvez accepter des missions sans limite.",
                  );
                  return;
                }
                Alert.alert(
                  "Missions gratuites",
                  `Il vous reste ${quotaData.remainingFreeMissions}/3 missions gratuites ce mois.\nMissions utilisées : ${quotaData.freeMissionCount}/3`,
                );
              }}
            >
              <MaterialCommunityIcons
                name="gift-outline"
                size={20}
                color={
                  quotaData.sold > 0
                    ? "#10b981"
                    : quotaData.remainingFreeMissions > 0
                      ? "#1e40af"
                      : "#ef4444"
                }
              />
              <Text
                style={[
                  styles.freeMissionsText,
                  quotaData.sold <= 0 &&
                    quotaData.remainingFreeMissions === 0 &&
                    styles.freeMissionsTextExhausted,
                ]}
              >
                {quotaData.sold > 0
                  ? "Illimité"
                  : `${quotaData.remainingFreeMissions}/3`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerIcons}>
          {/* New Requests Badge */}
          {newRequestCount > 0 && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                console.log(
                  "🔔 Worker notifications pressed - count:",
                  newRequestCount,
                );
                navigationToNotificationsStartedAtRef.current = Date.now();
                console.log(
                  "⏱️ [worker-map] navigate -> /notifications start:",
                  navigationToNotificationsStartedAtRef.current,
                );
                setIsTransitioningAway(true);
                router.push("/notifications");
              }}
            >
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>{newRequestCount}</Text>
              </View>
              <Feather name="bell" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          )}

          {/* Regular bell when no new requests */}
          {newRequestCount === 0 && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                console.log(
                  "🔔 Worker notifications pressed - count:",
                  newRequestCount,
                );
                navigationToNotificationsStartedAtRef.current = Date.now();
                console.log(
                  "⏱️ [worker-map] navigate -> /notifications start:",
                  navigationToNotificationsStartedAtRef.current,
                );
                setIsTransitioningAway(true);
                router.push("/notifications");
              }}
            >
              <Feather name="bell" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          )}
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
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                {profilePicture &&
                typeof profilePicture === "string" &&
                profilePicture.trim().length > 0 ? (
                  <Image
                    source={{
                      uri: profilePicture!,
                      ...((authTokenRef.current || authToken) &&
                      profilePicture!.startsWith("http")
                        ? {
                            headers: {
                              Authorization: `Bearer ${authTokenRef.current || authToken}`,
                            },
                          }
                        : {}),
                    }}
                    style={styles.menuProfileImage}
                    onError={(e) => {
                      console.error(
                        "❌ Profile image load error in worker-map:",
                        {
                          error: e?.nativeEvent?.error ?? null,
                          uri: profilePicture,
                          nativeEvent: e?.nativeEvent ?? null,
                        },
                      );
                      setProfilePicture(null);
                    }}
                    onLoad={() => {
                      console.log(
                        "✅ Profile image loaded successfully in worker-map:",
                        profilePicture,
                      );
                    }}
                  />
                ) : (
                  <Feather name="briefcase" size={40} color="#10b981" />
                )}
              </View>
              <Text style={styles.menuName}>
                {realUserName || "Worker Name"}
              </Text>
              <Text style={styles.menuEmail}>Worker Mode Active</Text>
            </View>

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
                onPress={() => {
                  closeMenu();
                  router.push("/earnings");
                }}
              >
                <Feather name="dollar-sign" size={22} color="#374151" />
                <Text style={styles.menuItemText}>Mes Gains</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  closeMenu();
                  router.push("/missions-history");
                }}
              >
                <Feather name="briefcase" size={22} color="#374151" />
                <Text style={styles.menuItemText}>Mes Missions</Text>
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

            <TouchableOpacity
              style={styles.switchButton}
              onPress={async () => {
                closeMenu();
                try {
                  console.log(
                    "🔄 Switching from worker mode to client mode...",
                  );
                  const userBefore = await getSessionUser();
                  console.log("🔍 User before switching to client mode:", {
                    role: userBefore?.role,
                    hasTechnicianProfile: !!userBefore?.technicianProfile,
                    isWorkerMode: userBefore?.technicianProfile?.isWorkerMode,
                  });

                  await setTechnicianWorkerMode(false);
                  const userAfter = await refreshSessionUser();
                  console.log("🔍 User after switching to client mode:", {
                    role: userAfter?.role,
                    hasTechnicianProfile: !!userAfter?.technicianProfile,
                    isWorkerMode: userAfter?.technicianProfile?.isWorkerMode,
                  });
                } catch (error) {
                  console.warn(
                    "Unable to switch technician to client mode:",
                    error,
                  );
                } finally {
                  router.replace("/map");
                }
              }}
            >
              <MaterialCommunityIcons name="account" size={18} color="#fff" />
              <Text style={styles.switchButtonText}>Passer en mode Client</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* Map */}
      {region && (
        <View
          style={styles.mapContainer}
          onTouchStart={handleMapInteractionStart}
          onTouchEnd={handleMapInteractionEnd}
          onTouchCancel={handleMapInteractionEnd}
        >
          {isFocused && !isTransitioningAway ? (
            <WebView
              ref={webViewRef}
              style={styles.map}
              originWhitelist={["*"]}
              onMessage={(event) => {
                try {
                  const msg = JSON.parse(event.nativeEvent.data || "{}");
                  if (msg?.type === "follow_disabled") {
                    setShowRecenter(true);
                  }
                } catch {
                  // ignore
                }
              }}
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
    .custom-marker { background: transparent !important; border: none !important; }
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
    .job-marker {
      background: #1e40af;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
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
    let map = L.map('map').setView([${region.latitude}, ${region.longitude}], 14);
    let workerMarker;
    let clientMarker;
    let routeLine;
    let lastRouteKey = null;
    let lastRouteTs = 0;
    let lastRoutePath = null;
    let lastRouteSteps = null;
    let currentStepIndex = 0;
    window.__follow = true;
    window.__autoFit = true;
    window.setAutoFitEnabled = function(enabled) { window.__autoFit = !!enabled; };
    window.setFollowEnabled = function(enabled) { window.__follow = !!enabled; };
    window.recenterToWorker = function() {
      window.__follow = true;
      if (workerMarker) {
        map.setView(workerMarker.getLatLng(), Math.max(map.getZoom(), 17), { animate: true });
      }
    };

    const navCardEl = document.getElementById('navCard');
    const navInstructionEl = document.getElementById('navInstruction');
    const navMetaEl = document.getElementById('navMeta');
    
    L.tileLayer(
      'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}',
      {
        attribution: '© TomTom',
        maxZoom: 20,
        tileSize: 256,
      }
    ).addTo(map);
    
    // Worker marker (visible even when there is no active trip)
    const workerIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div style="font-size:32px;line-height:1;">👷</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
    workerMarker = L.marker([${region.latitude}, ${region.longitude}], { icon: workerIcon }).addTo(map)
      .bindPopup('Votre position');

    // If the user manually pans/zooms the map, stop auto-fitting the route.
    function disableAutoFit() { window.__autoFit = false; }
    map.on('dragstart', disableAutoFit);
    map.on('zoomstart', disableAutoFit);
    map.on('movestart', disableAutoFit);

    function notifyFollowDisabled() {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'follow_disabled' }));
        }
      } catch (e) {}
    }
    function disableFollow() { window.__follow = false; notifyFollowDisabled(); }
    map.on('dragstart', disableFollow);
    map.on('zoomstart', disableFollow);
    map.on('movestart', disableFollow);

    window.setFollowEnabled = function(enabled) {
      window.__follow = !!enabled;
      try {
        if (window.__follow && workerMarker) {
          const ll = workerMarker.getLatLng();
          map.setView([ll.lat, ll.lng], Math.max(map.getZoom(), 17), { animate: true });
        }
      } catch (e) {}
    };

    window.recenterToWorker = function() {
      window.setFollowEnabled(true);
    };

    async function fetchRoadRoute(workerLat, workerLng, clientLat, clientLng) {
      const url = 'https://router.project-osrm.org/route/v1/driving/' +
        workerLng + ',' + workerLat + ';' + clientLng + ',' + clientLat +
        '?overview=full&geometries=geojson&steps=true';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Route request failed: ' + res.status);
      const json = await res.json();
      const route = json?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!coords || !coords.length) throw new Error('No route geometry');
      const path = coords.map(function(c) { return [c[1], c[0]]; });
      const steps = route?.legs?.[0]?.steps || [];
      const distance = route?.distance ?? null;
      const duration = route?.duration ?? null;
      return { path, steps, distance, duration };
    }

    function haversineMeters(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    function formatManeuver(step) {
      const type = step?.maneuver?.type || '';
      const modifier = (step?.maneuver?.modifier || '').replace(/_/g, ' ');
      const name = step?.name || '';

      const verbByType = {
        depart: 'Départ',
        arrive: 'Arrivée',
        turn: 'Tourner',
        "new name": 'Continuer',
        continue: 'Continuer',
        merge: 'S’insérer',
        on_ramp: 'Prendre la bretelle',
        off_ramp: 'Prendre la sortie',
        fork: 'Prendre la bifurcation',
        roundabout: 'Rond-point',
        rotary: 'Rond-point',
        roundabout_turn: 'Rond-point',
        notification: 'Info'
      };

      const verb = verbByType[type] || 'Continuer';
      let line = verb;
      if (modifier && type !== 'depart' && type !== 'arrive') {
        line += ' ' + modifier;
      }
      if (name && type !== 'depart' && type !== 'arrive') {
        line += ' • ' + name;
      }
      return line;
    }

    function showNav(step, totalDistance, totalDuration) {
      navCardEl.style.display = 'block';
      navInstructionEl.textContent = formatManeuver(step);
      const stepDist = step?.distance != null ? Math.round(step.distance) : null;
      const stepDur = step?.duration != null ? Math.round(step.duration) : null;
      const km = totalDistance != null ? (totalDistance / 1000).toFixed(1) + ' km' : null;
      const min = totalDuration != null ? Math.max(1, Math.round(totalDuration / 60)) + ' min' : null;
      const parts = [];
      if (stepDist != null) parts.push(stepDist + ' m');
      if (stepDur != null) parts.push(Math.max(1, Math.round(stepDur / 60)) + ' min');
      if (km || min) parts.push([km, min].filter(Boolean).join(' • '));
      navMetaEl.textContent = parts.filter(Boolean).join(' • ');
    }

    function updateNav(workerLat, workerLng, totalDistance, totalDuration) {
      if (!lastRouteSteps || !lastRouteSteps.length) return;
      const steps = lastRouteSteps.filter(function(s) { return s && s.maneuver && s.maneuver.location; });
      if (!steps.length) return;

      if (currentStepIndex < 0) currentStepIndex = 0;
      if (currentStepIndex >= steps.length) currentStepIndex = steps.length - 1;

      // Advance step when close to its maneuver point.
      const step = steps[currentStepIndex];
      const loc = step.maneuver.location; // [lng,lat]
      const d = haversineMeters(workerLat, workerLng, loc[1], loc[0]);
      if (d < 25 && currentStepIndex < steps.length - 1) {
        currentStepIndex += 1;
      }

      showNav(steps[currentStepIndex], totalDistance, totalDuration);
    }

    window.renderTrip = async function(clientLat, clientLng, workerLat, workerLng) {
      console.log('🗺️ renderTrip called - clientMarker exists:', !!clientMarker);
      
      const clientIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="font-size:32px;line-height:1;">📍</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      if (clientMarker) {
        clientMarker.setLatLng([clientLat, clientLng]);
        console.log('📍 Updated existing client marker position');
      } else {
        clientMarker = L.marker([clientLat, clientLng], { icon: clientIcon }).addTo(map)
          .bindPopup('Client');
        console.log('📍 Created new client marker');
      }

      if (workerMarker) {
        workerMarker.setLatLng([workerLat, workerLng]);
      } else {
        workerMarker = L.marker([workerLat, workerLng], { icon: workerIcon }).addTo(map)
          .bindPopup('Votre position');
      }

      const now = Date.now();
      const key = String(workerLat.toFixed(5)) + ',' + String(workerLng.toFixed(5)) + '|' + String(clientLat.toFixed(5)) + ',' + String(clientLng.toFixed(5));

      try {
        const shouldRefetch = !lastRouteKey || lastRouteKey !== key || (now - lastRouteTs) > 20000;
        const shouldRefetchNow = shouldRefetch || !routeLine;
        if (shouldRefetchNow) {
          const data = await fetchRoadRoute(workerLat, workerLng, clientLat, clientLng);
          const path = data?.path;
          if (path && path.length) {
            lastRoutePath = path;
            lastRouteSteps = data?.steps || null;
            if (lastRouteKey !== key) {
              currentStepIndex = 0;
            }
            lastRouteKey = key;
            lastRouteTs = now;
            if (routeLine) {
              routeLine.setLatLngs(path);
              routeLine.setStyle({ dashArray: null });
            } else {
              routeLine = L.polyline(path, { color: '#1e40af', weight: 4 }).addTo(map);
            }
            updateNav(workerLat, workerLng, data?.distance ?? null, data?.duration ?? null);
          }
        }

        if (!routeLine && lastRoutePath && lastRoutePath.length) {
          routeLine = L.polyline(lastRoutePath, { color: '#1e40af', weight: 4 }).addTo(map);
        }

        if (!routeLine) {
          routeLine = L.polyline([[workerLat, workerLng], [clientLat, clientLng]], { color: '#1e40af', weight: 4, dashArray: '8, 8' }).addTo(map);
        }

        const didAutoFit = !!(routeLine && window.__autoFit);
        if (routeLine && window.__autoFit) {
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
          window.__autoFit = false;
        }

        // Follow mode: keep the worker centered while navigating.
        if (window.__follow && !didAutoFit) {
          map.setView([workerLat, workerLng], Math.max(map.getZoom(), 17), { animate: true });
        }

        // Update instruction card even when route isn't refetched.
        updateNav(workerLat, workerLng, null, null);
      } catch (e) {
        if (routeLine) {
          routeLine.setLatLngs([[workerLat, workerLng], [clientLat, clientLng]]);
          routeLine.setStyle({ dashArray: '8, 8' });
        } else {
          routeLine = L.polyline([[workerLat, workerLng], [clientLat, clientLng]], { color: '#1e40af', weight: 4, dashArray: '8, 8' }).addTo(map);
        }
        const didAutoFit = !!window.__autoFit;
        if (window.__autoFit) {
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
          window.__autoFit = false;
        }
        if (window.__follow && !didAutoFit) {
          map.setView([workerLat, workerLng], Math.max(map.getZoom(), 17), { animate: true });
        }
      }
    };

    window.clearTrip = function() {
      console.log('🧹 clearTrip called - cleaning up map elements');
      console.log('Before cleanup - clientMarker:', !!clientMarker, 'routeLine:', !!routeLine);
      
      // Only remove client-related elements, keep worker marker
      if (clientMarker) {
        map.removeLayer(clientMarker);
        clientMarker = null;
        console.log('✅ Client marker removed');
      }
      if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
        console.log('✅ Route line removed');
      }
      // Clear route data to prevent recreation
      lastRouteKey = null;
      lastRoutePath = null;
      lastRouteSteps = null;
      currentStepIndex = 0;
      window.__autoFit = true;
      window.__follow = true;
      navCardEl.style.display = 'none';
      
      console.log('🧹 clearTrip completed - clientMarker:', !!clientMarker, 'routeLine:', !!routeLine);
    };

    // Job offers
    const jobs = ${JSON.stringify(jobOffers)};
    jobs.forEach((job, index) => {
      const icon = L.divIcon({
        className: 'custom-marker',
        html: '<div class="job-marker">' + (index + 1) + '</div>',
        iconSize: [40, 40]
      });
      L.marker([job.latitude, job.longitude], { icon: icon }).addTo(map)
        .bindPopup(job.title + '<br>' + job.budget);
    });
  </script>
</body>
</html>
                `,
              }}
            />
          ) : (
            <View style={styles.mapPlaceholder} />
          )}

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

      {/* Bottom Drawer */}
      <Animated.View style={[styles.bottomDrawer, { height: drawerHeight }]}>
        {/* Drag Handle */}
        <View style={styles.dragHandleContainer} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {selectedOffer ? (
          // Offer Detail View
          <View style={styles.offerDetailContainer}>
            <View style={styles.offerDetailHeader}>
              <View style={styles.offerDetailIcon}>
                <Feather name="briefcase" size={24} color="#1e40af" />
              </View>
              <View style={styles.offerDetailInfo}>
                <Text style={styles.offerDetailTitle}>
                  {selectedOffer.title}
                </Text>
                <Text style={styles.offerDetailCategory}>
                  {typeof selectedOffer.category === "string"
                    ? selectedOffer.category
                    : selectedOffer.category?.name || ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setSelectedOffer(null);
                  animateDrawer(DRAWER_HEIGHTS.DEFAULT, 1);
                }}
              >
                <Feather name="x" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.offerDetailContent}
            >
              {/* Quota Info Card */}
              {quotaData && (
                <View
                  style={[
                    styles.quotaCard,
                    quotaData.sold > 0 && styles.quotaCardActive,
                    quotaData.sold <= 0 &&
                      quotaData.remainingFreeMissions === 0 &&
                      styles.quotaCardExhausted,
                  ]}
                >
                  <View style={styles.quotaCardHeader}>
                    <Feather
                      name={
                        quotaData.sold > 0 ? "check-circle" : "alert-circle"
                      }
                      size={20}
                      color={quotaData.sold > 0 ? "#10b981" : "#ef4444"}
                    />
                    <Text
                      style={[
                        styles.quotaCardTitle,
                        { color: quotaData.sold > 0 ? "#10b981" : "#ef4444" },
                      ]}
                    >
                      {quotaData.sold > 0
                        ? "Solde actif"
                        : quotaData.remainingFreeMissions > 0
                          ? `Missions gratuites restantes : ${quotaData.remainingFreeMissions}/3`
                          : "Veuillez recharger votre solde pour accepter plus de missions"}
                    </Text>
                  </View>
                  <View style={styles.quotaCardContent}>
                    <Text style={styles.quotaCardText}>
                      {quotaData.sold > 0
                        ? "Accès illimité aux missions"
                        : `Missions utilisées : ${quotaData.freeMissionCount || 0}/3`}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.clientInfo}>
                <View style={styles.clientAvatar}>
                  <Feather name="user" size={20} color="#fff" />
                </View>
                <View>
                  <Text style={styles.clientName}>
                    {selectedOffer.clientName}
                  </Text>
                  {selectedOffer.clientCity &&
                    selectedOffer.clientCity.trim() &&
                    selectedOffer.clientCity !== "-" && (
                      <View style={styles.cityContainer}>
                        <Feather name="map-pin" size={12} color="#6b7280" />
                        <Text style={styles.cityName}>
                          {selectedOffer.clientCity}
                        </Text>
                      </View>
                    )}
                  {selectedOffer.clientPhone &&
                    selectedOffer.clientPhone.trim() &&
                    selectedOffer.status !== "OPEN" && (
                      <View style={styles.phoneContainer}>
                        <Feather name="phone" size={12} color="#6b7280" />
                        <Text style={styles.phoneNumber}>
                          {selectedOffer.clientPhone}
                        </Text>
                      </View>
                    )}
                </View>
                <View
                  style={[
                    styles.urgencyBadge,
                    selectedOffer.urgency === "Urgent"
                      ? styles.urgencyUrgent
                      : styles.urgencyNormal,
                  ]}
                >
                  <Text style={styles.urgencyText}>
                    {selectedOffer.urgency}
                  </Text>
                </View>
              </View>

              <Text style={styles.offerDescription}>
                {selectedOffer.description}
              </Text>

              {/* Images Section */}
              {selectedOffer.request?.images &&
                selectedOffer.request.images.length > 0 && (
                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesTitle}>Photos</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.imagesContainer}
                    >
                      {selectedOffer.request.images.map(
                        (image: any, index: number) => {
                          console.log("Rendering image:", image);
                          return (
                            <TouchableOpacity
                              key={index}
                              onPress={() => {
                                setSelectedImage(image);
                                setImageModalVisible(true);
                              }}
                            >
                              <Image
                                source={{ uri: `${API_URL}${image}` }}
                                style={styles.requestImage}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          );
                        },
                      )}
                    </ScrollView>
                  </View>
                )}

              <View style={styles.locationRow}>
                <Feather name="map-pin" size={16} color="#6b7280" />
                <Text style={styles.locationText}>
                  {selectedOffer.location}
                </Text>
                <Text style={styles.distanceText}>
                  • {selectedOffer.distance}
                </Text>
              </View>

              {/* Price Proposal */}
              <View style={styles.priceProposalSection}>
                <Text style={styles.priceProposalLabel}>
                  Votre proposition de prix
                </Text>
                <View style={styles.priceInputContainer}>
                  <TouchableOpacity
                    style={styles.priceButton}
                    onPress={handleDecreasePrice}
                  >
                    <Feather name="minus" size={20} color="#1e40af" />
                  </TouchableOpacity>
                  <View style={styles.priceInputWrapper}>
                    <TextInput
                      style={styles.priceInput}
                      value={proposedPrice}
                      onChangeText={setProposedPrice}
                      keyboardType="numeric"
                      placeholder={
                        formatBudgetForInput(selectedOffer.budget) || "0"
                      }
                    />
                    <Text style={styles.priceCurrency}>DH</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.priceButton}
                    onPress={handleIncreasePrice}
                  >
                    <Feather name="plus" size={20} color="#1e40af" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.originalBudget}>
                  Budget client: {selectedOffer.budget}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.sendProposalButton}
              onPress={handleSendProposal}
            >
              <Feather name="send" size={20} color="#fff" />
              <Text style={styles.sendProposalText}>
                Envoyer ma proposition
              </Text>
            </TouchableOpacity>
          </View>
        ) : activeTrip ? (
          <View style={styles.offerDetailContainer}>
            <View style={styles.offerDetailHeader}>
              <View style={styles.offerDetailIcon}>
                <Feather name="navigation" size={24} color="#1e40af" />
              </View>
              <View style={styles.offerDetailInfo}>
                <Text style={styles.offerDetailTitle}>Mission en cours</Text>
                <Text style={styles.offerDetailCategory}>
                  {activeTrip.title}
                  {activeTrip.source === "local" ? " • cache local" : ""}
                </Text>
              </View>
            </View>

            <View style={styles.offerDetailContent}>
              {/* Client Info Card */}
              <View style={styles.clientInfo}>
                <View style={styles.clientAvatar}>
                  {(() => {
                    const rawPic = String(
                      activeTrip.clientProfilePicture || "",
                    ).trim();
                    // Client images use /uploads/ directly (no path correction)
                    const fullUrl = rawPic ? `${API_URL}${rawPic}` : null;

                    console.log(
                      "🔍 [worker-map] client profile picture data:",
                      {
                        clientProfilePicture: activeTrip.clientProfilePicture,
                        rawPic,
                        API_URL,
                        fullUrl,
                      },
                    );

                    return fullUrl ? (
                      <Image
                        source={{ uri: fullUrl }}
                        style={styles.clientAvatarImage}
                        onError={(e) =>
                          console.log(
                            "❌ [worker-map] client image load error:",
                            e.nativeEvent.error,
                          )
                        }
                        onLoad={() =>
                          console.log(
                            "✅ [worker-map] client image loaded successfully",
                          )
                        }
                      />
                    ) : (
                      <Feather name="user" size={20} color="#fff" />
                    );
                  })()}
                </View>
                <View>
                  <Text style={styles.clientName}>{activeTrip.clientName}</Text>
                  {activeTrip.clientPhone && activeTrip.clientPhone.trim() && (
                    <View style={styles.phoneContainer}>
                      <Feather name="phone" size={12} color="#6b7280" />
                      <Text style={styles.phoneNumber}>
                        {activeTrip.clientPhone}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.offerDescription}>
                {activeTrip.source === "local"
                  ? "Cette mission est affichée depuis le cache local. Elle ne mettra pas à jour le client en direct."
                  : "Le trajet vers le client est actif. Déplacez la carte librement. Utilisez Recentrer pour reprendre le suivi."}
              </Text>
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={16} color="#6b7280" />
                <Text style={styles.locationText}>{activeTrip.location}</Text>
                <Text style={styles.distanceText}>• {activeTrip.distance}</Text>
              </View>
            </View>

            {showRecenter && activeTrip.source !== "local" ? (
              <TouchableOpacity
                style={[styles.sendProposalButton, styles.recenterButton]}
                onPress={() => {
                  webViewRef.current?.injectJavaScript(`
                    try { if (window.recenterToWorker) window.recenterToWorker(); } catch (e) {}
                    true;
                  `);
                  setShowRecenter(false);
                }}
              >
                <MaterialCommunityIcons
                  name="crosshairs-gps"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.sendProposalText}>Recentrer</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.sendProposalButton, styles.completeMissionButton]}
              onPress={handleCompleteMission}
            >
              <Feather name="check-circle" size={20} color="#fff" />
              <Text style={styles.sendProposalText}>Mission terminée</Text>
            </TouchableOpacity>
          </View>
        ) : pendingOffers.length > 0 ? (
          // Pending Offers List
          <View style={styles.offersContainer}>
            <Text style={styles.offersTitle}>
              Offres en attente ({pendingOffers.length})
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pendingOffers.map((pendingOffer, index) => (
                <PendingOfferCard
                  key={pendingOffer.id}
                  pendingOffer={pendingOffer}
                  index={index}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          // Job Offers List with proper separation
          (() => {
            const openRequests = jobOffers.filter(
              (offer) => !offer.isAcceptedMission,
            );
            const acceptedMissions = jobOffers.filter(
              (offer) => offer.isAcceptedMission,
            );

            return (
              <View style={styles.offersContainer}>
                {acceptedMissions.length > 0 && (
                  <>
                    <Text style={styles.offersTitle}>
                      Missions acceptées ({acceptedMissions.length})
                    </Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {acceptedMissions.map((offer, index) => (
                        <TouchableOpacity
                          key={offer.id}
                          style={[styles.offerCard, styles.acceptedMissionCard]}
                          onPress={() => handleOfferPress(offer)}
                        >
                          <View
                            style={[
                              styles.offerNumber,
                              styles.acceptedMissionNumber,
                            ]}
                          >
                            <Text
                              style={[
                                styles.offerNumberText,
                                styles.acceptedMissionNumberText,
                              ]}
                            >
                              {"\ud83d\udd25"}
                            </Text>
                          </View>
                          <View style={styles.offerInfo}>
                            <View style={styles.offerTitleRow}>
                              <Text
                                style={[
                                  styles.offerTitle,
                                  styles.acceptedMissionTitle,
                                ]}
                              >
                                {offer.title}
                              </Text>
                              <View style={styles.missionActions}>
                                <View style={styles.activeMissionBadge}>
                                  <Text style={styles.activeMissionText}>
                                    MISSION EN COURS
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.navigationButton}
                                  onPress={() => startNavigationToClient(offer)}
                                >
                                  <Feather
                                    name="navigation"
                                    size={16}
                                    color="#fff"
                                  />
                                  <Text style={styles.navigationButtonText}>
                                    Itinéraire
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <Text style={styles.offerCategory}>
                              {typeof offer.category === "string"
                                ? offer.category
                                : offer.category?.name || ""}
                            </Text>
                            {offer.originalPrice && offer.acceptedPrice && (
                              <Text style={styles.priceChangeText}>
                                Prix modifié: {offer.originalPrice}{" "}
                                {offer.acceptedPrice}
                              </Text>
                            )}
                            <View style={styles.offerMeta}>
                              <Feather
                                name="map-pin"
                                size={12}
                                color="#6b7280"
                              />
                              <Text style={styles.offerDistance}>
                                {offer.distance}
                              </Text>
                              <Text
                                style={[
                                  styles.offerBudget,
                                  styles.acceptedMissionBudget,
                                ]}
                              >
                                {offer.budget}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.urgencyIndicator,
                              styles.acceptedMissionIndicator,
                            ]}
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {openRequests.length > 0 && (
                  <>
                    <Text style={styles.offersTitle}>
                      Offres près de vous ({openRequests.length})
                    </Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {openRequests.map((offer, index) => (
                        <TouchableOpacity
                          key={offer.id}
                          style={styles.offerCard}
                          onPress={() => handleOfferPress(offer)}
                        >
                          <View style={styles.offerNumber}>
                            <Text style={styles.offerNumberText}>
                              {index + 1}
                            </Text>
                          </View>
                          <View style={styles.offerInfo}>
                            <View style={styles.offerTitleRow}>
                              <Text style={styles.offerTitle}>
                                {offer.title}
                              </Text>
                            </View>
                            <Text style={styles.offerCategory}>
                              {typeof offer.category === "string"
                                ? offer.category
                                : offer.category?.name || ""}
                            </Text>
                            <View style={styles.offerMeta}>
                              <Feather
                                name="map-pin"
                                size={12}
                                color="#6b7280"
                              />
                              <Text style={styles.offerDistance}>
                                {offer.distance}
                              </Text>
                              <Text style={styles.offerBudget}>
                                {offer.budget}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.urgencyIndicator,
                              offer.urgency === "Urgent"
                                ? styles.urgencyUrgentIndicator
                                : {},
                            ]}
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {acceptedMissions.length === 0 && openRequests.length === 0 && (
                  <>
                    <Text style={styles.offersTitle}>
                      Offres près de vous (0)
                    </Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <View style={styles.emptyStateContainer}>
                        <Feather name="search" size={48} color="#9ca3af" />
                        <Text style={styles.emptyStateTitle}>
                          Aucune offre disponible
                        </Text>
                        <Text style={styles.emptyStateText}>
                          Nous n'avons trouvé aucune offre près de vous pour le
                          moment. Veuillez patienter, de nouvelles offres
                          pourraient apparaître bientôt.
                        </Text>
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            );
          })()
        )}

        {/* Image Modal */}
        <Modal
          visible={imageModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setImageModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.modalCloseArea}
              activeOpacity={1}
              onPress={() => setImageModalVisible(false)}
            >
              <View style={styles.modalContent}>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setImageModalVisible(false)}
                >
                  <Feather name="x" size={24} color="#fff" />
                </TouchableOpacity>
                {selectedImage && (
                  <Image
                    source={{ uri: `${API_URL}${selectedImage}` }}
                    style={styles.fullScreenImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* Balance Alert Modal */}
        <Modal
          visible={balanceAlertVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setBalanceAlertVisible(false)}
        >
          <View style={styles.alertOverlay}>
            <View style={styles.alertContainer}>
              <View style={styles.alertHeader}>
                <Feather name="alert-circle" size={32} color="#ef4444" />
              </View>

              <Text style={styles.alertTitle}>Information</Text>
              <Text style={styles.alertMessage}>{alertMessage}</Text>

              <View style={styles.alertButtons}>
                <TouchableOpacity
                  style={styles.alertButton}
                  onPress={() => setBalanceAlertVisible(false)}
                >
                  <Text style={styles.alertButtonText}>Fermer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.alertButton, styles.alertButtonPrimary]}
                  onPress={() => {
                    setBalanceAlertVisible(false);
                    // Navigate to balance screen
                    router.push("/balance-screen");
                  }}
                >
                  <Text
                    style={[
                      styles.alertButtonText,
                      styles.alertButtonTextPrimary,
                    ]}
                  >
                    Pop up balance
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Payment Details Modal */}
        <Modal
          visible={paymentModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPaymentModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.paymentModal}>
              <View style={styles.paymentModalHeader}>
                <Text style={styles.paymentModalTitle}>Mission Terminée!</Text>
                <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                  <Feather name="x" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.paymentModalContent}>
                <Text style={styles.paymentMissionTitle}>
                  {completedMissionData.title}
                </Text>

                <View style={styles.paymentDetails}>
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>Montant total:</Text>
                    <Text style={styles.paymentAmount}>
                      {completedMissionData.originalPrice} DH
                    </Text>
                  </View>

                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>
                      Frais de plateforme:
                    </Text>
                    <Text style={styles.paymentFee}>
                      {completedMissionData.feeAmount} DH
                    </Text>
                  </View>

                  <View style={[styles.paymentRow, styles.paymentTotalRow]}>
                    <Text style={styles.paymentTotalLabel}>Montant reçu:</Text>
                    <Text style={styles.paymentTotalAmount}>
                      {completedMissionData.netAmount} DH
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.paymentCloseButton}
                  onPress={() => setPaymentModalVisible(false)}
                >
                  <Text style={styles.paymentCloseButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Animated.View>
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
  creditsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  creditsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  soldContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  soldText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
  },
  freeMissionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  freeMissionsContainerExhausted: {
    backgroundColor: "#fee2e2",
  },
  freeMissionsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
  },
  freeMissionsTextExhausted: {
    color: "#b91c1c",
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
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationBadge: {
    position: "absolute",
    top: -2,
    right: -2,
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
    backgroundColor: "#d1fae5",
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
  switchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
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
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    width: width,
    height: height * 0.5,
  },
  mapPlaceholder: {
    width: width,
    height: height * 0.5,
    backgroundColor: "#f3f4f6",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
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
  offersContainer: {
    flex: 1,
    paddingBottom: 16,
  },
  offersTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 16,
  },
  offerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  offerNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1e40af",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  offerNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  offerInfo: {
    flex: 1,
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 4,
  },
  offerCategory: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 4,
  },
  offerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offerDistance: {
    fontSize: 12,
    color: "#6b7280",
  },
  offerBudget: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e40af",
  },
  urgencyIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginLeft: 8,
  },
  urgencyUrgentIndicator: {
    backgroundColor: "#ef4444",
  },
  offerDetailContainer: {
    flex: 1,
    paddingBottom: 16,
  },
  offerDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  offerDetailIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  offerDetailInfo: {
    flex: 1,
  },
  offerDetailTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  offerDetailCategory: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  offerDetailContent: {
    flex: 1,
  },
  clientInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1e40af",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  clientAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  clientName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  phoneNumber: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  cityContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cityName: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 13,
    color: "#6b7280",
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: "auto",
  },
  urgencyUrgent: {
    backgroundColor: "#fee2e2",
  },
  urgencyNormal: {
    backgroundColor: "#d1fae5",
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  offerDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  locationText: {
    fontSize: 14,
    color: "#374151",
  },
  distanceText: {
    fontSize: 14,
    color: "#374151",
  },
  imagesSection: {
    marginBottom: 16,
  },
  imagesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  imagesContainer: {
    flexDirection: "row",
    gap: 8,
  },
  requestImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  priceProposalSection: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  priceProposalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  priceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  priceInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1e40af",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 120,
    justifyContent: "center",
  },
  priceInput: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1a1a2e",
    textAlign: "center",
    minWidth: 60,
  },
  priceCurrency: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginLeft: 4,
  },
  originalBudget: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
  },
  sendProposalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  cancelProposalButton: {
    backgroundColor: "#ef4444",
  },
  recenterButton: {
    backgroundColor: "#1e40af",
  },
  completeMissionButton: {
    backgroundColor: "#10b981",
  },
  sendProposalText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    position: "relative",
    width: "90%",
    height: "80%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseButton: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingOfferHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  pendingOfferIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pendingOfferInfo: {
    flex: 1,
  },
  pendingOfferTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 2,
  },
  pendingOfferPrice: {
    fontSize: 18,
    fontWeight: "700",
    color: "#059669",
  },
  cancelPendingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  pendingOfferStatus: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
  },
  offersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e40af",
  },
  // Quota card styles
  quotaCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  quotaCardActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  quotaCardExhausted: {
    backgroundColor: "#fef2f2",
    borderColor: "#ef4444",
  },
  quotaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  quotaCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  quotaCardContent: {
    alignItems: "center",
  },
  quotaCardText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },

  // Accepted mission styles
  acceptedMissionCard: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  acceptedMissionNumber: {
    backgroundColor: "#f59e0b",
  },
  acceptedMissionNumberText: {
    color: "#fff",
  },
  offerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  acceptedMissionTitle: {
    color: "#92400e",
    fontWeight: "700",
  },
  activeMissionBadge: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeMissionText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  priceChangeText: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "500",
    marginBottom: 4,
  },
  acceptedMissionBudget: {
    color: "#059669",
    fontWeight: "700",
  },
  acceptedMissionIndicator: {
    backgroundColor: "#f59e0b",
  },
  missionActions: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  },
  navigationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e40af",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  navigationButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    textAlign: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  // Alert Modal Styles
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  alertHeader: {
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
    textAlign: "center",
  },
  alertMessage: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  alertButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  alertButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  alertButtonPrimary: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  alertButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
    letterSpacing: 0.2,
  },
  alertButtonTextPrimary: {
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  // Payment Modal Styles
  paymentModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    margin: 20,
    padding: 24,
    maxWidth: 320,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  paymentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  paymentModalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  paymentModalContent: {
    alignItems: "center",
  },
  paymentMissionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  paymentDetails: {
    width: "100%",
    marginBottom: 24,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: "#666",
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a2e",
  },
  paymentFee: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ef4444",
  },
  paymentTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    marginTop: 4,
  },
  paymentTotalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  paymentTotalAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10b981",
  },
  paymentCloseButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  paymentCloseButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

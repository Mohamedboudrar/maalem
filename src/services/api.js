import axios from "axios";
import Constants from "expo-constants";

/**
 * =========================================================
 * API URL CONFIGURATION
 * =========================================================
 */

// Development ngrok URL
const DEV_API_URL = "https://maalembk-production.up.railway.app";

// Production backend URL
const PROD_API_URL = "https://maalembk-production.up.railway.app";

// Final API URL resolution
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  (__DEV__ ? DEV_API_URL : PROD_API_URL);

/**
 * =========================================================
 * AXIOS INSTANCE
 * =========================================================
 */

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,

  headers: {
    "Content-Type": "application/json",

    // Prevent ngrok warning page issues
    "ngrok-skip-browser-warning": "true",

    Accept: "application/json",
  },
});

/**
 * =========================================================
 * REQUEST INTERCEPTOR
 * =========================================================
 */

api.interceptors.request.use(
  async (config) => {
    // Optional future auth token support
    // const token = await AsyncStorage.getItem("token");
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }

    if (__DEV__) {
      console.log(
        `🚀 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`,
      );
    }

    return config;
  },
  (error) => {
    if (__DEV__) {
      console.error("❌ Request Error:", error.message);
    }

    return Promise.reject(error);
  },
);

/**
 * =========================================================
 * RESPONSE INTERCEPTOR
 * =========================================================
 */

api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    }

    return response;
  },
  (error) => {
    if (__DEV__) {
      if (error.response) {
        console.error("❌ API Response Error:", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response.status,
          data: error.response.data,
        });
      } else if (error.request) {
        console.error("❌ No Response From Server:", {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          message: error.message,
          code: error.code,
        });
      } else {
        console.error("❌ Axios Config Error:", error.message);
      }
    }

    return Promise.reject(error);
  },
);

/**
 * =========================================================
 * BACKEND CONNECTION TEST
 * =========================================================
 */

export const testBackendConnection = async () => {
  try {
    console.log("🔍 Testing backend connection...");
    console.log("🌐 API URL:", API_URL);

    const response = await api.get("/");

    console.log("✅ Backend connected successfully:", response.data);

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Backend connection failed:", {
      url: API_URL,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    });

    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * =========================================================
 * EXPORTS
 * =========================================================
 */

export { API_URL };

export default api;

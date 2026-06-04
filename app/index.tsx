import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";

import LoadingScreen from "../components/LoadingScreen";
import { getSessionUser } from "../src/services/firebaseAuth";

const { width } = Dimensions.get("window");

const CARDS = [
  {
    id: "1",
    title: "Experts Électriciens",
    description:
      "Des techniciens certifiés pour toutes vos pannes électriques et installations domestiques en un clic.",
    image:
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop",
  },
  {
    id: "2",
    title: "Plombiers Pros",
    description:
      "Des plombiers expérimentés pour vos fuites, installations sanitaires et dépannages urgents.",
    image:
      "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600&auto=format&fit=crop",
  },
  {
    id: "3",
    title: "Menuisiers Qualifiés",
    description:
      "Des artisans menuisiers pour vos portes, fenêtres, meubles sur mesure et rénovations.",
    image:
      "https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?w=600&auto=format&fit=crop",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    },
  ).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getSessionUser();
        if (user) {
          if (user.role === "TECHNICIAN") {
            const isVerified = (user as any)?.TechnicianProfile?.isVerified;
            if (isVerified === true) {
              router.replace("/worker-map");
            } else {
              router.replace("/worker-registration");
            }
          } else {
            router.replace("/map");
          }
        }
      } catch (error) {
        console.log("No active session, showing welcome screen");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  if (loading) {
    return <LoadingScreen message="Vérification de votre session..." />;
  }

  const renderCard = ({ item }: { item: (typeof CARDS)[0] }) => (
    <View style={styles.card}>
      <View style={styles.cardImageContainer}>
        <Image
          source={{ uri: item.image }}
          style={styles.cardImage}
          contentFit="cover"
        />
        <View style={styles.logoOverlay}>
          <View style={styles.smallLogo}>
            <Image
              source={require("../assets/images/logo-M.png")}
              style={{ width: 20, height: 20 }}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDescription}>{item.description}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo-M.png")}
            style={{ width: 98, height: 98 }}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.mainTitle}>Vos travaux, simplifiés.</Text>
        <Text style={styles.subtitle}>
          La solution n°1 au Maroc pour connecter{"\n"}clients et artisans
          qualifiés.
        </Text>
      </View>

      {/* Scrollable Cards */}
      <View style={styles.cardsSection}>
        <FlatList
          ref={flatListRef}
          data={CARDS}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          snapToInterval={width - 48}
          decelerationRate="fast"
          contentContainerStyle={styles.cardsContainer}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />

        {/* Pagination Dots */}
        <View style={styles.pagination}>
          {CARDS.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === activeIndex && styles.activeDot]}
            />
          ))}
        </View>
      </View>

      {/* Features */}
      <View style={styles.featuresContainer}>
        <View style={styles.featureTags}>
          <View style={styles.featureTag}>
            <MaterialCommunityIcons
              name="shield-check"
              size={14}
              color="#22c55e"
            />
            <Text style={styles.featureText}>Artisans Vérifiés</Text>
          </View>
          <View style={styles.featureTag}>
            <Feather name="clock" size={14} color="#3b82f6" />
            <Text style={styles.featureText}>Intervention 24/7</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.instantQuoteButton}>
          <Feather name="arrow-right" size={16} color="#666" />
          <Text style={styles.instantQuoteText}>Devis Instantané</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.primaryButtonText}>Commencer l'aventure</Text>
          <Feather name="chevron-right" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={async () => {
            try {
              const user = await getSessionUser();
              console.log("Skip button - user data:", user);

              if (!user) {
                // No user logged in, go to login
                router.replace("/login");
              } else if (user.role === "TECHNICIAN") {
                // Check if technician is verified
                if (user.technicianProfile?.isVerified) {
                  console.log(
                    "Skip button - verified technician, going to worker-map",
                  );
                  router.replace("/worker-map");
                } else {
                  console.log(
                    "Skip button - unverified technician, going to registration",
                  );
                  router.replace("/worker-registration");
                }
              } else {
                // Client or other role, go to map
                console.log("Skip button - client user, going to map");
                router.replace("/map");
              }
            } catch (error) {
              console.error("Skip button - error checking user:", error);
              // Fallback to login if there's an error
              router.replace("/login");
            }
          }}
        >
          <Text style={styles.skipText}>Passer l'introduction</Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          En continuant, vous acceptez nos Conditions Généles{"\n"}d'Utilisation
          et notre Politique de Confidentialité.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  logoContainer: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  cardsSection: {
    marginTop: 24,
  },
  cardsContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    width: width - 48,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginRight: 16,
  },
  cardImageContainer: {
    position: "relative",
    height: 180,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  logoOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  smallLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ddd",
  },
  activeDot: {
    backgroundColor: "#1e40af",
    width: 24,
  },
  featuresContainer: {
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 24,
  },
  featureTags: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  featureTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  featureText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  instantQuoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  instantQuoteText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  footer: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e40af",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    marginBottom: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    marginBottom: 16,
  },
  skipText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  termsText: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 16,
  },
});

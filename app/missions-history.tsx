import api from '@/src/services/api';
import { getAuthToken } from '@/src/services/firebaseAuth';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

interface CompletedMission {
  id: string;
  title: string;
  description: string;
  originalPrice: number;
  feeAmount: number;
  netAmount: number;
  completedAt: string;
  clientName: string;
  clientRating?: number;
  status: string;
  category: string;
}

export default function MissionsHistoryScreen() {
  const router = useRouter();
  const [missions, setMissions] = useState<CompletedMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');

  useEffect(() => {
    fetchMissions();
  }, []);

  const fetchMissions = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authenticated session found.');
      }

      // Fetch ALL technician offers (not just accepted)
      const response = await api.get('/api/technician/offers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const offers = response.data || [];

      const mappedMissions = offers
        .map(offer => ({
          id: offer.id,
          title: offer.Request?.title || 'Mission',
          description: offer.Request?.description || '',
          originalPrice: offer.price || 0,
          feeAmount: offer.price ? Math.round(offer.price * 0.1) : 0,
          netAmount: offer.price ? Math.round(offer.price * 0.9) : 0,
          completedAt: offer.updatedAt || offer.createdAt,
          clientName: offer.Request?.User?.fullName || 'Client',
          clientRating: offer.Request?.User?.averageRating,
          status: String(offer.status || '').toUpperCase(),
          category: offer.Request?.ServiceCategory?.name || 'Service'
        }))
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      setMissions(mappedMissions);
    } catch (error) {
      console.error('Error fetching missions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMissions();
  };

  const filteredMissions = missions.filter(mission => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['PENDING','ACCEPTED','ASSIGNED','IN_PROGRESS','STARTED','ONGOING'].includes(mission.status);
    if (filter === 'completed') return mission.status === 'DONE' || mission.status === 'COMPLETED';
    if (filter === 'cancelled') return mission.status === 'CANCELLED';
    return true;
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DONE':
      case 'COMPLETED': return 'Terminée';
      case 'PENDING': return 'En attente';
      case 'ACCEPTED':
      case 'ASSIGNED': return 'Acceptée';
      case 'IN_PROGRESS':
      case 'STARTED':
      case 'ONGOING': return 'En cours';
      case 'CANCELLED': return 'Annulée';
      default: return status;
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'DONE':
      case 'COMPLETED': return { backgroundColor: '#d1fae5' };
      case 'PENDING': return { backgroundColor: '#fef3c7' };
      case 'ACCEPTED':
      case 'ASSIGNED': return { backgroundColor: '#dbeafe' };
      case 'IN_PROGRESS':
      case 'STARTED':
      case 'ONGOING': return { backgroundColor: '#e0e7ff' };
      case 'CANCELLED': return { backgroundColor: '#fee2e2' };
      default: return { backgroundColor: '#f3f4f6' };
    }
  };

  const getStatusTextStyle = (status: string) => {
    switch (status) {
      case 'DONE':
      case 'COMPLETED': return { color: '#059669' };
      case 'PENDING': return { color: '#d97706' };
      case 'ACCEPTED':
      case 'ASSIGNED': return { color: '#2563eb' };
      case 'IN_PROGRESS':
      case 'STARTED':
      case 'ONGOING': return { color: '#4338ca' };
      case 'CANCELLED': return { color: '#dc2626' };
      default: return { color: '#6b7280' };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMissionCard = (mission: CompletedMission) => (
    <View key={mission.id} style={styles.missionCard}>
      <View style={styles.missionHeader}>
        <View style={styles.missionInfo}>
          <Text style={styles.missionTitle}>{mission.title}</Text>
          <Text style={styles.missionCategory}>{mission.category}</Text>
          <Text style={styles.missionDate}>{formatDate(mission.completedAt)}</Text>
        </View>
        <View style={[styles.statusBadge, getStatusBadgeStyle(mission.status)]}>
          <Text style={[styles.statusText, getStatusTextStyle(mission.status)]}>{getStatusLabel(mission.status)}</Text>
        </View>
      </View>

      <Text style={styles.missionDescription} numberOfLines={2}>
        {mission.description}
      </Text>

      <View style={styles.clientInfo}>
        <View style={styles.clientDetails}>
          <Feather name="user" size={14} color="#6b7280" />
          <Text style={styles.clientName}>{mission.clientName}</Text>
          {mission.clientRating && (
            <View style={styles.ratingContainer}>
              <Feather name="star" size={12} color="#fbbf24" />
              <Text style={styles.ratingText}>{mission.clientRating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.paymentInfo}>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Prix original</Text>
          <Text style={styles.paymentValue}>{mission.originalPrice} DH</Text>
        </View>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Frais plateforme (10%)</Text>
          <Text style={styles.paymentFee}>-{mission.feeAmount} DH</Text>
        </View>
        <View style={[styles.paymentRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Montant reçu</Text>
          <Text style={styles.totalValue}>{mission.netAmount} DH</Text>
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="clipboard-check" size={80} color="#d1d5db" />
      <Text style={styles.emptyTitle}>Aucune mission</Text>
      <Text style={styles.emptyMessage}>
        Vos missions apparaîtront ici
      </Text>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Feather name="arrow-left" size={18} color="#fff" />
        <Text style={styles.backButtonText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && missions.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Chargement de l'historique...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Missions</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Toutes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            Actives
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'completed' && styles.filterTabActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            Terminées
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'cancelled' && styles.filterTabActive]}
          onPress={() => setFilter('cancelled')}
        >
          <Text style={[styles.filterText, filter === 'cancelled' && styles.filterTextActive]}>
            Annulées
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredMissions.length > 0 ? (
          <>
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Résumé</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Missions actives</Text>
                <Text style={styles.summaryValue}>
                  {missions.filter(m => ['PENDING','ACCEPTED','ASSIGNED','IN_PROGRESS','STARTED','ONGOING'].includes(m.status)).length}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Missions terminées</Text>
                <Text style={styles.summaryValue}>
                  {missions.filter(m => m.status === 'DONE' || m.status === 'COMPLETED').length}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total gagné</Text>
                <Text style={styles.summaryValue}>
                  {missions
                    .filter(m => m.status === 'DONE' || m.status === 'COMPLETED')
                    .reduce((sum, m) => sum + m.netAmount, 0)} DH
                </Text>
              </View>
            </View>

            <View style={styles.missionsList}>
              {filteredMissions.map(renderMissionCard)}
            </View>
          </>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  placeholder: {
    width: 44,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  filterTabActive: {
    backgroundColor: '#1e40af',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  filterTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summaryContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  missionsList: {
    gap: 15,
  },
  missionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  missionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  missionInfo: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  missionCategory: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  missionDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  completedBadge: {
    backgroundColor: '#d1fae5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  missionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  clientInfo: {
    marginBottom: 15,
  },
  clientDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientName: {
    fontSize: 14,
    color: '#6b7280',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  paymentInfo: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 15,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  paymentFee: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ef4444',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
    marginTop: 5,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
});

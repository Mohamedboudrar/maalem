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

interface EarningRecord {
  id: string;
  title: string;
  category: string;
  completedAt: string;
  price: number;
  fee: number;
  net: number;
  clientName: string;
}

interface EarningsStats {
  totalEarned: number;
  totalFees: number;
  netEarnings: number;
  completedCount: number;
  averagePerMission: number;
}

export default function EarningsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [stats, setStats] = useState<EarningsStats>({
    totalEarned: 0,
    totalFees: 0,
    netEarnings: 0,
    completedCount: 0,
    averagePerMission: 0,
  });

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      if (!token) throw new Error('No authenticated session found.');

      const response = await api.get('/api/technician/offers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const offers = response.data || [];

      const completed = offers
        .filter((o: any) => {
          const s = String(o.status || '').toUpperCase();
          return s === 'DONE' || s === 'COMPLETED';
        })
        .map((o: any) => {
          const price = o.price || 0;
          const fee = price ? Math.round(price * 0.1) : 0;
          return {
            id: o.id,
            title: o.Request?.title || 'Mission',
            category: o.Request?.ServiceCategory?.name || 'Service',
            completedAt: o.updatedAt || o.createdAt,
            price,
            fee,
            net: price - fee,
            clientName: o.Request?.User?.fullName || 'Client',
          };
        })
        .sort((a: EarningRecord, b: EarningRecord) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        );

      const totalEarned = completed.reduce((s: number, r: EarningRecord) => s + r.price, 0);
      const totalFees = completed.reduce((s: number, r: EarningRecord) => s + r.fee, 0);
      const netEarnings = totalEarned - totalFees;

      setRecords(completed);
      setStats({
        totalEarned,
        totalFees,
        netEarnings,
        completedCount: completed.length,
        averagePerMission: completed.length ? Math.round(netEarnings / completed.length) : 0,
      });
    } catch (error) {
      console.error('Error fetching earnings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const formatMonthYear = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  const groupByMonth = () => {
    const groups: Record<string, EarningRecord[]> = {};
    records.forEach((r) => {
      const key = formatMonthYear(r.completedAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  };

  if (loading && records.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Chargement des gains...</Text>
      </View>
    );
  }

  const monthGroups = groupByMonth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Gains</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardPrimary]}>
            <MaterialCommunityIcons name="wallet" size={28} color="#1e40af" />
            <Text style={styles.statValue}>{stats.netEarnings} DH</Text>
            <Text style={styles.statLabel}>Net gagné</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="briefcase-check" size={28} color="#059669" />
            <Text style={styles.statValue}>{stats.completedCount}</Text>
            <Text style={styles.statLabel}>Missions</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="cash" size={28} color="#d97706" />
            <Text style={styles.statValue}>{stats.totalEarned} DH</Text>
            <Text style={styles.statLabel}>Total brut</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="percent" size={28} color="#dc2626" />
            <Text style={styles.statValue}>{stats.totalFees} DH</Text>
            <Text style={styles.statLabel}>Frais plateforme</Text>
          </View>
        </View>

        <View style={styles.averageCard}>
          <View style={styles.averageLeft}>
            <Text style={styles.averageLabel}>Gain moyen / mission</Text>
            <Text style={styles.averageValue}>{stats.averagePerMission} DH</Text>
          </View>
          <View style={styles.averageIcon}>
            <Feather name="trending-up" size={24} color="#1e40af" />
          </View>
        </View>

        {Object.keys(monthGroups).length > 0 ? (
          Object.entries(monthGroups).map(([month, items]) => {
            const monthTotal = items.reduce((s, r) => s + r.net, 0);
            return (
              <View key={month} style={styles.monthSection}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthTitle}>{month}</Text>
                  <Text style={styles.monthTotal}>{monthTotal} DH</Text>
                </View>
                {items.map((record) => (
                  <View key={record.id} style={styles.recordCard}>
                    <View style={styles.recordLeft}>
                      <View style={styles.recordDot} />
                      <View>
                        <Text style={styles.recordTitle}>{record.title}</Text>
                        <Text style={styles.recordMeta}>{record.category} · {record.clientName}</Text>
                        <Text style={styles.recordDate}>{formatDate(record.completedAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.recordRight}>
                      <Text style={styles.recordNet}>+{record.net} DH</Text>
                      <Text style={styles.recordFee}>-{record.fee} DH frais</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="cash-remove" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>Aucun gain</Text>
            <Text style={styles.emptyMessage}>Vos gains apparaîtront ici une fois vos missions terminées.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1f2937' },
  placeholder: { width: 44 },
  content: { flex: 1, padding: 16 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  statCardPrimary: { borderColor: '#1e40af', backgroundColor: '#eff6ff' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1f2937', marginTop: 8 },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  averageCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#e5e7eb' },
  averageLeft: { flex: 1 },
  averageLabel: { fontSize: 14, color: '#6b7280' },
  averageValue: { fontSize: 24, fontWeight: '700', color: '#1e40af', marginTop: 4 },
  averageIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
  monthSection: { marginBottom: 16 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  monthTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', textTransform: 'capitalize' },
  monthTotal: { fontSize: 14, fontWeight: '700', color: '#1e40af' },
  recordCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  recordLeft: { flexDirection: 'row', flex: 1, gap: 10 },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981', marginTop: 6 },
  recordTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  recordMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  recordDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  recordRight: { alignItems: 'flex-end' },
  recordNet: { fontSize: 15, fontWeight: '700', color: '#059669' },
  recordFee: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginTop: 16 },
  emptyMessage: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});

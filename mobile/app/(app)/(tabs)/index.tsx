import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMyBons } from '@/api/bons';
import { useAuthStore } from '@/store/auth';
import { DateField } from '@/components/DateField';
import { STATUT_META, formatDate, formatMontant, todayISO } from '@/lib/format';
import type { Bon } from '@/types';

export default function MesBonsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const today = todayISO();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const isToday = dateFrom === today && dateTo === today;

  const { data: bons, isLoading, isError, refetch, isRefetching } = useMyBons(user?.id, { dateFrom, dateTo });

  // Total des bons déjà décaissés sur la période filtrée.
  const totalDecaisse = useMemo(() => {
    const list: Bon[] = bons ?? [];
    return list
      .filter((b) => b.statut === 'DECAISSE')
      .reduce((s, b) => s + Number(b.montantTotal || 0), 0);
  }, [bons]);

  const renderItem = useCallback(
    ({ item }: { item: Bon }) => {
      const meta = STATUT_META[item.statut] ?? STATUT_META.CREE;
      return (
        <Pressable style={styles.row} onPress={() => router.push(`/bons/${item.id}`)}>
          <View style={styles.rowLeft}>
            <Text style={styles.numero}>{item.numero}</Text>
            <Text style={styles.date}>
              {formatDate(item.createdAt)}
              {item.estRecurrent ? '  •  récurrent' : ''}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.montant}>{formatMontant(item.montantTotal)}</Text>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [router],
  );

  return (
    <View style={styles.container}>
      {/* Filtre par dates */}
      <View style={styles.filterBar}>
        <DateField label="Du" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Au" value={dateTo} onChange={setDateTo} />
        {!isToday && (
          <Pressable
            style={styles.todayBtn}
            onPress={() => {
              setDateFrom(today);
              setDateTo(today);
            }}
          >
            <Text style={styles.todayText}>Aujourd'hui</Text>
          </Pressable>
        )}
      </View>

      {/* Barre : total décaissé sur la période */}
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total décaissé</Text>
        <Text style={styles.summaryValue}>{formatMontant(totalDecaisse)}</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F4C81" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>Impossible de charger les bons.</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={bons ?? []}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0F4C81" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Aucun bon sur cette période.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  todayBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#0F4C81',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  summary: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#047857' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#047857' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  listContent: { padding: 14, flexGrow: 1 },
  sep: { height: 10 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.08)',
  },
  rowLeft: { flex: 1, paddingRight: 10 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  numero: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  date: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  montant: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14 },
  empty: { color: '#64748B', fontSize: 14 },
  retry: { backgroundColor: '#0F4C81', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
});

import { useCallback } from 'react';
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
import { useBonsAValider } from '@/api/bons';
import { STATUT_META, formatDate, formatMontant } from '@/lib/format';
import type { Bon } from '@/types';

export default function AValiderScreen() {
  const router = useRouter();
  const { data: bons, isLoading, isError, refetch, isRefetching } = useBonsAValider();

  const renderItem = useCallback(
    ({ item }: { item: Bon }) => {
      const meta = STATUT_META[item.statut] ?? STATUT_META.CREE;
      return (
        <Pressable style={styles.row} onPress={() => router.push(`/bons/${item.id}`)}>
          <View style={styles.rowLeft}>
            <Text style={styles.numero}>{item.numero}</Text>
            <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0F4C81" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Impossible de charger la file.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={bons ?? []}
      keyExtractor={(b) => b.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0F4C81" />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>Aucun bon à valider.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F1F5F9' },
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
});

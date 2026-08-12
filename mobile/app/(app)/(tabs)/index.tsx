import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMyBons } from '@/api/bons';
import { useAuthStore } from '@/store/auth';
import { DateField } from '@/components/DateField';
import { STATUT_META, formatDate, formatMontant, todayISO } from '@/lib/format';
import type { Bon, BonStatut } from '@/types';

export default function MesBonsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const today = todayISO();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const isToday = dateFrom === today && dateTo === today;

  /**
   * Recherche et statut sont envoyés à la BASE, comme les dates.
   *
   * Filtrer en mémoire ne trie que ce que l'écran a déjà reçu : un bon resté au
   * serveur ne serait jamais trouvé, et une puce de statut oubliée pouvait
   * masquer le bon qu'on venait de créer.
   */
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<BonStatut | 'TOUTES'>('TOUTES');

  const { data: bons, isLoading, isError, refetch, isRefetching } = useMyBons(user?.id, {
    dateFrom,
    dateTo,
    search: search.trim() || undefined,
    statut: statutFilter === 'TOUTES' ? undefined : statutFilter,
  });

  /**
   * Somme des montants RÉELLEMENT décaissés, telle que le serveur les calcule
   * (ajustements du caissier inclus) — et non la somme des montants demandés des
   * bons au statut « décaissé », qui ignorait ces ajustements.
   */
  const totalDecaisse = useMemo(
    () => (bons ?? []).reduce((s, b) => s + Number(b.montantDecaisse || 0), 0),
    [bons],
  );

  /** Liste fixe : les puces ne dépendent plus de ce que la page a reçu. */
  const STATUTS: (BonStatut | 'TOUTES')[] = [
    'TOUTES',
    'CREE',
    'VALIDE',
    'DECAISSE',
    'COMPTABILISE',
    'ANNULE',
    'REFUSE',
  ];

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

      {/* Recherche */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher (n°, montant)…"
          placeholderTextColor="#94A3B8"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#CBD5E1" />
          </Pressable>
        ) : null}
      </View>

      {/* Puces de statut */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STATUTS.map((s) => {
            const active = statutFilter === s;
            const label = s === 'TOUTES' ? 'Tous' : STATUT_META[s]?.label ?? s;
            return (
              <Pressable
                key={s}
                onPress={() => setStatutFilter(s)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
              <Ionicons name="file-tray-outline" size={40} color="#CBD5E1" />
              <Text style={styles.empty}>
                {search || statutFilter !== 'TOUTES' ? 'Aucun bon ne correspond.' : 'Aucun bon sur cette période.'}
              </Text>
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
  searchWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  chips: { gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#0F4C81', borderColor: '#0F4C81' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#fff' },
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

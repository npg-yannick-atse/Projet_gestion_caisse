import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBonsAValider, useMesValidations } from '@/api/bons';
import { useAuthStore } from '@/store/auth';
import { DateField } from '@/components/DateField';
import { STATUT_META, formatDate, formatMontant, todayISO } from '@/lib/format';
import type { Bon } from '@/types';

type Mode = 'FILE' | 'HISTORIQUE';

/**
 * Deux lectures du même métier de validateur :
 *
 *  - « À valider » : la file d'attente, ce qui reste à traiter ;
 *  - « Mes validations » : ce qu'il a déjà traité, sur une plage de dates.
 *
 * Le second manquait — une fois le bon validé, il disparaissait de l'écran sans
 * qu'aucune vue mobile ne permette d'y revenir. Un validateur à qui l'on demande
 * « tu as bien validé le bon de mardi ? » n'avait aucun moyen de répondre.
 *
 * Les dates portent sur le jour de la DÉCISION, pas sur celui de la création :
 * c'est la date dont le validateur se souvient.
 */
export default function AValiderScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<Mode>('FILE');

  const today = todayISO();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const isToday = dateFrom === today && dateTo === today;

  /**
   * Recherche envoyée à la BASE, pas appliquée en mémoire : la liste ne contient
   * que la page reçue, un filtre local ne verrait donc jamais un bon resté au
   * serveur.
   */
  const [search, setSearch] = useState('');

  const file = useBonsAValider(mode === 'FILE', search.trim() || undefined);
  const historique = useMesValidations(
    user?.id,
    { dateFrom, dateTo, search: search.trim() || undefined },
    mode === 'HISTORIQUE',
  );

  const source = mode === 'FILE' ? file : historique;
  const { data: bons, isLoading, isError, refetch, isRefetching } = source;

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

  return (
    <View style={styles.list}>
      {/* Bascule file d'attente / historique */}
      <View style={styles.modes}>
        {(
          [
            ['FILE', 'À valider'],
            ['HISTORIQUE', 'Mes validations'],
          ] as [Mode, string][]
        ).map(([m, label]) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Plage de dates — uniquement pour l'historique : la file d'attente doit
          rester complète, un bon en attente depuis trois jours ne doit pas
          sortir de l'écran parce qu'on regarde aujourd'hui. */}
      {mode === 'HISTORIQUE' && (
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
      )}

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

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F4C81" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>
            {mode === 'FILE' ? 'Impossible de charger la file.' : 'Impossible de charger vos validations.'}
          </Text>
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
              <Ionicons
                name={
                  search
                    ? 'search-outline'
                    : mode === 'FILE'
                      ? 'checkmark-done-circle-outline'
                      : 'time-outline'
                }
                size={40}
                color="#CBD5E1"
              />
              <Text style={styles.empty}>
                {search
                  ? 'Aucun bon ne correspond.'
                  : mode === 'FILE'
                    ? 'Aucun bon à valider. 🎉'
                    : 'Aucune validation sur cette période.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F1F5F9' },
  modes: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeBtnActive: { backgroundColor: '#0F4C81' },
  modeText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  modeTextActive: { color: '#fff' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F1F5F9' },
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

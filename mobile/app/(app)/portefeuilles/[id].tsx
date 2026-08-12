import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMesPortefeuilles, useMouvementsPortefeuille, useSoldePortefeuille } from '@/api/portefeuilles';
import { DateField } from '@/components/DateField';
import { formatDate, formatMontant, todayISO } from '@/lib/format';
import type { Operation } from '@/types';

/**
 * Sens du mouvement VU DU PORTEFEUILLE.
 *
 * Une recharge caisse → portefeuille l'alimente ; un décaissement le vide.
 * Afficher un montant nu, sans signe, obligerait le lecteur à se souvenir du
 * sens de chaque type d'opération.
 */
const ENTREES = new Set(['RECHARGE', 'REMBOURSEMENT', 'ENCAISSEMENT']);

const LIBELLES: Record<string, string> = {
  ENCAISSEMENT: 'Encaissement',
  DECAISSEMENT: 'Décaissement',
  RECHARGE: 'Recharge',
  TRANSFERT: 'Transfert',
  REMBOURSEMENT: 'Remboursement',
  CREDIT: 'Crédit',
};

/**
 * Mouvements d'un portefeuille, sur une plage de dates.
 *
 * Le filtre par dates est envoyé au serveur, comme partout ailleurs : la liste
 * reçue est déjà la bonne, on ne trie rien en mémoire.
 */
export default function MouvementsPortefeuilleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Un mois glissant par défaut : la journée seule serait presque toujours vide
  // sur un portefeuille, qui bouge bien moins souvent qu'une caisse.
  const today = todayISO();
  const [dateFrom, setDateFrom] = useState(() => ilYaUnMois());
  const [dateTo, setDateTo] = useState(today);

  const { data: portefeuilles } = useMesPortefeuilles();
  const portefeuille = (portefeuilles ?? []).find((p) => String(p.id) === String(id));
  const { data: solde } = useSoldePortefeuille(id);
  const { data: mouvements, isLoading, isError, refetch, isRefetching } = useMouvementsPortefeuille(
    id,
    { dateFrom, dateTo },
  );

  const totaux = useMemo(() => {
    let entrees = 0;
    let sorties = 0;
    for (const op of mouvements ?? []) {
      const m = Number(op.montant || 0);
      if (ENTREES.has(String(op.typeOperation))) entrees += m;
      else sorties += m;
    }
    return { entrees, sorties };
  }, [mouvements]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: portefeuille?.libelle ?? 'Portefeuille' }} />

      <View style={styles.entete}>
        <Text style={styles.soldeLabel}>Solde actuel</Text>
        <Text style={[styles.solde, Number(solde?.solde ?? 0) < 0 && styles.soldeNegatif]}>
          {formatMontant(solde?.solde ?? '0')}
        </Text>
      </View>

      <View style={styles.filtres}>
        <DateField label="Du" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Au" value={dateTo} onChange={setDateTo} />
      </View>

      <View style={styles.totaux}>
        <View style={styles.totalBloc}>
          <Ionicons name="arrow-down-circle" size={16} color="#047857" />
          <Text style={styles.totalEntree}>{formatMontant(totaux.entrees)}</Text>
        </View>
        <View style={styles.totalBloc}>
          <Ionicons name="arrow-up-circle" size={16} color="#B42318" />
          <Text style={styles.totalSortie}>{formatMontant(totaux.sorties)}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F4C81" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>Impossible de charger les mouvements.</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={mouvements ?? []}
          keyExtractor={(op) => op.id}
          contentContainerStyle={styles.contenu}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0F4C81" />}
          renderItem={({ item }) => <Ligne operation={item} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="swap-vertical-outline" size={40} color="#CBD5E1" />
              <Text style={styles.vide}>Aucun mouvement sur cette période.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function Ligne({ operation }: { operation: Operation }) {
  const entree = ENTREES.has(String(operation.typeOperation));
  const libelle = LIBELLES[String(operation.typeOperation)] ?? operation.typeOperation;
  return (
    <View style={styles.ligne}>
      <View style={styles.ligneGauche}>
        <Text style={styles.type}>{libelle}</Text>
        <Text style={styles.date}>
          {formatDate(operation.dateOperation)}
          {operation.reference ? `  ·  ${operation.reference}` : ''}
        </Text>
      </View>
      <Text style={entree ? styles.montantEntree : styles.montantSortie}>
        {entree ? '+' : '−'} {formatMontant(operation.montant)}
      </Text>
    </View>
  );
}

/** Un mois en arrière, en `YYYY-MM-DD`, sans déborder sur les fins de mois. */
function ilYaUnMois(): string {
  const n = new Date();
  const cibleMois = n.getMonth() - 1;
  const annee = n.getFullYear() + Math.floor(cibleMois / 12);
  const mois = ((cibleMois % 12) + 12) % 12;
  const dernierJour = new Date(annee, mois + 1, 0).getDate();
  const jour = Math.min(n.getDate(), dernierJour);
  return `${annee}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F1F5F9' },
  entete: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  soldeLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  solde: { fontSize: 26, fontWeight: '800', color: '#047857', marginTop: 2 },
  soldeNegatif: { color: '#B42318' },
  filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  totaux: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  totalBloc: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  totalEntree: { fontSize: 14, fontWeight: '800', color: '#047857' },
  totalSortie: { fontSize: 14, fontWeight: '800', color: '#B42318' },
  contenu: { padding: 14, flexGrow: 1 },
  sep: { height: 10 },
  ligne: {
    backgroundColor: '#fff',
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.08)',
  },
  ligneGauche: { flex: 1, paddingRight: 10 },
  type: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  date: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  montantEntree: { fontSize: 15, fontWeight: '800', color: '#047857' },
  montantSortie: { fontSize: 15, fontWeight: '800', color: '#B42318' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  vide: { color: '#64748B', fontSize: 14 },
  error: { color: '#B42318', fontSize: 14 },
  retry: { backgroundColor: '#0F4C81', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
});

import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMesPortefeuilles, useSoldePortefeuille } from '@/api/portefeuilles';
import { formatMontant } from '@/lib/format';
import type { Portefeuille } from '@/types';

/**
 * Mes portefeuilles.
 *
 * Le mobile ne montrait nulle part où en était l'argent : un demandeur créait
 * des bons sans jamais voir ce qui restait sur le portefeuille qui les finance.
 *
 * Le périmètre est celui du serveur — `GET /portefeuilles` ne renvoie déjà que
 * les portefeuilles possédés, gérés, ou ceux de la direction. Rien n'est filtré
 * ici : la liste reçue EST le périmètre.
 */
export default function PortefeuillesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useMesPortefeuilles();

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
        <Text style={styles.error}>Impossible de charger vos portefeuilles.</Text>
        <Pressable onPress={() => refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.liste}
      data={data ?? []}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.contenu}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0F4C81" />}
      renderItem={({ item }) => (
        <CartePortefeuille
          portefeuille={item}
          onPress={() => router.push(`/portefeuilles/${item.id}`)}
        />
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="wallet-outline" size={40} color="#CBD5E1" />
          <Text style={styles.vide}>Aucun portefeuille ne vous est rattaché.</Text>
        </View>
      }
    />
  );
}

/**
 * Une carte par portefeuille, avec son solde.
 *
 * Le solde se demande portefeuille par portefeuille : c'est un composant à
 * part, donc un hook par carte — impossible dans une boucle. Les porteurs en
 * ont un ou deux, la dépense reste négligeable.
 */
function CartePortefeuille({
  portefeuille,
  onPress,
}: {
  portefeuille: Portefeuille;
  onPress: () => void;
}) {
  const { data: solde, isLoading } = useSoldePortefeuille(portefeuille.id);

  const alloue = Number(solde?.soldeInitial ?? 0);
  const restant = Number(solde?.solde ?? 0);
  // Part consommée du budget alloué. Sans allocation, il n'y a pas de taux à
  // afficher : une barre à 0 % laisserait croire à un budget intact.
  const consomme = alloue > 0 ? Math.min(100, Math.max(0, ((alloue - restant) / alloue) * 100)) : null;

  return (
    <Pressable style={styles.carte} onPress={onPress}>
      <View style={styles.carteHaut}>
        <View style={styles.carteTitre}>
          <Text style={styles.libelle} numberOfLines={1}>
            {portefeuille.libelle}
          </Text>
          <Text style={styles.code}>{portefeuille.code}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#0F4C81" style={styles.chargement} />
      ) : (
        <>
          <View style={styles.ligneSolde}>
            <Text style={styles.soldeLabel}>Solde</Text>
            <Text style={[styles.solde, restant < 0 && styles.soldeNegatif]}>
              {formatMontant(solde?.solde ?? '0')}
            </Text>
          </View>

          {consomme !== null && (
            <>
              <View style={styles.jauge}>
                <View style={[styles.jaugeRemplie, { width: `${consomme}%` }]} />
              </View>
              <Text style={styles.jaugeTexte}>
                {Math.round(consomme)} % du budget alloué ({formatMontant(solde?.soldeInitial ?? '0')})
              </Text>
            </>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  liste: { flex: 1, backgroundColor: '#F1F5F9' },
  contenu: { padding: 14, flexGrow: 1 },
  sep: { height: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F1F5F9' },
  carte: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  carteHaut: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  carteTitre: { flex: 1 },
  libelle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  code: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  chargement: { marginTop: 12, alignSelf: 'flex-start' },
  ligneSolde: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  soldeLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  solde: { fontSize: 20, fontWeight: '800', color: '#047857' },
  soldeNegatif: { color: '#B42318' },
  jauge: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
    overflow: 'hidden',
  },
  jaugeRemplie: { height: 6, borderRadius: 999, backgroundColor: '#0F4C81' },
  jaugeTexte: { fontSize: 11, color: '#64748B', marginTop: 6 },
  vide: { color: '#64748B', fontSize: 14, textAlign: 'center' },
  error: { color: '#B42318', fontSize: 14 },
  retry: { backgroundColor: '#0F4C81', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { color: '#fff', fontWeight: '700' },
});

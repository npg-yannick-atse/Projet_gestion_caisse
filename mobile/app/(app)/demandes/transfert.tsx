import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useCaisses,
  useCreerDemandeTransfert,
  usePortefeuillesVisibles,
  type TransfertCompteType,
} from '@/api/demandes';
import { apiErrorMessage } from '@/lib/api';
import { Select, type SelectOption } from '@/components/Select';
import { useToast } from '@/store/toast';
import { notifySuccess, notifyError } from '@/lib/haptics';

const montantRegex = /^\d+(\.\d{1,4})?$/;

/** Un compte, quel que soit son type : c'est ce que le transfert manipule. */
type Compte = { cle: string; type: TransfertCompteType; id: string; libelle: string; deviseId: string };

/**
 * Demander un transfert entre deux comptes.
 *
 * Source et destination peuvent être une caisse ou un portefeuille : on les
 * présente dans une seule liste, préfixée du type, plutôt que d'imposer deux
 * choix successifs (« quel type ? » puis « lequel ? ») pour désigner une chose.
 */
export default function DemandeTransfertScreen() {
  const router = useRouter();
  const [sourceCle, setSourceCle] = useState('');
  const [destinationCle, setDestinationCle] = useState('');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = useCreerDemandeTransfert();
  const showToast = useToast((s) => s.show);
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuillesVisibles();

  const comptes: Compte[] = useMemo(
    () => [
      ...(caisses ?? []).map((c) => ({
        cle: `CAISSE:${c.id}`,
        type: 'CAISSE' as const,
        id: String(c.id),
        libelle: `${c.code} — ${c.libelle}`,
        deviseId: String(c.deviseId),
      })),
      ...(portefeuilles ?? []).map((p) => ({
        cle: `PORTEFEUILLE:${p.id}`,
        type: 'PORTEFEUILLE' as const,
        id: String(p.id),
        libelle: `${p.code} — ${p.libelle}`,
        deviseId: String(p.deviseId),
      })),
    ],
    [caisses, portefeuilles],
  );

  const source = comptes.find((c) => c.cle === sourceCle);
  const destination = comptes.find((c) => c.cle === destinationCle);

  const options = (exclure?: string): SelectOption[] =>
    comptes
      .filter((c) => c.cle !== exclure)
      .map((c) => ({
        value: c.cle,
        label: c.libelle,
        sublabel: c.type === 'CAISSE' ? 'Caisse' : 'Portefeuille',
      }));

  // Une devise ne se convertit pas au passage : le serveur refuserait.
  const devisesDifferentes = !!source && !!destination && source.deviseId !== destination.deviseId;

  useEffect(() => {
    if (sourceCle && sourceCle === destinationCle) setDestinationCle('');
  }, [sourceCle, destinationCle]);

  const valide =
    !!source &&
    !!destination &&
    !devisesDifferentes &&
    montantRegex.test(montant) &&
    Number(montant) > 0 &&
    !creer.isPending;

  async function envoyer() {
    if (!valide || !source || !destination) return;
    setErreur(null);
    try {
      await creer.mutateAsync({
        sourceType: source.type,
        sourceId: source.id,
        destinationType: destination.type,
        destinationId: destination.id,
        montant,
        deviseId: source.deviseId,
        motif: motif.trim() || undefined,
      });
      notifySuccess();
      showToast('Demande de transfert envoyée ✓', 'success');
      router.back();
    } catch (e) {
      notifyError();
      setErreur(apiErrorMessage(e, 'Demande impossible'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Select
          label="Depuis"
          required
          searchable
          value={sourceCle}
          options={options(destinationCle)}
          onChange={setSourceCle}
          placeholder="— Compte source —"
        />
        <Select
          label="Vers"
          required
          searchable
          value={destinationCle}
          options={options(sourceCle)}
          onChange={setDestinationCle}
          placeholder="— Compte destination —"
        />

        {devisesDifferentes && (
          <View style={styles.avertissement}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.avertissementTexte}>
              Les deux comptes ne sont pas dans la même devise. Un transfert ne convertit pas :
              choisissez deux comptes de même devise.
            </Text>
          </View>
        )}

        <View style={styles.champ}>
          <Text style={styles.champLabel}>
            Montant<Text style={styles.requis}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={montant}
            onChangeText={setMontant}
            placeholder="0"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.champ}>
          <Text style={styles.champLabel}>Motif (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.zone]}
            value={motif}
            onChangeText={setMotif}
            placeholder="Pourquoi ce transfert…"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

        <Pressable onPress={envoyer} disabled={!valide} style={[styles.bouton, !valide && styles.boutonInactif]}>
          {creer.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.boutonTexte}>Envoyer la demande</Text>
          )}
        </Pressable>

        <Text style={styles.pied}>
          La demande doit être approuvée puis exécutée. Rien ne bouge avant.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F1F5F9' },
  contenu: { padding: 16, paddingBottom: 40 },
  avertissement: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 14,
  },
  avertissementTexte: { flex: 1, fontSize: 12, color: '#7F1D1D' },
  champ: { marginBottom: 14 },
  champLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  requis: { color: '#EF4444' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  zone: { height: 90, paddingTop: 10, textAlignVertical: 'top' },
  erreur: { color: '#B42318', fontSize: 13, marginBottom: 12 },
  bouton: {
    backgroundColor: '#00C896',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pied: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
});

import { useState } from 'react';
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
import { useCreerDemandeRecharge } from '@/api/demandes';
import { useMesPortefeuilles, useSoldePortefeuille } from '@/api/portefeuilles';
import { apiErrorMessage } from '@/lib/api';
import { formatMontant } from '@/lib/format';
import { useToast } from '@/store/toast';
import { notifySuccess, notifyError } from '@/lib/haptics';

const montantRegex = /^\d+(\.\d{1,4})?$/;

/**
 * Demander une recharge de son portefeuille.
 *
 * Le portefeuille cible n'est PAS demandé : le serveur le déduit du demandeur.
 * On l'affiche quand même, avec son solde — on ne demande pas de l'argent sans
 * savoir combien il en reste.
 */
export default function DemandeRechargeScreen() {
  const router = useRouter();
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = useCreerDemandeRecharge();
  const showToast = useToast((s) => s.show);

  const { data: portefeuilles } = useMesPortefeuilles();
  const mien = (portefeuilles ?? [])[0];
  const { data: solde } = useSoldePortefeuille(mien?.id ?? null);

  const valide = montantRegex.test(montant) && Number(montant) > 0 && !creer.isPending;

  async function envoyer() {
    if (!valide) return;
    setErreur(null);
    try {
      await creer.mutateAsync({ montant, motif: motif.trim() || undefined });
      notifySuccess();
      showToast('Demande de recharge envoyée ✓', 'success');
      router.back();
    } catch (e) {
      notifyError();
      setErreur(apiErrorMessage(e, 'Demande impossible'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {mien ? (
          <View style={styles.carteSolde}>
            <Text style={styles.soldeLabel}>{mien.libelle}</Text>
            <Text style={styles.solde}>{formatMontant(solde?.solde ?? '0')}</Text>
            <Text style={styles.soldeAide}>Solde actuel du portefeuille à recharger</Text>
          </View>
        ) : (
          <View style={styles.avertissement}>
            <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
            <Text style={styles.avertissementTexte}>
              Aucun portefeuille ne vous est rattaché. La demande sera refusée par le serveur.
            </Text>
          </View>
        )}

        <Champ label="Montant demandé" requis>
          <TextInput
            style={styles.input}
            value={montant}
            onChangeText={setMontant}
            placeholder="0"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
        </Champ>

        <Champ label="Motif (optionnel)">
          <TextInput
            style={[styles.input, styles.zone]}
            value={motif}
            onChangeText={setMotif}
            placeholder="Pourquoi cette recharge est nécessaire…"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </Champ>

        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

        <Pressable onPress={envoyer} disabled={!valide} style={[styles.bouton, !valide && styles.boutonInactif]}>
          {creer.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.boutonTexte}>Envoyer la demande</Text>
          )}
        </Pressable>

        <Text style={styles.pied}>
          La demande part au caissier. Tant qu'elle n'est pas traitée, le solde ne bouge pas.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Champ({ label, requis, children }: { label: string; requis?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.champ}>
      <Text style={styles.champLabel}>
        {label}
        {requis ? <Text style={styles.requis}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F1F5F9' },
  contenu: { padding: 16, paddingBottom: 40 },
  carteSolde: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
    padding: 16,
    marginBottom: 16,
  },
  soldeLabel: { fontSize: 12, fontWeight: '700', color: '#0F4C81' },
  solde: { fontSize: 24, fontWeight: '800', color: '#047857', marginTop: 4 },
  soldeAide: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  avertissement: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 16,
  },
  avertissementTexte: { flex: 1, fontSize: 12, color: '#78350F' },
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

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCreerInterim, useUtilisateurs } from '@/api/demandes';
import { apiErrorMessage } from '@/lib/api';
import { Select, type SelectOption } from '@/components/Select';
import { DateField } from '@/components/DateField';
import { todayISO } from '@/lib/format';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/store/toast';
import { notifySuccess, notifyError } from '@/lib/haptics';

/** Demain, en `YYYY-MM-DD` : une absence se déclare rarement pour l'instant même. */
function demain(): string {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dans une semaine. */
function dansUneSemaine(): string {
  const d = new Date(Date.now() + 7 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Déclarer SON intérim depuis le téléphone.
 *
 * On ne déclare que pour soi : le serveur ignore tout initiateur envoyé et
 * retient l'utilisateur connecté, sauf permission dédiée. Le mobile s'en tient
 * donc à ce cas, qui est celui du terrain — on part en congé, on désigne un
 * remplaçant.
 */
export default function DeclarerInterimScreen() {
  const router = useRouter();
  const moi = useAuthStore((s) => s.user);
  const [remplacantId, setRemplacantId] = useState('');
  const [dateDebut, setDateDebut] = useState(() => demain());
  const [dateFin, setDateFin] = useState(() => dansUneSemaine());
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = useCreerInterim();
  const showToast = useToast((s) => s.show);
  const { data: utilisateurs } = useUtilisateurs();

  // On ne se remplace pas soi-même.
  const options: SelectOption[] = useMemo(
    () =>
      (utilisateurs ?? [])
        .filter((u) => String(u.id) !== String(moi?.id))
        .map((u) => ({ value: String(u.id), label: `${u.prenom} ${u.nom}`, sublabel: u.matricule })),
    [utilisateurs, moi],
  );

  const datesCoherentes = !!dateDebut && !!dateFin && dateDebut < dateFin;
  const pasDansLePasse = dateDebut >= todayISO();
  const valide = !!remplacantId && datesCoherentes && pasDansLePasse && !creer.isPending;

  async function envoyer() {
    if (!valide) return;
    setErreur(null);
    try {
      await creer.mutateAsync({
        remplacantId,
        // Les dates partent en ISO complet : le serveur attend un instant.
        dateDebut: new Date(`${dateDebut}T00:00:00`).toISOString(),
        dateFin: new Date(`${dateFin}T23:59:59`).toISOString(),
        // Depuis le téléphone, on transmet TOUT : détailler droit par droit
        // n'aurait aucun sens sur un écran de cette taille, et c'est le besoin
        // réel d'un remplacement — que la personne puisse faire le travail.
        copierTousLesDroits: true,
        commentaire: commentaire.trim() || undefined,
      });
      notifySuccess();
      showToast('Intérim déclaré ✓', 'success');
      router.back();
    } catch (e) {
      notifyError();
      setErreur(apiErrorMessage(e, 'Déclaration impossible'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <View style={styles.rappel}>
          <Text style={styles.rappelTitre}>Vous déclarez votre propre absence</Text>
          <Text style={styles.rappelTexte}>
            {moi ? `${moi.prenom} ${moi.nom}` : ''} — votre remplaçant exercera vos droits pendant
            la période choisie, puis les perdra automatiquement.
          </Text>
        </View>

        <Select
          label="Remplaçant"
          required
          searchable
          value={remplacantId}
          options={options}
          onChange={setRemplacantId}
          placeholder="— Choisir la personne —"
        />

        <View style={styles.dates}>
          <View style={styles.moitie}>
            <DateField label="Du" value={dateDebut} onChange={setDateDebut} />
          </View>
          <View style={styles.moitie}>
            <DateField label="Au" value={dateFin} onChange={setDateFin} />
          </View>
        </View>
        {!datesCoherentes && (
          <Text style={styles.aideErreur}>La date de fin doit suivre la date de début.</Text>
        )}
        {datesCoherentes && !pasDansLePasse && (
          <Text style={styles.aideErreur}>La date de début ne peut pas être passée.</Text>
        )}

        <View style={styles.bloc}>
          <View style={styles.ligneFixe}>
            <Text style={styles.blocTitre}>Reprendre tous vos droits</Text>
            <Switch value disabled />
          </View>
          <Text style={styles.blocTexte}>
            Un intérim est créé par rôle et par profil que vous détenez. Ce qui est copié est figé
            maintenant : un droit obtenu pendant votre absence ne sera pas transmis.
          </Text>
        </View>

        <View style={styles.champ}>
          <Text style={styles.champLabel}>Commentaire (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.zone]}
            value={commentaire}
            onChangeText={setCommentaire}
            placeholder="Congés, mission, formation…"
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

        <Pressable onPress={envoyer} disabled={!valide} style={[styles.bouton, !valide && styles.boutonInactif]}>
          {creer.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.boutonTexte}>Déclarer l'intérim</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F1F5F9' },
  contenu: { padding: 16, paddingBottom: 40 },
  rappel: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,109,181,0.2)',
    padding: 12,
    marginBottom: 16,
  },
  rappelTitre: { fontSize: 13, fontWeight: '800', color: '#0C447C' },
  rappelTexte: { fontSize: 12, color: '#1A6DB5', marginTop: 4 },
  dates: { flexDirection: 'row', gap: 10 },
  moitie: { flex: 1 },
  aideErreur: { fontSize: 11, color: '#B42318', marginTop: -6, marginBottom: 10 },
  bloc: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.12)',
    padding: 12,
    marginBottom: 14,
  },
  ligneFixe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blocTitre: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  blocTexte: { fontSize: 11, color: '#64748B', marginTop: 6 },
  champ: { marginBottom: 14 },
  champLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
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
  zone: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  erreur: { color: '#B42318', fontSize: 13, marginBottom: 12 },
  bouton: {
    backgroundColor: '#0F4C81',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

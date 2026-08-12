import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCreateBon } from '@/api/bons';
import { useMyBonPerimeter, useTypeBons, usePays } from '@/api/referentiel';
import { apiErrorMessage } from '@/lib/api';
import { Select, type SelectOption } from '@/components/Select';
import { DateField } from '@/components/DateField';
import {
  SousBonCard,
  ligneValide,
  ligneVide,
  type ExigencesTypeBon,
  type LigneSousBon,
} from '@/components/SousBonCard';
import { useToast } from '@/store/toast';
import { notifySuccess, notifyError } from '@/lib/haptics';
import { useAuthStore } from '@/store/auth';
import type {
  CostCenter,
  FrequenceRecurrence,
  NatureOperation,
  Pays,
  Portefeuille,
  TypeBon,
} from '@/types';

const FREQUENCES: SelectOption[] = [
  { value: 'MENSUEL', label: 'Tous les mois' },
  { value: 'TRIMESTRIEL', label: 'Tous les trimestres' },
  { value: 'SEMESTRIEL', label: 'Tous les semestres' },
  { value: 'ANNUEL', label: 'Tous les ans' },
];

/**
 * Aujourd'hui + un mois, en `YYYY-MM-DD`.
 *
 * Le jour est ramené au dernier du mois visé quand il n'existe pas : partir du
 * 31 janvier donnerait sinon le 3 mars, JavaScript débordant sur le mois
 * suivant. Même règle que le report d'échéance côté serveur.
 */
function dansUnMois(): string {
  const n = new Date();
  const cibleMois = n.getMonth() + 1;
  const annee = n.getFullYear() + Math.floor(cibleMois / 12);
  const mois = ((cibleMois % 12) + 12) % 12;
  const dernierJour = new Date(annee, mois + 1, 0).getDate();
  const jour = Math.min(n.getDate(), dernierJour);
  return `${annee}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Création d'un bon et de SES sous-bons.
 *
 * Le mobile n'en acceptait qu'un seul, figé, alors que le web en pose autant
 * qu'on veut et que `POST /bons` a toujours attendu un tableau. Un bon qui
 * regroupe trois dépenses devait donc être saisi en trois bons distincts, ce
 * qui fausse le regroupement et multiplie les validations.
 *
 * Ce qui est commun au bon reste en haut (type, porteur, récurrence) ; ce qui
 * appartient à la ligne — imputation comprise — vit dans sa carte, comme sur le
 * web où chaque sous-bon porte son portefeuille et son centre de coût.
 */
export default function NouvelleDemandeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: perimeter, isLoading: loadingPerim } = useMyBonPerimeter();
  const { data: typeBons } = useTypeBons();
  const { data: paysData } = usePays();
  const create = useCreateBon();

  const [typeBonId, setTypeBonId] = useState('');
  const [porteur, setPorteur] = useState('');
  const [estRecurrent, setEstRecurrent] = useState(false);
  const [frequence, setFrequence] = useState<FrequenceRecurrence>('MENSUEL');
  /**
   * Jour du prochain rappel. Proposé à un mois d'ici — le cas le plus courant —
   * et modifiable. Le serveur exige une date STRICTEMENT future : un rappel
   * fixé à aujourd'hui partirait dans l'heure.
   */
  const [dateEcheance, setDateEcheance] = useState(() => dansUnMois());
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast((s) => s.show);

  // Compteur d'identités de lignes : un index ne convient pas, supprimer la
  // première décalerait toutes les suivantes et React recyclerait les champs.
  const prochainUid = useRef(1);
  const nouvelUid = () => String(prochainUid.current++);
  const [lignes, setLignes] = useState<LigneSousBon[]>(() => [ligneVide('0')]);

  /**
   * Cartes dépliées. Ajouter une ligne replie les autres : sans cela, il fallait
   * dérouler tout le formulaire précédent pour atteindre la nouvelle. On garde
   * un ensemble plutôt qu'une seule carte ouverte — comparer deux lignes reste
   * possible en les rouvrant à la main.
   */
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(['0']));
  const basculer = (uid: string) =>
    setOuverts((s) => {
      const suivant = new Set(s);
      if (suivant.has(uid)) suivant.delete(uid);
      else suivant.add(uid);
      return suivant;
    });

  const portefeuilles: Portefeuille[] = perimeter?.portefeuilles ?? [];
  const costCenters: CostCenter[] = perimeter?.costCenters ?? [];
  const typeBonsList: TypeBon[] = typeBons ?? [];
  // Natures d'opération = celles autorisées à l'utilisateur (déjà filtrées côté serveur).
  const naturesList: NatureOperation[] = perimeter?.naturesOperation ?? [];
  const paysList: Pays[] = paysData ?? [];

  /** Portefeuille par défaut : le sien, sinon le premier autorisé. */
  const portefeuilleParDefaut = useMemo(() => {
    if (portefeuilles.length === 0) return undefined;
    return (
      portefeuilles.find(
        (p) =>
          (p.proprietaireType === 'USER' && p.proprietaireId === user?.id) ||
          (p.proprietaireType === 'DIRECTION' && p.proprietaireId === user?.directionId),
      ) ?? portefeuilles[0]
    );
  }, [portefeuilles, user]);

  // Pré-remplissages : on ne touche qu'aux lignes encore vierges de ce champ,
  // pour ne jamais écraser un choix déjà fait.
  useEffect(() => {
    if (!portefeuilleParDefaut) return;
    setLignes((ls) =>
      ls.some((l) => !l.portefeuilleId)
        ? ls.map((l) => (l.portefeuilleId ? l : { ...l, portefeuilleId: portefeuilleParDefaut.id }))
        : ls,
    );
  }, [portefeuilleParDefaut]);

  useEffect(() => {
    if (costCenters.length === 0) return;
    setLignes((ls) =>
      ls.some((l) => !l.costCenterId)
        ? ls.map((l) => (l.costCenterId ? l : { ...l, costCenterId: costCenters[0].id }))
        : ls,
    );
  }, [costCenters]);

  useEffect(() => {
    if (!typeBonId && typeBonsList.length > 0) setTypeBonId(typeBonsList[0].id);
  }, [typeBonsList, typeBonId]);

  // Champs conditionnels selon le type de bon (comme le web) — ils valent pour
  // toutes les lignes, le type appartenant au bon.
  const selectedType = typeBonsList.find((t) => t.id === typeBonId);
  const exigences: ExigencesTypeBon = {
    numeroClient: selectedType?.requiertNumeroClient ?? false,
    nomClient: selectedType?.requiertNomClient ?? false,
    partenaire: selectedType?.requiertPartenaire ?? false,
    bl: selectedType?.requiertBl ?? false,
  };

  const typeBonOptions: SelectOption[] = typeBonsList.map((t) => ({
    value: t.id,
    label: t.libelle,
    sublabel: t.code,
  }));

  const modifierLigne = (uid: string, patch: Partial<LigneSousBon>) =>
    setLignes((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));

  const ajouterLigne = () => {
    const uid = nouvelUid();
    setLignes((ls) => [...ls, ligneVide(uid, ls[ls.length - 1])]);
    // Seule la nouvelle carte reste ouverte : c'est celle qu'on vient saisir.
    setOuverts(new Set([uid]));
  };

  const supprimerLigne = (uid: string) => {
    setLignes((ls) => ls.filter((l) => l.uid !== uid));
    setOuverts((s) => {
      const suivant = new Set(s);
      suivant.delete(uid);
      return suivant;
    });
  };

  const total = useMemo(
    () => lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0),
    [lignes],
  );

  const lignesValides = lignes.every((l) => ligneValide(l, exigences));
  // Même règle que le serveur : l'échéance doit être STRICTEMENT postérieure à
  // aujourd'hui, sinon le rappel partirait dans l'heure suivant la création.
  const echeanceFuture = dateEcheance > new Date().toISOString().slice(0, 10);
  const canSubmit =
    !!typeBonId &&
    lignes.length > 0 &&
    lignesValides &&
    (!estRecurrent || echeanceFuture) &&
    !create.isPending;

  function resetForm() {
    setPorteur('');
    setEstRecurrent(false);
    setFrequence('MENSUEL');
    setDateEcheance(dansUnMois());
    const uid = nouvelUid();
    setLignes([ligneVide(uid, { portefeuilleId: portefeuilleParDefaut?.id })]);
    setOuverts(new Set([uid]));
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      const bon = await create.mutateAsync({
        typeBonId,
        estRecurrent,
        // Les deux ne partent que si la case est cochée : le serveur refuse une
        // échéance sur un bon qui ne se répète pas.
        frequenceRecurrence: estRecurrent ? frequence : undefined,
        dateProchaineEcheance: estRecurrent ? dateEcheance : undefined,
        porteur: porteur.trim() || undefined,
        soubons: lignes.map((l, i) => {
          // La caisse et la devise découlent du portefeuille DE LA LIGNE : deux
          // sous-bons peuvent tirer sur deux portefeuilles différents.
          const pf = portefeuilles.find((p) => p.id === l.portefeuilleId);
          // Plutôt qu'un plantage muet si le portefeuille a disparu du périmètre
          // entre la saisie et l'envoi : on dit lequel et on n'envoie rien.
          if (!pf) throw new Error(`Sous-bon ${i + 1} : portefeuille introuvable, resélectionnez-le.`);
          return {
            libelle: l.libelle.trim(),
            montant: l.montant,
            partenaireId: l.partenaireId || undefined,
            numeroBl: l.numeroBl.trim(),
            codeManutention: l.codeManutention.trim(),
            costCenterId: l.costCenterId,
            natureOperationId: l.natureOperationId,
            caisseId: pf.caisseSourceId,
            portefeuilleId: pf.id,
            deviseId: pf.deviseId,
            numeroClient: exigences.numeroClient ? l.numeroClient.trim() || undefined : undefined,
            nomClient: exigences.nomClient ? l.nomClient.trim() || undefined : undefined,
            paysId: exigences.nomClient ? l.paysId || undefined : undefined,
            divisionId: exigences.nomClient ? l.divisionId || undefined : undefined,
          };
        }),
      });
      resetForm();
      notifySuccess();
      showToast('Bon créé ✓', 'success');
      /**
       * On ouvre le bon qu'on vient de créer, au lieu de renvoyer vers la liste.
       * Le demandeur voit immédiatement son numéro, son montant et son statut :
       * il sait que le bon existe vraiment, et sur quoi il porte. Le retour
       * arrière ramène à « Mes bons », déjà rafraîchie par l'invalidation.
       */
      if (bon?.id) router.push(`/bons/${bon.id}`);
      else router.replace('/'); // pas d'identifiant renvoyé : la liste fait foi
    } catch (e) {
      notifyError();
      setError(apiErrorMessage(e, 'Création impossible'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {loadingPerim ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0F4C81" />
          </View>
        ) : (
          <>
            <Select
              label="Type de bon"
              required
              value={typeBonId}
              options={typeBonOptions}
              onChange={setTypeBonId}
            />

            {perimeter && portefeuilles.length === 0 && (
              <Text style={styles.alerte}>
                Aucun portefeuille ne vous est rattaché. Contactez un administrateur.
              </Text>
            )}
            {perimeter && naturesList.length === 0 && (
              <Text style={styles.alerte}>
                Aucune nature d'opération ne vous est autorisée. Contactez un administrateur.
              </Text>
            )}

            {lignes.map((ligne, index) => (
              <SousBonCard
                key={ligne.uid}
                index={index}
                valeur={ligne}
                exigences={exigences}
                portefeuilles={portefeuilles}
                costCenters={costCenters}
                natures={naturesList}
                pays={paysList}
                // Un bon sans aucune ligne n'a pas de sens : la dernière ne se
                // supprime pas.
                supprimable={lignes.length > 1}
                ouvert={ouverts.has(ligne.uid)}
                onBasculer={() => basculer(ligne.uid)}
                onChange={(patch) => modifierLigne(ligne.uid, patch)}
                onSupprimer={() => supprimerLigne(ligne.uid)}
              />
            ))}

            <Pressable onPress={ajouterLigne} style={styles.ajouter}>
              <Ionicons name="add-circle-outline" size={18} color="#0F4C81" />
              <Text style={styles.ajouterText}>Ajouter un sous-bon</Text>
            </Pressable>

            <Field label="Porteur (optionnel)">
              <TextInput
                style={styles.input}
                value={porteur}
                onChangeText={setPorteur}
                placeholder="Personne qui ira retirer à la caisse…"
                placeholderTextColor="#94A3B8"
              />
            </Field>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Bon récurrent</Text>
              <Switch value={estRecurrent} onValueChange={setEstRecurrent} />
            </View>

            {/* Un bon récurrent sans échéance ne se rappelle jamais : la
                fréquence et la date sont exigées dès que la case est cochée. */}
            {estRecurrent && (
              <View style={styles.recurrence}>
                <Select
                  label="Fréquence"
                  required
                  value={frequence}
                  options={FREQUENCES}
                  onChange={(v) => setFrequence(v as FrequenceRecurrence)}
                />
                <DateField label="Prochain rappel" value={dateEcheance} onChange={setDateEcheance} />
                <Text style={echeanceFuture ? styles.aide : styles.aideErreur}>
                  {echeanceFuture
                    ? 'Une notification vous sera envoyée ce jour-là, puis à chaque échéance suivante.'
                    : 'Choisissez une date postérieure à aujourd’hui.'}
                </Text>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Total {lignes.length > 1 ? `(${lignes.length} sous-bons)` : ''}
              </Text>
              <Text style={styles.totalValue}>{total.toLocaleString('fr-FR')}</Text>
            </View>

            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
            >
              {create.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Créer le bon</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F1F5F9' },
  container: { padding: 16, paddingBottom: 40 },
  center: { paddingVertical: 40, alignItems: 'center' },
  alerte: { color: '#DC2626', fontSize: 12, marginTop: -6, marginBottom: 10 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  req: { color: '#EF4444' },
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
  ajouter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0F4C81',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  ajouterText: { color: '#0F4C81', fontWeight: '700', fontSize: 14 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  switchLabel: { flex: 1, fontSize: 13, color: '#0F172A', paddingRight: 10 },
  recurrence: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.12)',
    padding: 14,
    marginBottom: 14,
  },
  aide: { fontSize: 11, color: '#64748B', marginTop: -6 },
  aideErreur: { fontSize: 11, color: '#B42318', marginTop: -6 },
  error: { color: '#EF4444', fontSize: 13, marginBottom: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  button: {
    backgroundColor: '#00C896',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

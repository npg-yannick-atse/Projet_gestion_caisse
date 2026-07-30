import { useEffect, useMemo, useState } from 'react';
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
import { useCreateBon } from '@/api/bons';
import { useMyBonPerimeter, usePartenaires, useTypeBons, usePays, useDivisions } from '@/api/referentiel';
import { apiErrorMessage } from '@/lib/api';
import { Select, type SelectOption } from '@/components/Select';
import { useAuthStore } from '@/store/auth';
import type { CostCenter, Division, NatureOperation, Partenaire, Pays, Portefeuille, TypeBon } from '@/types';

const montantRegex = /^\d+(\.\d{1,4})?$/;

export default function NouvelleDemandeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: perimeter, isLoading: loadingPerim } = useMyBonPerimeter();
  const { data: typeBons } = useTypeBons();
  const { data: partenaires } = usePartenaires();
  const create = useCreateBon();

  const [typeBonId, setTypeBonId] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [natureOperationId, setNatureOperationId] = useState('');
  const [partenaireId, setPartenaireId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [numeroBl, setNumeroBl] = useState('');
  const [codeManutention, setCodeManutention] = useState('');
  const [numeroClient, setNumeroClient] = useState('');
  const [nomClient, setNomClient] = useState('');
  const [paysId, setPaysId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [porteur, setPorteur] = useState('');
  const [estRecurrent, setEstRecurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portefeuilles: Portefeuille[] = perimeter?.portefeuilles ?? [];
  const costCenters: CostCenter[] = perimeter?.costCenters ?? [];
  const typeBonsList: TypeBon[] = typeBons ?? [];
  const partenairesList: Partenaire[] = partenaires ?? [];
  // Natures d'opération = celles autorisées à l'utilisateur (déjà filtrées côté serveur).
  const naturesList: NatureOperation[] = perimeter?.naturesOperation ?? [];

  useEffect(() => {
    if (!portefeuilleId && portefeuilles.length > 0) {
      const mine = portefeuilles.find(
        (p) =>
          (p.proprietaireType === 'USER' && p.proprietaireId === user?.id) ||
          (p.proprietaireType === 'DIRECTION' && p.proprietaireId === user?.directionId),
      );
      setPortefeuilleId((mine ?? portefeuilles[0]).id);
    }
  }, [portefeuilles, portefeuilleId, user]);

  useEffect(() => {
    if (!costCenterId && costCenters.length > 0) setCostCenterId(costCenters[0].id);
  }, [costCenters, costCenterId]);

  useEffect(() => {
    if (!typeBonId && typeBonsList.length > 0) setTypeBonId(typeBonsList[0].id);
  }, [typeBonsList, typeBonId]);

  const selectedPf = portefeuilles.find((p) => p.id === portefeuilleId);

  // Champs conditionnels selon le type de bon (comme le web).
  const selectedType = typeBonsList.find((t) => t.id === typeBonId);
  const reqNumeroClient = selectedType?.requiertNumeroClient ?? false;
  const reqNomClient = selectedType?.requiertNomClient ?? false;
  const reqPartenaire = selectedType?.requiertPartenaire ?? false;
  const reqBl = selectedType?.requiertBl ?? false;

  const { data: paysData } = usePays();
  const { data: divisionsData } = useDivisions(reqNomClient ? paysId : undefined);
  const paysOptions: SelectOption[] = (paysData ?? []).map((p: Pays) => ({ value: p.id, label: `${p.code} — ${p.libelle}` }));
  const divisionOptions: SelectOption[] = (divisionsData ?? []).map((d: Division) => ({
    value: d.id,
    label: `${d.code} — ${d.libelle}`,
  }));

  const typeBonOptions: SelectOption[] = typeBonsList.map((t) => ({ value: t.id, label: t.libelle, sublabel: t.code }));
  const pfOptions: SelectOption[] = portefeuilles.map((p) => ({
    value: p.id,
    label: `${p.code} — ${p.libelle}`,
    sublabel: p.proprietaireType === 'USER' ? 'Mon portefeuille' : 'Direction',
  }));
  const ccOptions: SelectOption[] = costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.libelle}` }));
  // Volontairement sans pré-sélection : c'est une classification comptable, elle doit être choisie.
  const natureOptions: SelectOption[] = naturesList.map((n) => ({
    value: n.id,
    label: `${n.code} — ${n.libelle}`,
  }));
  const partenaireOptions: SelectOption[] = [
    { value: '', label: '— Aucun —' },
    ...partenairesList.map((p) => ({ value: p.id, label: p.raisonSociale, sublabel: p.code })),
  ];

  const montantValid = montantRegex.test(montant) && Number(montant) > 0;
  const canSubmit =
    !!typeBonId &&
    !!selectedPf &&
    !!costCenterId &&
    !!natureOperationId &&
    libelle.trim().length > 0 &&
    montantValid &&
    (!reqPartenaire || !!partenaireId) &&
    (!reqBl || numeroBl.trim().length > 0) &&
    (!reqNumeroClient || numeroClient.trim().length > 0) &&
    (!reqNomClient || (nomClient.trim().length > 0 && !!paysId && !!divisionId)) &&
    !create.isPending;

  const total = useMemo(() => (montantValid ? Number(montant) : 0), [montant, montantValid]);

  function resetForm() {
    setLibelle('');
    setMontant('');
    setNumeroBl('');
    setCodeManutention('');
    setNumeroClient('');
    setNomClient('');
    setPaysId('');
    setDivisionId('');
    setPorteur('');
    setPartenaireId('');
    setNatureOperationId('');
    setEstRecurrent(false);
  }

  async function onSubmit() {
    if (!canSubmit || !selectedPf) return;
    setError(null);
    try {
      await create.mutateAsync({
        typeBonId,
        estRecurrent,
        porteur: porteur.trim() || undefined,
        soubons: [
          {
            libelle: libelle.trim(),
            montant,
            partenaireId: partenaireId || undefined,
            numeroBl: numeroBl.trim(),
            codeManutention: codeManutention.trim(),
            costCenterId,
            natureOperationId,
            caisseId: selectedPf.caisseSourceId,
            portefeuilleId: selectedPf.id,
            deviseId: selectedPf.deviseId,
            numeroClient: reqNumeroClient ? numeroClient.trim() || undefined : undefined,
            nomClient: reqNomClient ? nomClient.trim() || undefined : undefined,
            paysId: reqNomClient ? paysId || undefined : undefined,
            divisionId: reqNomClient ? divisionId || undefined : undefined,
          },
        ],
      });
      resetForm();
      router.replace('/'); // retour à « Mes bons »
    } catch (e) {
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
            <Select label="Type de bon" required value={typeBonId} options={typeBonOptions} onChange={setTypeBonId} />
            <Select label="Portefeuille" required value={portefeuilleId} options={pfOptions} onChange={setPortefeuilleId} />
            {perimeter && portefeuilles.length === 0 && (
              <Text style={{ color: '#DC2626', fontSize: 12, marginTop: -6, marginBottom: 4 }}>
                Aucun portefeuille ne vous est rattaché. Contactez un administrateur.
              </Text>
            )}
            <Select label="Centre de coût" required value={costCenterId} options={ccOptions} onChange={setCostCenterId} />
            <Select
              label="Nature comptable"
              required
              searchable
              value={natureOperationId}
              options={natureOptions}
              onChange={setNatureOperationId}
              placeholder="— Choisir —"
            />
            {perimeter && naturesList.length === 0 && (
              <Text style={{ color: '#DC2626', fontSize: 12, marginTop: -6, marginBottom: 4 }}>
                Aucune nature d'opération ne vous est autorisée. Contactez un administrateur.
              </Text>
            )}

            <Field label="Libellé" required>
              <TextInput
                style={styles.input}
                value={libelle}
                onChangeText={setLibelle}
                placeholder="Objet de la demande…"
                placeholderTextColor="#94A3B8"
              />
            </Field>

            <Field label="Montant" required>
              <TextInput
                style={styles.input}
                value={montant}
                onChangeText={setMontant}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </Field>

            <Select
              label="Partenaire"
              searchable
              value={partenaireId}
              options={partenaireOptions}
              onChange={setPartenaireId}
              placeholder="— Aucun —"
            />

            <View style={styles.rowFields}>
              <View style={styles.half}>
                <Field label="N° BL">
                  <TextInput style={styles.input} value={numeroBl} onChangeText={setNumeroBl} placeholder="BL…" placeholderTextColor="#94A3B8" />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Code manutention">
                  <TextInput
                    style={styles.input}
                    value={codeManutention}
                    onChangeText={setCodeManutention}
                    placeholder="Code…"
                    placeholderTextColor="#94A3B8"
                  />
                </Field>
              </View>
            </View>

            {reqNumeroClient && (
              <Field label="N° client" required>
                <TextInput
                  style={styles.input}
                  value={numeroClient}
                  onChangeText={setNumeroClient}
                  placeholder="N° client…"
                  placeholderTextColor="#94A3B8"
                />
              </Field>
            )}

            {reqNomClient && (
              <>
                <Field label="Nom du client" required>
                  <TextInput
                    style={styles.input}
                    value={nomClient}
                    onChangeText={setNomClient}
                    placeholder="Nom du client…"
                    placeholderTextColor="#94A3B8"
                  />
                </Field>
                <Select
                  label="Pays"
                  required
                  value={paysId}
                  options={paysOptions}
                  onChange={(v) => {
                    setPaysId(v);
                    setDivisionId('');
                  }}
                  placeholder="— Choisir —"
                />
                <Select
                  label="Division"
                  required
                  value={divisionId}
                  options={divisionOptions}
                  onChange={setDivisionId}
                  placeholder={paysId ? '— Choisir —' : "Choisissez d'abord un pays"}
                />
              </>
            )}

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
              <Text style={styles.switchLabel}>Bon récurrent (renouvellement mensuel)</Text>
              <Switch value={estRecurrent} onValueChange={setEstRecurrent} />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{total.toLocaleString('fr-FR')}</Text>
            </View>

            <Pressable onPress={onSubmit} disabled={!canSubmit} style={[styles.button, !canSubmit && styles.buttonDisabled]}>
              {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Créer le bon</Text>}
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
  rowFields: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
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

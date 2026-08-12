import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listPartenaires, useDivisions } from '@/api/referentiel';
import { Select, type SelectOption } from '@/components/Select';
import { RemoteSelect } from '@/components/RemoteSelect';
import type { CostCenter, NatureOperation, Partenaire, Pays, Portefeuille } from '@/types';

/** Une ligne de dépense du bon. Chaque ligne porte SA propre imputation. */
export type LigneSousBon = {
  /** Identité stable de la ligne — l'index ne l'est pas : supprimer la 1re décale tout. */
  uid: string;
  portefeuilleId: string;
  costCenterId: string;
  natureOperationId: string;
  partenaireId: string;
  partenaireLabel: string;
  libelle: string;
  montant: string;
  numeroBl: string;
  codeManutention: string;
  numeroClient: string;
  clientLabel: string;
  nomClient: string;
  paysId: string;
  divisionId: string;
};

const montantRegex = /^\d+(\.\d{1,4})?$/;

/** Ce que le type de bon choisi rend obligatoire — identique pour toutes les lignes. */
export type ExigencesTypeBon = {
  numeroClient: boolean;
  nomClient: boolean;
  partenaire: boolean;
  bl: boolean;
};

export function ligneValide(l: LigneSousBon, req: ExigencesTypeBon): boolean {
  return (
    !!l.portefeuilleId &&
    !!l.costCenterId &&
    !!l.natureOperationId &&
    l.libelle.trim().length > 0 &&
    montantRegex.test(l.montant) &&
    Number(l.montant) > 0 &&
    (!req.partenaire || !!l.partenaireId) &&
    (!req.bl || l.numeroBl.trim().length > 0) &&
    (!req.numeroClient || l.numeroClient.trim().length > 0) &&
    (!req.nomClient || (l.nomClient.trim().length > 0 && !!l.paysId && !!l.divisionId))
  );
}

export function ligneVide(uid: string, modele?: Partial<LigneSousBon>): LigneSousBon {
  return {
    uid,
    // L'imputation du sous-bon précédent est reprise : un bon groupe presque
    // toujours des dépenses de même origine. Tout reste modifiable.
    portefeuilleId: modele?.portefeuilleId ?? '',
    costCenterId: modele?.costCenterId ?? '',
    natureOperationId: modele?.natureOperationId ?? '',
    partenaireId: '',
    partenaireLabel: '',
    libelle: '',
    montant: '',
    numeroBl: '',
    codeManutention: '',
    numeroClient: '',
    clientLabel: '',
    nomClient: '',
    paysId: '',
    divisionId: '',
  };
}

/**
 * Formulaire d'UNE ligne. C'est un composant à part, et non un simple bloc de
 * JSX répété : la liste des divisions dépend du pays DE LA LIGNE, donc d'un
 * `useDivisions` par ligne — et un hook ne peut pas s'appeler dans une boucle.
 */
export function SousBonCard({
  index,
  valeur,
  exigences,
  portefeuilles,
  costCenters,
  natures,
  pays,
  supprimable,
  ouvert,
  onBasculer,
  onChange,
  onSupprimer,
}: {
  index: number;
  valeur: LigneSousBon;
  exigences: ExigencesTypeBon;
  portefeuilles: Portefeuille[];
  costCenters: CostCenter[];
  natures: NatureOperation[];
  pays: Pays[];
  supprimable: boolean;
  ouvert: boolean;
  onBasculer: () => void;
  onChange: (patch: Partial<LigneSousBon>) => void;
  onSupprimer: () => void;
}) {
  const { data: divisionsData } = useDivisions(exigences.nomClient ? valeur.paysId : undefined);

  const pfOptions: SelectOption[] = portefeuilles.map((p) => ({
    value: p.id,
    label: `${p.code} — ${p.libelle}`,
    sublabel: p.proprietaireType === 'USER' ? 'Mon portefeuille' : 'Direction',
  }));
  const ccOptions: SelectOption[] = costCenters.map((c) => ({
    value: c.id,
    label: `${c.code} — ${c.libelle}`,
  }));
  const natureOptions: SelectOption[] = natures.map((n) => ({
    value: n.id,
    label: `${n.code} — ${n.libelle}`,
  }));
  const paysOptions: SelectOption[] = pays.map((p) => ({ value: p.id, label: `${p.code} — ${p.libelle}` }));
  const divisionOptions: SelectOption[] = (divisionsData ?? []).map((d) => ({
    value: d.id,
    label: `${d.code} — ${d.libelle}`,
  }));

  // Le centre de coût est verrouillé dès que la nature choisie en impose un.
  const ccImpose = !!natures.find((n) => n.id === valeur.natureOperationId)?.costCenterId;

  const fetchPartenaires = async (q: string): Promise<SelectOption[]> => {
    const list = await listPartenaires({ search: q || undefined, limit: 30 });
    return list.map((p) => ({ value: p.id, label: p.raisonSociale, sublabel: p.code }));
  };

  const fetchClients = async (q: string): Promise<SelectOption[]> => {
    const list = await listPartenaires({ type: 'CLIENT', search: q || undefined, limit: 30 });
    return list
      // Un client sans numéro SAP ne peut pas être imputé : on ne le propose pas.
      .filter((c) => c.numeroClient)
      .map((c) => ({
        value: String(c.numeroClient),
        label: c.raisonSociale,
        sublabel: String(c.numeroClient),
        data: c,
      }));
  };

  const montantOk = montantRegex.test(valeur.montant) && Number(valeur.montant) > 0;
  const complet = ligneValide(valeur, exigences);

  return (
    <View style={styles.carte}>
      {/* L'en-tête entier est la zone de pliage : sur un téléphone, viser un
          chevron de 16 points est une épreuve. */}
      <Pressable
        onPress={onBasculer}
        style={[styles.entete, ouvert && styles.enteteOuverte]}
        accessibilityLabel={`${ouvert ? 'Replier' : 'Déplier'} le sous-bon ${index + 1}`}
      >
        <Ionicons name={ouvert ? 'chevron-down' : 'chevron-forward'} size={16} color="#0F4C81" />
        <View style={styles.enteteTexte}>
          <Text style={styles.titre}>Sous-bon {index + 1}</Text>
          {/* Replié, la carte doit rester identifiable : son libellé, ou à
              défaut ce qui manque pour qu'elle soit complète. */}
          {!ouvert && (
            <Text style={complet ? styles.resume : styles.resumeIncomplet} numberOfLines={1}>
              {valeur.libelle.trim() || (complet ? '—' : 'à compléter')}
            </Text>
          )}
        </View>
        <View style={styles.enteteDroite}>
          {montantOk && (
            <Text style={styles.montantApercu}>{Number(valeur.montant).toLocaleString('fr-FR')}</Text>
          )}
          {!complet && <Ionicons name="alert-circle" size={16} color="#B45309" />}
          {supprimable && (
            <Pressable onPress={onSupprimer} hitSlop={8} accessibilityLabel={`Supprimer le sous-bon ${index + 1}`}>
              <Ionicons name="trash-outline" size={18} color="#B42318" />
            </Pressable>
          )}
        </View>
      </Pressable>

      {!ouvert ? null : (
      <>
      <Select
        label="Portefeuille"
        required
        value={valeur.portefeuilleId}
        options={pfOptions}
        onChange={(v) => onChange({ portefeuilleId: v })}
      />

      {/* La nature vient AVANT le centre de coût : c'est elle qui le décide. */}
      <Select
        label="Nature comptable"
        required
        searchable
        value={valeur.natureOperationId}
        options={natureOptions}
        onChange={(v) => {
          const cc = natures.find((n) => n.id === v)?.costCenterId;
          // Chaque nature est rattachée à son centre de coût. Les choisir
          // séparément produisait des couples incohérents.
          onChange(cc ? { natureOperationId: v, costCenterId: String(cc) } : { natureOperationId: v });
        }}
        placeholder="— Choisir —"
      />
      <Select
        label={ccImpose ? 'Centre de coût (déterminé par la nature)' : 'Centre de coût'}
        required
        value={valeur.costCenterId}
        options={ccImpose ? ccOptions.filter((o) => o.value === valeur.costCenterId) : ccOptions}
        onChange={(v) => onChange({ costCenterId: v })}
      />

      <Champ label="Libellé" requis>
        <TextInput
          style={styles.input}
          value={valeur.libelle}
          onChangeText={(v) => onChange({ libelle: v })}
          placeholder="Objet de la dépense…"
          placeholderTextColor="#94A3B8"
        />
      </Champ>

      <Champ label="Montant" requis>
        <TextInput
          style={styles.input}
          value={valeur.montant}
          onChangeText={(v) => onChange({ montant: v })}
          placeholder="0"
          placeholderTextColor="#94A3B8"
          keyboardType="decimal-pad"
        />
      </Champ>

      <RemoteSelect
        label="Partenaire"
        required={exigences.partenaire}
        value={valeur.partenaireId}
        selectedLabel={valeur.partenaireLabel}
        onChange={(v, opt) => onChange({ partenaireId: v, partenaireLabel: opt?.label ?? '' })}
        fetcher={fetchPartenaires}
        queryKey={`mobile-partenaires-${valeur.uid}`}
        placeholder="— Aucun —"
      />

      <View style={styles.rowFields}>
        <View style={styles.half}>
          <Champ label="N° BL" requis={exigences.bl}>
            <TextInput
              style={styles.input}
              value={valeur.numeroBl}
              onChangeText={(v) => onChange({ numeroBl: v })}
              placeholder="BL…"
              placeholderTextColor="#94A3B8"
            />
          </Champ>
        </View>
        <View style={styles.half}>
          <Champ label="Code manutention">
            <TextInput
              style={styles.input}
              value={valeur.codeManutention}
              onChangeText={(v) => onChange({ codeManutention: v })}
              placeholder="Code…"
              placeholderTextColor="#94A3B8"
            />
          </Champ>
        </View>
      </View>

      {exigences.numeroClient && (
        <RemoteSelect
          label="N° client"
          required
          value={valeur.numeroClient}
          selectedLabel={valeur.clientLabel || valeur.numeroClient}
          onChange={(numero, opt) => {
            const client = opt?.data as Partenaire | undefined;
            // Le pays découle du client : `ref_partenaire.pays` porte le code
            // ISO-2 SAP (LAND1), même convention que `ref_pays.code`. Sans
            // correspondance, on ne touche à rien plutôt que de poser une
            // valeur fausse.
            const paysDuClient = client?.pays ? pays.find((p) => p.code === client.pays) : undefined;
            onChange({
              numeroClient: numero,
              clientLabel: opt?.label ?? '',
              ...(opt?.label ? { nomClient: opt.label } : {}),
              ...(paysDuClient ? { paysId: paysDuClient.id, divisionId: '' } : {}),
            });
          }}
          fetcher={fetchClients}
          queryKey={`mobile-clients-${valeur.uid}`}
          placeholder="Rechercher un client (nom ou numéro)…"
        />
      )}

      {exigences.nomClient && (
        <>
          <Champ label="Nom du client" requis>
            <TextInput
              style={styles.input}
              value={valeur.nomClient}
              onChangeText={(v) => onChange({ nomClient: v })}
              placeholder="Nom du client…"
              placeholderTextColor="#94A3B8"
            />
          </Champ>
          <Select
            label="Pays"
            required
            value={valeur.paysId}
            options={paysOptions}
            onChange={(v) => onChange({ paysId: v, divisionId: '' })}
            placeholder="— Choisir —"
          />
          <Select
            label="Division"
            required
            value={valeur.divisionId}
            options={divisionOptions}
            onChange={(v) => onChange({ divisionId: v })}
            placeholder={valeur.paysId ? '— Choisir —' : "Choisissez d'abord un pays"}
          />
        </>
      )}
      </>
      )}
    </View>
  );
}

function Champ({ label, requis, children }: { label: string; requis?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {requis ? <Text style={styles.req}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.12)',
    padding: 14,
    marginBottom: 14,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Trait de séparation seulement quand la carte est ouverte : replié, l'en-tête
  // EST la carte, un trait sous lui ne séparerait rien.
  enteteOuverte: { marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  enteteTexte: { flex: 1 },
  enteteDroite: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titre: { fontSize: 14, fontWeight: '800', color: '#0F4C81' },
  resume: { fontSize: 12, color: '#64748B', marginTop: 2 },
  resumeIncomplet: { fontSize: 12, color: '#B45309', marginTop: 2, fontStyle: 'italic' },
  montantApercu: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
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
    backgroundColor: '#F8FAFC',
  },
  rowFields: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});

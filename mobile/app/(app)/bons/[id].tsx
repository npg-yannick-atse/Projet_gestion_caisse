import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useBon, useSousBons, useValidateBon } from '@/api/bons';
import { useCostCenters, useNaturesOperation, usePartenaires } from '@/api/referentiel';
import { apiErrorMessage } from '@/lib/api';
import { STATUT_META, formatDate, formatMontant } from '@/lib/format';
import { useCanValidate } from '@/lib/roles';
import type { BonStatut, CostCenter, NatureOperation, Partenaire, SousBon } from '@/types';

export default function BonDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bonId = String(id);

  const { data: bon, isLoading } = useBon(bonId);
  const { data: soubons } = useSousBons(bonId);
  const { data: costCenters } = useCostCenters();
  const { data: partenaires } = usePartenaires();
  const { data: naturesOperation } = useNaturesOperation();
  const validate = useValidateBon(bonId);

  const [commentaire, setCommentaire] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Sous-bons dépliés (tap pour voir le détail).
  const [openSb, setOpenSb] = useState<Set<string>>(new Set());
  function toggleSb(sbId: string) {
    setOpenSb((prev) => {
      const next = new Set(prev);
      if (next.has(sbId)) next.delete(sbId);
      else next.add(sbId);
      return next;
    });
  }
  const ccList: CostCenter[] = costCenters ?? [];
  const ccName = (ccId?: string | null) => {
    const c = ccId ? ccList.find((x) => x.id === ccId) : undefined;
    return c ? `${c.code} — ${c.libelle}` : '—';
  };
  const natList: NatureOperation[] = naturesOperation ?? [];
  const natName = (nId?: string | null) => {
    const n = nId ? natList.find((x) => x.id === nId) : undefined;
    return n ? `${n.code} — ${n.libelle}` : '—';
  };
  const partList: Partenaire[] = partenaires ?? [];
  const partName = (pId?: string | null) => {
    const p = pId ? partList.find((x) => x.id === pId) : undefined;
    return p ? p.raisonSociale : null;
  };

  const roleCanValidate = useCanValidate();
  const statut = (bon?.statut as BonStatut | undefined) ?? 'CREE';
  const meta = STATUT_META[statut] ?? STATUT_META.CREE;
  const canValidate = roleCanValidate && statut === 'CREE' && !!bon;

  async function act(approuve: boolean) {
    setError(null);
    try {
      await validate.mutateAsync({ approuve, commentaire: commentaire.trim() || undefined });
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e, approuve ? 'Validation impossible' : 'Refus impossible'));
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: bon?.numero ?? 'Bon' }} />

      {isLoading || !bon ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F4C81" />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.numero}>{bon.numero}</Text>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
              </View>
            </View>
            <Text style={styles.montant}>{formatMontant(bon.montantTotal)}</Text>
            <Text style={styles.meta}>Créé le {formatDate(bon.createdAt)}</Text>
            {bon.porteur ? <Text style={styles.meta}>Porteur : {bon.porteur}</Text> : null}
            {bon.estRecurrent ? <Text style={styles.meta}>Bon récurrent</Text> : null}
          </View>

          <Text style={styles.section}>Sous-bons</Text>
          {(soubons ?? []).map((sb: SousBon) => {
            const sm = STATUT_META[sb.statut] ?? STATUT_META.CREE;
            const open = openSb.has(sb.id);
            return (
              <View key={sb.id} style={styles.sbCard}>
                <Pressable style={styles.sbHead} onPress={() => toggleSb(sb.id)}>
                  <View style={styles.flex}>
                    <Text style={styles.sbLibelle}>
                      #{sb.numeroSousBon} · {sb.libelle}
                    </Text>
                    <Text style={styles.sbMeta}>{open ? 'Masquer le détail' : 'Voir le détail'}</Text>
                  </View>
                  <View style={styles.sbRight}>
                    <Text style={styles.sbMontant}>{formatMontant(sb.montant)}</Text>
                    <View style={[styles.badgeSm, { backgroundColor: sm.bg }]}>
                      <Text style={[styles.badgeSmText, { color: sm.fg }]}>{sm.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.chev}>{open ? '▴' : '▾'}</Text>
                </Pressable>

                {open ? (
                  <View style={styles.sbDetail}>
                    <DetailRow label="Montant" value={formatMontant(sb.montant)} />
                    <DetailRow label="N° BL" value={sb.numeroBl || '—'} />
                    <DetailRow label="Code manutention" value={sb.codeManutention || '—'} />
                    <DetailRow label="Centre de coût" value={ccName(sb.costCenterId)} />
                    <DetailRow label="Nature d'opération" value={natName(sb.natureOperationId)} />
                    {partName(sb.partenaireId) ? (
                      <DetailRow label="Partenaire" value={partName(sb.partenaireId) as string} />
                    ) : null}
                    {sb.numeroClient ? <DetailRow label="N° client" value={sb.numeroClient} /> : null}
                    {sb.description ? <DetailRow label="Description" value={sb.description} /> : null}
                    <DetailRow label="Statut" value={sm.label} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {(soubons ?? []).length === 0 ? <Text style={styles.empty}>Aucun sous-bon.</Text> : null}

          {canValidate ? (
            <View style={styles.validateBox}>
              <Text style={styles.section}>Validation</Text>
              <TextInput
                style={styles.input}
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder="Commentaire (optionnel)…"
                placeholderTextColor="#94A3B8"
                multiline
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.refuse]}
                  disabled={validate.isPending}
                  onPress={() => act(false)}
                >
                  <Text style={styles.refuseText}>Refuser</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.approve]}
                  disabled={validate.isPending}
                  onPress={() => act(true)}
                >
                  {validate.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.approveText}>Valider</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.drRow}>
      <Text style={styles.drLabel}>{label}</Text>
      <Text style={styles.drValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, backgroundColor: '#F1F5F9', flexGrow: 1 },
  center: { paddingVertical: 50, alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numero: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  montant: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  meta: { fontSize: 12, color: '#64748B', marginTop: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 20, marginBottom: 8 },
  sbCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.08)',
    overflow: 'hidden',
  },
  sbHead: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  chev: { marginLeft: 8, color: '#94A3B8', fontSize: 14 },
  sbDetail: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,76,129,0.06)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  drRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  drLabel: { fontSize: 12, color: '#64748B' },
  drValue: { fontSize: 12, color: '#0F172A', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 10 },
  sbLibelle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  sbMeta: { fontSize: 11, color: '#1A6DB5', marginTop: 2 },
  sbRight: { alignItems: 'flex-end', gap: 4 },
  sbMontant: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  badgeSm: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeSmText: { fontSize: 9, fontWeight: '700' },
  empty: { color: '#64748B', fontSize: 13 },
  validateBox: { marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    minHeight: 60,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  error: { color: '#EF4444', fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  refuse: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FECACA' },
  refuseText: { color: '#B42318', fontWeight: '800' },
  approve: { backgroundColor: '#00C896' },
  approveText: { color: '#fff', fontWeight: '800' },
});

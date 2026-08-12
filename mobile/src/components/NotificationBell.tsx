import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBonsAValider } from '@/api/bons';
import { useCanValidate } from '@/lib/roles';
import { formatDate, formatMontant } from '@/lib/format';
import type { Bon } from '@/types';

/** Au-delà, le panneau devient une liste à faire défiler : on renvoie vers l'écran. */
const APERCU_MAX = 6;

/**
 * Cloche de notifications (en-tête) : les bons en attente de validation.
 * Visible uniquement pour les utilisateurs pouvant valider. Polling toutes les 30 s.
 *
 * Un appui ouvre un PANNEAU listant les bons en attente. Auparavant il basculait
 * simplement sur l'onglet « À valider » — geste invisible quand on s'y trouvait
 * déjà, au point que la cloche semblait morte. Une notification doit dire ce
 * qu'elle annonce, pas seulement qu'il se passe quelque chose.
 */
export function NotificationBell() {
  const router = useRouter();
  const canValidate = useCanValidate();
  const { data } = useBonsAValider(canValidate);
  const [ouvert, setOuvert] = useState(false);

  if (!canValidate) return null;

  const list: Bon[] = data ?? [];
  const count = list.length;

  const allerVers = (chemin: string) => {
    setOuvert(false);
    router.push(chemin as never);
  };

  return (
    <>
      <Pressable
        onPress={() => setOuvert(true)}
        hitSlop={10}
        style={styles.wrap}
        accessibilityLabel={`Notifications : ${count} bon(s) à valider`}
      >
        <Ionicons name={count > 0 ? 'notifications' : 'notifications-outline'} size={22} color="#fff" />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        {/* Le fond ferme le panneau : sur mobile, c'est le geste attendu. */}
        <Pressable style={styles.backdrop} onPress={() => setOuvert(false)}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {count > 0 ? `${count} bon${count > 1 ? 's' : ''} à valider` : 'Notifications'}
              </Text>
              <Pressable onPress={() => setOuvert(false)} hitSlop={8}>
                <Ionicons name="close" size={18} color="#94A3B8" />
              </Pressable>
            </View>

            {count === 0 ? (
              <View style={styles.vide}>
                <Ionicons name="checkmark-done-circle-outline" size={34} color="#CBD5E1" />
                <Text style={styles.videText}>Aucun bon en attente. 🎉</Text>
              </View>
            ) : (
              <FlatList
                data={list.slice(0, APERCU_MAX)}
                keyExtractor={(b) => b.id}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                renderItem={({ item }) => (
                  <Pressable style={styles.ligne} onPress={() => allerVers(`/bons/${item.id}`)}>
                    <View style={styles.ligneGauche}>
                      <Text style={styles.numero}>{item.numero}</Text>
                      <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.montant}>{formatMontant(item.montantTotal)}</Text>
                  </Pressable>
                )}
              />
            )}

            <Pressable style={styles.pied} onPress={() => allerVers('/a-valider')}>
              <Text style={styles.piedText}>
                {count > APERCU_MAX ? `Voir les ${count} bons` : 'Ouvrir « À valider »'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#0F4C81" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 6, paddingVertical: 2 },
  badge: {
    position: 'absolute',
    top: -2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0F4C81',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // Le panneau tombe sous la cloche, à droite, comme une bulle d'en-tête.
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', paddingTop: 96, paddingHorizontal: 12 },
  panel: {
    alignSelf: 'flex-end',
    width: '92%',
    maxHeight: 380,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  panelTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  vide: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 26 },
  videText: { color: '#64748B', fontSize: 13 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ligneGauche: { flex: 1, paddingRight: 10 },
  numero: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  date: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  montant: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  sep: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 14 },
  pied: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  piedText: { fontSize: 13, fontWeight: '700', color: '#0F4C81' },
});

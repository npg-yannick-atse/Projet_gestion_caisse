import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBonsAValider } from '@/api/bons';
import { useCanValidate } from '@/lib/roles';
import type { Bon } from '@/types';

/**
 * Cloche de notifications (en-tête) : nombre de bons en attente de validation.
 * Visible uniquement pour les utilisateurs pouvant valider. Polling toutes les 30 s.
 */
export function NotificationBell() {
  const router = useRouter();
  const canValidate = useCanValidate();
  const { data } = useBonsAValider(canValidate);

  if (!canValidate) return null;

  const list: Bon[] = data ?? [];
  const count = list.length;

  return (
    <Pressable
      onPress={() => router.push('/a-valider')}
      hitSlop={10}
      style={styles.wrap}
      accessibilityLabel={`Notifications : ${count} bon(s) à valider`}
    >
      <Text style={styles.bell}>🔔</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 6, paddingVertical: 2 },
  bell: { fontSize: 20 },
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
});

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '@/lib/useOnline';

/** Bandeau « hors-ligne » affiché quand la connexion est perdue. */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.text}>Pas de connexion — les données peuvent être obsolètes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#B45309',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

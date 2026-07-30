import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast, type ToastType } from '@/store/toast';

const META: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; bg: string }> = {
  success: { icon: 'checkmark-circle', bg: '#047857' },
  error: { icon: 'alert-circle', bg: '#B42318' },
  info: { icon: 'information-circle', bg: '#0F4C81' },
};

/** Bandeau de notification éphémère, monté au-dessus de toute l'app. */
export function Toaster() {
  const message = useToast((s) => s.message);
  const type = useToast((s) => s.type);
  const insets = useSafeAreaInsets();

  if (!message) return null;
  const meta = META[type];

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={[styles.toast, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color="#fff" />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, paddingHorizontal: 16 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { getExpoPushToken } from '@/lib/push';
import { unregisterPushToken } from '@/api/push';

export default function CompteScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const queryClient = useQueryClient();

  async function onSignOut() {
    // Détacher le jeton push AVANT de vider la session (l'appel exige le bearer).
    // Best-effort : ne bloque jamais la déconnexion.
    try {
      const token = await getExpoPushToken();
      if (token) await unregisterPushToken(token);
    } catch {
      /* ignore */
    }
    // On vide ensuite le token : la garde d'auth de (app)/_layout redirige alors
    // automatiquement vers /login. Pas de router.replace ici, sinon la navigation
    // manuelle entre en course avec la garde et la déconnexion « ne s'applique pas ».
    await signOut();
    queryClient.clear();
  }

  const initials = user ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase() : '';

  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user ? `${user.prenom} ${user.nom}` : ''}</Text>
        {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
      </View>

      <View style={styles.infoCard}>
        <InfoRow icon="id-card-outline" label="Matricule" value={user?.matricule ?? '—'} />
        {user?.telephone ? <InfoRow icon="call-outline" label="Téléphone" value={user.telephone} /> : null}
        <InfoRow icon="information-circle-outline" label="Version" value={`v${appVersion}`} last />
      </View>

      <Pressable onPress={onSignOut} style={styles.logout}>
        <Ionicons name="log-out-outline" size={18} color="#B42318" />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={18} color="#64748B" />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  avatar: {
    height: 64,
    width: 64,
    borderRadius: 32,
    backgroundColor: '#0F4C81',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { color: '#0F172A', fontSize: 20, fontWeight: '800' },
  meta: { color: '#64748B', fontSize: 13, marginTop: 4 },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { color: '#475569', fontSize: 14, flex: 1 },
  infoValue: { color: '#0F172A', fontSize: 14, fontWeight: '600' },
  logout: {
    marginTop: 'auto',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: '#B42318', fontWeight: '700' },
});

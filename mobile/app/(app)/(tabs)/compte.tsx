import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';

export default function CompteScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const queryClient = useQueryClient();

  async function onSignOut() {
    // On vide d'abord le token : la garde d'auth de (app)/_layout redirige alors
    // automatiquement vers /login. Pas de router.replace ici, sinon la navigation
    // manuelle entre en course avec la garde et la déconnexion « ne s'applique pas ».
    await signOut();
    queryClient.clear();
  }

  const initials = user ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user ? `${user.prenom} ${user.nom}` : ''}</Text>
        {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
        {user?.matricule ? <Text style={styles.meta}>Matricule {user.matricule}</Text> : null}
      </View>

      <Pressable onPress={onSignOut} style={styles.logout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </SafeAreaView>
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
  logout: {
    marginTop: 'auto',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: '#B42318', fontWeight: '700' },
});

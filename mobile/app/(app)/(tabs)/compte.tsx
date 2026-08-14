import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { getExpoPushToken } from '@/lib/push';
import { unregisterPushToken } from '@/api/push';
import { useAssignedRoles } from '@/api/users';

export default function CompteScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const queryClient = useQueryClient();
  // Rôles ATTRIBUÉS, et non effectifs : ces derniers sont dépliés côté serveur
  // et feraient apparaître un DAF comme « Administrateur » et « Caissier ».
  const { data: roles } = useAssignedRoles(user?.id);

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

  // Aucun bord réservé en bas : l'écran vit dans le navigateur d'onglets, et
  // c'est la barre d'onglets qui borde le bas. Garder `bottom` ajoutait la zone
  // d'accueil de l'iPhone une seconde fois, au-dessus de la barre.
  return (
    /* Défilement : avec les quatre raccourcis, la carte d'identité et les
       informations, le bouton de déconnexion sortait de l'écran sur un
       téléphone de petite taille — et rien ne permettait d'y accéder. */
    <SafeAreaView style={styles.page} edges={[]}>
      <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user ? `${user.prenom} ${user.nom}` : ''}</Text>
        {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
        {roles && roles.length > 0 && (
          <View style={styles.roles}>
            {roles.map((r) => (
              <View key={r.id} style={styles.roleBadge}>
                <Text style={styles.roleText}>{r.libelle}</Text>
              </View>
            ))}
          </View>
        )}
        {roles && roles.length === 0 && (
          // Un compte sans rôle ne peut rien faire : mieux vaut le dire que de
          // laisser croire à un simple manque d'affichage.
          <Text style={styles.sansRole}>Aucun rôle attribué — contactez un administrateur.</Text>
        )}
      </View>

      {/* Accès aux portefeuilles : le mobile ne montrait nulle part où en était
          l'argent, on créait des bons sans voir ce qui restait pour les payer. */}
      <Pressable style={styles.action} onPress={() => router.push('/portefeuilles')}>
        <Ionicons name="wallet-outline" size={18} color="#0F4C81" />
        <View style={styles.actionTexte}>
          <Text style={styles.actionTitre}>Mes portefeuilles</Text>
          <Text style={styles.actionSous}>Soldes et mouvements</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </Pressable>

      {/* Les trois demandes que l'on formule depuis le terrain : on est en
          déplacement, on a besoin d'argent, ou l'on part et il faut confier son
          travail. Elles n'existaient que sur le web. */}
      <Pressable style={styles.action} onPress={() => router.push('/demandes/recharge')}>
        <Ionicons name="add-circle-outline" size={18} color="#0F4C81" />
        <View style={styles.actionTexte}>
          <Text style={styles.actionTitre}>Demander une recharge</Text>
          <Text style={styles.actionSous}>Réapprovisionner mon portefeuille</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </Pressable>

      <Pressable style={styles.action} onPress={() => router.push('/demandes/transfert')}>
        <Ionicons name="swap-horizontal-outline" size={18} color="#0F4C81" />
        <View style={styles.actionTexte}>
          <Text style={styles.actionTitre}>Demander un transfert</Text>
          <Text style={styles.actionSous}>D'un compte vers un autre</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </Pressable>

      <Pressable style={styles.action} onPress={() => router.push('/demandes/interim')}>
        <Ionicons name="people-outline" size={18} color="#0F4C81" />
        <View style={styles.actionTexte}>
          <Text style={styles.actionTitre}>Déclarer un intérim</Text>
          <Text style={styles.actionSous}>Confier mes droits pendant une absence</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </Pressable>

      <View style={styles.infoCard}>
        <InfoRow icon="id-card-outline" label="Matricule" value={user?.matricule ?? '—'} />
        {user?.telephone ? <InfoRow icon="call-outline" label="Téléphone" value={user.telephone} /> : null}
        <InfoRow icon="information-circle-outline" label="Version" value={`v${appVersion}`} last />
      </View>

      <Pressable onPress={onSignOut} style={styles.logout}>
        <Ionicons name="log-out-outline" size={18} color="#B42318" />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
      </ScrollView>
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
  page: { flex: 1, backgroundColor: '#F1F5F9' },
  container: { padding: 20, paddingBottom: 32, flexGrow: 1 },
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
  // `flexWrap` : plusieurs rôles cumulés (DAF + Validateur…) doivent passer à la
  // ligne plutôt que déborder de la carte sur un écran étroit.
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: { color: '#0C447C', fontSize: 12, fontWeight: '700' },
  sansRole: { color: '#B45309', fontSize: 12, marginTop: 10, textAlign: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,76,129,0.1)',
  },
  actionTexte: { flex: 1 },
  actionTitre: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  actionSous: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
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
    marginTop: 20,
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

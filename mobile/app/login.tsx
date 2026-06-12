import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '@/api/auth';
import { apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = identifiant.trim().length > 0 && motDePasse.length > 0 && !loading;

  async function onSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const data = await login({ identifiant: identifiant.trim(), motDePasse, plateforme: 'MOBILE' });
      await setSession(data.user, data.accessToken, data.refreshToken);
      router.replace('/');
    } catch (e) {
      setError(apiErrorMessage(e, 'Identifiants invalides'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>FC</Text>
        </View>
        <Text style={styles.title}>Fond de Caisse</Text>
        <Text style={styles.subtitle}>NPG Gandour</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Identifiant LDAP</Text>
          <TextInput
            style={styles.input}
            value={identifiant}
            onChangeText={setIdentifiant}
            placeholder="username"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />

          <Text style={[styles.label, styles.mt]}>Mot de passe</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={motDePasse}
              onChangeText={setMotDePasse}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={styles.toggle}>{showPassword ? 'Masquer' : 'Afficher'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0A1628' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBadge: {
    alignSelf: 'center',
    height: 64,
    width: 64,
    borderRadius: 18,
    backgroundColor: '#00C896',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#0A1628', fontSize: 24, fontWeight: '800' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  subtitle: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 2, marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  mt: { marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  passwordInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  toggle: { color: '#1A6DB5', fontSize: 12, fontWeight: '600' },
  error: { color: '#EF4444', fontSize: 13, marginTop: 14 },
  button: {
    backgroundColor: '#0F4C81',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

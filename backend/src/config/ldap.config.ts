import { registerAs } from '@nestjs/config';

export default registerAs('ldap', () => ({
  // Authentification LDAP active par défaut. Mettre LDAP_ENABLED=false pour
  // basculer en mode LOCAL (mot de passe vérifié contre le hash local) — utile
  // pour des comptes de test absents du LDAP.
  enabled: process.env.LDAP_ENABLED !== 'false',
  authUrl:
    process.env.LDAP_AUTH_URL || 'http://10.10.2.17:8000/users/ldap-authenticate',
  usersUrl: process.env.LDAP_USERS_URL || 'http://10.10.2.17:8000/users',
  timeoutMs: parseInt(process.env.LDAP_TIMEOUT_MS || '8000', 10),
}));
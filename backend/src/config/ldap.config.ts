import { registerAs } from '@nestjs/config';

export default registerAs('ldap', () => ({
  authUrl:
    process.env.LDAP_AUTH_URL || 'http://10.10.2.17:8000/users/ldap-authenticate',
  usersUrl: process.env.LDAP_USERS_URL || 'http://10.10.2.17:8000/users',
  timeoutMs: parseInt(process.env.LDAP_TIMEOUT_MS || '8000', 10),
}));

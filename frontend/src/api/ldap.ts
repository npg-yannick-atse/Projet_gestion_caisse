import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LdapUser } from '@/types/api';

export async function listLdapUsers(): Promise<LdapUser[]> {
  const { data } = await api.get<LdapUser[]>('/ldap/users');
  return data;
}

export function useLdapUsers() {
  return useQuery({
    queryKey: ['ldap-users'],
    queryFn: listLdapUsers,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

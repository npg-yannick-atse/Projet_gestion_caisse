import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LoginRequest, LoginResponse, User } from '@/types/api';

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export function useLogin() {
  return useMutation({ mutationFn: login });
}

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ['me'], queryFn: getMe, enabled, retry: false });
}

import { api } from '../lib/api';
import type { LoginRequest, LoginResponse } from '../types';

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}

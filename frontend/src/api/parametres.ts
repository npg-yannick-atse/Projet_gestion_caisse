import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Parametre } from '@/types/api';

export async function listParametres(): Promise<Parametre[]> {
  const { data } = await api.get<Parametre[]>('/parametres');
  return data;
}

export async function updateParametre(cle: string, valeur: string): Promise<Parametre> {
  const { data } = await api.patch<Parametre>(`/parametres/${cle}`, { valeur });
  return data;
}

export function useParametres() {
  return useQuery({ queryKey: ['parametres'], queryFn: listParametres });
}

export function useUpdateParametre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cle, valeur }: { cle: string; valeur: string }) => updateParametre(cle, valeur),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parametres'] }),
  });
}

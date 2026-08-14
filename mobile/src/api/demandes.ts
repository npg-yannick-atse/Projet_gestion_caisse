import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Caisse, Portefeuille, User } from '../types';

/* ---------------------------------------------------------------- Recharge */

export interface DemandeRechargePayload {
  montant: string;
  motif?: string;
}

/**
 * Demande de recharge : on demande à remplir SON portefeuille.
 *
 * Le portefeuille cible n'est pas dans la charge utile — le serveur le déduit
 * du demandeur. C'est volontaire : on ne recharge pas celui d'un autre.
 */
export async function creerDemandeRecharge(payload: DemandeRechargePayload): Promise<unknown> {
  const { data } = await api.post('/demandes-recharge', payload);
  return data;
}

export function useCreerDemandeRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: creerDemandeRecharge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-recharge'] }),
  });
}

export function useMesDemandesRecharge() {
  return useQuery<Array<Record<string, unknown>>>({
    queryKey: ['demandes-recharge'],
    queryFn: async () => (await api.get('/demandes-recharge')).data,
  });
}

/* --------------------------------------------------------------- Transfert */

export type TransfertCompteType = 'CAISSE' | 'PORTEFEUILLE';

export interface DemandeTransfertPayload {
  sourceType: TransfertCompteType;
  sourceId: string;
  destinationType: TransfertCompteType;
  destinationId: string;
  montant: string;
  deviseId: string;
  motif?: string;
}

export async function creerDemandeTransfert(payload: DemandeTransfertPayload): Promise<unknown> {
  const { data } = await api.post('/demandes-transfert', payload);
  return data;
}

export function useCreerDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: creerDemandeTransfert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-transfert'] }),
  });
}

/* ----------------------------------------------------------------- Intérim */

export interface InterimPayload {
  remplacantId: string;
  dateDebut: string;
  dateFin: string;
  /** Reprendre tous les rôles et profils : un intérim est créé par droit. */
  copierTousLesDroits?: boolean;
  roleTransfereId?: string;
  commentaire?: string;
}

export async function creerInterim(payload: InterimPayload): Promise<unknown> {
  const { data } = await api.post('/interims', payload);
  return data;
}

export function useCreerInterim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: creerInterim,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interims'] }),
  });
}

/** Intérims où l'utilisateur est l'absent — pour voir ce qu'il a déjà déclaré. */
export function useMesInterims() {
  return useQuery<Array<Record<string, unknown>>>({
    queryKey: ['interims', 'mes'],
    queryFn: async () => (await api.get('/interims/by-initiator')).data,
  });
}

/* ------------------------------------------------------- Listes de support */

/** Annuaire, pour choisir un remplaçant. */
export function useUtilisateurs() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  });
}

/** Caisses visibles — source ou destination d'un transfert. */
export function useCaisses() {
  return useQuery<Caisse[]>({
    queryKey: ['caisses'],
    queryFn: async () => (await api.get<Caisse[]>('/caisses')).data,
  });
}

/** Portefeuilles visibles (déjà restreints au périmètre par le serveur). */
export function usePortefeuillesVisibles() {
  return useQuery<Portefeuille[]>({
    queryKey: ['mes-portefeuilles'],
    queryFn: async () => (await api.get<Portefeuille[]>('/portefeuilles')).data,
  });
}

/** Types partagés avec le backend NestJS (sous-ensemble utile au mobile). */

export interface User {
  id: string;
  uuid?: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | null;
  estActif: boolean;
  directionId?: string | null;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokensResponse {
  user: User;
}

export interface LoginRequest {
  identifiant: string;
  motDePasse: string;
  plateforme?: 'WEB' | 'MOBILE';
}

export type BonStatut = 'CREE' | 'VALIDE' | 'DECAISSE' | 'COMPTABILISE' | 'ANNULE' | 'REFUSE';

export interface Bon {
  id: string;
  numero: string;
  statut: BonStatut;
  montantTotal: string;
  demandeurId: string;
  estRecurrent?: boolean;
  porteur?: string | null;
  createdAt: string;
}

export interface SousBon {
  id: string;
  numeroSousBon: number;
  libelle: string;
  montant: string;
  numeroBl?: string;
  codeManutention?: string;
  costCenterId?: string | null;
  natureOperationId?: string | null;
  partenaireId?: string | null;
  numeroClient?: string | null;
  description?: string | null;
  statut: BonStatut;
}

export interface ValidateBonPayload {
  approuve: boolean;
  commentaire?: string;
  porteur?: string;
}

export interface Role {
  id: string;
  code: string;
  libelle: string;
}

// ---- Référentiel (création de demande) ----

export type ProprietaireType = 'USER' | 'DIRECTION';

export interface Portefeuille {
  id: string;
  code: string;
  libelle: string;
  caisseSourceId: string;
  deviseId: string;
  proprietaireType: ProprietaireType;
  proprietaireId: string;
}

export interface Caisse {
  id: string;
  code: string;
  libelle: string;
  deviseId: string;
}

export interface CostCenter {
  id: string;
  code: string;
  libelle: string;
  estActif: boolean;
}

export interface NatureOperation {
  id: string;
  code: string;
  libelle: string;
  estActif: boolean;
}

export interface Partenaire {
  id: string;
  code: string;
  raisonSociale: string;
  numeroClient?: string | null;
  estActif: boolean;
}

export interface TypeBon {
  id: string;
  code: string;
  libelle: string;
  requiertNumeroClient: boolean;
  requiertPartenaire: boolean;
  requiertBl: boolean;
  estActif: boolean;
}

export interface BonPerimeter {
  costCenters: CostCenter[];
  caisses: Caisse[];
  portefeuilles: Portefeuille[];
  hasMultiCc: boolean;
  isAdmin: boolean;
}

export interface SousBonInput {
  libelle: string;
  montant: string;
  partenaireId?: string;
  numeroBl: string;
  codeManutention: string;
  costCenterId: string;
  natureOperationId: string;
  caisseId: string;
  portefeuilleId: string;
  deviseId: string;
  numeroClient?: string;
  description?: string;
}

export interface CreateBonPayload {
  typeBonId: string;
  soubons: SousBonInput[];
  estRecurrent?: boolean;
  porteur?: string;
}

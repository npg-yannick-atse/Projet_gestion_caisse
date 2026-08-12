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
  /** Total réellement décaissé (ajustements caissier inclus). null si rien décaissé. */
  montantDecaisse?: string | null;
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
  caisseId?: string | null;
  portefeuilleId?: string | null;
  /** « CODE — Libellé » résolus par le serveur : d'où sort l'argent de cette ligne. */
  portefeuilleLibelle?: string | null;
  caisseLibelle?: string | null;
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
  /** Nom du propriétaire résolu par le serveur : « Direction Usine », « Ange Madou »… */
  proprietaireLibelle?: string | null;
  gestionnaireId?: string | null;
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
  /** Centre de coût imposé par la nature — il n'est pas choisi séparément. */
  costCenterId?: string | null;
  estActif: boolean;
}

export interface Partenaire {
  id: string;
  code: string;
  raisonSociale: string;
  numeroClient?: string | null;
  /** Code pays ISO-2 (LAND1 de SAP) — sert à pré-sélectionner le pays du bon. */
  pays?: string | null;
  estActif: boolean;
}

export interface TypeBon {
  id: string;
  code: string;
  libelle: string;
  requiertNumeroClient: boolean;
  requiertNomClient: boolean;
  requiertPartenaire: boolean;
  requiertBl: boolean;
  estActif: boolean;
}

export interface Pays {
  id: string;
  code: string;
  libelle: string;
  estActif: boolean;
}

export interface Division {
  id: string;
  code: string;
  libelle: string;
  paysId: string;
  estActif: boolean;
}

export interface BonPerimeter {
  costCenters: CostCenter[];
  caisses: Caisse[];
  portefeuilles: Portefeuille[];
  /** Natures d'opération autorisées pour l'utilisateur (déjà filtrées côté serveur). */
  naturesOperation: NatureOperation[];
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
  natureOperationId?: string | null;
  caisseId: string;
  portefeuilleId: string;
  deviseId: string;
  numeroClient?: string;
  nomClient?: string;
  paysId?: string;
  divisionId?: string;
  description?: string;
}

export type FrequenceRecurrence = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export interface CreateBonPayload {
  typeBonId: string;
  soubons: SousBonInput[];
  estRecurrent?: boolean;
  frequenceRecurrence?: FrequenceRecurrence;
  /** Jour du premier rappel, AAAA-MM-JJ. Exigé par le serveur si le bon est récurrent. */
  dateProchaineEcheance?: string;
  porteur?: string;
}

/** Solde d'un portefeuille, recalculé par le serveur depuis les écritures. */
export interface SoldePortefeuille {
  portefeuilleId: string;
  typeCompte: string;
  solde: string;
  /** Budget alloué au départ — dénominateur du taux d'utilisation. */
  soldeInitial?: string;
  /** Plafond mensuel, s'il en existe un. */
  budgetMensuel?: string | null;
}

export type TypeOperation =
  | 'ENCAISSEMENT'
  | 'DECAISSEMENT'
  | 'RECHARGE'
  | 'TRANSFERT'
  | 'REMBOURSEMENT'
  | 'CREDIT';

/** Une ligne du grand livre, telle que l'expose /ledger/operations. */
export interface Operation {
  id: string;
  transactionUuid: string;
  typeOperation: TypeOperation | string;
  caisseId?: string | null;
  portefeuilleId?: string | null;
  montant: string;
  deviseId: string;
  dateOperation: string;
  reference?: string | null;
  clientNom?: string | null;
}

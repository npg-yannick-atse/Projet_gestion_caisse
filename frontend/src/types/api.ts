// Types miroir du backend NestJS.
// À terme, remplacer ce fichier par un client généré depuis l'OpenAPI (Orval),
// cf. Dossier de Conception Partie V §3.3.

export interface User {
  id: string;
  uuid?: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | null;
  estActif: boolean;
  accesWeb?: boolean;
  accesMobile?: boolean;
  directionId?: string | null;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends TokensResponse {
  user: User;
}

export interface LoginRequest {
  identifiant: string;
  motDePasse: string;
  plateforme?: 'WEB' | 'MOBILE';
}

export interface Direction {
  id: string;
  code: string;
  libelle: string;
  description?: string | null;
  estActif: boolean;
}

export type RoleCode =
  | 'SUPER_ADMIN'
  | 'ADMINISTRATEUR'
  | 'VALIDATEUR'
  | 'DEMANDEUR'
  | 'CAISSIER'
  | 'GESTIONNAIRE_PORTEFEUILLE'
  | 'DAF';

export interface Role {
  id: string;
  code: RoleCode;
  libelle: string;
  description?: string | null;
  estSysteme: boolean;
  estActif: boolean;
}

export interface Permission {
  id: string;
  code: string;
  libelle: string;
  module: string;
  description?: string | null;
  estActif: boolean;
}

export type DemandeRechargeStatut = 'EN_ATTENTE' | 'TRAITEE' | 'REJETEE' | 'ANNULEE';

export interface DemandeRecharge {
  id: string;
  numero: string;
  demandeurId: string;
  portefeuilleId: string;
  montant: string;
  motif?: string | null;
  statut: DemandeRechargeStatut;
  traiteParId?: string | null;
  dateTraitement?: string | null;
  commentaireTraitement?: string | null;
  transactionUuid?: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId?: string | null;
  action: string;
  entiteConcernee: string;
  entiteId?: string | null;
  ancienneValeur?: string | null;
  nouvelleValeur?: string | null;
  dateAction: string;
  adresseIp?: string | null;
  userAgent?: string | null;
}

export type InterimStatut = 'ACTIF' | 'EXPIRE' | 'REVOQUE';

export interface Interim {
  id: string;
  initiateurId: string;
  remplacantId: string;
  permissionId?: string | null;
  roleTransfereId?: string | null;
  profilTransfereId?: string | null;
  dateDebut: string;
  dateFin: string;
  commentaire?: string | null;
  statut: InterimStatut;
  createdAt?: string;
}

export interface CreateInterimPayload {
  initiateurId: string;
  remplacantId: string;
  permissionId?: string;
  roleTransfereId?: string;
  profilTransfereId?: string;
  dateDebut: string;
  dateFin: string;
  commentaire?: string;
}

export type ProfilCategorie = 'VALIDATEUR' | 'DEMANDEUR' | 'CAISSIER' | 'INTERIM';

export interface Profil {
  id: string;
  code: string;
  libelle: string;
  description?: string | null;
  categorie: ProfilCategorie;
  estActif: boolean;
}

export interface CreateUserPayload {
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  directionId?: string;
  estActif?: boolean;
  accesWeb?: boolean;
  accesMobile?: boolean;
}

export type CaisseStatut = 'OUVERTE' | 'FERMEE';

export interface Caisse {
  id: string;
  code: string;
  libelle: string;
  deviseId: string;
  caissierId?: string | null;
  siteId?: string | null;
  estPrincipale: boolean;
  estActif: boolean;
  statut: CaisseStatut;
}

export type TypeCloture = 'AUTO_20H' | 'MANUEL';
export type SessionStatut = 'OUVERTE' | 'FERMEE';

export interface SessionCaisse {
  id: string;
  caisseId: string;
  dateOuverture: string;
  dateCloture?: string | null;
  soldeOuverture: string;
  soldeCloture?: string | null;
  clotureParId?: string | null;
  typeCloture?: TypeCloture | null;
  statut: SessionStatut;
}

export interface SoldeResponse {
  caisseId?: string;
  portefeuilleId?: string;
  typeCompte: string;
  solde: string;
  /** Budget alloué (solde initial) — présent pour les portefeuilles, sert au calcul du taux d'utilisation. */
  soldeInitial?: string;
}

export type BonStatut = 'CREE' | 'VALIDE' | 'DECAISSE' | 'COMPTABILISE' | 'ANNULE' | 'REFUSE';

export interface Bon {
  id: string;
  uuid: string;
  numero: string;
  demandeurId: string;
  typeBonId: string;
  statut: BonStatut;
  estRecurrent: boolean;
  frequenceRecurrence?: FrequenceRecurrence | null;
  montantTotal: string;
  demandeExtension?: boolean;
  descriptionExtension?: string | null;
  statutExtension?: StatutExtension;
  extensionMode?: ExtensionMode | null;
  extensionCommentaire?: string | null;
  /** Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). */
  porteur?: string | null;
  createdAt: string;
}

export type StatutExtension = 'NON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE';
export type ExtensionMode = 'DECOUVERT' | 'RECHARGE';

export interface SousBon {
  id: string;
  bonId: string;
  numeroSousBon: number;
  libelle: string;
  description?: string | null;
  montant: string;
  partenaireId: string;
  numeroClient?: string | null;
  numeroBl: string;
  codeManutention: string;
  costCenterId?: string | null;
  natureOperationId?: string | null;
  statut: BonStatut;
  dateDecaissement?: string | null;
}

/** Modification d'un bon (enveloppe) — statut CREE uniquement. */
export interface EditBonPayload {
  porteur?: string;
}

/** Modification d'un sous-bon — statut CREE uniquement. Axes d'imputation immuables. */
export interface EditSousBonPayload {
  libelle?: string;
  montant?: string;
  description?: string;
  partenaireId?: string | null;
  numeroBl?: string;
  codeManutention?: string;
  numeroClient?: string | null;
}

export interface Devise {
  id: string;
  code: string;
  libelle: string;
  symbole?: string | null;
  nbDecimales: number;
  estActif: boolean;
}

export type ProprietaireType = 'USER' | 'DIRECTION';

export interface Portefeuille {
  id: string;
  uuid: string;
  code: string;
  libelle: string;
  caisseSourceId: string;
  deviseId: string;
  proprietaireType: ProprietaireType;
  proprietaireId: string;
  gestionnaireId?: string | null;
  soldeInitial?: string;
  estActif: boolean;
}

export type TypePartenaire = 'CLIENT' | 'FOURNISSEUR' | 'MIXTE';

export interface Partenaire {
  id: string;
  code: string;
  raisonSociale: string;
  typePartenaire: TypePartenaire;
  numeroClient?: string | null;
  estActif: boolean;
}

export interface CostCenter {
  id: string;
  code: string;
  libelle: string;
  directionId?: string | null;
  budgetAnnuel?: string | null;
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

export type FrequenceRecurrence = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export interface NatureOperation {
  id: string;
  code: string;
  libelle: string;
  costCenterId?: string | null;
  planComptableId?: string | null;
  estActif: boolean;
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
  description?: string;
}

export interface CreateBonPayload {
  typeBonId: string;
  soubons: SousBonInput[];
  estRecurrent?: boolean;
  frequenceRecurrence?: FrequenceRecurrence;
  demandeExtension?: boolean;
  descriptionExtension?: string;
  /** Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). */
  porteur?: string;
}

export interface RechargePayload {
  caisseId: string;
  portefeuilleId: string;
  montant: string;
  reference?: string;
}

export interface CreateCaissePayload {
  code: string;
  libelle: string;
  deviseId: string;
  siteId?: string;
  estPrincipale?: boolean;
}

export interface CreatePortefeuillePayload {
  code: string;
  libelle: string;
  caisseSourceId: string;
  deviseId: string;
  proprietaireType: ProprietaireType;
  proprietaireId: string;
  gestionnaireId?: string;
  soldeInitial?: string;
}

export interface UpdateCaissePayload {
  code?: string;
  libelle?: string;
  deviseId?: string;
  siteId?: string;
  estPrincipale?: boolean;
  estActif?: boolean;
}

export interface UpdatePortefeuillePayload {
  code?: string;
  libelle?: string;
  caisseSourceId?: string;
  deviseId?: string;
  proprietaireType?: ProprietaireType;
  proprietaireId?: string;
  gestionnaireId?: string;
  soldeInitial?: string;
  estActif?: boolean;
}

export type TypeOperation = 'RECHARGE' | 'DECAISSEMENT' | 'TRANSFERT' | 'AJUSTEMENT';

export type TransfertCompteType = 'CAISSE' | 'PORTEFEUILLE';
export type DemandeTransfertStatut =
  | 'CREE'
  | 'APPROUVEE'
  | 'REJETEE'
  | 'EXECUTEE'
  | 'ANNULEE';

export interface DemandeTransfert {
  id: string;
  numero: string;
  demandeurId: string;
  sourceType: TransfertCompteType;
  sourceId: string;
  destinationType: TransfertCompteType;
  destinationId: string;
  montant: string;
  deviseId: string;
  motif?: string | null;
  statut: DemandeTransfertStatut;
  validateurId?: string | null;
  dateValidation?: string | null;
  commentaireValidation?: string | null;
  executeurId?: string | null;
  dateExecution?: string | null;
  transactionUuid?: string | null;
  createdAt: string;
}

export interface CreateDemandeTransfertPayload {
  sourceType: TransfertCompteType;
  sourceId: string;
  destinationType: TransfertCompteType;
  destinationId: string;
  montant: string;
  deviseId: string;
  motif?: string;
}

export interface DecisionDemandeTransfertPayload {
  approuve: boolean;
  commentaire?: string;
}

export interface Operation {
  id: string;
  transactionUuid: string;
  typeOperation: TypeOperation;
  caisseId?: string | null;
  portefeuilleId?: string | null;
  montant: string;
  deviseId: string;
  dateOperation: string;
  userId: string;
  reference?: string | null;
}

export interface LdapUser {
  idLdap: number | null;
  username: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string | null;
}

export interface CreatePartenairePayload {
  code: string;
  raisonSociale: string;
  typePartenaire: TypePartenaire;
  sigle?: string;
  numeroClient?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  pays?: string;
  ville?: string;
}

export interface CreateCostCenterPayload {
  code: string;
  libelle: string;
  directionId?: string;
  budgetAnnuel?: string;
}

export interface CreateDirectionPayload {
  code: string;
  libelle: string;
  description?: string;
}

export type TypeCompte = 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT';

export interface PlanComptable {
  id: string;
  numeroCompte: string;
  libelle: string;
  typeCompte: TypeCompte;
  parentId?: string | null;
  estActif: boolean;
}

export interface CreatePlanComptablePayload {
  numeroCompte: string;
  libelle: string;
  typeCompte: TypeCompte;
  parentId?: string;
}

export interface BonTimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
  montant: number;
}

export interface BonsByDirectionRow {
  directionId: string | null;
  directionCode: string | null;
  directionLibelle: string;
  nbSousBons: number;
  nbBons: number;
  montant: number;
}

export interface BonSummary {
  total: number;
  byStatut: Partial<Record<BonStatut, { count: number; montant: number }>>;
  pendingAgeing: { lt24h: number; lt48h: number; gt48h: number };
  avgValidationHours: number | null;
  topDemandeurs: Array<{ demandeurId: string; count: number; montant: number }>;
  extensionEnAttente: number;
}

export interface ImpressionBon {
  id: string;
  bonId: string | null;
  sousBonId: string | null;
  imprimeParId: string;
  dateImpression: string;
  aSigne: boolean;
  dateSignature: string | null;
  signatureImage?: string | null;
  createdAt: string;
}

/**
 * Statuts d'une copie de travail caissier (BonCaisse).
 * PREPARE  : duplicata créé, en cours d'édition par le caissier
 * FINALISE : décaissement effectivement réalisé (opération et sous-bon DECAISSE)
 * ANNULE   : caissier a abandonné le décaissement avant finalisation
 */
export type BonCaisseStatut = 'PREPARE' | 'FINALISE' | 'ANNULE';

/**
 * Copie de travail (snapshot) créée par le caissier au moment du décaissement
 * d'un sous-bon. Miroir de l'entité backend trx_bon_caisse.
 */
export interface BonCaisse {
  id: string;
  uuid: string;
  bonSourceId?: string | null;
  sousBonSourceId?: string | null;
  caissierId: string;
  dateDuplication: string;
  dateDecaissement?: string | null;
  contenuModifie?: string | null;
  beneficiaire?: string | null;
  beneficiairePiece?: string | null;
  libelleAjuste?: string | null;
  montantAjuste?: string | null;
  commentaire?: string | null;
  statut: BonCaisseStatut;
  createdAt: string;
  updatedAt?: string | null;
}

/** Payload pour POST /bons-caisse/prepare. */
export interface PrepareBonCaissePayload {
  bonId: string;
  sousBonId: string;
}

/** Payload pour PATCH /bons-caisse/:id (tous champs optionnels). */
export interface UpdateBonCaissePayload {
  beneficiaire?: string;
  beneficiairePiece?: string;
  libelleAjuste?: string;
  montantAjuste?: string;
  commentaire?: string;
}

// ---- Bons manuels (carnets) ----
export type CarnetStatut = 'ACTIF' | 'EPUISE' | 'CLOTURE';

export interface Carnet {
  id: string;
  libelle?: string | null;
  caisseId: string;
  caissierId: string;
  numeroDebut: number;
  numeroFin: number;
  prochainNumero: number;
  statut: CarnetStatut;
  createdAt: string;
}

export interface BonManuel {
  id: string;
  numero: string;
  carnetId: string;
  numeroManuel: number;
  caissierId: string;
  caisseId: string;
  portefeuilleId: string;
  deviseId: string;
  montant: string;
  typeBonId: string;
  libelle: string;
  partenaireId?: string | null;
  numeroBl: string;
  codeManutention: string;
  costCenterId: string;
  numeroClient?: string | null;
  description?: string | null;
  donneurOrdreUserId?: string | null;
  donneurOrdreNom?: string | null;
  beneficiaireNom: string;
  motif?: string | null;
  statut: string;
  dateDecaissement: string;
}

export interface CreateCarnetPayload {
  libelle?: string;
  caisseId: string;
  caissierId: string;
  numeroDebut: number;
  numeroFin: number;
}

export interface CreateBonManuelPayload {
  carnetId: string;
  numeroManuel: number;
  portefeuilleId: string;
  montant: string;
  typeBonId: string;
  libelle: string;
  partenaireId?: string;
  numeroBl: string;
  codeManutention: string;
  costCenterId: string;
  numeroClient?: string;
  description?: string;
  donneurOrdreUserId?: string;
  donneurOrdreNom?: string;
  beneficiaireNom: string;
  motif?: string;
}

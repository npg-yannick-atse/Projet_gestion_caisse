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
  /**
   * Lecture en clair de l'action, composée par le serveur : « a attribué le
   * rôle Caissier à l'utilisateur Lorène Touré ». Les identifiants y sont
   * résolus en noms. Le JSON brut reste dans `ancienneValeur` /
   * `nouvelleValeur` — le résumé est une lecture, pas un remplacement.
   */
  resume?: string;
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
  /** Copier tous les rôles et profils de l'initiateur — un intérim par droit. */
  copierTousLesDroits?: boolean;
  dateDebut: string;
  dateFin: string;
  commentaire?: string;
}

export interface Profil {
  id: string;
  code: string;
  libelle: string;
  description?: string | null;
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
  /** Détail des soldes devise par devise — `soldeOuverture`/`soldeCloture` ne portent que la devise de la caisse. */
  devises?: SessionSoldeDevise[];
}

/** Ouverture et clôture d'une session, pour une seule devise. */
export interface SessionSoldeDevise {
  deviseId: string;
  code: string | null;
  soldeOuverture: string;
  soldeCloture: string | null;
}

/** Solde d'un compte pour UNE devise. Ne jamais additionner deux lignes entre elles. */
export interface SoldeDevise {
  deviseId: string;
  code: string | null;
  solde: string;
  /** Vrai pour la devise déclarée de la caisse — celle du solde résumé. */
  principale?: boolean;
}

export interface SoldeResponse {
  caisseId?: string;
  portefeuilleId?: string;
  typeCompte: string;
  /** Solde dans la devise déclarée du compte, PAS la somme de toutes les devises. */
  solde: string;
  /** Ventilation complète : une caisse peut détenir d'autres devises que la sienne. */
  soldes?: SoldeDevise[];
  /** Budget alloué (solde initial) — présent pour les portefeuilles, sert au calcul du taux d'utilisation. */
  soldeInitial?: string;
  /** Plafond budgétaire mensuel (si défini) — dénominateur du taux d'utilisation « ce mois ». */
  budgetMensuel?: string | null;
}

/**
 * Total INDICATIF d'un panier multi-devises ramené à la devise de référence.
 * Aucune écriture comptable n'en découle.
 */
export interface Consolidation {
  total: string;
  devise: string;
  converties: number;
  /** Devises écartées faute de taux : le total est amputé, il faut le dire. */
  ignorees: Array<{ deviseId: string; montant: string; raison: string }>;
  /** Au moins un des taux employés est plus vieux que le seuil d'alerte. */
  perime: boolean;
}

export interface SoldeConsolideResponse {
  caisseId: string;
  soldes: SoldeDevise[];
  consolidation: Consolidation;
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
  /** Total réellement décaissé (ajustements caissier inclus). null si rien décaissé. */
  montantDecaisse?: string | null;
  demandeExtension?: boolean;
  descriptionExtension?: string | null;
  statutExtension?: StatutExtension;
  extensionMode?: ExtensionMode | null;
  extensionCommentaire?: string | null;
  /** Nom du demandeur, résolu par le serveur — y compris si son compte a été supprimé. */
  demandeurNom?: string | null;
  demandeurMatricule?: string | null;
  /** Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). */
  porteur?: string | null;
  createdAt: string;
}

export type StatutExtension = 'NON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE';
export type ExtensionMode = 'DECOUVERT' | 'RECHARGE';

export interface ValidationBon {
  id: string;
  bonId?: string | null;
  sousBonId?: string | null;
  validateurId: string;
  validateurInterimId?: string | null;
  /** 'VALIDE' = approuvé, 'REFUSE' = refusé. */
  action: 'VALIDE' | 'REFUSE';
  commentaire?: string | null;
  dateValidation: string;
}

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
  caisseId?: string | null;
  portefeuilleId?: string | null;
  deviseId?: string | null;
  /** « CODE — Libellé » résolus par le serveur : d'où sort l'argent de cette ligne. */
  portefeuilleLibelle?: string | null;
  caisseLibelle?: string | null;
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

/** D'où vient un taux : saisi, rapatrié de SAP, ou d'une API de cotation. */
export type SourceTaux = 'MANUEL' | 'SAP' | 'API';

/** Un taux en vigueur, tel que l'écran l'affiche (âge et inverse déjà calculés). */
export interface TauxCourant {
  id: string;
  deviseSourceId: string;
  deviseSource: string;
  deviseCibleId: string;
  deviseCible: string;
  /** montantCible = montantSource × taux */
  taux: string;
  /** Sens opposé, calculé — jamais stocké (cf. TauxEchange côté backend). */
  tauxInverse: string;
  dateValiditeDebut: string;
  source: SourceTaux;
  motif: string | null;
  /** Parité fixée par accord monétaire : ni importable, ni périssable. */
  pariteFixe: boolean;
  ageJours: number;
  perime: boolean;
}

/** Une période de l'historique d'un couple. `dateValiditeFin` null = en vigueur. */
export interface TauxPeriode {
  id: string;
  deviseSourceId: string;
  deviseCibleId: string;
  deviseSource?: Devise;
  deviseCible?: Devise;
  taux: string;
  dateValiditeDebut: string;
  dateValiditeFin?: string | null;
  source: SourceTaux;
  motif?: string | null;
  pariteFixe: boolean;
  createdAt: string;
}

export interface CreateTauxPayload {
  deviseSourceId: string;
  deviseCibleId: string;
  taux: string;
  dateValiditeDebut?: string;
  motif?: string;
  pariteFixe?: boolean;
}

export type VoieConversion = 'IDENTITE' | 'DIRECT' | 'INVERSE' | 'PIVOT';

export interface Conversion {
  montantSource: string;
  deviseSource: string;
  montantConverti: string;
  deviseCible: string;
  taux: string;
  voie: VoieConversion;
  dateTaux: string | null;
  ageJours: number | null;
  perime: boolean;
}

export interface LigneImportTaux {
  devise: string;
  statut: 'IMPORTE' | 'INCHANGE' | 'PARITE_FIXE' | 'ECHEC';
  taux?: string;
  ancienTaux?: string;
  /** Variation en % par rapport au taux qui était en vigueur. */
  variation?: string;
  detail?: string;
}

export interface RapportImportTaux {
  deviseReference: string;
  /** Horodatage annoncé par l'API elle-même, pas celui de l'import. */
  fraicheurApi: string | null;
  lignes: LigneImportTaux[];
  importes: number;
  echecs: number;
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
  /** Plafond budgétaire mensuel (réajusté chaque mois, sans report). Null = pas de plafond mensuel. */
  budgetMensuel?: string | null;
  budgetResetMois?: string | null;
  estActif: boolean;
}

export type TypePartenaire = 'CLIENT' | 'FOURNISSEUR' | 'MIXTE';

export interface Partenaire {
  id: string;
  code: string;
  raisonSociale: string;
  typePartenaire: TypePartenaire;
  sigle?: string | null;
  numeroClient?: string | null;
  numeroFournisseur?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  pays?: string | null;
  ville?: string | null;
  estActif: boolean;
}

export interface CostCenter {
  id: string;
  code: string;
  libelle: string;
  directionId?: string | null;
  budgetMensuel?: string | null;
  estActif: boolean;
}

export interface TypeBon {
  id: string;
  code: string;
  libelle: string;
  requiertNumeroClient: boolean;
  requiertPartenaire: boolean;
  requiertBl: boolean;
  requiertNomClient: boolean;
  estActif: boolean;
}

export interface NatureComptable {
  id: string;
  libelle: string;
  description?: string | null;
  costCenterId?: string | null;
  planComptableId?: string | null;
  codeComptableSap?: string | null;
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

export type FrequenceRecurrence = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export interface NatureOperation {
  id: string;
  code: string;
  libelle: string;
  costCenterId?: string | null;
  planComptableId?: string | null;
  natureComptableId?: string | null;
  natureComptable?: { id: string; libelle: string; codeComptableSap?: string | null } | null;
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
  natureComptableId?: string | null;
  caisseId: string;
  portefeuilleId: string;
  deviseId: string;
  numeroClient?: string;
  nomClient?: string;
  paysId?: string;
  divisionId?: string;
  description?: string;
}

export interface CreateBonPayload {
  typeBonId: string;
  soubons: SousBonInput[];
  estRecurrent?: boolean;
  frequenceRecurrence?: FrequenceRecurrence;
  /** Jour du premier rappel, AAAA-MM-JJ. Exigé par le serveur si le bon est récurrent. */
  dateProchaineEcheance?: string;
  demandeExtension?: boolean;
  descriptionExtension?: string;
  /** Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). */
  porteur?: string;
}

export type RechargeSens = 'CAISSE_VERS_PORTEFEUILLE' | 'PORTEFEUILLE_VERS_CAISSE';

export interface RechargePayload {
  caisseId: string;
  portefeuilleId: string;
  montant: string;
  reference?: string;
  /** Sens du mouvement (défaut : caisse → portefeuille). */
  sens?: RechargeSens;
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
  budgetMensuel?: string;
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
  budgetMensuel?: string;
  estActif?: boolean;
}

export type TypeOperation =
  | 'RECHARGE'
  | 'DECAISSEMENT'
  | 'TRANSFERT'
  | 'AJUSTEMENT'
  | 'ENCAISSEMENT'
  | 'CREDIT'
  | 'SALAIRE'
  /** Mensualité d'un crédit employé encaissée : l'argent revient dans la source. */
  | 'REMBOURSEMENT_CREDIT';

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
  clientNom?: string | null;
  clientNumero?: string | null;
  motif?: string | null;
  /** Intégration SAP : n° de pièce, statut d'envoi. */
  sapPiece?: string | null;
  sapStatut?: string | null;
  sapDate?: string | null;
  sapMessage?: string | null;
}

export type CreditStatut =
  | 'EN_ATTENTE'
  | 'APPROUVEE'
  | 'EN_COURS'
  | 'SOLDE'
  | 'REJETEE'
  | 'ANNULEE';
export type CreditSource = 'CAISSE' | 'PORTEFEUILLE';

export interface Credit {
  id: string;
  employeId: string;
  montant: string;
  nbMois: number;
  sourceType: CreditSource;
  sourceId: string;
  deviseId: string;
  statut: CreditStatut;
  dateDebut: string;
  commentaire?: string | null;
  validateurId?: string | null;
  dateValidation?: string | null;
  commentaireValidation?: string | null;
  decaisseParId?: string | null;
  dateDecaissement?: string | null;
  createdById?: string | null;
  createdAt: string;
}

/** Versement réellement encaissé au titre d'un crédit. */
/** Que faire du reliquat d'une mensualité partiellement prélevée. */
export type ModeReplanification = 'REPARTIR' | 'ALLONGER';

export interface CreditRemboursement {
  id: string;
  creditId: string;
  /** Rang de l'échéance couverte (1 = première mensualité). */
  numeroEcheance: number;
  montant: string;
  deviseId: string;
  sourceType: CreditSource;
  sourceId: string;
  transactionUuid?: string | null;
  dateRemboursement: string;
  statut: 'ENCAISSE' | 'ANNULE';
  commentaire?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface CreateRemboursementPayload {
  /** Par défaut, la première échéance non réglée. */
  numeroEcheance?: number;
  /** Par défaut, la mensualité théorique. */
  montant?: string;
  sourceType?: CreditSource;
  sourceId?: string;
  dateRemboursement?: string;
  commentaire?: string;
}

/**
 * Situation d'un crédit, calculée par le backend sur les versements RÉELS.
 * Ne pas la recalculer côté écran : le calendrier ne dit pas qui a payé.
 */
export interface SituationCredit {
  creditId: string;
  montant: string;
  nbMois: number;
  /** Montant attendu MAINTENANT, reliquats des mois précédents replanifiés inclus. */
  mensualite: string;
  rembourse: string;
  restant: string;
  echeancesPayees: number;
  /** Échéances qu'il reste à régler. */
  echeancesRestantes: number;
  /**
   * Reliquat qui ne peut plus être reporté : toutes les échéances ont été
   * traitées et il reste malgré tout de l'argent dû. À présenter, pas à étaler.
   */
  reliquatNonReplanifiable: string;
  /** Rang de la prochaine échéance à encaisser, null si tout est soldé. */
  prochaineEcheance: number | null;
  echeancesEnRetard: number;
  montantEnRetard: string;
  pourcentage: number;
  /** Traitement d'un reliquat : étaler sur les mois restants, ou ajouter des mois. */
  modeReplanification: ModeReplanification;
  /** Durée d'origine ;  peut avoir été allongé. */
  nbMoisInitial: number;
  /** Mensualité convenue à l'origine. */
  mensualiteReference: string;
}

export interface CreateCreditPayload {
  employeId: string;
  montant: string;
  nbMois: number;
  sourceType: CreditSource;
  sourceId: string;
  commentaire?: string;
}

export interface UpdateCreditPayload {
  montant?: string;
  nbMois?: number;
  commentaire?: string;
}

export interface Parametre {
  cle: string;
  valeur?: string | null;
  libelle?: string | null;
  updatedAt?: string;
}

export interface EncaissementPayload {
  caisseId: string;
  montant: string;
  /**
   * Devise réellement reçue. Par défaut, la devise déclarée de la caisse — mais
   * une caisse peut en détenir plusieurs, un client peut donc payer dans une
   * autre monnaie.
   */
  deviseId?: string;
  /**
   * Taux RÉELLEMENT obtenu, quand la devise reçue n'est pas celle de référence.
   * Pré-rempli avec le cours du jour, corrigeable : deux encaissements du même
   * jour peuvent porter deux taux différents.
   */
  tauxApplique?: string;
  clientNom?: string;
  clientNumero?: string;
  motif?: string;
  reference?: string;
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
  numeroFournisseur?: string;
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
  budgetMensuel?: string;
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
  /** Compte parent, joint par la liste (évite de charger tout le plan côté client). */
  parent?: Pick<PlanComptable, 'id' | 'numeroCompte' | 'libelle'> | null;
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

/* ---------------------------------------------------------------- Employés -- */

export type ModeReglement = 'ESPECES' | 'VIREMENT';

export interface Employe {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  directionId?: string | null;
  /** DECIMAL(19,4) en string. null si l'appelant n'a pas EMPLOYE_VOIR_SALAIRE. */
  salaire?: string | null;
  /** Mode de règlement de l'employé. */
  modeReglement: ModeReglement;
  /** Banque (mode VIREMENT). */
  banque?: string | null;
  /** RIB / n° de compte (mode VIREMENT). */
  rib?: string | null;
  /** Portefeuille source par défaut des avances/crédits. */
  portefeuilleSourceId?: string | null;
  estActif: boolean;
  /** Nombre de bénéfices VALIDES (indicateur sur la liste). */
  nbBenefices?: number;
}

export type ModeMontantBenefice = 'SAISI' | 'FIXE' | 'POURCENTAGE_SALAIRE';

export interface TypeBenefice {
  id: string;
  code: string;
  libelle: string;
  estActif: boolean;
  /** Mode de détermination du montant à l'attribution. */
  modeMontant: ModeMontantBenefice;
  /** Montant imposé (mode FIXE). */
  montantFixe?: string | null;
  /** % du salaire (mode POURCENTAGE_SALAIRE). */
  pourcentageSalaire?: string | null;
  /** Plafond en % du salaire (tous modes). */
  plafondPourcentageSalaire?: string | null;
  /** Attribution autorisée seulement à partir de ce jour du mois. */
  jourMinMois?: number | null;
  /** Le bénéfice a-t-il une période (dates début/fin). */
  requiertPeriode: boolean;
  /** Bénéfice récurrent (vs ponctuel). */
  recurrent: boolean;
}

export interface EmployeBenefice {
  id: string;
  employeId: string;
  typeBeneficeId: string;
  montant: string;
  dateDebut: string;
  dateFin: string;
  /** Interrupteur manuel : un seul bénéfice valide par type et par employé. */
  estValide: boolean;
  commentaire?: string | null;
}

export interface CreateEmployePayload {
  matricule: string;
  nom: string;
  prenoms: string;
  directionId?: string;
  salaire?: string;
  modeReglement?: ModeReglement;
  banque?: string | null;
  rib?: string | null;
  portefeuilleSourceId?: string | null;
}

export interface UpdateEmployePayload {
  nom?: string;
  prenoms?: string;
  directionId?: string;
  salaire?: string;
  modeReglement?: ModeReglement;
  banque?: string | null;
  rib?: string | null;
  portefeuilleSourceId?: string | null;
  estActif?: boolean;
}

export interface TypeBeneficeConfigPayload {
  modeMontant?: ModeMontantBenefice;
  montantFixe?: string | null;
  pourcentageSalaire?: string | null;
  plafondPourcentageSalaire?: string | null;
  jourMinMois?: number | null;
  requiertPeriode?: boolean;
  recurrent?: boolean;
}

export interface CreateTypeBeneficePayload extends TypeBeneficeConfigPayload {
  code: string;
  libelle: string;
}

export interface CreateEmployeBeneficePayload {
  typeBeneficeId: string;
  /** Requis seulement si le type est en mode SAISI. */
  montant?: string;
  /** Requis seulement si le type a une période. */
  dateDebut?: string;
  dateFin?: string;
  commentaire?: string;
}

export interface UpdateEmployeBeneficePayload {
  montant?: string;
  dateDebut?: string;
  dateFin?: string;
  estValide?: boolean;
  commentaire?: string;
}

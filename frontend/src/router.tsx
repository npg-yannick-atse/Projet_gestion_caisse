import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import { getAccessToken } from '@/lib/token';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CaissesPage } from '@/pages/CaissesPage';
import { PortefeuillesPage } from '@/pages/PortefeuillesPage';
import { BonsPage } from '@/pages/BonsPage';
import { BonDetailPage } from '@/pages/BonDetailPage';
import { UsersPage } from '@/pages/UsersPage';
import { RolesPage } from '@/pages/RolesPage';
import { ProfilsPage } from '@/pages/ProfilsPage';
import { InterimsPage } from '@/pages/InterimsPage';
import { AuditPage } from '@/pages/AuditPage';
import { SapTestPage } from '@/pages/SapTestPage';
import { MouvementsCaissePage } from '@/pages/MouvementsCaissePage';
import { ReleveAgentPage } from '@/pages/ReleveAgentPage';
import { ParametresPage } from '@/pages/ParametresPage';
import { CreditsPage } from '@/pages/CreditsPage';
import { BonCreatePage } from '@/pages/BonCreatePage';
import { PartenairesPage } from '@/pages/PartenairesPage';
import { CostCentersPage } from '@/pages/CostCentersPage';
import { DirectionsPage } from '@/pages/DirectionsPage';
import { PaysDivisionsPage } from '@/pages/PaysDivisionsPage';
import { EmployesPage } from '@/pages/EmployesPage';
import { TypesBeneficePage } from '@/pages/TypesBeneficePage';
import { OperationsPage } from '@/pages/OperationsPage';
import { NaturesOperationPage } from '@/pages/NaturesOperationPage';
import { NaturesComptablePage } from '@/pages/NaturesComptablePage';
import { DemandesExtensionPage } from '@/pages/DemandesExtensionPage';
import { DemandesTransfertPage } from '@/pages/DemandesTransfertPage';
import { DemandesRechargePage } from '@/pages/DemandesRechargePage';
import { BonsManuelsPage } from '@/pages/BonsManuelsPage';
import { RoleGuard } from '@/components/RoleGuard';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    if (getAccessToken()) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: () => {
    if (!getAccessToken()) throw redirect({ to: '/login' });
  },
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: DashboardPage,
});

const caissesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/caisses',
  component: CaissesPage,
});

const bonsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/bons',
  component: BonsPage,
});

const bonCreateRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/bons/nouveau',
  component: BonCreatePage,
});

const bonDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/bons/$bonId',
  component: BonDetailPage,
});

const mouvementsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/mouvements',
  component: () => (
    <RoleGuard allow={['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN']}>
      <MouvementsCaissePage />
    </RoleGuard>
  ),
});

// Anciennes routes conservées (liens/bookmarks) → page unifiée, mode présélectionné.
const rechargeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/recharge',
  component: () => (
    <RoleGuard allow={['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN']}>
      <MouvementsCaissePage initialMode="RECHARGE" />
    </RoleGuard>
  ),
});

const encaissementRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/encaissement',
  component: () => (
    <RoleGuard allow={['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN']}>
      <MouvementsCaissePage initialMode="ENCAISSEMENT" />
    </RoleGuard>
  ),
});

const releveAgentRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/releve-agent',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']}>
      <ReleveAgentPage />
    </RoleGuard>
  ),
});

const parametresRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/parametres',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="PARAMETRE_MODIFIER">
      <ParametresPage />
    </RoleGuard>
  ),
});

const creditsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/credits',
  component: () => (
    <RoleGuard allow={['VALIDATEUR', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']}>
      <CreditsPage />
    </RoleGuard>
  ),
});

const portefeuillesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/portefeuilles',
  component: PortefeuillesPage,
});

const demandesRechargeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/demandes-recharge',
  component: DemandesRechargePage,
});

const usersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/users',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="UTILISATEUR_VOIR">
      <UsersPage />
    </RoleGuard>
  ),
});

const rolesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/roles',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="ADMIN_ROLE">
      <RolesPage />
    </RoleGuard>
  ),
});

const profilsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/profils',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="PROFIL_GERER">
      <ProfilsPage />
    </RoleGuard>
  ),
});

const interimsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/interims',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="INTERIM_VOIR">
      <InterimsPage />
    </RoleGuard>
  ),
});

// Le journal d'audit reste strictement Super Admin (le backend l'exige sans
// bypass administrateur) ; AUDIT_VOIR permet de le déléguer à un auditeur.
const auditRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/audit',
  component: () => (
    <RoleGuard allow={['SUPER_ADMIN']} permission="AUDIT_VOIR">
      <AuditPage />
    </RoleGuard>
  ),
});

const sapTestRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/sap',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']} permission="SAP_CONSULTER">
      <SapTestPage />
    </RoleGuard>
  ),
});

const partenairesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/partenaires',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="PARTENAIRE_GERER">
      <PartenairesPage />
    </RoleGuard>
  ),
});

const costCentersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/cost-centers',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="COST_CENTER_GERER">
      <CostCentersPage />
    </RoleGuard>
  ),
});

const directionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/directions',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="DIRECTION_GERER">
      <DirectionsPage />
    </RoleGuard>
  ),
});

const paysDivisionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/pays-divisions',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="PAYS_GERER">
      <PaysDivisionsPage />
    </RoleGuard>
  ),
});

const operationsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/operations',
  component: OperationsPage,
});

const employesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/employes',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']} permission="EMPLOYE_VOIR">
      <EmployesPage />
    </RoleGuard>
  ),
});

const typesBeneficeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/types-benefice',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']}>
      <TypesBeneficePage />
    </RoleGuard>
  ),
});

const naturesOperationRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/natures-operation',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="NATURE_OPERATION_GERER">
      <NaturesOperationPage />
    </RoleGuard>
  ),
});

const naturesComptableRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/natures-comptable',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']} permission="PLAN_COMPTABLE_GERER">
      <NaturesComptablePage />
    </RoleGuard>
  ),
});

const extensionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/extensions',
  component: DemandesExtensionPage,
});

const transfertsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/transferts',
  component: () => (
    <RoleGuard allow={['CAISSIER', 'GESTIONNAIRE_PORTEFEUILLE', 'ADMINISTRATEUR', 'SUPER_ADMIN']}>
      <DemandesTransfertPage />
    </RoleGuard>
  ),
});

const bonsManuelsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/bons-manuels',
  component: () => (
    <RoleGuard allow={['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']}>
      <BonsManuelsPage />
    </RoleGuard>
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([
    indexRoute,
    caissesRoute,
    bonsRoute,
    bonCreateRoute,
    bonDetailRoute,
    mouvementsRoute,
    rechargeRoute,
    encaissementRoute,
    releveAgentRoute,
    parametresRoute,
    creditsRoute,
    demandesRechargeRoute,
    portefeuillesRoute,
    usersRoute,
    rolesRoute,
    profilsRoute,
    interimsRoute,
    auditRoute,
    sapTestRoute,
    partenairesRoute,
    costCentersRoute,
    directionsRoute,
    paysDivisionsRoute,
    operationsRoute,
    naturesOperationRoute,
    naturesComptableRoute,
    extensionsRoute,
    transfertsRoute,
    bonsManuelsRoute,
    employesRoute,
    typesBeneficeRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

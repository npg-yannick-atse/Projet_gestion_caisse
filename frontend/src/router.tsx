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
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']}>
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
  component: UsersPage,
});

const rolesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/roles',
  component: RolesPage,
});

const profilsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/profils',
  component: ProfilsPage,
});

const interimsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/interims',
  component: InterimsPage,
});

const auditRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/audit',
  component: AuditPage,
});

const partenairesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/partenaires',
  component: PartenairesPage,
});

const costCentersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/cost-centers',
  component: CostCentersPage,
});

const directionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/directions',
  component: DirectionsPage,
});

const paysDivisionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/pays-divisions',
  component: () => (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']}>
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
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']}>
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
  component: NaturesOperationPage,
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
    partenairesRoute,
    costCentersRoute,
    directionsRoute,
    paysDivisionsRoute,
    operationsRoute,
    naturesOperationRoute,
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

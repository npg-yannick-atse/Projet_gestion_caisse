import { ShieldCheck, Banknote } from 'lucide-react';
import type { User } from '@/types/api';
import { Hero } from './_shared';
import { AdminDashboard } from './AdminDashboard';
import { CaissierDashboard } from './CaissierDashboard';

interface Props {
  user: User;
}

/** Titre de section pour séparer les deux volets du tableau de bord combiné. */
function SectionTitle({ icon: Icon, children }: { icon: typeof ShieldCheck; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#EFF6FF] text-[#0F4C81]">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="font-display text-sm font-semibold text-[#0F172A]">{children}</h2>
      <div className="ml-2 h-px flex-1 bg-[rgba(15,76,129,0.1)]" />
    </div>
  );
}

/**
 * Tableau de bord DAF : une seule vue qui fusionne le pilotage Administrateur
 * et la supervision Caissier. Les deux dashboards sont réutilisés sans leur
 * propre en-tête (showHero=false) sous un Hero unique.
 */
export function DAFDashboard({ user }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Hero
        icon={ShieldCheck}
        eyebrow="DAF · Directeur Administratif & Financier"
        title={`${user.prenom} ${user.nom}`}
        subtitle="Vue combinée : pilotage administratif + supervision des caisses"
        gradient="from-[#0A1628] via-[#0F4C81] to-[#047857]"
        action={
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            DAF
          </span>
        }
      />

      <SectionTitle icon={ShieldCheck}>Pilotage administratif</SectionTitle>
      <AdminDashboard user={user} showHero={false} />

      <SectionTitle icon={Banknote}>Caisse &amp; décaissement</SectionTitle>
      <CaissierDashboard user={user} showHero={false} />
    </div>
  );
}

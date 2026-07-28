import { useState } from 'react';
import { ShieldCheck, Landmark, ChevronDown } from 'lucide-react';
import type { User } from '@/types/api';
import { cn } from '@/lib/utils';
import { Hero } from './_shared';
import { AdminDashboard } from './AdminDashboard';
import { FondCaissePanel } from './FondCaissePanel';

interface Props {
  user: User;
}

/**
 * Section repliable (accordéon) d'un volet du tableau de bord combiné DAF.
 * Le contenu n'est monté que lorsqu'elle est ouverte : les requêtes du volet
 * ne partent qu'à l'ouverture, ce qui allège aussi le premier rendu.
 */
function CollapsibleSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 pt-1 text-left"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#EFF6FF] text-[#0F4C81]">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-sm font-semibold text-[#0F172A]">{title}</h2>
        <div className="ml-2 h-px flex-1 bg-[rgba(15,76,129,0.1)]" />
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-[#64748B] transition-transform', open ? '' : '-rotate-90')}
        />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

/**
 * Tableau de bord DAF : une seule vue qui fusionne le pilotage Administrateur
 * et la supervision Caissier. Les volets sont des sections repliables (seul le
 * pilotage administratif est ouvert au départ) pour garder la page courte.
 */
export function DAFDashboard({ user }: Props) {
  return (
    <div className="flex flex-col gap-4">
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

      <CollapsibleSection icon={ShieldCheck} title="Pilotage administratif" defaultOpen>
        <AdminDashboard user={user} showHero={false} />
      </CollapsibleSection>

      <CollapsibleSection icon={Landmark} title="Fond de caisse">
        <FondCaissePanel />
      </CollapsibleSection>
    </div>
  );
}

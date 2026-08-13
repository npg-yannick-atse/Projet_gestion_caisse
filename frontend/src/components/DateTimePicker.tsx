import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Sélecteur de date ET d'heure.
 *
 * Le champ natif `datetime-local` n'ouvre qu'un calendrier : Chrome n'y met
 * aucun sélecteur d'heure, il faut cliquer les chiffres et taper. Une liste
 * déroulante d'heures règle l'accessibilité mais impose un pas fixe. Ici, la
 * date se prend dans un calendrier et l'heure au chiffre près, dans deux
 * colonnes — on choisit vraiment, sans clavier et sans arrondi.
 *
 * `value` et `onChange` parlent le format des champs HTML — `YYYY-MM-DDTHH:mm` —
 * pour rester interchangeable avec un `datetime-local`.
 */
const JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
const versValeur = (d: Date) =>
  `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}` +
  `T${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;

/** `YYYY-MM-DDTHH:mm` → Date locale. Valeur vide ou illisible → maintenant. */
function versDate(valeur: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valeur ?? '');
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export function DateTimePicker({
  value,
  onChange,
  id,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (valeur: string) => void;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  /**
   * Position ABSOLUE du panneau, calculée depuis le champ.
   *
   * Le panneau est rendu dans `document.body`, pas à côté du champ : `Panel`
   * porte `overflow-hidden` pour ses coins arrondis et découpait tout ce qui
   * dépassait de la carte — le calendrier se retrouvait tronqué en bas. Aucun
   * réglage de position n'y échappe tant qu'on reste à l'intérieur.
   *
   * On se recale aussi sur l'espace disponible : au-dessus du champ s'il manque
   * de place en dessous, aligné à droite s'il en manque à droite.
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const colonneHeures = useRef<HTMLDivElement>(null);
  const colonneMinutes = useRef<HTMLDivElement>(null);

  const courant = useMemo(() => versDate(value), [value]);
  const [moisAffiche, setMoisAffiche] = useState(
    () => new Date(courant.getFullYear(), courant.getMonth(), 1),
  );

  // Fermeture au clic extérieur et à Échap — un panneau flottant qui reste
  // ouvert derrière le reste du formulaire est plus gênant qu'utile.
  useEffect(() => {
    if (!ouvert) return;
    // Le panneau vit dans `document.body` : il faut le tester séparément du
    // champ, sinon chaque clic dedans refermerait le sélecteur.
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node;
      const dansChamp = conteneur.current?.contains(cible);
      const dansPanneau = panneau.current?.contains(cible);
      if (!dansChamp && !dansPanneau) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  // À l'ouverture, on amène l'heure choisie sous les yeux : sans ça, 22 h se
  // trouve tout en bas d'une colonne qui s'ouvre sur minuit.
  //
  // Le centrage est différé d'une frame : mesuré dans la foulée du rendu, les
  // colonnes n'ont pas encore leur hauteur définitive et le calcul tombe à
  // côté — c'est ce qui laissait les minutes à l'autre bout de la liste.
  useEffect(() => {
    if (!ouvert) return;
    setMoisAffiche(new Date(courant.getFullYear(), courant.getMonth(), 1));
    const id = requestAnimationFrame(() => {
      for (const col of [colonneHeures.current, colonneMinutes.current]) {
        const actif = col?.querySelector<HTMLElement>('[data-actif="1"]');
        if (!actif || !col) continue;
        const cible = actif.offsetTop - (col.clientHeight - actif.clientHeight) / 2;
        col.scrollTop = Math.max(0, Math.min(cible, col.scrollHeight - col.clientHeight));
      }
    });
    return () => cancelAnimationFrame(id);
    // Volontairement sur la seule ouverture : recentrer à chaque clic
    // ramènerait la colonne sous le doigt et empêcherait de faire défiler.
  }, [ouvert]);

  /**
   * Placement, mesuré APRÈS peinture pour connaître la taille réelle du
   * panneau — l'estimer en dur laissait les cas limites déborder.
   */
  useLayoutEffect(() => {
    if (!ouvert) return;
    const placer = () => {
      const champ = conteneur.current?.getBoundingClientRect();
      const boite = panneau.current?.getBoundingClientRect();
      if (!champ || !boite) return;
      const marge = 8;
      const enDessous = champ.bottom + marge;
      const top =
        enDessous + boite.height <= window.innerHeight - marge
          ? enDessous
          : Math.max(marge, champ.top - marge - boite.height);
      const left = Math.max(
        marge,
        Math.min(champ.left, window.innerWidth - boite.width - marge),
      );
      setPos({ top, left });
    };
    placer();
    // Le panneau étant en position fixe, il ne suit pas un défilement : on le
    // replace plutôt que de le laisser flotter loin de son champ.
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => {
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
    };
  }, [ouvert]);

  /** Cases du mois affiché, complétées à gauche pour démarrer un lundi. */
  const cases = useMemo(() => {
    const premier = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
    const nbJours = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0).getDate();
    // getDay() : 0 = dimanche. On veut lundi en tête.
    const decalage = (premier.getDay() + 6) % 7;
    return [
      ...Array.from({ length: decalage }, () => null),
      ...Array.from({ length: nbJours }, (_, i) => i + 1),
    ];
  }, [moisAffiche]);

  const poser = (modif: (d: Date) => void) => {
    const suivant = new Date(courant);
    modif(suivant);
    onChange(versValeur(suivant));
  };

  const aujourdhui = new Date();
  const memeJour = (a: Date, jour: number) =>
    a.getFullYear() === moisAffiche.getFullYear() &&
    a.getMonth() === moisAffiche.getMonth() &&
    a.getDate() === jour;

  const libelle = value
    ? `${deuxChiffres(courant.getDate())}/${deuxChiffres(courant.getMonth() + 1)}/${courant.getFullYear()} à ${deuxChiffres(courant.getHours())}:${deuxChiffres(courant.getMinutes())}`
    : 'Choisir…';

  const caseHeure = (actif: boolean) =>
    `cursor-pointer rounded-[6px] px-2 py-1 text-center text-xs tabular-nums transition ${
      actif ? 'bg-[#0F4C81] font-semibold text-white' : 'text-[#475569] hover:bg-[#EFF6FF]'
    }`;

  return (
    <div ref={conteneur} className="relative">
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className={
          className ??
          'flex h-10 w-full items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition hover:border-[#1A6DB5] focus:border-[#1A6DB5]'
        }
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[#64748B]" />
        <span className={value ? '' : 'text-[#94A3B8]'}>{libelle}</span>
      </button>

      {ouvert &&
        createPortal(
          <div
            ref={panneau}
            role="dialog"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              // Tant que la position n'est pas mesurée, on rend invisible plutôt
              // que d'afficher un panneau qui saute du coin vers sa place.
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[100] flex gap-3 rounded-[12px] border border-[rgba(15,76,129,0.12)] bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
          >
          {/* ---- Calendrier ---- */}
          <div className="w-[15rem]">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() =>
                  setMoisAffiche((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-[#0F172A]">
                {MOIS[moisAffiche.getMonth()]} {moisAffiche.getFullYear()}
              </span>
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() =>
                  setMoisAffiche((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {JOURS.map((j) => (
                <span key={j} className="py-1 text-[10px] font-semibold text-[#94A3B8]">
                  {j}
                </span>
              ))}
              {cases.map((jour, i) =>
                jour === null ? (
                  <span key={`v${i}`} />
                ) : (
                  <button
                    key={jour}
                    type="button"
                    onClick={() =>
                      poser((d) => {
                        d.setFullYear(moisAffiche.getFullYear(), moisAffiche.getMonth(), jour);
                      })
                    }
                    className={`rounded-[7px] py-1 text-xs tabular-nums transition ${
                      memeJour(courant, jour)
                        ? 'bg-[#0F4C81] font-semibold text-white'
                        : memeJour(aujourdhui, jour)
                          ? 'font-semibold text-[#0F4C81] hover:bg-[#EFF6FF]'
                          : 'text-[#334155] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {jour}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* ---- Heures et minutes, au chiffre près ---- */}
          <div className="flex gap-1 border-l border-[rgba(15,76,129,0.08)] pl-3">
            <div>
              <p className="mb-1 text-center text-[10px] font-semibold text-[#94A3B8]">H</p>
              <div ref={colonneHeures} className="h-[11rem] w-12 overflow-y-auto">
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    role="button"
                    tabIndex={0}
                    data-actif={courant.getHours() === h ? '1' : '0'}
                    onClick={() => poser((d) => d.setHours(h))}
                    onKeyDown={(e) => e.key === 'Enter' && poser((d) => d.setHours(h))}
                    className={caseHeure(courant.getHours() === h)}
                  >
                    {deuxChiffres(h)}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-center text-[10px] font-semibold text-[#94A3B8]">Min</p>
              <div ref={colonneMinutes} className="h-[11rem] w-12 overflow-y-auto">
                {Array.from({ length: 60 }, (_, m) => (
                  <div
                    key={m}
                    role="button"
                    tabIndex={0}
                    data-actif={courant.getMinutes() === m ? '1' : '0'}
                    onClick={() => poser((d) => d.setMinutes(m))}
                    onKeyDown={(e) => e.key === 'Enter' && poser((d) => d.setMinutes(m))}
                    className={caseHeure(courant.getMinutes() === m)}
                  >
                    {deuxChiffres(m)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

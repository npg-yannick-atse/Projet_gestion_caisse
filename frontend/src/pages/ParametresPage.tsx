import { useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { useParametres, useUpdateParametre } from '@/api/parametres';
import { apiErrorMessage } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';

/** Une ligne éditable de paramètre. */
function ParamRow({ cle, libelle, valeur }: { cle: string; libelle?: string | null; valeur?: string | null }) {
  const update = useUpdateParametre();
  const [val, setVal] = useState(valeur ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVal(valeur ?? '');
  }, [valeur]);

  const dirty = val !== (valeur ?? '');

  const submit = () => {
    setSaved(false);
    update.mutate({ cle, valeur: val }, { onSuccess: () => setSaved(true) });
  };

  return (
    <tr className="border-t border-[rgba(15,76,129,0.07)]">
      <td className="px-4 py-3">
        <div className="text-sm text-[#0F172A]">{libelle ?? cle}</div>
        <div className="font-mono text-[10px] text-[#94A3B8]">{cle}</div>
      </td>
      <td className="px-4 py-3">
        <input
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setSaved(false);
          }}
          className="h-9 w-40 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </button>
        {saved && !dirty && <span className="ml-2 text-[11px] font-medium text-[#16A34A]">Enregistré</span>}
        {update.isError && (
          <span className="ml-2 text-[11px] text-destructive">{apiErrorMessage(update.error, 'Échec')}</span>
        )}
      </td>
    </tr>
  );
}

export function ParametresPage() {
  const { data: params, isLoading, isError } = useParametres();

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Paramètres">
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Réglages globaux
          </span>
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les paramètres.</div>}

        {params && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Paramètre</th>
                <th className="px-4 py-2.5 font-semibold">Valeur</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {params.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun paramètre.
                  </td>
                </tr>
              )}
              {params.map((p) => (
                <ParamRow key={p.cle} cle={p.cle} libelle={p.libelle} valeur={p.valeur} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <p className="px-1 text-[11px] text-[#94A3B8]">
        Ex. : <strong>AVANCE_JOUR_MIN</strong> = jour du mois à partir duquel une avance est possible ·{' '}
        <strong>AVANCE_POURCENTAGE_MAX</strong> = part maximale du salaire pour une avance.
      </p>
    </div>
  );
}

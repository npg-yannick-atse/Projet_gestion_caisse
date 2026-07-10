/**
 * Indicateur de limite de caractères pour les champs de commentaire/motif.
 * À placer juste sous le champ, avec le même `max` que le `maxLength` du champ.
 */
export function CharCounter({ value, max }: { value?: string | null; max: number }) {
  return (
    <div className="mt-1 text-right text-[10px] text-[#94A3B8]">
      {(value?.length ?? 0)}/{max}
    </div>
  );
}

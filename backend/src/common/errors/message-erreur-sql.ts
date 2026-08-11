/**
 * Traduction des erreurs de base en messages destinés à l'utilisateur.
 *
 * Le filtre d'exceptions renvoyait `exception.message` tel quel : le texte brut
 * du pilote SQL partait à l'écran. Deux problèmes.
 *
 * D'abord l'illisibilité — la testeuse a reçu, le 10/08/2026 :
 *
 *   « The incoming tabular data stream (TDS) remote procedure call (RPC)
 *     protocol stream is incorrect. Parameter 3 ("@0"): The supplied value is
 *     not a valid instance of data type decimal. »
 *
 * Ensuite la divulgation : noms de tables, de colonnes et de contraintes se
 * retrouvaient exposés à quiconque déclenche une erreur.
 *
 * Le détail complet reste côté serveur (journal applicatif + error-*.jsonl) :
 * on ne perd rien pour le diagnostic, on cesse seulement de l'afficher.
 */

/** Message utilisateur pour une erreur de base, à partir de son texte brut. */
export function messageErreurSql(brut: string): string {
  const m = (brut || '').toLowerCase();

  if (m.includes('unique key') || m.includes('duplicate key') || m.includes('unique index')) {
    return "Cette valeur est déjà utilisée. Notez qu'un élément supprimé peut encore en réserver le code.";
  }
  if (m.includes('data type decimal') || m.includes('arithmetic overflow') || m.includes('out of range')) {
    return 'Le montant saisi dépasse la capacité du champ.';
  }
  if (m.includes('foreign key') || m.includes('reference constraint')) {
    return "L'élément référencé n'existe pas, ou il est encore utilisé ailleurs.";
  }
  if (m.includes('cannot insert the value null') || m.includes('null value')) {
    return 'Un champ obligatoire est vide.';
  }
  if (m.includes('string or binary data would be truncated') || m.includes('truncated')) {
    return 'Une valeur saisie est trop longue.';
  }
  if (m.includes('conversion failed') || m.includes('could not be validated')) {
    return "Une valeur saisie n'a pas le format attendu.";
  }
  return "L'opération a échoué. Si le problème persiste, contactez l'administrateur.";
}

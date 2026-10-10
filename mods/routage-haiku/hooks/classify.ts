// Tri des demandes : true = demande simple, envoyée à Haiku.
// « corrige » seul ne suffit pas : il faut qu'il s'agisse d'une faute de texte.
const TEXTE = /\b(faute|fautes|orthographe|typo|typos|coquille)\b/i
const SIMPLE =
  /\b(renomme[rz]?|rename|reformule[rz]?|reformulation|r[ée]sume[rz]?|r[ée]sum[ée])\b/i

// Mots qui signalent une demande plus lourde : on reste sur le modèle principal.
const LOURD =
  /\b(bug|plante|crash|erreur|marche pas|fonctionne pas|architecture|refactor|impl[ée]mente|construis|cr[ée]e|ajoute|propose|d[ée]bogue|debug|tests?|migration|s[ée]curit[ée]|pourquoi)\b/i

export const MAX_CHARS = 300

export function isSimple(text: string): boolean {
  const t = text.trim()
  if (t === '' || t.length > MAX_CHARS) return false
  if (t.includes('```')) return false
  return (TEXTE.test(t) || SIMPLE.test(t)) && !LOURD.test(t)
}

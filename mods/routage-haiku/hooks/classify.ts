// Tri des demandes : true = demande simple, envoyée à Haiku.
const SIMPLE =
  /\b(corrige[rz]?|correction|faute|fautes|orthographe|typo|renomme[rz]?|rename|reformule[rz]?|reformulation|r[ée]sume[rz]?|r[ée]sum[ée])\b/i

// Mots qui signalent une demande plus lourde : on reste sur le modèle principal.
const LOURD =
  /\b(bug|erreur de compilation|architecture|refactor|impl[ée]mente|construis|cr[ée]e un|d[ée]bogue|debug|tests?|migration|s[ée]curit[ée]|pourquoi)\b/i

export const MAX_CHARS = 300

export function isSimple(text: string): boolean {
  const t = text.trim()
  if (t === '' || t.length > MAX_CHARS) return false
  if (t.includes('```')) return false
  return SIMPLE.test(t) && !LOURD.test(t)
}

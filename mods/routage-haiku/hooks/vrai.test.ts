import { expect, test } from 'claude-code/testing'
import { isSimple } from './classify.ts'
const cas: [string, boolean][] = [
  ['corrige les fautes de ce paragraphe', true],
  ['renomme la fonction getData en chargerDonnees', true],
  ['résume ce fichier', true],
  ['reformule mon titre de landing', true],
  ['corrige la typo dans index.html', true],
  ['corrige mon code, ça plante au chargement', false],
  ['corrige le CSS du header sur iPhone', false],
  ['crée un mod qui affiche la météo', false],
  ['ajoute un bouton de paiement Lemon Squeezy', false],
  ['résume le README et propose une nouvelle architecture', false],
  ['corrige la faute', true],
  ['Corrigé ?', false],
]
for (const [t, attendu] of cas) test(`${attendu ? 'Haiku' : 'principal'} : ${t}`, () => { expect(isSimple(t)).toBe(attendu) })

import { expect, test } from 'claude-code/testing'

import { isSimple } from './classify.ts'

test('demandes simples vers Haiku', () => {
  expect(isSimple('corrige la faute dans le README')).toBe(true)
  expect(isSimple('renomme la variable tmp en total')).toBe(true)
  expect(isSimple('reformule cette phrase : il faut que on fasse')).toBe(true)
  expect(isSimple('résume le fichier notes.md')).toBe(true)
})

test('le reste sur le modèle principal', () => {
  expect(isSimple('construis une API REST avec authentification')).toBe(false)
  expect(isSimple('corrige le bug de connexion')).toBe(false)
  expect(isSimple('')).toBe(false)
  expect(isSimple('corrige ' + 'x'.repeat(400))).toBe(false)
})

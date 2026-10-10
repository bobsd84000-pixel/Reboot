import type { Register } from 'claude-code'

import { isSimple } from './classify.ts'

const HAIKU = 'claude-haiku-5-5'

function nomCourt(model: string): string {
  if (/haiku/i.test(model)) return 'Haiku'
  if (/sonnet/i.test(model)) return 'Sonnet'
  if (/opus/i.test(model)) return 'Opus'
  if (/fable/i.test(model)) return 'Fable'
  return model
}

export const register: Register = on => {
  // Tours (turnId) envoyés vers Haiku.
  const versHaiku = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'routage',
      description: 'Routage Haiku : /routage on | off (affichage du modèle)',
      argumentHint: 'on | off',
    })
    return next(e)
  })

  on('command.run', { command: 'routage' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('affichage', arg === 'on')
      return { text: `Affichage du modèle : ${arg}` }
    }
    const affichage = (await $.store.get('affichage')) !== false
    return { text: `Affichage du modèle : ${affichage ? 'on' : 'off'}. Usage : /routage on | off` }
  })

  on('turn.start', ($, e, next) => {
    if (isSimple(e.text)) versHaiku.add(e.turnId)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && versHaiku.has(e.turnId)) {
      return yield* next({ ...e, model: HAIKU, effort: undefined })
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const routed = versHaiku.delete(e.turnId)
    const model = e.usage?.model ?? (routed ? HAIKU : await $.session.model())
    const affichage = (await $.store.get('affichage')) !== false

    if (affichage) {
      $.ui.status(`Modèle : ${nomCourt(model)}`)
      await $.session
        .append({
          message: {
            type: 'system',
            content: [{ type: 'text', text: `↳ Répondu par ${nomCourt(model)} (${model})${routed ? ' — demande simple' : ''}` }],
          },
        })
        .catch(() => undefined)
    } else {
      $.ui.status(undefined)
    }
    return result
  })
}

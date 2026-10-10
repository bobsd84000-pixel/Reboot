import type { EngineInterface, Register } from 'claude-code'

type Role = 'plan' | 'build'
type Annuaire = { plan?: string; build?: string }

const PLUGIN = 'relais-sessions'

// Annuaire partagé entre les sessions de la machine : rôle -> id de session.
async function cheminAnnuaire($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '.'
  return `${home}/.claude/relais-sessions.json`
}

async function lire($: EngineInterface): Promise<Annuaire> {
  const path = await cheminAnnuaire($)
  try {
    return JSON.parse(await $.fs.read(path)) as Annuaire
  } catch {
    return {}
  }
}

async function monRole($: EngineInterface): Promise<Role | undefined> {
  const id = await $.session.id()
  const a = await lire($)
  if (a.plan === id) return 'plan'
  if (a.build === id) return 'build'
  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'role',
      description: 'Relais : donne un rôle à cette session (plan ou build)',
      argumentHint: 'plan | build',
    })
    await $.tool.register({
      name: 'envoyer_au_build',
      description:
        "Envoie une tâche à la session « build » (relais-sessions). À utiliser dans la session « plan » quand l'utilisateur veut confier une tâche au build.",
      inputSchema: {
        type: 'object',
        properties: {
          tache: { type: 'string', description: 'La tâche à faire, claire et complète' },
          fichiers: { type: 'array', items: { type: 'string' }, description: 'Fichiers concernés' },
          attendu: { type: 'string', description: 'Ce qui est attendu à la fin (critères de fin)' },
        },
        required: ['tache', 'attendu'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'rapport_au_plan',
      description:
        'Renvoie le compte rendu à la session « plan » (relais-sessions). À utiliser dans la session « build » quand la tâche reçue est terminée.',
      inputSchema: {
        type: 'object',
        properties: {
          resume: { type: 'string', description: 'Ce qui a été fait' },
          fichiers_modifies: { type: 'array', items: { type: 'string' } },
          reste_a_faire: { type: 'string', description: 'Problèmes ou points restants, vide si rien' },
        },
        required: ['resume'],
      },
      isDeferred: false,
    })
    const role = await monRole($)
    if (role) $.ui.status(`Relais : ${role}`)
    return next(e)
  })

  on('command.run', { command: 'role' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== 'plan' && arg !== 'build') {
      const role = await monRole($)
      return { text: `Rôle actuel : ${role ?? 'aucun'}. Usage : /role plan ou /role build` }
    }
    const a = await lire($)
    const id = await $.session.id()
    if (a.plan === id) delete a.plan
    if (a.build === id) delete a.build
    a[arg] = id
    await $.fs.write(await cheminAnnuaire($), JSON.stringify(a, null, 2))
    $.ui.status(`Relais : ${arg}`)
    return {
      text: `Cette session est maintenant « ${arg} ».`,
      context: [
        arg === 'plan'
          ? "Tu es la session « plan » du relais. Pour confier une tâche à la session « build », appelle l'outil envoyer_au_build."
          : "Tu es la session « build » du relais. Tu recevras des tâches de la session « plan ». Une fois une tâche finie, appelle l'outil rapport_au_plan.",
      ],
    }
  })

  on('tool.call', { tool: "mcp__relais-sessions__envoyer_au_build" }, async ($, e) => {
    const input = e as unknown as { tache: string; fichiers?: string[]; attendu: string }
    const a = await lire($)
    if (!a.build) {
      return { deny: "Aucune session « build ». Lance /role build dans l'autre session." }
    }
    const fichiers = input.fichiers?.length ? input.fichiers.map(f => `- ${f}`).join('\n') : '- (aucun précisé)'
    const text = [
      '📨 Tâche envoyée par la session « plan » :',
      '',
      `## Tâche\n${input.tache}`,
      `## Fichiers\n${fichiers}`,
      `## Attendu\n${input.attendu}`,
      '',
      "Fais cette tâche. Quand c'est fini, appelle l'outil rapport_au_plan avec un compte rendu.",
    ].join('\n')
    const sent = await $.session.send({ to: { sessionId: a.build }, text })
    if (!sent.isDelivered) return { deny: `Envoi impossible : ${sent.reason}` }
    $.ui.toast('Tâche envoyée au build')
    return { result: 'Tâche envoyée à la session « build ».' }
  })

  on('tool.call', { tool: "mcp__relais-sessions__rapport_au_plan" }, async ($, e) => {
    const input = e as unknown as { resume: string; fichiers_modifies?: string[]; reste_a_faire?: string }
    const a = await lire($)
    if (!a.plan) {
      return { deny: "Aucune session « plan ». Lance /role plan dans l'autre session." }
    }
    const fichiers = input.fichiers_modifies?.length
      ? input.fichiers_modifies.map(f => `- ${f}`).join('\n')
      : '- (aucun)'
    const text = [
      '✅ Compte rendu de la session « build » :',
      '',
      `## Fait\n${input.resume}`,
      `## Fichiers modifiés\n${fichiers}`,
      `## Reste à faire\n${input.reste_a_faire?.trim() || 'Rien.'}`,
    ].join('\n')
    const sent = await $.session.send({ to: { sessionId: a.plan }, text })
    if (!sent.isDelivered) return { deny: `Envoi impossible : ${sent.reason}` }
    $.ui.toast('Compte rendu envoyé au plan')
    return { result: 'Compte rendu envoyé à la session « plan ».' }
  })

  on('session.receive', async ($, e, next) => {
    if ('plugin' in e.origin && e.origin.plugin === PLUGIN) {
      $.ui.toast(e.text.startsWith('✅') ? 'Compte rendu reçu du build' : 'Tâche reçue du plan')
    }
    return next(e)
  })
}

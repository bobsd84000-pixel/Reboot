import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentLigne, Notes } from '../types'

const PANE = 'tableau-de-bord'
const TITRE = 'Tableau de bord'
const PERIODE_MS = 5000

const agents = atom({ plugin: 'tableau-de-bord', key: 'agents' } as const, [])
const taches = atom({ plugin: 'tableau-de-bord', key: 'taches' } as const, 0)
const notes = atom({ plugin: 'tableau-de-bord', key: 'notes' } as const, null)
const maj = atom({ plugin: 'tableau-de-bord', key: 'maj' } as const, 0)

const EN_COURS = new Set(['pending', 'running', 'waiting'])

function jour(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function debutDuJour(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

async function tachesDuJour($: EngineInterface): Promise<number> {
  const today = jour(await $.clock.now())
  const saved = (await $.store.get('jour')) as { date: string; n: number } | undefined
  return saved?.date === today ? saved.n : 0
}

async function compterNotes($: EngineInterface, dir: string, depuis: number, profondeur = 0): Promise<{ aujourdhui: number; total: number }> {
  let aujourdhui = 0
  let total = 0
  for (const entry of await $.fs.list(dir)) {
    if (entry.name.startsWith('.')) continue
    if (entry.kind === 'dir' && profondeur < 3) {
      const sous = await compterNotes($, `${dir}/${entry.name}`, depuis, profondeur + 1)
      aujourdhui += sous.aujourdhui
      total += sous.total
    } else if (entry.kind === 'file') {
      total += 1
      if (entry.mtimeMs >= depuis) aujourdhui += 1
    }
  }
  return { aujourdhui, total }
}

async function rafraichir($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  const liste = await $.agent.list().catch(() => [])
  const lignes: AgentLigne[] = liste
    .filter(a => EN_COURS.has(a.status))
    .map(a => ({ id: a.id, description: a.description, type: a.type, status: a.status }))
  await update($, agents, () => lignes)

  const home = (await $.env.get('HOME')) ?? '.'
  const n: Notes = await compterNotes($, `${home}/notes`, debutDuJour(now)).catch(() => null)
  await update($, notes, () => n)

  const nb = await tachesDuJour($)
  await update($, taches, () => nb)
  await update($, maj, () => now)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tableau',
      description: 'Ouvre le tableau de bord (agents, tâches du jour, notes)',
    })
    await rafraichir($)
    $.clock.every(PERIODE_MS, () => void rafraichir($))
    void $.ui.open({ id: PANE, title: TITRE })
    return next(e)
  })

  on('command.run', { command: 'tableau' }, async $ => {
    await rafraichir($)
    await $.ui.open({ id: PANE, title: TITRE })
    return { text: 'Tableau de bord ouvert.' }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'answer') {
      const today = jour(await $.clock.now())
      const n = (await tachesDuJour($)) + 1
      await $.store.set('jour', { date: today, n })
      await update($, taches, () => n)
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const listeAgents = await read($, agents)
    const nbTaches = await read($, taches)
    const n = await read($, notes)
    const heure = await read($, maj)
    const h = heure ? new Date(heure) : null
    const hh = h ? `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}:${String(h.getSeconds()).padStart(2, '0')}` : '…'

    return (
      <Box flexDirection="column">
        <Text bold>Agents en cours ({listeAgents.length})</Text>
        {listeAgents.length === 0 && <Text dimColor>  Aucun agent actif.</Text>}
        {listeAgents.slice(0, 8).map(a => (
          <Text>
            {'  '}• {a.description || a.type} <Text dimColor>({a.status})</Text>
          </Text>
        ))}
        <Text> </Text>
        <Text bold>Tâches terminées aujourd'hui : {nbTaches}</Text>
        <Text> </Text>
        <Text bold>Notes ~/notes</Text>
        {n === null ? (
          <Text dimColor>  Dossier ~/notes introuvable.</Text>
        ) : (
          <Text>
            {'  '}+{n.aujourdhui} aujourd'hui <Text dimColor>(total {n.total})</Text>
          </Text>
        )}
        <Text> </Text>
        <Text dimColor>Mis à jour à {hh}</Text>
      </Box>
    )
  })
}

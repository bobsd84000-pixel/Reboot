import { expect, mock, test } from 'claude-code/testing'

test('/tableau compte les notes et les agents en cours', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const ecrit: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    ecrit[e.key] = e.value
    return next(e)
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: '/home/test' }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', description: 'Analyse du réseau', type: 'Explore', status: 'running' },
      { id: 'a2', description: 'Vieux', type: 'Explore', status: 'completed' },
    ],
  }))
  on('fs.list', () => ({
    value: [
      { name: 'ancienne.md', kind: 'file', size: 10, mtimeMs: -1, isLink: false },
      { name: 'note1.md', kind: 'file', size: 10, mtimeMs: 8.64e15, isLink: false },
    ],
  }))
  const ran = await $.command.run({ command: 'tableau', args: '' } as never)
  expect(ran.text).toBe('Tableau de bord ouvert.')
  expect((ecrit.agents as unknown[]).length).toBe(1)
  expect(ecrit.notes).toEqual({ aujourdhui: 1, total: 2 })
  expect(ecrit.taches).toBe(0)
})

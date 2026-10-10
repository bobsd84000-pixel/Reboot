import { expect, test } from 'claude-code/testing'

test('/role sans argument donne l’usage', async ($, on) => {
  on('session.id', () => ({ value: 'session-test' }))
  on('env.get', () => ({ value: '/home/test' }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  const ran = await $.command.run({ command: 'role', args: '' } as never)
  expect(ran.text ?? '').toContain('Usage : /role plan ou /role build')
})

test('envoi au build refusé sans session build', async ($, on) => {
  on('env.get', () => ({ value: '/home/test' }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  const ran = await $.tool.call({
    tool: 'mcp__relais-sessions__envoyer_au_build',
    tache: 'x',
    attendu: 'y',
  } as never)
  expect(JSON.stringify(ran)).toContain('Aucune session « build »')
})

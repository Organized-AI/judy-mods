import { expect, test } from 'claude-code/testing'

// A board as Judy's /api/hq serves it, and the guide's status: two teams, one with a failed audit.
const HQ = {
  updated_at: '2026-10-17T03:00:00Z',
  counts: { audits_running: 0, trials_running: 1 },
  teams: [
    { key: 'ana/fair-judge', team: 'fair-judge', trial: { score: 81.2, ruling: 'CONFIRMED' }, audit: { status: 'done', score: 74.5, standing: 'Sound' } },
    { key: 'sam/steady-judge', team: 'steady-judge', trial: { running: true }, audit: { status: 'error', error: 'Insufficient unified billing balance' } },
  ],
}
const STATUS = { judy: { live_evals: { gates: '13/13' } }, mlflow: { configured: true, up: true } }

const PANE = {
  plugin: 'judy-board',
  component: 'Pane',
  requestId: 'judy-board',
  props: { title: "Judy's Live Board", isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

function engine(on: any, statuses: string[], opened: string[]) {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('clock.now', () => ({ value: 1_760_000_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', (_: unknown, e: { text?: string }) => { statuses.push(String(e.text)); return { value: undefined } })
  on('ui.toast', () => ({ value: {} }))
  on('ui.open', (_: unknown, e: { id: string }) => { opened.push(e.id); return { value: { isPlaced: true } } })
  on('http.fetch', (_: unknown, e: { url: string }) => {
    const body = e.url.endsWith('/api/hq') ? HQ : e.url.endsWith('/api/status') ? STATUS : null
    return { value: { status: body ? 200 : 404, ok: !!body, headers: {}, text: JSON.stringify(body ?? {}) } }
  })
}

test('the status line counts teams, eval gates and the range', async ($, on) => {
  const statuses: string[] = []
  engine(on, statuses, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(statuses.at(-1)).toBe('⚖ Judy · 2 teams · 1 running · evals 13/13 · range up')
})

test('/judy-board opens the pane, which ranks the teams and shows a failed audit', async ($, on) => {
  const opened: string[] = []
  engine(on, [], opened)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'judy-board', args: '' })
  expect(opened).toEqual(['judy-board'])
  expect(r.text).toContain('/hq')
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /fair-judge/ }))?.text).toContain('1. fair-judge')
    expect((await ui.find({ type: 'Text', text: /billing balance/ }))?.text).toContain('Insufficient unified billing balance')
    await ui.unmount()
  }
})

test("/judy-team gives one team's card", async ($, on) => {
  engine(on, [], [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'judy-team', args: 'https://github.com/ana/fair-judge' })
  expect(r.text).toContain('CONFIRMED, 81.2')
  expect(r.text).toContain('74.5, Sound')
  const miss = await $.command.run({ command: 'judy-team', args: 'nobody/nothing' })
  expect(miss.text).toContain("isn't on the board")
})

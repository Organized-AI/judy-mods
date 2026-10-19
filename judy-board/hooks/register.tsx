// Judy the Judge's Live Board, beside the chat: the standings from /api/hq, refreshed every minute, a status line
// (teams, last night's eval gates, the MLflow range), and a toast when a team files or a verdict lands.
// /judy-board opens the pane; /judy-team <owner/repo> puts one team's card in the chat.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, TeamRow } from '../types'

const JUDY = 'https://judy-the-judge.jordan-691.workers.dev'
const BOARD_URL = `${JUDY}/hq`
const GUIDE_STATUS = 'https://hack.organizedai.vip/judy/api/status'
const PANE = 'judy-board'
const EVERY_MS = 60_000
const board = atom({ plugin: 'judy-board', key: 'board' } as const, null)

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1))

function rowOf(t: any): TeamRow {
  const a = t?.audit ?? {}
  const tr = t?.trial ?? {}
  const status = String(a.status ?? '')
  const audit: TeamRow['audit'] =
    status === 'error' ? 'error' : num(a.score) !== null ? 'done' : a.live || status === 'running' ? 'running' : status ? 'queued' : 'none'
  return {
    key: String(t?.key ?? `${t?.owner}/${t?.repo}`),
    team: String(t?.team ?? t?.repo ?? t?.key ?? '?'),
    trial: num(tr.score),
    ruling: tr.ruling ?? null,
    trialRunning: !!tr.running,
    practice: num(a.score),
    standing: a.standing ?? null,
    audit,
    auditError: audit === 'error' ? String(a.error ?? 'the audit failed').slice(0, 160) : null,
    delta: num(a.delta),
  }
}

// Ranked as the board's default: trial score, then practice, then name.
const rank = (rows: TeamRow[]) =>
  [...rows].sort((x, y) => (y.trial ?? -1) - (x.trial ?? -1) || (y.practice ?? -1) - (x.practice ?? -1) || x.team.localeCompare(y.team))

async function fetchBoard($: EngineInterface, previous: Board | null): Promise<Board> {
  const now = await $.clock.now()
  try {
    const hq = await $.http.fetch(`${JUDY}/api/hq`, { headers: { accept: 'application/json' } })
    if (!hq.ok) throw new Error(`Judy answered HTTP ${hq.status}`)
    const d = JSON.parse(hq.text)
    let evals: string | null = previous?.evals ?? null
    let range: boolean | null = previous?.range ?? null
    try {
      const s = await $.http.fetch(GUIDE_STATUS, { headers: { accept: 'application/json' } })
      if (s.ok) {
        const j = JSON.parse(s.text)
        evals = j?.judy?.live_evals?.gates ?? null
        range = j?.mlflow?.configured ? !!j.mlflow.up : null
      }
    } catch {
      // The guide's status is a nicety; the board still draws without it.
    }
    return {
      fetchedAt: now,
      updatedAt: d?.updated_at ?? null,
      teams: rank((d?.teams ?? []).map(rowOf)),
      running: { audits: Number(d?.counts?.audits_running ?? 0), trials: Number(d?.counts?.trials_running ?? 0) },
      evals,
      range,
      error: null,
    }
  } catch (err) {
    return { ...(previous ?? { updatedAt: null, teams: [], running: { audits: 0, trials: 0 }, evals: null, range: null }), fetchedAt: now, error: String(err).slice(0, 160) }
  }
}

/** What changed between two reads, as toasts: a new team, a trial ruling, a finished or failed audit. */
function news(before: Board | null, after: Board): string[] {
  if (!before || before.error) return []
  const old = new Map(before.teams.map(t => [t.key, t]))
  const out: string[] = []
  for (const t of after.teams) {
    const was = old.get(t.key)
    if (!was) out.push(`⚖ New on the board: ${t.team}`)
    else {
      if (t.ruling && t.ruling !== was.ruling) out.push(`⚖ ${t.team}: trial ${t.ruling} (${fmt(t.trial)})`)
      if (t.audit === 'done' && was.audit !== 'done') out.push(`⚖ ${t.team}: practice ${fmt(t.practice)}${t.standing ? `, ${t.standing}` : ''}`)
      if (t.audit === 'error' && was.audit !== 'error') out.push(`⚖ ${t.team}: audit failed`)
    }
  }
  return out
}

function statusLine(b: Board): string {
  if (b.error) return '⚖ Judy unreachable'
  const busy = b.running.audits + b.running.trials
  return [
    `⚖ Judy · ${b.teams.length} team${b.teams.length === 1 ? '' : 's'}`,
    busy ? `${busy} running` : null,
    b.evals ? `evals ${b.evals}` : null,
    b.range === null ? null : `range ${b.range ? 'up' : 'down'}`,
  ].filter(Boolean).join(' · ')
}

async function refresh($: EngineInterface, toast: boolean) {
  const before = await read($, board)
  const after = await fetchBoard($, before)
  await update($, board, () => after)
  $.ui.status(statusLine(after))
  if (toast) for (const line of news(before, after).slice(0, 3)) $.ui.toast(line)
}

function card(t: TeamRow): string {
  return [
    `**${t.team}** (${t.key}) on Judy's Live Board: ${BOARD_URL}`,
    `- Trial: ${t.trialRunning ? 'running' : t.ruling ? `${t.ruling}, ${fmt(t.trial)}` : 'not yet'}`,
    `- Practice: ${t.audit === 'done' ? `${fmt(t.practice)}${t.standing ? `, ${t.standing}` : ''}${t.delta ? ` (${t.delta > 0 ? '+' : ''}${t.delta.toFixed(1)} since last audit)` : ''}` : t.audit === 'error' ? `failed: ${t.auditError}` : t.audit}`,
    `- Team card: ${JUDY}/api/teams/${t.key}`,
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'judy-board', description: "Open Judy's Live Board in a pane" })
    await $.command.register({ name: 'judy-team', description: "Show one team's verdicts: /judy-team owner/repo" })
    await refresh($, false)
    $.clock.every(EVERY_MS, () => refresh($, true))
    return next(e)
  })

  on('command.run', { command: 'judy-board' }, async $ => {
    await refresh($, false)
    await $.ui.open({ id: PANE, title: "Judy's Live Board" })
    return { text: `Live Board opened. On the web: ${BOARD_URL}` }
  })

  on('command.run', { command: 'judy-team' }, async ($, e) => {
    const want = e.args.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '').toLowerCase()
    await refresh($, false)
    const b = await read($, board)
    if (!b || b.error) return { text: `Judy isn't answering right now${b?.error ? ` (${b.error})` : ''}.` }
    if (!want) return { text: `Teams on the board: ${b.teams.map(t => t.key).join(', ') || 'none yet'}. Use /judy-team owner/repo.` }
    const t = b.teams.find(x => x.key.toLowerCase() === want || x.team.toLowerCase() === want)
    return { text: t ? card(t) : `${want} isn't on the board. Teams: ${b.teams.map(x => x.key).join(', ') || 'none yet'}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 8)
    if (!b) return <Text dimColor>Reading the board…</Text>
    return (
      <Box flexDirection="column">
        <Text bold>Gavel &amp; Gown · Live Board</Text>
        <Text dimColor>{statusLine(b)}</Text>
        {b.error && <Text color="red">{b.error}</Text>}
        <Box flexDirection="column" marginTop={1}>
          {b.teams.length === 0 && <Text dimColor>No teams yet.</Text>}
          {b.teams.slice(0, room).map((t, i) => (
            <Box key={t.key} flexDirection="column">
              <Text>
                {String(i + 1).padStart(2, ' ')}. <Text bold>{t.team}</Text>
              </Text>
              <Text dimColor>
                {'    '}trial {t.trialRunning ? 'running' : t.ruling ? `${t.ruling} ${fmt(t.trial)}` : '—'} · practice{' '}
                {t.audit === 'done' ? `${fmt(t.practice)}${t.standing ? ` ${t.standing}` : ''}` : t.audit}
              </Text>
              {t.auditError && <Text color="red">{'    '}{t.auditError}</Text>}
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Button key="refresh" onPress={() => refresh($, true)}>Refresh</Button>
        </Box>
        <Text dimColor>{BOARD_URL}</Text>
      </Box>
    )
  })
}

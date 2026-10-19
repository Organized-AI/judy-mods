/** One team on the Live Board, as the pane draws it. */
export type TeamRow = {
  key: string
  team: string
  trial: number | null
  ruling: string | null
  trialRunning: boolean
  practice: number | null
  standing: string | null
  audit: 'done' | 'running' | 'queued' | 'error' | 'none'
  auditError: string | null
  delta: number | null
}

/** The last read of Judy's /api/hq, plus the nightly eval gates and whether the MLflow range is up. */
export type Board = {
  fetchedAt: number
  updatedAt: string | null
  teams: TeamRow[]
  running: { audits: number; trials: number }
  evals: string | null
  range: boolean | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'judy-board': { board: Board | null }
  }
}

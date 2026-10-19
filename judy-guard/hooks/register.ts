// The project rules of Judy the Judge (Gavel & Gown, Organized AI), enforced on every tool call instead of remembered:
//
//   1. The court code never goes into a file, a commit or a log. It is read once per session from JUDY_EVENT_CODE, or
//      on a Mac from the Keychain item JUDY_EVENT_CODE, and kept in memory only.
//   2. A Keychain secret is never printed into the transcript: `security find-generic-password … -w` must be piped
//      into something or captured with $(…), and the secret files (~/.config/judy/*, .dev.vars) are never cat'ed.
//   3. Judy deploys with `npm run deploy` (typecheck, tests, the eval gate, D1 migrations, then wrangler), never a
//      bare `wrangler deploy` from judy-the-judge.
//   4. Jev goes through jev-gateway only: no call to api.typesafe.ai, no TYPESAFE_API_KEY, no `typesafe/jev` or
//      `typesafe:/` model outside the jev-gateway repo.
//
// A refused call reaches the model as an error naming the rule, so it can take the allowed route. If the guard
// itself fails, it lets the call through and says so: a broken guard must not stop all work.
import type { Register } from 'claude-code'

type Call = { tool: string; [k: string]: unknown }

const RESERVED = new Set(['tool', 'tool_use_id', 'consent'])

/** Every string the tool would act on, wherever its input keeps it (built-ins and MCP tools alike). */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

function textOf(e: Call): string {
  return Object.entries(e)
    .filter(([k]) => !RESERVED.has(k))
    .flatMap(([, v]) => strings(v))
    .join('\n')
}

/** A shell command, from Bash, a remote shell or a process-running MCP tool; '' for anything else. */
function commandOf(e: Call): string {
  for (const k of ['command', 'command_line', 'cmd', 'script']) if (typeof e[k] === 'string') return e[k] as string
  if (Array.isArray(e.argv)) return (e.argv as unknown[]).map(String).join(' ')
  return ''
}

/** A file being written, from Write, Edit, MultiEdit or NotebookEdit; '' for anything else. */
function writePathOf(e: Call): string {
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(e.tool)) return ''
  return String(e.file_path ?? e.notebook_path ?? '')
}

const cwdOf = (e: Call) => String(e.cwd ?? '')
const inRepo = (repo: string, cmd: string, cwd: string) =>
  new RegExp(`(^|/)${repo}/?$`).test(cwd) || new RegExp(`\\bcd\\s+["']?[^;&|"'\\n]*${repo}/?["']?\\s*(&&|;|\\n)`).test(cmd)

/** Rule 2: a secret read whose output is neither piped, redirected nor captured with $(…) lands in the transcript. */
function printsKeychainSecret(cmd: string): boolean {
  const reads = [
    /security\s+find-generic-password\b[^;&|\n)]*\s-w\b/g,
    /\b(?:cat|less|more|head|tail|bat)\s+[^;&|\n)]*(?:\.config\/judy\/(?:aig-token|event-code|openrouter-key)|\.dev\.vars\b)/g,
  ]
  for (const re of reads) {
    for (let m = re.exec(cmd); m; m = re.exec(cmd)) {
      const before = cmd.slice(0, m.index)
      const captured = (before.match(/\$\(/g) ?? []).length > (before.match(/\)/g) ?? []).length
      const rest = cmd.slice(m.index + m[0].length).split(/;|&&|\n/)[0] ?? ''
      if (!captured && !rest.includes('|') && !rest.includes('>')) return true
    }
  }
  return false
}

const TYPESAFE = /api\.typesafe\.ai|TYPESAFE_API_KEY|typesafe\/jev|typesafe:\//
const DOCS = /\.(md|mdx|txt)$/i

export const register: Register = on => {
  let code = ''

  on('session.start', async ($, e, next) => {
    code = ((await $.env.get('JUDY_EVENT_CODE')) ?? '').trim()
    if (!code) {
      try {
        const r = await $.process.run(['security', 'find-generic-password', '-s', 'JUDY_EVENT_CODE', '-w'], { timeoutMs: 5000 })
        if (r.exitCode === 0) code = r.stdout.trim()
      } catch {
        // Not a Mac, or no Keychain here: rule 1 waits for JUDY_EVENT_CODE.
      }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const call = e as unknown as Call
    const cmd = commandOf(call)
    const path = writePathOf(call)
    const deny = (rule: string) => {
      $.ui.toast(`judy-guard: ${rule.split('.')[0]}`)
      return { deny: `judy-guard: ${rule}` }
    }

    // 1. The court code stays in the chat.
    if (code.length >= 6 && (cmd || path) && textOf(call).toUpperCase().includes(code.toUpperCase())) {
      return deny("That would put the court code into a file, a commit or a log. It goes in the chat only; scripts read it from JUDY_EVENT_CODE or the Keychain (security find-generic-password -s JUDY_EVENT_CODE -w, piped or captured).")
    }

    if (cmd) {
      // 2. No Keychain secret printed into the transcript.
      if (printsKeychainSecret(cmd)) {
        return deny('That prints a secret into the transcript. Pipe it (… -w | wrangler secret put NAME) or capture it ("$(security find-generic-password -s NAME -w)"), and never cat ~/.config/judy/* or .dev.vars.')
      }
      // 3. Judy deploys through its gate.
      if (/\bwrangler\b[^;&|\n]*\bdeploy\b/.test(cmd) && !/--dry-run/.test(cmd) && !/npm run deploy/.test(cmd) && inRepo('judy-the-judge', cmd, cwdOf(call))) {
        return deny('Deploy Judy with npm run deploy (typecheck, tests, the eval gate, D1 migrations, then wrangler deploy), never a bare wrangler deploy.')
      }
      // 4. Jev only through jev-gateway.
      if (TYPESAFE.test(cmd) && !inRepo('jev-gateway', cmd, cwdOf(call))) {
        return deny('Jev goes through jev-gateway only (POST /v1/systemone with JEV_GATEWAY_TOKEN), never TypeSafe directly or with a TypeSafe key.')
      }
    }

    if (path && !DOCS.test(path) && !/(^|\/)jev-gateway\//.test(path) && TYPESAFE.test(textOf(call))) {
      return deny(`${path}: Jev goes through jev-gateway only (POST /v1/systemone with JEV_GATEWAY_TOKEN), never TypeSafe directly, a typesafe:/ model or a TypeSafe key.`)
    }

    return next(e)
  }).catch(($, e, next) => {
    $.ui.status('judy-guard: a check failed; the call went through unchecked')
    return next(e)
  })
}

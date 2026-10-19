import { expect, test } from 'claude-code/testing'

// Each case: a tool call, and whether judy-guard refuses it. The court code comes from JUDY_EVENT_CODE.
const CODE = 'TEST-COURT-42'
const cases: { name: string; call: Record<string, unknown>; denied: boolean }[] = [
  { name: 'court code written to a file', call: { tool: 'Write', file_path: '/r/notes.md', content: `code: ${CODE}` }, denied: true },
  { name: 'court code in a commit message, any case', call: { tool: 'Bash', command: `git commit -m "code ${CODE.toLowerCase()}"` }, denied: true },
  { name: 'court code read from the Keychain, captured', call: { tool: 'Bash', command: 'CODE=$(security find-generic-password -s JUDY_EVENT_CODE -w) node smoke.mjs' }, denied: false },
  { name: 'Keychain secret printed', call: { tool: 'Bash', command: 'security find-generic-password -s CF_AIG_TOKEN -w' }, denied: true },
  { name: 'Keychain secret piped into wrangler', call: { tool: 'Bash', command: 'security find-generic-password -s CF_AIG_TOKEN -w | npx wrangler secret put CF_AIG_TOKEN' }, denied: false },
  { name: 'secret file printed over ssh', call: { tool: 'mcp__remote__run_process', command_line: "ssh claw@mini 'cat ~/.config/judy/event-code'" }, denied: true },
  { name: 'secret file captured over ssh', call: { tool: 'mcp__remote__run_process', command_line: "ssh claw@mini 'C=$(cat ~/.config/judy/event-code); curl -H \"x-judy-code: $C\" https://x'" }, denied: false },
  { name: 'bare wrangler deploy in judy-the-judge', call: { tool: 'Bash', command: 'cd ~/judy-the-judge && npx wrangler deploy' }, denied: true },
  { name: 'wrangler deploy with judy-the-judge as cwd', call: { tool: 'mcp__remote__run_process', command_line: 'npx wrangler deploy', cwd: '/Users/me/judy-the-judge' }, denied: true },
  { name: 'npm run deploy in judy-the-judge', call: { tool: 'Bash', command: 'cd ~/judy-the-judge && npm run deploy' }, denied: false },
  { name: "another repo deploying with Judy's wrangler binary", call: { tool: 'Bash', command: 'cd ~/gavel-and-gown && ~/judy-the-judge/node_modules/.bin/wrangler deploy' }, denied: false },
  { name: 'TypeSafe called directly', call: { tool: 'Bash', command: 'curl https://api.typesafe.ai/v1/systemone -d @x.json' }, denied: true },
  { name: 'TypeSafe from inside jev-gateway', call: { tool: 'Bash', command: 'cd ~/jev-gateway && curl https://api.typesafe.ai/v1/health' }, denied: false },
  { name: 'a typesafe:/ judge model in code', call: { tool: 'Write', file_path: '/r/judge.py', content: 'make_judge(model="typesafe:/jev-latest")' }, denied: true },
  { name: 'the rule written in docs', call: { tool: 'Edit', file_path: '/r/CLAUDE.md', old_string: 'x', new_string: 'Never call api.typesafe.ai' }, denied: false },
  { name: 'an ordinary command', call: { tool: 'Bash', command: 'git status' }, denied: false },
]

for (const c of cases) {
  test(`${c.denied ? 'refuses' : 'allows'}: ${c.name}`, async ($, on) => {
    on('env.get', () => ({ value: CODE }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('tool.call', () => ({ result: {} }))
    on('ui.toast', () => ({ value: {} }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const r = await $.tool.call(c.call as never)
    expect(Boolean((r as { deny?: string }).deny)).toBe(c.denied)
  })
}

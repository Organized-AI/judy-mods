# judy-mods

Claude Code mods for **Judy the Judge**, the LLM judge behind Gavel & Gown (Organized AI).

**Live Board: https://judy-the-judge.jordan-691.workers.dev/hq**

| Mod | What it does |
| --- | --- |
| [`judy-board`](./judy-board) | Judy's Live Board in a pane beside the chat. It adds a status line with team count, nightly eval gates and the MLflow range, and toasts when a team files, a trial ruling lands or an audit finishes or fails. |
| [`judy-guard`](./judy-guard) | Judy's project rules, checked on every tool call instead of remembered: the court code and Keychain secrets stay out of files, commits and the transcript; Judy deploys through its gate; Jev is called only through jev-gateway. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install judy-board --marketplace Organized-AI/judy-mods
/plugin install judy-guard --marketplace Organized-AI/judy-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; Enter takes it). Each mod is active straight away.

From a shell:

```
claude plugin install judy-board --marketplace Organized-AI/judy-mods
claude plugin install judy-guard --marketplace Organized-AI/judy-mods
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Organized-AI/judy-mods`, then **Add plugin**.

If this repository is private, it installs only for people who can read it on GitHub and whose machine already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.

## judy-board

- `/judy-board` opens the Live Board pane: teams ranked by trial score, then practice score, with each team's ruling, practice standing and any audit error, plus a **Refresh** button.
- `/judy-team owner/repo` (or a GitHub URL) puts one team's card in the chat: trial ruling and score, practice score and standing with the change since the last audit, and the link to its team card.
- The status line reads like `⚖ Judy · 12 teams · 1 running · evals 13/13 · range up` and refreshes every minute. On a refresh, up to three toasts announce what changed.

It reads only public endpoints: Judy's `/api/hq` and the event guide's `/judy/api/status`. It needs no key or court code.

## judy-guard

| Rule | Refuses | Allowed route |
| --- | --- | --- |
| 1. The court code stays in the chat | Any command or file write whose text contains today's court code, in any case | Scripts read it from `JUDY_EVENT_CODE` or the Keychain |
| 2. No secret printed into the transcript | `security find-generic-password … -w` with its output neither piped, redirected nor captured; `cat`/`head`/`tail`/`less` of `~/.config/judy/{aig-token,event-code,openrouter-key}` or `.dev.vars` | `… -w \| wrangler secret put NAME`, or `"$(security find-generic-password -s NAME -w)"` |
| 3. Judy deploys through its gate | A bare `wrangler … deploy` in `judy-the-judge` (as the working directory, or after `cd …judy-the-judge &&`) | `npm run deploy` (typecheck, tests, the eval gate, D1 migrations, then wrangler), or `--dry-run` |
| 4. Jev only through jev-gateway | `api.typesafe.ai`, `TYPESAFE_API_KEY`, `typesafe/jev` or a `typesafe:/` model in a command outside `jev-gateway`, or in a code file written outside it | `POST /v1/systemone` on jev-gateway with `JEV_GATEWAY_TOKEN`. Docs (`.md`, `.mdx`, `.txt`) may name the rule. |

A refused call reaches the model as an error naming the rule, so it can take the allowed route, and a toast shows which rule fired.

**The court code.** At session start the guard reads it from the `JUDY_EVENT_CODE` environment variable or, on a Mac, from the Keychain item `JUDY_EVENT_CODE` (`security add-generic-password -s JUDY_EVENT_CODE -a judy -w`, which prompts for the value). It keeps the code in memory only, never in a file or `$.state`. With no code available, rule 1 is off and the other three still apply.

**If a check fails**, the guard lets the call through and says so on the status line. A broken guard must not stop all work.

## Developing

```
claude --plugin-dir ./judy-board        # run a mod from its folder; edits hot-reload
claude plugin validate ./judy-guard     # manifest, hooks module and what the engine would refuse
claude plugin test ./judy-guard         # 16 cases, one per rule edge
claude plugin test ./judy-board         # status line, pane on every surface, /judy-team
```

## Related

- [judy-the-judge](https://github.com/Organized-AI/judy-the-judge): the Worker behind the court, the Live Board and the audits
- [gavel-and-gown](https://github.com/Organized-AI/gavel-and-gown): the event guide at https://hack.organizedai.vip/judy and the MLflow range at https://mlflow.organizedai.vip

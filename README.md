# Pipe Up

**Hear what your coding agent did, without reading it.**

Pipe Up is a Claude Code plugin that speaks up when Claude needs you, and only
then. It stays silent while Claude works, and says the one thing you need to hear:
the question it is asking, or the failure it hit. With several sessions open, it
tells you **which one** needs you. It runs entirely on your machine, using your
computer's own voice.

> "Which database should I use for the audit log: Postgres, or a separate store?"

> "Problem: The integration suite failed on the staging fixtures with a connection
> timeout. I could not reproduce it locally, so I stopped here."

> "waypoint needs permission."

> **Renamed from "earshot" in 0.4.0.** The code is the same. If you used the old name,
> your settings in `~/.earshot.json` still work, and `/pipe-up:doctor` tells you how to
> rename the file. Reinstall with the commands below, as the plugin id changed.

## Install

```
/plugin marketplace add absep98/pipe-up
/plugin install pipe-up@pipe-up
```

Then run `/reload-plugins` (or restart Claude Code) and check it works:

```
/pipe-up:doctor
```

That tests the speech path, shows your settings, and lists the last decisions, so
"why was it silent?" always has an answer.

## What it does

| | |
|---|---|
| **Stays quiet by default** | Routine progress ("done, tests pass") makes no sound. |
| **Speaks a question** | A question for you is spoken with its options, not the start of the response. |
| **Speaks a failure** | The sentence that reports it, prefixed "Problem:". Fixed failures and negations ("no failures") are ignored. |
| **Skips optional offers** | "Want me to commit this?" is not worth an interruption. |
| **Announces alerts** | Permission prompts and "waiting for you", in your system voice, never dropped. |
| **Names the session** | With 2+ sessions open: "pipe-up needs permission." |

It does this by reading Claude's reply through Claude Code's `Stop` hook and its
alerts through the `Notification` hook. It never changes what Claude sees or does.

## Modes

Switch with a command, or edit `~/.pipe-up.json`:

| Command | Mode | What you hear |
|---|---|---|
| `/pipe-up:smart` | `smart` (default) | Only questions, failures and blockers |
| `/pipe-up:always` | `always` | A short summary of every response |
| `/pipe-up:off` | `off` | Nothing from responses. Alerts still speak unless `"alerts": false` |

`/pipe-up:silence` stops whatever is speaking right now.

## Several sessions at once

Each session is named after its project folder. Names appear only once two or more
sessions have been active recently, so with one session it keeps the plain wording
("Claude needs permission to continue").

- Two sessions in one folder are numbered: "pipe-up 1", "pipe-up 2".
- Speech queues in order, so one session's alert never interrupts another's. The
  one exception: a newer narration from a session replaces that same session's
  older, now stale, one.
- "Waiting for you" notices are spoken only when several sessions are open, since
  with one session you are already looking at it.

## Settings

All optional, in `~/.pipe-up.json`. Mistakes are tolerated and explained by
`/pipe-up:doctor`: values are trimmed and case-insensitive, out-of-range numbers
are clamped, and unknown keys are reported.

| Setting | Values | Default |
|---|---|---|
| `mode` | `"smart"`, `"always"`, `"off"` | `"smart"` |
| `smartStyle` | `"precise"` says just the question or failure; `"summary"` says a short summary of the whole response, still only when there is one | `"precise"` |
| `label` | `"auto"` name sessions only when 2+ are active, `"always"`, `"never"` | `"auto"` |
| `idleAlerts` | `"auto"` only when 2+ are active, `"always"`, `"never"` | `"auto"` |
| `alerts` | `true` / `false` | `true` |
| `rate` | -10 (slowest) to 10 (fastest) | `2` |
| `voice` | an installed voice name | system default |
| `maxWords` | how long a spoken summary can be | `60` |
| `describeCode` | announce "a code block of TypeScript, 7 lines" | `true` |
| `sessionWindowMinutes` | how recently a session must have been active to count | `120` |

## Privacy

**Nothing leaves your machine.** Pipe Up contains no network code, no analytics,
no accounts and no API keys, and it makes no calls to any language model. Speech
uses only the voice built into your operating system. The full policy is in
[PRIVACY.md](PRIVACY.md).

## Commands from a terminal

The same tool works outside Claude Code, from a clone of this repository:

```
node scripts/pipe-up.js doctor --speak
node scripts/pipe-up.js preview < some-response.md
node scripts/pipe-up.js mode off
node scripts/pipe-up.js sessions
node scripts/pipe-up.js log 20
```

`preview` prints exactly what would be spoken, and whether it would speak at all,
without making a sound.

## Platform support

Developed and tested on **Windows 11** (the built-in SAPI voices). The macOS code
path (`say`) and the Linux one (`spd-say` or `espeak-ng`) exist but are **untested**.
The plugin needs Node.js, which Claude Code's hooks already rely on.

## How well does "smart" work?

It is rule-based, so it is imperfect. It was measured on 138 labelled responses
written by independent reviewers. The first measurement on a set the rules had never
seen was 84% correct, against 56% for the previous version; after fixing the misses it
passes all of them, which no longer says how it will do on new text. Expect it to
miss unusual phrasing. `/pipe-up:always` is there if you would rather hear everything,
and `/pipe-up:doctor` shows what it decided and why. The labelled responses and the
test that guards them are in `test/`.

## For reviewers

Pipe Up has no network code and reads no credentials.

- **Reads:** `~/.pipe-up.json` (mode, voice, rate; no secrets), the hook's JSON on stdin,
  and its own queue and log files in `<os tmpdir>/pipe-up-<username>/`.
- **Runs:** `powershell.exe` (System.Speech), `say`, `spd-say` / `espeak-ng`, `taskkill`,
  and its own `src/player.js`. Nothing else.
- `test/fixtures/*` are sample Claude replies used to test what gets spoken. Words such as
  `STRIPE_SECRET_KEY` or a URL in them are test data and are never executed.
- `'pipe-up-' + username` in `src/dirs.js` is a temp-folder name, not a command.

Verify from the repository root (each command is plain `grep`):

```
grep -rn "require(" src scripts        # every module it loads
grep -rn "spawn" src scripts           # every process it starts
grep -rn "process.env" src scripts     # every environment variable it reads
```

The first shows only Node built-ins (`fs`, `os`, `path`, `child_process`) and the plugin's
own files, with no module that can open a network connection. The second shows only
the local speech commands, `taskkill` and `src/player.js`. The third shows only the
`PIPE_UP_*` (and old `EARSHOT_*`) settings and the environment handed to those local child
processes.

## License

[MIT](LICENSE). Security reports: see [SECURITY.md](SECURITY.md).

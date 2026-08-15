# earshot

**Hear what your coding agent did, without reading it.**

Claude Code sessions produce 50,000–100,000 characters of text a day. Most of it
is diffs, file paths, tool chatter and markdown scaffolding. Existing TTS hooks
read all of it aloud, which is slower than reading it with your eyes.

earshot doesn't read your agent's output. It tells you what happened.

```
Claude's response (676 chars)          earshot says (12 seconds)
─────────────────────────────          ─────────────────────────
## What changed                        "I've fixed the token refresh bug in
- The `refreshToken()` call was         token store. The refresh Token call
  firing **before** the mutex...        was firing before the mutex was
```typescript                           acquired, so two concurrent requests
async function refresh(store) {         could both see an expired token.
  const release = await store...        All 51 tests pass now. There's a code
```                                     block of TypeScript, 7 lines you'll
| Test | Before | After |               want to look at."
```

## And by default, it says nothing at all

The two peer-reviewed studies of blind and low-vision developers using AI coding
tools both found the same thing: the problem is **auditory overload**, not
silence. People already running a screen reader do not want a second voice
reading the same output again.

So `smart` mode — the default — stays quiet through routine progress and speaks
only when the agent is **stuck, failed, or asking you something**.

| Mode | Behaviour |
|---|---|
| `smart` *(default)* | Speaks on questions, failures, blockers. Silent otherwise. |
| `always` | Narrates every response. |
| `off` | Silent. Permission and idle alerts still fire. |

## Install

```bash
npm install
node bin/earshot.js install
```

That backs up `~/.claude/settings.json`, registers the `Stop` and `Notification`
hooks, and writes nothing else. Restart Claude Code afterwards.

## Try it without installing anything

```bash
node bin/earshot.js preview < some-response.md
```

`preview` prints exactly what would be spoken — and whether it would speak at
all — without making a sound.

```bash
node bin/earshot.js say "Fixed the auth bug in src/auth/token_store.ts"
```

## Configuration

Optional, at `~/.earshot.json`:

```json
{
  "mode": "smart",
  "engine": "edge",
  "edgeVoice": "en-US-AriaNeural",
  "rate": 2,
  "maxWords": 60,
  "alerts": true
}
```

`engine: "edge"` uses Microsoft's neural voices (400+, free, needs network) and
falls back to the built-in OS voice automatically if the network or the
`node-edge-tts` package is unavailable. Everything runs locally otherwise — no
account, no API key, no telemetry.

## What it does to the text

- Code blocks and diffs are **described, not recited** — "a code block of TypeScript, 7 lines"
- Tables are announced, not read cell by cell
- `src/auth/token_store.ts` becomes "token store"; `getUserById` becomes "get User By Id"
- Markdown, emoji, bullets and link URLs are stripped; link text survives
- Soft-wrapped lines are rejoined so the voice doesn't pause mid-clause
- Leading filler ("Sure!", "Great!") is dropped
- Capped at 60 words, trimmed at a sentence boundary

## Design notes

**It never blocks your terminal.** The hook filters the text, hands it to a
detached player process and exits in under half a second. Audio plays in the
background.

**A new response interrupts the old one.** Stale narration is worse than none,
so `enqueue` kills the current player before starting the next.

**It cannot break your session.** Every hook path catches everything and exits
0. Exit code 2 would block Claude from stopping, so earshot never returns it.

**No LLM in the default path.** Summarisation is rules-based, which means no API
key, no per-response cost, no network dependency, and no setup step between
installing and hearing it work. An opt-in LLM summariser is the obvious next
increment, not the starting point.

## Status

v0.1. Windows-first (SAPI + PowerShell playback); macOS uses `say`/`afplay`,
Linux needs `ffplay`. Claude Code only — the `Stop` hook contract is
Claude-Code-specific.

Not yet built: per-block selection ("read me the diff"), which needs UI the CLI
doesn't expose, and cross-CLI support, which needs a hosted-terminal
architecture. Both are deliberately deferred.

MIT.

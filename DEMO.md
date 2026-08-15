# 30-second demo script

For an audio product the demo *is* the pitch, and none of the eight competing
Claude Code TTS projects have a good one. This is the highest-leverage 30
minutes in the whole project.

**Record:** screen + system audio. OBS (free) or ShareX on Windows. Export MP4.
**Critical:** system audio must be captured, not the microphone. Test this first
— a silent demo of an audio product is the one unrecoverable mistake.

---

## Shot list

**0:00–0:04 — the problem, shown not told**

Terminal with a finished Claude Code response on screen. Scroll it. Let the
viewer see the wall: headings, a diff, a table, file paths. No narration yet.

> On-screen caption: *"Every response. All day."*

**0:04–0:10 — the same response, heard**

Run:

```bash
node plugins/earshot/bin/earshot.js say < sample-response.md
```

Let the audio play uncut. This is the money shot — the viewer hears 676
characters become twelve seconds. Do not talk over it.

**0:10–0:18 — the differentiator**

Split screen or cut: the raw response beside the spoken line. Highlight what got
dropped as the voice reaches it — the code block, the table, `src/auth/token_store.ts`
becoming "token store".

> On-screen caption: *"It describes the code. It doesn't read it."*

**0:18–0:26 — silence by default**

Show two responses back to back in a live session:

1. A routine one ("all 51 tests pass") — **nothing happens.** Hold the silence
   for a full two seconds. The silence is the feature; give it room.
2. A blocked one ("I need an API key") — earshot speaks.

> On-screen caption: *"Speaks when you're needed. Silent when you're not."*

**0:26–0:30 — install**

```bash
/plugin marketplace add absep98/earshot
/plugin install earshot@earshot
```

End card: repo URL. Nothing else.

---

## Rules

- **No voiceover.** The product's voice is the only voice.
- **No music.** It competes with the thing you're demonstrating.
- **Under 35 seconds.** Every competitor's demo is a 6-minute screencast; being
  short is itself differentiation.
- **One take of real terminal.** No slides, no mockups.

## Where it goes

r/ClaudeAI · the Claude Code Discord · Show HN · awesome-claude-code · the
Claude Code plugin marketplace. Same clip everywhere, embedded not linked.

## The one number that matters

200 users in 30 days. Below it, this is a personal tool and the project is done.
Above 500 with issues filed, reopen the per-block and cross-CLI questions.

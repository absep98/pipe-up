# 30-second demo script

For an audio product the demo *is* the pitch. This is the highest-leverage 30
minutes in the whole project.

**Record:** screen + system audio. OBS (free) or ShareX on Windows. Export MP4.
**Critical:** capture system audio, not the microphone, and test that first. A
silent demo of an audio product is the one unrecoverable mistake.

The story in one line: *Claude works silently, then tells you the one thing you need
to hear, and which session it came from.*

---

## Setup (before recording)

- Two terminals side by side, each running Claude Code in a different project folder
  (for example `waypoint` and `billing-api`). Pipe Up installed, mode `smart`.
- Run `/pipe-up:doctor` once off-camera to confirm you can hear it.

## Shot list

**0:00–0:05 — silence is the feature**

Terminal A: ask Claude for a routine change. It finishes with a plain "done, all tests
pass". **Nothing is heard.** Hold the silence for a full two seconds and let the
viewer notice.

> Caption: *"No wall of noise."*

**0:05–0:13 — it speaks only for you**

Terminal A: ask something that makes Claude ask back, such as *"pick any file and
ask me which one to rename"*. When the question appears, you hear it, the question
itself and not the response around it.

> Caption: *"It says the one thing you need."*

**0:13–0:23 — which session?**

Terminal B: start a task that needs a permission prompt, then look away from it. You
hear *"billing api needs permission."* Cut to terminal B showing the prompt.

> Caption: *"Two sessions. It tells you which one."*

**0:23–0:30 — install**

```
/plugin marketplace add absep98/pipe-up
/plugin install pipe-up@pipe-up
```

End card: the repo URL. Nothing else.

---

## Rules

- **No voiceover and no music.** The product's voice is the only voice.
- **Under 35 seconds.**
- **One take of a real terminal.** No slides or mockups.
- Show the silence honestly. If a take has it speak when it should not, record
  another, or fix the rule and say so in the README.

## Where it goes

r/ClaudeAI, the Claude Code Discord, Show HN, awesome-claude-code. Same clip
everywhere, embedded, not linked.

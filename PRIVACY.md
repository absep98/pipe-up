# Earshot privacy policy

_Last updated: 2026-10-16 (version 0.3.0)_

Earshot is a Claude Code plugin that speaks Claude's questions, failures and alerts
aloud. This page states exactly what data it handles. The source is public in this
repository, and every statement here can be checked against it.

## Short version

Earshot does not collect, transmit or share any data. Everything happens on your
machine, and nothing leaves it. It contains no network code at all.

## What Earshot reads

- The text of Claude's final response in each turn, from Claude Code's `Stop` hook.
- The type of notification Claude Code raises (permission prompt, waiting for input),
  from the `Notification` hook.
- Each hook call's session id and working directory, which Claude Code provides.

Earshot filters this text on your machine to decide whether to say anything and what
to say. The text can contain anything that is in a response, including code and
names. It is handled in memory and passed to your computer's own speech engine.

## What leaves your machine

**Nothing.** Earshot makes no network requests. Since version 0.3.0 it has no online
voice: speech uses only the voice built into your operating system (Windows SAPI via
PowerShell, macOS `say`, or `spd-say`/`espeak-ng` on Linux). It does not contact
Anthropic, Microsoft or any other service, has no analytics or crash reporting, and
needs no account or API key. It makes no calls to any language model.

Earlier versions (0.1 and 0.2) could send the spoken text to an online text-to-speech
service. That feature has been removed.

## What Earshot stores on your machine

- `~/.earshot.json`: your settings. Created only if you create it or run
  `/earshot:smart`, `/earshot:always` or `/earshot:off`.
- A private working folder in your temp directory, `earshot-<your user name>`, with:
  - **Session files:** for each recently active Claude Code session, its session id,
    the name of its project folder (not the full path) and two timestamps. Used only
    to tell when several sessions are open and what to call them. Files for sessions
    quiet for about eight hours are removed.
  - **Queue files:** while something is waiting to be spoken, a small file holding
    the text to be spoken, deleted as soon as the player starts, and a marker file
    per queued utterance, deleted when it finishes. Leftovers older than five minutes
    are removed on the next run.
  - **A decision log:** the last ~150 decisions, one line each: time, whether it spoke
    and why, counts of characters and words, the session's project folder name, and
    any error. It **never contains the text of a response**.

Earshot keeps no history of responses and nothing is retained beyond what is listed.

## What Earshot runs

- A short-lived `node` process for each hook call, which exits in milliseconds.
- A detached `node` player, which speaks and then exits. A hard 60-second limit stops a
  stuck one.
- `powershell.exe` on Windows to call the built-in speech engine. The text, voice and
  rate are passed as environment variables, never built into the script.
- `say` on macOS, or `spd-say` / `espeak-ng` on Linux.
- On Windows, `taskkill`, only when it needs to stop one of its own speech processes
  and Windows refuses a normal stop.

It does not modify Claude Code's settings or any file outside the folders above.

## Children

Earshot collects no personal information and has no accounts, so it holds no data
about anyone, including people under 18.

## Changes and contact

Changes to this policy are made in this file and are visible in the repository
history. Questions or concerns: open an issue at
https://github.com/absep98/earshot/issues or email absep98@gmail.com.

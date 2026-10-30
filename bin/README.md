# Why this folder exists

Earshot only works in Claude Code: it speaks through Claude Code's `Stop` and
`Notification` hooks and has nothing to do in a chat window. Claude Code puts a
top-level `bin/` folder on its PATH, and claude.ai and Cowork refuse to install a
plugin that has one, so this folder keeps earshot out of places where it could not work.

It contains no executables. The real code is in `scripts/`.

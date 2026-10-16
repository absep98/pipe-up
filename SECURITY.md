# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- Use GitHub's private reporting: **Security → Report a vulnerability** on
  https://github.com/absep98/earshot , or
- email absep98@gmail.com with "earshot security" in the subject.

You can expect a first reply within a few days. This is a small, free project
maintained by one person, so there is no bounty, but reports are taken seriously and
credited if you wish.

## What is in scope

Earshot runs on your machine as a Claude Code plugin with your user's permissions. It
has no network code, so the realistic concerns are local ones: anything that lets a
crafted response, setting or file make it run unintended commands, write outside its
own folders, or stop an unrelated process.

## Supported versions

Only the latest release is supported.

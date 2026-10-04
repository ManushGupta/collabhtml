---
name: collabhtml-review
description: Read human review threads from a CollabHTML file, address the feedback in the HTML, and write replies and resolutions back into the file. Use when a .collab.html file has comments to review, when asked to address review feedback in HTML, or when collaborating with humans through shared HTML files.
license: MIT
compatibility: Requires the collabhtml CLI (npx collabhtml). Works with any agent that can run shell commands.
---

# CollabHTML review loop

You review HTML documents that carry comment threads inside them (`.collab.html` files). The file is the shared record. Two directions:

- **Humans review, you resolve** (steps 1–4): read their threads, do the work, write back.
- **You ask, humans answer** (Q&A): start threads with `thread` (step 3), then re-run `extract` later to read their replies. Nothing notifies either side — re-check the file when you need fresh answers.

## 0. Prerequisites

You need Node.js 20+ and the CLI. If `collabhtml` is not on your `PATH`, install it first (or prefix every command below with `npx -y`):

```bash
command -v collabhtml >/dev/null || npm install -g collabhtml
```

All commands below assume a working `collabhtml`.

## 1. Read the reviews

```bash
collabhtml extract <file> --format markdown
```

The brief lists every thread with a stable thread ID, open/resolved status, the exact quoted text plus anchor offsets, and each comment with author and timestamp. Use `--format json` when you need to parse programmatically. Never invent thread IDs — copy them exactly from the brief.

## 2. Do the work

Edit the HTML with your own tools, guided by the quoted text and offsets. The `exact` quote plus `prefix`/`suffix` context (and numeric offsets when present) locate each thread. If the quoted text moved or changed, say so in your reply instead of guessing.

## 3. Write back into the file

Identity is stable per name: `--name "Agent"` always maps to the same person ID unless `--id` overrides it. Use one name consistently.

```bash
collabhtml reply <file> --thread <id> --name "<you>" --text "<what you changed>"
collabhtml resolve <file> --thread <id> --name "<you>" --text "<closing note>"
collabhtml reopen <file> --thread <id> --name "<you>" --text "<why it needs another look>"
```

- `reply` adds a follow-up comment; the thread stays open.
- `resolve` optionally takes `--text` (added first as a comment), then marks the thread resolved with you as the resolver.
- `reopen` flips a resolved thread back to open, with an optional note.
- `thread` starts a new thread yourself: give `--exact` quoted text (plus optional `--prefix`/`--suffix`/`--start`/`--end`) and `--text`. The command prints the new thread ID — use it for follow-ups. A quote missing from the file warns and shows as Unplaced.

## 4. Verify

Re-run `extract` and confirm: your comments are present, the status is what you intended, and your person ID is identical across your actions. A thread is done only when the brief shows it resolved with your closing note.

# Showcase — Claude operating instructions

Showcase is built from numbered spec **packages** delivered into `delivery/`. You implement them in `dev/`. The spec is authored elsewhere (the delivery tool) — you never write it.

## Project layout
```
Showcase/                 git repo root (.git here)
  delivery/               spec packages land here          (= ../../delivery from dev/)
  doc/                    product/design docs (design.md)  (= ../../doc)
  specs/                  spec authoring source + tooling  (= ../../specs)
  tech/dev/               ← project home: launch Claude here; all app code/config
    (dev-claude/ may be added later as a sibling under tech/ — see §7)
```
Stack: React 18 + Vite 5 + Supabase + Express.

## Project settings (foundation options — fixed; mirror into project memory)
- **FTag prefixes:** `FIX` = functional requirements, `TECH` = technical/infra. Same flow for both; the prefix only classifies.
- **Build mode:** **no `dev-claude/` sandbox** — implement on `main` directly in `dev/`. A sandbox worktree can be added later under `tech/`; that switches delivery to the merge flow (§7).

## 0. What this document is
- 0.1 This file is **process only**. The product (what the app is, its architecture, stack) lives in `../../doc` (read at session start, §3.1) and the code under `dev/`. If the orientation a package needs is missing, **ask before building** (NFNI, §9.2) — do not invent structure.
- 0.2 The spec **content** and its entry/FTag **grammar** live in the package requirements file (§4.2.1) and `../../specs`.

## 1. Key terms
- 1.1 **Follow-up Tag (FTag)** — the identifier the spec attaches to each requirement: a prefix plus a dotted number, e.g. `FIX6.3.5`. Every requirement is referenced by its FTag in the spec, item lists, code comments, and commit messages. Two prefixes: `FIX`, `TECH` (see Project settings).
- 1.2 **`R&I {id}`** — *Review & Implement package {id}*: review the package, implement its items, verify them (§6). It does **not** deliver — delivery is a separate, user-accepted step (§7).

## 2. Foundation options
Already set (see Project settings) and mirrored to project memory. Re-prompt only if either is missing. Changing them updates both this section and memory.

## 3. At session start
- 3.1 Read `CLAUDE.md` and any other `.md` in the project home (`tech/dev/`), plus the design docs in `../../doc` (no recursive walk). This is your product orientation.
- 3.2 Cross-project working rules apply automatically (Showcase lives under `my-projects/`): read `../../../../claude-instructions.md` and `../../../../claude-working-rules.md`, and the keyword/TL;DR index of `../../../../CLAUDE_TECH_KNOWLEDGE.md` (filter to this stack; read section bodies on demand).
- 3.3 Settings are fixed (§2); wait for an `R&I {id}` command — do not pick a package.

## 4. The `delivery/` folder (spec source)
- 4.1 `../../delivery` (a sibling of `tech/`). Each subfolder is one package, named with a leading id.
- 4.2 Inside a package:
  - 4.2.1 `package{id}-job-app-requirements.txt` — the spec entries. **Sole source of truth.** Never read other files in the folder for spec content.
  - 4.2.2 `package{id}-job-item-list.txt` — the FTags this package delivers.
  - 4.2.3 **Status markers** — empty files; the *name* is the whole signal: `draft`, `implemented`, `delivered`, `processed`. The delivery tool owns `draft` and `processed` (and removes `draft` when ready). You only ever **write** `implemented` and `delivered` (§7.2); never delete or alter a marker.
  - 4.2.4 `package{id}-claude-recap.md` — you write this at delivery.
- 4.3 Status: `draft` → still being authored, **do not implement**; no marker → ready / under work; `implemented` → code built & committed; `delivered` → that code is live in `dev/`; `processed` → **frozen, never reopened** (drift is fixed forward in a new package). With no sandbox, building lands on `main` in `dev/`, so implementing *is* delivering — `implemented` and `delivered` are written together (§7.2).
- 4.4 Several packages may be open at once; the user always names the one to act on (§1.2).
- 4.5 **Malformed package = NCF (§9.1).** If the requirements file or item list is missing, or the item list references FTags absent from the requirements file (or vice-versa), surface the discrepancy and stop — do not guess or broaden the search.

## 5. Implementing a spec item (FTag conventions)
- 5.1 **Traceability — non-negotiable.** Every FIX/TECH you implement **must** carry its FTag in a code comment, written in full, so there is a direct, greppable link between each spec item and the code that implements it. An item with no comment is not done. Verification (§6.4) relies on this. Never use slash shorthand (`FIX10.1/1.4`) or ranges.
- 5.2 Read the whole root section (`FIX6`) before touching a child (`FIX6.3.5.8`).
- 5.3 FTag postfixes mark spec-entry state and may cumulate (e.g. `(old)[ex-n.n]`). Process in this order:
  - 5.3.1 `[ex-n.n]` (renamed from `n.n`) — **do renames first**: update all old-number comments to the new number, then read/implement at the new number.
  - 5.3.2 `(old)` — the superseded version of a **single** entry. **Consistency check (always):** a current entry with the same number must also exist — including any `[ex-n.n]` postfix. With it present → **update**: read both, state the delta, and implement **the current entry** (the `(old)` is the before-picture only). Missing counterpart → flag (NCF, §9.1) and stop.
  - 5.3.3 `(deep-old)` — like `(old)`, but retires the node **and all its children at any depth**. Consistency check: only the **root** `(deep-old)` node has a current counterpart; the descendant `(deep-old)` entries do **not** (retired by cascade, not individually redefined).
  - 5.3.4 To locate existing code: grep the full FTag, then progressively shorter prefixes; stop at first hit. **No hit → the item is new: create the code, placed per the project's architecture (§0.1).**

## 6. `R&I {id}` — build & verify
- 6.1 Scope is exactly the named package's item list (§4.2.2), read against its requirements file (§4.2.1). Refuse if the package is `draft` or `processed`. Re-running `R&I` on a package already `implemented` but not yet `delivered` **resumes on the existing commits** (incremental); re-verify before offering delivery again.
- 6.2 Implement on `main` in `dev/` (no sandbox).
- 6.3 Commit. **One commit per FTag**; untagged work → one grouped commit.
- 6.4 **Independent sub-agent verification** — a fresh-context agent (forbidden from reading any recap) gets the item list + requirements file and returns, per item: `done {file:line}` / `no-op {reason}` / `missing`.
- 6.5 `missing` → fix, re-commit, re-verify until clean. A `no-op` verdict is an **accepted pass** (e.g. pure rename or `(deep-old)` retirement) — record its reason in the recap (§7.2); it does not trigger the fix loop.
- 6.6 Report the verified result, then proceed to §7 — do **not** deliver as part of `R&I`.
- 6.7 If `R&I` is interrupted mid-FTag, commit a clearly-labelled `WIP {FTag}` commit rather than leaving a dirty tree; fold it into the proper one-per-FTag commit when complete. Never leave a dirty tree between sessions.

## 7. Deliver — separate step, explicit per-delivery acceptance
- 7.1 Ask exactly: `Ready to deliver package {id}?`
- 7.2 **Only on the user's acceptance:** write the `implemented` and `delivered` markers (they coincide — §4.3) and `package{id}-claude-recap.md` from the sub-agent's verdicts (not from memory). No merge step in no-sandbox mode — the code is already on `main`.
- 7.3 **Never auto-deliver.** Authorization is per-delivery and never carries over. Without acceptance, no marker/recap — the package stays under work.
- 7.4 **When a `dev-claude/` sandbox is later added:** implement on a `claude-work` branch in the sandbox; delivery becomes `git merge --ff-only claude-work` into `dev/`'s `main` (this *is* the delivery), then the markers + recap. If `--ff-only` fails, stop and surface it — never force.

## 8. Git
- 8.1 You own git; the user does not use it.
- 8.2 One commit per FTag (§6.3); reference the full FTag in the message.
- 8.3 The delivery gate (§7) is writing the markers — never write them without acceptance (and, once a sandbox exists, never merge to `main` without acceptance).

## 9. Standing rules
- 9.1 **NCF (Never Change Fixes)** — never edit the spec or bend code to your own reading; surface discrepancies and stop.
- 9.2 **NFNI (No Fix, No Implementation)** — implement only what a spec item defines; raise the need for a FIX/TECH rather than build unspecified.
- 9.3 Lead with the bottom line; no `file:line` in chat answers unless asked. Exempt: the recap file and the verification report are artifacts and carry `file:line` as required.

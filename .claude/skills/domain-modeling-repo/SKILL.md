---
name: domain-modeling-repo
description: Same as domain-modeling, but writes into this repo's module READMEs instead of CONTEXT.md/docs/adr — matching CLAUDE.md's documentation style.
---

# Domain Modeling (this repo)

Run `/domain-modeling` session, but the place *where* things are documented changes.

This repo documents per module, not in a standalone glossary. A resolved term goes into
`src/modules/<modulo>/README.md` under "Conceitos do domínio"; a resolved decision goes
still under `docs/adr`, but also add a shorter, summarised version in module's "Decisões de design (ADR resumido)"
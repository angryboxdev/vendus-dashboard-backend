---
name: create-intent
description: Capture a feature idea from a non-technical person as a plain-language intent.md. Use when a product/business person wants to request a feature, or says "create intent".
disable-model-invocation: true
---

Turn a feature idea into `.scratch/<feature-slug>/intent.md`. The person talking to you is not technical: this is the front door of the flow, and the engineer takes it from there with `/grill-with-docs`.

## Rules

- Plain language only. No code, database, API, endpoint, schema, or framework talk. Never ask the user how to build something.
- Use the product vocabulary from `CONTEXT.md` (Organization, Location, Employee...) when it fits. If the user uses a different word for the same thing, use theirs and note it.
- Facts about what the product does today are your job, not the user's: read `CONTEXT.md`, `.scratch/`, and the code to find out, and say what you found in plain terms ("today the report shows X"). Ask only about wants, needs, and business context.
- Interview with the `/grilling` method, but **ask ONE question at a time**, never a list or a round. This overrides `/grilling`'s "ask the whole frontier" rule. Give your recommended answer with the question, wait for the reply, then pick the next most important question based on what you heard. Repeat until nothing is left silently assumed. Keep each question short, concrete, and answerable by someone who does the job day to day. Ask for real examples.
- Cover: who is affected and what they do today, the pain and what it costs (time, money, mistakes), what they'd be able to do once it exists, what must never break or change, what is explicitly out of scope, what "it worked" looks like.
- Anything the user can't answer goes to Open questions. Never invent an answer.

## Prototype

If the feature has anything visual (a new screen, a card, a report, a change to an existing page), then once the frontier is empty, offer mockups in plain words: "Want to see a few visual options of this before we finish? I can build quick mockups in the app." Skip the offer for purely invisible changes. Offer it once; if declined, move on.

On a yes, invoke `/prototype` (UI branch). Pass along the intent so far as the question, in the user's words. Walk the user through how to open it and flip between variants, with no technical jargon. Then ask, one question at a time, what they liked, disliked, and want to steal from each variant. Feed the answers back into the intent (new constraints, outcome details, open questions) and keep asking one at a time if they change the picture. Let them iterate on variants if they want.

Follow `/prototype`'s capture rule (throwaway branch, out of main). Record in the intent under `## Prototype`: the branch name, how to run it, which variant was preferred, and the user's verdict in their own words.

## Confirmation

When the frontier is empty (and any prototype is done), replay the intent back in a short plain summary and ask: "Is this what you mean? Anything missing or wrong?" Fix and re-ask until they say it's right.

Only after an explicit yes: write the file with `Status: confirmed`. Before that, don't write it, or write it as `Status: draft` if the user wants to pause.

## Template

Slug the feature name (`kebab-case`). If `.scratch/<slug>/` exists, don't overwrite: ask whether this extends it.

```markdown
# <Feature title>

Author: <who asked>
Status: draft | confirmed
Date: <YYYY-MM-DD>

## Problem

The pain today, in the user's words, and what it costs them. Include a real example.

## Proposed outcome

What people will be able to do once this exists.

## Affected users and areas

Who is affected (roles, people, Locations) and which parts of the product they touch, in product terms.

## Constraints

Things that must not change or break, rules, deadlines, legal or business limits.

## Out of scope

What this is explicitly not.

## Success looks like

How we'd know it worked, observable by the user.

## Prototype

Only if one was built: branch name, how to run it, preferred variant, and the user's verdict in their own words.

## Open questions

Unresolved items for the engineer to settle.
```

## Hand-off

After writing, tell the user the file path and that the engineer will pick it up. Don't offer to design or build it.

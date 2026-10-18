---
name: roadmap
description: Plan a big product idea (a module, many features, complex ideas) with a non-technical person as a shared map of product questions, resolved one at a time until the features are clear and ordered. Ends in one intent.md per feature.
disable-model-invocation: true
---

A big, foggy product idea has arrived: too large for one session, and the person talking to you is not technical. The way from here to the **destination** isn't visible yet. This skill charts it as a **map** of **product questions**, then resolves them one at a time until the features are clear, sequenced, and each captured as an `intent.md` for an engineer to pick up.

This is the product-side sibling of `/wayfinder`. Same shape (map, tickets, frontier, fog), different content: every question is about what people need and want, never about how to build it.

## Rules

- Plain language only. No code, database, API, endpoint, schema, or framework talk. Never ask the user how to build something.
- **Product decisions are in scope**: who it's for, problems, workflows, rules, priorities, scope, sequencing, wording, and UI/UX (what screens show, how they feel, what flow people follow).
- **Technical decisions are never made here**: architecture, data model, stack, code standards, performance, integrations design. When one surfaces, don't answer it and don't drop it: add a line to the map's **Technical Notes** section, in plain words, and move on.
- Use the product vocabulary from `CONTEXT.md` (Organization, Location, Employee...). If the user uses a different word for the same thing, use theirs and note it.
- Facts about what the product does today are your job, not the user's: read `CONTEXT.md`, `.scratch/`, and the code, and say what you found in plain terms. Ask only about wants, needs, priorities, and business context.
- Anything the user can't answer is recorded as unresolved. Never invent an answer.
- **Ask ONE question at a time**, never a list or a round. Give your recommended answer with the question, wait for the reply, then pick the next most important question. Keep each question short, concrete, and answerable by someone who does the job day to day. Ask for real examples. This overrides `/grilling`'s "ask the whole frontier" rule everywhere in this skill.

## Plan, don't do

Each ticket resolves a decision. The map is done when the way is clear and nothing is left to decide before an engineer takes over. Produce decisions and intents, not built features.

## Refer by name

Every map and ticket has a **name**: its title. In everything the human reads (narration, Decisions so far), refer to it by name, never by bare number or file name. The path rides inside the name as a link.

## The Map

Local markdown. Effort directory: `.scratch/<effort-slug>/`.

- **Map**: `.scratch/<effort-slug>/map.md`
- **Tickets**: `.scratch/<effort-slug>/issues/NN-<slug>.md`, numbered from `01`

The map is an **index**, not a store. It gists each decision and links the ticket that holds the detail; a decision lives in exactly one place, its ticket.

```markdown
# <Effort title>

Author: <who asked>
Date: <YYYY-MM-DD>

## Destination

<what reaching the end looks like, e.g. "a ranked list of the features of the X module, each with a confirmed intent". One or two lines.>

## Notes

<the business, who the users are, standing preferences for this effort>

## Roadmap

<!-- fills in as decisions land -->

- **Now**: [<feature>](../<feature-slug>/intent.md): <one-line gist>
- **Next**:
- **Later**:

## Decisions so far

<!-- one line per resolved ticket -->

- [<resolved ticket title>](issues/NN-slug.md): <one-line gist of the answer>

## Not yet specified

<!-- in-scope fog you can't phrase sharply yet; graduates as the frontier advances -->

## Out of scope

<!-- ruled beyond the destination; never graduates -->

## For the engineer

<!-- technical questions that surfaced, in plain words. Not answered here. -->
```

### Tickets

Open tickets are not listed on the map; they are files in `issues/` found by scanning.

```markdown
# <Ticket title>

Type: research | prototype | grilling | task
Status: open | claimed | resolved
Blocked by: NN, NN

## Question

<the product question this ticket resolves, sized to one session>
```

- **Claim**: set `Status: claimed` and save before any work, so concurrent sessions skip it.
- **Blocked by**: a ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: open, unblocked, unclaimed tickets. First by number wins.
- **Resolve**: append the answer under `## Answer`, set `Status: resolved`, then add a gist and link to the map's **Decisions so far**.

## Ticket types

**HITL** tickets are worked with the human, who speaks for themselves; you never answer your own questions. **AFK** tickets run alone.

- **Grilling** (HITL): conversation, the default. Call the Skill tool for `grilling`, with the one-question rule above.
- **Research** (AFK): facts outside the repo that a decision waits on: how competitors do it, industry norms, rules and regulations. Resolved by a subagent calling the Skill tool for `research`. Frame the question in product terms.
- **Prototype** (HITL): a rough, concrete screen or flow to react to when "how should it look" or "how should it feel" is the key question. Call the Skill tool for `prototype` (UI branch). Walk the user through opening it and flipping between variants with no jargon, then ask one question at a time what they liked, disliked, and want to keep. Record the branch, how to run it, the preferred variant, and their verdict in their own words in the answer.
- **Task** (HITL or AFK): real-world work a decision waits on, with nothing to decide. Examples: ask three customers a question, pull last month's numbers from a report. Give the human a precise plain-language checklist; resolve when they bring back the facts.

## Fog of war

The map is deliberately incomplete: don't chart what you can't yet see. **Not yet specified** holds decisions you can tell are coming but can't phrase sharply, because they hang on open questions. Resolving a ticket clears the fog ahead of it, graduating what's now specifiable into tickets.

- **Ticket when** you can state the question precisely now, even if you can't answer it yet.
- **Fog when** you can't phrase it sharply. Don't pre-slice fog into ticket-sized pieces.

Work beyond the destination is **Out of scope**, not fog. Close any ticket that turns out to sit past the destination and leave one line under **Out of scope**: the gist, why, and a link. It never goes in Decisions so far.

## Invocation

Two modes. Never resolve more than one ticket per session, except research tickets.

### Chart the map

The user invokes with a loose idea.

1. **Name the destination.** Interview (one question at a time) to pin down what this map is finding its way to. The destination fixes the scope, so settle it first.
2. **Map the frontier.** Go breadth-first: surface the open product decisions across the whole space and the first questions takeable now. If no fog appears and the whole thing fits one session, don't make a map: tell the user to run `/create-intent` instead.
3. **Create `map.md`** with Destination and Notes filled in, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now**, then wire `Blocked by` in a second pass.
5. **Fire the research subagents** for each `research` ticket created, in parallel.
6. Stop. Charting is one session's work; it resolves nothing by hand. Tell the user to run `/roadmap .scratch/<effort-slug>/map.md` for the next session.

### Work through the map

The user invokes with a map path. A ticket is optional: without one, you pick the next one.

1. Load the map (low resolution, not every ticket).
2. Choose the ticket: the named one, else the first on the frontier. Claim it.
3. Resolve it. Zoom into any related resolved ticket on demand.
4. Record the resolution (see Tickets) and update the **Roadmap** if the answer changes what's in or its order.
5. Add newly surfaced tickets (create, then wire); graduate fog the answer made specifiable, removing it from **Not yet specified**; rule out of scope what turned out to be past the destination; update or delete tickets the decision invalidates.

## When the map clears

No tickets remain and the fog is gone. Then, for each feature in the **Roadmap**:

1. Write `.scratch/<feature-slug>/intent.md` using the `create-intent` template, filled from the resolved tickets (never invent). Anything unresolved goes to its **Open questions**.
2. Replay the roadmap and each intent back in a short plain summary and ask: "Is this what you mean? Anything missing or wrong?" Fix and re-ask until an explicit yes. Only then set `Status: confirmed`; before that, `Status: draft`.
3. Link each intent from the **Roadmap** on the map.

Tell the user the map and intent paths and that the engineer will pick them up. The **For the engineer** section goes with them. Don't offer to design or build anything.

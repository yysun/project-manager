---
name: brd-writer
description: Write and review clear, human-readable Business Requirements Documents (BRDs) for software features, workflow changes, and redesigns. Use when turning product context into a concise decision document with explicit scope, business rules, acceptance criteria, open questions, and only the engineering detail the audience needs.
---

# BRD Writer

Write a BRD that helps people make a decision and build the right thing. It should read like a capable
product partner wrote it for this specific team, not like a completed template.

## Working Principles

- Start with the reader, the decision, and the business problem. Standards support the document; they
  do not determine its shape.
- Use the smallest document that makes scope, behavior, and unresolved decisions clear. Default to the
  lightest viable format.
- Lead with a short narrative. Add tables, IDs, formulas, diagrams, or Gherkin only when they make a
  real ambiguity easier to see or test.
- Use the terms found in the source material and explain unfamiliar acronyms once.
- Separate known facts, recommendations, assumptions, and open questions. Never present an inference
  as an agreed requirement.
- Preserve engineering precision without forcing implementation detail into a business decision
  document.

## Before Writing

Establish four things from the supplied material:

1. Who will read or approve the BRD?
2. What decision or delivery outcome must it enable?
3. What is known about today's workflow and its problem?
4. Which constraints or decisions are still unknown?

Ask up to three targeted questions only when the missing answers would materially change scope or
behavior. Otherwise, draft with a clearly labeled assumption or open question. Do not claim to have
inspected production, APIs, analytics, designs, or regulations unless that evidence was actually
available.

## Choose the Document Size

Pick the smallest level that fits the risk. Do not print the level in the BRD unless the team uses it
as document control.

| Level | Use it when | Typical shape |
| :--- | :--- | :--- |
| **Brief** | One workflow, a small change, or a decision that fits in one sitting | Summary, outcome, scope, requirements, acceptance, open questions |
| **Standard** | Several workflows or teams need shared context and boundaries | Brief sections plus current state, business rules, dependencies, risks, and measured success |
| **Controlled** | Regulatory, migration, contractual, or cross-system traceability is required | Standard sections plus formal approvals, requirement IDs, traceability, detailed risk controls, and appendices |

Section count is not a measure of quality. Omit empty, repetitive, and irrelevant sections.

## Draft the Narrative Spine

Most BRDs should use this order, with headings adapted to the team's language:

### Summary

In two or three short paragraphs, state the problem, the intended change, who benefits, and the
decision being requested. A busy stakeholder should understand the point of the document here.

### Why This Matters

Describe the current situation using available evidence. Connect the problem to an observable cost,
risk, user difficulty, or missed opportunity. Do not pad the section with generic business value.

### Outcome and Success

State the desired business outcome before listing features. Use measurable success criteria only when
there is a real baseline, target, owner, or decision to establish one. Never invent a percentage,
latency target, adoption goal, or deadline to make the BRD look complete.

### Scope

Use concise `In scope` and `Out of scope` lists. Include a boundary only if it prevents a plausible
misunderstanding. Keep future ideas separate from committed scope.

### Requirements

Group requirements by user workflow or business capability, not by a generic template taxonomy. For
each group:

- introduce the user need or business rule in plain language;
- describe normal behavior in the order a person experiences it;
- call out exceptions, permissions, validation, and failure behavior where they matter;
- distinguish a required outcome from a suggested implementation.

Number requirements only when people need to reference, approve, test, or trace them individually.
Use stable IDs in controlled documents; ordinary bullets are easier to read in a brief.

### Acceptance

Write a short list of observable outcomes by default. Use Gherkin only when the team requests it, QA
automation will consume it, or Given/When/Then makes a stateful rule genuinely clearer.

Good acceptance criteria describe behavior and boundaries, not internal code. Include the happy path,
important failure paths, and role or state differences that carry business risk.

### Open Decisions

List only unresolved points that can change scope, behavior, cost, or release readiness. For each one,
name the owner when known, explain why it matters, and offer a recommendation when the evidence
supports one. Do not silently choose an answer for the reader.

## Add Detail Only Where It Earns Its Place

Use optional material according to the work, not according to the document level:

- **Current versus proposed:** Use a compact table when readers need to compare several concrete
  changes. Use prose for one or two changes.
- **Business rules:** Use examples for simple rules, a decision table for interacting conditions, and
  formulas or pseudocode only for exact calculations or state transitions.
- **Fields and data:** Add a field inventory when a redesign, migration, or compatibility requirement
  creates a real risk of data loss. Record only fields verified from available evidence.
- **APIs and systems:** Describe contracts, ownership, dependencies, and data sensitivity when they
  affect the business requirement. Do not design endpoints or schemas unless requested.
- **Non-functional requirements:** Include only relevant accessibility, performance, privacy,
  security, localization, reliability, or operational constraints. Derive thresholds from policy,
  evidence, or an explicit stakeholder decision; otherwise record the threshold as open.
- **Risks:** Prefer a short prioritized list with mitigation and owner. Use a matrix only when the team
  has a defined scoring method.
- **Traceability:** Add requirement IDs and a traceability matrix when auditability or multi-system
  delivery warrants the overhead.
- **Delivery controls:** Include Definition of Ready, Definition of Done, Scrum, or SAFe artifacts only
  when the delivery team uses them. Do not treat process ceremony as a business requirement.

Put dense inventories and traceability material in appendices so the main document remains readable.

## Writing Style

Write like an experienced colleague, not a content generator. Optimize for being useful, precise, and
easy to skim, not for sounding polished.

- Put the conclusion, decision, or requested action first.
- Be direct, concrete, and concise. Prefer specific nouns and active verbs: "Support agents can reopen
  a closed case for 24 hours" is better than "The solution will facilitate enhanced case-management
  capabilities."
- Do not explain concepts the intended reader already knows.
- For technical and product documents, prefer decisions, requirements, constraints, interfaces,
  examples, and failure cases over explanatory prose.
- Use headings, bullets, tables, and examples only when they improve clarity. Use direct headings such
  as `What changes`, `Who can approve`, or `Questions before launch` when they fit better than formal
  labels.
- Do not force symmetrical sections, parallel wording, or three-item lists. Let the material determine
  the structure.
- Keep one idea in one place. Do not repeat the summary as objectives, business value, benefits, and a
  conclusion.
- Remove filler, motivational language, rhetorical flourishes, generic benefits, and unsupported
  claims.
- Avoid excessive bold and em dashes. Avoid phrases such as "it is important to note," "at its core,"
  "not just X but Y," "robust," "seamless," "holistic," "leverage," and "empower."
- Preserve uncertainty when evidence or decisions are incomplete. Do not manufacture confidence,
  precision, or completeness.
- Do not narrate the drafting process, explain the template, congratulate the reader, or end with a
  generic recap.
- Do not leave placeholder rows, empty headings, or bracketed prompts in a delivered draft.

## Review Pass

Before delivering a BRD, verify:

- the first page makes the problem, proposed outcome, and requested decision clear;
- every requirement is supported by evidence, labeled as an assumption, or listed as an open decision;
- scope and acceptance criteria agree with each other;
- requirements do not prescribe technical implementation without a business reason;
- cross-references, IDs, terms, and numbers are consistent;
- tables can be understood without decoding excessive columns;
- the document contains no invented fields, metrics, policies, approvals, or current-state behavior;
- deleting any remaining section would remove information a reader needs;
- every sentence adds a fact, decision, requirement, constraint, rationale, example, or useful
  implication.

When reviewing an existing BRD, lead with the few issues that could cause a wrong decision or build.
Then suggest specific edits. Do not replace a recognizable authorial voice with generic corporate prose.

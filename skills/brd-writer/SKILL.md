---
name: brd-writer
description: Standardized guide and template for authoring comprehensive, engineering-ready Business Requirements Documents (BRDs). Enforces IIBA BABOK v3 analytical rigor and Agile (Scrum/SAFe) delivery standards with adaptive tier sizing (Light, Standard, Enterprise). Use when drafting, reviewing, or structuring BRDs for software features or redesigns.
---

# Business Requirements Document (BRD) Writer Skill

This skill guides AI agents in drafting, evaluating, or refining Business Requirements Documents (BRDs). It bridges IIBA BABOK v3 analytical rigor with Agile (Scrum/SAFe) delivery practices while enforcing adaptive document sizing to avoid bloat.

---

## 1. Quick Decision Matrix: Document Sizing

Before drafting, assess the request complexity and select the appropriate BRD tier:

| Tier | Scope / Context | Included Sections |
| :--- | :--- | :--- |
| **Tier 1: Lightweight** | Small UI tweaks, bug fixes, single-sprint items | Header, Objectives, Scope, Functional Rules (Pseudocode), Gherkin Acceptance Criteria, DoR/DoD Checklist. |
| **Tier 2: Standard** *(Default)* | Feature additions, page redesigns, multi-sprint items | Header, Objectives, Scope, Gap Matrix (Current vs Proposed), Functional Rules, Field Inventory Matrix, NFRs, API Impacts, Gherkin Criteria, DoR/DoD. |
| **Tier 3: Enterprise** | Platform overhauls, multi-system migrations, compliance | All Tier 2 sections + User Personas/Value Stream, Business Rules Decision Table, Risk Matrix, RTM, SAFe Epic Map. |

---

## 2. Core Execution Workflow for Agents

When requested to write or review a BRD:
1. **Audit Inputs:** Compare live production UI/APIs with mockups field-by-field.
2. **Select Tier:** Pick Tier 1, 2, or 3 based on scope complexity.
3. **Draft Field Inventory (Appendix A):** Log every field (`Production` vs `Mockup`) to ensure zero field regression.
4. **Define Business Logic:** Express non-trivial calculations, scoring, or state transitions in formulas or pseudocode.
5. **Draft Gherkin Criteria:** Write `Given-When-Then` test scenarios for QA automation.
6. **Log Open Decisions:** Present explicit options and recommended answers for unresolved product questions.

---

## 3. Section Specifications & Templates

### Document Header & Control
```markdown
# Business Requirements Document: [Feature Name]

| Field | Detail |
| :--- | :--- |
| **Status** | [Draft for Review / Final] |
| **BRD Tier** | [Tier 1: Lightweight / Tier 2: Standard / Tier 3: Enterprise] |
| **Author** | [Name / Role] |
| **Target System & Release** | [System Name] | [Release / Sprint / PI] |
```

### Current vs. Proposed State Gap Matrix (Tier 2 & 3)
```markdown
| Feature Area | Current (Production) | Proposed (Redesign) | Business Value | Priority (MoSCoW) |
| :--- | :--- | :--- | :--- | :---: |
| [Area] | [Current behavior] | [Proposed behavior] | [Rationale] | [Must/Should] |
```

### Functional Requirements & Logic (All Tiers)
* **Scoring / Math Formulas:** Provide exact mathematical equations (e.g., $\text{Completion \%} = \dots$).
* **State Management:** Define dirty state triggers, validation rules (on blur vs on submit), and save state messaging.

### Business Rules Decision Table (Tier 3)
```markdown
| Rule ID | Category | Trigger / Event | Condition | Expected System Output |
| :---: | :--- | :--- | :--- | :--- |
| **BR-01** | Null Guard | Render Field | Value is `null` | Render placeholder; never display `"undefined"` |
```

### Non-Functional Requirements (NFRs) (Tier 2 & 3)
* **Responsive:** Explicit breakpoint behavior (`Desktop >=1024px`, `Tablet 768-1023px`, `Mobile <768px`).
* **Performance:** Time-to-Interactive (TTI) `< 1.5s`; DOM node virtualization rules.
* **Accessibility (a11y):** WCAG 2.1 AA contrast (`>=4.5:1`), keyboard tab order, screen reader `aria-live` regions.
* **i18n & Security:** Bilingual support (EN/FR); client/server input sanitization.

### Data Model & API Impact (Tier 2 & 3)
```markdown
| Field Name | Data Type | DB Impact | API Endpoint Impact | Security / PII |
| :--- | :--- | :--- | :--- | :---: |
| [field_name] | [Type] | [New column / Reused] | [GET/PUT Endpoint] | [PII / None] |
```

### Risk Assessment Matrix (Tier 3)
```markdown
| Risk ID | Description | Impact | Likelihood | Mitigation Strategy |
| :-: | :--- | :---: | :---: | :--- |
| **RSK-01** | [Description] | [High/Med] | [High/Med] | [Action plan] |
```

### Requirements Traceability Matrix (RTM) (Tier 3)
```markdown
| Need ID | BRD Req ID | Feature Area | Data / API Target | Test Scenario ID |
| :---: | :---: | :--- | :--- | :--- |
```

### Acceptance Criteria (Gherkin Format) (All Tiers)
```gherkin
Scenario: [Scenario Description]
  Given [initial context]
  When [action taken]
  Then [expected outcome]
  And [additional condition]
```

### Definition of Ready (DoR) & Definition of Done (DoD) (All Tiers)
* **DoR:** Stakeholder approval, DB schema verified against field matrix, mockup breakpoints defined, open questions closed.
* **DoD:** All Gherkin tests passing, zero field regressions, WCAG 2.1 AA audit passed, i18n keys verified.

### Appendix A: Field Inventory Matrix (Tier 2 & 3)
```markdown
| Section | Field Name | In Prod | In Mockup | Field Type & Validation | Action Required |
| :--- | :--- | :---: | :---: | :--- | :--- |
| [Section] | [Field Name] | [Yes/No] | [Yes/No] | [Input Type, Required*] | [Retain / New Field / Add] |
```

---

## 4. Quality Rules for Agents (Strict Verification)

When generating BRD content, enforce the following quality constraints:
- ❌ **NO Phantom Cross-References:** Verify all section numbers referenced in text actually exist.
- ❌ **NO Contradictions:** Ensure open questions do not conflict with the Field Inventory Matrix.
- ❌ **NO Vague Rules:** Never write "logic TBD"—always provide a default formula or decision options.
- ❌ **NO Field Dropping:** Every existing production field MUST be explicitly accounted for in Appendix A.
- ❌ **NO Unfocused Templates:** Strip out irrelevant tables for Tier 1 lightweight requests.

# Project State Contract

This reference defines the v1/v2 project contract, the v1 optional-module contract with v2 risks, and
v1/v2/v3 task collection contracts. Scripts fail closed on unsupported versions, unknown fields,
malformed records, escaping paths, and inconsistent lifecycle.

## Project boundary

Every ordinary project command requires an explicit project folder:

- Resolve it with `realpath`.
- Known state entries must be regular, non-symlink descendants of that root.
- Searching for a repository or reading siblings is out of bounds.

Two commands select rather than receive a folder:

- **Studio** validates selectable direct-child projects under `--projects-root`, or the default
  `<launch-working-directory>/.projects`.
- **`execute-rpd`** may use `project-resolve.js` to resolve one exact case-insensitive name, ID, or
  direct-child folder from the calling context's validated `.projects` root.

Both fail on zero matches and on multiple matches. Neither scans recursively, and neither falls back
to a bare `projects` directory.

**Work roots.** Atomic updates and Studio checks allocate unique marker-bound
`.project-manager-work-<24-hex>` siblings on the same filesystem. These recovery roots are not
projects, never reuse a selected project path, and are removed independently after successful work.
A valid project stays selectable even when its basename resembles the work-root pattern.

**Files.** `PROJECT.md`, `TASKS.md`, and `STATUS.md` are required. Optional modules are additive.

## PMI tailoring

`PROJECT.md` schema version 2 requires a `tailoring` object declaring every one of the ten PMBOK 6
knowledge areas exactly once: `integration`, `scope`, `schedule`, `cost`, `quality`, `resource`,
`communications`, `risk`, `procurement`, `stakeholder`. Each entry is exactly
`{"applied":boolean,"rationale":null|string,"decided":"YYYY-MM-DD"}`. A tailored-out area
(`applied:false`) requires a non-empty rationale; an applied area may leave it null.

Tailoring is declare-only. It never requires that an area be practiced, never requires module content,
and never enters the task specification hash or Task Contract. Its only job is to prove an omission was
a decision rather than an oversight.

Configuring a module whose area is declared tailored out fails validation `TAILORING_CONTRADICTION`.
Only unambiguous pairs are bound: `risk → RISKS.md` and `stakeholder → STAKEHOLDERS.md`. `MILESTONES.md`
is deliberately unbound because milestones serve scope and integration reporting, not schedule alone.

Schema version 1 keeps its exact historical field set, rejects `tailoring` as an unknown field, and
needs no migration. Its status and report facts declare tailoring `{"declared":false}` and record an
explicit unknown rather than implying an area is applied.

## Markdown grammar

- Frontmatter keys match `[a-z][a-z0-9_]*`. Values are complete single-line JSON.
- Collection records use `## ID - title` immediately followed by one fenced `json` object.
- Narrative after the metadata block is ignored until the next level-two heading.
- Project and task IDs match `^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$` — 2–64 characters, no trailing
  hyphen.
- Namespaced IDs use the same bound with `SC-`, `M-`, `RISK-`, `DEC-`, `SRC-`, `CHG-`, `ASM-`,
  `ISS-`, `STK-`, `LES-`, and `CLO-`.

## Task defaults

Required: non-empty `outcome` and unique non-empty `acceptance` strings.

Defaults: planned, P2, human executor, null owner/milestone/schedule/audit dates/pointers, false critical, and empty dependencies, blockers, sources, success mappings, constraints, and tracker refs. Exact field rules are enforced by `project-state.js`.

## Lifecycle

`planned`, `ready`, `in_progress`, `implemented`, `verification`, `verified`, `done`.

- `ready` requires finished dependencies and no explicit blockers.
- Contract issuance is the only evidence-free transition, and it starts work.
- Every later transition requires the latest valid manifest.
- `done` additionally requires completed dependencies and no blockers.

**Profiles** select the human completion policy:

- `minimal` and `standard` allow atomic lightweight completion for eligible never-started human tasks.
- `controlled` requires governed human execution.
- Agent, external, and RPD execution is governed in every profile.
- Lightweight completion still creates the exact existing Task Contract and first verified Evidence
  Manifest. An evidence-free `done` state is never reachable.

**Disposition** is orthogonal to lifecycle. Absence means active.

- Deferred and cancelled tasks are not actionable.
- A cancelled task is closed for milestone and project completion, but it satisfies no dependency and
  no success criterion.
- Cancelled mappings are removed before success and traceability calculation.
- A criterion is verified when it keeps at least one mapping and every remaining mapping is
  evidence-backed done.

## Evidence boundary

- Contracts and manifests use canonical compact JSON with recursively sorted object keys.
- IDs are SHA-256 hashes of canonical payloads.
- Attempt files are immutable.
- Evidence records are exact `{kind,ref,result,sha256}` objects.
- File and artifact evidence require a hash.
- Provider requirements are cumulative staged any-of groups.
- Acceptance mappings reuse records from the main evidence array exactly.
- The replay fingerprint is SHA-256 of canonical `{evidence,acceptance_evidence,sources}`. Time,
  notes, status, and sequence cannot disguise reused evidence.

## Deterministic outputs

All six reporting and validation scripts are read-only and accept
`node <script> <project-folder> [--json] [--help]`.

Exit codes:

- `0` — success.
- `1` — semantic invalidity.
- `2` — selector, path, I/O, or grammar failure.

Envelopes:

- A JSON failure carries `errors` and no `data`.
- A success carries `data` and no `errors`.
- Status and report data use schema version 3, exposing the tailoring declaration and the assumption,
  issue, stakeholder, lesson, and closure modules alongside profile policy, disposition counts, and
  detailed lifecycle counts.
- Report data records one explicit unknown per tailored-out area carrying its rationale, and one for
  undeclared tailoring on a schema-version-1 project.

See each script's output and `--help` for the locked envelope. Optional modules report `{configured:false}` rather than invented zeroes.

`project-report-data.js` includes stable `ownership:[{task_id,owner}]` for every task. A null owner remains visible; reports must not infer or hide it.

`project-resolve.js <projects-root> <project-name|id|folder> --json` is a separate read-only selection
utility. It validates the complete direct-child catalog before matching and returns one canonical
project root. `PROJECT_NAME_NOT_FOUND` and `PROJECT_NAME_AMBIGUOUS` are semantic failures; they never
trigger fuzzy matching or filesystem search.

## Agent execution command contract

The installable skill provides two agent-specific write commands. They are deterministic project-state
adapters, not an agent runtime or scheduler:

```bash
node <absolute-skill-dir>/scripts/project-start-agent.js <project-folder> <task-id> [--created-at <RFC3339-UTC>] [--retry-blocker <exact-blocker>|--retry-blocker=<exact-blocker>] [--json] [--help]
node <absolute-skill-dir>/scripts/project-ingest-agent-manifest.js <project-folder> <task-id> [--json] [--help]
```

Start success has the exact shape
`{ok:true,command:"start-agent",project:{id,root},data:{task_id,status,contract_id,contract_path,retry}}`.
Ingest success has the exact shape
`{ok:true,command:"ingest-agent-manifest",project:{id,root},data:{task_id,status,contract_id,manifest_id,manifest_path,sequence}}`.
Without `--json`, success is a concise human-readable summary. Errors always write exactly one JSON
envelope to standard error and nothing to standard output:
`{ok:false,command,project:null|{id,root},errors:[{code,path,message,usage}]}`.
Semantic eligibility, evidence, and concurrency failures exit 1. Command syntax, standard-input
grammar, selector/path, and unexpected grammar/I/O failures exit 2. `--help` must be the sole argument,
prints usage to standard output, and exits 0; duplicate/unknown flags, missing values, wrong positional
counts, or mixed help/execution fail with exit 2.

Ingest accepts exactly one manifest payload JSON object from standard input followed only by
whitespace. It rejects empty, malformed, scalar, multiple, or trailing-non-whitespace input. The
payload uses the Exact Evidence Manifest schema below; no relaxed agent evidence schema exists.

Both commands require an active project, provider `agent`, and active task disposition. Normal start
accepts only an unblocked, dependency-complete `ready` task with no active current-specification
pointers. Retry requires `--retry-blocker` to exactly clear the sole blocker from the active terminal
blocked attempt and issues a new, strictly later contract without changing prior attempt bytes. Ingest
validates the exact active contract, gap-free sequence, task/source bindings, typed evidence,
acceptance mappings, replay fingerprint, and staged source bytes. It never copies artifacts. Verified
evidence reaches `done` only when dependencies are complete and no blocker exists; otherwise it remains
`verified`. Blocked evidence keeps lifecycle `in_progress` and preserves other blockers.
Use `--retry-blocker=<exact-blocker>` when the blocker text itself begins with `--`; the equals form
removes flag ambiguity while preserving the blocker exactly.

When the latest `CHANGES.md` record requires re-verification, start atomically changes its binding from
`pending` to `in_progress`, retry rebinds it to the distinct later contract, and only a verified
manifest supporting `done` changes it to `complete`. Other ingestion stages retain `in_progress`.

Host orchestration adds a narrower worker-return protocol: one bounded worker for one dependency-ready
agent task returns exactly one canonical terminal (`verified` or `blocked`) manifest payload object, at most
65,536 serialized UTF-8 bytes with no JSON string over 8,192 UTF-8 bytes. Those bounds do not apply to
direct CLI ingestion. Workers receive minimal task-local context and never edit authoritative project
state. Capacity, dependency, executor-root, artifact-target, and external-write isolation are proved
before contract issuance; shared or uncertain mutation surfaces serialize. A null root permits only
filesystem-read-only or explicitly targeted non-filesystem work without local write authority.
Generated project-local or executor-local execution helpers are prohibited.

## Exact core schemas

`PROJECT.md` v1 frontmatter has exactly:

```json
{"schema_version":1,"id":"PROJECT-ID","name":"Name","status":"planning|active|on_hold|complete","owner":null,"start_date":null,"target_date":null,"current_milestone":null,"profile":"minimal|standard|controlled","adapters":["human"],"created":"YYYY-MM-DD","updated":"YYYY-MM-DD"}
```

`PROJECT.md` v2 is the strict superset adding exactly one required key, `tailoring`:

```json
{"schema_version":2,"id":"PROJECT-ID","name":"Name","status":"planning|active|on_hold|complete","owner":null,"start_date":null,"target_date":null,"current_milestone":null,"profile":"minimal|standard|controlled","adapters":["human"],"created":"YYYY-MM-DD","updated":"YYYY-MM-DD","tailoring":{"integration":{"applied":true,"rationale":null,"decided":"YYYY-MM-DD"},"cost":{"applied":false,"rationale":"No project budget","decided":"YYYY-MM-DD"}}}
```

The example elides areas for readability; a real record declares all ten.

Follow it with non-empty `## Objective` and `## Success Criteria`; every non-blank criterion line is exactly `- [SC-ID] text` and IDs are unique.

`TASKS.md` schema v1 task metadata permits only `outcome`, `acceptance`, `status`, `priority`, `milestone`, `owner`, `executor`, `depends_on`, `blocks`, `blocked_by`, `sources`, `success_criteria`, `constraints`, `evidence_requirements`, `external_refs`, `critical`, `active_contract`, `last_manifest`, `created`, and `updated`.

`TASKS.md` schema v2 permits the same fields plus `scheduled_start` and `scheduled_end`. Both schedule
keys are absent or both are valid date-only strings, and start must not be after end. Schedule ranges
are inclusive. Schedule fields are planning metadata excluded from the task specification hash and
Task Contract. V1 rejects them; v2 rejects explicit nulls and partial pairs.

`TASKS.md` schema v3 is the strict superset of v2. It permits the same schedule pair plus
`disposition` and `disposition_changed_at`. The disposition pair is absent for active work or exactly
`"deferred"|"cancelled"` plus an RFC3339 UTC timestamp. Explicit active/null and partial pairs are
rejected. Disposition fields are excluded from the task specification hash. A non-active task's contract
and every stored manifest must not be newer than its disposition timestamp. V1/v2 reject disposition fields
and retain their prior normalized shape so unchanged STATUS caches do not become stale.

`TASKS.md` schema v4 is the strict superset of v3. It permits the same schedule and disposition
fields plus `order`, a positive integer holding the task's Timeline row order. Absence is normal: a
task with no `order` takes a default generated from the derived arrangement, and neither density nor
uniqueness is required of a hand-edited file. Order fields are excluded from the task specification
hash and Task Contract, and never affect ranking, coverage, or actionability. V1/v2/v3 reject `order`
and retain their prior normalized shapes so unchanged STATUS caches do not become stale.

For all task schemas, `outcome` and `acceptance` are required. Executor is `{provider,root,scope}`:
human uses null root/scope; external roots use `scope:"absolute"`; a project-contained executor uses
`scope:"project"` and a safe relative root. Evidence requirement groups are exactly
`{stage:"implemented|verification|verified",any_of:[evidence kinds],minimum:positive integer}` in
cumulative stage order.

## Exact optional schemas

Optional record files use collection frontmatter `schema_version: 1`, except `RISKS.md` which also
accepts `schema_version: 2`; task schemas v2/v3/v4 are valid only for `TASKS.md`.

- Milestone: `{status:"planned|active|complete",target_date:null|date,forecast_date:null|date,forecast_updated:null|date,forecast_evidence:[evidence records],critical:boolean}`. Forecast fields are all absent/null or all populated.
- Risk v1: `{status:"open|mitigated|accepted|closed",probability:"low|medium|high",impact:"low|medium|high",mitigation:string,owner:null|string,milestone:null|M-ID}`.
- Risk v2 adds `{direction:"threat|opportunity",strategy:null|strategy,trigger:null|string,residual:null|"low|medium|high"}`. Threat strategies are `avoid|transfer|mitigate|accept|escalate`; opportunity strategies are `exploit|share|enhance|accept|escalate`. A strategy that contradicts its direction is rejected. V1 rejects all four fields and keeps its exact normalized shape, so adding response-strategy support cannot change an existing project's source hash.
- Assumption (`ASM-`): `{status:"open|confirmed|invalidated",kind:"assumption|constraint",statement:string,impact_if_false:string,owner:null|string,due_date:null|date,validated_date:null|date,affects:[typed references]}`. `validated_date` is populated exactly when status is no longer `open`.
- Issue (`ISS-`): `{status:"open|in_progress|resolved|closed",severity:"low|medium|high|critical",description:string,owner:null|string,raised_date:date,due_date:null|date,resolved_date:null|date,resolution:null|string,affects:[typed references],escalated:boolean}`. `resolved_date` and `resolution` are populated exactly when the issue is resolved or closed, and resolution cannot precede the raise date. Issues are distinct from task `blocked_by` strings, which remain the execution-level blocker mechanism.
- Stakeholder (`STK-`): `{role:string,organization:null|string,interest:"low|medium|high",influence:"low|medium|high",current_engagement:level,target_engagement:level,strategy:null|string,owner:null|string}` where level is `unaware|resistant|neutral|supportive|leading`. A declared engagement gap (current differs from target) requires a non-empty strategy.
- Lesson (`LES-`): `{category:"process|technical|communication|estimation|risk|other",statement:string,recommendation:string,date:date,source_tasks:[TASK-ID],source_milestone:null|M-ID}`.
- Closure (`CLO-`): `{scope:"project|milestone",milestone:null|M-ID,status:"pending|accepted",accepted_by:null|string,accepted_date:null|date,acceptance_evidence:[evidence records],outstanding_items:[string],archive_ref:null|string}`. A milestone scope names a milestone and a project scope does not. Accepted closure requires an acceptor, a date, and at least one evidence record; pending closure binds none. An accepted project closure requires project status `complete`, and an accepted milestone closure requires that milestone complete. At most one project-scoped record exists and each milestone has at most one.

- Run (`RUN-`): `{status:"active|blocked|complete|abandoned",started:"RFC3339 UTC",updated:"RFC3339 UTC",repositories:[{name,integration_branch,base_branch,base_commit,coordinator_worktree}],tasks:{"TASK-ID":{branch:string,executor_root:absolute path,integrated:boolean}}}`. `updated` cannot precede `started`; `base_commit` is a full Git object ID, never an abbreviation; repository names are unique; `executor_root` is absolute. Every task key must exist in `TASKS.md`, and `integrated:true` requires that task to be `verified` or `done`. At most one run is `active` at a time, so a new run cannot silently open beside an unfinished one. `RUNS.md` is optional: a project with no agent execution never has one, and an absent run record contributes nothing to the project source hash.

Typed references reuse the decision form `project|task|milestone|risk|source|success:ID` and must
resolve within the selected project.
- Decision: `{status:"proposed|decided|superseded",decision:string,owner:null|string,due_date:null|date,date:null|date,affects:["project|task|milestone|risk|source|success:ID"]}`.
- Source: `{kind:"document|pdf|sheet|requirement|specification|code|url|other",location:string,role:string,status:"current|superseded",version:null|string,sha256:null|lowercase-64-hex}`.
- Change: `{date:date,observed_at:"RFC3339 UTC",sources:[SRC-ID],affected_tasks:[TASK-ID],affected_milestones:[M-ID],reverify_tasks:[TASK-ID],reverification:{"TASK-ID":{"status":"pending|in_progress|complete","contract_id":null|tc-ID,"manifest_id":null|em-ID}},risk_summary:string}`. The timestamp must fall on `date`; same-task changes cannot share a timestamp. Pending binds no evidence; in-progress binds a contract created strictly after the change; complete binds that contract and its verified manifest. Only the latest change by timestamp per task constrains current lifecycle.
- Traceability frontmatter is exactly `{schema_version:1,items:[{source_id,criterion,tasks}]}`. Pairs are unique and ordered by source then criterion; task arrays are unique and lexical.

Evidence records are exactly `{kind:"file|command|review|artifact|approval|note|commit",ref:string,result:string,sha256:null|lowercase-64-hex}`. File/artifact evidence requires a hash.

Evidence Manifest payloads accept `schema_version` 1 or 2. Version 2 adds exactly one field,
`execution: {llm_calls,tool_calls,input_tokens,output_tokens}`, each a non-negative integer or
`null`. Version 1 keeps its exact historical key set and rejects `execution`, so every manifest
already on disk still validates — stored manifests are re-validated on every read. Counts are
incremental per manifest, so an attempt's total is the sum of its manifests, a task's total is the
sum of its attempts, and a run's total is the sum of its tasks. `null` means the executor did not
report that count and is carried as an explicit unreported tally, never folded in as zero. Execution
telemetry is excluded from the evidence fingerprint, so it cannot affect replay detection, and it is
observational only: no readiness, ranking, gating, or completion decision reads it.

## Discovery index

Workspace `PROJECTS.md` is optional and non-authoritative. It uses collection grammar; each record metadata is exactly `{"path":"relative/non-escaping/path"}`. Paths are relative to the index folder. Reject absolute, missing, duplicate, symlinked, escaping, or ID-mismatched targets. Ordinary project commands never read this index.

Studio root discovery is separate from `PROJECTS.md`: it validates each real direct-child directory,
rejects symlinked or malformed children and duplicate project IDs, and issues opaque browser selection
keys. Browser requests never submit filesystem paths. The default projects root is `.projects`.
Unique marker-bound `.project-manager-work-<24-hex>` roots keep same-filesystem check/transaction
recovery artifacts from making the catalog invalid after interruption without reserving a legitimate project basename.

## Exact Task Contract

Canonical payload:

```json
{"schema_version":1,"project":{"id":"PROJECT-ID","root":"/canonical/root"},"task":{"id":"TASK-ID","spec_sha256":"64hex","title":"Title","outcome":"Outcome","constraints":[],"acceptance":[],"success_criteria":[],"milestone":null,"critical":false,"sources":[{"id":"SRC-ID","version":null,"record_sha256":"64hex","content_sha256":null}],"dependencies":[],"evidence_requirements":[],"executor":{"provider":"human","scope":null,"declared_root":null,"root":null}},"created_at":"RFC3339 UTC"}
```

Envelope frontmatter is exactly `schema_version`, `contract_id`, `payload_sha256`, `story`, `executor_prompt`, and `executor_prompt_sha256`, followed by `## Payload` and one canonical single-line JSON block. Non-RPD derived values are null. RPD values are deterministic and hash-checked.

Use `buildTaskContract`, `deriveStory`, `renderRpdPrompt`, and `formatTaskContract` from `scripts/lib/contracts.js`. Write only to a new `handoffs/<task>/<contract>/TASK-CONTRACT.md`; never overwrite.

## Exact Evidence Manifest

Canonical payload:

```json
{"schema_version":1,"sequence":1,"contract_id":"tc-64hex","project":{"id":"PROJECT-ID"},"task":{"id":"TASK-ID","spec_sha256":"64hex"},"status":"implemented|verification|verified|blocked","blocker":null,"evidence":[],"acceptance_evidence":{"exact acceptance string":[]},"sources":[{"path":"project/relative","sha256":"64hex","role":"role"}],"observed_at":"RFC3339 UTC","notes":[]}
```

Envelope frontmatter is exactly `schema_version`, `manifest_id`, `payload_sha256`, and `evidence_sha256`, followed by the canonical payload block. Use `formatEvidenceManifest`; persist as gap-free `EVIDENCE-001.md`, `EVIDENCE-002.md`, and so on. A blocked manifest's exact blocker must be copied into task `blocked_by`. A retry clears active pointers and issues a new contract without changing old attempt bytes.

For RPD, call `snapshotRpdEvidence` before creating a verified manifest. It requires exact RPD REQ/AP/DD, optional test, exact successful AR/CR/VR terminal lines, and writes only under the new attempt's `rpd-evidence/` folder.

## Safe mutation helpers

Use `atomicProjectMutation` from `scripts/lib/mutations.js`. Its candidate callback receives `{logicalRoot}`. Pass that same logical root when loading an active-attempt candidate or regenerating status:

```js
atomicProjectMutation(projectRoot, (candidate, context) => {
  // edit authoritative candidate files
  regenerateStatus(candidate, timestamp, context);
}, loadProject, { validateLive: loadProject });
```

The helper rejects stale STATUS, changed/deleted immutable handoffs or saved reports, non-empty init targets, and invalid candidates. It derives legal additions from validated before/after task state and the sources referenced by a new valid manifest; callers cannot authorize raw history paths. Brand-new validated contract subtrees and collision-free Markdown reports are allowed. Inactive/terminal attempts accept no additions. If rollback cannot finish, the helper preserves and reports the recovery path instead of deleting the backup.

`scripts/lib/human-completion.js` is the only lightweight completion helper. Its internal CLI adapter is:

```bash
node <absolute-skill-dir>/scripts/project-complete-human.js <project-folder> <task-id> --ref <approval-ref> --result <approval-result> [--observed-at <RFC3339-UTC>] --json
```

It is a `project update` implementation detail, not another user-facing route. It requires a minimal or
standard active project, a never-started active human task, completed dependencies, no blockers/history,
one approval-satisfiable evidence policy, and verifiable bound sources. It uses the same atomic candidate,
immutable attempt, STATUS regeneration, and rollback boundary as other mutations.

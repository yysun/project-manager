# Project State Contract

This reference defines the v1 project/optional-module contract and v1/v2 task collection contracts.
Scripts fail closed on unsupported versions, unknown fields, malformed records, escaping paths, and
inconsistent lifecycle.

## Project boundary

Every command requires an explicit project folder. Resolve it with `realpath`; known state entries must be regular, non-symlink descendants. Never search for a repository or read siblings.

Minimal files are `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Optional modules are additive.

## Markdown grammar

Frontmatter keys match `[a-z][a-z0-9_]*`; values are complete single-line JSON. Collection records use `## ID - title` immediately followed by one fenced `json` object. Narrative after the metadata block is ignored until the next level-two heading.

Project and task IDs match `^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$` (2–64 characters, no trailing hyphen). Namespaced IDs use the same bound with `SC-`, `M-`, `RISK-`, `DEC-`, `SRC-`, and `CHG-`.

## Task defaults

Required: non-empty `outcome` and unique non-empty `acceptance` strings.

Defaults: planned, P2, human executor, null owner/milestone/schedule/audit dates/pointers, false critical, and empty dependencies, blockers, sources, success mappings, constraints, and tracker refs. Exact field rules are enforced by `project-state.js`.

## Lifecycle

`planned`, `ready`, `in_progress`, `implemented`, `verification`, `verified`, `done`.

Ready requires finished dependencies and no explicit blockers. Contract issuance is the only evidence-free transition and starts work. Later transitions require the latest valid manifest. Done additionally requires completed dependencies and no blockers.

## Evidence boundary

Contracts and manifests use canonical compact JSON with recursively sorted object keys. IDs are SHA-256 hashes of canonical payloads. Attempt files are immutable.

Evidence records are exact `{kind,ref,result,sha256}` objects. File and artifact evidence require a hash. Provider requirements are cumulative staged any-of groups. Acceptance mappings must reuse records from the main evidence array exactly.

Replay fingerprint is SHA-256 of canonical `{evidence,acceptance_evidence,sources}`. Time, notes, status, and sequence cannot disguise reused evidence.

## Deterministic outputs

All six scripts are read-only and support `node <script> <project-folder> [--json] [--help]`. Exit 0 is success, 1 is semantic invalidity, and 2 is selector/path/I/O/grammar failure. JSON failures never contain `data`; success never contains `errors`.

See each script's output and `--help` for the locked envelope. Optional modules report `{configured:false}` rather than invented zeroes.

`project-report-data.js` includes stable `ownership:[{task_id,owner}]` for every task. A null owner remains visible; reports must not infer or hide it.

## Exact core schemas

`PROJECT.md` frontmatter has exactly:

```json
{"schema_version":1,"id":"PROJECT-ID","name":"Name","status":"planning|active|on_hold|complete","owner":null,"start_date":null,"target_date":null,"current_milestone":null,"profile":"minimal|standard|controlled","adapters":["human"],"created":"YYYY-MM-DD","updated":"YYYY-MM-DD"}
```

Follow it with non-empty `## Objective` and `## Success Criteria`; every non-blank criterion line is exactly `- [SC-ID] text` and IDs are unique.

`TASKS.md` schema v1 task metadata permits only `outcome`, `acceptance`, `status`, `priority`, `milestone`, `owner`, `executor`, `depends_on`, `blocks`, `blocked_by`, `sources`, `success_criteria`, `constraints`, `evidence_requirements`, `external_refs`, `critical`, `active_contract`, `last_manifest`, `created`, and `updated`.

`TASKS.md` schema v2 permits the same fields plus `scheduled_start` and `scheduled_end`. Both schedule
keys are absent or both are valid date-only strings, and start must not be after end. Schedule ranges
are inclusive. Schedule fields are planning metadata excluded from the task specification hash and
Task Contract. V1 rejects them; v2 rejects explicit nulls and partial pairs.

For both task schemas, `outcome` and `acceptance` are required. Executor is `{provider,root,scope}`:
human uses null root/scope; external roots use `scope:"absolute"`; a project-contained executor uses
`scope:"project"` and a safe relative root. Evidence requirement groups are exactly
`{stage:"implemented|verification|verified",any_of:[evidence kinds],minimum:positive integer}` in
cumulative stage order.

## Exact optional schemas

All optional record files remain collection frontmatter `schema_version: 1`; task schema v2 is valid
only for `TASKS.md`.

- Milestone: `{status:"planned|active|complete",target_date:null|date,forecast_date:null|date,forecast_updated:null|date,forecast_evidence:[evidence records],critical:boolean}`. Forecast fields are all absent/null or all populated.
- Risk: `{status:"open|mitigated|accepted|closed",probability:"low|medium|high",impact:"low|medium|high",mitigation:string,owner:null|string,milestone:null|M-ID}`.
- Decision: `{status:"proposed|decided|superseded",decision:string,owner:null|string,due_date:null|date,date:null|date,affects:["project|task|milestone|risk|source|success:ID"]}`.
- Source: `{kind:"document|pdf|sheet|requirement|specification|code|url|other",location:string,role:string,status:"current|superseded",version:null|string,sha256:null|lowercase-64-hex}`.
- Change: `{date:date,observed_at:"RFC3339 UTC",sources:[SRC-ID],affected_tasks:[TASK-ID],affected_milestones:[M-ID],reverify_tasks:[TASK-ID],reverification:{"TASK-ID":{"status":"pending|in_progress|complete","contract_id":null|tc-ID,"manifest_id":null|em-ID}},risk_summary:string}`. The timestamp must fall on `date`; same-task changes cannot share a timestamp. Pending binds no evidence; in-progress binds a contract created strictly after the change; complete binds that contract and its verified manifest. Only the latest change by timestamp per task constrains current lifecycle.
- Traceability frontmatter is exactly `{schema_version:1,items:[{source_id,criterion,tasks}]}`. Pairs are unique and ordered by source then criterion; task arrays are unique and lexical.

Evidence records are exactly `{kind:"file|command|review|artifact|approval|note|commit",ref:string,result:string,sha256:null|lowercase-64-hex}`. File/artifact evidence requires a hash.

## Discovery index

Workspace `PROJECTS.md` is optional and non-authoritative. It uses collection grammar; each record metadata is exactly `{"path":"relative/non-escaping/path"}`. Paths are relative to the index folder. Reject absolute, missing, duplicate, symlinked, escaping, or ID-mismatched targets. Ordinary project commands never read this index.

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

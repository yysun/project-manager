# Agent Execution CLI E2E Results

Executed: 2026-08-12

## Result

All executable state-adapter and CLI scenarios in `../../test-agent-execution-cli.md` passed against
temporary projects. Host-orchestration scenarios were not runtime-executed: this repository intentionally
provides no scheduler. They received a line-by-line instruction-contract conformance review and are
reported separately below without being mislabeled as E2E passes.

## Scenario Evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| Start without generated glue | Pass | `agent execution starts one immutable attempt...`; contract exists, lifecycle is `in_progress`, `.pm-agent-exec.js` absent. |
| Bounded subagents | Contract conforms; not runtime-executed | `SKILL.md:97-116` assigns one clean/minimal-context worker per dependency-ready agent task and keeps state mutation with the coordinator. |
| Serialize shared/uncertain mutation surfaces | Contract conforms; not runtime-executed | `SKILL.md:118-124` requires shared or uncertain surfaces to serialize. |
| Null-root boundaries | Contract conforms; not runtime-executed | `SKILL.md:121-124` and `track.md:60-63` allow only filesystem-read-only or explicit non-filesystem targets and stop local/uncertain mutation before issuance. |
| Unavailable capacity before issuance | Contract conforms; not runtime-executed | `SKILL.md:101-103` requires retaining the coordinator slot and no mutation when no worker slot exists. |
| Spawn failure after issuance | Contract conforms; not runtime-executed | `SKILL.md:126-131` requires a concrete blocked manifest or a visible unchanged active attempt without fabricated evidence. |
| Malformed worker output | Contract conforms; not runtime-executed | `SKILL.md:110-116` rejects prose, transcripts, malformed/non-object JSON, nonterminal status, and forbids worker project-state writes. |
| Bounded worker output | Contract conforms; not runtime-executed | `SKILL.md:110-114` defines 65,536 serialized UTF-8 bytes and 8,192 bytes per string; `track.md:65-69` keeps those limits out of direct CLI ingestion. |
| Safe uncertain-attempt recovery | Contract conforms; not runtime-executed | `SKILL.md:126-131` permits same-contract redispatch only after proving the old worker terminated and no manifest exists. |
| Unlock next dependency wave | Contract conforms; not runtime-executed | `SKILL.md:97-103,118-124` requires dependency-ready waves; only the verified-to-done state transition is executable here. |
| Human approval gate | Contract conforms; not runtime-executed | `SKILL.md:133-139`, `track.md:89-95`, and `execute-rpd.md:26-29` keep approval human-owned, leave dependents planned until approval, and require separate revalidation plus `planned → ready` coordination before agent or RPD execution. |
| Non-approval human ownership | Contract conforms; not runtime-executed | The same lines prohibit treating all human work as approval-only or forcing custom-evidence work through the lightweight adapter. |
| Ingest verified evidence | Pass | `agent execution starts one immutable attempt...` covers stdin-equivalent payload ingestion through `done` with fresh STATUS. |
| Preserve blocked attempt | Pass | `blocked agent ingestion preserves blockers...` proves exact blocker preservation and terminal attempt behavior. |
| Retry cleared blocker | Pass | The retry test proves a distinct later contract, cleared exact blocker, null new manifest pointer, and byte-identical prior attempt. |
| Maintain re-verification binding | Pass | The retry test proves `pending → in_progress → retry rebind → complete` and preserves unrelated change narrative. |
| Dependency regression retains verified | Pass | `agent ingestion keeps verified work short of done when a dependency regresses`. |
| Explicit blocker retains verified | Pass | `agent ingestion keeps verified work short of done when a blocker appears`. |
| Unsafe start rejection | Pass | Table-driven start matrix covers inactive project, provider/disposition/lifecycle/pointers, dependency/blocker, retry declaration/chronology, re-verification chronology, and contract collision with exact-byte preservation. |
| Invalid ingest rejection | Pass | Table-driven ingest matrix covers project/provider/disposition/lifecycle, binding/tampering, evidence, duplicate/progression/replay, stdin grammar, and missing/mismatched sources with exact-byte preservation. |
| Concurrent change | Pass | Start and ingest conflict injections preserve newer live bytes and add no contract/manifest; replacement-failure injections restore the exact prior tree. |
| Helper-free project and executor roots | Pass | CLI test uses an absolute executor root and asserts `.pm-agent-exec.js` is absent from both roots. |

## Commands

- `npm run test:pm` — 115 passed, 0 failed, 0 skipped.
- `npm run typecheck` — passed.
- `npm run build` — passed; standalone Studio server and client bundles regenerated.
- `node --check skills/project-manager/scripts/lib/agent-execution.js` — passed.
- `node --check skills/project-manager/scripts/project-start-agent.js` — passed.
- `node --check skills/project-manager/scripts/project-ingest-agent-manifest.js` — passed.
- Guide/AI-employee image links use existing PNG assets; Studio screenshot links intentionally remain JPG and their targets exist.

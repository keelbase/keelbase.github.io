# Keelbase Web Layer: Vision and Prototype Status

This repository is the Keelbase web layer currently running at `https://keelbase.github.io`.

This README now treats:

- The 5 March 2026 architecture/spec docs as the requested end state.
- The current codebase as a prototype implementation.

## Source Vision Documents (Requested End State)

The end-state definition is taken from these documents:

1. `1. keelbase_architect_architecture_v2.docx`
2. `2. keelbase_coord_spec_v3.docx`
3. `3. keelbase_ceo_cli_spec_v2.docx`
4. `4. keelbase_coord_deploy_guide_v2.docx`
5. `5. keelbase_architecture_v4.docx`

## Explicit Vision of Keelbase (From Specs)

Keelbase is a protocol-enforced platform for AI-native businesses on NEAR, built around:

- `Vessel` as sovereign unit (one isolated NEAR sub-account + one coordination contract + one governance policy + one treasury + one crew).
- `Coordination contract` as legal and operational spine (Sputnik V2 fork, machine-speed DAO semantics).
- `CEO` as stateless orchestrator (reconstructed every cycle from on-chain snapshot + agent documents).
- `Specialists` and `temp agents` as scoped inference sessions, not persistent daemons.
- `Liaison` as persistent founder interface with relationship memory.
- `Architect` as provisioning and ongoing modification interface (configuration-only permissions).
- `NEAR AI Cloud TEE` as privacy boundary per inference call (no enclave lifecycle managed by Keelbase).
- `NEAR Intents` as settlement/payment rail.

### Platform-level architectural commitments in the docs

- Four-File Agent Standard for persistent agents:
  - `manifest.yaml` (machine load order and trigger map)
  - `identity.yaml`
  - `operations.md`
  - `reference/` docs
- Tiered context loading:
  - manifest first
  - identity always
  - operations per cycle
  - references on demand by trigger
- CEO plan-then-execute cycle:
  - full plan validation
  - plan-commit `AnchorLog` (`PENDING`)
  - execution
  - execution-close `AnchorLog` (`EXECUTED`)
- `vessel_state_graph.yaml` enforced as transition constraint map.
- First-time counterparty gate enforced from `approved_counterparties` in `StateSnapshot`.
- Architect supports both:
  - `Bespoke mode` (single Vessel deployment)
  - `Template mode` (parent platform Vessel + child blueprint/deploy flow)
- Liaison is proactive (not only reactive), multi-channel (`dashboard` + `Telegram`), and maintains encrypted relational memory off-chain.
- Web layer includes human and agent legibility (`llms.txt`, `/agent` endpoints, generated vessel site).

## What This Repo Is Currently (Prototype)

Current implementation is a working internal alpha shell, not full platform parity:

- Static browser desktop shell adapted from agent1c/hedgeyos framework.
- Windowed UI for:
  - Snapshot
  - Recent Proposals
  - Launch New Vessel
  - Created Vessels
  - Talk to a Vessel Agent
- Wallet connect flow (MyNearWallet testnet).
- Vessel registration flow writes metadata/docs and anchors a registration `ANCHOR_LOG`.
- Shared runtime polling of backend `GET /api/overview`.
- Chat via backend `POST /api/chat` with multi-role routing.
- Hitomi bubble wired to Liaison chat.
- Local browser chat memory by `vessel + role`.
- Per-message `Save chat to chain` toggle wired to backend `anchorOnChain`.

## Gap Analysis: Requested End State vs Current Prototype

| Area | Requested End State (Docs) | Current Prototype State |
|---|---|---|
| Vessel identity model | Factory-created alphanumeric vessel IDs (`v7k2m9.keelbase.near`) and full account hierarchy | Uses connected wallet account directly as owner and vessel contract id in launch flow |
| Architect agent | Fully specified agent with own Four-File docs, Bespoke + Template provisioning logic, persistent modification interface | Not implemented as first-class runtime agent; no full Architect onboarding engine in web flow |
| Template mode | Parent/child blueprint lifecycle and deployment path | Not implemented |
| Agent document model | Four-File Standard as canonical runtime source, manifest-first retrieval protocol | Partially represented; prototype currently seeds docs and metadata, but full manifest-first lifecycle is not fully enforced in web layer |
| CEO cycle semantics | Plan validation + plan-commit `PENDING` anchor + execution-close `EXECUTED` anchor + vessel_state transition rules | Worker/chat operate, but full plan-then-execute protocol and strict state-graph enforcement are not fully implemented end-to-end in this repo |
| Specialist model | Three-tier specialist strategy and explicit delegation protocol using specialist manifests/triggers | Role routing exists, but full specialist doc retrieval/delegation trigger engine is incomplete |
| Counterparty gate | Enforced first-time counterparty checks from `approved_counterparties` before FunctionCall/Transfer | Not fully enforced in frontend user flows; partial/ongoing in backend logic |
| Liaison memory | Persistent encrypted relational memory keyed to vessel/founder credentials | Local browser memory only (prototype), not encrypted shared memory layer |
| Liaison channels | Dashboard and Telegram parity with proactive messaging | Dashboard chat only in current web flow; Telegram channel integration not complete |
| Web agent surface | Generated vessel website, `llms.txt`, `/agent` endpoints and machine-readable capabilities | Not implemented in this repo’s current runtime |
| Payment layer | NEAR Intents-native settlement and fee-share model integrated in operations | Not implemented in current web shell flows |
| Production governance depth | Full policy profiles, council mechanics, emergency rules, legal-wrapper alignment | Core pieces are present in concept/contract path, but end-user web UX is still alpha and simplified |

## Practical Interpretation

This repository should be treated as a `functional prototype shell` validating:

- wallet-based onboarding mechanics,
- vessel registration visibility,
- live state/proposals read path,
- role-routed conversational interface,
- early human-in-the-loop UX.

It is not yet the complete Keelbase platform described in the v2/v3/v4 spec set.

## Known Legacy Drift in This Repo

Because this repo was forked from agent1c shell foundations, legacy naming and labels still exist in parts of the codebase (for example old wake-word and shell labels). They are technical debt, not target product language.

## Next Documentation Rule

For this repo, architecture and roadmap decisions should be evaluated against the 5-doc spec set above. If behavior differs, treat docs as target and current code as transitional unless explicitly superseded in writing.

## Parity Implementation Strategy (Cofounder Version, Max 5 Phases)

This version is intentionally pragmatic: ship founder-visible outcomes first, then deepen architecture.

### Phase 1: Contract/UI Alignment and Reliability

Scope:
- Normalize frontend contract consumption for `/api/overview` and `/api/chat`.
- Show explicit `vessel_state`, escalation status, and anchor lifecycle in existing windows.
- Ensure Talk window and Hitomi show the same chat metadata (`anchorEnabled`, role routing, source/model).

Current code anchors:
- `js/keelbase-runtime.js:startKeelbaseRuntime()`
- `apps/keelbase-snapshot/app.js:renderState()`
- `apps/keelbase-talk-agent/app.js` submit + state render
- `js/main.js:sendClippyMessageToLiaison()`
- `apps/ceo-cli/src/services/httpServer.ts` `/api/overview` and `/api/chat`

Docx intent vs realistic path:
- Docx intent: full semantic contract from day one.
- Realistic now: create one normalization layer first (`apps/keelbase-shared/api-contract.js`) so all windows render consistent state before adding new product surfaces.

Pros:
- Fastest quality improvement with minimal risk.
- Reduces UI drift and confusing founder behavior immediately.
Cons:
- Does not advance deep protocol parity yet.
- Mostly UX/consistency work.

### Phase 2: CEO Cycle Protocol Parity (Core Backend)

Scope:
- Implement full plan validation before executing any action.
- Implement paired cycle anchors:
  - plan-commit `PENDING`
  - execution-close `EXECUTED`
- Enforce `vessel_state_graph` transition checks before state updates.

Current code anchors:
- `apps/ceo-cli/src/services/runtime.ts:CeoRuntime.runCycle()`
- `apps/ceo-cli/src/services/actionExecutor.ts`
- `apps/ceo-cli/src/services/anchorLog.ts`
- `apps/ceo-cli/src/services/nearClient.ts`

Docx intent vs realistic path:
- Docx intent: seven-phase cycle with strict protocol semantics.
- Realistic now: first refactor `runCycle()` into explicit orchestrated phases, then add plan objects and validators (`planValidator.ts`, `stateGraph.ts`, `cycleOrchestrator.ts`).

Pros:
- Biggest trust gain for on-chain correctness.
- Creates measurable parity milestones (paired anchors, no partial invalid execution).
Cons:
- Medium-high backend complexity.
- Requires tighter test coverage before rollout.

### Phase 3: Agent Document Runtime Parity

Scope:
- Move to manifest-first retrieval as canonical runtime behavior.
- Implement tiered load order and trigger-based reference loading.
- Remove synthetic fallback document behavior.

Current code anchors:
- `apps/ceo-cli/src/services/runtime.ts:loadDocument()` (current kludge/fallback exists)
- `apps/ceo-cli/src/services/documentStore.ts`
- `apps/ceo-cli/src/services/nearClient.ts:getBlob()`

Kludge to remove:
- `runtime.ts` currently returns synthetic `document-content-for:${documentRef}` when load fails.

Docx intent vs realistic path:
- Docx intent: Four-File standard + strict retrieval protocol.
- Realistic now: build `documentResolver.ts` + `documentCache.ts`, run in shadow mode first, then cut over and delete fallback.

Pros:
- Makes future specialist and Architect flows predictable.
- Reduces hidden runtime drift.
Cons:
- Not founder-visible immediately.
- Requires migration of active document naming and provisioning consistency.

### Phase 4: Liaison Persistence and Proactive Ops

Scope:
- Replace local-only memory as source-of-truth with encrypted off-chain memory.
- Add proactive Liaison signaling from runtime state (thresholds, escalations, stale state).
- Keep dashboard as primary channel and make it channel-ready for Telegram parity.

Current code anchors:
- `apps/ceo-cli/src/services/httpServer.ts:createChatCompletion()`
- `apps/keelbase-talk-agent/app.js` local memory functions
- `js/main.js:sendClippyMessageToLiaison()`
- `apps/ceo-cli/src/services/contextCrypto.ts`

Docx intent vs realistic path:
- Docx intent: persistent relational memory + proactive Liaison + dashboard/Telegram parity.
- Realistic now: ship persistent encrypted memory and proactive dashboard signals first; then map same backend session model to Telegram.

Pros:
- Major founder experience improvement.
- Unlocks continuity and proactive value without full platform completion.
Cons:
- Requires careful privacy/key design and migration strategy.
- New operational burden for memory storage lifecycle.

### Phase 5: Architect, Template Mode, and Vessel Web Surfaces

Scope:
- Implement Architect provisioning pipeline as first-class service.
- Add factory-driven alphanumeric vessel IDs.
- Add Template parent/child lifecycle.
- Add generated vessel web surfaces (`llms.txt`, `/agent/*`).
- Add NEAR Intents settlement integration path.

Current code anchors:
- `apps/keelbase-launch-vessel/app.js` (currently wallet-as-contract shortcut)
- `apps/ceo-cli/src/commands/registerVessel.ts`
- `apps/ceo-cli/src/commands/prepareUserOwnedLaunch.ts`
- `apps/ceo-cli/src/services/httpServer.ts:collectVesselsFromProposals()`
- `contracts/factory-contract` scaffold

Docx intent vs realistic path:
- Docx intent: full end-state platform behavior.
- Realistic now: treat as a program of work with feature flags and staged releases; avoid bundling all into one launch.

Pros:
- Completes parity with strategic architecture.
- Enables true platform narrative (not prototype narrative).
Cons:
- Highest complexity and dependency coupling.
- Easy to overrun timeline without strict slice gating.

## Suggested to Defer (Not Blocked, But Strategically Better Later)

These are important, but suggested to defer until Phases 1-3 are stable:

- Full Template marketplace UX.
- Telegram as first-class channel parity.
- Full `/agent` capability surface beyond minimal endpoint set.
- NEAR Intents fee-share automation beyond initial settlement hooks.
- Vertical-specific specialist packs beyond baseline crew.

Why suggested defer:
- They multiply surface area quickly.
- They are expensive to debug while core cycle/document protocol is still maturing.
- Cofounder parallelization is easier once core contract/runtime behavior is stable.

## Docx Plan vs Realistic Execution: High-Level Differences

1. Spec assumes clean-slate architecture; repo is an evolved prototype.
- Difference: we need adapter layers and migration cuts, not only net-new components.

2. Spec is capability-complete; roadmap should be milestone-complete.
- Difference: ship measurable slices with pass/fail gates, not architecture domains.

3. Spec treats channels/features symmetrically; execution should be asymmetrical.
- Difference: dashboard-first, Telegram-second; core cycle first, template marketplace later.

4. Spec implies strict document protocol from start; current runtime has compatibility behavior.
- Difference: remove kludges only after canonical loader passes in shadow mode.

## Execution Gates (Pass/Fail)

Phase completion must be binary:

- Phase 1 pass:
  - all Keelbase windows render from one normalized runtime shape
  - no conflicting state labels between windows
- Phase 2 pass:
  - every successful cycle creates paired `PENDING` + `EXECUTED` anchors
  - invalid plan item blocks all execution
- Phase 3 pass:
  - manifest-first load is canonical
  - synthetic document fallback removed
- Phase 4 pass:
  - Liaison memory persists across refresh/session
  - proactive dashboard alerts fire from runtime conditions
- Phase 5 pass:
  - alphanumeric factory vessel flow works end-to-end
  - minimal `llms.txt` + `/agent` surface is live per vessel

## Cross-Phase Engineering Guardrails

- Prefer canonical fields (`kind.type`, `active_documents`, `approved_counterparties`) over title-text matching.
- Keep one source of truth per concern:
  - state: `get_state_snapshot`
  - conversation: backend memory store
  - UI: normalized runtime contract
- If a kludge is discovered in a production path, log it and schedule cleanup before extending that path.

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

## Parity Implementation Strategy (Max 5 Phases)

This is the recommended path from current prototype to spec parity, ordered from low-hanging fruit to deeper architectural work.

### Phase 1: UX and Contract-Surface Parity (Low Hanging Fruit)

Goal: align frontend semantics with current backend contract fields before changing core protocol logic.

Current hooks to use:
- Frontend runtime feed: `js/keelbase-runtime.js:startKeelbaseRuntime()`
- Window state rendering:
  - `apps/keelbase-snapshot/app.js:renderState()`
  - `apps/keelbase-recent-proposals/app.js:renderState()`
  - `apps/keelbase-created-vessels/app.js:renderState()`
  - `apps/keelbase-talk-agent/app.js:renderRuntimeState()`
- Chat wiring:
  - `apps/keelbase-talk-agent/app.js` submit handler
  - `js/main.js:sendClippyMessageToLiaison()`
- Backend response surfaces:
  - `apps/ceo-cli/src/services/httpServer.ts:/api/overview`
  - `apps/ceo-cli/src/services/httpServer.ts:/api/chat`

Architectural move:
- Introduce a typed frontend runtime contract layer so every window consumes the same normalized shape.
- Keep one reader path (`/api/overview`) and one conversation path (`/api/chat`), but normalize data before UI.

Proposed additions:
- `apps/keelbase-shared/api-contract.js`
  - `normalizeOverviewPayload(raw)`
  - `normalizeChatPayload(raw)`
  - `deriveUiState(overview)`
- `apps/keelbase-shared/status-derivers.js`
  - `deriveVesselStateBadge(snapshot, latestAnchor)`
  - `deriveEscalationBadge(snapshot)`
  - `deriveAnchorLifecycle(latestAnchor, proposals)`

Code sketch:
```js
// apps/keelbase-shared/api-contract.js
export function normalizeOverviewPayload(raw) {
  const snapshot = raw?.snapshot ?? null;
  const proposals = Array.isArray(raw?.proposals) ? raw.proposals : [];
  return {
    snapshot,
    proposals,
    latestAnchor: raw?.latestAnchor ?? null,
    vessels: Array.isArray(raw?.vessels) ? raw.vessels : []
  };
}
```

Phase-1 acceptance:
- All windows render from the same normalized contract.
- UI exposes `vessel_state`, pending escalations, and anchor lifecycle labels consistently.

### Phase 2: CEO Cycle Protocol Compliance

Goal: implement CEO CLI v2 cycle semantics (plan-commit, full-plan validation, execution-close, state transition checks).

Current hooks to evolve:
- Runtime cycle entry: `apps/ceo-cli/src/services/runtime.ts:CeoRuntime.runCycle()`
- Action submission path: `apps/ceo-cli/src/services/actionExecutor.ts:execute()`
- Anchor creation path: `apps/ceo-cli/src/services/anchorLog.ts:commit()`
- Contract methods already available:
  - `NearClient.submitActionProposal()`
  - `NearClient.submitAnchorLog()`
  - `NearClient.getStateSnapshot()`

Architectural move:
- Split cycle into explicit deterministic stages with typed plan model.
- Validate the complete plan before any state-changing action.
- Persist paired anchor records for each cycle (`PENDING` then `EXECUTED` with same action sequence id).

Proposed additions:
- `apps/ceo-cli/src/services/planValidator.ts`
  - `validateCompletePlan(plan, snapshot, stateGraph)`
- `apps/ceo-cli/src/services/stateGraph.ts`
  - `parseStateGraph(doc)`
  - `isValidTransition(fromState, toState, graph)`
- `apps/ceo-cli/src/services/cycleOrchestrator.ts`
  - `runCyclePhases(...)` with explicit phase logs

Code sketch:
```ts
// phase order target
const plan = await inferenceClient.decidePlan(context);
const validation = validateCompletePlan(plan, snapshot, stateGraph);
if (!validation.ok) return replan(validation);

const cycleId = deriveCycleActionId(snapshot.last_action_id);
await nearClient.submitAnchorLog({ action_id: cycleId, outcome: "PENDING", ...planSummary });
await actionExecutor.executePlan(plan);
await nearClient.submitAnchorLog({ action_id: cycleId, outcome: "EXECUTED", ...executionSummary });
```

Phase-2 acceptance:
- No partial execution if any plan item fails validation.
- Every successful cycle emits paired `PENDING` and `EXECUTED` anchors.
- Invalid `vessel_state` transitions are blocked pre-submit.

### Phase 3: Agent Document System Parity

Goal: enforce manifest-first retrieval and Four-File standard at runtime.

Current hooks to evolve:
- Document load path: `apps/ceo-cli/src/services/runtime.ts:loadDocument()`
- Blob/storage path:
  - `apps/ceo-cli/src/services/nearClient.ts:getBlob()`
  - `apps/ceo-cli/src/services/documentStore.ts:fetchByCid()`
- Current kludge to remove:
  - `runtime.ts` fallback `return \`document-content-for:${documentRef}\``

Architectural move:
- Replace ad-hoc `identity/operations` loading with manifest-driven tiered loader:
  - load manifest first
  - resolve version hashes from `active_documents`
  - load identity + operations + `vessel_state_graph`
  - on-demand reference loading from `reference_triggers`
- Add local decrypted cache keyed by `document_id + version_hash`.

Proposed additions:
- `apps/ceo-cli/src/services/documentResolver.ts`
  - `loadManifest(snapshot)`
  - `loadTieredDocuments(snapshot, taskType)`
- `apps/ceo-cli/src/services/documentCache.ts`
  - `get(documentId, versionHash)`
  - `put(documentId, versionHash, decryptedText)`

Code sketch:
```ts
const manifest = await resolver.loadManifest(snapshot.active_documents);
const docs = await resolver.loadTieredDocuments({
  manifest,
  snapshot,
  taskType
});
// docs.identity, docs.operations, docs.stateGraph, docs.references[]
```

Phase-3 acceptance:
- Runtime fails hard on missing required docs (no synthetic fallback text).
- Reference docs load only when trigger rules match task type.
- Active document map naming aligns with spec (`ceo_manifest`, `ceo_identity`, `ceo_operations`, `ceo_state_graph`, ...).

### Phase 4: Liaison Memory and Multi-Channel Parity

Goal: upgrade Liaison from local session chat to persistent encrypted relational interface with proactive behavior.

Current hooks to evolve:
- Chat API role routing: `apps/ceo-cli/src/services/httpServer.ts:createChatCompletion()`
- Chat endpoints: `POST /api/chat`
- Frontend clients:
  - `apps/keelbase-talk-agent/app.js`
  - `js/main.js:sendClippyMessageToLiaison()`
- Current local memory path:
  - `apps/keelbase-talk-agent/app.js:getMemoryKey()/loadChatMemory()/saveChatMemory()`

Architectural move:
- Keep local cache for UX speed, but move source-of-truth Liaison memory to encrypted off-chain store.
- Add server-side memory adapter and event engine for proactive notifications.
- Route both dashboard and future Telegram channel through same Liaison session backend.

Proposed additions:
- `apps/ceo-cli/src/services/liaisonMemoryStore.ts`
  - `loadMemory(vesselSlug, founderId)`
  - `appendMemory(vesselSlug, founderId, turn)`
  - encryption via existing `contextCrypto.ts`
- `apps/ceo-cli/src/services/liaisonSignals.ts`
  - `detectProactiveSignals(snapshot, proposals, memory)`
- `apps/ceo-cli/src/services/channels/telegram.ts`
  - `sendEscalationPrompt(...)`
  - `sendMorningSummary(...)`

Code sketch:
```ts
const memory = await liaisonMemoryStore.loadMemory(vesselSlug, founderId);
const reply = await createLiaisonReply({ message, memory, snapshot });
await liaisonMemoryStore.appendMemory(vesselSlug, founderId, { role: "user", content: message });
await liaisonMemoryStore.appendMemory(vesselSlug, founderId, { role: "assistant", content: reply.text });
```

Phase-4 acceptance:
- Liaison conversation context persists across sessions and clients.
- Proactive notifications fire for threshold/state/escalation events.
- Telegram channel uses same vessel memory and escalation IDs as dashboard.

### Phase 5: Architect + Template Mode + Web Presence Completion

Goal: complete end-to-end platform flows defined in v2/v3/v4 docs.

Current hooks to evolve:
- User-owned launch surface:
  - `apps/keelbase-launch-vessel/app.js` (currently wallet account == vessel contract id)
  - `apps/ceo-cli/src/commands/prepareUserOwnedLaunch.ts`
  - `apps/ceo-cli/src/commands/registerVessel.ts`
- Existing vessel indexing logic:
  - `httpServer.ts:collectVesselsFromProposals()`

Architectural move:
- Introduce a first-class Architect service that owns provisioning and updates.
- Move vessel creation to factory-driven alphanumeric account model.
- Add Template parent/child blueprint model.
- Publish agent-readable web surfaces (`llms.txt`, `/agent/*`) per vessel.

Proposed additions:
- `apps/architect-service/` (new service)
  - `runBespokeProvisioning(sessionInput)`
  - `runTemplateParentProvisioning(configDoc)`
  - `runTemplateChildProvisioning(blueprintVersion, childInput)`
- `contracts/factory-contract` completion for canonical vessel/account deployment.
- `apps/web-layer-service/`
  - `generateLlmsTxt(vesselConfig)`
  - `serveAgentEndpoints(vesselId)` for `/agent/state`, `/agent/capabilities`, `/agent/intake`
- `apps/ceo-cli/src/services/intentsSettlement.ts`
  - settlement + fee-share hooks

Code sketch:
```ts
const vesselId = await factory.createVessel({ ownerAccountId, mode, blueprintId });
await architect.provisionAgentStandard(vesselId, { agents: ["ceo", "liaison", ...] });
await webLayer.publish(vesselId, {
  llmsTxt: generateLlmsTxt(vesselConfig),
  agentEndpoints: true
});
```

Phase-5 acceptance:
- Bespoke and Template flows both deploy from Architect pipeline.
- Vessel IDs follow canonical alphanumeric account model.
- Generated web layer and `/agent` interfaces are live per vessel.
- NEAR Intents settlement path and fee-share accounting are integrated.

## Cross-Phase Engineering Guardrails

- Keep a single canonical state reader path (`get_state_snapshot`) and avoid duplicating state models in frontend logic.
- Prefer stable contract fields (`kind.type`, `kind.category`, `active_documents`, `approved_counterparties`) over label-text heuristics.
- Remove compatibility kludges once canonical loaders are in place, especially synthetic document fallbacks.
- Keep each phase independently deployable to Railway + GitHub Pages with clear feature flags where needed.

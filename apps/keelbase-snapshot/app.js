import { subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const snapshotEl = document.getElementById("snapshot");
const statusEl = document.getElementById("status");
const stateTitleEl = document.getElementById("stateTitle");
const stateNoteEl = document.getElementById("stateNote");
const anchorSummaryEl = document.getElementById("anchorSummary");
const anchorMetaEl = document.getElementById("anchorMeta");

function renderSnapshot(snapshot) {
  const pending = Array.isArray(snapshot.pending_escalations)
    ? snapshot.pending_escalations.length
    : Number(snapshot.pending_escalations?.count || 0);

  const rows = [
    ["Role", snapshot.role || "-"],
    ["Last Action ID", snapshot.last_action_id ?? "-"],
    ["Pending Escalations", String(pending)],
    ["Active Agents", String(snapshot.active_agents?.length || 0)]
  ];

  snapshotEl.innerHTML = "";
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = String(v);
    snapshotEl.append(dt, dd);
  }
}

function renderState(state) {
  const snapshot = state?.snapshot;
  const anchor = state?.latestAnchor;
  if (!snapshot) {
    snapshotEl.innerHTML = "";
    stateTitleEl.innerHTML = 'State: <span class="badge badge-bad">RPC ERROR</span>';
    stateNoteEl.textContent = state?.status === "error" ? (state.error || "failed to fetch") : "Waiting for runtime data...";
    stateNoteEl.className = state?.status === "error" ? "meta status-bad" : "meta status-warn";
    anchorSummaryEl.textContent = "Latest Anchor: unavailable";
    anchorMetaEl.textContent = "";
    statusEl.textContent = state?.status === "error"
      ? `Error: ${state.error || "failed to fetch"}`
      : "Waiting for runtime data...";
    statusEl.className = state?.status === "error" ? "meta status-bad" : "meta status-warn";
    return;
  }

  try {
    renderSnapshot(snapshot);
    renderSystemState(anchor, state);
    renderLatestAnchor(anchor);
    statusEl.textContent = `Live at ${new Date(state.lastUpdated || Date.now()).toLocaleTimeString()}`;
    statusEl.className = "meta status-good";
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  }
}

function renderLatestAnchor(anchor) {
  if (!anchor) {
    anchorSummaryEl.textContent = "Latest Anchor: no anchor log yet.";
    anchorMetaEl.textContent = "";
    return;
  }
  anchorSummaryEl.textContent = `Latest Anchor: ${anchor.kind?.summary || "(no summary)"}`;
  anchorMetaEl.textContent = `action_id=${anchor.kind?.action_id || "-"} outcome=${anchor.kind?.outcome || "-"} proposal_id=${anchor.id}`;
}

function renderSystemState(anchor, state) {
  if (!anchor) {
    stateTitleEl.innerHTML = 'State: <span class="badge badge-warn">NO ANCHOR YET</span>';
    stateNoteEl.textContent = "Run a cycle to begin.";
    stateNoteEl.className = "meta status-warn";
    return;
  }
  const summary = String(anchor.kind?.summary || "").toLowerCase();
  const outcome = String(anchor.kind?.outcome || "").toLowerCase();
  const createdAt = Number(anchor.created_at || 0);
  const stale = createdAt > 0 && Date.now() - createdAt > 10 * 60 * 1000;
  const fallback = summary.includes("fallback");

  if (stale) {
    stateTitleEl.innerHTML = 'State: <span class="badge badge-warn">STALE</span>';
    stateNoteEl.textContent = "No recent anchor activity in the last 10 minutes.";
    stateNoteEl.className = "meta status-warn";
    return;
  }
  if (fallback) {
    stateTitleEl.innerHTML = 'State: <span class="badge badge-warn">AI FALLBACK</span>';
    stateNoteEl.textContent = "Cycle ran with fallback behavior.";
    stateNoteEl.className = "meta status-warn";
    return;
  }
  if (outcome === "executed" || outcome === "completed" || outcome === "logged") {
    stateTitleEl.innerHTML = 'State: <span class="badge badge-good">AI LIVE</span>';
    stateNoteEl.textContent = "AI decisions are landing on-chain.";
    stateNoteEl.className = "meta status-good";
    return;
  }
  stateTitleEl.innerHTML = 'State: <span class="badge badge-bad">UNKNOWN</span>';
  stateNoteEl.textContent = "Anchor present, manual review suggested.";
  stateNoteEl.className = "meta status-warn";
}

subscribeRuntime(renderState);

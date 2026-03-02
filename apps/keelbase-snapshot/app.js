import { subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const snapshotEl = document.getElementById("snapshot");
const statusEl = document.getElementById("status");

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
  if (!snapshot) {
    snapshotEl.innerHTML = "";
    statusEl.textContent = state?.status === "error"
      ? `Error: ${state.error || "failed to fetch"}`
      : "Waiting for runtime data...";
    statusEl.className = state?.status === "error" ? "meta status-bad" : "meta status-warn";
    return;
  }

  try {
    renderSnapshot(snapshot);
    statusEl.textContent = `Live at ${new Date(state.lastUpdated || Date.now()).toLocaleTimeString()}`;
    statusEl.className = "meta status-good";
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  }
}

subscribeRuntime(renderState);

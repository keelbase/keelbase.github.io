import { rpcView, CEO_ACCOUNT } from "../keelbase-shared/core.js";

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

async function load() {
  try {
    const snapshot = await rpcView("get_state_snapshot", { account_id: CEO_ACCOUNT });
    renderSnapshot(snapshot);
    statusEl.textContent = `Live at ${new Date().toLocaleTimeString()}`;
    statusEl.className = "meta status-good";
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  }
}

await load();
setInterval(load, 30000);

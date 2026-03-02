import { escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const countEl = document.getElementById("count");
const vesselsEl = document.getElementById("vessels");
const statusEl = document.getElementById("status");

function renderRows(rows) {
  vesselsEl.innerHTML = "";
  countEl.textContent = `${rows.length} found`;

  if (rows.length === 0) {
    vesselsEl.innerHTML = '<article class="item"><div class="line2">No vessel registrations found yet.</div></article>';
    return;
  }

  for (const row of rows) {
    const node = document.createElement("article");
    node.className = "item";
    const created = row.createdAtMs > 0 ? new Date(row.createdAtMs).toLocaleString() : "unknown";
    node.innerHTML = `
      <div class="line1">
        <span>${escapeHtml(row.slug)}</span>
        <span>${escapeHtml(row.mode)}</span>
      </div>
      <div class="line2">owner=${escapeHtml(row.owner)}</div>
      <div class="line2">contract=${escapeHtml(row.vesselContractId)}</div>
      <div class="line2">created=${escapeHtml(created)} anchor=#${row.proposalId}</div>
    `;
    vesselsEl.appendChild(node);
  }
}

function renderState(state) {
  const rows = Array.isArray(state?.vessels) ? state.vessels : [];
  renderRows(rows);

  if (state?.status === "error") {
    countEl.textContent = "Error";
    statusEl.textContent = `Error: ${state.error || "failed to fetch"}`;
    statusEl.className = "meta status-bad";
    return;
  }
  if (!state?.lastUpdated) {
    statusEl.textContent = "Syncing...";
    statusEl.className = "meta";
    return;
  }
  statusEl.textContent = `Live at ${new Date(state.lastUpdated).toLocaleTimeString()}`;
  statusEl.className = "meta status-good";
}

subscribeRuntime(renderState);
requestRuntimeRefresh();

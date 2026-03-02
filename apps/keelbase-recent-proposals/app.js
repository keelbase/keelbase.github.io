import { escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const proposalsEl = document.getElementById("proposals");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

refreshBtn.addEventListener("click", () => {
  statusEl.textContent = "Refreshing...";
  statusEl.className = "meta";
  requestRuntimeRefresh();
});

function renderProposals(proposals) {
  proposalsEl.innerHTML = "";
  const recent = proposals.slice(-15).reverse();

  if (recent.length === 0) {
    proposalsEl.innerHTML = '<article class="item"><div class="line2">No proposals yet.</div></article>';
    return;
  }

  for (const p of recent) {
    const node = document.createElement("article");
    node.className = "item";
    const type = p.kind?.type || "UNKNOWN";
    const summary = p.kind?.summary || p.description || "(no summary)";
    const status = String(p.status || "UNKNOWN");
    const statusClass = status === "FINALIZED" ? "badge-good" : status === "PENDING" ? "badge-warn" : "badge-bad";
    node.innerHTML = `
      <div class="line1">
        <span>#${p.id} <span class="badge">${escapeHtml(type)}</span></span>
        <span class="badge ${statusClass}">${escapeHtml(status)}</span>
      </div>
      <div class="line2">${escapeHtml(summary)}</div>
    `;
    proposalsEl.appendChild(node);
  }
}

function renderState(state) {
  const proposals = Array.isArray(state?.proposals) ? state.proposals : [];
  renderProposals(proposals);
  if (state?.status === "error") {
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

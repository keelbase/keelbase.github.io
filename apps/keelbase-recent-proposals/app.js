import { rpcView, escapeHtml } from "../keelbase-shared/core.js";

const proposalsEl = document.getElementById("proposals");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

refreshBtn.addEventListener("click", () => load(true));

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
    node.innerHTML = `
      <div class="line1">
        <span>#${p.id} ${escapeHtml(type)}</span>
        <span>${escapeHtml(p.status || "UNKNOWN")}</span>
      </div>
      <div class="line2">${escapeHtml(summary)}</div>
    `;
    proposalsEl.appendChild(node);
  }
}

async function load(manual = false) {
  statusEl.textContent = manual ? "Refreshing..." : "Syncing...";
  statusEl.className = "meta";
  try {
    const proposals = await rpcView("get_proposals", { from_index: 0, limit: 120 });
    renderProposals(proposals);
    statusEl.textContent = `Live at ${new Date().toLocaleTimeString()}`;
    statusEl.className = "meta status-good";
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.className = "meta status-bad";
  }
}

await load();
setInterval(load, 30000);

import { subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const stateEl = document.getElementById("state");
const noteEl = document.getElementById("note");

function renderState(state) {
  const anchor = state?.latestAnchor;
  if (!anchor) {
    if (state?.status === "error") {
      stateEl.textContent = "RPC ERROR";
      noteEl.textContent = state.error || "failed to fetch";
      noteEl.className = "meta status-bad";
      return;
    }
    stateEl.textContent = "NO ANCHOR YET";
    noteEl.textContent = "Run a cycle to begin.";
    noteEl.className = "meta status-warn";
    return;
  }

  const summary = String(anchor.kind?.summary || "").toLowerCase();
  const outcome = String(anchor.kind?.outcome || "").toLowerCase();
  const createdAt = Number(anchor.created_at || 0);
  const stale = createdAt > 0 && Date.now() - createdAt > 10 * 60 * 1000;
  const fallback = summary.includes("fallback");

  if (stale) {
    stateEl.textContent = "STALE";
    noteEl.textContent = "No recent anchor activity in the last 10 minutes.";
    noteEl.className = "meta status-warn";
    return;
  }
  if (fallback) {
    stateEl.textContent = "AI FALLBACK";
    noteEl.textContent = "Cycle ran with fallback behavior.";
    noteEl.className = "meta status-warn";
    return;
  }
  if (outcome === "executed" || outcome === "completed" || outcome === "logged") {
    stateEl.textContent = "AI LIVE";
    noteEl.textContent = "AI decisions are landing on-chain.";
    noteEl.className = "meta status-good";
    return;
  }

  stateEl.textContent = "UNKNOWN STATE";
  noteEl.textContent = "Anchor present, manual review suggested.";
  noteEl.className = "meta status-warn";
}

subscribeRuntime(renderState);

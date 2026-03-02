import { subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const summaryEl = document.getElementById("summary");
const metaEl = document.getElementById("meta");

function renderState(state) {
  const anchor = state?.latestAnchor;
  if (!anchor) {
    summaryEl.textContent = state?.status === "error" ? "Failed to fetch latest anchor." : "No anchor log yet.";
    metaEl.textContent = state?.status === "error" ? `Error: ${state.error || "failed to fetch"}` : "";
    metaEl.className = state?.status === "error" ? "meta status-bad" : "meta";
    return;
  }

  summaryEl.textContent = anchor.kind?.summary || "(no summary)";
  metaEl.textContent = `action_id=${anchor.kind?.action_id || "-"} outcome=${anchor.kind?.outcome || "-"} proposal_id=${anchor.id}`;
  metaEl.className = "meta status-good";
}

subscribeRuntime(renderState);

import { latestAnchor } from "../keelbase-shared/core.js";

const summaryEl = document.getElementById("summary");
const metaEl = document.getElementById("meta");

async function load() {
  try {
    const { anchor } = await latestAnchor();
    if (!anchor) {
      summaryEl.textContent = "No anchor log yet.";
      metaEl.textContent = "";
      return;
    }

    summaryEl.textContent = anchor.kind?.summary || "(no summary)";
    metaEl.textContent = `action_id=${anchor.kind?.action_id || "-"} outcome=${anchor.kind?.outcome || "-"} proposal_id=${anchor.id}`;
    metaEl.className = "meta status-good";
  } catch (err) {
    metaEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    metaEl.className = "meta status-bad";
  }
}

await load();
setInterval(load, 30000);

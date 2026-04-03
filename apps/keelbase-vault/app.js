import { CHAT_API_BASE_URL } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const statusEl = document.getElementById("status");
const vaultKv = document.getElementById("vaultKv");

vesselSelect.addEventListener("change", () => {
  loadState().catch(() => {});
});

subscribeRuntime((state) => {
  const vessels = Array.isArray(state?.vessels) ? state.vessels : [];
  const current = vesselSelect.value;
  vesselSelect.innerHTML = "";
  for (const vessel of vessels) {
    const option = document.createElement("option");
    option.value = vessel.slug;
    option.textContent = `${vessel.slug} (${vessel.owner})`;
    vesselSelect.appendChild(option);
  }
  if (current && vessels.some((entry) => entry.slug === current)) {
    vesselSelect.value = current;
  }
  if (vessels.length > 0) {
    loadState().catch(() => {});
  }
});

async function loadState() {
  const slug = vesselSelect.value;
  if (!slug) return;
  statusEl.textContent = `Loading treasury state for ${slug}...`;
  const response = await fetch(`${CHAT_API_BASE_URL}/agent/${encodeURIComponent(slug)}/state`);
  const payload = await response.json();
  const snapshot = payload?.snapshot || {};
  const treasury = snapshot?.treasury_balance || {};
  const policy = snapshot?.policy_thresholds || {};
  const rows = [
    ["Contract", payload?.contractId || "unknown"],
    ["NEAR", String(treasury.near || treasury.NEAR || "0")],
    ["Auto approve", String(policy.treasury_auto_approve_near || "n/a")],
    ["Council required", String(policy.treasury_council_required_near || "n/a")]
  ];
  vaultKv.innerHTML = "";
  for (const [key, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    vaultKv.append(dt, dd);
  }
  statusEl.textContent = `Loaded vault state for ${slug}.`;
}

requestRuntimeRefresh();

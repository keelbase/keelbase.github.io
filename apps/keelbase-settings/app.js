import { CHAT_API_BASE_URL } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const statusEl = document.getElementById("status");
const settingsKv = document.getElementById("settingsKv");

vesselSelect.addEventListener("change", () => {
  loadSettings().catch(() => {});
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
    loadSettings().catch(() => {});
  }
});

async function loadSettings() {
  const slug = vesselSelect.value;
  if (!slug) return;
  statusEl.textContent = `Loading settings for ${slug}...`;
  const response = await fetch(`${CHAT_API_BASE_URL}/agent/${encodeURIComponent(slug)}/state`);
  const payload = await response.json();
  const meta = payload?.meta || {};
  const snapshot = payload?.snapshot || {};
  const policy = snapshot?.policy_thresholds || meta?.policy_thresholds || {};
  const rows = [
    ["Slug", slug],
    ["Owner", String(meta.owner_account_id || "unknown")],
    ["Contract", String(meta.vessel_contract_id || payload.contractId || "unknown")],
    ["Mode", String(meta.mode || "unknown")],
    ["Auto approve", String(policy.treasury_auto_approve_near || "n/a")],
    ["Council required", String(policy.treasury_council_required_near || "n/a")]
  ];
  settingsKv.innerHTML = "";
  for (const [key, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    settingsKv.append(dt, dd);
  }
  statusEl.textContent = `Loaded settings for ${slug}.`;
}

requestRuntimeRefresh();

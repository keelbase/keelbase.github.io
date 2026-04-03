import { CHAT_API_BASE_URL, escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const statusEl = document.getElementById("status");
const crewListEl = document.getElementById("crewList");

vesselSelect.addEventListener("change", () => {
  loadCrew().catch(() => {});
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
    loadCrew().catch(() => {});
  }
});

async function loadCrew() {
  const slug = vesselSelect.value;
  if (!slug) return;
  statusEl.textContent = `Loading crew for ${slug}...`;
  const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/crew`);
  const payload = await response.json();
  const crew = Array.isArray(payload?.crew) ? payload.crew : [];
  crewListEl.innerHTML = "";
  for (const member of crew) {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="line1">
        <span>${escapeHtml(String(member.role || "unknown"))}</span>
        <span>${escapeHtml(String(member.status || "ready"))}</span>
      </div>
      <div class="line2">account=${escapeHtml(String(member.accountId || "n/a"))}</div>
    `;
    crewListEl.appendChild(node);
  }
  if (crew.length === 0) {
    crewListEl.innerHTML = '<article class="item"><div class="line2">No crew data available yet.</div></article>';
  }
  statusEl.textContent = `Loaded ${crew.length} crew role(s).`;
}

requestRuntimeRefresh();

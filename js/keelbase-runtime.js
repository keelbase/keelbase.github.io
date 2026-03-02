const RUNTIME_CHANNEL = "keelbase-runtime-v1";
const API_BASE_URL = "https://keelbase-platform-internal-production.up.railway.app";
const REFRESH_MS = 30000;

export function startKeelbaseRuntime() {
  if (window.__keelbaseRuntimeStarted) return;
  window.__keelbaseRuntimeStarted = true;

  const channel = new BroadcastChannel(RUNTIME_CHANNEL);
  let state = {
    status: "loading",
    error: "",
    lastUpdated: 0,
    snapshot: null,
    proposals: [],
    latestAnchor: null,
    vessels: []
  };

  function publish() {
    window.__keelbaseRuntimeState = state;
    channel.postMessage({ type: "keelbase:state", state });
  }

  async function refresh() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/overview`, {
        method: "GET",
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`overview_error: ${response.status} ${text}`);
      }
      const payload = await response.json();
      state = {
        status: "ready",
        error: "",
        lastUpdated: Date.now(),
        snapshot: payload?.snapshot ?? null,
        proposals: Array.isArray(payload?.proposals) ? payload.proposals : [],
        latestAnchor: payload?.latestAnchor ?? null,
        vessels: Array.isArray(payload?.vessels) ? payload.vessels : []
      };
    } catch (err) {
      state = {
        ...state,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        lastUpdated: Date.now()
      };
    }
    publish();
  }

  channel.addEventListener("message", (event) => {
    const message = event?.data || {};
    if (message.type === "keelbase:request-state") {
      publish();
      return;
    }
    if (message.type === "keelbase:refresh") {
      refresh().catch(() => {});
    }
  });

  publish();
  refresh().catch(() => {});
  setInterval(() => {
    refresh().catch(() => {});
  }, REFRESH_MS);
}

const RUNTIME_CHANNEL = "keelbase-runtime-v1";
const channel = new BroadcastChannel(RUNTIME_CHANNEL);
let currentState = {
  status: "loading",
  error: "",
  lastUpdated: 0,
  snapshot: null,
  proposals: [],
  latestAnchor: null,
  vessels: []
};

const listeners = new Set();

channel.addEventListener("message", (event) => {
  const message = event?.data || {};
  if (message.type !== "keelbase:state" || !message.state) return;
  currentState = message.state;
  for (const listener of listeners) {
    listener(currentState);
  }
});

export function subscribeRuntime(listener) {
  listeners.add(listener);
  listener(currentState);
  channel.postMessage({ type: "keelbase:request-state" });
  return () => listeners.delete(listener);
}

export function requestRuntimeRefresh() {
  channel.postMessage({ type: "keelbase:refresh" });
}

export function getRuntimeState() {
  return currentState;
}

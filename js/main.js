import { createSaveDialog } from "./save-dialog.js";
import { createAppsMenu } from "./apps-menu.js";
import { createWindowManager } from "./wm.js";
import { initMenuDropdowns, initMenuActions } from "./menubar.js";
import { saveUpload, hasWrappedKey, setPassphrase, unlockWithPassphrase } from "./filesystem.js";
import { initThemeToggle, initThemeState, applyTheme, getTheme, applyWallpaper, getWallpaperName, clearWallpaper } from "./theme.js";
import { createHud } from "./hud.js";
import { createVoiceSttController } from "./voice-stt.js";
import { startKeelbaseRuntime } from "./keelbase-runtime.js";
// import { initAgent1C } from "./agent1c.js";
// Onboarding phase and agent panel auto-spawn are intentionally disabled for Keelbase migration.

const menubar = document.getElementById("menubar");
const desktop = document.getElementById("desktop");
const iconLayer = document.getElementById("iconLayer");
const openWindowsList = document.getElementById("openWindowsList");
const WINDOW_LAYOUT_KEY = "hedgey_window_layout_v1";
const KEELBASE_FLOW_KEY = "keelbase_flow_phase_v1";
const KEELBASE_FLOW_CHANNEL = "keelbase-flow-v1";
const KEELBASE_RUNTIME_CHANNEL = "keelbase-runtime-v1";
const FLOW_PHASE_BOOTSTRAP = "bootstrap";
const FLOW_PHASE_FULL = "full";
const KEELBASE_WALLET_AUTH_KEY = "keelbase-pages_wallet_auth_key";
const KEELBASE_CHAT_API_BASE_URL = "https://keelbase-platform-internal-production.up.railway.app";

async function loadAppsConfig(){
  try{
    const resp = await fetch("apps.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`apps.json failed: ${resp.status}`);
    const data = await resp.json();
    if (!data || !Array.isArray(data.apps)) throw new Error("apps.json missing apps");
    return data;
  } catch (err){
    console.error(err);
    return { apps: [] };
  }
}

function toAppsMap(appsConfig){
  const map = {};
  for (const app of appsConfig.apps || []){
    if (!app || !app.id) continue;
    map[app.id] = { title: app.title || app.id, url: app.url || "" };
  }
  return map;
}

async function boot(){
  const appsConfig = await loadAppsConfig();
  const appsMap = toAppsMap(appsConfig);

  const appsMenu = createAppsMenu({
    savedAppsList: document.getElementById("savedAppsList"),
    appsList: document.getElementById("appsList"),
    appsConfig,
  });

  const saveDialog = createSaveDialog({
    modal: document.getElementById("saveModal"),
    nameField: document.getElementById("saveAppName"),
    urlField: document.getElementById("saveAppUrl"),
    btnNo: document.getElementById("saveNo"),
    btnYes: document.getElementById("saveYes"),
    onSaved: () => appsMenu.renderSavedApps(),
  });

  const wm = createWindowManager({
    desktop,
    iconLayer,
    templates: {
      finderTpl: document.getElementById("finderTemplate"),
      appTpl: document.getElementById("appTemplate"),
      browserTpl: document.getElementById("browserTemplate"),
      notesTpl: document.getElementById("notesTemplate"),
      themesTpl: document.getElementById("themesTemplate"),
    },
    openWindowsList,
    saveDialog,
    appsMenu,
    appsMap,
    theme: { applyTheme, getTheme, applyWallpaper, getWallpaperName, clearWallpaper },
  });

  const hud = createHud({
    video: document.getElementById("hudFeed"),
    body: document.body,
    switchButton: document.getElementById("hudSwitch"),
  });

  initMenuDropdowns({ menubar });
  initMenuActions({ menubar, wm, appsMenu, defaultApps: appsMap, hud });
  initThemeToggle({ button: document.getElementById("modebtn") });
  initThemeState();

  const voice = createVoiceSttController({
    button: document.getElementById("voicebtn"),
    modal: document.getElementById("voiceModal"),
    btnYes: document.getElementById("voiceYes"),
    btnNo: document.getElementById("voiceNo"),
  });
  voice.init();
  window.__agent1cVoiceController = voice;

  appsMenu.renderAppsMenu();
  appsMenu.renderSavedApps();
  startKeelbaseRuntime();
  try {
    localStorage.removeItem(WINDOW_LAYOUT_KEY);
  } catch {}
  await initKeelbaseWindowFlow(wm);
  mountOriginalClippyAssistant();
  // wm.restoreLayoutSession?.();
  // await initAgent1C({ wm });

  const toast = document.getElementById("toast");
  const toastBody = document.getElementById("toastBody");
  let toastTimer = null;
  function showToast(message){
    if (!toast || !toastBody) return;
    toastBody.innerHTML = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 8000);
  }

  window.addEventListener("hedgey:encryption-notice", () => {
    showToast('Your files are encrypted. <span class="toast-link">Click here for key operations.</span>');
  });

  function openKeyOperations(){
    openKeyModal(true);
  }

  if (toast) {
    toast.addEventListener("click", () => {
      openKeyOperations();
    });
  }

  const keyBtn = document.getElementById("keybtn");
  if (keyBtn) {
    keyBtn.addEventListener("click", () => openKeyOperations());
  }

  const keyModal = document.getElementById("keyModal");
  const keyTitle = document.getElementById("keyTitle");
  const keyDesc = document.getElementById("keyDesc");
  const keyPass1 = document.getElementById("keyPass1");
  const keyPass2 = document.getElementById("keyPass2");
  const keyPassRow2 = document.getElementById("keyPassRow2");
  const keyError = document.getElementById("keyError");
  const keyConfirm = document.getElementById("keyConfirm");
  const keyKeep = document.getElementById("keyKeep");
  const keyInfo = document.getElementById("keyInfo");

  async function openKeyModal(force){
    if (!keyModal) return;
    const wrapped = await hasWrappedKey();
    if (!wrapped && !force) return;
    keyTitle.textContent = wrapped ? "Unlock Encryption" : "Set Passphrase";
    keyDesc.textContent = wrapped ? "Enter your passphrase to unlock encrypted files." : "";
    if (keyInfo) keyInfo.style.display = wrapped ? "none" : "block";
    if (keyPassRow2) keyPassRow2.style.display = wrapped ? "none" : "grid";
    if (keyError) keyError.textContent = "";
    if (keyPass1) keyPass1.value = "";
    if (keyPass2) keyPass2.value = "";
    keyModal.classList.add("open");
    keyModal.setAttribute("aria-hidden", "false");
    setTimeout(() => keyPass1?.focus(), 0);

    keyConfirm.onclick = async () => {
      const p1 = (keyPass1?.value || "").trim();
      const p2 = (keyPass2?.value || "").trim();
      if (!p1) {
        if (keyError) keyError.textContent = "Passphrase required.";
        return;
      }
      if (!wrapped && p1 !== p2) {
        if (keyError) keyError.textContent = "Passphrases do not match.";
        return;
      }
      try {
        const ok = wrapped ? await unlockWithPassphrase(p1) : await setPassphrase(p1);
        if (!ok) {
          if (keyError) keyError.textContent = "Could not unlock. Try again.";
          return;
        }
        keyModal.classList.remove("open");
        keyModal.setAttribute("aria-hidden", "true");
      } catch {
        if (keyError) keyError.textContent = "Could not unlock. Try again.";
      }
    };

    const onEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        keyConfirm.click();
      }
    };
    if (keyPass1) keyPass1.onkeydown = onEnter;
    if (keyPass2) keyPass2.onkeydown = onEnter;

    if (keyKeep) {
      keyKeep.style.display = wrapped ? "none" : "inline-flex";
      keyKeep.onclick = () => {
        keyModal.classList.remove("open");
        keyModal.setAttribute("aria-hidden", "true");
      };
    }
  }

  openKeyModal(false);

  async function handleDroppedFiles(files){
    const list = Array.from(files || []).filter(f => f instanceof File);
    if (!list.length) return;
    for (const file of list){
      await saveUpload(file);
    }
    window.dispatchEvent(new Event("hedgey:docs-changed"));
    if (typeof wm.focusDocumentsWindow === "function") {
      wm.focusDocumentsWindow();
    }
  }

  let dragDepth = 0;

  function findDropTarget(x, y){
    const wins = Array.from(document.querySelectorAll("[data-win]"))
      .filter(win => ["app", "browser"].includes(win.dataset.kind || ""))
      .sort((a, b) => {
        const za = parseInt(a.style.zIndex || "0", 10);
        const zb = parseInt(b.style.zIndex || "0", 10);
        return zb - za;
      });
    for (const win of wins){
      const rect = win.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return win;
      }
    }
    return null;
  }

  function ensureDropShield(win){
    if (!win) return null;
    let shield = win.querySelector("[data-drop-shield]");
    if (shield) return shield;
    const wrap = win.querySelector(".appwrap, .browserwrap");
    if (!wrap) return null;
    shield = document.createElement("div");
    shield.className = "drop-shield";
    shield.textContent = "Drop to upload";
    shield.setAttribute("data-drop-shield", "");
    wrap.appendChild(shield);
    return shield;
  }

  function updateDropShield(x, y){
    const target = findDropTarget(x, y);
    if (target) ensureDropShield(target);
    document.querySelectorAll("[data-drop-shield]").forEach(el => {
      el.classList.toggle("show", el.closest("[data-win]") === target);
    });
  }

  document.addEventListener("dragenter", (e) => {
    dragDepth += 1;
  });
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    updateDropShield(e.clientX, e.clientY);
  });
  document.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.querySelectorAll("[data-drop-shield]").forEach(el => el.classList.remove("show"));
    }
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    document.querySelectorAll("[data-drop-shield]").forEach(el => el.classList.remove("show"));
    handleDroppedFiles(e.dataTransfer?.files);
  });

}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function positionWindow(id, target){
  if (!target || !id || !desktop) return;
  const win = document.querySelector(`[data-id="${id}"]`);
  if (!win) return;
  const maxLeft = Math.max(0, desktop.clientWidth - win.offsetWidth);
  const maxTop = Math.max(0, desktop.clientHeight - win.offsetHeight);
  const left = Number.isFinite(target.left) ? target.left : win.offsetLeft;
  const top = Number.isFinite(target.top) ? target.top : win.offsetTop;
  win.style.left = `${clamp(left, 0, maxLeft)}px`;
  win.style.top = `${clamp(top, 0, maxTop)}px`;
}

function spawnKeelbaseWindows(wm){
  const startupLayout = [
    { title: "Recent Proposals", url: "/apps/keelbase-recent-proposals/", pos: { left: 18, top: 340 } },
    { title: "Launch New Vessel", url: "/apps/keelbase-launch-vessel/", pos: { left: 380, top: 340 } }
  ];

  const startupWindows = startupLayout.map((entry) => {
    const id = wm.createAppWindow(entry.title, entry.url);
    return { id, pos: entry.pos };
  });
  startupWindows.forEach((entry) => positionWindow(entry.id, entry.pos));
}

function spawnAllKeelbaseWindows(wm){
  const startupLayout = [
    { title: "Snapshot", url: "/apps/keelbase-snapshot/", pos: { left: 18, top: 34 } },
    { title: "Recent Proposals", url: "/apps/keelbase-recent-proposals/", pos: { left: 380, top: 34 } },
    { title: "Launch New Vessel", url: "/apps/keelbase-launch-vessel/", pos: { left: 742, top: 34 } },
    { title: "Created Vessels", url: "/apps/keelbase-created-vessels/", pos: { left: 18, top: 340 } },
    { title: "Talk to a Vessel Agent", url: "/apps/keelbase-talk-agent/", pos: { left: 380, top: 340 } }
  ];

  const startupWindows = startupLayout.map((entry) => {
    const existing = wm.findWindowByTitle?.(entry.title);
    const id = existing?.id || wm.createAppWindow(entry.title, entry.url);
    return { id, pos: entry.pos };
  });
  startupWindows.forEach((entry) => positionWindow(entry.id, entry.pos));
}

function getKeelbaseFlowPhase(){
  try {
    const raw = String(localStorage.getItem(KEELBASE_FLOW_KEY) || "").trim().toLowerCase();
    return raw === FLOW_PHASE_FULL ? FLOW_PHASE_FULL : FLOW_PHASE_BOOTSTRAP;
  } catch {
    return FLOW_PHASE_BOOTSTRAP;
  }
}

function setKeelbaseFlowPhase(phase){
  const normalized = phase === FLOW_PHASE_FULL ? FLOW_PHASE_FULL : FLOW_PHASE_BOOTSTRAP;
  try {
    localStorage.setItem(KEELBASE_FLOW_KEY, normalized);
  } catch {}
  return normalized;
}

function triggerTileAfterPaint(wm){
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      wm.tileVisibleWindows?.();
    });
  });
}

function hasKnownVessels(){
  const state = window.__keelbaseRuntimeState;
  return Array.isArray(state?.vessels) && state.vessels.length > 0;
}

async function waitForRuntimeVessels(timeoutMs = 1400){
  if (hasKnownVessels()) return true;
  const channel = new BroadcastChannel(KEELBASE_RUNTIME_CHANNEL);
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.close();
      resolve(Boolean(value));
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    channel.addEventListener("message", (event) => {
      const message = event?.data || {};
      if (message.type !== "keelbase:state") return;
      const vessels = message?.state?.vessels;
      if (Array.isArray(vessels) && vessels.length > 0) {
        finish(true);
      }
    });
    channel.postMessage({ type: "keelbase:request-state" });
  });
}

function hasWalletAuthHint(){
  try {
    return Boolean(localStorage.getItem(KEELBASE_WALLET_AUTH_KEY));
  } catch {
    return false;
  }
}

async function initKeelbaseWindowFlow(wm){
  let phase = getKeelbaseFlowPhase();
  let walletConnected = hasWalletAuthHint();
  const startupShouldBeFull = phase === FLOW_PHASE_FULL
    || (walletConnected && await waitForRuntimeVessels());
  if (startupShouldBeFull) {
    phase = setKeelbaseFlowPhase(FLOW_PHASE_FULL);
    spawnAllKeelbaseWindows(wm);
    triggerTileAfterPaint(wm);
  } else {
    spawnKeelbaseWindows(wm);
    triggerTileAfterPaint(wm);
  }

  const flowChannel = new BroadcastChannel(KEELBASE_FLOW_CHANNEL);
  const runtimeChannel = new BroadcastChannel(KEELBASE_RUNTIME_CHANNEL);
  const promoteToFull = () => {
    if (phase === FLOW_PHASE_FULL) return;
    phase = setKeelbaseFlowPhase(FLOW_PHASE_FULL);
    spawnAllKeelbaseWindows(wm);
    triggerTileAfterPaint(wm);
  };
  const maybePromoteFromGuard = () => {
    if (phase === FLOW_PHASE_FULL) return;
    if (walletConnected && hasKnownVessels()) {
      promoteToFull();
    }
  };

  flowChannel.addEventListener("message", (event) => {
    const message = event?.data || {};
    if (message.type === "keelbase:flow:vessel-created") {
      promoteToFull();
      return;
    }
    if (message.type === "keelbase:flow:wallet-connected") {
      walletConnected = true;
      maybePromoteFromGuard();
      return;
    }
    if (message.type === "keelbase:flow:wallet-disconnected") {
      walletConnected = false;
    }
  });
  runtimeChannel.addEventListener("message", (event) => {
    const message = event?.data || {};
    if (message.type !== "keelbase:state") return;
    maybePromoteFromGuard();
  });
}

function mountOriginalClippyAssistant(){
  if (document.querySelector(".clippy-assistant")) return;
  const desktopEl = document.getElementById("desktop");
  if (!desktopEl) return;

  const root = document.createElement("div");
  root.className = "clippy-assistant";
  root.innerHTML = `
    <div class="clippy-voice clippy-hidden"></div>
    <div class="clippy-bubble clippy-hidden">
      <div class="clippy-bubble-title">Hitomi</div>
      <div class="clippy-bubble-content">
        <div class="clippy-log">
          <div class="clippy-line"><strong>Hitomi:</strong> I am back. Ask me anything about your vessel and I will route you to the right agent.</div>
        </div>
        <div class="clippy-chips">
          <button class="clippy-chip" type="button" data-clippy-open-talk>Open Vessel Chat</button>
        </div>
        <form class="clippy-form">
          <input class="clippy-input" type="text" placeholder="Write a message..." />
          <button class="clippy-send" type="submit">Send</button>
        </form>
      </div>
    </div>
    <div class="clippy-shadow" aria-hidden="true"></div>
    <img class="clippy-body" src="assets/hedgey1.png" alt="Hitomi hedgehog assistant" draggable="false" />
  `;
  desktopEl.appendChild(root);

  const body = root.querySelector(".clippy-body");
  const bubble = root.querySelector(".clippy-bubble");
  const form = root.querySelector(".clippy-form");
  const input = root.querySelector(".clippy-input");
  const openTalkBtn = root.querySelector("[data-clippy-open-talk]");
  const log = root.querySelector(".clippy-log");
  const sendBtn = root.querySelector(".clippy-send");
  const clippyHistory = [];

  body.style.touchAction = "none";
  if (bubble) bubble.style.zIndex = "2";

  function rectOverlapArea(a, b){
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  }

  function getBounds(){
    const dw = desktopEl.clientWidth || 0;
    const dh = desktopEl.clientHeight || 0;
    const rw = root.offsetWidth || 132;
    const rh = root.offsetHeight || 132;
    return {
      minLeft: 0,
      maxLeft: Math.max(0, dw - rw),
      minTop: 0,
      maxTop: Math.max(0, dh - rh),
      dw,
      dh
    };
  }

  function clampPos(left, top){
    const bounds = getBounds();
    return {
      left: Math.max(bounds.minLeft, Math.min(left, bounds.maxLeft)),
      top: Math.max(bounds.minTop, Math.min(top, bounds.maxTop))
    };
  }

  function positionBubble(){
    if (!bubble || bubble.classList.contains("clippy-hidden")) return;
    const bounds = getBounds();
    if (!bounds.dw || !bounds.dh) return;

    const rootLeft = parseFloat(root.style.left) || 0;
    const rootTop = parseFloat(root.style.top) || 0;
    const rootW = root.offsetWidth || 132;
    const rootH = root.offsetHeight || 132;
    const bubbleW = bubble.offsetWidth || 280;
    const bubbleH = bubble.offsetHeight || 220;
    const pad = 6;
    const gap = 8;

    const anchorLocalX = Math.max(18, Math.min(rootW - 18, Math.round(rootW * 0.57)));
    const anchorGlobalX = rootLeft + anchorLocalX;

    let bubbleGlobalLeft = Math.round(anchorGlobalX - bubbleW / 2);
    bubbleGlobalLeft = Math.max(pad, Math.min(bubbleGlobalLeft, Math.max(pad, bounds.dw - bubbleW - pad)));

    let place = "down";
    let bubbleGlobalTop = Math.round(rootTop - bubbleH - gap);
    if (bubbleGlobalTop < pad) {
      place = "up";
      bubbleGlobalTop = Math.round(rootTop + rootH + gap);
      bubbleGlobalTop = Math.min(bubbleGlobalTop, Math.max(pad, bounds.dh - bubbleH - pad));
    }
    bubbleGlobalTop = Math.max(pad, Math.min(bubbleGlobalTop, Math.max(pad, bounds.dh - bubbleH - pad)));

    const localLeft = bubbleGlobalLeft - rootLeft;
    const localTop = bubbleGlobalTop - rootTop;
    bubble.style.left = `${localLeft}px`;
    bubble.style.top = `${localTop}px`;
    bubble.style.bottom = "auto";
    bubble.style.transform = "none";
    bubble.dataset.tail = place;

    const tailX = Math.max(14, Math.min(bubbleW - 14, anchorGlobalX - bubbleGlobalLeft));
    bubble.style.setProperty("--tail-left", `${tailX}px`);
  }

  function setPosition(left, top){
    const next = clampPos(left, top);
    root.style.left = `${Math.round(next.left)}px`;
    root.style.top = `${Math.round(next.top)}px`;
    positionBubble();
  }

  function snapOutOfBubble({ preferAbove = false } = {}){
    if (!bubble || bubble.classList.contains("clippy-hidden")) return;
    const dw = desktopEl.clientWidth || 0;
    const dh = desktopEl.clientHeight || 0;
    if (!dw || !dh) return;

    positionBubble();
    const bodyRect0 = body.getBoundingClientRect();
    const bubbleRect0 = bubble.getBoundingClientRect();
    if (!bodyRect0.width || !bodyRect0.height || !bubbleRect0.width || !bubbleRect0.height) return;
    if (rectOverlapArea(bodyRect0, bubbleRect0) <= 0) return;

    const bodyW = bodyRect0.width;
    const bodyH = bodyRect0.height;
    const bubbleRect = bubbleRect0;
    const curLeft = parseFloat(root.style.left) || 0;
    const curTop = parseFloat(root.style.top) || 0;
    const anchorX = bubbleRect.left + bubbleRect.width * 0.5 - bodyW * 0.5;
    const candidates = [];
    const add = (x, y) => candidates.push({ x, y });
    add(curLeft, bubbleRect.top - bodyH - 8);
    add(curLeft, bubbleRect.bottom + 8);
    add(bubbleRect.left - bodyW - 8, curTop);
    add(bubbleRect.right + 8, curTop);
    add(anchorX, bubbleRect.top - bodyH - 8);
    add(anchorX, bubbleRect.bottom + 8);
    if (preferAbove) {
      candidates.unshift(
        { x: curLeft, y: bubbleRect.top - bodyH - 8 },
        { x: anchorX, y: bubbleRect.top - bodyH - 8 }
      );
    }

    let best = { score: Infinity, x: curLeft, y: curTop };
    for (const candidate of candidates) {
      const nx = Math.max(0, Math.min(candidate.x, Math.max(0, dw - (root.offsetWidth || 64))));
      const ny = Math.max(0, Math.min(candidate.y, Math.max(0, dh - (root.offsetHeight || 64))));
      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
      positionBubble();

      const bodyRect = body.getBoundingClientRect();
      const bRect = bubble.getBoundingClientRect();
      const overlap = rectOverlapArea(bodyRect, bRect);
      const isAbove = bodyRect.bottom <= bRect.top + 1;
      const dist = Math.abs(nx - curLeft) + Math.abs(ny - curTop);
      const score = overlap * 1e6 + (preferAbove && !isAbove ? 1e5 : 0) + dist;
      if (score < best.score) best = { score, x: nx, y: ny };
      if (overlap <= 0 && (!preferAbove || isAbove)) {
        best = { score, x: nx, y: ny };
        break;
      }
    }
    root.style.left = `${best.x}px`;
    root.style.top = `${best.y}px`;
    positionBubble();
  }

  function showBubble({ preferAbove = true } = {}){
    if (!bubble) return;
    bubble.classList.remove("clippy-hidden");
    requestAnimationFrame(() => {
      positionBubble();
      snapOutOfBubble({ preferAbove });
    });
  }

  function openTalkWindowWithMessage(message){
    window.dispatchEvent(new CustomEvent("hedgey:open-app", { detail: { appId: "keelbaseTalkAgent" } }));
    if (message) {
      appendLogLine("You", message);
    }
  }

  function appendLogLine(who, text){
    const line = document.createElement("div");
    line.className = "clippy-line";
    line.innerHTML = `<strong>${escapeHtml(who)}:</strong> ${escapeHtml(text)}`;
    log?.appendChild(line);
    if (log) log.scrollTop = log.scrollHeight;
  }

  function getActiveVesselForClippy(){
    const state = window.__keelbaseRuntimeState;
    const vessels = Array.isArray(state?.vessels) ? state.vessels : [];
    if (!vessels.length) return null;
    return vessels[0];
  }

  async function sendClippyMessageToLiaison(message){
    const vessel = getActiveVesselForClippy();
    if (!vessel?.slug) {
      appendLogLine("Hitomi", "No vessel is registered yet. Please create a vessel first.");
      return;
    }

    const accountId = String(localStorage.getItem(KEELBASE_WALLET_AUTH_KEY) || "").trim();
    appendLogLine("You", message);
    clippyHistory.push({ role: "user", content: message });
    while (clippyHistory.length > 60) clippyHistory.shift();

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending";
    }
    appendLogLine("Hitomi", "Thinking...");

    try {
      const res = await fetch(`${KEELBASE_CHAT_API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vesselSlug: vessel.slug,
          crewRole: "liaison",
          accountId,
          message,
          history: clippyHistory.slice(-12)
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `chat request failed (${res.status})`);
      }

      const last = log?.lastElementChild;
      if (last?.textContent?.includes("Thinking...")) {
        last.remove();
      }

      const reply = String(json.reply || "No response.");
      clippyHistory.push({ role: "assistant", content: reply });
      while (clippyHistory.length > 60) clippyHistory.shift();
      appendLogLine("Hitomi", reply);
    } catch (error) {
      const last = log?.lastElementChild;
      if (last?.textContent?.includes("Thinking...")) {
        last.remove();
      }
      appendLogLine("Hitomi", `I hit an error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
      }
    }
  }

  const place = () => {
    const bounds = getBounds();
    setPosition(Math.max(bounds.minLeft, Math.min(20, bounds.maxLeft)), bounds.maxTop);
  };
  place();
  window.addEventListener("resize", () => {
    const left = parseFloat(root.style.left) || 0;
    const top = parseFloat(root.style.top) || 0;
    setPosition(left, top);
    snapOutOfBubble({ preferAbove: false });
  });

  openTalkBtn?.addEventListener("click", () => openTalkWindowWithMessage(""));
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(input?.value || "").trim();
    if (!text) return;
    sendClippyMessageToLiaison(text).catch(() => {});
    if (input) input.value = "";
  });

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;
  body?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    baseLeft = parseFloat(root.style.left) || 0;
    baseTop = parseFloat(root.style.top) || 0;
    body.setPointerCapture?.(event.pointerId);
  });
  body?.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    baseLeft += dx;
    baseTop += dy;
    startX = event.clientX;
    startY = event.clientY;
    const prevLeft = parseFloat(root.style.left) || 0;
    setPosition(baseLeft, baseTop);
    const nextLeft = parseFloat(root.style.left) || 0;
    root.classList.toggle("facing-left", nextLeft < prevLeft);
  });
  body?.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    body.releasePointerCapture?.(event.pointerId);
    if (!moved) {
      if (bubble?.classList.contains("clippy-hidden")) {
        showBubble({ preferAbove: true });
      } else {
        bubble?.classList.add("clippy-hidden");
      }
      return;
    }
    snapOutOfBubble({ preferAbove: false });
  });
  body?.addEventListener("pointercancel", () => {
    dragging = false;
  });
  body?.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!bubble || bubble.classList.contains("clippy-hidden")) return;
    if (root.contains(event.target)) return;
    bubble.classList.add("clippy-hidden");
  }, true);

  // Open bubble once on boot with proper placement logic.
  requestAnimationFrame(() => {
    showBubble({ preferAbove: true });
  });
}

function escapeHtml(input){
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

boot();

import { CHAT_API_BASE_URL, escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const statusEl = document.getElementById("status");
const todoListEl = document.getElementById("todoList");

vesselSelect.addEventListener("change", () => {
  loadTodos().catch(() => {});
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
  if (vessels.length === 0) {
    statusEl.textContent = "No vessels available yet.";
    todoListEl.innerHTML = "";
    return;
  }
  loadTodos().catch(() => {});
});

async function loadTodos() {
  const slug = vesselSelect.value;
  if (!slug) return;
  statusEl.textContent = `Loading tasks for ${slug}...`;
  const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/todos`);
  const payload = await response.json();
  const todos = Array.isArray(payload?.todos) ? payload.todos : [];
  todoListEl.innerHTML = "";
  for (const todo of todos) {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="line1">
        <span>${escapeHtml(String(todo.title || "Untitled"))}</span>
        <span>${escapeHtml(String(todo.status || "pending"))}</span>
      </div>
      <div class="line2">role=${escapeHtml(String(todo.role || "ceo"))}</div>
      <div class="line2">${escapeHtml(String(todo.note || ""))}</div>
    `;
    todoListEl.appendChild(node);
  }
  if (todos.length === 0) {
    todoListEl.innerHTML = '<article class="item"><div class="line2">No tasks seeded yet.</div></article>';
  }
  statusEl.textContent = `Loaded ${todos.length} task(s) for ${slug}.`;
}

requestRuntimeRefresh();

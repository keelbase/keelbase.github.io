import { CHAT_API_BASE_URL, escapeHtml } from "../keelbase-shared/core.js";
import { requestRuntimeRefresh, subscribeRuntime } from "../keelbase-shared/client-runtime.js";

const vesselSelect = document.getElementById("vesselSelect");
const vendorInput = document.getElementById("vendorInput");
const amountInput = document.getElementById("amountInput");
const currencyInput = document.getElementById("currencyInput");
const descriptionInput = document.getElementById("descriptionInput");
const statusEl = document.getElementById("status");
const paymentsListEl = document.getElementById("paymentsList");
const payForm = document.getElementById("payForm");
const submitBtn = document.getElementById("submitBtn");

vesselSelect.addEventListener("change", () => {
  loadPayments().catch(() => {});
});

payForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const slug = vesselSelect.value;
  if (!slug) return;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  try {
    const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vendor: vendorInput.value,
        amount: amountInput.value,
        currency: currencyInput.value,
        description: descriptionInput.value
      })
    });
    const payload = await response.json();
    statusEl.textContent = payload?.ok
      ? `Simulated payment anchored as proposal ${payload.anchorProposalId || "n/a"}.`
      : `Payment failed: ${payload?.error || "unknown error"}`;
    await loadPayments();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Simulate Payment";
  }
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
    loadPayments().catch(() => {});
  }
});

async function loadPayments() {
  const slug = vesselSelect.value;
  if (!slug) return;
  const response = await fetch(`${CHAT_API_BASE_URL}/api/vessel/${encodeURIComponent(slug)}/payments`);
  const payload = await response.json();
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  paymentsListEl.innerHTML = "";
  for (const payment of payments.slice().reverse()) {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="line1">
        <span>${escapeHtml(String(payment.vendor || "vendor"))}</span>
        <span>${escapeHtml(String(payment.status || "simulated"))}</span>
      </div>
      <div class="line2">${escapeHtml(String(payment.amount || "0"))} ${escapeHtml(String(payment.currency || "USD"))}</div>
      <div class="line2">${escapeHtml(String(payment.description || ""))}</div>
    `;
    paymentsListEl.appendChild(node);
  }
  if (payments.length === 0) {
    paymentsListEl.innerHTML = '<article class="item"><div class="line2">No simulated payments yet.</div></article>';
  }
}

requestRuntimeRefresh();

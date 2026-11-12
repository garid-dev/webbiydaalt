const state = {
  filters: [],
  history: [],
  feedback: [],
  currentView: "overview",
  action: null,
  activeFilter: null,
  companies: []
};

const viewInfo = {
  overview: ["Тойм", "Шүүлтүүрийн тойм", "ШУТИС-ийн ус цэвэршүүлэгч төхөөрөмжүүдийн бүртгэл, солих хугацааг нэг дороос хянаарай."],
  filters: ["Шүүлтүүрүүд", "Төхөөрөмжийн бүртгэл", "Байгууллагын бүх төхөөрөмжийн байршил, солих хугацаа, үйлчилгээний компанийг удирдана."],
  notifications: ["Мэдэгдэл", "Үйлчилгээний мэдэгдэл", "Хугацаа нь дөхсөн төхөөрөмжүүдийг хариуцсан компанитай хамтран товлож, хянана."],
  history: ["Солилтын түүх", "Үйлчилгээний түүх", "Товлосон болон гүйцэтгэсэн үйлчилгээний бүртгэл."],
  feedback: ["Санал хүсэлт", "Санал хүсэлт", "Үйлчилгээ болон системийг сайжруулах санал, хүсэлтээ илгээнэ үү."]
};

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const today = () => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};
const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return `${year} оны ${month} сарын ${day}`;
};
function setTheme(dark) {
  root.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content =
    getComputedStyle(root).getPropertyValue("--canvas").trim();
  $(".theme-toggle").setAttribute("aria-pressed", String(dark));
  $(".theme-icon").textContent = dark ? "☀️" : "🌙";
  $(".theme-label").textContent = dark ? "Цайвар горим" : "Харанхуй горим";
}

const savedTheme = localStorage.getItem("watercare-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
setTheme(savedTheme ? savedTheme === "dark" : prefersDark);

const dueLabel = (filter) => {
  if (filter.daysRemaining < 0) return `${Math.abs(filter.daysRemaining)} хоног хэтэрсэн`;
  if (filter.daysRemaining === 0) return "Өнөөдөр";
  if (filter.daysRemaining === 1) return "Маргааш";
  return `${filter.daysRemaining} хоногийн дараа`;
};
const statusLabel = (filter) => filter.scheduledDate
  ? "Товлосон"
  : filter.status === "overdue" ? "Хугацаа хэтэрсэн"
    : filter.status === "due-soon" ? "Солих дөхсөн" : "Хэвийн";
const visibleFilters = () => {
  const company = $("#company-scope").value;
  const search = $("#filter-search").value.trim().toLocaleLowerCase();
  return state.filters.filter((filter) => (!company || filter.company === company) &&
    (!search || [filter.assetCode, filter.institution, filter.location, filter.model, filter.company]
      .some((value) => value.toLocaleLowerCase().includes(search))));
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.message || "Хүсэлтийг боловсруулахад алдаа гарлаа.");
  return result;
}

function showError(message) {
  const banner = $("#error-banner");
  banner.textContent = message;
  banner.hidden = false;
  $("#success-toast").hidden = true;
}

function showSuccess(message) {
  const toast = $("#success-toast");
  toast.textContent = message;
  toast.hidden = false;
  $("#error-banner").hidden = true;
  window.setTimeout(() => { toast.hidden = true; }, 3500);
}

function clearError() {
  $("#error-banner").hidden = true;
}

async function loadData() {
  clearError();
  const company = $("#company-scope").value;
  const query = company ? `?company=${encodeURIComponent(company)}` : "";
  try {
    const [dashboard, filters, history, feedback] = await Promise.all([
      api(`/api/dashboard${query}`),
      api(`/api/filters${query}`),
      api(`/api/history${query}`),
      api("/api/feedback")
    ]);
    state.filters = filters;
    state.history = history;
    state.feedback = feedback;
    $("#stat-total").textContent = dashboard.total;
    $("#stat-due-soon").textContent = dashboard.dueSoon;
    $("#stat-overdue").textContent = dashboard.overdue;
    $("#stat-scheduled").textContent = dashboard.scheduled;
    $("#nav-total").textContent = dashboard.total;
    $("#nav-alerts").textContent = dashboard.dueSoon + dashboard.overdue;
    $("#notification-dot").hidden = dashboard.dueSoon + dashboard.overdue === 0;
    renderAll();
  } catch (error) {
    showError(error.message);
  }
}

async function loadCompanies() {
  try {
    state.companies = await api("/api/companies");
    for (const company of state.companies) {
      const option = new Option(company.name, company.name);
      $("#company-scope").add(option);
      $("#company-options").append(new Option(company.name, company.name));
    }
  } catch (error) {
    showError(error.message);
  }
}

function deviceCell(filter) {
  return `<div class="device-cell"><span class="device-icon">◉</span><span><strong>${escapeHtml(filter.assetCode)} · ${escapeHtml(filter.model)}</strong><small>${escapeHtml(filter.institution)}</small></span></div>`;
}

function statusPill(filter) {
  const status = filter.scheduledDate ? "scheduled" : filter.status;
  return `<span class="status-pill ${status}">${statusLabel(filter)}</span>`;
}

function filterRow(filter, compact = false) {
  const actions = `<div class="row-actions">
    <button class="row-action" data-action="schedule" data-id="${escapeHtml(filter.id)}">Товлох</button>
    <button class="row-action" data-action="replace" data-id="${escapeHtml(filter.id)}">Солисон</button>
  </div>`;
  return `<tr>
    <td>${deviceCell(filter)}</td>
    <td>${escapeHtml(filter.location)}</td>
    <td><span class="company-name">${escapeHtml(filter.company)}</span></td>
    ${compact ? "" : `<td class="date-cell">${formatDate(filter.installDate)}</td>`}
    <td class="date-cell">${formatDate(filter.dueDate)}<small>${dueLabel(filter)}</small></td>
    <td>${statusPill(filter)}</td>
    <td>${actions}</td>
  </tr>`;
}

function renderOverview() {
  const upcoming = state.filters
    .filter((filter) => filter.status !== "ok")
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 5);
  $("#upcoming-body").innerHTML = upcoming.map((filter) => filterRow(filter, true)).join("");
  $("#overview-empty").hidden = upcoming.length > 0;
}

function renderFilters() {
  const filters = visibleFilters().sort((a, b) => a.daysRemaining - b.daysRemaining);
  $("#filters-body").innerHTML = filters.map((filter) => filterRow(filter)).join("");
  $("#filters-empty").hidden = filters.length > 0;
}

function renderNotifications() {
  const notifications = state.filters
    .filter((filter) => filter.status !== "ok")
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  $("#notification-list").innerHTML = notifications.map((filter) => `
    <article class="notification-item">
      <span class="notification-indicator ${filter.status === "overdue" ? "overdue" : ""}"></span>
      <div class="notification-copy">
        <strong>${filter.status === "overdue" ? "Солих хугацаа хэтэрсэн" : "7 хоногийн урьдчилсан мэдэгдэл"} · ${escapeHtml(filter.assetCode)}</strong>
        <p>${escapeHtml(filter.institution)} · ${escapeHtml(filter.location)} · ${escapeHtml(filter.company)}</p>
        <div class="notification-time">${filter.status === "overdue" ? dueLabel(filter) : `Солих өдөр: ${formatDate(filter.dueDate)} (${dueLabel(filter)})`}</div>
        ${filter.scheduledDate ? `<div class="notification-time">Үйлчилгээ товлосон: ${formatDate(filter.scheduledDate)}${filter.scheduleNote ? ` · ${escapeHtml(filter.scheduleNote)}` : ""}</div>` : ""}
      </div>
      <div class="row-actions">
        <button class="row-action" data-action="schedule" data-id="${escapeHtml(filter.id)}">Үйлчилгээ товлох</button>
        <button class="row-action" data-action="replace" data-id="${escapeHtml(filter.id)}">Солисон</button>
      </div>
    </article>`).join("");
  $("#notifications-empty").hidden = notifications.length > 0;
}

function renderHistory() {
  $("#history-count").textContent = `${state.history.length} бүртгэл`;
  $("#history-list").innerHTML = state.history.map((entry) => `
    <article class="history-item">
      <span class="history-icon ${entry.action === "Товлосон" ? "scheduled" : ""}">${entry.action === "Товлосон" ? "↗" : "↻"}</span>
      <div class="history-copy">
        <strong>${escapeHtml(entry.action)} · ${escapeHtml(entry.assetCode)}</strong>
        <p>${escapeHtml(entry.institution)} · ${escapeHtml(entry.location)} · ${escapeHtml(entry.company)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</p>
        ${entry.action === "Сольсон" ? `<p>Дараагийн солих өдөр: ${formatDate(entry.nextDueDate)}</p>` : ""}
      </div>
      <span class="history-date">${formatDate(entry.actionDate)}</span>
    </article>`).join("");
  $("#history-empty").hidden = state.history.length > 0;
}

function renderFeedback() {
  $("#feedback-list").innerHTML = state.feedback.map((entry) => `
    <article class="feedback-item">
      <div class="feedback-item-top">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(entry.category)} · ${escapeHtml(entry.createdAt)}</span>
      </div>
      <p>${escapeHtml(entry.message)}</p>
    </article>`).join("");
  $("#feedback-empty").hidden = state.feedback.length > 0;
}

function renderAll() {
  renderOverview();
  renderFilters();
  renderNotifications();
  renderHistory();
  renderFeedback();
}

function setView(view) {
  state.currentView = viewInfo[view] ? view : "overview";
  for (const panel of document.querySelectorAll(".view-panel")) {
    panel.hidden = panel.id !== `${state.currentView}-view`;
  }
  for (const button of document.querySelectorAll(".nav-link")) {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  }
  const [breadcrumb, title, description] = viewInfo[state.currentView];
  $("#breadcrumb-current").textContent = breadcrumb;
  $("#page-title").textContent = title;
  $("#page-description").textContent = description;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAction(action, filter) {
  state.action = action;
  state.activeFilter = filter;
  const isSchedule = action === "schedule";
  $("#action-kicker").textContent = isSchedule ? "ҮЙЛЧИЛГЭЭНИЙ ТОВЛОЛТ" : "СОЛИЛТЫН БҮРТГЭЛ";
  $("#action-title").textContent = isSchedule ? "Үйлчилгээ товлох" : "Шүүлтүүр солисон";
  $("#action-context").textContent = `${filter.assetCode} · ${filter.location} · ${filter.company}`;
  $("#action-date-label").firstChild.textContent = isSchedule ? "Очих өдөр" : "Солисон өдөр";
  $("#action-submit").textContent = isSchedule ? "Товлох" : "Солилт бүртгэх";
  $("#action-form").elements.date.value = isSchedule ? filter.scheduledDate || today() : today();
  $("#action-form").elements.date.max = isSchedule ? "" : today();
  $("#action-form").elements.note.value = filter.scheduleNote || "";
  $("#action-dialog").showModal();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setView(viewButton.dataset.view);

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const filter = state.filters.find((item) => item.id === actionButton.dataset.id);
    if (filter) openAction(actionButton.dataset.action, filter);
  }

  const closeButton = event.target.closest("[data-close]");
  if (closeButton) document.getElementById(closeButton.dataset.close).close();
});

$("#company-scope").addEventListener("change", loadData);
$("#filter-search").addEventListener("input", renderFilters);
$(".theme-toggle").addEventListener("click", () => {
  const dark = root.dataset.theme !== "dark";
  setTheme(dark);
  localStorage.setItem("watercare-theme", dark ? "dark" : "light");
});
$("#open-register").addEventListener("click", () => {
  $("#register-form").elements.installDate.value = today();
  $("#register-dialog").showModal();
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const payload = {
    assetCode: form.get("assetCode"),
    institution: form.get("institution"),
    location: form.get("location"),
    model: form.get("model"),
    installDate: form.get("installDate"),
    intervalMonths: Number(form.get("intervalMonths")),
    company: form.get("company")
  };
  try {
    await api("/api/filters", { method: "POST", body: JSON.stringify(payload) });
    $("#register-dialog").close();
    formElement.reset();
    showSuccess("Төхөөрөмж амжилттай бүртгэгдлээ.");
    await loadData();
  } catch (error) {
    showError(error.message);
  }
});

$("#action-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = { note: form.get("note") };
  const endpoint = state.action === "schedule" ? "schedule" : "replace";
  payload[state.action === "schedule" ? "scheduledDate" : "replacedAt"] = form.get("date");
  try {
    const result = await api(`/api/filters/${encodeURIComponent(state.activeFilter.id)}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    $("#action-dialog").close();
    showSuccess(result.message || "Үйлчилгээний бүртгэл хадгалагдлаа.");
    await loadData();
  } catch (error) {
    showError(error.message);
  }
});

const feedbackFields = [
  {
    input: $("#feedback-name"),
    validate: (value) => value.trim().length >= 2 && value.trim().length <= 50 && !/\p{N}/u.test(value),
    error: "Нэрийг 2-50 тэмдэгтээр, тоогүй оруулна уу."
  },
  {
    input: $("#feedback-email"),
    validate: (value) => /^[^@\s.]+@[^@\s.]+(?:\.[^@\s.]+)+$/u.test(value.trim()),
    error: "Зөв имэйл хаяг оруулна уу."
  },
  {
    input: $("#feedback-message"),
    validate: (value) => value.trim().length >= 10 && value.trim().length <= 500,
    error: "Санал хүсэлтийг 10-500 тэмдэгтээр оруулна уу."
  }
];
let feedbackSubmitted = false;

function updateFeedbackField(field) {
  const valid = field.validate(field.input.value);
  const error = $(`#${field.input.id}-error`);
  field.input.setAttribute("aria-invalid", String(!valid));
  error.textContent = valid ? "" : field.error;
  error.hidden = valid;
  return valid;
}

$("#feedback-form").addEventListener("input", (event) => {
  const field = feedbackFields.find((item) => item.input === event.target);
  if (feedbackSubmitted && field) {
    updateFeedbackField(field);
    $("#feedback-status").textContent = "";
  }
});

$("#feedback-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  feedbackSubmitted = true;
  const invalidField = feedbackFields.find((field) => !updateFeedbackField(field));
  if (invalidField) {
    invalidField.input.focus();
    return;
  }

  const form = new FormData(formElement);
  const payload = {
    name: form.get("name"),
    email: form.get("email"),
    category: form.get("category"),
    message: form.get("message")
  };
  try {
    await api("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
    formElement.reset();
    feedbackSubmitted = false;
    feedbackFields.forEach((field) => field.input.setAttribute("aria-invalid", "false"));
    $(".feedback-status").textContent = "Санал хүсэлт амжилттай хадгалагдлаа. Баярлалаа!";
    showSuccess("Санал хүсэлт амжилттай хадгалагдлаа.");
    await loadData();
  } catch (error) {
    showError(error.message);
  }
});

async function start() {
  await loadCompanies();
  await loadData();
}

start();

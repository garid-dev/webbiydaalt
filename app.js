const state = {
  filters: [],
  history: [],
  feedback: [],
  currentView: "overview",
  action: null,
  activeFilter: null,
  paymentFilter: null,
  role: ["user", "admin"].includes(localStorage.getItem("watercare-role"))
    ? localStorage.getItem("watercare-role") : "user"
};

const viewInfo = {
  overview: ["Тойм", "Шүүлтүүрийн тойм", "ШУТИС-ийн ус цэвэршүүлэгч төхөөрөмжүүдийн бүртгэл, солих хугацааг нэг дороос хянаарай."],
  filters: ["Шүүлтүүрүүд", "Төхөөрөмжийн бүртгэл", "Байгууллагын бүх төхөөрөмжийн байршил, солих хугацааг удирдана."],
  notifications: ["Мэдэгдэл", "Үйлчилгээний мэдэгдэл", "Хугацаа нь дөхсөн төхөөрөмжүүдийн хүсэлтийг хянаж, шийдвэрлэнэ."],
  history: ["Солилтын түүх", "Үйлчилгээний түүх", "Товлосон болон гүйцэтгэсэн үйлчилгээний бүртгэл."],
  feedback: ["Санал хүсэлт", "Санал хүсэлт", "Үйлчилгээ болон системийг сайжруулах санал, хүсэлтээ илгээнэ үү."]
};

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
const staticMode = location.hostname.endsWith(".github.io") ||
  new URLSearchParams(location.search).has("staticDemo");
const storageKeys = {
  filters: "watercare-pages-filters",
  history: "watercare-pages-history",
  feedback: "watercare-pages-feedback"
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const today = () => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};
const shiftDays = (value, days) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const shiftMonths = (value, months) => {
  const [year, month, day] = value.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12 + 12) % 12;
  const targetDay = Math.min(day, new Date(targetYear, targetMonth + 1, 0).getDate());
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
};
function readStaticCollection(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}
function writeStaticCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function initializeStaticDemo() {
  const savedFilters = readStaticCollection(storageKeys.filters);
  const existingAssetCodes = new Set(savedFilters.map((filter) =>
    String(filter.assetCode ?? "").toLocaleLowerCase()));
  const dueOffsets = [2, 5, 35, 65, 125, 1];
  const companies = ["Билэг ус цэвэршүүлэгч", "Билэг ус цэвэршүүлэгч", "Билэг ус цэвэршүүлэгч", "Aqua Service", "Aqua Service", "Билэг ус цэвэршүүлэгч"];
  const locations = [
    "Хичээлийн 1-р байр · 1 давхар",
    "Хичээлийн 2-р байр · номын сан",
    "МХТС · багш нарын өрөө",
    "ГУУС · лаборатори",
    "Төв байр · захиргаа",
    "Хичээлийн 3-р байр · 2 давхар"
  ];
  const filters = dueOffsets.map((offset, index) => {
    const dueDate = shiftDays(today(), offset);
    return {
      id: `static-demo-${index + 1}`,
      assetCode: `SHUTIS-${String(index + 1).padStart(3, "0")}`,
      institution: "ШУТИС",
      location: locations[index],
      model: index < 2 || index === 4 ? "Aqua Pro 300" : "PureFlow X2",
      installDate: shiftMonths(dueDate, -6),
      intervalMonths: 6,
      company: companies[index],
      scheduledDate: null,
      scheduleNote: null,
      userConfirmed: false,
      userRejected: false,
      paymentPaid: false,
      paymentDecided: false,
      adminApproved: false,
      adminRejected: false,
      requestOpen: false,
      lastReplacedAt: null
    };
  });
  const missingFilters = filters.filter((filter) =>
    !existingAssetCodes.has(filter.assetCode.toLocaleLowerCase()));
  if (missingFilters.length > 0) {
    writeStaticCollection(storageKeys.filters, [...savedFilters, ...missingFilters]);
  }
  if (localStorage.getItem(storageKeys.history) === null) {
    writeStaticCollection(storageKeys.history, []);
  }
  if (localStorage.getItem(storageKeys.feedback) === null) {
    writeStaticCollection(storageKeys.feedback, []);
  }
}

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
    : filter.status === "due-soon" ? "Солих дөхсөн"
      : filter.status === "replaced" ? "Солигдсон" : "Хэвийн";
const canProcess = (filter) => filter.requestOpen || filter.userRejected || filter.adminRejected ||
  filter.status === "overdue" || filter.status === "due-soon";
function approvalProgress(filter) {
  const steps = [
    [filter.userConfirmed ? "Зөвшөөрсөн" : filter.userRejected ? "Татгалзсан" : "Хүлээгдэж буй", "Хэрэглэгч", filter.userConfirmed, filter.userRejected],
    [filter.paymentPaid ? "Төлсөн" : filter.paymentDecided ? "Төлөөгүй" : "Хүлээгдэж буй", "Төлбөр", filter.paymentPaid, filter.paymentDecided && !filter.paymentPaid],
    [filter.adminApproved ? "Зөвшөөрсөн" : filter.adminRejected ? "Татгалзсан" : "Хүлээгдэж буй", "Админ", filter.adminApproved, filter.adminRejected]
  ];
  return `<div class="approval-checklist" aria-label="Солих зөвшөөрлийн явц">${steps.map(([status, label, complete, rejected]) => `
    <span class="approval-step ${complete ? "complete" : ""} ${rejected ? "rejected" : ""}">${escapeHtml(label)}: ${escapeHtml(status)}</span>
  `).join("")}</div>`;
}
function roleActions(filter) {
  if (!canProcess(filter) || filter.status === "replaced") return "";
  const actions = [];
  if (state.role === "user" && (filter.userRejected || filter.adminRejected)) {
    actions.push(`<button class="row-action" data-action="approval" data-step="user-confirm" data-id="${escapeHtml(filter.id)}">Шинэ хүсэлт гаргах</button>`);
  } else if (state.role === "user" && !filter.userConfirmed) {
    actions.push(`<button class="row-action" data-action="approval" data-step="user-confirm" data-id="${escapeHtml(filter.id)}">Зөвшөөрөх</button>`);
    actions.push(`<button class="row-action" data-action="approval" data-step="user-reject" data-id="${escapeHtml(filter.id)}">Татгалзах</button>`);
  } else if (state.role === "user" && filter.userConfirmed && !filter.paymentPaid) {
    actions.push(`<button class="row-action" data-action="payment-qr" data-id="${escapeHtml(filter.id)}">Төлбөрийн QR харах</button>`);
  }
  if (state.role === "admin" && filter.requestOpen && filter.userConfirmed &&
      filter.paymentPaid && !filter.adminApproved && !filter.adminRejected) {
    actions.push(`<button class="row-action" data-action="approval" data-step="admin-approve" data-id="${escapeHtml(filter.id)}">Зөвшөөрөх</button>`);
    actions.push(`<button class="row-action" data-action="approval" data-step="admin-reject" data-id="${escapeHtml(filter.id)}">Татгалзах</button>`);
  }
  return actions.length ? `<div class="row-actions">${actions.join("")}</div>` : "";
}
const visibleFilters = () => {
  const search = $("#filter-search").value.trim().toLocaleLowerCase();
  return state.filters.filter((filter) =>
    (!search || [filter.assetCode, filter.institution, filter.location, filter.model]
      .some((value) => value.toLocaleLowerCase().includes(search))));
};

async function api(path, options = {}) {
  if (staticMode) return staticApi(path, options);
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.message || "Хүсэлтийг боловсруулахад алдаа гарлаа.");
  return result;
}

function staticApi(path, options) {
  const url = new URL(path, location.href);
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const filters = readStaticCollection(storageKeys.filters);

  if (url.pathname === "/api/filters" && method === "GET") {
    const search = (url.searchParams.get("search") || "").toLocaleLowerCase();
    return filters
      .filter((filter) =>
        (!search || [filter.assetCode, filter.institution, filter.location, filter.model]
          .some((value) => value.toLocaleLowerCase().includes(search))))
      .map(staticFilterView);
  }
  if (url.pathname === "/api/dashboard" && method === "GET") {
    const rows = filters.map(staticFilterView);
    return {
      total: rows.length,
      overdue: rows.filter((filter) => filter.status === "overdue").length,
      dueSoon: rows.filter((filter) => filter.status === "due-soon").length,
      scheduled: rows.filter((filter) => filter.scheduledDate).length
    };
  }
  if (url.pathname === "/api/history" && method === "GET") {
    return readStaticCollection(storageKeys.history);
  }
  if (url.pathname === "/api/feedback" && method === "GET") {
    return readStaticCollection(storageKeys.feedback);
  }
  if (url.pathname === "/api/feedback" && method === "POST") {
    const feedback = readStaticCollection(storageKeys.feedback);
    const entry = {
      id: Date.now(),
      name: body.name.trim(),
      category: body.category,
      message: body.message.trim(),
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " ")
    };
    feedback.unshift(entry);
    writeStaticCollection(storageKeys.feedback, feedback);
    return entry;
  }
  if (url.pathname === "/api/filters" && method === "POST") {
    if (filters.some((filter) => filter.assetCode.toLowerCase() === body.assetCode.trim().toLowerCase())) {
      throw new Error("Энэ хөрөнгийн дугаар бүртгэлтэй байна.");
    }
    const filter = {
      id: `static-${Date.now()}`,
      assetCode: body.assetCode.trim(),
      institution: body.institution.trim(),
      location: body.location.trim(),
      model: body.model.trim(),
      installDate: body.installDate,
      intervalMonths: Number(body.intervalMonths),
      company: "",
      scheduledDate: null,
      scheduleNote: null,
      userConfirmed: false,
      userRejected: false,
      paymentPaid: false,
      paymentDecided: false,
      adminApproved: false,
      adminRejected: false,
      requestOpen: false,
      lastReplacedAt: null
    };
    filters.push(filter);
    writeStaticCollection(storageKeys.filters, filters);
    return staticFilterView(filter);
  }

  const actionMatch = url.pathname.match(/^\/api\/filters\/([^/]+)\/(schedule|user-confirm|user-reject|payment|admin-approve|admin-reject)$/);
  if (actionMatch && method === "POST") {
    const [, id, action] = actionMatch;
    const filter = filters.find((entry) => entry.id === id);
    if (!filter) throw new Error("Шүүлтүүр олдсонгүй.");
    const oldView = staticFilterView(filter);
    const history = readStaticCollection(storageKeys.history);

    if (action === "schedule") {
      if (!filter.requestOpen) {
        filter.userConfirmed = false;
        filter.userRejected = false;
        filter.paymentPaid = false;
        filter.paymentDecided = false;
        filter.adminApproved = false;
        filter.adminRejected = false;
      }
      filter.requestOpen = true;
      filter.scheduledDate = body.scheduledDate;
      filter.scheduleNote = body.note?.trim() || null;
      history.unshift({
        id: Date.now(),
        assetCode: filter.assetCode,
        institution: filter.institution,
        location: filter.location,
        company: filter.company,
        action: "Товлосон",
        actionDate: today(),
        previousDueDate: oldView.dueDate,
        nextDueDate: oldView.dueDate,
        note: filter.scheduleNote
      });
      writeStaticCollection(storageKeys.filters, filters);
      writeStaticCollection(storageKeys.history, history);
      return { message: "Солих үйлчилгээг товлолоо." };
    }

    if (action !== "payment" && !filter.requestOpen) {
      filter.userConfirmed = false;
      filter.userRejected = false;
      filter.paymentPaid = false;
      filter.paymentDecided = false;
      filter.adminApproved = false;
      filter.adminRejected = false;
      filter.requestOpen = true;
    }
    let label;
    if (action === "payment") {
      filter.paymentDecided = true;
      filter.paymentPaid = Boolean(body.paid);
      label = filter.paymentPaid ? "Төлбөр төлсөн" : "Төлбөр төлөөгүй";
    } else {
      const approval = {
        "user-confirm": ["userConfirmed", "userRejected", true, "Хэрэглэгч зөвшөөрсөн"],
        "user-reject": ["userConfirmed", "userRejected", false, "Хэрэглэгч татгалзсан"],
        "admin-approve": ["adminApproved", "adminRejected", true, "Админ зөвшөөрсөн"],
        "admin-reject": ["adminApproved", "adminRejected", false, "Админ татгалзсан"]
      }[action];
      const [approvedField, rejectedField, approved, actionLabel] = approval;
      filter[approvedField] = approved;
      filter[rejectedField] = !approved;
      filter.requestOpen = approved;
      label = actionLabel;
    }
    history.unshift({
      id: Date.now(),
      assetCode: filter.assetCode,
      institution: filter.institution,
      location: filter.location,
      company: filter.company,
      action: label,
      actionDate: today(),
      previousDueDate: oldView.dueDate,
      nextDueDate: oldView.dueDate,
      note: null
    });
    let message = `${label} бүртгэгдлээ.`;
    if (filter.requestOpen && filter.userConfirmed && !filter.userRejected && filter.paymentPaid &&
        filter.paymentDecided && filter.adminApproved && !filter.adminRejected) {
      const replacedAt = today();
      const nextDueDate = shiftMonths(replacedAt, Number(filter.intervalMonths));
      filter.installDate = replacedAt;
      filter.lastReplacedAt = replacedAt;
      filter.scheduledDate = null;
      filter.scheduleNote = null;
      filter.requestOpen = false;
      history.unshift({
        id: Date.now() + 1,
        assetCode: filter.assetCode,
        institution: filter.institution,
        location: filter.location,
        company: filter.company,
        action: "Сольсон",
        actionDate: replacedAt,
        previousDueDate: oldView.dueDate,
        nextDueDate,
        note: "Хэрэглэгч зөвшөөрч, төлбөр төлж, админ зөвшөөрсөн."
      });
      message = "Гурван нөхцөл биелсэн тул шүүлтүүр солигдлоо.";
    }
    writeStaticCollection(storageKeys.filters, filters);
    writeStaticCollection(storageKeys.history, history);
    return { filter: staticFilterView(filter), message };
  }

  throw new Error("Энэ үйлдлийг static demo дэмжихгүй байна.");
}

function staticFilterView(filter) {
  filter.userConfirmed = Boolean(filter.userConfirmed);
  filter.userRejected = Boolean(filter.userRejected);
  filter.paymentPaid = Boolean(filter.paymentPaid);
  filter.paymentDecided = Boolean(filter.paymentDecided);
  filter.adminApproved = Boolean(filter.adminApproved);
  filter.adminRejected = Boolean(filter.adminRejected);
  filter.requestOpen = Boolean(filter.requestOpen);
  filter.lastReplacedAt = filter.lastReplacedAt || null;
  const dueDate = shiftMonths(filter.installDate, Number(filter.intervalMonths));
  const daysRemaining = Math.round(
    (new Date(`${dueDate}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000
  );
  return {
    ...filter,
    dueDate,
    daysRemaining,
    status: daysRemaining < 0 ? "overdue" : daysRemaining <= 7 ? "due-soon" :
      filter.lastReplacedAt && !filter.requestOpen ? "replaced" : "ok"
  };
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
  try {
    const [dashboard, filters, history, feedback] = await Promise.all([
      api("/api/dashboard"),
      api("/api/filters"),
      api("/api/history"),
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

function deviceCell(filter) {
  return `<div class="device-cell"><span class="device-icon">◉</span><span><strong>${escapeHtml(filter.assetCode)} · ${escapeHtml(filter.model)}</strong><small>${escapeHtml(filter.institution)}</small></span></div>`;
}

function statusPill(filter) {
  const status = filter.scheduledDate ? "scheduled" : filter.status;
  return `<span class="status-pill ${status}">${statusLabel(filter)}</span>`;
}

function filterRow(filter, compact = false) {
  const actions = `<div class="approval-cell">${canProcess(filter) ? approvalProgress(filter) : ""}
    ${roleActions(filter)}</div>`;
  return `<tr>
    <td>${deviceCell(filter)}</td>
    <td>${escapeHtml(filter.location)}</td>
    ${compact ? "" : `<td class="date-cell">${formatDate(filter.installDate)}</td>`}
    <td class="date-cell">${formatDate(filter.dueDate)}<small>${dueLabel(filter)}</small></td>
    <td>${statusPill(filter)}</td>
    <td>${actions}</td>
  </tr>`;
}

function renderOverview() {
  const upcoming = state.filters
    .filter((filter) => canProcess(filter))
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
    .filter((filter) => canProcess(filter))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  $("#notification-list").innerHTML = notifications.map((filter) => `
    <article class="notification-item">
      <span class="notification-indicator ${filter.status === "overdue" ? "overdue" : ""}"></span>
      <div class="notification-copy">
        <strong>${filter.status === "overdue" ? "Солих хугацаа хэтэрсэн" : "7 хоногийн урьдчилсан мэдэгдэл"} · ${escapeHtml(filter.assetCode)}</strong>
        <p>${escapeHtml(filter.institution)} · ${escapeHtml(filter.location)}</p>
        <div class="notification-time">${filter.status === "overdue" ? dueLabel(filter) : `Солих өдөр: ${formatDate(filter.dueDate)} (${dueLabel(filter)})`}</div>
        ${filter.scheduledDate ? `<div class="notification-time">Үйлчилгээ товлосон: ${formatDate(filter.scheduledDate)}${filter.scheduleNote ? ` · ${escapeHtml(filter.scheduleNote)}` : ""}</div>` : ""}
        ${approvalProgress(filter)}
      </div>
      ${roleActions(filter)}
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
        <p>${escapeHtml(entry.institution)} · ${escapeHtml(entry.location)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</p>
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
  $("#action-kicker").textContent = "ҮЙЛЧИЛГЭЭНИЙ ТОВЛОЛТ";
  $("#action-title").textContent = "Үйлчилгээ товлох";
  $("#action-context").textContent = `${filter.assetCode} · ${filter.location}`;
  $("#action-date-label").firstChild.textContent = "Очих өдөр";
  $("#action-submit").textContent = "Товлох";
  $("#action-form").elements.date.value = filter.scheduledDate || today();
  $("#action-form").elements.date.max = "";
  $("#action-form").elements.note.value = filter.scheduleNote || "";
  $("#action-dialog").showModal();
}

function openPaymentDialog(filter) {
  state.paymentFilter = filter;
  $("#payment-context").textContent = `${filter.assetCode} · ${filter.location}`;
  $("#payment-dialog").showModal();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setView(viewButton.dataset.view);

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const filter = state.filters.find((item) => item.id === actionButton.dataset.id);
    if (filter && actionButton.dataset.action === "approval") {
      api(`/api/filters/${encodeURIComponent(filter.id)}/${actionButton.dataset.step}`, {
        method: "POST"
      }).then(async (result) => {
        await loadData();
        if (actionButton.dataset.step === "user-confirm") {
          openPaymentDialog(result.filter);
        } else {
          showSuccess(result.message || "Шийдвэр бүртгэгдлээ.");
        }
      }).catch((error) => showError(error.message));
    } else if (filter && actionButton.dataset.action === "payment-qr") {
      openPaymentDialog(filter);
    } else if (filter && actionButton.dataset.action === "schedule") {
      openAction("schedule", filter);
    }
  }

  const paymentButton = event.target.closest("[data-payment-paid]");
  if (paymentButton && state.paymentFilter) {
    const paid = paymentButton.dataset.paymentPaid === "true";
    api(`/api/filters/${encodeURIComponent(state.paymentFilter.id)}/payment`, {
      method: "POST",
      body: JSON.stringify({ paid })
    }).then(async (result) => {
      $("#payment-dialog").close();
      showSuccess(result.message || "Төлбөрийн төлөв бүртгэгдлээ.");
      await loadData();
    }).catch((error) => showError(error.message));
  }

  const closeButton = event.target.closest("[data-close]");
  if (closeButton) document.getElementById(closeButton.dataset.close).close();
});

$("#actor-role").value = state.role;
$("#actor-role").addEventListener("change", (event) => {
  state.role = event.currentTarget.value;
  localStorage.setItem("watercare-role", state.role);
  renderAll();
});
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
    company: ""
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
  payload.scheduledDate = form.get("date");
  try {
    const result = await api(`/api/filters/${encodeURIComponent(state.activeFilter.id)}/schedule`, {
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
  if (staticMode) initializeStaticDemo();
  await loadData();
}

start();

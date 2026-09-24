import { auth, db, userManagementAuth } from "./firebase.js";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  ref,
  push,
  get,
  onValue,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const state = {
  users: [],
  scaleCategories: [],
  scaleMembers: [],
  scaleServices: {},
  vehicles: [],
  drivers: [],
  missions: [],
  workOrders: []
};

let missionCalendarDate = new Date();
missionCalendarDate.setDate(1);

let missionWeeklyDate = new Date();
missionWeeklyDate.setDate(missionWeeklyDate.getDate() - missionWeeklyDate.getDay());

const dataSectionIds = ["dashboard", "search", "vehicles", "drivers", "missions", "monthlyCalendar", "workOrders"];
const sectionIds = ["dashboard", "users", "scale", "account", "search", "vehicles", "drivers", "missions", "monthlyCalendar", "workOrders"];
const sectionTitles = {
  dashboard: "Dashboard",
  users: "Usuários",
  scale: "Escala",
  account: "Minha conta",
  search: "Pesquisa geral",
  vehicles: "Veículos",
  drivers: "Condutores",
  missions: "Missões",
  monthlyCalendar: "Calendário do mês",
  workOrders: "Operações"
};

let activeSectionId = "dashboard";
let scaleStartDate = new Date();
scaleStartDate.setHours(0, 0, 0, 0);
let scaleLoadedDays = 60;
let activeScaleCategoryId = "";
let scaleMembersUnsubscribe = null;
let scaleServicesUnsubscribe = null;

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const pageTitle = document.getElementById("pageTitle");
const sidebarToggle = document.getElementById("sidebarToggle");
const vehicleHistorySelect = document.getElementById("vehicleHistorySelect");
const vehicleHistoryList = document.getElementById("vehicleHistoryList");
const generalSearchInput = document.getElementById("generalSearchInput");
const generalSearchType = document.getElementById("generalSearchType");
const generalSearchStatus = document.getElementById("generalSearchStatus");
const generalSearchResults = document.getElementById("generalSearchResults");
const generalSearchSummary = document.getElementById("generalSearchSummary");
const missionCalendarModal = document.getElementById("missionCalendarModal");
const missionCalendarModalTitle = document.getElementById("missionCalendarModalTitle");
const missionCalendarModalSummary = document.getElementById("missionCalendarModalSummary");
const missionCalendarModalList = document.getElementById("missionCalendarModalList");
const missionCalendarModalClose = document.getElementById("missionCalendarModalClose");
const missionStatusFilter = document.getElementById("missionStatusFilter");
const authScreen = document.getElementById("authScreen");
const appShell = document.getElementById("appShell");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");
const authSubmit = document.getElementById("authSubmit");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const forgotPassword = document.getElementById("forgotPassword");
const logoutButton = document.getElementById("logoutButton");
const currentUserEmail = document.getElementById("currentUserEmail");
const passwordForm = document.getElementById("passwordForm");
const currentPasswordInput = document.getElementById("currentPassword");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const passwordMessage = document.getElementById("passwordMessage");
const usersNavItem = document.getElementById("usersNavItem");
const usersAdminContent = document.getElementById("usersAdminContent");
const usersAccessMessage = document.getElementById("usersAccessMessage");
const userForm = document.getElementById("userForm");
const userMessage = document.getElementById("userMessage");
const usersTableBody = document.getElementById("usersTableBody");
const userPermissionsPanel = document.getElementById("userPermissionsPanel");
const userPermissionsTarget = document.getElementById("userPermissionsTarget");
const userPermissionsForm = document.getElementById("userPermissionsForm");
const closeUserPermissions = document.getElementById("closeUserPermissions");
const cancelUserPermissions = document.getElementById("cancelUserPermissions");
const permissionInputs = {
  view: document.getElementById("permissionView"),
  scaleView: document.getElementById("permissionScaleView"),
  create: document.getElementById("permissionCreate"),
  edit: document.getElementById("permissionEdit"),
  delete: document.getElementById("permissionDelete"),
  scaleEdit: document.getElementById("permissionScaleEdit")
};
const editPermissionInputs = {
  view: document.getElementById("editPermissionView"),
  scaleView: document.getElementById("editPermissionScaleView"),
  create: document.getElementById("editPermissionCreate"),
  edit: document.getElementById("editPermissionEdit"),
  delete: document.getElementById("editPermissionDelete"),
  scaleEdit: document.getElementById("editPermissionScaleEdit")
};

let dataUnsubscribers = [];
let userAccessUnsubscribe = null;
let managedUsersUnsubscribe = null;
let currentUserProfile = null;
let selectedPermissionsUserId = "";
const popupLayer = document.getElementById("popupLayer");
const confirmDialog = document.getElementById("confirmDialog");
const confirmDialogMessage = document.getElementById("confirmDialogMessage");
const confirmDialogConfirm = document.getElementById("confirmDialogConfirm");
const confirmDialogCancel = document.getElementById("confirmDialogCancel");
let pendingConfirmResolve = null;

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value, fallback = "-") {
  return escapeHtml(value === undefined || value === null || value === "" ? fallback : value);
}

function showPopup(message, type = "info") {
  if (!message || !popupLayer) return;
  const icons = {
    success: "circle-check",
    error: "circle-alert",
    info: "info"
  };
  const toast = document.createElement("div");
  toast.className = "popup-toast";
  toast.dataset.type = type;

  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", icons[type] || icons.info);
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("p");
  text.className = "text-sm leading-5";
  text.textContent = message;

  toast.append(icon, text);
  popupLayer.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 180);
  }, 4200);
}

function closeConfirmDialog(result) {
  confirmDialog?.classList.add("hidden");
  confirmDialog?.classList.remove("flex");
  confirmDialog?.setAttribute("aria-hidden", "true");
  pendingConfirmResolve?.(result);
  pendingConfirmResolve = null;
}

function confirmPopup(message) {
  if (!confirmDialog || !confirmDialogMessage) return Promise.resolve(false);
  if (pendingConfirmResolve) closeConfirmDialog(false);
  confirmDialogMessage.textContent = message;
  confirmDialog.classList.remove("hidden");
  confirmDialog.classList.add("flex");
  confirmDialog.setAttribute("aria-hidden", "false");
  confirmDialogConfirm?.focus();
  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

confirmDialogConfirm?.addEventListener("click", () => closeConfirmDialog(true));
confirmDialogCancel?.addEventListener("click", () => closeConfirmDialog(false));
confirmDialog?.addEventListener("click", (event) => {
  if (event.target === confirmDialog) closeConfirmDialog(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingConfirmResolve) closeConfirmDialog(false);
});

const permissionNames = {
  view: "visualizar os dados gerais",
  scaleView: "visualizar a escala",
  create: "adicionar",
  edit: "editar",
  delete: "excluir",
  scaleEdit: "editar a escala"
};

function hasPermission(permission) {
  if (currentUserProfile?.role === "admin") return true;
  if (currentUserProfile?.active === false) return false;
  if (permission === "view") {
    if (currentUserProfile?.permissions?.create === true || currentUserProfile?.permissions?.edit === true || currentUserProfile?.permissions?.delete === true) return true;
    if (currentUserProfile?.permissions?.view === undefined) return true;
  }
  if (permission === "scaleView") {
    if (currentUserProfile?.permissions?.scaleView === true || currentUserProfile?.permissions?.scaleEdit === true) return true;
    if (currentUserProfile?.permissions?.scaleView === undefined) return currentUserProfile?.permissions?.view !== false;
    return false;
  }
  return currentUserProfile?.active !== false && currentUserProfile?.permissions?.[permission] === true;
}

function requirePermission(permission) {
  if (hasPermission(permission)) return true;
  showPopup(`Você não tem permissão para ${permissionNames[permission] || "executar esta ação"}.`, "error");
  return false;
}

function canModifyRecords() {
  return hasPermission("edit") || hasPermission("delete");
}

function canAccessSection(sectionId) {
  if (!currentUserProfile) return true;
  if (sectionId === "account") return true;
  if (sectionId === "users") return currentUserProfile.role === "admin" && currentUserProfile.active !== false;
  if (sectionId === "scale") return hasPermission("scaleView") || hasPermission("scaleEdit");
  if (dataSectionIds.includes(sectionId)) return hasPermission("view");
  return true;
}

function getDefaultSectionId() {
  if (hasPermission("view")) return "dashboard";
  if (hasPermission("scaleView") || hasPermission("scaleEdit")) return "scale";
  return "account";
}

function applyAccessVisibility() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("hidden", !canAccessSection(item.dataset.target));
  });
  if (!canAccessSection(activeSectionId)) {
    setActiveSection(getDefaultSectionId());
  }
}

function getPermissionsFromInputs(inputs) {
  const permissions = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Boolean(input?.checked)]));
  if (permissions.create || permissions.edit || permissions.delete) permissions.view = true;
  if (permissions.scaleEdit) permissions.scaleView = true;
  return permissions;
}

function setPermissionInputs(inputs, permissions) {
  const normalizedPermissions = {
    ...permissions,
    view: permissions.view === true || permissions.create === true || permissions.edit === true || permissions.delete === true,
    scaleView: permissions.scaleView === true || permissions.scaleEdit === true
  };
  Object.entries(inputs).forEach(([key, input]) => {
    if (input) input.checked = normalizedPermissions[key] === true;
  });
}

function applyPermissionUi() {
  const formPermissions = {
    vehicleForm: ["create", "edit"],
    driverForm: ["create", "edit"],
    missionForm: ["create", "edit"]
  };
  Object.entries(formPermissions).forEach(([formId, permissions]) => {
    const form = document.getElementById(formId);
    const panel = form?.closest(".bg-white");
    if (panel) panel.classList.toggle("hidden", !permissions.some((permission) => hasPermission(permission)));
  });
  document.querySelectorAll("[data-action=edit]").forEach((button) => button.classList.toggle("hidden", !hasPermission("edit")));
  document.querySelectorAll("[data-action=delete]").forEach((button) => button.classList.toggle("hidden", !hasPermission("delete")));
  document.querySelectorAll("[data-action=toggle], [data-action=close], [data-action=save-mission-operation], [data-action=complete-mission-operation]")
    .forEach((button) => button.classList.toggle("hidden", !hasPermission("edit")));
  document.querySelectorAll("[data-action-column], [data-action-cell]")
    .forEach((element) => element.classList.toggle("hidden", !canModifyRecords()));
  document.querySelectorAll("[data-mission-vehicle], [data-mission-driver]")
    .forEach((field) => { field.disabled = !hasPermission("edit"); });
}

document.getElementById("userRole")?.addEventListener("change", (event) => {
  const isAdmin = event.target.value === "admin";
  setPermissionInputs(permissionInputs, isAdmin
    ? { view: true, scaleView: true, create: true, edit: true, delete: true, scaleEdit: true }
    : { view: true, scaleView: true, create: false, edit: false, delete: false, scaleEdit: false });
  Object.values(permissionInputs).forEach((input) => { if (input) input.disabled = isAdmin; });
});

function setAuthMessage(message, type = "error") {
  authMessage?.classList.add("hidden");
  showPopup(message, type);
}

function getAuthErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/user-not-found": "Não existe uma conta com este e-mail.",
    "auth/wrong-password": "Senha atual incorreta.",
    "auth/requires-recent-login": "Entre novamente no sistema e tente alterar a senha.",
    "auth/operation-not-allowed": "Ative o login por e-mail e senha nas configurações do Firebase.",
    "auth/network-request-failed": "Não foi possível conectar ao Firebase. Verifique sua internet."
  };
  return messages[error?.code] || "Não foi possível concluir a operação. Tente novamente.";
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  authSubmit.disabled = true;
  authMessage.classList.add("hidden");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    authForm.reset();
  } catch (error) {
    setAuthMessage(error.code ? getAuthErrorMessage(error) : error.message);
  } finally {
    authSubmit.disabled = false;
  }
});

forgotPassword?.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage("Informe seu e-mail para receber o link de recuperação.");
    authEmail.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("Enviamos um link de recuperação para seu e-mail.", "success");
  } catch (error) {
    setAuthMessage(getAuthErrorMessage(error));
  }
});

logoutButton?.addEventListener("click", () => signOut(auth));

function setPasswordMessage(message, type = "error") {
  passwordMessage?.classList.add("hidden");
  showPopup(message, type);
}

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const currentPassword = currentPasswordInput?.value || "";
  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmNewPasswordInput?.value || "";

  if (!user?.email) {
    setPasswordMessage("Não foi possível identificar o usuário logado.");
    return;
  }
  if (newPassword !== confirmPassword) {
    setPasswordMessage("A confirmação da nova senha não confere.");
    return;
  }

  const submit = passwordForm.querySelector("button[type=submit]");
  submit.disabled = true;
  passwordMessage?.classList.add("hidden");
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    passwordForm.reset();
    setPasswordMessage("Senha alterada com sucesso.", "success");
  } catch (error) {
    setPasswordMessage(getAuthErrorMessage(error));
  } finally {
    submit.disabled = false;
  }
});

function setUserMessage(message, type = "error") {
  userMessage?.classList.add("hidden");
  showPopup(message, type);
}

function renderUsersTable() {
  if (!usersTableBody) return;
  if (!state.users.length) {
    usersTableBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-slate-500">Nenhuma pessoa cadastrada.</td></tr>';
    return;
  }
  usersTableBody.innerHTML = [...state.users]
    .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""))
    .map((item) => {
      const active = item.active !== false;
      const isCurrentUser = item.id === auth.currentUser?.uid;
      const userId = safeText(item.id, "");
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4"><p class="font-medium">${safeText(item.name, "Sem nome")}</p><p class="text-xs text-slate-500">${safeText(item.email)}</p></td>
        <td class="py-3 pr-4">${item.role === "admin" ? "Administrador" : "Operador"}</td>
        <td class="py-3 pr-4"><span class="rounded-full px-2 py-1 text-xs ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}">${active ? "Ativo" : "Bloqueado"}</span></td>
        <td class="py-3"><div class="flex flex-wrap gap-2">${item.role === "admin" ? "Administrador" : `<button type="button" class="text-accent hover:underline" data-user-action="permissions" data-id="${userId}">Permissões</button><button type="button" class="text-accent hover:underline" data-user-action="toggle" data-id="${userId}" ${isCurrentUser ? "disabled" : ""}>${active ? "Bloquear" : "Reativar"}</button>`}</div></td>
      </tr>`;
    })
    .join("");
  applyPermissionUi();
}

userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUserProfile?.role !== "admin") return;
  const submit = userForm.querySelector("button[type=submit]");
  const email = document.getElementById("userEmail").value.trim();
  const name = document.getElementById("userName").value.trim();
  const password = document.getElementById("userPassword").value;
  const role = "operator";
  const permissions = getPermissionsFromInputs(permissionInputs);
  submit.disabled = true;
  userMessage.classList.add("hidden");

  try {
    const credential = await createUserWithEmailAndPassword(userManagementAuth, email, password);
    await update(ref(db, `users/${credential.user.uid}`), {
      name,
      email,
      role,
      permissions,
      active: true,
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid
    });
    userForm.reset();
    setUserMessage("Acesso cadastrado com sucesso.", "success");
  } catch (error) {
    setUserMessage(getAuthErrorMessage(error));
  } finally {
    await signOut(userManagementAuth).catch(() => {});
    submit.disabled = false;
  }
});

usersTableBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-user-action]");
  if (!button || currentUserProfile?.role !== "admin") return;
  const item = state.users.find((entry) => entry.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.userAction === "permissions") {
    selectedPermissionsUserId = item.id;
    userPermissionsTarget.textContent = `${item.name || "Sem nome"} (${item.email || "sem e-mail"})`;
    setPermissionInputs(editPermissionInputs, item.role === "admin"
      ? { view: true, scaleView: true, create: true, edit: true, delete: true, scaleEdit: true }
      : {
        view: item.permissions?.view !== false,
        scaleView: item.permissions?.scaleView === true || item.permissions?.scaleEdit === true || (item.permissions?.scaleView === undefined && item.permissions?.view !== false),
        create: item.permissions?.create === true,
        edit: item.permissions?.edit === true,
        delete: item.permissions?.delete === true,
        scaleEdit: item.permissions?.scaleEdit === true
      });
    Object.values(editPermissionInputs).forEach((input) => { if (input) input.disabled = false; });
    userPermissionsPanel?.classList.remove("hidden");
    userPermissionsPanel?.classList.add("flex");
    userPermissionsPanel?.setAttribute("aria-hidden", "false");
    userPermissionsPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (button.dataset.userAction === "toggle" && !button.disabled) {
    await update(ref(db, `users/${item.id}`), { active: item.active === false, updatedAt: Date.now() });
  }
});

userPermissionsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUserProfile?.role !== "admin" || !selectedPermissionsUserId) return;
  const item = state.users.find((entry) => entry.id === selectedPermissionsUserId);
  if (!item || item.role === "admin") return;
  await update(ref(db, `users/${selectedPermissionsUserId}`), {
    permissions: getPermissionsFromInputs(editPermissionInputs),
    updatedAt: Date.now()
  });
  userPermissionsPanel?.classList.add("hidden");
});

closeUserPermissions?.addEventListener("click", () => {
  selectedPermissionsUserId = "";
  userPermissionsPanel?.classList.add("hidden");
  userPermissionsPanel?.classList.remove("flex");
  userPermissionsPanel?.setAttribute("aria-hidden", "true");
});

cancelUserPermissions?.addEventListener("click", () => closeUserPermissions?.click());
userPermissionsPanel?.addEventListener("click", (event) => {
  if (event.target === userPermissionsPanel) closeUserPermissions?.click();
});

const scaleCategoryForm = document.getElementById("scaleCategoryForm");
const scaleCategoryName = document.getElementById("scaleCategoryName");
const scaleCategorySelect = document.getElementById("scaleCategorySelect");
const scaleMemberForm = document.getElementById("scaleMemberForm");
const scaleMemberEditor = document.getElementById("scaleMemberEditor");
const scaleDriverSelect = document.getElementById("scaleDriverSelect");
const scaleMessage = document.getElementById("scaleMessage");
const scaleCalendarGrid = document.getElementById("scaleCalendarGrid");
const scaleCalendarTitle = document.getElementById("scaleCalendarTitle");
const scaleCalendarSummary = document.getElementById("scaleCalendarSummary");

function setScaleMessage(message, type = "error") {
  scaleMessage?.classList.add("hidden");
  showPopup(message, type);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function scaleTypeForDate(dateKey) {
  const day = fromDateKey(dateKey).getDay();
  return day === 0 || day === 6 ? "red" : "black";
}

function scaleTypeLabel(type) {
  return type === "red" ? "Vermelha" : "Preta";
}

function scaleVisibleDays() {
  return Array.from({ length: scaleLoadedDays }, (_, index) => {
    const date = new Date(scaleStartDate);
    date.setDate(scaleStartDate.getDate() + index);
    return date;
  });
}

function countScaleDays(startDateKey, endDateKey, type) {
  let count = 0;
  const cursor = fromDateKey(startDateKey);
  const end = fromDateKey(endDateKey);
  while (cursor <= end) {
    if (scaleTypeForDate(toDateKey(cursor)) === type) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function scaleMemberStartDate(member) {
  if (member.startedDate) return member.startedDate;
  if (member.createdAt) return toDateKey(new Date(member.createdAt));
  return toDateKey(scaleStartDate);
}

function scaleCounterFor(member, dateKey) {
  const type = scaleTypeForDate(dateKey);
  const services = Object.entries(state.scaleServices[member.id] || {})
    .filter(([serviceDate, service]) => service?.scaleType === type && serviceDate <= dateKey)
    .sort(([a], [b]) => a.localeCompare(b));
  const lastServiceDate = services.at(-1)?.[0] || "";
  if (lastServiceDate === dateKey) return 0;
  const startDate = lastServiceDate
    ? toDateKey(new Date(fromDateKey(lastServiceDate).setDate(fromDateKey(lastServiceDate).getDate() + 1)))
    : scaleMemberStartDate(member);
  if (startDate > dateKey) return "-";
  return countScaleDays(startDate, dateKey, type);
}

function renderScaleCategories() {
  if (!scaleCategorySelect) return;
  const current = activeScaleCategoryId;
  scaleCategorySelect.innerHTML = state.scaleCategories.length
    ? state.scaleCategories.map((category) => `<option value="${safeText(category.id, "")}">${safeText(category.name, "Sem nome")}</option>`).join("")
    : '<option value="">Nenhuma categoria criada</option>';
  if (state.scaleCategories.some((category) => category.id === current)) {
    scaleCategorySelect.value = current;
  }
  scaleCategorySelect.disabled = !state.scaleCategories.length;
}

function renderScaleDriverOptions() {
  if (!scaleDriverSelect) return;
  const current = scaleDriverSelect.value;
  scaleDriverSelect.innerHTML = '<option value="">Selecione um condutor</option>'
    + state.drivers.map((driver) => `<option value="${safeText(driver.id, "")}">${safeText(formatDriverLabel(driver))}</option>`).join("");
  if (current) scaleDriverSelect.value = current;
}

function renderScaleCalendar() {
  if (!scaleCalendarGrid) return;
  if (!hasPermission("scaleView") && !hasPermission("scaleEdit")) {
    scaleCalendarGrid.innerHTML = '<p class="py-8 text-center text-sm text-slate-500">Você não tem permissão para visualizar a escala.</p>';
    return;
  }
  const previousScrollLeft = scaleCalendarGrid.scrollLeft;
  const category = state.scaleCategories.find((item) => item.id === activeScaleCategoryId);
  const days = scaleVisibleDays();
  const firstDayLabel = days[0]?.toLocaleDateString("pt-BR") || "";
  const lastDayLabel = days.at(-1)?.toLocaleDateString("pt-BR") || "";
  if (scaleCalendarTitle) scaleCalendarTitle.textContent = category ? `Escala - ${category.name}` : "Escala";
  if (scaleCalendarSummary) scaleCalendarSummary.textContent = `${firstDayLabel} até ${lastDayLabel} | ${state.scaleMembers.length} militar(es)`;
  if (!category || !state.scaleMembers.length) {
    scaleCalendarGrid.innerHTML = '<p class="py-8 text-center text-sm text-slate-500">Crie uma categoria e adicione militares para montar a escala.</p>';
    return;
  }

  const monthGroups = days.reduce((groups, date) => {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const lastGroup = groups.at(-1);
    if (lastGroup?.monthKey === monthKey) {
      lastGroup.count += 1;
    } else {
      groups.push({ monthKey, label, count: 1 });
    }
    return groups;
  }, []);

  const monthHeader = monthGroups
    .map((group) => `<th class="scale-month-header border-b border-l border-slate-200 px-3 py-2 text-left" colspan="${group.count}">${safeText(group.label)}</th>`)
    .join("");

  const header = days.map((date, index) => {
    const dateKey = toDateKey(date);
    const type = scaleTypeForDate(dateKey);
    const label = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    const isMonthStart = index === 0 || date.getDate() === 1;
    return `<th class="scale-day-header ${isMonthStart ? "scale-month-start" : ""} border-b border-l border-slate-200 px-2 py-2 text-center" data-scale-type="${type}"><span class="block text-[11px] font-medium uppercase ${type === "red" ? "text-rose-700" : "text-slate-600"}">${label}</span><span class="block text-base font-semibold text-slate-900">${date.getDate()}</span><span class="block text-[10px] ${type === "red" ? "text-rose-600" : "text-slate-500"}">${scaleTypeLabel(type)}</span></th>`;
  }).join("");

  const rows = [...state.scaleMembers]
    .sort((a, b) => (a.number || "").localeCompare(b.number || "", "pt-BR", { numeric: true }) || (a.name || "").localeCompare(b.name || "", "pt-BR"))
    .map((member) => {
    const cells = days.map((date) => {
      const dateKey = toDateKey(date);
      const type = scaleTypeForDate(dateKey);
      const service = state.scaleServices[member.id]?.[dateKey];
      const counter = String(scaleCounterFor(member, dateKey));
      const isMonthStart = date === days[0] || date.getDate() === 1;
      const content = service
        ? `<span class="block text-xs uppercase tracking-wide">Serviço</span>`
        : `<span class="block text-sm font-semibold">${counter}</span><span class="block text-[10px]">Folga</span>`;
      return `<td class="scale-cell ${isMonthStart ? "scale-month-start" : ""} border-b border-l border-slate-200 p-1 text-center" data-scale-type="${type}">${hasPermission("scaleEdit") ? `<button type="button" class="scale-cell-button ${service ? "scale-service" : "text-slate-600"}" data-scale-service data-member-id="${safeText(member.id, "")}" data-date="${safeText(dateKey, "")}" aria-label="${safeText(`${service ? "Remover serviço" : "Marcar serviço"} em ${formatDate(dateKey)}`)}">${content}</button>` : `<div class="scale-cell-static ${service ? "scale-service" : "text-slate-600"}">${content}</div>`}</td>`;
    }).join("");
    return `<tr class="scale-row"><th class="scale-person-cell sticky left-0 z-10 border-b border-slate-200 px-3 py-2 text-left"><span class="block truncate font-medium text-slate-900">${safeText(member.name, "Sem nome")}</span><span class="block truncate text-xs text-slate-500">${safeText(member.number, "---")} · ${safeText(member.rank, "Sem graduação")}</span>${hasPermission("scaleEdit") ? `<button type="button" class="scale-remove-button mt-1 inline-flex items-center gap-1 text-xs" data-scale-member-remove data-member-id="${safeText(member.id, "")}"><i data-lucide="x" class="h-3 w-3" aria-hidden="true"></i>Remover</button>` : ""}</th>${cells}</tr>`;
  }).join("");
  scaleCalendarGrid.innerHTML = `<table class="border-separate border-spacing-0 text-sm"><thead><tr><th class="scale-person-cell sticky left-0 z-20 border-b border-slate-200 px-3 py-2 text-left">Mês</th>${monthHeader}</tr><tr><th class="scale-person-cell sticky left-0 z-20 border-b border-slate-200 px-3 py-2 text-left">Militar</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  refreshIcons();
  requestAnimationFrame(() => {
    scaleCalendarGrid.scrollLeft = previousScrollLeft;
  });
}

function detachScaleCategoryListeners() {
  scaleMembersUnsubscribe?.();
  scaleServicesUnsubscribe?.();
  scaleMembersUnsubscribe = null;
  scaleServicesUnsubscribe = null;
  state.scaleMembers = [];
  state.scaleServices = {};
}

function attachScaleCategoryListeners() {
  detachScaleCategoryListeners();
  if (!activeScaleCategoryId) {
    renderScaleCalendar();
    return;
  }
  scaleMembersUnsubscribe = onValue(ref(db, `scaleMembers/${activeScaleCategoryId}`), (snapshot) => {
    state.scaleMembers = toArray(snapshot);
    renderScaleCalendar();
  });
  scaleServicesUnsubscribe = onValue(ref(db, `scaleServices/${activeScaleCategoryId}`), (snapshot) => {
    state.scaleServices = snapshot.val() || {};
    renderScaleCalendar();
  });
}

scaleCategorySelect?.addEventListener("change", () => {
  activeScaleCategoryId = scaleCategorySelect.value;
  attachScaleCategoryListeners();
});

scaleCategoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requirePermission("scaleEdit")) return;
  const name = scaleCategoryName.value.trim();
  if (!name) return;
  await push(ref(db, "scaleCategories"), { name, createdAt: Date.now(), createdBy: auth.currentUser.uid });
  scaleCategoryForm.reset();
});

scaleMemberForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requirePermission("scaleEdit")) return;
  if (!activeScaleCategoryId) {
    setScaleMessage("Crie ou selecione uma categoria primeiro.");
    return;
  }
  const driver = state.drivers.find((item) => item.id === scaleDriverSelect.value);
  if (!driver) {
    setScaleMessage("Selecione um condutor cadastrado.");
    return;
  }
  if (state.scaleMembers.some((member) => member.driverId === driver.id)) {
    setScaleMessage("Este condutor já está nesta categoria de escala.");
    return;
  }
  const name = (driver.name || "").trim();
  const number = (driver.number || "").trim();
  const rank = (driver.rank || driver.role || "").trim();
  if (number && !/^\d{1,3}$/.test(number)) {
    setScaleMessage("O número do condutor deve ter no máximo 3 dígitos.");
    return;
  }
  await update(ref(db, `scaleMembers/${activeScaleCategoryId}/${driver.id}`), {
    driverId: driver.id,
    name,
    number,
    rank,
    startedDate: toDateKey(new Date()),
    createdAt: Date.now(),
    createdBy: auth.currentUser.uid
  });
  scaleMemberForm.reset();
  setScaleMessage("Militar adicionado à escala.", "success");
});

scaleCalendarGrid?.addEventListener("click", async (event) => {
  const serviceButton = event.target.closest("[data-scale-service]");
  const removeButton = event.target.closest("[data-scale-member-remove]");
  if (removeButton) {
    if (!requirePermission("scaleEdit")) return;
    const memberId = removeButton.dataset.memberId;
    if (await confirmPopup("Deseja remover este militar da escala?")) {
      await remove(ref(db, `scaleMembers/${activeScaleCategoryId}/${memberId}`));
      await remove(ref(db, `scaleServices/${activeScaleCategoryId}/${memberId}`));
    }
    return;
  }
  if (!serviceButton || !requirePermission("scaleEdit")) return;
  const memberId = serviceButton.dataset.memberId;
  const dateKey = serviceButton.dataset.date;
  const path = ref(db, `scaleServices/${activeScaleCategoryId}/${memberId}/${dateKey}`);
  if (state.scaleServices[memberId]?.[dateKey]) {
    await remove(path);
  } else {
    await update(path, { scaleType: scaleTypeForDate(dateKey), createdAt: Date.now(), createdBy: auth.currentUser.uid });
  }
});

scaleCalendarGrid?.addEventListener("scroll", () => {
  const distanceToEnd = scaleCalendarGrid.scrollWidth - scaleCalendarGrid.scrollLeft - scaleCalendarGrid.clientWidth;
  if (distanceToEnd > 360 || scaleCalendarGrid.dataset.loadingMore === "true") return;
  scaleCalendarGrid.dataset.loadingMore = "true";
  scaleLoadedDays += 30;
  renderScaleCalendar();
  requestAnimationFrame(() => {
    delete scaleCalendarGrid.dataset.loadingMore;
  });
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function toggleSidebar(open) {
  const shouldOpen = typeof open === "boolean" ? open : sidebar.classList.contains("-translate-x-full");
  sidebar.classList.toggle("-translate-x-full", !shouldOpen);
  sidebarOverlay.classList.toggle("hidden", !shouldOpen);
}

function setActiveSection(sectionId) {
  if (!canAccessSection(sectionId)) {
    sectionId = getDefaultSectionId();
  }
  activeSectionId = sectionId;
  sectionIds.forEach((id) => {
    const section = document.getElementById(id);
    if (section) {
      section.classList.toggle("hidden", id !== sectionId);
    }
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("bg-blue-50", item.dataset.target === sectionId);
    item.classList.toggle("text-accent", item.dataset.target === sectionId);
  });

  pageTitle.textContent = sectionTitles[sectionId] || "Dashboard";
  toggleSidebar(false);

  if (sectionId === "dashboard") {
    updateDashboard(true);
    animateDashboard();
  }
}

function toArray(snapshot) {
  const data = snapshot.val() || {};
  return Object.keys(data).map((id) => ({ id, ...data[id] }));
}

function formatVehicleLabel(vehicle) {
  if (!vehicle) return "Não definido";
  const model = vehicle.model ? ` - ${vehicle.model}` : "";
  return `${vehicle.eb || "Sem EB"}${model}`;
}

function formatDriverLabel(driver) {
  if (!driver) return "Não definido";
  const number = driver.number ? `${driver.number} - ` : "";
  const role = (driver.rank || driver.role) ? `${driver.rank || driver.role} - ` : "";
  const name = driver.name || "Sem nome";
  return `${number}${role}${name}`.trim();
}

function normalizeText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const closedWorkOrderStatuses = new Set(["Concluída", "Cancelada"]);

function isWorkOrderOpen(order) {
  const status = (order?.status || "Aberta").trim();
  return !closedWorkOrderStatuses.has(status);
}

function isDriverOnMission(driverId) {
  return state.workOrders.some((order) => order.driverId === driverId && isWorkOrderOpen(order))
    || state.missions.some((mission) => mission.driverId === driverId && isMissionInProgress(mission));
}

function isVehicleAvailableForScheduling(vehicleId, proposedDepartureDate, proposedDepartureTime) {
  const openOrders = state.workOrders.filter((order) => order.vehicleId === vehicleId && isWorkOrderOpen(order));

  if (!openOrders.length) return { available: true };

  const proposedDateTime = toTimestamp(proposedDepartureDate, proposedDepartureTime);
  const conflicts = [];

  openOrders.forEach((order) => {
    const expectedReturnDateTime = toTimestamp(order.expectedArrivalDate, order.expectedArrivalTime);
    const departureDateTime = toTimestamp(order.departureDate, order.departureTime);

    if (!expectedReturnDateTime) {
      conflicts.push({
        order,
        reason: `Operação aberta em ${formatDateTime(order.departureDate, order.departureTime)} sem horário previsto de retorno`
      });
    } else if (proposedDateTime < expectedReturnDateTime) {
      conflicts.push({
        order,
        reason: `Veículo deve retornar às ${formatDateTime(order.expectedArrivalDate, order.expectedArrivalTime)}`
      });
    }
  });

  return { available: conflicts.length === 0, conflicts };
}

function getDriverStatusLabel(driver) {
  if (!driver) return "-";
  return isDriverOnMission(driver.id) ? "Em missão" : driver.status || "Ocioso";
}

function formatDateTime(dateValue, timeValue) {
  if (!dateValue && !timeValue) return "-";
  if (dateValue && timeValue) return `${dateValue} ${timeValue}`;
  return dateValue || timeValue;
}

function getMissionPriorityLabel(priority) {
  return priority || "Média";
}

function getMissionPriorityClass(priority) {
  if (priority === "Alta") return "bg-rose-50 text-rose-700";
  if (priority === "Baixa") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

function getMissionPeriodLabel(mission) {
  const startLabel = formatDateTime(formatDate(mission?.date), mission?.time);
  const endLabel = formatDate(mission?.endDate);
  if (startLabel === "-" && endLabel === "-") return "-";
  if (endLabel === "-") return `Início: ${startLabel}`;
  if (startLabel === "-") return `Fim: ${endLabel}`;
  return `${startLabel} até ${endLabel}`;
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function toTimestamp(dateValue, timeValue) {
  if (dateValue) {
    const iso = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T00:00`;
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getWorkOrderTimestamp(order) {
  return order?.createdAt
    || toTimestamp(order?.departureDate, order?.departureTime)
    || order?.updatedAt
    || 0;
}

function getMissionOperationTimestamp(mission) {
  return toTimestamp(mission?.date, mission?.time)
    || mission?.updatedAt
    || mission?.createdAt
    || 0;
}

function renderTimeline(container, events, emptyMessage) {
  if (!container) return;
  if (!events.length) {
    container.innerHTML = `<p class="text-slate-500">${safeText(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = events
    .map(
      (event) => `<div class="flex gap-3">
        <i data-lucide="history" class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true"></i>
        <div>
          <p class="font-medium">${safeText(event.title)}</p>
          <p class="text-xs text-slate-500">${safeText(event.meta)}</p>
        </div>
      </div>`
    )
    .join("");
  refreshIcons();
}

function closeMissionCalendarModal() {
  if (!missionCalendarModal) return;
  missionCalendarModal.classList.add("hidden");
  missionCalendarModal.setAttribute("aria-hidden", "true");
}

function openMissionCalendarModal(dateKey) {
  if (!missionCalendarModal || !missionCalendarModalTitle || !missionCalendarModalSummary || !missionCalendarModalList) {
    return;
  }

  const missions = state.missions
    .filter((mission) => mission.date === dateKey)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const workOrders = state.workOrders
    .filter((order) => order.departureDate === dateKey)
    .sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
  const completed = missions.filter((mission) => normalizeMissionStatus(mission.status) === "Concluída").length;
  const inProgress = missions.length - completed;
  const totalItems = missions.length + workOrders.length;

  missionCalendarModalTitle.textContent = `Agenda de ${formatDate(dateKey)}`;
  missionCalendarModalSummary.textContent = totalItems
    ? `${missions.length} missão(ões) • ${inProgress} em andamento • ${completed} concluída(s) • ${workOrders.length} operação(ões).`
    : "Nenhuma missão ou operação cadastrada para este dia.";

  if (!totalItems) {
    missionCalendarModalList.innerHTML = '<p class="text-sm text-slate-500">Não há missões ou operações registradas para esta data.</p>';
  } else {
    const items = [
      ...missions.map((mission) => ({ type: "mission", mission })),
      ...workOrders.map((order) => ({ type: "workOrder", order }))
    ].sort((a, b) => {
      const aTime = a.type === "mission" ? a.mission.time : a.order.departureTime;
      const bTime = b.type === "mission" ? b.mission.time : b.order.departureTime;
      return (aTime || "99:99").localeCompare(bTime || "99:99");
    });
    missionCalendarModalList.innerHTML = items
      .map((item) => {
        if (item.type === "mission") {
          const { mission } = item;
          const status = normalizeMissionStatus(mission.status);
          const statusClass = getMissionStatusClass(status);
          const timeLabel = safeText(mission.time, "Sem hora");
          const locationLabel = safeText(mission.location, "Sem local");
          const priorityLabel = safeText(getMissionPriorityLabel(mission.priority));
          const endLabel = mission.endDate ? ` • Fim: ${safeText(formatDate(mission.endDate))}` : "";
          const notesLabel = mission.notes ? `<p class="text-sm text-slate-500 mt-1">${safeText(mission.notes)}</p>` : "";
          return `<div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">${safeText(mission.title, "Missão")}</p>
                <p class="text-sm text-slate-600 mt-1">${timeLabel} • ${locationLabel}${endLabel}</p>
                <p class="text-xs text-slate-500 mt-1">Prioridade: ${priorityLabel}</p>
              </div>
              <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${safeText(status)}</span>
            </div>
            ${notesLabel}
          </div>`;
        }
        const { order } = item;
        const vehicle = state.vehicles.find((v) => v.id === order.vehicleId);
        const driver = state.drivers.find((d) => d.id === order.driverId);
        const timeLabel = order.departureTime || "Sem hora";
        const meta = [formatVehicleLabel(vehicle), formatDriverLabel(driver)].filter(Boolean).join(" • ");
        return `<div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
          <div class="flex items-start justify-between gap-3">
            <div>
            <p class="font-semibold text-slate-900">${safeText(order.destination, "Operação")}</p>
            <p class="text-sm text-slate-600 mt-1">${safeText(timeLabel)}${meta ? ` • ${safeText(meta)}` : ""}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700">${safeText(order.status, "Aberta")}</span>
          </div>
        </div>`;
      })
      .join("");
  }

  missionCalendarModal.classList.remove("hidden");
  missionCalendarModal.setAttribute("aria-hidden", "false");
}

function setFormMode(form, isEditing) {
  const submit = form.querySelector("[data-submit]");
  const cancel = form.querySelector("[data-cancel]");
  if (submit) {
    submit.textContent = isEditing ? submit.dataset.editText : submit.dataset.defaultText;
  }
  if (cancel) {
    cancel.classList.toggle("hidden", !isEditing);
  }
  if (!isEditing) {
    delete form.dataset.editId;
    form.reset();
  }
}

function updateVehicleSelects() {
  const selects = document.querySelectorAll("[data-vehicle-select]");
  selects.forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Selecione um veículo</option>';
    state.vehicles.forEach((vehicle) => {
      const option = document.createElement("option");
      option.value = vehicle.id;
      option.textContent = formatVehicleLabel(vehicle);
      select.appendChild(option);
    });
    if (current) {
      select.value = current;
    }
  });
}

function updateDriverSelects() {
  const selects = document.querySelectorAll("[data-driver-select]");
  selects.forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Selecione um condutor</option>';
    state.drivers.forEach((driver) => {
      const option = document.createElement("option");
      option.value = driver.id;
      option.textContent = formatDriverLabel(driver);
      select.appendChild(option);
    });
    if (current) {
      select.value = current;
    }
  });
}

function renderEmptyRow(tbody, colspan, message) {
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="py-6 text-center text-slate-500">${safeText(message)}</td></tr>`;
}

function getMissionStatusClass(status) {
  status = normalizeMissionStatus(status);
  if (status === "Concluída") return "bg-emerald-50 text-emerald-700";
  return "bg-sky-50 text-sky-700";
}

function normalizeMissionStatus(status) {
  return status === "Concluída" ? "Concluída" : "Em andamento";
}

function isMissionInProgress(mission) {
  return normalizeMissionStatus(mission.status) === "Em andamento";
}

function renderVehiclesTable() {
  const tbody = document.getElementById("vehiclesTableBody");
  if (!tbody) return;
  if (!state.vehicles.length) {
    renderEmptyRow(tbody, 4, "Nenhum veículo cadastrado.");
    return;
  }
  tbody.innerHTML = state.vehicles
    .map(
      (vehicle) => `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${safeText(vehicle.eb)}</td>
        <td class="py-3 pr-4">${safeText(vehicle.model)}</td>
        <td class="py-3 pr-4">${safeText(vehicle.status)}</td>
        <td class="py-3" data-action-cell>
          <button class="text-accent mr-3" data-action="edit" data-id="${safeText(vehicle.id, "")}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${safeText(vehicle.id, "")}">Excluir</button>
        </td>
      </tr>`
    )
    .join("");
}

function renderDriversTable() {
  const tbody = document.getElementById("driversTableBody");
  if (!tbody) return;
  if (!state.drivers.length) {
    renderEmptyRow(tbody, 5, "Nenhum condutor cadastrado.");
    return;
  }
  tbody.innerHTML = state.drivers
    .map(
      (driver) => `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${safeText(formatDriverLabel(driver))}</td>
        <td class="py-3 pr-4">${safeText(driver.number)}</td>
        <td class="py-3 pr-4">${safeText(driver.phone)}</td>
        <td class="py-3 pr-4">${safeText(getDriverStatusLabel(driver))}</td>
        <td class="py-3" data-action-cell>
          <button class="text-accent mr-3" data-action="edit" data-id="${safeText(driver.id, "")}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${safeText(driver.id, "")}">Excluir</button>
        </td>
      </tr>`
    )
    .join("");
}


function renderMissionsTable() {
  const tbody = document.getElementById("missionsTableBody");
  if (!tbody) return;
  if (!state.missions.length) {
    renderEmptyRow(tbody, 7, "Nenhuma missão cadastrada.");
    return;
  }
  const statusFilter = missionStatusFilter?.value || "all";
  const filteredMissions = [...state.missions].filter((mission) => {
    if (statusFilter === "all") return true;
    return normalizeMissionStatus(mission.status) === statusFilter;
  });
  if (!filteredMissions.length) {
    renderEmptyRow(tbody, 7, "Nenhuma missão encontrada para este status.");
    return;
  }
  tbody.innerHTML = filteredMissions
    .sort((a, b) => (toTimestamp(a.date, a.time) || 0) - (toTimestamp(b.date, b.time) || 0))
    .map((mission) => {
      const status = normalizeMissionStatus(mission.status);
      const priority = getMissionPriorityLabel(mission.priority);
      const toggleLabel = status === "Concluída" ? "Reabrir" : "Concluir";
      const statusClass = getMissionStatusClass(status);
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">
          <p class="font-medium">${safeText(mission.title)}</p>
          <p class="text-xs text-slate-500">${safeText(mission.location, "")}${mission.location && mission.notes ? " • " : ""}${safeText(mission.notes, "")}</p>
        </td>
        <td class="py-3 pr-4">
          <span class="text-xs px-2 py-1 rounded-full ${getMissionPriorityClass(priority)}">${safeText(priority)}</span>
        </td>
        <td class="py-3 pr-4">${safeText(mission.location)}</td>
        <td class="py-3 pr-4">${safeText(formatDateTime(formatDate(mission.date), mission.time))}</td>
        <td class="py-3 pr-4">${safeText(formatDate(mission.endDate))}</td>
        <td class="py-3 pr-4">
          <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${safeText(status)}</span>
        </td>
        <td class="py-3 whitespace-nowrap" data-action-cell>
          <button class="text-accent mr-3" data-action="toggle" data-id="${safeText(mission.id, "")}">${safeText(toggleLabel)}</button>
          <button class="text-accent mr-3" data-action="edit" data-id="${safeText(mission.id, "")}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${safeText(mission.id, "")}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderOngoingMissionsPanel() {
  const container = document.getElementById("ongoingMissionsPanel");
  if (!container) return;
  const ongoingMissions = state.missions
    .filter(isMissionInProgress)
    .sort((a, b) => (toTimestamp(a.date, a.time) || 0) - (toTimestamp(b.date, b.time) || 0));
  if (!ongoingMissions.length) {
    container.innerHTML = '<p class="text-slate-500">Nenhuma operação em andamento.</p>';
    return;
  }
  const vehicleOptions = ['<option value="">Selecione um veículo</option>']
    .concat(state.vehicles.map((vehicle) => `<option value="${safeText(vehicle.id, "")}">${safeText(formatVehicleLabel(vehicle))}</option>`))
    .join("");
  const driverOptions = ['<option value="">Selecione um condutor</option>']
    .concat(state.drivers.map((driver) => `<option value="${safeText(driver.id, "")}">${safeText(formatDriverLabel(driver))}</option>`))
    .join("");
  container.innerHTML = ongoingMissions
    .map((mission) => {
      const vehicle = state.vehicles.find((item) => item.id === mission.vehicleId);
      const driver = state.drivers.find((item) => item.id === mission.driverId);
      const dateLabel = formatDateTime(formatDate(mission.date), mission.time);
      const locationLabel = safeText(mission.location, "Sem local");
      const notesLabel = mission.notes ? `<p class="text-xs text-slate-500 mt-1">${safeText(mission.notes)}</p>` : "";
      return `<div class="rounded-md border border-slate-100 p-4 bg-white">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">${safeText(mission.title, "Operação")}</p>
            <p class="text-xs text-slate-500">${safeText(dateLabel)} • ${locationLabel}</p>
            ${notesLabel}
          </div>
          <span class="text-xs px-2 py-1 rounded-full ${getMissionStatusClass("Em andamento")}">Em andamento</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label class="text-xs text-slate-500">Veículo</label>
            <select data-mission-vehicle data-id="${safeText(mission.id, "")}" class="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
              ${vehicleOptions}
            </select>
            <p class="text-[11px] text-slate-400 mt-1">${safeText(vehicle ? formatVehicleLabel(vehicle) : "Nenhum veículo vinculado")}</p>
          </div>
          <div>
            <label class="text-xs text-slate-500">Condutor</label>
            <select data-mission-driver data-id="${safeText(mission.id, "")}" class="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
              ${driverOptions}
            </select>
            <p class="text-[11px] text-slate-400 mt-1">${safeText(driver ? formatDriverLabel(driver) : "Nenhum condutor vinculado")}</p>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2 mt-4">
           <button type="button" data-action="complete-mission-operation" data-id="${safeText(mission.id, "")}" class="px-3 py-2 rounded-md border border-slate-200 text-slate-600 text-xs hover:text-accent hover:border-accent transition">Concluir missão</button>
           <button type="button" data-action="save-mission-operation" data-id="${safeText(mission.id, "")}" class="px-3 py-2 rounded-md bg-accent text-white text-xs shadow-sm shadow-blue-500/20 hover:bg-accent-dark transition">Salvar equipe</button>
        </div>
      </div>`;
    })
    .join("");
  ongoingMissions.forEach((mission) => {
    const vehicleSelect = container.querySelector(`[data-mission-vehicle][data-id="${mission.id}"]`);
    const driverSelect = container.querySelector(`[data-mission-driver][data-id="${mission.id}"]`);
    if (vehicleSelect) vehicleSelect.value = mission.vehicleId || "";
    if (driverSelect) driverSelect.value = mission.driverId || "";
  });
}

function renderWorkOrdersTable() {
  const tbody = document.getElementById("workOrdersTableBody");
  if (!tbody) return;
  if (!state.workOrders.length) {
    renderEmptyRow(tbody, 7, "Nenhuma operação cadastrada.");
    return;
  }
  tbody.innerHTML = state.workOrders
    .map((item) => {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
      const driver = state.drivers.find((d) => d.id === item.driverId);
      const departureDateTime = formatDateTime(item.departureDate, item.departureTime);
      const arrivalDateTime = formatDateTime(item.arrivalDate, item.arrivalTime);
      const canClose = (item.status || "Aberta") === "Aberta";
      return `<tr class="border-t border-slate-100">
         <td class="py-3 pr-4">${safeText(formatVehicleLabel(vehicle))}</td>
         <td class="py-3 pr-4">${safeText(formatDriverLabel(driver))}</td>
         <td class="py-3 pr-4">${safeText(item.destination)}</td>
         <td class="py-3 pr-4">${safeText(departureDateTime)}</td>
         <td class="py-3 pr-4">${safeText(arrivalDateTime)}</td>
         <td class="py-3 pr-4">${safeText(item.status)}</td>
        <td class="py-3 whitespace-nowrap" data-action-cell>
           ${canClose ? `<button class="text-accent mr-3" data-action="close" data-id="${safeText(item.id, "")}">Fechar</button>` : ""}
           <button class="text-red-600" data-action="delete" data-id="${safeText(item.id, "")}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");
}

function buildVehicleTimeline(vehicleId) {
  const events = [];
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (vehicle?.createdAt) {
    events.push({
      sortKey: vehicle.createdAt,
      title: "Veículo cadastrado",
      meta: `${formatVehicleLabel(vehicle)} • ${formatTimestamp(vehicle.createdAt)}`
    });
  }
  if (vehicle?.updatedAt) {
    events.push({
      sortKey: vehicle.updatedAt,
      title: "Veículo atualizado",
      meta: `${formatVehicleLabel(vehicle)} • ${formatTimestamp(vehicle.updatedAt)}`
    });
  }


  state.workOrders
    .filter((item) => item.vehicleId === vehicleId)
    .forEach((item) => {
      const driver = state.drivers.find((entry) => entry.id === item.driverId);
      const departureLabel = formatDateTime(item.departureDate, item.departureTime);
      const timestamp = toTimestamp(item.departureDate, item.departureTime) || item.createdAt || item.updatedAt || 0;
      events.push({
        sortKey: timestamp,
        title: "Operação aberta",
        meta: `${departureLabel} • ${item.destination || "-"} • ${formatDriverLabel(driver)} • ${item.status || "Aberta"}`
      });

      if (item.status === "Concluída" && (item.arrivalDate || item.arrivalTime)) {
        const arrivalLabel = formatDateTime(item.arrivalDate, item.arrivalTime);
        const arrivalTimestamp =
          toTimestamp(item.arrivalDate, item.arrivalTime) || item.updatedAt || timestamp;
        events.push({
          sortKey: arrivalTimestamp,
          title: "Operação concluída",
          meta: `${arrivalLabel} • ${item.destination || "-"} • ${formatDriverLabel(driver)}`
        });
      }
    });

  return events.sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
}

function getOrderReferenceTimestamp(order) {
  return order.createdAt || toTimestamp(order.departureDate, order.departureTime) || 0;
}

function renderVehicleHistory() {
  const vehicleId = vehicleHistorySelect?.value;
  if (!vehicleId) {
    renderTimeline(vehicleHistoryList, [], "Selecione um veículo para visualizar o histórico.");
    return;
  }
  const events = buildVehicleTimeline(vehicleId);
  renderTimeline(vehicleHistoryList, events, "Sem eventos registrados para este veículo.");
}

function getCurrentMonthInfo() {
  const year = missionCalendarDate.getFullYear();
  const month = missionCalendarDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = missionCalendarDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { year, month, monthKey, monthName };
}

function changeMissionCalendarMonth(offset) {
  missionCalendarDate = new Date(
    missionCalendarDate.getFullYear(),
    missionCalendarDate.getMonth() + offset,
    1
  );
  renderMissionCalendar();
}

function resetMissionCalendarMonth() {
  missionCalendarDate = new Date();
  missionCalendarDate.setDate(1);
  renderMissionCalendar();
}

function changeMissionWeeklyWeek(offset) {
  missionWeeklyDate = new Date(missionWeeklyDate.getTime() + offset * 7 * 24 * 60 * 60 * 1000);
  renderMissionWeekly();
}

function resetMissionWeeklyWeek() {
  missionWeeklyDate = new Date();
  missionWeeklyDate.setDate(missionWeeklyDate.getDate() - missionWeeklyDate.getDay());
  renderMissionWeekly();
}

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function buildCompactCalendarCell({
  dateKey,
  dayLabel,
  pendingCount,
  completedCount,
  operationCount,
  missions = [],
  workOrders = [],
  isToday
}) {
  const dayNumber = isToday
    ? `<span class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs font-semibold leading-none text-white">${dayLabel}</span>`
    : `<span class="text-sm font-semibold text-slate-700 leading-none">${dayLabel}</span>`;
  const indicators = [];
  if (pendingCount > 0) {
    indicators.push('<i data-lucide="clock-3" class="h-3 w-3 text-amber-500" aria-hidden="true"></i>');
  }
  if (completedCount > 0) {
    indicators.push('<i data-lucide="check-check" class="h-3 w-3 text-emerald-600" aria-hidden="true"></i>');
  }
  if (operationCount > 0) {
    indicators.push('<i data-lucide="route" class="h-3 w-3 text-sky-600" aria-hidden="true"></i>');
  }
  const indicatorRow = indicators.length
    ? `<div class="flex items-center gap-1 md:hidden">${indicators.join("")}</div>`
    : '<div class="h-2"></div>';
  const missionPreview = missions.slice(0, 2);
  const workOrderPreview = workOrders.slice(0, 2);
  const detailLines = [
    ...missionPreview.map((mission) => {
      const status = normalizeMissionStatus(mission.status);
      const icon = status === "Concluída" ? "check-check" : "clock-3";
      const iconClass = status === "Concluída" ? "text-emerald-600" : "text-amber-500";
      return `<div class="flex items-center gap-1 text-[11px] text-slate-600">
        <i data-lucide="${icon}" class="h-3 w-3 ${iconClass}" aria-hidden="true"></i>
        <span class="truncate">${safeText(mission.title, "Missão")}${mission.priority ? ` • ${safeText(mission.priority)}` : ""}</span>
      </div>`;
    }),
    ...workOrderPreview.map((order) => `<div class="flex items-center gap-1 text-[11px] text-slate-600">
      <i data-lucide="route" class="h-3 w-3 text-sky-600" aria-hidden="true"></i>
      <span class="truncate">${safeText(order.destination, "Operação")}</span>
    </div>`)
  ];
  if (missions.length > missionPreview.length) {
    detailLines.push(`<div class="text-[10px] text-slate-400">+${missions.length - missionPreview.length} missão(ões)</div>`);
  }
  if (workOrders.length > workOrderPreview.length) {
    detailLines.push(`<div class="text-[10px] text-slate-400">+${workOrders.length - workOrderPreview.length} operação(ões)</div>`);
  }
  const detailBlock = detailLines.length
    ? `<div class="hidden lg:flex flex-col gap-1 mt-2">${detailLines.join("")}</div>`
    : "";
  return `<button type="button" data-calendar-date="${safeText(dateKey, "")}" aria-label="${safeText(`Abrir agenda de ${formatDate(dateKey)}`)}" class="group aspect-square lg:aspect-auto lg:min-h-[6rem] rounded-lg border border-slate-200 bg-white p-2 text-left flex flex-col transition hover:border-accent hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent">
    ${dayNumber}
    ${detailBlock}
    <div class="mt-auto">${indicatorRow}</div>
  </button>`;
}

function renderMissionWeekly() {
  const weeklyContainer = document.getElementById("missionWeekly");
  const weeklyTitle = document.getElementById("missionWeeklyTitle");
  const weeklySummary = document.getElementById("missionWeeklySummary");
  if (!weeklyContainer) return;

  const startOfWeek = new Date(missionWeeklyDate);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);

  const weekKey = startOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const endKey = endOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const missionsByDate = new Map();
  state.missions.forEach((mission) => {
    const list = missionsByDate.get(mission.date) || [];
    list.push(mission);
    missionsByDate.set(mission.date, list);
  });
  const workOrdersByDate = new Map();
  state.workOrders.forEach((order) => {
    if (!order.departureDate) return;
    const list = workOrdersByDate.get(order.departureDate) || [];
    list.push(order);
    workOrdersByDate.set(order.departureDate, list);
  });

  let totalMissions = 0;
  let completedMissions = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const dayMissions = missionsByDate.get(dateKey) || [];
    totalMissions += dayMissions.length;
    completedMissions += dayMissions.filter((m) => normalizeMissionStatus(m.status) === "Concluída").length;
  }

  if (weeklyTitle) {
    weeklyTitle.textContent = `Miss\u00f5es da semana (${weekKey} - ${endKey})`;
  }
  if (weeklySummary) {
    weeklySummary.textContent = totalMissions
      ? `${totalMissions} missão(ões) • ${totalMissions - completedMissions} em andamento • ${completedMissions} concluída(s).`
      : "Nenhuma miss\u00e3o cadastrada para esta semana.";
  }

  const todayKey = getTodayKey();
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\u00e1b"];
  const cells = weekDays.map(
    (day) => `<div class="text-[10px] font-semibold text-center text-slate-400 uppercase tracking-wide">${day}</div>`
  );

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const missions = (missionsByDate.get(dateKey) || [])
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const workOrders = (workOrdersByDate.get(dateKey) || [])
      .sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
    const completedCount = missions.filter((mission) => normalizeMissionStatus(mission.status) === "Concluída").length;
    const pendingCount = missions.length - completedCount;
    const dayLabel = String(day.getDate()).padStart(2, "0");
    cells.push(buildCompactCalendarCell({
      dateKey,
      dayLabel,
      pendingCount,
      completedCount,
      operationCount: workOrders.length,
      missions,
      workOrders,
      isToday: dateKey === todayKey
    }));
  }

  weeklyContainer.innerHTML = cells.join("");
  refreshIcons();
}

function renderMissionCalendar() {
  const calendar = document.getElementById("missionCalendar");
  const title = document.getElementById("missionCalendarTitle");
  const summary = document.getElementById("missionCalendarSummary");
  if (!calendar) return;

  const { year, month, monthKey, monthName } = getCurrentMonthInfo();
  const monthMissions = state.missions.filter((mission) => (mission.date || "").startsWith(monthKey));
  const completed = monthMissions.filter((mission) => normalizeMissionStatus(mission.status) === "Concluída").length;
  const inProgress = monthMissions.length - completed;
  const missionsByDate = new Map();
  const monthWorkOrders = state.workOrders.filter((order) => (order.departureDate || "").startsWith(monthKey));
  const workOrdersByDate = new Map();

  monthMissions.forEach((mission) => {
    const list = missionsByDate.get(mission.date) || [];
    list.push(mission);
    missionsByDate.set(mission.date, list);
  });
  monthWorkOrders.forEach((order) => {
    if (!order.departureDate) return;
    const list = workOrdersByDate.get(order.departureDate) || [];
    list.push(order);
    workOrdersByDate.set(order.departureDate, list);
  });


  if (title) {
    title.textContent = `Missões de ${monthName}`;
  }
  if (summary) {
    summary.textContent = `${monthMissions.length} no mês • ${inProgress} em andamento • ${completed} concluída(s).`;
  }

  const todayKey = getTodayKey();
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = weekDays.map(
    (day) => `<div class="text-[10px] font-semibold text-center text-slate-400 uppercase tracking-wide">${day}</div>`
  );

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<div class="aspect-square lg:aspect-auto lg:min-h-[6rem] rounded-lg border border-slate-100 bg-slate-50"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const missions = (missionsByDate.get(dateKey) || [])
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const workOrders = (workOrdersByDate.get(dateKey) || [])
      .sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
    const completedCount = missions.filter((mission) => normalizeMissionStatus(mission.status) === "Concluída").length;
    const pendingCount = missions.length - completedCount;
    const dayLabel = String(day).padStart(2, "0");
    cells.push(buildCompactCalendarCell({
      dateKey,
      dayLabel,
      pendingCount,
      completedCount,
      operationCount: workOrders.length,
      missions,
      workOrders,
      isToday: dateKey === todayKey
    }));
  }

  calendar.innerHTML = cells.join("");
  refreshIcons();
}

function updateDashboard(animate = false) {
  const ongoingMissions = state.missions.filter(isMissionInProgress);
  const setCountText = (id, value) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (animate && typeof anime !== "undefined") {
      animateCounter(id, value);
      return;
    }
    element.textContent = String(value);
  };

  setCountText("countVehicles", state.vehicles.length);
  setCountText("countDrivers", state.drivers.length);
  setCountText("countMissions", state.missions.length);
  setCountText("countWorkOrders", ongoingMissions.length);
  const totalVehicles = state.vehicles.length;
  const availableVehicles = state.vehicles.filter((vehicle) => vehicle.status === "Disponível").length;
  const availableRestricted = state.vehicles.filter((vehicle) => vehicle.status === "Disponível (restrição)").length;
  const unavailableVehicles = state.vehicles.filter((vehicle) => vehicle.status === "Indisponível").length;
  const operationalVehicles = availableVehicles + availableRestricted;
  const availabilityPercent = totalVehicles
    ? Math.round((operationalVehicles / totalVehicles) * 100)
    : 0;

  const fleetAvailabilityPercent = document.getElementById("fleetAvailabilityPercent");
  const fleetAvailabilityBar = document.getElementById("fleetAvailabilityBar");
  const fleetAvailable = document.getElementById("fleetAvailable");
  const fleetInService = document.getElementById("fleetInService");
  const fleetInactive = document.getElementById("fleetInactive");

  if (fleetAvailabilityPercent) {
    fleetAvailabilityPercent.textContent = `${availabilityPercent}%`;
  }
  if (fleetAvailabilityBar) {
    fleetAvailabilityBar.style.width = `${availabilityPercent}%`;
  }
  if (fleetAvailable) {
    fleetAvailable.textContent = String(availableVehicles);
  }
  if (fleetInService) {
    fleetInService.textContent = String(availableRestricted);
  }
  if (fleetInactive) {
    fleetInactive.textContent = String(unavailableVehicles);
  }

  const latestWorkOrders = document.getElementById("latestWorkOrders");
  if (latestWorkOrders) {
    const sortedMissions = [...ongoingMissions].sort((a, b) => getMissionOperationTimestamp(b) - getMissionOperationTimestamp(a));

    if (!sortedMissions.length) {
      latestWorkOrders.innerHTML = '<p class="text-slate-500">Sem operações em andamento.</p>';
    } else {
      latestWorkOrders.innerHTML = sortedMissions.slice(0, 5).map((mission) => {
        const vehicle = state.vehicles.find((v) => v.id === mission.vehicleId);
        const driver = state.drivers.find((d) => d.id === mission.driverId);
        const operationDateTime = formatDateTime(formatDate(mission.date), mission.time);
        return `<div class="flex flex-col gap-3 border border-slate-100 rounded-md p-3 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium text-slate-900">${safeText(mission.title, "Operação")}</p>
              <span class="text-xs px-2 py-1 rounded-full ${getMissionStatusClass("Em andamento")}">Em andamento</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">${safeText(formatVehicleLabel(vehicle))} • ${safeText(formatDriverLabel(driver))}</p>
          </div>
          <div class="flex flex-col items-start gap-2 md:items-end">
            <span class="text-xs text-slate-500">${safeText(operationDateTime)}</span>
            <button class="text-xs px-2 py-2 rounded-md border border-slate-200 text-slate-600 hover:text-accent hover:border-accent transition" data-action="complete-mission-operation" data-id="${safeText(mission.id, "")}">Concluir</button>
          </div>
        </div>`;
      }).join("");
    }
  }

  renderMissionWeekly();
  renderMissionCalendar();
}

function animateDashboard() {
  return;
  if (typeof anime === "undefined") return;

  const fleetAvailabilityBar = document.getElementById("fleetAvailabilityBar");
  const targetWidth = fleetAvailabilityBar?.style.width;

  anime.remove(".quick-link");
  if (fleetAvailabilityBar) {
    anime.remove(fleetAvailabilityBar);
  }

  anime({
    targets: ".quick-link",
    opacity: [0, 1],
    translateY: [40, 0],
    scale: [0.9, 1],
    duration: 700,
    easing: "easeOutExpo",
    delay: anime.stagger(120),
    complete() {
      anime({
        targets: ".quick-link",
        translateY: [
          { value: -3, duration: 1200 },
          { value: 0, duration: 1200 }
        ],
        easing: "easeInOutSine",
        direction: "alternate",
        loop: true,
        delay: anime.stagger(200)
      });
    }
  });

  if (fleetAvailabilityBar && targetWidth) {
    anime({
      targets: fleetAvailabilityBar,
      width: ["0%", targetWidth],
      duration: 1400,
      easing: "easeOutQuart"
    });
  }
}

function animateCounter(id, value) {
  if (typeof anime === "undefined") return;

  anime({
    targets: { n: 0 },
    n: value,
    round: 1,
    easing: "easeOutExpo",
    duration: 1500,
    update(anim) {
      const element = document.getElementById(id);
      if (!element) return;
      element.textContent = String(Math.round(anim.animations[0].currentValue));
    }
  });
}

const statusOptionsByType = {
  all: [{ value: "all", label: "Todos" }],
  vehicles: [
    { value: "all", label: "Todos" },
    { value: "Disponível", label: "Disponível" },
    { value: "Disponível (restrição)", label: "Disponível (restrição)" },
    { value: "Indisponível", label: "Indisponível" }
  ],
  drivers: [
    { value: "all", label: "Todos" },
    { value: "Em missão", label: "Em missão" },
    { value: "Ocioso", label: "Ocioso" },
    { value: "Indisponível", label: "Indisponível" }
  ],

  missions: [
    { value: "all", label: "Todos" },
    { value: "Em andamento", label: "Em andamento" },
    { value: "Concluída", label: "Concluída" }
  ],
  workOrders: [
    { value: "all", label: "Todos" },
    { value: "Em andamento", label: "Em andamento" }
  ]
};

function updateSearchStatusOptions(type) {
  if (!generalSearchStatus) return;
  const options = statusOptionsByType[type] || statusOptionsByType.all;
  const current = generalSearchStatus.value;
  generalSearchStatus.innerHTML = "";
  options.forEach((optionItem) => {
    const option = document.createElement("option");
    option.value = optionItem.value;
    option.textContent = optionItem.label;
    generalSearchStatus.appendChild(option);
  });
  if (options.some((option) => option.value === current)) {
    generalSearchStatus.value = current;
  }
}

function buildSearchItems() {
  const items = [];

  state.vehicles.forEach((vehicle) => {
    const details = [];
    items.push({
      id: vehicle.id,
      typeId: "vehicles",
      typeLabel: "Veículo",
      title: formatVehicleLabel(vehicle),
      description: details.join(" • "),
      status: vehicle.status || "Disponível"
    });
  });

  state.drivers.forEach((driver) => {
    items.push({
      id: driver.id,
      typeId: "drivers",
      typeLabel: "Condutor",
      title: formatDriverLabel(driver),
      description: driver.phone ? `Telefone: ${driver.phone}` : "",
      status: getDriverStatusLabel(driver)
    });
  });



  state.missions.forEach((mission) => {
    const details = [mission.location, formatDateTime(formatDate(mission.date), mission.time), formatDate(mission.endDate), `Prioridade: ${getMissionPriorityLabel(mission.priority)}`, mission.notes]
      .filter(Boolean);
    items.push({
      id: mission.id,
      typeId: "missions",
      typeLabel: "Missão",
      title: mission.title || "Missão",
      description: details.join(" • "),
      status: normalizeMissionStatus(mission.status)
    });
  });

  state.missions.filter(isMissionInProgress).forEach((mission) => {
    const vehicle = state.vehicles.find((v) => v.id === mission.vehicleId);
    const driver = state.drivers.find((d) => d.id === mission.driverId);
    const operationDateTime = formatDateTime(formatDate(mission.date), mission.time);
    items.push({
      id: mission.id,
      typeId: "workOrders",
      typeLabel: "Operação",
      title: mission.title || "Operação",
      description: `${formatVehicleLabel(vehicle)} • ${formatDriverLabel(driver)} • ${operationDateTime}`,
      status: "Em andamento"
    });
  });

  return items;
}

function renderGeneralSearch() {
  if (!generalSearchResults) return;
  const query = normalizeText(generalSearchInput?.value || "");
  const typeFilter = generalSearchType?.value || "all";
  const statusFilter = generalSearchStatus?.value || "all";

  let items = buildSearchItems();
  if (typeFilter !== "all") {
    items = items.filter((item) => item.typeId === typeFilter);
  }
  if (statusFilter !== "all") {
    items = items.filter(
      (item) => normalizeText(item.status) === normalizeText(statusFilter)
    );
  }
  if (query) {
    items = items.filter((item) => {
      const haystack = normalizeText(
        [item.typeLabel, item.title, item.description, item.status].filter(Boolean).join(" ")
      );
      return haystack.includes(query);
    });
  }

  if (generalSearchSummary) {
    generalSearchSummary.textContent = `${items.length} resultado(s) encontrado(s).`;
  }

  if (!items.length) {
    generalSearchResults.innerHTML = '<p class="text-slate-500">Nenhum resultado encontrado.</p>';
    return;
  }

  generalSearchResults.innerHTML = items
    .map((item) => {
      const statusBadge = item.status
        ? `<span class="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">${safeText(item.status)}</span>`
        : "";
      const details = item.description ? ` • ${safeText(item.description)}` : "";
      const actionLabel = item.typeId === "workOrders" ? "Abrir" : "Editar";
      const editButton = `<button class="text-accent text-xs font-medium" data-action="edit" data-type="${safeText(item.typeId, "")}" data-id="${safeText(item.id, "")}">${safeText(actionLabel)}</button>`;
      const actions = `<div class="flex items-center gap-2">${statusBadge}${editButton}</div>`;
      return `<div class="flex items-start justify-between gap-3 border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${safeText(item.title)}</p>
          <p class="text-xs text-slate-500">${safeText(item.typeLabel)}${details}</p>
        </div>
        ${actions}
      </div>`;
    })
    .join("");
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.classList.add(
    "w-full",
    "text-left",
    "px-4",
    "py-2",
    "rounded-md",
    "text-slate-600",
    "hover:bg-blue-50",
    "hover:text-accent",
    "transition"
  );
  item.addEventListener("click", () => setActiveSection(item.dataset.target));
});

document.querySelectorAll(".quick-link").forEach((button) => {
  if (!button.classList.contains("calendar-icon-button")) {
    button.classList.add(
      "px-4",
      "py-3",
      "rounded-md",
      "bg-blue-50",
      "border",
      "border-blue-200",
      "text-blue-700",
      "hover:bg-blue-100",
      "hover:border-accent",
      "hover:text-accent-dark",
      "transition",
      "text-sm"
    );
  }
  button.addEventListener("click", () => setActiveSection(button.dataset.target));
});

refreshIcons();

document.getElementById("missionWeeklyPrev")?.addEventListener("click", () => {
  changeMissionWeeklyWeek(-1);
});

document.getElementById("missionWeeklyToday")?.addEventListener("click", () => {
  resetMissionWeeklyWeek();
});

document.getElementById("missionWeeklyNext")?.addEventListener("click", () => {
  changeMissionWeeklyWeek(1);
});

document.getElementById("missionWeekly")?.addEventListener("click", (event) => {
  const dayButton = event.target.closest("[data-calendar-date]");
  if (!dayButton) return;
  const dateKey = dayButton.dataset.calendarDate;
  if (!dateKey) return;
  openMissionCalendarModal(dateKey);
});

document.getElementById("missionCalendarPrev")?.addEventListener("click", () => {
  changeMissionCalendarMonth(-1);
});

document.getElementById("missionCalendarToday")?.addEventListener("click", () => {
  resetMissionCalendarMonth();
});

document.getElementById("missionCalendarNext")?.addEventListener("click", () => {
  changeMissionCalendarMonth(1);
});

document.getElementById("missionCalendar")?.addEventListener("click", (event) => {
  const dayButton = event.target.closest("[data-calendar-date]");
  if (!dayButton) return;
  const dateKey = dayButton.dataset.calendarDate;
  if (!dateKey) return;
  openMissionCalendarModal(dateKey);
});

missionCalendarModalClose?.addEventListener("click", closeMissionCalendarModal);

missionCalendarModal?.addEventListener("click", (event) => {
  if (event.target === missionCalendarModal) {
    closeMissionCalendarModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMissionCalendarModal();
  }
});

vehicleHistorySelect?.addEventListener("change", renderVehicleHistory);
generalSearchInput?.addEventListener("input", renderGeneralSearch);
generalSearchType?.addEventListener("change", () => {
  updateSearchStatusOptions(generalSearchType.value);
  renderGeneralSearch();
});
generalSearchStatus?.addEventListener("change", renderGeneralSearch);
missionStatusFilter?.addEventListener("change", renderMissionsTable);
generalSearchResults?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action !== "edit") return;
  if (!requirePermission("edit")) return;
  const id = button.dataset.id;
  const type = button.dataset.type;
  if (!id || !type) return;
  if (type === "vehicles") {
    setActiveSection("vehicles");
    startEditVehicle(id);
  }
  if (type === "drivers") {
    setActiveSection("drivers");
    startEditDriver(id);
  }
  if (type === "missions") {
    setActiveSection("missions");
    startEditMission(id);
  }
  if (type === "workOrders") {
    setActiveSection("workOrders");
  }
});

const latestWorkOrdersContainer = document.getElementById("latestWorkOrders");
async function completeMissionOperation(id) {
  if (!id || !requirePermission("edit")) return;
  await update(ref(db, `missions/${id}`), {
    status: "Concluída",
    updatedAt: Date.now()
  });
}

latestWorkOrdersContainer?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action !== "complete-mission-operation") return;
  await completeMissionOperation(button.dataset.id);
});

document.getElementById("ongoingMissionsPanel")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "complete-mission-operation") {
    await completeMissionOperation(button.dataset.id);
    return;
  }
  if (button.dataset.action !== "save-mission-operation") return;
  if (!requirePermission("edit")) return;

  const missionId = button.dataset.id;
  const mission = state.missions.find((item) => item.id === missionId);
  if (!mission) return;

  const vehicleId = document.querySelector(`[data-mission-vehicle][data-id="${missionId}"]`)?.value || "";
  const driverId = document.querySelector(`[data-mission-driver][data-id="${missionId}"]`)?.value || "";

  await update(ref(db, `missions/${missionId}`), {
    vehicleId,
    driverId,
    updatedAt: Date.now()
  });
});

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", () => toggleSidebar());
}

document.querySelector("header")?.addEventListener("click", (event) => {
  if (window.innerWidth >= 768) return;
  if (event.target.closest("button, a, input, select, textarea")) return;
  toggleSidebar();
});

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => toggleSidebar(false));
}

const vehicleForm = document.getElementById("vehicleForm");
const driverForm = document.getElementById("driverForm");
const missionForm = document.getElementById("missionForm");
const workOrderForm = document.getElementById("workOrderForm");

function startEditVehicle(id) {
  const vehicle = state.vehicles.find((item) => item.id === id);
  if (!vehicle || !vehicleForm) return;
  document.getElementById("vehicleEB").value = vehicle.eb || "";
  document.getElementById("vehicleModel").value = vehicle.model || "";
  document.getElementById("vehicleStatus").value = vehicle.status || "Disponível";
  vehicleForm.dataset.editId = id;
  setFormMode(vehicleForm, true);
  vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditDriver(id) {
  const driver = state.drivers.find((item) => item.id === id);
  if (!driver || !driverForm) return;
  document.getElementById("driverRole").value = driver.role || "";
  document.getElementById("driverNumber").value = driver.number || "";
  document.getElementById("driverName").value = driver.name || "";
  document.getElementById("driverPhone").value = driver.phone || "";
  driverForm.dataset.editId = id;
  setFormMode(driverForm, true);
  driverForm.scrollIntoView({ behavior: "smooth", block: "start" });
}


function startEditMission(id) {
  const mission = state.missions.find((item) => item.id === id);
  if (!mission || !missionForm) return;
  document.getElementById("missionTitle").value = mission.title || "";
  document.getElementById("missionLocation").value = mission.location || "";
  document.getElementById("missionDate").value = mission.date || "";
  document.getElementById("missionTime").value = mission.time || "";
  document.getElementById("missionEndDate").value = mission.endDate || "";
  document.getElementById("missionPriority").value = mission.priority || "Média";
  document.getElementById("missionStatus").value = normalizeMissionStatus(mission.status);
  document.getElementById("missionNotes").value = mission.notes || "";
  missionForm.dataset.editId = id;
  setFormMode(missionForm, true);
  missionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditWorkOrder(id) {
  const item = state.workOrders.find((entry) => entry.id === id);
  if (!item || !workOrderForm) return;
  document.getElementById("workOrderVehicle").value = item.vehicleId || "";
  document.getElementById("workOrderDriver").value = item.driverId || "";
  document.getElementById("workOrderDestination").value = item.destination || "";
  document.getElementById("workOrderDescription").value = item.description || "";
  document.getElementById("workOrderStatus").value = item.status || "Aberta";
  document.getElementById("workOrderDepartureDate").value = item.departureDate || "";
  document.getElementById("workOrderDepartureTime").value = item.departureTime || "";
  document.getElementById("workOrderExpectedArrivalDate").value = item.expectedArrivalDate || "";
  document.getElementById("workOrderExpectedArrivalTime").value = item.expectedArrivalTime || "";
  document.getElementById("workOrderArrivalDate").value = item.arrivalDate || "";
  document.getElementById("workOrderArrivalTime").value = item.arrivalTime || "";
  workOrderForm.dataset.editId = id;
  setFormMode(workOrderForm, true);
  workOrderForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

vehicleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    eb: document.getElementById("vehicleEB").value.trim(),
    model: document.getElementById("vehicleModel").value.trim(),
    status: document.getElementById("vehicleStatus").value
  };
  const editId = vehicleForm.dataset.editId;
  if (!requirePermission(editId ? "edit" : "create")) return;
  if (editId) {
    await update(ref(db, `vehicles/${editId}`), {
      ...payload,
      updatedAt: Date.now()
    });
    setFormMode(vehicleForm, false);
  } else {
    await push(ref(db, "vehicles"), { ...payload, createdAt: Date.now() });
    vehicleForm.reset();
  }
});

driverForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    role: document.getElementById("driverRole").value.trim(),
    rank: document.getElementById("driverRole").value.trim(),
    number: document.getElementById("driverNumber").value.trim(),
    name: document.getElementById("driverName").value.trim(),
    phone: document.getElementById("driverPhone").value.trim()
  };
  const editId = driverForm.dataset.editId;
  if (!requirePermission(editId ? "edit" : "create")) return;
  if (editId) {
    await update(ref(db, `drivers/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(driverForm, false);
  } else {
    await push(ref(db, "drivers"), { ...payload, createdAt: Date.now() });
    driverForm.reset();
  }
});

missionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById("missionTitle").value.trim(),
    location: document.getElementById("missionLocation").value.trim(),
    date: document.getElementById("missionDate").value,
    time: document.getElementById("missionTime").value,
    endDate: document.getElementById("missionEndDate").value,
    priority: document.getElementById("missionPriority").value,
    status: document.getElementById("missionStatus").value,
    notes: document.getElementById("missionNotes").value.trim()
  };
  const editId = missionForm.dataset.editId;
  if (!requirePermission(editId ? "edit" : "create")) return;
  if (editId) {
    await update(ref(db, `missions/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(missionForm, false);
  } else {
    await push(ref(db, "missions"), { ...payload, createdAt: Date.now() });
    missionForm.reset();
  }
});

document.querySelectorAll("form [data-cancel]").forEach((button) => {
  button.addEventListener("click", () => {
    const form = button.closest("form");
    if (form) {
      setFormMode(form, false);
    }
  });
});

document.getElementById("vehiclesTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "edit") {
    if (!requirePermission("edit")) return;
    startEditVehicle(id);
  }
  if (button.dataset.action === "delete") {
    if (!requirePermission("delete")) return;
    if (await confirmPopup("Deseja excluir este veículo?")) {
      await remove(ref(db, `vehicles/${id}`));
    }
  }
});

document.getElementById("driversTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "edit") {
    if (!requirePermission("edit")) return;
    startEditDriver(id);
  }
  if (button.dataset.action === "delete") {
    if (!requirePermission("delete")) return;
    if (await confirmPopup("Deseja excluir este condutor?")) {
      await remove(ref(db, `drivers/${id}`));
    }
  }
});



document.getElementById("missionsTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "toggle") {
    if (!requirePermission("edit")) return;
    const mission = state.missions.find((item) => item.id === id);
    const currentStatus = normalizeMissionStatus(mission?.status);
    const nextStatus = currentStatus === "Concluída" ? "Em andamento" : "Concluída";
    await update(ref(db, `missions/${id}`), {
      status: nextStatus,
      updatedAt: Date.now()
    });
  }
  if (button.dataset.action === "edit") {
    if (!requirePermission("edit")) return;
    startEditMission(id);
  }
  if (button.dataset.action === "delete") {
    if (!requirePermission("delete")) return;
    if (await confirmPopup("Deseja excluir esta missão?")) {
      await remove(ref(db, `missions/${id}`));
    }
  }
});

document.getElementById("workOrdersTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "close") {
    if (!requirePermission("edit")) return;
    const { date, time } = getCurrentDateTime();
    await update(ref(db, `workOrders/${id}`), {
      arrivalDate: date,
      arrivalTime: time,
      status: "Concluída",
      updatedAt: Date.now()
    });
  }
  if (button.dataset.action === "delete") {
    if (!requirePermission("delete")) return;
    if (await confirmPopup("Deseja excluir esta operação?")) {
      await remove(ref(db, `workOrders/${id}`));
    }
  }
});

function detachDataListeners() {
  detachScaleCategoryListeners();
  dataUnsubscribers.forEach((unsubscribe) => unsubscribe());
  dataUnsubscribers = [];
}

function detachUserAccessListeners() {
  userAccessUnsubscribe?.();
  managedUsersUnsubscribe?.();
  userAccessUnsubscribe = null;
  managedUsersUnsubscribe = null;
  currentUserProfile = null;
  state.users = [];
}

function attachUserAccessListener(user) {
  detachUserAccessListeners();
  userAccessUnsubscribe = onValue(ref(db, `users/${user.uid}`), async (snapshot) => {
    currentUserProfile = snapshot.val() || null;

    // Migra a primeira conta autenticada para administrador quando o cadastro de perfis ainda esta vazio.
    if (!currentUserProfile) {
      try {
        const usersSnapshot = await get(ref(db, "users"));
        const users = usersSnapshot.val() || {};
        if (!Object.keys(users).length) {
          await update(ref(db, `users/${user.uid}`), {
            name: user.email?.split("@")[0] || "Administrador",
            email: user.email || "",
            role: "admin",
            active: true,
            createdAt: Date.now(),
            createdBy: user.uid
          });
          return;
        }
      } catch (error) {
        setAuthMessage(getAuthErrorMessage(error));
        await signOut(auth);
        return;
      }
    }

    const isAdmin = currentUserProfile?.role === "admin" && currentUserProfile?.active !== false;
    usersNavItem?.classList.toggle("hidden", !isAdmin);
    usersAdminContent?.classList.toggle("hidden", !isAdmin);
    usersAdminContent?.classList.toggle("grid", isAdmin);
    usersAccessMessage?.classList.toggle("hidden", isAdmin);
    applyAccessVisibility();
    applyPermissionUi();
    scaleCategoryForm?.classList.toggle("hidden", !hasPermission("scaleEdit"));
    scaleMemberEditor?.classList.toggle("hidden", !hasPermission("scaleEdit"));
    renderScaleCalendar();

    if (!isAdmin) {
      if (activeSectionId === "users") setActiveSection("dashboard");
      state.users = [];
      managedUsersUnsubscribe?.();
      managedUsersUnsubscribe = null;
      renderUsersTable();
      if (!currentUserProfile || currentUserProfile.active === false) {
        setAuthMessage("Seu acesso ainda não foi liberado pelo administrador.");
        await signOut(auth);
      }
      return;
    }

    if (!managedUsersUnsubscribe) {
      managedUsersUnsubscribe = onValue(ref(db, "users"), (usersSnapshot) => {
        state.users = toArray(usersSnapshot);
        renderUsersTable();
      });
    }
  });
}

function attachDataListeners() {
  detachDataListeners();
  dataUnsubscribers = [
    onValue(ref(db, "vehicles"), (snapshot) => {
      state.vehicles = toArray(snapshot);
      renderVehiclesTable();
      updateVehicleSelects();
      renderVehicleHistory();
      updateDashboard(activeSectionId === "dashboard");
      renderGeneralSearch();
      applyPermissionUi();
    }),
    onValue(ref(db, "drivers"), (snapshot) => {
      state.drivers = toArray(snapshot);
      renderDriversTable();
      updateDriverSelects();
      renderScaleDriverOptions();
      updateDashboard(activeSectionId === "dashboard");
      renderGeneralSearch();
      applyPermissionUi();
    }),
    onValue(ref(db, "missions"), (snapshot) => {
      state.missions = toArray(snapshot);
      renderMissionsTable();
      renderDriversTable();
      renderOngoingMissionsPanel();
      updateDashboard(activeSectionId === "dashboard");
      renderGeneralSearch();
      applyPermissionUi();
    }),
    onValue(ref(db, "workOrders"), (snapshot) => {
      state.workOrders = toArray(snapshot);
      renderWorkOrdersTable();
      renderOngoingMissionsPanel();
      updateDashboard(activeSectionId === "dashboard");
      renderGeneralSearch();
      applyPermissionUi();
    }),
    onValue(ref(db, "scaleCategories"), (snapshot) => {
      state.scaleCategories = toArray(snapshot);
      if (!state.scaleCategories.some((category) => category.id === activeScaleCategoryId)) {
        activeScaleCategoryId = state.scaleCategories[0]?.id || "";
      }
      renderScaleCategories();
      attachScaleCategoryListeners();
      renderScaleCalendar();
    })
  ];
}

onAuthStateChanged(auth, (user) => {
  const isAuthenticated = Boolean(user);
  if (authScreen) authScreen.hidden = isAuthenticated;
  if (appShell) appShell.hidden = !isAuthenticated;
  if (currentUserEmail) currentUserEmail.textContent = user?.email || "";

  if (isAuthenticated) {
    attachDataListeners();
    attachUserAccessListener(user);
    updateSearchStatusOptions(generalSearchType?.value || "all");
    renderGeneralSearch();
    renderMissionWeekly();
    renderOngoingMissionsPanel();
    setActiveSection("dashboard");
  } else {
    detachDataListeners();
    detachUserAccessListeners();
    state.vehicles = [];
    state.drivers = [];
    state.missions = [];
    state.workOrders = [];
    state.scaleCategories = [];
    state.scaleMembers = [];
    state.scaleServices = {};
    activeScaleCategoryId = "";
  }
});

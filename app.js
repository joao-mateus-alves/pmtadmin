import { db } from "./firebase.js";
import {
  ref,
  push,
  onValue,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const state = {
  vehicles: [],
  drivers: [],
  missions: [],
  workOrders: []
};

let missionCalendarDate = new Date();
missionCalendarDate.setDate(1);

let missionWeeklyDate = new Date();
missionWeeklyDate.setDate(missionWeeklyDate.getDate() - missionWeeklyDate.getDay());

const sectionIds = ["dashboard", "search", "vehicles", "drivers", "missions", "monthlyCalendar", "workOrders"];
const sectionTitles = {
  dashboard: "Dashboard",
  search: "Pesquisa geral",
  vehicles: "Veículos",
  drivers: "Condutores",
  missions: "Missões",
  monthlyCalendar: "Calendário do mês",
  workOrders: "Operações"
};

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const pageTitle = document.getElementById("pageTitle");
const sidebarToggle = document.getElementById("sidebarToggle");
const vehicleHistorySelect = document.getElementById("vehicleHistorySelect");
const driverHistorySelect = document.getElementById("driverHistorySelect");
const vehicleHistoryList = document.getElementById("vehicleHistoryList");
const driverHistoryList = document.getElementById("driverHistoryList");
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
  const role = driver.role ? `${driver.role} - ` : "";
  const name = driver.name || "Sem nome";
  return `${role}${name}`.trim();
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

function renderTimeline(container, events, emptyMessage) {
  if (!container) return;
  if (!events.length) {
    container.innerHTML = `<p class="text-slate-500">${emptyMessage}</p>`;
    return;
  }
  container.innerHTML = events
    .map(
      (event) => `<div class="flex gap-3">
        <div class="mt-2 h-2 w-2 rounded-full bg-accent"></div>
        <div>
          <p class="font-medium">${event.title}</p>
          <p class="text-xs text-slate-500">${event.meta}</p>
        </div>
      </div>`
    )
    .join("");
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
  const completed = missions.filter((mission) => mission.status === "Concluída").length;
  const pending = missions.length - completed;
  const totalItems = missions.length + workOrders.length;

  missionCalendarModalTitle.textContent = `Agenda de ${formatDate(dateKey)}`;
  missionCalendarModalSummary.textContent = totalItems
    ? `${missions.length} missão(ões) • ${pending} pendente(s) • ${completed} concluída(s) • ${workOrders.length} operação(ões).`
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
          const statusClass = getMissionStatusClass(mission.status || "Pendente");
          const timeLabel = mission.time || "Sem hora";
          const locationLabel = mission.location || "Sem local";
          const notesLabel = mission.notes ? `<p class="text-sm text-slate-500 mt-1">${mission.notes}</p>` : "";
          return `<div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">${mission.title || "Missão"}</p>
                <p class="text-sm text-slate-600 mt-1">${timeLabel} • ${locationLabel}</p>
              </div>
              <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${mission.status || "Pendente"}</span>
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
              <p class="font-semibold text-slate-900">${order.destination || "Operação"}</p>
              <p class="text-sm text-slate-600 mt-1">${timeLabel}${meta ? ` • ${meta}` : ""}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700">${order.status || "Aberta"}</span>
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
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="py-6 text-center text-slate-500">${message}</td></tr>`;
}

function getMissionStatusClass(status) {
  if (status === "Concluída") return "bg-emerald-50 text-emerald-700";
  if (status === "Em andamento") return "bg-sky-50 text-sky-700";
  return "bg-amber-50 text-amber-700";
}

function isMissionInProgress(mission) {
  return (mission.status || "Pendente") === "Em andamento";
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
        <td class="py-3 pr-4">${vehicle.eb || "-"}</td>
        <td class="py-3 pr-4">${vehicle.model || "-"}</td>
        <td class="py-3 pr-4">${vehicle.status || "-"}</td>
        <td class="py-3">
          <button class="text-accent mr-3" data-action="edit" data-id="${vehicle.id}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${vehicle.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join("");
}

function renderDriversTable() {
  const tbody = document.getElementById("driversTableBody");
  if (!tbody) return;
  if (!state.drivers.length) {
    renderEmptyRow(tbody, 4, "Nenhum condutor cadastrado.");
    return;
  }
  tbody.innerHTML = state.drivers
    .map(
      (driver) => `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${formatDriverLabel(driver)}</td>
        <td class="py-3 pr-4">${driver.phone || "-"}</td>
        <td class="py-3 pr-4">${getDriverStatusLabel(driver)}</td>
        <td class="py-3">
          <button class="text-accent mr-3" data-action="edit" data-id="${driver.id}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${driver.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join("");
}


function renderMissionsTable() {
  const tbody = document.getElementById("missionsTableBody");
  if (!tbody) return;
  if (!state.missions.length) {
    renderEmptyRow(tbody, 5, "Nenhuma missão cadastrada.");
    return;
  }
  const statusFilter = missionStatusFilter?.value || "all";
  const filteredMissions = [...state.missions].filter((mission) => {
    if (statusFilter === "all") return true;
    return (mission.status || "Pendente") === statusFilter;
  });
  if (!filteredMissions.length) {
    renderEmptyRow(tbody, 5, "Nenhuma missão encontrada para este status.");
    return;
  }
  tbody.innerHTML = filteredMissions
    .sort((a, b) => (toTimestamp(a.date, a.time) || 0) - (toTimestamp(b.date, b.time) || 0))
    .map((mission) => {
      const status = mission.status || "Pendente";
      const toggleLabel = status === "Pendente"
        ? "Iniciar"
        : status === "Em andamento"
          ? "Concluir"
          : "Marcar pendente";
      const statusClass = getMissionStatusClass(status);
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">
          <p class="font-medium">${mission.title || "-"}</p>
          <p class="text-xs text-slate-500">${mission.notes || ""}</p>
        </td>
        <td class="py-3 pr-4">${mission.location || "-"}</td>
        <td class="py-3 pr-4">${formatDateTime(formatDate(mission.date), mission.time)}</td>
        <td class="py-3 pr-4">
          <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${status}</span>
        </td>
        <td class="py-3 whitespace-nowrap">
          <button class="text-accent mr-3" data-action="toggle" data-id="${mission.id}">${toggleLabel}</button>
          <button class="text-accent mr-3" data-action="edit" data-id="${mission.id}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${mission.id}">Excluir</button>
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
    container.innerHTML = '<p class="text-slate-500">Nenhuma missão em andamento.</p>';
    return;
  }
  const vehicleOptions = ['<option value="">Selecione um veículo</option>']
    .concat(state.vehicles.map((vehicle) => `<option value="${vehicle.id}">${formatVehicleLabel(vehicle)}</option>`))
    .join("");
  const driverOptions = ['<option value="">Selecione um condutor</option>']
    .concat(state.drivers.map((driver) => `<option value="${driver.id}">${formatDriverLabel(driver)}</option>`))
    .join("");
  container.innerHTML = ongoingMissions
    .map((mission) => {
      const vehicle = state.vehicles.find((item) => item.id === mission.vehicleId);
      const driver = state.drivers.find((item) => item.id === mission.driverId);
      const dateLabel = formatDateTime(formatDate(mission.date), mission.time);
      const locationLabel = mission.location || "Sem local";
      const notesLabel = mission.notes ? `<p class="text-xs text-slate-500 mt-1">${mission.notes}</p>` : "";
      return `<div class="rounded-md border border-slate-100 p-4 bg-white">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">${mission.title || "Missão"}</p>
            <p class="text-xs text-slate-500">${dateLabel} • ${locationLabel}</p>
            ${notesLabel}
          </div>
          <span class="text-xs px-2 py-1 rounded-full ${getMissionStatusClass("Em andamento")}">Em andamento</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label class="text-xs text-slate-500">Veículo</label>
            <select data-mission-vehicle data-id="${mission.id}" class="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
              ${vehicleOptions}
            </select>
            <p class="text-[11px] text-slate-400 mt-1">${vehicle ? formatVehicleLabel(vehicle) : "Nenhum veículo vinculado"}</p>
          </div>
          <div>
            <label class="text-xs text-slate-500">Condutor</label>
            <select data-mission-driver data-id="${mission.id}" class="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
              ${driverOptions}
            </select>
            <p class="text-[11px] text-slate-400 mt-1">${driver ? formatDriverLabel(driver) : "Nenhum condutor vinculado"}</p>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button type="button" data-action="save-mission-operation" data-id="${mission.id}" class="px-3 py-2 rounded-md bg-accent text-white text-xs shadow-sm shadow-blue-500/20 hover:bg-accent-dark transition">Salvar equipe</button>
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
        <td class="py-3 pr-4">${formatVehicleLabel(vehicle)}</td>
        <td class="py-3 pr-4">${formatDriverLabel(driver)}</td>
        <td class="py-3 pr-4">${item.destination || "-"}</td>
        <td class="py-3 pr-4">${departureDateTime}</td>
        <td class="py-3 pr-4">${arrivalDateTime}</td>
        <td class="py-3 pr-4">${item.status || "-"}</td>
        <td class="py-3 whitespace-nowrap">
          ${canClose ? `<button class="text-accent mr-3" data-action="close" data-id="${item.id}">Fechar</button>` : ""}
          <button class="text-red-600" data-action="delete" data-id="${item.id}">Excluir</button>
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

function buildDriverTimeline(driverId) {
  const events = [];
  const driver = state.drivers.find((item) => item.id === driverId);
  if (driver?.createdAt) {
    events.push({
      sortKey: driver.createdAt,
      title: "Condutor cadastrado",
      meta: `${formatDriverLabel(driver)} • ${formatTimestamp(driver.createdAt)}`
    });
  }
  if (driver?.updatedAt) {
    events.push({
      sortKey: driver.updatedAt,
      title: "Condutor atualizado",
      meta: `${formatDriverLabel(driver)} • ${formatTimestamp(driver.updatedAt)}`
    });
  }

  state.workOrders
    .filter((item) => item.driverId === driverId)
    .forEach((item) => {
      const vehicle = state.vehicles.find((entry) => entry.id === item.vehicleId);
      const departureLabel = formatDateTime(item.departureDate, item.departureTime);
      const timestamp = toTimestamp(item.departureDate, item.departureTime) || item.createdAt || item.updatedAt || 0;
      events.push({
        sortKey: timestamp,
        title: "Operação atribuída",
        meta: `${departureLabel} • ${item.destination || "-"} • ${formatVehicleLabel(vehicle)} • ${item.status || "Aberta"}`
      });

      if (item.status === "Concluída" && (item.arrivalDate || item.arrivalTime)) {
        const arrivalLabel = formatDateTime(item.arrivalDate, item.arrivalTime);
        const arrivalTimestamp =
          toTimestamp(item.arrivalDate, item.arrivalTime) || item.updatedAt || timestamp;
        events.push({
          sortKey: arrivalTimestamp,
          title: "Operação concluída",
          meta: `${arrivalLabel} • ${item.destination || "-"} • ${formatVehicleLabel(vehicle)}`
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

function renderDriverHistory() {
  const driverId = driverHistorySelect?.value;
  if (!driverId) {
    renderTimeline(driverHistoryList, [], "Selecione um condutor para visualizar o histórico.");
    return;
  }
  const events = buildDriverTimeline(driverId);
  renderTimeline(driverHistoryList, events, "Sem eventos registrados para este condutor.");
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
    ? `<span class="h-6 w-6 rounded-full bg-accent text-white text-xs font-semibold leading-none flex items-center justify-center">${dayLabel}</span>`
    : `<span class="text-sm font-semibold text-slate-700 leading-none">${dayLabel}</span>`;
  const indicators = [];
  if (pendingCount > 0) {
    indicators.push('<span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>');
  }
  if (completedCount > 0) {
    indicators.push('<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>');
  }
  if (operationCount > 0) {
    indicators.push('<span class="h-1.5 w-1.5 rounded-full bg-sky-400"></span>');
  }
  const indicatorRow = indicators.length
    ? `<div class="flex items-center gap-1 md:hidden">${indicators.join("")}</div>`
    : '<div class="h-2"></div>';
  const missionPreview = missions.slice(0, 2);
  const workOrderPreview = workOrders.slice(0, 2);
  const detailLines = [
    ...missionPreview.map((mission) => {
      const dotClass = mission.status === "Concluída" ? "bg-emerald-400" : "bg-amber-400";
      return `<div class="flex items-center gap-1 text-[11px] text-slate-600">
        <span class="h-1.5 w-1.5 rounded-full ${dotClass}"></span>
        <span class="truncate">${mission.title || "Missão"}</span>
      </div>`;
    }),
    ...workOrderPreview.map((order) => `<div class="flex items-center gap-1 text-[11px] text-slate-600">
      <span class="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
      <span class="truncate">${order.destination || "Operação"}</span>
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
  return `<button type="button" data-calendar-date="${dateKey}" aria-label="Abrir agenda de ${formatDate(dateKey)}" class="group aspect-square lg:aspect-auto lg:min-h-[6rem] rounded-lg border border-slate-200 bg-white p-2 text-left flex flex-col transition hover:border-accent hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent">
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
    completedMissions += dayMissions.filter((m) => m.status === "Conclu\u00edda").length;
  }

  if (weeklyTitle) {
    weeklyTitle.textContent = `Miss\u00f5es da semana (${weekKey} - ${endKey})`;
  }
  if (weeklySummary) {
    weeklySummary.textContent = totalMissions
      ? `${totalMissions} miss\u00e3o(ões) • ${totalMissions - completedMissions} pendente(s) • ${completedMissions} conclu\u00edda(s).`
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
    const completedCount = missions.filter((mission) => mission.status === "Conclu\u00edda").length;
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
}

function renderMissionCalendar() {
  const calendar = document.getElementById("missionCalendar");
  const title = document.getElementById("missionCalendarTitle");
  const summary = document.getElementById("missionCalendarSummary");
  if (!calendar) return;

  const { year, month, monthKey, monthName } = getCurrentMonthInfo();
  const monthMissions = state.missions.filter((mission) => (mission.date || "").startsWith(monthKey));
  const completed = monthMissions.filter((mission) => mission.status === "Concluída").length;
  const pending = monthMissions.length - completed;
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
    summary.textContent = `${monthMissions.length} no mês • ${pending} pendente(s) • ${completed} concluída(s).`;
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
    const completedCount = missions.filter((mission) => mission.status === "Concluída").length;
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
}

function updateDashboard() {
  document.getElementById("countVehicles").textContent = String(state.vehicles.length);
  document.getElementById("countDrivers").textContent = String(state.drivers.length);
  document.getElementById("countMissions").textContent = String(state.missions.length);
  document.getElementById("countWorkOrders").textContent = String(state.workOrders.length);

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
    fleetInactive.textContent = String(0);
  }

  const latestWorkOrders = document.getElementById("latestWorkOrders");
  const sortedOrders = [...state.workOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));


  if (!sortedOrders.length) {
    latestWorkOrders.innerHTML = '<p class="text-slate-500">Sem operações registradas.</p>';
  } else {
    latestWorkOrders.innerHTML = sortedOrders.slice(0, 5).map((order) => {
      const vehicle = state.vehicles.find((v) => v.id === order.vehicleId);
      const driver = state.drivers.find((d) => d.id === order.driverId);
      const statusLabel = order.status || "Aberta";
      const canClose = statusLabel === "Aberta";
      const departureDateTime = formatDateTime(order.departureDate, order.departureTime);
      return `<div class="flex items-center justify-between border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${statusLabel}</p>
          <p class="text-xs text-slate-500">${formatVehicleLabel(vehicle)} • ${formatDriverLabel(driver)} • ${order.destination || "-"}</p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="text-xs text-slate-500">${departureDateTime}</span>
          ${canClose ? `<button class="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:text-accent hover:border-accent transition" data-action="close-work-order" data-id="${order.id}">Fechar operação</button>` : ""}
        </div>
      </div>`;
    }).join("");
  }

  renderMissionCalendar();
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
    { value: "Pendente", label: "Pendente" },
    { value: "Em andamento", label: "Em andamento" },
    { value: "Concluída", label: "Concluída" }
  ],
  workOrders: [
    { value: "all", label: "Todos" },
    { value: "Aberta", label: "Aberta" },
    { value: "Concluída", label: "Concluída" },
    { value: "Cancelada", label: "Cancelada" }
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
    const details = [mission.location, formatDateTime(formatDate(mission.date), mission.time), mission.notes]
      .filter(Boolean);
    items.push({
      id: mission.id,
      typeId: "missions",
      typeLabel: "Missão",
      title: mission.title || "Missão",
      description: details.join(" • "),
      status: mission.status || "Pendente"
    });
  });

  state.workOrders.forEach((order) => {
    const vehicle = state.vehicles.find((v) => v.id === order.vehicleId);
    const driver = state.drivers.find((d) => d.id === order.driverId);
    const departureDateTime = formatDateTime(order.departureDate, order.departureTime);
    items.push({
      id: order.id,
      typeId: "workOrders",
      typeLabel: "Operação",
      title: order.destination || "Operação",
      description: `${formatVehicleLabel(vehicle)} • ${formatDriverLabel(driver)} • ${departureDateTime}`,
      status: order.status || "Aberta"
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
        ? `<span class="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">${item.status}</span>`
        : "";
      const details = item.description ? ` • ${item.description}` : "";
      const actionLabel = item.typeId === "workOrders" ? "Abrir" : "Editar";
      const editButton = `<button class="text-accent text-xs font-medium" data-action="edit" data-type="${item.typeId}" data-id="${item.id}">${actionLabel}</button>`;
      const actions = `<div class="flex items-center gap-2">${statusBadge}${editButton}</div>`;
      return `<div class="flex items-start justify-between gap-3 border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${item.title}</p>
          <p class="text-xs text-slate-500">${item.typeLabel}${details}</p>
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
driverHistorySelect?.addEventListener("change", renderDriverHistory);
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
latestWorkOrdersContainer?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action !== "close-work-order") return;
  const id = button.dataset.id;
  if (!id) return;
  const { date, time } = getCurrentDateTime();
  await update(ref(db, `workOrders/${id}`), {
    arrivalDate: date,
    arrivalTime: time,
    status: "Concluída",
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
  document.getElementById("missionStatus").value = mission.status || "Pendente";
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
    name: document.getElementById("driverName").value.trim(),
    phone: document.getElementById("driverPhone").value.trim()
  };
  const editId = driverForm.dataset.editId;
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
    status: document.getElementById("missionStatus").value,
    notes: document.getElementById("missionNotes").value.trim()
  };
  const editId = missionForm.dataset.editId;
  if (editId) {
    await update(ref(db, `missions/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(missionForm, false);
  } else {
    await push(ref(db, "missions"), { ...payload, createdAt: Date.now() });
    missionForm.reset();
  }
});

workOrderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const vehicleId = document.getElementById("workOrderVehicle").value;
  const departureDate = document.getElementById("workOrderDepartureDate").value;
  const departureTime = document.getElementById("workOrderDepartureTime").value;
  const editId = workOrderForm.dataset.editId;
  
  if (!editId) {
    const availabilityCheck = isVehicleAvailableForScheduling(vehicleId, departureDate, departureTime);
    if (!availabilityCheck.available && availabilityCheck.conflicts.length > 0) {
      const conflictDetails = availabilityCheck.conflicts
        .map((c) => `• ${c.reason}`)
        .join("\n");
      const proceedAnyway = confirm(
        `AVISO: Conflito de horário detectado!\n\n${conflictDetails}\n\nDeseja prosseguir mesmo assim?`
      );
      if (!proceedAnyway) return;
    }
  }
  
  const payload = {
    vehicleId: vehicleId,
    driverId: document.getElementById("workOrderDriver").value,
    destination: document.getElementById("workOrderDestination").value.trim(),
    description: document.getElementById("workOrderDescription").value.trim(),
    status: document.getElementById("workOrderStatus").value,
    departureDate: departureDate,
    departureTime: departureTime,
    expectedArrivalDate: document.getElementById("workOrderExpectedArrivalDate").value,
    expectedArrivalTime: document.getElementById("workOrderExpectedArrivalTime").value,
    arrivalDate: document.getElementById("workOrderArrivalDate").value,
    arrivalTime: document.getElementById("workOrderArrivalTime").value
  };
  
  if (editId) {
    await update(ref(db, `workOrders/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(workOrderForm, false);
  } else {
    await push(ref(db, "workOrders"), { ...payload, createdAt: Date.now() });
    workOrderForm.reset();
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
    startEditVehicle(id);
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir este veículo?")) {
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
    startEditDriver(id);
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir este condutor?")) {
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
    const mission = state.missions.find((item) => item.id === id);
    const currentStatus = mission?.status || "Pendente";
    const nextStatus = currentStatus === "Pendente"
      ? "Em andamento"
      : currentStatus === "Em andamento"
        ? "Concluída"
        : "Pendente";
    await update(ref(db, `missions/${id}`), {
      status: nextStatus,
      updatedAt: Date.now()
    });
  }
  if (button.dataset.action === "edit") {
    startEditMission(id);
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir esta missão?")) {
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
    const { date, time } = getCurrentDateTime();
    await update(ref(db, `workOrders/${id}`), {
      arrivalDate: date,
      arrivalTime: time,
      status: "Concluída",
      updatedAt: Date.now()
    });
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir esta operação?")) {
      await remove(ref(db, `workOrders/${id}`));
    }
  }
});

onValue(ref(db, "vehicles"), (snapshot) => {
  state.vehicles = toArray(snapshot);
  renderVehiclesTable();
  updateVehicleSelects();
  renderVehicleHistory();
  updateDashboard();
  renderGeneralSearch();
});

onValue(ref(db, "drivers"), (snapshot) => {
  state.drivers = toArray(snapshot);
  renderDriversTable();
  updateDriverSelects();
  renderDriverHistory();
  updateDashboard();
  renderGeneralSearch();
});


onValue(ref(db, "missions"), (snapshot) => {
  state.missions = toArray(snapshot);
  renderMissionsTable();
  renderOngoingMissionsPanel();
  updateDashboard();
  renderGeneralSearch();
});

onValue(ref(db, "workOrders"), (snapshot) => {
  state.workOrders = toArray(snapshot);
  renderWorkOrdersTable();
  renderDriversTable();
  updateDashboard();
  renderVehicleHistory();
  renderDriverHistory();
  renderGeneralSearch();
});

updateSearchStatusOptions(generalSearchType?.value || "all");
renderGeneralSearch();
renderMissionWeekly();
renderOngoingMissionsPanel();
setActiveSection("dashboard");

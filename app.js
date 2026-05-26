//https://to-do.microsoft.com/sharing?InvitationToken=JIIP-oArEEBHBeCGEbQFDQVvDOBdIS04WkiwQSAtvB1waHOFcoaHGKx9r6W0GPK0I 
//deixa isso aqui kakakaka

// trocar placa por EB
// retirar ano e odometro
// no calendario habilitar vizualização quando clicar em cima do dia, criar um pop-up mostrando as informações
// melhorar calendario mobile apenas, está tudo meio minusculo e ilegivel.
// mesclar atalhos rápidos com os cards de quantidades do dashboard
// LOGICA: caso um veiculo esteja em operação, ele não poderá ser escalado enquanto não retornar, preciso aprimorar essa logica ainda... na real não sei se funcionaria, imagina que ele ainda não voltou e a operação esteja em aberto, ai eu preciso abrir outra missão com esse veiculo... como resolveria essa questão? podemos pensar em previsão de encerramento e encerramento real da operação, ai resolveria esse problema e casa perfeitamente com a função de fechar a operação no dashboard
//retirar "veiculos com mais operações" do dashboard
//retirar opção "em manutenção"
//deixar a parte de status dos condutores como uma variavel que o sistema vai informar, caso ele esteja em missão, então ele mostrara em missão, senão ele vai estar disponivel
//caso alguem abra uma operação e venha ocorrer algum conflito de horario, ele vai avisar que tal viatura já está sendo usada pra tal operação, se tem certeza que quer escolher ela
//


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
  maintenance: [],
  missions: [],
  workOrders: []
};

let missionCalendarDate = new Date();
missionCalendarDate.setDate(1);

const sectionIds = ["dashboard", "search", "vehicles", "drivers", "maintenance", "missions", "workOrders"];
const sectionTitles = {
  dashboard: "Dashboard",
  search: "Pesquisa geral",
  vehicles: "Veículos",
  drivers: "Condutores",
  maintenance: "Manutenções",
  missions: "Missões",
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
  return state.workOrders.some((order) => order.driverId === driverId && isWorkOrderOpen(order));
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

function renderMaintenanceTable() {
  const tbody = document.getElementById("maintenanceTableBody");
  if (!tbody) return;
  if (!state.maintenance.length) {
    renderEmptyRow(tbody, 5, "Nenhuma manutenção cadastrada.");
    return;
  }
  tbody.innerHTML = state.maintenance
    .map((item) => {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
      const cost = item.cost ? currencyFormatter.format(Number(item.cost)) : "-";
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${formatVehicleLabel(vehicle)}</td>
        <td class="py-3 pr-4">${item.type || "-"}</td>
        <td class="py-3 pr-4">${item.date || "-"}</td>
        <td class="py-3 pr-4">${cost}</td>
        <td class="py-3">
          <button class="text-accent mr-3" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${item.id}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderMissionsTable() {
  const tbody = document.getElementById("missionsTableBody");
  if (!tbody) return;
  if (!state.missions.length) {
    renderEmptyRow(tbody, 5, "Nenhuma missão cadastrada.");
    return;
  }
  tbody.innerHTML = [...state.missions]
    .sort((a, b) => (toTimestamp(a.date, a.time) || 0) - (toTimestamp(b.date, b.time) || 0))
    .map((mission) => {
      const status = mission.status || "Pendente";
      const isCompleted = status === "Concluída";
      const toggleLabel = isCompleted ? "Marcar pendente" : "Concluir";
      const statusClass = isCompleted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
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
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${formatVehicleLabel(vehicle)}</td>
        <td class="py-3 pr-4">${formatDriverLabel(driver)}</td>
        <td class="py-3 pr-4">${item.destination || "-"}</td>
        <td class="py-3 pr-4">${departureDateTime}</td>
        <td class="py-3 pr-4">${arrivalDateTime}</td>
        <td class="py-3 pr-4">${item.status || "-"}</td>
        <td class="py-3">
          <button class="text-accent mr-3" data-action="edit" data-id="${item.id}">Editar</button>
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

  state.maintenance
    .filter((item) => item.vehicleId === vehicleId)
    .forEach((item) => {
      const timestamp = toTimestamp(item.date) || item.createdAt || item.updatedAt || 0;
      const cost = item.cost ? currencyFormatter.format(Number(item.cost)) : "";
      const dateLabel = item.date || "-";
      const costLabel = cost ? ` • ${cost}` : "";
      events.push({
        sortKey: timestamp,
        title: "Manutenção registrada",
        meta: `${dateLabel} • ${item.type || "Manutenção"}${costLabel}`
      });
    });

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

function buildTopVehicles() {
  const map = new Map();
  state.workOrders.forEach((order) => {
    if (!order.vehicleId) return;
    const current = map.get(order.vehicleId) || {
      count: 0,
      lastTimestamp: 0
    };
    const referenceTimestamp = getOrderReferenceTimestamp(order);
    current.count += 1;
    current.lastTimestamp = Math.max(current.lastTimestamp, referenceTimestamp);
    map.set(order.vehicleId, current);
  });

  return [...map.entries()]
    .map(([vehicleId, info]) => ({
      vehicle: state.vehicles.find((item) => item.id === vehicleId),
      count: info.count,
      lastTimestamp: info.lastTimestamp
    }))
    .sort((a, b) => b.count - a.count || b.lastTimestamp - a.lastTimestamp);
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

function renderTopVehicles() {
  const topVehiclesList = document.getElementById("topVehiclesList");
  if (!topVehiclesList) return;
  const topVehicles = buildTopVehicles();
  if (!topVehicles.length) {
    topVehiclesList.innerHTML = '<p class="text-slate-500">Sem dados suficientes.</p>';
    return;
  }
  topVehiclesList.innerHTML = topVehicles.slice(0, 5).map((item, index) => {
    const vehicle = item.vehicle;
    return `<div class="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
      <div>
        <p class="font-medium">${index + 1}. ${formatVehicleLabel(vehicle)}</p>
        <p class="text-xs text-slate-500">Última movimentação: ${formatTimestamp(item.lastTimestamp)}</p>
      </div>
      <span class="text-sm font-semibold">${item.count}</span>
    </div>`;
  }).join("");
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

  monthMissions.forEach((mission) => {
    const list = missionsByDate.get(mission.date) || [];
    list.push(mission);
    missionsByDate.set(mission.date, list);
  });

  
  if (title) {
    title.textContent = `Missões de ${monthName}`;
  }
  if (summary) {
    summary.textContent = `${monthMissions.length} no mês • ${pending} pendente(s) • ${completed} concluída(s).`;
  }

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = weekDays.map((day) => `<div class="font-semibold text-center text-slate-500">${day}</div>`);

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<div class="min-h-24 rounded-md border border-slate-100 bg-slate-50"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const missions = (missionsByDate.get(dateKey) || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const missionItems = missions.slice(0, 3).map((mission) => {
      const doneClass = mission.status === "Concluída" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
      return `<div class="mt-1 rounded px-2 py-1 ${doneClass}">
        <p class="truncate font-medium">${mission.title || "Missão"}</p>
        <p class="truncate">${mission.time || "Sem hora"}</p>
      </div>`;
    }).join("");
    const extra = missions.length > 3 ? `<p class="mt-1 text-slate-500">+${missions.length - 3} missão(ões)</p>` : "";
    cells.push(`<div class="min-h-24 rounded-md border border-slate-100 bg-white p-2">
      <p class="font-semibold text-slate-700">${day}</p>
      ${missionItems || '<p class="mt-2 text-slate-400">-</p>'}
      ${extra}
    </div>`);
  }

  calendar.innerHTML = cells.join("");
}

function updateDashboard() {
  document.getElementById("countVehicles").textContent = String(state.vehicles.length);
  document.getElementById("countDrivers").textContent = String(state.drivers.length);
  document.getElementById("countMaintenance").textContent = String(state.maintenance.length);
  document.getElementById("countMissions").textContent = String(state.missions.length);
  document.getElementById("countWorkOrders").textContent = String(state.workOrders.length);

  const totalVehicles = state.vehicles.length;
  const availableVehicles = state.vehicles.filter((vehicle) => vehicle.status === "Disponível").length;
  const availableRestricted = state.vehicles.filter((vehicle) => vehicle.status === "Disponível (restrição)").length;
  const unavailableVehicles = state.vehicles.filter((vehicle) => vehicle.status === "Indisponível").length;
  const availabilityPercent = totalVehicles
    ? Math.round((availableVehicles / totalVehicles) * 100)
    : 0;

  const fleetAvailabilityPercent = document.getElementById("fleetAvailabilityPercent");
  const fleetAvailabilityBar = document.getElementById("fleetAvailabilityBar");
  const fleetAvailable = document.getElementById("fleetAvailable");
  const fleetInService = document.getElementById("fleetInService");
  const fleetMaintenance = document.getElementById("fleetMaintenance");
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
  if (fleetMaintenance) {
    fleetMaintenance.textContent = String(unavailableVehicles);
  }
  if (fleetInactive) {
    fleetInactive.textContent = String(0);
  }

  const latestWorkOrders = document.getElementById("latestWorkOrders");
  const latestMaintenance = document.getElementById("latestMaintenance");

  const sortedOrders = [...state.workOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const sortedMaintenance = [...state.maintenance].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

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

  if (!sortedMaintenance.length) {
    latestMaintenance.innerHTML = '<p class="text-slate-500">Sem manutenções registradas.</p>';
  } else {
    latestMaintenance.innerHTML = sortedMaintenance.slice(0, 5).map((item) => {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
      const cost = item.cost ? currencyFormatter.format(Number(item.cost)) : "-";
      const notes = item.notes ? ` • ${item.notes}` : "";
      return `<div class="flex items-center justify-between border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${item.type || "Manutenção"}</p>
          <p class="text-xs text-slate-500">${formatVehicleLabel(vehicle)} • ${item.date || "-"}${notes}</p>
        </div>
        <span class="text-xs text-slate-500">${cost}</span>
      </div>`;
    }).join("");
  }

  renderTopVehicles();
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
  maintenance: [{ value: "all", label: "Todos" }],
  missions: [
    { value: "all", label: "Todos" },
    { value: "Pendente", label: "Pendente" },
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

  state.maintenance.forEach((item) => {
    const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
    const cost = item.cost ? currencyFormatter.format(Number(item.cost)) : "";
    const details = [formatVehicleLabel(vehicle), item.date || "-"].filter(Boolean);
    if (cost) details.push(cost);
    items.push({
      id: item.id,
      typeId: "maintenance",
      typeLabel: "Manutenção",
      title: item.type || "Manutenção registrada",
      description: details.join(" • "),
      status: ""
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
      const editButton = `<button class="text-accent text-xs font-medium" data-action="edit" data-type="${item.typeId}" data-id="${item.id}">Editar</button>`;
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

document.getElementById("missionCalendarPrev")?.addEventListener("click", () => {
  changeMissionCalendarMonth(-1);
});

document.getElementById("missionCalendarToday")?.addEventListener("click", () => {
  resetMissionCalendarMonth();
});

document.getElementById("missionCalendarNext")?.addEventListener("click", () => {
  changeMissionCalendarMonth(1);
});

vehicleHistorySelect?.addEventListener("change", renderVehicleHistory);
driverHistorySelect?.addEventListener("change", renderDriverHistory);
generalSearchInput?.addEventListener("input", renderGeneralSearch);
generalSearchType?.addEventListener("change", () => {
  updateSearchStatusOptions(generalSearchType.value);
  renderGeneralSearch();
});
generalSearchStatus?.addEventListener("change", renderGeneralSearch);
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
  if (type === "maintenance") {
    setActiveSection("maintenance");
    startEditMaintenance(id);
  }
  if (type === "missions") {
    setActiveSection("missions");
    startEditMission(id);
  }
  if (type === "workOrders") {
    setActiveSection("workOrders");
    startEditWorkOrder(id);
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
const maintenanceForm = document.getElementById("maintenanceForm");
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
  document.getElementById("driverStatus").value = driver.status || "Ocioso";
  driverForm.dataset.editId = id;
  setFormMode(driverForm, true);
  driverForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditMaintenance(id) {
  const item = state.maintenance.find((entry) => entry.id === id);
  if (!item || !maintenanceForm) return;
  document.getElementById("maintenanceVehicle").value = item.vehicleId || "";
  document.getElementById("maintenanceType").value = item.type || "";
  document.getElementById("maintenanceDate").value = item.date || "";
  document.getElementById("maintenanceCost").value = item.cost || "";
  document.getElementById("maintenanceNotes").value = item.notes || "";
  maintenanceForm.dataset.editId = id;
  setFormMode(maintenanceForm, true);
  maintenanceForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
    phone: document.getElementById("driverPhone").value.trim(),
    status: document.getElementById("driverStatus").value
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

maintenanceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    vehicleId: document.getElementById("maintenanceVehicle").value,
    type: document.getElementById("maintenanceType").value.trim(),
    date: document.getElementById("maintenanceDate").value,
    cost: document.getElementById("maintenanceCost").value.trim(),
    notes: document.getElementById("maintenanceNotes").value.trim()
  };
  const editId = maintenanceForm.dataset.editId;
  if (editId) {
    await update(ref(db, `maintenance/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(maintenanceForm, false);
  } else {
    await push(ref(db, "maintenance"), { ...payload, createdAt: Date.now() });
    maintenanceForm.reset();
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
  const payload = {
    vehicleId: document.getElementById("workOrderVehicle").value,
    driverId: document.getElementById("workOrderDriver").value,
    destination: document.getElementById("workOrderDestination").value.trim(),
    description: document.getElementById("workOrderDescription").value.trim(),
    status: document.getElementById("workOrderStatus").value,
    departureDate: document.getElementById("workOrderDepartureDate").value,
    departureTime: document.getElementById("workOrderDepartureTime").value,
    arrivalDate: document.getElementById("workOrderArrivalDate").value,
    arrivalTime: document.getElementById("workOrderArrivalTime").value
  };
  const editId = workOrderForm.dataset.editId;
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

document.getElementById("maintenanceTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "edit") {
    startEditMaintenance(id);
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir esta manutenção?")) {
      await remove(ref(db, `maintenance/${id}`));
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
    const nextStatus = mission?.status === "Concluída" ? "Pendente" : "Concluída";
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
  if (button.dataset.action === "edit") {
    startEditWorkOrder(id);
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

onValue(ref(db, "maintenance"), (snapshot) => {
  state.maintenance = toArray(snapshot);
  renderMaintenanceTable();
  updateDashboard();
  renderVehicleHistory();
  renderGeneralSearch();
});

onValue(ref(db, "missions"), (snapshot) => {
  state.missions = toArray(snapshot);
  renderMissionsTable();
  updateDashboard();
  renderGeneralSearch();
});

onValue(ref(db, "workOrders"), (snapshot) => {
  state.workOrders = toArray(snapshot);
  renderWorkOrdersTable();
  updateDashboard();
  renderVehicleHistory();
  renderDriverHistory();
  renderGeneralSearch();
});

updateSearchStatusOptions(generalSearchType?.value || "all");
renderGeneralSearch();
setActiveSection("dashboard");

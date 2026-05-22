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
  workOrders: []
};

const sectionIds = ["dashboard", "vehicles", "drivers", "maintenance", "workOrders"];
const sectionTitles = {
  dashboard: "Dashboard",
  vehicles: "Veículos",
  drivers: "Condutores",
  maintenance: "Manutenções",
  workOrders: "Ordens de serviço"
};

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const pageTitle = document.getElementById("pageTitle");
const sidebarToggle = document.getElementById("sidebarToggle");

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
    item.classList.toggle("bg-slate-100", item.dataset.target === sectionId);
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
  return `${vehicle.plate || "Sem placa"}${model}`;
}

function formatDriverLabel(driver) {
  if (!driver) return "Não definido";
  return driver.name || "Sem nome";
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
    renderEmptyRow(tbody, 6, "Nenhum veículo cadastrado.");
    return;
  }
  tbody.innerHTML = state.vehicles
    .map(
      (vehicle) => `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${vehicle.plate || "-"}</td>
        <td class="py-3 pr-4">${vehicle.model || "-"}</td>
        <td class="py-3 pr-4">${vehicle.brand || "-"}</td>
        <td class="py-3 pr-4">${vehicle.year || "-"}</td>
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
    renderEmptyRow(tbody, 5, "Nenhum condutor cadastrado.");
    return;
  }
  tbody.innerHTML = state.drivers
    .map(
      (driver) => `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${driver.name || "-"}</td>
        <td class="py-3 pr-4">${driver.license || "-"}</td>
        <td class="py-3 pr-4">${driver.phone || "-"}</td>
        <td class="py-3 pr-4">${driver.status || "-"}</td>
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

function renderWorkOrdersTable() {
  const tbody = document.getElementById("workOrdersTableBody");
  if (!tbody) return;
  if (!state.workOrders.length) {
    renderEmptyRow(tbody, 5, "Nenhuma ordem cadastrada.");
    return;
  }
  tbody.innerHTML = state.workOrders
    .map((item) => {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
      const driver = state.drivers.find((d) => d.id === item.driverId);
      return `<tr class="border-t border-slate-100">
        <td class="py-3 pr-4">${formatVehicleLabel(vehicle)}</td>
        <td class="py-3 pr-4">${formatDriverLabel(driver)}</td>
        <td class="py-3 pr-4">${item.status || "-"}</td>
        <td class="py-3 pr-4">${item.scheduledDate || "-"}</td>
        <td class="py-3">
          <button class="text-accent mr-3" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="text-red-600" data-action="delete" data-id="${item.id}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");
}

function updateDashboard() {
  document.getElementById("countVehicles").textContent = String(state.vehicles.length);
  document.getElementById("countDrivers").textContent = String(state.drivers.length);
  document.getElementById("countMaintenance").textContent = String(state.maintenance.length);
  document.getElementById("countWorkOrders").textContent = String(state.workOrders.length);

  const latestWorkOrders = document.getElementById("latestWorkOrders");
  const latestMaintenance = document.getElementById("latestMaintenance");

  const sortedOrders = [...state.workOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const sortedMaintenance = [...state.maintenance].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!sortedOrders.length) {
    latestWorkOrders.innerHTML = '<p class="text-slate-500">Sem ordens registradas.</p>';
  } else {
    latestWorkOrders.innerHTML = sortedOrders.slice(0, 5).map((order) => {
      const vehicle = state.vehicles.find((v) => v.id === order.vehicleId);
      const driver = state.drivers.find((d) => d.id === order.driverId);
      return `<div class="flex items-center justify-between border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${order.status || "Aberta"}</p>
          <p class="text-xs text-slate-500">${formatVehicleLabel(vehicle)} • ${formatDriverLabel(driver)}</p>
        </div>
        <span class="text-xs text-slate-500">${order.scheduledDate || "-"}</span>
      </div>`;
    }).join("");
  }

  if (!sortedMaintenance.length) {
    latestMaintenance.innerHTML = '<p class="text-slate-500">Sem manutenções registradas.</p>';
  } else {
    latestMaintenance.innerHTML = sortedMaintenance.slice(0, 5).map((item) => {
      const vehicle = state.vehicles.find((v) => v.id === item.vehicleId);
      const cost = item.cost ? currencyFormatter.format(Number(item.cost)) : "-";
      return `<div class="flex items-center justify-between border border-slate-100 rounded-md p-3">
        <div>
          <p class="font-medium">${item.type || "Manutenção"}</p>
          <p class="text-xs text-slate-500">${formatVehicleLabel(vehicle)} • ${item.date || "-"}</p>
        </div>
        <span class="text-xs text-slate-500">${cost}</span>
      </div>`;
    }).join("");
  }
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.classList.add(
    "w-full",
    "text-left",
    "px-4",
    "py-2",
    "rounded-md",
    "text-slate-600",
    "hover:bg-slate-100",
    "transition"
  );
  item.addEventListener("click", () => setActiveSection(item.dataset.target));
});

document.querySelectorAll(".quick-link").forEach((button) => {
  button.classList.add(
    "px-4",
    "py-3",
    "rounded-md",
    "border",
    "border-slate-200",
    "hover:border-accent",
    "hover:text-accent",
    "transition",
    "text-sm"
  );
  button.addEventListener("click", () => setActiveSection(button.dataset.target));
});

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", () => toggleSidebar());
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => toggleSidebar(false));
}

const vehicleForm = document.getElementById("vehicleForm");
const driverForm = document.getElementById("driverForm");
const maintenanceForm = document.getElementById("maintenanceForm");
const workOrderForm = document.getElementById("workOrderForm");

vehicleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    plate: document.getElementById("vehiclePlate").value.trim(),
    model: document.getElementById("vehicleModel").value.trim(),
    brand: document.getElementById("vehicleBrand").value.trim(),
    year: document.getElementById("vehicleYear").value.trim(),
    status: document.getElementById("vehicleStatus").value
  };
  const editId = vehicleForm.dataset.editId;
  if (editId) {
    await update(ref(db, `vehicles/${editId}`), { ...payload, updatedAt: Date.now() });
    setFormMode(vehicleForm, false);
  } else {
    await push(ref(db, "vehicles"), { ...payload, createdAt: Date.now() });
    vehicleForm.reset();
  }
});

driverForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById("driverName").value.trim(),
    license: document.getElementById("driverLicense").value.trim(),
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

workOrderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    vehicleId: document.getElementById("workOrderVehicle").value,
    driverId: document.getElementById("workOrderDriver").value,
    description: document.getElementById("workOrderDescription").value.trim(),
    status: document.getElementById("workOrderStatus").value,
    scheduledDate: document.getElementById("workOrderDate").value
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
    const vehicle = state.vehicles.find((item) => item.id === id);
    if (!vehicle) return;
    document.getElementById("vehiclePlate").value = vehicle.plate || "";
    document.getElementById("vehicleModel").value = vehicle.model || "";
    document.getElementById("vehicleBrand").value = vehicle.brand || "";
    document.getElementById("vehicleYear").value = vehicle.year || "";
    document.getElementById("vehicleStatus").value = vehicle.status || "Ativo";
    vehicleForm.dataset.editId = id;
    setFormMode(vehicleForm, true);
    vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const driver = state.drivers.find((item) => item.id === id);
    if (!driver) return;
    document.getElementById("driverName").value = driver.name || "";
    document.getElementById("driverLicense").value = driver.license || "";
    document.getElementById("driverPhone").value = driver.phone || "";
    document.getElementById("driverStatus").value = driver.status || "Ativo";
    driverForm.dataset.editId = id;
    setFormMode(driverForm, true);
    driverForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const item = state.maintenance.find((entry) => entry.id === id);
    if (!item) return;
    document.getElementById("maintenanceVehicle").value = item.vehicleId || "";
    document.getElementById("maintenanceType").value = item.type || "";
    document.getElementById("maintenanceDate").value = item.date || "";
    document.getElementById("maintenanceCost").value = item.cost || "";
    document.getElementById("maintenanceNotes").value = item.notes || "";
    maintenanceForm.dataset.editId = id;
    setFormMode(maintenanceForm, true);
    maintenanceForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir esta manutenção?")) {
      await remove(ref(db, `maintenance/${id}`));
    }
  }
});

document.getElementById("workOrdersTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "edit") {
    const item = state.workOrders.find((entry) => entry.id === id);
    if (!item) return;
    document.getElementById("workOrderVehicle").value = item.vehicleId || "";
    document.getElementById("workOrderDriver").value = item.driverId || "";
    document.getElementById("workOrderDescription").value = item.description || "";
    document.getElementById("workOrderStatus").value = item.status || "Aberta";
    document.getElementById("workOrderDate").value = item.scheduledDate || "";
    workOrderForm.dataset.editId = id;
    setFormMode(workOrderForm, true);
    workOrderForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.action === "delete") {
    if (confirm("Deseja excluir esta ordem de serviço?")) {
      await remove(ref(db, `workOrders/${id}`));
    }
  }
});

onValue(ref(db, "vehicles"), (snapshot) => {
  state.vehicles = toArray(snapshot);
  renderVehiclesTable();
  updateVehicleSelects();
  updateDashboard();
});

onValue(ref(db, "drivers"), (snapshot) => {
  state.drivers = toArray(snapshot);
  renderDriversTable();
  updateDriverSelects();
  updateDashboard();
});

onValue(ref(db, "maintenance"), (snapshot) => {
  state.maintenance = toArray(snapshot);
  renderMaintenanceTable();
  updateDashboard();
});

onValue(ref(db, "workOrders"), (snapshot) => {
  state.workOrders = toArray(snapshot);
  renderWorkOrdersTable();
  updateDashboard();
});

setActiveSection("dashboard");

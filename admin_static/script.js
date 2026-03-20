let rawData = [];
let currentAdmin = null;
let currentImages = []; // Stores objects: { url: string (data or http), file: File object or null }
let ordersData = []; // Store all orders for filtering
let filteredOrders = []; // Store filtered orders
let autoRefreshInterval = null;
let charts = {}; // Store chart instances

const views = document.querySelectorAll(".view");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth();
  setupAdminListeners();
  startAutoRefresh();
});

// View & Tab Logic
function showView(viewId) {
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

window.switchTab = function (tabName) {
  document
    .querySelectorAll(".tab-link")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelector(`.tab-link[data-tab="${tabName}"]`)
    .classList.add("active");

  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");

  const titles = {
    analytics: "Dashboard Analytics",
    orders: "Booking Management",
    menu: "Menu Management",
  };
  document.getElementById("pageTitle").innerText = titles[tabName];

  if (tabName === "analytics") loadAdminStats();
  if (tabName === "orders") loadAdminOrders();
  if (tabName === "menu") loadAdminMenu();
};

// Authentication
function checkAdminAuth() {
  const session = sessionStorage.getItem("gourmet_admin");
  if (session) {
    currentAdmin = JSON.parse(session);
    document.getElementById("adminNameDisplay").innerText = currentAdmin.name || "Admin";
    showView("dashboard-view");
    loadAdminStats();
  } else {
    showView("login-view");
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const btn = document.querySelector("#adminLoginForm button");
  const originalText = btn.innerText;
  btn.innerText = "Verifying...";
  btn.disabled = true;

  try {
    const payload = {
      email: document.getElementById("adminEmail").value,
      password: document.getElementById("adminPassword").value,
    };
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status === "success") {
      currentAdmin = data.user;
      sessionStorage.setItem("gourmet_admin", JSON.stringify(currentAdmin));
      document.getElementById("adminNameDisplay").innerText = currentAdmin.name || "Admin";
      showToast("Login successful!");
      showView("dashboard-view");
      loadAdminStats();
    } else {
      showToast("Invalid credentials!");
    }
  } catch (err) {
    showToast("Login error");
    console.error(err);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

window.adminLogout = function () {
  sessionStorage.removeItem("gourmet_admin");
  currentAdmin = null;
  document.getElementById("adminLoginForm").reset();
  showView("login-view");
  showToast("Logged out");
  stopAutoRefresh();
};

// Helper Functions
function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount) {
  return "₹" + parseFloat(amount).toFixed(2);
}

// Analytics Tab
async function loadAdminStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();

    // Basic stats
    document.getElementById("statOrders").innerText = data.orders;
    document.getElementById("statPending").innerText = data.pending;
    document.getElementById("statApproved").innerText = data.approved;
    document.getElementById("statItems").innerText = data.items;

    // Revenue stats
    document.getElementById("statTotalRevenue").innerText = formatCurrency(data.total_revenue);
    document.getElementById("statTodayRevenue").innerText = formatCurrency(data.today_revenue);
    document.getElementById("statAvgOrder").innerText = formatCurrency(data.avg_order_value);

    // Render charts
    renderStatusChart(data.status_breakdown);
    renderItemsChart(data.popular_items);
    renderCustomersChart(data.top_customers);
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

// Chart Functions
function renderStatusChart(statusBreakdown) {
  const ctx = document.getElementById("statusChart");
  if (!ctx) return;

  const labels = Object.keys(statusBreakdown);
  const values = Object.values(statusBreakdown);

  if (charts.statusChart) {
    charts.statusChart.destroy();
  }

  const colors = {
    'Waiting Approval': '#F59E0B',
    'Pending': '#F59E0B',
    'Approved': '#10B981',
    'Preparing': '#3B82F6',
    'Delivered': '#8B5CF6',
    'Cancelled': '#EF4444'
  };

  charts.statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map(l => colors[l] || '#94A3B8'),
        borderColor: '#FFFFFF',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Outfit', sans-serif", size: 12 },
            padding: 15
          }
        }
      }
    }
  });
}

function renderItemsChart(popularItems) {
  const ctx = document.getElementById("itemsChart");
  if (!ctx) return;

  const labels = popularItems.map(i => i.name);
  const values = popularItems.map(i => i.quantity);

  if (charts.itemsChart) {
    charts.itemsChart.destroy();
  }

  charts.itemsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Orders',
        data: values,
        backgroundColor: '#FF4500',
        borderColor: '#E03E00',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

function renderCustomersChart(topCustomers) {
  const ctx = document.getElementById("customersChart");
  if (!ctx) return;

  const labels = topCustomers.map(c => c.name);
  const values = topCustomers.map(c => c.orders);

  if (charts.customersChart) {
    charts.customersChart.destroy();
  }

  charts.customersChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Orders Placed',
        data: values,
        backgroundColor: '#8B5CF6',
        borderColor: '#7C3AED',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// Orders Tab
window.loadAdminOrders = async function () {
  try {
    const res = await fetch("/api/orders");
    ordersData = await res.json();
    filteredOrders = [...ordersData];
    renderOrdersTable();
    resetOrderFilters();
  } catch (err) {
    showToast("Error loading orders");
    console.error(err);
  }
};

function renderOrdersTable() {
  const tbody = document.getElementById("adminOrdersTableBody");
  tbody.innerHTML = "";

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted)">No orders found</td></tr>`;
    return;
  }

  filteredOrders.forEach((o) => {
    const itemsHtml = o.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join("<br>");
    const statusClass = (o.status || "").toLowerCase().replace(/\s+/g, "-");
    const orderDate = formatDate(o.created_at);

    const actionSelect = `
      <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)" ${o.status === "Cancelled" ? "disabled" : ""}>
        <option value="Waiting Approval" ${o.status === "Waiting Approval" || o.status === "Pending" ? "selected" : ""}>Waiting Approval</option>
        <option value="Approved" ${o.status === "Approved" ? "selected" : ""}>Approved</option>
        <option value="Preparing" ${o.status === "Preparing" ? "selected" : ""}>Preparing</option>
        <option value="Delivered" ${o.status === "Delivered" ? "selected" : ""}>Delivered</option>
        <option value="Cancelled" ${o.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
      </select>
    `;

    tbody.innerHTML += `
      <tr style="cursor: pointer;" onclick="showOrderDetails('${o.id}')">
        <td><strong>${o.id.substring(0, 8)}...</strong></td>
        <td class="text-sm text-muted">${orderDate}</td>
        <td>
          <div class="font-semibold">${o.customer}</div>
          <div class="text-sm text-muted">${o.phone || 'N/A'}</div>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted)">${itemsHtml}</td>
        <td><strong>${formatCurrency(o.total)}</strong></td>
        <td><span class="badge ${statusClass}">${o.status}</span></td>
        <td onclick="event.stopPropagation();">${actionSelect}</td>
      </tr>
    `;
  });
}

window.updateOrderStatus = async function (id, newStatus) {
  try {
    await fetch(`/api/orders/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Order ${id.substring(0, 8)} marked as ${newStatus}`);
    loadAdminOrders();
  } catch (err) {
    showToast("Error updating status");
    console.error(err);
  }
};

window.applyOrderFilters = function () {
  const searchQuery = document.getElementById("searchInput").value.toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const dateFrom = document.getElementById("dateFromFilter").value;
  const dateTo = document.getElementById("dateToFilter").value;

  filteredOrders = ordersData.filter(order => {
    // Search filter
    if (searchQuery) {
      const searchIn = (order.customer + order.id + order.phone).toLowerCase();
      if (!searchIn.includes(searchQuery)) return false;
    }

    // Status filter
    if (statusFilter && order.status !== statusFilter) return false;

    // Date range filter
    if (dateFrom || dateTo) {
      const orderDate = order.created_at ? order.created_at.split('T')[0] : '';
      if (dateFrom && orderDate < dateFrom) return false;
      if (dateTo && orderDate > dateTo) return false;
    }

    return true;
  });

  renderOrdersTable();
};

window.resetOrderFilters = function () {
  document.getElementById("searchInput").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("dateFromFilter").value = "";
  document.getElementById("dateToFilter").value = "";
};

window.showOrderDetails = async function (orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/details`);
    const data = await res.json();

    if (data.status === "success") {
      const order = data.order;

      // Populate modal with order details
      document.getElementById("modalOrderId").innerText = orderId;
      document.getElementById("modalOrderDate").innerText = formatDate(order.created_at);
      document.getElementById("modalOrderStatus").innerText = order.status;
      document.getElementById("modalStatusSelect").value = order.status;

      document.getElementById("modalCustomerName").innerText = order.customer.name;
      document.getElementById("modalCustomerEmail").innerText = order.customer.email;
      document.getElementById("modalCustomerPhone").innerText = order.customer.phone;
      document.getElementById("modalCustomerAddress").innerText = order.customer.address;

      // Populate items
      const itemsList = document.getElementById("modalItemsList");
      itemsList.innerHTML = order.items.map(item => `
        <div class="item-row">
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-details">Qty: ${item.quantity} | ${item.variant}</div>
          </div>
          <div class="item-price">${formatCurrency(item.price * item.quantity)}</div>
        </div>
      `).join("");

      document.getElementById("modalTotal").innerText = formatCurrency(order.total);
      document.getElementById("orderDetailsModal").classList.remove("hidden");

      // Store current order ID for updates
      document.getElementById("orderDetailsModal").dataset.orderId = orderId;
    }
  } catch (err) {
    showToast("Error loading order details");
    console.error(err);
  }
};

window.closeOrderDetailsModal = function () {
  document.getElementById("orderDetailsModal").classList.add("hidden");
};

window.updateStatusFromModal = async function () {
  const orderId = document.getElementById("orderDetailsModal").dataset.orderId;
  const newStatus = document.getElementById("modalStatusSelect").value;

  try {
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Order status updated to ${newStatus}`);
    closeOrderDetailsModal();
    await loadAdminOrders();
    await showOrderDetails(orderId);
  } catch (err) {
    showToast("Error updating status");
    console.error(err);
  }
};

window.printOrder = function () {
  const orderId = document.getElementById("modalOrderId").innerText;
  const printWindow = window.open('', '', 'width=600,height=700');
  const modalContent = document.querySelector('.modal-body').innerHTML;

  printWindow.document.write(`
    <html>
      <head>
        <title>Order ${orderId}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .section { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .detail-row { display: flex; justify-content: space-between; margin: 5px 0; }
          h3 { margin-top: 15px; margin-bottom: 10px; font-size: 14px; }
          .item-row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 13px; }
          .total { font-weight: bold; font-size: 16px; padding: 10px 0; }
        </style>
      </head>
      <body>
        <h2>Order Receipt</h2>
        ${modalContent}
        <script>window.print(); window.close();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

window.exportOrdersToCSV = function () {
  const headers = ["Order ID", "Date", "Customer", "Phone", "Items", "Total", "Status"];
  const rows = filteredOrders.map(order => [
    order.id,
    formatDate(order.created_at),
    order.customer,
    order.phone,
    order.items.map(i => `${i.quantity}x ${i.name}`).join("; "),
    order.total,
    order.status
  ]);

  let csv = headers.join(",") + "\n";
  rows.forEach(row => {
    csv += row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(",") || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);

  showToast("Orders exported successfully!");
};

window.clearCompletedOrders = async function () {
  const cancelledCount = ordersData.filter(o => o.status === 'Cancelled').length;
  const deliveredCount = ordersData.filter(o => o.status === 'Delivered').length;
  const totalCount = cancelledCount + deliveredCount;

  if (totalCount === 0) {
    showToast("No completed orders to delete");
    return;
  }

  const confirmed = confirm(
    `Delete ${totalCount} completed orders?\n\nCancelled: ${cancelledCount}\nDelivered: ${deliveredCount}\n\nThis action cannot be undone!`
  );

  if (!confirmed) return;

  try {
    const btn = document.querySelector('[onclick="clearCompletedOrders()"]');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
    btn.disabled = true;

    const ordersToDelete = ordersData.filter(o => o.status === 'Cancelled' || o.status === 'Delivered');
    let deletedCount = 0;

    for (const order of ordersToDelete) {
      try {
        const res = await fetch(`/api/orders/${order.id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.status === 'success') {
          deletedCount++;
        }
      } catch (err) {
        console.error(`Failed to delete order ${order.id}:`, err);
      }
    }

    btn.innerHTML = originalContent;
    btn.disabled = false;

    if (deletedCount > 0) {
      showToast(`${deletedCount} orders deleted successfully!`);
      loadAdminOrders();
    } else {
      showToast("Failed to delete orders");
    }
  } catch (err) {
    showToast("Error deleting orders");
    console.error(err);
  }
};

// Auto-refresh
function startAutoRefresh() {
  autoRefreshInterval = setInterval(() => {
    const activeTab = document.querySelector('.tab-link.active')?.dataset.tab;
    if (activeTab === 'analytics') {
      loadAdminStats();
    } else if (activeTab === 'orders') {
      loadAdminOrders();
    }
  }, 30000); // 30 seconds
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
}

// Menu Tab
window.loadAdminMenu = async function () {
  try {
    const res = await fetch("/api/foods");
    rawData = await res.json();
    console.log("Loaded foods:", rawData);
    const tbody = document.getElementById("adminFoodsTableBody");
    tbody.innerHTML = "";

    if (rawData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted)">No menu items found</td></tr>`;
      return;
    }

    rawData.forEach((f) => {
      const imgSrc = f.image.startsWith("http") ? f.image : `/${f.image}`;
      tbody.innerHTML += `
        <tr data-food-id="${f.id}">
          <td><img src="${imgSrc}" class="food-img-small" onerror="this.src='https://via.placeholder.com/60'"></td>
          <td>
            <div class="food-title">${f.name}</div>
            <div class="food-meta text-muted text-sm" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.description || "No description"}</div>
          </td>
          <td class="price-tag">₹${f.price}</td>
          <td>
            <div class="action-buttons">
              <button class="icon-btn edit-btn" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn delete delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast("Error loading menu");
    console.error("Menu load error:", err);
  }
};

window.startEditFood = function (id) {
  const food = rawData.find((f) => f.id === id);
  if (!food) return;

  document.getElementById("adminFormTitle").innerText = "Edit Food Item";
  document.getElementById("adminFoodBtn").innerHTML =
    '<i class="fa-solid fa-check"></i> Update Food';
  document.getElementById("adminFoodCancel").classList.remove("hidden");

  document.getElementById("adminFoodId").value = food.id;
  document.getElementById("adminFoodName").value = food.name;
  document.getElementById("adminFoodDescription").value =
    food.description || "";
  document.getElementById("adminFoodPrice").value = food.price;

  // Show existing images as preview
  let existingUrls = food.images || [];
  // Fallback for older data that has a single 'image' string instead of an array
  if (existingUrls.length === 0 && food.image) {
    existingUrls = [food.image];
  }

  currentImages = existingUrls.map((url) => ({ url: url, file: null }));

  if (currentImages.length > 0) {
    renderImagePreviews();
  } else {
    clearImageUpload();
  }

  document
    .getElementById("adminFoodForm")
    .scrollIntoView({ behavior: "smooth" });
};

window.resetAdminForm = function () {
  document.getElementById("adminFoodForm").reset();
  document.getElementById("adminFormTitle").innerText = "Add New Food Item";
  document.getElementById("adminFoodBtn").innerHTML =
    '<i class="fa-solid fa-plus"></i> Add Food';
  document.getElementById("adminFoodCancel").classList.add("hidden");
  document.getElementById("adminFoodId").value = "";
  clearImageUpload();
};

window.clearImageUpload = function () {
  currentImages = [];
  document.getElementById("adminFoodImageFile").value = "";
  document.getElementById("imagePreviewContainer").innerHTML = "";
  document.getElementById("imagePreviewContainer").classList.add("hidden");
  document.getElementById("uploadPlaceholder").classList.remove("hidden");
  document.getElementById("removeImageBtn").classList.add("hidden");
};

function renderImagePreviews() {
  const container = document.getElementById("imagePreviewContainer");
  container.innerHTML = "";

  currentImages.forEach((imgObj, idx) => {
    const url = imgObj.url;
    const fullSrc =
      url.startsWith("blob:") ||
      url.startsWith("data:") ||
      url.startsWith("http")
        ? url
        : "/" + url;
    const imgNode = `<div style="position:relative; width:100%; padding-top:100%; border-radius:8px; overflow:hidden; border:1px solid var(--border);">
      <img src="${fullSrc}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;">
      <button type="button" onclick="removeImageAt(${idx}); event.stopPropagation();" style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;"><i class="fa-solid fa-xmark" style="font-size:12px;"></i></button>
    </div>`;
    container.innerHTML += imgNode;
  });

  if (currentImages.length > 0) {
    container.classList.remove("hidden");
    document.getElementById("uploadPlaceholder").classList.add("hidden");
    document.getElementById("removeImageBtn").classList.remove("hidden");
  } else {
    clearImageUpload();
  }
}

window.removeImageAt = function (index) {
  currentImages.splice(index, 1);
  renderImagePreviews();
  document.getElementById("adminFoodImageFile").value = "";
};

async function handleAdminFoodSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("adminFoodId").value;
  const btn = document.getElementById("adminFoodBtn");
  const originalContent = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  try {
    let finalImageUrls = [];
    const filesToUpload = currentImages.filter((img) => img.file !== null);

    if (filesToUpload.length > 0) {
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Uploading images...';

      // Upload each file and gather URLs
      const uploadPromises = filesToUpload.map(async (imgObj) => {
        const formData = new FormData();
        formData.append("image", imgObj.file);

        const uploadRes = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        return await uploadRes.json();
      });

      const results = await Promise.all(uploadPromises);

      // Reconstruct final image array in same order
      let uploadedIdx = 0;
      for (let i = 0; i < currentImages.length; i++) {
        if (currentImages[i].file !== null) {
          const data = results[uploadedIdx];
          if (data.status === "success") {
            finalImageUrls.push(data.url);
          } else {
            showToast(data.message || "Image upload failed");
            btn.innerHTML = originalContent;
            btn.disabled = false;
            return;
          }
          uploadedIdx++;
        } else {
          finalImageUrls.push(currentImages[i].url);
        }
      }
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    } else {
      // No new files. Just map the existing URLs
      finalImageUrls = currentImages.map((img) => img.url);
    }

    const payload = {
      name: document.getElementById("adminFoodName").value,
      description: document.getElementById("adminFoodDescription").value,
      price: document.getElementById("adminFoodPrice").value,
      images: finalImageUrls,
    };

    const url = id ? `/api/foods/${id}` : "/api/foods";
    const method = id ? "PUT" : "POST";

    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status === "success") {
      showToast(id ? "Food item updated!" : "New food item added!");
      resetAdminForm();
      loadAdminMenu();
    } else {
      showToast(data.message || "Error saving food");
    }
  } catch (err) {
    showToast("Network error");
    console.error(err);
  } finally {
    btn.innerHTML = originalContent;
    btn.disabled = false;
  }
}

window.deleteFood = async function (id) {
  if (!confirm("Are you sure you want to delete this item?")) return;

  // Get all delete buttons and disable them to prevent multiple clicks
  const deleteButtons = document.querySelectorAll(".delete-btn");
  deleteButtons.forEach(btn => btn.disabled = true);

  try {
    console.log("Attempting to delete food with ID:", id);
    const res = await fetch(`/api/foods/${id}`, { method: "DELETE" });
    const data = await res.json();
    console.log("Delete response:", data);

    if (data.status === "success") {
      showToast(data.message || "Food removed!");
      loadAdminMenu();
    } else {
      showToast(data.message || "Error deleting food");
      // Re-enable buttons on error
      deleteButtons.forEach(btn => btn.disabled = false);
    }
  } catch (err) {
    console.error("Delete error:", err);
    showToast("Error deleting food");
    // Re-enable buttons on error
    deleteButtons.forEach(btn => btn.disabled = false);
  }
};

// Helpers
function setupAdminListeners() {
  document
    .getElementById("adminLoginForm")
    .addEventListener("submit", handleAdminLogin);
  document
    .getElementById("adminFoodForm")
    .addEventListener("submit", handleAdminFoodSubmit);

  document
    .getElementById("adminFoodImageFile")
    .addEventListener("change", function () {
      if (this.files.length > 0) {
        const newArray = Array.from(this.files);
        let processed = 0;

        newArray.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            currentImages.push({ url: e.target.result, file: file });
            processed++;
            if (processed === newArray.length) {
              renderImagePreviews();
            }
          };
          reader.readAsDataURL(file);
        });
        this.value = "";
      }
    });

  // Add search input listener for live search
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keyup", applyOrderFilters);
  }

  // Add food table event delegation (only once, not in loadAdminMenu)
  const tbody = document.getElementById("adminFoodsTableBody");
  if (tbody && !tbody.dataset.listenerAdded) {
    tbody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".delete-btn");
      const editBtn = e.target.closest(".edit-btn");

      if (deleteBtn) {
        const foodId = deleteBtn.closest("tr").dataset.foodId;
        console.log("Delete button clicked for food ID:", foodId);
        deleteFood(foodId);
      }

      if (editBtn) {
        const foodId = editBtn.closest("tr").dataset.foodId;
        console.log("Edit button clicked for food ID:", foodId);
        startEditFood(parseInt(foodId));
      }
    });
    tbody.dataset.listenerAdded = "true";
  }

  // Close modal when clicking outside
  const modal = document.getElementById("orderDetailsModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeOrderDetailsModal();
      }
    });
  }
}

function showToast(msg) {
  toastMsg.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

let rawData = [];
let cart = JSON.parse(localStorage.getItem("gourmet_cart") || "[]");
let currentUser = JSON.parse(localStorage.getItem("gourmet_user") || "null");
let isLoginMode = true;

const CART_KEY = "gourmet_cart";
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// DOM Elements
const views = document.querySelectorAll(".view");
const searchInput = document.getElementById("searchInput");
const menuGrid = document.getElementById("menuGrid");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const cartOverlay = document.getElementById("cartOverlay");
const cartSidebar = document.getElementById("cartSidebar");

document.addEventListener("DOMContentLoaded", () => {
  fetchFoods();
  setupEventListeners();
  updateCartUI(); // restore cart count badge from localStorage
  updateAuthUI(); // restore login state in UI

  // If already logged in, skip the auth screen and go straight to menu
  if (currentUser) {
    showView("menu-view");
  }

  // Handle URL intent params arriving from product page
  const _params = new URLSearchParams(window.location.search);
  if (_params.get("checkout") === "1" && currentUser && cart.length > 0) {
    setTimeout(initiateCheckout, 300);
  } else if (_params.get("opencart") === "1" && currentUser) {
    setTimeout(openCart, 300);
  }
});

// Navigation & Views
function showView(viewId) {
  if (viewId === "menu-view" && !currentUser) {
    showToast("Please sign in to access the menu");
    viewId = "auth-view";
  }
  // Close mobile drawer if open
  if (document.getElementById('mobNavDrawer')) closeMobileNav();
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  if (viewId !== "menu-view") searchInput.value = "";
  const navbar = document.getElementById("mainNavbar");
  if (navbar) navbar.style.display = viewId === "auth-view" ? "none" : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Theme Management
// function checkTheme() {
//   const saved = localStorage.getItem("gourmet_theme");
//   if (saved === "dark") {
//     document.body.classList.add("dark-mode");
//     document.getElementById("themeIcon").classList.replace("fa-moon", "fa-sun");
//   }
// }

// window.toggleTheme = function () {
//   const isDark = document.body.classList.toggle("dark-mode");
//   const icon = document.getElementById("themeIcon");
//   if (isDark) {
//     icon.classList.replace("fa-moon", "fa-sun");
//     localStorage.setItem("gourmet_theme", "dark");
//     showToast("Dark mode enabled");
//   } else {
//     icon.classList.replace("fa-sun", "fa-moon");
//     localStorage.setItem("gourmet_theme", "light");
//     showToast("Light mode enabled");
//   }
// };

// Menu & Fetching
async function fetchFoods() {
  try {
    const res = await fetch("/api/foods");
    if (!res.ok) throw new Error("Failed to fetch food data");
    rawData = await res.json();
    applyFilters();
  } catch (err) {
    console.error(err);
    showToast("Error loading menu. Please try again later.");
  }
}

function renderFoods(foods) {
  menuGrid.innerHTML = "";
  if (foods.length === 0) {
    menuGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
            <i class="fa-solid fa-cookie-bite fa-3x" style="margin-bottom: 1rem; opacity: 0.5;"></i>
            <h3>No items found</h3>
            <p>Try adjusting your search or filters</p>
        </div>`;
    return;
  }

  foods.forEach((food) => {
    // Create an escaped version of the description to pass inline, or just pass ID
    menuGrid.innerHTML += `
            <div class="food-card" onclick="window.location.href='/product/${food.id}'" style="cursor: pointer;">
                <div class="food-img-container">
                    <img src="${food.image.startsWith('http') ? food.image : '/' + food.image}" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
                </div>
                <div class="food-details">
                    <div class="food-name">${food.name}</div>
                    <div class="food-meta text-muted text-sm" style="font-size: 0.85em; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.5em;">${food.description || "No description available"}</div>
                    <div class="food-footer">
                        <div class="food-price">₹${food.price}</div>
                        <button class="add-btn" onclick="event.stopPropagation(); addToCart(${food.id})">
                            <i class="fa-solid fa-plus"></i> Add
                        </button>
                    </div>
                </div>
            </div>`;
  });
}

function applyFilters() {
  let filtered = [...rawData];
  const query = searchInput.value.toLowerCase().trim();

  if (query)
    filtered = filtered.filter(
      (f) =>
        f.name.toLowerCase().includes(query) ||
        (f.description && f.description.toLowerCase().includes(query)),
    );

  const sort = document.getElementById("sortSelect").value;
  if (sort === "price-asc") filtered.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") filtered.sort((a, b) => b.price - a.price);

  renderFoods(filtered);
}

// Product Details
window.showProductDetails = function (id) {
  const food = rawData.find((f) => f.id === id);
  if (!food) return;

  // Populate Data
  const imgObj = document.getElementById("pdImage");
  imgObj.src = food.image.startsWith('http') ? food.image : `/${food.image}`;
  imgObj.onerror = function () {
    this.src = "https://via.placeholder.com/600x400?text=No+Image";
  };

  document.getElementById("pdTitle").innerText = food.name;
  document.getElementById("pdPrice").innerText = `₹${food.price}`;
  document.getElementById("pdDescription").innerText =
    food.description || "No description available for this delicious item.";

  // Setup Buttons
  const addBtn = document.getElementById("pdAddBtn");
  addBtn.onclick = () => window.addToCart(id);

  const buyBtn = document.getElementById("pdBuyBtn");
  buyBtn.onclick = () => window.buyNow(id);

  // Show View
  showView("product-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.buyNow = function (id) {
  if (!currentUser) {
    showToast("Please sign in to make a purchase");
    showView("auth-view");
    return;
  }

  const item = rawData.find((f) => f.id === id);
  if (!item) return;

  // Check if item is already in cart, if not, add it
  const existing = cart.find((c) => c.id === id);
  if (!existing) {
    cart.push({ ...item, quantity: 1 });
  }

  updateCartUI();
  showToast(`${item.name} ready for checkout`);

  // Force transition to checkout
  initiateCheckout();
};

// Auth System
function updateAuthUI() {
  const accountLinkText = document.querySelector("#accountLink .nav-text");
  const logoutLink = document.getElementById("logoutLink");
  const mobAccountText = document.getElementById("mobAccountText");
  const mobLogoutLink = document.getElementById("mobLogoutLink");

  if (currentUser) {
    if (accountLinkText) accountLinkText.innerText = "My Account";
    if (logoutLink) logoutLink.style.display = "";
    if (mobAccountText) mobAccountText.innerText = "My Account";
    if (mobLogoutLink) mobLogoutLink.style.display = "";

    // Update account view details if present
    const accName = document.getElementById("accName");
    const accEmail = document.getElementById("accEmail");
    const payName = document.getElementById("payName");

    if (accName) accName.innerText = currentUser.name || "User";
    if (accEmail) accEmail.innerText = currentUser.email || "";
    if (payName && !payName.value) payName.value = currentUser.name || "User";
  } else {
    if (accountLinkText) accountLinkText.innerText = "Sign In";
    if (logoutLink) logoutLink.style.display = "none";
    if (mobAccountText) mobAccountText.innerText = "Sign In";
    if (mobLogoutLink) mobLogoutLink.style.display = "none";
  }
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  document.getElementById("authTitle").innerText = isLoginMode
    ? "Welcome Back"
    : "Create Account";
  document.getElementById("authSubtitle").innerText = isLoginMode
    ? "Sign in to unlock amazing features"
    : "Join us to get the best food delivered";
  document.getElementById("nameGroup").style.display = isLoginMode
    ? "none"
    : "block";
  const btn = document.querySelector("#authForm button");
  btn.innerText = isLoginMode ? "Sign In" : "Sign Up";

  document.getElementById("toggleAuth").innerHTML = isLoginMode
    ? "New here? <span>Create Account</span>"
    : "Already have an account? <span>Sign In</span>";
}

async function handleAuth(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = "Please wait...";

  const payload = {
    name: document.getElementById("authName").value || "User",
    email: document.getElementById("authEmail").value,
    password: document.getElementById("authPassword").value,
  };

  try {
    const res = await fetch(isLoginMode ? "/api/login" : "/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status === "success") {
      currentUser = data.user;
      localStorage.setItem("gourmet_user", JSON.stringify(currentUser));
      updateAuthUI();

      showToast(data.message);
      showView("menu-view");
      // If user arrived via "Buy Now" or cart icon from product page, trigger the right action
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("checkout") === "1" && cart.length > 0) {
        setTimeout(initiateCheckout, 350);
      } else if (urlParams.get("opencart") === "1") {
        setTimeout(openCart, 350);
      }
    } else if (data.status === "user_exists") {
      showToast(data.message);
      // Auto-switch to login mode so the user can sign in
      if (!isLoginMode) {
        toggleAuthMode();
      }
      btn.disabled = false;
      btn.innerText = originalText;
    } else {
      showToast(data.message);
      btn.disabled = false;
      btn.innerText = originalText;
    }
  } catch (err) {
    showToast("Authentication failed. Check your connection.");
    console.error(err);
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

window.logout = function () {
  currentUser = null;
  localStorage.removeItem("gourmet_user");
  updateAuthUI();
  // Go directly to auth-view on logout (not menu-view, which would redirect anyway)
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById("auth-view").classList.add("active");
  const navbar = document.getElementById("mainNavbar");
  if (navbar) navbar.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("Logged out successfully");
};

// Cart System
window.openCart = function () {
  cartOverlay.classList.add("active");
  cartSidebar.classList.add("active");
};

window.closeCart = function () {
  cartOverlay.classList.remove("active");
  cartSidebar.classList.remove("active");
};

window.addToCart = function (id) {
  if (!currentUser) {
    showToast("Please sign in to add items to your cart");
    showView("auth-view");
    return;
  }
  const item = rawData.find((f) => f.id === id);
  const existing = cart.find((c) => c.id === id);
  if (existing) existing.quantity++;
  else cart.push({ ...item, quantity: 1 });
  updateCartUI();
  showToast(`${item.name} added to cart`);
  openCart();
};

function updateCartUI() {
  document.getElementById("cartCount").innerText = cart.reduce(
    (s, i) => s + i.quantity,
    0,
  );
  const list = document.getElementById("cartItemsList");

  if (cart.length === 0) {
    list.innerHTML = `
            <div class="empty-cart">
                <i class="fa-solid fa-basket-shopping"></i>
                <p>Your cart is empty</p>
                <button class="secondary-btn" onclick="closeCart()">Start Browsing</button>
            </div>
        `;
    document.getElementById("cartTotal").innerText = "0";
    document.getElementById("payTotal").innerText = "0";
    if (document.getElementById("qrPayTotal"))
      document.getElementById("qrPayTotal").innerText = "0";
    persistCart();
    return;
  }

  list.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += item.price * item.quantity;
    list.innerHTML += `
            <div class="cart-item">
                <img src="/${item.image}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/70'">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <span class="qty-price">₹${item.price} x ${item.quantity}</span>
                </div>
                <div class="cart-item-actions">
                    <span class="item-total">₹${item.price * item.quantity}</span>
                    <button class="remove-btn" onclick="removeFromCart(${index})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
  });

  document.getElementById("cartTotal").innerText = total;
  document.getElementById("payTotal").innerText = total;
  if (document.getElementById("qrPayTotal")) {
    document.getElementById("qrPayTotal").innerText = total;
  }
  persistCart(); // sync to localStorage so product.html can read it
}

window.removeFromCart = function (index) {
  cart.splice(index, 1);
  updateCartUI();
};

window.initiateCheckout = function () {
  if (cart.length === 0) {
    showToast("Your cart is empty!");
    return;
  }
  if (!currentUser && currentUser?.name !== "Admin") {
    const proceed = confirm("You are not logged in. Proceeding as guest?");
    if (!proceed) {
      closeCart();
      showView("auth-view");
      return;
    }
  }
  closeCart();
  showView("payment-view");
};

async function handlePayment(e) {
  e.preventDefault();

  if (cart.length === 0) {
    showToast("Cart is empty!");
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
  btn.disabled = true;

  const orderData = {
    user_id: currentUser ? currentUser.id : null,
    customer: document.getElementById("payName").value,
    phone: document.getElementById("payPhone").value,
    address: document.getElementById("payAddress").value,
    items: cart,
    total: document.getElementById("payTotal").innerText,
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });
    const data = await res.json();

    if (data.status === "success") {
      document.getElementById("orderIdText").innerText = data.order_id;
      cart = [];
      updateCartUI();
      showView("confirmation-view");
      document.getElementById("paymentForm").reset();
      if (currentUser)
        document.getElementById("payName").value = currentUser.name;
    } else {
      showToast("Checkout failed. Please try again.");
    }
  } catch (err) {
    showToast("Error processing order.");
    console.error(err);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Order Tracking
window.trackOrder = async function () {
  const trackId = document.getElementById("trackOrderId").value.trim();
  if (!trackId) {
    showToast("Please enter an Order ID");
    return;
  }

  const btn = document.querySelector("#track-view button");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const res = await fetch(`/api/orders/${trackId}`);
    const data = await res.json();

    if (data.status === "success") {
      const order = data.order;
      document.getElementById("trackResult").style.display = "block";
      document.getElementById("trackStatusText").innerText =
        `Status: ${order.status}`;
      document.getElementById("trackOrderTotal").innerText =
        `Total Amount: ₹${order.total}`;

      // Reset visual cues
      document.getElementById("stepPending").classList.remove("active");
      document.getElementById("stepPreparing").classList.remove("active");
      document.getElementById("stepDelivered").classList.remove("active");
      document.getElementById("line1").classList.remove("active");
      document.getElementById("line2").classList.remove("active");

      if (order.status === "Pending") {
        document.getElementById("stepPending").classList.add("active");
      } else if (order.status === "Preparing") {
        document.getElementById("stepPending").classList.add("active");
        document.getElementById("line1").classList.add("active");
        document.getElementById("stepPreparing").classList.add("active");
      } else if (order.status === "Delivered") {
        document.getElementById("stepPending").classList.add("active");
        document.getElementById("line1").classList.add("active");
        document.getElementById("stepPreparing").classList.add("active");
        document.getElementById("line2").classList.add("active");
        document.getElementById("stepDelivered").classList.add("active");
      } else if (order.status === "Cancelled") {
        document.getElementById("trackStatusText").innerText =
          `Status: Cancelled`;
        document.getElementById("trackStatusText").style.color = "#EF4444";
      }
    } else {
      showToast("Order not found. Check the ID.");
      document.getElementById("trackResult").style.display = "none";
    }
  } catch (err) {
    showToast("Error tracking order.");
    console.error(err);
  } finally {
    btn.innerHTML = originalText;
  }
};

// Initial Events Binding
function setupEventListeners() {
  searchInput.addEventListener("input", applyFilters);
  document
    .getElementById("sortSelect")
    .addEventListener("change", applyFilters);
  document
    .getElementById("categoryContainer")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("cat-btn")) {
        document
          .querySelectorAll(".categories .cat-btn")
          .forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        applyFilters();
      }
    });

  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("authForm").addEventListener("submit", handleAuth);
  document
    .getElementById("toggleAuth")
    .addEventListener("click", toggleAuthMode);
  document.getElementById("accountLink").addEventListener("click", () => {
    if (currentUser) showView("account-view");
    else showView("auth-view");
  });

  document
    .getElementById("paymentForm")
    .addEventListener("submit", handlePayment);

  // Mobile nav drawer
  document.getElementById("hamburgerBtn").addEventListener("click", openMobileNav);
  document.getElementById("mobNavOverlay").addEventListener("click", closeMobileNav);
  document.getElementById("mobAccountLink").addEventListener("click", () => {
    closeMobileNav();
    if (currentUser) showView("account-view");
    else showView("auth-view");
  });
  document.getElementById("mobSearchInput").addEventListener("input", function () {
    searchInput.value = this.value;
    applyFilters();
  });
}

window.openMobileNav = function () {
  document.getElementById('mobNavOverlay').classList.add('active');
  document.getElementById('mobNavDrawer').classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeMobileNav = function () {
  document.getElementById('mobNavOverlay').classList.remove('active');
  document.getElementById('mobNavDrawer').classList.remove('active');
  document.body.style.overflow = '';
};

function showToast(msg) {
  toastMsg.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

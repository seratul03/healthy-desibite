let rawData = [];
let currentAdmin = null;
let currentImages = []; // Stores objects: { url: string (data or http), file: File object or null }

const views = document.querySelectorAll('.view');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    setupAdminListeners();
});

// View & Tab Logic
function showView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab-link[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    const titles = {
        'analytics': 'Dashboard Analytics',
        'orders': 'Order Management',
        'menu': 'Menu Management'
    };
    document.getElementById('pageTitle').innerText = titles[tabName];

    if (tabName === 'analytics') loadAdminStats();
    if (tabName === 'orders') loadAdminOrders();
    if (tabName === 'menu') loadAdminMenu();
}

// Authentication
function checkAdminAuth() {
    const session = sessionStorage.getItem('gourmet_admin');
    if (session) {
        currentAdmin = JSON.parse(session);
        showView('dashboard-view');
        loadAdminStats();
    } else {
        showView('login-view');
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const btn = document.querySelector('#adminLoginForm button');
    const originalText = btn.innerText;
    btn.innerText = 'Verifying...';
    btn.disabled = true;

    try {
        const payload = {
            email: document.getElementById('adminEmail').value,
            password: document.getElementById('adminPassword').value
        };
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            currentAdmin = data.user;
            sessionStorage.setItem('gourmet_admin', JSON.stringify(currentAdmin));
            showToast('Login successful!');
            showView('dashboard-view');
            loadAdminStats();
        } else {
            showToast('Invalid credentials!');
        }
    } catch (err) {
        showToast('Login error');
        console.error(err);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.adminLogout = function () {
    sessionStorage.removeItem('gourmet_admin');
    currentAdmin = null;
    document.getElementById('adminLoginForm').reset();
    showView('login-view');
    showToast('Logged out');
}

// Analytics Tab
async function loadAdminStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('statRevenue').innerText = data.revenue.toLocaleString();
        document.getElementById('statOrders').innerText = data.orders;
        document.getElementById('statPending').innerText = data.pending;
        document.getElementById('statItems').innerText = data.items;
    } catch (err) {
        console.error('Failed to load stats', err);
    }
}

// Orders Tab
window.loadAdminOrders = async function () {
    try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        const tbody = document.getElementById('adminOrdersTableBody');
        tbody.innerHTML = '';

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-muted)">No orders found</td></tr>`;
            return;
        }

        orders.forEach(o => {
            const itemsHtml = o.items.map(i => `${i.quantity}x ${i.name}`).join('<br>');
            const statusClass = o.status.toLowerCase();

            const actionSelect = `
                <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)" ${o.status === 'Cancelled' ? 'disabled' : ''}>
                    <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Preparing" ${o.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            `;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${o.id}</strong></td>
                    <td><div class="font-semibold">${o.customer}</div><div class="text-sm text-muted">${o.phone}</div></td>
                    <td style="font-size: 0.85rem; color: var(--text-muted)">${itemsHtml}</td>
                    <td><strong>₹${o.total}</strong></td>
                    <td><span class="badge ${statusClass}">${o.status}</span></td>
                    <td>${actionSelect}</td>
                </tr>
            `;
        });
    } catch (err) {
        showToast('Error loading orders');
        console.error(err);
    }
}

window.updateOrderStatus = async function (id, newStatus) {
    try {
        await fetch(`/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`Order ${id} marked as ${newStatus}`);
        loadAdminOrders();
    } catch (err) {
        showToast('Error updating status');
        console.error(err);
    }
}

// Menu Tab
window.loadAdminMenu = async function () {
    try {
        const res = await fetch('/api/foods');
        rawData = await res.json();
        const tbody = document.getElementById('adminFoodsTableBody');
        tbody.innerHTML = '';

        if (rawData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted)">No menu items found</td></tr>`;
            return;
        }

        rawData.forEach(f => {
            const imgSrc = f.image.startsWith('http') ? f.image : `/${f.image}`;
            tbody.innerHTML += `
                <tr>
                    <td><img src="${imgSrc}" class="food-img-small" onerror="this.src='https://via.placeholder.com/60'"></td>
                    <td>
                        <div class="food-title">${f.name}</div>
                        <div class="food-meta text-muted text-sm" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.description || 'No description'}</div>
                    </td>
                    <td class="price-tag">₹${f.price}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="icon-btn" onclick="startEditFood(${f.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button class="icon-btn delete" onclick="deleteFood(${f.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        showToast('Error loading menu');
        console.error(err);
    }
}

window.startEditFood = function (id) {
    const food = rawData.find(f => f.id === id);
    if (!food) return;

    document.getElementById('adminFormTitle').innerText = 'Edit Food Item';
    document.getElementById('adminFoodBtn').innerHTML = '<i class="fa-solid fa-check"></i> Update Food';
    document.getElementById('adminFoodCancel').classList.remove('hidden');

    document.getElementById('adminFoodId').value = food.id;
    document.getElementById('adminFoodName').value = food.name;
    document.getElementById('adminFoodDescription').value = food.description || '';
    document.getElementById('adminFoodPrice').value = food.price;

    // Show existing images as preview
    let existingUrls = food.images || []; 
    // Fallback for older data that has a single 'image' string instead of an array
    if (existingUrls.length === 0 && food.image) {
        existingUrls = [food.image];
    }
    
    currentImages = existingUrls.map(url => ({ url: url, file: null }));
    
    if (currentImages.length > 0) {
        renderImagePreviews();
    } else {
        clearImageUpload();
    }

    document.getElementById('adminFoodForm').scrollIntoView({ behavior: 'smooth' });
}

window.resetAdminForm = function () {
    document.getElementById('adminFoodForm').reset();
    document.getElementById('adminFormTitle').innerText = 'Add New Food Item';
    document.getElementById('adminFoodBtn').innerHTML = '<i class="fa-solid fa-plus"></i> Add Food';
    document.getElementById('adminFoodCancel').classList.add('hidden');
    document.getElementById('adminFoodId').value = '';
    clearImageUpload();
}

window.clearImageUpload = function () {
    currentImages = [];
    document.getElementById('adminFoodImageFile').value = '';
    document.getElementById('imagePreviewContainer').innerHTML = '';
    document.getElementById('imagePreviewContainer').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');
    document.getElementById('removeImageBtn').classList.add('hidden');
}

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';
    
    currentImages.forEach((imgObj, idx) => {
        const url = imgObj.url;
        const fullSrc = url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http') ? url : '/' + url;
        const imgNode = `<div style="position:relative; width:100%; padding-top:100%; border-radius:8px; overflow:hidden; border:1px solid var(--border);">
            <img src="${fullSrc}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removeImageAt(${idx}); event.stopPropagation();" style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;"><i class="fa-solid fa-xmark" style="font-size:12px;"></i></button>
        </div>`;
        container.innerHTML += imgNode;
    });

    if (currentImages.length > 0) {
        container.classList.remove('hidden');
        document.getElementById('uploadPlaceholder').classList.add('hidden');
        document.getElementById('removeImageBtn').classList.remove('hidden');
    } else {
        clearImageUpload();
    }
}

window.removeImageAt = function(index) {
    currentImages.splice(index, 1);
    renderImagePreviews();
    // Also reset file input so the user can re-select the same file if needed
    document.getElementById('adminFoodImageFile').value = '';
}

async function handleAdminFoodSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('adminFoodId').value;
    const btn = document.getElementById('adminFoodBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        let finalImageUrls = [];
        const filesToUpload = currentImages.filter(img => img.file !== null);
        
        if (filesToUpload.length > 0) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading images...';
            
            // Upload each file and gather URLs
            const uploadPromises = filesToUpload.map(async (imgObj) => {
                const formData = new FormData();
                formData.append('image', imgObj.file);
                
                const uploadRes = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });
                return await uploadRes.json();
            });
            
            const results = await Promise.all(uploadPromises);
            
            // Reconstruct final image array in same order
            let uploadedIdx = 0;
            for (let i = 0; i < currentImages.length; i++) {
                if (currentImages[i].file !== null) {
                    const data = results[uploadedIdx];
                    if (data.status === 'success') {
                        finalImageUrls.push(data.url);
                    } else {
                        showToast(data.message || 'Image upload failed');
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
            finalImageUrls = currentImages.map(img => img.url);
        }

        const payload = {
            name: document.getElementById('adminFoodName').value,
            description: document.getElementById('adminFoodDescription').value,
            price: document.getElementById('adminFoodPrice').value,
            images: finalImageUrls
        };

        const url = id ? `/api/foods/${id}` : '/api/foods';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            showToast(id ? 'Food item updated!' : 'New food item added!');
            resetAdminForm();
            loadAdminMenu();
        } else {
            showToast(data.message || 'Error saving food');
        }
    } catch (err) {
        showToast('Network error');
        console.error(err);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

window.deleteFood = async function (id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const res = await fetch(`/api/foods/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('Food deleted successfully');
            loadAdminMenu();
        } else {
            showToast(data.message || 'Error deleting food');
        }
    } catch (err) {
        showToast('Network error while deleting');
    }
}

// Helpers
function setupAdminListeners() {
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('adminFoodForm').addEventListener('submit', handleAdminFoodSubmit);

    document.getElementById('adminFoodImageFile').addEventListener('change', function () {
        if (this.files.length > 0) {
            const newArray = Array.from(this.files);
            let processed = 0;
            
            newArray.forEach(file => {
                const reader = new FileReader();
                reader.onload = e => {
                    currentImages.push({ url: e.target.result, file: file });
                    processed++;
                    if (processed === newArray.length) {
                        renderImagePreviews();
                    }
                };
                reader.readAsDataURL(file);
            });
            // Reset the file input so identical subsequent files will re-fire "change" and can be added again if desired
            this.value = '';
        }
    });
}

function showToast(msg) {
    toastMsg.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

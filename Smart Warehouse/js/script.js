// تطبيق المستودع الذكي - الإصدار المتقدم
class SmartWarehouseApp {
    constructor() {
        this.socket = null;
        this.currentView = 'grid';
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadInitialData();
        this.initializeCharts();
        
        // إخفاء شاشة التحميل بعد 3 ثواني
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 3000);
    }

    setupEventListeners() {
        // التنقل بين القوائم
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchSection(e.currentTarget.dataset.section);
            });
        });

        // تبديل الشريط الجانبي
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('active');
        });

        // زر الملء الشاشة
        document.getElementById('fullscreenBtn').addEventListener('click', this.toggleFullscreen);

        // زر الإشعارات
        document.getElementById('notificationsBtn').addEventListener('click', this.toggleNotifications);

        // نماذج التخزين والاسترجاع
        document.getElementById('storeForm').addEventListener('submit', (e) => this.handleStore(e));
        document.getElementById('retrieveForm').addEventListener('submit', (e) => this.handleRetrieve(e));

        // البحث والتصفية
        document.getElementById('inventorySearch').addEventListener('input', (e) => this.searchInventory(e.target.value));
        document.getElementById('categoryFilter').addEventListener('change', () => this.filterInventory());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterInventory());

        // تبديل طريقة العرض
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.currentTarget.dataset.view);
            });
        });
    }

    connectWebSocket() {
        // Simulate WebSocket connection for demo purposes
        this.showToast('تم تشغيل النظام بنجاح', 'success');
        this.updateSystemStatus('online');
        
        // Simulate periodic updates
        setInterval(() => {
            this.simulateStatusUpdate();
        }, 30000);
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadDashboardData(),
                this.loadInventory(),
                this.loadOperations(),
                this.loadSystemStatus()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('خطأ في تحميل البيانات', 'error');
        }
    }

    async loadDashboardData() {
        // Simulate dashboard data
        const data = {
            stats: {
                totalProducts: 1250,
                usedCapacity: 68,
                todayOperations: 47,
                lowStock: 12
            }
        };
        
        this.updateDashboardStats(data.stats);
    }

    async loadInventory() {
        // Simulate inventory data
        const products = this.generateSampleProducts();
        
        this.renderInventory(products);
        this.updateInventoryStats(products);
    }

    async loadOperations() {
        // Simulate operations data
        const operations = this.generateSampleOperations();
        
        this.renderOperations(operations);
        this.updateOperationsStats(operations);
    }

    async handleStore(e) {
        e.preventDefault();
        
        const productData = {
            productId: document.getElementById('productId').value,
            productName: document.getElementById('productName').value,
            weight: parseFloat(document.getElementById('productWeight').value),
            quantity: parseInt(document.getElementById('productQuantity').value)
        };

        // Validate input
        if (!productData.productId || !productData.productName || !productData.weight || !productData.quantity) {
            this.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        // Simulate storage process
        this.showToast('بدء عملية التخزين...', 'info');
        
        setTimeout(() => {
            const location = `A-${Math.floor(Math.random() * 20) + 1}-${Math.floor(Math.random() * 10) + 1}`;
            this.showToast(`تم تخزين المنتج في الموقع ${location}`, 'success');
            e.target.reset();
            
            // Add to local storage for demo
            this.addProductToStorage(productData, location);
            this.loadInventory();
            this.loadOperations();
            this.updateDashboardAfterOperation('store');
        }, 2000);
    }

    async handleRetrieve(e) {
        e.preventDefault();
        
        const retrieveData = {
            productId: document.getElementById('retrieveProductId').value,
            quantity: parseInt(document.getElementById('retrieveQuantity').value)
        };

        if (!retrieveData.productId || !retrieveData.quantity) {
            this.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        // Check if product exists in storage
        const storedProducts = this.getStoredProducts();
        const product = storedProducts.find(p => p.productId === retrieveData.productId);
        
        if (!product) {
            this.showToast('المنتج غير موجود في المخزون', 'error');
            return;
        }

        if (product.quantity < retrieveData.quantity) {
            this.showToast(`الكمية المطلوبة غير متوفرة. الكمية المتاحة: ${product.quantity}`, 'error');
            return;
        }

        // Simulate retrieval process
        this.showToast('بدء عملية الاسترجاع...', 'info');
        
        setTimeout(() => {
            this.showToast(`تم استرجاع ${retrieveData.quantity} من المنتج`, 'success');
            e.target.reset();
            
            // Update local storage
            this.removeProductFromStorage(retrieveData.productId, retrieveData.quantity);
            this.loadInventory();
            this.loadOperations();
            this.updateDashboardAfterOperation('retrieve');
        }, 2000);
    }

    switchSection(sectionId) {
        // تحديث القائمة النشطة
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');

        // إظهار القسم المحدد
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionId).classList.add('active');

        // تحديث العنوان
        this.updatePageTitle(sectionId);
    }

    updatePageTitle(sectionId) {
        const titles = {
            'dashboard': 'لوحة التحكم',
            'storage': 'إدارة التخزين',
            'inventory': 'المخزون',
            'operations': 'سجل العمليات',
            'robots': 'التحكم بالروبوت',
            'analytics': 'التقارير والإحصائيات',
            'settings': 'الإعدادات'
        };

        document.getElementById('pageTitle').textContent = titles[sectionId] || 'لوحة التحكم';
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
            <button class="btn-icon" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        // إزالة التلقائي بعد 5 ثواني
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    getToastIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    hideLoadingScreen() {
        document.getElementById('loading').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
        }, 500);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    toggleNotifications() {
        document.getElementById('notificationsPanel').classList.toggle('active');
    }

    // Helper Functions
    generateSampleProducts() {
        const products = [];
        const categories = ['electronics', 'mechanical', 'tools'];
        const names = ['منتج إلكتروني', 'قطعة ميكانيكية', 'أداة يدوية', 'مادة خام'];
        
        for (let i = 1; i <= 20; i++) {
            products.push({
                id: `P${String(i).padStart(3, '0')}`,
                name: `${names[Math.floor(Math.random() * names.length)]} ${i}`,
                category: categories[Math.floor(Math.random() * categories.length)],
                quantity: Math.floor(Math.random() * 100) + 1,
                weight: (Math.random() * 10 + 0.5).toFixed(2),
                location: `A-${Math.floor(Math.random() * 20) + 1}-${Math.floor(Math.random() * 10) + 1}`,
                status: Math.random() > 0.8 ? 'low_stock' : 'in_stock'
            });
        }
        return products;
    }

    generateSampleOperations() {
        const operations = [];
        const types = ['store', 'retrieve'];
        
        for (let i = 1; i <= 10; i++) {
            const date = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            operations.push({
                id: `OP${String(i).padStart(3, '0')}`,
                type: types[Math.floor(Math.random() * types.length)],
                productId: `P${String(Math.floor(Math.random() * 20) + 1).padStart(3, '0')}`,
                quantity: Math.floor(Math.random() * 10) + 1,
                status: Math.random() > 0.1 ? 'completed' : 'failed',
                timestamp: date.toISOString()
            });
        }
        return operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    updateDashboardStats(stats) {
        document.getElementById('totalProducts').textContent = stats.totalProducts.toLocaleString();
        document.getElementById('usedCapacity').textContent = `${stats.usedCapacity}%`;
        document.getElementById('todayOperations').textContent = stats.todayOperations;
        document.getElementById('lowStock').textContent = stats.lowStock;

        // Update capacity progress bar
        const capacityProgress = document.getElementById('capacityProgress');
        if (capacityProgress) {
            capacityProgress.style.width = `${stats.usedCapacity}%`;
        }
    }

    renderInventory(products) {
        const container = document.getElementById('inventoryContainer');
        if (!container) return;

        container.innerHTML = products.map(product => `
            <div class="inventory-item">
                <div class="item-header">
                    <span class="item-id">${product.id}</span>
                    <span class="item-status ${product.status}">${product.status === 'low_stock' ? 'منخفض' : 'متوفر'}</span>
                </div>
                <h3 class="item-name">${product.name}</h3>
                <div class="item-details">
                    <div class="detail">
                        <i class="fas fa-cubes"></i>
                        <span>الكمية: ${product.quantity}</span>
                    </div>
                    <div class="detail">
                        <i class="fas fa-weight-hanging"></i>
                        <span>الوزن: ${product.weight} كجم</span>
                    </div>
                    <div class="detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>الموقع: ${product.location}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderOperations(operations) {
        const tbody = document.getElementById('operationsBody');
        if (!tbody) return;

        tbody.innerHTML = operations.map(op => `
            <tr>
                <td>${op.id}</td>
                <td>${op.type === 'store' ? 'تخزين' : 'استرجاع'}</td>
                <td>${op.productId}</td>
                <td>${op.quantity}</td>
                <td class="status ${op.status}">${op.status === 'completed' ? 'مكتمل' : 'فاشل'}</td>
                <td>${new Date(op.timestamp).toLocaleString('ar')}</td>
                <td>
                    <button class="btn-icon" onclick="viewOperation('${op.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    updateInventoryStats(products) {
        // Update stats based on products
    }

    updateOperationsStats(operations) {
        const totalOps = operations.length;
        const storeOps = operations.filter(op => op.type === 'store').length;
        const retrieveOps = operations.filter(op => op.type === 'retrieve').length;
        const successRate = Math.round((operations.filter(op => op.status === 'completed').length / totalOps) * 100);

        document.getElementById('totalOps').textContent = totalOps;
        document.getElementById('storeOps').textContent = storeOps;
        document.getElementById('retrieveOps').textContent = retrieveOps;
        document.getElementById('successRate').textContent = `${successRate}%`;
    }

    updateSystemStatus(status) {
        const statusElement = document.getElementById('systemStatus');
        if (statusElement) {
            statusElement.className = `status-indicator ${status}`;
            statusElement.innerHTML = `
                <i class="fas fa-circle"></i>
                <span>${status === 'online' ? 'النظام يعمل' : 'النظام معطل'}</span>
            `;
        }
    }

    simulateStatusUpdate() {
        // Simulate random system updates
        const randomUpdate = Math.random();
        if (randomUpdate > 0.7) {
            this.showToast('تم الانتهاء من عملية تخزين تلقائية', 'success');
        }
    }

    searchInventory(query) {
        // Implement search functionality
        console.log('Searching for:', query);
    }

    filterInventory() {
        // Implement filter functionality
        const category = document.getElementById('categoryFilter').value;
        const status = document.getElementById('statusFilter').value;
        console.log('Filtering by:', category, status);
    }

    switchView(view) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        this.currentView = view;
    }

    // Local Storage Functions
    getStoredProducts() {
        return JSON.parse(localStorage.getItem('warehouseProducts') || '[]');
    }

    addProductToStorage(product, location) {
        const products = this.getStoredProducts();
        const existingIndex = products.findIndex(p => p.productId === product.productId);
        
        if (existingIndex >= 0) {
            products[existingIndex].quantity += product.quantity;
        } else {
            products.push({
                ...product,
                location,
                status: 'in_stock'
            });
        }
        
        localStorage.setItem('warehouseProducts', JSON.stringify(products));
    }

    removeProductFromStorage(productId, quantity) {
        const products = this.getStoredProducts();
        const productIndex = products.findIndex(p => p.productId === productId);
        
        if (productIndex >= 0) {
            products[productIndex].quantity -= quantity;
            if (products[productIndex].quantity <= 0) {
                products.splice(productIndex, 1);
            }
        }
        
        localStorage.setItem('warehouseProducts', JSON.stringify(products));
    }

    updateDashboardAfterOperation(type) {
        const currentStats = {
            totalProducts: parseInt(document.getElementById('totalProducts').textContent.replace(/,/g, '')),
            todayOperations: parseInt(document.getElementById('todayOperations').textContent)
        };
        
        currentStats.todayOperations += 1;
        if (type === 'store') currentStats.totalProducts += 1;
        
        this.updateDashboardStats({
            ...currentStats,
            usedCapacity: 68,
            lowStock: 12
        });
    }

    async loadSystemStatus() {
        // Simulate system status loading
        this.updateSystemStatus('online');
    }

    initializeCharts() {
        // Charts will be initialized by charts.js
    }
}

// Global Functions
function closeNotifications() {
    document.getElementById('notificationsPanel').classList.remove('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function loadOperations() {
    if (window.warehouseApp) {
        window.warehouseApp.loadOperations();
        window.warehouseApp.showToast('تم تحديث سجل العمليات', 'success');
    }
}

function exportInventory() {
    window.warehouseApp?.showToast('تم تصدير البيانات بنجاح', 'success');
}

function exportOperations() {
    window.warehouseApp?.showToast('تم تصدير سجل العمليات بنجاح', 'success');
}

function viewOperation(operationId) {
    window.warehouseApp?.showToast(`عرض تفاصيل العملية ${operationId}`, 'info');
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.warehouseApp = new SmartWarehouseApp();
});
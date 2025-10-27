// Smart Warehouse IoT System - Main Application
class SmartWarehouseApp {
    constructor() {
        this.currentSection = 'dashboard';
        this.espIP = '192.168.1.100'; // Default ESP IP - user can change this
        this.espConnected = false;
        this.websocket = null;
        this.reconnectInterval = null;
        this.sensors = {
            temperature: 0,
            humidity: 0,
            weight: 0,
            distance: 0,
            motion: false,
            light: 0
        };
        this.robot = {
            position: { x: 0, y: 0, z: 0 },
            status: 'idle',
            gripper: 'open',
            battery: 100
        };
        this.inventory = [];
        this.operations = [];
        
        this.init();
    }

    async init() {
        this.showLoadingScreen();
        await this.delay(2000);
        this.hideLoadingScreen();
        
        this.setupEventListeners();
        this.connectToESP();
        this.loadDashboardData();
        this.startPeriodicUpdates();
        
        console.log('🤖 Smart Warehouse System Initialized');
    }

    // ESP32/ESP8266 Connection Management
    connectToESP() {
        this.showToast('محاولة الاتصال بـ ESP32...', 'info');
        
        try {
            // WebSocket connection to ESP
            this.websocket = new WebSocket(`ws://${this.espIP}:81/ws`);
            
            this.websocket.onopen = () => {
                this.espConnected = true;
                this.showToast('✅ تم الاتصال بـ ESP32 بنجاح', 'success');
                this.updateSystemStatus('online');
                this.clearReconnectInterval();
                
                // Request initial sensor data
                this.sendToESP({ command: 'get_sensors' });
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleESPMessage(data);
                } catch (error) {
                    console.error('Error parsing ESP message:', error);
                }
            };
            
            this.websocket.onclose = () => {
                this.espConnected = false;
                this.showToast('❌ انقطع الاتصال مع ESP32', 'warning');
                this.updateSystemStatus('offline');
                this.startReconnectAttempts();
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showToast('خطأ في الاتصال مع ESP32', 'error');
            };
            
        } catch (error) {
            console.error('Failed to connect to ESP:', error);
            this.showToast('فشل الاتصال بـ ESP32 - التبديل للوضع التجريبي', 'warning');
            this.startDemoMode();
        }
    }

    sendToESP(data) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(data));
            return true;
        } else {
            this.showToast('ESP32 غير متصل', 'error');
            return false;
        }
    }

    handleESPMessage(data) {
        switch (data.type) {
            case 'sensor_data':
                this.updateSensorData(data.sensors);
                break;
            case 'robot_status':
                this.updateRobotStatus(data.robot);
                break;
            case 'operation_complete':
                this.handleOperationComplete(data.operation);
                break;
            case 'error':
                this.showToast(`خطأ من ESP32: ${data.message}`, 'error');
                break;
            case 'confirmation':
                this.showToast(`✅ ${data.message}`, 'success');
                break;
            default:
                console.log('Unknown ESP message type:', data);
        }
    }

    startReconnectAttempts() {
        if (this.reconnectInterval) return;
        
        this.reconnectInterval = setInterval(() => {
            if (!this.espConnected) {
                console.log('Attempting to reconnect to ESP...');
                this.connectToESP();
            }
        }, 5000);
    }

    clearReconnectInterval() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
    }

    startDemoMode() {
        this.showToast('🎭 تشغيل الوضع التجريبي', 'info');
        // Simulate ESP data for demo
        setInterval(() => {
            this.simulateESPData();
        }, 3000);
    }

    simulateESPData() {
        // Simulate realistic sensor data
        this.sensors = {
            temperature: 22 + Math.random() * 6,
            humidity: 45 + Math.random() * 20,
            weight: Math.random() * 1000,
            distance: 50 + Math.random() * 200,
            motion: Math.random() > 0.8,
            light: 200 + Math.random() * 800
        };
        
        this.updateSensorDisplays();
    }

    // Robot Control Functions
    moveRobot(direction) {
        const command = {
            command: 'move_robot',
            direction: direction,
            speed: 50
        };
        
        if (this.sendToESP(command)) {
            this.showToast(`تحريك الروبوت: ${this.getDirectionName(direction)}`, 'info');
            this.addMovementAnimation();
        }
    }

    controlGripper(action) {
        const command = {
            command: 'gripper',
            action: action // 'open' or 'close'
        };
        
        if (this.sendToESP(command)) {
            this.robot.gripper = action;
            this.showToast(`${action === 'open' ? 'فتح' : 'إغلاق'} المقبض`, 'success');
        }
    }

    emergencyStop() {
        const command = { command: 'emergency_stop' };
        
        if (this.sendToESP(command)) {
            this.showToast('🛑 إيقاف الطوارئ مفعل', 'warning');
        }
    }

    // Storage Operations
    async storeProduct(productData) {
        this.showToast('🔄 بدء عملية التخزين...', 'info');
        
        const command = {
            command: 'store_product',
            product: productData
        };
        
        if (this.sendToESP(command)) {
            // Add loading state
            const storeBtn = document.getElementById('storeBtn');
            if (storeBtn) {
                storeBtn.disabled = true;
                storeBtn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> جاري التخزين...';
            }
        } else {
            // Fallback to manual storage
            this.handleManualStorage(productData);
        }
    }

    async retrieveProduct(retrieveData) {
        this.showToast('🔄 بدء عملية الاسترجاع...', 'info');
        
        const command = {
            command: 'retrieve_product',
            productId: retrieveData.productId,
            quantity: retrieveData.quantity
        };
        
        if (this.sendToESP(command)) {
            const retrieveBtn = document.getElementById('retrieveBtn');
            if (retrieveBtn) {
                retrieveBtn.disabled = true;
                retrieveBtn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> جاري الاسترجاع...';
            }
        } else {
            this.handleManualRetrieval(retrieveData);
        }
    }

    // Sensor Management
    updateSensorData(sensors) {
        this.sensors = { ...this.sensors, ...sensors };
        this.updateSensorDisplays();
        this.checkAlerts();
    }

    updateSensorDisplays() {
        // Temperature
        const tempElement = document.getElementById('temperature');
        if (tempElement) {
            tempElement.textContent = `${this.sensors.temperature.toFixed(1)}°C`;
            tempElement.className = this.getSensorClass('temperature', this.sensors.temperature);
        }
        
        // Humidity
        const humidityElement = document.getElementById('humidity');
        if (humidityElement) {
            humidityElement.textContent = `${this.sensors.humidity.toFixed(1)}%`;
            humidityElement.className = this.getSensorClass('humidity', this.sensors.humidity);
        }
        
        // Weight
        const weightElement = document.getElementById('currentWeight');
        if (weightElement) {
            weightElement.textContent = `${this.sensors.weight.toFixed(1)} كجم`;
        }
        
        // Distance
        const distanceElement = document.getElementById('distance');
        if (distanceElement) {
            distanceElement.textContent = `${this.sensors.distance.toFixed(0)} سم`;
        }
        
        // Motion
        const motionElement = document.getElementById('motionStatus');
        if (motionElement) {
            motionElement.textContent = this.sensors.motion ? 'حركة مكتشفة' : 'لا توجد حركة';
            motionElement.className = `motion-status ${this.sensors.motion ? 'active' : 'inactive'}`;
        }
        
        // Light
        const lightElement = document.getElementById('lightLevel');
        if (lightElement) {
            lightElement.textContent = `${this.sensors.light.toFixed(0)} lux`;
        }
    }

    getSensorClass(type, value) {
        switch (type) {
            case 'temperature':
                if (value < 15 || value > 30) return 'sensor-alert';
                if (value < 18 || value > 28) return 'sensor-warning';
                return 'sensor-normal';
            case 'humidity':
                if (value < 30 || value > 80) return 'sensor-alert';
                if (value < 40 || value > 70) return 'sensor-warning';
                return 'sensor-normal';
            default:
                return 'sensor-normal';
        }
    }

    checkAlerts() {
        // Temperature alerts
        if (this.sensors.temperature > 30) {
            this.showToast('⚠️ تحذير: درجة الحرارة مرتفعة!', 'warning');
        }
        
        // Humidity alerts
        if (this.sensors.humidity > 80) {
            this.showToast('⚠️ تحذير: الرطوبة عالية!', 'warning');
        }
        
        // Motion detection
        if (this.sensors.motion) {
            this.showToast('👤 تم اكتشاف حركة في المستودع', 'info');
        }
    }

    // UI Management
    setupEventListeners() {
        // Menu navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.switchSection(section);
            });
        });
        
        // Forms
        const storeForm = document.getElementById('storeForm');
        if (storeForm) {
            storeForm.addEventListener('submit', (e) => this.handleStoreForm(e));
        }
        
        const retrieveForm = document.getElementById('retrieveForm');
        if (retrieveForm) {
            retrieveForm.addEventListener('submit', (e) => this.handleRetrieveForm(e));
        }
        
        // Robot controls
        document.querySelectorAll('.dir-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const direction = e.currentTarget.dataset.direction;
                if (direction === 'stop') {
                    this.emergencyStop();
                } else {
                    this.moveRobot(direction);
                }
            });
        });
        
        // ESP IP configuration
        const espConfigBtn = document.getElementById('configESP');
        if (espConfigBtn) {
            espConfigBtn.addEventListener('click', () => this.showESPConfig());
        }
        
        // Connection toggle
        const connectBtn = document.getElementById('connectESP');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.toggleESPConnection());
        }
    }

    switchSection(section) {
        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show selected section
        const targetSection = document.getElementById(`${section}Section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Update page title
        const titles = {
            dashboard: 'لوحة التحكم',
            storage: 'إدارة التخزين',
            inventory: 'المخزون',
            operations: 'سجل العمليات',
            robots: 'التحكم بالروبوت',
            analytics: 'التقارير والإحصائيات',
            settings: 'الإعدادات'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = titles[section] || 'لوحة التحكم';
        }
        
        this.currentSection = section;
        
        // Load section-specific data
        this.loadSectionData(section);
    }

    async loadSectionData(section) {
        switch (section) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'inventory':
                this.loadInventory();
                break;
            case 'operations':
                this.loadOperations();
                break;
            case 'robots':
                this.loadRobotStatus();
                break;
        }
    }

    // Form Handlers
    async handleStoreForm(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const productData = {
            productId: formData.get('productId'),
            productName: formData.get('productName'),
            weight: parseFloat(formData.get('productWeight')),
            quantity: parseInt(formData.get('productQuantity')),
            category: formData.get('category') || 'general'
        };
        
        // Validate
        if (!productData.productId || !productData.productName || !productData.weight || !productData.quantity) {
            this.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }
        
        await this.storeProduct(productData);
    }

    async handleRetrieveForm(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const retrieveData = {
            productId: formData.get('retrieveProductId'),
            quantity: parseInt(formData.get('retrieveQuantity'))
        };
        
        if (!retrieveData.productId || !retrieveData.quantity) {
            this.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }
        
        await this.retrieveProduct(retrieveData);
    }

    // Utility Functions
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const container = document.getElementById('toastContainer') || this.createToastContainer();
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    showLoadingScreen() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'flex';
            
            // Animate progress bar
            const progress = loading.querySelector('.progress');
            if (progress) {
                let width = 0;
                const interval = setInterval(() => {
                    width += Math.random() * 15;
                    progress.style.width = `${Math.min(width, 100)}%`;
                    if (width >= 100) {
                        clearInterval(interval);
                    }
                }, 100);
            }
        }
    }

    hideLoadingScreen() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => {
                loading.style.display = 'none';
            }, 500);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getDirectionName(direction) {
        const names = {
            forward: 'إلى الأمام',
            backward: 'إلى الخلف',
            left: 'يساراً',
            right: 'يميناً',
            up: 'إلى الأعلى',
            down: 'إلى الأسفل'
        };
        return names[direction] || direction;
    }

    updateSystemStatus(status) {
        const indicator = document.getElementById('systemStatus');
        if (indicator) {
            indicator.className = `system-status ${status}`;
            indicator.innerHTML = `
                <i class="fas fa-circle"></i>
                <span>${status === 'online' ? 'متصل' : 'غير متصل'}</span>
            `;
        }
        
        // Update ESP connection indicator
        const espStatus = document.getElementById('espConnectionStatus');
        if (espStatus) {
            espStatus.textContent = status === 'online' ? 'متصل' : 'منقطع';
            espStatus.className = `connection-status ${status}`;
        }
    }

    // Data Loading Functions
    loadDashboardData() {
        // Update stats from sensors and operations
        const stats = {
            totalProducts: this.inventory.length,
            temperature: this.sensors.temperature,
            humidity: this.sensors.humidity,
            todayOperations: this.operations.filter(op => {
                const today = new Date().toDateString();
                return new Date(op.timestamp).toDateString() === today;
            }).length,
            systemUptime: this.calculateUptime()
        };
        
        this.updateDashboardStats(stats);
    }

    loadInventory() {
        // Request inventory from ESP or load from local storage
        if (this.espConnected) {
            this.sendToESP({ command: 'get_inventory' });
        } else {
            this.inventory = JSON.parse(localStorage.getItem('warehouse_inventory') || '[]');
            this.renderInventory();
        }
    }

    loadOperations() {
        // Load operations history
        this.operations = JSON.parse(localStorage.getItem('warehouse_operations') || '[]');
        this.renderOperations();
    }

    loadRobotStatus() {
        // Request robot status from ESP
        if (this.espConnected) {
            this.sendToESP({ command: 'get_robot_status' });
        }
    }

    startPeriodicUpdates() {
        // Update sensor data every 5 seconds
        setInterval(() => {
            if (this.espConnected) {
                this.sendToESP({ command: 'get_sensors' });
            } else {
                this.simulateESPData();
            }
        }, 5000);
        
        // Update dashboard every 30 seconds
        setInterval(() => {
            if (this.currentSection === 'dashboard') {
                this.loadDashboardData();
            }
        }, 30000);
    }

    // ESP Configuration
    showESPConfig() {
        // Create modal for ESP configuration
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🔧 إعدادات ESP32</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>عنوان IP:</label>
                        <input type="text" id="modalESPIP" value="${this.espIP}" 
                               placeholder="192.168.1.100" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>منفذ WebSocket:</label>
                        <input type="number" id="modalESPPort" value="81" 
                               min="1" max="65535" class="form-control">
                    </div>
                    <div class="modal-actions">
                        <button class="btn-secondary" onclick="this.closest('.modal').remove()">
                            إلغاء
                        </button>
                        <button class="btn-primary" onclick="window.warehouseApp.updateESPConfig()">
                            حفظ وإعادة الاتصال
                        </button>
                    </div>
                    <hr style="margin: 1rem 0;">
                    <div class="help-text">
                        <h4>💡 كيفية العثور على عنوان IP:</h4>
                        <ol>
                            <li>افتح Serial Monitor في Arduino IDE</li>
                            <li>اضغط على زر Reset في ESP32</li>
                            <li>ابحث عن رسالة: "WiFi Connected! IP: xxx.xxx.xxx.xxx"</li>
                            <li>انسخ العنوان وألصقه أعلاه</li>
                        </ol>
                        <p><strong>أو</strong> <a href="esp32-config.html" target="_blank">افتح أداة التكوين المتقدمة</a></p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Focus on IP input
        document.getElementById('modalESPIP').focus();
    }

    updateESPConfig() {
        const newIP = document.getElementById('modalESPIP').value.trim();
        const newPort = document.getElementById('modalESPPort').value;
        
        if (!this.validateIP(newIP)) {
            this.showToast('عنوان IP غير صحيح', 'error');
            return;
        }
        
        if (newIP !== this.espIP) {
            this.espIP = newIP;
            localStorage.setItem('esp_ip', newIP);
            localStorage.setItem('esp_port', newPort);
            
            // Update display
            const espDisplay = document.getElementById('espIPDisplay');
            if (espDisplay) {
                espDisplay.textContent = `${newIP}:${newPort}`;
            }
            
            this.showToast(`تم تحديث عنوان ESP إلى: ${newIP}:${newPort}`, 'success');
            
            // Close modal
            document.querySelector('.modal').remove();
            
            // Reconnect if currently connected
            if (this.espConnected) {
                this.websocket.close();
                setTimeout(() => this.connectToESP(), 1000);
            } else {
                this.connectToESP();
            }
        } else {
            document.querySelector('.modal').remove();
        }
    }

    validateIP(ip) {
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipPattern.test(ip)) return false;
        
        const parts = ip.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }

    toggleESPConnection() {
        if (this.espConnected) {
            this.websocket.close();
            this.showToast('تم قطع الاتصال مع ESP32', 'info');
        } else {
            this.connectToESP();
        }
    }

    calculateUptime() {
        // Calculate system uptime (placeholder)
        return '2h 34m';
    }

    updateDashboardStats(stats) {
        // Update dashboard elements with real data
        const elements = {
            'totalProducts': stats.totalProducts,
            'temperature': `${stats.temperature.toFixed(1)}°C`,
            'humidity': `${stats.humidity.toFixed(1)}%`,
            'todayOperations': stats.todayOperations,
            'systemUptime': stats.systemUptime
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    renderInventory() {
        // Render inventory items
        const container = document.getElementById('inventoryContainer');
        if (!container || !this.inventory.length) return;
        
        container.innerHTML = this.inventory.map(item => `
            <div class="inventory-card" data-id="${item.id}">
                <div class="card-header">
                    <span class="product-id">${item.productId}</span>
                    <span class="status ${item.status}">${item.status}</span>
                </div>
                <h3 class="product-name">${item.productName}</h3>
                <div class="product-details">
                    <div class="detail">
                        <i class="fas fa-cubes"></i>
                        <span>الكمية: ${item.quantity}</span>
                    </div>
                    <div class="detail">
                        <i class="fas fa-weight"></i>
                        <span>الوزن: ${item.weight} كجم</span>
                    </div>
                    <div class="detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>الموقع: ${item.location || 'غير محدد'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderOperations() {
        // Render operations table
        const tbody = document.getElementById('operationsTableBody');
        if (!tbody || !this.operations.length) return;
        
        tbody.innerHTML = this.operations.slice(-20).reverse().map(op => `
            <tr>
                <td>${op.id}</td>
                <td>${op.type === 'store' ? 'تخزين' : 'استرجاع'}</td>
                <td>${op.productId}</td>
                <td>${op.quantity}</td>
                <td class="status ${op.status}">${op.status === 'completed' ? 'مكتمل' : 'فاشل'}</td>
                <td>${new Date(op.timestamp).toLocaleString('ar-SA')}</td>
            </tr>
        `).join('');
    }

    // Manual operations (fallback when ESP is not connected)
    handleManualStorage(productData) {
        setTimeout(() => {
            const newItem = {
                id: Date.now(),
                ...productData,
                location: `A-${Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 10)}`,
                status: 'stored',
                timestamp: new Date().toISOString()
            };
            
            this.inventory.push(newItem);
            localStorage.setItem('warehouse_inventory', JSON.stringify(this.inventory));
            
            const operation = {
                id: `OP${Date.now()}`,
                type: 'store',
                productId: productData.productId,
                quantity: productData.quantity,
                status: 'completed',
                timestamp: new Date().toISOString()
            };
            
            this.operations.push(operation);
            localStorage.setItem('warehouse_operations', JSON.stringify(this.operations));
            
            this.showToast(`✅ تم تخزين ${productData.productName} في الموقع ${newItem.location}`, 'success');
            
            // Reset form
            const storeForm = document.getElementById('storeForm');
            if (storeForm) {
                storeForm.reset();
                const storeBtn = document.getElementById('storeBtn');
                if (storeBtn) {
                    storeBtn.disabled = false;
                    storeBtn.innerHTML = '<i class="fas fa-plus"></i> تخزين المنتج';
                }
            }
            
            this.loadDashboardData();
        }, 2000);
    }

    handleManualRetrieval(retrieveData) {
        const itemIndex = this.inventory.findIndex(item => item.productId === retrieveData.productId);
        
        if (itemIndex === -1) {
            this.showToast('المنتج غير موجود في المخزون', 'error');
            return;
        }
        
        const item = this.inventory[itemIndex];
        if (item.quantity < retrieveData.quantity) {
            this.showToast(`الكمية المطلوبة غير متوفرة. المتاح: ${item.quantity}`, 'error');
            return;
        }
        
        setTimeout(() => {
            // Update inventory
            item.quantity -= retrieveData.quantity;
            if (item.quantity === 0) {
                this.inventory.splice(itemIndex, 1);
            }
            
            localStorage.setItem('warehouse_inventory', JSON.stringify(this.inventory));
            
            // Add operation
            const operation = {
                id: `OP${Date.now()}`,
                type: 'retrieve',
                productId: retrieveData.productId,
                quantity: retrieveData.quantity,
                status: 'completed',
                timestamp: new Date().toISOString()
            };
            
            this.operations.push(operation);
            localStorage.setItem('warehouse_operations', JSON.stringify(this.operations));
            
            this.showToast(`✅ تم استرجاع ${retrieveData.quantity} من ${retrieveData.productId}`, 'success');
            
            // Reset form
            const retrieveForm = document.getElementById('retrieveForm');
            if (retrieveForm) {
                retrieveForm.reset();
                const retrieveBtn = document.getElementById('retrieveBtn');
                if (retrieveBtn) {
                    retrieveBtn.disabled = false;
                    retrieveBtn.innerHTML = '<i class="fas fa-minus"></i> استرجاع المنتج';
                }
            }
            
            this.loadDashboardData();
        }, 2000);
    }

    handleOperationComplete(operation) {
        this.operations.push(operation);
        localStorage.setItem('warehouse_operations', JSON.stringify(this.operations));
        
        if (operation.type === 'store') {
            this.inventory.push(operation.item);
            localStorage.setItem('warehouse_inventory', JSON.stringify(this.inventory));
        } else if (operation.type === 'retrieve') {
            const itemIndex = this.inventory.findIndex(item => item.productId === operation.productId);
            if (itemIndex !== -1) {
                this.inventory[itemIndex].quantity -= operation.quantity;
                if (this.inventory[itemIndex].quantity <= 0) {
                    this.inventory.splice(itemIndex, 1);
                }
            }
            localStorage.setItem('warehouse_inventory', JSON.stringify(this.inventory));
        }
        
        this.showToast(`✅ تم إنجاز العملية: ${operation.type}`, 'success');
        
        // Reset form buttons
        this.resetFormButtons();
        this.loadDashboardData();
    }

    resetFormButtons() {
        const storeBtn = document.getElementById('storeBtn');
        if (storeBtn) {
            storeBtn.disabled = false;
            storeBtn.innerHTML = '<i class="fas fa-plus"></i> تخزين المنتج';
        }
        
        const retrieveBtn = document.getElementById('retrieveBtn');
        if (retrieveBtn) {
            retrieveBtn.disabled = false;
            retrieveBtn.innerHTML = '<i class="fas fa-minus"></i> استرجاع المنتج';
        }
    }

    updateRobotStatus(robotData) {
        this.robot = { ...this.robot, ...robotData };
        
        // Update robot status displays
        const elements = {
            'robotBattery': `${this.robot.battery}%`,
            'robotStatus': this.robot.status,
            'robotPosition': `X:${this.robot.position.x} Y:${this.robot.position.y} Z:${this.robot.position.z}`,
            'gripperStatus': this.robot.gripper === 'open' ? 'مفتوح' : 'مغلق'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    addMovementAnimation() {
        const robotSection = document.getElementById('robotsSection');
        if (robotSection) {
            robotSection.classList.add('robot-moving');
            setTimeout(() => {
                robotSection.classList.remove('robot-moving');
            }, 1000);
        }
    }
}

// Quick action functions (called from HTML)
function quickAction(action) {
    if (!window.warehouseApp) return;
    
    switch (action) {
        case 'scan':
            window.warehouseApp.sendToESP({ command: 'scan_product' });
            window.warehouseApp.showToast('🔍 بدء مسح المنتج...', 'info');
            break;
        case 'home':
            window.warehouseApp.sendToESP({ command: 'go_home' });
            window.warehouseApp.showToast('🏠 العودة للموضع الافتراضي...', 'info');
            break;
        case 'emergency':
            window.warehouseApp.emergencyStop();
            break;
        case 'calibrate':
            window.warehouseApp.sendToESP({ command: 'calibrate' });
            window.warehouseApp.showToast('⚙️ بدء المعايرة...', 'info');
            break;
    }
}

function controlGripper(action) {
    if (window.warehouseApp) {
        window.warehouseApp.controlGripper(action);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Load saved ESP IP if available
    const savedIP = localStorage.getItem('esp_ip');
    if (savedIP) {
        window.espIP = savedIP;
    }
    
    // Initialize the main application
    window.warehouseApp = new SmartWarehouseApp();
    
    console.log('🚀 Smart Warehouse IoT System Ready!');
});
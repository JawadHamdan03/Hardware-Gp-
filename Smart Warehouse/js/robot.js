// Robot Control System for Smart Warehouse
class RobotController {
    constructor() {
        this.robotStatus = {
            arm: 'online',
            vision: 'online',
            sensors: 'online',
            connection: 'online'
        };
        this.isMoving = false;
        this.currentPosition = { x: 0, y: 0, z: 0 };
        this.initializeRobotControl();
    }

    initializeRobotControl() {
        this.setupDirectionControls();
        this.updateRobotStatus();
        this.startStatusMonitoring();
    }

    setupDirectionControls() {
        document.querySelectorAll('.dir-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const direction = e.currentTarget.dataset.direction;
                this.handleDirectionControl(direction);
            });
        });

        // Add touch and hold functionality for mobile
        document.querySelectorAll('.dir-btn').forEach(btn => {
            let pressTimer;
            
            btn.addEventListener('mousedown', (e) => {
                const direction = e.currentTarget.dataset.direction;
                pressTimer = setTimeout(() => {
                    this.startContinuousMovement(direction);
                }, 100);
            });

            btn.addEventListener('mouseup', () => {
                clearTimeout(pressTimer);
                this.stopMovement();
            });

            btn.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
                this.stopMovement();
            });
        });
    }

    handleDirectionControl(direction) {
        if (this.robotStatus.connection !== 'online') {
            this.showRobotAlert('الروبوت غير متصل', 'error');
            return;
        }

        switch (direction) {
            case 'forward':
                this.moveRobot(0, 1, 0);
                break;
            case 'backward':
                this.moveRobot(0, -1, 0);
                break;
            case 'left':
                this.moveRobot(-1, 0, 0);
                break;
            case 'right':
                this.moveRobot(1, 0, 0);
                break;
            case 'stop':
                this.emergencyStop();
                break;
        }
    }

    moveRobot(x, y, z) {
        if (this.isMoving) return;

        this.isMoving = true;
        this.currentPosition.x += x;
        this.currentPosition.y += y;
        this.currentPosition.z += z;

        // Simulate robot movement
        this.showRobotAlert(`تحريك الروبوت إلى (${this.currentPosition.x}, ${this.currentPosition.y})`, 'info');

        // Add visual feedback
        this.addMovementAnimation();

        setTimeout(() => {
            this.isMoving = false;
        }, 1000);
    }

    startContinuousMovement(direction) {
        this.continuousMovement = setInterval(() => {
            this.handleDirectionControl(direction);
        }, 200);
    }

    stopMovement() {
        if (this.continuousMovement) {
            clearInterval(this.continuousMovement);
            this.continuousMovement = null;
        }
    }

    emergencyStop() {
        this.stopMovement();
        this.isMoving = false;
        this.showRobotAlert('تم إيقاف الروبوت في حالات الطوارئ', 'warning');
    }

    controlGripper(action) {
        if (this.robotStatus.arm !== 'online') {
            this.showRobotAlert('ذراع الروبوت غير متاح', 'error');
            return;
        }

        const gripperBtn = document.querySelector(`.grip-btn.${action}`);
        gripperBtn.classList.add('active');

        if (action === 'open') {
            this.showRobotAlert('تم فتح المقبض', 'success');
        } else if (action === 'close') {
            this.showRobotAlert('تم إغلاق المقبض', 'success');
        }

        setTimeout(() => {
            gripperBtn.classList.remove('active');
        }, 500);
    }

    updateRobotStatus() {
        document.getElementById('armStatus').textContent = 
            this.robotStatus.arm === 'online' ? 'يعمل' : 'معطل';
        document.getElementById('visionStatus').textContent = 
            this.robotStatus.vision === 'online' ? 'نشط' : 'معطل';
        document.getElementById('sensorsStatus').textContent = 
            this.robotStatus.sensors === 'online' ? 'نشطة' : 'معطلة';
        document.getElementById('connectionStatus').textContent = 
            this.robotStatus.connection === 'online' ? 'متصل' : 'منقطع';

        // Update status indicators
        document.querySelectorAll('.status-value').forEach(el => {
            const status = el.textContent.includes('يعمل') || 
                          el.textContent.includes('نشط') || 
                          el.textContent.includes('متصل') ? 'online' : 'offline';
            el.className = `status-value ${status}`;
        });
    }

    startStatusMonitoring() {
        // Simulate random status changes for demo
        setInterval(() => {
            // Rarely simulate disconnection (5% chance)
            if (Math.random() < 0.05) {
                this.robotStatus.connection = 'offline';
                setTimeout(() => {
                    this.robotStatus.connection = 'online';
                    this.updateRobotStatus();
                }, 2000);
            }
            this.updateRobotStatus();
        }, 10000);
    }

    startCamera() {
        const cameraFeed = document.querySelector('.camera-feed');
        const placeholder = document.querySelector('.camera-placeholder');
        
        // Simulate camera activation
        placeholder.innerHTML = `
            <div class="camera-active">
                <div class="camera-grid">
                    <div class="grid-line"></div>
                    <div class="grid-line"></div>
                    <div class="grid-line"></div>
                    <div class="grid-line"></div>
                </div>
                <div class="camera-info">
                    <span class="camera-status">🔴 البث مباشر</span>
                    <span class="camera-resolution">1920x1080</span>
                </div>
            </div>
        `;

        this.showRobotAlert('تم تشغيل البث المباشر', 'success');
    }

    addMovementAnimation() {
        const robotCards = document.querySelectorAll('.robot-status-card, .manual-control-card');
        robotCards.forEach(card => {
            card.style.transform = 'scale(1.02)';
            setTimeout(() => {
                card.style.transform = 'scale(1)';
            }, 200);
        });
    }

    showRobotAlert(message, type) {
        // Use the main app's toast system if available
        if (window.warehouseApp && window.warehouseApp.showToast) {
            window.warehouseApp.showToast(message, type);
        } else {
            // Fallback alert
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Quick Actions Functions
function quickAction(action) {
    if (!window.robotController) {
        window.robotController = new RobotController();
    }

    switch (action) {
        case 'scan':
            window.robotController.showRobotAlert('بدء مسح المنتج...', 'info');
            break;
        case 'home':
            window.robotController.currentPosition = { x: 0, y: 0, z: 0 };
            window.robotController.showRobotAlert('العودة إلى الوضع الافتراضي', 'success');
            break;
        case 'emergency':
            window.robotController.emergencyStop();
            break;
        case 'status':
            window.robotController.updateRobotStatus();
            window.robotController.showRobotAlert('تم فحص حالة النظام', 'info');
            break;
    }
}

// Gripper Control Functions
function controlGripper(action) {
    if (!window.robotController) {
        window.robotController = new RobotController();
    }
    window.robotController.controlGripper(action);
}

// Camera Control Functions
function startCamera() {
    if (!window.robotController) {
        window.robotController = new RobotController();
    }
    window.robotController.startCamera();
}

// Initialize Robot Controller
document.addEventListener('DOMContentLoaded', function() {
    window.robotController = new RobotController();
});

-- Enhanced Database Schema for Smart Warehouse with IR Sensors & Loading Zone
DROP DATABASE IF EXISTS smart_warehouse;
CREATE DATABASE IF NOT EXISTS smart_warehouse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_warehouse;

-- ========== ADMIN USERS ==========
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========== CELLS WITH IR SENSORS (3 rows x 4 columns) ==========
CREATE TABLE cells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_num INT NOT NULL CHECK (row_num BETWEEN 1 AND 3),
    col_num INT NOT NULL CHECK (col_num BETWEEN 1 AND 4),
    label VARCHAR(50) NOT NULL,
    ir_sensor_pin INT NOT NULL,
    status ENUM('EMPTY', 'OCCUPIED', 'RESERVED', 'MAINTENANCE') DEFAULT 'EMPTY',
    product_id INT NULL,
    quantity INT DEFAULT 0,
    last_sensor_check TIMESTAMP NULL,
    sensor_status ENUM('ACTIVE', 'INACTIVE', 'ERROR') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE (row_num, col_num),
    UNIQUE (ir_sensor_pin),
    INDEX idx_status (status),
    INDEX idx_product (product_id),
    INDEX idx_sensor (sensor_status)
);

-- ========== PRODUCTS WITH STORAGE STRATEGY ==========
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(100) NULL,
    rfid_uid VARCHAR(100) UNIQUE NULL,
    weight_grams INT NULL,
    category VARCHAR(50) NULL,
    auto_assign BOOLEAN DEFAULT TRUE,
    storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
    fixed_row INT NULL,
    fixed_col INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sku (sku),
    INDEX idx_rfid (rfid_uid),
    INDEX idx_strategy (storage_strategy)
);

-- ========== OPERATIONS WITH IMPROVED TRACKING ==========
CREATE TABLE operations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    op_type ENUM(
        'HOME',
        'PICK_FROM_CONVEYOR',
        'PLACE_IN_CELL',
        'TAKE_FROM_CELL',
        'GOTO_COLUMN',
        'MANUAL_CMD',
        'MOVE_TO_LOADING',
        'RETURN_TO_LOADING',
        'AUTO_STOCK',
        'AUTO_RETRIEVE',
        'INVENTORY_CHECK',
        'LOADING_ZONE_OPERATION',
        'CONVEYOR_MANUAL',
        'SENSOR_CHECK',
        'STRATEGY_CHANGE'
    ) NOT NULL,
    product_id INT NULL,
    cell_id INT NULL,
    cmd VARCHAR(100) NOT NULL,
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'ERROR', 'CANCELLED') DEFAULT 'PENDING',
    error_message VARCHAR(255) NULL,
    execution_time_ms INT NULL,
    priority ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'MEDIUM',
    storage_strategy VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_op_type (op_type),
    INDEX idx_priority (priority),
    INDEX idx_created (created_at)
);

-- ========== LOADING ZONE WITH ULTRASONIC & SERVO ==========
CREATE TABLE loading_zone (
    id INT PRIMARY KEY DEFAULT 1,
    product_id INT NULL,
    quantity INT DEFAULT 0,
    ultrasonic_distance INT NULL,
    servo_position INT DEFAULT 90,
    status ENUM('EMPTY', 'OCCUPIED', 'PROCESSING') DEFAULT 'EMPTY',
    last_checked TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    INDEX idx_status (status)
);

-- ========== AUTO TASK QUEUE WITH STORAGE STRATEGY ==========
CREATE TABLE auto_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_type ENUM('STOCK', 'RETRIEVE', 'MOVE', 'ORGANIZE', 'INVENTORY_CHECK', 'LOADING_ZONE_OP') NOT NULL,
    cell_id INT NULL,
    product_id INT NULL,
    product_rfid VARCHAR(100) NULL,
    quantity INT DEFAULT 1,
    priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
    storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
    parameters JSON NULL,
    scheduled_at TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    error_message VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    INDEX idx_task_status (status),
    INDEX idx_priority_scheduled (priority, scheduled_at),
    INDEX idx_strategy (storage_strategy)
);

-- ========== CONVEYOR BELT STATUS ==========
CREATE TABLE conveyor_status (
    id INT PRIMARY KEY DEFAULT 1,
    has_product BOOLEAN DEFAULT FALSE,
    product_id INT NULL,
    product_rfid VARCHAR(100) NULL,
    mode ENUM('AUTO', 'MANUAL') DEFAULT 'AUTO',
    state ENUM('IDLE', 'MOVE_12CM', 'WAIT_RFID', 'MOVING_TO_LDR2', 'STOPPED', 'MANUAL_MODE') DEFAULT 'IDLE',
    last_detected_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ========== SENSOR EVENTS (IR, LDR, RFID, ULTRASONIC) ==========
CREATE TABLE sensor_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source ENUM('IR_SENSOR', 'LDR1', 'LDR2', 'RFID', 'ULTRASONIC', 'LIMIT_SWITCH') NOT NULL,
    sensor_pin INT NULL,
    cell_id INT NULL,
    value VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NULL,
    status ENUM('TRIGGERED', 'CLEARED', 'ERROR') DEFAULT 'TRIGGERED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_source_created (source, created_at),
    INDEX idx_cell (cell_id),
    INDEX idx_sensor (sensor_pin),
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL
);

-- ========== SYSTEM SETTINGS ==========
CREATE TABLE system_settings (
    id INT PRIMARY KEY DEFAULT 1,
    storage_strategy ENUM('NEAREST_EMPTY', 'ROUND_ROBIN', 'RANDOM', 'AI_OPTIMIZED', 'FIXED') DEFAULT 'NEAREST_EMPTY',
    auto_mode BOOLEAN DEFAULT FALSE,
    conveyor_manual_control BOOLEAN DEFAULT FALSE,
    loading_zone_auto_close BOOLEAN DEFAULT TRUE,
    ir_sensor_auto_update BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ========== INVENTORY HISTORY ==========
CREATE TABLE inventory_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cell_id INT NULL,
    product_id INT NULL,
    operation_type ENUM('STOCK_IN', 'STOCK_OUT', 'MOVE', 'ADJUST') NOT NULL,
    quantity_before INT NOT NULL,
    quantity_after INT NOT NULL,
    change_amount INT NOT NULL,
    operation_id INT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE SET NULL,
    INDEX idx_cell_product (cell_id, product_id),
    INDEX idx_created (created_at)
);

-- ========== IR SENSOR CALIBRATION ==========
CREATE TABLE sensor_calibration (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_pin INT NOT NULL UNIQUE,
    cell_id INT NOT NULL,
    trigger_threshold INT DEFAULT 500,
    calibration_value INT DEFAULT 0,
    last_calibrated TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE
);

-- ========== INITIALIZE DATA ==========

-- Admin user
INSERT INTO admins (username, password_hash) 
VALUES ('admin', '$2y$10$exampleexampleexampleexampleexampleexampleex');

-- Initialize cells with IR sensor pins (3 rows x 4 columns)
INSERT INTO cells (row_num, col_num, label, ir_sensor_pin) VALUES
-- Row 1
(1, 1, 'R1C1', 53),
(1, 2, 'R1C2', 31),
(1, 3, 'R1C3', 23),
(1, 4, 'R1C4', 30),
-- Row 2
(2, 1, 'R2C1', 52),
(2, 2, 'R2C2', 32),
(2, 3, 'R2C3', 33),
(2, 4, 'R2C4', 34),
-- Row 3
(3, 1, 'R3C1', 35),
(3, 2, 'R3C2', 25),
(3, 3, 'R3C3', 40),
(3, 4, 'R3C4', 22);

-- Initialize loading zone
INSERT INTO loading_zone (id, product_id, quantity, ultrasonic_distance, servo_position, status) 
VALUES (1, NULL, 0, NULL, 90, 'EMPTY');

-- Initialize conveyor status
INSERT INTO conveyor_status (id, has_product, product_id, mode, state) 
VALUES (1, FALSE, NULL, 'MANUAL', 'IDLE');

-- Initialize system settings
INSERT INTO system_settings (id, storage_strategy, auto_mode, conveyor_manual_control) 
VALUES (1, 'NEAREST_EMPTY', FALSE, FALSE);

-- Sample products
INSERT INTO products (name, sku, rfid_uid, category, storage_strategy) VALUES
('Product A', 'PROD-A-001', '12.80.110.3', 'Electronics', 'NEAREST_EMPTY'),
('Product B', 'PROD-B-001', '178.139.221.208', 'Tools', 'ROUND_ROBIN'),
('Product C', 'PROD-C-001', '204.187.101.3', 'Components', 'RANDOM'),
('Product D', 'PROD-D-001', '12.86.101.3', 'Materials', 'AI_OPTIMIZED'),
('Product E', 'PROD-E-001', '66.208.30.83', 'Electronics', 'FIXED'),
('Product F', 'PROD-F-001', '252.53.92.3', 'Tools', 'NEAREST_EMPTY');

-- Initialize sensor calibration
INSERT INTO sensor_calibration (sensor_pin, cell_id, trigger_threshold, calibration_value) VALUES
(53, 1, 500, 0), (31, 2, 500, 0), (23, 3, 500, 0), (30, 4, 500, 0),
(52, 5, 500, 0), (32, 6, 500, 0), (33, 7, 500, 0), (34, 8, 500, 0),
(35, 9, 500, 0), (25, 10, 500, 0), (40, 11, 500, 0), (22, 12, 500, 0);

-- ========== VIEWS FOR REPORTING ==========

CREATE VIEW warehouse_current_status AS
SELECT 
    c.id,
    c.label,
    c.row_num,
    c.col_num,
    c.ir_sensor_pin,
    c.status,
    c.product_id,
    p.name as product_name,
    p.sku,
    c.quantity,
    p.rfid_uid,
    p.storage_strategy,
    c.last_sensor_check,
    c.sensor_status,
    c.updated_at
FROM cells c
LEFT JOIN products p ON c.product_id = p.id
ORDER BY c.row_num, c.col_num;

CREATE VIEW auto_task_queue AS
SELECT 
    t.*,
    c.label as cell_label,
    p.name as product_name,
    p.rfid_uid,
    CASE 
        WHEN t.status = 'PENDING' AND t.priority = 'URGENT' THEN 1
        WHEN t.status = 'PENDING' AND t.priority = 'HIGH' THEN 2
        WHEN t.status = 'PENDING' AND t.priority = 'MEDIUM' THEN 3
        WHEN t.status = 'PENDING' AND t.priority = 'LOW' THEN 4
        ELSE 5
    END as execution_order
FROM auto_tasks t
LEFT JOIN cells c ON t.cell_id = c.id
LEFT JOIN products p ON t.product_id = p.id
WHERE t.status IN ('PENDING', 'PROCESSING')
ORDER BY execution_order, t.created_at;

CREATE VIEW sensor_status_view AS
SELECT 
    c.id as cell_id,
    c.label,
    c.row_num,
    c.col_num,
    c.ir_sensor_pin,
    c.status as cell_status,
    c.sensor_status,
    c.last_sensor_check,
    sc.trigger_threshold,
    sc.calibration_value,
    sc.is_active,
    (SELECT status FROM sensor_events 
     WHERE sensor_pin = c.ir_sensor_pin 
     ORDER BY created_at DESC LIMIT 1) as last_event_status,
    (SELECT created_at FROM sensor_events 
     WHERE sensor_pin = c.ir_sensor_pin 
     ORDER BY created_at DESC LIMIT 1) as last_event_time
FROM cells c
LEFT JOIN sensor_calibration sc ON c.ir_sensor_pin = sc.sensor_pin
ORDER BY c.row_num, c.col_num;

CREATE VIEW warehouse_stats AS
SELECT 
    (SELECT COUNT(*) FROM cells) as total_cells,
    (SELECT COUNT(*) FROM cells WHERE status = 'OCCUPIED') as occupied_cells,
    (SELECT COUNT(*) FROM cells WHERE status = 'EMPTY') as empty_cells,
    (SELECT COUNT(*) FROM cells WHERE sensor_status = 'ACTIVE') as active_sensors,
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COUNT(*) FROM auto_tasks WHERE status = 'PENDING') as pending_tasks,
    (SELECT status FROM loading_zone WHERE id = 1) as loading_zone_status,
    (SELECT storage_strategy FROM system_settings WHERE id = 1) as current_strategy,
    (SELECT mode FROM conveyor_status WHERE id = 1) as conveyor_mode,
    NOW() as timestamp;

-- ========== STORED PROCEDURES ==========

DELIMITER //

-- Process Auto Stock with Strategy
CREATE PROCEDURE ProcessAutoStockWithStrategy(
    IN rfid_tag VARCHAR(100),
    IN strategy VARCHAR(50)
)
BEGIN
    DECLARE productId INT;
    DECLARE targetCellId INT;
    DECLARE targetRow INT;
    DECLARE targetCol INT;
    DECLARE fixedRow INT;
    DECLARE fixedCol INT;
    
    -- Find product by RFID
    SELECT id, fixed_row, fixed_col INTO productId, fixedRow, fixedCol 
    FROM products WHERE rfid_uid = rfid_tag LIMIT 1;
    
    IF productId IS NOT NULL THEN
        -- Determine target cell based on strategy
        CASE strategy
            WHEN 'FIXED' THEN
                -- Use fixed mapping
                IF fixedRow IS NOT NULL AND fixedCol IS NOT NULL THEN
                    SELECT id INTO targetCellId 
                    FROM cells 
                    WHERE row_num = fixedRow AND col_num = fixedCol 
                    AND status = 'EMPTY';
                END IF;
            
            WHEN 'NEAREST_EMPTY' THEN
                -- Find nearest empty cell (top-left first)
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE status = 'EMPTY' 
                ORDER BY row_num, col_num 
                LIMIT 1;
            
            WHEN 'ROUND_ROBIN' THEN
                -- Round robin: find next empty cell
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE status = 'EMPTY' 
                ORDER BY 
                    (row_num + col_num) % 4,
                    row_num, col_num 
                LIMIT 1;
            
            WHEN 'RANDOM' THEN
                -- Random empty cell
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE status = 'EMPTY' 
                ORDER BY RAND() 
                LIMIT 1;
            
            WHEN 'AI_OPTIMIZED' THEN
                -- AI optimized: find cell that minimizes travel distance
                -- For now, use nearest to conveyor (column 1)
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE status = 'EMPTY' 
                ORDER BY ABS(col_num - 1), row_num 
                LIMIT 1;
            
            ELSE
                -- Default to nearest empty
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE status = 'EMPTY' 
                ORDER BY row_num, col_num 
                LIMIT 1;
        END CASE;
        
        IF targetCellId IS NOT NULL THEN
            -- Update cell status
            UPDATE cells 
            SET status = 'OCCUPIED', 
                product_id = productId, 
                quantity = 1,
                updated_at = NOW()
            WHERE id = targetCellId;
            
            -- Update conveyor status
            UPDATE conveyor_status 
            SET has_product = FALSE, 
                product_id = NULL,
                product_rfid = NULL,
                updated_at = NOW()
            WHERE id = 1;
            
            -- Get cell info for response
            SELECT row_num, col_num INTO targetRow, targetCol 
            FROM cells WHERE id = targetCellId;
            
            -- Log operation
            INSERT INTO operations (op_type, cmd, product_id, cell_id, status, storage_strategy)
            VALUES ('AUTO_STOCK', CONCAT('AUTO_STOCK:', rfid_tag), productId, targetCellId, 'COMPLETED', strategy);
            
            -- Log inventory history
            INSERT INTO inventory_history (cell_id, product_id, operation_type, quantity_before, quantity_after, change_amount)
            VALUES (targetCellId, productId, 'STOCK_IN', 0, 1, 1);
            
            SELECT CONCAT('SUCCESS: Product stocked in cell R', targetRow, 'C', targetCol) as result;
        ELSE
            SELECT 'ERROR: No empty cells available' as result;
        END IF;
    ELSE
        SELECT 'ERROR: Product not found for RFID' as result;
    END IF;
END//

-- Update Cell Status from IR Sensor
CREATE PROCEDURE UpdateCellFromIRSensor(
    IN sensorPin INT,
    IN isOccupied BOOLEAN
)
BEGIN
    DECLARE cellId INT;
    DECLARE currentStatus VARCHAR(20);
    
    -- Find cell by sensor pin
    SELECT id, status INTO cellId, currentStatus 
    FROM cells 
    WHERE ir_sensor_pin = sensorPin;
    
    IF cellId IS NOT NULL THEN
        -- Only update if status changed
        IF (isOccupied AND currentStatus != 'OCCUPIED') OR 
           (NOT isOccupied AND currentStatus = 'OCCUPIED') THEN
            
            UPDATE cells 
            SET status = CASE WHEN isOccupied THEN 'OCCUPIED' ELSE 'EMPTY' END,
                product_id = CASE WHEN NOT isOccupied THEN NULL ELSE product_id END,
                quantity = CASE WHEN NOT isOccupied THEN 0 ELSE quantity END,
                last_sensor_check = NOW(),
                updated_at = NOW()
            WHERE id = cellId;
            
            -- Log sensor event
            INSERT INTO sensor_events (source, sensor_pin, cell_id, value, status)
            VALUES ('IR_SENSOR', sensorPin, cellId, 
                    CASE WHEN isOccupied THEN 'OCCUPIED' ELSE 'EMPTY' END,
                    CASE WHEN isOccupied THEN 'TRIGGERED' ELSE 'CLEARED' END);
            
            -- Log inventory change if product was in cell
            IF NOT isOccupied AND currentStatus = 'OCCUPIED' THEN
                INSERT INTO inventory_history (cell_id, product_id, operation_type, quantity_before, quantity_after, change_amount)
                SELECT cellId, product_id, 'STOCK_OUT', quantity, 0, -quantity
                FROM cells WHERE id = cellId;
            END IF;
            
            SELECT CONCAT('UPDATED: Cell ', cellId, ' set to ', 
                         CASE WHEN isOccupied THEN 'OCCUPIED' ELSE 'EMPTY' END) as result;
        ELSE
            SELECT 'NO_CHANGE: Cell status unchanged' as result;
        END IF;
    ELSE
        SELECT 'ERROR: Cell not found for sensor pin' as result;
    END IF;
END//

-- Get Empty Cell by Strategy
CREATE PROCEDURE GetEmptyCellByStrategy(
    IN strategy VARCHAR(50),
    IN productId INT
)
BEGIN
    DECLARE targetCellId INT;
    DECLARE fixedRow INT;
    DECLARE fixedCol INT;
    
    -- Get fixed mapping if product has it
    IF strategy = 'FIXED' AND productId IS NOT NULL THEN
        SELECT fixed_row, fixed_col INTO fixedRow, fixedCol 
        FROM products WHERE id = productId;
    END IF;
    
    CASE strategy
        WHEN 'FIXED' THEN
            IF fixedRow IS NOT NULL AND fixedCol IS NOT NULL THEN
                SELECT id INTO targetCellId 
                FROM cells 
                WHERE row_num = fixedRow AND col_num = fixedCol 
                AND status = 'EMPTY';
            END IF;
        
        WHEN 'NEAREST_EMPTY' THEN
            SELECT id INTO targetCellId 
            FROM cells 
            WHERE status = 'EMPTY' 
            ORDER BY row_num, col_num 
            LIMIT 1;
        
        WHEN 'ROUND_ROBIN' THEN
            SELECT id INTO targetCellId 
            FROM cells 
            WHERE status = 'EMPTY' 
            ORDER BY 
                (row_num + col_num) % 4,
                row_num, col_num 
            LIMIT 1;
        
        WHEN 'RANDOM' THEN
            SELECT id INTO targetCellId 
            FROM cells 
            WHERE status = 'EMPTY' 
            ORDER BY RAND() 
            LIMIT 1;
        
        WHEN 'AI_OPTIMIZED' THEN
            -- Prefer cells closer to the arm's home position
            SELECT id INTO targetCellId 
            FROM cells 
            WHERE status = 'EMPTY' 
            ORDER BY 
                CASE 
                    WHEN row_num = 1 THEN 1
                    WHEN row_num = 2 THEN 2
                    WHEN row_num = 3 THEN 3
                    ELSE 4
                END,
                ABS(col_num - 2)  -- Prefer center columns
            LIMIT 1;
        
        ELSE
            SELECT id INTO targetCellId 
            FROM cells 
            WHERE status = 'EMPTY' 
            ORDER BY row_num, col_num 
            LIMIT 1;
    END CASE;
    
    IF targetCellId IS NOT NULL THEN
        SELECT 
            c.id,
            c.label,
            c.row_num,
            c.col_num,
            c.ir_sensor_pin,
            strategy as selected_strategy
        FROM cells c
        WHERE c.id = targetCellId;
    ELSE
        SELECT NULL as id, 'NO_EMPTY_CELLS' as label;
    END IF;
END//

-- Update Loading Zone Status
CREATE PROCEDURE UpdateLoadingZoneStatus(
    IN distance INT,
    IN servoPos INT
)
BEGIN
    DECLARE currentStatus VARCHAR(20);
    DECLARE newStatus VARCHAR(20);
    DECLARE isOccupied BOOLEAN;
    
    -- Determine if occupied (distance < 10cm)
    SET isOccupied = (distance > 0 AND distance < 10);
    SET newStatus = CASE WHEN isOccupied THEN 'OCCUPIED' ELSE 'EMPTY' END;
    
    -- Get current status
    SELECT status INTO currentStatus FROM loading_zone WHERE id = 1;
    
    -- Update loading zone
    UPDATE loading_zone 
    SET ultrasonic_distance = distance,
        servo_position = servoPos,
        status = newStatus,
        last_checked = NOW(),
        updated_at = NOW()
    WHERE id = 1;
    
    -- Log sensor event if status changed
    IF currentStatus != newStatus THEN
        INSERT INTO sensor_events (source, value, status)
        VALUES ('ULTRASONIC', CONCAT(distance, ' cm'), 
                CASE WHEN isOccupied THEN 'TRIGGERED' ELSE 'CLEARED' END);
        
        SELECT CONCAT('STATUS_CHANGED: Loading zone is now ', newStatus) as result;
    ELSE
        SELECT CONCAT('STATUS_UNCHANGED: Loading zone is ', newStatus) as result;
    END IF;
END//

-- Get Warehouse Dashboard Data
CREATE PROCEDURE GetWarehouseDashboard()
BEGIN
    -- Cells summary
    SELECT 
        'cells' as category,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'EMPTY' THEN 1 ELSE 0 END) as empty,
        SUM(CASE WHEN sensor_status = 'ACTIVE' THEN 1 ELSE 0 END) as active_sensors
    FROM cells
    UNION ALL
    
    -- Products summary
    SELECT 
        'products' as category,
        COUNT(*) as total,
        NULL as occupied,
        NULL as empty,
        COUNT(DISTINCT category) as active_sensors
    FROM products
    UNION ALL
    
    -- Loading zone status
    SELECT 
        'loading_zone' as category,
        CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END as total,
        NULL as occupied,
        NULL as empty,
        ultrasonic_distance as active_sensors
    FROM loading_zone WHERE id = 1
    UNION ALL
    
    -- Pending tasks
    SELECT 
        'pending_tasks' as category,
        COUNT(*) as total,
        SUM(CASE WHEN priority = 'URGENT' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN priority = 'HIGH' THEN 1 ELSE 0 END) as empty,
        SUM(CASE WHEN priority = 'MEDIUM' THEN 1 ELSE 0 END) as active_sensors
    FROM auto_tasks WHERE status = 'PENDING'
    UNION ALL
    
    -- Recent sensor activity
    SELECT 
        'recent_activity' as category,
        COUNT(*) as total,
        SUM(CASE WHEN source = 'IR_SENSOR' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN source = 'ULTRASONIC' THEN 1 ELSE 0 END) as empty,
        TIMESTAMPDIFF(MINUTE, MIN(created_at), NOW()) as active_sensors
    FROM sensor_events 
    WHERE created_at >= NOW() - INTERVAL 1 HOUR;
END//

DELIMITER ;

-- ========== TRIGGERS ==========

-- Trigger to update timestamp when cell status changes
DELIMITER //
CREATE TRIGGER cell_status_update_trigger 
AFTER UPDATE ON cells
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO sensor_events (source, sensor_pin, cell_id, value, status)
        VALUES ('IR_SENSOR', NEW.ir_sensor_pin, NEW.id, 
                CONCAT('Status changed from ', OLD.status, ' to ', NEW.status),
                'TRIGGERED');
    END IF;
END//
DELIMITER ;

-- Trigger to log inventory changes
DELIMITER //
CREATE TRIGGER inventory_change_trigger 
AFTER UPDATE ON cells
FOR EACH ROW
BEGIN
    IF OLD.quantity != NEW.quantity OR OLD.product_id != NEW.product_id THEN
        INSERT INTO inventory_history (cell_id, product_id, operation_type, 
                                      quantity_before, quantity_after, change_amount)
        VALUES (
            NEW.id,
            NEW.product_id,
            CASE 
                WHEN NEW.quantity > OLD.quantity THEN 'STOCK_IN'
                WHEN NEW.quantity < OLD.quantity THEN 'STOCK_OUT'
                WHEN OLD.product_id IS NOT NULL AND NEW.product_id IS NULL THEN 'STOCK_OUT'
                WHEN OLD.product_id IS NULL AND NEW.product_id IS NOT NULL THEN 'STOCK_IN'
                ELSE 'ADJUST'
            END,
            OLD.quantity,
            NEW.quantity,
            NEW.quantity - OLD.quantity
        );
    END IF;
END//
DELIMITER ;

-- Trigger to auto-close loading zone when empty
DELIMITER //
CREATE TRIGGER loading_zone_auto_close 
AFTER UPDATE ON loading_zone
FOR EACH ROW
BEGIN
    DECLARE auto_close BOOLEAN;
    
    SELECT loading_zone_auto_close INTO auto_close 
    FROM system_settings WHERE id = 1;
    
    IF auto_close AND NEW.status = 'EMPTY' AND NEW.servo_position != 90 THEN
        UPDATE loading_zone 
        SET servo_position = 90,
            updated_at = NOW()
        WHERE id = 1;
    END IF;
END//
DELIMITER ;

-- Create indexes for performance
CREATE INDEX idx_sensor_events_time ON sensor_events(created_at);
CREATE INDEX idx_inventory_cell_time ON inventory_history(cell_id, created_at);
CREATE INDEX idx_operations_time ON operations(created_at);
CREATE INDEX idx_cells_status ON cells(status, sensor_status);
CREATE INDEX idx_products_rfid_strategy ON products(rfid_uid, storage_strategy);

-- Add comments to tables
ALTER TABLE cells COMMENT = 'Warehouse cells with IR sensor pins (3x4 grid)';
ALTER TABLE loading_zone COMMENT = 'Loading zone with ultrasonic sensor and servo control';
ALTER TABLE system_settings COMMENT = 'System configuration and storage strategies';
ALTER TABLE sensor_events COMMENT = 'Log of all sensor events (IR, LDR, RFID, Ultrasonic)';

-- Final initialization message
SELECT 'Database initialized successfully with IR sensors and loading zone support' as message;
// app.js

const apiBase = ""; // same origin (http://localhost:3000)

// DOM refs
const cellsGridEl = document.getElementById("cells-grid");
const cellSelectEl = document.getElementById("cell-select");
const productSelectEl = document.getElementById("product-select");
const opsTableBodyEl = document.querySelector("#ops-table tbody");
const esp32StatusEl = document.getElementById("esp32-status");

async function apiGet(path) {
  const res = await fetch(apiBase + path);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(apiBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${text}`);
  }
  return res.json();
}

// ======== LOAD INITIAL DATA ========

async function loadCells() {
  const cells = await apiGet("/api/cells");

  cellsGridEl.innerHTML = "";
  cellSelectEl.innerHTML = "";

  cells.forEach((c) => {
    const cellDiv = document.createElement("div");
    cellDiv.className = "cell";
    cellDiv.dataset.cellId = c.cell_id;

    const header = document.createElement("div");
    header.className = "cell-header";
    header.innerHTML = `<span>${c.label}</span><span>R${c.row_num}C${c.col_num}</span>`;

    const body = document.createElement("div");
    body.className = "cell-body";

    if (c.product_id) {
      body.innerHTML = `
        <div class="cell-product-name">${c.product_name}</div>
        <div>Qty: ${c.quantity}</div>
        <div class="cell-sku">SKU: ${c.sku || "-"}</div>
      `;
    } else {
      body.innerHTML = `<div class="cell-empty">Empty</div>`;
    }

    cellDiv.appendChild(header);
    cellDiv.appendChild(body);
    cellsGridEl.appendChild(cellDiv);

    // add to select for assigning
    const opt = document.createElement("option");
    opt.value = c.cell_id;
    opt.textContent = `${c.label} (R${c.row_num}C${c.col_num})`;
    cellSelectEl.appendChild(opt);
  });
}

async function loadProducts() {
  const products = await apiGet("/api/products");
  productSelectEl.innerHTML = "";

  products.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (#${p.id})`;
    productSelectEl.appendChild(opt);
  });
}

async function loadOperations() {
  const ops = await apiGet("/api/operations");
  opsTableBodyEl.innerHTML = "";

  ops.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${o.op_type}</td>
      <td>${o.cmd}</td>
      <td>${o.status}</td>
      <td>${o.cell_label || ""}</td>
      <td>${o.product_name || ""}</td>
      <td>${o.created_at}</td>
    `;
    opsTableBodyEl.appendChild(tr);
  });
}

// ======== ARM + ESP32 CONTROL ========

async function sendOperation(op_type, cmd, options = {}) {
  try {
    const result = await apiPost("/api/operations", {
      op_type,
      cmd,
      product_id: options.product_id || null,
      cell_id: options.cell_id || null,
    });

    console.log("Operation result:", result);
    esp32StatusEl.textContent = result.ok
      ? "ESP32: Command OK"
      : "ESP32: Error";
    esp32StatusEl.className = result.ok ? "badge badge-green" : "badge badge-red";

    await loadOperations();
  } catch (err) {
    console.error(err);
    esp32StatusEl.textContent = "ESP32: Error sending cmd";
    esp32StatusEl.className = "badge badge-red";
  }
}

// ======== EVENT HANDLERS ========

document.getElementById("btn-home").addEventListener("click", () => {
  sendOperation("HOME", "HOME");
});

document
  .getElementById("btn-pick-conveyor")
  .addEventListener("click", () => {
    sendOperation("PICK_FROM_CONVEYOR", "PICK");
  });

document
  .getElementById("btn-goto-column")
  .addEventListener("click", () => {
    const col = document.getElementById("goto-column").value;
    sendOperation("GOTO_COLUMN", `GOTO ${col}`);
  });

document.getElementById("btn-place").addEventListener("click", () => {
  const col = document.getElementById("place-col").value;
  const row = document.getElementById("place-row").value;
  sendOperation("PLACE_IN_CELL", `PLACE ${col} ${row}`);
});

document
  .getElementById("btn-manual-cmd")
  .addEventListener("click", () => {
    const cmd = document.getElementById("manual-cmd").value.trim();
    if (!cmd) return;
    sendOperation("MANUAL_CMD", cmd);
  });

document.getElementById("btn-add-product").addEventListener("click", async () => {
  const name = document.getElementById("prod-name").value.trim();
  const sku = document.getElementById("prod-sku").value.trim();
  const rfid = document.getElementById("prod-rfid").value.trim();

  if (!name) {
    alert("Product name is required");
    return;
  }

  await apiPost("/api/products", {
    name,
    sku: sku || null,
    rfid_uid: rfid || null,
  });

  document.getElementById("prod-name").value = "";
  document.getElementById("prod-sku").value = "";
  document.getElementById("prod-rfid").value = "";

  await loadProducts();
});

document
  .getElementById("btn-assign-product")
  .addEventListener("click", async () => {
    const cellId = document.getElementById("cell-select").value;
    const productId = document.getElementById("product-select").value;
    const qty = parseInt(document.getElementById("product-qty").value || "1", 10);

    if (!cellId || !productId) {
      alert("Select both cell and product.");
      return;
    }

    await apiPost(`/api/cells/${cellId}/assign`, {
      product_id: productId,
      quantity: qty,
    });

    await loadCells();
  });

// ======== INIT ========

async function init() {
  try {
    await loadCells();
    await loadProducts();
    await loadOperations();
    esp32StatusEl.textContent = "ESP32: Ready";
    esp32StatusEl.className = "badge badge-green";
  } catch (err) {
    console.error(err);
    esp32StatusEl.textContent = "ESP32: Backend error";
    esp32StatusEl.className = "badge badge-red";
  }

  // Refresh operations periodically
  setInterval(loadOperations, 5000);
}

init();
/* ─── CONFIGURATION & GLOBALS ────────────────── */
let selectedRole = "Mother Hub";
let rooms = [];
let selectedConnectivity = "MQTT";
window._cfg = {};

const FIREBASE_BASE_URL = "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app";

const BOARDS = [
  "ESP32-S3-DevKitC N16R8",
  "ESP32-S3-WROOM-1",
  "ESP32-WROVER",
  "ESP32 DevKit V1",
  "ESP8266 NodeMCU"
];

const ROOMS_LIST = [
  "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Elders Bedroom",
  "Kitchen", "Living Room", "Office Room", "Balcony", "Kitchen Balcony",
  "Master Bedroom Washroom", "Kids Bedroom Washroom", "Guest Bedroom Washroom"
];

const CONNECTIVITY_OPTIONS = [
  { value: "MQTT",     label: "MQTT — EMQX public broker" },
  { value: "Firebase", label: "Firebase Realtime Database" },
  { value: "Both",     label: "Both MQTT + Firebase" },
  { value: "None",     label: "None (local WiFi only)" }
];

/* ─── WEB SERIAL PORTS ──────────────────────── */
// This now works because you are using HTTPS via GitHub Pages
async function loadPorts() {
  let sel = document.getElementById("portSelect");
  if (!sel) return;
  
  try {
    if ("serial" in navigator) {
      sel.innerHTML = `<option value="none">Click 'Connect' to select ESP32</option>`;
    } else {
      sel.innerHTML = `<option>Browser not supported (Use Chrome/Edge)</option>`;
    }
  } catch (e) {
    sel.innerHTML = `<option>Error loading ports</option>`;
  }
}

/* ─── CONNECTIVITY & CREDENTIALS ─────────────── */
function renderConnectivityDropdown() {
  let box = document.getElementById("connectivityBox");
  if (!box) return;

  let optHTML = CONNECTIVITY_OPTIONS.map(o =>
    `<option value="${o.value}" ${o.value === selectedConnectivity ? "selected" : ""}>${o.label}</option>`
  ).join("");

  box.innerHTML = `
    <label>Connectivity Mode</label>
    <select id="connectivitySelect" onchange="onConnectivityChange(this.value)">
      ${optHTML}
    </select>
    <div id="credFields" style="margin-top:14px;"></div>
  `;
  renderCredFields();
}

function onConnectivityChange(val) {
  saveCreds();
  selectedConnectivity = val;
  renderCredFields();
}

function saveCreds() {
  window._cfg.ssid       = document.getElementById("wifiSSID")?.value   || window._cfg.ssid   || "";
  window._cfg.pass       = document.getElementById("wifiPass")?.value   || window._cfg.pass   || "";
  window._cfg.mqttBroker = document.getElementById("mqttBroker")?.value || window._cfg.mqttBroker || "192.168.31.159";
  window._cfg.mqttPort   = document.getElementById("mqttPort")?.value   || window._cfg.mqttPort   || "1883";
  window._cfg.mqttUser   = document.getElementById("mqttUser")?.value   || window._cfg.mqttUser   || "testauto";
  window._cfg.mqttPass   = document.getElementById("mqttPass")?.value   || window._cfg.mqttPass   || "1234";
  window._cfg.fbURL      = document.getElementById("fbURL")?.value      || window._cfg.fbURL      || FIREBASE_BASE_URL;
  window._cfg.fbSecret   = document.getElementById("fbSecret")?.value   || window._cfg.fbSecret   || "";
}

function renderCredFields() {
  let box = document.getElementById("credFields");
  if (!box) return;

  let c = selectedConnectivity;
  let cfg = window._cfg;
  let html = `
    <label>WiFi SSID &amp; Password</label>
    <div class="grid2" style="margin-bottom:12px;">
      <input id="wifiSSID" placeholder="WiFi SSID" value="${cfg.ssid || "Raavinewairtel"}">
      <input id="wifiPass" placeholder="WiFi Password" type="password" value="${cfg.pass || "12345678"}">
    </div>
  `;

  if (c === "MQTT" || c === "Both") {
    html += `
      <label>MQTT Broker</label>
      <div class="grid2" style="margin-bottom:12px;">
        <input id="mqttBroker" placeholder="Broker IP / Host" value="${cfg.mqttBroker || "192.168.31.159"}">
        <input id="mqttPort" placeholder="Port" value="${cfg.mqttPort || "1883"}">
      </div>
      <div class="grid2" style="margin-bottom:12px;">
        <input id="mqttUser" placeholder="MQTT Username" value="${cfg.mqttUser || "testauto"}">
        <input id="mqttPass" placeholder="MQTT Password" type="password" value="${cfg.mqttPass || "1234"}">
      </div>
    `;
  }

  if (c === "Firebase" || c === "Both") {
    html += `
      <label>Firebase Config</label>
      <div style="margin-bottom:12px;">
        <input id="fbURL" placeholder="Firebase Realtime DB URL" value="${cfg.fbURL || FIREBASE_BASE_URL}">
      </div>
      <div style="margin-bottom:12px;">
        <input id="fbSecret" placeholder="Firebase API Key / DB Secret" value="${cfg.fbSecret || ""}">
      </div>
    `;
  }
  box.innerHTML = html;
}

/* ─── ROLE & UI RENDERING ────────────────────── */
function setRole(role) {
  selectedRole = role;
  document.getElementById("roleInfo").innerText = "Selected: " + role;
  document.getElementById("motherPanel").style.display = "block";
  renderTopPanel();
}

function boardOptionsHTML(selectedBoard) {
  return BOARDS.map(b => `<option value="${b}" ${b === selectedBoard ? "selected" : ""}>${b}</option>`).join("");
}

function roomOptionsHTML(exclude) {
  return ROOMS_LIST.filter(r => !exclude.includes(r)).map(r => `<option value="${r}">${r}</option>`).join("");
}

function renderTopPanel() {
  let boardSelectEl = document.getElementById("boardSelect");
  let currentBoard = boardSelectEl ? boardSelectEl.value : BOARDS[0];
  let usedRooms = rooms.map(r => r.room);
  let availRooms = roomOptionsHTML(usedRooms);
  let html = "";

  if (selectedRole === "Child Node") {
    html += `<label>Select Mother Device Name</label><select id="childBoard">${boardOptionsHTML(currentBoard)}</select>`;
  } else if (selectedRole === "Mother Hub") {
    html += `<label>Select Child Device Name</label><select id="childBoard">${boardOptionsHTML(currentBoard)}</select>`;
  }

  if (availRooms === "") {
    html += `<div class="info" style="margin-top:14px;">✅ All rooms added!</div>`;
  } else {
    html += `
      <label>Select Room Name</label>
      <select id="childRoom">${availRooms}</select>
      <label>Relay Count</label>
      <select id="relayCount"></select>
      <br><br>
      <button onclick="addChildRoom()">Add Room</button>
    `;
  }

  html += `<div id="childRoomsBox"></div>`;
  document.getElementById("motherPanel").innerHTML = html;
  loadRelayCount();
  renderRooms();
}

function loadRelayCount() {
  let sel = document.getElementById("relayCount");
  if (!sel) return;
  sel.innerHTML = "";
  for (let i = 1; i <= 32; i++) sel.innerHTML += `<option value="${i}">${i}</option>`;
}

function addChildRoom() {
  let board = document.getElementById("boardSelect").value;
  let roomEl = document.getElementById("childRoom");
  if (!roomEl) return;
  let room = roomEl.value;
  let relays = parseInt(document.getElementById("relayCount").value);

  if (rooms.find(r => r.room === room)) {
    alert(`"${room}" already added!`);
    return;
  }
  rooms.push({ board, room, relays, pins: [], devices: [] });
  renderTopPanel();
}

function removeRoom(index) {
  rooms.splice(index, 1);
  renderTopPanel();
}

function renderRooms() {
  let box = document.getElementById("childRoomsBox");
  if (!box) return;
  if (rooms.length === 0) { box.innerHTML = ""; return; }

  box.innerHTML = `<h2 style="margin-top:20px;">Added Rooms (${rooms.length})</h2>`;

  rooms.forEach((r, index) => {
    let isChild = selectedRole === "Child Node";
    box.innerHTML += `
      <div class="card" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2>${r.room}</h2>
          <button onclick="removeRoom(${index})" style="background:#ff3b3b;color:#fff;padding:0 14px;height:36px;font-size:13px;">✕ Remove</button>
        </div>
        ${selectedRole !== "Hybrid" ? `
          <label>${isChild ? "Mother Device" : "Child Device"}</label>
          <select ${isChild ? "disabled" : ""} onchange="changeBoard(${index}, this.value)">
            ${boardOptionsHTML(r.board)}
          </select>
        ` : ""}
        <div class="info" style="margin-bottom:8px;">Relays: ${r.relays}</div>
        ${makeRelayInputs(r.board, r.relays, index)}
      </div>
    `;
  });
}

function changeBoard(index, val) {
  rooms[index].board = val;
  renderRooms();
}

function makeRelayInputs(board, total, roomIndex) {
  let html = `<div style="margin-top:10px;">`;
  for (let i = 1; i <= total; i++) {
    html += `
      <div class="grid3" style="margin-bottom:8px;">
        <select><option>IN${i}</option></select>
        <select onchange="savePin(${roomIndex},${i-1},this.value)">${pinOptions(board)}</select>
        <select onchange="saveDevice(${roomIndex},${i-1},this.value)">
          <option>Fan</option><option>AC</option><option>Light</option>
          <option>Ceiling Light</option><option>Main Fan</option><option>Socket</option>
          <option>Exhaust Fan</option><option>Geyser</option><option>TV Point</option>
          <option>Night Light</option><option>Bed Light</option><option>Study Light</option>
        </select>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

function savePin(ri, idx, val) { if (!rooms[ri].pins) rooms[ri].pins = []; rooms[ri].pins[idx] = val; }
function saveDevice(ri, idx, val) { if (!rooms[ri].devices) rooms[ri].devices = []; rooms[ri].devices[idx] = val; }

function pinOptions(board) {
  let isESP32S3orWROVER = board.includes("ESP32-S3") || board.includes("ESP32-WROVER");
  let html = "";
  if (isESP32S3orWROVER) {
    for (let i = 1; i <= 100; i++) html += `<option value="${i}">${i}</option>`;
  } else {
    for (let i = 1; i <= 100; i++) html += `<option value="D${i}">D${i}</option>`;
  }
  return html;
}

function getCredentials() {
  saveCreds();
  return { ...window._cfg, connectivity: selectedConnectivity };
}

/* ─── BUILD & FIREBASE CLOUD SYNC ────────────── */
async function buildNow() {
  if (rooms.length === 0) {
    alert("Please add at least one room before building.");
    return;
  }

  let payload = {
    role: selectedRole,
    connectivity: selectedConnectivity,
    credentials: getCredentials(),
    rooms: rooms,
    lastUpdated: new Date().toISOString()
  };

  document.getElementById("log").innerText = "⏳ Pushing configuration to Singapore Cloud...";

  let firebaseURL = `${FIREBASE_BASE_URL}/mos_config.json`;

  try {
    let res = await fetch(firebaseURL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      document.getElementById("log").innerText = "✅ SUCCESS: Config saved to projectm-chinna!\nESP32 will sync now.";
    } else {
      let err = await res.text();
      document.getElementById("log").innerText = "❌ Firebase Error: " + err;
    }
  } catch (e) {
    document.getElementById("log").innerText = "❌ Network Error: Check internet connection.";
  }
}

/* ─── WEB SERIAL ACTIONS (USB) ───────────────── */
async function flashNow() {
  if (!("serial" in navigator)) {
    alert("Please use Chrome or Edge to flash your ESP32.");
    return;
  }
  // This triggers the browser USB port selector
  try {
    const port = await navigator.serial.requestPort();
    document.getElementById("log").innerText = "🔌 Port Selected. Ready to flash firmware folder.";
  } catch (e) {
    document.getElementById("log").innerText = "❌ Port Selection Cancelled.";
  }
}

function eraseNow() {
  alert("Feature coming soon: This will wipe the ESP32 memory.");
}

function monitorNow() {
  alert("Feature coming soon: This will show live logs from the USB port.");
}

/* ─── INITIALIZE ─────────────────────────────── */
window.onload = () => {
  loadPorts();
  renderConnectivityDropdown();
  setRole("Mother Hub");
};
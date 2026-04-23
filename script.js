/* ─────────────────────────────────────────────
   PROJECT M - FULL script.js
───────────────────────────────────────────── */

/* GLOBALS */
let selectedRole = "Mother Hub";
let rooms = [];
let selectedConnectivity = "MQTT";

window._cfg = {};

const FIREBASE_BASE_URL =
  "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app";

/* BOARDS */
const BOARDS = [
  "ESP32-S3-DevKitC N16R8",
  "ESP32-S3-WROOM-1",
  "ESP32-WROVER",
  "ESP32 DevKit V1",
  "ESP8266 NodeMCU"
];

/* FULL ROOM LIST */
const ROOMS_LIST = [
  "Master Bedroom",
  "Master Washroom",

  "Kids Bedroom",
  "Kids Washroom",

  "Guest Bedroom",
  "Guest Washroom",

  "Kitchen",
  "Pooja Room",

  "Living Room",
  "Living Washroom",

  "Office Room",
  "Office Washroom",

  "Balcony",
  "Balcony Washroom",

  "Main Entrance",
  "Elevator"
];

/* FULL DEVICE LIST */
const DEVICE_LIST = [
  "Light",
  "Fan",
  "AC",
  "Socket",
  "Geyser",
  "Exhaust Fan",
  "TV",
  "Curtain",
  "Bell",
  "Night Lamp",
  "Rope Light",
  "RGB Light",
  "Focus Light",
  "Table Lamp"
];

/* CONNECTIVITY */
const CONNECTIVITY_OPTIONS = [
  { value: "MQTT", label: "MQTT" },
  { value: "Firebase", label: "Firebase" },
  { value: "Both", label: "MQTT + Firebase" },
  { value: "None", label: "Offline" }
];

/* ─────────────────────────────────────────────
   START
───────────────────────────────────────────── */
window.onload = () => {
  renderConnectivityDropdown();
  setRole("Mother Hub");
};

/* ─────────────────────────────────────────────
   CONNECTIVITY UI
───────────────────────────────────────────── */
function renderConnectivityDropdown() {
  const box = document.getElementById("connectivityBox");
  if (!box) return;

  let html = `
    <label>Connectivity Mode</label>
    <select id="connectivitySelect" onchange="onConnectivityChange(this.value)">
  `;

  CONNECTIVITY_OPTIONS.forEach(item => {
    html += `
      <option value="${item.value}"
        ${item.value === selectedConnectivity ? "selected" : ""}>
        ${item.label}
      </option>
    `;
  });

  html += `
    </select>
    <div id="credFields" style="margin-top:14px;"></div>
  `;

  box.innerHTML = html;

  renderCredFields();
}

function onConnectivityChange(val) {
  saveCreds();
  selectedConnectivity = val;
  renderCredFields();
}

function renderCredFields() {
  const box = document.getElementById("credFields");
  if (!box) return;

  const cfg = window._cfg;

  let html = `
    <label>WiFi</label>
    <div class="grid2">
      <input id="wifiSSID" placeholder="WiFi Name"
        value="${cfg.ssid || ""}">
      <input id="wifiPass" type="password"
        placeholder="WiFi Password"
        value="${cfg.pass || ""}">
    </div>
  `;

  if (
    selectedConnectivity === "MQTT" ||
    selectedConnectivity === "Both"
  ) {
    html += `
      <label>MQTT</label>
      <div class="grid2">
        <input id="mqttBroker" placeholder="Broker"
          value="${cfg.mqttBroker || "broker.emqx.io"}">
        <input id="mqttPort" placeholder="Port"
          value="${cfg.mqttPort || "1883"}">
      </div>

      <div class="grid2">
        <input id="mqttUser" placeholder="Username"
          value="${cfg.mqttUser || ""}">
        <input id="mqttPass" type="password"
          placeholder="Password"
          value="${cfg.mqttPass || ""}">
      </div>
    `;
  }

  if (
    selectedConnectivity === "Firebase" ||
    selectedConnectivity === "Both"
  ) {
    html += `
      <label>Firebase</label>
      <input id="fbURL"
        value="${cfg.fbURL || FIREBASE_BASE_URL}">
      <input id="fbSecret"
        placeholder="Secret / API Key"
        value="${cfg.fbSecret || ""}">
    `;
  }

  box.innerHTML = html;
}

function saveCreds() {
  window._cfg.ssid =
    document.getElementById("wifiSSID")?.value || "";

  window._cfg.pass =
    document.getElementById("wifiPass")?.value || "";

  window._cfg.mqttBroker =
    document.getElementById("mqttBroker")?.value ||
    "broker.emqx.io";

  window._cfg.mqttPort =
    document.getElementById("mqttPort")?.value ||
    "1883";

  window._cfg.mqttUser =
    document.getElementById("mqttUser")?.value || "";

  window._cfg.mqttPass =
    document.getElementById("mqttPass")?.value || "";

  window._cfg.fbURL =
    document.getElementById("fbURL")?.value ||
    FIREBASE_BASE_URL;

  window._cfg.fbSecret =
    document.getElementById("fbSecret")?.value || "";
}

/* ─────────────────────────────────────────────
   ROLE
───────────────────────────────────────────── */
function setRole(role) {
  selectedRole = role;

  document.getElementById("roleInfo").innerText =
    "Selected: " + role;

  document.getElementById("motherPanel").style.display =
    "block";

  renderTopPanel();
}

/* ─────────────────────────────────────────────
   PANEL
───────────────────────────────────────────── */
function renderTopPanel() {
  const usedRooms = rooms.map(r => r.room);

  const availableRooms = ROOMS_LIST.filter(
    room => !usedRooms.includes(room)
  );

  let html = "";

  if (availableRooms.length === 0) {
    html += `<div class="info">All rooms added</div>`;
  } else {
    html += `
      <label>Select Room</label>
      <select id="childRoom">
        ${availableRooms
          .map(r => `<option>${r}</option>`)
          .join("")}
      </select>

      <label>Relay Count</label>
      <select id="relayCount"></select>

      <br><br>
      <button onclick="addChildRoom()">
        + Add Room
      </button>
    `;
  }

  html += `<div id="childRoomsBox"></div>`;

  document.getElementById("motherPanel").innerHTML =
    html;

  loadRelayCount();
  renderRooms();
}

function loadRelayCount() {
  const sel = document.getElementById("relayCount");
  if (!sel) return;

  sel.innerHTML = "";

  for (let i = 1; i <= 32; i++) {
    sel.innerHTML += `
      <option value="${i}">${i}</option>
    `;
  }
}

/* ─────────────────────────────────────────────
   ROOM ADD
───────────────────────────────────────────── */
function addChildRoom() {
  const room =
    document.getElementById("childRoom").value;

  const board =
    document.getElementById("boardSelect").value;

  const relays = parseInt(
    document.getElementById("relayCount").value
  );

  const pins = Array(relays).fill("1");
  const devices = Array(relays).fill("Light");

  rooms.push({
    room,
    board,
    relays,
    pins,
    devices
  });

  renderTopPanel();
}

function removeRoom(index) {
  rooms.splice(index, 1);
  renderTopPanel();
}

/* ─────────────────────────────────────────────
   ROOM RENDER
───────────────────────────────────────────── */
function renderRooms() {
  const box = document.getElementById(
    "childRoomsBox"
  );

  if (!box) return;

  if (rooms.length === 0) {
    box.innerHTML = "";
    return;
  }

  let html = `
    <h2 style="margin-top:20px;">
      Added Rooms
    </h2>
  `;

  rooms.forEach((roomObj, roomIndex) => {
    html += `
      <div class="card" style="margin-top:12px;">

        <div class="room-head">
          <h2>${roomObj.room}</h2>

          <button onclick="removeRoom(${roomIndex})">
            Remove
          </button>
        </div>

        <div class="info">
          Relays: ${roomObj.relays}
        </div>
    `;

    for (let i = 0; i < roomObj.relays; i++) {
      html += `
        <div class="grid3">

          <select>
            <option>IN${i + 1}</option>
          </select>

          <select onchange="
            savePin(${roomIndex},${i},this.value)
          ">
            ${pinOptions(roomObj.pins[i])}
          </select>

          <select onchange="
            saveDevice(${roomIndex},${i},this.value)
          ">
            ${deviceOptions(roomObj.devices[i])}
          </select>

        </div>
      `;
    }

    html += `</div>`;
  });

  box.innerHTML = html;
}

function pinOptions(selected) {
  let html = "";

  for (let i = 1; i <= 48; i++) {
    html += `
      <option value="${i}"
        ${selected == i ? "selected" : ""}>
        ${i}
      </option>
    `;
  }

  return html;
}

function deviceOptions(selected) {
  return DEVICE_LIST.map(
    d => `
      <option value="${d}"
        ${selected === d ? "selected" : ""}>
        ${d}
      </option>
    `
  ).join("");
}

function savePin(roomIndex, relayIndex, val) {
  rooms[roomIndex].pins[relayIndex] = val;
}

function saveDevice(roomIndex, relayIndex, val) {
  rooms[roomIndex].devices[relayIndex] = val;
}

/* ─────────────────────────────────────────────
   FIREBASE SAVE
───────────────────────────────────────────── */
async function buildNow() {
  if (rooms.length === 0) {
    alert("Add at least one room");
    return;
  }

  saveCreds();

  const payload = {
    role: selectedRole,
    connectivity: selectedConnectivity,
    credentials: window._cfg,
    rooms: rooms,
    lastUpdated: new Date().toISOString()
  };

  const log = document.getElementById("log");

  log.className = "log";
  log.innerText = "Saving to Cloud...";

  try {
    const res = await fetch(
      `${FIREBASE_BASE_URL}/mos_config.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (res.ok) {
      log.innerText =
        "SUCCESS: Config saved to Firebase.";
    } else {
      log.className = "log error";
      log.innerText =
        "Firebase Error.";
    }
  } catch (e) {
    log.className = "log error";
    log.innerText =
      "Network Error.";
  }
}
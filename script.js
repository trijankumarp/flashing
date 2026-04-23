/* =====================================================
   PROJECT M - FULL script.js
   Updated: Auto main.c generation + download
===================================================== */

/* GLOBALS */
let selectedRole = "Mother Hub";
let selectedConnectivity = "MQTT";
let rooms = [];
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

/* ROOMS */
const ROOMS_LIST = [
  "Master Bedroom","Master Washroom",
  "Kids Bedroom","Kids Washroom",
  "Guest Bedroom","Guest Washroom",
  "Kitchen","Pooja Room",
  "Living Room","Living Washroom",
  "Office Room","Office Washroom",
  "Balcony","Balcony Washroom",
  "Main Entrance","Elevator"
];

/* DEVICES */
const DEVICE_LIST = [
  "Light","Fan","AC","Socket","Geyser",
  "Exhaust Fan","TV","Curtain","Bell",
  "Night Lamp","Rope Light","RGB Light",
  "Focus Light","Table Lamp"
];

/* CONNECTIVITY */
const CONNECTIVITY_OPTIONS = [
  { value: "MQTT", label: "MQTT" },
  { value: "Firebase", label: "Firebase" },
  { value: "Both", label: "MQTT + Firebase" },
  { value: "None", label: "Offline" }
];

/* START */
window.onload = () => {
  renderConnectivityDropdown();
  setRole("Mother Hub");
};

/* =====================================================
   CONNECTIVITY UI
===================================================== */
function renderConnectivityDropdown() {
  const box = document.getElementById("connectivityBox");
  if (!box) return;

  let html = `
    <label>Connectivity Mode</label>
    <select id="connectivitySelect"
      onchange="onConnectivityChange(this.value)">
  `;

  CONNECTIVITY_OPTIONS.forEach(item => {
    html += `
      <option value="${item.value}"
      ${selectedConnectivity === item.value ? "selected" : ""}>
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

  box.innerHTML = `
    <label>WiFi</label>
    <div class="grid2">
      <input id="wifiSSID"
        placeholder="WiFi Name"
        value="${cfg.ssid || ""}">

      <input id="wifiPass"
        type="password"
        placeholder="WiFi Password"
        value="${cfg.pass || ""}">
    </div>
  `;
}

function saveCreds() {
  window._cfg.ssid =
    document.getElementById("wifiSSID")?.value || "";

  window._cfg.pass =
    document.getElementById("wifiPass")?.value || "";
}

/* =====================================================
   ROLE
===================================================== */
function setRole(role) {
  selectedRole = role;

  const info = document.getElementById("roleInfo");
  if (info) info.innerText = "Selected: " + role;

  const panel = document.getElementById("motherPanel");
  if (panel) panel.style.display = "block";

  renderTopPanel();
}

/* =====================================================
   MAIN PANEL
===================================================== */
function renderTopPanel() {
  const usedRooms = rooms.map(r => r.room);

  let availableRooms = ROOMS_LIST.filter(
    r => !usedRooms.includes(r)
  );

  if (selectedRole === "Child Node" && rooms.length >= 1) {
    availableRooms = [];
  }

  let html = "";

  if (availableRooms.length > 0) {
    html += `
      <label>Select Room</label>
      <select id="childRoom">
        ${availableRooms.map(r =>
          `<option>${r}</option>`).join("")}
      </select>

      <label>Relay Count</label>
      <select id="relayCount"></select>

      <br><br>

      <button onclick="addChildRoom()">
        + Add Room
      </button>
    `;
  } else {
    html += `<div class="info">No more rooms available</div>`;
  }

  html += `<div id="childRoomsBox"></div>`;

  document.getElementById("motherPanel").innerHTML = html;

  loadRelayCount();
  renderRooms();
}

function loadRelayCount() {
  const sel = document.getElementById("relayCount");
  if (!sel) return;

  sel.innerHTML = "";

  for (let i = 1; i <= 32; i++) {
    sel.innerHTML += `<option>${i}</option>`;
  }
}

/* =====================================================
   ADD ROOM
===================================================== */
function addChildRoom() {
  const room =
    document.getElementById("childRoom").value;

  const board =
    document.getElementById("boardSelect").value;

  const relays = parseInt(
    document.getElementById("relayCount").value
  );

  rooms.push({
    room,
    board,
    relays,
    pins: Array(relays).fill("1"),
    devices: Array(relays).fill("Light")
  });

  renderTopPanel();
}

function removeRoom(index) {
  rooms.splice(index, 1);
  renderTopPanel();
}

/* =====================================================
   ROOM CARDS
===================================================== */
function renderRooms() {
  const box =
    document.getElementById("childRoomsBox");

  if (!box) return;

  if (rooms.length === 0) {
    box.innerHTML = "";
    return;
  }

  let html = `<h2 style="margin-top:20px;">Added Rooms</h2>`;

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
            savePin(${roomIndex},${i},this.value)">
            ${pinOptions(roomObj.pins[i])}
          </select>

          <select onchange="
            saveDevice(${roomIndex},${i},this.value)">
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
  return DEVICE_LIST.map(d => `
    <option value="${d}"
    ${selected === d ? "selected" : ""}>
    ${d}
    </option>
  `).join("");
}

function savePin(roomIndex, relayIndex, val) {
  rooms[roomIndex].pins[relayIndex] = val;
}

function saveDevice(roomIndex, relayIndex, val) {
  rooms[roomIndex].devices[relayIndex] = val;
}

/* =====================================================
   AUTO GENERATE main.c
===================================================== */
function generateMainC() {
  let gpioInit = "";
  let commandMap = "";

  rooms.forEach(roomObj => {
    roomObj.pins.forEach((pin, i) => {
      const dev = roomObj.devices[i];

      gpioInit += `
  gpio_reset_pin(${pin});
  gpio_set_direction(${pin}, GPIO_MODE_OUTPUT);
  gpio_set_level(${pin}, 0);
`;

      commandMap += `
  if (
    strcmp(room,"${roomObj.room}") == 0 &&
    strcmp(device,"${dev}") == 0
  ) {
    gpio_set_level(${pin},
      strcmp(action,"ON")==0 ? 1 : 0);
  }
`;
    });
  });

  return `
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

void setup_gpio() {
${gpioInit}
}

void execute_command(
  const char *room,
  const char *device,
  const char *action
) {
${commandMap}
}

void app_main() {
  setup_gpio();

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
`;
}

function downloadMainC() {
  const code = generateMainC();

  const blob = new Blob(
    [code],
    { type: "text/plain" }
  );

  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = "main.c";
  a.click();

  URL.revokeObjectURL(a.href);
}

/* =====================================================
   SAVE TO FIREBASE
===================================================== */
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
      log.className = "log";
      log.innerText =
        "SUCCESS: Config saved.\nGenerating main.c...";

      downloadMainC();

      setTimeout(() => {
        log.innerText =
          "SUCCESS: Config saved.\nmain.c downloaded.";
      }, 800);

    } else {
      log.className = "log error";
      log.innerText = "Firebase Error.";
    }

  } catch (e) {
    log.className = "log error";
    log.innerText = "Network Error.";
  }
}
/* =====================================================
USB SEND WIFI TO ESP (Web Serial API)
===================================================== */

/* ---------- CREATE BUTTON AUTO ---------- */
window.addEventListener("load", () => {
  setTimeout(addWifiSendButton, 800);
});

function addWifiSendButton() {
  const box = document.getElementById("connectivityBox");
  if (!box) return;

  if (document.getElementById("wifiSendBtn")) return;

  const btn = document.createElement("button");
  btn.id = "wifiSendBtn";
  btn.innerText = "Send WiFi to Device";
  btn.style.marginTop = "14px";
  btn.onclick = sendWifiToESP;

  box.appendChild(btn);
}

/* ---------- SEND WIFI ---------- */
async function sendWifiToESP() {
  const ssid =
    document.getElementById("wifiSSID")?.value || "";

  const pass =
    document.getElementById("wifiPass")?.value || "";

  const log = document.getElementById("log");

  if (!ssid) {
    log.className = "log error";
    log.innerText = "Enter WiFi Name";
    return;
  }

  if (!("serial" in navigator)) {
    log.className = "log error";
    log.innerText =
      "Browser not supported. Use Chrome / Edge.";
    return;
  }

  try {
    log.className = "log";
    log.innerText = "Select ESP Port...";

    const port =
      await navigator.serial.requestPort();

    await port.open({
      baudRate: 115200
    });

    const writer =
      port.writable.getWriter();

    const payload = JSON.stringify({
      type: "wifi",
      ssid: ssid,
      pass: pass
    }) + "\n";

    const data =
      new TextEncoder().encode(payload);

    await writer.write(data);

    writer.releaseLock();

    await port.close();

    log.className = "log";
    log.innerText =
      "SUCCESS:\nWiFi sent to ESP.";
  }

  catch (e) {
    log.className = "log error";
    log.innerText =
      "Serial Error:\n" + e.message;
  }
}
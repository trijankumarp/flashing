/* =====================================================
PROJECT M - script.js
===================================================== */

/* GLOBALS */
let selectedRole = "Mother Hub";
let selectedConnectivity = "MQTT";
let rooms = [];
window._cfg = {};

const FIREBASE_BASE_URL =
"https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app";

/* LISTS */
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

const DEVICE_LIST = [
"Light","Fan","AC","Socket","Geyser",
"Exhaust Fan","TV","Curtain","Bell",
"Night Lamp","Rope Light","RGB Light",
"Focus Light","Table Lamp"
];

const CONNECTIVITY_OPTIONS = [
{ value:"MQTT", label:"MQTT" },
{ value:"Firebase", label:"Firebase" },
{ value:"Both", label:"MQTT + Firebase" },
{ value:"None", label:"Offline" }
];

/* =====================================================
START
===================================================== */
window.onload = () => {
  renderConnectivityDropdown();
  setRole("Mother Hub");
  setTimeout(addWifiSendButton, 800);
};

/* =====================================================
CONNECTIVITY
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
    <div id="credFields"></div>
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

  box.innerHTML = `
    <label>WiFi</label>

    <div class="grid2">
      <input id="wifiSSID"
        placeholder="WiFi Name"
        value="">

      <input id="wifiPass"
        type="password"
        placeholder="WiFi Password"
        value="">
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
ROOM PANEL
===================================================== */
function renderTopPanel() {
  const used = rooms.map(r => r.room);

  let available = ROOMS_LIST.filter(
    r => !used.includes(r)
  );

  if (
    selectedRole === "Child Node" &&
    rooms.length >= 1
  ) {
    available = [];
  }

  let html = "";

  if (available.length > 0) {
    html += `
      <label>Select Room</label>

      <select id="childRoom">
        ${available.map(r =>
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
    html += `
      <div class="info">
        No more rooms available
      </div>
    `;
  }

  html += `<div id="childRoomsBox"></div>`;

  document.getElementById("motherPanel").innerHTML =
    html;

  loadRelayCount();
  renderRooms();
}

function loadRelayCount() {
  const sel =
    document.getElementById("relayCount");

  if (!sel) return;

  sel.innerHTML = "";

  for (let i = 1; i <= 32; i++) {
    sel.innerHTML += `<option>${i}</option>`;
  }
}

function addChildRoom() {
  const room =
    document.getElementById("childRoom").value;

  const relays = parseInt(
    document.getElementById("relayCount").value
  );

  rooms.push({
    room,
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
            <option>IN${i+1}</option>
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

function savePin(r, p, v) {
  rooms[r].pins[p] = v;
}

function saveDevice(r, p, v) {
  rooms[r].devices[p] = v;
}

/* =====================================================
GENERATE main.c
===================================================== */
function generateMainC() {
  let gpio = "";
  let cmd = "";

  rooms.forEach(room => {
    room.pins.forEach((pin, i) => {
      const dev = room.devices[i];

      gpio += `
  gpio_reset_pin(${pin});
  gpio_set_direction(${pin}, GPIO_MODE_OUTPUT);
  gpio_set_level(${pin},0);
`;

      cmd += `
  if(strcmp(room,"${room.room}")==0 &&
     strcmp(device,"${dev}")==0){
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

void setup_gpio(){
${gpio}
}

void execute_command(
const char *room,
const char *device,
const char *action){
${cmd}
}

void app_main(){
  setup_gpio();

  while(1){
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
`;
}

function downloadMainC() {
  const code = generateMainC();

  const blob = new Blob(
    [code],
    { type:"text/plain" }
  );

  const a =
    document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = "main.c";
  a.click();

  URL.revokeObjectURL(a.href);
}

/* =====================================================
SAVE CONFIG
===================================================== */
async function buildNow() {
  if (rooms.length === 0) {
    alert("Add at least one room");
    return;
  }

  saveCreds();

  const payload = {
    role:selectedRole,
    connectivity:selectedConnectivity,
    credentials:window._cfg,
    rooms:rooms,
    lastUpdated:new Date().toISOString()
  };

  const log =
    document.getElementById("log");

  log.className = "log";
  log.innerText = "Saving...";

  try {
    const res = await fetch(
      `${FIREBASE_BASE_URL}/mos_config.json`,
      {
        method:"PUT",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(payload)
      }
    );

    if (res.ok) {
      log.innerText =
        "Saved.\nGenerating main.c...";

      downloadMainC();

      setTimeout(() => {
        log.innerText =
          "Saved.\nmain.c downloaded.";
      }, 800);

    } else {
      log.className = "log error";
      log.innerText = "Firebase Error";
    }

  } catch(e) {
    log.className = "log error";
    log.innerText = "Network Error";
  }
}

/* =====================================================
SEND WIFI TO ESP
===================================================== */
function addWifiSendButton() {
  const box =
    document.getElementById("connectivityBox");

  if (!box) return;

  if (
    document.getElementById("wifiSendBtn")
  ) return;

  const btn =
    document.createElement("button");

  btn.id = "wifiSendBtn";
  btn.innerText = "Send WiFi to Device";
  btn.style.marginTop = "14px";
  btn.onclick = sendWifiToESP;

  box.appendChild(btn);
}

async function sendWifiToESP() {
  const ssid =
    document.getElementById("wifiSSID")?.value || "";

  const pass =
    document.getElementById("wifiPass")?.value || "";

  const log =
    document.getElementById("log");

  if (!ssid) {
    log.className = "log error";
    log.innerText = "Enter WiFi Name";
    return;
  }

  if (!("serial" in navigator)) {
    log.className = "log error";
    log.innerText =
      "Use Chrome / Edge";
    return;
  }

  let port = null;
  let writer = null;

  try {
    log.className = "log";
    log.innerText = "Select ESP Port...";

    port =
      await navigator.serial.requestPort();

    await port.open({
      baudRate:115200
    });

    writer =
      port.writable.getWriter();

    const payload =
      JSON.stringify({
        type:"wifi",
        ssid:ssid,
        pass:pass
      }) + "\n";

    await writer.write(
      new TextEncoder().encode(payload)
    );

    log.innerText =
      "SUCCESS:\nWiFi sent.";
  }

  catch(e) {
    log.className = "log error";
    log.innerText =
      "Serial Error:\n" + e.message;
  }

  finally {
    try {
      writer?.releaseLock();
    } catch {}

    try {
      await port?.close();
    } catch {}
  }
}
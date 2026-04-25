const express = require("express");
const cors = require("cors");
const { SerialPort } = require("serialport");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();

const WEB_PORT     = 5000;
const PROJECT_PATH = "C:\\Users\\trija\\Desktop\\Work\\VS\\flashing\\esp_firmware";
const DATA_FILE    = path.join(__dirname, "config.json");
const MAIN_FILE    = path.join(PROJECT_PATH, "main", "main.c");

// EXECUTABLE PATHS
const PYTHON_EXE   = "C:\\Espressif\\python_env\\idf5.5_py3.13_env\\Scripts\\python.exe";
const IDF_PY       = "C:\\Espressif\\frameworks\\esp-idf-v5.5.4\\tools\\idf.py";
const IDF_BAT      = "C:\\Espressif\\frameworks\\esp-idf-v5.5.4\\export.bat";

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

function saveConfig(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readConfig() {
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return {};
}

// FIX: Explicitly calling PYTHON_EXE to prevent .py file association popup
function runIDF(args, callback) {
  const command =
    `set "IDF_TOOLS_PATH=C:\\Espressif" && ` +
    `call "${IDF_BAT}" && ` +
    `cd /d "${PROJECT_PATH}" && ` +
    `"${PYTHON_EXE}" "${IDF_PY}" ${args}`;
    
  exec(command, { maxBuffer: 1024 * 1024 * 20 }, callback);
}

function generateMainCode(cfg) {
  const role         = cfg.role || "Mother Hub";
  const wifi         = cfg.credentials || {};
  const rooms        = cfg.rooms || [];
  const connectivity = cfg.connectivity || "None";
  let relayDefs = "";
  let relayInit = "";
  let count = 1;
  
  rooms.forEach(room => {
    for (let i = 0; i < room.relays; i++) {
      const pin = room.pins?.[i] || count;
      relayDefs += `#define RELAY_${count} ${pin}\n`;
      relayInit += `    gpio_reset_pin(RELAY_${count});\n    gpio_set_direction(RELAY_${count}, GPIO_MODE_OUTPUT);\n    gpio_set_level(RELAY_${count}, 0);\n`;
      count++;
    }
  });
  
  const roomComments = rooms.map(r =>
    ` * Room: ${r.room} | Board: ${r.board} | Relays: ${r.relays}`
  ).join("\n");
  
  return `/**
 * M-OS Firmware
 * Role: ${role} | Connectivity: ${connectivity}
 * WiFi: ${wifi.ssid || ""}
${roomComments}
 */
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "esp_log.h"
${relayDefs}
#define WIFI_SSID "${wifi.ssid || ""}"
#define WIFI_PASS "${wifi.pass || ""}"
static const char *TAG = "M-OS";
void app_main(void)
{
    nvs_flash_init();
    ESP_LOGI(TAG, "M-OS Starting... Role: ${role}");
${relayInit}
    ESP_LOGI(TAG, "All relays initialized");
    while (1) {
        ESP_LOGI(TAG, "M-OS Running...");
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}
`;
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "ui.html")));

app.get("/ports", async (req, res) => {
  try { res.json(await SerialPort.list()); }
  catch { res.json([]); }
});

app.get("/config", (req, res) => res.json(readConfig()));

app.post("/save-config", (req, res) => {
  try { saveConfig(req.body); res.json({ status: "saved" }); }
  catch { res.json({ status: "error" }); }
});

app.post("/build", (req, res) => {
  try {
    const config = req.body;
    saveConfig(config);
    fs.writeFileSync(MAIN_FILE, generateMainCode(config));
    
    runIDF("build", (error, stdout, stderr) => {
      if (error) return res.end("BUILD FAILED:\n\n" + (stderr || error.message || stdout));
      res.end("CODE GENERATED + BUILD SUCCESS\n\n" + stdout);
    });
  } catch (e) { res.end("Build Error:\n\n" + e.message); }
});

app.get("/flash/:port", (req, res) => {
  const port = req.params.port;
  if (!port || port === "null") return res.send("Please select a valid COM Port");
  runIDF(`-p ${port} flash`, (error, stdout, stderr) => {
    if (error) return res.end("FLASH FAILED:\n\n" + (stderr || error.message || stdout));
    res.end("FLASH SUCCESS\n\n" + stdout);
  });
});

app.get("/erase/:port", (req, res) => {
  const port = req.params.port;
  if (!port || port === "null") return res.send("Please select a valid COM Port");
  runIDF(`-p ${port} erase-flash`, (error, stdout, stderr) => {
    if (error) return res.end("ERASE FAILED:\n\n" + (stderr || error.message || stdout));
    res.end("ERASE SUCCESS\n\n" + stdout);
  });
});

// FIX: Monitor route ki kuda PYTHON_EXE explicit ga add cheyabadindi
app.get("/monitor/:port", (req, res) => {
  const port = req.params.port;
  if (!port || port === "null") return res.send("Please select a valid COM Port");
  
  const command = `start cmd /k "set "IDF_TOOLS_PATH=C:\\Espressif" && call "${IDF_BAT}" && cd /d "${PROJECT_PATH}" && "${PYTHON_EXE}" "${IDF_PY}" -p ${port} monitor"`;
  exec(command);
  
  res.send("Serial Monitor Opened on " + port);
});

app.listen(WEB_PORT, () => {
  console.log("M-OS Flasher Running -> http://localhost:" + WEB_PORT);
});
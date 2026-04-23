#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "nvs_flash.h"
#include "nvs.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"

#include "esp_http_client.h"
#include "driver/gpio.h"

#include "cJSON.h"

static const char *TAG = "M-OS";

/* ================= FIREBASE ================= */
#define FIREBASE_CONFIG_URL  "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app/mos_config.json"
#define FIREBASE_CMD_URL     "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app/commands/latest.json"

/* ============== DEFAULT WIFI ============== */
#define DEFAULT_WIFI_SSID ""
#define DEFAULT_WIFI_PASS ""

/* ============== GLOBALS ============== */
static char wifi_ssid[64] = DEFAULT_WIFI_SSID;
static char wifi_pass[64] = DEFAULT_WIFI_PASS;

static char http_buffer[8192];
static int http_len = 0;

static cJSON *g_root = NULL;

/* ========================================= */
/* NVS WIFI                                  */
/* ========================================= */
void load_wifi_from_nvs()
{
    nvs_handle_t nvs;
    size_t len;

    if (nvs_open("storage", NVS_READONLY, &nvs) == ESP_OK)
    {
        len = sizeof(wifi_ssid);
        nvs_get_str(nvs, "ssid", wifi_ssid, &len);

        len = sizeof(wifi_pass);
        nvs_get_str(nvs, "pass", wifi_pass, &len);

        nvs_close(nvs);
        ESP_LOGI(TAG, "WiFi loaded from NVS");
    }
}

void save_wifi_to_nvs(const char *ssid, const char *pass)
{
    nvs_handle_t nvs;

    if (nvs_open("storage", NVS_READWRITE, &nvs) == ESP_OK)
    {
        nvs_set_str(nvs, "ssid", ssid);
        nvs_set_str(nvs, "pass", pass);
        nvs_commit(nvs);
        nvs_close(nvs);

        ESP_LOGI(TAG, "WiFi saved");
    }
}

/* ========================================= */
/* WIFI                                      */
/* ========================================= */
static void wifi_event_handler(void *arg,
                               esp_event_base_t event_base,
                               int32_t event_id,
                               void *event_data)
{
    if (event_base == WIFI_EVENT &&
        event_id == WIFI_EVENT_STA_START)
    {
        esp_wifi_connect();
        ESP_LOGI(TAG, "Connecting WiFi...");
    }
    else if (event_base == WIFI_EVENT &&
             event_id == WIFI_EVENT_STA_DISCONNECTED)
    {
        esp_wifi_connect();
        ESP_LOGW(TAG, "WiFi Retry...");
    }
    else if (event_base == IP_EVENT &&
             event_id == IP_EVENT_STA_GOT_IP)
    {
        ESP_LOGI(TAG, "WiFi Connected");
    }
}

void wifi_init_sta()
{
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_instance_register(
        WIFI_EVENT,
        ESP_EVENT_ANY_ID,
        &wifi_event_handler,
        NULL,
        NULL);

    esp_event_handler_instance_register(
        IP_EVENT,
        IP_EVENT_STA_GOT_IP,
        &wifi_event_handler,
        NULL,
        NULL);

    wifi_config_t wifi_config = {0};

    strcpy((char *)wifi_config.sta.ssid, wifi_ssid);
    strcpy((char *)wifi_config.sta.password, wifi_pass);

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    esp_wifi_start();
}

/* ========================================= */
/* GPIO                                      */
/* ========================================= */
void setup_pin(int pin)
{
    if (pin <= 0) return;

    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
}

/* ========================================= */
/* ROOM CONFIG                               */
/* ========================================= */
void configure_rooms(cJSON *rooms)
{
    int room_count = cJSON_GetArraySize(rooms);

    for (int r = 0; r < room_count; r++)
    {
        cJSON *room = cJSON_GetArrayItem(rooms, r);
        if (!room) continue;

        cJSON *room_name = cJSON_GetObjectItem(room, "room");
        cJSON *pins = cJSON_GetObjectItem(room, "pins");

        if (room_name && cJSON_IsString(room_name))
        {
            ESP_LOGI(TAG, "Room: %s", room_name->valuestring);
        }

        if (pins && cJSON_IsArray(pins))
        {
            int count = cJSON_GetArraySize(pins);

            for (int i = 0; i < count; i++)
            {
                cJSON *pin = cJSON_GetArrayItem(pins, i);

                int gpio_num = 0;

                if (cJSON_IsNumber(pin))
                    gpio_num = pin->valueint;

                if (cJSON_IsString(pin))
                    gpio_num = atoi(pin->valuestring);

                setup_pin(gpio_num);

                ESP_LOGI(TAG, "Relay %d -> GPIO %d", i + 1, gpio_num);
            }
        }
    }
}

/* ========================================= */
/* CONFIG JSON                               */
/* ========================================= */
void parse_config_json(const char *json)
{
    if (g_root)
    {
        cJSON_Delete(g_root);
        g_root = NULL;
    }

    g_root = cJSON_Parse(json);

    if (!g_root)
    {
        ESP_LOGE(TAG, "Config JSON parse fail");
        return;
    }

    cJSON *credentials = cJSON_GetObjectItem(g_root, "credentials");

    if (credentials)
    {
        cJSON *ssid = cJSON_GetObjectItem(credentials, "ssid");
        cJSON *pass = cJSON_GetObjectItem(credentials, "pass");

        if (ssid && pass &&
            cJSON_IsString(ssid) &&
            cJSON_IsString(pass))
        {
            strcpy(wifi_ssid, ssid->valuestring);
            strcpy(wifi_pass, pass->valuestring);

            save_wifi_to_nvs(wifi_ssid, wifi_pass);
        }
    }

    cJSON *rooms = cJSON_GetObjectItem(g_root, "rooms");

    if (rooms && cJSON_IsArray(rooms))
    {
        configure_rooms(rooms);
    }
}

/* ========================================= */
/* COMMAND ENGINE                            */
/* ========================================= */
int find_pin(const char *room_name, const char *device_name)
{
    if (!g_root) return -1;

    cJSON *rooms = cJSON_GetObjectItem(g_root, "rooms");
    if (!rooms) return -1;

    int total_rooms = cJSON_GetArraySize(rooms);

    for (int r = 0; r < total_rooms; r++)
    {
        cJSON *room = cJSON_GetArrayItem(rooms, r);

        cJSON *roomItem = cJSON_GetObjectItem(room, "room");
        cJSON *devices  = cJSON_GetObjectItem(room, "devices");
        cJSON *pins     = cJSON_GetObjectItem(room, "pins");

        if (!roomItem || !devices || !pins) continue;

        if (strcasecmp(roomItem->valuestring, room_name) == 0)
        {
            int count = cJSON_GetArraySize(devices);

            for (int i = 0; i < count; i++)
            {
                cJSON *dev = cJSON_GetArrayItem(devices, i);

                if (dev && cJSON_IsString(dev))
                {
                    if (strcasecmp(dev->valuestring, device_name) == 0)
                    {
                        cJSON *pin = cJSON_GetArrayItem(pins, i);

                        if (cJSON_IsNumber(pin))
                            return pin->valueint;

                        if (cJSON_IsString(pin))
                            return atoi(pin->valuestring);
                    }
                }
            }
        }
    }

    return -1;
}

void execute_command(const char *room,
                     const char *device,
                     const char *action)
{
    int pin = find_pin(room, device);

    if (pin < 0)
    {
        ESP_LOGW(TAG, "Device not found");
        return;
    }

    if (strcasecmp(action, "ON") == 0)
    {
        gpio_set_level(pin, 1);
    }
    else if (strcasecmp(action, "OFF") == 0)
    {
        gpio_set_level(pin, 0);
    }
    else if (strcasecmp(action, "TOGGLE") == 0)
    {
        gpio_set_level(pin, !gpio_get_level(pin));
    }
    else if (strcasecmp(action, "RING") == 0)
    {
        gpio_set_level(pin, 1);
        vTaskDelay(pdMS_TO_TICKS(1000));
        gpio_set_level(pin, 0);
    }

    ESP_LOGI(TAG, "Executed: %s | %s | %s",
             room, device, action);
}

void parse_command_json(const char *json)
{
    cJSON *root = cJSON_Parse(json);
    if (!root) return;

    cJSON *room   = cJSON_GetObjectItem(root, "room");
    cJSON *device = cJSON_GetObjectItem(root, "device");
    cJSON *action = cJSON_GetObjectItem(root, "action");

    if (room && device && action)
    {
        execute_command(room->valuestring,
                        device->valuestring,
                        action->valuestring);
    }

    cJSON_Delete(root);
}

/* ========================================= */
/* HTTP GET                                  */
/* ========================================= */
esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    switch (evt->event_id)
    {
        case HTTP_EVENT_ON_DATA:

            if (!esp_http_client_is_chunked_response(evt->client))
            {
                if ((http_len + evt->data_len) < sizeof(http_buffer))
                {
                    memcpy(http_buffer + http_len,
                           evt->data,
                           evt->data_len);

                    http_len += evt->data_len;
                    http_buffer[http_len] = 0;
                }
            }

            break;

        default:
            break;
    }

    return ESP_OK;
}

void http_get_json(const char *url)
{
    http_len = 0;
    memset(http_buffer, 0, sizeof(http_buffer));

    esp_http_client_config_t config = {
        .url = url,
        .event_handler = http_event_handler,
        .timeout_ms = 8000
    };

    esp_http_client_handle_t client =
        esp_http_client_init(&config);

    esp_http_client_perform(client);
    esp_http_client_cleanup(client);
}

/* ========================================= */
/* TASKS                                     */
/* ========================================= */
void config_task(void *pv)
{
    while (1)
    {
        http_get_json(FIREBASE_CONFIG_URL);
        parse_config_json(http_buffer);

        ESP_LOGI(TAG, "Config Synced");

        vTaskDelay(pdMS_TO_TICKS(15000));
    }
}

void command_task(void *pv)
{
    while (1)
    {
        http_get_json(FIREBASE_CMD_URL);
        parse_command_json(http_buffer);

        vTaskDelay(pdMS_TO_TICKS(3000));
    }
}

/* ========================================= */
/* MAIN                                      */
/* ========================================= */
void app_main(void)
{
    esp_err_t ret = nvs_flash_init();

    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        nvs_flash_erase();
        nvs_flash_init();
    }

    ESP_LOGI(TAG, "=== M-OS BOOT ===");

    load_wifi_from_nvs();

    wifi_init_sta();

    vTaskDelay(pdMS_TO_TICKS(5000));

    xTaskCreate(config_task, "config_task", 8192, NULL, 5, NULL);
    xTaskCreate(command_task, "command_task", 8192, NULL, 5, NULL);
}
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

/* ================================
   FIREBASE CONFIG
================================ */
#define FIREBASE_URL "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app/mos_config.json"

/* ================================
   DEFAULT WIFI (fallback only)
================================ */
#define DEFAULT_WIFI_SSID "M-OS"
#define DEFAULT_WIFI_PASS "12345678"

/* ================================
   GLOBAL BUFFERS
================================ */
static char wifi_ssid[64] = DEFAULT_WIFI_SSID;
static char wifi_pass[64] = DEFAULT_WIFI_PASS;

static char http_buffer[8192];
static int http_len = 0;

/* =====================================================
   NVS SAVE / LOAD WIFI
===================================================== */
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
        ESP_LOGI(TAG, "Loaded WiFi from NVS");
    }
    else
    {
        ESP_LOGW(TAG, "Using default WiFi");
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

        ESP_LOGI(TAG, "WiFi saved to NVS");
    }
}

/* =====================================================
   WIFI EVENTS
===================================================== */
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

/* =====================================================
   RELAY CONFIG
===================================================== */
void setup_gpio_pin(int pin)
{
    if (pin <= 0)
        return;

    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
}

void configure_rooms(cJSON *rooms)
{
    int room_count = cJSON_GetArraySize(rooms);

    ESP_LOGI(TAG, "Rooms Found: %d", room_count);

    for (int r = 0; r < room_count; r++)
    {
        cJSON *room = cJSON_GetArrayItem(rooms, r);
        if (!room)
            continue;

        cJSON *room_name = cJSON_GetObjectItem(room, "room");
        cJSON *pins = cJSON_GetObjectItem(room, "pins");

        if (room_name && cJSON_IsString(room_name))
        {
            ESP_LOGI(TAG, "Room: %s", room_name->valuestring);
        }

        if (pins && cJSON_IsArray(pins))
        {
            int relay_count = cJSON_GetArraySize(pins);

            for (int i = 0; i < relay_count; i++)
            {
                cJSON *pin = cJSON_GetArrayItem(pins, i);

                int gpio_num = 0;

                if (cJSON_IsNumber(pin))
                    gpio_num = pin->valueint;

                if (cJSON_IsString(pin))
                    gpio_num = atoi(pin->valuestring);

                setup_gpio_pin(gpio_num);

                ESP_LOGI(TAG,
                         "Relay %d -> GPIO %d",
                         i + 1,
                         gpio_num);
            }
        }
    }
}

/* =====================================================
   JSON PARSER
===================================================== */
void parse_cloud_json(const char *json)
{
    cJSON *root = cJSON_Parse(json);

    if (!root)
    {
        ESP_LOGE(TAG, "JSON Parse Failed");
        return;
    }

    /* WiFi from cloud */
    cJSON *cred = cJSON_GetObjectItem(root, "credentials");

    if (cred)
    {
        cJSON *ssid = cJSON_GetObjectItem(cred, "ssid");
        cJSON *pass = cJSON_GetObjectItem(cred, "pass");

        if (ssid && pass &&
            cJSON_IsString(ssid) &&
            cJSON_IsString(pass))
        {
            strcpy(wifi_ssid, ssid->valuestring);
            strcpy(wifi_pass, pass->valuestring);

            save_wifi_to_nvs(wifi_ssid, wifi_pass);
        }
    }

    /* Rooms */
    cJSON *rooms = cJSON_GetObjectItem(root, "rooms");

    if (rooms && cJSON_IsArray(rooms))
    {
        configure_rooms(rooms);
    }

    cJSON_Delete(root);
}

/* =====================================================
   HTTP EVENTS
===================================================== */
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

    case HTTP_EVENT_ON_FINISH:

        parse_cloud_json(http_buffer);
        http_len = 0;
        memset(http_buffer, 0, sizeof(http_buffer));

        break;

    default:
        break;
    }

    return ESP_OK;
}

/* =====================================================
   FIREBASE TASK
===================================================== */
void firebase_task(void *pv)
{
    esp_http_client_config_t config = {
        .url = FIREBASE_URL,
        .event_handler = http_event_handler,
        .timeout_ms = 8000};

    while (1)
    {
        ESP_LOGI(TAG, "Syncing Cloud...");

        esp_http_client_handle_t client =
            esp_http_client_init(&config);

        esp_err_t err =
            esp_http_client_perform(client);

        if (err == ESP_OK)
        {
            ESP_LOGI(TAG, "Cloud Sync OK");
        }
        else
        {
            ESP_LOGE(TAG, "Cloud Sync Fail");
        }

        esp_http_client_cleanup(client);

        vTaskDelay(pdMS_TO_TICKS(15000));
    }
}

/* =====================================================
   MAIN
===================================================== */
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

    xTaskCreate(firebase_task,
                "firebase_task",
                8192,
                NULL,
                5,
                NULL);
}
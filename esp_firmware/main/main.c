#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include "driver/gpio.h"

static const char *TAG = "M-OS";

// ==========================================
// ENTER YOUR HOME WIFI DETAILS HERE
// ==========================================
#define WIFI_SSID "YOUR_WIFI_NAME_HERE"
#define WIFI_PASS "YOUR_WIFI_PASSWORD_HERE"

// YOUR FIREBASE URL
#define FIREBASE_URL "https://projectm-chinna-default-rtdb.asia-southeast1.firebasedatabase.app/mos_config.json"

// --- WiFi Connection Logic ---
static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        ESP_LOGI(TAG, "Connecting to WiFi...");
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();
        ESP_LOGI(TAG, "Disconnected. Retrying WiFi connection...");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "WiFi Connected Successfully! Ready for Cloud.");
    }
}

void wifi_init_sta(void) {
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL);
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    esp_wifi_start();
}

// --- Parse JSON and Configure Pins ---
void configure_relays_from_json(const char *json_string) {
    cJSON *root = cJSON_Parse(json_string);
    if (root == NULL) {
        ESP_LOGE(TAG, "Failed to parse JSON from Cloud");
        return;
    }

    cJSON *rooms = cJSON_GetObjectItem(root, "rooms");
    if (cJSON_IsArray(rooms)) {
        cJSON *room = cJSON_GetArrayItem(rooms, 0); // Checking the first room 
        if(room) {
            cJSON *pins = cJSON_GetObjectItem(room, "pins");
            if (cJSON_IsArray(pins)) {
                int relay_count = cJSON_GetArraySize(pins);
                ESP_LOGI(TAG, "Found %d Relays in Cloud Config", relay_count);

                for (int i = 0; i < relay_count; i++) {
                    cJSON *pin_item = cJSON_GetArrayItem(pins, i);
                    if (cJSON_IsString(pin_item) || cJSON_IsNumber(pin_item)) {
                        // Extract pin number from string (e.g., "4")
                        int pin_num = 0;
                        if(cJSON_IsString(pin_item)) pin_num = atoi(pin_item->valuestring);
                        if(cJSON_IsNumber(pin_item)) pin_num = pin_item->valueint;

                        if (pin_num > 0) {
                            // Set Hardware GPIO
                            gpio_reset_pin(pin_num);
                            gpio_set_direction(pin_num, GPIO_MODE_OUTPUT);
                            gpio_set_level(pin_num, 0); 
                            ESP_LOGI(TAG, "-> Hardware Pin GPIO %d Configured for Relay %d", pin_num, i+1);
                        }
                    }
                }
            }
        }
    }
    cJSON_Delete(root);
}

// --- Fetch Data from Firebase ---
esp_err_t _http_event_handler(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA) {
        if (!esp_http_client_is_chunked_response(evt->client)) {
            // Send the downloaded data to our JSON parser
            configure_relays_from_json((char*)evt->data);
        }
    }
    return ESP_OK;
}

void firebase_sync_task(void *pvParameters) {
    esp_http_client_config_t config = {
        .url = FIREBASE_URL,
        .event_handler = _http_event_handler,
    };
    
    while(1) {
        esp_http_client_handle_t client = esp_http_client_init(&config);
        esp_err_t err = esp_http_client_perform(client);
        
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "Cloud Sync Complete");
        } else {
            ESP_LOGE(TAG, "Cloud Sync Failed: %s", esp_err_to_name(err));
        }
        esp_http_client_cleanup(client);
        
        // Wait 10 seconds before checking the cloud again
        vTaskDelay(pdMS_TO_TICKS(10000)); 
    }
}

// --- Main Program Start ---
void app_main(void)
{
    // Initialize NVS (Required for WiFi)
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "=== M-OS Universal Firmware Booting ===");
    
    // Connect to WiFi
    wifi_init_sta();
    
    // Wait a few seconds for IP address assignment before starting Cloud check
    vTaskDelay(pdMS_TO_TICKS(5000)); 
    
    // Start the background task that continuously talks to Firebase
    xTaskCreate(&firebase_sync_task, "firebase_sync", 8192, NULL, 5, NULL);
}
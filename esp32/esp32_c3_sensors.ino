#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP085.h>

// =========================
// 1. Wi-Fi / API settings
// =========================
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Local test example:
// http://192.168.1.50:3000/api/readings
// Production example:
// https://your-iot-api.onrender.com/api/readings
const char* SERVER_URL = "https://YOUR-IOT-API.onrender.com/api/readings";
const char* API_KEY = "YOUR_LONG_RANDOM_API_KEY";
const char* DEVICE_ID = "esp32-c3-01";

// =========================
// 2. ESP32-C3 Mini pins
// =========================
// Common ESP32-C3 Mini / SuperMini mapping.
// Verify the labels on your exact board before wiring.
const int SDA_PIN = 8;
const int SCL_PIN = 9;
const int SOIL_PIN = 4;  // ADC input

// =========================
// 3. Soil calibration
// =========================
// Record the raw value in dry soil and wet soil and replace these.
const int SOIL_DRY = 3000;
const int SOIL_WET = 1200;

const unsigned long SEND_INTERVAL = 10000; // 10 seconds
unsigned long lastSend = 0;

Adafruit_AHTX0 aht;
Adafruit_BMP085 bmp;

float soilPercent(int raw) {
  if (SOIL_DRY == SOIL_WET) return 0;
  float p = 100.0f * (float)(SOIL_DRY - raw) / (float)(SOIL_DRY - SOIL_WET);
  return constrain(p, 0.0f, 100.0f);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("Wi-Fi connection failed.");
  }
}

void sendReading(float ahtTemp, float humidity, float bmpTemp, float pressure, int soilRaw, float soilPct) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  HTTPClient http;
  http.setTimeout(10000);
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"aht_temperature\":" + String(ahtTemp, 2) + ",";
  json += "\"humidity\":" + String(humidity, 2) + ",";
  json += "\"bmp_temperature\":" + String(bmpTemp, 2) + ",";
  json += "\"pressure\":" + String(pressure, 2) + ",";
  json += "\"soil_raw\":" + String(soilRaw) + ",";
  json += "\"soil_moisture\":" + String(soilPct, 2);
  json += "}";

  Serial.println("Sending JSON:");
  Serial.println(json);

  int code = http.POST(json);
  Serial.print("HTTP status: ");
  Serial.println(code);
  if (code > 0) {
    Serial.println(http.getString());
  } else {
    Serial.print("HTTP error: ");
    Serial.println(http.errorToString(code));
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println("\n=== ESP32-C3 IoT Monitor ===");

  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println("Starting AHT10...");
  if (!aht.begin()) {
    Serial.println("ERROR: AHT10 not detected. Check power, SDA and SCL.");
  } else {
    Serial.println("AHT10 OK");
  }

  Serial.println("Starting BMP180...");
  if (!bmp.begin()) {
    Serial.println("ERROR: BMP180 not detected. Check power, SDA and SCL.");
  } else {
    Serial.println("BMP180 OK");
  }

  analogReadResolution(12);
  connectWiFi();
}

void loop() {
  if (millis() - lastSend < SEND_INTERVAL) {
    delay(50);
    return;
  }
  lastSend = millis();

  sensors_event_t humidityEvent, tempEvent;
  aht.getEvent(&humidityEvent, &tempEvent);

  float ahtTemp = tempEvent.temperature;
  float humidity = humidityEvent.relative_humidity;
  float bmpTemp = bmp.readTemperature();
  float pressure = bmp.readPressure() / 100.0f;

  int soilRaw = analogRead(SOIL_PIN);
  float soilPct = soilPercent(soilRaw);

  Serial.println("----------------------------");
  Serial.printf("AHT10:  %.2f C | %.2f %%\n", ahtTemp, humidity);
  Serial.printf("BMP180: %.2f C | %.2f hPa\n", bmpTemp, pressure);
  Serial.printf("Soil:   raw=%d | %.2f %%\n", soilRaw, soilPct);

  sendReading(ahtTemp, humidity, bmpTemp, pressure, soilRaw, soilPct);
}

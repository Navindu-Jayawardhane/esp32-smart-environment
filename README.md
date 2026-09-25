# ESP32-C3 IoT Monitor

A GitHub-ready IoT monitoring project for an **ESP32-C3 Mini**, **AHT10**, **BMP180**, and **resistive soil-moisture sensor**.

## Architecture

```text
ESP32-C3 Mini
  ├─ AHT10
  ├─ BMP180
  └─ Soil moisture
        │ Wi-Fi / HTTPS JSON
        ▼
   Node.js + Express API (Render)
        │
        ▼
   PostgreSQL database
        │
        ▼
   Dashboard (GitHub Pages)
```

GitHub Pages hosts the static dashboard; it does not run the API/database. The Node API is intended for a server host such as Render.

## Repository structure

```text
.
├── dashboard/                 # GitHub Pages site
│   ├── index.html
│   └── config.js
├── esp32/                     # Arduino sketch
│   └── esp32_c3_sensors.ino
├── server/                    # Node.js REST API
│   ├── server.js
│   └── package.json
├── .github/workflows/pages.yml
├── render.yaml
├── docker-compose.yml         # Local PostgreSQL
├── .env.example
└── .gitignore
```

## 1. Create the GitHub repository

Create a new GitHub repository, for example:

`esp32-smart-environment`

Upload/push this repository to GitHub. Do **not** commit `.env`, passwords, API keys, or database credentials.

## 2. Publish the dashboard on GitHub Pages

In the repository:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

The included `.github/workflows/pages.yml` publishes only the `dashboard/` folder whenever you push to `main`.

After the workflow succeeds, GitHub will show the Pages URL under **Settings → Pages**.

Before the first deployment, edit `dashboard/config.js` and replace:

```js
API_BASE: 'https://YOUR-IOT-API.onrender.com'
```

with your real API URL.

## 3. Run the API locally

Install Node.js 20+.

Start PostgreSQL with Docker:

```bash
docker compose up -d postgres
```

Then from `server/`:

```bash
npm install
```

Set environment variables. On Windows PowerShell:

```powershell
$env:API_KEY="replace-with-a-long-random-secret"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iotdb"
$env:NODE_ENV="development"
npm start
```

The API will be available at:

`http://localhost:3000`

Test:

`http://localhost:3000/api/health`

## 4. Deploy the API to Render

Create a **Web Service** connected to this GitHub repository.

Use:

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Create a PostgreSQL database in your hosting provider and set these environment variables on the API service:

```text
DATABASE_URL=<your PostgreSQL connection string>
API_KEY=<long random secret>
NODE_ENV=production
```

Do not put `API_KEY` in GitHub or in the dashboard. The ESP32 uses it to authenticate its POST requests.

Render can automatically redeploy the service when changes are pushed to the connected Git branch.

## 5. Configure the ESP32-C3

Install these Arduino libraries through Library Manager:

- Adafruit AHTX0
- Adafruit BMP085 Library
- Adafruit Unified Sensor (if Arduino asks for it)

Open:

`esp32/esp32_c3_sensors.ino`

Set:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "https://your-iot-api.onrender.com/api/readings";
const char* API_KEY = "YOUR_LONG_RANDOM_API_KEY";
```

### ESP32-C3 Mini wiring used by this sketch

This sketch assumes the common ESP32-C3 Mini / SuperMini pin labels:

| Device | Pin | ESP32-C3 |
|---|---|---|
| AHT10 | SDA | GPIO 8 |
| AHT10 | SCL | GPIO 9 |
| BMP180 | SDA | GPIO 8 |
| BMP180 | SCL | GPIO 9 |
| Soil module | AO | GPIO 4 |
| All | GND | GND |
| AHT10/BMP180/soil module | VCC | 3.3V |

**Verify your exact board's printed pin labels before wiring.** ESP32-C3 Mini variants can differ.

The AHT10 and BMP180 share the same I²C bus.

The soil sensor uses its **AO** pin. `DO` is not required.

## 6. Soil calibration

Open Serial Monitor at 115200 baud.

Read the `Soil: raw=...` value with the probe in your dry reference soil and your wet reference soil. Replace:

```cpp
const int SOIL_DRY = 3000;
const int SOIL_WET = 1200;
```

with your measured values.

The resulting percentage is a calibrated sensor index, not a laboratory volumetric water-content measurement.

## API

### Health

`GET /api/health`

### Latest reading

`GET /api/latest?device=esp32-c3-01`

### Historical readings

`GET /api/readings?device=esp32-c3-01&limit=100`

### Devices

`GET /api/devices`

### Submit reading

`POST /api/readings`

Header:

`X-API-Key: <your API key>`

JSON body:

```json
{
  "device_id": "esp32-c3-01",
  "aht_temperature": 28.4,
  "humidity": 72.1,
  "bmp_temperature": 28.2,
  "pressure": 1008.6,
  "soil_raw": 1750,
  "soil_moisture": 63.2
}
```

## Security notes

- Never commit `.env` or API keys.
- Use HTTPS for the public API.
- Keep the ESP32 API key secret.
- The dashboard does not contain the API key; it only reads public sensor endpoints.
- If you later make the dashboard private, add user authentication rather than putting the ingestion API key in browser JavaScript.

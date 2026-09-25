import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || 'change-this-api-key';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Create a PostgreSQL database and set DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-API-Key'] }));
app.use(express.json({ limit: '32kb' }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS readings (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      aht_temperature DOUBLE PRECISION NOT NULL,
      humidity DOUBLE PRECISION NOT NULL,
      bmp_temperature DOUBLE PRECISION NOT NULL,
      pressure DOUBLE PRECISION NOT NULL,
      soil_raw INTEGER NOT NULL,
      soil_moisture DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_readings_device_time ON readings(device_id, timestamp DESC);
  `);
}

function requireApiKey(req, res, next) {
  if (!API_KEY || API_KEY === 'change-this-api-key' || req.get('X-API-Key') !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

function isNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'ESP32 IoT API', database: 'connected', time: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(503).json({ ok: false, service: 'ESP32 IoT API', database: 'error' });
  }
});

app.post('/api/readings', requireApiKey, async (req, res) => {
  const {
    device_id = 'esp32-c3-01',
    aht_temperature,
    humidity,
    bmp_temperature,
    pressure,
    soil_raw,
    soil_moisture
  } = req.body || {};

  if (!device_id || typeof device_id !== 'string' || device_id.length > 64) {
    return res.status(400).json({ error: 'Invalid device_id' });
  }
  if (!isNumber(aht_temperature, -40, 85)) return res.status(400).json({ error: 'Invalid aht_temperature' });
  if (!isNumber(humidity, 0, 100)) return res.status(400).json({ error: 'Invalid humidity' });
  if (!isNumber(bmp_temperature, -40, 85)) return res.status(400).json({ error: 'Invalid bmp_temperature' });
  if (!isNumber(pressure, 300, 1200)) return res.status(400).json({ error: 'Invalid pressure' });
  if (!Number.isInteger(soil_raw) || soil_raw < 0 || soil_raw > 4095) return res.status(400).json({ error: 'Invalid soil_raw' });
  if (!isNumber(soil_moisture, 0, 100)) return res.status(400).json({ error: 'Invalid soil_moisture' });

  try {
    const result = await pool.query(
      `INSERT INTO readings
       (device_id, aht_temperature, humidity, bmp_temperature, pressure, soil_raw, soil_moisture)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, timestamp`,
      [device_id, aht_temperature, humidity, bmp_temperature, pressure, soil_raw, soil_moisture]
    );
    res.status(201).json({ ok: true, id: result.rows[0].id, timestamp: result.rows[0].timestamp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database insert failed' });
  }
});

app.get('/api/latest', async (req, res) => {
  const device = String(req.query.device || 'esp32-c3-01');
  try {
    const result = await pool.query(
      `SELECT id, device_id, timestamp, aht_temperature, humidity, bmp_temperature, pressure, soil_raw, soil_moisture
       FROM readings WHERE device_id = $1 ORDER BY timestamp DESC, id DESC LIMIT 1`,
      [device]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No readings yet' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/api/readings', async (req, res) => {
  const device = String(req.query.device || 'esp32-c3-01');
  const requested = Number.parseInt(req.query.limit || '100', 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 100, 1), 1000);
  try {
    const result = await pool.query(
      `SELECT id, device_id, timestamp, aht_temperature, humidity, bmp_temperature, pressure, soil_raw, soil_moisture
       FROM readings WHERE device_id = $1 ORDER BY timestamp DESC, id DESC LIMIT $2`,
      [device, limit]
    );
    res.json(result.rows.reverse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/api/devices', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT device_id, COUNT(*)::integer AS reading_count, MAX(timestamp) AS last_seen
       FROM readings GROUP BY device_id ORDER BY device_id`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/', (_req, res) => res.json({ service: 'ESP32 IoT API', docs: '/api/health' }));

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ESP32 IoT API listening on port ${PORT}`);
      console.log(`API key: ${API_KEY === 'change-this-api-key' ? 'NOT CONFIGURED' : 'configured'}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

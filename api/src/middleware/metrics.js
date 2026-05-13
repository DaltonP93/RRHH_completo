/**
 * metrics.js — Prometheus metrics para la API SisHoras.
 *
 * Expone /metrics compatible con Prometheus scrape.
 * Usa prom-client si está disponible; si no, genera métricas manuales.
 *
 * Métricas:
 *   sishoras_http_requests_total{method,route,status}   Counter
 *   sishoras_http_request_duration_seconds{method,route} Histogram
 *   sishoras_active_sockets                              Gauge
 *   sishoras_payroll_runs_total{status}                  Counter
 *   sishoras_attendance_events_total{type}               Counter
 *   process_* (CPU, memoria)                             auto via prom-client
 */

let promClient = null;
let httpRequestsTotal = null;
let httpRequestDuration = null;
let activeSockets = null;
let payrollRunsTotal = null;
let attendanceEventsTotal = null;
let metricsEnabled = false;

try {
  promClient = require('prom-client');
  const register = promClient.register;

  promClient.collectDefaultMetrics({ prefix: 'sishoras_' });

  httpRequestsTotal = new promClient.Counter({
    name: 'sishoras_http_requests_total',
    help: 'Total de solicitudes HTTP',
    labelNames: ['method', 'route', 'status'],
  });

  httpRequestDuration = new promClient.Histogram({
    name: 'sishoras_http_request_duration_seconds',
    help: 'Duración de solicitudes HTTP en segundos',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  });

  activeSockets = new promClient.Gauge({
    name: 'sishoras_active_sockets',
    help: 'Conexiones Socket.io activas',
  });

  payrollRunsTotal = new promClient.Counter({
    name: 'sishoras_payroll_runs_total',
    help: 'Total de liquidaciones de nómina procesadas',
    labelNames: ['status'],
  });

  attendanceEventsTotal = new promClient.Counter({
    name: 'sishoras_attendance_events_total',
    help: 'Total de marcaciones de asistencia procesadas',
    labelNames: ['type', 'source'],
  });

  metricsEnabled = true;
} catch {
  // prom-client no instalado — métricas deshabilitadas
}

// ─── Middleware de métricas HTTP ──────────────────────────────────
function metricsMiddleware(req, res, next) {
  if (!metricsEnabled) return next();

  const start = Date.now();
  const route = req.route?.path || req.path || 'unknown';
  const method = req.method;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal?.labels(method, route, String(res.statusCode)).inc();
    httpRequestDuration?.labels(method, route).observe(duration);
  });

  next();
}

// ─── Endpoint /metrics ────────────────────────────────────────────
async function metricsHandler(req, res) {
  if (!metricsEnabled || !promClient) {
    return res.status(503).send('# prom-client no instalado\n# Instalar con: npm install prom-client\n');
  }
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
}

// ─── Incrementar contadores desde otros módulos ───────────────────
function incPayrollRun(status) {
  payrollRunsTotal?.labels(status).inc();
}

function incAttendanceEvent(type, source = 'api') {
  attendanceEventsTotal?.labels(type, source).inc();
}

function setActiveSockets(count) {
  activeSockets?.set(count);
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  incPayrollRun,
  incAttendanceEvent,
  setActiveSockets,
  metricsEnabled: () => metricsEnabled,
};

# Guía de Integración — Sistema de Asistencia
## Conectar con cualquier sistema externo

---

## Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────┐
│              SISTEMA DE ASISTENCIA                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐  │
│  │ REST API │  │WebSockets│  │     Webhooks        │  │
│  │ :4000    │  │ Socket.io│  │ (HTTP POST a tu URL)│  │
│  └────┬─────┘  └────┬─────┘  └──────────┬──────────┘  │
└───────┼─────────────┼──────────────────── ┼─────────────┘
        │             │                     │
        ▼             ▼                     ▼
  Oracle APEX    Dashboard           ERP / Nómina
  SAP / ERP      propio              Otros sistemas
  Power BI       React               Notificaciones
  Excel          Angular
```

---

## Métodos de Integración Disponibles

### 1. REST API (más común)
- Autenticación: `X-API-Key` header
- Formato: JSON
- Documentación interactiva: `http://TU_SERVIDOR:4000/api/docs`
- Schema JSON: `http://TU_SERVIDOR:4000/api/docs.json`

### 2. WebSockets (tiempo real)
- URL: `ws://TU_SERVIDOR:4000`
- Protocolo: Socket.io
- Requiere token JWT
- Eventos: `attendance:new`, `alert:late`, `device:status`

### 3. Webhooks (push — el sistema te notifica)
- Registra tu URL en `POST /api/webhooks`
- El sistema hace POST a tu URL con cada marcaje
- Firma HMAC-SHA256 para verificar autenticidad

---

## Autenticación

### Para integraciones sistema-a-sistema: API Key

```bash
# Header requerido en todos los requests de integración
X-API-Key: TU_CLAVE_API_AQUI
```

Configura la clave en el `.env`:
```
INTEGRATION_API_KEY=genera_una_clave_segura_aqui
```

### Para aplicaciones de usuario: JWT

```bash
# 1. Login
POST /api/auth/login
{"username": "admin", "password": "Admin1234!"}

# Respuesta: {"accessToken": "eyJ...", "refreshToken": "..."}

# 2. Usar el token
Authorization: Bearer eyJ...
```

---

## Ejemplos por Lenguaje / Plataforma

### JavaScript / Node.js

```javascript
const axios = require('axios');

const API = axios.create({
  baseURL: 'http://TU_SERVIDOR:4000',
  headers: { 'X-API-Key': 'TU_CLAVE_API' }
});

// Obtener asistencia de hoy
const hoy = await API.get('/api/integration/attendance/today');
console.log(hoy.data.data);

// Registrar marcaje
await API.post('/api/integration/checkin', {
  employee_code: '1089',
  type: 'in'
});
```

### Python

```python
import requests

API_BASE = 'http://TU_SERVIDOR:4000'
HEADERS  = {'X-API-Key': 'TU_CLAVE_API', 'Content-Type': 'application/json'}

# Asistencia de hoy
response = requests.get(f'{API_BASE}/api/integration/attendance/today', headers=HEADERS)
empleados = response.json()['data']
for emp in empleados:
    print(f"{emp['employee_name']}: {emp['status']} - Entrada: {emp['first_in']}")

# Reporte mensual
params = {'date_from': '2026-04-01', 'date_to': '2026-04-30'}
reporte = requests.get(f'{API_BASE}/api/integration/attendance/range',
                       headers=HEADERS, params=params)
print(reporte.json())
```

### PHP

```php
<?php
$apiBase = 'http://TU_SERVIDOR:4000';
$apiKey  = 'TU_CLAVE_API';

function apiGet($endpoint) {
    global $apiBase, $apiKey;
    $ch = curl_init("$apiBase$endpoint");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "X-API-Key: $apiKey",
            'Accept: application/json'
        ]
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}

// Obtener empleados
$empleados = apiGet('/api/integration/employees');
foreach ($empleados['data'] as $emp) {
    echo $emp['full_name'] . ' - ' . $emp['department'] . PHP_EOL;
}

// Asistencia del día
$hoy = apiGet('/api/integration/attendance/today');
echo "Presentes hoy: " . $hoy['data'][0]['status'];
?>
```

### C# / .NET

```csharp
using System.Net.Http;
using System.Net.Http.Json;

var client = new HttpClient();
client.BaseAddress = new Uri("http://TU_SERVIDOR:4000");
client.DefaultRequestHeaders.Add("X-API-Key", "TU_CLAVE_API");

// Asistencia de hoy
var response = await client.GetFromJsonAsync<AsistenciaResponse>(
    "/api/integration/attendance/today");

foreach (var emp in response.Data) {
    Console.WriteLine($"{emp.EmployeeName}: {emp.Status}");
}

// Registrar marcaje
var marcaje = new { employee_code = "1089", type = "in" };
await client.PostAsJsonAsync("/api/integration/checkin", marcaje);

// Modelos
record AsistenciaResponse(int Total, List<Empleado> Data);
record Empleado(int EmployeeId, string EmployeeName, string Department,
                string Status, string FirstIn, string LastOut,
                int WorkedMinutes, int LateMinutes);
```

### Java / Spring Boot

```java
@Service
public class AsistenciaClient {

    private final RestTemplate restTemplate;
    private final String apiBase = "http://TU_SERVIDOR:4000";
    private final String apiKey  = "TU_CLAVE_API";

    private HttpHeaders getHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-Key", apiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    public Map<String, Object> getAsistenciaHoy() {
        HttpEntity<String> entity = new HttpEntity<>(getHeaders());
        ResponseEntity<Map> response = restTemplate.exchange(
            apiBase + "/api/integration/attendance/today",
            HttpMethod.GET, entity, Map.class
        );
        return response.getBody();
    }

    public void registrarMarcaje(String employeeCode, String tipo) {
        Map<String, String> body = Map.of(
            "employee_code", employeeCode,
            "type", tipo
        );
        HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, getHeaders());
        restTemplate.postForEntity(
            apiBase + "/api/integration/checkin",
            entity, Map.class
        );
    }
}
```

### Power BI

```
1. En Power BI Desktop → Obtener datos → Web
2. URL: http://TU_SERVIDOR:4000/api/integration/attendance/today
3. Avanzado → Encabezados HTTP:
   Nombre: X-API-Key
   Valor:  TU_CLAVE_API
4. Seleccionar tabla: data
5. Expandir columnas y cargar

Para actualización automática:
- Publicar en Power BI Service
- Configurar Gateway de datos
- Programar actualización cada 30 min
```

---

## Webhooks — Verificar Autenticidad

Cuando el sistema envía un webhook, incluye una firma en el header
`X-Webhook-Signature`. Verifica en tu receptor:

### Node.js
```javascript
const crypto = require('crypto');

function verificarWebhook(body, signature, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature), Buffer.from(expected)
  );
}

// En tu endpoint receptor:
app.post('/webhook/asistencia', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  if (!verificarWebhook(req.body, sig, 'MI_SECRETO')) {
    return res.status(401).send('Firma inválida');
  }
  const evento = JSON.parse(req.body);
  console.log('Marcaje recibido:', evento.data);
  res.json({ ok: true });
});
```

### Python
```python
import hmac, hashlib

def verificar_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

# Flask example
@app.route('/webhook/asistencia', methods=['POST'])
def webhook():
    sig = request.headers.get('X-Webhook-Signature', '')
    if not verificar_webhook(request.get_data(), sig, 'MI_SECRETO'):
        return jsonify(error='Firma inválida'), 401
    evento = request.json
    print('Marcaje:', evento['data']['employeeName'], evento['data']['type'])
    return jsonify(ok=True)
```

---

## Eventos de Webhook

| Evento                  | Cuándo se dispara                           |
|-------------------------|---------------------------------------------|
| `attendance.checkin`    | Empleado marca entrada (reloj o app móvil)  |
| `attendance.checkout`   | Empleado marca salida                       |
| `alert.late`            | Empleado llegó tarde                        |
| `alert.absent`          | Empleado no marcó después de X hora         |
| `device.online`         | Reloj ZKTeco se conectó                     |
| `device.offline`        | Reloj ZKTeco perdió conexión                |
| `webhook.test`          | Evento de prueba manual                     |

---

## Roadmap de Integraciones Futuras

- [ ] **SAP HR** — módulo de asistencia vía IDoc/BAPI
- [ ] **Netsuite** — REST Connector para nómina
- [ ] **Google Workspace** — Sheets en tiempo real
- [ ] **Microsoft Teams** — Alertas de ausencias
- [ ] **Slack** — Notificaciones de retardos
- [ ] **GraphQL** — API alternativa para queries flexibles

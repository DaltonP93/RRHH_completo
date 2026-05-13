'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { icon: string; color: string; desc: string }> = {
  INTERNAL:  { icon: '🔔', color: 'bg-blue-100 text-blue-700',    desc: 'Campana dentro del sistema' },
  EMAIL:     { icon: '📧', color: 'bg-indigo-100 text-indigo-700', desc: 'Correo electrónico SMTP' },
  WHATSAPP:  { icon: '💬', color: 'bg-green-100 text-green-700',   desc: 'WhatsApp (WAHA / Meta Cloud)' },
  TELEGRAM:  { icon: '✈️', color: 'bg-sky-100 text-sky-700',       desc: 'Telegram Bot API' },
  SMS:       { icon: '📱', color: 'bg-orange-100 text-orange-700', desc: 'SMS via gateway HTTP/SMPP' },
  PUSH_WEB:  { icon: '🌐', color: 'bg-purple-100 text-purple-700', desc: 'Push Web/PWA (Service Worker)' },
  WEBHOOK:   { icon: '🔗', color: 'bg-gray-100 text-gray-700',     desc: 'Webhook HTTP saliente' },
};

const CATEGORY_COLORS: Record<string, string> = {
  RRHH:         'bg-blue-50 text-blue-800 border-blue-200',
  ASISTENCIA:   'bg-amber-50 text-amber-800 border-amber-200',
  NOMINA:       'bg-green-50 text-green-800 border-green-200',
  VACACIONES:   'bg-teal-50 text-teal-800 border-teal-200',
  PERMISOS:     'bg-violet-50 text-violet-800 border-violet-200',
  DOCUMENTOS:   'bg-orange-50 text-orange-800 border-orange-200',
  COMPETENCIAS: 'bg-pink-50 text-pink-800 border-pink-200',
  CUMPLIMIENTO: 'bg-red-50 text-red-800 border-red-200',
  SISTEMA:      'bg-gray-50 text-gray-700 border-gray-200',
};

const SEVERITY_BADGE: Record<string, string> = {
  info:     'bg-blue-100 text-blue-600',
  warning:  'bg-yellow-100 text-yellow-700',
  critical: 'bg-red-100 text-red-700',
};

const QUEUE_STATUS_COLORS: Record<string, string> = {
  queued:    'bg-yellow-100 text-yellow-700',
  sending:   'bg-blue-100 text-blue-700',
  sent:      'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const CONFIG_FIELDS: Record<string, Array<{key: string; label: string; type?: string; hint?: string}>> = {
  EMAIL:    [
    { key: 'host',     label: 'Host SMTP',      hint: 'smtp.office365.com' },
    { key: 'port',     label: 'Puerto',          hint: '587' },
    { key: 'user',     label: 'Usuario/Email',   hint: 'notificaciones@empresa.com' },
    { key: 'password', label: 'Contraseña',      type: 'password' },
    { key: 'from',     label: 'Remitente',       hint: 'RRHH <no-reply@empresa.com>' },
    { key: 'tls',      label: 'TLS/STARTTLS',    hint: 'true' },
  ],
  WHATSAPP: [
    { key: 'provider', label: 'Proveedor',       hint: 'WAHA o META' },
    { key: 'api_url',  label: 'URL API',         hint: 'http://localhost:3000' },
    { key: 'session',  label: 'Sesión WAHA',     hint: 'default' },
    { key: 'api_key',  label: 'API Key / Token', type: 'password' },
    { key: 'phone_id', label: 'Phone ID (Meta)', hint: '1234567890' },
  ],
  TELEGRAM: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', hint: '123456:ABC...' },
  ],
  SMS: [
    { key: 'provider', label: 'Proveedor', hint: 'Nombre del gateway' },
    { key: 'api_url',  label: 'URL API',   hint: 'https://sms.provider.com/send' },
    { key: 'api_key',  label: 'API Key',   type: 'password' },
  ],
  WEBHOOK: [
    { key: 'url',    label: 'URL destino', hint: 'https://hooks.empresa.com/rrhh' },
    { key: 'secret', label: 'Secret HMAC', type: 'password' },
    { key: 'method', label: 'Método HTTP', hint: 'POST' },
  ],
  PUSH_WEB: [
    { key: 'vapid_public',  label: 'VAPID Public Key',  hint: 'Generada con web-push' },
    { key: 'vapid_private', label: 'VAPID Private Key', type: 'password' },
    { key: 'vapid_email',   label: 'Email VAPID',       hint: 'admin@empresa.com' },
  ],
};

type TabId = 'canales' | 'matriz' | 'plantillas' | 'cola' | 'logs';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificacionesConfigPage() {
  const [tab, setTab]                       = useState<TabId>('canales');
  const [channels, setChannels]             = useState<any[]>([]);
  const [matrix, setMatrix]                 = useState<any[]>([]);
  const [matrixChannels, setMatrixChannels] = useState<any[]>([]);
  const [templates, setTemplates]           = useState<any[]>([]);
  const [queue, setQueue]                   = useState<any[]>([]);
  const [logs, setLogs]                     = useState<any[]>([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelConfigForm, setChannelConfigForm] = useState<Record<string, string>>({});
  const [editingTemplate, setEditingTemplate]     = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterChannel, setFilterChannel]   = useState('');
  const [queueStatus, setQueueStatus]       = useState('');

  const loadChannels   = useCallback(async () => {
    const r = await fetch(`${API}/api/notification-channels`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setChannels(Array.isArray(d) ? d : d.channels || []); }
  }, []);

  const loadMatrix = useCallback(async () => {
    const r = await fetch(`${API}/api/notification-matrix`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setMatrix(d.events || []); setMatrixChannels(d.channels || []); }
  }, []);

  const loadTemplates = useCallback(async () => {
    const r = await fetch(`${API}/api/notification-templates-mgmt`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setTemplates(Array.isArray(d) ? d : d.templates || []); }
  }, []);

  const loadQueue = useCallback(async () => {
    const qs = queueStatus ? `?status=${queueStatus}&limit=80` : '?limit=80';
    const r = await fetch(`${API}/api/notification-queue${qs}`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setQueue(Array.isArray(d) ? d : d.queue || []); }
  }, [queueStatus]);

  const loadLogs = useCallback(async () => {
    const r = await fetch(`${API}/api/notification-delivery-logs`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setLogs(Array.isArray(d) ? d : []); }
  }, []);

  useEffect(() => {
    setLoading(true);
    const map: Record<TabId, () => Promise<void>> = { canales: loadChannels, matriz: loadMatrix, plantillas: loadTemplates, cola: loadQueue, logs: loadLogs };
    map[tab]?.().finally(() => setLoading(false));
  }, [tab, loadChannels, loadMatrix, loadTemplates, loadQueue, loadLogs]);

  async function toggleChannel(code: string, enabled: boolean) {
    await fetch(`${API}/api/notification-channels/${code}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ enabled }) });
    loadChannels();
  }

  function openChannelConfig(ch: any) {
    setEditingChannel(ch.code);
    const cfg = ch.config_json || {};
    const form: Record<string, string> = {};
    for (const f of CONFIG_FIELDS[ch.code] || []) form[f.key] = cfg[f.key] === '***' ? '' : (cfg[f.key] || '');
    setChannelConfigForm(form);
  }

  async function saveChannelConfig() {
    if (!editingChannel) return;
    setSaving(true);
    await fetch(`${API}/api/notification-channels/${editingChannel}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ config_json: channelConfigForm }),
    });
    setSaving(false);
    setEditingChannel(null);
    loadChannels();
  }

  async function toggleMatrix(event_code: string, channel_code: string, current: boolean) {
    await fetch(`${API}/api/notification-matrix`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ event_code, channel_code, enabled: !current }),
    });
    loadMatrix();
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    setSaving(true);
    const method = editingTemplate.id ? 'PUT' : 'POST';
    const url    = editingTemplate.id
      ? `${API}/api/notification-templates-mgmt/${editingTemplate.id}`
      : `${API}/api/notification-templates-mgmt`;
    await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(editingTemplate) });
    setSaving(false);
    setEditingTemplate(null);
    loadTemplates();
    if (tab === 'matriz') loadMatrix();
  }

  async function retryQueue(id: number) {
    const r = await fetch(`${API}/api/notification-queue/${id}/retry`, { method: 'POST', headers: authHeaders() });
    if (r.ok) loadQueue(); else alert('Error al reintentar');
  }

  const categories = Array.from(new Set(matrix.map((e: any) => e.category))).sort();
  const filteredMatrix = matrix.filter((e: any) =>
    (!filterCategory || e.category === filterCategory) &&
    (!filterChannel  || e.channels.some((c: any) => c.channel_code === filterChannel))
  );

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'canales',    label: '📡 Canales' },
    { id: 'matriz',     label: '⚙️ Eventos × Canales' },
    { id: 'plantillas', label: '📝 Plantillas' },
    { id: 'cola',       label: '📬 Cola' },
    { id: 'logs',       label: '📋 Historial' },
  ];

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notificaciones Multicanal</h1>
        <p className="text-sm text-gray-500 mt-1">Configuración granular: canales, eventos, plantillas, cola y preferencias</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? 'bg-white border border-b-white border-gray-200 -mb-px text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Cargando...</div>}

      {/* ── CANALES ─────────────────────────────────────────────────────────── */}
      {!loading && tab === 'canales' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Habilite o deshabilite canales de envío y configure sus credenciales. Los canales deshabilitados no recibirán ningún evento aunque la plantilla esté activa.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {channels.map((ch: any) => {
              const meta = CHANNEL_META[ch.code] || { icon: '📣', color: 'bg-gray-100 text-gray-600', desc: ch.name };
              const hasConfig = (CONFIG_FIELDS[ch.code] || []).length > 0;
              const visibleConfig = ch.config_json
                ? Object.entries(ch.config_json).filter(([k]) => !['password','api_key','secret','token','bot_token','vapid_private'].includes(k))
                : [];
              return (
                <div key={ch.code} className={`bg-white rounded-2xl border p-5 transition-all ${ch.enabled ? 'border-blue-200 shadow-sm' : 'border-gray-100 opacity-60'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{ch.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
                      </div>
                    </div>
                    <button onClick={() => toggleChannel(ch.code, !ch.enabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${ch.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ch.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                    </button>
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block font-medium mb-3 ${meta.color}`}>
                    {ch.enabled ? 'Habilitado' : 'Deshabilitado'}
                  </div>
                  {visibleConfig.slice(0, 3).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-400">{k}</span>
                      <span className="font-mono text-gray-600 truncate max-w-40">{String(v)}</span>
                    </div>
                  ))}
                  {hasConfig && (
                    <button onClick={() => openChannelConfig(ch)}
                      className="w-full mt-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                      ⚙️ Configurar credenciales
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MATRIZ EVENTOS × CANALES ─────────────────────────────────────────── */}
      {!loading && tab === 'matriz' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">Todos los canales</option>
              {matrixChannels.map((ch: any) => <option key={ch.code} value={ch.code}>{CHANNEL_META[ch.code]?.icon} {ch.name}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filteredMatrix.length} eventos · Clic en celda para activar/desactivar plantilla</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-72 sticky left-0 bg-gray-50">Evento</th>
                  {matrixChannels.map((ch: any) => (
                    <th key={ch.code} className="px-3 py-3 text-center font-medium text-gray-600 min-w-[72px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-base">{CHANNEL_META[ch.code]?.icon || '📣'}</span>
                        <span className="text-xs leading-tight">{ch.name.split(' ')[0]}</span>
                        {!ch.enabled && <span className="text-xs text-red-400 font-normal">off</span>}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatrix.map((ev: any, i: number) => {
                  const prevCat = i > 0 ? filteredMatrix[i - 1].category : null;
                  return (
                    <>
                      {ev.category !== prevCat && (
                        <tr key={`hd-${ev.category}`}>
                          <td colSpan={matrixChannels.length + 2}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider border-t border-b ${CATEGORY_COLORS[ev.category] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {ev.category}
                          </td>
                        </tr>
                      )}
                      <tr key={ev.event_code} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 sticky left-0 bg-white">
                          <p className="font-medium text-gray-800">{ev.name}</p>
                          {ev.description && <p className="text-xs text-gray-400 mt-0.5 max-w-xs line-clamp-1">{ev.description}</p>}
                        </td>
                        {ev.channels.map((ch: any) => {
                          const isActive   = !!ch.template?.enabled;
                          const hasTemplate = !!ch.template;
                          return (
                            <td key={ch.channel_code} className="px-3 py-3 text-center">
                              <button
                                onClick={() => toggleMatrix(ev.event_code, ch.channel_code, isActive)}
                                disabled={!ch.channel_enabled}
                                title={
                                  !ch.channel_enabled ? 'Canal deshabilitado (ve a pestaña Canales)' :
                                  isActive ? 'Activo — clic para desactivar' :
                                  hasTemplate ? 'Inactivo — clic para activar' : 'Sin plantilla — clic para crear'
                                }
                                className={`w-9 h-9 rounded-full text-sm font-bold transition-all mx-auto flex items-center justify-center border-2
                                  ${!ch.channel_enabled
                                    ? 'border-transparent bg-gray-100 text-gray-300 cursor-not-allowed'
                                    : isActive
                                    ? 'border-green-400 bg-green-500 text-white hover:bg-green-600 shadow'
                                    : hasTemplate
                                    ? 'border-gray-300 bg-white text-gray-400 hover:bg-gray-100'
                                    : 'border-dashed border-gray-200 bg-transparent text-gray-300 hover:border-gray-400'}`}>
                                {!ch.channel_enabled ? '—' : isActive ? '✓' : hasTemplate ? '○' : '+'}
                              </button>
                              {ch.opted_out_users > 0 && (
                                <p className="text-xs text-orange-500 mt-0.5" title="Usuarios que optaron por no recibir este evento">{ch.opted_out_users} opt-out</p>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[ev.severity] || 'bg-gray-100 text-gray-600'}`}>
                            {ev.severity}
                          </span>
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
            {filteredMatrix.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin eventos para los filtros seleccionados</p>}
          </div>

          <div className="mt-3 flex gap-5 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-5 rounded-full bg-green-500 text-white text-center leading-5 text-xs">✓</span> Plantilla activa</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-5 rounded-full bg-white border-2 border-gray-300 text-center leading-4 text-xs text-gray-400">○</span> Plantilla inactiva</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-5 rounded-full border-2 border-dashed border-gray-200 text-center leading-4 text-xs text-gray-300">+</span> Sin plantilla (clic para crear)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-5 rounded-full bg-gray-100 text-gray-300 text-center leading-5 text-xs">—</span> Canal deshabilitado</span>
          </div>
        </div>
      )}

      {/* ── PLANTILLAS ──────────────────────────────────────────────────────── */}
      {!loading && tab === 'plantillas' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              Edite el asunto y cuerpo de cada mensaje. Use <code className="bg-gray-100 px-1 rounded text-xs">{`{{variable}}`}</code> para datos dinámicos.
            </p>
            <button onClick={() => setEditingTemplate({ event_code:'', channel_code:'INTERNAL', name:'', subject_template:'', body_template:'', enabled: 1 })}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              + Nueva plantilla
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
            {templates.map((t: any) => (
              <div key={t.id} className="px-5 py-4 flex items-start gap-4">
                <span className="text-xl mt-0.5 shrink-0">{CHANNEL_META[t.channel_code]?.icon || '📣'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 text-sm">{t.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">{t.event_code}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t.channel_code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.enabled ? 'activa' : 'inactiva'}
                    </span>
                  </div>
                  {t.subject_template && <p className="text-xs text-gray-500 mb-0.5">Asunto: <span className="font-mono">{t.subject_template}</span></p>}
                  <p className="text-xs text-gray-400 line-clamp-2 font-mono">{t.body_template}</p>
                </div>
                <button onClick={() => setEditingTemplate({ ...t })}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0">
                  Editar
                </button>
              </div>
            ))}
            {templates.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin plantillas aún. Créalas desde la pestaña Eventos × Canales.</p>}
          </div>
        </div>
      )}

      {/* ── COLA ────────────────────────────────────────────────────────────── */}
      {!loading && tab === 'cola' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['', 'queued', 'sending', 'sent', 'failed', 'cancelled'].map(s => (
              <button key={s} onClick={() => setQueueStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${queueStatus === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {s === '' ? 'Todos' : s}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
            {queue.map((q: any) => (
              <div key={q.id} className="px-5 py-3 flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${QUEUE_STATUS_COLORS[q.status] || ''}`}>{q.status}</span>
                <span className="text-lg shrink-0">{CHANNEL_META[q.channel_code]?.icon || '📣'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{q.subject || (q.body || '').slice(0, 70) || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Para: {q.recipient_address} · {q.channel_code} · Intentos: {q.attempts}/{q.max_attempts}</p>
                  {q.error_message && <p className="text-xs text-red-500 mt-0.5 truncate">{q.error_message}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{q.scheduled_at ? new Date(q.scheduled_at).toLocaleString('es-PY') : ''}</span>
                {q.status === 'failed' && (
                  <button onClick={() => retryQueue(q.id)}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 shrink-0">↺</button>
                )}
              </div>
            ))}
            {queue.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin elementos en la cola</p>}
          </div>
        </div>
      )}

      {/* ── HISTORIAL ────────────────────────────────────────────────────────── */}
      {!loading && tab === 'logs' && (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
          {logs.map((l: any) => (
            <div key={l.id} className="px-5 py-3 flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${l.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {l.status === 'success' ? '✓ OK' : '✗ Error'}
              </span>
              <span className="text-lg shrink-0">{CHANNEL_META[l.channel_code]?.icon || '📣'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">Cola #{l.queue_id} · {l.provider || l.channel_code}</p>
                <p className="text-xs text-gray-400">Para: {l.recipient_address}{l.http_status ? ` · HTTP ${l.http_status}` : ''}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{l.created_at ? new Date(l.created_at).toLocaleString('es-PY') : ''}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin registros de entrega aún</p>}
        </div>
      )}

      {/* ── MODAL: Channel Config ────────────────────────────────────────────── */}
      {editingChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-1">Configurar {channels.find(c => c.code === editingChannel)?.name}</h2>
            <p className="text-xs text-gray-400 mb-4">Las credenciales se guardan en la BD. Se muestran enmascaradas al leer.</p>
            <div className="space-y-3">
              {(CONFIG_FIELDS[editingChannel] || []).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={channelConfigForm[f.key] || ''}
                    onChange={e => setChannelConfigForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.hint}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveChannelConfig} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar configuración'}
              </button>
              <button onClick={() => setEditingChannel(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Template Editor ───────────────────────────────────────────── */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl my-4">
            <h2 className="text-lg font-bold mb-4">{editingTemplate.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de evento <span className="text-red-500">*</span></label>
                <input value={editingTemplate.event_code}
                  onChange={e => setEditingTemplate((p: any) => ({ ...p, event_code: e.target.value }))}
                  placeholder="EMPLOYEE_CREATED" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Canal <span className="text-red-500">*</span></label>
                <select value={editingTemplate.channel_code}
                  onChange={e => setEditingTemplate((p: any) => ({ ...p, channel_code: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(CHANNEL_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.icon} {k}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
              <input value={editingTemplate.name}
                onChange={e => setEditingTemplate((p: any) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Asunto (EMAIL y PUSH_WEB)</label>
              <input value={editingTemplate.subject_template || ''}
                onChange={e => setEditingTemplate((p: any) => ({ ...p, subject_template: e.target.value }))}
                placeholder="Ej: Hola {{employee.first_name}}, tiene una novedad"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuerpo del mensaje <span className="text-red-500">*</span></label>
              <textarea value={editingTemplate.body_template}
                onChange={e => setEditingTemplate((p: any) => ({ ...p, body_template: e.target.value }))}
                rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y"/>
            </div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">Insertar variable:</p>
              <div className="flex flex-wrap gap-1">
                {[
                  '{{employee.full_name}}','{{employee.first_name}}','{{employee.code}}','{{employee.position}}',
                  '{{employee.hire_date}}','{{company.legal_name}}','{{company.ruc}}',
                  '{{payroll.period}}','{{payroll.net_pay}}','{{payroll.gross_income}}',
                  '{{document.title}}','{{vacation.start_date}}','{{vacation.end_date}}',
                  '{{leave.reason}}','{{cycle.name}}','{{compliance.due_date}}','{{date.today}}',
                ].map(v => (
                  <button key={v} onClick={() => setEditingTemplate((p: any) => ({ ...p, body_template: (p.body_template || '') + v }))}
                    className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded font-mono hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input type="checkbox" checked={!!editingTemplate.enabled}
                onChange={e => setEditingTemplate((p: any) => ({ ...p, enabled: e.target.checked ? 1 : 0 }))}
                className="w-4 h-4 rounded text-blue-600"/>
              <span className="text-sm text-gray-700">Plantilla activa (se usará para envíos)</span>
            </label>
            <div className="flex gap-3">
              <button onClick={saveTemplate} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar plantilla'}
              </button>
              <button onClick={() => setEditingTemplate(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

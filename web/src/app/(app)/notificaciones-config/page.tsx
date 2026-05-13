'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const CHANNEL_ICONS: Record<string,string> = { INTERNAL:'🔔', EMAIL:'📧', WHATSAPP:'💬', TELEGRAM:'✈️', SMS:'📱', PUSH_WEB:'🌐', WEBHOOK:'🔗' };
const CHANNEL_DESCRIPTIONS: Record<string,string> = {
  INTERNAL: 'Notificaciones dentro del sistema (campana)',
  EMAIL: 'Correo electrónico via SMTP',
  WHATSAPP: 'Mensajes WhatsApp (WAHA o Meta Cloud API)',
  TELEGRAM: 'Mensajes via Telegram Bot',
  SMS: 'Mensajes de texto via gateway SMS',
  PUSH_WEB: 'Notificaciones push para PWA/navegador',
  WEBHOOK: 'Llamadas HTTP salientes a sistemas externos',
};

const STATUS_Q: Record<string,string> = { queued:'bg-yellow-100 text-yellow-700', sending:'bg-blue-100 text-blue-700', sent:'bg-green-100 text-green-700', failed:'bg-red-100 text-red-700', cancelled:'bg-gray-100 text-gray-600' };

export default function NotificacionesConfigPage() {
  const [tab, setTab] = useState<'channels'|'templates'|'queue'|'history'>('channels');
  const [channels, setChannels] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [internalNotifs, setInternalNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [ch, tpl, q, il, uc] = await Promise.all([
        fetch(`${API}/api/notification-channels`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/notification-templates-mgmt`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/notification-queue?limit=50`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/internal-notifications?limit=20`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/internal-notifications/unread-count`, { headers: authHeaders() }).then(r => r.ok ? r.json() : {count:0}),
      ]);
      setChannels(Array.isArray(ch) ? ch : ch.channels || []);
      setTemplates(Array.isArray(tpl) ? tpl : tpl.templates || []);
      setQueue(Array.isArray(q) ? q : q.queue || []);
      setInternalNotifs(Array.isArray(il) ? il : il.notifications || []);
      setUnreadCount(uc?.count || 0);
    } finally { setLoading(false); }
  }

  async function toggleChannel(code: string, enabled: boolean) {
    const r = await fetch(`${API}/api/notification-channels/${code}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({ enabled }) });
    if (r.ok) loadAll();
  }
  async function retryQueueItem(id: number) {
    const r = await fetch(`${API}/api/notification-queue/${id}/retry`, { method:'POST', headers: authHeaders() });
    if (r.ok) loadAll(); else alert('Error al reintentar');
  }
  async function saveTemplate() {
    if (!editingTemplate) return;
    const url = editingTemplate.id ? `${API}/api/notification-templates-mgmt/${editingTemplate.id}` : `${API}/api/notification-templates-mgmt`;
    const r = await fetch(url, { method: editingTemplate.id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(editingTemplate) });
    if (r.ok) { setEditingTemplate(null); loadAll(); }
  }
  async function markAllRead() {
    const r = await fetch(`${API}/api/internal-notifications/read-all`, { method:'POST', headers: authHeaders() });
    if (r.ok) { setUnreadCount(0); loadAll(); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Motor de notificaciones multicanal</p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">{unreadCount} sin leer</span>
            <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">Marcar todas leídas</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[['channels','Canales'],['templates','Plantillas'],['queue','Cola'],['history','Historial']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {/* CHANNELS TAB */}
      {tab === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.length === 0 && !loading && (
            [['INTERNAL','INTERNAL'],['EMAIL','EMAIL'],['WHATSAPP','WHATSAPP'],['TELEGRAM','TELEGRAM'],['SMS','SMS'],['PUSH_WEB','PUSH_WEB'],['WEBHOOK','WEBHOOK']].map(([code]) => ({code, name:code, enabled: code==='INTERNAL'||code==='PUSH_WEB'}))
          ).map((ch:any) => (
            <div key={ch.code} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{CHANNEL_ICONS[ch.code]||'📡'}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{ch.name||ch.code}</h3>
                    <p className="text-xs text-gray-400">{ch.code}</p>
                  </div>
                </div>
                <button onClick={() => toggleChannel(ch.code, !ch.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ch.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ch.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </div>
              <p className="text-xs text-gray-500">{CHANNEL_DESCRIPTIONS[ch.code]}</p>
              {ch.enabled && <span className="mt-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Activo</span>}
            </div>
          ))}
          {channels.map((ch:any) => (
            <div key={ch.code} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{CHANNEL_ICONS[ch.code]||'📡'}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{ch.name}</h3>
                    <p className="text-xs text-gray-400">{ch.code}</p>
                  </div>
                </div>
                <button onClick={() => toggleChannel(ch.code, !ch.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ch.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ch.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </div>
              <p className="text-xs text-gray-500">{CHANNEL_DESCRIPTIONS[ch.code]}</p>
            </div>
          ))}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === 'templates' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setEditingTemplate({ event_code:'', channel_code:'INTERNAL', name:'', subject_template:'', body_template:'', language:'es' })} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nueva Plantilla</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Evento','Canal','Nombre','Idioma','Estado',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t:any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{t.event_code}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">{CHANNEL_ICONS[t.channel_code]||''} {t.channel_code}</span></td>
                    <td className="px-4 py-3 text-gray-900">{t.name}</td>
                    <td className="px-4 py-3 text-gray-500">{t.language}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${t.enabled?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{t.enabled?'Activa':'Inactiva'}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setEditingTemplate(t)} className="text-xs text-blue-600 hover:underline">Editar</button></td>
                  </tr>
                ))}
                {templates.length===0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay plantillas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QUEUE TAB */}
      {tab === 'queue' && (
        <div>
          <div className="flex justify-between mb-4">
            <div className="flex gap-4 text-sm">
              {[['queued','En cola'],['sent','Enviados'],['failed','Fallidos']].map(([s,l]) => (
                <span key={s} className="text-gray-600">{l}: <strong>{queue.filter((q:any) => q.status===s).length}</strong></span>
              ))}
            </div>
            <button onClick={loadAll} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">↺ Actualizar</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Canal','Destinatario','Asunto','Estado','Intentos','Fecha',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {queue.map((q:any) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{CHANNEL_ICONS[q.channel_code]||''} {q.channel_code}</span></td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{q.recipient_address?.slice(0,30)}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{q.subject||q.body?.slice(0,40)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_Q[q.status]||'bg-gray-100 text-gray-600'}`}>{q.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{q.attempts}/{q.max_attempts}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{q.created_at ? new Date(q.created_at).toLocaleString('es-PY') : '-'}</td>
                    <td className="px-4 py-3">{q.status==='failed' && <button onClick={() => retryQueueItem(q.id)} className="text-xs text-blue-600 hover:underline">Reintentar</button>}</td>
                  </tr>
                ))}
                {queue.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cola vacía</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {internalNotifs.map((n:any) => (
              <div key={n.id} className={`px-4 py-3 flex gap-3 items-start ${!n.read_at ? 'bg-blue-50' : ''}`}>
                <span className={`mt-0.5 text-lg ${n.type==='error'?'text-red-500':n.type==='warning'?'text-yellow-500':n.type==='success'?'text-green-500':'text-blue-500'}`}>
                  {n.type==='error'?'❌':n.type==='warning'?'⚠️':n.type==='success'?'✅':'ℹ️'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.created_at ? new Date(n.created_at).toLocaleString('es-PY') : ''}</p>
                </div>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"/>}
              </div>
            ))}
            {internalNotifs.length===0 && <div className="px-4 py-8 text-center text-gray-400">Sin notificaciones</div>}
          </div>
        </div>
      )}

      {/* TEMPLATE EDITOR MODAL */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-4">{editingTemplate.id ? 'Editar' : 'Nueva'} Plantilla</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {[['event_code','Código de Evento (ej: EMPLOYEE_CREATED)'],['name','Nombre'],['subject_template','Asunto (para email)']].map(([f,l]) => (
                <div key={f}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{l}</label>
                  <input value={editingTemplate[f]||''} onChange={e => setEditingTemplate((p:any) => ({...p,[f]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
                <select value={editingTemplate.channel_code} onChange={e => setEditingTemplate((p:any) => ({...p,channel_code:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {['INTERNAL','EMAIL','WHATSAPP','TELEGRAM','SMS','PUSH_WEB','WEBHOOK'].map(c => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cuerpo del Mensaje</label>
                <textarea value={editingTemplate.body_template||''} onChange={e => setEditingTemplate((p:any) => ({...p,body_template:e.target.value}))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-none"/>
                <p className="text-xs text-gray-400 mt-1">Variables: {'{{'}employee.full_name{'}}'}, {'{{'}company.legal_name{'}}'}, {'{{'}payroll.period{'}}'}, {'{{'}date.today{'}}'}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveTemplate} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Guardar</button>
              <button onClick={() => setEditingTemplate(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

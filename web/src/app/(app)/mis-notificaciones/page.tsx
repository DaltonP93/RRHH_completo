'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const CHANNEL_META: Record<string, { icon: string; label: string; desc: string }> = {
  INTERNAL:  { icon: '🔔', label: 'Sistema',   desc: 'Campana y centro de notificaciones' },
  EMAIL:     { icon: '📧', label: 'Email',      desc: 'Correo electrónico' },
  WHATSAPP:  { icon: '💬', label: 'WhatsApp',   desc: 'Mensajes de WhatsApp' },
  TELEGRAM:  { icon: '✈️', label: 'Telegram',   desc: 'Bot de Telegram' },
  SMS:       { icon: '📱', label: 'SMS',        desc: 'Mensajes de texto' },
  PUSH_WEB:  { icon: '🌐', label: 'Push',       desc: 'Notificación push en el navegador' },
};

const CATEGORY_ICONS: Record<string, string> = {
  RRHH:         '👤',
  ASISTENCIA:   '🕐',
  NOMINA:       '💰',
  VACACIONES:   '🏖️',
  PERMISOS:     '📋',
  DOCUMENTOS:   '📄',
  COMPETENCIAS: '⭐',
  CUMPLIMIENTO: '⚖️',
  SISTEMA:      '⚙️',
};

const SEVERITY_LABEL: Record<string, string> = {
  info:     '',
  warning:  '⚠️',
  critical: '🔴',
};

export default function MisNotificacionesPage() {
  const [matrix, setMatrix]           = useState<any[]>([]);
  const [channels, setChannels]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [dirty, setDirty]             = useState<Record<string, Record<string, { enabled: boolean; qs?: string; qe?: string }>>>({});
  const [filterCategory, setFilter]   = useState('');
  const [editingQuiet, setEditingQuiet] = useState<{ event_code: string; channel_code: string } | null>(null);
  const [quietForm, setQuietForm]     = useState({ start: '', end: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/notification-preferences/my`, { headers: authHeaders() });
    if (r.ok) {
      const d = await r.json();
      setMatrix(d.events || []);
      setChannels(d.channels || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getPref(event_code: string, channel_code: string, ev: any) {
    if (dirty[event_code]?.[channel_code] !== undefined) return dirty[event_code][channel_code];
    const ch = ev.channels?.find((c: any) => c.channel_code === channel_code);
    return { enabled: ch?.enabled ?? true, qs: ch?.quiet_hours_start || '', qe: ch?.quiet_hours_end || '' };
  }

  function togglePref(event_code: string, channel_code: string, ev: any) {
    const cur = getPref(event_code, channel_code, ev);
    setDirty(p => ({
      ...p,
      [event_code]: { ...(p[event_code] || {}), [channel_code]: { ...cur, enabled: !cur.enabled } },
    }));
  }

  function setQuietHours(event_code: string, channel_code: string, start: string, end: string, ev: any) {
    const cur = getPref(event_code, channel_code, ev);
    setDirty(p => ({
      ...p,
      [event_code]: { ...(p[event_code] || {}), [channel_code]: { ...cur, qs: start, qe: end } },
    }));
    setEditingQuiet(null);
  }

  function muteAll(event_code: string, ev: any) {
    const update: Record<string, { enabled: boolean }> = {};
    channels.forEach((ch: any) => {
      const cur = getPref(event_code, ch.code, ev);
      update[ch.code] = { ...cur, enabled: false };
    });
    setDirty(p => ({ ...p, [event_code]: { ...(p[event_code] || {}), ...update } }));
  }

  async function saveAll() {
    setSaving(true);
    const preferences: any[] = [];
    for (const [event_code, channels] of Object.entries(dirty)) {
      for (const [channel_code, pref] of Object.entries(channels)) {
        preferences.push({
          event_code, channel_code,
          enabled: pref.enabled,
          quiet_hours_start: pref.qs || null,
          quiet_hours_end:   pref.qe || null,
        });
      }
    }
    if (preferences.length > 0) {
      await fetch(`${API}/api/notification-preferences/my/batch`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ preferences }),
      });
    }
    setSaving(false);
    setSaved(true);
    setDirty({});
    setTimeout(() => setSaved(false), 3000);
    load();
  }

  const categories = [...new Set(matrix.map((e: any) => e.category))].sort();
  const filtered   = filterCategory ? matrix.filter((e: any) => e.category === filterCategory) : matrix;
  const dirtyCount = Object.values(dirty).reduce((acc, ch) => acc + Object.keys(ch).length, 0);

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando preferencias...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Elige qué quieres recibir y por qué canal. Solo ves los canales habilitados por tu empresa.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          {dirtyCount > 0 && (
            <span className="text-xs text-orange-500">{dirtyCount} cambio{dirtyCount > 1 ? 's' : ''} sin guardar</span>
          )}
          <button onClick={saveAll} disabled={saving || dirtyCount === 0}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Channel legend */}
      <div className="flex flex-wrap gap-3 mb-5">
        {channels.map((ch: any) => (
          <div key={ch.code} className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-full px-3 py-1 border border-gray-100">
            <span>{CHANNEL_META[ch.code]?.icon || '📣'}</span>
            <span>{CHANNEL_META[ch.code]?.label || ch.name}</span>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterCategory === '' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Todas
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterCategory === cat ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {CATEGORY_ICONS[cat] || ''} {cat}
          </button>
        ))}
      </div>

      {/* Preference table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-72">Notificación</th>
              {channels.map((ch: any) => (
                <th key={ch.code} className="px-4 py-3 text-center font-medium text-gray-600 min-w-[80px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-base">{CHANNEL_META[ch.code]?.icon || '📣'}</span>
                    <span className="text-xs">{CHANNEL_META[ch.code]?.label || ch.name}</span>
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs text-gray-400 font-normal">Silenciar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev: any, i: number) => {
              const prevCat = i > 0 ? filtered[i - 1].category : null;
              return (
                <>
                  {ev.category !== prevCat && (
                    <tr key={`cat-${ev.category}`}>
                      <td colSpan={channels.length + 2}
                        className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border-t border-b border-gray-100">
                        {CATEGORY_ICONS[ev.category] || ''} {ev.category}
                      </td>
                    </tr>
                  )}
                  <tr key={ev.event_code} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group">
                    <td className="px-5 py-3 sticky left-0 bg-white">
                      <div className="flex items-start gap-2">
                        <span className="text-sm mt-0.5">{SEVERITY_LABEL[ev.severity] || ''}</span>
                        <div>
                          <p className="font-medium text-gray-800">{ev.name}</p>
                        </div>
                      </div>
                    </td>
                    {channels.map((ch: any) => {
                      const pref = getPref(ev.event_code, ch.code, ev);
                      const hasQuiet = pref.qs && pref.qe;
                      return (
                        <td key={ch.code} className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => togglePref(ev.event_code, ch.code, ev)}
                              className={`w-9 h-9 rounded-full border-2 text-sm font-bold transition-all
                                ${pref.enabled
                                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400'}`}
                              title={pref.enabled ? 'Activado — clic para desactivar' : 'Desactivado — clic para activar'}>
                              {pref.enabled ? '✓' : '✗'}
                            </button>
                            {pref.enabled && (
                              <button
                                onClick={() => { setEditingQuiet({ event_code: ev.event_code, channel_code: ch.code }); setQuietForm({ start: pref.qs || '', end: pref.qe || '' }); }}
                                className={`text-xs transition-colors ${hasQuiet ? 'text-orange-500 hover:text-orange-700' : 'text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'}`}
                                title={hasQuiet ? `Silencio: ${pref.qs}–${pref.qe}` : 'Configurar horario de silencio'}>
                                {hasQuiet ? `🌙 ${pref.qs}` : '🌙'}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => muteAll(ev.event_code, ev)}
                        className="text-xs text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Desactivar este evento en todos los canales">
                        🔇
                      </button>
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin eventos para la categoría seleccionada</p>}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Los canales deshabilitados globalmente por tu empresa no aparecen en esta lista, aunque tengas preferencia guardada.
      </p>

      {/* Quiet hours modal */}
      {editingQuiet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-bold mb-1">Horario de silencio</h2>
            <p className="text-xs text-gray-500 mb-4">
              Durante este horario no recibirás notificaciones de este evento por {editingQuiet.channel_code}.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                <input type="time" value={quietForm.start} onChange={e => setQuietForm(p => ({ ...p, start: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                <input type="time" value={quietForm.end} onChange={e => setQuietForm(p => ({ ...p, end: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const ev = matrix.find((e: any) => e.event_code === editingQuiet.event_code);
                  setQuietHours(editingQuiet.event_code, editingQuiet.channel_code, quietForm.start, quietForm.end, ev);
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Aplicar
              </button>
              <button onClick={() => {
                  const ev = matrix.find((e: any) => e.event_code === editingQuiet.event_code);
                  setQuietHours(editingQuiet.event_code, editingQuiet.channel_code, '', '', ev);
                }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
                Sin silencio
              </button>
              <button onClick={() => setEditingQuiet(null)}
                className="py-2 px-3 border border-gray-200 rounded-lg text-sm text-gray-400 hover:bg-gray-50">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

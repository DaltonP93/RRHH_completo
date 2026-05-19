'use client';
import { api } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, FolderOpen, LayoutTemplate, Plus, Eye, Send, PenLine,
  XCircle, ClipboardList, Search, ChevronDown, Folder, Copy,
  Edit, RefreshCw
} from 'lucide-react';

type DocStatus = 'draft' | 'sent' | 'signed' | 'cancelled' | 'completed';

interface Document {
  id: number;
  title: string;
  employee_name: string;
  module: string;
  status: DocStatus;
  created_at: string;
  sent_at?: string;
  signed_at?: string;
  template_id: number;
  employee_id: number;
}

interface Template {
  id: number;
  name: string;
  code: string;
  module: string;
  version: number;
  status: string;
  description: string;
  html_template: string;
}

interface Folder {
  id: number;
  name: string;
  parent_id?: number;
  children?: Folder[];
}

const STATUS_CONFIG: Record<DocStatus, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',   cls: 'bg-gray-100 text-gray-700' },
  sent:      { label: 'Enviado',    cls: 'bg-blue-100 text-blue-700' },
  signed:    { label: 'Firmado',    cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelado',  cls: 'bg-red-100 text-red-700' },
  completed: { label: 'Completado', cls: 'bg-purple-100 text-purple-700' },
};

const MODULES = ['Contratos','Vacaciones','Permisos','Nómina','Onboarding','General'];

const VARIABLES_REF = [
  '{{employee.full_name}}', '{{employee.document_number}}', '{{employee.position}}',
  '{{employee.department}}', '{{employee.hire_date}}', '{{company.legal_name}}',
  '{{company.ruc}}', '{{today}}', '{{salary.amount}}',
];

function StatusBadge({ status }: { status: DocStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── New Document Modal ───────────────────────────────────────────────────────
function NewDocumentModal({
  templates, onClose, onCreated
}: { templates: Template[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ template_id: '', employee_id: '', title: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.template_id || !form.employee_id || !form.title) { setError('Todos los campos son requeridos'); return; }
    setSaving(true);
    try {
      const res = await api.post(`/api/documents`, { template_id: Number(form.template_id),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo Documento</h2>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded-lg">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plantilla</label>
            <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.template_id} onChange={e => setForm(p => ({ ...p, template_id: e.target.value }))}>
              <option value="">Seleccionar plantilla...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ID Empleado</label>
            <input type="number" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ID del empleado" value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
            <input type="text" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Título del documento" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-medium hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creando...' : 'Crear Documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── New Template Modal ───────────────────────────────────────────────────────
function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', module: '', description: '', html_template: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.module) { setError('Nombre, código y módulo son requeridos'); return; }
    setSaving(true);
    try {
      const res = await api.post(`/api/document-templates`, form);
      onCreated(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Nueva Plantilla</h2>
        {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded-lg">{error}</p>}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la plantilla" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código *</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="CODIGO_UNICO" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Módulo *</label>
            <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.module} onChange={e => setForm(p => ({ ...p, module: e.target.value }))}>
              <option value="">Seleccionar módulo...</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción breve" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Contenido HTML</label>
          <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 h-40 resize-none"
            value={form.html_template} onChange={e => setForm(p => ({ ...p, html_template: e.target.value }))}
            placeholder="<p>Yo, {{employee.full_name}}, ...</p>" />
        </div>

        <div className="bg-slate-50 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">Variables disponibles:</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES_REF.map(v => (
              <button key={v} type="button"
                onClick={() => setForm(p => ({ ...p, html_template: p.html_template + v }))}
                className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-medium hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear Plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Folder Tree ──────────────────────────────────────────────────────────────
function FolderTree({ folders, depth = 0 }: { folders: Folder[]; depth?: number }) {
  const [open, setOpen] = useState<number[]>([]);
  return (
    <ul className="space-y-1">
      {folders.map(f => (
        <li key={f.id}>
          <button
            onClick={() => setOpen(p => p.includes(f.id) ? p.filter(x => x !== f.id) : [...p, f.id])}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded-lg text-sm text-slate-700"
            style={{ paddingLeft: `${8 + depth * 16}px` }}>
            <Folder size={15} className="text-yellow-500 shrink-0" />
            <span className="flex-1">{f.name}</span>
            {f.children && f.children.length > 0 && (
              <ChevronDown size={13} className={`text-slate-400 transition-transform ${open.includes(f.id) ? 'rotate-180' : ''}`} />
            )}
          </button>
          {f.children && open.includes(f.id) && (
            <FolderTree folders={f.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentosPage() {
  const [tab, setTab] = useState<'docs' | 'templates' | 'folders'>('docs');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewTpl, setShowNewTpl] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get(`/api/documents`);
      setDocuments(res.data);
    } catch {}
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get(`/api/document-templates`);
      setTemplates(res.data);
    } catch {}
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await api.get(`/api/document-folders`);
      setFolders(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDocuments(), fetchTemplates(), fetchFolders()]).finally(() => setLoading(false));
  }, [fetchDocuments, fetchTemplates, fetchFolders]);

  async function handleAction(docId: number, action: string) {
    const endpoints: Record<string, string> = {
      send: `/api/documents/${docId}/send`,
      cancel: `/api/documents/${docId}/cancel`,
    };
    if (!endpoints[action]) return;
    try {
      await api.post(endpoints[action]);
      fetchDocuments();
    } catch {}
  }

  const filteredDocs = documents.filter(d => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.employee_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterModule && d.module !== filterModule) return false;
    if (filterStatus && d.status !== filterStatus) return false;
    return true;
  });

  const tabs = [
    { id: 'docs', label: 'Documentos', icon: FileText },
    { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
    { id: 'folders', label: 'Carpetas', icon: FolderOpen },
  ] as const;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Documentos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Documentos digitales, plantillas y firma electrónica</p>
        </div>
        <div className="flex gap-2">
          {tab === 'docs' && (
            <button onClick={() => setShowNewDoc(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Nuevo Documento
            </button>
          )}
          {tab === 'templates' && (
            <button onClick={() => setShowNewTpl(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Nueva Plantilla
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Tab: Documentos */}
      {!loading && tab === 'docs' && (
        <div>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Buscar documento o empleado..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={filterModule} onChange={e => setFilterModule(e.target.value)}>
              <option value="">Todos los módulos</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Título','Empleado','Módulo','Estado','Creado','Enviado','Firmado','Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredDocs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">No se encontraron documentos</td></tr>
                ) : filteredDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{doc.title}</td>
                    <td className="px-4 py-3 text-slate-600">{doc.employee_name || `#${doc.employee_id}`}</td>
                    <td className="px-4 py-3 text-slate-600">{doc.module}</td>
                    <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                    <td className="px-4 py-3 text-slate-500">{doc.created_at ? new Date(doc.created_at).toLocaleDateString('es') : '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{doc.sent_at ? new Date(doc.sent_at).toLocaleDateString('es') : '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('es') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <a href={`/documentos/${doc.id}`}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver">
                          <Eye size={14} />
                        </a>
                        {doc.status === 'draft' && (
                          <button onClick={() => handleAction(doc.id, 'send')}
                            className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Enviar">
                            <Send size={14} />
                          </button>
                        )}
                        {doc.status === 'sent' && (
                          <a href={`/documentos/${doc.id}`}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Firmar">
                            <PenLine size={14} />
                          </a>
                        )}
                        {['draft','sent'].includes(doc.status) && (
                          <button onClick={() => handleAction(doc.id, 'cancel')}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Cancelar">
                            <XCircle size={14} />
                          </button>
                        )}
                        <a href={`/documentos/${doc.id}#audit`}
                          className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Ver Auditoría">
                          <ClipboardList size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Plantillas */}
      {!loading && tab === 'templates' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.length === 0 ? (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <LayoutTemplate size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay plantillas creadas</p>
            </div>
          ) : templates.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{tpl.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{tpl.code}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tpl.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {tpl.status === 'active' ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{tpl.module}</span>
                <span className="text-xs text-slate-400">v{tpl.version}</span>
              </div>
              {tpl.description && <p className="text-xs text-slate-500 mb-4 line-clamp-2">{tpl.description}</p>}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 py-1.5 rounded-lg transition-colors">
                  <Edit size={12} /> Editar
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-green-600 hover:bg-green-50 py-1.5 rounded-lg transition-colors">
                  <Copy size={12} /> Clonar
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-purple-600 hover:bg-purple-50 py-1.5 rounded-lg transition-colors">
                  <Eye size={12} /> Vista previa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Carpetas */}
      {!loading && tab === 'folders' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Árbol de carpetas</h2>
            <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg">
              <Plus size={12} /> Nueva carpeta
            </button>
          </div>
          {folders.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay carpetas creadas</p>
            </div>
          ) : <FolderTree folders={folders} />}
        </div>
      )}

      {/* Modals */}
      {showNewDoc && <NewDocumentModal templates={templates} onClose={() => setShowNewDoc(false)} onCreated={fetchDocuments} />}
      {showNewTpl && <NewTemplateModal onClose={() => setShowNewTpl(false)} onCreated={fetchTemplates} />}
    </div>
  );
}

'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Plus, Pencil, X, Check, AlertCircle, Search, Tag, Layers, User } from 'lucide-react';


type ConceptType = 'INCOME' | 'DEDUCTION' | 'CONTRIBUTION' | 'PROVISION';
type TabKey = 'concepts' | 'groups' | 'fixed';

interface SalaryConcept {
  id: number;
  code?: string;
  name: string;
  type: ConceptType;
  affects_ips?: boolean;
  affects_bonus?: boolean;
  formula?: string;
  status: string;
  group_id?: number;
  group_name?: string;
}

interface ConceptGroup {
  id: number;
  code?: string;
  name: string;
  type?: string;
  concept_count?: number;
  status: string;
}

interface FixedConcept {
  id: number;
  employee_id: number;
  employee_name?: string;
  concept_id: number;
  concept_name?: string;
  concept_type?: ConceptType;
  amount: number;
  start_date?: string;
  end_date?: string;
  status: string;
}

interface Employee { id: number; full_name: string; code?: string; }

const TYPE_CONFIG: Record<ConceptType, { label: string; cls: string }> = {
  INCOME:       { label: 'Ingreso',    cls: 'bg-green-100 text-green-700' },
  DEDUCTION:    { label: 'Descuento',  cls: 'bg-red-100 text-red-700' },
  CONTRIBUTION: { label: 'Aporte',     cls: 'bg-blue-100 text-blue-700' },
  PROVISION:    { label: 'Provisión',  cls: 'bg-yellow-100 text-yellow-700' },
};

function TypeBadge({ type }: { type: ConceptType }) {
  const cfg = TYPE_CONFIG[type] || { label: type, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
      status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {status === 'active' ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function formatGs(n: number | string | undefined | null) {
  const num = Number(n);
  if (isNaN(num) || n === null || n === undefined) return '—';
  return 'Gs. ' + num.toLocaleString('es-PY');
}

export default function ConceptosPage() {
  const [tab, setTab] = useState<TabKey>('concepts');

  // Tab 1 — Concepts
  const [concepts, setConcepts] = useState<SalaryConcept[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(true);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editingConcept, setEditingConcept] = useState<SalaryConcept | null>(null);
  const [conceptForm, setConceptForm] = useState<Partial<SalaryConcept>>({
    code: '', name: '', type: 'INCOME', affects_ips: false, affects_bonus: false, status: 'active',
  });
  const [savingConcept, setSavingConcept] = useState(false);

  // Tab 2 — Groups
  const [groups, setGroups] = useState<ConceptGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConceptGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ code: '', name: '', type: '', status: 'active' });
  const [savingGroup, setSavingGroup] = useState(false);

  // Tab 3 — Fixed
  const [fixedSearch, setFixedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [fixedConcepts, setFixedConcepts] = useState<FixedConcept[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [fixedForm, setFixedForm] = useState({ concept_id: '', amount: '', start_date: '', end_date: '' });
  const [savingFixed, setSavingFixed] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => { if (tab === 'concepts') fetchConcepts(); }, [tab]);
  useEffect(() => { if (tab === 'groups') fetchGroups(); }, [tab]);

  async function fetchConcepts() {
    setConceptsLoading(true); setError('');
    try {
      const res = await api.get(`/api/salary-concepts`);
      const data = res.data;
      setConcepts(Array.isArray(data) ? data : data.data || []);
    } catch { setError('Error al cargar conceptos'); }
    finally { setConceptsLoading(false); }
  }

  async function fetchGroups() {
    setGroupsLoading(true);
    try {
      const res = await api.get(`/api/salary-concept-groups`);
      const data = res.data;
      setGroups(Array.isArray(data) ? data : data.data || []);
    } catch {}
    finally { setGroupsLoading(false); }
  }

  async function saveConcept() {
    setSavingConcept(true);
    try {
      if (editingConcept) {
        await api.put(`/api/salary-concepts/${editingConcept.id}`, conceptForm);
      } else {
        await api.post('/api/salary-concepts', conceptForm);
      }
      setShowConceptModal(false);
      fetchConcepts();
    } catch { alert('Error al guardar concepto'); }
    finally { setSavingConcept(false); }
  }

  async function saveGroup() {
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await api.put(`/api/salary-concept-groups/${editingGroup.id}`, groupForm);
      } else {
        await api.post('/api/salary-concept-groups', groupForm);
      }
      setShowGroupModal(false);
      fetchGroups();
    } catch { alert('Error al guardar grupo'); }
    finally { setSavingGroup(false); }
  }

  async function searchEmployees(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api.get(`/api/employees?search=${encodeURIComponent(q)}&limit=10`);
      const data = res.data;
      setSearchResults(Array.isArray(data) ? data : data.data || []);
    } catch {}
  }

  async function loadFixedConcepts(empId: number) {
    setFixedLoading(true);
    try {
      const res = await api.get(`/api/employee-fixed-concepts?employee_id=${empId}`);
      const data = res.data;
      setFixedConcepts(Array.isArray(data) ? data : data.data || []);
    } catch {}
    finally { setFixedLoading(false); }
  }

  async function addFixedConcept() {
    if (!selectedEmployee) return;
    setSavingFixed(true);
    try {
      const body = { employee_id: selectedEmployee.id, ...fixedForm, amount: Number(fixedForm.amount) };
      await api.post('/api/employee-fixed-concepts', body);
      setShowFixedModal(false);
      loadFixedConcepts(selectedEmployee.id);
    } catch { alert('Error al agregar concepto fijo'); }
    finally { setSavingFixed(false); }
  }

  async function removeFixedConcept(fcId: number) {
    if (!confirm('¿Eliminar este concepto fijo?')) return;
    try {
      await api.delete(`/api/employee-fixed-concepts/${fcId}`);
      if (selectedEmployee) loadFixedConcepts(selectedEmployee.id);
    } catch { alert('Error al eliminar'); }
  }

  const TABS = [
    { key: 'concepts' as TabKey, label: 'Conceptos', icon: Tag },
    { key: 'groups' as TabKey, label: 'Grupos', icon: Layers },
    { key: 'fixed' as TabKey, label: 'Conceptos Fijos por Empleado', icon: User },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conceptos Salariales</h1>
          <p className="text-sm text-gray-500">Gestión de conceptos, grupos y asignaciones fijas</p>
        </div>
        {tab === 'concepts' && (
          <button onClick={() => { setEditingConcept(null); setConceptForm({ code: '', name: '', type: 'INCOME', affects_ips: false, affects_bonus: false, status: 'active' }); setShowConceptModal(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> Nuevo Concepto
          </button>
        )}
        {tab === 'groups' && (
          <button onClick={() => { setEditingGroup(null); setGroupForm({ code: '', name: '', type: '', status: 'active' }); setShowGroupModal(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> Nuevo Grupo
          </button>
        )}
        {tab === 'fixed' && selectedEmployee && (
          <button onClick={() => { setFixedForm({ concept_id: '', amount: '', start_date: '', end_date: '' }); setShowFixedModal(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> Agregar Concepto
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Tab 1: Concepts */}
      {tab === 'concepts' && (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          {conceptsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" /> Cargando...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Afecta IPS</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Afecta Aguinaldo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {concepts.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin conceptos registrados</td></tr>}
                {concepts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.code || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3"><TypeBadge type={c.type} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${c.affects_ips ? 'text-green-600' : 'text-gray-400'}`}>
                        {c.affects_ips ? '✓' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${c.affects_bonus ? 'text-green-600' : 'text-gray-400'}`}>
                        {c.affects_bonus ? '✓' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditingConcept(c); setConceptForm({ ...c }); setShowConceptModal(true); }}
                        className="text-blue-600 hover:text-blue-800"><Pencil className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Groups */}
      {tab === 'groups' && (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          {groupsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" /> Cargando...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Conceptos</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin grupos registrados</td></tr>}
                {groups.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.code || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                    <td className="px-4 py-3 text-gray-600">{g.type || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{g.concept_count ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditingGroup(g); setGroupForm({ code: g.code || '', name: g.name, type: g.type || '', status: g.status }); setShowGroupModal(true); }}
                        className="text-blue-600 hover:text-blue-800"><Pencil className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Fixed Concepts */}
      {tab === 'fixed' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar Empleado</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={fixedSearch}
                onChange={e => { setFixedSearch(e.target.value); searchEmployees(e.target.value); }}
                placeholder="Nombre o código del empleado..."
                className="w-full pl-9 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            {searchResults.length > 0 && !selectedEmployee && (
              <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {searchResults.map(e => (
                  <button key={e.id}
                    onClick={() => { setSelectedEmployee(e); setSearchResults([]); setFixedSearch(e.full_name); loadFixedConcepts(e.id); }}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0">
                    <span className="font-medium text-gray-900">{e.full_name}</span>
                    {e.code && <span className="text-xs text-gray-400 ml-2">({e.code})</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedEmployee && (
              <div className="mt-2 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                <User className="w-4 h-4" />
                <span className="font-medium">{selectedEmployee.full_name}</span>
                <button onClick={() => { setSelectedEmployee(null); setFixedSearch(''); setFixedConcepts([]); }}
                  className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          {selectedEmployee && (
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
              {fixedLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" /> Cargando...
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Concepto</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Monto</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Desde</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Hasta</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fixedConcepts.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin conceptos fijos asignados</td></tr>}
                    {fixedConcepts.map(fc => (
                      <tr key={fc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{fc.concept_name || '—'}</td>
                        <td className="px-4 py-3">{fc.concept_type ? <TypeBadge type={fc.concept_type} /> : '—'}</td>
                        <td className="px-4 py-3 text-right">{formatGs(fc.amount)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fc.start_date || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fc.end_date || 'Indefinido'}</td>
                        <td className="px-4 py-3"><StatusBadge status={fc.status} /></td>
                        <td className="px-4 py-3">
                          <button onClick={() => removeFixedConcept(fc.id)} className="text-red-500 hover:text-red-700 text-xs">Quitar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Concept Modal */}
      {showConceptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingConcept ? 'Editar Concepto' : 'Nuevo Concepto'}</h2>
              <button onClick={() => setShowConceptModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input value={conceptForm.code || ''} onChange={e => setConceptForm(p => ({ ...p, code: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={conceptForm.status || 'active'} onChange={e => setConceptForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="active">Activo</option><option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={conceptForm.name || ''} onChange={e => setConceptForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select value={conceptForm.type || 'INCOME'} onChange={e => setConceptForm(p => ({ ...p, type: e.target.value as ConceptType }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="INCOME">Ingreso</option>
                  <option value="DEDUCTION">Descuento</option>
                  <option value="CONTRIBUTION">Aporte</option>
                  <option value="PROVISION">Provisión</option>
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!conceptForm.affects_ips}
                    onChange={e => setConceptForm(p => ({ ...p, affects_ips: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded" />
                  Afecta IPS
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!conceptForm.affects_bonus}
                    onChange={e => setConceptForm(p => ({ ...p, affects_bonus: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded" />
                  Afecta Aguinaldo
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowConceptModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={saveConcept} disabled={savingConcept || !conceptForm.name}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingConcept ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingGroup ? 'Editar Grupo' : 'Nuevo Grupo'}</h2>
              <button onClick={() => setShowGroupModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input value={groupForm.code} onChange={e => setGroupForm(p => ({ ...p, code: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={groupForm.status} onChange={e => setGroupForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="active">Activo</option><option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={groupForm.name} onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <input value={groupForm.type} onChange={e => setGroupForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={saveGroup} disabled={savingGroup || !groupForm.name}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingGroup ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Concept Modal */}
      {showFixedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Agregar Concepto Fijo</h2>
              <button onClick={() => setShowFixedModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
                <select value={fixedForm.concept_id} onChange={e => setFixedForm(p => ({ ...p, concept_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="">Seleccionar...</option>
                  {concepts.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Gs.) *</label>
                <input type="number" value={fixedForm.amount} onChange={e => setFixedForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                  <input type="date" value={fixedForm.start_date} onChange={e => setFixedForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                  <input type="date" value={fixedForm.end_date} onChange={e => setFixedForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowFixedModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={addFixedConcept} disabled={savingFixed || !fixedForm.concept_id || !fixedForm.amount}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingFixed ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

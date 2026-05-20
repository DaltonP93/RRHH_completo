'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Plus, Pencil, X, Check, AlertCircle, Briefcase, Layers, DollarSign, Users } from 'lucide-react';


function formatGs(n: number | string) {
  const num = Number(n);
  if (isNaN(num)) return '—';
  return 'Gs. ' + num.toLocaleString('es-PY');
}

type Tab = 'positions' | 'grade_levels' | 'cost_centers' | 'employee_types';

interface Position { id: number; code?: string; name: string; is_leadership?: boolean; status: string; }
interface GradeLevel { id: number; code?: string; name: string; salary_min?: number; salary_max?: number; status: string; }
interface CostCenter { id: number; code?: string; name: string; accounting_code?: string; status: string; }
interface EmployeeType { id: number; code?: string; name: string; description?: string; status: string; }

export default function CargosPage() {
  const [tab, setTab] = useState<Tab>('positions');
  const [positions, setPositions] = useState<Position[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'positions', label: 'Cargos', icon: Briefcase },
    { key: 'grade_levels', label: 'Escalafones', icon: Layers },
    { key: 'cost_centers', label: 'Centros de Costo', icon: DollarSign },
    { key: 'employee_types', label: 'Tipos de Empleado', icon: Users },
  ];

  const endpoints: Record<Tab, string> = {
    positions: '/api/positions',
    grade_levels: '/api/grade-levels',
    cost_centers: '/api/cost-centers',
    employee_types: '/api/employee-types',
  };

  const setters: Record<Tab, (d: any[]) => void> = {
    positions: setPositions,
    grade_levels: setGradeLevels,
    cost_centers: setCostCenters,
    employee_types: setEmployeeTypes,
  };

  const data: Record<Tab, any[]> = {
    positions, grade_levels: gradeLevels, cost_centers: costCenters, employee_types: employeeTypes,
  };

  useEffect(() => { fetchData(tab); }, [tab]);

  async function fetchData(t: Tab) {
    setLoading(true); setError('');
    try {
      const res = await api.get(`${endpoints[t]}`);
      const d = res.data;
      setters[t](Array.isArray(d) ? d : d.data || []);
    } catch { setError('Error al cargar datos'); }
    finally { setLoading(false); }
  }

  function openNew() {
    setEditingItem(null);
    setForm(tab === 'positions' ? { code: '', name: '', is_leadership: false, status: 'active' }
      : tab === 'grade_levels' ? { code: '', name: '', salary_min: '', salary_max: '', status: 'active' }
      : tab === 'cost_centers' ? { code: '', name: '', accounting_code: '', status: 'active' }
      : { code: '', name: '', description: '', status: 'active' });
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditingItem(item);
    setForm({ ...item });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editingItem) {
        await api.put(`${endpoints[tab]}/${editingItem.id}`, form);
      } else {
        await api.post(endpoints[tab], form);
      }
      setShowModal(false);
      fetchData(tab);
    } catch { alert('Error al guardar'); }
    finally { setSaving(false); }
  }

  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {status === 'active' ? 'Activo' : 'Inactivo'}
      </span>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estructura Organizacional</h1>
          <p className="text-sm text-gray-500">Cargos, escalafones, centros de costo y tipos de empleado</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Nuevo
        </button>
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

      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
            Cargando...
          </div>
        ) : (
          <>
            {/* Positions */}
            {tab === 'positions' && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Jefatura</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {positions.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin cargos registrados</td></tr>}
                  {positions.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{p.code || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.is_leadership ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {p.is_leadership ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(p)} className="text-blue-600 hover:text-blue-800">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Grade Levels */}
            {tab === 'grade_levels' && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Salario Mín.</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Salario Máx.</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {gradeLevels.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin escalafones registrados</td></tr>}
                  {gradeLevels.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{g.code || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                      <td className="px-4 py-3 text-gray-600">{g.salary_min ? formatGs(g.salary_min) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{g.salary_max ? formatGs(g.salary_max) : '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(g)} className="text-blue-600 hover:text-blue-800">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Cost Centers */}
            {tab === 'cost_centers' && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Código Contable</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costCenters.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin centros de costo registrados</td></tr>}
                  {costCenters.map(cc => (
                    <tr key={cc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{cc.code || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{cc.name}</td>
                      <td className="px-4 py-3 text-gray-600">{cc.accounting_code || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={cc.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(cc)} className="text-blue-600 hover:text-blue-800">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Employee Types */}
            {tab === 'employee_types' && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Descripción</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employeeTypes.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin tipos de empleado registrados</td></tr>}
                  {employeeTypes.map(et => (
                    <tr key={et.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{et.code || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{et.name}</td>
                      <td className="px-4 py-3 text-gray-500">{et.description || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={et.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(et)} className="text-blue-600 hover:text-blue-800">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingItem ? 'Editar' : 'Nuevo'} {TABS.find(t => t.key === tab)?.label.replace(/s$/, '')}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input value={form.code || ''} onChange={e => setForm((p: any) => ({ ...p, code: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.status || 'active'} onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={form.name || ''} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              {tab === 'positions' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="leadership" checked={!!form.is_leadership}
                    onChange={e => setForm((p: any) => ({ ...p, is_leadership: e.target.checked }))}
                    className="w-4 h-4 text-blue-600" />
                  <label htmlFor="leadership" className="text-sm text-gray-700">Es cargo de jefatura/liderazgo</label>
                </div>
              )}
              {tab === 'grade_levels' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salario Mínimo</label>
                    <input type="number" value={form.salary_min || ''}
                      onChange={e => setForm((p: any) => ({ ...p, salary_min: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salario Máximo</label>
                    <input type="number" value={form.salary_max || ''}
                      onChange={e => setForm((p: any) => ({ ...p, salary_max: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
              )}
              {tab === 'cost_centers' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código Contable</label>
                  <input value={form.accounting_code || ''}
                    onChange={e => setForm((p: any) => ({ ...p, accounting_code: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              )}
              {tab === 'employee_types' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea value={form.description || ''}
                    onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !form.name}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Plus, Pencil, ChevronDown, ChevronRight, Building2, GitBranch, X, Check, AlertCircle } from 'lucide-react';

interface Company {
  id: number;
  legal_name: string;
  trade_name?: string;
  ruc?: string;
  patronal_number_mtess?: string;
  patronal_number_ips?: string;
  address?: string;
  phone?: string;
  email?: string;
  status: 'active' | 'inactive';
}

interface Branch {
  id: number;
  company_id: number;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  status: 'active' | 'inactive';
}

const emptyCompany: Omit<Company, 'id'> = {
  legal_name: '', trade_name: '', ruc: '', patronal_number_mtess: '',
  patronal_number_ips: '', address: '', phone: '', email: '', status: 'active',
};

const emptyBranch: Omit<Branch, 'id' | 'company_id'> = {
  name: '', code: '', address: '', phone: '', status: 'active',
};

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Record<number, Branch[]>>({});
  const [branchLoading, setBranchLoading] = useState<Record<number, boolean>>({});

  // Company modal
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState<Omit<Company, 'id'>>(emptyCompany);
  const [savingCompany, setSavingCompany] = useState(false);

  // Branch modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState<Omit<Branch, 'id' | 'company_id'>>(emptyBranch);
  const [activeBranchCompanyId, setActiveBranchCompanyId] = useState<number | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  useEffect(() => { fetchCompanies(); }, []);

  async function fetchCompanies() {
    setLoading(true); setError('');
    try {
      const res = await api.get(`/api/companies`);
      const data = res.data;
      setCompanies(Array.isArray(data) ? data : data.data || []);
    } catch {
      setError('Error al cargar empresas');
    } finally { setLoading(false); }
  }

  async function fetchBranches(companyId: number) {
    setBranchLoading(prev => ({ ...prev, [companyId]: true }));
    try {
      const res = await api.get(`/api/companies/${companyId}/branches`);
      const data = res.data;
      setBranches(prev => ({ ...prev, [companyId]: Array.isArray(data) ? data : data.data || [] }));
    } catch {
      setBranches(prev => ({ ...prev, [companyId]: [] }));
    } finally {
      setBranchLoading(prev => ({ ...prev, [companyId]: false }));
    }
  }

  function toggleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!branches[id]) fetchBranches(id);
  }

  function openNewCompany() {
    setEditingCompany(null);
    setCompanyForm(emptyCompany);
    setShowCompanyModal(true);
  }

  function openEditCompany(c: Company) {
    setEditingCompany(c);
    setCompanyForm({ legal_name: c.legal_name, trade_name: c.trade_name || '', ruc: c.ruc || '',
      patronal_number_mtess: c.patronal_number_mtess || '', patronal_number_ips: c.patronal_number_ips || '',
      address: c.address || '', phone: c.phone || '', email: c.email || '', status: c.status });
    setShowCompanyModal(true);
  }

  async function saveCompany() {
    setSavingCompany(true);
    try {
      if (editingCompany) {
        await api.put(`/api/companies/${editingCompany.id}`, companyForm);
      } else {
        await api.post('/api/companies', companyForm);
      }
      setShowCompanyModal(false);
      fetchCompanies();
    } catch {
      alert('Error al guardar empresa');
    } finally { setSavingCompany(false); }
  }

  function openNewBranch(companyId: number) {
    setActiveBranchCompanyId(companyId);
    setEditingBranch(null);
    setBranchForm(emptyBranch);
    setShowBranchModal(true);
  }

  function openEditBranch(b: Branch) {
    setActiveBranchCompanyId(b.company_id);
    setEditingBranch(b);
    setBranchForm({ name: b.name, code: b.code || '', address: b.address || '', phone: b.phone || '', status: b.status });
    setShowBranchModal(true);
  }

  async function saveBranch() {
    if (!activeBranchCompanyId) return;
    setSavingBranch(true);
    try {
      if (editingBranch) {
        await api.put(`/api/companies/${activeBranchCompanyId}/branches/${editingBranch.id}`, branchForm);
      } else {
        await api.post(`/api/companies/${activeBranchCompanyId}/branches`, branchForm);
      }
      setShowBranchModal(false);
      fetchBranches(activeBranchCompanyId);
    } catch {
      alert('Error al guardar sucursal');
    } finally { setSavingBranch(false); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
            <p className="text-sm text-gray-500">Gestión de empresas y sucursales</p>
          </div>
        </div>
        <button onClick={openNewCompany}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Nueva Empresa
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
            Cargando...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 w-8"></th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Razón Social</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">RUC</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nro Patronal MTESS</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nro Patronal IPS</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay empresas registradas</td></tr>
              )}
              {companies.map(c => (
                <>
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => toggleExpand(c.id)}
                        className="text-gray-400 hover:text-blue-600 transition">
                        {expandedId === c.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.legal_name}</div>
                      {c.trade_name && <div className="text-xs text-gray-500">{c.trade_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.ruc || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.patronal_number_mtess || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.patronal_number_ips || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {c.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditCompany(c)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr key={`branches-${c.id}`}>
                      <td colSpan={7} className="bg-blue-50 px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 text-blue-700 font-semibold">
                            <GitBranch className="w-4 h-4" /> Sucursales de {c.legal_name}
                          </div>
                          <button onClick={() => openNewBranch(c.id)}
                            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700">
                            <Plus className="w-3 h-3" /> Nueva Sucursal
                          </button>
                        </div>
                        {branchLoading[c.id] ? (
                          <div className="text-blue-500 text-sm py-2">Cargando sucursales...</div>
                        ) : (
                          <table className="w-full text-xs bg-white rounded-lg overflow-hidden shadow-sm">
                            <thead className="bg-blue-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-blue-700">Nombre</th>
                                <th className="px-3 py-2 text-left text-blue-700">Código</th>
                                <th className="px-3 py-2 text-left text-blue-700">Dirección</th>
                                <th className="px-3 py-2 text-left text-blue-700">Teléfono</th>
                                <th className="px-3 py-2 text-left text-blue-700">Estado</th>
                                <th className="px-3 py-2 text-left text-blue-700">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-50">
                              {(branches[c.id] || []).length === 0 && (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-400">Sin sucursales</td></tr>
                              )}
                              {(branches[c.id] || []).map(b => (
                                <tr key={b.id} className="hover:bg-blue-50">
                                  <td className="px-3 py-2 font-medium text-gray-800">{b.name}</td>
                                  <td className="px-3 py-2 text-gray-600">{b.code || '—'}</td>
                                  <td className="px-3 py-2 text-gray-600">{b.address || '—'}</td>
                                  <td className="px-3 py-2 text-gray-600">{b.phone || '—'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {b.status === 'active' ? 'Activo' : 'Inactivo'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <button onClick={() => openEditBranch(b)} className="text-blue-600 hover:text-blue-800">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Company Modal */}
      {showCompanyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCompany ? 'Editar Empresa' : 'Nueva Empresa'}
              </h2>
              <button onClick={() => setShowCompanyModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              {[
                { label: 'Razón Social *', key: 'legal_name', col: 2 },
                { label: 'Nombre Comercial', key: 'trade_name', col: 2 },
                { label: 'RUC', key: 'ruc', col: 1 },
                { label: 'Nro Patronal MTESS', key: 'patronal_number_mtess', col: 1 },
                { label: 'Nro Patronal IPS', key: 'patronal_number_ips', col: 1 },
                { label: 'Teléfono', key: 'phone', col: 1 },
                { label: 'Email', key: 'email', col: 1 },
                { label: 'Dirección', key: 'address', col: 2 },
              ].map(f => (
                <div key={f.key} className={f.col === 2 ? 'col-span-2' : 'col-span-1'}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    value={(companyForm as any)[f.key] || ''}
                    onChange={e => setCompanyForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={companyForm.status}
                  onChange={e => setCompanyForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowCompanyModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={saveCompany} disabled={savingCompany || !companyForm.legal_name}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingCompany ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
              </h2>
              <button onClick={() => setShowBranchModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={branchForm.name}
                  onChange={e => setBranchForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input value={branchForm.code || ''}
                  onChange={e => setBranchForm(prev => ({ ...prev, code: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={branchForm.phone || ''}
                  onChange={e => setBranchForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input value={branchForm.address || ''}
                  onChange={e => setBranchForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select value={branchForm.status}
                  onChange={e => setBranchForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowBranchModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button onClick={saveBranch} disabled={savingBranch || !branchForm.name}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingBranch ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

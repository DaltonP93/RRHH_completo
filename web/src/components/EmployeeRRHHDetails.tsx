'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
function fmtGs(n: number) { return 'Gs. ' + Math.round(n||0).toLocaleString('es-PY'); }

interface Props { employeeId: number; }

export default function EmployeeRRHHDetails({ employeeId }: Props) {
  const [tab, setTab] = useState<'labor'|'bank'|'family'|'titles'|'concepts'|'plans'>('labor');
  const [profile, setProfile] = useState<any>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<any[]>([]);
  const [family, setFamily] = useState<any[]>([]);
  const [titles, setTitles] = useState<any[]>([]);
  const [fixedConcepts, setFixedConcepts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [laborForm, setLaborForm] = useState<any>({});
  const [bankForm, setBankForm] = useState<any>({});
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [familyForm, setFamilyForm] = useState({ full_name:'', relationship:'HIJO', birth_date:'', ips_beneficiary: false });

  useEffect(() => { if (employeeId) loadAll(); }, [employeeId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [pp, bks, pos, gls, ccs, ets, fam, tit, fc, pln, sh] = await Promise.all([
        fetch(`${API}/api/payroll/profiles/${employeeId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/banks`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/positions`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/grade-levels`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/cost-centers`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/employee-types`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/employees/${employeeId}/family`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/employees/${employeeId}/titles`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/employee-fixed-concepts/${employeeId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/development-plans?employee_id=${employeeId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/salary-history/${employeeId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      ]);
      setProfile(pp);
      setBanks(Array.isArray(bks) ? bks : bks.banks || []);
      setPositions(Array.isArray(pos) ? pos : pos.positions || []);
      setGradeLevels(Array.isArray(gls) ? gls : gls.grade_levels || []);
      setCostCenters(Array.isArray(ccs) ? ccs : ccs.cost_centers || []);
      setEmployeeTypes(Array.isArray(ets) ? ets : ets.types || []);
      setFamily(Array.isArray(fam) ? fam : fam.family || []);
      setTitles(Array.isArray(tit) ? tit : tit.titles || []);
      setFixedConcepts(Array.isArray(fc) ? fc : fc.concepts || []);
      setPlans(Array.isArray(pln) ? pln : pln.plans || []);
      setSalaryHistory(Array.isArray(sh) ? sh : sh.history || []);
      setLaborForm({
        position_id: pp?.position_id || '',
        grade_level_id: pp?.grade_level_id || '',
        employee_type_id: pp?.employee_type_id || '',
        cost_center_id: pp?.cost_center_id || '',
        ips_number: pp?.ips_number || '',
        mtess_worker_number: pp?.mtess_worker_number || '',
      });
      setBankForm({
        bank_id: pp?.bank_id || '',
        bank_account_number: pp?.bank_account_number || '',
        bank_account_type: pp?.bank_account_type || 'AHORRO',
        payment_method: pp?.payment_method || 'BANCO',
        base_salary: pp?.base_salary || 0,
      });
    } finally { setLoading(false); }
  }

  async function saveLaborProfile() {
    setSaving(true);
    const r = await fetch(`${API}/api/employees/${employeeId}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(laborForm) });
    setSaving(false);
    if (!r.ok) alert('Error al guardar perfil laboral');
  }

  async function saveBankProfile() {
    setSaving(true);
    const r = await fetch(`${API}/api/payroll/profiles`, {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({ ...bankForm, employee_id: employeeId, valid_from: new Date().toISOString().split('T')[0] })
    });
    setSaving(false);
    if (!r.ok) alert('Error al guardar datos bancarios/salariales');
    else loadAll();
  }

  async function addFamilyMember() {
    const r = await fetch(`${API}/api/employees/${employeeId}/family`, { method:'POST', headers: authHeaders(), body: JSON.stringify(familyForm) });
    if (r.ok) { setShowNewFamily(false); loadAll(); }
    else alert('Error al agregar familiar');
  }

  async function removeFixedConcept(id: number) {
    if (!confirm('¿Eliminar este concepto fijo?')) return;
    const r = await fetch(`${API}/api/employee-fixed-concepts/${id}`, { method:'DELETE', headers: authHeaders() });
    if (r.ok) loadAll();
  }

  const RELATIONSHIPS: Record<string,string> = { CONYUGE:'Cónyuge', HIJO:'Hijo', HIJA:'Hija', PADRE:'Padre', MADRE:'Madre', OTRO:'Otro' };

  if (loading) return <div className="p-4 text-center text-gray-400 text-sm">Cargando datos RRHH...</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
        {[['labor','Perfil Laboral'],['bank','Datos Bancarios'],['family','Familia'],['titles','Títulos'],['concepts','Conceptos Fijos'],['plans','Plan de Desarrollo']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${tab===k ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      <div className="p-4">
        {/* LABOR TAB */}
        {tab === 'labor' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
                <select value={laborForm.position_id||''} onChange={e => setLaborForm((p:any) => ({...p,position_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin cargo asignado</option>
                  {positions.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Escalafón</label>
                <select value={laborForm.grade_level_id||''} onChange={e => setLaborForm((p:any) => ({...p,grade_level_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin escalafón</option>
                  {gradeLevels.map((g:any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Empleado</label>
                <select value={laborForm.employee_type_id||''} onChange={e => setLaborForm((p:any) => ({...p,employee_type_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin tipo</option>
                  {employeeTypes.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Centro de Costo</label>
                <select value={laborForm.cost_center_id||''} onChange={e => setLaborForm((p:any) => ({...p,cost_center_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin centro de costo</option>
                  {costCenters.map((c:any) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </div>
              {[['ips_number','Número IPS'],['mtess_worker_number','Número MTESS']].map(([f,l]) => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                  <input value={laborForm[f]||''} onChange={e => setLaborForm((p:any) => ({...p,[f]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                </div>
              ))}
            </div>
            <button onClick={saveLaborProfile} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving?'Guardando...':'Guardar Perfil Laboral'}</button>

            {salaryHistory.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">Historial Salarial</h3>
                <div className="space-y-1">
                  {salaryHistory.map((s:any) => (
                    <div key={s.id} className="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-100">
                      <span>{new Date(s.change_date).toLocaleDateString('es-PY')}</span>
                      <span className="text-red-400">{fmtGs(s.previous_salary)}</span>
                      <span>→</span>
                      <span className="text-green-600 font-medium">{fmtGs(s.new_salary)}</span>
                      <span className="text-gray-400 max-w-xs truncate">{s.reason||'-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BANK TAB */}
        {tab === 'bank' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Salario Base (Gs.)</label>
                <input type="number" value={bankForm.base_salary||0} onChange={e => setBankForm((p:any) => ({...p,base_salary:+e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago</label>
                <select value={bankForm.payment_method||'BANCO'} onChange={e => setBankForm((p:any) => ({...p,payment_method:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="BANCO">Banco</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
                <select value={bankForm.bank_id||''} onChange={e => setBankForm((p:any) => ({...p,bank_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar banco...</option>
                  {banks.map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Número de Cuenta</label>
                <input value={bankForm.bank_account_number||''} onChange={e => setBankForm((p:any) => ({...p,bank_account_number:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Cuenta</label>
                <select value={bankForm.bank_account_type||'AHORRO'} onChange={e => setBankForm((p:any) => ({...p,bank_account_type:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="AHORRO">Caja de Ahorro</option>
                  <option value="CORRIENTE">Cuenta Corriente</option>
                  <option value="CAJA_AHORRO">Caja de Ahorro</option>
                </select>
              </div>
            </div>
            <button onClick={saveBankProfile} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving?'Guardando...':'Guardar Datos Bancarios'}</button>
          </div>
        )}

        {/* FAMILY TAB */}
        {tab === 'family' && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => setShowNewFamily(true)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">+ Agregar Familiar</button>
            </div>
            <div className="space-y-2">
              {family.map((f:any) => (
                <div key={f.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{f.full_name}</span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{RELATIONSHIPS[f.relationship]||f.relationship}</span>
                    {f.ips_beneficiary && <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Beneficiario IPS</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {f.birth_date && <span className="text-xs text-gray-400">{new Date(f.birth_date).toLocaleDateString('es-PY')}</span>}
                    <button className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </div>
              ))}
              {family.length===0 && <p className="text-gray-400 text-sm text-center py-4">No hay familiares registrados</p>}
            </div>
            {showNewFamily && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Nuevo Familiar</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre Completo</label>
                    <input value={familyForm.full_name} onChange={e => setFamilyForm(p => ({...p,full_name:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Parentesco</label>
                    <select value={familyForm.relationship} onChange={e => setFamilyForm(p => ({...p,relationship:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {Object.entries(RELATIONSHIPS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Nacimiento</label>
                    <input type="date" value={familyForm.birth_date} onChange={e => setFamilyForm(p => ({...p,birth_date:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="ips_ben" checked={familyForm.ips_beneficiary} onChange={e => setFamilyForm(p => ({...p,ips_beneficiary:e.target.checked}))} className="w-4 h-4"/>
                    <label htmlFor="ips_ben" className="text-sm text-gray-700">Beneficiario IPS</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={addFamilyMember} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Guardar</button>
                  <button onClick={() => setShowNewFamily(false)} className="px-3 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TITLES TAB */}
        {tab === 'titles' && (
          <div>
            {titles.map((t:any) => (
              <div key={t.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 mb-2">
                <div>
                  <span className="font-medium text-gray-900 text-sm">{t.title_name||`Título #${t.title_id}`}</span>
                  <span className="ml-2 text-xs text-gray-500">{t.institution}</span>
                </div>
                <span className="text-xs text-gray-400">{t.graduation_year||'-'}</span>
              </div>
            ))}
            {titles.length===0 && <p className="text-gray-400 text-sm text-center py-4">Sin títulos académicos registrados</p>}
          </div>
        )}

        {/* FIXED CONCEPTS TAB */}
        {tab === 'concepts' && (
          <div>
            <div className="space-y-2">
              {fixedConcepts.map((fc:any) => (
                <div key={fc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{fc.concept_name||`Concepto #${fc.salary_concept_id}`}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs ${fc.concept_type==='INCOME'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{fc.concept_type==='INCOME'?'Ingreso':'Descuento'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">{fc.amount ? fmtGs(fc.amount) : `${fc.percentage}%`}</span>
                    <button onClick={() => removeFixedConcept(fc.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </div>
              ))}
              {fixedConcepts.length===0 && <p className="text-gray-400 text-sm text-center py-4">Sin conceptos fijos asignados</p>}
            </div>
          </div>
        )}

        {/* PLANS TAB */}
        {tab === 'plans' && (
          <div>
            {plans.map((p:any) => (
              <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 mb-2">
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-gray-900 text-sm">{p.title}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs ${p.status==='completed'?'bg-green-100 text-green-700':p.status==='in_progress'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                </div>
                {p.description && <p className="text-xs text-gray-500 mt-1">{p.description}</p>}
                <a href={`/competencias/planes`} className="text-xs text-blue-600 hover:underline mt-1 block">Ver Plan →</a>
              </div>
            ))}
            {plans.length===0 && <p className="text-gray-400 text-sm text-center py-4">Sin planes de desarrollo</p>}
          </div>
        )}
      </div>
    </div>
  );
}

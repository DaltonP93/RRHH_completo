'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const RISK_COLORS: Record<string,string> = { low:'bg-gray-100 text-gray-600', normal:'bg-blue-100 text-blue-700', high:'bg-orange-100 text-orange-700', critical:'bg-red-100 text-red-700' };
const RISK_LABELS: Record<string,string> = { low:'Bajo', normal:'Normal', high:'Alto', critical:'Crítico' };
const SCOPE_TYPES = ['global','company','branch','area','team','self','custom'];

export default function SeguridadAvanzadaPage() {
  const [tab, setTab] = useState<'modules'|'permissions'|'roles'|'users'|'fields'|'scopes'>('roles');
  const [modules, setModules] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [testUserId, setTestUserId] = useState('');
  const [testPermCode, setTestPermCode] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);
  const [roleForm, setRoleForm] = useState({ code:'', name:'', description:'' });
  const [userSearch, setUserSearch] = useState('');
  const [userRoles, setUserRoles] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [mods, perms, rls] = await Promise.all([
        fetch(`${API}/api/security/modules`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/security/permissions`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/security/roles`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      ]);
      setModules(Array.isArray(mods) ? mods : mods.modules || []);
      setPermissions(Array.isArray(perms) ? perms : perms.permissions || []);
      setRoles(Array.isArray(rls) ? rls : rls.roles || []);
    } finally { setLoading(false); }
  }
  async function loadRolePermissions(roleId: number) {
    const r = await fetch(`${API}/api/security/roles/${roleId}`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setRolePermissions(d.permissions || []); }
  }
  async function toggleModuleEnabled(code: string, enabled: boolean) {
    const r = await fetch(`${API}/api/security/modules/${code}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({ enabled }) });
    if (r.ok) loadAll();
  }
  async function createRole() {
    if (!roleForm.code || !roleForm.name) return;
    const r = await fetch(`${API}/api/security/roles`, { method:'POST', headers: authHeaders(), body: JSON.stringify(roleForm) });
    if (r.ok) { setShowNewRole(false); loadAll(); }
  }
  async function assignPermission(roleId: number, permId: number) {
    const r = await fetch(`${API}/api/security/roles/${roleId}/permissions`, {
      method:'POST', headers: authHeaders(), body: JSON.stringify({ permission_ids: [permId], allow_effect: 'allow' })
    });
    if (r.ok && selectedRole) loadRolePermissions(roleId);
  }
  async function removePermission(roleId: number, permId: number) {
    const r = await fetch(`${API}/api/security/roles/${roleId}/permissions/${permId}`, { method:'DELETE', headers: authHeaders() });
    if (r.ok && selectedRole) loadRolePermissions(roleId);
  }
  async function testAccess() {
    if (!testUserId || !testPermCode) return;
    const r = await fetch(`${API}/api/security/test-access`, {
      method:'POST', headers: authHeaders(), body: JSON.stringify({ user_id: testUserId, permission_code: testPermCode })
    });
    if (r.ok) setTestResult(await r.json());
  }
  async function loadUserRoles() {
    if (!userSearch) return;
    const r = await fetch(`${API}/api/security/users/${userSearch}/roles`, { headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setUserRoles(Array.isArray(d) ? d : d.roles || []); }
  }

  const groupedPerms = modules.map(m => ({ ...m, perms: permissions.filter(p => p.module_code === m.code) }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Seguridad Avanzada</h1>
      <p className="text-sm text-gray-500 mb-6">Control de acceso granular: RBAC + ABAC + Field-Level Security</p>

      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
        {[['roles','Roles'],['modules','Módulos'],['permissions','Permisos'],['users','Usuarios y Roles'],['fields','Campos Sensibles'],['scopes','Alcances']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {/* ROLES TAB */}
      {tab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-gray-600 uppercase">Roles</h2>
              <button onClick={() => setShowNewRole(true)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">+ Nuevo Rol</button>
            </div>
            <div className="space-y-2">
              {roles.map((r:any) => (
                <div key={r.id} onClick={() => { setSelectedRole(r); loadRolePermissions(r.id); }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedRole?.id===r.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:shadow-sm'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium text-gray-900 text-sm">{r.name}</span>
                      {r.system_role && <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Sistema</span>}
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.enabled?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{r.enabled?'Activo':'Inactivo'}</span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{r.code}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedRole ? (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-sm font-semibold text-gray-600 uppercase">Permisos de: {selectedRole.name}</h2>
                  <span className="text-xs text-gray-400">{rolePermissions.length} permisos asignados</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 max-h-96 overflow-y-auto">
                  {groupedPerms.filter(g => g.perms.length > 0).map(g => (
                    <div key={g.code}>
                      <div className="px-4 py-2 bg-gray-50 border-b border-t text-xs font-semibold text-gray-600 uppercase">{g.name}</div>
                      {g.perms.map((p:any) => {
                        const assigned = rolePermissions.some((rp:any) => rp.id === p.id || rp.permission_id === p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 hover:bg-gray-50">
                            <div>
                              <span className="text-sm text-gray-800">{p.name}</span>
                              <span className="ml-2 font-mono text-xs text-gray-400">{p.permission_code}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${RISK_COLORS[p.risk_level]}`}>{RISK_LABELS[p.risk_level]}</span>
                              <input type="checkbox" checked={assigned} onChange={e => { e.target.checked ? assignPermission(selectedRole.id, p.id) : removePermission(selectedRole.id, p.id); }} className="w-4 h-4 rounded cursor-pointer"/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">Probar Acceso</h3>
                  <div className="flex gap-2 flex-wrap">
                    <input value={testUserId} onChange={e => setTestUserId(e.target.value)} placeholder="ID Usuario" className="border border-blue-300 rounded px-2 py-1 text-sm flex-1 min-w-20"/>
                    <input value={testPermCode} onChange={e => setTestPermCode(e.target.value)} placeholder="permiso.code (ej: payroll.run.approve)" className="border border-blue-300 rounded px-2 py-1 text-sm flex-1 min-w-48"/>
                    <button onClick={testAccess} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Probar</button>
                  </div>
                  {testResult && (
                    <div className={`mt-2 p-2 rounded text-sm ${testResult.hasAccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {testResult.hasAccess ? `✅ Tiene acceso (via rol: ${testResult.via_role||'?'})` : `❌ Sin acceso (requiere: ${testResult.required_permission||testPermCode})`}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <p className="text-gray-400 text-sm">Seleccione un rol para ver y editar sus permisos</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODULES TAB */}
      {tab === 'modules' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m:any) => (
            <div key={m.code} className="bg-white rounded-xl border border-gray-200 p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{m.name}</h3>
                <p className="text-xs text-gray-400 font-mono">{m.code}</p>
                {m.description && <p className="text-xs text-gray-500 mt-1">{m.description}</p>}
              </div>
              <button onClick={() => toggleModuleEnabled(m.code, !m.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${m.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${m.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* PERMISSIONS TAB */}
      {tab === 'permissions' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>{['Módulo','Permiso','Nombre','Riesgo'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {permissions.map((p:any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{p.module_code}</span></td>
                  <td className="px-4 py-2 font-mono text-xs text-blue-600">{p.permission_code}</td>
                  <td className="px-4 py-2 text-gray-800">{p.name}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLORS[p.risk_level]}`}>{RISK_LABELS[p.risk_level]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div>
          <div className="flex gap-3 mb-4">
            <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="ID de usuario..." className="border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
            <button onClick={loadUserRoles} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Buscar</button>
          </div>
          {userRoles.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-semibold text-gray-800 text-sm">Roles asignados al usuario #{userSearch}</h3></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{['Rol','Empresa','Sucursal','Dep.','Válido Desde','Válido Hasta',''].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-600">{h}</th>)}</tr></thead>
                <tbody>{userRoles.map((ur:any,i:number) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{ur.role_name||ur.role_code}</td>
                    <td className="px-4 py-2 text-gray-500">{ur.company_id||'-'}</td>
                    <td className="px-4 py-2 text-gray-500">{ur.branch_id||'-'}</td>
                    <td className="px-4 py-2 text-gray-500">{ur.department_id||'-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{ur.valid_from||'-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{ur.valid_to||'-'}</td>
                    <td className="px-4 py-2"><button className="text-xs text-red-400 hover:text-red-600">Revocar</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FIELDS TAB */}
      {tab === 'fields' && (
        <div>
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
            <strong>Campos sensibles:</strong> Define qué roles pueden ver o editar campos específicos de las entidades. Usa reglas de máscara para datos parcialmente visibles (ej: MASK_LAST_4 para cuentas bancarias).
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Seleccione un rol en la pestaña "Roles" y configure los permisos por campo desde el detalle del rol.
          </div>
        </div>
      )}

      {/* SCOPES TAB */}
      {tab === 'scopes' && (
        <div>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCOPE_TYPES.map(s => (
              <div key={s} className="bg-white rounded-xl border border-gray-200 p-3">
                <h3 className="font-semibold text-gray-800 text-sm mb-1 capitalize">{s}</h3>
                <p className="text-xs text-gray-500">{{
                  global:'Acceso total al sistema',
                  company:'Solo una empresa específica',
                  branch:'Solo una sucursal específica',
                  area:'Solo un área/departamento',
                  team:'Solo el equipo directo del usuario',
                  self:'Solo la información propia',
                  custom:'Regla personalizada en JSON',
                }[s]}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Los alcances se configuran al asignar roles a usuarios. Vaya a "Usuarios y Roles" para asignar scopes específicos.
          </div>
        </div>
      )}

      {/* NEW ROLE MODAL */}
      {showNewRole && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Rol</h2>
            <div className="space-y-3">
              {[['code','Código (ej: JEFE_VENTAS)'],['name','Nombre'],['description','Descripción']].map(([f,l]) => (
                <div key={f}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{l}</label>
                  {f==='description' ? (
                    <textarea value={roleForm.description} onChange={e => setRoleForm(p=>({...p,description:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"/>
                  ) : (
                    <input value={(roleForm as any)[f]} onChange={e => setRoleForm(p=>({...p,[f]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createRole} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Crear</button>
              <button onClick={() => setShowNewRole(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

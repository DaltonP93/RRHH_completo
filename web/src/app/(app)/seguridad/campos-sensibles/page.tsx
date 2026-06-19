'use client'
import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Eye, EyeOff, Edit2, Loader2, Plus, Trash2, Save, X } from 'lucide-react'
import { api } from '@/lib/api'
import EnterprisePageHeader from '@/components/ui/EnterprisePageHeader'

interface Role { id: number; name: string; code: string }
interface FieldPermission {
  id?: number
  role_id: number
  entity_name: string
  field_name: string
  can_view: boolean
  can_edit: boolean
  mask_rule: string | null
}

const MASK_RULES = [
  { value: '', label: 'Sin máscara' },
  { value: 'HIDDEN', label: 'Oculto' },
  { value: 'MASK_LAST_4', label: 'Últimos 4 visibles' },
  { value: 'MASK_FIRST_4', label: 'Primeros 4 visibles' },
  { value: 'HASH', label: 'Hash (****)' },
]

const BASE_FIELDS: { entity: string; fields: string[] }[] = [
  {
    entity: 'employee',
    fields: [
      'base_salary', 'bank_account_number', 'document_number',
      'birth_date', 'phone', 'address', 'emergency_contact',
    ],
  },
]

export default function CamposSensiblesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [perms, setPerms] = useState<FieldPermission[]>([])
  const [selectedRole, setSelectedRole] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newField, setNewField] = useState({ entity_name: 'employee', field_name: '', mask_rule: '' })
  const [flashError, setFlashError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/roles')
      .then(r => {
        const d = r.data
        const list: Role[] = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
        setRoles(list)
        if (list.length > 0) setSelectedRole(list[0].id)
      })
      .catch(() => {})
  }, [])

  const loadPerms = useCallback(async (roleId: number) => {
    setLoading(true)
    try {
      const r = await api.get(`/api/security/field-permissions?role_id=${roleId}`)
      const d = r.data
      setPerms(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
    } catch { setPerms([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (selectedRole) loadPerms(selectedRole) }, [selectedRole, loadPerms])

  const permKey = (entity: string, field: string) => `${entity}.${field}`

  const getPerm = (entity: string, field: string) =>
    perms.find(p => p.entity_name === entity && p.field_name === field)

  async function upsert(fp: FieldPermission) {
    const key = permKey(fp.entity_name, fp.field_name)
    setSaving(key)
    setFlashError(null)
    try {
      if (fp.id) {
        await api.put(`/api/security/field-permissions/${fp.id}`, fp)
        setPerms(prev => prev.map(p => p.id === fp.id ? fp : p))
      } else {
        const r = await api.post('/api/security/field-permissions', fp)
        const saved = { ...fp, id: r.data?.id ?? r.data?.data?.id }
        setPerms(prev => {
          const idx = prev.findIndex(p => p.entity_name === fp.entity_name && p.field_name === fp.field_name)
          return idx >= 0 ? prev.map((p, i) => i === idx ? saved : p) : [...prev, saved]
        })
      }
    } catch (e: unknown) {
      setFlashError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(null) }
  }

  async function remove(fp: FieldPermission) {
    if (!fp.id) return
    setSaving(permKey(fp.entity_name, fp.field_name))
    try {
      await api.delete(`/api/security/field-permissions/${fp.id}`)
      setPerms(prev => prev.filter(p => p.id !== fp.id))
    } catch (e: unknown) {
      setFlashError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally { setSaving(null) }
  }

  function toggle(entity: string, field: string, prop: 'can_view' | 'can_edit') {
    const existing = getPerm(entity, field)
    const next: FieldPermission = existing
      ? { ...existing, [prop]: !existing[prop] }
      : { role_id: selectedRole!, entity_name: entity, field_name: field, can_view: true, can_edit: false, mask_rule: null, [prop]: true }
    upsert(next)
  }

  function setMask(entity: string, field: string, mask: string) {
    const existing = getPerm(entity, field)
    const next: FieldPermission = existing
      ? { ...existing, mask_rule: mask || null }
      : { role_id: selectedRole!, entity_name: entity, field_name: field, can_view: true, can_edit: false, mask_rule: mask || null }
    upsert(next)
  }

  async function addField() {
    if (!newField.field_name.trim() || !selectedRole) return
    await upsert({
      role_id: selectedRole,
      entity_name: newField.entity_name,
      field_name: newField.field_name.trim(),
      can_view: true,
      can_edit: false,
      mask_rule: newField.mask_rule || null,
    })
    setNewField({ entity_name: 'employee', field_name: '', mask_rule: '' })
    setAddingField(false)
  }

  const currentRole = roles.find(r => r.id === selectedRole)

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <EnterprisePageHeader
        icon={ShieldCheck}
        iconColor="bg-slate-700"
        title="Campos Sensibles"
        subtitle="Visibilidad y enmascaramiento de datos PII por rol"
        breadcrumbs={[
          { label: 'Seguridad', href: '/seguridad' },
          { label: 'Campos Sensibles' },
        ]}
      />

      {flashError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <X size={14} className="flex-shrink-0" /> {flashError}
        </div>
      )}

      {/* Role tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Rol:</span>
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedRole(r.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedRole === r.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-300" size={24} /></div>
      ) : selectedRole ? (
        BASE_FIELDS.map(group => {
          const extraFields = perms
            .filter(p => p.entity_name === group.entity && !group.fields.includes(p.field_name))
            .map(p => p.field_name)
          const allFields = [...group.fields, ...extraFields]
          return (
            <div key={group.entity} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Entidad: {group.entity}
                </span>
                <span className="text-xs text-slate-400">
                  Rol: <span className="font-medium text-slate-600">{currentRole?.name}</span>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/50">
                  <tr>
                    {['Campo', 'Ver', 'Editar', 'Máscara', ''].map(h => (
                      <th key={h} className={`px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Ver' || h === 'Editar' ? 'text-center' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allFields.map(field => {
                    const p = getPerm(group.entity, field)
                    const key = permKey(group.entity, field)
                    const busy = saving === key
                    return (
                      <tr key={field} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-sm text-slate-700">{field}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggle(group.entity, field, 'can_view')}
                            disabled={busy}
                            title={p?.can_view ?? true ? 'Visible' : 'Oculto'}
                            className={`p-1 rounded transition-colors ${p?.can_view ?? true ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-300 hover:text-slate-400'}`}
                          >
                            {p?.can_view ?? true ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggle(group.entity, field, 'can_edit')}
                            disabled={busy}
                            title={p?.can_edit ? 'Editable' : 'Solo lectura'}
                            className={`p-1 rounded transition-colors ${p?.can_edit ? 'text-blue-600 hover:text-blue-700' : 'text-slate-300 hover:text-slate-400'}`}
                          >
                            <Edit2 size={15} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={p?.mask_rule ?? ''}
                            onChange={e => setMask(group.entity, field, e.target.value)}
                            disabled={busy}
                            className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                          >
                            {MASK_RULES.map(mr => <option key={mr.value} value={mr.value}>{mr.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-right w-10">
                          {busy
                            ? <Loader2 size={13} className="animate-spin text-slate-400 inline" />
                            : p?.id
                              ? <button onClick={() => remove(p)} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Eliminar regla"><Trash2 size={13} /></button>
                              : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {addingField ? (
                <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="nombre_campo"
                    value={newField.field_name}
                    onChange={e => setNewField(f => ({ ...f, field_name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addField()}
                    className="text-xs border border-slate-200 rounded px-2 py-1.5 w-44 font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                    autoFocus
                  />
                  <select
                    value={newField.mask_rule}
                    onChange={e => setNewField(f => ({ ...f, mask_rule: e.target.value }))}
                    className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  >
                    {MASK_RULES.map(mr => <option key={mr.value} value={mr.value}>{mr.label}</option>)}
                  </select>
                  <button onClick={addField} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700">
                    <Save size={12} /> Guardar
                  </button>
                  <button onClick={() => setAddingField(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="px-4 py-2 border-t border-slate-50">
                  <button
                    onClick={() => { setAddingField(true); setNewField(f => ({ ...f, entity_name: group.entity })) }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-0.5"
                  >
                    <Plus size={12} /> Agregar campo personalizado
                  </button>
                </div>
              )}
            </div>
          )
        })
      ) : (
        <div className="text-center py-12 text-slate-400 text-sm">Selecciona un rol para configurar.</div>
      )}
    </div>
  )
}

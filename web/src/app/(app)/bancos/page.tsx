'use client';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';

function formatGs(n: number) {
  return 'Gs. ' + Math.round(n).toLocaleString('es-PY');
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  validated: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  generated: 'bg-purple-100 text-purple-700',
  uploaded: 'bg-indigo-100 text-indigo-700',
  confirmed: 'bg-teal-100 text-teal-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function BancosPage() {
  const [tab, setTab] = useState<'banks' | 'batches' | 'layouts'>('banks');
  const [banks, setBanks] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [bankForm, setBankForm] = useState({ code: '', name: '', country: 'Paraguay', swift_code: '' });
  const [batchForm, setBatchForm] = useState({ bank_id: '', payroll_run_id: '', payment_date: '', currency_id: 'PYG' });
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [batchLines, setBatchLines] = useState<any[]>([]);
  const [selectedLayoutBank, setSelectedLayoutBank] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadBanks(); loadBatches(); }, []);
  useEffect(() => { if (tab === 'layouts' && selectedLayoutBank) loadLayouts(selectedLayoutBank); }, [tab, selectedLayoutBank]);

  async function loadBanks() {
    setLoading(true);
    try {
      const r = await api.get('/api/banks');
      setBanks(r.data);
    } catch {} finally { setLoading(false); }
  }
  async function loadBatches() {
    try { const r = await api.get('/api/payment-batches'); setBatches(r.data); } catch {}
  }
  async function loadLayouts(bankId: string) {
    try { const r = await api.get('/api/bank-file-layouts', { params: { bank_id: bankId } }); setLayouts(r.data); } catch {}
  }
  async function loadBatchLines(batchId: number) {
    try { const r = await api.get(`/api/payment-batches/${batchId}`); setBatchLines(r.data.lines || []); } catch {}
  }

  async function saveBank() {
    try {
      await api.post('/api/banks', bankForm);
      setShowBankModal(false); setBankForm({ code: '', name: '', country: 'Paraguay', swift_code: '' }); loadBanks();
    } catch { setError('Error al guardar banco'); }
  }
  async function saveBatch() {
    try {
      await api.post('/api/payment-batches', batchForm);
      setShowBatchModal(false); loadBatches();
    } catch { setError('Error al crear lote'); }
  }
  async function generateFromPayroll(batchId: number, payrollRunId: string) {
    const runId = payrollRunId || prompt('ID de liquidación:');
    if (!runId) return;
    try {
      await api.post(`/api/payment-batches/${batchId}/generate-from-payroll`, { payroll_run_id: runId });
      loadBatches(); alert('Lote generado desde nómina');
    } catch { alert('Error al generar'); }
  }
  async function approveBatch(batchId: number) {
    if (!confirm('¿Aprobar este lote de pago?')) return;
    try { await api.post(`/api/payment-batches/${batchId}/approve`); loadBatches(); }
    catch { alert('Error al aprobar'); }
  }
  async function exportCSV(batchId: number) {
    try {
      const r = await api.get(`/api/payment-batches/${batchId}/export-csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = `pago_salarios_${batchId}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bancos y Pagos</h1>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}<button className="ml-2 text-red-400 hover:text-red-600" onClick={() => setError('')}>✕</button></div>}

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[['banks','Bancos'],['batches','Lotes de Pago'],['layouts','Layouts']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {/* BANKS TAB */}
      {tab === 'banks' && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-gray-500">{banks.length} bancos registrados</p>
            <button onClick={() => setShowBankModal(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Banco</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Código','Nombre','País','SWIFT','Estado',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr> :
                  banks.map((b: any) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-blue-700">{b.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                      <td className="px-4 py-3 text-gray-500">{b.country}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{b.swift_code || '-'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'}`}>{b.status==='active'?'Activo':'Inactivo'}</span></td>
                      <td className="px-4 py-3 text-right"><button className="text-xs text-blue-600 hover:underline">Editar</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BATCHES TAB */}
      {tab === 'batches' && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-gray-500">{batches.length} lotes registrados</p>
            <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Nuevo Lote</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Fecha Pago','Banco','Total','Registros','Estado','Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{b.payment_date ? new Date(b.payment_date).toLocaleDateString('es-PY') : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{b.bank_name || `Banco #${b.bank_id}`}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatGs(b.total_amount||0)}</td>
                    <td className="px-4 py-3 text-gray-500">{b.total_records||0}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]||'bg-gray-100 text-gray-600'}`}>{b.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => { setSelectedBatch(b); loadBatchLines(b.id); }} className="text-xs text-blue-600 hover:underline">Ver</button>
                        {b.status==='draft' && <button onClick={() => generateFromPayroll(b.id, b.payroll_run_id)} className="text-xs text-green-600 hover:underline">Generar</button>}
                        {b.status==='validated' && <button onClick={() => approveBatch(b.id)} className="text-xs text-purple-600 hover:underline">Aprobar</button>}
                        {(b.status==='approved'||b.status==='generated') && <button onClick={() => exportCSV(b.id)} className="text-xs text-indigo-600 hover:underline">Exportar CSV</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay lotes de pago</td></tr>}
              </tbody>
            </table>
          </div>

          {selectedBatch && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Líneas del Lote #{selectedBatch.id}</h3>
                <button onClick={() => setSelectedBatch(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>{['Empleado','CI','Banco','Cuenta','Monto','Estado'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {batchLines.map((l: any) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">{l.full_name}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{l.document_number}</td>
                      <td className="px-3 py-2 text-gray-500">{l.bank_code||'-'}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{l.bank_account_number||'-'}</td>
                      <td className="px-3 py-2 font-medium">{formatGs(l.amount||0)}</td>
                      <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${l.status==='processed'?'bg-green-100 text-green-700':l.status==='rejected'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-600'}`}>{l.status}</span></td>
                    </tr>
                  ))}
                  {batchLines.length===0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Sin líneas. Use "Generar desde Nómina".</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LAYOUTS TAB */}
      {tab === 'layouts' && (
        <div>
          <div className="mb-4 flex gap-3 items-center">
            <label className="text-sm text-gray-600 font-medium">Banco:</label>
            <select value={selectedLayoutBank} onChange={e => setSelectedLayoutBank(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Seleccionar —</option>
              {banks.map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {layouts.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{['Nombre','Formato','Versión','Delimitador','Activo'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{h}</th>)}</tr></thead>
                <tbody>{layouts.map((l:any) => <tr key={l.id} className="border-b hover:bg-gray-50"><td className="px-4 py-3">{l.name}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">{l.format_type}</span></td><td className="px-4 py-3">{l.version}</td><td className="px-4 py-3 font-mono">{l.delimiter||','}</td><td className="px-4 py-3">{l.active?'✓':'✗'}</td></tr>)}</tbody>
              </table>
            </div>
          ) : selectedLayoutBank ? <p className="text-gray-400 text-sm py-8 text-center">No hay layouts para este banco.</p> : <p className="text-gray-400 text-sm py-8 text-center">Seleccione un banco para ver sus layouts.</p>}
        </div>
      )}

      {/* BANK MODAL */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Banco</h2>
            {[['code','Código'],['name','Nombre'],['country','País'],['swift_code','Código SWIFT']].map(([f,l]) => (
              <div key={f} className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">{l}</label>
                <input value={(bankForm as any)[f]} onChange={e => setBankForm(p => ({...p,[f]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
            ))}
            <div className="flex gap-3 mt-4">
              <button onClick={saveBank} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Guardar</button>
              <button onClick={() => setShowBankModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH MODAL */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Nuevo Lote de Pago</h2>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
              <select value={batchForm.bank_id} onChange={e => setBatchForm(p=>({...p,bank_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar banco...</option>
                {banks.map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Pago</label>
              <input type="date" value={batchForm.payment_date} onChange={e => setBatchForm(p=>({...p,payment_date:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Liquidación (opcional)</label>
              <input value={batchForm.payroll_run_id} onChange={e => setBatchForm(p=>({...p,payroll_run_id:e.target.value}))} placeholder="ID de nómina asociada" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveBatch} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Crear Lote</button>
              <button onClick={() => setShowBatchModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

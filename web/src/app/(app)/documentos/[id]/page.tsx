'use client';
import { api } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = {
  draft:'bg-gray-100 text-gray-700', active:'bg-blue-100 text-blue-700',
  sent:'bg-indigo-100 text-indigo-700', viewed:'bg-yellow-100 text-yellow-700',
  in_review:'bg-orange-100 text-orange-700', signed:'bg-green-100 text-green-700',
  completed:'bg-teal-100 text-teal-700', cancelled:'bg-red-100 text-red-700',
};

export default function DocumentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'preview'|'comments'|'audit'>('preview');
  const [showSign, setShowSign] = useState(false);
  const [signatureType, setSignatureType] = useState<'DRAWN'|'PASSWORD'>('DRAWN');
  const [signatureText, setSignatureText] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) loadDocument(); }, [id]);

  async function loadDocument() {
    setLoading(true);
    try {
      const [docR, commR, auditR] = await Promise.all([
        api.get(`/api/documents/${id}`),
        api.get(`/api/documents/${id}/comments`),
        api.get(`/api/documents/${id}/audit`),
      ]);
      setDoc(docR.data);
      const commD = commR.data; setComments(Array.isArray(commD) ? commD : commD.comments || []);
      const auditD = auditR.data; setAuditLog(Array.isArray(auditD) ? auditD : auditD.logs || []);
      // Mark as viewed
      await api.post(`/api/documents/${id}/view`);
    } finally { setLoading(false); }
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.beginPath(); ctx.moveTo(e.clientX-rect.left, e.clientY-rect.top);
  }
  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.lineTo(e.clientX-rect.left, e.clientY-rect.top); ctx.stroke();
  }
  function clearCanvas() {
    if (!canvasRef.current) return;
    canvasRef.current.getContext('2d')!.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
  }

  async function sign() {
    setSaving(true);
    try {
      let signature_data = signatureText;
      if (signatureType==='DRAWN' && canvasRef.current) {
        signature_data = canvasRef.current.toDataURL('image/png');
      }
      const recipient = doc?.recipients?.find((r:any) => r.status==='sent'||r.status==='viewed');
      const r = await api.post(`/api/documents/${id}/sign`, { recipient_id: recipient?.id, signature_type: signatureType, signature_image_base64: signature_data });
      setShowSign(false); loadDocument();
    } finally { setSaving(false); }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/documents/${id}/comments`, { comment, visibility:'ALL' });
      setComment(''); loadDocument();
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando documento...</div>;
  if (!doc) return <div className="p-6 text-center text-gray-500">Documento no encontrado. <button onClick={() => router.back()} className="text-blue-600 hover:underline">Volver</button></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2 block">← Volver</button>
          <h1 className="text-xl font-bold text-gray-900">{doc.title}</h1>
          <p className="text-sm text-gray-500 mt-1">Empleado: {doc.employee_name||`#${doc.employee_id}`} · Módulo: {doc.module||'-'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[doc.status]||'bg-gray-100 text-gray-600'}`}>{doc.status}</span>
          {(doc.status==='sent'||doc.status==='viewed') && (
            <button onClick={() => setShowSign(true)} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium">✍️ Firmar Documento</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { label:'Creado', date: doc.created_at, done: true },
          { label:'Enviado', date: doc.sent_at, done: !!doc.sent_at },
          { label:'Visto', date: doc.viewed_at, done: !!doc.viewed_at },
          { label:'Firmado', date: doc.completed_at, done: doc.status==='signed'||doc.status==='completed' },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>{step.done?'✓':i+1}</div>
            <div>
              <p className="text-xs font-medium text-gray-700">{step.label}</p>
              {step.date && <p className="text-xs text-gray-400">{new Date(step.date).toLocaleDateString('es-PY')}</p>}
            </div>
            {i < 3 && <span className="text-gray-300 mx-1">→</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            {[['preview','Vista Previa'],['comments','Comentarios'],['audit','Auditoría']].map(([k,l]) => (
              <button key={k} onClick={() => setActiveSection(k as any)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection===k ? 'bg-white border border-b-white text-blue-600 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>

          {activeSection === 'preview' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-64">
              {doc.latest_version?.rendered_html ? (
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: doc.latest_version.rendered_html }}/>
              ) : doc.latest_version?.content_json ? (
                <pre className="text-xs text-gray-600 whitespace-pre-wrap">{doc.latest_version.content_json}</pre>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Sin contenido generado. Versión: {doc.current_version}</p>
              )}
            </div>
          )}

          {activeSection === 'comments' && (
            <div>
              <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                {comments.map((c:any) => (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{c.author_name||`Usuario #${c.author_user_id||c.author_employee_id}`}</span>
                      <span className="text-xs text-gray-400">{c.created_at ? new Date(c.created_at).toLocaleString('es-PY') : ''}</span>
                    </div>
                    <p className="text-sm text-gray-600">{c.comment}</p>
                    {c.visibility==='INTERNAL' && <span className="text-xs text-orange-500 mt-1 block">Solo interno</span>}
                  </div>
                ))}
                {comments.length===0 && <p className="text-gray-400 text-sm text-center py-4">Sin comentarios</p>}
              </div>
              <div className="flex gap-2">
                <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),addComment())} placeholder="Escribir comentario..." className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                <button onClick={addComment} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">Enviar</button>
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {auditLog.map((a:any) => (
                <div key={a.id} className="px-4 py-3 flex gap-3">
                  <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 h-fit">{a.action}</span>
                  <div>
                    <p className="text-xs text-gray-600">{a.actor_name||`#${a.actor_user_id||a.actor_employee_id}`}</p>
                    <p className="text-xs text-gray-400">{a.ip_address} · {a.created_at ? new Date(a.created_at).toLocaleString('es-PY') : ''}</p>
                  </div>
                </div>
              ))}
              {auditLog.length===0 && <p className="text-gray-400 text-sm text-center py-6">Sin registros</p>}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Recipients */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">Destinatarios</h3>
            {(doc.recipients||[]).map((r:any) => (
              <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">{r.employee_name||r.employee_id||`#${r.user_id}`}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${r.status==='signed'?'bg-green-100 text-green-700':r.status==='viewed'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>{r.status}</span>
              </div>
            ))}
            {(!doc.recipients||doc.recipients.length===0) && <p className="text-gray-400 text-xs">Sin destinatarios</p>}
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">Metadatos</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Versión</span><span className="font-medium">v{doc.current_version}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Módulo</span><span className="font-medium">{doc.module||'-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Creado</span><span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-PY') : '-'}</span></div>
              {doc.latest_version?.hash_sha256 && (
                <div>
                  <span className="text-gray-500 block">Hash SHA-256</span>
                  <span className="font-mono text-gray-400 break-all text-xs">{doc.latest_version.hash_sha256.slice(0,20)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SIGNATURE MODAL */}
      {showSign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-2">Firmar Documento</h2>
            <p className="text-sm text-gray-500 mb-4">Está firmando: <strong>{doc.title}</strong></p>

            <div className="flex gap-2 mb-4">
              {[['DRAWN','Firma Dibujada'],['PASSWORD','Aceptación por Texto']].map(([k,l]) => (
                <button key={k} onClick={() => setSignatureType(k as any)} className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${signatureType===k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>

            {signatureType === 'DRAWN' ? (
              <div>
                <canvas ref={canvasRef} width={500} height={150} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg cursor-crosshair bg-gray-50"/>
                <button onClick={clearCanvas} className="mt-2 text-xs text-gray-400 hover:text-gray-600">↺ Limpiar</button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escriba su nombre completo para confirmar</label>
                <input value={signatureText} onChange={e => setSignatureText(e.target.value)} placeholder="Su nombre completo..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-cursive"/>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">Al firmar, confirma que ha leído y acepta el documento. Se registrará su IP y timestamp.</p>

            <div className="flex gap-3 mt-4">
              <button onClick={sign} disabled={saving} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Firmando...' : '✍️ Confirmar Firma'}
              </button>
              <button onClick={() => setShowSign(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

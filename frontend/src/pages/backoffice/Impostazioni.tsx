import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Settings, Clock, DollarSign, Mail, Users, Building2, ToggleLeft, Phone, Save, RotateCcw, Eye, X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

// ─── Types ──────────────────────────────────────────────────────
interface Impostazione {
  id: string;
  chiave: string;
  valore: string;
  tipo: string;
  categoria: string;
  label: string;
  descrizione: string;
  valore_default: string;
  updated_at: string;
}

type Categoria = 'TIMELINE' | 'PRICING' | 'EMAIL' | 'AREA_CLIENTE' | 'RECAPITI' | 'FEATURE_FLAGS' | 'SCRIPT_TELEFONICI';

const TABS: { key: Categoria; label: string; icon: React.ReactNode }[] = [
  { key: 'TIMELINE', label: 'Timeline', icon: <Clock size={18} /> },
  { key: 'PRICING', label: 'Pricing', icon: <DollarSign size={18} /> },
  { key: 'EMAIL', label: 'Email', icon: <Mail size={18} /> },
  { key: 'AREA_CLIENTE', label: 'Area Cliente', icon: <Users size={18} /> },
  { key: 'RECAPITI', label: 'Recapiti', icon: <Building2 size={18} /> },
  { key: 'FEATURE_FLAGS', label: 'Feature Flags', icon: <ToggleLeft size={18} /> },
  { key: 'SCRIPT_TELEFONICI', label: 'Script Telefonici', icon: <Phone size={18} /> },
];

// ─── API helpers ────────────────────────────────────────────────
const API_BASE = '/api/backoffice/impostazioni';

function getHeaders(): Record<string, string> {
  const stored = localStorage.getItem('nsm_user');
  const user = stored ? JSON.parse(stored) : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.id) h['x-user-id'] = user.id;
  return h;
}

async function fetchImpostazioni(): Promise<Record<string, Impostazione[]>> {
  const res = await fetch(API_BASE, { headers: getHeaders(), credentials: 'include' });
  if (!res.ok) throw new Error('Errore caricamento impostazioni');
  return res.json();
}

async function saveImpostazione(chiave: string, valore: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${chiave}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ valore }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.errore || 'Errore salvataggio');
  }
}

async function resetImpostazione(chiave: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${chiave}/reset`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Errore ripristino');
}

async function fetchPreviewEmail(chiave: string): Promise<string> {
  const res = await fetch(`${API_BASE}/preview-email/${chiave}`, {
    headers: getHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Errore anteprima');
  const data = await res.json();
  return data.html;
}

// ─── Main Component ─────────────────────────────────────────────
export default function Impostazioni() {
  const [activeTab, setActiveTab] = useState<Categoria>('TIMELINE');
  const [data, setData] = useState<Record<string, Impostazione[]>>({});
  const [loading, setLoading] = useState(true);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await fetchImpostazioni();
      setData(d);
      const vals: Record<string, string> = {};
      for (const cat of Object.values(d)) {
        for (const imp of cat) vals[imp.chiave] = imp.valore;
      }
      setLocalValues(vals);
    } catch {
      toast.error('Errore caricamento impostazioni');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (chiave: string) => {
    const val = localValues[chiave];
    if (val === undefined) return;
    try {
      await saveImpostazione(chiave, val);
      toast.success('Salvato');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    }
  };

  const handleReset = async (chiave: string) => {
    if (!confirm('Ripristinare il valore di default?')) return;
    try {
      await resetImpostazione(chiave);
      toast.success('Valore di default ripristinato');
      load();
    } catch {
      toast.error('Errore ripristino');
    }
  };

  const handleResetCategoria = async (categoria: string) => {
    if (!confirm(`Ripristinare tutti i default per ${categoria}?`)) return;
    const imps = data[categoria] || [];
    for (const imp of imps) {
      try { await resetImpostazione(imp.chiave); } catch { /* continue */ }
    }
    toast.success('Default ripristinati');
    load();
  };

  const updateLocal = (chiave: string, valore: string) => {
    setLocalValues(prev => ({ ...prev, [chiave]: valore }));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" /></div>;
  }

  const items = data[activeTab] || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="text-slate-700" size={28} />
        <h1 className="text-2xl font-bold text-slate-800">Impostazioni</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-slate-200 pb-px">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-slate-800 border border-b-white border-slate-200 -mb-px'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        {activeTab === 'TIMELINE' && (
          <TabTimeline items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} onResetAll={() => handleResetCategoria('TIMELINE')} />
        )}
        {activeTab === 'PRICING' && (
          <TabPricing items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} />
        )}
        {activeTab === 'EMAIL' && (
          <TabEmail items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} />
        )}
        {activeTab === 'AREA_CLIENTE' && (
          <TabAreaCliente items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} />
        )}
        {activeTab === 'RECAPITI' && (
          <TabRecapiti items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} />
        )}
        {activeTab === 'FEATURE_FLAGS' && (
          <TabFeatureFlags items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} />
        )}
        {activeTab === 'SCRIPT_TELEFONICI' && (
          <TabScriptTelefonici items={items} localValues={localValues} updateLocal={updateLocal} onSave={handleSave} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────
interface TabProps {
  items: Impostazione[];
  localValues: Record<string, string>;
  updateLocal: (k: string, v: string) => void;
  onSave: (k: string) => void;
  onReset: (k: string) => void;
}

function FieldRow({ imp, value, onChange, onSave, onReset, children }: {
  imp: Impostazione;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  const isDirty = value !== imp.valore;
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-slate-700">{imp.label}</label>
          <p className="text-xs text-slate-400">{imp.descrizione}</p>
        </div>
        <div className="flex gap-1.5 shrink-0 ml-4">
          {isDirty && (
            <button onClick={onSave} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
              <Save size={12} /> Salva
            </button>
          )}
          {value !== imp.valore_default && (
            <button onClick={onReset} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">
              <RotateCcw size={12} /> Default
            </button>
          )}
        </div>
      </div>
      {children || (
        <input
          type={imp.tipo === 'NUMERO' ? 'number' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      )}
    </div>
  );
}

// ─── Tab: TIMELINE ──────────────────────────────────────────────
function TabTimeline({ items, localValues, updateLocal, onSave, onReset, onResetAll }: TabProps & { onResetAll: () => void }) {
  const timelineItems = items.filter(i => i.tipo === 'NUMERO').sort((a, b) => {
    const va = parseInt(localValues[a.chiave] || '0');
    const vb = parseInt(localValues[b.chiave] || '0');
    return vb - va;
  });

  const maxDays = 150;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Timeline operativa</h2>
        <button onClick={onResetAll} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
          <RotateCcw size={14} /> Ripristina default timeline
        </button>
      </div>

      {/* Visual timeline */}
      <div className="mb-8 p-4 bg-slate-50 rounded-lg">
        <div className="relative h-16">
          <div className="absolute top-6 left-0 right-0 h-1 bg-slate-300 rounded" />
          <div className="absolute top-6 right-0 w-3 h-3 bg-red-500 rounded-full -translate-y-1" title="T0 — Scadenza" />
          <span className="absolute top-10 right-0 text-[10px] text-red-600 font-medium -translate-x-1">T0</span>
          {timelineItems.map(item => {
            const days = parseInt(localValues[item.chiave] || '0');
            const pct = Math.min((days / maxDays) * 100, 100);
            const isEmail = item.chiave.includes('sollecito') || item.chiave.includes('comunicazione');
            return (
              <div key={item.chiave} className="absolute" style={{ right: `${pct}%`, top: '12px' }}>
                <div className={`w-2.5 h-2.5 rounded-full ${isEmail ? 'bg-blue-500' : 'bg-amber-500'}`} title={`${item.label}: T-${days}`} />
                <span className="absolute top-5 text-[9px] text-slate-500 whitespace-nowrap -translate-x-1/2 left-1/2">T-{days}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full" /> Email</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" /> Escalation</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" /> Scadenza</span>
        </div>
      </div>

      {timelineItems.map(imp => (
        <FieldRow key={imp.chiave} imp={imp} value={localValues[imp.chiave] || ''} onChange={v => updateLocal(imp.chiave, v)} onSave={() => onSave(imp.chiave)} onReset={() => onReset(imp.chiave)}>
          <input
            type="number"
            min={1}
            max={365}
            value={localValues[imp.chiave] || ''}
            onChange={e => updateLocal(imp.chiave, e.target.value)}
            className="w-32 px-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </FieldRow>
      ))}
    </div>
  );
}

// ─── Tab: PRICING ───────────────────────────────────────────────
function TabPricing({ items, localValues, updateLocal, onSave, onReset }: TabProps) {
  const grenkePerc = parseFloat(localValues['pricing.grenke_percentuale'] || '5');
  const riacquistoPerc = parseFloat(localValues['pricing.riacquisto_percentuale'] || '8');
  const ivaPerc = parseFloat(localValues['pricing.iva_percentuale'] || '22');
  const tagli = (() => { try { return JSON.parse(localValues['pricing.gift_card_tagli'] || '[]'); } catch { return []; } })() as number[];

  const canoneDemo = 70;
  const mesiDemo = 36;
  const monteCanoni = canoneDemo * mesiDemo;
  const pGrenke = monteCanoni * grenkePerc / 100;
  const pRiacquisto = monteCanoni * riacquistoPerc / 100;
  const margine = pRiacquisto - pGrenke;
  const iva = pRiacquisto * ivaPerc / 100;
  let giftCard = 0;
  for (const t of tagli) { if (t <= margine) giftCard = t; else break; }

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [newTaglio, setNewTaglio] = useState('');
  const addTaglio = () => {
    const n = parseInt(newTaglio);
    if (isNaN(n) || n <= 0) return;
    const updated = [...tagli, n].sort((a, b) => a - b);
    updateLocal('pricing.gift_card_tagli', JSON.stringify(updated));
    setNewTaglio('');
  };
  const removeTaglio = (idx: number) => {
    const updated = tagli.filter((_: number, i: number) => i !== idx);
    updateLocal('pricing.gift_card_tagli', JSON.stringify(updated));
  };

  const numericItems = items.filter(i => i.tipo === 'NUMERO');
  const jsonItem = items.find(i => i.chiave === 'pricing.gift_card_tagli');

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Pricing</h2>

      {/* Live calculation */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Calcolo live (canone {fmt(canoneDemo)} x {mesiDemo} mesi)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-blue-600">Monte canoni:</span> <strong>{fmt(monteCanoni)}</strong></div>
          <div><span className="text-blue-600">Pricing Grenke ({grenkePerc}%):</span> <strong>{fmt(pGrenke)}</strong></div>
          <div><span className="text-blue-600">Pricing riacquisto ({riacquistoPerc}%):</span> <strong>{fmt(pRiacquisto)}</strong></div>
          <div><span className="text-blue-600">Margine lordo:</span> <strong>{fmt(margine)}</strong></div>
          <div><span className="text-blue-600">IVA ({ivaPerc}%):</span> <strong>{fmt(iva)}</strong></div>
          <div><span className="text-blue-600">Sconto Bronze:</span> <strong>{fmt(giftCard)}</strong></div>
        </div>
      </div>

      {numericItems.map(imp => (
        <FieldRow key={imp.chiave} imp={imp} value={localValues[imp.chiave] || ''} onChange={v => updateLocal(imp.chiave, v)} onSave={() => onSave(imp.chiave)} onReset={() => onReset(imp.chiave)}>
          <input
            type="number"
            step={imp.chiave.includes('percentuale') || imp.chiave.includes('iva') ? '0.1' : '1'}
            value={localValues[imp.chiave] || ''}
            onChange={e => updateLocal(imp.chiave, e.target.value)}
            className="w-40 px-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </FieldRow>
      ))}

      {/* Tagli Sconto Bronze editor (chiave interna: pricing.gift_card_tagli) */}
      {jsonItem && (
        <div className="py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-sm font-medium text-slate-700">{jsonItem.label}</label>
              <p className="text-xs text-slate-400">{jsonItem.descrizione}</p>
            </div>
            <div className="flex gap-1.5">
              {localValues[jsonItem.chiave] !== jsonItem.valore && (
                <button onClick={() => onSave(jsonItem.chiave)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                  <Save size={12} /> Salva
                </button>
              )}
              {localValues[jsonItem.chiave] !== jsonItem.valore_default && (
                <button onClick={() => onReset(jsonItem.chiave)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                  <RotateCcw size={12} /> Default
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {tagli.map((t: number, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded text-sm">
                {t}
                <button onClick={() => removeTaglio(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="number" placeholder="Nuovo taglio" value={newTaglio} onChange={e => setNewTaglio(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTaglio()}
              className="w-32 px-3 py-1.5 text-sm border border-slate-200 rounded-md" />
            <button onClick={addTaglio} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 text-white rounded hover:bg-slate-800">
              <Plus size={12} /> Aggiungi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: EMAIL ─────────────────────────────────────────────────
function TabEmail({ items, localValues, updateLocal, onSave, onReset }: TabProps) {
  const [selected, setSelected] = useState<Impostazione | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    if (items.length > 0 && !selected) setSelected(items[0]!);
  }, [items, selected]);

  const handlePreview = async () => {
    if (!selected) return;
    try {
      const chiavePart = selected.chiave.replace('email.', '');
      const html = await fetchPreviewEmail(chiavePart);
      setPreviewHtml(html);
    } catch {
      toast.error('Errore anteprima');
    }
  };

  const VARIABILI = [
    '{{ragione_sociale}}', '{{data_scadenza}}', '{{beni}}',
    '{{pricing_riacquisto}}', '{{valore_gift_card}}', '{{valore_sconto_bronze}}',
    '{{codice_sconto}}', '{{scadenza_codice}}',
    '{{link_area_cliente}}', '{{deadline_decisione}}',
  ];

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Left: email list */}
      <div className="w-56 shrink-0 border-r border-slate-100 pr-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Template email</h3>
        {items.map(imp => (
          <button
            key={imp.chiave}
            onClick={() => setSelected(imp)}
            className={`w-full text-left px-3 py-2 text-sm rounded mb-1 transition-colors ${
              selected?.chiave === imp.chiave ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {imp.label}
          </button>
        ))}
      </div>

      {/* Right: editor */}
      <div className="flex-1 min-w-0">
        {selected && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-800">{selected.label}</h3>
              <div className="flex gap-2">
                <button onClick={handlePreview} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200">
                  <Eye size={14} /> Anteprima
                </button>
                <button onClick={() => onSave(selected.chiave)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                  <Save size={14} /> Salva
                </button>
                <button onClick={() => onReset(selected.chiave)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                  <RotateCcw size={14} /> Default
                </button>
              </div>
            </div>

            {/* Variables sidebar */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              <span className="text-xs text-slate-400 mr-1 self-center">Variabili:</span>
              {VARIABILI.map(v => (
                <button
                  key={v}
                  onClick={() => {
                    const val = localValues[selected.chiave] || '';
                    updateLocal(selected.chiave, val + v);
                  }}
                  className="px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100"
                >
                  {v}
                </button>
              ))}
            </div>

            <TipTapEditor
              content={localValues[selected.chiave] || ''}
              onChange={v => updateLocal(selected.chiave, v)}
            />
          </>
        )}
      </div>

      {/* Preview modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-800">Anteprima email</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TipTap Editor ──────────────────────────────────────────────
function TipTapEditor({ content, onChange }: { content: string; onChange: (v: string) => void }) {
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (editor && !isInternalUpdate.current && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
    isInternalUpdate.current = false;
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-200 flex-wrap">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" bold />
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" italic />
        <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" />
        <ToolbarBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" />
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="•" />
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1." />
        <ToolbarBtn active={editor.isActive('link')} onClick={() => {
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }} label="🔗" />
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-4 min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px]" />
    </div>
  );
}

function ToolbarBtn({ active, onClick, label, bold, italic }: { active: boolean; onClick: () => void; label: string; bold?: boolean; italic?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-colors ${active ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''}`}
    >
      {label}
    </button>
  );
}

// ─── Tab: AREA CLIENTE ──────────────────────────────────────────
function TabAreaCliente({ items, localValues, updateLocal, onSave, onReset }: TabProps) {
  const opzioni = [
    { titolo: 'cliente.titolo_opzione_rinnovo', desc: 'cliente.desc_opzione_rinnovo', color: 'bg-green-50 border-green-200', iconColor: 'text-green-600' },
    { titolo: 'cliente.titolo_opzione_riacquisto', desc: 'cliente.desc_opzione_riacquisto', color: 'bg-blue-50 border-blue-200', iconColor: 'text-blue-600' },
    { titolo: 'cliente.titolo_opzione_contatto', desc: 'cliente.desc_opzione_contatto', color: 'bg-amber-50 border-amber-200', iconColor: 'text-amber-600' },
    { titolo: 'cliente.titolo_opzione_restituzione', desc: 'cliente.desc_opzione_restituzione', color: 'bg-red-50 border-red-200', iconColor: 'text-red-600' },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Testi area cliente</h2>

      {/* Preview cards */}
      <div className="mb-6 p-4 bg-slate-50 rounded-lg">
        <h3 className="text-sm font-semibold text-slate-500 mb-3">Anteprima card (come le vede il cliente)</h3>
        <div className="grid grid-cols-2 gap-3">
          {opzioni.map(op => (
            <div key={op.titolo} className={`p-4 rounded-lg border ${op.color}`}>
              <h4 className={`font-semibold text-sm ${op.iconColor}`}>{localValues[op.titolo] || '—'}</h4>
              <p className="text-xs text-slate-600 mt-1">{localValues[op.desc] || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {items.map(imp => (
        <FieldRow key={imp.chiave} imp={imp} value={localValues[imp.chiave] || ''} onChange={v => updateLocal(imp.chiave, v)} onSave={() => onSave(imp.chiave)} onReset={() => onReset(imp.chiave)}>
          {imp.chiave.includes('desc_') || imp.chiave.includes('testo_') ? (
            <textarea
              value={localValues[imp.chiave] || ''}
              onChange={e => updateLocal(imp.chiave, e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <input
              type="text"
              value={localValues[imp.chiave] || ''}
              onChange={e => updateLocal(imp.chiave, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          )}
        </FieldRow>
      ))}
    </div>
  );
}

// ─── Tab: RECAPITI ──────────────────────────────────────────────
function TabRecapiti({ items, localValues, updateLocal, onSave, onReset }: TabProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Recapiti aziendali</h2>
      <p className="text-sm text-slate-400 mb-4">Questi dati appaiono nei PDF e nelle email inviate ai clienti.</p>
      {items.map(imp => (
        <FieldRow key={imp.chiave} imp={imp} value={localValues[imp.chiave] || ''} onChange={v => updateLocal(imp.chiave, v)} onSave={() => onSave(imp.chiave)} onReset={() => onReset(imp.chiave)} />
      ))}
    </div>
  );
}

// ─── Tab: FEATURE FLAGS ─────────────────────────────────────────
function TabFeatureFlags({ items, localValues, updateLocal, onSave }: Omit<TabProps, 'onReset'>) {
  const critici = ['flags.abilita_escalation_telefonica', 'flags.abilita_solleciti_automatici'];

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Feature Flags</h2>
      {items.map(imp => {
        const isOn = localValues[imp.chiave] === 'true';
        const isCritico = critici.includes(imp.chiave);
        return (
          <div key={imp.chiave} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">{imp.label}</label>
                {isCritico && !isOn && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded">
                    <AlertTriangle size={10} /> Critico
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">{imp.descrizione}</p>
            </div>
            <button
              onClick={() => {
                const newVal = isOn ? 'false' : 'true';
                if (isCritico && isOn && !confirm(`Attenzione: stai disabilitando "${imp.label}". Continuare?`)) return;
                updateLocal(imp.chiave, newVal);
                saveImpostazione(imp.chiave, newVal)
                  .then(() => toast.success(`${imp.label}: ${newVal === 'true' ? 'attivato' : 'disattivato'}`))
                  .catch(() => toast.error('Errore'));
              }}
              className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-green-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: SCRIPT TELEFONICI ─────────────────────────────────────
function TabScriptTelefonici({ items, localValues, updateLocal, onSave, onReset }: TabProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Script telefonici</h2>
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">Compliance: gli script devono riguardare esclusivamente le opzioni di fine contratto. Non inserire proposte commerciali estranee.</p>
      </div>

      {items.map(imp => (
        <div key={imp.chiave} className="py-3 border-b border-slate-100 last:border-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-sm font-medium text-slate-700">{imp.label}</label>
              <p className="text-xs text-slate-400">{imp.descrizione}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setPreviewKey(previewKey === imp.chiave ? null : imp.chiave)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                <Eye size={12} /> {previewKey === imp.chiave ? 'Chiudi' : 'Preview'}
              </button>
              {localValues[imp.chiave] !== imp.valore && (
                <button onClick={() => onSave(imp.chiave)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                  <Save size={12} /> Salva
                </button>
              )}
              {localValues[imp.chiave] !== imp.valore_default && (
                <button onClick={() => onReset(imp.chiave)} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">
                  <RotateCcw size={12} /> Default
                </button>
              )}
            </div>
          </div>
          <textarea
            value={localValues[imp.chiave] || ''}
            onChange={e => updateLocal(imp.chiave, e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500"
          />
          {previewKey === imp.chiave && (
            <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200 prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{
                __html: (localValues[imp.chiave] || '')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/^- (.+)$/gm, '<li>$1</li>')
                  .replace(/\n/g, '<br />')
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

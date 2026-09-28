import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Supplier, SupplierPayment } from '../lib/types'
import {
  Plus, Search, Edit2, Trash2, Truck, X, Eye, Wallet, Building2,
  Phone, Receipt, IndianRupee, Banknote, CreditCard,
  Smartphone, FileText, CheckCircle2,
} from 'lucide-react'

export function Suppliers() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [payments, setPayments] = useState<SupplierPayment[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSuppliers((data ?? []) as Supplier[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!search) return suppliers
    const q = search.toLowerCase()
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.mobile ?? '').includes(q) || (s.company_name ?? '').toLowerCase().includes(q))
  }, [suppliers, search])

  // Display-only summary stats
  const stats = useMemo(() => {
    const totalPurchase = suppliers.reduce((s, x) => s + Number(x.total_purchase || 0), 0)
    const totalPaid = suppliers.reduce((s, x) => s + Number(x.total_paid || 0), 0)
    const totalDue = suppliers.reduce((s, x) => s + Number(x.total_due || 0), 0)
    const withDue = suppliers.filter((s) => Number(s.total_due) > 0).length
    return { totalPurchase, totalPaid, totalDue, withDue }
  }, [suppliers])

  const handleSave = async (data: Partial<Supplier>) => {
    if (editing) {
      const { error } = await supabase.from('suppliers').update(data).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Supplier updated')
    } else {
      const { error } = await supabase.from('suppliers').insert(data)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Supplier created')
    }
    setModalOpen(false)
    setEditing(null)
    fetchData()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Supplier deleted')
    setDeleteId(null)
    fetchData()
  }

  const handleViewPayments = async (supplier: Supplier) => {
    setDetailSupplier(supplier)
    const { data } = await supabase.from('supplier_payments').select('*, purchase:purchases(invoice_number)').eq('supplier_id', supplier.id).order('payment_date', { ascending: false })
    setPayments((data ?? []) as SupplierPayment[])
  }

  const handlePayment = async (amount: number, method: string, notes: string) => {
    if (!paymentModal || amount <= 0) return
    const { error } = await supabase.from('supplier_payments').insert({
      supplier_id: paymentModal.id,
      amount,
      payment_method: method,
      payment_date: new Date().toISOString().split('T')[0],
      notes: notes || null,
    })
    if (error) { toast(`Error: ${error.message}`, 'error'); return }

    await supabase.from('suppliers').update({
      total_paid: Number(paymentModal.total_paid) + amount,
      total_due: Math.max(0, Number(paymentModal.total_due) - amount),
    }).eq('id', paymentModal.id)

    toast('Payment recorded')
    setPaymentModal(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading suppliers..." />

  return (
    <div className="su-root">
      <style>{suStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="su-header">
        <div>
          <h2>Suppliers</h2>
          <div className="su-header-sub">
            Manage supplier accounts and dues
            {suppliers.length > 0 && (
              <span className="su-header-chip">{suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <button className="su-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      {suppliers.length > 0 && (
        <div className="su-stats">
          <div className="su-stat c-indigo" style={{ animationDelay: '.02s' }}>
            <div className="su-stat-ico"><Truck size={20} /></div>
            <div className="su-stat-body">
              <div className="su-stat-label">Total Suppliers</div>
              <div className="su-stat-value">{suppliers.length}</div>
              <div className="su-stat-sub">{stats.withDue} with pending due</div>
            </div>
          </div>
          <div className="su-stat c-blue" style={{ animationDelay: '.06s' }}>
            <div className="su-stat-ico"><Receipt size={20} /></div>
            <div className="su-stat-body">
              <div className="su-stat-label">Total Purchase</div>
              <div className="su-stat-value">{formatCurrency(stats.totalPurchase)}</div>
            </div>
          </div>
          <div className="su-stat c-emerald" style={{ animationDelay: '.10s' }}>
            <div className="su-stat-ico"><CheckCircle2 size={20} /></div>
            <div className="su-stat-body">
              <div className="su-stat-label">Total Paid</div>
              <div className="su-stat-value">{formatCurrency(stats.totalPaid)}</div>
            </div>
          </div>
          <div className="su-stat c-rose" style={{ animationDelay: '.14s' }}>
            <div className="su-stat-ico"><Wallet size={20} /></div>
            <div className="su-stat-body">
              <div className="su-stat-label">Total Payable</div>
              <div className="su-stat-value">{formatCurrency(stats.totalDue)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="su-filters">
        <div className="su-search">
          <Search size={17} />
          <input
            placeholder="Search suppliers by name, company, or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="su-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table / Empty ═══ */}
      {filtered.length === 0 ? (
        <div className="su-panel">
          <EmptyState
            icon={<Truck />}
            title="No suppliers found"
            message="Add your first supplier"
            action={
              <button className="su-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}>
                <Plus size={16} /> Add Supplier
              </button>
            }
          />
        </div>
      ) : (
        <div className="su-panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="su-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Mobile</th>
                  <th>GST</th>
                  <th className="right">Total Purchase</th>
                  <th className="right">Paid</th>
                  <th className="right">Due</th>
                  <th style={{ width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, idx) => {
                  const hasDue = Number(s.total_due) > 0
                  return (
                    <tr key={s.id} className={hasDue ? 'row-due' : ''} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                      <td>
                        <div className="su-name-cell">
                          <div className="su-avatar">{s.name.charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="su-name">{s.name}</div>
                            {s.mobile && <div className="su-mobile-inline">{s.mobile}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="su-muted">{s.company_name ?? '-'}</td>
                      <td className="su-muted">{s.mobile ?? '-'}</td>
                      <td className="su-mono">{s.gst_number ?? '-'}</td>
                      <td className="right"><span className="su-num">{formatCurrency(s.total_purchase)}</span></td>
                      <td className="right"><span className="su-num pos">{formatCurrency(s.total_paid)}</span></td>
                      <td className="right">
                        {hasDue ? (
                          <span className="su-num neg">{formatCurrency(s.total_due)}</span>
                        ) : (
                          <span className="su-clear-due"><CheckCircle2 size={12} /> Clear</span>
                        )}
                      </td>
                      <td>
                        <div className="su-actions">
                          <button className="su-act" onClick={() => handleViewPayments(s)} title="View payments">
                            <Eye size={14} />
                          </button>
                          {hasDue && (
                            <button className="su-act pay" onClick={() => setPaymentModal(s)} title="Record payment">
                              <Wallet size={14} />
                            </button>
                          )}
                          <button className="su-act" onClick={() => { setEditing(s); setModalOpen(true) }} title="Edit supplier">
                            <Edit2 size={14} />
                          </button>
                          <button className="su-act danger" onClick={() => setDeleteId(s.id)} title="Delete supplier">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && <SupplierForm supplier={editing} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />}
      <ConfirmDialog open={!!deleteId} title="Delete Supplier" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
      {paymentModal && <SupplierPaymentForm supplier={paymentModal} onClose={() => setPaymentModal(null)} onSave={handlePayment} />}

      {detailSupplier && (
        <Modal
          open
          onClose={() => setDetailSupplier(null)}
          title={`Payment History - ${detailSupplier.name}`}
          size="lg"
          footer={<button className="btn btn-secondary" onClick={() => setDetailSupplier(null)}>Close</button>}
        >
          {/* Supplier quick header */}
          <div className="su-detail-head">
            <div className="su-detail-avatar">{detailSupplier.name.charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="su-detail-name">{detailSupplier.name}</div>
              <div className="su-detail-meta">
                {detailSupplier.company_name && (
                  <span className="su-detail-pill indigo">
                    <Building2 size={11} /> {detailSupplier.company_name}
                  </span>
                )}
                {detailSupplier.mobile && (
                  <span className="su-detail-pill slate">
                    <Phone size={11} /> {detailSupplier.mobile}
                  </span>
                )}
                {detailSupplier.gst_number && (
                  <span className="su-detail-pill amber">
                    <Receipt size={11} /> {detailSupplier.gst_number}
                  </span>
                )}
              </div>
            </div>
            <div className="su-detail-due">
              <div className="su-detail-due-label">Due</div>
              <div className={`su-detail-due-value ${Number(detailSupplier.total_due) > 0 ? 'has-due' : 'clear'}`}>
                {formatCurrency(detailSupplier.total_due)}
              </div>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="su-pay-empty">
              <div className="su-pay-empty-ic"><Wallet size={28} /></div>
              <p>No payments recorded</p>
              <span>Payments you make to this supplier will appear here</span>
            </div>
          ) : (
            <div className="su-pay-list">
              <table className="su-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Purchase</th>
                    <th>Method</th>
                    <th className="right">Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={p.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                      <td className="su-mono">{formatDate(p.payment_date)}</td>
                      <td className="su-muted">{(p.purchase as { invoice_number?: string })?.invoice_number ?? '-'}</td>
                      <td>
                        <span className="su-pay-badge">
                          {paymentIcon(p.payment_method)}
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="right"><span className="su-num pos">{formatCurrency(p.amount)}</span></td>
                      <td className="su-remarks">{p.notes ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

/* ═══════════ Helpers ═══════════ */
function paymentIcon(method: string) {
  const m = (method ?? '').toLowerCase()
  const size = 11
  if (m === 'cash') return <Banknote size={size} />
  if (m === 'card') return <CreditCard size={size} />
  if (m === 'upi') return <Smartphone size={size} />
  if (m === 'bank_transfer') return <Building2 size={size} />
  if (m === 'cheque') return <FileText size={size} />
  return <IndianRupee size={size} />
}

function SupplierForm({ supplier, onClose, onSave }: { supplier: Supplier | null; onClose: () => void; onSave: (data: Partial<Supplier>) => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    company_name: supplier?.company_name ?? '',
    mobile: supplier?.mobile ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    gst_number: supplier?.gst_number ?? '',
    products_supplied: supplier?.products_supplied ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    onSave({
      name: form.name,
      company_name: form.company_name || null,
      mobile: form.mobile || null,
      email: form.email || null,
      address: form.address || null,
      gst_number: form.gst_number || null,
      products_supplied: form.products_supplied || null,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={supplier ? 'Edit Supplier' : 'Add Supplier'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{supplier ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit} className="su-form">
        <div className="su-section-label">Basic Info</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Name <span className="req">*</span></label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input className="form-input" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          </div>
        </div>

        <div className="su-section-label">Contact</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Mobile</label>
            <input className="form-input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">GST Number</label>
          <input className="form-input" value={form.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Products Supplied</label>
          <input className="form-input" value={form.products_supplied} onChange={(e) => set('products_supplied', e.target.value)} placeholder="e.g. Marble, Granite, Tiles" />
        </div>

        <div className="su-section-label">Address</div>
        <div className="form-group">
          <textarea className="form-textarea" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

function SupplierPaymentForm({ supplier, onClose, onSave }: { supplier: Supplier; onClose: () => void; onSave: (amount: number, method: string, notes: string) => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pay Supplier - ${supplier.name}`}
      size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(Number(amount), method, notes)} disabled={!amount}>Save Payment</button></>}
    >
      <div className="su-pay-form">
        {/* Due highlight */}
        <div className="su-pay-due">
          <div className="su-pay-due-ic"><Wallet size={20} /></div>
          <div>
            <div className="su-pay-due-label">Outstanding Due</div>
            <div className="su-pay-due-value">{formatCurrency(supplier.total_due)}</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Amount <span className="req">*</span></label>
          <input className="form-input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════ Styles ═══════════ */
const suStyles = `
  .su-root {
    --su-card: #ffffff;
    --su-border: #e6ebf2;
    --su-text: #0f172a;
    --su-muted: #64748b;
    --su-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: suFade .38s ease both;
  }
  @keyframes suFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes suRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes suRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes suShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes suFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

  /* Header */
  .su-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(139,92,246,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(59,130,246,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #f8f6ff);
    border: 1px solid #ddd6fe;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .su-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4);
  }
  .su-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #7c3aed 55%, #3b82f6 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .su-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--su-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .su-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ede9fe, #dbeafe);
    color: #6d28d9;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Add button */
  .su-add-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 20px;
    border-radius: 12px;
    background: linear-gradient(115deg, #8b5cf6, #3b82f6);
    border: none;
    color: #fff;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: .01em;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    box-shadow: 0 14px 28px -14px rgba(139,92,246,.85);
    transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
  }
  .su-add-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .su-add-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(139,92,246,.95);
  }
  .su-add-btn:hover::after { animation: suShine .9s ease; }
  .su-add-btn:active { transform: scale(.96); }

  /* Stats */
  .su-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 14px;
  }
  .su-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--su-card);
    border: 1px solid var(--su-border);
    border-radius: 16px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 13px;
    animation: suRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .su-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .su-stat::after {
    content: '';
    position: absolute;
    top: -50px; right: -50px;
    width: 140px; height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--sc1) 0%, transparent 68%);
    opacity: .12;
    z-index: -1;
    transition: opacity .35s ease, transform .45s ease;
  }
  .su-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .su-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .su-stat.c-indigo { --sc1:#6366f1; --sc2:#818cf8; --scs: rgba(99,102,241,.55); }
  .su-stat.c-blue   { --sc1:#3b82f6; --sc2:#60a5fa; --scs: rgba(59,130,246,.55); }
  .su-stat.c-emerald{ --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
  .su-stat.c-rose   { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }

  .su-stat-ico {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .su-stat-ico svg { width: 20px; height: 20px; }
  .su-stat:hover .su-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .su-stat-body { min-width: 0; flex: 1; }
  .su-stat-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--su-muted);
    margin-bottom: 4px;
  }
  .su-stat-value {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--su-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .su-stat.c-indigo .su-stat-value { color: #4338ca; }
  .su-stat.c-blue .su-stat-value   { color: #1d4ed8; }
  .su-stat.c-emerald .su-stat-value{ color: #047857; }
  .su-stat.c-rose .su-stat-value   { color: #be123c; }
  .su-stat-sub {
    font-size: 11.5px;
    color: var(--su-soft);
    margin-top: 2px;
    font-weight: 600;
  }

  /* Filters */
  .su-filters {
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #f8f6ff);
    border: 1px solid var(--su-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: suRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  .su-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--su-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .su-search:focus-within {
    border-color: #c4b5fd;
    box-shadow: 0 0 0 4px rgba(139,92,246,.14);
    transform: translateY(-1px);
  }
  .su-search svg { color: #7c3aed; flex-shrink: 0; }
  .su-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--su-text);
    height: 100%;
  }
  .su-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .su-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--su-muted);
    cursor: pointer;
    transition: all .18s ease;
  }
  .su-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  /* Panel / Table */
  .su-panel {
    background: var(--su-card);
    border: 1px solid var(--su-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: suRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .su-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #e9e5ff;
  }
  .su-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .su-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--su-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--su-border);
    white-space: nowrap;
  }
  .su-table thead th.right { text-align: right; }
  .su-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--su-text);
    vertical-align: middle;
  }
  .su-table tbody tr:last-child td { border-bottom: none; }
  .su-table tbody tr {
    animation: suRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .su-table tbody tr:hover {
    background: linear-gradient(90deg, #f5f3ff, #ffffff);
    box-shadow: inset 3px 0 0 #8b5cf6;
  }
  .su-table tbody tr.row-due {
    box-shadow: inset 3px 0 0 #f43f5e;
    background: linear-gradient(90deg, #fff9fa, #ffffff);
  }
  .su-table tbody tr.row-due:hover {
    background: linear-gradient(90deg, #fff1f2, #ffffff);
    box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7);
  }
  .su-table .right { text-align: right; }

  .su-name-cell { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .su-avatar {
    width: 36px; height: 36px;
    border-radius: 11px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
    box-shadow: 0 8px 18px -10px rgba(139,92,246,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .su-table tbody tr:hover .su-avatar { transform: scale(1.08) rotate(-6deg); }
  .su-name {
    font-weight: 800;
    font-size: 13.5px;
    color: var(--su-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .su-mobile-inline {
    font-size: 11px;
    color: var(--su-soft);
    font-weight: 600;
    margin-top: 2px;
  }
  .su-muted { color: var(--su-muted); font-weight: 600; font-size: 12.5px; }
  .su-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12px;
    color: var(--su-text);
  }
  .su-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--su-text);
    white-space: nowrap;
  }
  .su-num.pos { color: #047857; }
  .su-num.neg { color: #be123c; }
  .su-clear-due {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 800;
    color: #047857;
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .su-actions { display: flex; gap: 5px; }
  .su-act {
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--su-border);
    color: var(--su-muted);
    cursor: pointer;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .su-act:hover {
    background: #f5f3ff;
    border-color: #c4b5fd;
    color: #6d28d9;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(139,92,246,.7);
  }
  .su-act.pay {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border-color: #a7f3d0;
    color: #047857;
  }
  .su-act.pay:hover {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border-color: #6ee7b7;
    color: #065f46;
    box-shadow: 0 8px 16px -8px rgba(16,185,129,.7);
  }
  .su-act.danger:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
  }
  .su-act:active { transform: scale(.9); }

  /* Detail head */
  .su-detail-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f8f6ff 0%, #eff6ff 100%);
    border: 1px solid #ddd6fe;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
  }
  .su-detail-head::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #8b5cf6, #3b82f6);
  }
  .su-detail-avatar {
    width: 48px; height: 48px;
    border-radius: 14px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 18px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
    box-shadow: 0 12px 22px -10px rgba(139,92,246,.9);
  }
  .su-detail-name {
    font-size: 15px;
    font-weight: 800;
    color: var(--su-text);
    letter-spacing: -.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .su-detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 5px;
  }
  .su-detail-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .su-detail-pill.indigo { background: #e0e7ff; color: #4338ca; }
  .su-detail-pill.slate  { background: #f1f5f9; color: #475569; }
  .su-detail-pill.amber  { background: #fef3c7; color: #b45309; }
  .su-detail-due {
    text-align: right;
    flex-shrink: 0;
  }
  .su-detail-due-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--su-soft);
    margin-bottom: 3px;
  }
  .su-detail-due-value {
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .su-detail-due-value.has-due { color: #be123c; }
  .su-detail-due-value.clear { color: #047857; }

  /* Pay empty */
  .su-pay-empty {
    padding: 36px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--su-soft);
  }
  .su-pay-empty-ic {
    width: 64px; height: 64px;
    border-radius: 20px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #ede9fe, #dbeafe);
    color: #7c3aed;
    margin-bottom: 6px;
    animation: suFloat 3s ease-in-out infinite;
  }
  .su-pay-empty p { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--su-muted); }
  .su-pay-empty span { font-size: 12px; }

  .su-pay-list { max-height: 420px; overflow-y: auto; border-radius: 12px; border: 1px solid var(--su-border); }
  .su-pay-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .02em;
    background: #f1f5f9;
    color: #475569;
    text-transform: capitalize;
  }
  .su-remarks {
    font-size: 12px;
    color: var(--su-muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Forms */
  .su-form { display: flex; flex-direction: column; }
  .su-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--su-muted);
    margin: 16px 0 10px;
  }
  .su-section-label:first-child { margin-top: 0; }
  .su-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #8b5cf6, #3b82f6);
  }

  .su-pay-form { display: flex; flex-direction: column; gap: 4px; }
  .su-pay-due {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
    border: 1px solid #fecdd3;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
  }
  .su-pay-due::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185);
  }
  .su-pay-due-ic {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #e11d48, #fb7185);
    box-shadow: 0 12px 22px -10px rgba(225,29,72,.9);
    flex-shrink: 0;
    animation: suFloat 3s ease-in-out infinite;
  }
  .su-pay-due-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: #be123c;
  }
  .su-pay-due-value {
    font-size: 20px;
    font-weight: 800;
    color: #be123c;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
    margin-top: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .su-root *, .su-root *::before, .su-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Customer, Payment } from '../lib/types'
import {
  Plus, Search, Edit2, Trash2, Users, X, Eye, Wallet, Phone,
  Receipt, IndianRupee, Banknote, CreditCard, Smartphone,
  Building2, FileText, CheckCircle2, UserRound,
  Hammer, PaintBucket, Store, ShoppingBag,
} from 'lucide-react'
import { Pagination } from '../components/Pagination'

export function Customers() {
  const toast = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 12

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.mobile ?? '').includes(q))
  }, [customers, search])

  const visibleCustomers = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  useEffect(() => { setPage(1) }, [search])

  // Display-only summary
  const stats = useMemo(() => {
    const totalPaid = customers.reduce((s, c) => s + Number(c.total_paid || 0), 0)
    const totalDue = customers.reduce((s, c) => s + Number(c.total_due || 0), 0)
    const withDue = customers.filter((c) => Number(c.total_due) > 0).length
    return { totalPaid, totalDue, withDue }
  }, [customers])

  const handleSave = async (data: Partial<Customer>) => {
    if (editing) {
      const { error } = await supabase.from('customers').update(data).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Customer updated')
    } else {
      const { error } = await supabase.from('customers').insert(data)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Customer created')
    }
    setModalOpen(false)
    setEditing(null)
    fetchData()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('customers').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Customer deleted')
    setDeleteId(null)
    fetchData()
  }

  const handleViewPayments = async (customer: Customer) => {
    setDetailCustomer(customer)
    const { data } = await supabase.from('payments').select('*, sale:sales(invoice_number)').eq('customer_id', customer.id).order('payment_date', { ascending: false })
    setPayments((data ?? []) as Payment[])
  }

  const handlePayment = async (amount: number, method: string, notes: string) => {
    if (!paymentModal || amount <= 0) return
    const { error } = await supabase.from('payments').insert({
      customer_id: paymentModal.id,
      amount,
      payment_method: method,
      payment_date: new Date().toISOString().split('T')[0],
      notes: notes || null,
    })
    if (error) { toast(`Error: ${error.message}`, 'error'); return }

    await supabase.from('customers').update({
      total_paid: Number(paymentModal.total_paid) + amount,
      total_due: Math.max(0, Number(paymentModal.total_due) - amount),
    }).eq('id', paymentModal.id)

    toast('Payment recorded')
    setPaymentModal(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading customers..." />

  return (
    <div className="cu-root">
      <style>{cuStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="cu-header">
        <div>
          <h2>Customers</h2>
          <div className="cu-header-sub">
            Manage customer accounts and dues
            {customers.length > 0 && (
              <span className="cu-header-chip">
                {customers.length} customer{customers.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        <button className="cu-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      <div className="cu-stats">
        <div className="cu-stat c-indigo" style={{ animationDelay: '.02s' }}>
          <div className="cu-stat-ico"><Users size={20} /></div>
          <div className="cu-stat-body">
            <div className="cu-stat-label">Total Customers</div>
            <div className="cu-stat-value">{customers.length}</div>
            <div className="cu-stat-sub">{stats.withDue} with pending due</div>
          </div>
        </div>
        <div className="cu-stat c-emerald" style={{ animationDelay: '.06s' }}>
          <div className="cu-stat-ico"><CheckCircle2 size={20} /></div>
          <div className="cu-stat-body">
            <div className="cu-stat-label">Collected</div>
            <div className="cu-stat-value">{formatCurrency(stats.totalPaid)}</div>
          </div>
        </div>
        <div className="cu-stat c-rose" style={{ animationDelay: '.10s' }}>
          <div className="cu-stat-ico"><Wallet size={20} /></div>
          <div className="cu-stat-body">
            <div className="cu-stat-label">Outstanding</div>
            <div className="cu-stat-value">{formatCurrency(stats.totalDue)}</div>
          </div>
        </div>
      </div>

      {/* ═══ Filters ═══ */}
      <div className="cu-filters">
        <div className="cu-search">
          <Search size={17} />
          <input
            placeholder="Search customers by name or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="cu-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table / Empty ═══ */}
      {filtered.length === 0 ? (
        <div className="cu-panel">
          <EmptyState
            icon={<Users />}
            title="No customers found"
            message="Add your first customer"
            action={
              <button className="cu-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}>
                <Plus size={16} /> Add Customer
              </button>
            }
          />
        </div>
      ) : (
        <div className="cu-panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="cu-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Type</th>
                  <th className="right">Total Purchase</th>
                  <th className="right">Paid</th>
                  <th className="right">Due</th>
                  <th>Last Purchase</th>
                  <th style={{ width: 210 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((c, idx) => {
                  const hasDue = Number(c.total_due) > 0
                  return (
                    <tr key={c.id} className={hasDue ? 'row-due' : ''} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                      <td>
                        <div className="cu-name-cell">
                          <div className="cu-avatar">{c.name.charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="cu-name">{c.name}</div>
                            {c.last_purchase_date && (
                              <div className="cu-name-sub">Last: {formatDate(c.last_purchase_date)}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="cu-muted">{c.mobile ?? '-'}</td>
                      <td>
                        <span className={`cu-type-pill ${typeTone(c.customer_type)}`}>
                          {typeIcon(c.customer_type)}
                          {c.customer_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="right"><span className="cu-num">{formatCurrency(c.total_purchase)}</span></td>
                      <td className="right"><span className="cu-num pos">{formatCurrency(c.total_paid)}</span></td>
                      <td className="right">
                        {hasDue ? (
                          <span className="cu-num neg">{formatCurrency(c.total_due)}</span>
                        ) : (
                          <span className="cu-clear-due"><CheckCircle2 size={12} /> Clear</span>
                        )}
                      </td>
                      <td className="cu-mono">{formatDate(c.last_purchase_date)}</td>
                      <td>
                        <div className="cu-actions">
                          <button className="cu-act" onClick={() => handleViewPayments(c)} title="View payments">
                            <Eye size={14} />
                          </button>
                          {hasDue && (
                            <button className="cu-act pay" onClick={() => setPaymentModal(c)} title="Receive payment">
                              <Wallet size={14} />
                            </button>
                          )}
                          <button className="cu-act" onClick={() => { setEditing(c); setModalOpen(true) }} title="Edit customer">
                            <Edit2 size={14} />
                          </button>
                          <button className="cu-act danger" onClick={() => setDeleteId(c.id)} title="Delete customer">
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
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {modalOpen && <CustomerForm customer={editing} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />}

      <ConfirmDialog open={!!deleteId} title="Delete Customer" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />

      {paymentModal && <PaymentForm customer={paymentModal} onClose={() => setPaymentModal(null)} onSave={handlePayment} />}

      {detailCustomer && (
        <Modal
          open
          onClose={() => setDetailCustomer(null)}
          title={`Payment History - ${detailCustomer.name}`}
          size="lg"
          footer={<button className="btn btn-secondary" onClick={() => setDetailCustomer(null)}>Close</button>}
        >
          {/* Customer quick header */}
          <div className="cu-detail-head">
            <div className="cu-detail-avatar">{detailCustomer.name.charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cu-detail-name">{detailCustomer.name}</div>
              <div className="cu-detail-meta">
                {detailCustomer.mobile && (
                  <span className="cu-detail-pill indigo">
                    <Phone size={11} /> {detailCustomer.mobile}
                  </span>
                )}
                {detailCustomer.customer_type && (
                  <span className={`cu-detail-pill ${typeTone(detailCustomer.customer_type)}`}>
                    {typeIcon(detailCustomer.customer_type)} {detailCustomer.customer_type.replace('_', ' ')}
                  </span>
                )}
                {detailCustomer.gst_number && (
                  <span className="cu-detail-pill amber">
                    <Receipt size={11} /> {detailCustomer.gst_number}
                  </span>
                )}
              </div>
            </div>
            <div className="cu-detail-due">
              <div className="cu-detail-due-label">Due</div>
              <div className={`cu-detail-due-value ${Number(detailCustomer.total_due) > 0 ? 'has-due' : 'clear'}`}>
                {formatCurrency(detailCustomer.total_due)}
              </div>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="cu-pay-empty">
              <div className="cu-pay-empty-ic"><Wallet size={28} /></div>
              <p>No payments recorded</p>
              <span>Payments received from this customer will appear here</span>
            </div>
          ) : (
            <div className="cu-pay-list">
              <table className="cu-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice</th>
                    <th>Method</th>
                    <th className="right">Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={p.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                      <td className="cu-mono">{formatDate(p.payment_date)}</td>
                      <td className="cu-muted">{(p.sale as { invoice_number?: string })?.invoice_number ?? '-'}</td>
                      <td>
                        <span className="cu-pay-badge">
                          {paymentIcon(p.payment_method)}
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="right"><span className="cu-num pos">{formatCurrency(p.amount)}</span></td>
                      <td className="cu-remarks">{p.notes ?? '-'}</td>
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

function typeIcon(type: string) {
  const t = (type ?? '').toLowerCase()
  const size = 11
  if (t === 'contractor') return <Hammer size={size} />
  if (t === 'builder') return <Building2 size={size} />
  if (t === 'interior_designer') return <PaintBucket size={size} />
  if (t === 'dealer') return <Store size={size} />
  if (t === 'wholesale') return <ShoppingBag size={size} />
  return <UserRound size={size} />
}

function typeTone(type: string) {
  const t = (type ?? '').toLowerCase()
  if (t === 'contractor') return 'amber'
  if (t === 'builder') return 'cyan'
  if (t === 'interior_designer') return 'violet'
  if (t === 'dealer') return 'blue'
  if (t === 'wholesale') return 'emerald'
  return 'slate'
}

function CustomerForm({ customer, onClose, onSave }: { customer: Customer | null; onClose: () => void; onSave: (data: Partial<Customer>) => void }) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    mobile: customer?.mobile ?? '',
    address: customer?.address ?? '',
    gst_number: customer?.gst_number ?? '',
    email: customer?.email ?? '',
    customer_type: customer?.customer_type ?? 'retail',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    onSave({
      name: form.name,
      mobile: form.mobile || null,
      address: form.address || null,
      gst_number: form.gst_number || null,
      email: form.email || null,
      customer_type: form.customer_type,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Add Customer'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{customer ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit} className="cu-form">
        <div className="cu-section-label">Basic Info</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Name <span className="req">*</span></label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Mobile</label>
            <input className="form-input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </div>
        </div>

        <div className="cu-section-label">Contact</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">GST Number</label>
            <input className="form-input" value={form.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
          </div>
        </div>

        <div className="cu-section-label">Customer Type</div>
        <div className="form-group">
          <select className="form-select" value={form.customer_type} onChange={(e) => set('customer_type', e.target.value)}>
            <option value="retail">Retail Customer</option>
            <option value="contractor">Contractor</option>
            <option value="builder">Builder</option>
            <option value="interior_designer">Interior Designer</option>
            <option value="dealer">Dealer</option>
            <option value="wholesale">Wholesale Customer</option>
          </select>
        </div>

        <div className="cu-section-label">Address</div>
        <div className="form-group">
          <textarea className="form-textarea" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

function PaymentForm({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (amount: number, method: string, notes: string) => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive Payment - ${customer.name}`}
      size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(Number(amount), method, notes)} disabled={!amount}>Save Payment</button></>}
    >
      <div className="cu-pay-form">
        {/* Due highlight */}
        <div className="cu-pay-due">
          <div className="cu-pay-due-ic"><Wallet size={20} /></div>
          <div>
            <div className="cu-pay-due-label">Outstanding Due</div>
            <div className="cu-pay-due-value">{formatCurrency(customer.total_due)}</div>
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
const cuStyles = `
  .cu-root {
    --cu-card: #ffffff;
    --cu-border: #e6ebf2;
    --cu-text: #0f172a;
    --cu-muted: #64748b;
    --cu-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: cuFade .38s ease both;
  }
  @keyframes cuFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes cuRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes cuRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes cuShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes cuFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

  /* Header */
  .cu-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(251,146,60,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(244,114,182,.16), transparent 46%),
      linear-gradient(135deg, #ffffff, #fff8f4);
    border: 1px solid #fed7aa;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .cu-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f97316, #ec4899, #8b5cf6);
  }
  .cu-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #ea580c 55%, #db2777 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .cu-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--cu-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cu-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ffedd5, #fce7f3);
    color: #c2410c;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Add button */
  .cu-add-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 20px;
    border-radius: 12px;
    background: linear-gradient(115deg, #f97316, #ec4899);
    border: none;
    color: #fff;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: .01em;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    box-shadow: 0 14px 28px -14px rgba(249,115,22,.9);
    transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
  }
  .cu-add-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .cu-add-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(249,115,22,.95);
  }
  .cu-add-btn:hover::after { animation: cuShine .9s ease; }
  .cu-add-btn:active { transform: scale(.96); }

  /* Stats */
  .cu-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 14px;
  }
  .cu-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--cu-card);
    border: 1px solid var(--cu-border);
    border-radius: 16px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 13px;
    animation: cuRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .cu-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .cu-stat::after {
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
  .cu-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .cu-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .cu-stat.c-indigo { --sc1:#f97316; --sc2:#fb923c; --scs: rgba(249,115,22,.55); }
  .cu-stat.c-emerald{ --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
  .cu-stat.c-rose   { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }

  .cu-stat-ico {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .cu-stat-ico svg { width: 20px; height: 20px; }
  .cu-stat:hover .cu-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .cu-stat-body { min-width: 0; flex: 1; }
  .cu-stat-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--cu-muted);
    margin-bottom: 4px;
  }
  .cu-stat-value {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--cu-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cu-stat.c-indigo .cu-stat-value { color: #c2410c; }
  .cu-stat.c-emerald .cu-stat-value{ color: #047857; }
  .cu-stat.c-rose .cu-stat-value   { color: #be123c; }
  .cu-stat-sub {
    font-size: 11.5px;
    color: var(--cu-soft);
    margin-top: 2px;
    font-weight: 600;
  }

  /* Filters */
  .cu-filters {
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #fff8f4);
    border: 1px solid var(--cu-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: cuRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  .cu-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--cu-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .cu-search:focus-within {
    border-color: #fdba74;
    box-shadow: 0 0 0 4px rgba(249,115,22,.14);
    transform: translateY(-1px);
  }
  .cu-search svg { color: #ea580c; flex-shrink: 0; }
  .cu-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--cu-text);
    height: 100%;
  }
  .cu-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .cu-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--cu-muted);
    cursor: pointer;
    transition: all .18s ease;
  }
  .cu-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  /* Panel / Table */
  .cu-panel {
    background: var(--cu-card);
    border: 1px solid var(--cu-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: cuRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .cu-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #fed7aa;
  }
  .cu-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cu-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--cu-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--cu-border);
    white-space: nowrap;
  }
  .cu-table thead th.right { text-align: right; }
  .cu-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--cu-text);
    vertical-align: middle;
  }
  .cu-table tbody tr:last-child td { border-bottom: none; }
  .cu-table tbody tr {
    animation: cuRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .cu-table tbody tr:hover {
    background: linear-gradient(90deg, #fff8f4, #ffffff);
    box-shadow: inset 3px 0 0 #f97316;
  }
  .cu-table tbody tr.row-due {
    box-shadow: inset 3px 0 0 #f43f5e;
    background: linear-gradient(90deg, #fff9fa, #ffffff);
  }
  .cu-table tbody tr.row-due:hover {
    background: linear-gradient(90deg, #fff1f2, #ffffff);
    box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7);
  }
  .cu-table .right { text-align: right; }

  .cu-name-cell { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .cu-avatar {
    width: 36px; height: 36px;
    border-radius: 11px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #f97316, #ec4899);
    box-shadow: 0 8px 18px -10px rgba(249,115,22,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .cu-table tbody tr:hover .cu-avatar { transform: scale(1.08) rotate(-6deg); }
  .cu-name {
    font-weight: 800;
    font-size: 13.5px;
    color: var(--cu-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .cu-name-sub {
    font-size: 11px;
    color: var(--cu-soft);
    font-weight: 600;
    margin-top: 2px;
  }
  .cu-muted { color: var(--cu-muted); font-weight: 600; font-size: 12.5px; }
  .cu-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12px;
    color: var(--cu-text);
  }
  .cu-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--cu-text);
    white-space: nowrap;
  }
  .cu-num.pos { color: #047857; }
  .cu-num.neg { color: #be123c; }
  .cu-clear-due {
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

  .cu-type-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .02em;
    text-transform: capitalize;
    white-space: nowrap;
  }
  .cu-type-pill svg { flex-shrink: 0; }
  .cu-type-pill.slate   { background: #f1f5f9; color: #475569; }
  .cu-type-pill.amber   { background: #fef3c7; color: #b45309; }
  .cu-type-pill.cyan    { background: #cffafe; color: #0e7490; }
  .cu-type-pill.violet  { background: #ede9fe; color: #6d28d9; }
  .cu-type-pill.blue    { background: #dbeafe; color: #1d4ed8; }
  .cu-type-pill.emerald { background: #d1fae5; color: #047857; }

  .cu-actions { display: flex; gap: 5px; }
  .cu-act {
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--cu-border);
    color: var(--cu-muted);
    cursor: pointer;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .cu-act:hover {
    background: #fff7ed;
    border-color: #fdba74;
    color: #ea580c;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(249,115,22,.7);
  }
  .cu-act.pay {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border-color: #a7f3d0;
    color: #047857;
  }
  .cu-act.pay:hover {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border-color: #6ee7b7;
    color: #065f46;
    box-shadow: 0 8px 16px -8px rgba(16,185,129,.7);
  }
  .cu-act.danger:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
  }
  .cu-act:active { transform: scale(.9); }

  /* Detail head */
  .cu-detail-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff8f4 0%, #fce7f3 100%);
    border: 1px solid #fed7aa;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
  }
  .cu-detail-head::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f97316, #ec4899);
  }
  .cu-detail-avatar {
    width: 48px; height: 48px;
    border-radius: 14px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 18px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #f97316, #ec4899);
    box-shadow: 0 12px 22px -10px rgba(249,115,22,.9);
  }
  .cu-detail-name {
    font-size: 15px;
    font-weight: 800;
    color: var(--cu-text);
    letter-spacing: -.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cu-detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 5px;
  }
  .cu-detail-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .cu-detail-pill.indigo { background: #ffedd5; color: #c2410c; }
  .cu-detail-pill.amber  { background: #fef3c7; color: #b45309; }
  .cu-detail-pill.slate  { background: #f1f5f9; color: #475569; }
  .cu-detail-pill.cyan   { background: #cffafe; color: #0e7490; }
  .cu-detail-pill.violet { background: #ede9fe; color: #6d28d9; }
  .cu-detail-pill.blue   { background: #dbeafe; color: #1d4ed8; }
  .cu-detail-pill.emerald{ background: #d1fae5; color: #047857; }

  .cu-detail-due {
    text-align: right;
    flex-shrink: 0;
  }
  .cu-detail-due-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--cu-soft);
    margin-bottom: 3px;
  }
  .cu-detail-due-value {
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .cu-detail-due-value.has-due { color: #be123c; }
  .cu-detail-due-value.clear { color: #047857; }

  /* Pay empty */
  .cu-pay-empty {
    padding: 36px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--cu-soft);
  }
  .cu-pay-empty-ic {
    width: 64px; height: 64px;
    border-radius: 20px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #ffedd5, #fce7f3);
    color: #ea580c;
    margin-bottom: 6px;
    animation: cuFloat 3s ease-in-out infinite;
  }
  .cu-pay-empty p { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--cu-muted); }
  .cu-pay-empty span { font-size: 12px; }

  .cu-pay-list { max-height: 420px; overflow-y: auto; border-radius: 12px; border: 1px solid var(--cu-border); }
  .cu-pay-badge {
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
  .cu-remarks {
    font-size: 12px;
    color: var(--cu-muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Forms */
  .cu-form { display: flex; flex-direction: column; }
  .cu-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--cu-muted);
    margin: 16px 0 10px;
  }
  .cu-section-label:first-child { margin-top: 0; }
  .cu-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #f97316, #ec4899);
  }

  .cu-pay-form { display: flex; flex-direction: column; gap: 4px; }
  .cu-pay-due {
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
  .cu-pay-due::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185);
  }
  .cu-pay-due-ic {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #e11d48, #fb7185);
    box-shadow: 0 12px 22px -10px rgba(225,29,72,.9);
    flex-shrink: 0;
    animation: cuFloat 3s ease-in-out infinite;
  }
  .cu-pay-due-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: #be123c;
  }
  .cu-pay-due-value {
    font-size: 20px;
    font-weight: 800;
    color: #be123c;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
    margin-top: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .cu-root *, .cu-root::before, .cu-root::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
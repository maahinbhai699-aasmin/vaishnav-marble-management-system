import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Supplier, SupplierPayment } from '../lib/types'
import { Plus, Search, Edit2, Trash2, Truck } from 'lucide-react'

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
    <div>
      <div className="page-header">
        <div>
          <h2>Suppliers</h2>
          <div className="page-sub">Manage supplier accounts and dues</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Supplier</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Truck />} title="No suppliers found" message="Add your first supplier" action={<button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Supplier</button>} /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Company</th><th>Mobile</th><th>GST</th><th className="text-right">Total Purchase</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td>{s.company_name ?? '-'}</td>
                  <td>{s.mobile ?? '-'}</td>
                  <td>{s.gst_number ?? '-'}</td>
                  <td className="text-right">{formatCurrency(s.total_purchase)}</td>
                  <td className="text-right">{formatCurrency(s.total_paid)}</td>
                  <td className="text-right" style={{ color: Number(s.total_due) > 0 ? 'var(--error-600)' : undefined, fontWeight: Number(s.total_due) > 0 ? 600 : undefined }}>{formatCurrency(s.total_due)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleViewPayments(s)}>View</button>
                      {Number(s.total_due) > 0 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success-600)' }} onClick={() => setPaymentModal(s)}>Pay</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s); setModalOpen(true) }}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <SupplierForm supplier={editing} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />}
      <ConfirmDialog open={!!deleteId} title="Delete Supplier" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
      {paymentModal && <SupplierPaymentForm supplier={paymentModal} onClose={() => setPaymentModal(null)} onSave={handlePayment} />}

      {detailSupplier && (
        <Modal open onClose={() => setDetailSupplier(null)} title={`Payment History - ${detailSupplier.name}`} size="lg"
          footer={<button className="btn btn-secondary" onClick={() => setDetailSupplier(null)}>Close</button>}
        >
          {payments.length === 0 ? <EmptyState title="No payments recorded" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Purchase</th><th>Method</th><th className="text-right">Amount</th><th>Notes</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td>{(p.purchase as { invoice_number?: string })?.invoice_number ?? '-'}</td>
                      <td><span className="badge badge-neutral">{p.payment_method}</span></td>
                      <td className="text-right font-semibold">{formatCurrency(p.amount)}</td>
                      <td>{p.notes ?? '-'}</td>
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
    <Modal open onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add Supplier'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{supplier ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit}>
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
        <div className="form-group">
          <label className="form-label">Address</label>
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
    <Modal open onClose={onClose} title={`Pay Supplier - ${supplier.name}`} size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(Number(amount), method, notes)} disabled={!amount}>Save Payment</button></>}
    >
      <div className="form-group">
        <label className="form-label">Outstanding Due</label>
        <input className="form-input" value={formatCurrency(supplier.total_due)} readOnly style={{ background: 'var(--n-50)', color: 'var(--error-600)', fontWeight: 600 }} />
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
    </Modal>
  )
}

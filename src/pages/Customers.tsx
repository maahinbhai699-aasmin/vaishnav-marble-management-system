import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Customer, Payment } from '../lib/types'
import { Plus, Search, Edit2, Trash2, Users } from 'lucide-react'

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
    <div>
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <div className="page-sub">Manage customer accounts and dues</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Customer</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Users />} title="No customers found" message="Add your first customer" action={<button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Customer</button>} /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Mobile</th><th>Type</th><th className="text-right">Total Purchase</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Last Purchase</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td>
                  <td>{c.mobile ?? '-'}</td>
                  <td><span className="badge badge-neutral">{c.customer_type.replace('_', ' ')}</span></td>
                  <td className="text-right">{formatCurrency(c.total_purchase)}</td>
                  <td className="text-right">{formatCurrency(c.total_paid)}</td>
                  <td className="text-right" style={{ color: Number(c.total_due) > 0 ? 'var(--error-600)' : undefined, fontWeight: Number(c.total_due) > 0 ? 600 : undefined }}>{formatCurrency(c.total_due)}</td>
                  <td>{formatDate(c.last_purchase_date)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleViewPayments(c)}>View</button>
                      {Number(c.total_due) > 0 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success-600)' }} onClick={() => setPaymentModal(c)}>Pay</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(c); setModalOpen(true) }}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <CustomerForm customer={editing} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />}

      <ConfirmDialog open={!!deleteId} title="Delete Customer" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />

      {paymentModal && <PaymentForm customer={paymentModal} onClose={() => setPaymentModal(null)} onSave={handlePayment} />}

      {detailCustomer && (
        <Modal open onClose={() => setDetailCustomer(null)} title={`Payment History - ${detailCustomer.name}`} size="lg"
          footer={<button className="btn btn-secondary" onClick={() => setDetailCustomer(null)}>Close</button>}
        >
          {payments.length === 0 ? <EmptyState title="No payments recorded" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th className="text-right">Amount</th><th>Notes</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td>{(p.sale as { invoice_number?: string })?.invoice_number ?? '-'}</td>
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
    <Modal open onClose={onClose} title={customer ? 'Edit Customer' : 'Add Customer'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{customer ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit}>
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Customer Type</label>
            <select className="form-select" value={form.customer_type} onChange={(e) => set('customer_type', e.target.value)}>
              <option value="retail">Retail Customer</option>
              <option value="contractor">Contractor</option>
              <option value="builder">Builder</option>
              <option value="interior_designer">Interior Designer</option>
              <option value="dealer">Dealer</option>
              <option value="wholesale">Wholesale Customer</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
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
    <Modal open onClose={onClose} title={`Receive Payment - ${customer.name}`} size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(Number(amount), method, notes)} disabled={!amount}>Save Payment</button></>}
    >
      <div className="form-group">
        <label className="form-label">Outstanding Due</label>
        <input className="form-input" value={formatCurrency(customer.total_due)} readOnly style={{ background: 'var(--n-50)', color: 'var(--error-600)', fontWeight: 600 }} />
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

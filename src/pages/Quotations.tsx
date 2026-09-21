import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate, formatNumber, nextInvoiceNumber } from '../lib/utils'
import type { Quotation, QuotationItem, Customer, Product } from '../lib/types'
import { Plus, Search, FileText, Eye, Trash2, Printer } from 'lucide-react'

export function Quotations() {
  const toast = useToast()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewQuote, setViewQuote] = useState<Quotation | null>(null)
  const [viewItems, setViewItems] = useState<QuotationItem[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [quoRes, custRes, prodRes] = await Promise.all([
      supabase.from('quotations').select('*, customer:customers(*)').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*, category:categories(*)').order('name'),
    ])
    setQuotations((quoRes.data ?? []) as Quotation[])
    setCustomers((custRes.data ?? []) as Customer[])
    setProducts((prodRes.data ?? []) as Product[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      const matchSearch = !search || q.quotation_number.toLowerCase().includes(search.toLowerCase()) || (q.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || q.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [quotations, search, statusFilter])

  const handleView = async (quote: Quotation) => {
    setViewQuote(quote)
    const { data } = await supabase.from('quotation_items').select('*, product:products(*)').eq('quotation_id', quote.id)
    setViewItems((data ?? []) as QuotationItem[])
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('quotations').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Quotation deleted')
    setDeleteId(null)
    fetchData()
  }

  const handleConvert = async (quote: Quotation) => {
    const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', quote.id)
    if (!items || items.length === 0) { toast('No items to convert', 'error'); return }

    const invNum = await nextInvoiceNumber('INV')
    const { data: sale, error } = await supabase.from('sales').insert({
      invoice_number: invNum,
      customer_id: quote.customer_id,
      customer_name: quote.customer_name,
      customer_mobile: quote.customer_mobile,
      sale_date: new Date().toISOString().split('T')[0],
      subtotal: quote.subtotal,
      discount: quote.discount,
      gst_amount: quote.gst_amount,
      other_charge: quote.other_charge,
      grand_total: quote.grand_total,
      paid_amount: 0,
      due_amount: quote.grand_total,
      payment_status: 'unpaid',
    }).select('id').maybeSingle()
    if (error || !sale) { toast(`Error: ${error?.message}`, 'error'); return }

    for (const item of items) {
      await supabase.from('sale_items').insert({
        sale_id: sale.id,
        product_id: item.product_id,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        sqft: item.sqft,
        rate: item.rate,
        gst_rate: item.gst_rate,
        amount: item.amount,
      })
    }

    await supabase.from('quotations').update({ status: 'converted' }).eq('id', quote.id)
    toast('Quotation converted to sale')
    fetchData()
  }

  if (loading) return <Loading label="Loading quotations..." />

  if (viewQuote) {
    return <QuotationView quote={viewQuote} items={viewItems} onClose={() => { setViewQuote(null); setViewItems([]) }} onConvert={() => handleConvert(viewQuote)} />
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quotations</h2>
          <div className="page-sub">Create estimates and convert to sales</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={products.length === 0}><Plus size={16} /> New Quotation</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search quotations..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option><option value="expired">Expired</option><option value="converted">Converted</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<FileText />} title="No quotations found" message="Create your first quotation" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Quotation #</th><th>Date</th><th>Customer</th><th>Valid Until</th><th className="text-right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id}>
                  <td className="font-semibold">{q.quotation_number}</td>
                  <td>{formatDate(q.quotation_date)}</td>
                  <td>{q.customer_name ?? '-'}</td>
                  <td>{formatDate(q.valid_until)}</td>
                  <td className="text-right">{formatCurrency(q.grand_total)}</td>
                  <td><span className={`badge ${q.status === 'accepted' ? 'badge-success' : q.status === 'converted' ? 'badge-primary' : q.status === 'rejected' || q.status === 'expired' ? 'badge-danger' : 'badge-neutral'}`}>{q.status}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleView(q)}><Eye size={14} /></button>
                      {q.status !== 'converted' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success-600)' }} onClick={() => handleConvert(q)}>Convert</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(q.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <QuotationForm customers={customers} products={products} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData() }} />}
      <ConfirmDialog open={!!deleteId} title="Delete Quotation" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
    </div>
  )
}

function QuotationForm({ customers, products, onClose, onSuccess }: { customers: Customer[]; products: Product[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast()
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [cart, setCart] = useState<{ product_id: string; description: string; unit: string; quantity: number; sqft: number; rate: number; gst_rate: number; amount: number }[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [discount, setDiscount] = useState('')
  const [otherCharge, setOtherCharge] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!productSearch) return []
    const q = productSearch.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 10)
  }, [products, productSearch])

  const subtotal = cart.reduce((s, item) => s + item.amount, 0)
  const gstAmount = cart.reduce((s, item) => s + (item.amount * item.gst_rate / 100), 0)
  const grandTotal = subtotal - Number(discount || 0) + Number(otherCharge || 0) + gstAmount

  const addProduct = (product: Product) => {
    setCart([...cart, {
      product_id: product.id,
      description: product.name,
      unit: product.selling_unit ?? 'Piece',
      quantity: 1,
      sqft: 0,
      rate: product.retail_price,
      gst_rate: product.gst_rate,
      amount: product.retail_price,
    }])
    setProductSearch('')
  }

  const updateItem = (index: number, updates: Partial<typeof cart[0]>) => {
    setCart(cart.map((c, i) => {
      if (i !== index) return c
      const updated = { ...c, ...updates }
      updated.amount = updated.quantity * updated.rate
      return updated
    }))
  }

  const removeItem = (index: number) => setCart(cart.filter((_, i) => i !== index))

  const handleSave = async () => {
    if (cart.length === 0) { toast('Add at least one product', 'error'); return }
    setSaving(true)
    const quoNum = await nextInvoiceNumber('QUO')
    const cust = customers.find((c) => c.id === customerId)

    const { data: quote, error } = await supabase.from('quotations').insert({
      quotation_number: quoNum,
      customer_id: customerId || null,
      customer_name: (cust?.name ?? customerName) || 'Walk-in',
      customer_mobile: (cust?.mobile ?? customerMobile) || null,
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: validUntil || null,
      subtotal,
      discount: Number(discount || 0),
      gst_amount: gstAmount,
      other_charge: Number(otherCharge || 0),
      grand_total: grandTotal,
      notes: notes || null,
      status: 'draft',
    }).select('id').maybeSingle()

    if (error || !quote) { toast(`Error: ${error?.message}`, 'error'); setSaving(false); return }

    for (const item of cart) {
      await supabase.from('quotation_items').insert({
        quotation_id: quote.id,
        product_id: item.product_id,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        sqft: item.sqft,
        rate: item.rate,
        gst_rate: item.gst_rate,
        amount: item.amount,
      })
    }

    toast('Quotation created')
    onSuccess()
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title="New Quotation" size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving || cart.length === 0}>{saving ? 'Saving...' : 'Save Quotation'}</button></>}
    >
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Customer</label>
          <select className="form-select" value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); setCustomerName(c?.name ?? ''); setCustomerMobile(c?.mobile ?? '') }}>
            <option value="">Walk-in Customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Valid Until</label>
          <input className="form-input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
      </div>

      <div className="search-input mb-4" style={{ width: '100%' }}>
        <Search />
        <input className="form-input" style={{ width: '100%' }} placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
      </div>
      {filteredProducts.length > 0 && (
        <div className="card mb-4" style={{ padding: 8, maxHeight: 200, overflow: 'auto' }}>
          {filteredProducts.map((p) => (
            <button key={p.id} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => addProduct(p)}>
              <span className="font-semibold">{p.name}</span> <span className="text-muted text-sm">{formatCurrency(p.retail_price)}</span>
            </button>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST%</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {cart.map((item, i) => (
                <tr key={i}>
                  <td className="font-semibold">{item.description}</td>
                  <td>{item.unit}</td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 60 }} value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} /></td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 80 }} value={item.rate} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} /></td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 50 }} value={item.gst_rate} onChange={(e) => updateItem(i, { gst_rate: Number(e.target.value) })} /></td>
                  <td className="text-right font-semibold">{formatCurrency(item.amount)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Discount</label>
          <input className="form-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Other Charge</label>
          <input className="form-input" type="number" value={otherCharge} onChange={(e) => setOtherCharge(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {Number(discount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Discount</span><span>-{formatCurrency(Number(discount))}</span></div>}
        {Number(otherCharge) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Other</span><span>{formatCurrency(Number(otherCharge))}</span></div>}
        {gstAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>GST</span><span>{formatCurrency(gstAmount)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8 }}><span>Grand Total</span><span style={{ color: 'var(--primary-600)' }}>{formatCurrency(grandTotal)}</span></div>
      </div>
    </Modal>
  )
}

function QuotationView({ quote, items, onClose, onConvert }: { quote: Quotation; items: QuotationItem[]; onClose: () => void; onConvert: () => void }) {
  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h2>Quotation {quote.quotation_number}</h2>
          <div className="page-sub">{formatDate(quote.quotation_date)} - {quote.customer_name}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          {quote.status !== 'converted' && <button className="btn btn-primary" onClick={onConvert}>Convert to Sale</button>}
          <button className="btn btn-secondary" onClick={onClose}>Back</button>
        </div>
      </div>

      <div className="invoice">
        <div className="invoice-header">
          <div>
            <div className="invoice-title">QUOTATION</div>
            <div style={{ fontSize: 14 }}>{quote.quotation_number}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{formatDate(quote.quotation_date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{quote.customer_name}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{quote.customer_mobile ?? ''}</div>
            {quote.valid_until && <div style={{ fontSize: 13, color: '#666' }}>Valid until: {formatDate(quote.valid_until)}</div>}
          </div>
        </div>

        <table className="invoice-table">
          <thead><tr><th>Description</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td className="text-right">{formatNumber(item.quantity)}</td>
                <td className="text-right">{formatCurrency(item.rate)}</td>
                <td className="text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="total-row"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
          {Number(quote.discount) > 0 && <div className="total-row"><span>Discount</span><span>-{formatCurrency(quote.discount)}</span></div>}
          {Number(quote.other_charge) > 0 && <div className="total-row"><span>Other</span><span>{formatCurrency(quote.other_charge)}</span></div>}
          {Number(quote.gst_amount) > 0 && <div className="total-row"><span>GST</span><span>{formatCurrency(quote.gst_amount)}</span></div>}
          <div className="total-row grand-total"><span>Grand Total</span><span>{formatCurrency(quote.grand_total)}</span></div>
        </div>
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatDate, nextInvoiceNumber, getDefaultUnitForCategory } from '../lib/utils'
import { recordStockMovement, createSlabFromPurchase, updateSupplierTotals } from '../lib/stockOps'
import type { Purchase, PurchaseItem, Product, Supplier, Category, Location } from '../lib/types'
import { Plus, Search, Trash2, ShoppingBag, Printer, Eye } from 'lucide-react'

interface CartItem {
  product_id: string
  product: Product
  unit: string
  quantity: number
  slab_count: number
  sqft: number
  purchase_rate: number
  gst_rate: number
  amount: number
  create_slabs: boolean
  slab_length: number
  slab_width: number
}

export function Purchases() {
  const toast = useToast()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null)
  const [viewItems, setViewItems] = useState<PurchaseItem[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [purRes, prodRes, supRes, catRes, locRes] = await Promise.all([
      supabase.from('purchases').select('*, supplier:suppliers(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:categories(*)').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('locations').select('*').order('name'),
    ])
    setPurchases((purRes.data ?? []) as Purchase[])
    setProducts((prodRes.data ?? []) as Product[])
    setSuppliers((supRes.data ?? []) as Supplier[])
    setCategories((catRes.data ?? []) as Category[])
    setLocations((locRes.data ?? []) as Location[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!search) return purchases
    const q = search.toLowerCase()
    return purchases.filter((p) => p.invoice_number.toLowerCase().includes(q) || (p.supplier?.name ?? '').toLowerCase().includes(q))
  }, [purchases, search])

  const handleView = async (purchase: Purchase) => {
    setViewPurchase(purchase)
    const { data } = await supabase.from('purchase_items').select('*, product:products(*)').eq('purchase_id', purchase.id)
    setViewItems((data ?? []) as PurchaseItem[])
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('purchases').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Purchase deleted')
    setDeleteId(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading purchases..." />

  if (viewPurchase) {
    return <PurchaseView purchase={viewPurchase} items={viewItems} onClose={() => { setViewPurchase(null); setViewItems([]) }} />
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Purchases</h2>
          <div className="page-sub">Record purchases and automatically update inventory</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={products.length === 0}><Plus size={16} /> New Purchase</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search purchases..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<ShoppingBag />} title="No purchases found" message="Record your first purchase" action={<button className="btn btn-primary" onClick={() => setModalOpen(true)}><Plus size={16} /> New Purchase</button>} /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th><th>Date</th><th>Supplier</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.invoice_number}</td>
                  <td>{formatDate(p.purchase_date)}</td>
                  <td>{p.supplier?.name ?? '-'}</td>
                  <td className="text-right">{formatCurrency(p.total_amount)}</td>
                  <td className="text-right">{formatCurrency(p.paid_amount)}</td>
                  <td className="text-right" style={{ color: Number(p.due_amount) > 0 ? 'var(--error-600)' : undefined, fontWeight: Number(p.due_amount) > 0 ? 600 : undefined }}>{formatCurrency(p.due_amount)}</td>
                  <td><span className={`badge ${p.payment_status === 'paid' ? 'badge-success' : p.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{p.payment_status}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleView(p)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(p.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <PurchaseForm products={products} suppliers={suppliers} categories={categories} locations={locations} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData() }} />}
      <ConfirmDialog open={!!deleteId} title="Delete Purchase" message="This will not reverse stock movements. Continue?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
    </div>
  )
}

function PurchaseForm({ products, suppliers, categories: _categories, locations: _locations, onClose, onSuccess }: { products: Product[]; suppliers: Supplier[]; categories: Category[]; locations: Location[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [cart, setCart] = useState<CartItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [charges, setCharges] = useState({ transport: '', other: '', discount: '' })
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!productSearch) return []
    const q = productSearch.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)).slice(0, 10)
  }, [products, productSearch])

  const subtotal = cart.reduce((s, item) => s + item.amount, 0)
  const transport = Number(charges.transport || 0)
  const other = Number(charges.other || 0)
  const discount = Number(charges.discount || 0)
  const gstAmount = cart.reduce((s, item) => s + (item.amount * item.gst_rate / 100), 0)
  const total = subtotal + transport + other - discount + gstAmount
  const paid = Number(paidAmount || 0)
  const due = total - paid

  const addProduct = (product: Product) => {
    const invType = product.category?.inventory_type ?? 'piece'
    const defaultUnit = product.selling_unit ?? getDefaultUnitForCategory(product.category?.name)
    const slabCount = invType === 'slab' ? 1 : 0
    const boxQty = invType === 'box' ? 1 : 0
    const pieceQty = invType === 'piece' ? 1 : 0

    setCart([...cart, {
      product_id: product.id,
      product,
      unit: defaultUnit,
      quantity: invType === 'box' ? boxQty : invType === 'piece' ? pieceQty : 1,
      slab_count: slabCount,
      sqft: invType === 'box' ? (Number(product.length) || 0) * (Number(product.width) || 0) : 0,
      purchase_rate: product.purchase_price,
      gst_rate: product.gst_rate,
      amount: product.purchase_price,
      create_slabs: invType === 'slab',
      slab_length: product.length ? Number(product.length) : 0,
      slab_width: product.width ? Number(product.width) : 0,
    }])
    setProductSearch('')
  }

  const updateItem = (index: number, updates: Partial<CartItem>) => {
    setCart(cart.map((c, i) => {
      if (i !== index) return c
      const updated = { ...c, ...updates }
      updated.amount = updated.slab_count > 0 ? updated.slab_count * updated.purchase_rate * (updated.slab_length * updated.slab_width || 1) : updated.quantity * updated.purchase_rate
      return updated
    }))
  }

  const removeItem = (index: number) => setCart(cart.filter((_, i) => i !== index))

  const handleSave = async () => {
    if (cart.length === 0) { toast('Add at least one product', 'error'); return }
    setSaving(true)
    try {
      const invNum = invoiceNumber || await nextInvoiceNumber('PUR')
      const paymentStatus = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'

      const { data: purchase, error } = await supabase.from('purchases').insert({
        invoice_number: invNum,
        supplier_id: supplierId || null,
        purchase_date: purchaseDate,
        subtotal,
        discount,
        gst_amount: gstAmount,
        transport_charge: transport,
        other_charge: other,
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
        payment_status: paymentStatus,
        notes: notes || null,
      }).select('id').maybeSingle()

      if (error || !purchase) { toast(`Error: ${error?.message}`, 'error'); setSaving(false); return }

      for (const item of cart) {
        const invType = item.product.category?.inventory_type ?? 'piece'
        const stockInCount = invType === 'piece' ? item.quantity : invType === 'box' ? item.quantity : item.slab_count
        const stockInSqft = invType === 'box' ? (item.sqft || (item.quantity * (item.slab_length * item.slab_width || 0))) : invType === 'slab' ? (item.sqft || item.slab_count * (item.slab_length * item.slab_width || 0)) : 0

        await supabase.from('purchase_items').insert({
          purchase_id: purchase.id,
          product_id: item.product_id,
          category_id: item.product.category_id,
          description: item.product.name,
          unit: item.unit,
          quantity: item.quantity,
          slab_count: item.slab_count,
          sqft: stockInSqft,
          purchase_rate: item.purchase_rate,
          gst_rate: item.gst_rate,
          amount: item.amount,
        })

        // Update product stock
        await recordStockMovement({
          product_id: item.product_id,
          category_id: item.product.category_id,
          transaction_type: 'purchase',
          reference_number: invNum,
          reference_id: purchase.id,
          stock_in_count: stockInCount,
          stock_in_sqft: stockInSqft,
          unit: item.unit,
          cost_price: item.purchase_rate,
          remarks: `Purchase: ${item.product.name}`,
        })

        // Create individual slabs for marble/granite
        if (item.create_slabs && item.slab_count > 0 && item.slab_length > 0 && item.slab_width > 0) {
          for (let i = 0; i < item.slab_count; i++) {
            const slabNum = `${item.product.sku ?? 'SLAB'}-${Date.now().toString().slice(-4)}-${i + 1}`
            await createSlabFromPurchase(
              item.product,
              slabNum,
              item.slab_length,
              item.slab_width,
              Number(item.product.thickness) || 0,
              item.purchase_rate,
              item.product.retail_price,
              invNum,
              item.product.location_id,
              supplierId || null,
              invNum,
            )
          }
        }
      }

      // Record supplier payment
      if (paid > 0 && supplierId) {
        await supabase.from('supplier_payments').insert({
          supplier_id: supplierId,
          purchase_id: purchase.id,
          amount: paid,
          payment_method: paymentMethod,
          payment_date: purchaseDate,
        })
      }

      // Update supplier totals
      if (supplierId) {
        await updateSupplierTotals(supplierId, total, paid)
      }

      toast('Purchase recorded successfully')
      onSuccess()
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, 'error')
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title="New Purchase" size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving || cart.length === 0}>{saving ? 'Saving...' : 'Save Purchase'}</button></>}
    >
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Supplier</label>
          <select className="form-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select Supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Invoice Number</label>
          <input className="form-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto-generated if empty" />
        </div>
        <div className="form-group">
          <label className="form-label">Purchase Date</label>
          <input className="form-input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      <div className="search-input mb-4" style={{ width: '100%' }}>
        <Search />
        <input className="form-input" style={{ width: '100%' }} placeholder="Search products to add..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
      </div>
      {filteredProducts.length > 0 && (
        <div className="card mb-4" style={{ padding: 8, maxHeight: 200, overflow: 'auto' }}>
          {filteredProducts.map((p) => (
            <button key={p.id} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => addProduct(p)}>
              <div><span className="font-semibold">{p.name}</span> <span className="text-muted text-sm">{p.category?.name}</span></div>
            </button>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty/Slabs</th><th className="text-right">L x W</th><th className="text-right">Rate</th><th className="text-right">GST%</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {cart.map((item, i) => {
                const invType = item.product.category?.inventory_type ?? 'piece'
                return (
                  <tr key={i}>
                    <td className="font-semibold">{item.product.name}</td>
                    <td>{item.unit}</td>
                    <td className="text-right">
                      {invType === 'slab' ? (
                        <input className="form-input" type="number" style={{ width: 60 }} value={item.slab_count} onChange={(e) => updateItem(i, { slab_count: Number(e.target.value) })} />
                      ) : (
                        <input className="form-input" type="number" step="0.01" style={{ width: 60 }} value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                      )}
                    </td>
                    <td className="text-right">
                      {invType === 'slab' ? (
                        <div className="flex gap-1" style={{ width: 120 }}>
                          <input className="form-input" type="number" step="0.01" style={{ width: 50 }} placeholder="L" value={item.slab_length || ''} onChange={(e) => updateItem(i, { slab_length: Number(e.target.value) })} />
                          <input className="form-input" type="number" step="0.01" style={{ width: 50 }} placeholder="W" value={item.slab_width || ''} onChange={(e) => updateItem(i, { slab_width: Number(e.target.value) })} />
                        </div>
                      ) : '-'}
                    </td>
                    <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 80 }} value={item.purchase_rate} onChange={(e) => updateItem(i, { purchase_rate: Number(e.target.value) })} /></td>
                    <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 50 }} value={item.gst_rate} onChange={(e) => updateItem(i, { gst_rate: Number(e.target.value) })} /></td>
                    <td className="text-right font-semibold">{formatCurrency(item.amount)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Transport Charge</label>
          <input className="form-input" type="number" value={charges.transport} onChange={(e) => setCharges({ ...charges, transport: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Other Charge</label>
          <input className="form-input" type="number" value={charges.other} onChange={(e) => setCharges({ ...charges, other: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Discount</label>
          <input className="form-input" type="number" value={charges.discount} onChange={(e) => setCharges({ ...charges, discount: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Paid Amount</label>
          <input className="form-input" type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <select className="form-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {transport > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Transport</span><span>{formatCurrency(transport)}</span></div>}
        {other > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Other</span><span>{formatCurrency(other)}</span></div>}
        {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Discount</span><span>-{formatCurrency(discount)}</span></div>}
        {gstAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>GST</span><span>{formatCurrency(gstAmount)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8 }}><span>Total</span><span style={{ color: 'var(--primary-600)' }}>{formatCurrency(total)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: due > 0 ? 'var(--error-600)' : 'var(--success-600)', fontWeight: 600 }}><span>Due</span><span>{formatCurrency(due)}</span></div>
      </div>
    </Modal>
  )
}

function PurchaseView({ purchase, items, onClose }: { purchase: Purchase; items: PurchaseItem[]; onClose: () => void }) {
  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h2>Purchase {purchase.invoice_number}</h2>
          <div className="page-sub">{formatDate(purchase.purchase_date)} - {purchase.supplier?.name ?? '-'}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn btn-primary" onClick={onClose}>Back</button>
        </div>
      </div>

      <div className="invoice">
        <div className="invoice-header">
          <div>
            <div className="invoice-title">PURCHASE</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{purchase.invoice_number}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{formatDate(purchase.purchase_date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{purchase.supplier?.name ?? '-'}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{purchase.supplier?.company_name ?? ''}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{purchase.supplier?.mobile ?? ''}</div>
          </div>
        </div>

        <table className="invoice-table">
          <thead><tr><th>Description</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td className="text-right">{item.slab_count > 0 ? `${item.slab_count} slabs` : formatNumber(item.quantity)}</td>
                <td className="text-right">{formatCurrency(item.purchase_rate)}</td>
                <td className="text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="total-row"><span>Subtotal</span><span>{formatCurrency(purchase.subtotal)}</span></div>
          {Number(purchase.transport_charge) > 0 && <div className="total-row"><span>Transport</span><span>{formatCurrency(purchase.transport_charge)}</span></div>}
          {Number(purchase.other_charge) > 0 && <div className="total-row"><span>Other</span><span>{formatCurrency(purchase.other_charge)}</span></div>}
          {Number(purchase.discount) > 0 && <div className="total-row"><span>Discount</span><span>-{formatCurrency(purchase.discount)}</span></div>}
          {Number(purchase.gst_amount) > 0 && <div className="total-row"><span>GST</span><span>{formatCurrency(purchase.gst_amount)}</span></div>}
          <div className="total-row grand-total"><span>Total</span><span>{formatCurrency(purchase.total_amount)}</span></div>
          <div className="total-row"><span>Paid</span><span>{formatCurrency(purchase.paid_amount)}</span></div>
          <div className="total-row" style={{ fontWeight: 600, color: Number(purchase.due_amount) > 0 ? '#dc2626' : '#16a34a' }}><span>Due</span><span>{formatCurrency(purchase.due_amount)}</span></div>
        </div>
      </div>
    </div>
  )
}

function formatNumber(n: number): string { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }

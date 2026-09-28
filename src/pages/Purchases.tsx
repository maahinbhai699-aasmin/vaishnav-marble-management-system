import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatDate, nextInvoiceNumber, getDefaultUnitForCategory } from '../lib/utils'
import { recordStockMovement, createSlabFromPurchase, updateSupplierTotals } from '../lib/stockOps'
import type { Purchase, PurchaseItem, Product, Supplier, Category, Location } from '../lib/types'
import {
  Plus, Search, Trash2, ShoppingBag, Printer, Eye, X, Truck, Wallet, Building2,
  Package, CheckCircle2, Receipt,
} from 'lucide-react'

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
  const [page, setPage] = useState(1)
  const pageSize = 20

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
  const visiblePurchases = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Display-only summary
  const stats = useMemo(() => {
    const total = purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0)
    const paid = purchases.reduce((s, p) => s + Number(p.paid_amount || 0), 0)
    const due = purchases.reduce((s, p) => s + Number(p.due_amount || 0), 0)
    const withDue = purchases.filter((p) => Number(p.due_amount) > 0).length
    return { total, paid, due, withDue }
  }, [purchases])

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
    <div className="pu-root">
      <style>{puStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="pu-header">
        <div>
          <h2>Purchases</h2>
          <div className="pu-header-sub">
            Record purchases and automatically update inventory
            {purchases.length > 0 && (
              <span className="pu-header-chip">{purchases.length} purchase{purchases.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <button className="pu-add-btn" onClick={() => setModalOpen(true)} disabled={products.length === 0}>
          <Plus size={16} /> New Purchase
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      {purchases.length > 0 && (
        <div className="pu-stats">
          <div className="pu-stat c-indigo" style={{ animationDelay: '.02s' }}>
            <div className="pu-stat-ico"><Receipt size={20} /></div>
            <div className="pu-stat-body">
              <div className="pu-stat-label">Total Purchases</div>
              <div className="pu-stat-value">{formatCurrency(stats.total)}</div>
              <div className="pu-stat-sub">{purchases.length} orders</div>
            </div>
          </div>
          <div className="pu-stat c-emerald" style={{ animationDelay: '.06s' }}>
            <div className="pu-stat-ico"><CheckCircle2 size={20} /></div>
            <div className="pu-stat-body">
              <div className="pu-stat-label">Paid</div>
              <div className="pu-stat-value">{formatCurrency(stats.paid)}</div>
            </div>
          </div>
          <div className="pu-stat c-rose" style={{ animationDelay: '.10s' }}>
            <div className="pu-stat-ico"><Wallet size={20} /></div>
            <div className="pu-stat-body">
              <div className="pu-stat-label">Due</div>
              <div className="pu-stat-value">{formatCurrency(stats.due)}</div>
              <div className="pu-stat-sub">{stats.withDue} pending</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="pu-filters">
        <div className="pu-search">
          <Search size={17} />
          <input
            placeholder="Search by invoice number or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="pu-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table / Cards ═══ */}
      {filtered.length === 0 ? (
        <div className="pu-panel">
          <EmptyState
            icon={<ShoppingBag />}
            title="No purchases found"
            message="Record your first purchase"
            action={
              <button className="pu-add-btn" onClick={() => setModalOpen(true)}>
                <Plus size={16} /> New Purchase
              </button>
            }
          />
        </div>
      ) : (
        <div className="pu-panel">
          {/* Desktop table */}
          <div className="pu-table-wrap">
            <table className="pu-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="right">Total</th>
                  <th className="right">Paid</th>
                  <th className="right">Due</th>
                  <th>Status</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePurchases.map((p, idx) => {
                  const hasDue = Number(p.due_amount) > 0
                  const rowClass = p.payment_status === 'paid' ? 'row-paid' : p.payment_status === 'partial' ? 'row-partial' : 'row-unpaid'
                  return (
                    <tr key={p.id} className={rowClass} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                      <td><span className="pu-inv-num">{p.invoice_number}</span></td>
                      <td className="pu-mono">{formatDate(p.purchase_date)}</td>
                      <td>
                        <div className="pu-sup-cell">
                          <div className="pu-sup-avatar">{(p.supplier?.name ?? '?').charAt(0).toUpperCase()}</div>
                          <span className="pu-sup-name">{p.supplier?.name ?? '-'}</span>
                        </div>
                      </td>
                      <td className="right"><span className="pu-num">{formatCurrency(p.total_amount)}</span></td>
                      <td className="right"><span className="pu-num pos">{formatCurrency(p.paid_amount)}</span></td>
                      <td className="right">
                        {hasDue ? (
                          <span className="pu-num neg">{formatCurrency(p.due_amount)}</span>
                        ) : (
                          <span className="pu-clear-due"><CheckCircle2 size={12} /> Clear</span>
                        )}
                      </td>
                      <td>
                        <span className={`pu-badge ${p.payment_status}`}>{p.payment_status}</span>
                      </td>
                      <td>
                        <div className="pu-actions">
                          <button className="pu-act" onClick={() => handleView(p)} title="View purchase">
                            <Eye size={14} />
                          </button>
                          <button className="pu-act danger" onClick={() => setDeleteId(p.id)} title="Delete purchase">
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

          {/* Mobile cards */}
          <div className="pu-card-list">
            {visiblePurchases.map((p, idx) => {
              const hasDue = Number(p.due_amount) > 0
              const tone = p.payment_status === 'paid' ? 'paid' : p.payment_status === 'partial' ? 'partial' : 'unpaid'
              return (
                <div key={p.id} className={`pu-card ${tone}`} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                  <div className="pu-card-head">
                    <div>
                      <div className="pu-card-inv">{p.invoice_number}</div>
                      <div className="pu-card-date">{formatDate(p.purchase_date)}</div>
                    </div>
                    <span className={`pu-badge ${p.payment_status}`}>{p.payment_status}</span>
                  </div>

                  <div className="pu-card-sup">
                    <div className="pu-sup-avatar">{(p.supplier?.name ?? '?').charAt(0).toUpperCase()}</div>
                    <span className="pu-sup-name">{p.supplier?.name ?? '-'}</span>
                  </div>

                  <div className="pu-card-grid">
                    <div className="pu-card-stat">
                      <div className="pu-card-stat-label">Total</div>
                      <div className="pu-card-stat-value">{formatCurrency(p.total_amount)}</div>
                    </div>
                    <div className="pu-card-stat">
                      <div className="pu-card-stat-label">Paid</div>
                      <div className="pu-card-stat-value pos">{formatCurrency(p.paid_amount)}</div>
                    </div>
                    <div className="pu-card-stat">
                      <div className="pu-card-stat-label">Due</div>
                      <div className={`pu-card-stat-value ${hasDue ? 'neg' : 'pos'}`}>{formatCurrency(p.due_amount)}</div>
                    </div>
                  </div>

                  <div className="pu-card-actions">
                    <button className="pu-act full" onClick={() => handleView(p)}>
                      <Eye size={14} /> View
                    </button>
                    <button className="pu-act danger full" onClick={() => setDeleteId(p.id)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {modalOpen && (
        <PurchaseForm
          products={products}
          suppliers={suppliers}
          categories={categories}
          locations={locations}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchData() }}
        />
      )}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Purchase"
        message="This will not reverse stock movements. Continue?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel="Delete"
        danger
      />
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
      sqft: invType === 'box' || invType === 'mixed' ? (Number(product.length) || 0) * (Number(product.width) || 0) : 0,
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
        const stockInCount = invType === 'piece' || invType === 'box' ? item.quantity : invType === 'mixed' ? item.quantity : item.slab_count
        const stockInSqft = invType === 'box' || invType === 'mixed' ? (item.sqft || (item.quantity * (item.slab_length * item.slab_width || 0))) : invType === 'slab' ? (item.sqft || item.slab_count * (item.slab_length * item.slab_width || 0)) : 0

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

      if (paid > 0 && supplierId) {
        await supabase.from('supplier_payments').insert({
          supplier_id: supplierId,
          purchase_id: purchase.id,
          amount: paid,
          payment_method: paymentMethod,
          payment_date: purchaseDate,
        })
      }

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
    <Modal
      open
      onClose={onClose}
      title="New Purchase"
      size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving || cart.length === 0}>{saving ? 'Saving...' : 'Save Purchase'}</button></>}
    >
      <div className="pu-form">

        {/* Basic info */}
        <div className="pu-section-label">Purchase Details</div>
        <div className="pu-form-row">
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

        {/* Products */}
        <div className="pu-section-label">Add Products</div>
        <div className="pu-search">
          <Search size={17} />
          <input
            placeholder="Search products to add..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          {productSearch && (
            <button className="pu-clear" onClick={() => setProductSearch('')} title="Clear">
              <X size={14} />
            </button>
          )}
        </div>

        {filteredProducts.length > 0 && (
          <div className="pu-suggest">
            {filteredProducts.map((p) => (
              <button key={p.id} className="pu-suggest-item" onClick={() => addProduct(p)}>
                <div className="pu-suggest-avatar">{p.name.charAt(0).toUpperCase()}</div>
                <div className="pu-suggest-body">
                  <div className="pu-suggest-name">{p.name}</div>
                  <div className="pu-suggest-meta">{p.category?.name ?? 'Uncategorized'}</div>
                </div>
                <Plus size={14} className="pu-suggest-plus" />
              </button>
            ))}
          </div>
        )}

        {/* Cart */}
        {cart.length > 0 ? (
          <div className="pu-cart">
            <div className="pu-cart-head">
              <span className="pu-cart-title">Items to Purchase</span>
              <span className="pu-cart-badge">{cart.length}</span>
            </div>
            <div className="pu-cart-list">
              {cart.map((item, i) => {
                const invType = item.product.category?.inventory_type ?? 'piece'
                return (
                  <div key={i} className="pu-cart-item" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                    <div className="pu-cart-item-head">
                      <div className="pu-cart-item-name">{item.product.name}</div>
                      <button className="pu-cart-item-del" onClick={() => removeItem(i)} title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="pu-cart-item-unit">{item.unit}</div>

                    <div className="pu-cart-item-fields">
                      {invType === 'slab' ? (
                        <div className="pu-field">
                          <label>Slabs</label>
                          <input type="number" value={item.slab_count} onChange={(e) => updateItem(i, { slab_count: Number(e.target.value) })} />
                        </div>
                      ) : (
                        <div className="pu-field">
                          <label>Qty</label>
                          <input type="number" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                        </div>
                      )}

                      {invType === 'slab' && (
                        <>
                          <div className="pu-field">
                            <label>Length</label>
                            <input type="number" step="0.01" value={item.slab_length || ''} onChange={(e) => updateItem(i, { slab_length: Number(e.target.value) })} />
                          </div>
                          <div className="pu-field">
                            <label>Width</label>
                            <input type="number" step="0.01" value={item.slab_width || ''} onChange={(e) => updateItem(i, { slab_width: Number(e.target.value) })} />
                          </div>
                        </>
                      )}

                      <div className="pu-field">
                        <label>Rate</label>
                        <input type="number" step="0.01" value={item.purchase_rate} onChange={(e) => updateItem(i, { purchase_rate: Number(e.target.value) })} />
                      </div>
                      <div className="pu-field">
                        <label>GST%</label>
                        <input type="number" step="0.01" value={item.gst_rate} onChange={(e) => updateItem(i, { gst_rate: Number(e.target.value) })} />
                      </div>
                    </div>

                    <div className="pu-cart-item-total">
                      <span>Amount</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="pu-cart-empty">
            <div className="pu-cart-empty-ic"><Package size={26} /></div>
            <p>No products added yet</p>
            <span>Search above and tap a product to add it</span>
          </div>
        )}

        {/* Charges */}
        <div className="pu-section-label">Charges &amp; Payment</div>
        <div className="pu-form-row">
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

        <div className="pu-form-row">
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
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Summary */}
        <div className="pu-summary">
          <div className="pu-sum-row"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {transport > 0 && <div className="pu-sum-row"><span>Transport</span><span>{formatCurrency(transport)}</span></div>}
          {other > 0 && <div className="pu-sum-row"><span>Other</span><span>{formatCurrency(other)}</span></div>}
          {discount > 0 && <div className="pu-sum-row disc"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>}
          {gstAmount > 0 && <div className="pu-sum-row"><span>GST</span><span>{formatCurrency(gstAmount)}</span></div>}

          <div className="pu-grand">
            <span className="pu-grand-l">Total</span>
            <span className="pu-grand-v">{formatCurrency(total)}</span>
          </div>

          <div className={`pu-due ${due > 0 ? 'due' : 'clear'}`}>
            <span>Due</span>
            <span>{formatCurrency(due)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function PurchaseView({ purchase, items, onClose }: { purchase: Purchase; items: PurchaseItem[]; onClose: () => void }) {
  return (
    <div className="puv-root">
      <style>{puvStyles}</style>

      <div className="puv-header no-print">
        <div>
          <h2>Purchase {purchase.invoice_number}</h2>
          <div className="puv-header-sub">
            {formatDate(purchase.purchase_date)} · {purchase.supplier?.name ?? '-'}
          </div>
        </div>
        <div className="puv-header-actions">
          <button className="puv-btn secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="puv-btn primary" onClick={onClose}>Back</button>
        </div>
      </div>

      <div className="puv-invoice">
        <div className="puv-invoice-head">
          <div className="puv-inv-business">
            <div className="puv-inv-title">PURCHASE</div>
            <div className="puv-inv-num">{purchase.invoice_number}</div>
            <div className="puv-inv-date">{formatDate(purchase.purchase_date)}</div>
          </div>
          <div className="puv-inv-supplier">
            <div className="puv-inv-sup-name">{purchase.supplier?.name ?? '-'}</div>
            {purchase.supplier?.company_name && (
              <div className="puv-inv-sup-line">
                <Building2 size={12} /> {purchase.supplier.company_name}
              </div>
            )}
            {purchase.supplier?.mobile && (
              <div className="puv-inv-sup-line">
                <Truck size={12} /> {purchase.supplier.mobile}
              </div>
            )}
          </div>
        </div>

        <div className="puv-table-wrap">
          <table className="puv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Unit</th>
                <th className="right">Qty</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                  <td className="puv-item-name">{item.description}</td>
                  <td><span className="puv-unit-pill">{item.unit}</span></td>
                  <td className="right puv-mono">{item.slab_count > 0 ? `${item.slab_count} slabs` : formatNumber(item.quantity)}</td>
                  <td className="right puv-mono">{formatCurrency(item.purchase_rate)}</td>
                  <td className="right puv-amount">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="puv-totals">
          <div className="puv-tot-row"><span>Subtotal</span><span>{formatCurrency(purchase.subtotal)}</span></div>
          {Number(purchase.transport_charge) > 0 && <div className="puv-tot-row"><span>Transport</span><span>{formatCurrency(purchase.transport_charge)}</span></div>}
          {Number(purchase.other_charge) > 0 && <div className="puv-tot-row"><span>Other</span><span>{formatCurrency(purchase.other_charge)}</span></div>}
          {Number(purchase.discount) > 0 && <div className="puv-tot-row disc"><span>Discount</span><span>-{formatCurrency(purchase.discount)}</span></div>}
          {Number(purchase.gst_amount) > 0 && <div className="puv-tot-row"><span>GST</span><span>{formatCurrency(purchase.gst_amount)}</span></div>}

          <div className="puv-grand">
            <span>Total</span>
            <span>{formatCurrency(purchase.total_amount)}</span>
          </div>

          <div className="puv-tot-row">
            <span>Paid</span>
            <span className="puv-pos">{formatCurrency(purchase.paid_amount)}</span>
          </div>
          <div className={`puv-due-row ${Number(purchase.due_amount) > 0 ? 'due' : 'clear'}`}>
            <span>Due</span>
            <span>{formatCurrency(purchase.due_amount)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatNumber(n: number): string { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }

/* ═══════════ Styles ═══════════ */
const puStyles = `
  .pu-root {
    --pu-card: #ffffff;
    --pu-border: #e6ebf2;
    --pu-text: #0f172a;
    --pu-muted: #64748b;
    --pu-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: puFade .38s ease both;
  }
  @keyframes puFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes puRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes puRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes puSlideIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes puShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes puShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes puFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

  /* ═══ Header ═══ */
  .pu-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(59,130,246,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(139,92,246,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #f5f8ff);
    border: 1px solid #dbeafe;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .pu-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
  }
  .pu-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #2563eb 55%, #7c3aed 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .pu-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--pu-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pu-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #dbeafe, #e0e7ff);
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Add button */
  .pu-add-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 20px;
    border-radius: 12px;
    background: linear-gradient(115deg, #3b82f6, #8b5cf6);
    border: none;
    color: #fff;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: .01em;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    box-shadow: 0 14px 28px -14px rgba(59,130,246,.85);
    transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
  }
  .pu-add-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .pu-add-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(59,130,246,.95);
  }
  .pu-add-btn:hover::after { animation: puShine .9s ease; }
  .pu-add-btn:active:not(:disabled) { transform: scale(.96); }
  .pu-add-btn:disabled { opacity: .55; cursor: not-allowed; }

  /* ═══ Stat cards ═══ */
  .pu-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  @media (max-width: 640px) {
    .pu-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }
  @media (max-width: 420px) {
    .pu-stats { grid-template-columns: 1fr; }
  }

  .pu-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--pu-card);
    border: 1px solid var(--pu-border);
    border-radius: 16px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 13px;
    animation: puRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .pu-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .pu-stat::after {
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
  .pu-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .pu-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .pu-stat.c-indigo { --sc1:#3b82f6; --sc2:#6366f1; --scs: rgba(59,130,246,.55); }
  .pu-stat.c-emerald{ --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
  .pu-stat.c-rose   { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }

  .pu-stat-ico {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .pu-stat-ico svg { width: 20px; height: 20px; }
  .pu-stat:hover .pu-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .pu-stat-body { min-width: 0; flex: 1; }
  .pu-stat-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--pu-muted);
    margin-bottom: 4px;
  }
  .pu-stat-value {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--pu-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pu-stat.c-indigo .pu-stat-value { color: #1d4ed8; }
  .pu-stat.c-emerald .pu-stat-value{ color: #047857; }
  .pu-stat.c-rose .pu-stat-value   { color: #be123c; }
  .pu-stat-sub {
    font-size: 11px;
    color: var(--pu-soft);
    margin-top: 2px;
    font-weight: 600;
  }

  /* ═══ Filters ═══ */
  .pu-filters {
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #f5f8ff);
    border: 1px solid var(--pu-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: puRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  .pu-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--pu-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .pu-search:focus-within {
    border-color: #a5b4fc;
    box-shadow: 0 0 0 4px rgba(59,130,246,.14);
    transform: translateY(-1px);
  }
  .pu-search svg { color: #2563eb; flex-shrink: 0; }
  .pu-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--pu-text);
    height: 100%;
    min-width: 0;
  }
  .pu-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .pu-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--pu-muted);
    cursor: pointer;
    transition: all .18s ease;
    flex-shrink: 0;
  }
  .pu-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  /* ═══ Panel ═══ */
  .pu-panel {
    background: var(--pu-card);
    border: 1px solid var(--pu-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: puRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .pu-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #dbeafe;
  }

  /* ═══ Table ═══ */
  .pu-table-wrap { overflow-x: auto; }
  .pu-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 800px; }
  .pu-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--pu-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--pu-border);
    white-space: nowrap;
  }
  .pu-table thead th.right { text-align: right; }
  .pu-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--pu-text);
    vertical-align: middle;
  }
  .pu-table tbody tr:last-child td { border-bottom: none; }
  .pu-table tbody tr {
    animation: puRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .pu-table tbody tr:hover {
    background: linear-gradient(90deg, #f5f8ff, #ffffff);
  }
  .pu-table tbody tr.row-paid { box-shadow: inset 3px 0 0 #10b981; }
  .pu-table tbody tr.row-paid:hover { box-shadow: inset 3px 0 0 #10b981, 0 6px 20px -18px rgba(16,185,129,.7); }
  .pu-table tbody tr.row-partial { box-shadow: inset 3px 0 0 #f59e0b; }
  .pu-table tbody tr.row-partial:hover { box-shadow: inset 3px 0 0 #f59e0b, 0 6px 20px -18px rgba(245,158,11,.7); }
  .pu-table tbody tr.row-unpaid { box-shadow: inset 3px 0 0 #f43f5e; }
  .pu-table tbody tr.row-unpaid:hover { box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7); }
  .pu-table .right { text-align: right; }

  .pu-inv-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #1d4ed8;
  }
  .pu-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--pu-text);
  }
  .pu-sup-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .pu-sup-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    box-shadow: 0 8px 16px -10px rgba(59,130,246,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .pu-table tbody tr:hover .pu-sup-avatar,
  .pu-card:hover .pu-sup-avatar { transform: scale(1.1) rotate(-6deg); }
  .pu-sup-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--pu-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
  .pu-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--pu-text);
    white-space: nowrap;
  }
  .pu-num.pos { color: #047857; }
  .pu-num.neg { color: #be123c; }
  .pu-clear-due {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 800;
    color: #047857;
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .pu-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .025em;
    white-space: nowrap;
    text-transform: capitalize;
  }
  .pu-badge::before {
    content: '';
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .pu-badge.paid    { background: linear-gradient(135deg, #ecfdf5, #d1fae5); color: #047857; }
  .pu-badge.partial { background: linear-gradient(135deg, #fffbeb, #fef3c7); color: #b45309; }
  .pu-badge.unpaid  { background: linear-gradient(135deg, #fff1f2, #ffe4e6); color: #be123c; }

  .pu-actions { display: flex; gap: 6px; }
  .pu-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 32px; height: 32px;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--pu-border);
    color: var(--pu-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .pu-act:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(59,130,246,.7);
  }
  .pu-act.danger:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
  }
  .pu-act.full {
    width: auto;
    padding: 9px 14px;
    flex: 1;
  }
  .pu-act:active { transform: scale(.9); }

  /* ═══ Mobile cards ═══ */
  .pu-card-list { display: none; padding: 12px; }
  @media (max-width: 720px) {
    .pu-table-wrap { display: none; }
    .pu-card-list { display: grid; gap: 12px; grid-template-columns: 1fr; }
  }
  @media (min-width: 721px) and (max-width: 900px) {
    .pu-card-list { display: none; }
  }

  .pu-card {
    position: relative;
    overflow: hidden;
    background: #fff;
    border: 1px solid var(--pu-border);
    border-radius: 14px;
    padding: 14px;
    animation: puRise .45s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .pu-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
  }
  .pu-card.paid::before { background: linear-gradient(90deg, #10b981, #34d399); }
  .pu-card.partial::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .pu-card.unpaid::before { background: linear-gradient(90deg, #f43f5e, #fb7185); }
  .pu-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 34px -22px rgba(15,23,42,.4);
  }
  .pu-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
  }
  .pu-card-inv {
    font-weight: 800;
    font-size: 14px;
    color: #1d4ed8;
    letter-spacing: -.01em;
  }
  .pu-card-date {
    font-size: 11.5px;
    color: var(--pu-soft);
    font-weight: 600;
    margin-top: 2px;
  }
  .pu-card-sup {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 10px;
    background: linear-gradient(135deg, #f5f8ff, #eff6ff);
    border: 1px solid #dbeafe;
    margin-bottom: 11px;
  }
  .pu-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 11px;
  }
  .pu-card-stat {
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    border: 1px solid var(--pu-border);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .pu-card-stat-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pu-soft);
    margin-bottom: 3px;
  }
  .pu-card-stat-value {
    font-size: 13px;
    font-weight: 800;
    color: var(--pu-text);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pu-card-stat-value.pos { color: #047857; }
  .pu-card-stat-value.neg { color: #be123c; }
  .pu-card-actions { display: flex; gap: 8px; }

  /* ═══ Form ═══ */
  .pu-form { display: flex; flex-direction: column; gap: 4px; }

  .pu-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--pu-muted);
    margin: 18px 0 12px;
  }
  .pu-section-label:first-child { margin-top: 0; }
  .pu-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  }

  .pu-form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 4px;
  }
  @media (max-width: 640px) {
    .pu-form-row { grid-template-columns: 1fr; }
  }

  /* Suggestions dropdown */
  .pu-suggest {
    margin-top: 8px;
    background: #fff;
    border: 1px solid var(--pu-border);
    border-radius: 12px;
    padding: 6px;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 14px 30px -22px rgba(15,23,42,.35);
    animation: puRise .35s cubic-bezier(.22,1,.36,1) both;
  }
  .pu-suggest-item {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 9px 10px;
    border: none;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background .16s ease, transform .16s ease;
  }
  .pu-suggest-item:hover {
    background: linear-gradient(90deg, #f5f8ff, #eff6ff);
    transform: translateX(2px);
  }
  .pu-suggest-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    box-shadow: 0 8px 16px -10px rgba(59,130,246,.9);
  }
  .pu-suggest-body { flex: 1; min-width: 0; }
  .pu-suggest-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--pu-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pu-suggest-meta {
    font-size: 11.5px;
    color: var(--pu-soft);
    font-weight: 600;
  }
  .pu-suggest-plus {
    color: #2563eb;
    flex-shrink: 0;
    transition: transform .2s ease;
  }
  .pu-suggest-item:hover .pu-suggest-plus { transform: scale(1.2) rotate(90deg); }

  /* Cart */
  .pu-cart {
    margin-top: 16px;
    border: 1px solid var(--pu-border);
    border-radius: 14px;
    overflow: hidden;
    animation: puRise .4s cubic-bezier(.22,1,.36,1) both;
  }
  .pu-cart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
  }
  .pu-cart-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: -.01em;
  }
  .pu-cart-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    padding: 3px 9px;
    border-radius: 999px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    color: #fff;
    font-size: 11.5px;
    font-weight: 800;
    box-shadow: 0 8px 16px -8px rgba(59,130,246,.9);
  }
  .pu-cart-list {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    overflow-y: auto;
    background: #fff;
  }

  .pu-cart-item {
    position: relative;
    overflow: hidden;
    padding: 12px;
    border-radius: 11px;
    background: #fbfdff;
    border: 1px solid var(--pu-border);
    animation: puSlideIn .35s cubic-bezier(.22,1,.36,1) both;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .pu-cart-item::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #3b82f6, #8b5cf6);
  }
  .pu-cart-item:hover {
    border-color: #bfdbfe;
    box-shadow: 0 12px 22px -18px rgba(59,130,246,.7);
    transform: translateY(-1px);
  }
  .pu-cart-item-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .pu-cart-item-name {
    font-size: 13px;
    font-weight: 800;
    color: var(--pu-text);
    line-height: 1.3;
  }
  .pu-cart-item-del {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid var(--pu-border);
    color: var(--pu-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: all .2s ease;
  }
  .pu-cart-item-del:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    transform: scale(1.06);
  }
  .pu-cart-item-unit {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #dbeafe, #eff6ff);
    color: #1d4ed8;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .pu-cart-item-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(75px, 1fr));
    gap: 8px;
  }
  .pu-field { display: flex; flex-direction: column; gap: 3px; }
  .pu-field label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--pu-soft);
  }
  .pu-field input {
    height: 34px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid var(--pu-border);
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--pu-text);
    transition: border-color .18s ease, box-shadow .18s ease;
    width: 100%;
    min-width: 0;
  }
  .pu-field input:focus {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59,130,246,.14);
    outline: none;
  }
  .pu-cart-item-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px dashed var(--pu-border);
    font-size: 12px;
    color: var(--pu-muted);
    font-weight: 700;
  }
  .pu-cart-item-total span:last-child {
    font-size: 14px;
    font-weight: 800;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-variant-numeric: tabular-nums;
  }

  .pu-cart-empty {
    margin-top: 16px;
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    border: 1.5px dashed var(--pu-border);
    border-radius: 14px;
    color: var(--pu-soft);
  }
  .pu-cart-empty-ic {
    width: 60px; height: 60px;
    border-radius: 20px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #dbeafe, #e0e7ff);
    color: #3b82f6;
    margin-bottom: 4px;
    animation: puFloat 3s ease-in-out infinite;
  }
  .pu-cart-empty p { margin: 0; font-size: 13px; font-weight: 700; color: var(--pu-muted); }
  .pu-cart-empty span { font-size: 12px; }

  /* Summary */
  .pu-summary {
    margin-top: 18px;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    border: 1px solid var(--pu-border);
  }
  .pu-sum-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 6px;
    color: var(--pu-muted);
    font-weight: 600;
  }
  .pu-sum-row span:last-child { color: var(--pu-text); font-weight: 800; font-variant-numeric: tabular-nums; }
  .pu-sum-row.disc span:last-child { color: #059669; }

  .pu-grand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .pu-grand::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.14) 50%, transparent 60%);
    background-size: 200% 100%;
    animation: puShimmer 3.4s ease-in-out infinite;
    pointer-events: none;
  }
  .pu-grand-l {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #cbd5e1;
  }
  .pu-grand-v {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -.02em;
    background: linear-gradient(135deg, #93c5fd, #c4b5fd);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-variant-numeric: tabular-nums;
  }

  .pu-due {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-top: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    font-weight: 800;
  }
  .pu-due.due {
    background: linear-gradient(135deg, #fff1f2, #ffe4e6);
    border: 1px solid #fecdd3;
    color: #be123c;
  }
  .pu-due.clear {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border: 1px solid #a7f3d0;
    color: #047857;
  }
  .pu-due span:last-child { font-variant-numeric: tabular-nums; font-weight: 800; }

  @media (prefers-reduced-motion: reduce) {
    .pu-root *, .pu-root *::before, .pu-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`

const puvStyles = `
  .puv-root { display: grid; gap: 18px; animation: puvFade .38s ease both; }
  @keyframes puvFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes puvRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes puvRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes puvShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }

  .puv-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(59,130,246,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(139,92,246,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #f5f8ff);
    border: 1px solid #dbeafe;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .puv-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
  }
  .puv-header h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #2563eb 55%, #7c3aed 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .puv-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: #64748b;
    font-weight: 500;
  }
  .puv-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

  .puv-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    border: none;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
  }
  .puv-btn.primary {
    background: linear-gradient(115deg, #3b82f6, #8b5cf6);
    color: #fff;
    box-shadow: 0 14px 28px -14px rgba(59,130,246,.85);
  }
  .puv-btn.secondary {
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    color: #334155;
    border: 1px solid #e6ebf2;
    box-shadow: 0 8px 18px -14px rgba(15,23,42,.4);
  }
  .puv-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.3) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .puv-btn:hover { transform: translateY(-2px); }
  .puv-btn.primary:hover { box-shadow: 0 20px 34px -14px rgba(59,130,246,.95); }
  .puv-btn.secondary:hover { box-shadow: 0 14px 24px -14px rgba(15,23,42,.5); }
  .puv-btn:hover::after { animation: puvShine .9s ease; }
  .puv-btn:active { transform: scale(.96); }

  .puv-invoice {
    background: #fff;
    border: 1px solid #e6ebf2;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: puvRise .5s cubic-bezier(.22,1,.36,1) .06s both;
  }

  .puv-invoice-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    align-items: flex-start;
    padding: 24px 26px;
    background: linear-gradient(135deg, #f5f8ff, #eff6ff);
    border-bottom: 1px solid #dbeafe;
    position: relative;
  }
  @media (max-width: 640px) {
    .puv-invoice-head { grid-template-columns: 1fr; padding: 20px; }
    .puv-inv-supplier { text-align: left !important; }
  }
  .puv-invoice-head::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
  }
  .puv-inv-business { min-width: 0; }
  .puv-inv-title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: .06em;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    text-transform: uppercase;
  }
  .puv-inv-num {
    margin-top: 6px;
    font-size: 17px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .puv-inv-date {
    margin-top: 3px;
    font-size: 13px;
    color: #64748b;
    font-weight: 600;
  }
  .puv-inv-supplier { text-align: right; }
  .puv-inv-sup-name {
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -.01em;
  }
  .puv-inv-sup-line {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: #64748b;
    font-weight: 600;
    margin-top: 4px;
  }
  .puv-inv-sup-line svg { color: #3b82f6; }

  .puv-table-wrap { overflow-x: auto; }
  .puv-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .puv-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #94a3b8;
    padding: 12px 18px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid #e6ebf2;
    white-space: nowrap;
  }
  .puv-table thead th.right { text-align: right; }
  .puv-table tbody td {
    padding: 13px 18px;
    border-bottom: 1px solid #f1f5f9;
    color: #0f172a;
    vertical-align: middle;
  }
  .puv-table tbody tr:last-child td { border-bottom: none; }
  .puv-table tbody tr {
    animation: puvRowIn .4s ease both;
    transition: background .16s ease;
  }
  .puv-table tbody tr:hover { background: linear-gradient(90deg, #f5f8ff, #ffffff); }
  .puv-table .right { text-align: right; }
  .puv-item-name { font-weight: 700; }
  .puv-mono { font-variant-numeric: tabular-nums; font-weight: 700; color: #334155; }
  .puv-amount {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
  }
  .puv-unit-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #dbeafe, #eff6ff);
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .puv-totals {
    padding: 20px 26px 24px;
    background: linear-gradient(180deg, #ffffff, #fbfdff);
    border-top: 1px solid #e6ebf2;
  }
  @media (max-width: 640px) {
    .puv-totals { padding: 16px 20px 20px; }
  }
  .puv-tot-row {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
    margin-bottom: 6px;
    color: #64748b;
    font-weight: 600;
  }
  .puv-tot-row span:last-child {
    color: #0f172a;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .puv-tot-row.disc span:last-child { color: #059669; }
  .puv-pos { color: #047857 !important; }

  .puv-grand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .puv-grand span:first-child {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #cbd5e1;
  }
  .puv-grand span:last-child {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -.02em;
    background: linear-gradient(135deg, #93c5fd, #c4b5fd);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-variant-numeric: tabular-nums;
  }

  .puv-due-row {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    font-weight: 800;
    font-size: 13.5px;
  }
  .puv-due-row span:last-child { font-variant-numeric: tabular-nums; }
  .puv-due-row.due {
    background: linear-gradient(135deg, #fff1f2, #ffe4e6);
    border: 1px solid #fecdd3;
    color: #be123c;
  }
  .puv-due-row.clear {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border: 1px solid #a7f3d0;
    color: #047857;
  }

  @media (prefers-reduced-motion: reduce) {
    .puv-root *, .puv-root *::before, .puv-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
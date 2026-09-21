import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatNumber, nextInvoiceNumber, getDefaultUnitForCategory } from '../lib/utils'
import { recordStockMovement, sellSlabFull, sellSlabPartial, updateCustomerTotals } from '../lib/stockOps'
import type { Product, Customer, Slab, SaleItem } from '../lib/types'
import { Search, ShoppingCart, Plus, Trash2, X, UserPlus, Printer, FileText, MessageCircle } from 'lucide-react'

interface CartItem {
  product_id: string
  product: Product
  description: string
  unit: string
  quantity: number
  sqft: number
  rate: number
  gst_rate: number
  amount: number
  cost_amount: number
  slab_id?: string | null
  slab_number?: string
  is_full_slab?: boolean
}

export function POS() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [slabs, setSlabs] = useState<Slab[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showSlabModal, setShowSlabModal] = useState<Product | null>(null)
  const [charges, setCharges] = useState({ cutting: '', polishing: '', loading: '', delivery: '', other: '', discount: '' })
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [salesperson, setSalesperson] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showInvoice, setShowInvoice] = useState<string | null>(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', customer_type: 'retail' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [prodRes, custRes, slabRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('slabs').select('*, product:products(*), location:locations(*)').in('status', ['available', 'partially_sold']).order('slab_number'),
    ])
    setProducts((prodRes.data ?? []) as Product[])
    setCustomers((custRes.data ?? []) as Customer[])
    setSlabs((slabRes.data ?? []) as Slab[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 20)
    const q = search.toLowerCase()
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    ).slice(0, 30)
  }, [products, search])

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10)
    const q = customerSearch.toLowerCase()
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.mobile ?? '').includes(q)).slice(0, 10)
  }, [customers, customerSearch])

  const subtotal = useMemo(() => cart.reduce((s, item) => s + item.amount, 0), [cart])
  const totalCharges = useMemo(() => {
    return Number(charges.cutting || 0) + Number(charges.polishing || 0) + Number(charges.loading || 0) + Number(charges.delivery || 0) + Number(charges.other || 0)
  }, [charges])
  const discount = Number(charges.discount || 0)
  const afterDiscount = subtotal + totalCharges - discount
  const gstAmount = useMemo(() => {
    return cart.reduce((s, item) => {
      const itemShare = subtotal > 0 ? (item.amount / subtotal) : 0
      const itemCharges = totalCharges * itemShare
      const itemDiscount = discount * itemShare
      const taxable = item.amount + itemCharges - itemDiscount
      return s + (taxable * Number(item.gst_rate) / 100)
    }, 0)
  }, [cart, subtotal, totalCharges, discount])
  const grandTotal = afterDiscount + gstAmount
  const paid = Number(paidAmount || 0)
  const due = grandTotal - paid

  const addToCart = (product: Product) => {
    const invType = product.category?.inventory_type ?? 'piece'
    if (invType === 'slab') {
      setShowSlabModal(product)
      return
    }
    const rate = product.retail_price
    const unit = product.selling_unit ?? getDefaultUnitForCategory(product.category?.name)
    const existing = cart.find((c) => c.product_id === product.id && !c.slab_id)
    if (existing) {
      setCart(cart.map((c) => c === existing ? { ...c, quantity: c.quantity + 1, amount: (c.quantity + 1) * c.rate } : c))
    } else {
      setCart([...cart, {
        product_id: product.id,
        product,
        description: product.name,
        unit,
        quantity: 1,
        sqft: invType === 'box' || invType === 'mixed' ? 1 : 0,
        rate,
        gst_rate: product.gst_rate,
        amount: rate,
        cost_amount: Number(product.cost_price),
      }])
    }
  }

  const addSlabToCart = (slab: Slab, sellSqft: number, isFull: boolean) => {
    const product = slab.product as Product
    const sqft = isFull ? slab.total_sqft : sellSqft
    const amount = sqft * Number(slab.selling_rate)
    setCart([...cart, {
      product_id: product.id,
      product,
      description: `${product.name} - Slab ${slab.slab_number}`,
      unit: 'Sq.Ft',
      quantity: isFull ? 1 : 0,
      sqft,
      rate: Number(slab.selling_rate),
      gst_rate: product.gst_rate,
      amount,
      cost_amount: Number(slab.purchase_rate) * (sqft / slab.total_sqft),
      slab_id: slab.id,
      slab_number: slab.slab_number,
      is_full_slab: isFull,
    }])
    setShowSlabModal(null)
  }

  const updateCartItem = (index: number, updates: Partial<CartItem>) => {
    setCart(cart.map((c, i) => {
      if (i !== index) return c
      const updated = { ...c, ...updates }
      if (updated.unit === 'Sq.Ft' || updated.slab_id) {
        updated.amount = updated.sqft * updated.rate
      } else {
        updated.amount = updated.quantity * updated.rate
      }
      return updated
    }))
  }

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const handleCreateCustomer = async () => {
    if (!newCustomer.name) return
    const { data, error } = await supabase.from('customers').insert({
      name: newCustomer.name,
      mobile: newCustomer.mobile || null,
      address: newCustomer.address || null,
      customer_type: newCustomer.customer_type,
    }).select('*').maybeSingle()
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    if (data) {
      setCustomers([...customers, data as Customer])
      setCustomer(data as Customer)
      setNewCustomer({ name: '', mobile: '', address: '', customer_type: 'retail' })
      setShowCustomerModal(false)
      toast('Customer created')
    }
  }

  const handleCheckout = async () => {
    if (cart.length === 0) { toast('Cart is empty', 'error'); return }
    setSaving(true)
    try {
      const invoiceNumber = await nextInvoiceNumber('INV')
      const paymentStatus = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'

      const { data: sale, error: saleError } = await supabase.from('sales').insert({
        invoice_number: invoiceNumber,
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? 'Walk-in Customer',
        customer_mobile: customer?.mobile ?? null,
        sale_date: new Date().toISOString().split('T')[0],
        subtotal,
        cutting_charge: Number(charges.cutting || 0),
        polishing_charge: Number(charges.polishing || 0),
        loading_charge: Number(charges.loading || 0),
        delivery_charge: Number(charges.delivery || 0),
        other_charge: Number(charges.other || 0),
        discount,
        gst_amount: gstAmount,
        grand_total: grandTotal,
        paid_amount: paid,
        due_amount: due,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        salesperson: salesperson || null,
        notes: notes || null,
      }).select('id').maybeSingle()

      if (saleError || !sale) { toast(`Error: ${saleError?.message}`, 'error'); setSaving(false); return }

      // Insert sale items
      for (const item of cart) {
        const costAmount = item.cost_amount
        const grossProfit = item.amount - costAmount
        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          product_id: item.product_id,
          category_id: item.product.category_id,
          slab_id: item.slab_id ?? null,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          slab_count: item.is_full_slab ? 1 : 0,
          sqft: item.sqft,
          rate: item.rate,
          gst_rate: item.gst_rate,
          amount: item.amount,
          cost_amount: costAmount,
          gross_profit: grossProfit,
        })

        // Update stock
        const invType = item.product.category?.inventory_type ?? 'piece'
        if (item.slab_id) {
          const slab = slabs.find((s) => s.id === item.slab_id)
          if (slab) {
            if (item.is_full_slab) {
              await sellSlabFull(slab, sale.id, invoiceNumber)
            } else {
              await sellSlabPartial(slab, item.sqft, sale.id, invoiceNumber)
            }
          }
        } else {
          const stockOutCount = invType === 'piece' || invType === 'box' ? item.quantity : 0
          const stockOutSqft = invType === 'box' || invType === 'mixed' || invType === 'slab' ? (item.sqft || 0) : 0
          await recordStockMovement({
            product_id: item.product_id,
            category_id: item.product.category_id,
            transaction_type: 'sale',
            reference_number: invoiceNumber,
            reference_id: sale.id,
            stock_out_count: stockOutCount,
            stock_out_sqft: stockOutSqft,
            unit: item.unit,
            cost_price: item.product.cost_price,
            selling_price: item.rate,
            remarks: `Sale: ${item.description}`,
          })
        }
      }

      // Record payment if paid
      if (paid > 0) {
        await supabase.from('payments').insert({
          customer_id: customer?.id ?? null,
          sale_id: sale.id,
          amount: paid,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString().split('T')[0],
        })
      }

      // Update customer totals
      if (customer) {
        await updateCustomerTotals(customer.id, grandTotal, paid)
      }

      toast('Sale completed successfully')
      setShowInvoice(sale.id)
      // Reset
      setCart([])
      setCustomer(null)
      setCharges({ cutting: '', polishing: '', loading: '', delivery: '', other: '', discount: '' })
      setPaidAmount('')
      setNotes('')
      setSalesperson('')
      fetchData()
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, 'error')
    }
    setSaving(false)
  }

  if (loading) return <Loading label="Loading POS..." />

  if (showInvoice) {
    return <InvoiceView saleId={showInvoice} onClose={() => setShowInvoice(null)} />
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16, minHeight: 'calc(100vh - 120px)' }}>
      {/* Product selection */}
      <div className="flex flex-col gap-3">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <h2>POS / Billing</h2>
            <div className="page-sub">Search and add products to create a sale</div>
          </div>
        </div>

        <div className="search-input" style={{ width: '100%' }}>
          <Search />
          <input className="form-input" style={{ width: '100%' }} placeholder="Search by product name, SKU, or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, flex: 1, overflow: 'auto' }}>
          {filteredProducts.map((p) => {
            const invType = p.category?.inventory_type ?? 'piece'
            const stock = invType === 'slab'
              ? p.stock_sqft
              : invType === 'mixed'
                ? Math.max(Number(p.stock_count), Number(p.stock_sqft))
                : p.stock_count
            const outOfStock = stock <= 0
            const stockLabel = invType === 'slab'
              ? `${formatNumber(p.stock_count)} slabs / ${formatNumber(p.stock_sqft)} Sq.Ft`
              : invType === 'box'
                ? `${formatNumber(p.stock_count)} boxes / ${formatNumber(p.stock_sqft)} Sq.Ft`
                : invType === 'mixed'
                  ? `${formatNumber(p.stock_count)} pcs / ${formatNumber(p.stock_sqft)} Sq.Ft`
                  : `${formatNumber(p.stock_count)} pcs`
            return (
              <button
                key={p.id}
                className="card"
                style={{ padding: 12, textAlign: 'left', cursor: outOfStock ? 'not-allowed' : 'pointer', opacity: outOfStock ? 0.5 : 1, border: '1px solid var(--border)' }}
                onClick={() => !outOfStock && addToCart(p)}
                disabled={outOfStock}
              >
                <div className="font-semibold text-sm" style={{ marginBottom: 4, lineHeight: '130%' }}>{p.name}</div>
                <div className="text-muted text-sm">{p.category?.name}</div>
                <div className="flex justify-between items-end gap-2 mt-2">
                  <div>
                    <div className="text-sm text-muted">Selling price</div>
                    <span className="font-bold" style={{ color: 'var(--primary-600)' }}>{formatCurrency(p.retail_price)}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted">{outOfStock ? 'Stock status' : 'Available'}</div>
                    <span className={`badge ${outOfStock ? 'badge-danger' : 'badge-success'}`}>{outOfStock ? 'Out of stock' : stockLabel}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Cart panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2"><ShoppingCart size={18} /> Cart ({cart.length})</div>
          {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>Clear</button>}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Customer */}
          <div className="form-group">
            <label className="form-label">Customer</label>
            {customer ? (
              <div className="flex items-center justify-between" style={{ padding: '8px 12px', background: 'var(--n-50)', borderRadius: 6 }}>
                <div>
                  <div className="font-semibold text-sm">{customer.name}</div>
                  <div className="text-muted text-sm">{customer.mobile ?? ''}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setCustomer(null)}><X size={14} /></button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm w-full" onClick={() => setShowCustomerModal(true)}>
                <UserPlus size={14} /> Select Customer
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <ShoppingCart style={{ width: 36, height: 36 }} />
              <p>Cart is empty</p>
              <p className="text-sm">Search and click products to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm" style={{ flex: 1 }}>{item.description}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeFromCart(i)}><Trash2 size={14} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.unit === 'Sq.Ft' || item.slab_id ? (
                      <>
                        <input className="form-input" type="number" step="0.01" style={{ width: 80 }} placeholder="Sq.Ft" value={item.sqft || ''} onChange={(e) => updateCartItem(i, { sqft: Number(e.target.value) })} disabled={item.is_full_slab} />
                        <span className="text-sm text-muted">x</span>
                        <input className="form-input" type="number" step="0.01" style={{ width: 80 }} placeholder="Rate" value={item.rate} onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })} />
                      </>
                    ) : (
                      <>
                        <input className="form-input" type="number" step="0.01" style={{ width: 70 }} placeholder="Qty" value={item.quantity || ''} onChange={(e) => updateCartItem(i, { quantity: Number(e.target.value) })} />
                        <span className="text-sm text-muted">x</span>
                        <input className="form-input" type="number" step="0.01" style={{ width: 80 }} placeholder="Rate" value={item.rate} onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })} />
                        <span className="text-sm text-muted">{item.unit}</span>
                      </>
                    )}
                    <span className="font-bold text-sm flex-1 text-right" style={{ color: 'var(--primary-600)' }}>{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Charges */}
          {cart.length > 0 && (
            <>
              <h4 className="mb-2 mt-4" style={{ fontSize: 14 }}>Additional Charges</h4>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <input className="form-input" placeholder="Cutting" type="number" value={charges.cutting} onChange={(e) => setCharges({ ...charges, cutting: e.target.value })} />
                <input className="form-input" placeholder="Polishing" type="number" value={charges.polishing} onChange={(e) => setCharges({ ...charges, polishing: e.target.value })} />
                <input className="form-input" placeholder="Loading" type="number" value={charges.loading} onChange={(e) => setCharges({ ...charges, loading: e.target.value })} />
                <input className="form-input" placeholder="Delivery" type="number" value={charges.delivery} onChange={(e) => setCharges({ ...charges, delivery: e.target.value })} />
                <input className="form-input" placeholder="Other" type="number" value={charges.other} onChange={(e) => setCharges({ ...charges, other: e.target.value })} />
                <input className="form-input" placeholder="Discount" type="number" value={charges.discount} onChange={(e) => setCharges({ ...charges, discount: e.target.value })} />
              </div>

              <div className="form-group mt-4">
                <label className="form-label">Salesperson</label>
                <input className="form-input" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Totals & checkout */}
        {cart.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {totalCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Charges</span><span>{formatCurrency(totalCharges)}</span></div>}
            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Discount</span><span>-{formatCurrency(discount)}</span></div>}
            {gstAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>GST</span><span>{formatCurrency(gstAmount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 12 }}>
              <span>Grand Total</span><span style={{ color: 'var(--primary-600)' }}>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
              <div>
                <label className="form-label">Paid Amount</label>
                <input className="form-input" type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {due > 0 && <div className="text-sm text-muted mb-2">Due: <span style={{ color: 'var(--error-600)', fontWeight: 600 }}>{formatCurrency(due)}</span></div>}
            {due < 0 && <div className="text-sm text-muted mb-2">Change: <span style={{ color: 'var(--success-600)', fontWeight: 600 }}>{formatCurrency(-due)}</span></div>}

            <button className="btn btn-primary btn-lg w-full" onClick={handleCheckout} disabled={saving}>
              {saving ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        )}
      </div>

      {/* Customer modal */}
      {showCustomerModal && (
        <Modal open onClose={() => setShowCustomerModal(false)} title="Select Customer" size="md"
          footer={<><button className="btn btn-secondary" onClick={() => setShowCustomerModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateCustomer} disabled={!newCustomer.name}><Plus size={14} /> Create New</button></>}
        >
          <div className="search-input mb-4" style={{ width: '100%' }}>
            <Search />
            <input className="form-input" style={{ width: '100%' }} placeholder="Search customer by name or mobile..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 mb-4" style={{ maxHeight: 200, overflow: 'auto' }}>
            {filteredCustomers.map((c) => (
              <button key={c.id} className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }} onClick={() => { setCustomer(c); setShowCustomerModal(false) }}>
                <div className="text-left">
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-muted text-sm">{c.mobile ?? 'No mobile'}</div>
                </div>
              </button>
            ))}
          </div>
          <h4 className="mb-2">New Customer</h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name <span className="req">*</span></label>
              <input className="form-input" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile</label>
              <input className="form-input" value={newCustomer.mobile} onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Customer Type</label>
            <select className="form-select" value={newCustomer.customer_type} onChange={(e) => setNewCustomer({ ...newCustomer, customer_type: e.target.value })}>
              <option value="retail">Retail Customer</option>
              <option value="contractor">Contractor</option>
              <option value="builder">Builder</option>
              <option value="interior_designer">Interior Designer</option>
              <option value="dealer">Dealer</option>
              <option value="wholesale">Wholesale Customer</option>
            </select>
          </div>
        </Modal>
      )}

      {/* Slab selection modal */}
      {showSlabModal && (
        <SlabSelectModal product={showSlabModal} slabs={slabs.filter((s) => s.product_id === showSlabModal.id)} onClose={() => setShowSlabModal(null)} onSelect={addSlabToCart} />
      )}
    </div>
  )
}

function SlabSelectModal({ product, slabs, onClose, onSelect }: { product: Product; slabs: Slab[]; onClose: () => void; onSelect: (slab: Slab, sellSqft: number, isFull: boolean) => void }) {
  const [selectedSlab, setSelectedSlab] = useState<Slab | null>(null)
  const [sellSqft, setSellSqft] = useState('')

  return (
    <Modal open onClose={onClose} title={`Select Slab - ${product.name}`} size="lg"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {selectedSlab && <button className="btn btn-primary" onClick={() => {
          if (sellSqft && Number(sellSqft) > 0) onSelect(selectedSlab, Number(sellSqft), false)
        }}>Add Partial Sale</button>}
      </>}
    >
      {slabs.length === 0 ? (
        <EmptyState title="No available slabs" message="All slabs for this product are sold or damaged" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th><th>Slab #</th><th>Batch</th><th className="text-right">Total Sq.Ft</th><th className="text-right">Remaining</th><th className="text-right">Rate</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {slabs.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer', background: selectedSlab?.id === s.id ? 'var(--primary-50)' : '' }} onClick={() => setSelectedSlab(s)}>
                  <td><input type="radio" checked={selectedSlab?.id === s.id} readOnly /></td>
                  <td className="font-semibold">{s.slab_number}</td>
                  <td>{s.batch_number ?? '-'}</td>
                  <td className="text-right">{formatNumber(s.total_sqft)}</td>
                  <td className="text-right font-semibold">{formatNumber(s.remaining_sqft)}</td>
                  <td className="text-right">{formatCurrency(s.selling_rate)}</td>
                  <td><span className={`badge ${s.status === 'available' ? 'badge-success' : 'badge-warning'}`}>{s.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedSlab && (
        <div className="form-row mt-4">
          <div className="form-group">
            <label className="form-label">Sell Sq.Ft (partial)</label>
            <input className="form-input" type="number" step="0.01" value={sellSqft} onChange={(e) => setSellSqft(e.target.value)} placeholder={`Max: ${selectedSlab.remaining_sqft}`} />
          </div>
          <div className="form-group flex items-center" style={{ paddingTop: 24 }}>
            <button className="btn btn-primary" onClick={() => onSelect(selectedSlab, selectedSlab.total_sqft, true)}>Sell Full Slab</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function InvoiceView({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [sale, setSale] = useState<any>(null)
  const [items, setItems] = useState<SaleItem[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [saleRes, itemsRes, settingsRes] = await Promise.all([
        supabase.from('sales').select('*, customer:customers(*)').eq('id', saleId).maybeSingle(),
        supabase.from('sale_items').select('*, product:products(*)').eq('sale_id', saleId),
        supabase.from('settings').select('*').maybeSingle(),
      ])
      setSale(saleRes.data)
      setItems((itemsRes.data ?? []) as SaleItem[])
      setSettings(settingsRes.data)
      setLoading(false)
    })()
  }, [saleId])

  if (loading || !sale) return <Loading label="Loading invoice..." />

  const sendWhatsApp = () => {
    const mobile = String(sale.customer_mobile ?? '').replace(/\D/g, '')
    if (!mobile) {
      window.alert('Customer mobile number is required to send this bill on WhatsApp.')
      return
    }
    const phone = mobile.length === 10 ? `91${mobile}` : mobile
    const itemLines = items.map((item) => {
      const quantity = item.unit === 'Sq.Ft' ? `${formatNumber(item.sqft)} Sq.Ft` : `${formatNumber(item.quantity)} ${item.unit ?? 'Unit'}`
      return `- ${item.description}: ${quantity} x ${formatCurrency(item.rate)} = ${formatCurrency(item.amount)}`
    }).join('\n')
    const message = [
      `*${settings?.business_name ?? 'Vaishnav Marble Shop'}*`,
      `Invoice: ${sale.invoice_number}`,
      `Date: ${new Date(sale.sale_date).toLocaleDateString('en-IN')}`,
      `Customer: ${sale.customer_name ?? 'Customer'}`,
      '',
      '*Items*',
      itemLines,
      '',
      `*Grand Total: ${formatCurrency(sale.grand_total)}*`,
      `Paid: ${formatCurrency(sale.paid_amount)}`,
      `Due: ${formatCurrency(sale.due_amount)}`,
      '',
      'Thank you for shopping with us.',
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h2>Invoice {sale.invoice_number}</h2>
          <div className="page-sub">Sale completed successfully</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn btn-primary" onClick={sendWhatsApp}><MessageCircle size={16} /> WhatsApp</button>
          <button className="btn btn-primary" onClick={onClose}><FileText size={16} /> New Sale</button>
        </div>
      </div>

      <div className="invoice">
        <div className="invoice-header">
          <div>
            <div className="invoice-title">{settings?.business_name ?? 'Vaishnav Marble Shop'}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{settings?.address ?? ''}</div>
            <div style={{ fontSize: 13, color: '#666' }}>Phone: {settings?.phone ?? ''} {settings?.gst_number ? `| GST: ${settings.gst_number}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>INVOICE</div>
            <div style={{ fontSize: 14 }}>{sale.invoice_number}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{new Date(sale.sale_date).toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
          <strong>Bill To:</strong> {sale.customer_name ?? 'Walk-in Customer'}<br />
          {sale.customer_mobile && <span style={{ fontSize: 13, color: '#666' }}>Mobile: {sale.customer_mobile}</span>}
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th><th>Unit</th><th className="text-right">Qty/Sq.Ft</th><th className="text-right">Rate</th><th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td className="text-right">{item.unit === 'Sq.Ft' ? formatNumber(item.sqft) : formatNumber(item.quantity)}</td>
                <td className="text-right">{formatCurrency(item.rate)}</td>
                <td className="text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="total-row"><span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
          {Number(sale.cutting_charge) > 0 && <div className="total-row"><span>Cutting</span><span>{formatCurrency(sale.cutting_charge)}</span></div>}
          {Number(sale.polishing_charge) > 0 && <div className="total-row"><span>Polishing</span><span>{formatCurrency(sale.polishing_charge)}</span></div>}
          {Number(sale.loading_charge) > 0 && <div className="total-row"><span>Loading</span><span>{formatCurrency(sale.loading_charge)}</span></div>}
          {Number(sale.delivery_charge) > 0 && <div className="total-row"><span>Delivery</span><span>{formatCurrency(sale.delivery_charge)}</span></div>}
          {Number(sale.other_charge) > 0 && <div className="total-row"><span>Other</span><span>{formatCurrency(sale.other_charge)}</span></div>}
          {Number(sale.discount) > 0 && <div className="total-row"><span>Discount</span><span>-{formatCurrency(sale.discount)}</span></div>}
          {Number(sale.gst_amount) > 0 && <div className="total-row"><span>GST</span><span>{formatCurrency(sale.gst_amount)}</span></div>}
          <div className="total-row grand-total"><span>Grand Total</span><span>{formatCurrency(sale.grand_total)}</span></div>
          <div className="total-row"><span>Paid</span><span>{formatCurrency(sale.paid_amount)}</span></div>
          <div className="total-row" style={{ fontWeight: 600, color: Number(sale.due_amount) > 0 ? '#dc2626' : '#16a34a' }}><span>Due</span><span>{formatCurrency(sale.due_amount)}</span></div>
        </div>

        {settings?.terms_conditions && (
          <div style={{ marginTop: 30, fontSize: 12, color: '#666', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <strong>Terms & Conditions:</strong> {settings.terms_conditions}
          </div>
        )}
      </div>
    </div>
  )
}

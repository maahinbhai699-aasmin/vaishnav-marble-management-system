import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatNumber, nextInvoiceNumber, getDefaultUnitForCategory } from '../lib/utils'
import { businessProfile } from '../lib/business'
import { recordStockMovement, sellSlabFull, sellSlabPartial, updateCustomerTotals } from '../lib/stockOps'
import type { Product, Customer, Slab, SaleItem } from '../lib/types'
import {
  Search, ShoppingCart, Plus, Trash2, X, UserPlus, Printer, FileText, MessageCircle,
  User, Phone, MapPin, Check, PackageSearch, UserRound,
} from 'lucide-react'

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
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [showSlabModal, setShowSlabModal] = useState<Product | null>(null)
  const [charges, setCharges] = useState({ cutting: '', polishing: '', loading: '', delivery: '', other: '', discount: '' })
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [salesperson, setSalesperson] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showInvoice, setShowInvoice] = useState<string | null>(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', customer_type: 'retail' })
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

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
    if (!search) return products.slice(0, 60)
    const q = search.toLowerCase()
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    ).slice(0, 60)
  }, [products, search])

  const visibleProducts = useMemo(() => {
    if (categoryFilter === 'all') return filteredProducts
    return filteredProducts.filter((p) => (p.category?.id ?? 'uncategorized') === categoryFilter)
  }, [filteredProducts, categoryFilter])

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    products.forEach((p) => {
      const id = p.category?.id ?? 'uncategorized'
      const name = p.category?.name ?? 'Uncategorized'
      const existing = map.get(id)
      if (existing) existing.count++
      else map.set(id, { id, name, count: 1 })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 20)
    const q = customerSearch.toLowerCase()
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.mobile ?? '').includes(q)).slice(0, 20)
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
      setShowNewCustomerForm(false)
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

      if (paid > 0) {
        await supabase.from('payments').insert({
          customer_id: customer?.id ?? null,
          sale_id: sale.id,
          amount: paid,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString().split('T')[0],
        })
      }

      if (customer) {
        await updateCustomerTotals(customer.id, grandTotal, paid)
      }

      toast('Sale completed successfully')
      setShowInvoice(sale.id)
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 440px',
        gap: 18,
        alignItems: 'stretch',
        height: 'calc(100vh - 120px)',
        minHeight: 620,
      }}
    >
      {/* ═════════════ LEFT: PRODUCT SELECTION ═════════════ */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>POS / Billing</h2>
            <div className="text-muted text-sm" style={{ marginTop: 2 }}>
              Search or tap a product to add it to the cart
            </div>
          </div>
          <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: 12 }}>
            {visibleProducts.length} shown · {products.length} total
          </span>
        </div>

        {/* Search */}
        <div
          className="search-input"
          style={{
            width: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Search size={18} style={{ flexShrink: 0, opacity: 0.6 }} />
          <input
            className="form-input"
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
            placeholder="Search by product name, SKU, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSearch('')}
              style={{ padding: 4, flexShrink: 0 }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
            marginBottom: 2,
            scrollbarWidth: 'thin',
          }}
        >
          <button
            onClick={() => setCategoryFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: `1px solid ${categoryFilter === 'all' ? 'var(--primary-600)' : 'var(--border)'}`,
              background: categoryFilter === 'all' ? 'var(--primary-600)' : '#fff',
              color: categoryFilter === 'all' ? '#fff' : 'var(--n-700)',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            All · {products.length}
          </button>
          {categories.map((c) => {
            const active = categoryFilter === c.id
            return (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--primary-600)' : 'var(--border)'}`,
                  background: active ? 'var(--primary-600)' : '#fff',
                  color: active ? '#fff' : 'var(--n-700)',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {c.name} · {c.count}
              </button>
            )
          })}
        </div>

        {/* Products grid (scrollable) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 4,
            paddingBottom: 8,
          }}
        >
          {visibleProducts.length === 0 ? (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--n-400)' }}>
              <PackageSearch size={44} style={{ opacity: 0.5 }} />
              <p style={{ fontWeight: 600, margin: 0 }}>No products found</p>
              <p className="text-sm" style={{ margin: 0 }}>
                {search ? 'Try a different search term' : 'No products in this category yet'}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: 10,
              }}
            >
              {visibleProducts.map((p) => {
                const invType = p.category?.inventory_type ?? 'piece'
                const stock = invType === 'slab'
                  ? p.stock_sqft
                  : invType === 'mixed'
                    ? Math.max(Number(p.stock_count), Number(p.stock_sqft))
                    : p.stock_count
                const outOfStock = stock <= 0
                const stockLabel = invType === 'slab'
                  ? `${formatNumber(p.stock_count)} slabs · ${formatNumber(p.stock_sqft)} sqft`
                  : invType === 'box'
                    ? `${formatNumber(p.stock_count)} boxes · ${formatNumber(p.stock_sqft)} sqft`
                    : invType === 'mixed'
                      ? `${formatNumber(p.stock_count)} pcs · ${formatNumber(p.stock_sqft)} sqft`
                      : `${formatNumber(p.stock_count)} pcs`
                return (
                  <button
                    key={p.id}
                    className="card"
                    style={{
                      padding: 12,
                      textAlign: 'left',
                      cursor: outOfStock ? 'not-allowed' : 'pointer',
                      opacity: outOfStock ? 0.55 : 1,
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minHeight: 132,
                      transition: 'all 0.15s',
                      background: '#fff',
                    }}
                    onClick={() => !outOfStock && addToCart(p)}
                    disabled={outOfStock}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          padding: '2px 7px',
                          background: 'var(--n-100)',
                          color: 'var(--n-600)',
                          maxWidth: 110,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.category?.name ?? 'Uncategorized'}
                      </span>
                      <span
                        className={`badge ${outOfStock ? 'badge-danger' : 'badge-success'}`}
                        style={{ fontSize: 9, padding: '2px 7px', flexShrink: 0 }}
                      >
                        {outOfStock ? 'Out' : 'In'}
                      </span>
                    </div>

                    <div
                      className="font-semibold"
                      style={{
                        fontSize: 13,
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: 34,
                      }}
                    >
                      {p.name}
                    </div>

                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: 8,
                        borderTop: '1px dashed var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        gap: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--n-500)', lineHeight: 1.1 }}>Price</div>
                        <div className="font-bold" style={{ color: 'var(--primary-600)', fontSize: 15, lineHeight: 1.2 }}>
                          {formatCurrency(p.retail_price)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', maxWidth: 120 }}>
                        <div style={{ fontSize: 10, color: 'var(--n-500)', lineHeight: 1.1 }}>
                          {outOfStock ? 'Stock' : 'Available'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
                          {outOfStock ? 'Out of stock' : stockLabel}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═════════════ RIGHT: CART PANEL ═════════════ */}
      <aside
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%',
          borderRadius: 14,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
          background: '#fff',
        }}
      >
        {/* Cart header */}
        <div
          className="card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            padding: '14px 16px',
            flexShrink: 0,
          }}
        >
          <div className="card-title flex items-center gap-2" style={{ fontSize: 15, fontWeight: 700 }}>
            <ShoppingCart size={18} />
            Cart
            <span className="badge badge-success" style={{ marginLeft: 2, fontSize: 11, padding: '2px 8px' }}>
              {cart.length}
            </span>
          </div>
          {cart.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCart([])} style={{ fontSize: 12 }}>
              Clear
            </button>
          )}
        </div>

        {/* Cart body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* Customer selector */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--n-500)' }}>
              CUSTOMER
            </label>
            {customer ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--n-50)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--primary-600)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-semibold text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer.name}
                    </div>
                    <div className="text-muted text-sm" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={11} /> {customer.mobile ?? 'No mobile'}
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setCustomer(null)} style={{ padding: 6 }} title="Remove customer">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary btn-sm w-full"
                onClick={() => setShowCustomerModal(true)}
                style={{ justifyContent: 'center', borderStyle: 'dashed' }}
              >
                <UserPlus size={14} /> Select / Add Customer
              </button>
            )}
          </div>

          {/* Cart items */}
          {cart.length === 0 ? (
            <div
              style={{
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: 'var(--n-400)',
              }}
            >
              <ShoppingCart style={{ width: 40, height: 40, opacity: 0.5 }} />
              <p style={{ fontWeight: 600, margin: 0 }}>Cart is empty</p>
              <p className="text-sm" style={{ margin: 0 }}>Search and click products to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item, i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 10,
                    background: 'var(--n-50)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <span className="font-semibold text-sm" style={{ flex: 1, lineHeight: 1.3 }}>
                      {item.description}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeFromCart(i)} style={{ padding: 4, flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.unit === 'Sq.Ft' || item.slab_id ? (
                      <>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          style={{ width: 78, padding: '6px 8px', fontSize: 13 }}
                          placeholder="Sq.Ft"
                          value={item.sqft || ''}
                          onChange={(e) => updateCartItem(i, { sqft: Number(e.target.value) })}
                          disabled={item.is_full_slab}
                        />
                        <span className="text-sm text-muted">×</span>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          style={{ width: 78, padding: '6px 8px', fontSize: 13 }}
                          placeholder="Rate"
                          value={item.rate}
                          onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })}
                        />
                      </>
                    ) : (
                      <>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          style={{ width: 66, padding: '6px 8px', fontSize: 13 }}
                          placeholder="Qty"
                          value={item.quantity || ''}
                          onChange={(e) => updateCartItem(i, { quantity: Number(e.target.value) })}
                        />
                        <span className="text-sm text-muted">×</span>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          style={{ width: 78, padding: '6px 8px', fontSize: 13 }}
                          placeholder="Rate"
                          value={item.rate}
                          onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })}
                        />
                        <span className="text-sm text-muted" style={{ fontSize: 12 }}>{item.unit}</span>
                      </>
                    )}
                    <span className="font-bold text-sm" style={{ marginLeft: 'auto', color: 'var(--primary-600)', whiteSpace: 'nowrap' }}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Charges & notes */}
          {cart.length > 0 && (
            <>
              <h4
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--n-500)',
                  margin: '20px 0 8px',
                  textTransform: 'uppercase',
                }}
              >
                Additional Charges
              </h4>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="form-input" placeholder="Cutting" type="number" value={charges.cutting} onChange={(e) => setCharges({ ...charges, cutting: e.target.value })} />
                <input className="form-input" placeholder="Polishing" type="number" value={charges.polishing} onChange={(e) => setCharges({ ...charges, polishing: e.target.value })} />
                <input className="form-input" placeholder="Loading" type="number" value={charges.loading} onChange={(e) => setCharges({ ...charges, loading: e.target.value })} />
                <input className="form-input" placeholder="Delivery" type="number" value={charges.delivery} onChange={(e) => setCharges({ ...charges, delivery: e.target.value })} />
                <input className="form-input" placeholder="Other" type="number" value={charges.other} onChange={(e) => setCharges({ ...charges, other: e.target.value })} />
                <input className="form-input" placeholder="Discount" type="number" value={charges.discount} onChange={(e) => setCharges({ ...charges, discount: e.target.value })} />
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Salesperson</label>
                <input className="form-input" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Notes</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Totals & checkout */}
        {cart.length > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: 16,
              background: 'var(--n-50)',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-muted">Subtotal</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
            </div>
            {totalCharges > 0 && (
              <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Charges</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(totalCharges)}</span>
              </div>
            )}
            {discount > 0 && (
              <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Discount</span>
                <span style={{ fontWeight: 600, color: 'var(--success-600)' }}>-{formatCurrency(discount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">GST</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(gstAmount)}</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 18,
                fontWeight: 700,
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                marginTop: 8,
                marginBottom: 14,
              }}
            >
              <span>Grand Total</span>
              <span style={{ color: 'var(--primary-600)' }}>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 8, gap: 8 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Paid Amount</label>
                <input
                  className="form-input"
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Payment Method</label>
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

            {due > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 10,
                  padding: '8px 10px',
                  background: '#fef2f2',
                  borderRadius: 8,
                }}
              >
                <span className="text-muted">Due</span>
                <span style={{ color: 'var(--error-600)', fontWeight: 700 }}>{formatCurrency(due)}</span>
              </div>
            )}
            {due < 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 10,
                  padding: '8px 10px',
                  background: '#f0fdf4',
                  borderRadius: 8,
                }}
              >
                <span className="text-muted">Change</span>
                <span style={{ color: 'var(--success-600)', fontWeight: 700 }}>{formatCurrency(-due)}</span>
              </div>
            )}

            <button
              className="btn btn-primary btn-lg w-full"
              onClick={handleCheckout}
              disabled={saving}
              style={{ fontWeight: 700, letterSpacing: '0.01em' }}
            >
              {saving ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        )}
      </aside>

      {/* ═════════════ CUSTOMER MODAL ═════════════ */}
      {showCustomerModal && (
        <Modal
          open
          onClose={() => { setShowCustomerModal(false); setShowNewCustomerForm(false) }}
          title="Select Customer"
          size="md"
          footer={
            showNewCustomerForm ? (
              <>
                <button className="btn btn-secondary" onClick={() => setShowNewCustomerForm(false)}>Back</button>
                <button className="btn btn-primary" onClick={handleCreateCustomer} disabled={!newCustomer.name}>
                  <Check size={14} /> Save Customer
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => { setShowCustomerModal(false); setShowNewCustomerForm(false) }}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => setShowNewCustomerForm(true)}>
                  <Plus size={14} /> New Customer
                </button>
              </>
            )
          }
        >
          {showNewCustomerForm ? (
            <>
              <h4
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--n-500)',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                New Customer Details
              </h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Name <span className="req">*</span></label>
                  <input className="form-input" autoFocus value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
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
            </>
          ) : (
            <>
              <div
                className="search-input mb-3"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Search size={16} style={{ opacity: 0.6 }} />
                <input
                  className="form-input"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
                  placeholder="Search customer by name or mobile..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  autoFocus
                />
                {customerSearch && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setCustomerSearch('')} style={{ padding: 4 }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Walk-in option */}
              <button
                onClick={() => { setCustomer(null); setShowCustomerModal(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderRadius: 10,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'var(--n-100)',
                    color: 'var(--n-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserRound size={16} />
                </div>
                <div>
                  <div className="font-semibold text-sm">Walk-in Customer</div>
                  <div className="text-muted text-sm" style={{ fontSize: 12 }}>Continue without saving customer</div>
                </div>
              </button>

              <div className="flex flex-col gap-2" style={{ maxHeight: 300, overflow: 'auto' }}>
                {filteredCustomers.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--n-400)' }}>
                    <User size={28} style={{ opacity: 0.5, marginBottom: 6 }} />
                    <div className="text-sm">No customers found</div>
                  </div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCustomer(c); setShowCustomerModal(false) }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--primary-600)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-semibold text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </div>
                        <div className="text-muted text-sm" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={11} /> {c.mobile ?? 'No mobile'}
                          </span>
                          {c.address && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                              <MapPin size={11} /> {c.address}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.customer_type && (
                        <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'var(--n-100)', color: 'var(--n-600)', flexShrink: 0 }}>
                          {c.customer_type}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ═════════════ SLAB MODAL ═════════════ */}
      {showSlabModal && (
        <SlabSelectModal
          product={showSlabModal}
          slabs={slabs.filter((s) => s.product_id === showSlabModal.id)}
          onClose={() => setShowSlabModal(null)}
          onSelect={addSlabToCart}
        />
      )}
    </div>
  )
}

function SlabSelectModal({ product, slabs, onClose, onSelect }: { product: Product; slabs: Slab[]; onClose: () => void; onSelect: (slab: Slab, sellSqft: number, isFull: boolean) => void }) {
  const [selectedSlab, setSelectedSlab] = useState<Slab | null>(null)
  const [sellSqft, setSellSqft] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Select Slab - ${product.name}`}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {selectedSlab && (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (sellSqft && Number(sellSqft) > 0) onSelect(selectedSlab, Number(sellSqft), false)
              }}
            >
              Add Partial Sale
            </button>
          )}
        </>
      }
    >
      {slabs.length === 0 ? (
        <EmptyState title="No available slabs" message="All slabs for this product are sold or damaged" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Slab #</th>
                <th>Batch</th>
                <th className="text-right">Total Sq.Ft</th>
                <th className="text-right">Remaining</th>
                <th className="text-right">Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {slabs.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    cursor: 'pointer',
                    background: selectedSlab?.id === s.id ? 'var(--primary-50)' : '',
                  }}
                  onClick={() => setSelectedSlab(s)}
                >
                  <td><input type="radio" checked={selectedSlab?.id === s.id} readOnly /></td>
                  <td className="font-semibold">{s.slab_number}</td>
                  <td>{s.batch_number ?? '-'}</td>
                  <td className="text-right">{formatNumber(s.total_sqft)}</td>
                  <td className="text-right font-semibold">{formatNumber(s.remaining_sqft)}</td>
                  <td className="text-right">{formatCurrency(s.selling_rate)}</td>
                  <td>
                    <span className={`badge ${s.status === 'available' ? 'badge-success' : 'badge-warning'}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSlab && (
        <div
          className="form-row mt-4"
          style={{
            padding: 14,
            background: 'var(--n-50)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            marginTop: 16,
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Sell Sq.Ft (partial)</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={sellSqft}
              onChange={(e) => setSellSqft(e.target.value)}
              placeholder={`Max: ${selectedSlab.remaining_sqft}`}
            />
          </div>
          <div className="form-group flex items-center" style={{ paddingTop: 24, margin: 0 }}>
            <button className="btn btn-primary" onClick={() => onSelect(selectedSlab, selectedSlab.total_sqft, true)}>
              Sell Full Slab
            </button>
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
          <div className="invoice-business">
            <img className="invoice-logo" src={settings?.logo_url || businessProfile.logoUrl} alt="Vaishnavi Marble" />
            <div>
              <div className="invoice-title">{settings?.business_name ?? businessProfile.defaultName}</div>
              {businessProfile.addresses.map((address) => <div key={address} className="invoice-contact">{address}</div>)}
              <div className="invoice-contact">Phone: {businessProfile.phone}</div>
              <div className="invoice-contact">Email: {settings?.email || businessProfile.email}</div>
              {settings?.gst_number && <div className="invoice-contact">GST: {settings.gst_number}</div>}
            </div>
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
              <th>Description</th>
              <th>Unit</th>
              <th className="text-right">Qty/Sq.Ft</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
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
          <div className="total-row" style={{ fontWeight: 600, color: Number(sale.due_amount) > 0 ? '#dc2626' : '#16a34a' }}>
            <span>Due</span><span>{formatCurrency(sale.due_amount)}</span>
          </div>
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
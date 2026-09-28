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
  const [cartFlash, setCartFlash] = useState(false)

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
  const grandTotal = afterDiscount
  const paid = Number(paidAmount || 0)
  const due = grandTotal - paid
  // unique product count in cart
  const uniqueProductCount = useMemo(() => new Set(cart.map((c) => c.slab_id ?? c.product_id)).size, [cart])

  const pulseCart = () => {
    setCartFlash(true)
    window.setTimeout(() => setCartFlash(false), 500)
  }

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
    pulseCart()
  }

  const addSlabToCart = (slab: Slab, sellSqft: number, isFull: boolean) => {
    const product = slab.product as Product
    const sqft = isFull ? Number(slab.remaining_sqft) : sellSqft
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
    pulseCart()
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
        gst_amount: 0,
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
    <div className="pos-root">
      <style>{`
        .pos-root {
          --pr-card: #ffffff;
          --pr-border: #e6ebf2;
          --pr-text: #0f172a;
          --pr-muted: #64748b;
          --pr-soft: #94a3b8;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 460px;
          gap: 18px;
          align-items: stretch;
          height: calc(100vh - 120px);
          min-height: 640px;
        }
        @media (max-width: 980px) {
          .pos-root { grid-template-columns: 1fr; height: auto; min-height: 0; }
          .pos-root > .pos-cart { position: static !important; max-height: none !important; }
        }

        @keyframes posFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes posRise { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes posPop  { 0% { transform: scale(1); } 45% { transform: scale(1.09); } 100% { transform: scale(1); } }
        @keyframes posSlideIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes posShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
        @keyframes posRing  {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,.55); }
          100% { box-shadow: 0 0 0 14px rgba(99,102,241,0); }
        }
        @keyframes posFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes posShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .pos-root { animation: posFade .35s ease both; }

        /* ══════════ LEFT PANEL ══════════ */
        .pos-left {
          display: flex;
          flex-direction: column;
          gap: 13px;
          min-width: 0;
          height: 100%;
          overflow: hidden;
        }

        .pos-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .pos-head h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #4f46e5 55%, #06b6d4 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pos-head-sub {
          margin-top: 5px;
          font-size: 13.5px;
          color: var(--pr-muted);
        }
        .pos-count-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 999px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          color: #4338ca;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .02em;
          box-shadow: 0 6px 14px -8px rgba(79,70,229,.6);
        }
        .pos-count-pill::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,.2);
        }

        /* Search */
        .pos-search {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          height: 46px;
          background: linear-gradient(135deg, #ffffff, #f8fafc);
          border: 1.5px solid var(--pr-border);
          border-radius: 14px;
          box-shadow: 0 8px 24px -18px rgba(15,23,42,.3);
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .pos-search:focus-within {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 4px rgba(99,102,241,.14), 0 12px 28px -18px rgba(99,102,241,.6);
          transform: translateY(-1px);
        }
        .pos-search svg { color: #4f46e5; flex-shrink: 0; }
        .pos-search input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          color: var(--pr-text);
          height: 100%;
        }
        .pos-search input::placeholder { color: #94a3b8; font-weight: 500; }
        .pos-clear-btn {
          width: 26px; height: 26px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: #f1f5f9;
          border: none;
          color: var(--pr-muted);
          cursor: pointer;
          transition: all .18s ease;
        }
        .pos-clear-btn:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

        /* Category chips */
        .pos-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: thin;
        }
        .pos-chips::-webkit-scrollbar { height: 6px; }
        .pos-chips::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
        .pos-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 999px;
          border: 1.5px solid var(--pr-border);
          background: #ffffff;
          color: var(--pr-muted);
          font-size: 12.5px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          transition: all .2s cubic-bezier(.22,1,.36,1);
          flex-shrink: 0;
        }
        .pos-chip:hover { border-color: #c7d2fe; color: #4338ca; transform: translateY(-1px); }
        .pos-chip.active {
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 10px 20px -12px rgba(79,70,229,.9);
        }
        .pos-chip .cnt {
          display: inline-flex;
          align-items: center;
          padding: 1px 7px;
          border-radius: 999px;
          background: rgba(255,255,255,.2);
          font-size: 10.5px;
        }
        .pos-chip:not(.active) .cnt { background: #f1f5f9; color: var(--pr-muted); }

        /* Products grid (scroll) */
        .pos-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 2px 6px 8px 2px;
          scrollbar-width: thin;
        }
        .pos-scroll::-webkit-scrollbar { width: 8px; }
        .pos-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
        .pos-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

        .pos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .pos-card {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          padding: 13px 13px 12px;
          text-align: left;
          cursor: pointer;
          border: 1px solid var(--pr-border);
          border-radius: 15px;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 9px;
          min-height: 148px;
          animation: posRise .45s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .pos-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--cc1), var(--cc2));
          opacity: .85;
        }
        .pos-card::after {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 120px; height: 120px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--cc1) 0%, transparent 68%);
          opacity: .10;
          z-index: -1;
          transition: opacity .34s ease, transform .45s ease;
        }
        .pos-card:hover:not(:disabled) {
          transform: translateY(-5px);
          border-color: transparent;
          box-shadow: 0 22px 34px -22px var(--ccs), 0 4px 10px -4px rgba(15,23,42,.06);
        }
        .pos-card:hover:not(:disabled)::after { opacity: .22; transform: scale(1.15); }
        .pos-card:active:not(:disabled) { transform: scale(.97); }
        .pos-card:disabled { opacity: .55; cursor: not-allowed; }

        .pos-card:nth-child(6n+1) { --cc1:#6366f1; --cc2:#818cf8; --ccs: rgba(99,102,241,.55); }
        .pos-card:nth-child(6n+2) { --cc1:#06b6d4; --cc2:#22d3ee; --ccs: rgba(6,182,212,.55); }
        .pos-card:nth-child(6n+3) { --cc1:#10b981; --cc2:#34d399; --ccs: rgba(16,185,129,.55); }
        .pos-card:nth-child(6n+4) { --cc1:#f59e0b; --cc2:#fbbf24; --ccs: rgba(245,158,11,.55); }
        .pos-card:nth-child(6n+5) { --cc1:#f43f5e; --cc2:#fb7185; --ccs: rgba(244,63,94,.55); }
        .pos-card:nth-child(6n+6) { --cc1:#8b5cf6; --cc2:#c084fc; --ccs: rgba(139,92,246,.55); }

        .pos-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }
        .pos-card-cat {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .05em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--cc1), var(--cc2));
          color: #fff;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          box-shadow: 0 6px 14px -8px var(--ccs);
        }
        .pos-card-stock {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: .05em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 999px;
        }
        .pos-card-stock.in  { background: #ecfdf5; color: #047857; }
        .pos-card-stock.out { background: #fff1f2; color: #be123c; }

        .pos-card-name {
          font-size: 13.5px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--pr-text);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 35px;
        }

        .pos-card-foot {
          margin-top: auto;
          padding-top: 9px;
          border-top: 1px dashed #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 6px;
        }
        .pos-card-price-l {
          font-size: 10px;
          color: var(--pr-soft);
          line-height: 1;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .pos-card-price {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -.02em;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--cc1), var(--cc2));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1.15;
        }
        .pos-card-stock-l {
          font-size: 10px;
          color: var(--pr-soft);
          line-height: 1;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          text-align: right;
        }
        .pos-card-stock-v {
          font-size: 11px;
          font-weight: 700;
          color: var(--pr-muted);
          line-height: 1.2;
          text-align: right;
        }

        /* ══════════ RIGHT CART PANEL ══════════ */
        .pos-cart {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: 100%;
          border-radius: 18px;
          border: 1px solid var(--pr-border);
          background: #fff;
          box-shadow: 0 24px 40px -30px rgba(15,23,42,.4);
          animation: posRise .5s cubic-bezier(.22,1,.36,1) .06s both;
        }

        .pos-cart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 18px;
          border-bottom: 1px solid var(--pr-border);
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .pos-cart-head::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #06b6d4, #10b981);
        }
        .pos-cart-title {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -.01em;
        }
        .pos-cart-title .ic {
          width: 34px; height: 34px;
          border-radius: 11px;
          display: grid; place-items: center;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          box-shadow: 0 10px 20px -10px rgba(99,102,241,.9);
        }
        .pos-cart-count {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11.5px;
          font-weight: 800;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          color: #fff;
          box-shadow: 0 8px 18px -8px rgba(79,70,229,.9);
        }
        .pos-cart-count.flash { animation: posPop .5s cubic-bezier(.34,1.56,.64,1); }
        .pos-cart-count .dot-sep { opacity: .55; }

        .pos-cart-clear {
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.16);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 9px;
          cursor: pointer;
          transition: all .18s ease;
        }
        .pos-cart-clear:hover { background: rgba(244,63,94,.2); border-color: rgba(244,63,94,.4); color: #fecaca; }

        .pos-cart-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          scrollbar-width: thin;
          background: linear-gradient(180deg, #ffffff, #fbfdff);
        }
        .pos-cart-body::-webkit-scrollbar { width: 8px; }
        .pos-cart-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }

        /* Customer selector */
        .pos-cust-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 11px 14px;
          border-radius: 12px;
          border: 1.5px dashed #c7d2fe;
          background: linear-gradient(135deg, #f5f3ff, #eef2ff);
          color: #4338ca;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all .2s ease;
        }
        .pos-cust-empty:hover {
          border-color: #818cf8;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          transform: translateY(-1px);
          box-shadow: 0 10px 22px -16px rgba(79,70,229,.7);
        }
        .pos-cust-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 13px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          border: 1px solid #c7d2fe;
          border-radius: 12px;
          box-shadow: 0 10px 22px -18px rgba(79,70,229,.7);
        }
        .pos-cust-avatar {
          width: 38px; height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          color: #fff;
          display: grid; place-items: center;
          font-weight: 800;
          font-size: 14px;
          flex-shrink: 0;
          box-shadow: 0 8px 16px -8px rgba(79,70,229,.9);
        }
        .pos-cust-name { font-weight: 800; font-size: 13.5px; color: #1e1b4b; }
        .pos-cust-mobile {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; color: #4338ca; font-weight: 600;
        }
        .pos-cust-x {
          width: 28px; height: 28px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: rgba(255,255,255,.6);
          border: 1px solid rgba(199,210,254,.9);
          color: #4338ca;
          cursor: pointer;
          transition: all .18s ease;
        }
        .pos-cust-x:hover { background: #fff1f2; border-color: #fecdd3; color: #e11d48; }

        /* Cart empty */
        .pos-cart-empty {
          padding: 44px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: var(--pr-soft);
          text-align: center;
        }
        .pos-cart-empty .big-ic {
          width: 74px; height: 74px;
          border-radius: 22px;
          display: grid; place-items: center;
          background: linear-gradient(135deg, #eef2ff, #f5f3ff);
          color: #6366f1;
          margin-bottom: 6px;
          animation: posFloat 3s ease-in-out infinite;
        }
        .pos-cart-empty p { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--pr-muted); }
        .pos-cart-empty span { margin: 0; font-size: 12px; color: var(--pr-soft); }

        /* Cart items */
        .pos-items { display: flex; flex-direction: column; gap: 10px; }

        .pos-item {
          position: relative;
          overflow: hidden;
          padding: 12px;
          border-radius: 13px;
          background: #ffffff;
          border: 1px solid var(--pr-border);
          animation: posSlideIn .35s cubic-bezier(.22,1,.36,1) both;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .pos-item::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #6366f1, #06b6d4);
        }
        .pos-item:hover {
          border-color: #c7d2fe;
          box-shadow: 0 14px 26px -22px rgba(79,70,229,.7);
          transform: translateY(-1px);
        }
        .pos-item-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 9px;
        }
        .pos-item-name {
          flex: 1;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.32;
          color: var(--pr-text);
        }
        .pos-item-del {
          width: 28px; height: 28px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid var(--pr-border);
          color: var(--pr-muted);
          cursor: pointer;
          flex-shrink: 0;
          transition: all .2s ease;
        }
        .pos-item-del:hover {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
          transform: scale(1.06);
        }
        .pos-item-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pos-item-row input {
          height: 34px;
          padding: 0 9px;
          font-size: 13px;
          border-radius: 9px;
          border: 1px solid var(--pr-border);
          background: #fbfdff;
          transition: border-color .18s ease, box-shadow .18s ease;
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: var(--pr-text);
        }
        .pos-item-row input:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
          outline: none;
          background: #fff;
        }
        .pos-item-x { color: var(--pr-soft); font-weight: 700; font-size: 12px; }
        .pos-item-amt {
          margin-left: auto;
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: -.01em;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .pos-item-unit {
          font-size: 11.5px;
          color: var(--pr-soft);
          font-weight: 700;
        }

        /* Form headings */
        .pos-sec-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--pr-muted);
          margin: 20px 0 10px;
        }
        .pos-sec-title::before {
          content: '';
          width: 4px; height: 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, #6366f1, #06b6d4);
        }
        .pos-charges {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .pos-charges input {
          height: 38px;
          padding: 0 11px;
          font-size: 13px;
          border-radius: 10px;
          border: 1px solid var(--pr-border);
          background: #fbfdff;
          transition: border-color .18s ease, box-shadow .18s ease;
          font-weight: 600;
        }
        .pos-charges input:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
          outline: none;
          background: #fff;
        }
        .pos-field { display: flex; flex-direction: column; gap: 5px; margin-top: 12px; }
        .pos-field label {
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: var(--pr-muted);
        }
        .pos-field input {
          height: 38px;
          padding: 0 11px;
          font-size: 13px;
          border-radius: 10px;
          border: 1px solid var(--pr-border);
          background: #fbfdff;
          font-weight: 600;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .pos-field input:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
          outline: none;
          background: #fff;
        }

        /* Cart footer */
        .pos-cart-foot {
          border-top: 1px solid var(--pr-border);
          padding: 16px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          flex-shrink: 0;
        }
        .pos-tot-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 5px;
          color: var(--pr-muted);
          font-weight: 600;
        }
        .pos-tot-row span:last-child { color: var(--pr-text); font-weight: 800; font-variant-numeric: tabular-nums; }
        .pos-tot-row.disc span:last-child { color: #059669; }

        .pos-grand {
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
        .pos-grand::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.14) 50%, transparent 60%);
          background-size: 200% 100%;
          animation: posShimmer 3.4s ease-in-out infinite;
          pointer-events: none;
        }
        .pos-grand-l {
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #cbd5e1;
        }
        .pos-grand-v {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -.02em;
          background: linear-gradient(135deg, #a5b4fc, #67e8f9);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          font-variant-numeric: tabular-nums;
        }

        .pos-pay-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .pos-pay-grid > div { display: flex; flex-direction: column; gap: 5px; }
        .pos-pay-grid label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: var(--pr-muted);
        }
        .pos-pay-grid input,
        .pos-pay-grid select {
          height: 38px;
          padding: 0 11px;
          font-size: 13px;
          border-radius: 10px;
          border: 1px solid var(--pr-border);
          background: #fff;
          font-weight: 700;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .pos-pay-grid input:focus,
        .pos-pay-grid select:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
          outline: none;
        }

        .pos-due {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-top: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          font-weight: 700;
        }
        .pos-due.due {
          background: linear-gradient(135deg, #fff1f2, #ffe4e6);
          border: 1px solid #fecdd3;
          color: #be123c;
        }
        .pos-due.change {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          border: 1px solid #a7f3d0;
          color: #047857;
        }
        .pos-due span:last-child { font-variant-numeric: tabular-nums; font-weight: 800; }

        .pos-checkout {
          position: relative;
          width: 100%;
          margin-top: 14px;
          padding: 14px;
          border-radius: 13px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: .01em;
          color: #fff;
          background: linear-gradient(115deg, #4f46e5, #06b6d4);
          box-shadow: 0 16px 30px -14px rgba(79,70,229,.85);
          overflow: hidden;
          isolation: isolate;
          transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
        }
        .pos-checkout::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.3) 50%, transparent 68%);
          transform: translateX(-140%);
          z-index: -1;
        }
        .pos-checkout:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 22px 38px -14px rgba(79,70,229,.95);
        }
        .pos-checkout:hover:not(:disabled)::after { animation: posShine .9s ease; }
        .pos-checkout:active:not(:disabled) { transform: scale(.98); }
        .pos-checkout:disabled { opacity: .7; cursor: not-allowed; }
      `}</style>

      {/* ═════════════ LEFT: PRODUCT SELECTION ═════════════ */}
      <section className="pos-left">
        {/* Header */}
        <div className="pos-head">
          <div>
            <h2>POS / Billing</h2>
            <div className="pos-head-sub">
              Search or tap any product — add as many different items as you need
            </div>
          </div>
          <span className="pos-count-pill">
            {visibleProducts.length} shown · {products.length} total
          </span>
        </div>

        {/* Search */}
        <div className="pos-search">
          <Search size={18} />
          <input
            placeholder="Search by product name, SKU, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="pos-clear-btn" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="pos-chips">
          <button
            className={`pos-chip${categoryFilter === 'all' ? ' active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All <span className="cnt">{products.length}</span>
          </button>
          {categories.map((c) => {
            const active = categoryFilter === c.id
            return (
              <button
                key={c.id}
                className={`pos-chip${active ? ' active' : ''}`}
                onClick={() => setCategoryFilter(c.id)}
              >
                {c.name} <span className="cnt">{c.count}</span>
              </button>
            )
          })}
        </div>

        {/* Products grid */}
        <div className="pos-scroll">
          {visibleProducts.length === 0 ? (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--pr-soft)' }}>
              <PackageSearch size={46} style={{ opacity: 0.45 }} />
              <p style={{ fontWeight: 700, margin: 0 }}>No products found</p>
              <p style={{ margin: 0, fontSize: 13 }}>
                {search ? 'Try a different search term' : 'No products in this category yet'}
              </p>
            </div>
          ) : (
            <div className="pos-grid">
              {visibleProducts.map((p, idx) => {
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
                    className="pos-card"
                    style={{ animationDelay: `${Math.min(idx, 15) * 0.02}s` }}
                    onClick={() => !outOfStock && addToCart(p)}
                    disabled={outOfStock}
                  >
                    <div className="pos-card-top">
                      <span className="pos-card-cat" title={p.category?.name ?? 'Uncategorized'}>
                        {p.category?.name ?? 'Uncategorized'}
                      </span>
                      <span className={`pos-card-stock ${outOfStock ? 'out' : 'in'}`}>
                        {outOfStock ? 'Out' : 'In'}
                      </span>
                    </div>

                    <div className="pos-card-name">{p.name}</div>

                    <div className="pos-card-foot">
                      <div>
                        <div className="pos-card-price-l">Price</div>
                        <div className="pos-card-price">{formatCurrency(p.retail_price)}</div>
                      </div>
                      <div>
                        <div className="pos-card-stock-l">{outOfStock ? 'Stock' : 'Available'}</div>
                        <div className="pos-card-stock-v">
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
      <aside className="pos-cart">
        {/* Cart header */}
        <div className="pos-cart-head">
          <div className="pos-cart-title">
            <span className="ic"><ShoppingCart size={17} /></span>
            Cart
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pos-cart-count${cartFlash ? ' flash' : ''}`}>
              {cart.length} item{cart.length === 1 ? '' : 's'}
              {uniqueProductCount !== cart.length && (
                <>
                  <span className="dot-sep">·</span>
                  {uniqueProductCount} product{uniqueProductCount === 1 ? '' : 's'}
                </>
              )}
            </span>
            {cart.length > 0 && (
              <button className="pos-cart-clear" onClick={() => setCart([])}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Cart body */}
        <div className="pos-cart-body">
          {/* Customer selector */}
          <div style={{ marginBottom: 16 }}>
            <div className="pos-sec-title" style={{ marginTop: 0 }}>Customer</div>
            {customer ? (
              <div className="pos-cust-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <div className="pos-cust-avatar">{customer.name.charAt(0).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="pos-cust-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer.name}
                    </div>
                    <div className="pos-cust-mobile">
                      <Phone size={11} /> {customer.mobile ?? 'No mobile'}
                    </div>
                  </div>
                </div>
                <button className="pos-cust-x" onClick={() => setCustomer(null)} title="Remove customer">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button className="pos-cust-empty" onClick={() => setShowCustomerModal(true)}>
                <UserPlus size={15} /> Select / Add Customer
              </button>
            )}
          </div>

          {/* Cart items */}
          {cart.length === 0 ? (
            <div className="pos-cart-empty">
              <div className="big-ic">
                <ShoppingCart size={30} />
              </div>
              <p>Cart is empty</p>
              <span>Tap products on the left to add them here</span>
            </div>
          ) : (
            <div className="pos-items">
              {cart.map((item, i) => (
                <div key={i} className="pos-item" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                  <div className="pos-item-head">
                    <span className="pos-item-name">{item.description}</span>
                    <button className="pos-item-del" onClick={() => removeFromCart(i)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="pos-item-row">
                    {item.unit === 'Sq.Ft' || item.slab_id ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 82 }}
                          placeholder="Sq.Ft"
                          value={item.sqft || ''}
                          onChange={(e) => updateCartItem(i, { sqft: Number(e.target.value) })}
                          disabled={item.is_full_slab}
                        />
                        <span className="pos-item-x">×</span>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 82 }}
                          placeholder="Rate"
                          value={item.rate}
                          onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })}
                        />
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 68 }}
                          placeholder="Qty"
                          value={item.quantity || ''}
                          onChange={(e) => updateCartItem(i, { quantity: Number(e.target.value) })}
                        />
                        <span className="pos-item-x">×</span>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 82 }}
                          placeholder="Rate"
                          value={item.rate}
                          onChange={(e) => updateCartItem(i, { rate: Number(e.target.value) })}
                        />
                        <span className="pos-item-unit">{item.unit}</span>
                      </>
                    )}
                    <span className="pos-item-amt">{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              ))}

              {/* Charges */}
              <div className="pos-sec-title">Additional Charges</div>
              <div className="pos-charges">
                <input placeholder="Cutting" type="number" value={charges.cutting} onChange={(e) => setCharges({ ...charges, cutting: e.target.value })} />
                <input placeholder="Polishing" type="number" value={charges.polishing} onChange={(e) => setCharges({ ...charges, polishing: e.target.value })} />
                <input placeholder="Loading" type="number" value={charges.loading} onChange={(e) => setCharges({ ...charges, loading: e.target.value })} />
                <input placeholder="Delivery" type="number" value={charges.delivery} onChange={(e) => setCharges({ ...charges, delivery: e.target.value })} />
                <input placeholder="Other" type="number" value={charges.other} onChange={(e) => setCharges({ ...charges, other: e.target.value })} />
                <input placeholder="Discount" type="number" value={charges.discount} onChange={(e) => setCharges({ ...charges, discount: e.target.value })} />
              </div>

              <div className="pos-field">
                <label>Salesperson</label>
                <input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Optional" />
              </div>
              <div className="pos-field">
                <label>Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note for this sale" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="pos-cart-foot">
            <div className="pos-tot-row">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {totalCharges > 0 && (
              <div className="pos-tot-row">
                <span>Charges</span>
                <span>{formatCurrency(totalCharges)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="pos-tot-row disc">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}

            <div className="pos-grand">
              <span className="pos-grand-l">Grand Total</span>
              <span className="pos-grand-v">{formatCurrency(grandTotal)}</span>
            </div>

            <div className="pos-pay-grid">
              <div>
                <label>Paid Amount</label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
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
              <div className="pos-due due">
                <span>Due</span>
                <span>{formatCurrency(due)}</span>
              </div>
            )}
            {due < 0 && (
              <div className="pos-due change">
                <span>Change</span>
                <span>{formatCurrency(-due)}</span>
              </div>
            )}

            <button
              className="pos-checkout"
              onClick={handleCheckout}
              disabled={saving}
            >
              {saving ? 'Processing…' : `Complete Sale · ${cart.length} item${cart.length === 1 ? '' : 's'}`}
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
              <h4 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: 'var(--pr-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
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
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 42, border: '1px solid var(--pr-border)', borderRadius: 12, background: '#fbfdff', marginBottom: 12 }}>
                <Search size={16} style={{ color: '#4f46e5' }} />
                <input
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, fontWeight: 600 }}
                  placeholder="Search customer by name or mobile..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  autoFocus
                />
                {customerSearch && (
                  <button className="pos-clear-btn" onClick={() => setCustomerSearch('')}>
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
                  padding: '11px 12px',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: '1.5px dashed #c7d2fe',
                  background: 'linear-gradient(135deg, #f5f3ff, #eef2ff)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all .2s ease',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <UserRound size={16} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#1e1b4b' }}>Walk-in Customer</div>
                  <div style={{ fontSize: 12, color: '#4338ca', fontWeight: 600 }}>Continue without saving customer</div>
                </div>
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto' }}>
                {filteredCustomers.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--pr-soft)' }}>
                    <User size={30} style={{ opacity: 0.5, marginBottom: 6 }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>No customers found</div>
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
                        padding: '11px 12px',
                        borderRadius: 12,
                        border: '1px solid var(--pr-border)',
                        background: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all .2s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 24px -18px rgba(79,70,229,.6)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pr-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                    >
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0, boxShadow: '0 8px 16px -8px rgba(79,70,229,.9)' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--pr-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
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
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', flexShrink: 0 }}>
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
            borderRadius: 12,
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
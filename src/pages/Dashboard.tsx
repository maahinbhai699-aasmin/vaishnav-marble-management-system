import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatNumber } from '../lib/utils'
import { Loading } from '../components/Feedback'
import { useToast } from '../components/AppShell'
import {
  TrendingUp, Wallet, Package, Layers, Boxes, AlertTriangle,
  Users, Truck, DollarSign, ShoppingCart, ArrowDownRight, ArrowUpRight, ChevronRight,
  AlertOctagon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

interface DashboardData {
  todaySales: number
  todayPurchase: number
  todayExpenses: number
  todayProfit: number
  totalStockValue: number
  totalProducts: number
  totalSlabs: number
  totalSqft: number
  lowStock: number
  outOfStock: number
  customerDue: number
  supplierDue: number
  recentSales: Array<{ id: string; invoice_number: string; customer_name: string; grand_total: number; sale_date: string; payment_status: string }>
  recentPurchases: Array<{ id: string; invoice_number: string; supplier_name: string; total_amount: number; purchase_date: string }>
  categoryStats: Array<{ name: string; inventory_type: string; total_count: number; total_sqft: number; available_count: number; available_sqft: number }>
  deadStockCount: number | null
  deadStockProducts: Array<{ name: string; category_name: string | null; lastSaleDate: string | null; stockCount: number; stockValue: number }>
  deadStockError: boolean
}

function getJoinedSaleDate(relation: unknown): string | null {
  const sale = Array.isArray(relation) ? relation[0] : relation
  if (!sale || typeof sale !== 'object' || !('sale_date' in sale)) return null
  return typeof sale.sale_date === 'string' ? sale.sale_date : null
}

export function Dashboard() {
  const toast = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [cartPulse, setCartPulse] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [salesToday, purchasesToday, expensesToday, products, slabs, customers, suppliers, lowStockP, outStockP] = await Promise.all([
      supabase.from('sales').select('grand_total, paid_amount, sale_date').eq('sale_date', today),
      supabase.from('purchases').select('total_amount, purchase_date').eq('purchase_date', today),
      supabase.from('expenses').select('amount, expense_date').eq('expense_date', today),
      supabase.from('products').select('id, name, category_id, stock_count, stock_sqft, cost_price, min_stock_level, category:categories(id, name, inventory_type)'),
      supabase.from('slabs').select('id, category_id, total_sqft, remaining_sqft, status'),
      supabase.from('customers').select('total_due'),
      supabase.from('suppliers').select('total_due'),
      supabase.from('products').select('id').lt('stock_count', 1).or('stock_sqft.lt.1'),
      supabase.from('products').select('id').eq('stock_count', 0).eq('stock_sqft', 0),
    ])

    const todaySalesAmount = (salesToday.data ?? []).reduce((s, r: { grand_total: number }) => s + Number(r.grand_total), 0)
    const todayPurchaseAmount = (purchasesToday.data ?? []).reduce((s, r: { total_amount: number }) => s + Number(r.total_amount), 0)
    const todayExpensesAmount = (expensesToday.data ?? []).reduce((s, r: { amount: number }) => s + Number(r.amount), 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalStockValue = (products.data ?? []).reduce((s: number, r: any) => {
      const invType = r.category?.inventory_type
      const stock = invType === 'piece' ? Number(r.stock_count) : Number(r.stock_sqft)
      return s + (Number(r.cost_price) * stock)
    }, 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slabData = (slabs.data ?? []) as any[]
    const totalSqft = slabData.reduce((s: number, r: any) => s + Number(r.remaining_sqft), 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerDue = (customers.data ?? []).reduce((s: number, r: any) => s + Number(r.total_due), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplierDue = (suppliers.data ?? []).reduce((s: number, r: any) => s + Number(r.total_due), 0)

    // Dead stock detection: products with stock that haven't been sold in 1-3+ years
    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]

    const [recentSales, recentPurchases, categories] = await Promise.all([
      supabase.from('sales').select('id, invoice_number, customer_name, grand_total, sale_date, payment_status').order('created_at', { ascending: false }).limit(5),
      supabase.from('purchases').select('id, invoice_number, total_amount, purchase_date, supplier:suppliers(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('categories').select('id, name, inventory_type, display_order').order('display_order'),
    ])

    // Build map of last sale date per product
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastSaleByProduct: Record<string, string> = {}
    let deadStockError = false
    const saleItemsPageSize = 1000
    try {
      for (let from = 0; ; from += saleItemsPageSize) {
        const { data: saleItems, error } = await supabase
          .from('sale_items')
          .select('id, product_id, sale:sales(sale_date)')
          .order('id', { ascending: true })
          .range(from, from + saleItemsPageSize - 1)
        if (error) throw error

        for (const si of saleItems ?? []) {
          const pid = si.product_id
          if (!pid) continue
          const saleDate = getJoinedSaleDate(si.sale)
          if (!saleDate) continue
          if (!lastSaleByProduct[pid] || saleDate > lastSaleByProduct[pid]) {
            lastSaleByProduct[pid] = saleDate
          }
        }

        if ((saleItems?.length ?? 0) < saleItemsPageSize) break
      }
    } catch (error) {
      console.error('Failed to load sale history for dead-stock analysis:', error)
      toast('Unable to load dead-stock analysis. Please try again.', 'error')
      deadStockError = true
    }

    // Find products with stock that have never been sold or last sold 1+ year ago
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deadStockProducts: Array<{ name: string; category_name: string | null; lastSaleDate: string | null; stockCount: number; stockValue: number }> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!deadStockError) {
      for (const p of (products.data ?? []) as any[]) {
        const invType = p.category?.inventory_type
        const stock = invType === 'piece' ? Number(p.stock_count) : Number(p.stock_sqft)
        if (stock <= 0) continue
        const lastSale = lastSaleByProduct[p.id] ?? null
        if (lastSale === null || lastSale < oneYearAgoStr) {
          deadStockProducts.push({
            name: p.name,
            category_name: p.category?.name ?? 'Uncategorized',
            lastSaleDate: lastSale,
            stockCount: stock,
            stockValue: Number(p.cost_price) * stock,
          })
        }
      }
    }

    const categoryStats: Array<{ name: string; inventory_type: string; total_count: number; total_sqft: number; available_count: number; available_sqft: number }> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cat of (categories.data ?? []) as any[]) {
      const categoryProducts = (products.data ?? []).filter((p: any) => p.category_id === cat.id)
      const categorySlabs = slabData.filter((s: any) => s.category_id === cat.id && s.status !== 'sold' && s.status !== 'damaged')

      if (cat.inventory_type === 'slab') {
        const total_count = categorySlabs.length
        const total_sqft = categorySlabs.reduce((s: number, r: any) => s + Number(r.total_sqft), 0)
        const available_count = categorySlabs.filter((s: any) => s.status === 'available').length
        const available_sqft = categorySlabs.reduce((s: number, r: any) => s + Number(r.remaining_sqft), 0)

        categoryStats.push({ name: cat.name, inventory_type: cat.inventory_type, total_count, total_sqft, available_count, available_sqft })
        continue
      }

      const total_count = categoryProducts.reduce((s: number, p: any) => s + Number(p.stock_count), 0)
      const total_sqft = categoryProducts.reduce((s: number, p: any) => s + Number(p.stock_sqft), 0)
      const available_count = total_count
      const available_sqft = total_sqft

      categoryStats.push({
        name: cat.name,
        inventory_type: cat.inventory_type,
        total_count,
        total_sqft,
        available_count,
        available_sqft,
      })
    }

    setData({
      todaySales: todaySalesAmount,
      todayPurchase: todayPurchaseAmount,
      todayExpenses: todayExpensesAmount,
      todayProfit: todaySalesAmount - todayPurchaseAmount - todayExpensesAmount,
      totalStockValue,
      totalProducts: products.data?.length ?? 0,
      totalSlabs: slabData.filter((s: any) => s.status !== 'sold' && s.status !== 'damaged').length,
      totalSqft,
      lowStock: lowStockP.data?.length ?? 0,
      outOfStock: outStockP.data?.length ?? 0,
      customerDue,
      supplierDue,
      recentSales: (recentSales.data ?? []).map((r: { id: string; invoice_number: string; customer_name: string; grand_total: number; sale_date: string; payment_status: string }) => ({ id: r.id, invoice_number: r.invoice_number, customer_name: r.customer_name ?? 'Walk-in', grand_total: Number(r.grand_total), sale_date: r.sale_date, payment_status: r.payment_status })),
      recentPurchases: (recentPurchases.data ?? []).map((r: any) => ({ id: r.id, invoice_number: r.invoice_number, supplier_name: r.supplier?.name ?? '-', total_amount: Number(r.total_amount), purchase_date: r.purchase_date })),
      categoryStats,
      deadStockCount: deadStockError ? null : deadStockProducts.length,
      deadStockProducts,
      deadStockError,
    })
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading || !data) return <Loading label="Loading dashboard..." />

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="db-root">
      <style>{`
        .db-root {
          --db-card: #ffffff;
          --db-border: #e6ebf2;
          --db-text: #0f172a;
          --db-muted: #64748b;
          --db-soft: #94a3b8;
          animation: dbFade 0.35s ease both;
        }
        @keyframes dbFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dbRise {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dbBtnPulse {
          0%   { box-shadow: 0 0 0 0 rgba(15,23,42,0.45); }
          100% { box-shadow: 0 0 0 18px rgba(15,23,42,0); }
        }
        @keyframes dbCartBounce {
          0%   { transform: translateY(0) rotate(0deg); }
          30%  { transform: translateY(-4px) rotate(-10deg); }
          60%  { transform: translateY(2px) rotate(6deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }
        @keyframes dsPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.42); }
          50%      { box-shadow: 0 0 0 12px rgba(244,63,94,0); }
        }
        @keyframes dbSpinSlow {
          to { transform: rotate(360deg); }
        }

        /* ── Page header ── */
        .db-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .db-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #4338ca 55%, #0891b2 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: #0f172a;
        }
        .db-header-sub {
          margin-top: 5px;
          font-size: 13.5px;
          color: var(--db-muted);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .db-header-sub .db-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.18);
          animation: dsPulse 2.2s ease-in-out infinite;
        }

        /* ── New Sale button — BLACK ── */
        .db-btn-new {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 20px;
          border-radius: 12px;
          background: #0f172a;
          border: 1px solid #0f172a;
          color: #ffffff !important;
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          text-decoration: none;
          overflow: hidden;
          isolation: isolate;
          box-shadow: 0 10px 22px -10px rgba(15,23,42,0.75);
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease, background .22s ease;
        }
        .db-btn-new svg { color: #ffffff; }
        .db-btn-new::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.28) 50%, transparent 68%);
          transform: translateX(-130%);
          z-index: -1;
          transition: transform .65s ease;
        }
        .db-btn-new:hover {
          background: #1e293b;
          transform: translateY(-2px);
          box-shadow: 0 16px 30px -12px rgba(15,23,42,0.85);
        }
        .db-btn-new:hover::after { transform: translateX(130%); }
        .db-btn-new:active { transform: scale(0.95); }
        .db-btn-new.is-clicked { animation: dbBtnPulse .55s ease-out; }
        .db-btn-new.is-clicked svg { animation: dbCartBounce .55s cubic-bezier(.34,1.56,.64,1); }

        /* ── Section label ── */
        .db-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 28px 0 13px;
        }
        .db-section-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #475569;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .db-section-title::before {
          content: '';
          width: 4px;
          height: 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, #6366f1, #06b6d4);
        }
        .db-section-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, var(--db-border), transparent);
          margin-left: 14px;
        }

        /* ── KPI cards ── */
        .db-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 15px;
        }
        @media (max-width: 1100px) {
          .db-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .db-kpi-grid { grid-template-columns: 1fr; }
        }
        .db-kpi {
          position: relative;
          background: var(--db-card);
          border: 1px solid var(--db-border);
          border-radius: 16px;
          padding: 17px 18px;
          display: flex;
          flex-direction: column;
          gap: 13px;
          overflow: hidden;
          isolation: isolate;
          animation: dbRise .55s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .db-kpi::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          z-index: 2;
        }
        .db-kpi::after {
          content: '';
          position: absolute;
          top: -46px; right: -46px;
          width: 140px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--c1) 0%, transparent 68%);
          opacity: .12;
          z-index: -1;
          transition: opacity .32s ease, transform .45s cubic-bezier(.22,1,.36,1);
        }
        .db-kpi:hover {
          transform: translateY(-5px);
          border-color: transparent;
          box-shadow: 0 20px 34px -18px var(--shadow), 0 3px 10px -4px rgba(15,23,42,.06);
        }
        .db-kpi:hover::after { opacity: .22; transform: scale(1.18); }

        .db-kpi.c-blue   { --c1:#3b82f6; --c2:#60a5fa; --shadow: rgba(59,130,246,.45); }
        .db-kpi.c-violet { --c1:#8b5cf6; --c2:#c084fc; --shadow: rgba(139,92,246,.45); }
        .db-kpi.c-rose   { --c1:#f43f5e; --c2:#fb7185; --shadow: rgba(244,63,94,.45); }
        .db-kpi.c-green  { --c1:#10b981; --c2:#34d399; --shadow: rgba(16,185,129,.45); }
        .db-kpi.c-cyan   { --c1:#06b6d4; --c2:#22d3ee; --shadow: rgba(6,182,212,.45); }
        .db-kpi.c-indigo { --c1:#6366f1; --c2:#818cf8; --shadow: rgba(99,102,241,.45); }
        .db-kpi.c-amber  { --c1:#f59e0b; --c2:#fbbf24; --shadow: rgba(245,158,11,.45); }

        .db-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .db-kpi-label {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--db-muted);
          letter-spacing: 0.015em;
        }
        .db-kpi-icon {
          width: 42px; height: 42px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--c1), var(--c2));
          color: #ffffff;
          box-shadow: 0 10px 20px -10px var(--shadow);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .db-kpi-icon svg { width: 20px; height: 20px; }
        .db-kpi:hover .db-kpi-icon { transform: scale(1.1) rotate(-6deg); }

        .db-kpi-value {
          font-size: 23px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: var(--db-text);
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .db-kpi-foot {
          font-size: 12px;
          color: var(--db-soft);
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
        }
        .db-kpi-foot .db-pos { color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; }
        .db-kpi-foot .db-neg { color: #dc2626; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; }

        /* ── Alert band ── */
        .db-alert-band {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 15px;
          margin-top: 6px;
        }
        @media (max-width: 1100px) {
          .db-alert-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .db-alert-band { grid-template-columns: 1fr; }
        }
        .db-alert {
          position: relative;
          background: var(--db-card);
          border: 1px solid var(--db-border);
          border-radius: 16px;
          padding: 15px 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          overflow: hidden;
          animation: dbRise .55s cubic-bezier(.22,1,.36,1) both;
          transition: border-color .24s ease, box-shadow .24s ease, transform .24s cubic-bezier(.22,1,.36,1);
        }
        .db-alert::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, var(--c1), var(--c2));
        }
        .db-alert:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 18px 30px -18px var(--shadow);
        }
        .db-alert.a-amber { --c1:#f59e0b; --c2:#fbbf24; --shadow: rgba(245,158,11,.5); }
        .db-alert.a-rose  { --c1:#f43f5e; --c2:#fb7185; --shadow: rgba(244,63,94,.5); }
        .db-alert.a-blue  { --c1:#3b82f6; --c2:#60a5fa; --shadow: rgba(59,130,246,.5); }
        .db-alert.a-slate { --c1:#6366f1; --c2:#8b5cf6; --shadow: rgba(99,102,241,.5); }

        .db-alert-icon {
          width: 44px; height: 44px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--c1), var(--c2));
          color: #ffffff;
          box-shadow: 0 10px 20px -10px var(--shadow);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .db-alert-icon svg { width: 20px; height: 20px; }
        .db-alert:hover .db-alert-icon { transform: scale(1.08) rotate(6deg); }

        .db-alert-body { min-width: 0; flex: 1; }
        .db-alert-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--db-muted);
          letter-spacing: 0.015em;
          margin-bottom: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-alert-value {
          font-size: 18px;
          font-weight: 800;
          color: var(--db-text);
          letter-spacing: -0.015em;
          font-variant-numeric: tabular-nums;
        }

        /* ── Dead stock banner ── */
        .db-root .dead-stock-banner {
          position: relative;
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 16px 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%);
          border: 1px solid #fecdd3;
          overflow: hidden;
          animation: dbRise .55s cubic-bezier(.22,1,.36,1) both;
        }
        .db-root .dead-stock-banner::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: linear-gradient(180deg, #f43f5e, #fb923c);
        }
        .db-root .ds-icon {
          width: 46px; height: 46px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, #f43f5e, #fb7185);
          color: #ffffff;
          animation: dsPulse 2.4s ease-in-out infinite;
        }
        .db-root .ds-icon svg { width: 21px; height: 21px; }
        .db-root .ds-body { min-width: 0; flex: 1; }
        .db-root .ds-title {
          font-size: 14px;
          font-weight: 800;
          color: #9f1239;
          letter-spacing: -0.01em;
        }
        .db-root .ds-sub {
          font-size: 12.5px;
          color: #9f1239;
          opacity: .82;
          margin-top: 3px;
          line-height: 1.5;
        }
        .db-root .ds-count {
          margin-left: auto;
          flex-shrink: 0;
          min-width: 48px;
          height: 48px;
          padding: 0 13px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          font-size: 21px;
          font-weight: 800;
          color: #ffffff;
          background: linear-gradient(135deg, #f43f5e, #fb923c);
          box-shadow: 0 12px 24px -12px rgba(244,63,94,.9);
        }

        /* ── Dead stock list ── */
        .db-deadstock-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 11px;
          padding: 16px 18px 18px;
        }
        .db-deadstock-item {
          position: relative;
          border: 1px solid var(--db-border);
          border-radius: 13px;
          background: linear-gradient(135deg, #fbfdff, #f8fafc);
          padding: 13px 14px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          overflow: hidden;
          transition: transform .24s cubic-bezier(.22,1,.36,1), border-color .24s ease, box-shadow .24s ease;
        }
        .db-deadstock-item::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #fb923c, #f43f5e);
          opacity: .85;
        }
        .db-deadstock-item:hover {
          transform: translateY(-3px);
          border-color: #fecdd3;
          box-shadow: 0 14px 26px -16px rgba(244,63,94,.55);
        }
        .db-deadstock-name {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--db-text);
          line-height: 1.32;
        }
        .db-deadstock-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--db-muted);
        }
        .db-deadstock-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          color: #4338ca;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* ── Panel ── */
        .db-panel {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          border-radius: 16px;
          overflow: hidden;
          animation: dbRise .6s cubic-bezier(.22,1,.36,1) both;
          transition: box-shadow .26s ease, border-color .26s ease;
        }
        .db-panel:hover {
          box-shadow: 0 20px 40px -28px rgba(15,23,42,.35);
          border-color: #dbe3ee;
        }
        .db-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--db-border);
          background: linear-gradient(180deg, #fbfdff, #ffffff);
        }
        .db-panel-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--db-text);
          letter-spacing: -0.012em;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .db-pt-ico {
          width: 30px; height: 30px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          color: #ffffff;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 8px 16px -8px rgba(99,102,241,.8);
        }
        .db-pt-ico.p-indigo { background: linear-gradient(135deg, #6366f1, #818cf8); box-shadow: 0 8px 16px -8px rgba(99,102,241,.8); }
        .db-pt-ico.p-cyan   { background: linear-gradient(135deg, #06b6d4, #22d3ee); box-shadow: 0 8px 16px -8px rgba(6,182,212,.8); }
        .db-pt-ico.p-green  { background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 8px 16px -8px rgba(16,185,129,.8); }
        .db-pt-ico.p-amber  { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 8px 16px -8px rgba(245,158,11,.8); }
        .db-pt-ico.p-rose   { background: linear-gradient(135deg, #f43f5e, #fb7185); box-shadow: 0 8px 16px -8px rgba(244,63,94,.8); }

        .db-panel-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12.5px;
          font-weight: 700;
          color: var(--db-muted);
          text-decoration: none;
          padding: 5px 10px;
          border-radius: 9px;
          transition: color .18s ease, gap .18s ease, background .18s ease;
        }
        .db-panel-link:hover {
          color: #4f46e5;
          gap: 7px;
          background: #eef2ff;
        }

        /* ── Table ── */
        .db-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .db-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--db-soft);
          padding: 11px 18px;
          background: #f8fafc;
          border-bottom: 1px solid var(--db-border);
          white-space: nowrap;
        }
        .db-table tbody td {
          padding: 12px 18px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--db-text);
          vertical-align: middle;
        }
        .db-table tbody tr:last-child td { border-bottom: none; }
        .db-table tbody tr {
          transition: background .16s ease, box-shadow .16s ease;
        }
        .db-table tbody tr:hover {
          background: #f8fafc;
          box-shadow: inset 3px 0 0 #6366f1;
        }
        .db-table .db-cell-right { text-align: right; }
        .db-invoice {
          font-weight: 700;
          color: var(--db-text);
          font-variant-numeric: tabular-nums;
        }
        .db-customer {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .db-avatar {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          flex-shrink: 0;
          letter-spacing: -0.02em;
          box-shadow: 0 6px 14px -8px rgba(99,102,241,.9);
        }
        .db-customer-name {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-amount {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--db-text);
        }
        .db-date {
          font-size: 12px;
          color: var(--db-soft);
          margin-top: 2px;
        }
        .db-empty {
          padding: 44px 20px;
          text-align: center;
          color: var(--db-soft);
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }
        .db-empty svg { opacity: 0.35; }

        /* ── Bottom grid ── */
        .db-bottom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        @media (max-width: 900px) {
          .db-bottom-grid { grid-template-columns: 1fr; }
        }

        /* ── Status badges ── */
        .db-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.025em;
          text-transform: capitalize;
          line-height: 1.4;
          white-space: nowrap;
        }
        .db-badge::before {
          content: '';
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .db-badge.paid    { background: #ecfdf5; color: #047857; }
        .db-badge.partial { background: #fffbeb; color: #b45309; }
        .db-badge.unpaid  { background: #fff1f2; color: #be123c; }

        /* ── Category strip ── */
        .db-cat-strip {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 13px;
          padding: 16px 18px;
        }
        .db-cat {
          position: relative;
          border: 1px solid var(--db-border);
          border-radius: 14px;
          padding: 15px;
          background: linear-gradient(135deg, #fbfdff, #f7f9fc);
          overflow: hidden;
          animation: dbRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: border-color .22s ease, box-shadow .22s ease, transform .22s cubic-bezier(.22,1,.36,1);
        }
        .db-cat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--cc1), var(--cc2));
        }
        .db-cat::after {
          content: '';
          position: absolute;
          top: -40px; right: -40px;
          width: 110px; height: 110px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--cc1) 0%, transparent 70%);
          opacity: .1;
          transition: opacity .3s ease, transform .4s ease;
        }
        .db-cat:hover {
          border-color: transparent;
          transform: translateY(-4px);
          box-shadow: 0 18px 32px -20px var(--ccs);
        }
        .db-cat:hover::after { opacity: .22; transform: scale(1.2); }

        .db-cat:nth-child(6n+1) { --cc1:#6366f1; --cc2:#818cf8; --ccs: rgba(99,102,241,.7); }
        .db-cat:nth-child(6n+2) { --cc1:#06b6d4; --cc2:#22d3ee; --ccs: rgba(6,182,212,.7); }
        .db-cat:nth-child(6n+3) { --cc1:#10b981; --cc2:#34d399; --ccs: rgba(16,185,129,.7); }
        .db-cat:nth-child(6n+4) { --cc1:#f59e0b; --cc2:#fbbf24; --ccs: rgba(245,158,11,.7); }
        .db-cat:nth-child(6n+5) { --cc1:#f43f5e; --cc2:#fb7185; --ccs: rgba(244,63,94,.7); }
        .db-cat:nth-child(6n+6) { --cc1:#8b5cf6; --cc2:#c084fc; --ccs: rgba(139,92,246,.7); }

        .db-cat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 11px;
          position: relative;
        }
        .db-cat-name {
          font-size: 13.5px;
          font-weight: 800;
          color: var(--db-text);
          letter-spacing: -0.012em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-cat-type {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--cc1);
          background: #ffffff;
          border: 1px solid var(--db-border);
          padding: 3px 8px;
          border-radius: 7px;
          flex-shrink: 0;
        }
        .db-cat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          position: relative;
        }
        .db-cat-stat {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .db-cat-stat-label {
          font-size: 11px;
          color: var(--db-soft);
          font-weight: 600;
        }
        .db-cat-stat-value {
          font-size: 14px;
          font-weight: 800;
          color: var(--db-text);
          font-variant-numeric: tabular-nums;
        }

        @media (prefers-reduced-motion: reduce) {
          .db-root *, .db-root *::before, .db-root *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="db-header">
        <div>
          <h2>Dashboard</h2>
          <div className="db-header-sub">
            <span className="db-dot" />
            {today} · Overview of your business performance
          </div>
        </div>
        <Link
          to="/pos"
          className={`db-btn-new${cartPulse ? ' is-clicked' : ''}`}
          onClick={() => {
            setCartPulse(true)
            window.setTimeout(() => setCartPulse(false), 600)
          }}
        >
          <ShoppingCart size={16} />
          New Sale
        </Link>
      </div>

      {/* Today's KPI */}
      <div className="db-section">
        <span className="db-section-title">Today's Performance</span>
        <span className="db-section-line" />
      </div>
      <div className="db-kpi-grid">
        <div className="db-kpi c-blue" style={{ animationDelay: '0.02s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Sales</span>
            <span className="db-kpi-icon"><TrendingUp /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todaySales)}</div>
          <div className="db-kpi-foot">
            <span className="db-pos"><ArrowUpRight size={12} /> Revenue</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi c-violet" style={{ animationDelay: '0.06s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Purchase</span>
            <span className="db-kpi-icon"><ArrowDownRight /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todayPurchase)}</div>
          <div className="db-kpi-foot">
            <span className="db-neg"><ArrowDownRight size={12} /> Outflow</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi c-rose" style={{ animationDelay: '0.10s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Expenses</span>
            <span className="db-kpi-icon"><Wallet /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todayExpenses)}</div>
          <div className="db-kpi-foot">
            <span className="db-neg"><ArrowDownRight size={12} /> Outflow</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi c-green" style={{ animationDelay: '0.14s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Profit</span>
            <span className="db-kpi-icon"><DollarSign /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todayProfit)}</div>
          <div className="db-kpi-foot">
            {data.todayProfit >= 0 ? (
              <span className="db-pos"><ArrowUpRight size={12} /> Net gain</span>
            ) : (
              <span className="db-neg"><ArrowDownRight size={12} /> Net loss</span>
            )}
            <span>· Today</span>
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="db-section">
        <span className="db-section-title">Inventory Overview</span>
        <span className="db-section-line" />
      </div>
      <div className="db-kpi-grid">
        <div className="db-kpi c-indigo" style={{ animationDelay: '0.16s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Products</span>
            <span className="db-kpi-icon"><Package /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalProducts)}</div>
          <div className="db-kpi-foot">Active products</div>
        </div>

        <div className="db-kpi c-cyan" style={{ animationDelay: '0.20s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Slabs</span>
            <span className="db-kpi-icon"><Layers /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalSlabs)}</div>
          <div className="db-kpi-foot">In stock</div>
        </div>

        <div className="db-kpi c-blue" style={{ animationDelay: '0.24s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Sq.Ft</span>
            <span className="db-kpi-icon"><Boxes /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalSqft)}</div>
          <div className="db-kpi-foot">Remaining area</div>
        </div>

        <div className="db-kpi c-green" style={{ animationDelay: '0.28s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Stock Value</span>
            <span className="db-kpi-icon"><DollarSign /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.totalStockValue)}</div>
          <div className="db-kpi-foot">At cost price</div>
        </div>
      </div>

      {/* Dead Stock Alert */}
      {data.deadStockError ? (
        <div className="dead-stock-banner" role="alert" style={{ marginTop: 18, marginBottom: 4 }}>
          <div className="ds-icon"><AlertOctagon /></div>
          <div className="ds-body">
            <div className="ds-title">Dead-stock analysis unavailable</div>
            <div className="ds-sub">Sale history could not be loaded. Try refreshing the dashboard.</div>
          </div>
        </div>
      ) : data.deadStockCount !== null && data.deadStockCount > 0 && (
        <>
          <div className="dead-stock-banner" style={{ marginTop: 18, marginBottom: 4 }}>
            <div className="ds-icon"><AlertOctagon /></div>
            <div className="ds-body">
              <div className="ds-title">Dead Stock Alert</div>
              <div className="ds-sub">{data.deadStockCount} product{data.deadStockCount > 1 ? 's have' : ' has'} been in stock for 1+ year without any sales. Consider discounting or clearing them.</div>
            </div>
            <div className="ds-count">{formatNumber(data.deadStockCount)}</div>
          </div>
          <div className="db-panel" style={{ marginBottom: 12 }}>
            <div className="db-panel-head">
              <div className="db-panel-title">
                <span className="db-pt-ico p-rose"><AlertOctagon size={16} /></span>
                Dead Stock by Product &amp; Category
              </div>
            </div>
            <div className="db-deadstock-list">
              {data.deadStockProducts.map((item) => (
                <div key={`${item.name}-${item.category_name}`} className="db-deadstock-item">
                  <div className="db-deadstock-name">{item.name}</div>
                  <div className="db-deadstock-meta">
                    <span className="db-deadstock-pill">{item.category_name ?? 'Uncategorized'}</span>
                    <span>Stock: {formatNumber(item.stockCount)}</span>
                    <span>•</span>
                    <span>Last sale: {item.lastSaleDate ? new Date(item.lastSaleDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Alerts & Dues */}
      <div className="db-section">
        <span className="db-section-title">Alerts &amp; Dues</span>
        <span className="db-section-line" />
      </div>
      <div className="db-alert-band">
        <div className="db-alert a-amber" style={{ animationDelay: '0.30s' }}>
          <div className="db-alert-icon"><AlertTriangle /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Low Stock Items</div>
            <div className="db-alert-value">{formatNumber(data.lowStock)}</div>
          </div>
        </div>
        <div className="db-alert a-rose" style={{ animationDelay: '0.33s' }}>
          <div className="db-alert-icon"><AlertTriangle /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Out of Stock</div>
            <div className="db-alert-value">{formatNumber(data.outOfStock)}</div>
          </div>
        </div>
        <div className="db-alert a-blue" style={{ animationDelay: '0.36s' }}>
          <div className="db-alert-icon"><Users /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Customer Due</div>
            <div className="db-alert-value">{formatCurrency(data.customerDue)}</div>
          </div>
        </div>
        <div className="db-alert a-slate" style={{ animationDelay: '0.39s' }}>
          <div className="db-alert-icon"><Truck /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Supplier Due</div>
            <div className="db-alert-value">{formatCurrency(data.supplierDue)}</div>
          </div>
        </div>
      </div>

      {/* Category-wise Stock — clean strip cards */}
      <div className="db-section">
        <span className="db-section-title">Category-wise Stock</span>
        <span className="db-section-line" />
      </div>
      <div className="db-panel" style={{ animationDelay: '0.42s' }}>
        <div className="db-panel-head">
          <div className="db-panel-title">
            <span className="db-pt-ico p-indigo"><Boxes size={16} /></span>
            Categories
            <span className="db-badge" style={{ background: '#eef2ff', color: '#4338ca' }}>
              {data.categoryStats.length}
            </span>
          </div>
        </div>
        {data.categoryStats.length === 0 ? (
          <div className="db-empty">
            <Boxes size={26} />
            <div>No categories yet</div>
          </div>
        ) : (
          <div className="db-cat-strip">
            {data.categoryStats.map((cat) => (
              <div key={cat.name} className="db-cat">
                <div className="db-cat-top">
                  <div className="db-cat-name" title={cat.name}>{cat.name}</div>
                  <span className="db-cat-type">{cat.inventory_type}</span>
                </div>
                <div className="db-cat-grid">
                  <div className="db-cat-stat">
                    <span className="db-cat-stat-label">Total Count</span>
                    <span className="db-cat-stat-value">{formatNumber(cat.total_count)}</span>
                  </div>
                  <div className="db-cat-stat">
                    <span className="db-cat-stat-label">Available</span>
                    <span className="db-cat-stat-value">{formatNumber(cat.available_count)}</span>
                  </div>
                  {cat.inventory_type !== 'piece' && (
                    <>
                      <div className="db-cat-stat">
                        <span className="db-cat-stat-label">Total Sq.Ft</span>
                        <span className="db-cat-stat-value">{formatNumber(cat.total_sqft)}</span>
                      </div>
                      <div className="db-cat-stat">
                        <span className="db-cat-stat-label">Avail. Sq.Ft</span>
                        <span className="db-cat-stat-value">{formatNumber(cat.available_sqft)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom: Recent Sales & Purchases — properly designed */}
      <div className="db-section">
        <span className="db-section-title">Recent Activity</span>
        <span className="db-section-line" />
      </div>
      <div className="db-bottom-grid">
        {/* Recent Sales */}
        <div className="db-panel" style={{ animationDelay: '0.46s' }}>
          <div className="db-panel-head">
            <div className="db-panel-title">
              <span className="db-pt-ico p-green"><TrendingUp size={16} /></span>
              Recent Sales
            </div>
            <Link to="/sales" className="db-panel-link">
              View All <ChevronRight size={14} />
            </Link>
          </div>
          {data.recentSales.length === 0 ? (
            <div className="db-empty">
              <ShoppingCart size={26} />
              <div>No sales yet</div>
            </div>
          ) : (
            <table className="db-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="db-cell-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="db-invoice">{s.invoice_number}</div>
                      <div className="db-date">
                        {new Date(s.sale_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td>
                      <div className="db-customer">
                        <div className="db-avatar">{s.customer_name.charAt(0).toUpperCase()}</div>
                        <span className="db-customer-name">{s.customer_name}</span>
                      </div>
                    </td>
                    <td className="db-cell-right">
                      <span className="db-amount">{formatCurrency(s.grand_total)}</span>
                    </td>
                    <td>
                      <span className={`db-badge ${s.payment_status}`}>{s.payment_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Purchases */}
        <div className="db-panel" style={{ animationDelay: '0.50s' }}>
          <div className="db-panel-head">
            <div className="db-panel-title">
              <span className="db-pt-ico p-amber"><Truck size={16} /></span>
              Recent Purchases
            </div>
            <Link to="/purchases" className="db-panel-link">
              View All <ChevronRight size={14} />
            </Link>
          </div>
          {data.recentPurchases.length === 0 ? (
            <div className="db-empty">
              <Truck size={26} />
              <div>No purchases yet</div>
            </div>
          ) : (
            <table className="db-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th className="db-cell-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPurchases.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="db-invoice">{p.invoice_number}</div>
                      <div className="db-date">
                        {new Date(p.purchase_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td>
                      <div className="db-customer">
                        <div className="db-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', boxShadow: '0 6px 14px -8px rgba(245,158,11,.9)' }}>
                          {p.supplier_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="db-customer-name">{p.supplier_name}</span>
                      </div>
                    </td>
                    <td className="db-cell-right">
                      <span className="db-amount">{formatCurrency(p.total_amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
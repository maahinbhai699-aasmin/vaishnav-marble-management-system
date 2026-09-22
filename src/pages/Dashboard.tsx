import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatNumber } from '../lib/utils'
import { Loading } from '../components/Feedback'
import {
  TrendingUp, Wallet, Package, Layers, Boxes, AlertTriangle,
  Users, Truck, DollarSign, ShoppingCart, ArrowDownRight, ArrowUpRight, ChevronRight,
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
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [salesToday, purchasesToday, expensesToday, products, slabs, customers, suppliers, lowStockP, outStockP] = await Promise.all([
      supabase.from('sales').select('grand_total, paid_amount, sale_date').eq('sale_date', today),
      supabase.from('purchases').select('total_amount, purchase_date').eq('purchase_date', today),
      supabase.from('expenses').select('amount, expense_date').eq('expense_date', today),
      supabase.from('products').select('id, stock_count, stock_sqft, cost_price, min_stock_level, category:categories(inventory_type)'),
      supabase.from('slabs').select('total_sqft, remaining_sqft, status'),
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
    const availableSlabs = slabData.filter((s) => s.status === 'available')
    const totalSqft = slabData.reduce((s: number, r: any) => s + Number(r.remaining_sqft), 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerDue = (customers.data ?? []).reduce((s: number, r: any) => s + Number(r.total_due), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplierDue = (suppliers.data ?? []).reduce((s: number, r: any) => s + Number(r.total_due), 0)

    const [recentSales, recentPurchases, categories] = await Promise.all([
      supabase.from('sales').select('id, invoice_number, customer_name, grand_total, sale_date, payment_status').order('created_at', { ascending: false }).limit(5),
      supabase.from('purchases').select('id, invoice_number, total_amount, purchase_date, supplier:suppliers(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('categories').select('id, name, inventory_type, display_order').order('display_order'),
    ])

    const categoryStats: Array<{ name: string; inventory_type: string; total_count: number; total_sqft: number; available_count: number; available_sqft: number }> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cat of (categories.data ?? []) as any[]) {
      const activeSlabs = slabData.filter((s: any) => s.status !== 'sold' && s.status !== 'damaged')
      const total_count = cat.inventory_type === 'slab'
        ? activeSlabs.length
        : (products.data ?? []).reduce((s: number, p: any) => s + Number(p.stock_count), 0)
      const total_sqft = cat.inventory_type === 'slab'
        ? activeSlabs.reduce((s: number, r: any) => s + Number(r.total_sqft), 0)
        : cat.inventory_type === 'box' || cat.inventory_type === 'mixed'
        ? (products.data ?? []).reduce((s: number, p: any) => s + Number(p.stock_sqft), 0)
        : 0
      const available_count = cat.inventory_type === 'slab'
        ? availableSlabs.length
        : total_count
      const available_sqft = cat.inventory_type === 'slab'
        ? activeSlabs.reduce((s: number, r: any) => s + Number(r.remaining_sqft), 0)
        : cat.inventory_type === 'box' || cat.inventory_type === 'mixed' ? total_sqft : 0
      categoryStats.push({ name: cat.name, inventory_type: cat.inventory_type, total_count, total_sqft, available_count, available_sqft })
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
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading || !data) return <Loading label="Loading dashboard..." />

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="db-root">
      <style>{`
        .db-root {
          --db-bg: var(--n-50, #f8fafc);
          --db-card: #ffffff;
          --db-border: var(--border, #e2e8f0);
          --db-text: var(--n-900, #0f172a);
          --db-muted: var(--n-500, #64748b);
          --db-soft: var(--n-400, #94a3b8);
          animation: dbFade 0.35s ease both;
        }
        @keyframes dbFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dbRise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
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
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--db-text);
        }
        .db-header-sub {
          margin-top: 4px;
          font-size: 13.5px;
          color: var(--db-muted);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .db-header-sub .db-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.15);
        }

        /* ── Section label ── */
        .db-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 26px 0 12px;
        }
        .db-section-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--db-muted);
        }
        .db-section-line {
          flex: 1;
          height: 1px;
          background: var(--db-border);
          margin-left: 14px;
        }

        /* ── Stat cards (KPI) ── */
        .db-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
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
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
          animation: dbRise 0.4s ease both;
          transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }
        .db-kpi:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          border-color: #cbd5e1;
        }
        .db-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .db-kpi-label {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--db-muted);
          letter-spacing: 0.01em;
        }
        .db-kpi-icon {
          width: 38px; height: 38px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .db-kpi-icon svg { width: 19px; height: 19px; }
        .db-kpi-icon.blue   { background: #eff6ff; color: #2563eb; }
        .db-kpi-icon.violet { background: #f5f3ff; color: #7c3aed; }
        .db-kpi-icon.rose   { background: #fff1f2; color: #e11d48; }
        .db-kpi-icon.green  { background: #ecfdf5; color: #059669; }
        .db-kpi-icon.amber  { background: #fffbeb; color: #d97706; }
        .db-kpi-icon.slate  { background: #f1f5f9; color: #475569; }
        .db-kpi-icon.cyan   { background: #ecfeff; color: #0891b2; }
        .db-kpi-icon.indigo { background: #eef2ff; color: #4f46e5; }

        .db-kpi-value {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.02em;
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
          font-weight: 500;
        }
        .db-kpi-foot .db-pos { color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; }
        .db-kpi-foot .db-neg { color: #dc2626; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; }

        /* ── Alert band ── */
        .db-alert-band {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-top: 6px;
        }
        @media (max-width: 1100px) {
          .db-alert-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .db-alert-band { grid-template-columns: 1fr; }
        }
        .db-alert {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: dbRise 0.4s ease both;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .db-alert:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
        }
        .db-alert-icon {
          width: 40px; height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .db-alert-icon svg { width: 19px; height: 19px; }
        .db-alert-icon.amber { background: #fffbeb; color: #d97706; }
        .db-alert-icon.rose  { background: #fff1f2; color: #e11d48; }
        .db-alert-icon.blue  { background: #eff6ff; color: #2563eb; }
        .db-alert-icon.slate { background: #f1f5f9; color: #475569; }
        .db-alert-body { min-width: 0; flex: 1; }
        .db-alert-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--db-muted);
          letter-spacing: 0.01em;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-alert-value {
          font-size: 17px;
          font-weight: 800;
          color: var(--db-text);
          letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
        }

        /* ── Panel (generic card) ── */
        .db-panel {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          border-radius: 14px;
          overflow: hidden;
          animation: dbRise 0.45s ease both;
        }
        .db-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--db-border);
        }
        .db-panel-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--db-text);
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .db-panel-title svg { color: var(--db-muted); }
        .db-panel-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--db-muted);
          text-decoration: none;
          transition: color 0.18s ease, gap 0.18s ease;
        }
        .db-panel-link:hover { color: #4f46e5; gap: 6px; }

        /* ── Table ── */
        .db-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .db-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
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
        .db-table tbody tr { transition: background 0.15s ease; }
        .db-table tbody tr:hover { background: #f8fafc; }
        .db-table .db-cell-right { text-align: right; }
        .db-invoice {
          font-weight: 600;
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
          width: 30px; height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          color: #4338ca;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          flex-shrink: 0;
          letter-spacing: -0.02em;
        }
        .db-customer-name {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-amount {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--db-text);
        }
        .db-date {
          font-size: 12px;
          color: var(--db-soft);
        }
        .db-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--db-soft);
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .db-empty svg { opacity: 0.4; }

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
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: capitalize;
          line-height: 1.4;
        }
        .db-badge::before {
          content: '';
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .db-badge.paid    { background: #ecfdf5; color: #047857; }
        .db-badge.partial { background: #fffbeb; color: #b45309; }
        .db-badge.unpaid  { background: #fff1f2; color: #be123c; }

        /* ── Category strip ── */
        .db-cat-strip {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
          padding: 16px 18px;
        }
        .db-cat {
          border: 1px solid var(--db-border);
          border-radius: 12px;
          padding: 14px;
          background: #fbfdff;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }
        .db-cat:hover {
          border-color: #c7d2fe;
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.06);
          transform: translateY(-2px);
        }
        .db-cat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .db-cat-name {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--db-text);
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .db-cat-type {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--db-muted);
          background: #f1f5f9;
          padding: 3px 7px;
          border-radius: 6px;
          flex-shrink: 0;
        }
        .db-cat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .db-cat-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .db-cat-stat-label {
          font-size: 11px;
          color: var(--db-soft);
          font-weight: 500;
        }
        .db-cat-stat-value {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--db-text);
          font-variant-numeric: tabular-nums;
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
        <Link to="/pos" className="btn btn-primary">
          <ShoppingCart size={16} /> New Sale
        </Link>
      </div>

      {/* Today's KPI */}
      <div className="db-section">
        <span className="db-section-title">Today's Performance</span>
        <span className="db-section-line" />
      </div>
      <div className="db-kpi-grid">
        <div className="db-kpi" style={{ animationDelay: '0.02s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Sales</span>
            <span className="db-kpi-icon blue"><TrendingUp /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todaySales)}</div>
          <div className="db-kpi-foot">
            <span className="db-pos"><ArrowUpRight size={12} /> Revenue</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.06s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Purchase</span>
            <span className="db-kpi-icon violet"><ArrowDownRight /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todayPurchase)}</div>
          <div className="db-kpi-foot">
            <span className="db-neg"><ArrowDownRight size={12} /> Outflow</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.10s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Expenses</span>
            <span className="db-kpi-icon rose"><Wallet /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.todayExpenses)}</div>
          <div className="db-kpi-foot">
            <span className="db-neg"><ArrowDownRight size={12} /> Outflow</span>
            <span>· Today</span>
          </div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.14s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Today's Profit</span>
            <span className="db-kpi-icon green"><DollarSign /></span>
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
        <div className="db-kpi" style={{ animationDelay: '0.16s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Products</span>
            <span className="db-kpi-icon indigo"><Package /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalProducts)}</div>
          <div className="db-kpi-foot">Active products</div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.20s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Slabs</span>
            <span className="db-kpi-icon cyan"><Layers /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalSlabs)}</div>
          <div className="db-kpi-foot">In stock</div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.24s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Total Sq.Ft</span>
            <span className="db-kpi-icon blue"><Boxes /></span>
          </div>
          <div className="db-kpi-value">{formatNumber(data.totalSqft)}</div>
          <div className="db-kpi-foot">Remaining area</div>
        </div>

        <div className="db-kpi" style={{ animationDelay: '0.28s' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-label">Stock Value</span>
            <span className="db-kpi-icon green"><DollarSign /></span>
          </div>
          <div className="db-kpi-value">{formatCurrency(data.totalStockValue)}</div>
          <div className="db-kpi-foot">At cost price</div>
        </div>
      </div>

      {/* Alerts & Dues */}
      <div className="db-section">
        <span className="db-section-title">Alerts & Dues</span>
        <span className="db-section-line" />
      </div>
      <div className="db-alert-band">
        <div className="db-alert" style={{ animationDelay: '0.30s' }}>
          <div className="db-alert-icon amber"><AlertTriangle /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Low Stock Items</div>
            <div className="db-alert-value">{formatNumber(data.lowStock)}</div>
          </div>
        </div>
        <div className="db-alert" style={{ animationDelay: '0.33s' }}>
          <div className="db-alert-icon rose"><AlertTriangle /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Out of Stock</div>
            <div className="db-alert-value">{formatNumber(data.outOfStock)}</div>
          </div>
        </div>
        <div className="db-alert" style={{ animationDelay: '0.36s' }}>
          <div className="db-alert-icon blue"><Users /></div>
          <div className="db-alert-body">
            <div className="db-alert-label">Customer Due</div>
            <div className="db-alert-value">{formatCurrency(data.customerDue)}</div>
          </div>
        </div>
        <div className="db-alert" style={{ animationDelay: '0.39s' }}>
          <div className="db-alert-icon slate"><Truck /></div>
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
            <Boxes size={16} /> Categories
            <span className="db-badge" style={{ background: '#eef2ff', color: '#4338ca', marginLeft: 6 }}>
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
              <TrendingUp size={16} /> Recent Sales
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
              <Truck size={16} /> Recent Purchases
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
                        <div className="db-avatar" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#b45309' }}>
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
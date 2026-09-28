import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatNumber } from '../lib/utils'
import { exportToExcel } from '../lib/excelExport'
import { TrendingUp, TrendingDown, Wallet, DollarSign, Package, Users, Truck, Download, BarChart3 } from 'lucide-react'

export function Reports() {
  const [loading, setLoading] = useState(true)
  const [reportType, setReportType] = useState('sales_summary')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<any>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let from = dateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    let to = dateTo || new Date().toISOString().split('T')[0]

    if (reportType === 'daily_product_sales') {
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, description, unit, quantity, sqft, amount, cost_amount, gross_profit, sale:sales!inner(sale_date)')
        .gte('sale.sale_date', from)
        .lte('sale.sale_date', to)

      const byProduct: Record<string, { description: string; unit: string; quantity: number; sqft: number; revenue: number; cost: number; profit: number }> = {}
      let totalRevenue = 0, totalCost = 0, totalProfit = 0, totalQuantity = 0, totalSqft = 0
      for (const item of items ?? []) {
        const key = item.product_id ?? item.description ?? 'Unknown product'
        if (!byProduct[key]) byProduct[key] = { description: item.description ?? 'Unknown product', unit: item.unit ?? '-', quantity: 0, sqft: 0, revenue: 0, cost: 0, profit: 0 }
        byProduct[key].quantity += Number(item.quantity)
        byProduct[key].sqft += Number(item.sqft)
        byProduct[key].revenue += Number(item.amount)
        byProduct[key].cost += Number(item.cost_amount)
        byProduct[key].profit += Number(item.gross_profit)
        totalQuantity += Number(item.quantity)
        totalSqft += Number(item.sqft)
        totalRevenue += Number(item.amount)
        totalCost += Number(item.cost_amount)
        totalProfit += Number(item.gross_profit)
      }
      setData({ type: 'daily_product_sales', rows: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue), totalQuantity, totalSqft, totalRevenue, totalCost, totalProfit })
    } else if (reportType === 'sales_summary') {
      const { data: sales } = await supabase.from('sales').select('*').gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false })
      const total = (sales ?? []).reduce((s: number, r: { grand_total: number }) => s + Number(r.grand_total), 0)
      const paid = (sales ?? []).reduce((s: number, r: { paid_amount: number }) => s + Number(r.paid_amount), 0)
      const due = (sales ?? []).reduce((s: number, r: { due_amount: number }) => s + Number(r.due_amount), 0)
      const profit = (sales ?? []).reduce((s: number, r: { grand_total: number; due_amount: number }) => s + (Number(r.grand_total) - Number(r.due_amount)), 0)
      setData({ type: 'sales_summary', sales: sales ?? [], total, paid, due, profit })
    } else if (reportType === 'purchase_summary') {
      const { data: purchases } = await supabase.from('purchases').select('*, supplier:suppliers(name)').gte('purchase_date', from).lte('purchase_date', to).order('purchase_date', { ascending: false })
      const total = (purchases ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount), 0)
      const paid = (purchases ?? []).reduce((s: number, r: { paid_amount: number }) => s + Number(r.paid_amount), 0)
      const due = (purchases ?? []).reduce((s: number, r: { due_amount: number }) => s + Number(r.due_amount), 0)
      setData({ type: 'purchase_summary', purchases: purchases ?? [], total, paid, due })
    } else if (reportType === 'profit') {
      const { data: items } = await supabase.from('sale_items').select('*, sale:sales(sale_date), product:products(name), category:categories(name)').gte('sale.sale_date', from).lte('sale.sale_date', to)
      const byCategory: Record<string, { revenue: number; cost: number; profit: number }> = {}
      let totalRevenue = 0, totalCost = 0, totalProfit = 0
      for (const item of items ?? []) {
        const catName = (item as any).category?.name ?? 'Uncategorized'
        if (!byCategory[catName]) byCategory[catName] = { revenue: 0, cost: 0, profit: 0 }
        byCategory[catName].revenue += Number(item.amount)
        byCategory[catName].cost += Number(item.cost_amount)
        byCategory[catName].profit += Number(item.gross_profit)
        totalRevenue += Number(item.amount)
        totalCost += Number(item.cost_amount)
        totalProfit += Number(item.gross_profit)
      }
      setData({ type: 'profit', byCategory, totalRevenue, totalCost, totalProfit, items: items ?? [] })
    } else if (reportType === 'stock_valuation') {
      const { data: products } = await supabase.from('products').select('*, category:categories(name)').order('name')
      let totalValue = 0
      const rows = (products ?? []).map((p: any) => {
        const invType = p.category?.inventory_type ?? 'piece'
        const stock = invType === 'piece' ? p.stock_count : p.stock_sqft
        const value = Number(p.cost_price) * Number(stock)
        totalValue += value
        return { ...p, stock, value }
      })
      setData({ type: 'stock_valuation', rows, totalValue })
    } else if (reportType === 'customer_due') {
      const { data: customers } = await supabase.from('customers').select('*').gt('total_due', 0).order('total_due', { ascending: false })
      const totalDue = (customers ?? []).reduce((s: number, r: { total_due: number }) => s + Number(r.total_due), 0)
      setData({ type: 'customer_due', customers: customers ?? [], totalDue })
    } else if (reportType === 'supplier_due') {
      const { data: suppliers } = await supabase.from('suppliers').select('*').gt('total_due', 0).order('total_due', { ascending: false })
      const totalDue = (suppliers ?? []).reduce((s: number, r: { total_due: number }) => s + Number(r.total_due), 0)
      setData({ type: 'supplier_due', suppliers: suppliers ?? [], totalDue })
    } else if (reportType === 'expenses') {
      const { data: expenses } = await supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false })
      const byCategory: Record<string, number> = {}
      let total = 0
      for (const e of expenses ?? []) {
        const cat = (e as any).category_name ?? 'Other'
        byCategory[cat] = (byCategory[cat] ?? 0) + Number((e as any).amount)
        total += Number((e as any).amount)
      }
      setData({ type: 'expenses', expenses: expenses ?? [], byCategory, total })
    }
    setLoading(false)
  }, [reportType, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExportExcel = () => {
    if (!data) return
    let rows: Record<string, unknown>[] = []
    let filename = 'report'

    if (data.type === 'sales_summary') {
      filename = `sales_summary_${dateFrom || 'all'}_to_${dateTo || 'today'}`
      rows = data.sales.map((s: any) => ({
        Invoice: s.invoice_number, Date: formatDate(s.sale_date), Customer: s.customer_name ?? 'Walk-in',
        Total: Number(s.grand_total), Paid: Number(s.paid_amount), Due: Number(s.due_amount), Status: s.payment_status,
      }))
    } else if (data.type === 'daily_product_sales') {
      filename = `product_sales_${dateFrom || 'all'}_to_${dateTo || 'today'}`
      rows = data.rows.map((r: any) => ({
        Product: r.description, Unit: r.unit, Quantity: r.quantity, 'Sq.Ft': r.sqft,
        Revenue: r.revenue, Cost: r.cost, Profit: r.profit,
      }))
    } else if (data.type === 'purchase_summary') {
      filename = `purchase_summary_${dateFrom || 'all'}_to_${dateTo || 'today'}`
      rows = data.purchases.map((p: any) => ({
        Invoice: p.invoice_number, Date: formatDate(p.purchase_date), Supplier: p.supplier?.name ?? '-',
        Total: Number(p.total_amount), Paid: Number(p.paid_amount), Due: Number(p.due_amount),
      }))
    } else if (data.type === 'profit') {
      filename = `profit_analysis_${dateFrom || 'all'}_to_${dateTo || 'today'}`
      rows = Object.entries(data.byCategory).map(([cat, v]: [string, any]) => ({
        Category: cat, Revenue: v.revenue, Cost: v.cost, Profit: v.profit,
        Margin: v.revenue > 0 ? `${(v.profit / v.revenue * 100).toFixed(1)}%` : '-',
      }))
    } else if (data.type === 'stock_valuation') {
      filename = 'stock_valuation'
      rows = data.rows.map((p: any) => ({
        Product: p.name, Category: p.category?.name ?? '-', Stock: p.stock,
        'Cost Price': Number(p.cost_price), Value: p.value,
      }))
    } else if (data.type === 'customer_due') {
      filename = 'customer_dues'
      rows = data.customers.map((c: any) => ({
        Customer: c.name, Mobile: c.mobile ?? '-', Type: c.customer_type,
        'Total Purchase': Number(c.total_purchase), Paid: Number(c.total_paid), Due: Number(c.total_due),
      }))
    } else if (data.type === 'supplier_due') {
      filename = 'supplier_dues'
      rows = data.suppliers.map((s: any) => ({
        Supplier: s.name, Company: s.company_name ?? '-', Mobile: s.mobile ?? '-',
        'Total Purchase': Number(s.total_purchase), Paid: Number(s.total_paid), Due: Number(s.total_due),
      }))
    } else if (data.type === 'expenses') {
      filename = `expenses_${dateFrom || 'all'}_to_${dateTo || 'today'}`
      rows = data.expenses.map((e: any) => ({
        Date: formatDate(e.expense_date), Category: e.category_name ?? '-',
        Description: e.description ?? '-', Amount: Number(e.amount),
      }))
    }

    if (rows.length > 0) {
      exportToExcel(rows, filename, data.type)
    }
  }

  const hideDates = reportType === 'stock_valuation' || reportType === 'customer_due' || reportType === 'supplier_due'

  return (
    <div className="rp-root">
      <style>{`
        .rp-root {
          --rp-card: #ffffff;
          --rp-border: #e6ebf2;
          --rp-text: #0f172a;
          --rp-muted: #64748b;
          --rp-soft: #94a3b8;
          display: grid;
          gap: 18px;
          animation: rpFade .38s ease both;
        }
        @keyframes rpFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rpRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes rpRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes rpShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
        @keyframes rpSpin { to { transform: rotate(360deg); } }
        @keyframes rpBarGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        /* ═══ Header ═══ */
        .rp-header {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          padding: 22px 24px;
          border-radius: 20px;
          background:
            radial-gradient(circle at 12% 20%, rgba(99,102,241,.18), transparent 42%),
            radial-gradient(circle at 88% 80%, rgba(6,182,212,.18), transparent 46%),
            linear-gradient(135deg, #ffffff, #f7f9ff);
          border: 1px solid #e0e7ff;
          box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
          overflow: hidden;
        }
        .rp-header::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #06b6d4, #10b981, #f59e0b, #f43f5e);
        }
        .rp-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #4f46e5 55%, #06b6d4 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .rp-header-sub {
          margin-top: 6px;
          font-size: 13.5px;
          color: var(--rp-muted);
          font-weight: 500;
        }
        .rp-header-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 8px;
          padding: 3px 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          color: #4338ca;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        /* Export Button */
        .rp-export {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 20px;
          border-radius: 12px;
          background: linear-gradient(115deg, #4f46e5, #06b6d4);
          border: none;
          color: #fff;
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: .01em;
          cursor: pointer;
          overflow: hidden;
          isolation: isolate;
          box-shadow: 0 14px 28px -14px rgba(79,70,229,.85);
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
        }
        .rp-export::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
          transform: translateX(-140%);
          z-index: -1;
        }
        .rp-export:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 34px -14px rgba(79,70,229,.95);
        }
        .rp-export:hover::after { animation: rpShine .9s ease; }
        .rp-export:active { transform: scale(.96); }
        .rp-export svg { transition: transform .34s ease; }
        .rp-export:hover svg { transform: translateY(2px); }

        /* ═══ Filters Bar ═══ */
        .rp-filters {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) auto auto;
          gap: 12px;
          align-items: center;
          padding: 14px;
          background: linear-gradient(135deg, #ffffff, #f8fafc);
          border: 1px solid var(--rp-border);
          border-radius: 16px;
          box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
          animation: rpRise .45s cubic-bezier(.22,1,.36,1) .05s both;
        }
        @media (max-width: 780px) {
          .rp-filters { grid-template-columns: 1fr; }
        }
        .rp-select-wrap {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          height: 46px;
          border-radius: 12px;
          border: 1.5px solid var(--rp-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .rp-select-wrap:focus-within {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 4px rgba(99,102,241,.14);
          transform: translateY(-1px);
        }
        .rp-select-wrap svg { color: #4f46e5; flex-shrink: 0; }
        .rp-select-wrap select {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 700;
          color: var(--rp-text);
          height: 100%;
          cursor: pointer;
          appearance: none;
        }
        .rp-select-wrap::after {
          content: '';
          width: 8px; height: 8px;
          border-right: 2px solid #6366f1;
          border-bottom: 2px solid #6366f1;
          transform: rotate(45deg) translateY(-2px);
          margin-left: -8px;
          pointer-events: none;
        }

        .rp-date {
          position: relative;
          display: flex;
          align-items: center;
          height: 46px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1.5px solid var(--rp-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .rp-date:focus-within {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 4px rgba(99,102,241,.14);
          transform: translateY(-1px);
        }
        .rp-date input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 13.5px;
          font-weight: 700;
          color: var(--rp-text);
          font-variant-numeric: tabular-nums;
          cursor: pointer;
          width: 100%;
        }
        .rp-date input::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: .6;
        }

        /* ═══ Stat Cards ═══ */
        .rp-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 14px;
        }
        .rp-stat {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--rp-card);
          border: 1px solid var(--rp-border);
          border-radius: 16px;
          padding: 16px 18px;
          animation: rpRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .rp-stat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--rc1), var(--rc2));
        }
        .rp-stat::after {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 140px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--rc1) 0%, transparent 68%);
          opacity: .12;
          z-index: -1;
          transition: opacity .35s ease, transform .45s ease;
        }
        .rp-stat:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 22px 34px -22px var(--rcs), 0 3px 10px -4px rgba(15,23,42,.06);
        }
        .rp-stat:hover::after { opacity: .22; transform: scale(1.18); }

        .rp-stat.c-indigo { --rc1:#6366f1; --rc2:#818cf8; --rcs: rgba(99,102,241,.55); }
        .rp-stat.c-blue   { --rc1:#3b82f6; --rc2:#60a5fa; --rcs: rgba(59,130,246,.55); }
        .rp-stat.c-emerald{ --rc1:#10b981; --rc2:#34d399; --rcs: rgba(16,185,129,.55); }
        .rp-stat.c-amber  { --rc1:#f59e0b; --rc2:#fbbf24; --rcs: rgba(245,158,11,.55); }
        .rp-stat.c-rose   { --rc1:#f43f5e; --rc2:#fb7185; --rcs: rgba(244,63,94,.55); }
        .rp-stat.c-cyan   { --rc1:#06b6d4; --rc2:#22d3ee; --rcs: rgba(6,182,212,.55); }
        .rp-stat.c-violet { --rc1:#8b5cf6; --rc2:#c084fc; --rcs: rgba(139,92,246,.55); }

        .rp-stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .rp-stat-label {
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--rp-muted);
        }
        .rp-stat-ico {
          width: 40px; height: 40px;
          border-radius: 12px;
          display: grid; place-items: center;
          color: #fff;
          background: linear-gradient(135deg, var(--rc1), var(--rc2));
          box-shadow: 0 10px 20px -10px var(--rcs);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .rp-stat-ico svg { width: 19px; height: 19px; }
        .rp-stat:hover .rp-stat-ico { transform: scale(1.12) rotate(-8deg); }
        .rp-stat-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -.025em;
          color: var(--rp-text);
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
        }

        /* ═══ Panels / Tables ═══ */
        .rp-panel {
          background: var(--rp-card);
          border: 1px solid var(--rp-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
          animation: rpRise .5s cubic-bezier(.22,1,.36,1) .1s both;
          transition: box-shadow .26s ease, border-color .26s ease;
        }
        .rp-panel:hover {
          box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
          border-color: #dbe3ee;
        }
        .rp-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--rp-border);
          background: linear-gradient(180deg, #fbfdff, #ffffff);
        }
        .rp-panel-title {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -.01em;
          color: var(--rp-text);
        }
        .rp-panel-title .ico {
          width: 32px; height: 32px;
          border-radius: 10px;
          display: grid; place-items: center;
          color: #fff;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 8px 16px -8px rgba(99,102,241,.9);
        }
        .rp-panel-title .ico.green { background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 8px 16px -8px rgba(16,185,129,.9); }
        .rp-panel-title .ico.amber { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 8px 16px -8px rgba(245,158,11,.9); }
        .rp-panel-title .ico.cyan  { background: linear-gradient(135deg, #06b6d4, #22d3ee); box-shadow: 0 8px 16px -8px rgba(6,182,212,.9); }

        .rp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .rp-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--rp-soft);
          padding: 13px 18px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          border-bottom: 1px solid var(--rp-border);
          white-space: nowrap;
        }
        .rp-table tbody td {
          padding: 13px 18px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--rp-text);
          vertical-align: middle;
        }
        .rp-table tbody tr:last-child td { border-bottom: none; }
        .rp-table tbody tr {
          animation: rpRowIn .4s ease both;
          transition: background .16s ease, box-shadow .16s ease;
        }
        .rp-table tbody tr:hover {
          background: linear-gradient(90deg, #f8fafc, #ffffff);
          box-shadow: inset 3px 0 0 #6366f1;
        }
        .rp-table .row-warn { box-shadow: inset 3px 0 0 #f59e0b; }
        .rp-table .row-warn:hover { box-shadow: inset 3px 0 0 #f59e0b, 0 6px 20px -18px rgba(245,158,11,.7); }
        .rp-table .row-ok { box-shadow: inset 3px 0 0 #10b981; }
        .rp-table .row-ok:hover { box-shadow: inset 3px 0 0 #10b981, 0 6px 20px -18px rgba(16,185,129,.7); }
        .rp-table .row-bad { box-shadow: inset 3px 0 0 #f43f5e; }
        .rp-table .row-bad:hover { box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7); }

        .rp-text-right { text-align: right !important; }
        .rp-amount-pos { color: #059669; font-weight: 800; font-variant-numeric: tabular-nums; }
        .rp-amount-neg { color: #e11d48; font-weight: 800; font-variant-numeric: tabular-nums; }
        .rp-amount-bold { color: #0f172a; font-weight: 800; font-variant-numeric: tabular-nums; }
        .rp-amount-primary {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .rp-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .025em;
          text-transform: capitalize;
          white-space: nowrap;
        }
        .rp-badge::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .rp-badge.paid    { background: #ecfdf5; color: #047857; }
        .rp-badge.partial { background: #fffbeb; color: #b45309; }
        .rp-badge.unpaid  { background: #fff1f2; color: #be123c; }
        .rp-badge.neutral { background: #eef2ff; color: #4338ca; }
        .rp-badge.neutral::before { display: none; }

        /* Category bar chart for profit */
        .rp-margin-cell {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .rp-margin-bar {
          position: relative;
          width: 80px;
          height: 6px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
          flex-shrink: 0;
        }
        .rp-margin-bar span {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #6366f1, #06b6d4, #10b981);
          transform-origin: left;
          animation: rpBarGrow .8s cubic-bezier(.22,1,.36,1) both;
        }
        .rp-margin-val {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: #0f172a;
          min-width: 48px;
          text-align: right;
        }

        /* Loading overlay */
        .rp-loading {
          display: grid;
          place-items: center;
          padding: 60px 20px;
          color: var(--rp-muted);
          font-weight: 700;
          gap: 12px;
        }
        .rp-loading .spinner {
          width: 32px; height: 32px;
          border-radius: 50%;
          border: 3px solid #e0e7ff;
          border-top-color: #4f46e5;
          animation: rpSpin 0.9s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .rp-root *, .rp-root *::before, .rp-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      {/* ═══ Header ═══ */}
      <div className="rp-header">
        <div>
          <h2>Reports</h2>
          <div className="rp-header-sub">
            Business analytics and insights
            {!hideDates && (dateFrom || dateTo) && (
              <span className="rp-header-chip">
                {dateFrom ? formatDate(dateFrom) : 'start'} → {dateTo ? formatDate(dateTo) : 'today'}
              </span>
            )}
          </div>
        </div>
        {data && !loading && (
          <button className="rp-export" onClick={handleExportExcel}>
            <Download size={16} /> Export Excel
          </button>
        )}
      </div>

      {/* ═══ Filters ═══ */}
      <div className="rp-filters">
        <div className="rp-select-wrap">
          <BarChart3 size={18} />
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <option value="daily_product_sales">Daily Product Sales</option>
            <option value="sales_summary">Sales Summary</option>
            <option value="purchase_summary">Purchase Summary</option>
            <option value="profit">Profit Analysis</option>
            <option value="stock_valuation">Stock Valuation</option>
            <option value="customer_due">Customer Dues</option>
            <option value="supplier_due">Supplier Dues</option>
            <option value="expenses">Expense Report</option>
          </select>
        </div>
        {!hideDates && (
          <>
            <div className="rp-date">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
            </div>
            <div className="rp-date">
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="rp-loading">
          <div className="spinner" />
          Generating report…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {data?.type === 'sales_summary' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-blue" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Sales</span>
                    <span className="rp-stat-ico"><TrendingUp /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.total)}</div>
                </div>
                <div className="rp-stat c-emerald" style={{ animationDelay: '.06s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Collected</span>
                    <span className="rp-stat-ico"><DollarSign /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.paid)}</div>
                </div>
                <div className="rp-stat c-rose" style={{ animationDelay: '.10s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Outstanding</span>
                    <span className="rp-stat-ico"><Wallet /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.due)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico"><TrendingUp size={16} /></span>
                    Sales Transactions
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="rp-text-right">Total</th><th className="rp-text-right">Paid</th><th className="rp-text-right">Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.sales.map((s: any, idx: number) => (
                        <tr key={s.id} className={Number(s.due_amount) > 0 ? 'row-warn' : ''} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 800 }}>{s.invoice_number}</td>
                          <td>{formatDate(s.sale_date)}</td>
                          <td>{s.customer_name ?? 'Walk-in'}</td>
                          <td className="rp-text-right rp-amount-bold">{formatCurrency(s.grand_total)}</td>
                          <td className="rp-text-right rp-amount-pos">{formatCurrency(s.paid_amount)}</td>
                          <td className={`rp-text-right ${Number(s.due_amount) > 0 ? 'rp-amount-neg' : ''}`} style={Number(s.due_amount) <= 0 ? { color: 'var(--rp-soft)', fontWeight: 500 } : undefined}>
                            {formatCurrency(s.due_amount)}
                          </td>
                          <td>
                            <span className={`rp-badge ${s.payment_status === 'paid' ? 'paid' : s.payment_status === 'partial' ? 'partial' : 'unpaid'}`}>
                              {s.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'daily_product_sales' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-blue" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Revenue</span>
                    <span className="rp-stat-ico"><TrendingUp /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalRevenue)}</div>
                </div>
                <div className="rp-stat c-cyan" style={{ animationDelay: '.06s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Quantity Sold</span>
                    <span className="rp-stat-ico"><Package /></span>
                  </div>
                  <div className="rp-stat-value">{formatNumber(data.totalQuantity)}</div>
                </div>
                <div className="rp-stat c-violet" style={{ animationDelay: '.10s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Sq.Ft Sold</span>
                    <span className="rp-stat-ico"><Package /></span>
                  </div>
                  <div className="rp-stat-value">{formatNumber(data.totalSqft)}</div>
                </div>
                <div className="rp-stat c-emerald" style={{ animationDelay: '.14s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Gross Profit</span>
                    <span className="rp-stat-ico"><DollarSign /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalProfit)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico cyan"><Package size={16} /></span>
                    Product-wise Sales
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Product</th><th>Unit</th><th className="rp-text-right">Quantity</th><th className="rp-text-right">Sq.Ft</th><th className="rp-text-right">Revenue</th><th className="rp-text-right">Cost</th><th className="rp-text-right">Profit</th></tr></thead>
                    <tbody>
                      {data.rows.map((row: any, idx: number) => (
                        <tr key={row.description} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 700 }}>{row.description}</td>
                          <td>{row.unit}</td>
                          <td className="rp-text-right" style={{ fontWeight: 700 }}>{formatNumber(row.quantity)}</td>
                          <td className="rp-text-right">{row.sqft > 0 ? formatNumber(row.sqft) : '-'}</td>
                          <td className="rp-text-right rp-amount-bold">{formatCurrency(row.revenue)}</td>
                          <td className="rp-text-right rp-amount-neg">{formatCurrency(row.cost)}</td>
                          <td className="rp-text-right rp-amount-pos">{formatCurrency(row.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'purchase_summary' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-violet" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Purchase</span>
                    <span className="rp-stat-ico"><TrendingDown /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.total)}</div>
                </div>
                <div className="rp-stat c-emerald" style={{ animationDelay: '.06s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Paid</span>
                    <span className="rp-stat-ico"><DollarSign /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.paid)}</div>
                </div>
                <div className="rp-stat c-rose" style={{ animationDelay: '.10s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Due</span>
                    <span className="rp-stat-ico"><Wallet /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.due)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico"><TrendingDown size={16} /></span>
                    Purchase Transactions
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th className="rp-text-right">Total</th><th className="rp-text-right">Paid</th><th className="rp-text-right">Due</th></tr></thead>
                    <tbody>
                      {data.purchases.map((p: any, idx: number) => (
                        <tr key={p.id} className={Number(p.due_amount) > 0 ? 'row-warn' : ''} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 800 }}>{p.invoice_number}</td>
                          <td>{formatDate(p.purchase_date)}</td>
                          <td>{p.supplier?.name ?? '-'}</td>
                          <td className="rp-text-right rp-amount-bold">{formatCurrency(p.total_amount)}</td>
                          <td className="rp-text-right rp-amount-pos">{formatCurrency(p.paid_amount)}</td>
                          <td className={`rp-text-right ${Number(p.due_amount) > 0 ? 'rp-amount-neg' : ''}`} style={Number(p.due_amount) <= 0 ? { color: 'var(--rp-soft)', fontWeight: 500 } : undefined}>
                            {formatCurrency(p.due_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'profit' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-blue" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Revenue</span>
                    <span className="rp-stat-ico"><TrendingUp /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalRevenue)}</div>
                </div>
                <div className="rp-stat c-amber" style={{ animationDelay: '.06s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Cost</span>
                    <span className="rp-stat-ico"><Package /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalCost)}</div>
                </div>
                <div className="rp-stat c-emerald" style={{ animationDelay: '.10s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Gross Profit</span>
                    <span className="rp-stat-ico"><DollarSign /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalProfit)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico green"><DollarSign size={16} /></span>
                    Category-wise Profit
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Category</th><th className="rp-text-right">Revenue</th><th className="rp-text-right">Cost</th><th className="rp-text-right">Profit</th><th className="rp-text-right">Margin</th></tr></thead>
                    <tbody>
                      {Object.entries(data.byCategory).map(([cat, v]: [string, any], idx: number) => {
                        const margin = v.revenue > 0 ? (v.profit / v.revenue * 100) : 0
                        return (
                          <tr key={cat} className="row-ok" style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                            <td style={{ fontWeight: 700 }}>{cat}</td>
                            <td className="rp-text-right rp-amount-bold">{formatCurrency(v.revenue)}</td>
                            <td className="rp-text-right rp-amount-neg">{formatCurrency(v.cost)}</td>
                            <td className="rp-text-right rp-amount-pos">{formatCurrency(v.profit)}</td>
                            <td className="rp-text-right">
                              <div className="rp-margin-cell">
                                <div className="rp-margin-bar">
                                  <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, margin / 100))})`, animationDelay: `${Math.min(idx, 12) * 0.05 + 0.2}s` }} />
                                </div>
                                <span className="rp-margin-val">{v.revenue > 0 ? `${margin.toFixed(1)}%` : '-'}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'stock_valuation' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-indigo" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Stock Value</span>
                    <span className="rp-stat-ico"><Package /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalValue)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico"><Package size={16} /></span>
                    Stock Valuation
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Product</th><th>Category</th><th className="rp-text-right">Stock</th><th className="rp-text-right">Cost Price</th><th className="rp-text-right">Value</th></tr></thead>
                    <tbody>
                      {data.rows.map((p: any, idx: number) => (
                        <tr key={p.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 700 }}>{p.name}</td>
                          <td>{p.category?.name ?? '-'}</td>
                          <td className="rp-text-right" style={{ fontWeight: 700 }}>{p.stock}</td>
                          <td className="rp-text-right">{formatCurrency(p.cost_price)}</td>
                          <td className="rp-text-right rp-amount-primary">{formatCurrency(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'customer_due' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-rose" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Outstanding</span>
                    <span className="rp-stat-ico"><Users /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalDue)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico" style={{ background: 'linear-gradient(135deg, #f43f5e, #fb7185)', boxShadow: '0 8px 16px -8px rgba(244,63,94,.9)' }}>
                      <Users size={16} />
                    </span>
                    Customer Dues
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Customer</th><th>Mobile</th><th>Type</th><th className="rp-text-right">Total Purchase</th><th className="rp-text-right">Paid</th><th className="rp-text-right">Due</th></tr></thead>
                    <tbody>
                      {data.customers.map((c: any, idx: number) => (
                        <tr key={c.id} className="row-bad" style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 700 }}>{c.name}</td>
                          <td>{c.mobile ?? '-'}</td>
                          <td><span className="rp-badge neutral">{c.customer_type}</span></td>
                          <td className="rp-text-right">{formatCurrency(c.total_purchase)}</td>
                          <td className="rp-text-right rp-amount-pos">{formatCurrency(c.total_paid)}</td>
                          <td className="rp-text-right rp-amount-neg">{formatCurrency(c.total_due)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'supplier_due' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-rose" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Payable</span>
                    <span className="rp-stat-ico"><Truck /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.totalDue)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico" style={{ background: 'linear-gradient(135deg, #f43f5e, #fb7185)', boxShadow: '0 8px 16px -8px rgba(244,63,94,.9)' }}>
                      <Truck size={16} />
                    </span>
                    Supplier Dues
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Supplier</th><th>Company</th><th>Mobile</th><th className="rp-text-right">Total Purchase</th><th className="rp-text-right">Paid</th><th className="rp-text-right">Due</th></tr></thead>
                    <tbody>
                      {data.suppliers.map((s: any, idx: number) => (
                        <tr key={s.id} className="row-bad" style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td>{s.company_name ?? '-'}</td>
                          <td>{s.mobile ?? '-'}</td>
                          <td className="rp-text-right">{formatCurrency(s.total_purchase)}</td>
                          <td className="rp-text-right rp-amount-pos">{formatCurrency(s.total_paid)}</td>
                          <td className="rp-text-right rp-amount-neg">{formatCurrency(s.total_due)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data?.type === 'expenses' && (
            <>
              <div className="rp-stats">
                <div className="rp-stat c-rose" style={{ animationDelay: '.02s' }}>
                  <div className="rp-stat-top">
                    <span className="rp-stat-label">Total Expenses</span>
                    <span className="rp-stat-ico"><Wallet /></span>
                  </div>
                  <div className="rp-stat-value">{formatCurrency(data.total)}</div>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico amber"><Wallet size={16} /></span>
                    Expenses by Category
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Category</th><th className="rp-text-right">Amount</th></tr></thead>
                    <tbody>
                      {Object.entries(data.byCategory).map(([cat, amt]: [string, any], idx: number) => (
                        <tr key={cat} className="row-warn" style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td style={{ fontWeight: 700 }}>{cat}</td>
                          <td className="rp-text-right rp-amount-neg">{formatCurrency(amt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rp-panel">
                <div className="rp-panel-head">
                  <div className="rp-panel-title">
                    <span className="ico amber"><Wallet size={16} /></span>
                    All Expense Entries
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rp-table">
                    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="rp-text-right">Amount</th></tr></thead>
                    <tbody>
                      {data.expenses.map((e: any, idx: number) => (
                        <tr key={e.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                          <td>{formatDate(e.expense_date)}</td>
                          <td><span className="rp-badge neutral">{e.category_name}</span></td>
                          <td>{e.description ?? '-'}</td>
                          <td className="rp-text-right rp-amount-neg">{formatCurrency(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Loading } from '../components/Feedback'
import { formatCurrency, formatDate, formatNumber } from '../lib/utils'
import { TrendingUp, TrendingDown, Wallet, DollarSign, Package, Users, Truck } from 'lucide-react'

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
      let totalRevenue = 0
      let totalCost = 0
      let totalProfit = 0
      let totalQuantity = 0
      let totalSqft = 0
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Reports</h2>
          <div className="page-sub">Business analytics and insights</div>
        </div>
      </div>

      <div className="filters-bar">
        <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
          <option value="daily_product_sales">Daily Product Sales</option>
          <option value="sales_summary">Sales Summary</option>
          <option value="purchase_summary">Purchase Summary</option>
          <option value="profit">Profit Analysis</option>
          <option value="stock_valuation">Stock Valuation</option>
          <option value="customer_due">Customer Dues</option>
          <option value="supplier_due">Supplier Dues</option>
          <option value="expenses">Expense Report</option>
        </select>
        {reportType !== 'stock_valuation' && reportType !== 'customer_due' && reportType !== 'supplier_due' && (
          <>
            <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
            <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          </>
        )}
      </div>

      {loading ? <Loading label="Generating report..." /> : (
        <div>
          {data?.type === 'sales_summary' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon primary"><TrendingUp /></div><div className="stat-label">Total Sales</div><div className="stat-value">{formatCurrency(data.total)}</div></div>
                <div className="stat-card"><div className="stat-icon success"><DollarSign /></div><div className="stat-label">Collected</div><div className="stat-value">{formatCurrency(data.paid)}</div></div>
                <div className="stat-card"><div className="stat-icon error"><Wallet /></div><div className="stat-label">Outstanding</div><div className="stat-value">{formatCurrency(data.due)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th></tr></thead>
                <tbody>{data.sales.map((s: any) => (<tr key={s.id}><td className="font-semibold">{s.invoice_number}</td><td>{formatDate(s.sale_date)}</td><td>{s.customer_name ?? 'Walk-in'}</td><td className="text-right">{formatCurrency(s.grand_total)}</td><td className="text-right">{formatCurrency(s.paid_amount)}</td><td className="text-right">{formatCurrency(s.due_amount)}</td><td><span className={`badge ${s.payment_status === 'paid' ? 'badge-success' : s.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{s.payment_status}</span></td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'daily_product_sales' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon primary"><TrendingUp /></div><div className="stat-label">Revenue</div><div className="stat-value">{formatCurrency(data.totalRevenue)}</div></div>
                <div className="stat-card"><div className="stat-icon info"><Package /></div><div className="stat-label">Quantity Sold</div><div className="stat-value">{formatNumber(data.totalQuantity)}</div></div>
                <div className="stat-card"><div className="stat-icon accent"><Package /></div><div className="stat-label">Sq.Ft Sold</div><div className="stat-value">{formatNumber(data.totalSqft)}</div></div>
                <div className="stat-card"><div className="stat-icon success"><DollarSign /></div><div className="stat-label">Gross Profit</div><div className="stat-value">{formatCurrency(data.totalProfit)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Quantity</th><th className="text-right">Sq.Ft</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th className="text-right">Profit</th></tr></thead>
                <tbody>{data.rows.map((row: any) => (<tr key={row.description}><td className="font-semibold">{row.description}</td><td>{row.unit}</td><td className="text-right">{formatNumber(row.quantity)}</td><td className="text-right">{row.sqft > 0 ? formatNumber(row.sqft) : '-'}</td><td className="text-right">{formatCurrency(row.revenue)}</td><td className="text-right">{formatCurrency(row.cost)}</td><td className="text-right" style={{ color: 'var(--success-600)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'purchase_summary' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon secondary"><TrendingDown /></div><div className="stat-label">Total Purchase</div><div className="stat-value">{formatCurrency(data.total)}</div></div>
                <div className="stat-card"><div className="stat-icon success"><DollarSign /></div><div className="stat-label">Paid</div><div className="stat-value">{formatCurrency(data.paid)}</div></div>
                <div className="stat-card"><div className="stat-icon error"><Wallet /></div><div className="stat-label">Due</div><div className="stat-value">{formatCurrency(data.due)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr></thead>
                <tbody>{data.purchases.map((p: any) => (<tr key={p.id}><td className="font-semibold">{p.invoice_number}</td><td>{formatDate(p.purchase_date)}</td><td>{p.supplier?.name ?? '-'}</td><td className="text-right">{formatCurrency(p.total_amount)}</td><td className="text-right">{formatCurrency(p.paid_amount)}</td><td className="text-right">{formatCurrency(p.due_amount)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'profit' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon primary"><TrendingUp /></div><div className="stat-label">Revenue</div><div className="stat-value">{formatCurrency(data.totalRevenue)}</div></div>
                <div className="stat-card"><div className="stat-icon secondary"><Package /></div><div className="stat-label">Cost</div><div className="stat-value">{formatCurrency(data.totalCost)}</div></div>
                <div className="stat-card"><div className="stat-icon success"><DollarSign /></div><div className="stat-label">Gross Profit</div><div className="stat-value">{formatCurrency(data.totalProfit)}</div></div>
              </div>
              <div className="card mb-4">
                <div className="card-header"><div className="card-title">Category-wise Profit</div></div>
                <div className="table-wrap" style={{ border: 'none' }}><table className="data-table">
                  <thead><tr><th>Category</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th className="text-right">Profit</th><th className="text-right">Margin</th></tr></thead>
                  <tbody>{Object.entries(data.byCategory).map(([cat, v]: [string, any]) => (<tr key={cat}><td className="font-semibold">{cat}</td><td className="text-right">{formatCurrency(v.revenue)}</td><td className="text-right">{formatCurrency(v.cost)}</td><td className="text-right" style={{ color: 'var(--success-600)', fontWeight: 600 }}>{formatCurrency(v.profit)}</td><td className="text-right">{v.revenue > 0 ? `${(v.profit / v.revenue * 100).toFixed(1)}%` : '-'}</td></tr>))}</tbody>
                </table></div>
              </div>
            </>
          )}

          {data?.type === 'stock_valuation' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon primary"><Package /></div><div className="stat-label">Total Stock Value</div><div className="stat-value">{formatCurrency(data.totalValue)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Product</th><th>Category</th><th className="text-right">Stock</th><th className="text-right">Cost Price</th><th className="text-right">Value</th></tr></thead>
                <tbody>{data.rows.map((p: any) => (<tr key={p.id}><td className="font-semibold">{p.name}</td><td>{p.category?.name ?? '-'}</td><td className="text-right">{p.stock}</td><td className="text-right">{formatCurrency(p.cost_price)}</td><td className="text-right">{formatCurrency(p.value)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'customer_due' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon error"><Users /></div><div className="stat-label">Total Outstanding</div><div className="stat-value">{formatCurrency(data.totalDue)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Customer</th><th>Mobile</th><th>Type</th><th className="text-right">Total Purchase</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr></thead>
                <tbody>{data.customers.map((c: any) => (<tr key={c.id}><td className="font-semibold">{c.name}</td><td>{c.mobile ?? '-'}</td><td><span className="badge badge-neutral">{c.customer_type}</span></td><td className="text-right">{formatCurrency(c.total_purchase)}</td><td className="text-right">{formatCurrency(c.total_paid)}</td><td className="text-right" style={{ color: 'var(--error-600)', fontWeight: 600 }}>{formatCurrency(c.total_due)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'supplier_due' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon error"><Truck /></div><div className="stat-label">Total Payable</div><div className="stat-value">{formatCurrency(data.totalDue)}</div></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Supplier</th><th>Company</th><th>Mobile</th><th className="text-right">Total Purchase</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr></thead>
                <tbody>{data.suppliers.map((s: any) => (<tr key={s.id}><td className="font-semibold">{s.name}</td><td>{s.company_name ?? '-'}</td><td>{s.mobile ?? '-'}</td><td className="text-right">{formatCurrency(s.total_purchase)}</td><td className="text-right">{formatCurrency(s.total_paid)}</td><td className="text-right" style={{ color: 'var(--error-600)', fontWeight: 600 }}>{formatCurrency(s.total_due)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}

          {data?.type === 'expenses' && (
            <>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-icon error"><Wallet /></div><div className="stat-label">Total Expenses</div><div className="stat-value">{formatCurrency(data.total)}</div></div>
              </div>
              <div className="card mb-4">
                <div className="card-header"><div className="card-title">By Category</div></div>
                <div className="table-wrap" style={{ border: 'none' }}><table className="data-table">
                  <thead><tr><th>Category</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>{Object.entries(data.byCategory).map(([cat, amt]: [string, any]) => (<tr key={cat}><td className="font-semibold">{cat}</td><td className="text-right">{formatCurrency(amt)}</td></tr>))}</tbody>
                </table></div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{data.expenses.map((e: any) => (<tr key={e.id}><td>{formatDate(e.expense_date)}</td><td><span className="badge badge-neutral">{e.category_name}</span></td><td>{e.description ?? '-'}</td><td className="text-right">{formatCurrency(e.amount)}</td></tr>))}</tbody>
              </table></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

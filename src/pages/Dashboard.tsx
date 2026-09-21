import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatNumber } from '../lib/utils'
import { Loading } from '../components/Feedback'
import {
  TrendingUp, Wallet, Package, Layers, Boxes, AlertTriangle,
  Users, Truck, DollarSign, ShoppingCart, ArrowDownRight,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="page-sub">Overview of your business performance</div>
        </div>
        <Link to="/pos" className="btn btn-primary">
          <ShoppingCart size={16} /> New Sale
        </Link>
      </div>

      {/* Today's stats */}
      <div className="stat-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon primary"><TrendingUp /></div>
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{formatCurrency(data.todaySales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon secondary"><ArrowDownRight /></div>
          <div className="stat-label">Today's Purchase</div>
          <div className="stat-value">{formatCurrency(data.todayPurchase)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon error"><Wallet /></div>
          <div className="stat-label">Today's Expenses</div>
          <div className="stat-value">{formatCurrency(data.todayExpenses)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><DollarSign /></div>
          <div className="stat-label">Today's Profit</div>
          <div className="stat-value">{formatCurrency(data.todayProfit)}</div>
        </div>
      </div>

      {/* Stock & product stats */}
      <div className="stat-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon info"><Package /></div>
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{formatNumber(data.totalProducts)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon accent"><Layers /></div>
          <div className="stat-label">Total Slabs</div>
          <div className="stat-value">{formatNumber(data.totalSlabs)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><Boxes /></div>
          <div className="stat-label">Total Sq.Ft</div>
          <div className="stat-value">{formatNumber(data.totalSqft)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><DollarSign /></div>
          <div className="stat-label">Stock Value</div>
          <div className="stat-value">{formatCurrency(data.totalStockValue)}</div>
        </div>
      </div>

      {/* Alerts & dues */}
      <div className="stat-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon warning"><AlertTriangle /></div>
          <div className="stat-label">Low Stock</div>
          <div className="stat-value">{formatNumber(data.lowStock)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon error"><AlertTriangle /></div>
          <div className="stat-label">Out of Stock</div>
          <div className="stat-value">{formatNumber(data.outOfStock)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><Users /></div>
          <div className="stat-label">Customer Due</div>
          <div className="stat-value">{formatCurrency(data.customerDue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon secondary"><Truck /></div>
          <div className="stat-label">Supplier Due</div>
          <div className="stat-value">{formatCurrency(data.supplierDue)}</div>
        </div>
      </div>

      {/* Category-wise stock */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">Category-wise Stock</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Inventory Type</th>
                  <th className="text-right">Total Count</th>
                  <th className="text-right">Total Sq.Ft</th>
                  <th className="text-right">Available Count</th>
                  <th className="text-right">Available Sq.Ft</th>
                </tr>
              </thead>
              <tbody>
                {data.categoryStats.map((cat) => (
                  <tr key={cat.name}>
                    <td className="font-semibold">{cat.name}</td>
                    <td><span className="badge badge-neutral">{cat.inventory_type}</span></td>
                    <td className="text-right">{formatNumber(cat.total_count)}</td>
                    <td className="text-right">{cat.inventory_type !== 'piece' ? formatNumber(cat.total_sqft) : '-'}</td>
                    <td className="text-right">{formatNumber(cat.available_count)}</td>
                    <td className="text-right">{cat.inventory_type !== 'piece' ? formatNumber(cat.available_sqft) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Sales</div>
            <Link to="/sales" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.recentSales.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}><p>No sales yet</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Invoice</th><th>Customer</th><th className="text-right">Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.recentSales.map((s) => (
                    <tr key={s.id}>
                      <td className="font-semibold">{s.invoice_number}</td>
                      <td>{s.customer_name}</td>
                      <td className="text-right">{formatCurrency(s.grand_total)}</td>
                      <td><span className={`badge ${s.payment_status === 'paid' ? 'badge-success' : s.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{s.payment_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Purchases</div>
            <Link to="/purchases" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.recentPurchases.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}><p>No purchases yet</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Invoice</th><th>Supplier</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {data.recentPurchases.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.invoice_number}</td>
                      <td>{p.supplier_name}</td>
                      <td className="text-right">{formatCurrency(p.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

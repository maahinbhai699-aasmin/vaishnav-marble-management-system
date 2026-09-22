import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatDate, formatNumber } from '../lib/utils'
import { businessProfile } from '../lib/business'
import type { Sale, SaleItem } from '../lib/types'
import { Search, Receipt, Printer, Eye, Trash2 } from 'lucide-react'

export function SalesHistory() {
  const toast = useToast()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewSale, setViewSale] = useState<Sale | null>(null)
  const [viewItems, setViewItems] = useState<SaleItem[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('sales').select('*, customer:customers(*)').order('created_at', { ascending: false })
    setSales((data ?? []) as Sale[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const matchSearch = !search ||
        s.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        (s.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || s.payment_status === statusFilter
      let matchDate = true
      if (dateFilter) {
        const today = new Date().toISOString().split('T')[0]
        const saleDate = s.sale_date
        if (dateFilter === 'today') matchDate = saleDate === today
        else if (dateFilter === 'yesterday') {
          const y = new Date(); y.setDate(y.getDate() - 1)
          matchDate = saleDate === y.toISOString().split('T')[0]
        } else if (dateFilter === 'this_month') matchDate = saleDate.startsWith(today.substring(0, 7))
      }
      return matchSearch && matchStatus && matchDate
    })
  }, [sales, search, statusFilter, dateFilter])
  const visibleSales = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleView = async (sale: Sale) => {
    setViewSale(sale)
    const { data } = await supabase.from('sale_items').select('*, product:products(*)').eq('sale_id', sale.id)
    setViewItems((data ?? []) as SaleItem[])
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('sales').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Sale deleted')
    setDeleteId(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading sales..." />

  if (viewSale) {
    return <SaleView sale={viewSale} items={viewItems} onClose={() => { setViewSale(null); setViewItems([]) }} />
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Sales History</h2>
          <div className="page-sub">All sales invoices and payment status</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search by invoice or customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this_month">This Month</option>
        </select>
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Receipt />} title="No sales found" message="Sales will appear here after you create them in POS" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th><th>Date</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.invoice_number}</td>
                  <td>{formatDate(s.sale_date)}</td>
                  <td>{s.customer_name ?? 'Walk-in'}</td>
                  <td className="text-right">{formatCurrency(s.grand_total)}</td>
                  <td className="text-right">{formatCurrency(s.paid_amount)}</td>
                  <td className="text-right" style={{ color: Number(s.due_amount) > 0 ? 'var(--error-600)' : undefined, fontWeight: Number(s.due_amount) > 0 ? 600 : undefined }}>{formatCurrency(s.due_amount)}</td>
                  <td><span className={`badge ${s.payment_status === 'paid' ? 'badge-success' : s.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{s.payment_status}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleView(s)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Delete Sale" message="This will not reverse stock movements. Continue?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
    </div>
  )
}

function SaleView({ sale, items, onClose }: { sale: Sale; items: SaleItem[]; onClose: () => void }) {
  const [settings, setSettings] = useState<any>(null)

  useEffect(() => {
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => setSettings(data))
  }, [])

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h2>Invoice {sale.invoice_number}</h2>
          <div className="page-sub">{formatDate(sale.sale_date)}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn btn-primary" onClick={onClose}>Back</button>
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
            <div style={{ fontSize: 13, color: '#666' }}>{formatDate(sale.sale_date)}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
          <strong>Bill To:</strong> {sale.customer_name ?? 'Walk-in Customer'}<br />
          {sale.customer_mobile && <span style={{ fontSize: 13, color: '#666' }}>Mobile: {sale.customer_mobile}</span>}
        </div>

        <table className="invoice-table">
          <thead><tr><th>Description</th><th>Unit</th><th className="text-right">Qty/Sq.Ft</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
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

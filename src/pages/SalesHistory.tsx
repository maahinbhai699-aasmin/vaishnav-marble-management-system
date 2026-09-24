import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatDate, formatNumber } from '../lib/utils'
import { businessProfile } from '../lib/business'
import type { Sale, SaleItem } from '../lib/types'
import {
  Search, Receipt, Printer, Eye, Trash2,
  TrendingUp, Wallet, AlertCircle, FileText, X,
} from 'lucide-react'

// Fallback business info — if settings/businessProfile missing
const FALLBACK_BUSINESS = {
  name: 'Vaishnavi Marble',
  addresses: [
    'Krishnapur Taruliya Main Road, near Chanchal Kumari Girls High School, Sonartari Apartment, P.S. New Town, Kolkata - 700102',
    'Omathati, Kashinathpur, Bishnupur, on 211 road, to Patharghata, Newtown, Kolkata, West Bengal 700135',
  ],
  phone: '+91 93303 00408 / +91 98363 44786',
  email: 'marblevaishnavi@gmail.com',
}

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

  // Live summary (derived only — no logic change)
  const totalSales = filtered.reduce((s, x) => s + Number(x.grand_total || 0), 0)
  const totalPaid = filtered.reduce((s, x) => s + Number(x.paid_amount || 0), 0)
  const totalDue = filtered.reduce((s, x) => s + Number(x.due_amount || 0), 0)

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
    <div className="sales-root" style={{ display: 'grid', gap: 16 }}>
      <style>{`
        .sales-root .page-header {
          padding: 18px 20px;
          background: linear-gradient(135deg, rgba(34,197,94,0.08), rgba(14,165,233,0.05));
          border: 1px solid rgba(34,197,94,0.12);
          border-radius: 16px;
        }
        .sales-root .stat-card {
          background: linear-gradient(135deg, #ffffff, #f0fdf4);
          border-color: rgba(34,197,94,0.12);
        }
      `}</style>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Sales History</h2>
          <div className="page-sub">All sales invoices and payment status</div>
        </div>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard icon={<TrendingUp size={18} />} label="Total Sales" value={formatCurrency(totalSales)} tone="primary" />
        <StatCard icon={<Wallet size={18} />} label="Collected" value={formatCurrency(totalPaid)} tone="success" />
        <StatCard icon={<AlertCircle size={18} />} label="Outstanding" value={formatCurrency(totalDue)} tone="error" />
        <StatCard icon={<FileText size={18} />} label="Invoices" value={filtered.length} tone="neutral" />
      </div>

      {/* Filters */}
      <div
        className="filters-bar"
        style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}
      >
        <div className="search-input" style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
          <input
            className="form-input"
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
            placeholder="Search by invoice number or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        <select className="form-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this_month">This Month</option>
        </select>
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* Table / Empty state */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Receipt />}
            title={sales.length === 0 ? 'No sales yet' : 'No matching sales'}
            message={
              sales.length === 0
                ? 'Sales will appear here after you create them in POS'
                : 'Try changing the search or filters above'
            }
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Due</th>
                <th>Status</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.map((s, idx) => (
                <tr key={s.id}>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className="font-semibold">{s.invoice_number}</td>
                  <td>{formatDate(s.sale_date)}</td>
                  <td>{s.customer_name ?? 'Walk-in'}</td>
                  <td className="text-right">{formatCurrency(s.grand_total)}</td>
                  <td className="text-right">{formatCurrency(s.paid_amount)}</td>
                  <td
                    className="text-right"
                    style={{
                      color: Number(s.due_amount) > 0 ? 'var(--error-600)' : undefined,
                      fontWeight: Number(s.due_amount) > 0 ? 600 : undefined,
                    }}
                  >
                    {formatCurrency(s.due_amount)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        s.payment_status === 'paid'
                          ? 'badge-success'
                          : s.payment_status === 'partial'
                            ? 'badge-warning'
                            : 'badge-danger'
                      }`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {s.payment_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleView(s)} title="View invoice">
                        <Eye size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(s.id)} title="Delete sale">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Sale"
        message="This will not reverse stock movements. Continue?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

/* ───────────── Small UI helper ───────────── */
function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'primary' | 'success' | 'error' | 'neutral'
}) {
  const palette = {
    primary: { color: 'var(--primary-600)', bg: 'var(--primary-50)' },
    success: { color: 'var(--success-600, #16a34a)', bg: '#f0fdf4' },
    error:   { color: 'var(--error-600, #dc2626)',   bg: '#fef2f2' },
    neutral: { color: 'var(--n-600, #475569)',       bg: 'var(--n-100, #f1f5f9)' },
  }[tone]

  return (
    <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: palette.bg,
          color: palette.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="text-muted"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
        >
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.color, lineHeight: 1.2, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

/* ───────────── Invoice view ───────────── */
function SaleView({ sale, items, onClose }: { sale: Sale; items: SaleItem[]; onClose: () => void }) {
  const [settings, setSettings] = useState<any>(null)

  useEffect(() => {
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => setSettings(data))
  }, [])

  // Resolve branding: settings > businessProfile > FALLBACK
  const bizName = settings?.business_name || (businessProfile as any)?.defaultName || FALLBACK_BUSINESS.name
  const bizLogo = settings?.logo_url || (businessProfile as any)?.logoUrl
  const bizAddresses =
    (businessProfile as any)?.addresses && (businessProfile as any).addresses.length > 0
      ? (businessProfile as any).addresses
      : FALLBACK_BUSINESS.addresses
  const bizPhone = (businessProfile as any)?.phone || FALLBACK_BUSINESS.phone
  const bizEmail = settings?.email || (businessProfile as any)?.email || FALLBACK_BUSINESS.email
  const bizGst = settings?.gst_number

  const statusClass =
    sale.payment_status === 'paid'
      ? 'badge-success'
      : sale.payment_status === 'partial'
        ? 'badge-warning'
        : 'badge-danger'

  return (
    <div>
      {/* Action bar (no print) */}
      <div className="page-header no-print">
        <div>
          <h2>Invoice {sale.invoice_number}</h2>
          <div className="page-sub">{formatDate(sale.sale_date)}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="btn btn-primary" onClick={onClose}>Back</button>
        </div>
      </div>

      {/* Printable invoice */}
      <div className="invoice">
        {/* Header: brand + invoice meta */}
        <div
          className="invoice-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}
        >
          <div className="invoice-business" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {bizLogo && (
              <img
                className="invoice-logo"
                src={bizLogo}
                alt={bizName}
                style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <div>
              <div
                className="invoice-title"
                style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 4 }}
              >
                {bizName}
              </div>
              {bizAddresses.map((addr: string) => (
                <div
                  key={addr}
                  className="invoice-contact"
                  style={{ fontSize: 12, color: '#555', lineHeight: 1.5, maxWidth: 420 }}
                >
                  {addr}
                </div>
              ))}
              <div className="invoice-contact" style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                <strong>Phone:</strong> {bizPhone}
              </div>
              <div className="invoice-contact" style={{ fontSize: 12, color: '#555' }}>
                <strong>Email:</strong> {bizEmail}
              </div>
              {bizGst && (
                <div className="invoice-contact" style={{ fontSize: 12, color: '#555' }}>
                  <strong>GST:</strong> {bizGst}
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: '#1e293b',
                lineHeight: 1,
              }}
            >
              INVOICE
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{sale.invoice_number}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{formatDate(sale.sale_date)}</div>
            <div style={{ marginTop: 10 }}>
              <span
                className={`badge ${statusClass}`}
                style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em', padding: '4px 10px' }}
              >
                {sale.payment_status}
              </span>
            </div>
          </div>
        </div>

        {/* Bill To + Invoice Details */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 20,
            marginBottom: 22,
          }}
        >
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Bill To
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
              {sale.customer_name ?? 'Walk-in Customer'}
            </div>
            {sale.customer_mobile && (
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Mobile: {sale.customer_mobile}</div>
            )}
          </div>

          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Invoice Details
            </div>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              <div>
                <span style={{ color: '#666' }}>Number: </span>
                <strong>{sale.invoice_number}</strong>
              </div>
              <div>
                <span style={{ color: '#666' }}>Date: </span>
                {formatDate(sale.sale_date)}
              </div>
              {sale.payment_method && (
                <div>
                  <span style={{ color: '#666' }}>Payment: </span>
                  <span style={{ textTransform: 'capitalize' }}>{sale.payment_method}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>Description</th>
              <th>Unit</th>
              <th className="text-right">Qty / Sq.Ft</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{idx + 1}</td>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td className="text-right">
                  {item.unit === 'Sq.Ft' ? formatNumber(item.sqft) : formatNumber(item.quantity)}
                </td>
                <td className="text-right">{formatCurrency(item.rate)}</td>
                <td className="text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="invoice-totals">
          <div className="total-row"><span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
          {Number(sale.cutting_charge) > 0 && <div className="total-row"><span>Cutting Charges</span><span>{formatCurrency(sale.cutting_charge)}</span></div>}
          {Number(sale.polishing_charge) > 0 && <div className="total-row"><span>Polishing Charges</span><span>{formatCurrency(sale.polishing_charge)}</span></div>}
          {Number(sale.loading_charge) > 0 && <div className="total-row"><span>Loading Charges</span><span>{formatCurrency(sale.loading_charge)}</span></div>}
          {Number(sale.delivery_charge) > 0 && <div className="total-row"><span>Delivery Charges</span><span>{formatCurrency(sale.delivery_charge)}</span></div>}
          {Number(sale.other_charge) > 0 && <div className="total-row"><span>Other Charges</span><span>{formatCurrency(sale.other_charge)}</span></div>}
          {Number(sale.discount) > 0 && (
            <div className="total-row" style={{ color: '#16a34a' }}>
              <span>Discount</span><span>-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {Number(sale.gst_amount) > 0 && <div className="total-row"><span>GST</span><span>{formatCurrency(sale.gst_amount)}</span></div>}
          <div className="total-row grand-total"><span>Grand Total</span><span>{formatCurrency(sale.grand_total)}</span></div>
          <div className="total-row"><span>Paid</span><span>{formatCurrency(sale.paid_amount)}</span></div>
          <div
            className="total-row"
            style={{ fontWeight: 600, color: Number(sale.due_amount) > 0 ? '#dc2626' : '#16a34a' }}
          >
            <span>Due</span><span>{formatCurrency(sale.due_amount)}</span>
          </div>
        </div>

        {/* Terms */}
        {settings?.terms_conditions && (
          <div
            style={{
              marginTop: 28,
              fontSize: 12,
              color: '#666',
              borderTop: '1px solid #e2e8f0',
              paddingTop: 12,
            }}
          >
            <strong style={{ color: '#334155' }}>Terms & Conditions:</strong> {settings.terms_conditions}
          </div>
        )}

        {/* Footer strip */}
        <div
          style={{
            marginTop: 30,
            paddingTop: 14,
            borderTop: '1px dashed #cbd5e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Thank you for your business!</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>For any queries, please contact us.</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#666', lineHeight: 1.6 }}>
            <div>{bizPhone}</div>
            <div>{bizEmail}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
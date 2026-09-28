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
    <div className="sh-root">
      <style>{`
        .sh-root {
          --sh-card: #ffffff;
          --sh-border: #e6ebf2;
          --sh-text: #0f172a;
          --sh-muted: #64748b;
          --sh-soft: #94a3b8;
          display: grid;
          gap: 16px;
          animation: shFade .4s ease both;
        }
        @keyframes shFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shRise {
          from { opacity: 0; transform: translateY(14px) scale(.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shRowIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shPop {
          0%   { transform: scale(.85); opacity: 0; }
          60%  { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,.4); }
          50%      { box-shadow: 0 0 0 12px rgba(16,185,129,0); }
        }
        @keyframes shShine {
          0%   { transform: translateX(-140%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        @keyframes shFloat {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        @keyframes shGlow {
          0%,100% { background-position: 0% 50%; }
          50%     { background-position: 100% 50%; }
        }

        /* ════════ PAGE HEADER ════════ */
        .sh-header {
          position: relative;
          overflow: hidden;
          padding: 22px 24px;
          border-radius: 20px;
          background: linear-gradient(125deg, #0f766e 0%, #0891b2 45%, #6366f1 100%);
          background-size: 200% 200%;
          color: #ffffff;
          box-shadow: 0 24px 48px -28px rgba(15,118,110,.75);
          animation: shGlow 8s ease-in-out infinite;
        }
        .sh-header::before {
          content: '';
          position: absolute;
          top: -70px; right: -50px;
          width: 260px; height: 260px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.28) 0%, transparent 65%);
          pointer-events: none;
        }
        .sh-header::after {
          content: '';
          position: absolute;
          bottom: -110px; left: -60px;
          width: 300px; height: 300px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.14) 0%, transparent 65%);
          pointer-events: none;
        }
        .sh-header-inner {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .sh-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sh-header-ico {
          width: 42px; height: 42px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,.2);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.3);
          animation: shFloat 3s ease-in-out infinite;
        }
        .sh-header-ico svg { width: 21px; height: 21px; color: #ffffff; }
        .sh-header-sub {
          margin-top: 6px;
          font-size: 13.5px;
          color: rgba(255,255,255,.85);
          font-weight: 500;
        }
        .sh-header-count {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 999px;
          background: rgba(255,255,255,.18);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.3);
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: .02em;
          color: #ffffff;
        }
        .sh-header-count::before {
          content: '';
          width: 7px; height: 7px; border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 0 3px rgba(52,211,153,.4);
          animation: shPulse 2.4s ease-in-out infinite;
        }

        /* ════════ STAT CARDS ════════ */
        .sh-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 13px;
        }
        .sh-stat {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--sh-card);
          border: 1px solid var(--sh-border);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          animation: shRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .sh-stat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--sc1), var(--sc2));
        }
        .sh-stat::after {
          content: '';
          position: absolute;
          top: -55px; right: -55px;
          width: 140px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--sc1) 0%, transparent 68%);
          opacity: .12;
          z-index: -1;
          transition: opacity .35s ease, transform .45s ease;
        }
        .sh-stat:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 22px 38px -22px var(--scs), 0 3px 12px -4px rgba(15,23,42,.06);
        }
        .sh-stat:hover::after { opacity: .22; transform: scale(1.18); }

        .sh-stat.s-emerald { --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
        .sh-stat.s-cyan    { --sc1:#06b6d4; --sc2:#22d3ee; --scs: rgba(6,182,212,.55); }
        .sh-stat.s-rose    { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }
        .sh-stat.s-violet  { --sc1:#8b5cf6; --sc2:#c084fc; --scs: rgba(139,92,246,.55); }

        .sh-stat-ico {
          width: 46px; height: 46px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          color: #ffffff;
          background: linear-gradient(135deg, var(--sc1), var(--sc2));
          box-shadow: 0 12px 22px -12px var(--scs);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .sh-stat:hover .sh-stat-ico { transform: scale(1.1) rotate(-8deg); }
        .sh-stat-ico svg { width: 20px; height: 20px; }
        .sh-stat-body { min-width: 0; }
        .sh-stat-label {
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: .09em;
          text-transform: uppercase;
          color: var(--sh-soft);
          margin-bottom: 4px;
        }
        .sh-stat-value {
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -.02em;
          line-height: 1.15;
          color: var(--sc1);
          font-variant-numeric: tabular-nums;
        }

        /* ════════ FILTERS ════════ */
        .sh-filters {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          padding: 12px;
          border-radius: 16px;
          background: linear-gradient(135deg, #ffffff, #f8fafc);
          border: 1px solid var(--sh-border);
          box-shadow: 0 12px 30px -22px rgba(15,23,42,.25);
          animation: shRise .5s cubic-bezier(.22,1,.36,1) .06s both;
        }
        .sh-search {
          flex: 1;
          min-width: 240px;
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid var(--sh-border);
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .sh-search:focus-within {
          border-color: #5eead4;
          box-shadow: 0 0 0 3px rgba(45,212,191,.16);
        }
        .sh-search svg { color: var(--sh-soft); flex-shrink: 0; }
        .sh-search input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--sh-text);
        }
        .sh-search input::placeholder { color: var(--sh-soft); }
        .sh-search-clear {
          width: 24px; height: 24px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          border: none;
          background: #f1f5f9;
          color: #64748b;
          cursor: pointer;
          flex-shrink: 0;
          transition: all .18s ease;
        }
        .sh-search-clear:hover { background: #ffe4e6; color: #e11d48; }

        .sh-select {
          min-width: 148px;
          padding: 10px 34px 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--sh-border);
          background: #ffffff url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 12px center;
          background-size: 14px;
          font-size: 13px;
          font-weight: 700;
          color: var(--sh-text);
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .sh-select:focus {
          border-color: #5eead4;
          box-shadow: 0 0 0 3px rgba(45,212,191,.16);
        }

        /* ════════ TABLE PANEL ════════ */
        .sh-panel {
          background: var(--sh-card);
          border: 1px solid var(--sh-border);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 18px 46px -32px rgba(15,23,42,.4);
          animation: shRise .5s cubic-bezier(.22,1,.36,1) .12s both;
        }
        .sh-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .sh-table thead th {
          text-align: left;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: .09em;
          text-transform: uppercase;
          color: var(--sh-soft);
          padding: 14px 16px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          border-bottom: 1px solid var(--sh-border);
          white-space: nowrap;
        }
        .sh-table tbody td {
          padding: 13px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--sh-text);
          vertical-align: middle;
        }
        .sh-table tbody tr:last-child td { border-bottom: none; }
        .sh-table tbody tr {
          animation: shRowIn .4s ease both;
          transition: background .18s ease, box-shadow .18s ease;
        }
        .sh-table tbody tr:hover {
          background: linear-gradient(90deg, #f0fdfa, #ffffff);
          box-shadow: inset 3px 0 0 #14b8a6;
        }
        .sh-cell-right { text-align: right; }
        .sh-cell-index {
          font-size: 12px;
          color: var(--sh-soft);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .sh-invoice {
          font-weight: 800;
          color: #0f766e;
          font-variant-numeric: tabular-nums;
          letter-spacing: -.01em;
        }
        .sh-customer {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .sh-customer-avatar {
          width: 30px; height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 12px;
          color: #ffffff;
          background: linear-gradient(135deg, #14b8a6, #06b6d4);
          box-shadow: 0 6px 14px -8px rgba(20,184,166,.9);
          flex-shrink: 0;
          transition: transform .3s cubic-bezier(.34,1.56,.64,1);
        }
        .sh-table tbody tr:hover .sh-customer-avatar { transform: scale(1.12) rotate(-8deg); }
        .sh-customer-name {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sh-amount {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--sh-text);
        }
        .sh-due {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: #e11d48;
        }
        .sh-due.zero { color: #059669; }
        .sh-paid {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #0f766e;
        }
        .sh-date {
          font-size: 12.5px;
          color: var(--sh-muted);
          font-weight: 600;
        }
        .sh-actions { display: flex; gap: 6px; }
        .sh-act-btn {
          width: 32px; height: 32px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border: 1px solid var(--sh-border);
          cursor: pointer;
          color: var(--sh-muted);
          transition: all .2s cubic-bezier(.22,1,.36,1);
        }
        .sh-act-btn:hover {
          background: #ecfeff;
          border-color: #a5f3fc;
          color: #0891b2;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px -8px rgba(6,182,212,.7);
        }
        .sh-act-btn.danger:hover {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
          box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
        }
        .sh-act-btn:active { transform: scale(.9); }

        /* ════════ BADGES ════════ */
        .sh-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .025em;
          text-transform: capitalize;
          white-space: nowrap;
        }
        .sh-badge::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
        }
        .sh-badge.paid    { background: #ecfdf5; color: #047857; box-shadow: inset 0 0 0 1px #a7f3d0; }
        .sh-badge.partial { background: #fffbeb; color: #b45309; box-shadow: inset 0 0 0 1px #fde68a; }
        .sh-badge.unpaid  { background: #fff1f2; color: #be123c; box-shadow: inset 0 0 0 1px #fecdd3; }

        /* ════════ EMPTY ════════ */
        .sh-empty-card {
          background: var(--sh-card);
          border: 1px solid var(--sh-border);
          border-radius: 18px;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          .sh-root *, .sh-root *::before, .sh-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="sh-header">
        <div className="sh-header-inner">
          <div>
            <h2>
              <span className="sh-header-ico"><Receipt /></span>
              Sales History
            </h2>
            <div className="sh-header-sub">All sales invoices and payment status</div>
          </div>
          <span className="sh-header-count">{filtered.length} invoices</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="sh-stats">
        <StatCard icon={<TrendingUp size={18} />} label="Total Sales" value={formatCurrency(totalSales)} tone="emerald" delay=".02s" />
        <StatCard icon={<Wallet size={18} />} label="Collected" value={formatCurrency(totalPaid)} tone="cyan" delay=".06s" />
        <StatCard icon={<AlertCircle size={18} />} label="Outstanding" value={formatCurrency(totalDue)} tone="rose" delay=".10s" />
        <StatCard icon={<FileText size={18} />} label="Invoices" value={formatNumber(filtered.length)} tone="violet" delay=".14s" />
      </div>

      {/* Filters */}
      <div className="sh-filters">
        <div className="sh-search">
          <Search size={16} />
          <input
            placeholder="Search by invoice number or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="sh-search-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <select className="sh-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this_month">This Month</option>
        </select>
        <select className="sh-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* Table / Empty state */}
      {filtered.length === 0 ? (
        <div className="sh-empty-card">
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
        <div className="sh-panel">
          <table className="sh-table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>#</th>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="sh-cell-right">Total</th>
                <th className="sh-cell-right">Paid</th>
                <th className="sh-cell-right">Due</th>
                <th>Status</th>
                <th style={{ width: 96 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.map((s, idx) => {
                const due = Number(s.due_amount)
                return (
                  <tr key={s.id} style={{ animationDelay: `${Math.min(idx, 14) * 0.025}s` }}>
                    <td className="sh-cell-index">{(page - 1) * pageSize + idx + 1}</td>
                    <td><span className="sh-invoice">{s.invoice_number}</span></td>
                    <td><span className="sh-date">{formatDate(s.sale_date)}</span></td>
                    <td>
                      <span className="sh-customer">
                        <span className="sh-customer-avatar">
                          {(s.customer_name ?? 'W').charAt(0).toUpperCase()}
                        </span>
                        <span className="sh-customer-name">{s.customer_name ?? 'Walk-in'}</span>
                      </span>
                    </td>
                    <td className="sh-cell-right"><span className="sh-amount">{formatCurrency(s.grand_total)}</span></td>
                    <td className="sh-cell-right"><span className="sh-paid">{formatCurrency(s.paid_amount)}</span></td>
                    <td className="sh-cell-right">
                      <span className={`sh-due ${due <= 0 ? 'zero' : ''}`}>{formatCurrency(s.due_amount)}</span>
                    </td>
                    <td>
                      <span className={`sh-badge ${s.payment_status}`}>{s.payment_status}</span>
                    </td>
                    <td>
                      <div className="sh-actions">
                        <button className="sh-act-btn" onClick={() => handleView(s)} title="View invoice">
                          <Eye size={14} />
                        </button>
                        <button className="sh-act-btn danger" onClick={() => setDeleteId(s.id)} title="Delete sale">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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
  tone = 'emerald',
  delay = '0s',
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'emerald' | 'cyan' | 'rose' | 'violet'
  delay?: string
}) {
  return (
    <div className={`sh-stat s-${tone}`} style={{ animationDelay: delay }}>
      <div className="sh-stat-ico">{icon}</div>
      <div className="sh-stat-body">
        <div className="sh-stat-label">{label}</div>
        <div className="sh-stat-value">{value}</div>
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
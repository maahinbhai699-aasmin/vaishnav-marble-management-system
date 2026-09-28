import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Loading, EmptyState } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatNumber, formatDate } from '../lib/utils'
import { exportToExcel } from '../lib/excelExport'
import type { StockMovement } from '../lib/types'
import { Search, FileSpreadsheet, Download, X, ArrowUpCircle, ArrowDownCircle, Package } from 'lucide-react'

export function StockLedger() {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('stock_movements')
      .select('*, product:products(name, stock_count, stock_sqft), category:categories(name), location:locations(name)')
      .order('movement_date', { ascending: false })
      .limit(500)
    setMovements((data ?? []) as StockMovement[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const matchSearch = !search ||
        (m.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (m.reference_number ?? '').toLowerCase().includes(search.toLowerCase())
      const matchType = !typeFilter || m.transaction_type === typeFilter
      return matchSearch && matchType
    })
  }, [movements, search, typeFilter])
  const visibleMovements = filtered.slice((page - 1) * pageSize, page * pageSize)

  const typeLabels: Record<string, string> = {
    opening: 'Opening', purchase: 'Purchase', sale: 'Sale', customer_return: 'Customer Return',
    supplier_return: 'Supplier Return', damage: 'Damage', wastage: 'Wastage',
    transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
    adjustment_increase: 'Adjustment +', adjustment_decrease: 'Adjustment -',
    reserved: 'Reserved', reserve_release: 'Reserve Release',
  }

  const isStockIn = (type: string) =>
    type === 'purchase' || type === 'transfer_in' || type === 'customer_return' || type === 'adjustment_increase' || type === 'opening' || type === 'reserve_release'

  const isStockOut = (type: string) =>
    type === 'sale' || type === 'damage' || type === 'transfer_out' || type === 'supplier_return' || type === 'adjustment_decrease' || type === 'wastage' || type === 'reserved'

  // summary stats — display only, doesn't affect data
  const stats = useMemo(() => {
    let inCount = 0, outCount = 0, inSqft = 0, outSqft = 0
    filtered.forEach((m) => {
      inCount += Number(m.stock_in_count) || 0
      outCount += Number(m.stock_out_count) || 0
      inSqft += Number(m.stock_in_sqft) || 0
      outSqft += Number(m.stock_out_sqft) || 0
    })
    return { inCount, outCount, inSqft, outSqft }
  }, [filtered])

  const handleExportExcel = () => {
    const rows = filtered.map((m) => ({
      Date: formatDate(m.movement_date),
      Product: m.product?.name ?? '-',
      Category: m.category?.name ?? '-',
      Type: typeLabels[m.transaction_type] ?? m.transaction_type,
      Reference: m.reference_number ?? '-',
      'In Count': Number(m.stock_in_count) > 0 ? `+${m.stock_in_count}` : '',
      'Out Count': Number(m.stock_out_count) > 0 ? `-${m.stock_out_count}` : '',
      'In Sq.Ft': Number(m.stock_in_sqft) > 0 ? `+${m.stock_in_sqft}` : '',
      'Out Sq.Ft': Number(m.stock_out_sqft) > 0 ? `-${m.stock_out_sqft}` : '',
      'Bal Count': m.balance_count,
      'Bal Sq.Ft': m.balance_sqft,
      Location: m.location?.name ?? '-',
      Remarks: m.remarks ?? '-',
    }))
    if (rows.length > 0) {
      exportToExcel(rows, 'stock_ledger', 'Stock Ledger')
    }
  }

  if (loading) return <Loading label="Loading stock ledger..." />

  return (
    <div className="sl-root">
      <style>{`
        .sl-root {
          --sl-card: #ffffff;
          --sl-border: #e6ebf2;
          --sl-text: #0f172a;
          --sl-muted: #64748b;
          --sl-soft: #94a3b8;
          display: grid;
          gap: 18px;
          animation: slFade .38s ease both;
        }
        @keyframes slFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes slRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
        @keyframes slCountUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* ═══ Header ═══ */
        .sl-header {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          padding: 22px 24px;
          border-radius: 20px;
          background:
            radial-gradient(circle at 12% 20%, rgba(16,185,129,.18), transparent 42%),
            radial-gradient(circle at 88% 80%, rgba(6,182,212,.18), transparent 46%),
            linear-gradient(135deg, #ffffff, #f5fffd);
          border: 1px solid #d1fae5;
          box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
          overflow: hidden;
        }
        .sl-header::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #10b981, #06b6d4, #6366f1);
        }
        .sl-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #059669 55%, #0891b2 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .sl-header-sub {
          margin-top: 6px;
          font-size: 13.5px;
          color: var(--sl-muted);
          font-weight: 500;
        }
        .sl-header-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 8px;
          padding: 3px 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        /* Export button */
        .sl-export {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 20px;
          border-radius: 12px;
          background: linear-gradient(115deg, #10b981, #06b6d4);
          border: none;
          color: #fff;
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: .01em;
          cursor: pointer;
          overflow: hidden;
          isolation: isolate;
          box-shadow: 0 14px 28px -14px rgba(16,185,129,.85);
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
        }
        .sl-export::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
          transform: translateX(-140%);
          z-index: -1;
        }
        .sl-export:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 34px -14px rgba(16,185,129,.95);
        }
        .sl-export:hover::after { animation: slShine .9s ease; }
        .sl-export:active { transform: scale(.96); }
        .sl-export svg { transition: transform .34s ease; }
        .sl-export:hover svg { transform: translateY(2px); }

        /* ═══ Summary cards ═══ */
        .sl-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
        }
        .sl-stat {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--sl-card);
          border: 1px solid var(--sl-border);
          border-radius: 16px;
          padding: 15px 17px;
          display: flex;
          align-items: center;
          gap: 13px;
          animation: slRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .sl-stat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--sc1), var(--sc2));
        }
        .sl-stat::after {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 140px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--sc1) 0%, transparent 68%);
          opacity: .12;
          z-index: -1;
          transition: opacity .35s ease, transform .45s ease;
        }
        .sl-stat:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
        }
        .sl-stat:hover::after { opacity: .22; transform: scale(1.18); }

        .sl-stat.c-emerald { --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
        .sl-stat.c-rose    { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }
        .sl-stat.c-cyan    { --sc1:#06b6d4; --sc2:#22d3ee; --scs: rgba(6,182,212,.55); }
        .sl-stat.c-amber   { --sc1:#f59e0b; --sc2:#fbbf24; --scs: rgba(245,158,11,.55); }

        .sl-stat-ico {
          width: 44px; height: 44px;
          border-radius: 13px;
          display: grid; place-items: center;
          color: #fff;
          background: linear-gradient(135deg, var(--sc1), var(--sc2));
          box-shadow: 0 10px 20px -10px var(--scs);
          flex-shrink: 0;
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .sl-stat-ico svg { width: 20px; height: 20px; }
        .sl-stat:hover .sl-stat-ico { transform: scale(1.1) rotate(-8deg); }

        .sl-stat-body { min-width: 0; flex: 1; }
        .sl-stat-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: var(--sl-muted);
          margin-bottom: 4px;
        }
        .sl-stat-value {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -.02em;
          font-variant-numeric: tabular-nums;
          line-height: 1.15;
          animation: slCountUp .5s cubic-bezier(.22,1,.36,1) both;
        }
        .sl-stat.c-emerald .sl-stat-value { color: #047857; }
        .sl-stat.c-rose .sl-stat-value    { color: #be123c; }
        .sl-stat.c-cyan .sl-stat-value    { color: #0e7490; }
        .sl-stat.c-amber .sl-stat-value   { color: #b45309; }
        .sl-stat-sub {
          font-size: 11.5px;
          color: var(--sl-soft);
          margin-top: 2px;
          font-weight: 600;
        }

        /* ═══ Filters ═══ */
        .sl-filters {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) 240px;
          gap: 12px;
          padding: 14px;
          background: linear-gradient(135deg, #ffffff, #f5fffd);
          border: 1px solid var(--sl-border);
          border-radius: 16px;
          box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
          animation: slRise .45s cubic-bezier(.22,1,.36,1) .05s both;
        }
        @media (max-width: 720px) {
          .sl-filters { grid-template-columns: 1fr; }
        }
        .sl-search {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          height: 46px;
          border-radius: 12px;
          border: 1.5px solid var(--sl-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .sl-search:focus-within {
          border-color: #6ee7b7;
          box-shadow: 0 0 0 4px rgba(16,185,129,.14);
          transform: translateY(-1px);
        }
        .sl-search svg { color: #059669; flex-shrink: 0; }
        .sl-search input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          color: var(--sl-text);
          height: 100%;
        }
        .sl-search input::placeholder { color: #94a3b8; font-weight: 500; }
        .sl-clear {
          width: 26px; height: 26px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: #f1f5f9;
          border: none;
          color: var(--sl-muted);
          cursor: pointer;
          transition: all .18s ease;
        }
        .sl-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

        .sl-type-select {
          position: relative;
          display: flex;
          align-items: center;
          height: 46px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1.5px solid var(--sl-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .sl-type-select:focus-within {
          border-color: #6ee7b7;
          box-shadow: 0 0 0 4px rgba(16,185,129,.14);
          transform: translateY(-1px);
        }
        .sl-type-select select {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 700;
          color: var(--sl-text);
          height: 100%;
          cursor: pointer;
          appearance: none;
        }
        .sl-type-select::after {
          content: '';
          width: 8px; height: 8px;
          border-right: 2px solid #059669;
          border-bottom: 2px solid #059669;
          transform: rotate(45deg) translateY(-2px);
          margin-left: -8px;
          pointer-events: none;
        }

        /* ═══ Table panel ═══ */
        .sl-panel {
          background: var(--sl-card);
          border: 1px solid var(--sl-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
          animation: slRise .5s cubic-bezier(.22,1,.36,1) .1s both;
          transition: box-shadow .26s ease, border-color .26s ease;
        }
        .sl-panel:hover {
          box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
          border-color: #d1fae5;
        }
        .sl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sl-table thead th {
          text-align: left;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--sl-soft);
          padding: 12px 14px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          border-bottom: 1px solid var(--sl-border);
          white-space: nowrap;
        }
        .sl-table thead th.right { text-align: right; }
        .sl-table tbody td {
          padding: 12px 14px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--sl-text);
          vertical-align: middle;
          font-variant-numeric: tabular-nums;
        }
        .sl-table tbody tr:last-child td { border-bottom: none; }
        .sl-table tbody tr {
          animation: slRowIn .4s ease both;
          transition: background .16s ease, box-shadow .16s ease;
        }
        .sl-table tbody tr:hover {
          background: linear-gradient(90deg, #f8fafc, #ffffff);
        }
        .sl-table tbody tr.row-in {
          box-shadow: inset 3px 0 0 #10b981;
        }
        .sl-table tbody tr.row-in:hover {
          box-shadow: inset 3px 0 0 #10b981, 0 6px 20px -18px rgba(16,185,129,.7);
          background: linear-gradient(90deg, #f0fdf4, #ffffff);
        }
        .sl-table tbody tr.row-out {
          box-shadow: inset 3px 0 0 #f43f5e;
        }
        .sl-table tbody tr.row-out:hover {
          box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7);
          background: linear-gradient(90deg, #fff1f2, #ffffff);
        }
        .sl-table tbody tr.row-neutral {
          box-shadow: inset 3px 0 0 #cbd5e1;
        }

        .sl-prod {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .sl-prod-avatar {
          width: 32px; height: 32px;
          border-radius: 10px;
          display: grid; place-items: center;
          font-weight: 800;
          font-size: 13px;
          flex-shrink: 0;
          color: #fff;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 8px 16px -10px rgba(99,102,241,.9);
          transition: transform .3s cubic-bezier(.34,1.56,.64,1);
        }
        .sl-table tbody tr:hover .sl-prod-avatar { transform: scale(1.1) rotate(-6deg); }
        .sl-prod-name {
          font-weight: 700;
          font-size: 13px;
          color: var(--sl-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }

        .sl-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: .02em;
          white-space: nowrap;
          text-transform: capitalize;
        }
        .sl-badge::before {
          content: '';
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .sl-badge.in {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
        }
        .sl-badge.out {
          background: linear-gradient(135deg, #fff1f2, #ffe4e6);
          color: #be123c;
        }
        .sl-badge.neutral {
          background: #f1f5f9;
          color: #475569;
        }

        .sl-in-amt {
          color: #059669;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .sl-out-amt {
          color: #e11d48;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .sl-bal {
          font-weight: 800;
          color: var(--sl-text);
        }
        .sl-ref {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: var(--sl-text);
          font-size: 12px;
        }
        .sl-muted { color: var(--sl-soft); font-weight: 600; }
        .sl-remarks {
          font-size: 12px;
          color: var(--sl-muted);
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
          .sl-root *, .sl-root *::before, .sl-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      {/* ═══ Header ═══ */}
      <div className="sl-header">
        <div>
          <h2>Stock Ledger</h2>
          <div className="sl-header-sub">
            Complete stock movement history
            {filtered.length > 0 && (
              <span className="sl-header-chip">{filtered.length} movements</span>
            )}
          </div>
        </div>
        {filtered.length > 0 && (
          <button className="sl-export" onClick={handleExportExcel}>
            <Download size={16} /> Export Excel
          </button>
        )}
      </div>

      {/* ═══ Summary cards ═══ */}
      {filtered.length > 0 && (
        <div className="sl-stats">
          <div className="sl-stat c-emerald" style={{ animationDelay: '.02s' }}>
            <div className="sl-stat-ico"><ArrowUpCircle /></div>
            <div className="sl-stat-body">
              <div className="sl-stat-label">Total In Count</div>
              <div className="sl-stat-value">+{formatNumber(stats.inCount)}</div>
              <div className="sl-stat-sub">{formatNumber(stats.inSqft)} Sq.Ft in</div>
            </div>
          </div>
          <div className="sl-stat c-rose" style={{ animationDelay: '.06s' }}>
            <div className="sl-stat-ico"><ArrowDownCircle /></div>
            <div className="sl-stat-body">
              <div className="sl-stat-label">Total Out Count</div>
              <div className="sl-stat-value">-{formatNumber(stats.outCount)}</div>
              <div className="sl-stat-sub">{formatNumber(stats.outSqft)} Sq.Ft out</div>
            </div>
          </div>
          <div className="sl-stat c-cyan" style={{ animationDelay: '.10s' }}>
            <div className="sl-stat-ico"><Package /></div>
            <div className="sl-stat-body">
              <div className="sl-stat-label">Net Balance</div>
              <div className="sl-stat-value">{formatNumber(stats.inCount - stats.outCount)}</div>
              <div className="sl-stat-sub">Count movement</div>
            </div>
          </div>
          <div className="sl-stat c-amber" style={{ animationDelay: '.14s' }}>
            <div className="sl-stat-ico"><FileSpreadsheet /></div>
            <div className="sl-stat-body">
              <div className="sl-stat-label">Entries</div>
              <div className="sl-stat-value">{filtered.length}</div>
              <div className="sl-stat-sub">of {movements.length} total</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="sl-filters">
        <div className="sl-search">
          <Search size={17} />
          <input
            placeholder="Search by product or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="sl-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="sl-type-select">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ Table / Empty ═══ */}
      {filtered.length === 0 ? (
        <div className="sl-panel">
          <EmptyState
            icon={<FileSpreadsheet />}
            title="No stock movements"
            message="Stock movements will appear here as you make purchases, sales, and transfers"
          />
        </div>
      ) : (
        <div className="sl-panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th className="right">In Count</th>
                  <th className="right">Out Count</th>
                  <th className="right">In Sq.Ft</th>
                  <th className="right">Out Sq.Ft</th>
                  <th className="right">Bal Count</th>
                  <th className="right">Bal Sq.Ft</th>
                  <th>Location</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((m, idx) => {
                  const inRow = isStockIn(m.transaction_type)
                  const outRow = isStockOut(m.transaction_type)
                  const rowClass = inRow ? 'row-in' : outRow ? 'row-out' : 'row-neutral'
                  const badgeClass = inRow ? 'in' : outRow ? 'out' : 'neutral'
                  return (
                    <tr key={m.id} className={rowClass} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                      <td className="sl-ref">{formatDate(m.movement_date)}</td>
                      <td>
                        <div className="sl-prod">
                          <div className="sl-prod-avatar">
                            {(m.product?.name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="sl-prod-name" title={m.product?.name ?? '-'}>
                            {m.product?.name ?? '-'}
                          </div>
                        </div>
                      </td>
                      <td className="sl-muted">{m.category?.name ?? '-'}</td>
                      <td>
                        <span className={`sl-badge ${badgeClass}`}>
                          {typeLabels[m.transaction_type] ?? m.transaction_type}
                        </span>
                      </td>
                      <td className="sl-ref">{m.reference_number ?? '-'}</td>
                      <td className="right">
                        {Number(m.stock_in_count) > 0 ? (
                          <span className="sl-in-amt">+{formatNumber(m.stock_in_count)}</span>
                        ) : <span className="sl-muted">—</span>}
                      </td>
                      <td className="right">
                        {Number(m.stock_out_count) > 0 ? (
                          <span className="sl-out-amt">-{formatNumber(m.stock_out_count)}</span>
                        ) : <span className="sl-muted">—</span>}
                      </td>
                      <td className="right">
                        {Number(m.stock_in_sqft) > 0 ? (
                          <span className="sl-in-amt">+{formatNumber(m.stock_in_sqft)}</span>
                        ) : <span className="sl-muted">—</span>}
                      </td>
                      <td className="right">
                        {Number(m.stock_out_sqft) > 0 ? (
                          <span className="sl-out-amt">-{formatNumber(m.stock_out_sqft)}</span>
                        ) : <span className="sl-muted">—</span>}
                      </td>
                      <td className="right"><span className="sl-bal">{formatNumber(m.balance_count)}</span></td>
                      <td className="right"><span className="sl-bal">{formatNumber(m.balance_sqft)}</span></td>
                      <td className="sl-muted">{m.location?.name ?? '-'}</td>
                      <td className="sl-remarks" title={m.remarks ?? '-'}>{m.remarks ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
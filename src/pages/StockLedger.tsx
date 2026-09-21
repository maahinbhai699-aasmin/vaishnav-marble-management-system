import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Loading, EmptyState } from '../components/Feedback'
import { formatNumber, formatDate } from '../lib/utils'
import type { StockMovement } from '../lib/types'
import { Search, FileSpreadsheet } from 'lucide-react'

export function StockLedger() {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

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

  const typeLabels: Record<string, string> = {
    opening: 'Opening', purchase: 'Purchase', sale: 'Sale', customer_return: 'Customer Return',
    supplier_return: 'Supplier Return', damage: 'Damage', wastage: 'Wastage',
    transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
    adjustment_increase: 'Adjustment +', adjustment_decrease: 'Adjustment -',
    reserved: 'Reserved', reserve_release: 'Reserve Release',
  }

  if (loading) return <Loading label="Loading stock ledger..." />

  return (
    <div>
      <div className="page-header">
        <div><h2>Stock Ledger</h2><div className="page-sub">Complete stock movement history</div></div>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search by product or reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<FileSpreadsheet />} title="No stock movements" message="Stock movements will appear here as you make purchases, sales, and transfers" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Product</th><th>Category</th><th>Type</th><th>Reference</th>
                <th className="text-right">In Count</th><th className="text-right">Out Count</th>
                <th className="text-right">In Sq.Ft</th><th className="text-right">Out Sq.Ft</th>
                <th className="text-right">Bal Count</th><th className="text-right">Bal Sq.Ft</th>
                <th>Location</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.movement_date)}</td>
                  <td className="font-semibold">{m.product?.name ?? '-'}</td>
                  <td>{m.category?.name ?? '-'}</td>
                  <td><span className={`badge ${m.transaction_type === 'purchase' || m.transaction_type === 'transfer_in' || m.transaction_type === 'customer_return' || m.transaction_type === 'adjustment_increase' ? 'badge-success' : m.transaction_type === 'sale' || m.transaction_type === 'damage' || m.transaction_type === 'transfer_out' || m.transaction_type === 'supplier_return' ? 'badge-danger' : 'badge-neutral'}`}>{typeLabels[m.transaction_type] ?? m.transaction_type}</span></td>
                  <td>{m.reference_number ?? '-'}</td>
                  <td className="text-right" style={{ color: 'var(--success-600)' }}>{Number(m.stock_in_count) > 0 ? `+${formatNumber(m.stock_in_count)}` : ''}</td>
                  <td className="text-right" style={{ color: 'var(--error-600)' }}>{Number(m.stock_out_count) > 0 ? `-${formatNumber(m.stock_out_count)}` : ''}</td>
                  <td className="text-right" style={{ color: 'var(--success-600)' }}>{Number(m.stock_in_sqft) > 0 ? `+${formatNumber(m.stock_in_sqft)}` : ''}</td>
                  <td className="text-right" style={{ color: 'var(--error-600)' }}>{Number(m.stock_out_sqft) > 0 ? `-${formatNumber(m.stock_out_sqft)}` : ''}</td>
                  <td className="text-right font-semibold">{formatNumber(m.balance_count)}</td>
                  <td className="text-right font-semibold">{formatNumber(m.balance_sqft)}</td>
                  <td>{m.location?.name ?? '-'}</td>
                  <td className="text-sm text-muted">{m.remarks ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

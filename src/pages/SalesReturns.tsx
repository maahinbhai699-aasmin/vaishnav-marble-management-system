import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatDate, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Sale } from '../lib/types'
import {
  Plus, Search, Undo2, Eye, X, RotateCcw, User, Receipt, FileText,
  TrendingDown, AlertCircle, ArrowLeft,
} from 'lucide-react'

export function SalesReturns() {
  const [returns, setReturns] = useState<any[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewReturn, setViewReturn] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [retRes, saleRes] = await Promise.all([
      supabase.from('sales_returns').select('*, customer:customers(name), sale:sales(invoice_number), sales_return_items(*, product:products(name))').order('created_at', { ascending: false }),
      supabase.from('sales').select('*, customer:customers(name), sale_items:sale_items(*, product:products(*))').order('created_at', { ascending: false }),
    ])
    setReturns(retRes.data ?? [])
    setSales((saleRes.data ?? []) as Sale[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!search) return returns
    const q = search.toLowerCase()
    return returns.filter((r) => r.return_number?.toLowerCase().includes(q) || r.sale?.invoice_number?.toLowerCase().includes(q))
  }, [returns, search])

  // Display-only summary
  const stats = useMemo(() => {
    const total = returns.reduce((s, r) => s + Number(r.total_amount || 0), 0)
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = returns
      .filter((r) => (r.return_date ?? '').startsWith(monthPrefix))
      .reduce((s, r) => s + Number(r.total_amount || 0), 0)
    return { total, thisMonth, count: returns.length }
  }, [returns])

  if (loading) return <Loading label="Loading returns..." />

  if (viewReturn) {
    return (
      <div className="sr-root">
        <style>{srStyles}</style>

        <div className="sr-header">
          <div>
            <h2>Return {viewReturn.return_number}</h2>
            <div className="sr-header-sub">
              {formatDate(viewReturn.return_date)}
              <span className="sr-header-chip">
                {(viewReturn.sales_return_items ?? []).length} item{(viewReturn.sales_return_items ?? []).length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <button className="sr-back-btn" onClick={() => setViewReturn(null)}>
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {/* Quick info cards */}
        <div className="sr-view-info">
          <div className="sr-info-card c-indigo">
            <div className="sr-info-ico"><Receipt size={18} /></div>
            <div className="sr-info-body">
              <div className="sr-info-label">Invoice</div>
              <div className="sr-info-value">{viewReturn.sale?.invoice_number ?? '-'}</div>
            </div>
          </div>
          <div className="sr-info-card c-cyan">
            <div className="sr-info-ico"><User size={18} /></div>
            <div className="sr-info-body">
              <div className="sr-info-label">Customer</div>
              <div className="sr-info-value">{viewReturn.customer?.name ?? '-'}</div>
            </div>
          </div>
          <div className="sr-info-card c-amber">
            <div className="sr-info-ico"><FileText size={18} /></div>
            <div className="sr-info-body">
              <div className="sr-info-label">Reason</div>
              <div className="sr-info-value">{viewReturn.reason ?? '-'}</div>
            </div>
          </div>
          <div className="sr-info-card c-rose">
            <div className="sr-info-ico"><TrendingDown size={18} /></div>
            <div className="sr-info-body">
              <div className="sr-info-label">Refund</div>
              <div className="sr-info-value">{formatCurrency(viewReturn.total_amount)}</div>
            </div>
          </div>
        </div>

        <div className="sr-panel">
          <div className="sr-panel-head">
            <div className="sr-panel-title">
              <span className="sr-pt-ico rose"><Undo2 size={16} /></span>
              Returned Items
            </div>
          </div>
          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th className="right">Qty</th>
                  <th className="right">Sq.Ft</th>
                  <th className="right">Rate</th>
                  <th className="right">Amount</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {(viewReturn.sales_return_items ?? []).map((item: any, idx: number) => (
                  <tr key={item.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td>
                      <div className="sr-prod">
                        <div className="sr-prod-avatar">{(item.product?.name ?? item.description ?? '?').charAt(0).toUpperCase()}</div>
                        <span className="sr-prod-name">{item.product?.name ?? item.description ?? '-'}</span>
                      </div>
                    </td>
                    <td><span className="sr-unit-pill">{item.unit ?? '-'}</span></td>
                    <td className="right"><span className="sr-num">{item.quantity}</span></td>
                    <td className="right"><span className="sr-num cyan">{item.sqft}</span></td>
                    <td className="right"><span className="sr-mono">{formatCurrency(item.rate)}</span></td>
                    <td className="right"><span className="sr-num neg">{formatCurrency(item.amount)}</span></td>
                    <td className="sr-muted">{item.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="sr-card-list">
            {(viewReturn.sales_return_items ?? []).map((item: any, idx: number) => (
              <div key={item.id} className="sr-card" style={{ animationDelay: `${Math.min(idx, 12) * 0.03}s` }}>
                <div className="sr-card-head">
                  <div className="sr-prod">
                    <div className="sr-prod-avatar">{(item.product?.name ?? item.description ?? '?').charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="sr-prod-name">{item.product?.name ?? item.description ?? '-'}</div>
                      <span className="sr-unit-pill">{item.unit ?? '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="sr-card-grid">
                  <div className="sr-card-stat">
                    <div className="sr-card-stat-label">Qty</div>
                    <div className="sr-card-stat-value">{item.quantity}</div>
                  </div>
                  <div className="sr-card-stat">
                    <div className="sr-card-stat-label">Sq.Ft</div>
                    <div className="sr-card-stat-value cyan">{item.sqft}</div>
                  </div>
                  <div className="sr-card-stat">
                    <div className="sr-card-stat-label">Rate</div>
                    <div className="sr-card-stat-value">{formatCurrency(item.rate)}</div>
                  </div>
                  <div className="sr-card-stat">
                    <div className="sr-card-stat-label">Amount</div>
                    <div className="sr-card-stat-value neg">{formatCurrency(item.amount)}</div>
                  </div>
                </div>
                {item.reason && (
                  <div className="sr-card-reason">
                    <AlertCircle size={12} /> {item.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sr-root">
      <style>{srStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="sr-header">
        <div>
          <h2>Sales Returns</h2>
          <div className="sr-header-sub">
            Process customer returns and restock inventory
            {returns.length > 0 && (
              <span className="sr-header-chip">{returns.length} return{returns.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <button className="sr-add-btn" onClick={() => setModalOpen(true)} disabled={sales.length === 0}>
          <Plus size={16} /> New Return
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      {returns.length > 0 && (
        <div className="sr-stats">
          <div className="sr-stat c-rose" style={{ animationDelay: '.02s' }}>
            <div className="sr-stat-ico"><TrendingDown size={20} /></div>
            <div className="sr-stat-body">
              <div className="sr-stat-label">Total Refunded</div>
              <div className="sr-stat-value">{formatCurrency(stats.total)}</div>
              <div className="sr-stat-sub">{stats.count} return{stats.count === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="sr-stat c-amber" style={{ animationDelay: '.06s' }}>
            <div className="sr-stat-ico"><RotateCcw size={20} /></div>
            <div className="sr-stat-body">
              <div className="sr-stat-label">This Month</div>
              <div className="sr-stat-value">{formatCurrency(stats.thisMonth)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="sr-filters">
        <div className="sr-search">
          <Search size={17} />
          <input
            placeholder="Search by return # or invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="sr-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table / Cards ═══ */}
      {filtered.length === 0 ? (
        <div className="sr-panel">
          <EmptyState icon={<Undo2 />} title="No sales returns" message="Process customer returns here" />
        </div>
      ) : (
        <div className="sr-panel">
          {/* Desktop table */}
          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="right">Refund Amount</th>
                  <th>Reason</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                    <td>
                      <span className="sr-ret-num">
                        <Undo2 size={12} /> {r.return_number}
                      </span>
                    </td>
                    <td className="sr-mono">{formatDate(r.return_date)}</td>
                    <td><span className="sr-inv-pill">{r.sale?.invoice_number ?? '-'}</span></td>
                    <td>
                      <div className="sr-cust-cell">
                        <div className="sr-cust-avatar">{(r.customer?.name ?? '?').charAt(0).toUpperCase()}</div>
                        <span className="sr-cust-name">{r.customer?.name ?? '-'}</span>
                      </div>
                    </td>
                    <td className="right"><span className="sr-num neg">{formatCurrency(r.total_amount)}</span></td>
                    <td className="sr-muted">{r.reason ?? '-'}</td>
                    <td>
                      <button className="sr-act" onClick={() => setViewReturn(r)} title="View return">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sr-card-list">
            {filtered.map((r, idx) => (
              <div key={r.id} className="sr-card" style={{ animationDelay: `${Math.min(idx, 14) * 0.03}s` }}>
                <div className="sr-card-head">
                  <div>
                    <div className="sr-ret-num">
                      <Undo2 size={12} /> {r.return_number}
                    </div>
                    <div className="sr-card-date">{formatDate(r.return_date)}</div>
                  </div>
                  <span className="sr-refund-badge">{formatCurrency(r.total_amount)}</span>
                </div>

                <div className="sr-card-meta">
                  <span className="sr-inv-pill">{r.sale?.invoice_number ?? '-'}</span>
                  {r.customer?.name && (
                    <div className="sr-cust-cell">
                      <div className="sr-cust-avatar small">{(r.customer.name).charAt(0).toUpperCase()}</div>
                      <span className="sr-cust-name">{r.customer.name}</span>
                    </div>
                  )}
                </div>

                {r.reason && (
                  <div className="sr-card-reason">
                    <AlertCircle size={12} /> {r.reason}
                  </div>
                )}

                <button className="sr-act full" onClick={() => setViewReturn(r)}>
                  <Eye size={14} /> View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <ReturnForm
          sales={sales}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function ReturnForm({ sales, onClose, onSuccess }: { sales: Sale[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast()
  const [saleId, setSaleId] = useState('')
  const [items, setItems] = useState<{ sale_item: any; quantity: number; sqft: number; reason: string }[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedSale = sales.find((s) => s.id === saleId)

  const handleSelectSale = (id: string) => {
    setSaleId(id)
    const sale = sales.find((s) => s.id === id)
    if (sale) {
      setItems((sale as any).sale_items?.map((si: any) => ({ sale_item: si, quantity: 0, sqft: 0, reason: '' })) ?? [])
    }
  }

  const totalAmount = items.reduce((s, item) => {
    return s + (item.quantity * Number(item.sale_item.rate) || item.sqft * Number(item.sale_item.rate))
  }, 0)

  const handleSave = async () => {
    if (!saleId) { toast('Select a sale', 'error'); return }
    const validItems = items.filter((i) => i.quantity > 0 || i.sqft > 0)
    if (validItems.length === 0) { toast('Enter return quantity for at least one item', 'error'); return }
    setSaving(true)

    const retNum = await nextInvoiceNumber('SR')
    const sale = sales.find((s) => s.id === saleId)
    const { data: ret, error } = await supabase.from('sales_returns').insert({
      return_number: retNum,
      sale_id: saleId,
      customer_id: sale?.customer_id ?? null,
      return_date: new Date().toISOString().split('T')[0],
      total_amount: totalAmount,
      reason: reason || null,
    }).select('id').maybeSingle()

    if (error || !ret) { toast(`Error: ${error?.message}`, 'error'); setSaving(false); return }

    for (const item of validItems) {
      const si = item.sale_item
      await supabase.from('sales_return_items').insert({
        return_id: ret.id,
        product_id: si.product_id,
        slab_id: si.slab_id,
        description: si.description,
        unit: si.unit,
        quantity: item.quantity,
        sqft: item.sqft,
        rate: si.rate,
        amount: item.quantity * Number(si.rate) || item.sqft * Number(si.rate),
        reason: item.reason || null,
      })

      const product = (sale as any).sale_items?.find((s: any) => s.id === si.id)?.product
      const invType = product?.category?.inventory_type ?? 'piece'
      const stockInCount = invType === 'piece' ? item.quantity : 0
      const stockInSqft = invType === 'slab' || invType === 'box' ? item.sqft : 0
      await recordStockMovement({
        product_id: si.product_id,
        category_id: si.category_id,
        slab_id: si.slab_id ?? null,
        transaction_type: 'customer_return',
        reference_number: retNum,
        reference_id: ret.id,
        stock_in_count: stockInCount,
        stock_in_sqft: stockInSqft,
        unit: si.unit,
        remarks: `Sales return: ${si.description}`,
      })
    }

    toast('Sales return processed')
    onSuccess()
    setSaving(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New Sales Return"
      size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Process Return'}</button></>}
    >
      <div className="sr-form">
        {/* Step 1: Select sale */}
        <div className="sr-section-label">Step 1 — Select Sale</div>
        <div className="form-group">
          <label className="form-label">Original Invoice <span className="req">*</span></label>
          <select className="form-select" value={saleId} onChange={(e) => handleSelectSale(e.target.value)}>
            <option value="">Select Invoice</option>
            {sales.map((s) => <option key={s.id} value={s.id}>{s.invoice_number} - {s.customer_name ?? 'Walk-in'} - {formatCurrency(s.grand_total)}</option>)}
          </select>
        </div>

        {/* Selected sale summary */}
        {selectedSale && (
          <div className="sr-sale-banner">
            <div className="sr-sale-banner-ic"><Receipt size={18} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sr-sale-banner-num">{(selectedSale as any).invoice_number}</div>
              <div className="sr-sale-banner-meta">
                <span className="sr-sale-banner-name">{(selectedSale as any).customer_name ?? 'Walk-in'}</span>
                <span className="sr-sale-banner-amount">{formatCurrency((selectedSale as any).grand_total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Items */}
        {selectedSale && items.length > 0 && (
          <>
            <div className="sr-section-label">Step 2 — Choose Items to Return</div>

            {/* Desktop table */}
            <div className="sr-table-wrap sr-items-table">
              <table className="sr-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th className="right">Original</th>
                    <th className="right">Return Qty</th>
                    <th className="right">Return Sq.Ft</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td>
                        <div className="sr-prod">
                          <div className="sr-prod-avatar small">{(item.sale_item.description ?? '?').charAt(0).toUpperCase()}</div>
                          <span className="sr-prod-name">{item.sale_item.description}</span>
                        </div>
                      </td>
                      <td><span className="sr-unit-pill">{item.sale_item.unit}</span></td>
                      <td className="right">
                        <span className="sr-orig">
                          {item.sale_item.unit === 'Sq.Ft' ? item.sale_item.sqft : item.sale_item.quantity}
                        </span>
                      </td>
                      <td className="right">
                        <input
                          className="form-input sr-input"
                          type="number"
                          step="0.01"
                          style={{ width: 80 }}
                          value={item.quantity || ''}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                        />
                      </td>
                      <td className="right">
                        <input
                          className="form-input sr-input"
                          type="number"
                          step="0.01"
                          style={{ width: 90 }}
                          value={item.sqft || ''}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sqft: Number(e.target.value) } : x))}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input sr-input"
                          style={{ width: 140 }}
                          placeholder="Reason"
                          value={item.reason}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sr-card-list sr-items-cards">
              {items.map((item, i) => (
                <div key={i} className="sr-card sr-form-card" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                  <div className="sr-card-head">
                    <div className="sr-prod">
                      <div className="sr-prod-avatar">{(item.sale_item.description ?? '?').charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="sr-prod-name">{item.sale_item.description}</div>
                        <span className="sr-unit-pill">{item.sale_item.unit}</span>
                      </div>
                    </div>
                    <div className="sr-orig-tag">
                      <span>Original</span>
                      <strong>{item.sale_item.unit === 'Sq.Ft' ? item.sale_item.sqft : item.sale_item.quantity}</strong>
                    </div>
                  </div>

                  <div className="sr-form-card-grid">
                    <div className="sr-field">
                      <label>Return Qty</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantity || ''}
                        onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                      />
                    </div>
                    <div className="sr-field">
                      <label>Return Sq.Ft</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.sqft || ''}
                        onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sqft: Number(e.target.value) } : x))}
                      />
                    </div>
                  </div>

                  <div className="sr-field">
                    <label>Reason</label>
                    <input
                      placeholder="e.g. Damaged, Wrong item"
                      value={item.reason}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Step 3: Overall reason */}
        <div className="sr-section-label">Step 3 — Overall Reason (Optional)</div>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="e.g. Customer dissatisfaction, quality issue"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Refund summary */}
        {totalAmount > 0 && (
          <div className="sr-refund-total">
            <div className="sr-refund-total-ic"><TrendingDown size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="sr-refund-total-label">Refund Total</div>
              <div className="sr-refund-total-value">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ═══════════ Styles ═══════════ */
const srStyles = `
  .sr-root {
    --sr-card: #ffffff;
    --sr-border: #e6ebf2;
    --sr-text: #0f172a;
    --sr-muted: #64748b;
    --sr-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: srFade .38s ease both;
  }
  @keyframes srFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes srRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes srRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes srSlideIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes srShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes srShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes srFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes srPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,.4); }
    50%      { box-shadow: 0 0 0 10px rgba(244,63,94,0); }
  }

  /* ═══ Header ═══ */
  .sr-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(244,63,94,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(245,158,11,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #fff7f6);
    border: 1px solid #fecdd3;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .sr-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185, #f59e0b);
  }
  .sr-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #e11d48 55%, #ea580c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sr-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--sr-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .sr-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ffe4e6, #fed7aa);
    color: #be123c;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Buttons */
  .sr-add-btn,
  .sr-back-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 20px;
    border-radius: 12px;
    border: none;
    color: #fff;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: .01em;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
  }
  .sr-add-btn {
    background: linear-gradient(115deg, #f43f5e, #f59e0b);
    box-shadow: 0 14px 28px -14px rgba(244,63,94,.85);
  }
  .sr-back-btn {
    background: linear-gradient(115deg, #0f172a, #1e293b);
    box-shadow: 0 14px 28px -14px rgba(15,23,42,.75);
  }
  .sr-add-btn::after,
  .sr-back-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .sr-add-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(244,63,94,.95);
  }
  .sr-back-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(15,23,42,.85);
  }
  .sr-add-btn:hover::after,
  .sr-back-btn:hover::after { animation: srShine .9s ease; }
  .sr-add-btn:active:not(:disabled),
  .sr-back-btn:active { transform: scale(.96); }
  .sr-add-btn:disabled { opacity: .55; cursor: not-allowed; filter: grayscale(.4); }

  /* ═══ Stats ═══ */
  .sr-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  @media (max-width: 640px) {
    .sr-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }
  @media (max-width: 420px) {
    .sr-stats { grid-template-columns: 1fr; }
  }

  .sr-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--sr-card);
    border: 1px solid var(--sr-border);
    border-radius: 16px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 13px;
    animation: srRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .sr-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .sr-stat::after {
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
  .sr-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .sr-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .sr-stat.c-rose  { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }
  .sr-stat.c-amber { --sc1:#f59e0b; --sc2:#fbbf24; --scs: rgba(245,158,11,.55); }

  .sr-stat-ico {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .sr-stat-ico svg { width: 20px; height: 20px; }
  .sr-stat:hover .sr-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .sr-stat-body { min-width: 0; flex: 1; }
  .sr-stat-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--sr-muted);
    margin-bottom: 4px;
  }
  .sr-stat-value {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--sr-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sr-stat.c-rose .sr-stat-value { color: #be123c; }
  .sr-stat.c-amber .sr-stat-value{ color: #b45309; }
  .sr-stat-sub {
    font-size: 11px;
    color: var(--sr-soft);
    margin-top: 2px;
    font-weight: 600;
  }

  /* ═══ Filters ═══ */
  .sr-filters {
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #fff7f6);
    border: 1px solid var(--sr-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: srRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  .sr-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--sr-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .sr-search:focus-within {
    border-color: #fda4af;
    box-shadow: 0 0 0 4px rgba(244,63,94,.14);
    transform: translateY(-1px);
  }
  .sr-search svg { color: #e11d48; flex-shrink: 0; }
  .sr-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--sr-text);
    height: 100%;
    min-width: 0;
  }
  .sr-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .sr-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--sr-muted);
    cursor: pointer;
    transition: all .18s ease;
    flex-shrink: 0;
  }
  .sr-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  /* ═══ Panel / Table ═══ */
  .sr-panel {
    background: var(--sr-card);
    border: 1px solid var(--sr-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: srRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .sr-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #fecdd3;
  }
  .sr-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--sr-border);
    background: linear-gradient(180deg, #fbfdff, #ffffff);
  }
  .sr-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -.01em;
    color: var(--sr-text);
  }
  .sr-pt-ico {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.9);
  }

  .sr-table-wrap { overflow-x: auto; }
  .sr-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 700px; }
  .sr-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--sr-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--sr-border);
    white-space: nowrap;
  }
  .sr-table thead th.right { text-align: right; }
  .sr-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--sr-text);
    vertical-align: middle;
  }
  .sr-table tbody tr:last-child td { border-bottom: none; }
  .sr-table tbody tr {
    animation: srRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .sr-table tbody tr:hover {
    background: linear-gradient(90deg, #fff7f6, #ffffff);
    box-shadow: inset 3px 0 0 #f43f5e;
  }
  .sr-table .right { text-align: right; }

  .sr-ret-num {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #be123c;
  }
  .sr-ret-num svg { color: #f43f5e; }
  .sr-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--sr-text);
  }
  .sr-muted { color: var(--sr-muted); font-weight: 600; font-size: 12.5px; }
  .sr-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--sr-text);
    white-space: nowrap;
  }
  .sr-num.neg { color: #be123c; }
  .sr-num.cyan { color: #0e7490; }

  .sr-inv-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 800;
    background: linear-gradient(135deg, #dbeafe, #e0e7ff);
    color: #1d4ed8;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .sr-cust-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .sr-cust-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    box-shadow: 0 8px 16px -10px rgba(244,63,94,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .sr-cust-avatar.small { width: 24px; height: 24px; font-size: 11px; border-radius: 8px; }
  .sr-table tbody tr:hover .sr-cust-avatar,
  .sr-card:hover .sr-cust-avatar { transform: scale(1.08) rotate(-6deg); }
  .sr-cust-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--sr-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .sr-prod { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .sr-prod-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    box-shadow: 0 8px 16px -10px rgba(244,63,94,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .sr-prod-avatar.small { width: 28px; height: 28px; font-size: 12px; border-radius: 9px; }
  .sr-table tbody tr:hover .sr-prod-avatar { transform: scale(1.08) rotate(-6deg); }
  .sr-prod-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--sr-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .sr-unit-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
    background: #f1f5f9;
    color: #475569;
    white-space: nowrap;
  }

  .sr-orig {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid var(--sr-border);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #475569;
    font-size: 12px;
  }

  .sr-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 32px; height: 32px;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--sr-border);
    color: var(--sr-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .sr-act:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
  }
  .sr-act.full {
    width: 100%;
    padding: 9px 14px;
    margin-top: 10px;
    justify-content: center;
  }
  .sr-act:active { transform: scale(.9); }

  /* ═══ Mobile cards ═══ */
  .sr-card-list { display: none; padding: 12px; }
  @media (max-width: 720px) {
    .sr-table-wrap { display: none; }
    .sr-card-list { display: grid; gap: 12px; grid-template-columns: 1fr; }
    .sr-items-table { display: none; }
    .sr-items-cards { display: grid; }
  }
  @media (min-width: 721px) {
    .sr-items-cards { display: none; }
  }

  .sr-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: #fff;
    border: 1px solid var(--sr-border);
    border-radius: 14px;
    padding: 14px;
    animation: srRise .45s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .sr-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185, #f59e0b);
  }
  .sr-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 34px -22px rgba(244,63,94,.35);
  }
  .sr-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
  }
  .sr-card-date {
    font-size: 11.5px;
    color: var(--sr-soft);
    font-weight: 600;
    margin-top: 3px;
  }
  .sr-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 11px;
  }
  .sr-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .sr-card-stat {
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    border: 1px solid var(--sr-border);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .sr-card-stat-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--sr-soft);
    margin-bottom: 3px;
  }
  .sr-card-stat-value {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--sr-text);
    font-variant-numeric: tabular-nums;
  }
  .sr-card-stat-value.neg  { color: #be123c; }
  .sr-card-stat-value.cyan { color: #0e7490; }

  .sr-card-reason {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--sr-muted);
    font-weight: 600;
    padding: 8px 10px;
    border-radius: 9px;
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border: 1px solid #fde68a;
    margin-bottom: 8px;
  }
  .sr-card-reason svg { color: #d97706; flex-shrink: 0; }

  .sr-refund-badge {
    display: inline-flex;
    align-items: center;
    padding: 5px 11px;
    border-radius: 999px;
    background: linear-gradient(135deg, #fff1f2, #ffe4e6);
    border: 1px solid #fecdd3;
    color: #be123c;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ═══ View info cards ═══ */
  .sr-view-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  @media (max-width: 640px) {
    .sr-view-info { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }
  @media (max-width: 420px) {
    .sr-view-info { grid-template-columns: 1fr; }
  }

  .sr-info-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--sr-card);
    border: 1px solid var(--sr-border);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: srRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .sr-info-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--ic1), var(--ic2));
  }
  .sr-info-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 32px -22px var(--ics);
  }
  .sr-info-card.c-indigo { --ic1:#6366f1; --ic2:#818cf8; --ics: rgba(99,102,241,.55); }
  .sr-info-card.c-cyan   { --ic1:#06b6d4; --ic2:#22d3ee; --ics: rgba(6,182,212,.55); }
  .sr-info-card.c-amber  { --ic1:#f59e0b; --ic2:#fbbf24; --ics: rgba(245,158,11,.55); }
  .sr-info-card.c-rose   { --ic1:#f43f5e; --ic2:#fb7185; --ics: rgba(244,63,94,.55); }

  .sr-info-ico {
    width: 40px; height: 40px;
    border-radius: 11px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--ic1), var(--ic2));
    box-shadow: 0 10px 20px -10px var(--ics);
    flex-shrink: 0;
  }
  .sr-info-ico svg { width: 18px; height: 18px; }
  .sr-info-body { min-width: 0; flex: 1; }
  .sr-info-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--sr-soft);
    margin-bottom: 3px;
  }
  .sr-info-value {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--sr-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sr-info-card.c-rose .sr-info-value { color: #be123c; font-variant-numeric: tabular-nums; }

  /* ═══ Form ═══ */
  .sr-form { display: flex; flex-direction: column; gap: 4px; }

  .sr-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--sr-muted);
    margin: 18px 0 12px;
  }
  .sr-section-label:first-child { margin-top: 0; }
  .sr-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #f43f5e, #f59e0b);
  }

  .sr-sale-banner {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff7f6, #ffe4e6);
    border: 1px solid #fecdd3;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
    animation: srRise .45s cubic-bezier(.22,1,.36,1) both;
  }
  .sr-sale-banner::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185, #f59e0b);
  }
  .sr-sale-banner-ic {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    box-shadow: 0 12px 22px -10px rgba(244,63,94,.9);
    flex-shrink: 0;
    animation: srFloat 3s ease-in-out infinite;
  }
  .sr-sale-banner-ic svg { width: 19px; height: 19px; }
  .sr-sale-banner-num {
    font-size: 14px;
    font-weight: 800;
    color: #be123c;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.01em;
  }
  .sr-sale-banner-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-top: 3px;
    flex-wrap: wrap;
  }
  .sr-sale-banner-name {
    font-size: 12.5px;
    color: #be123c;
    opacity: .85;
    font-weight: 700;
  }
  .sr-sale-banner-amount {
    font-size: 13px;
    font-weight: 800;
    color: #be123c;
    font-variant-numeric: tabular-nums;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255,255,255,.6);
    border: 1px solid #fecdd3;
  }

  .sr-input {
    height: 34px !important;
    padding: 0 10px !important;
    border-radius: 9px !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums;
    transition: border-color .18s ease, box-shadow .18s ease;
  }
  .sr-input:focus {
    border-color: #fda4af !important;
    box-shadow: 0 0 0 3px rgba(244,63,94,.14) !important;
    outline: none !important;
  }

  .sr-form-card {
    background: #fbfdff;
  }
  .sr-form-card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
  }
  .sr-field { display: flex; flex-direction: column; gap: 4px; }
  .sr-field label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--sr-soft);
  }
  .sr-field input {
    height: 36px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--sr-border);
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--sr-text);
    transition: border-color .18s ease, box-shadow .18s ease;
    width: 100%;
    min-width: 0;
  }
  .sr-field input:focus {
    border-color: #fda4af;
    box-shadow: 0 0 0 3px rgba(244,63,94,.14);
    outline: none;
  }

  .sr-orig-tag {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .sr-orig-tag span {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--sr-soft);
  }
  .sr-orig-tag strong {
    font-size: 13px;
    font-weight: 800;
    color: #475569;
    font-variant-numeric: tabular-nums;
    padding: 3px 9px;
    border-radius: 8px;
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid var(--sr-border);
  }

  /* Refund total */
  .sr-refund-total {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
    border: 1px solid #fecdd3;
    margin-top: 16px;
    position: relative;
    overflow: hidden;
    animation: srRise .45s cubic-bezier(.22,1,.36,1) both;
  }
  .sr-refund-total::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #f59e0b);
  }
  .sr-refund-total-ic {
    width: 46px; height: 46px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #e11d48, #f59e0b);
    box-shadow: 0 12px 24px -12px rgba(225,29,72,.9);
    flex-shrink: 0;
    animation: srPulse 2.4s ease-in-out infinite;
  }
  .sr-refund-total-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #be123c;
    margin-bottom: 3px;
  }
  .sr-refund-total-value {
    font-size: 24px;
    font-weight: 800;
    color: #be123c;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  @media (prefers-reduced-motion: reduce) {
    .sr-root *, .sr-root *::before, .sr-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
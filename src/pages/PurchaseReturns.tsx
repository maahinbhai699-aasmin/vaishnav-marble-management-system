import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatDate, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Purchase } from '../lib/types'
import {
  Plus, Search, Undo2, Eye, X, RotateCcw, Truck, Receipt, FileText,
  TrendingDown, AlertCircle, ArrowLeft,
} from 'lucide-react'

export function PurchaseReturns() {
  const [returns, setReturns] = useState<any[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewReturn, setViewReturn] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [retRes, purRes] = await Promise.all([
      supabase.from('purchase_returns').select('*, supplier:suppliers(name), purchase:purchases(invoice_number), purchase_return_items(*, product:products(name))').order('created_at', { ascending: false }),
      supabase.from('purchases').select('*, supplier:suppliers(*), purchase_items:purchase_items(*, product:products(*, category:categories(*)))').order('created_at', { ascending: false }),
    ])
    setReturns(retRes.data ?? [])
    setPurchases((purRes.data ?? []) as Purchase[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!search) return returns
    const q = search.toLowerCase()
    return returns.filter((r) => r.return_number?.toLowerCase().includes(q) || r.purchase?.invoice_number?.toLowerCase().includes(q))
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
      <div className="prt-root">
        <style>{prtStyles}</style>

        <div className="prt-header">
          <div>
            <h2>Return {viewReturn.return_number}</h2>
            <div className="prt-header-sub">
              {formatDate(viewReturn.return_date)}
              <span className="prt-header-chip">
                {(viewReturn.purchase_return_items ?? []).length} item{(viewReturn.purchase_return_items ?? []).length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <button className="prt-back-btn" onClick={() => setViewReturn(null)}>
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {/* Quick info cards */}
        <div className="prt-view-info">
          <div className="prt-info-card c-indigo">
            <div className="prt-info-ico"><Receipt size={18} /></div>
            <div className="prt-info-body">
              <div className="prt-info-label">Purchase</div>
              <div className="prt-info-value">{viewReturn.purchase?.invoice_number ?? '-'}</div>
            </div>
          </div>
          <div className="prt-info-card c-cyan">
            <div className="prt-info-ico"><Truck size={18} /></div>
            <div className="prt-info-body">
              <div className="prt-info-label">Supplier</div>
              <div className="prt-info-value">{viewReturn.supplier?.name ?? '-'}</div>
            </div>
          </div>
          <div className="prt-info-card c-amber">
            <div className="prt-info-ico"><FileText size={18} /></div>
            <div className="prt-info-body">
              <div className="prt-info-label">Reason</div>
              <div className="prt-info-value">{viewReturn.reason ?? '-'}</div>
            </div>
          </div>
          <div className="prt-info-card c-emerald">
            <div className="prt-info-ico"><TrendingDown size={18} /></div>
            <div className="prt-info-body">
              <div className="prt-info-label">Amount</div>
              <div className="prt-info-value">{formatCurrency(viewReturn.total_amount)}</div>
            </div>
          </div>
        </div>

        <div className="prt-panel">
          <div className="prt-panel-head">
            <div className="prt-panel-title">
              <span className="prt-pt-ico emerald"><Undo2 size={16} /></span>
              Returned Items
            </div>
          </div>
          <div className="prt-table-wrap">
            <table className="prt-table">
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
                {(viewReturn.purchase_return_items ?? []).map((item: any, idx: number) => (
                  <tr key={item.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td>
                      <div className="prt-prod">
                        <div className="prt-prod-avatar">{(item.product?.name ?? item.description ?? '?').charAt(0).toUpperCase()}</div>
                        <span className="prt-prod-name">{item.product?.name ?? item.description ?? '-'}</span>
                      </div>
                    </td>
                    <td><span className="prt-unit-pill">{item.unit ?? '-'}</span></td>
                    <td className="right"><span className="prt-num">{item.quantity}</span></td>
                    <td className="right"><span className="prt-num cyan">{item.sqft}</span></td>
                    <td className="right"><span className="prt-mono">{formatCurrency(item.rate)}</span></td>
                    <td className="right"><span className="prt-num neg">{formatCurrency(item.amount)}</span></td>
                    <td className="prt-muted">{item.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="prt-card-list">
            {(viewReturn.purchase_return_items ?? []).map((item: any, idx: number) => (
              <div key={item.id} className="prt-card" style={{ animationDelay: `${Math.min(idx, 12) * 0.03}s` }}>
                <div className="prt-card-head">
                  <div className="prt-prod">
                    <div className="prt-prod-avatar">{(item.product?.name ?? item.description ?? '?').charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="prt-prod-name">{item.product?.name ?? item.description ?? '-'}</div>
                      <span className="prt-unit-pill">{item.unit ?? '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="prt-card-grid">
                  <div className="prt-card-stat">
                    <div className="prt-card-stat-label">Qty</div>
                    <div className="prt-card-stat-value">{item.quantity}</div>
                  </div>
                  <div className="prt-card-stat">
                    <div className="prt-card-stat-label">Sq.Ft</div>
                    <div className="prt-card-stat-value cyan">{item.sqft}</div>
                  </div>
                  <div className="prt-card-stat">
                    <div className="prt-card-stat-label">Rate</div>
                    <div className="prt-card-stat-value">{formatCurrency(item.rate)}</div>
                  </div>
                  <div className="prt-card-stat">
                    <div className="prt-card-stat-label">Amount</div>
                    <div className="prt-card-stat-value neg">{formatCurrency(item.amount)}</div>
                  </div>
                </div>
                {item.reason && (
                  <div className="prt-card-reason">
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
    <div className="prt-root">
      <style>{prtStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="prt-header">
        <div>
          <h2>Purchase Returns</h2>
          <div className="prt-header-sub">
            Return products to suppliers and reduce stock
            {returns.length > 0 && (
              <span className="prt-header-chip">{returns.length} return{returns.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <button className="prt-add-btn" onClick={() => setModalOpen(true)} disabled={purchases.length === 0}>
          <Plus size={16} /> New Return
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      {returns.length > 0 && (
        <div className="prt-stats">
          <div className="prt-stat c-emerald" style={{ animationDelay: '.02s' }}>
            <div className="prt-stat-ico"><TrendingDown size={20} /></div>
            <div className="prt-stat-body">
              <div className="prt-stat-label">Total Returned</div>
              <div className="prt-stat-value">{formatCurrency(stats.total)}</div>
              <div className="prt-stat-sub">{stats.count} return{stats.count === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="prt-stat c-amber" style={{ animationDelay: '.06s' }}>
            <div className="prt-stat-ico"><RotateCcw size={20} /></div>
            <div className="prt-stat-body">
              <div className="prt-stat-label">This Month</div>
              <div className="prt-stat-value">{formatCurrency(stats.thisMonth)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="prt-filters">
        <div className="prt-search">
          <Search size={17} />
          <input
            placeholder="Search by return # or purchase invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="prt-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table / Cards ═══ */}
      {filtered.length === 0 ? (
        <div className="prt-panel">
          <EmptyState icon={<Undo2 />} title="No purchase returns" message="Return products to suppliers here" />
        </div>
      ) : (
        <div className="prt-panel">
          {/* Desktop table */}
          <div className="prt-table-wrap">
            <table className="prt-table">
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Date</th>
                  <th>Purchase</th>
                  <th>Supplier</th>
                  <th className="right">Amount</th>
                  <th>Reason</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} style={{ animationDelay: `${Math.min(idx, 14) * 0.02}s` }}>
                    <td>
                      <span className="prt-ret-num">
                        <Undo2 size={12} /> {r.return_number}
                      </span>
                    </td>
                    <td className="prt-mono">{formatDate(r.return_date)}</td>
                    <td><span className="prt-inv-pill">{r.purchase?.invoice_number ?? '-'}</span></td>
                    <td>
                      <div className="prt-sup-cell">
                        <div className="prt-sup-avatar">{(r.supplier?.name ?? '?').charAt(0).toUpperCase()}</div>
                        <span className="prt-sup-name">{r.supplier?.name ?? '-'}</span>
                      </div>
                    </td>
                    <td className="right"><span className="prt-num neg">{formatCurrency(r.total_amount)}</span></td>
                    <td className="prt-muted">{r.reason ?? '-'}</td>
                    <td>
                      <button className="prt-act" onClick={() => setViewReturn(r)} title="View return">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="prt-card-list">
            {filtered.map((r, idx) => (
              <div key={r.id} className="prt-card" style={{ animationDelay: `${Math.min(idx, 14) * 0.03}s` }}>
                <div className="prt-card-head">
                  <div>
                    <div className="prt-ret-num">
                      <Undo2 size={12} /> {r.return_number}
                    </div>
                    <div className="prt-card-date">{formatDate(r.return_date)}</div>
                  </div>
                  <span className="prt-refund-badge">{formatCurrency(r.total_amount)}</span>
                </div>

                <div className="prt-card-meta">
                  <span className="prt-inv-pill">{r.purchase?.invoice_number ?? '-'}</span>
                  {r.supplier?.name && (
                    <div className="prt-sup-cell">
                      <div className="prt-sup-avatar small">{(r.supplier.name).charAt(0).toUpperCase()}</div>
                      <span className="prt-sup-name">{r.supplier.name}</span>
                    </div>
                  )}
                </div>

                {r.reason && (
                  <div className="prt-card-reason">
                    <AlertCircle size={12} /> {r.reason}
                  </div>
                )}

                <button className="prt-act full" onClick={() => setViewReturn(r)}>
                  <Eye size={14} /> View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <ReturnForm
          purchases={purchases}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function ReturnForm({ purchases, onClose, onSuccess }: { purchases: Purchase[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast()
  const [purchaseId, setPurchaseId] = useState('')
  const [items, setItems] = useState<{ item: any; quantity: number; sqft: number; reason: string }[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedPurchase = purchases.find((p) => p.id === purchaseId)

  const handleSelectPurchase = (id: string) => {
    setPurchaseId(id)
    const pur = purchases.find((p) => p.id === id)
    if (pur) {
      setItems((pur as any).purchase_items?.map((pi: any) => ({ item: pi, quantity: 0, sqft: 0, reason: '' })) ?? [])
    }
  }

  const totalAmount = items.reduce((s, item) => {
    return s + (item.quantity * Number(item.item.purchase_rate) || item.sqft * Number(item.item.purchase_rate))
  }, 0)

  const handleSave = async () => {
    if (!purchaseId) { toast('Select a purchase', 'error'); return }
    const validItems = items.filter((i) => i.quantity > 0 || i.sqft > 0)
    if (validItems.length === 0) { toast('Enter return quantity for at least one item', 'error'); return }
    setSaving(true)

    const retNum = await nextInvoiceNumber('PR')
    const pur = purchases.find((p) => p.id === purchaseId)
    const { data: ret, error } = await supabase.from('purchase_returns').insert({
      return_number: retNum,
      purchase_id: purchaseId,
      supplier_id: pur?.supplier_id ?? null,
      return_date: new Date().toISOString().split('T')[0],
      total_amount: totalAmount,
      reason: reason || null,
    }).select('id').maybeSingle()

    if (error || !ret) { toast(`Error: ${error?.message}`, 'error'); setSaving(false); return }

    for (const item of validItems) {
      const pi = item.item
      await supabase.from('purchase_return_items').insert({
        return_id: ret.id,
        product_id: pi.product_id,
        slab_id: pi.slab_id,
        description: pi.description,
        unit: pi.unit,
        quantity: item.quantity,
        sqft: item.sqft,
        rate: pi.purchase_rate,
        amount: item.quantity * Number(pi.purchase_rate) || item.sqft * Number(pi.purchase_rate),
        reason: item.reason || null,
      })

      const product = (pur as any).purchase_items?.find((p: any) => p.id === pi.id)?.product
      const invType = product?.category?.inventory_type ?? 'piece'
      const stockOutCount = invType === 'piece' ? item.quantity : 0
      const stockOutSqft = invType === 'slab' || invType === 'box' ? item.sqft : 0
      await recordStockMovement({
        product_id: pi.product_id,
        category_id: pi.category_id,
        slab_id: pi.slab_id ?? null,
        transaction_type: 'supplier_return',
        reference_number: retNum,
        reference_id: ret.id,
        stock_out_count: stockOutCount,
        stock_out_sqft: stockOutSqft,
        unit: pi.unit,
        remarks: `Purchase return: ${pi.description}`,
      })
    }

    toast('Purchase return processed')
    onSuccess()
    setSaving(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New Purchase Return"
      size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Process Return'}</button></>}
    >
      <div className="prt-form">
        {/* Step 1: Select purchase */}
        <div className="prt-section-label">Step 1 — Select Purchase</div>
        <div className="form-group">
          <label className="form-label">Original Purchase Invoice <span className="req">*</span></label>
          <select className="form-select" value={purchaseId} onChange={(e) => handleSelectPurchase(e.target.value)}>
            <option value="">Select Purchase Invoice</option>
            {purchases.map((p) => <option key={p.id} value={p.id}>{p.invoice_number} - {p.supplier?.name ?? '-'} - {formatCurrency(p.total_amount)}</option>)}
          </select>
        </div>

        {/* Selected purchase summary */}
        {selectedPurchase && (
          <div className="prt-sale-banner">
            <div className="prt-sale-banner-ic"><Truck size={18} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="prt-sale-banner-num">{(selectedPurchase as any).invoice_number}</div>
              <div className="prt-sale-banner-meta">
                <span className="prt-sale-banner-name">{(selectedPurchase as any).supplier?.name ?? '-'}</span>
                <span className="prt-sale-banner-amount">{formatCurrency((selectedPurchase as any).total_amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Items */}
        {selectedPurchase && items.length > 0 && (
          <>
            <div className="prt-section-label">Step 2 — Choose Items to Return</div>

            {/* Desktop table */}
            <div className="prt-table-wrap prt-items-table">
              <table className="prt-table">
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
                        <div className="prt-prod">
                          <div className="prt-prod-avatar small">{(item.item.description ?? '?').charAt(0).toUpperCase()}</div>
                          <span className="prt-prod-name">{item.item.description}</span>
                        </div>
                      </td>
                      <td><span className="prt-unit-pill">{item.item.unit}</span></td>
                      <td className="right">
                        <span className="prt-orig">
                          {item.item.slab_count > 0 ? `${item.item.slab_count} slabs` : item.item.quantity}
                        </span>
                      </td>
                      <td className="right">
                        <input
                          className="form-input prt-input"
                          type="number"
                          step="0.01"
                          style={{ width: 80 }}
                          value={item.quantity || ''}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                        />
                      </td>
                      <td className="right">
                        <input
                          className="form-input prt-input"
                          type="number"
                          step="0.01"
                          style={{ width: 90 }}
                          value={item.sqft || ''}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sqft: Number(e.target.value) } : x))}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input prt-input"
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
            <div className="prt-card-list prt-items-cards">
              {items.map((item, i) => (
                <div key={i} className="prt-card prt-form-card" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                  <div className="prt-card-head">
                    <div className="prt-prod">
                      <div className="prt-prod-avatar">{(item.item.description ?? '?').charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="prt-prod-name">{item.item.description}</div>
                        <span className="prt-unit-pill">{item.item.unit}</span>
                      </div>
                    </div>
                    <div className="prt-orig-tag">
                      <span>Original</span>
                      <strong>{item.item.slab_count > 0 ? `${item.item.slab_count} slabs` : item.item.quantity}</strong>
                    </div>
                  </div>

                  <div className="prt-form-card-grid">
                    <div className="prt-field">
                      <label>Return Qty</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantity || ''}
                        onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                      />
                    </div>
                    <div className="prt-field">
                      <label>Return Sq.Ft</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.sqft || ''}
                        onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sqft: Number(e.target.value) } : x))}
                      />
                    </div>
                  </div>

                  <div className="prt-field">
                    <label>Reason</label>
                    <input
                      placeholder="e.g. Quality issue, Wrong item"
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
        <div className="prt-section-label">Step 3 — Overall Reason (Optional)</div>
        <div className="form-group">
          <input
            className="form-input"
            placeholder="e.g. Damaged in transit, wrong specification"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Refund summary */}
        {totalAmount > 0 && (
          <div className="prt-refund-total">
            <div className="prt-refund-total-ic"><TrendingDown size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="prt-refund-total-label">Return Total</div>
              <div className="prt-refund-total-value">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ═══════════ Styles ═══════════ */
const prtStyles = `
  .prt-root {
    --prt-card: #ffffff;
    --prt-border: #e6ebf2;
    --prt-text: #0f172a;
    --prt-muted: #64748b;
    --prt-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: prtFade .38s ease both;
  }
  @keyframes prtFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes prtRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes prtRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes prtSlideIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes prtShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes prtFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes prtPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,.4); }
    50%      { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
  }

  /* ═══ Header ═══ */
  .prt-header {
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
      linear-gradient(135deg, #ffffff, #f4fffb);
    border: 1px solid #a7f3d0;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .prt-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #10b981, #06b6d4, #0891b2);
  }
  .prt-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #059669 55%, #0891b2 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .prt-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--prt-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .prt-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #d1fae5, #cffafe);
    color: #047857;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Buttons */
  .prt-add-btn,
  .prt-back-btn {
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
  .prt-add-btn {
    background: linear-gradient(115deg, #10b981, #06b6d4);
    box-shadow: 0 14px 28px -14px rgba(16,185,129,.85);
  }
  .prt-back-btn {
    background: linear-gradient(115deg, #0f172a, #1e293b);
    box-shadow: 0 14px 28px -14px rgba(15,23,42,.75);
  }
  .prt-add-btn::after,
  .prt-back-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .prt-add-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(16,185,129,.95);
  }
  .prt-back-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(15,23,42,.85);
  }
  .prt-add-btn:hover::after,
  .prt-back-btn:hover::after { animation: prtShine .9s ease; }
  .prt-add-btn:active:not(:disabled),
  .prt-back-btn:active { transform: scale(.96); }
  .prt-add-btn:disabled { opacity: .55; cursor: not-allowed; filter: grayscale(.4); }

  /* ═══ Stats ═══ */
  .prt-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  @media (max-width: 640px) {
    .prt-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }
  @media (max-width: 420px) {
    .prt-stats { grid-template-columns: 1fr; }
  }

  .prt-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--prt-card);
    border: 1px solid var(--prt-border);
    border-radius: 16px;
    padding: 15px 17px;
    display: flex;
    align-items: center;
    gap: 13px;
    animation: prtRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .prt-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .prt-stat::after {
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
  .prt-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .prt-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .prt-stat.c-emerald { --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.55); }
  .prt-stat.c-amber   { --sc1:#f59e0b; --sc2:#fbbf24; --scs: rgba(245,158,11,.55); }

  .prt-stat-ico {
    width: 44px; height: 44px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .prt-stat-ico svg { width: 20px; height: 20px; }
  .prt-stat:hover .prt-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .prt-stat-body { min-width: 0; flex: 1; }
  .prt-stat-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--prt-muted);
    margin-bottom: 4px;
  }
  .prt-stat-value {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--prt-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prt-stat.c-emerald .prt-stat-value { color: #047857; }
  .prt-stat.c-amber .prt-stat-value   { color: #b45309; }
  .prt-stat-sub {
    font-size: 11px;
    color: var(--prt-soft);
    margin-top: 2px;
    font-weight: 600;
  }

  /* ═══ Filters ═══ */
  .prt-filters {
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #f4fffb);
    border: 1px solid var(--prt-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: prtRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  .prt-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--prt-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .prt-search:focus-within {
    border-color: #6ee7b7;
    box-shadow: 0 0 0 4px rgba(16,185,129,.14);
    transform: translateY(-1px);
  }
  .prt-search svg { color: #059669; flex-shrink: 0; }
  .prt-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--prt-text);
    height: 100%;
    min-width: 0;
  }
  .prt-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .prt-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--prt-muted);
    cursor: pointer;
    transition: all .18s ease;
    flex-shrink: 0;
  }
  .prt-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  /* ═══ Panel / Table ═══ */
  .prt-panel {
    background: var(--prt-card);
    border: 1px solid var(--prt-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: prtRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .prt-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #a7f3d0;
  }
  .prt-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--prt-border);
    background: linear-gradient(180deg, #fbfdff, #ffffff);
  }
  .prt-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -.01em;
    color: var(--prt-text);
  }
  .prt-pt-ico {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #10b981, #34d399);
    box-shadow: 0 8px 16px -8px rgba(16,185,129,.9);
  }

  .prt-table-wrap { overflow-x: auto; }
  .prt-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 700px; }
  .prt-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--prt-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--prt-border);
    white-space: nowrap;
  }
  .prt-table thead th.right { text-align: right; }
  .prt-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--prt-text);
    vertical-align: middle;
  }
  .prt-table tbody tr:last-child td { border-bottom: none; }
  .prt-table tbody tr {
    animation: prtRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .prt-table tbody tr:hover {
    background: linear-gradient(90deg, #f0fdf4, #ffffff);
    box-shadow: inset 3px 0 0 #10b981;
  }
  .prt-table .right { text-align: right; }

  .prt-ret-num {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #047857;
  }
  .prt-ret-num svg { color: #10b981; }
  .prt-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--prt-text);
  }
  .prt-muted { color: var(--prt-muted); font-weight: 600; font-size: 12.5px; }
  .prt-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--prt-text);
    white-space: nowrap;
  }
  .prt-num.neg { color: #be123c; }
  .prt-num.cyan { color: #0e7490; }

  .prt-inv-pill {
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

  .prt-sup-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .prt-sup-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #10b981, #06b6d4);
    box-shadow: 0 8px 16px -10px rgba(16,185,129,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .prt-sup-avatar.small { width: 24px; height: 24px; font-size: 11px; border-radius: 8px; }
  .prt-table tbody tr:hover .prt-sup-avatar,
  .prt-card:hover .prt-sup-avatar { transform: scale(1.08) rotate(-6deg); }
  .prt-sup-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--prt-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .prt-prod { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .prt-prod-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #10b981, #06b6d4);
    box-shadow: 0 8px 16px -10px rgba(16,185,129,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .prt-prod-avatar.small { width: 28px; height: 28px; font-size: 12px; border-radius: 9px; }
  .prt-table tbody tr:hover .prt-prod-avatar { transform: scale(1.08) rotate(-6deg); }
  .prt-prod-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--prt-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .prt-unit-pill {
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

  .prt-orig {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid var(--prt-border);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #475569;
    font-size: 12px;
  }

  .prt-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 32px; height: 32px;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--prt-border);
    color: var(--prt-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .prt-act:hover {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #047857;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(16,185,129,.7);
  }
  .prt-act.full {
    width: 100%;
    padding: 9px 14px;
    margin-top: 10px;
    justify-content: center;
  }
  .prt-act:active { transform: scale(.9); }

  /* ═══ Mobile cards ═══ */
  .prt-card-list { display: none; padding: 12px; }
  @media (max-width: 720px) {
    .prt-table-wrap { display: none; }
    .prt-card-list { display: grid; gap: 12px; grid-template-columns: 1fr; }
    .prt-items-table { display: none; }
    .prt-items-cards { display: grid; }
  }
  @media (min-width: 721px) {
    .prt-items-cards { display: none; }
  }

  .prt-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: #fff;
    border: 1px solid var(--prt-border);
    border-radius: 14px;
    padding: 14px;
    animation: prtRise .45s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .prt-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #10b981, #34d399, #06b6d4);
  }
  .prt-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 34px -22px rgba(16,185,129,.35);
  }
  .prt-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
  }
  .prt-card-date {
    font-size: 11.5px;
    color: var(--prt-soft);
    font-weight: 600;
    margin-top: 3px;
  }
  .prt-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 11px;
  }
  .prt-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .prt-card-stat {
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    border: 1px solid var(--prt-border);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .prt-card-stat-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--prt-soft);
    margin-bottom: 3px;
  }
  .prt-card-stat-value {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--prt-text);
    font-variant-numeric: tabular-nums;
  }
  .prt-card-stat-value.neg  { color: #be123c; }
  .prt-card-stat-value.cyan { color: #0e7490; }

  .prt-card-reason {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--prt-muted);
    font-weight: 600;
    padding: 8px 10px;
    border-radius: 9px;
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border: 1px solid #fde68a;
    margin-bottom: 8px;
  }
  .prt-card-reason svg { color: #d97706; flex-shrink: 0; }

  .prt-refund-badge {
    display: inline-flex;
    align-items: center;
    padding: 5px 11px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border: 1px solid #a7f3d0;
    color: #047857;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ═══ View info cards ═══ */
  .prt-view-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  @media (max-width: 640px) {
    .prt-view-info { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  }
  @media (max-width: 420px) {
    .prt-view-info { grid-template-columns: 1fr; }
  }

  .prt-info-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--prt-card);
    border: 1px solid var(--prt-border);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: prtRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .prt-info-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--ic1), var(--ic2));
  }
  .prt-info-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 32px -22px var(--ics);
  }
  .prt-info-card.c-indigo  { --ic1:#6366f1; --ic2:#818cf8; --ics: rgba(99,102,241,.55); }
  .prt-info-card.c-cyan    { --ic1:#06b6d4; --ic2:#22d3ee; --ics: rgba(6,182,212,.55); }
  .prt-info-card.c-amber   { --ic1:#f59e0b; --ic2:#fbbf24; --ics: rgba(245,158,11,.55); }
  .prt-info-card.c-emerald { --ic1:#10b981; --ic2:#34d399; --ics: rgba(16,185,129,.55); }

  .prt-info-ico {
    width: 40px; height: 40px;
    border-radius: 11px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--ic1), var(--ic2));
    box-shadow: 0 10px 20px -10px var(--ics);
    flex-shrink: 0;
  }
  .prt-info-ico svg { width: 18px; height: 18px; }
  .prt-info-body { min-width: 0; flex: 1; }
  .prt-info-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--prt-soft);
    margin-bottom: 3px;
  }
  .prt-info-value {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--prt-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prt-info-card.c-emerald .prt-info-value { color: #047857; font-variant-numeric: tabular-nums; }

  /* ═══ Form ═══ */
  .prt-form { display: flex; flex-direction: column; gap: 4px; }

  .prt-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--prt-muted);
    margin: 18px 0 12px;
  }
  .prt-section-label:first-child { margin-top: 0; }
  .prt-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #10b981, #06b6d4);
  }

  .prt-sale-banner {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f4fffb, #d1fae5);
    border: 1px solid #a7f3d0;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
    animation: prtRise .45s cubic-bezier(.22,1,.36,1) both;
  }
  .prt-sale-banner::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #10b981, #34d399, #06b6d4);
  }
  .prt-sale-banner-ic {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #10b981, #06b6d4);
    box-shadow: 0 12px 22px -10px rgba(16,185,129,.9);
    flex-shrink: 0;
    animation: prtFloat 3s ease-in-out infinite;
  }
  .prt-sale-banner-ic svg { width: 19px; height: 19px; }
  .prt-sale-banner-num {
    font-size: 14px;
    font-weight: 800;
    color: #047857;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.01em;
  }
  .prt-sale-banner-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-top: 3px;
    flex-wrap: wrap;
  }
  .prt-sale-banner-name {
    font-size: 12.5px;
    color: #047857;
    opacity: .85;
    font-weight: 700;
  }
  .prt-sale-banner-amount {
    font-size: 13px;
    font-weight: 800;
    color: #047857;
    font-variant-numeric: tabular-nums;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255,255,255,.6);
    border: 1px solid #a7f3d0;
  }

  .prt-input {
    height: 34px !important;
    padding: 0 10px !important;
    border-radius: 9px !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums;
    transition: border-color .18s ease, box-shadow .18s ease;
  }
  .prt-input:focus {
    border-color: #6ee7b7 !important;
    box-shadow: 0 0 0 3px rgba(16,185,129,.14) !important;
    outline: none !important;
  }

  .prt-form-card {
    background: #fbfefd;
  }
  .prt-form-card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
  }
  .prt-field { display: flex; flex-direction: column; gap: 4px; }
  .prt-field label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--prt-soft);
  }
  .prt-field input {
    height: 36px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--prt-border);
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--prt-text);
    transition: border-color .18s ease, box-shadow .18s ease;
    width: 100%;
    min-width: 0;
  }
  .prt-field input:focus {
    border-color: #6ee7b7;
    box-shadow: 0 0 0 3px rgba(16,185,129,.14);
    outline: none;
  }

  .prt-orig-tag {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .prt-orig-tag span {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--prt-soft);
  }
  .prt-orig-tag strong {
    font-size: 13px;
    font-weight: 800;
    color: #475569;
    font-variant-numeric: tabular-nums;
    padding: 3px 9px;
    border-radius: 8px;
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid var(--prt-border);
  }

  /* Refund total */
  .prt-refund-total {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f4fffb 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    margin-top: 16px;
    position: relative;
    overflow: hidden;
    animation: prtRise .45s cubic-bezier(.22,1,.36,1) both;
  }
  .prt-refund-total::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #10b981, #06b6d4);
  }
  .prt-refund-total-ic {
    width: 46px; height: 46px;
    border-radius: 13px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #059669, #06b6d4);
    box-shadow: 0 12px 24px -12px rgba(16,185,129,.9);
    flex-shrink: 0;
    animation: prtPulse 2.4s ease-in-out infinite;
  }
  .prt-refund-total-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #047857;
    margin-bottom: 3px;
  }
  .prt-refund-total-value {
    font-size: 24px;
    font-weight: 800;
    color: #047857;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  @media (prefers-reduced-motion: reduce) {
    .prt-root *, .prt-root *::before, .prt-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
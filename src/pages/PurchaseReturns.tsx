import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatDate, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Purchase } from '../lib/types'
import { Plus, Search, Undo2, Eye } from 'lucide-react'

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

  if (loading) return <Loading label="Loading returns..." />

  if (viewReturn) {
    return (
      <div>
        <div className="page-header">
          <div><h2>Return {viewReturn.return_number}</h2><div className="page-sub">{formatDate(viewReturn.return_date)}</div></div>
          <button className="btn btn-primary" onClick={() => setViewReturn(null)}>Back</button>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="form-row mb-4">
              <div><strong>Purchase:</strong> {viewReturn.purchase?.invoice_number ?? '-'}</div>
              <div><strong>Supplier:</strong> {viewReturn.supplier?.name ?? '-'}</div>
              <div><strong>Reason:</strong> {viewReturn.reason ?? '-'}</div>
              <div><strong>Amount:</strong> {formatCurrency(viewReturn.total_amount)}</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Sq.Ft</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Reason</th></tr></thead>
                <tbody>
                  {(viewReturn.purchase_return_items ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td className="font-semibold">{item.product?.name ?? item.description ?? '-'}</td>
                      <td>{item.unit ?? '-'}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">{item.sqft}</td>
                      <td className="text-right">{formatCurrency(item.rate)}</td>
                      <td className="text-right">{formatCurrency(item.amount)}</td>
                      <td>{item.reason ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div><h2>Purchase Returns</h2><div className="page-sub">Return products to suppliers and reduce stock</div></div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={purchases.length === 0}><Plus size={16} /> New Return</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search returns..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Undo2 />} title="No purchase returns" message="Return products to suppliers here" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Return #</th><th>Date</th><th>Purchase</th><th>Supplier</th><th className="text-right">Amount</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.return_number}</td>
                  <td>{formatDate(r.return_date)}</td>
                  <td>{r.purchase?.invoice_number ?? '-'}</td>
                  <td>{r.supplier?.name ?? '-'}</td>
                  <td className="text-right">{formatCurrency(r.total_amount)}</td>
                  <td>{r.reason ?? '-'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setViewReturn(r)}><Eye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <ReturnForm purchases={purchases} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData() }} />}
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

      // Reduce stock using category-specific rules
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
    <Modal open onClose={onClose} title="New Purchase Return" size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Process Return'}</button></>}
    >
      <div className="form-group">
        <label className="form-label">Select Purchase <span className="req">*</span></label>
        <select className="form-select" value={purchaseId} onChange={(e) => handleSelectPurchase(e.target.value)}>
          <option value="">Select Purchase Invoice</option>
          {purchases.map((p) => <option key={p.id} value={p.id}>{p.invoice_number} - {p.supplier?.name ?? '-'} - {formatCurrency(p.total_amount)}</option>)}
        </select>
      </div>

      {selectedPurchase && items.length > 0 && (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Original Qty</th><th className="text-right">Return Qty</th><th className="text-right">Return Sq.Ft</th><th>Reason</th></tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="font-semibold">{item.item.description}</td>
                  <td>{item.item.unit}</td>
                  <td className="text-right">{item.item.slab_count > 0 ? `${item.item.slab_count} slabs` : item.item.quantity}</td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 70 }} value={item.quantity || ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} /></td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 80 }} value={item.sqft || ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sqft: Number(e.target.value) } : x))} /></td>
                  <td><input className="form-input" style={{ width: 120 }} value={item.reason} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Overall Reason</label>
        <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {totalAmount > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
          <span>Return Total</span><span style={{ color: 'var(--error-600)' }}>{formatCurrency(totalAmount)}</span>
        </div>
      )}
    </Modal>
  )
}

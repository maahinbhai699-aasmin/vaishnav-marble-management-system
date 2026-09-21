import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatDate, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Sale } from '../lib/types'
import { Plus, Search, Undo2, Eye } from 'lucide-react'

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
              <div><strong>Invoice:</strong> {viewReturn.sale?.invoice_number ?? '-'}</div>
              <div><strong>Customer:</strong> {viewReturn.customer?.name ?? '-'}</div>
              <div><strong>Reason:</strong> {viewReturn.reason ?? '-'}</div>
              <div><strong>Refund:</strong> {formatCurrency(viewReturn.total_amount)}</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Sq.Ft</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Reason</th></tr></thead>
                <tbody>
                  {(viewReturn.sales_return_items ?? []).map((item: any) => (
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
        <div><h2>Sales Returns</h2><div className="page-sub">Process customer returns and restock inventory</div></div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={sales.length === 0}><Plus size={16} /> New Return</button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search returns..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Undo2 />} title="No sales returns" message="Process customer returns here" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Return #</th><th>Date</th><th>Invoice</th><th>Customer</th><th className="text-right">Refund Amount</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.return_number}</td>
                  <td>{formatDate(r.return_date)}</td>
                  <td>{r.sale?.invoice_number ?? '-'}</td>
                  <td>{r.customer?.name ?? '-'}</td>
                  <td className="text-right">{formatCurrency(r.total_amount)}</td>
                  <td>{r.reason ?? '-'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setViewReturn(r)}><Eye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <ReturnForm sales={sales} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData() }} />}
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

      // Return stock to inventory using category-specific rules
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
    <Modal open onClose={onClose} title="New Sales Return" size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Process Return'}</button></>}
    >
      <div className="form-group">
        <label className="form-label">Select Sale <span className="req">*</span></label>
        <select className="form-select" value={saleId} onChange={(e) => handleSelectSale(e.target.value)}>
          <option value="">Select Invoice</option>
          {sales.map((s) => <option key={s.id} value={s.id}>{s.invoice_number} - {s.customer_name ?? 'Walk-in'} - {formatCurrency(s.grand_total)}</option>)}
        </select>
      </div>

      {selectedSale && items.length > 0 && (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Original Qty</th><th className="text-right">Return Qty</th><th className="text-right">Return Sq.Ft</th><th>Reason</th></tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="font-semibold">{item.sale_item.description}</td>
                  <td>{item.sale_item.unit}</td>
                  <td className="text-right">{item.sale_item.unit === 'Sq.Ft' ? item.sale_item.sqft : item.sale_item.quantity}</td>
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
          <span>Refund Total</span><span style={{ color: 'var(--error-600)' }}>{formatCurrency(totalAmount)}</span>
        </div>
      )}
    </Modal>
  )
}

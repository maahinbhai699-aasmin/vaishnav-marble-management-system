import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatDate, formatNumber, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Location, Product, StockTransfer } from '../lib/types'
import { Plus, Search, ArrowLeftRight, Eye } from 'lucide-react'

export function StockTransfer() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [trRes, prodRes, locRes] = await Promise.all([
      supabase.from('stock_transfers').select('*, from_location:locations!from_location_id(*), to_location:locations!to_location_id(*), stock_transfer_items(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:categories(*)').order('name'),
      supabase.from('locations').select('*').order('name'),
    ])
    setTransfers((trRes.data ?? []) as StockTransfer[])
    setProducts((prodRes.data ?? []) as Product[])
    setLocations((locRes.data ?? []) as Location[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Loading label="Loading transfers..." />

  if (viewTransfer) {
    return (
      <div>
        <div className="page-header">
          <div><h2>Transfer {viewTransfer.transfer_number}</h2><div className="page-sub">{formatDate(viewTransfer.transfer_date)}</div></div>
          <button className="btn btn-primary" onClick={() => setViewTransfer(null)}>Back</button>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="form-row mb-4">
              <div><strong>From:</strong> {viewTransfer.from_location?.name ?? '-'}</div>
              <div><strong>To:</strong> {viewTransfer.to_location?.name ?? '-'}</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Sq.Ft</th></tr></thead>
                <tbody>
                  {(viewTransfer.stock_transfer_items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.description ?? '-'}</td>
                      <td>{item.unit ?? '-'}</td>
                      <td className="text-right">{formatNumber(item.quantity)}</td>
                      <td className="text-right">{formatNumber(item.sqft)}</td>
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
        <div><h2>Stock Transfer</h2><div className="page-sub">Move stock between locations</div></div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={locations.length < 2}><Plus size={16} /> New Transfer</button>
      </div>

      {transfers.length === 0 ? (
        <div className="card"><EmptyState icon={<ArrowLeftRight />} title="No transfers found" message="Create a stock transfer between locations" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Transfer #</th><th>Date</th><th>From</th><th>To</th><th className="text-right">Items</th><th>Actions</th></tr></thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold">{t.transfer_number}</td>
                  <td>{formatDate(t.transfer_date)}</td>
                  <td>{t.from_location?.name ?? '-'}</td>
                  <td>{t.to_location?.name ?? '-'}</td>
                  <td className="text-right">{t.stock_transfer_items?.length ?? 0}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setViewTransfer(t)}><Eye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <TransferForm products={products} locations={locations} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData() }} />}
    </div>
  )
}

function TransferForm({ products, locations, onClose, onSuccess }: { products: Product[]; locations: Location[]; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast()
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation] = useState('')
  const [cart, setCart] = useState<{ product_id: string; description: string; unit: string; quantity: number; sqft: number }[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!productSearch) return []
    return products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 10)
  }, [products, productSearch])

  const addProduct = (product: Product) => {
    const invType = product.category?.inventory_type ?? 'piece'
    const qty = invType === 'piece' ? 1 : 0
    const sqft = invType === 'slab' || invType === 'box' ? Number(product.stock_sqft || 0) : 0
    setCart([...cart, {
      product_id: product.id,
      description: product.name,
      unit: product.selling_unit ?? (invType === 'slab' ? 'Sq.Ft' : invType === 'box' ? 'Box' : 'Piece'),
      quantity: qty,
      sqft,
    }])
    setProductSearch('')
  }

  const updateItem = (index: number, updates: Partial<typeof cart[0]>) => setCart(cart.map((c, i) => i === index ? { ...c, ...updates } : c))
  const removeItem = (index: number) => setCart(cart.filter((_, i) => i !== index))

  const handleSave = async () => {
    if (!fromLocation || !toLocation) { toast('Select locations', 'error'); return }
    if (fromLocation === toLocation) { toast('From and To must be different', 'error'); return }
    if (cart.length === 0) { toast('Add at least one product', 'error'); return }
    setSaving(true)

    const trNum = await nextInvoiceNumber('TRF')
    const { data: transfer, error } = await supabase.from('stock_transfers').insert({
      transfer_number: trNum,
      from_location_id: fromLocation,
      to_location_id: toLocation,
      transfer_date: new Date().toISOString().split('T')[0],
      notes: notes || null,
    }).select('id').maybeSingle()

    if (error || !transfer) { toast(`Error: ${error?.message}`, 'error'); setSaving(false); return }

    for (const item of cart) {
      const product = products.find((p) => p.id === item.product_id)
      const invType = product?.category?.inventory_type ?? 'piece'
      const stockOutCount = invType === 'piece' ? item.quantity : 0
      const stockInCount = invType === 'piece' ? item.quantity : 0
      const stockOutSqft = invType === 'slab' || invType === 'box' ? item.sqft : 0
      const stockInSqft = invType === 'slab' || invType === 'box' ? item.sqft : 0

      await supabase.from('stock_transfer_items').insert({
        transfer_id: transfer.id,
        product_id: item.product_id,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        slab_count: invType === 'slab' ? item.quantity : 0,
        sqft: item.sqft,
      })

      // Stock out from source
      await recordStockMovement({
        product_id: item.product_id,
        category_id: product?.category_id,
        transaction_type: 'transfer_out',
        reference_number: trNum,
        reference_id: transfer.id,
        stock_out_count: stockOutCount,
        stock_out_sqft: stockOutSqft,
        unit: item.unit,
        location_id: fromLocation,
        remarks: `Transfer to ${locations.find((l) => l.id === toLocation)?.name}`,
      })

      // Stock in to destination
      await recordStockMovement({
        product_id: item.product_id,
        category_id: product?.category_id,
        transaction_type: 'transfer_in',
        reference_number: trNum,
        reference_id: transfer.id,
        stock_in_count: stockInCount,
        stock_in_sqft: stockInSqft,
        unit: item.unit,
        location_id: toLocation,
        remarks: `Transfer from ${locations.find((l) => l.id === fromLocation)?.name}`,
      })

      // Update product location
      await supabase.from('products').update({ location_id: toLocation, updated_at: new Date().toISOString() }).eq('id', item.product_id)
    }

    toast('Stock transfer completed')
    onSuccess()
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title="New Stock Transfer" size="lg"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Transfer'}</button></>}
    >
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">From Location <span className="req">*</span></label>
          <select className="form-select" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>
            <option value="">Select Source</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">To Location <span className="req">*</span></label>
          <select className="form-select" value={toLocation} onChange={(e) => setToLocation(e.target.value)}>
            <option value="">Select Destination</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      <div className="search-input mb-4" style={{ width: '100%' }}>
        <Search />
        <input className="form-input" style={{ width: '100%' }} placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
      </div>
      {filteredProducts.length > 0 && (
        <div className="card mb-4" style={{ padding: 8, maxHeight: 150, overflow: 'auto' }}>
          {filteredProducts.map((p) => (
            <button key={p.id} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start' }} onClick={() => addProduct(p)}>
              <span className="font-semibold">{p.name}</span> <span className="text-muted text-sm">{p.category?.name}</span>
            </button>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Sq.Ft</th><th></th></tr></thead>
            <tbody>
              {cart.map((item, i) => (
                <tr key={i}>
                  <td className="font-semibold">{item.description}</td>
                  <td>{item.unit}</td>
                  <td className="text-right"><input className="form-input" type="number" style={{ width: 70 }} value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} /></td>
                  <td className="text-right"><input className="form-input" type="number" step="0.01" style={{ width: 90 }} value={item.sqft} onChange={(e) => updateItem(i, { sqft: Number(e.target.value) })} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Notes</label>
        <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}

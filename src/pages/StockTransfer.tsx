import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatDate, formatNumber, nextInvoiceNumber } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Location, Product, StockTransfer } from '../lib/types'
import { Plus, Search, ArrowLeftRight, Eye, X, Package, MapPin, ArrowRight, Trash2, FileText } from 'lucide-react'

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
      <div className="st-root">
        <style>{stStyles}</style>
        <div className="st-header">
          <div>
            <h2>Transfer {viewTransfer.transfer_number}</h2>
            <div className="st-header-sub">
              {formatDate(viewTransfer.transfer_date)}
              <span className="st-header-chip">
                {(viewTransfer.stock_transfer_items ?? []).length} item{(viewTransfer.stock_transfer_items ?? []).length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <button className="st-back-btn" onClick={() => setViewTransfer(null)}>
            <ArrowLeftRight size={16} /> Back
          </button>
        </div>

        {/* Route visualization */}
        <div className="st-route">
          <div className="st-route-node from">
            <div className="st-route-icon"><MapPin size={20} /></div>
            <div className="st-route-body">
              <div className="st-route-label">From</div>
              <div className="st-route-name">{viewTransfer.from_location?.name ?? '-'}</div>
            </div>
          </div>
          <div className="st-route-arrow">
            <ArrowRight size={22} />
            <span className="st-route-line" />
          </div>
          <div className="st-route-node to">
            <div className="st-route-icon"><MapPin size={20} /></div>
            <div className="st-route-body">
              <div className="st-route-label">To</div>
              <div className="st-route-name">{viewTransfer.to_location?.name ?? '-'}</div>
            </div>
          </div>
        </div>

        <div className="st-panel">
          <div className="st-panel-head">
            <div className="st-panel-title">
              <span className="st-pt-ico cyan"><Package size={16} /></span>
              Items in this Transfer
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="st-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th className="right">Qty</th>
                  <th className="right">Sq.Ft</th>
                </tr>
              </thead>
              <tbody>
                {(viewTransfer.stock_transfer_items ?? []).map((item, idx) => (
                  <tr key={item.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td>
                      <div className="st-prod">
                        <div className="st-prod-avatar">{(item.description ?? '?').charAt(0).toUpperCase()}</div>
                        <span className="st-prod-name">{item.description ?? '-'}</span>
                      </div>
                    </td>
                    <td className="st-muted">{item.unit ?? '-'}</td>
                    <td className="right"><span className="st-num">{formatNumber(item.quantity)}</span></td>
                    <td className="right"><span className="st-num cyan">{formatNumber(item.sqft)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="st-root">
      <style>{stStyles}</style>

      {/* Header */}
      <div className="st-header">
        <div>
          <h2>Stock Transfer</h2>
          <div className="st-header-sub">
            Move stock between locations
            {transfers.length > 0 && (
              <span className="st-header-chip">{transfers.length} transfer{transfers.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <button
          className="st-add-btn"
          onClick={() => setModalOpen(true)}
          disabled={locations.length < 2}
          title={locations.length < 2 ? 'At least 2 locations are required' : 'New Transfer'}
        >
          <Plus size={16} /> New Transfer
        </button>
      </div>

      {/* Content */}
      {transfers.length === 0 ? (
        <div className="st-panel">
          <EmptyState icon={<ArrowLeftRight />} title="No transfers found" message="Create a stock transfer between locations" />
        </div>
      ) : (
        <div className="st-panel">
          <div className="st-panel-head">
            <div className="st-panel-title">
              <span className="st-pt-ico indigo"><ArrowLeftRight size={16} /></span>
              All Transfers
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="st-table">
              <thead>
                <tr>
                  <th>Transfer #</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="right">Items</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, idx) => (
                  <tr key={t.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td><span className="st-ref">{t.transfer_number}</span></td>
                    <td className="st-muted">{formatDate(t.transfer_date)}</td>
                    <td>
                      <span className="st-loc from">
                        <MapPin size={11} /> {t.from_location?.name ?? '-'}
                      </span>
                    </td>
                    <td>
                      <span className="st-loc to">
                        <MapPin size={11} /> {t.to_location?.name ?? '-'}
                      </span>
                    </td>
                    <td className="right">
                      <span className="st-item-count">{t.stock_transfer_items?.length ?? 0}</span>
                    </td>
                    <td>
                      <button className="st-act" onClick={() => setViewTransfer(t)} title="View transfer">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <TransferForm
          products={products}
          locations={locations}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchData() }}
        />
      )}
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
      <div className="st-form">
        {/* Route visualization */}
        <div className="st-form-route">
          <div className="st-form-route-node">
            <label>From Location <span className="req">*</span></label>
            <div className="st-form-select">
              <MapPin size={15} />
              <select value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>
                <option value="">Select Source</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="st-form-route-mid">
            <div className="st-form-route-arrow">
              <ArrowRight size={20} />
            </div>
          </div>
          <div className="st-form-route-node">
            <label>To Location <span className="req">*</span></label>
            <div className="st-form-select">
              <MapPin size={15} />
              <select value={toLocation} onChange={(e) => setToLocation(e.target.value)}>
                <option value="">Select Destination</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Product search */}
        <div className="st-form-section-label">Add Products</div>
        <div className="st-search">
          <Search size={17} />
          <input
            placeholder="Search products to add..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          {productSearch && (
            <button className="st-clear" onClick={() => setProductSearch('')} title="Clear">
              <X size={14} />
            </button>
          )}
        </div>

        {filteredProducts.length > 0 && (
          <div className="st-suggest">
            {filteredProducts.map((p) => (
              <button key={p.id} className="st-suggest-item" onClick={() => addProduct(p)}>
                <div className="st-suggest-avatar">{p.name.charAt(0).toUpperCase()}</div>
                <div className="st-suggest-body">
                  <div className="st-suggest-name">{p.name}</div>
                  <div className="st-suggest-meta">{p.category?.name ?? 'Uncategorized'}</div>
                </div>
                <Plus size={14} className="st-suggest-plus" />
              </button>
            ))}
          </div>
        )}

        {/* Cart */}
        {cart.length > 0 ? (
          <div className="st-cart">
            <div className="st-cart-head">
              <span className="st-cart-title">Items to Transfer</span>
              <span className="st-cart-badge">{cart.length}</span>
            </div>
            <div className="st-cart-list">
              {cart.map((item, i) => (
                <div key={i} className="st-cart-item" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                  <div className="st-cart-item-head">
                    <div className="st-cart-item-name">{item.description}</div>
                    <button className="st-cart-item-del" onClick={() => removeItem(i)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="st-cart-item-row">
                    <div className="st-cart-field">
                      <label>Qty</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="st-cart-field">
                      <label>Sq.Ft</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.sqft}
                        onChange={(e) => updateItem(i, { sqft: Number(e.target.value) })}
                      />
                    </div>
                    <div className="st-cart-unit">{item.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="st-cart-empty">
            <div className="st-cart-empty-ic">
              <Package size={26} />
            </div>
            <p>No products added yet</p>
            <span>Search above and tap a product to add it</span>
          </div>
        )}

        {/* Notes */}
        <div className="st-form-section-label">Notes</div>
        <div className="st-notes">
          <FileText size={16} />
          <input
            placeholder="Optional note for this transfer..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════ Shared styles ═══════════ */
const stStyles = `
  .st-root {
    --st-card: #ffffff;
    --st-border: #e6ebf2;
    --st-text: #0f172a;
    --st-muted: #64748b;
    --st-soft: #94a3b8;
    display: grid;
    gap: 18px;
    animation: stFade .38s ease both;
  }
  @keyframes stFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes stRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes stRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes stShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
  @keyframes stPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,.4); }
    50%      { box-shadow: 0 0 0 10px rgba(6,182,212,0); }
  }
  @keyframes stSlideIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }

  /* ═══ Header ═══ */
  .st-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(6,182,212,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(99,102,241,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #f4fbff);
    border: 1px solid #cffafe;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .st-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #06b6d4, #6366f1, #8b5cf6);
  }
  .st-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #0891b2 55%, #6366f1 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .st-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--st-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .st-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #cffafe, #e0e7ff);
    color: #0891b2;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* Buttons */
  .st-add-btn,
  .st-back-btn {
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
  .st-add-btn {
    background: linear-gradient(115deg, #06b6d4, #6366f1);
    box-shadow: 0 14px 28px -14px rgba(6,182,212,.85);
  }
  .st-back-btn {
    background: linear-gradient(115deg, #0f172a, #1e293b);
    box-shadow: 0 14px 28px -14px rgba(15,23,42,.75);
  }
  .st-add-btn::after,
  .st-back-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
    transform: translateX(-140%);
    z-index: -1;
  }
  .st-add-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(6,182,212,.95);
  }
  .st-back-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 34px -14px rgba(15,23,42,.85);
  }
  .st-add-btn:hover::after,
  .st-back-btn:hover::after { animation: stShine .9s ease; }
  .st-add-btn:active:not(:disabled),
  .st-back-btn:active { transform: scale(.96); }
  .st-add-btn:disabled {
    opacity: .55;
    cursor: not-allowed;
    filter: grayscale(.4);
  }

  /* ═══ Route visualization ═══ */
  .st-route {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    align-items: center;
    padding: 22px 24px;
    background: linear-gradient(135deg, #ffffff, #f4fbff);
    border: 1px solid #cffafe;
    border-radius: 18px;
    box-shadow: 0 18px 34px -28px rgba(15,23,42,.35);
    animation: stRise .5s cubic-bezier(.22,1,.36,1) .04s both;
    position: relative;
    overflow: hidden;
  }
  .st-route::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #06b6d4, #6366f1);
  }
  @media (max-width: 640px) {
    .st-route { grid-template-columns: 1fr; }
    .st-route-arrow { transform: rotate(90deg); padding: 4px 0; }
  }

  .st-route-node {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .st-route-icon {
    width: 48px; height: 48px;
    border-radius: 14px;
    display: grid; place-items: center;
    color: #fff;
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .st-route-node:hover .st-route-icon { transform: scale(1.1) rotate(-8deg); }
  .st-route-node.from .st-route-icon {
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    box-shadow: 0 12px 22px -10px rgba(244,63,94,.85);
  }
  .st-route-node.to .st-route-icon {
    background: linear-gradient(135deg, #10b981, #34d399);
    box-shadow: 0 12px 22px -10px rgba(16,185,129,.85);
  }
  .st-route-body { min-width: 0; }
  .st-route-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .09em;
    text-transform: uppercase;
    color: var(--st-soft);
    margin-bottom: 3px;
  }
  .st-route-node.from .st-route-label { color: #be123c; }
  .st-route-node.to .st-route-label { color: #047857; }
  .st-route-name {
    font-size: 15px;
    font-weight: 800;
    color: var(--st-text);
    letter-spacing: -.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st-route-arrow {
    position: relative;
    display: grid;
    place-items: center;
    color: #6366f1;
    padding: 0 12px;
    animation: stPulse 2.4s ease-in-out infinite;
    border-radius: 50%;
    width: 54px;
    height: 54px;
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    border: 1px solid #c7d2fe;
  }
  .st-route-arrow svg { position: relative; z-index: 1; }

  /* ═══ Panel / Table ═══ */
  .st-panel {
    background: var(--st-card);
    border: 1px solid var(--st-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: stRise .5s cubic-bezier(.22,1,.36,1) .08s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .st-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #cffafe;
  }
  .st-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--st-border);
    background: linear-gradient(180deg, #fbfdff, #ffffff);
  }
  .st-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -.01em;
    color: var(--st-text);
  }
  .st-pt-ico {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #06b6d4, #22d3ee);
    box-shadow: 0 8px 16px -8px rgba(6,182,212,.9);
  }
  .st-pt-ico.cyan   { background: linear-gradient(135deg, #06b6d4, #22d3ee); box-shadow: 0 8px 16px -8px rgba(6,182,212,.9); }
  .st-pt-ico.indigo { background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 8px 16px -8px rgba(99,102,241,.9); }

  .st-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .st-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--st-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--st-border);
    white-space: nowrap;
  }
  .st-table thead th.right { text-align: right; }
  .st-table tbody td {
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--st-text);
    vertical-align: middle;
  }
  .st-table tbody tr:last-child td { border-bottom: none; }
  .st-table tbody tr {
    animation: stRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .st-table tbody tr:hover {
    background: linear-gradient(90deg, #f0fdff, #ffffff);
    box-shadow: inset 3px 0 0 #06b6d4;
  }
  .st-table .right { text-align: right; }

  .st-prod { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .st-prod-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #06b6d4, #6366f1);
    box-shadow: 0 8px 16px -10px rgba(6,182,212,.9);
    transition: transform .3s cubic-bezier(.34,1.56,.64,1);
  }
  .st-table tbody tr:hover .st-prod-avatar { transform: scale(1.1) rotate(-6deg); }
  .st-prod-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--st-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  .st-ref {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #4338ca;
  }
  .st-muted { color: var(--st-soft); font-weight: 600; }
  .st-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--st-text);
  }
  .st-num.cyan { color: #0891b2; }

  .st-loc {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st-loc svg { flex-shrink: 0; }
  .st-loc.from {
    background: linear-gradient(135deg, #fff1f2, #ffe4e6);
    color: #be123c;
  }
  .st-loc.to {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    color: #047857;
  }

  .st-item-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    padding: 4px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    color: #4338ca;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }

  .st-act {
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 9px;
    background: #f8fafc;
    border: 1px solid var(--st-border);
    color: var(--st-muted);
    cursor: pointer;
    transition: all .2s cubic-bezier(.22,1,.36,1);
  }
  .st-act:hover {
    background: #eef2ff;
    border-color: #c7d2fe;
    color: #4338ca;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(79,70,229,.7);
  }
  .st-act:active { transform: scale(.9); }

  /* ═══ Form ═══ */
  .st-form { display: flex; flex-direction: column; gap: 4px; }

  .st-form-route {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: end;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f0fdff, #eef2ff);
    border: 1px solid #cffafe;
    margin-bottom: 18px;
    position: relative;
  }
  .st-form-route::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #06b6d4, #6366f1);
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
  }
  @media (max-width: 640px) {
    .st-form-route { grid-template-columns: 1fr; }
    .st-form-route-mid { transform: rotate(90deg); padding: 4px 0; justify-self: center; }
  }
  .st-form-route-node { display: flex; flex-direction: column; gap: 6px; }
  .st-form-route-node label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: #4338ca;
  }
  .st-form-route-node label .req { color: #e11d48; margin-left: 2px; }
  .st-form-select {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 44px;
    border-radius: 11px;
    background: #fff;
    border: 1.5px solid #c7d2fe;
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .st-form-select:focus-within {
    border-color: #818cf8;
    box-shadow: 0 0 0 4px rgba(99,102,241,.14);
  }
  .st-form-select svg { color: #6366f1; flex-shrink: 0; }
  .st-form-select select {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--st-text);
    height: 100%;
    cursor: pointer;
  }
  .st-form-route-mid {
    display: grid;
    place-items: center;
    padding-bottom: 4px;
  }
  .st-form-route-arrow {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #06b6d4, #6366f1);
    box-shadow: 0 10px 20px -10px rgba(6,182,212,.9);
    animation: stPulse 2.4s ease-in-out infinite;
  }

  .st-form-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--st-muted);
    margin: 18px 0 10px;
  }
  .st-form-section-label::before {
    content: '';
    width: 4px; height: 14px;
    border-radius: 999px;
    background: linear-gradient(180deg, #06b6d4, #6366f1);
  }

  .st-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--st-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .st-search:focus-within {
    border-color: #6ee7b7;
    border-color: #67e8f9;
    box-shadow: 0 0 0 4px rgba(6,182,212,.14);
    transform: translateY(-1px);
  }
  .st-search svg { color: #06b6d4; flex-shrink: 0; }
  .st-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--st-text);
    height: 100%;
  }
  .st-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .st-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--st-muted);
    cursor: pointer;
    transition: all .18s ease;
  }
  .st-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  .st-suggest {
    margin-top: 8px;
    background: #fff;
    border: 1px solid var(--st-border);
    border-radius: 12px;
    padding: 6px;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 14px 30px -22px rgba(15,23,42,.35);
    animation: stRise .35s cubic-bezier(.22,1,.36,1) both;
  }
  .st-suggest-item {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 9px 10px;
    border: none;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background .16s ease, transform .16s ease;
  }
  .st-suggest-item:hover {
    background: linear-gradient(90deg, #f0fdff, #f5f3ff);
    transform: translateX(2px);
  }
  .st-suggest-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #06b6d4, #6366f1);
    box-shadow: 0 8px 16px -10px rgba(6,182,212,.9);
  }
  .st-suggest-body { flex: 1; min-width: 0; }
  .st-suggest-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--st-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st-suggest-meta {
    font-size: 11.5px;
    color: var(--st-soft);
    font-weight: 600;
  }
  .st-suggest-plus {
    color: #06b6d4;
    flex-shrink: 0;
    transition: transform .2s ease;
  }
  .st-suggest-item:hover .st-suggest-plus { transform: scale(1.2) rotate(90deg); }

  /* Cart */
  .st-cart {
    margin-top: 16px;
    border: 1px solid var(--st-border);
    border-radius: 14px;
    overflow: hidden;
    animation: stRise .4s cubic-bezier(.22,1,.36,1) both;
  }
  .st-cart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
  }
  .st-cart-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: -.01em;
  }
  .st-cart-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    padding: 3px 9px;
    border-radius: 999px;
    background: linear-gradient(135deg, #06b6d4, #6366f1);
    color: #fff;
    font-size: 11.5px;
    font-weight: 800;
    box-shadow: 0 8px 16px -8px rgba(6,182,212,.9);
  }
  .st-cart-list { padding: 10px; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; background: #fff; }

  .st-cart-item {
    position: relative;
    overflow: hidden;
    padding: 11px 12px;
    border-radius: 11px;
    background: #fbfdff;
    border: 1px solid var(--st-border);
    animation: stSlideIn .35s cubic-bezier(.22,1,.36,1) both;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .st-cart-item::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #06b6d4, #6366f1);
  }
  .st-cart-item:hover {
    border-color: #c7d2fe;
    box-shadow: 0 12px 22px -18px rgba(99,102,241,.7);
    transform: translateY(-1px);
  }
  .st-cart-item-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 9px;
  }
  .st-cart-item-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--st-text);
    line-height: 1.3;
  }
  .st-cart-item-del {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid var(--st-border);
    color: var(--st-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: all .2s ease;
  }
  .st-cart-item-del:hover {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
    transform: scale(1.06);
  }
  .st-cart-item-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .st-cart-field { display: flex; flex-direction: column; gap: 3px; }
  .st-cart-field label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--st-soft);
  }
  .st-cart-field input {
    height: 34px;
    padding: 0 10px;
    width: 90px;
    border-radius: 9px;
    border: 1px solid var(--st-border);
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--st-text);
    transition: border-color .18s ease, box-shadow .18s ease;
  }
  .st-cart-field input:focus {
    border-color: #67e8f9;
    box-shadow: 0 0 0 3px rgba(6,182,212,.14);
    outline: none;
  }
  .st-cart-unit {
    margin-left: auto;
    font-size: 12px;
    font-weight: 800;
    color: #0891b2;
    padding: 5px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #cffafe, #e0f2fe);
  }

  .st-cart-empty {
    margin-top: 16px;
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    border: 1.5px dashed var(--st-border);
    border-radius: 14px;
    color: var(--st-soft);
  }
  .st-cart-empty-ic {
    width: 60px; height: 60px;
    border-radius: 20px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #cffafe, #e0e7ff);
    color: #06b6d4;
    margin-bottom: 4px;
  }
  .st-cart-empty p { margin: 0; font-size: 13px; font-weight: 700; color: var(--st-muted); }
  .st-cart-empty span { font-size: 12px; }

  .st-notes {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--st-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .st-notes:focus-within {
    border-color: #67e8f9;
    box-shadow: 0 0 0 4px rgba(6,182,212,.14);
  }
  .st-notes svg { color: #06b6d4; flex-shrink: 0; }
  .st-notes input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--st-text);
    height: 100%;
  }
  .st-notes input::placeholder { color: #94a3b8; font-weight: 500; }

  @media (prefers-reduced-motion: reduce) {
    .st-root *, .st-root *::before, .st-root *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
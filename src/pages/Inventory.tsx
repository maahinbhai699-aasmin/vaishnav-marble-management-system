import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatNumber, stockStatus, stockStatusLabel, stockStatusColor } from '../lib/utils'
import type { Product, Category, Location } from '../lib/types'
import { Search, Warehouse, AlertTriangle, Package, Boxes, Layers, X, MapPin, Shield, TrendingDown } from 'lucide-react'
import { Pagination } from '../components/Pagination'

interface DamageEntry {
  product_id: string
  quantity: number
  sqft: number
  reason: string
  location_id: string
}

export function Inventory() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [damageModal, setDamageModal] = useState<Product | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 12

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [prodRes, catRes, locRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*), location:locations(*)').order('name'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('locations').select('*').order('name'),
    ])
    setProducts((prodRes.data ?? []) as Product[])
    setCategories((catRes.data ?? []) as Category[])
    setLocations((locRes.data ?? []) as Location[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
      const matchCat = !categoryFilter || p.category_id === categoryFilter
      const status = stockStatus(p)
      const matchStock = !stockFilter || status === stockFilter
      return matchSearch && matchCat && matchStock
    })
  }, [products, search, categoryFilter, stockFilter])

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  useEffect(() => { setPage(1) }, [search, categoryFilter, stockFilter])

  const stats = useMemo(() => {
    let totalValue = 0
    let lowStock = 0
    let outOfStock = 0
    let totalSlabs = 0
    let totalSqft = 0
    let totalBoxes = 0
    let totalPieces = 0

    for (const p of products) {
      const invType = p.category?.inventory_type ?? 'piece'
      const stock = invType === 'piece' ? p.stock_count : p.stock_sqft
      totalValue += Number(p.cost_price) * Number(stock)
      const status = stockStatus(p)
      if (status === 'low_stock') lowStock++
      if (status === 'out_of_stock') outOfStock++
      if (invType === 'slab') { totalSlabs += Number(p.stock_count); totalSqft += Number(p.stock_sqft) }
      else if (invType === 'box') { totalBoxes += Number(p.stock_count); totalSqft += Number(p.stock_sqft) }
      else totalPieces += Number(p.stock_count)
    }
    return { totalValue, lowStock, outOfStock, totalSlabs, totalSqft, totalBoxes, totalPieces }
  }, [products])

  const handleDamage = async (entry: DamageEntry) => {
    if (!damageModal) return
    const invType = damageModal.category?.inventory_type ?? 'piece'
    const available = invType === 'piece' ? Number(damageModal.stock_count) : Number(damageModal.stock_sqft)
    const requested = invType === 'piece' ? entry.quantity : entry.sqft
    if (requested > available) {
      toast(`Damage cannot exceed available stock (${formatNumber(available)}).`, 'error')
      return
    }
    const { error: movErr } = await supabase.from('stock_movements').insert({
      product_id: entry.product_id,
      category_id: damageModal.category_id,
      transaction_type: 'damage',
      stock_out_count: entry.quantity,
      stock_out_sqft: entry.sqft,
      unit: damageModal.selling_unit ?? 'Piece',
      cost_price: damageModal.cost_price,
      remarks: entry.reason,
      location_id: entry.location_id || null,
    })
    if (movErr) { toast(`Error: ${movErr.message}`, 'error'); return }

    await supabase.from('products').update({
      stock_count: Number(damageModal.stock_count) - entry.quantity,
      stock_sqft: Number(damageModal.stock_sqft) - entry.sqft,
      damaged_count: Number(damageModal.damaged_count) + entry.quantity,
      damaged_sqft: Number(damageModal.damaged_sqft) + entry.sqft,
      updated_at: new Date().toISOString(),
    }).eq('id', entry.product_id)

    toast('Damage recorded successfully')
    setDamageModal(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading inventory..." />

  return (
    <div className="inv-root">
      <style>{invStyles}</style>

      {/* ═══ Header ═══ */}
      <div className="inv-header">
        <div>
          <h2>Inventory</h2>
          <div className="inv-header-sub">
            Current stock levels across all products
            {products.length > 0 && (
              <span className="inv-header-chip">{filtered.length} of {products.length}</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Stat cards ═══ */}
      <div className="inv-stats">
        <div className="inv-stat c-indigo" style={{ animationDelay: '.02s' }}>
          <div className="inv-stat-ico"><Warehouse size={20} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Stock Value</div>
            <div className="inv-stat-value">{formatCurrency(stats.totalValue)}</div>
          </div>
        </div>
        <div className="inv-stat c-violet" style={{ animationDelay: '.06s' }}>
          <div className="inv-stat-ico"><Layers size={20} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Slabs</div>
            <div className="inv-stat-value">{formatNumber(stats.totalSlabs)}</div>
          </div>
        </div>
        <div className="inv-stat c-cyan" style={{ animationDelay: '.10s' }}>
          <div className="inv-stat-ico"><Boxes size={20} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Sq.Ft</div>
            <div className="inv-stat-value">{formatNumber(stats.totalSqft)}</div>
          </div>
        </div>
        <div className="inv-stat c-amber" style={{ animationDelay: '.14s' }}>
          <div className="inv-stat-ico"><AlertTriangle size={20} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Low Stock</div>
            <div className="inv-stat-value">{formatNumber(stats.lowStock)}</div>
          </div>
        </div>
        <div className="inv-stat c-rose" style={{ animationDelay: '.18s' }}>
          <div className="inv-stat-ico"><AlertTriangle size={20} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Out of Stock</div>
            <div className="inv-stat-value">{formatNumber(stats.outOfStock)}</div>
          </div>
        </div>
      </div>

      {/* ═══ Filters ═══ */}
      <div className="inv-filters">
        <div className="inv-search">
          <Search size={17} />
          <input
            placeholder="Search by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="inv-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="inv-select-wrap">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="inv-select-wrap">
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
            <option value="">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* ═══ Table / Cards ═══ */}
      {filtered.length === 0 ? (
        <div className="inv-panel">
          <EmptyState icon={<Package />} title="No products in inventory" />
        </div>
      ) : (
        <div className="inv-panel">
          {/* Desktop table */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th className="right">Stock Count</th>
                  <th className="right">Stock Sq.Ft</th>
                  <th className="right">Reserved</th>
                  <th className="right">Damaged</th>
                  <th className="right">Min Level</th>
                  <th>Status</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((p, idx) => {
                  const invType = p.category?.inventory_type ?? 'piece'
                  const available = invType === 'piece' ? Number(p.stock_count) : Number(p.stock_sqft)
                  const status = stockStatus(p)
                  const tone = stockStatusColor(status)
                  const rowClass = tone === 'success' ? 'row-ok' : tone === 'warning' ? 'row-warn' : tone === 'danger' ? 'row-bad' : ''
                  return (
                    <tr key={p.id} className={rowClass} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                      <td>
                        <div className="inv-prod">
                          <div className="inv-prod-avatar">{p.name.charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="inv-prod-name">{p.name}</div>
                            {p.sku && <div className="inv-prod-sku">{p.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="inv-muted">{p.category?.name ?? '-'}</td>
                      <td>
                        {p.location?.name ? (
                          <span className="inv-loc">
                            <MapPin size={11} /> {p.location.name}
                          </span>
                        ) : <span className="inv-muted">-</span>}
                      </td>
                      <td className="right"><span className="inv-num">{formatNumber(p.stock_count)}</span></td>
                      <td className="right">
                        {invType !== 'piece' ? <span className="inv-num cyan">{formatNumber(p.stock_sqft)}</span> : <span className="inv-soft">-</span>}
                      </td>
                      <td className="right">
                        {Number(p.reserved_count) > 0 ? (
                          <span className="inv-pill amber">{formatNumber(p.reserved_count)}</span>
                        ) : <span className="inv-soft">-</span>}
                      </td>
                      <td className="right">
                        {Number(p.damaged_count) > 0 ? (
                          <span className="inv-pill rose">{formatNumber(p.damaged_count)}</span>
                        ) : <span className="inv-soft">-</span>}
                      </td>
                      <td className="right">
                        {Number(p.min_stock_level) > 0 ? (
                          <span className="inv-mono">{formatNumber(p.min_stock_level)}</span>
                        ) : <span className="inv-soft">-</span>}
                      </td>
                      <td>
                        <span className={`inv-badge ${tone}`}>{stockStatusLabel(status)}</span>
                      </td>
                      <td>
                        {available > 0 ? (
                          <button className="inv-act damage" onClick={() => setDamageModal(p)} title="Record damage">
                            <Shield size={14} /> Damage
                          </button>
                        ) : <span className="inv-soft">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="inv-card-list">
            {paginatedProducts.map((p, idx) => {
              const invType = p.category?.inventory_type ?? 'piece'
              const available = invType === 'piece' ? Number(p.stock_count) : Number(p.stock_sqft)
              const status = stockStatus(p)
              const tone = stockStatusColor(status)
              return (
                <div key={p.id} className={`inv-card ${tone}`} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                  <div className="inv-card-head">
                    <div className="inv-prod">
                      <div className="inv-prod-avatar">{p.name.charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="inv-prod-name">{p.name}</div>
                        {p.sku && <div className="inv-prod-sku">{p.sku}</div>}
                      </div>
                    </div>
                    <span className={`inv-badge ${tone}`}>{stockStatusLabel(status)}</span>
                  </div>

                  <div className="inv-card-meta">
                    <span className="inv-loc">
                      {p.category?.name ?? 'Uncategorized'}
                    </span>
                    {p.location?.name && (
                      <span className="inv-loc">
                        <MapPin size={11} /> {p.location.name}
                      </span>
                    )}
                  </div>

                  <div className="inv-card-grid">
                    <div className="inv-card-stat">
                      <div className="inv-card-stat-label">Stock Count</div>
                      <div className="inv-card-stat-value">{formatNumber(p.stock_count)}</div>
                    </div>
                    {invType !== 'piece' && (
                      <div className="inv-card-stat">
                        <div className="inv-card-stat-label">Stock Sq.Ft</div>
                        <div className="inv-card-stat-value cyan">{formatNumber(p.stock_sqft)}</div>
                      </div>
                    )}
                    {Number(p.reserved_count) > 0 && (
                      <div className="inv-card-stat">
                        <div className="inv-card-stat-label">Reserved</div>
                        <div className="inv-card-stat-value amber">{formatNumber(p.reserved_count)}</div>
                      </div>
                    )}
                    {Number(p.damaged_count) > 0 && (
                      <div className="inv-card-stat">
                        <div className="inv-card-stat-label">Damaged</div>
                        <div className="inv-card-stat-value rose">{formatNumber(p.damaged_count)}</div>
                      </div>
                    )}
                    {Number(p.min_stock_level) > 0 && (
                      <div className="inv-card-stat">
                        <div className="inv-card-stat-label">Min Level</div>
                        <div className="inv-card-stat-value">{formatNumber(p.min_stock_level)}</div>
                      </div>
                    )}
                  </div>

                  {available > 0 && (
                    <button className="inv-act damage full" onClick={() => setDamageModal(p)}>
                      <Shield size={14} /> Record Damage
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {damageModal && (
        <DamageForm product={damageModal} locations={locations} onClose={() => setDamageModal(null)} onSave={handleDamage} />
      )}
    </div>
  )
}

function DamageForm({ product, locations, onClose, onSave }: { product: Product; locations: Location[]; onClose: () => void; onSave: (entry: DamageEntry) => void }) {
  const invType = product.category?.inventory_type ?? 'piece'
  const [quantity, setQuantity] = useState('')
  const [sqft, setSqft] = useState('')
  const [reason, setReason] = useState('')
  const [locationId, setLocationId] = useState(product.location_id ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = Number(quantity) || 0
    const s = invType === 'piece' ? 0 : (Number(sqft) || 0)
    if (invType === 'piece' && q <= 0) return
    if (invType !== 'piece' && s <= 0) return
    onSave({ product_id: product.id, quantity: q, sqft: s, reason, location_id: locationId })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record Damage - ${product.name}`}
      size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={handleSubmit}>Record Damage</button></>}
    >
      <form onSubmit={handleSubmit} className="inv-damage-form">
        {/* Damage warning band */}
        <div className="inv-damage-alert">
          <div className="inv-damage-ico"><TrendingDown size={18} /></div>
          <div>
            <div className="inv-damage-label">Recording Damage</div>
            <div className="inv-damage-sub">Stock will be reduced and marked as damaged</div>
          </div>
        </div>

        {invType === 'piece' ? (
          <div className="form-group">
            <label className="form-label">Quantity (Pieces) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </div>
        ) : (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Slab Count</label>
              <input className="form-input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Sq.Ft <span className="req">*</span></label>
              <input className="form-input" type="number" step="0.01" value={sqft} onChange={(e) => setSqft(e.target.value)} autoFocus />
            </div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Reason</label>
          <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cracked during handling" />
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <select className="form-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">No Location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  )
}

/* ═══════════ Styles ═══════════ */
const invStyles = `
  .inv-root {
    --inv-card: #ffffff;
    --inv-border: #e6ebf2;
    --inv-text: #0f172a;
    --inv-muted: #64748b;
    --inv-soft: #94a3b8;
    display: grid;
    gap: 16px;
    animation: invFade .38s ease both;
  }
  @keyframes invFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes invRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes invRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes invFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

  /* ═══ Header ═══ */
  .inv-header {
    position: relative;
    padding: 22px 24px;
    border-radius: 20px;
    background:
      radial-gradient(circle at 12% 20%, rgba(99,102,241,.18), transparent 42%),
      radial-gradient(circle at 88% 80%, rgba(59,130,246,.18), transparent 46%),
      linear-gradient(135deg, #ffffff, #f5f7ff);
    border: 1px solid #e0e7ff;
    box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
    overflow: hidden;
  }
  .inv-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #6366f1, #3b82f6, #06b6d4);
  }
  .inv-header h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(92deg, #0f172a 0%, #4f46e5 55%, #06b6d4 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .inv-header-sub {
    margin-top: 6px;
    font-size: 13.5px;
    color: var(--inv-muted);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .inv-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #eef2ff, #dbeafe);
    color: #4338ca;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* ═══ Stats — responsive grid ═══ */
  .inv-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  @media (max-width: 640px) {
    .inv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 420px) {
    .inv-stats { grid-template-columns: 1fr; }
  }

  .inv-stat {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--inv-card);
    border: 1px solid var(--inv-border);
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: invRise .5s cubic-bezier(.22,1,.36,1) both;
    transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
  }
  .inv-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--sc1), var(--sc2));
  }
  .inv-stat::after {
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
  .inv-stat:hover {
    transform: translateY(-4px);
    border-color: transparent;
    box-shadow: 0 22px 34px -22px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
  }
  .inv-stat:hover::after { opacity: .22; transform: scale(1.18); }

  .inv-stat.c-indigo { --sc1:#6366f1; --sc2:#818cf8; --scs: rgba(99,102,241,.55); }
  .inv-stat.c-violet { --sc1:#8b5cf6; --sc2:#c084fc; --scs: rgba(139,92,246,.55); }
  .inv-stat.c-cyan   { --sc1:#06b6d4; --sc2:#22d3ee; --scs: rgba(6,182,212,.55); }
  .inv-stat.c-amber  { --sc1:#f59e0b; --sc2:#fbbf24; --scs: rgba(245,158,11,.55); }
  .inv-stat.c-rose   { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.55); }

  .inv-stat-ico {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--sc1), var(--sc2));
    box-shadow: 0 10px 20px -10px var(--scs);
    flex-shrink: 0;
    transition: transform .34s cubic-bezier(.34,1.56,.64,1);
  }
  .inv-stat-ico svg { width: 19px; height: 19px; }
  .inv-stat:hover .inv-stat-ico { transform: scale(1.1) rotate(-8deg); }

  .inv-stat-body { min-width: 0; flex: 1; }
  .inv-stat-label {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--inv-muted);
    margin-bottom: 4px;
  }
  .inv-stat-value {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: var(--inv-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inv-stat.c-indigo .inv-stat-value { color: #4338ca; }
  .inv-stat.c-violet .inv-stat-value { color: #6d28d9; }
  .inv-stat.c-cyan .inv-stat-value   { color: #0e7490; }
  .inv-stat.c-amber .inv-stat-value  { color: #b45309; }
  .inv-stat.c-rose .inv-stat-value   { color: #be123c; }

  /* ═══ Filters — responsive ═══ */
  .inv-filters {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 200px 180px;
    gap: 12px;
    padding: 14px;
    background: linear-gradient(135deg, #ffffff, #f5f7ff);
    border: 1px solid var(--inv-border);
    border-radius: 16px;
    box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
    animation: invRise .45s cubic-bezier(.22,1,.36,1) .05s both;
  }
  @media (max-width: 900px) {
    .inv-filters { grid-template-columns: 1fr 1fr; }
    .inv-search { grid-column: 1 / -1; }
  }
  @media (max-width: 520px) {
    .inv-filters { grid-template-columns: 1fr; }
    .inv-search { grid-column: auto; }
  }

  .inv-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 46px;
    border-radius: 12px;
    border: 1.5px solid var(--inv-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .inv-search:focus-within {
    border-color: #a5b4fc;
    box-shadow: 0 0 0 4px rgba(99,102,241,.14);
    transform: translateY(-1px);
  }
  .inv-search svg { color: #4f46e5; flex-shrink: 0; }
  .inv-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--inv-text);
    height: 100%;
    min-width: 0;
  }
  .inv-search input::placeholder { color: #94a3b8; font-weight: 500; }
  .inv-clear {
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #f1f5f9;
    border: none;
    color: var(--inv-muted);
    cursor: pointer;
    transition: all .18s ease;
    flex-shrink: 0;
  }
  .inv-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

  .inv-select-wrap {
    position: relative;
    display: flex;
    align-items: center;
    height: 46px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1.5px solid var(--inv-border);
    background: #fff;
    transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  }
  .inv-select-wrap:focus-within {
    border-color: #a5b4fc;
    box-shadow: 0 0 0 4px rgba(99,102,241,.14);
    transform: translateY(-1px);
  }
  .inv-select-wrap select {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--inv-text);
    height: 100%;
    cursor: pointer;
    appearance: none;
    min-width: 0;
  }
  .inv-select-wrap::after {
    content: '';
    width: 8px; height: 8px;
    border-right: 2px solid #4f46e5;
    border-bottom: 2px solid #4f46e5;
    transform: rotate(45deg) translateY(-2px);
    margin-left: -8px;
    pointer-events: none;
    flex-shrink: 0;
  }

  /* ═══ Panel ═══ */
  .inv-panel {
    background: var(--inv-card);
    border: 1px solid var(--inv-border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
    animation: invRise .5s cubic-bezier(.22,1,.36,1) .1s both;
    transition: box-shadow .26s ease, border-color .26s ease;
  }
  .inv-panel:hover {
    box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
    border-color: #e0e7ff;
  }

  /* ═══ Table (desktop) ═══ */
  .inv-table-wrap { overflow-x: auto; }
  .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 900px; }
  .inv-table thead th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--inv-soft);
    padding: 12px 16px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
    border-bottom: 1px solid var(--inv-border);
    white-space: nowrap;
  }
  .inv-table thead th.right { text-align: right; }
  .inv-table tbody td {
    padding: 13px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--inv-text);
    vertical-align: middle;
  }
  .inv-table tbody tr:last-child td { border-bottom: none; }
  .inv-table tbody tr {
    animation: invRowIn .4s ease both;
    transition: background .16s ease, box-shadow .16s ease;
  }
  .inv-table tbody tr:hover {
    background: linear-gradient(90deg, #f5f7ff, #ffffff);
  }
  .inv-table tbody tr.row-ok { box-shadow: inset 3px 0 0 #10b981; }
  .inv-table tbody tr.row-ok:hover { box-shadow: inset 3px 0 0 #10b981, 0 6px 20px -18px rgba(16,185,129,.7); background: linear-gradient(90deg, #f0fdf4, #ffffff); }
  .inv-table tbody tr.row-warn { box-shadow: inset 3px 0 0 #f59e0b; }
  .inv-table tbody tr.row-warn:hover { box-shadow: inset 3px 0 0 #f59e0b, 0 6px 20px -18px rgba(245,158,11,.7); background: linear-gradient(90deg, #fffbeb, #ffffff); }
  .inv-table tbody tr.row-bad { box-shadow: inset 3px 0 0 #f43f5e; }
  .inv-table tbody tr.row-bad:hover { box-shadow: inset 3px 0 0 #f43f5e, 0 6px 20px -18px rgba(244,63,94,.7); background: linear-gradient(90deg, #fff1f2, #ffffff); }
  .inv-table .right { text-align: right; }

  .inv-prod { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .inv-prod-avatar {
    width: 34px; height: 34px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #6366f1, #3b82f6);
    box-shadow: 0 8px 18px -10px rgba(99,102,241,.9);
    transition: transform .32s cubic-bezier(.34,1.56,.64,1);
  }
  .inv-table tbody tr:hover .inv-prod-avatar,
  .inv-card:hover .inv-prod-avatar { transform: scale(1.08) rotate(-6deg); }
  .inv-prod-name {
    font-weight: 800;
    font-size: 13px;
    color: var(--inv-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .inv-prod-sku {
    font-size: 11px;
    color: var(--inv-soft);
    font-weight: 600;
    margin-top: 1px;
  }
  .inv-muted { color: var(--inv-muted); font-weight: 600; font-size: 12.5px; }
  .inv-soft { color: var(--inv-soft); font-weight: 600; font-size: 12.5px; }
  .inv-mono {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--inv-text);
  }
  .inv-num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--inv-text);
    white-space: nowrap;
  }
  .inv-num.cyan { color: #0e7490; }

  .inv-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .inv-pill.amber { background: #fef3c7; color: #b45309; }
  .inv-pill.rose  { background: #ffe4e6; color: #be123c; }

  .inv-loc {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    background: #f1f5f9;
    color: #475569;
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inv-loc svg { flex-shrink: 0; }

  .inv-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .025em;
    white-space: nowrap;
    text-transform: capitalize;
  }
  .inv-badge::before {
    content: '';
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .inv-badge.success { background: linear-gradient(135deg, #ecfdf5, #d1fae5); color: #047857; }
  .inv-badge.warning { background: linear-gradient(135deg, #fffbeb, #fef3c7); color: #b45309; }
  .inv-badge.danger  { background: linear-gradient(135deg, #fff1f2, #ffe4e6); color: #be123c; }
  .inv-badge.neutral { background: #f1f5f9; color: #475569; }

  .inv-act {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all .2s cubic-bezier(.22,1,.36,1);
    white-space: nowrap;
  }
  .inv-act.damage {
    background: linear-gradient(135deg, #fff1f2, #ffe4e6);
    border-color: #fecdd3;
    color: #be123c;
  }
  .inv-act.damage:hover {
    background: linear-gradient(135deg, #ffe4e6, #fecdd3);
    border-color: #fda4af;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
  }
  .inv-act.damage:active { transform: scale(.95); }
  .inv-act.full { width: 100%; justify-content: center; margin-top: 10px; }

  /* ═══ Mobile cards ═══ */
  .inv-card-list { display: none; padding: 12px; }
  @media (max-width: 720px) {
    .inv-table-wrap { display: none; }
    .inv-card-list { display: grid; gap: 12px; grid-template-columns: 1fr; }
  }
  @media (min-width: 721px) and (max-width: 900px) {
    .inv-card-list { display: none; }
  }

  .inv-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: #fff;
    border: 1px solid var(--inv-border);
    border-radius: 14px;
    padding: 14px;
    animation: invRise .45s cubic-bezier(.22,1,.36,1) both;
    transition: transform .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease, border-color .24s ease;
  }
  .inv-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
  }
  .inv-card.success::before { background: linear-gradient(90deg, #10b981, #34d399); }
  .inv-card.warning::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .inv-card.danger::before  { background: linear-gradient(90deg, #f43f5e, #fb7185); }
  .inv-card.neutral::before { background: linear-gradient(90deg, #94a3b8, #cbd5e1); }
  .inv-card:hover {
    transform: translateY(-3px);
    border-color: transparent;
    box-shadow: 0 18px 34px -22px rgba(15,23,42,.4);
  }
  .inv-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
  }
  .inv-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .inv-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
  }
  .inv-card-stat {
    background: linear-gradient(135deg, #f8fafc, #ffffff);
    border: 1px solid var(--inv-border);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .inv-card-stat-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--inv-soft);
    margin-bottom: 3px;
  }
  .inv-card-stat-value {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--inv-text);
    font-variant-numeric: tabular-nums;
  }
  .inv-card-stat-value.cyan  { color: #0e7490; }
  .inv-card-stat-value.amber { color: #b45309; }
  .inv-card-stat-value.rose  { color: #be123c; }

  /* ═══ Damage form ═══ */
  .inv-damage-form { display: flex; flex-direction: column; gap: 4px; }
  .inv-damage-alert {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    border-radius: 13px;
    background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
    border: 1px solid #fecdd3;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
  }
  .inv-damage-alert::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, #f43f5e, #fb7185);
  }
  .inv-damage-ico {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: grid; place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #e11d48, #fb7185);
    box-shadow: 0 12px 22px -10px rgba(225,29,72,.9);
    flex-shrink: 0;
    animation: invFloat 3s ease-in-out infinite;
  }
  .inv-damage-ico svg { width: 19px; height: 19px; }
  .inv-damage-label {
    font-size: 12.5px;
    font-weight: 800;
    color: #be123c;
    letter-spacing: -.01em;
  }
  .inv-damage-sub {
    font-size: 11.5px;
    color: #be123c;
    opacity: .8;
    font-weight: 600;
    margin-top: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .inv-root *, .inv-root::before, .inv-root::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
  }
`
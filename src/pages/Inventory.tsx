import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState } from '../components/Feedback'
import { formatCurrency, formatNumber, stockStatus, stockStatusLabel, stockStatusColor } from '../lib/utils'
import type { Product, Category, Location } from '../lib/types'
import { Search, Warehouse, AlertTriangle, Package, Boxes, Layers } from 'lucide-react'

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
    <div>
      <div className="page-header">
        <div>
          <h2>Inventory</h2>
          <div className="page-sub">Current stock levels across all products</div>
        </div>
      </div>

      <div className="stat-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon primary"><Warehouse /></div>
          <div className="stat-label">Stock Value</div>
          <div className="stat-value">{formatCurrency(stats.totalValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon accent"><Layers /></div>
          <div className="stat-label">Total Slabs</div>
          <div className="stat-value">{formatNumber(stats.totalSlabs)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><Boxes /></div>
          <div className="stat-label">Total Sq.Ft</div>
          <div className="stat-value">{formatNumber(stats.totalSqft)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><AlertTriangle /></div>
          <div className="stat-label">Low Stock</div>
          <div className="stat-value">{formatNumber(stats.lowStock)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon error"><AlertTriangle /></div>
          <div className="stat-label">Out of Stock</div>
          <div className="stat-value">{formatNumber(stats.outOfStock)}</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
          <option value="">All Stock</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Package />} title="No products in inventory" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Location</th>
                <th className="text-right">Stock Count</th>
                <th className="text-right">Stock Sq.Ft</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Damaged</th>
                <th className="text-right">Min Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const invType = p.category?.inventory_type ?? 'piece'
                return (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.name}</td>
                    <td>{p.category?.name ?? '-'}</td>
                    <td>{p.location?.name ?? '-'}</td>
                    <td className="text-right">{formatNumber(p.stock_count)}</td>
                    <td className="text-right">{invType !== 'piece' ? formatNumber(p.stock_sqft) : '-'}</td>
                    <td className="text-right">{Number(p.reserved_count) > 0 ? formatNumber(p.reserved_count) : '-'}</td>
                    <td className="text-right">{Number(p.damaged_count) > 0 ? formatNumber(p.damaged_count) : '-'}</td>
                    <td className="text-right">{Number(p.min_stock_level) > 0 ? formatNumber(p.min_stock_level) : '-'}</td>
                    <td><span className={`badge ${stockStatusColor(stockStatus(p))}`}>{stockStatusLabel(stockStatus(p))}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setDamageModal(p)}>Damage</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
    <Modal open onClose={onClose} title={`Record Damage - ${product.name}`} size="sm"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={handleSubmit}>Record Damage</button></>}
    >
      <form onSubmit={handleSubmit}>
        {invType === 'piece' ? (
          <div className="form-group">
            <label className="form-label">Quantity (Pieces) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </div>
        ) : (
          <>
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
          </>
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

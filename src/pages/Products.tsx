import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useProducts, useCategories, useSubcategories, useSuppliers, useLocations, useUnits } from '../lib/hooks'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatNumber, stockStatus, stockStatusLabel, stockStatusColor, getInventoryType } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Product, Category, Unit } from '../lib/types'
import { Plus, Search, Edit2, Trash2 } from 'lucide-react'

export function Products() {
  const { data: products, loading, refetch } = useProducts()
  const { data: categories } = useCategories()
  const { data: subcategories } = useSubcategories()
  const { data: suppliers } = useSuppliers()
  const { data: locations } = useLocations()
  const { data: units } = useUnits()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode ?? '').toLowerCase().includes(search.toLowerCase())
      const matchCat = !categoryFilter || p.category_id === categoryFilter
      const status = stockStatus(p)
      const matchStock = !stockFilter || status === stockFilter
      return matchSearch && matchCat && matchStock
    })
  }, [products, search, categoryFilter, stockFilter])

  const handleSave = async (formData: Partial<Product>, selectedUnits: string[], openingStock: { count: number; sqft: number; unit: string }) => {
    if (editing) {
      const { error } = await supabase.from('products').update({
        ...formData,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      // Update product_units
      await supabase.from('product_units').delete().eq('product_id', editing.id)
      for (const unitName of selectedUnits) {
        const unit = units.find((u) => u.name === unitName)
        if (unit) {
          await supabase.from('product_units').insert({ product_id: editing.id, unit_id: unit.id })
        }
      }
      toast('Product updated successfully')
    } else {
      const { data: newProd, error } = await supabase.from('products').insert(formData).select('id').maybeSingle()
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      if (newProd) {
        for (const unitName of selectedUnits) {
          const unit = units.find((u) => u.name === unitName)
          if (unit) {
            await supabase.from('product_units').insert({ product_id: newProd.id, unit_id: unit.id })
          }
        }
        if (openingStock.count > 0 || openingStock.sqft > 0) {
          await recordStockMovement({
            product_id: newProd.id,
            category_id: formData.category_id ?? null,
            transaction_type: 'opening',
            stock_in_count: openingStock.count,
            stock_in_sqft: openingStock.sqft,
            unit: openingStock.unit,
            cost_price: Number(formData.cost_price) || 0,
            selling_price: Number(formData.retail_price) || 0,
            remarks: `Opening stock: ${formData.name}`,
          })
        }
      }
      toast('Product created successfully')
    }
    setModalOpen(false)
    setEditing(null)
    refetch()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('products').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Product deleted')
    setDeleteId(null)
    refetch()
  }

  if (loading) return <Loading label="Loading products..." />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Products</h2>
          <div className="page-sub">Manage your product catalog with pricing and stock</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <div className="card">
          <EmptyState
            title="No products found"
            message="Add your first product to get started"
            action={<button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Product</button>}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th className="text-right">Retail Price</th>
                <th className="text-right">Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const invType = p.category?.inventory_type ?? 'piece'
                const stockDisplay = invType === 'slab' ? `${formatNumber(p.stock_count)} slabs / ${formatNumber(p.stock_sqft)} Sq.Ft` : invType === 'box' ? `${formatNumber(p.stock_count)} boxes` : `${formatNumber(p.stock_count)} pcs`
                return (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.name}</td>
                    <td>{p.sku ?? '-'}</td>
                    <td>{p.category?.name ?? '-'}</td>
                    <td>{p.subcategory?.name ?? '-'}</td>
                    <td className="text-right">{formatCurrency(p.retail_price)}</td>
                    <td className="text-right">{stockDisplay}</td>
                    <td><span className={`badge ${stockStatusColor(stockStatus(p))}`}>{stockStatusLabel(stockStatus(p))}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(p); setModalOpen(true) }}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(p.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProductForm
          product={editing}
          categories={categories}
          subcategories={subcategories}
          suppliers={suppliers}
          locations={locations}
          units={units}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function ProductForm({ product, categories, subcategories, suppliers, locations, units, onClose, onSave }: {
  product: Product | null
  categories: Category[]
  subcategories: { id: string; category_id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  units: Unit[]
  onClose: () => void
  onSave: (data: Partial<Product>, selectedUnits: string[], openingStock: { count: number; sqft: number; unit: string }) => void
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    category_id: product?.category_id ?? '',
    subcategory_id: product?.subcategory_id ?? '',
    brand: product?.brand ?? '',
    origin: product?.origin ?? '',
    model: product?.model ?? '',
    color: product?.color ?? '',
    finish: product?.finish ?? '',
    material: product?.material ?? '',
    thickness: product?.thickness ?? '',
    size: product?.size ?? '',
    length: product?.length ?? '',
    width: product?.width ?? '',
    height: product?.height ?? '',
    selling_unit: product?.selling_unit ?? 'Piece',
    purchase_price: product?.purchase_price ?? '',
    cost_price: product?.cost_price ?? '',
    retail_price: product?.retail_price ?? '',
    wholesale_price: product?.wholesale_price ?? '',
    dealer_price: product?.dealer_price ?? '',
    min_selling_price: product?.min_selling_price ?? '',
    gst_rate: product?.gst_rate ?? 18,
    min_stock_level: product?.min_stock_level ?? '',
    supplier_id: product?.supplier_id ?? '',
    location_id: product?.location_id ?? '',
    rack_number: product?.rack_number ?? '',
    description: product?.description ?? '',
    is_active: product?.is_active ?? true,
  })
  const [openingCount, setOpeningCount] = useState('')
  const [openingSqft, setOpeningSqft] = useState('')
  const [selectedUnits, setSelectedUnits] = useState<string[]>(() => {
    if (!product) return [form.selling_unit]
    return units.filter((u) => {
      // We don't have product_units loaded; default to selling_unit
      return u.name === product.selling_unit
    }).map((u) => u.name)
  })

  const selectedCategory = categories.find((c) => c.id === form.category_id)
  const invType = selectedCategory?.inventory_type ?? 'piece'
  const availableSubcats = subcategories.filter((s) => s.category_id === form.category_id)
  const availableUnits = useMemo(() => {
    if (invType === 'slab') return units.filter((u) => ['Sq.Ft', 'Sq.Mtr', 'Slab', 'Piece', 'Lot'].includes(u.name))
    if (invType === 'box') return units.filter((u) => ['Box', 'Sq.Ft', 'Sq.Mtr', 'Piece'].includes(u.name))
    if (invType === 'mixed') return units.filter((u) => ['Sq.Ft', 'Running Ft', 'Piece', 'Set', 'Job'].includes(u.name))
    if (invType === 'job') return units.filter((u) => ['Job', 'Sq.Ft', 'Running Ft', 'Piece', 'Custom Order'].includes(u.name))
    return units.filter((u) => ['Piece', 'Set', 'Bag', 'Kg', 'Litre', 'Meter', 'Box'].includes(u.name))
  }, [invType, units])

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    const data: Partial<Product> = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      brand: form.brand || null,
      origin: form.origin || null,
      model: form.model || null,
      color: form.color || null,
      finish: form.finish || null,
      material: form.material || null,
      thickness: form.thickness || null,
      size: form.size || null,
      length: form.length ? Number(form.length) : null,
      width: form.width ? Number(form.width) : null,
      height: form.height ? Number(form.height) : null,
      selling_unit: form.selling_unit,
      purchase_price: Number(form.purchase_price) || 0,
      cost_price: Number(form.cost_price) || 0,
      retail_price: Number(form.retail_price) || 0,
      wholesale_price: Number(form.wholesale_price) || 0,
      dealer_price: Number(form.dealer_price) || 0,
      min_selling_price: Number(form.min_selling_price) || 0,
      gst_rate: Number(form.gst_rate) || 0,
      min_stock_level: Number(form.min_stock_level) || 0,
      supplier_id: form.supplier_id || null,
      location_id: form.location_id || null,
      rack_number: form.rack_number || null,
      description: form.description || null,
      is_active: form.is_active,
    }
    onSave(data, selectedUnits, {
      count: Number(openingCount) || 0,
      sqft: Number(openingSqft) || 0,
      unit: form.selling_unit,
    })
  }

  return (
    <Modal open onClose={onClose} title={product ? 'Edit Product' : 'Add Product'} size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{product ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Product Name <span className="req">*</span></label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">SKU / Product Code</label>
            <input className="form-input" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Barcode</label>
            <input className="form-input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category_id} onChange={(e) => { set('category_id', e.target.value); set('subcategory_id', ''); const cat = categories.find((c) => c.id === e.target.value); if (cat) set('selling_unit', getInventoryType(cat.name) === 'slab' ? 'Sq.Ft' : getInventoryType(cat.name) === 'box' ? 'Box' : 'Piece') }}>
              <option value="">Select Category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Subcategory</label>
            <select className="form-select" value={form.subcategory_id} onChange={(e) => set('subcategory_id', e.target.value)} disabled={!form.category_id}>
              <option value="">Select Subcategory</option>
              {availableSubcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Brand</label>
            <input className="form-input" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Origin</label>
            <input className="form-input" value={form.origin} onChange={(e) => set('origin', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Model / Design</label>
            <input className="form-input" value={form.model} onChange={(e) => set('model', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <input className="form-input" value={form.color} onChange={(e) => set('color', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Finish</label>
            <input className="form-input" value={form.finish} onChange={(e) => set('finish', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Material</label>
            <input className="form-input" value={form.material} onChange={(e) => set('material', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Thickness</label>
            <input className="form-input" value={form.thickness} onChange={(e) => set('thickness', e.target.value)} placeholder="e.g. 18mm" />
          </div>
          <div className="form-group">
            <label className="form-label">Size</label>
            <input className="form-input" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="e.g. 600x600mm" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Length (ft)</label>
            <input className="form-input" type="number" step="0.01" value={form.length} onChange={(e) => set('length', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Width (ft)</label>
            <input className="form-input" type="number" step="0.01" value={form.width} onChange={(e) => set('width', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Height (ft)</label>
            <input className="form-input" type="number" step="0.01" value={form.height} onChange={(e) => set('height', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Selling Unit</label>
            <select className="form-select" value={form.selling_unit} onChange={(e) => { set('selling_unit', e.target.value); setSelectedUnits([e.target.value]) }}>
              {availableUnits.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Supplier</label>
            <select className="form-select" value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">No Supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <select className="form-select" value={form.location_id} onChange={(e) => set('location_id', e.target.value)}>
              <option value="">No Location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Rack Number</label>
            <input className="form-input" value={form.rack_number} onChange={(e) => set('rack_number', e.target.value)} />
          </div>
        </div>

        {!product && (
          <>
            <h4 className="mb-2 mt-4">Opening Stock</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Opening Count</label>
                <input className="form-input" type="number" min="0" step="0.01" value={openingCount} onChange={(e) => setOpeningCount(e.target.value)} placeholder="Pieces / Boxes / Slabs" />
              </div>
              <div className="form-group">
                <label className="form-label">Opening Sq.Ft</label>
                <input className="form-input" type="number" min="0" step="0.01" value={openingSqft} onChange={(e) => setOpeningSqft(e.target.value)} placeholder="For slabs, tiles or area stock" />
              </div>
            </div>
            <div className="form-hint">Opening stock is added to inventory and recorded in the Stock Ledger.</div>
          </>
        )}

        <h4 className="mb-2 mt-4">Pricing</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Purchase Price</label>
            <input className="form-input" type="number" step="0.01" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cost Price</label>
            <input className="form-input" type="number" step="0.01" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Retail Price</label>
            <input className="form-input" type="number" step="0.01" value={form.retail_price} onChange={(e) => set('retail_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Wholesale Price</label>
            <input className="form-input" type="number" step="0.01" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dealer Price</label>
            <input className="form-input" type="number" step="0.01" value={form.dealer_price} onChange={(e) => set('dealer_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Min Selling Price</label>
            <input className="form-input" type="number" step="0.01" value={form.min_selling_price} onChange={(e) => set('min_selling_price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">GST Rate (%)</label>
            <input className="form-input" type="number" step="0.01" value={form.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Min Stock Level</label>
            <input className="form-input" type="number" step="0.01" value={form.min_stock_level} onChange={(e) => set('min_stock_level', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ marginRight: 6 }} />
            Active
          </label>
        </div>
      </form>
    </Modal>
  )
}

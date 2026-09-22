import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useProducts, useCategories, useSubcategories, useSuppliers, useLocations, useUnits } from '../lib/hooks'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatNumber, stockStatus, stockStatusLabel, stockStatusColor, getInventoryType } from '../lib/utils'
import { recordStockMovement } from '../lib/stockOps'
import type { Product, Category, Unit } from '../lib/types'
import {
  Plus, Search, Edit2, Trash2, Package, Layers, Ruler,
  DollarSign, MapPin, Info, Hash, Barcode, Sparkles,
} from 'lucide-react'

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
  const [page, setPage] = useState(1)
  const pageSize = 20

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
  const visibleProducts = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleSave = async (formData: Partial<Product>, selectedUnits: string[], openingStock: { count: number; sqft: number; unit: string }) => {
    if (editing) {
      const { error } = await supabase.from('products').update({
        ...formData,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
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
    <div className="pr-root">
      <style>{`
        .pr-root { animation: prFade .35s ease both; }
        @keyframes prFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes prRise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ─── Header ─── */
        .pr-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .pr-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--n-900, #0f172a);
        }
        .pr-header-sub {
          margin-top: 4px;
          font-size: 13.5px;
          color: var(--n-500, #64748b);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pr-count-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 999px;
          background: #eef2ff;
          color: #4338ca;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: .02em;
        }
        .pr-count-pill::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: #4f46e5;
        }

        /* ─── Filters ─── */
        .pr-filters {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 200px 180px;
          gap: 10px;
          margin-bottom: 16px;
          padding: 12px;
          background: #fff;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 14px;
          animation: prRise .4s ease .04s both;
        }
        @media (max-width: 780px) {
          .pr-filters { grid-template-columns: 1fr; }
        }
        .pr-filters .form-input,
        .pr-filters .form-select { height: 40px; }

        /* ─── Table panel ─── */
        .pr-panel {
          background: #fff;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 14px;
          overflow: hidden;
          animation: prRise .4s ease .08s both;
        }
        .pr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .pr-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: #94a3b8;
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid var(--border, #e2e8f0);
          white-space: nowrap;
        }
        .pr-table tbody td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #0f172a;
          vertical-align: middle;
        }
        .pr-table tbody tr:last-child td { border-bottom: none; }
        .pr-table tbody tr { transition: background .15s ease; }
        .pr-table tbody tr:hover { background: #f8fafc; }
        .pr-cell-right { text-align: right; }
        .pr-prod-cell {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .pr-prod-avatar {
          width: 34px; height: 34px;
          border-radius: 9px;
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          color: #4338ca;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          flex-shrink: 0;
          letter-spacing: -.02em;
        }
        .pr-prod-name {
          font-weight: 600;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pr-prod-sku {
          font-size: 11.5px;
          color: #94a3b8;
          margin-top: 1px;
          font-variant-numeric: tabular-nums;
        }
        .pr-mono {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .pr-price { font-weight: 700; font-variant-numeric: tabular-nums; }
        .pr-actions {
          display: flex;
          gap: 4px;
        }
        .pr-act-btn {
          width: 30px; height: 30px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          color: #64748b;
          transition: all .18s ease;
        }
        .pr-act-btn:hover {
          background: #f1f5f9;
          border-color: #e2e8f0;
          color: #0f172a;
        }
        .pr-act-btn.danger:hover {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
        }
        .pr-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .02em;
        }
        .pr-badge::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
        }

        /* ═══════ FORM ═══════ */
        .pr-form { display: flex; flex-direction: column; gap: 18px; }

        .pr-section {
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 14px;
          padding: 16px 18px;
          background: #fbfdff;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .pr-section:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 10px rgba(15,23,42,.03);
        }
        .pr-section-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px dashed #e2e8f0;
        }
        .pr-section-icon {
          width: 32px; height: 32px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pr-section-icon svg { width: 16px; height: 16px; }
        .pr-section-icon.indigo { background: #eef2ff; color: #4f46e5; }
        .pr-section-icon.blue   { background: #eff6ff; color: #2563eb; }
        .pr-section-icon.violet { background: #f5f3ff; color: #7c3aed; }
        .pr-section-icon.green  { background: #ecfdf5; color: #059669; }
        .pr-section-icon.amber  { background: #fffbeb; color: #d97706; }
        .pr-section-icon.rose   { background: #fff1f2; color: #e11d48; }
        .pr-section-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #334155;
        }
        .pr-section-sub {
          font-size: 11.5px;
          color: #94a3b8;
          font-weight: 500;
          margin-top: 1px;
          letter-spacing: 0;
          text-transform: none;
        }

        .pr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }
        .pr-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pr-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (max-width: 720px) {
          .pr-grid-3, .pr-grid-2 { grid-template-columns: 1fr; }
        }

        .pr-field { display: flex; flex-direction: column; gap: 5px; }
        .pr-label {
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: .03em;
          text-transform: uppercase;
          color: #64748b;
        }
        .pr-label .req { color: #e11d48; margin-left: 2px; }
        .pr-field .form-input,
        .pr-field .form-select,
        .pr-field .form-textarea {
          height: 40px;
          font-size: 13.5px;
          border-radius: 10px;
        }
        .pr-field .form-textarea { height: auto; min-height: 74px; padding: 10px 12px; }

        .pr-hint {
          font-size: 11.5px;
          color: #94a3b8;
          padding: 8px 12px;
          background: #f1f5f9;
          border-radius: 8px;
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }
        .pr-hint svg { flex-shrink: 0; color: #94a3b8; }

        .pr-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          cursor: pointer;
          transition: all .18s ease;
          user-select: none;
        }
        .pr-toggle:hover { border-color: #c7d2fe; background: #fafaff; }
        .pr-toggle input { display: none; }
        .pr-toggle-box {
          width: 34px; height: 20px;
          border-radius: 999px;
          background: #cbd5e1;
          position: relative;
          transition: background .2s ease;
          flex-shrink: 0;
        }
        .pr-toggle-box::after {
          content: '';
          position: absolute;
          top: 2px; left: 2px;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,.15);
          transition: transform .22s cubic-bezier(.2,.9,.3,1.2);
        }
        .pr-toggle input:checked ~ .pr-toggle-box { background: #4f46e5; }
        .pr-toggle input:checked ~ .pr-toggle-box::after { transform: translateX(14px); }
        .pr-toggle-label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        /* Opening stock highlight */
        .pr-opening {
          background: linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%);
          border: 1px solid #c7d2fe;
        }
        .pr-opening .pr-section-head { border-bottom-color: #c7d2fe; }
        .pr-opening .pr-section-title { color: #4338ca; }
        .pr-opening .pr-section-sub { color: #6366f1; }

        /* Pricing cards */
        .pr-price-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }
        .pr-price-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          transition: all .18s ease;
        }
        .pr-price-card:focus-within {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.12);
        }
        .pr-price-card .pr-label { color: #4f46e5; }
        .pr-price-card input {
          border: none !important;
          background: transparent !important;
          padding: 2px 0 !important;
          height: auto !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          outline: none !important;
          font-variant-numeric: tabular-nums;
          width: 100%;
        }
        .pr-price-card input::placeholder {
          color: #cbd5e1;
          font-weight: 500;
        }
        .pr-price-card.highlight {
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          border-color: #c7d2fe;
        }
      `}</style>

      {/* Header */}
      <div className="pr-header">
        <div>
          <h2>Products</h2>
          <div className="pr-header-sub">
            <span className="pr-count-pill">{filtered.length} products</span>
            Manage your product catalog with pricing and stock
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="pr-filters">
        <div className="search-input" style={{ width: '100%' }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search by name, SKU, or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <div className="pr-panel">
          <EmptyState
            title="No products found"
            message="Add your first product to get started"
            action={<button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Product</button>}
          />
        </div>
      ) : (
        <div className="pr-panel">
          <table className="pr-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th className="pr-cell-right">Retail Price</th>
                <th className="pr-cell-right">Stock</th>
                <th>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const invType = p.category?.inventory_type ?? 'piece'
                const stockDisplay = invType === 'slab' ? `${formatNumber(p.stock_count)} slabs / ${formatNumber(p.stock_sqft)} Sq.Ft` : invType === 'box' ? `${formatNumber(p.stock_count)} boxes` : `${formatNumber(p.stock_count)} pcs`
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="pr-prod-cell">
                        <div className="pr-prod-avatar">{p.name.charAt(0).toUpperCase()}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="pr-prod-name">{p.name}</div>
                          <div className="pr-prod-sku">{p.sku ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.category?.name ?? '-'}</td>
                    <td>{p.subcategory?.name ?? '-'}</td>
                    <td className="pr-cell-right"><span className="pr-price">{formatCurrency(p.retail_price)}</span></td>
                    <td className="pr-cell-right"><span className="pr-mono">{stockDisplay}</span></td>
                    <td><span className={`pr-badge ${stockStatusColor(stockStatus(p))}`}>{stockStatusLabel(stockStatus(p))}</span></td>
                    <td>
                      <div className="pr-actions">
                        <button className="pr-act-btn" onClick={() => { setEditing(p); setModalOpen(true) }} title="Edit"><Edit2 size={14} /></button>
                        <button className="pr-act-btn danger" onClick={() => setDeleteId(p.id)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
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
      <form onSubmit={handleSubmit} className="pr-form">

        {/* ── Basic Information ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon indigo"><Package /></div>
            <div>
              <div className="pr-section-title">Basic Information</div>
              <div className="pr-section-sub">Name and identification details</div>
            </div>
          </div>
          <div className="pr-grid pr-grid-3">
            <div className="pr-field" style={{ gridColumn: 'span 2' }}>
              <label className="pr-label">Product Name <span className="req">*</span></label>
              <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Makrana White Marble" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Brand</label>
              <input className="form-input" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Brand name" />
            </div>
            <div className="pr-field">
              <label className="pr-label"><Hash size={11} style={{ display: 'inline', marginRight: 4 }} /> SKU / Code</label>
              <input className="form-input" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="SKU-001" />
            </div>
            <div className="pr-field">
              <label className="pr-label"><Barcode size={11} style={{ display: 'inline', marginRight: 4 }} /> Barcode</label>
              <input className="form-input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="Barcode" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Model / Design</label>
              <input className="form-input" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Design code" />
            </div>
          </div>
        </div>

        {/* ── Classification ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon blue"><Layers /></div>
            <div>
              <div className="pr-section-title">Classification</div>
              <div className="pr-section-sub">Category and inventory type</div>
            </div>
          </div>
          <div className="pr-grid pr-grid-2">
            <div className="pr-field">
              <label className="pr-label">Category</label>
              <select className="form-select" value={form.category_id} onChange={(e) => { set('category_id', e.target.value); set('subcategory_id', ''); const cat = categories.find((c) => c.id === e.target.value); if (cat) set('selling_unit', getInventoryType(cat.name) === 'slab' ? 'Sq.Ft' : getInventoryType(cat.name) === 'box' ? 'Box' : 'Piece') }}>
                <option value="">Select Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Subcategory</label>
              <select className="form-select" value={form.subcategory_id} onChange={(e) => set('subcategory_id', e.target.value)} disabled={!form.category_id}>
                <option value="">Select Subcategory</option>
                {availableSubcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Selling Unit</label>
              <select className="form-select" value={form.selling_unit} onChange={(e) => { set('selling_unit', e.target.value); setSelectedUnits([e.target.value]) }}>
                {availableUnits.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Origin</label>
              <input className="form-input" value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="e.g. Rajasthan, Italy" />
            </div>
          </div>
        </div>

        {/* ── Specifications ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon violet"><Ruler /></div>
            <div>
              <div className="pr-section-title">Specifications</div>
              <div className="pr-section-sub">Physical attributes and dimensions</div>
            </div>
          </div>
          <div className="pr-grid pr-grid-3">
            <div className="pr-field">
              <label className="pr-label">Material</label>
              <input className="form-input" value={form.material} onChange={(e) => set('material', e.target.value)} placeholder="e.g. Marble" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Thickness</label>
              <input className="form-input" value={form.thickness} onChange={(e) => set('thickness', e.target.value)} placeholder="e.g. 18mm" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Size</label>
              <input className="form-input" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="e.g. 600x600mm" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Color</label>
              <input className="form-input" value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="e.g. White" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Finish</label>
              <input className="form-input" value={form.finish} onChange={(e) => set('finish', e.target.value)} placeholder="e.g. Polished" />
            </div>
          </div>
          <div className="pr-grid pr-grid-3" style={{ marginTop: 12 }}>
            <div className="pr-field">
              <label className="pr-label">Length (ft)</label>
              <input className="form-input" type="number" step="0.01" value={form.length} onChange={(e) => set('length', e.target.value)} placeholder="0.00" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Width (ft)</label>
              <input className="form-input" type="number" step="0.01" value={form.width} onChange={(e) => set('width', e.target.value)} placeholder="0.00" />
            </div>
            <div className="pr-field">
              <label className="pr-label">Height (ft)</label>
              <input className="form-input" type="number" step="0.01" value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* ── Pricing ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon green"><DollarSign /></div>
            <div>
              <div className="pr-section-title">Pricing</div>
              <div className="pr-section-sub">Set cost, retail and wholesale rates</div>
            </div>
          </div>
          <div className="pr-price-grid">
            <div className="pr-price-card">
              <label className="pr-label">Purchase Price</label>
              <input type="number" step="0.01" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0" />
            </div>
            <div className="pr-price-card">
              <label className="pr-label">Cost Price</label>
              <input type="number" step="0.01" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} placeholder="0" />
            </div>
            <div className="pr-price-card highlight">
              <label className="pr-label">Retail Price</label>
              <input type="number" step="0.01" value={form.retail_price} onChange={(e) => set('retail_price', e.target.value)} placeholder="0" />
            </div>
            <div className="pr-price-card">
              <label className="pr-label">Wholesale Price</label>
              <input type="number" step="0.01" value={form.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} placeholder="0" />
            </div>
            <div className="pr-price-card">
              <label className="pr-label">Dealer Price</label>
              <input type="number" step="0.01" value={form.dealer_price} onChange={(e) => set('dealer_price', e.target.value)} placeholder="0" />
            </div>
            <div className="pr-price-card">
              <label className="pr-label">Min Selling Price</label>
              <input type="number" step="0.01" value={form.min_selling_price} onChange={(e) => set('min_selling_price', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="pr-grid pr-grid-2" style={{ marginTop: 12 }}>
            <div className="pr-field">
              <label className="pr-label">GST Rate (%)</label>
              <input className="form-input" type="number" step="0.01" value={form.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} />
            </div>
            <div className="pr-field">
              <label className="pr-label">Min Stock Level</label>
              <input className="form-input" type="number" step="0.01" value={form.min_stock_level} onChange={(e) => set('min_stock_level', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Opening Stock (only for new) ── */}
        {!product && (
          <div className="pr-section pr-opening">
            <div className="pr-section-head">
              <div className="pr-section-icon violet"><Sparkles /></div>
              <div>
                <div className="pr-section-title">Opening Stock</div>
                <div className="pr-section-sub">Starting inventory for this product</div>
              </div>
            </div>
            <div className="pr-grid pr-grid-2">
              <div className="pr-field">
                <label className="pr-label">Opening Count</label>
                <input className="form-input" type="number" min="0" step="0.01" value={openingCount} onChange={(e) => setOpeningCount(e.target.value)} placeholder="Pieces / Boxes / Slabs" />
              </div>
              <div className="pr-field">
                <label className="pr-label">Opening Sq.Ft</label>
                <input className="form-input" type="number" min="0" step="0.01" value={openingSqft} onChange={(e) => setOpeningSqft(e.target.value)} placeholder="For slabs, tiles or area stock" />
              </div>
            </div>
            <div className="pr-hint">
              <Info size={14} />
              Opening stock is added to inventory and recorded in the Stock Ledger.
            </div>
          </div>
        )}

        {/* ── Storage & Supplier ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon amber"><MapPin /></div>
            <div>
              <div className="pr-section-title">Storage & Supplier</div>
              <div className="pr-section-sub">Location, rack and supplier details</div>
            </div>
          </div>
          <div className="pr-grid pr-grid-3">
            <div className="pr-field">
              <label className="pr-label">Supplier</label>
              <select className="form-select" value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
                <option value="">No Supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Location</label>
              <select className="form-select" value={form.location_id} onChange={(e) => set('location_id', e.target.value)}>
                <option value="">No Location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Rack Number</label>
              <input className="form-input" value={form.rack_number} onChange={(e) => set('rack_number', e.target.value)} placeholder="e.g. R-12" />
            </div>
          </div>
        </div>

        {/* ── Description & Status ── */}
        <div className="pr-section">
          <div className="pr-section-head">
            <div className="pr-section-icon rose"><Info /></div>
            <div>
              <div className="pr-section-title">Additional Details</div>
              <div className="pr-section-sub">Description and availability</div>
            </div>
          </div>
          <div className="pr-field" style={{ marginBottom: 12 }}>
            <label className="pr-label">Description</label>
            <textarea className="form-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional notes about this product..." />
          </div>
          <label className="pr-toggle">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <span className="pr-toggle-box" />
            <span className="pr-toggle-label">{form.is_active ? 'Active — visible in catalog' : 'Inactive — hidden from catalog'}</span>
          </label>
        </div>

      </form>
    </Modal>
  )
}
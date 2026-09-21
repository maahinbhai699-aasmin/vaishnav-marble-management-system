import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatNumber, slabStatusColor, calcSqft } from '../lib/utils'
import type { Slab, Product } from '../lib/types'
import { Plus, Search, Edit2, Trash2, Layers } from 'lucide-react'

export function Slabs() {
  const toast = useToast()
  const [slabs, setSlabs] = useState<Slab[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Slab | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [slabRes, prodRes] = await Promise.all([
      supabase.from('slabs').select('*, product:products(*), location:locations(*), supplier:suppliers(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:categories(*)').order('name'),
    ])
    setSlabs((slabRes.data ?? []) as Slab[])
    setProducts((prodRes.data ?? []) as Product[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const slabProducts = useMemo(() => products.filter((p) => p.category?.inventory_type === 'slab'), [products])

  const filtered = useMemo(() => {
    return slabs.filter((s) => {
      const matchSearch = !search ||
        s.slab_number.toLowerCase().includes(search.toLowerCase()) ||
        (s.batch_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.product?.name ?? '').toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || s.status === statusFilter
      const matchProduct = !productFilter || s.product_id === productFilter
      return matchSearch && matchStatus && matchProduct
    })
  }, [slabs, search, statusFilter, productFilter])

  const handleSave = async (data: Partial<Slab>) => {
    if (editing) {
      const totalSqft = data.length && data.width ? calcSqft(Number(data.length), Number(data.width)) : editing.total_sqft
      const { error } = await supabase.from('slabs').update({
        ...data,
        total_sqft: totalSqft,
        remaining_sqft: totalSqft - Number(editing.sold_sqft),
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Slab updated successfully')
    } else {
      const totalSqft = data.length && data.width ? calcSqft(Number(data.length), Number(data.width)) : 0
      const { error } = await supabase.from('slabs').insert({
        ...data,
        total_sqft: totalSqft,
        remaining_sqft: totalSqft,
        sold_sqft: 0,
        status: 'available',
      })
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Slab created successfully')
    }
    setModalOpen(false)
    setEditing(null)
    fetchData()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('slabs').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Slab deleted')
    setDeleteId(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading slabs..." />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Marble & Granite Slabs</h2>
          <div className="page-sub">Individual slab tracking with Sq.Ft management</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }} disabled={slabProducts.length === 0}>
          <Plus size={16} /> Add Slab
        </button>
      </div>

      {slabProducts.length === 0 && (
        <div className="card mb-4" style={{ padding: 16, background: 'var(--warning-50)', borderColor: 'var(--warning-100)' }}>
          <p className="text-sm" style={{ color: 'var(--warning-700)' }}>Add a Marble or Granite product first before creating slabs.</p>
        </div>
      )}

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search slabs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
          <option value="">All Products</option>
          {slabProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="partially_sold">Partially Sold</option>
          <option value="sold">Sold</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Layers />} title="No slabs found" message="Add individual slabs to track Sq.Ft inventory" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Slab Number</th>
                <th>Product</th>
                <th>Batch</th>
                <th className="text-right">L x W (ft)</th>
                <th className="text-right">Total Sq.Ft</th>
                <th className="text-right">Sold Sq.Ft</th>
                <th className="text-right">Remaining</th>
                <th className="text-right">Purchase Rate</th>
                <th className="text-right">Selling Rate</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.slab_number}</td>
                  <td>{s.product?.name ?? '-'}</td>
                  <td>{s.batch_number ?? '-'}</td>
                  <td className="text-right">{formatNumber(s.length)} x {formatNumber(s.width)}</td>
                  <td className="text-right">{formatNumber(s.total_sqft)}</td>
                  <td className="text-right">{formatNumber(s.sold_sqft)}</td>
                  <td className="text-right font-semibold">{formatNumber(s.remaining_sqft)}</td>
                  <td className="text-right">{formatCurrency(s.purchase_rate)}</td>
                  <td className="text-right">{formatCurrency(s.selling_rate)}</td>
                  <td><span className={`badge ${slabStatusColor(s.status)}`}>{s.status.replace('_', ' ')}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s); setModalOpen(true) }}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <SlabForm slab={editing} products={slabProducts} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />
      )}

      <ConfirmDialog open={!!deleteId} title="Delete Slab" message="Are you sure you want to delete this slab?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
    </div>
  )
}

function SlabForm({ slab, products, onClose, onSave }: { slab: Slab | null; products: Product[]; onClose: () => void; onSave: (data: Partial<Slab>) => void }) {
  const [form, setForm] = useState({
    slab_number: slab?.slab_number ?? '',
    product_id: slab?.product_id ?? '',
    batch_number: slab?.batch_number ?? '',
    length: slab?.length ?? '',
    width: slab?.width ?? '',
    thickness: slab?.thickness ?? '',
    purchase_rate: slab?.purchase_rate ?? '',
    selling_rate: slab?.selling_rate ?? '',
    rack_number: slab?.rack_number ?? '',
  })

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))
  const totalSqft = form.length && form.width ? calcSqft(Number(form.length), Number(form.width)) : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.slab_number || !form.product_id || !form.length || !form.width) return
    onSave({
      slab_number: form.slab_number,
      product_id: form.product_id,
      batch_number: form.batch_number || null,
      length: Number(form.length),
      width: Number(form.width),
      thickness: form.thickness ? Number(form.thickness) : null,
      purchase_rate: Number(form.purchase_rate) || 0,
      selling_rate: Number(form.selling_rate) || 0,
      rack_number: form.rack_number || null,
      category_id: products.find((p) => p.id === form.product_id)?.category_id ?? null,
    })
  }

  return (
    <Modal open onClose={onClose} title={slab ? 'Edit Slab' : 'Add Slab'} size="lg"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{slab ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Slab Number <span className="req">*</span></label>
            <input className="form-input" value={form.slab_number} onChange={(e) => set('slab_number', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Product <span className="req">*</span></label>
            <select className="form-select" value={form.product_id} onChange={(e) => set('product_id', e.target.value)} required>
              <option value="">Select Product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Batch / Lot Number</label>
            <input className="form-input" value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Length (ft) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={form.length} onChange={(e) => set('length', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Width (ft) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={form.width} onChange={(e) => set('width', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Thickness (mm)</label>
            <input className="form-input" type="number" step="0.01" value={form.thickness} onChange={(e) => set('thickness', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Total Sq.Ft (auto-calculated)</label>
            <input className="form-input" value={formatNumber(totalSqft)} readOnly style={{ background: 'var(--n-50)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Purchase Rate / Sq.Ft</label>
            <input className="form-input" type="number" step="0.01" value={form.purchase_rate} onChange={(e) => set('purchase_rate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Selling Rate / Sq.Ft</label>
            <input className="form-input" type="number" step="0.01" value={form.selling_rate} onChange={(e) => set('selling_rate', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Rack Number</label>
          <input className="form-input" value={form.rack_number} onChange={(e) => set('rack_number', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

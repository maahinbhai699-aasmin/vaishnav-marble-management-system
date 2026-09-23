import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { formatCurrency, formatNumber, slabStatusColor, calcSqft } from '../lib/utils'
import type { Slab, Product } from '../lib/types'
import {
  Plus, Search, Edit2, Trash2, Layers, X, AlertCircle,
  Package, PackageCheck, PackageX, Ruler, IndianRupee,
} from 'lucide-react'

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

  // Derived stats (no logic change)
  const stats = useMemo(() => {
    const available = slabs.filter((s) => s.status === 'available').length
    const partial = slabs.filter((s) => s.status === 'partially_sold').length
    const sold = slabs.filter((s) => s.status === 'sold').length
    const totalRemaining = slabs.reduce((sum, s) => sum + Number(s.remaining_sqft || 0), 0)
    const totalSqft = slabs.reduce((sum, s) => sum + Number(s.total_sqft || 0), 0)
    const stockValue = slabs.reduce((sum, s) => sum + Number(s.remaining_sqft || 0) * Number(s.purchase_rate || 0), 0)
    return { available, partial, sold, totalRemaining, totalSqft, stockValue, total: slabs.length }
  }, [slabs])

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
      {/* ───────────── Header ───────────── */}
      <div className="page-header">
        <div>
          <h2>Marble &amp; Granite Slabs</h2>
          <div className="page-sub">Individual slab tracking with Sq.Ft management</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true) }}
          disabled={slabProducts.length === 0}
        >
          <Plus size={16} /> Add Slab
        </button>
      </div>

      {/* ───────────── Warning banner ───────────── */}
      {slabProducts.length === 0 && (
        <div
          className="card mb-4"
          style={{
            padding: 14,
            background: 'var(--warning-50)',
            borderColor: 'var(--warning-100)',
            border: '1px solid var(--warning-100)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} style={{ color: 'var(--warning-700)', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--warning-700)', margin: 0 }}>
            Add a Marble or Granite product first before creating slabs.
          </p>
        </div>
      )}

      {/* ───────────── Stat cards ───────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard icon={<Layers size={18} />} label="Total Slabs" value={stats.total} tone="primary" />
        <StatCard icon={<PackageCheck size={18} />} label="Available" value={stats.available} tone="success" />
        <StatCard icon={<Package size={18} />} label="Partially Sold" value={stats.partial} tone="warning" />
        <StatCard icon={<PackageX size={18} />} label="Sold" value={stats.sold} tone="neutral" />
        <StatCard icon={<Ruler size={18} />} label="Remaining Sq.Ft" value={formatNumber(stats.totalRemaining)} tone="primary" />
        <StatCard icon={<IndianRupee size={18} />} label="Stock Value" value={formatCurrency(stats.stockValue)} tone="error" />
      </div>

      {/* ───────────── Filters ───────────── */}
      <div
        className="filters-bar"
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div
          className="search-input"
          style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Search size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
          <input
            className="form-input"
            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
            placeholder="Search by slab number, batch, or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSearch('')}
              style={{ padding: 4, flexShrink: 0 }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          className="form-select"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Products</option>
          {slabProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="form-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ minWidth: 150 }}
        >
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="partially_sold">Partially Sold</option>
          <option value="sold">Sold</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>

      {/* ───────────── Table / Empty ───────────── */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Layers />}
            title={slabs.length === 0 ? 'No slabs found' : 'No matching slabs'}
            message={
              slabs.length === 0
                ? 'Add individual slabs to track Sq.Ft inventory'
                : 'Try changing the search or filters above'
            }
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Slab Number</th>
                <th>Product</th>
                <th>Batch</th>
                <th className="text-right">L × W (ft)</th>
                <th className="text-right">Total Sq.Ft</th>
                <th style={{ minWidth: 140 }}>Sold / Remaining</th>
                <th className="text-right">Purchase</th>
                <th className="text-right">Selling</th>
                <th>Status</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const total = Number(s.total_sqft || 0)
                const sold = Number(s.sold_sqft || 0)
                const remaining = Number(s.remaining_sqft || 0)
                const soldPct = total > 0 ? (sold / total) * 100 : 0
                return (
                  <tr key={s.id}>
                    <td className="text-muted" style={{ fontSize: 12 }}>{idx + 1}</td>
                    <td className="font-semibold">{s.slab_number}</td>
                    <td>{s.product?.name ?? '-'}</td>
                    <td>{s.batch_number ?? '-'}</td>
                    <td className="text-right">
                      {formatNumber(s.length)} × {formatNumber(s.width)}
                    </td>
                    <td className="text-right">{formatNumber(total)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            color: 'var(--n-500)',
                            fontWeight: 600,
                          }}
                        >
                          <span>{formatNumber(sold)} sold</span>
                          <span style={{ color: 'var(--primary-600)' }}>{formatNumber(remaining)} left</span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: 'var(--n-100)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, soldPct)}%`,
                              background:
                                soldPct >= 100
                                  ? 'var(--n-400)'
                                  : soldPct >= 50
                                    ? 'var(--warning-500, #f59e0b)'
                                    : 'var(--primary-500, #3b82f6)',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="text-right">{formatCurrency(s.purchase_rate)}</td>
                    <td className="text-right">{formatCurrency(s.selling_rate)}</td>
                    <td>
                      <span className={`badge ${slabStatusColor(s.status)}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setEditing(s); setModalOpen(true) }}
                          title="Edit slab"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeleteId(s.id)}
                          title="Delete slab"
                        >
                          <Trash2 size={14} />
                        </button>
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
        <SlabForm
          slab={editing}
          products={slabProducts}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Slab"
        message="Are you sure you want to delete this slab?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

/* ───────────── Stat card helper ───────────── */
function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
}) {
  const palette = {
    primary: { color: 'var(--primary-600)', bg: 'var(--primary-50)' },
    success: { color: 'var(--success-600, #16a34a)', bg: '#f0fdf4' },
    warning: { color: 'var(--warning-600, #d97706)', bg: '#fffbeb' },
    error:   { color: 'var(--error-600, #dc2626)',   bg: '#fef2f2' },
    neutral: { color: 'var(--n-600, #475569)',       bg: 'var(--n-100, #f1f5f9)' },
  }[tone]

  return (
    <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: palette.bg,
          color: palette.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="text-muted"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
        >
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.color, lineHeight: 1.2, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

/* ───────────── Slab form modal ───────────── */
function SlabForm({
  slab,
  products,
  onClose,
  onSave,
}: {
  slab: Slab | null
  products: Product[]
  onClose: () => void
  onSave: (data: Partial<Slab>) => void
}) {
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

  const sectionLabel = (text: string) => (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        color: 'var(--n-500)',
        textTransform: 'uppercase',
        margin: '4px 0 10px',
      }}
    >
      {text}
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={slab ? `Edit Slab — ${slab.slab_number}` : 'Add New Slab'}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {slab ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* ── Section 1: Basic Info ── */}
        {sectionLabel('Basic Information')}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Slab Number <span className="req">*</span></label>
            <input
              className="form-input"
              value={form.slab_number}
              onChange={(e) => set('slab_number', e.target.value)}
              placeholder="e.g. SLB-001"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Product <span className="req">*</span></label>
            <select
              className="form-select"
              value={form.product_id}
              onChange={(e) => set('product_id', e.target.value)}
              required
            >
              <option value="">Select Product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Batch / Lot Number</label>
            <input
              className="form-input"
              value={form.batch_number}
              onChange={(e) => set('batch_number', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {/* ── Section 2: Dimensions ── */}
        <div style={{ marginTop: 20 }}>
          {sectionLabel('Dimensions')}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Length (ft) <span className="req">*</span></label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.length}
                onChange={(e) => set('length', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Width (ft) <span className="req">*</span></label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.width}
                onChange={(e) => set('width', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Thickness (mm)</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.thickness}
                onChange={(e) => set('thickness', e.target.value)}
              />
            </div>
          </div>

          {/* Live Sq.Ft preview */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--primary-50)',
              borderRadius: 10,
              border: '1px dashed var(--primary-200, var(--border))',
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--primary-600)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Ruler size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                className="text-muted"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Calculated Total Sq.Ft
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary-600)', lineHeight: 1.2 }}>
                {formatNumber(totalSqft)} <span style={{ fontSize: 13, fontWeight: 600 }}>sq.ft</span>
              </div>
            </div>
            <span className="text-muted text-sm">Auto-calculated</span>
          </div>
        </div>

        {/* ── Section 3: Pricing & Storage ── */}
        <div style={{ marginTop: 20 }}>
          {sectionLabel('Pricing & Storage')}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Purchase Rate / Sq.Ft</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.purchase_rate}
                onChange={(e) => set('purchase_rate', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Selling Rate / Sq.Ft</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.selling_rate}
                onChange={(e) => set('selling_rate', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rack Number</label>
              <input
                className="form-input"
                value={form.rack_number}
                onChange={(e) => set('rack_number', e.target.value)}
                placeholder="e.g. R-12"
              />
            </div>
          </div>

          {/* Margin preview if both rates entered */}
          {form.purchase_rate && form.selling_rate && (
            <div
              style={{
                marginTop: 4,
                padding: '10px 12px',
                background: 'var(--n-50)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span className="text-muted">Estimated margin per Sq.Ft</span>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    Number(form.selling_rate) - Number(form.purchase_rate) >= 0
                      ? 'var(--success-600, #16a34a)'
                      : 'var(--error-600, #dc2626)',
                }}
              >
                {formatCurrency(Number(form.selling_rate) - Number(form.purchase_rate))}
              </span>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
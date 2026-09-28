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

  const summary = useMemo(() => {
    const totalValue = products.reduce((s, p) => {
      const invType = p.category?.inventory_type ?? 'piece'
      const stock = invType === 'piece' ? Number(p.stock_count) : Number(p.stock_sqft)
      return s + (Number(p.cost_price) * stock)
    }, 0)
    const lowCount = products.filter((p) => stockStatus(p) === 'low_stock').length
    const outCount = products.filter((p) => stockStatus(p) === 'out_of_stock').length
    return { totalValue, lowCount, outCount }
  }, [products])

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
        .pr-root {
          --pr-card: #ffffff;
          --pr-border: #e6ebf2;
          --pr-text: #0f172a;
          --pr-muted: #64748b;
          --pr-soft: #94a3b8;
          animation: prFade .4s ease both;
        }
        @keyframes prFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes prRise {
          from { opacity: 0; transform: translateY(14px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes prRowIn {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes prShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        @keyframes prFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes prGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,.42); }
          50% { box-shadow: 0 0 0 10px rgba(99,102,241,0); }
        }

        /* ─── Header ─── */
        .pr-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        @media (max-width: 560px) {
          .pr-header { align-items: stretch; }
          .pr-header > div:first-child { flex: 1 1 100%; }
          .pr-header .pr-add-btn { width: 100%; justify-content: center; }
        }
        .pr-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #4f46e5 55%, #06b6d4 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pr-header-sub {
          margin-top: 6px;
          font-size: 13.5px;
          color: var(--pr-muted);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pr-count-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 11px;
          border-radius: 999px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          color: #4338ca;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .02em;
          box-shadow: 0 6px 14px -8px rgba(79,70,229,.6);
        }
        .pr-count-pill::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,.2);
        }

        /* ─── Add Button — black base, gradient on hover ─── */
        .pr-add-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 20px;
          border-radius: 12px;
          background: #0f172a;
          border: 1px solid #0f172a;
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          overflow: hidden;
          isolation: isolate;
          box-shadow: 0 10px 22px -10px rgba(15,23,42,.75);
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease, background .28s ease;
        }
        .pr-add-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.3) 50%, transparent 68%);
          transform: translateX(-140%);
          z-index: -1;
        }
        .pr-add-btn:hover {
          background: linear-gradient(115deg, #4f46e5, #06b6d4);
          border-color: transparent;
          transform: translateY(-2px);
          box-shadow: 0 16px 30px -12px rgba(79,70,229,.6);
        }
        .pr-add-btn:hover::after { animation: prShine .9s ease; }
        .pr-add-btn:active { transform: scale(.96); }

        /* ─── Filters ─── */
        .pr-filters {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 200px 180px;
          gap: 12px;
          margin-bottom: 16px;
          padding: 14px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid var(--pr-border);
          border-radius: 16px;
          box-shadow: 0 10px 30px -20px rgba(15,23,42,.2);
          animation: prRise .45s cubic-bezier(.22,1,.36,1) .04s both;
        }
        @media (max-width: 780px) {
          .pr-filters { grid-template-columns: 1fr; }
        }
        .pr-filters .form-input,
        .pr-filters .form-select {
          height: 42px;
          border-radius: 10px;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .pr-filters .form-input:focus,
        .pr-filters .form-select:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
        }
        .pr-filters .search-input {
          position: relative;
        }

        /* ─── Summary cards ─── */
        .pr-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 13px;
          margin-bottom: 18px;
        }
        .pr-summary-card {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--pr-card);
          border: 1px solid var(--pr-border);
          border-radius: 16px;
          padding: 15px 16px;
          animation: prRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .pr-summary-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--sc1), var(--sc2));
        }
        .pr-summary-card::after {
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
        .pr-summary-card:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 20px 34px -18px var(--scs), 0 3px 10px -4px rgba(15,23,42,.06);
        }
        .pr-summary-card:hover::after { opacity: .22; transform: scale(1.18); }

        .pr-summary-card.c-indigo { --sc1:#6366f1; --sc2:#818cf8; --scs: rgba(99,102,241,.5); }
        .pr-summary-card.c-emerald { --sc1:#10b981; --sc2:#34d399; --scs: rgba(16,185,129,.5); }
        .pr-summary-card.c-amber { --sc1:#f59e0b; --sc2:#fbbf24; --scs: rgba(245,158,11,.5); }
        .pr-summary-card.c-rose { --sc1:#f43f5e; --sc2:#fb7185; --scs: rgba(244,63,94,.5); }

        .pr-summary-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 9px;
        }
        .pr-summary-label {
          font-size: 11px;
          letter-spacing: .09em;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 800;
        }
        .pr-summary-ico {
          width: 34px; height: 34px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          color: #fff;
          background: linear-gradient(135deg, var(--sc1), var(--sc2));
          box-shadow: 0 10px 20px -10px var(--scs);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .pr-summary-card:hover .pr-summary-ico { transform: scale(1.12) rotate(-8deg); }
        .pr-summary-ico svg { width: 17px; height: 17px; }
        .pr-summary-value {
          font-size: clamp(20px, 2.2vw, 26px);
          font-weight: 800;
          letter-spacing: -.03em;
          color: var(--pr-text);
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
        }
        .pr-summary-lite {
          font-size: 12px;
          color: var(--pr-muted);
          margin-top: 5px;
          font-weight: 600;
        }

        /* ─── Table panel ─── */
        .pr-panel {
          background: var(--pr-card);
          border: 1px solid var(--pr-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 14px 40px -28px rgba(15,23,42,.35);
          animation: prRise .5s cubic-bezier(.22,1,.36,1) .1s both;
        }
        .pr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .pr-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--pr-soft);
          padding: 13px 16px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          border-bottom: 1px solid var(--pr-border);
          white-space: nowrap;
        }
        .pr-table tbody td {
          padding: 13px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--pr-text);
          vertical-align: middle;
        }
        .pr-table tbody tr:last-child td { border-bottom: none; }
        .pr-table tbody tr {
          animation: prRowIn .4s ease both;
          transition: background .18s ease, box-shadow .18s ease;
        }
        .pr-table tbody tr:hover {
          background: linear-gradient(90deg, #f8fafc, #ffffff);
          box-shadow: inset 3px 0 0 #6366f1;
        }
        .pr-cell-right { text-align: right; }
        .pr-prod-cell {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .pr-prod-avatar {
          width: 42px; height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 15px;
          flex-shrink: 0;
          color: #ffffff;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 8px 18px -10px rgba(99,102,241,.9);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .pr-table tbody tr:hover .pr-prod-avatar {
          transform: scale(1.08) rotate(-6deg);
        }
        .pr-prod-name {
          font-size: 14.5px;
          font-weight: 700;
          color: var(--pr-text);
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pr-prod-sku {
          font-size: 11.5px;
          color: var(--pr-soft);
          margin-top: 2px;
          font-variant-numeric: tabular-nums;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .pr-price {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: #0f172a;
        }
        .pr-mono {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: var(--pr-text);
        }
        .pr-actions { display: flex; gap: 6px; }
        .pr-act-btn {
          width: 32px; height: 32px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border: 1px solid var(--pr-border);
          cursor: pointer;
          color: var(--pr-muted);
          transition: all .2s cubic-bezier(.22,1,.36,1);
        }
        .pr-act-btn:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px -8px rgba(79,70,229,.7);
        }
        .pr-act-btn.danger:hover {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
          box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
        }
        .pr-act-btn:active { transform: scale(.9); }

        .pr-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .025em;
          white-space: nowrap;
        }
        .pr-badge::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 3px currentColor;
          opacity: .9;
        }

        /* ═══════ FORM (Modal) ═══════ */
        .pr-form { display: flex; flex-direction: column; gap: 18px; }

        .pr-section {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--pr-border);
          border-radius: 16px;
          padding: 17px 18px;
          background: linear-gradient(135deg, #ffffff 0%, #fbfdff 100%);
          transition: border-color .22s ease, box-shadow .22s ease, transform .22s ease;
        }
        .pr-section::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--sec1), var(--sec2));
        }
        .pr-section:hover {
          border-color: #cbd5e1;
          box-shadow: 0 14px 30px -24px rgba(15,23,42,.4);
        }
        .pr-section.s-indigo { --sec1:#6366f1; --sec2:#818cf8; }
        .pr-section.s-blue   { --sec1:#3b82f6; --sec2:#60a5fa; }
        .pr-section.s-violet { --sec1:#8b5cf6; --sec2:#c084fc; }
        .pr-section.s-green  { --sec1:#10b981; --sec2:#34d399; }
        .pr-section.s-amber  { --sec1:#f59e0b; --sec2:#fbbf24; }
        .pr-section.s-rose   { --sec1:#f43f5e; --sec2:#fb7185; }

        .pr-section-head {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 15px;
          padding-bottom: 12px;
          border-bottom: 1px dashed #e2e8f0;
        }
        .pr-section-icon {
          width: 36px; height: 36px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #fff;
          background: linear-gradient(135deg, var(--sec1), var(--sec2));
          box-shadow: 0 10px 20px -10px var(--sec1);
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .pr-section:hover .pr-section-icon { transform: rotate(-8deg) scale(1.08); }
        .pr-section-icon svg { width: 17px; height: 17px; }
        .pr-section-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .05em;
          text-transform: uppercase;
          color: #334155;
        }
        .pr-section-sub {
          font-size: 11.5px;
          color: var(--pr-soft);
          font-weight: 500;
          margin-top: 2px;
        }

        .pr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 13px;
        }
        .pr-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pr-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (max-width: 720px) {
          .pr-grid-3, .pr-grid-2 { grid-template-columns: 1fr; }
        }

        .pr-field { display: flex; flex-direction: column; gap: 6px; }
        .pr-label {
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: var(--pr-muted);
        }
        .pr-label .req { color: #e11d48; margin-left: 2px; }
        .pr-field .form-input,
        .pr-field .form-select,
        .pr-field .form-textarea {
          height: 42px;
          font-size: 13.5px;
          border-radius: 10px;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .pr-field .form-input:focus,
        .pr-field .form-select:focus,
        .pr-field .form-textarea:focus {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
        }
        .pr-field .form-textarea { height: auto; min-height: 80px; padding: 11px 12px; }

        .pr-hint {
          font-size: 11.5px;
          color: #6366f1;
          padding: 10px 13px;
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          border: 1px solid #c7d2fe;
          border-radius: 10px;
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 9px;
          font-weight: 600;
        }
        .pr-hint svg { flex-shrink: 0; }

        .pr-toggle {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          padding: 10px 14px;
          border: 1px solid var(--pr-border);
          border-radius: 11px;
          background: #fff;
          cursor: pointer;
          transition: all .2s ease;
          user-select: none;
        }
        .pr-toggle:hover { border-color: #c7d2fe; background: #fafaff; }
        .pr-toggle input { display: none; }
        .pr-toggle-box {
          width: 36px; height: 21px;
          border-radius: 999px;
          background: #cbd5e1;
          position: relative;
          transition: background .24s ease;
          flex-shrink: 0;
        }
        .pr-toggle-box::after {
          content: '';
          position: absolute;
          top: 2px; left: 2px;
          width: 17px; height: 17px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,.18);
          transition: transform .26s cubic-bezier(.2,.9,.3,1.2);
        }
        .pr-toggle input:checked ~ .pr-toggle-box {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
        }
        .pr-toggle input:checked ~ .pr-toggle-box::after { transform: translateX(15px); }
        .pr-toggle-label {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }

        /* Opening stock highlight */
        .pr-opening {
          background: linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%);
          border-color: #c7d2fe;
        }
        .pr-opening::before {
          background: linear-gradient(90deg, #8b5cf6, #6366f1, #06b6d4);
        }
        .pr-opening .pr-section-icon {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          box-shadow: 0 10px 22px -10px rgba(139,92,246,.9);
          animation: prFloat 3s ease-in-out infinite;
        }
        .pr-opening .pr-section-head { border-bottom-color: #c7d2fe; }
        .pr-opening .pr-section-title { color: #4338ca; }
        .pr-opening .pr-section-sub { color: #6366f1; }

        /* Pricing cards */
        .pr-price-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 11px;
        }
        .pr-price-card {
          position: relative;
          background: #fff;
          border: 1px solid var(--pr-border);
          border-radius: 12px;
          padding: 11px 13px;
          transition: all .22s cubic-bezier(.22,1,.36,1);
        }
        .pr-price-card:hover {
          border-color: #c7d2fe;
          transform: translateY(-2px);
          box-shadow: 0 10px 22px -16px rgba(99,102,241,.6);
        }
        .pr-price-card:focus-within {
          border-color: #a5b4fc;
          box-shadow: 0 0 0 3px rgba(99,102,241,.14);
          transform: translateY(-2px);
        }
        .pr-price-card .pr-label { color: #4f46e5; }
        .pr-price-card input {
          border: none !important;
          background: transparent !important;
          padding: 3px 0 !important;
          height: auto !important;
          font-size: 16px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
          outline: none !important;
          font-variant-numeric: tabular-nums;
          width: 100%;
        }
        .pr-price-card input::placeholder {
          color: #cbd5e1;
          font-weight: 600;
        }
        .pr-price-card.highlight {
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          border-color: #c7d2fe;
          box-shadow: 0 12px 26px -18px rgba(99,102,241,.7);
        }
        .pr-price-card.highlight .pr-label { color: #4338ca; }

        @media (prefers-reduced-motion: reduce) {
          .pr-root *, .pr-root *::before, .pr-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
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
        <button className="pr-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}>
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

      {/* Summary Strip */}
      {products.length > 0 && (
        <div className="pr-summary-grid">
          <div className="pr-summary-card c-indigo" style={{ animationDelay: '.02s' }}>
            <div className="pr-summary-head">
              <span className="pr-summary-label">Total Products</span>
              <span className="pr-summary-ico"><Package /></span>
            </div>
            <div className="pr-summary-value">{formatNumber(products.length)}</div>
            <div className="pr-summary-lite">Active in catalog</div>
          </div>
          <div className="pr-summary-card c-emerald" style={{ animationDelay: '.06s' }}>
            <div className="pr-summary-head">
              <span className="pr-summary-label">Stock Value</span>
              <span className="pr-summary-ico"><DollarSign /></span>
            </div>
            <div className="pr-summary-value">{formatCurrency(summary.totalValue)}</div>
            <div className="pr-summary-lite">At cost price</div>
          </div>
          <div className="pr-summary-card c-amber" style={{ animationDelay: '.10s' }}>
            <div className="pr-summary-head">
              <span className="pr-summary-label">Low Stock</span>
              <span className="pr-summary-ico"><Layers /></span>
            </div>
            <div className="pr-summary-value">{formatNumber(summary.lowCount)}</div>
            <div className="pr-summary-lite">Needs restocking soon</div>
          </div>
          <div className="pr-summary-card c-rose" style={{ animationDelay: '.14s' }}>
            <div className="pr-summary-head">
              <span className="pr-summary-label">Out of Stock</span>
              <span className="pr-summary-ico"><Ruler /></span>
            </div>
            <div className="pr-summary-value">{formatNumber(summary.outCount)}</div>
            <div className="pr-summary-lite">Unavailable items</div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="pr-panel">
          <EmptyState
            title="No products found"
            message="Add your first product to get started"
            action={<button className="pr-add-btn" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Product</button>}
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
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p, idx) => {
                const invType = p.category?.inventory_type ?? 'piece'
                const stockDisplay = invType === 'slab' ? `${formatNumber(p.stock_count)} slabs / ${formatNumber(p.stock_sqft)} Sq.Ft` : invType === 'box' ? `${formatNumber(p.stock_count)} boxes` : `${formatNumber(p.stock_count)} pcs`
                return (
                  <tr key={p.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td>
                      <div className="pr-prod-cell">
                        <div className="pr-prod-avatar">{p.name.charAt(0).toUpperCase()}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="pr-prod-name">{p.name}</div>
                          <div className="pr-prod-sku">
                            {p.sku ? (<><Hash size={11} /> {p.sku}</>) : '—'}
                          </div>
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
        <div className="pr-section s-indigo">
          <div className="pr-section-head">
            <div className="pr-section-icon"><Package /></div>
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
        <div className="pr-section s-blue">
          <div className="pr-section-head">
            <div className="pr-section-icon"><Layers /></div>
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
        <div className="pr-section s-violet">
          <div className="pr-section-head">
            <div className="pr-section-icon"><Ruler /></div>
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
          <div className="pr-grid pr-grid-3" style={{ marginTop: 13 }}>
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
        <div className="pr-section s-green">
          <div className="pr-section-head">
            <div className="pr-section-icon"><DollarSign /></div>
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
          <div className="pr-grid pr-grid-2" style={{ marginTop: 13 }}>
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
              <div className="pr-section-icon"><Sparkles /></div>
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
        <div className="pr-section s-amber">
          <div className="pr-section-head">
            <div className="pr-section-icon"><MapPin /></div>
            <div>
              <div className="pr-section-title">Storage &amp; Supplier</div>
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
        <div className="pr-section s-rose">
          <div className="pr-section-head">
            <div className="pr-section-icon"><Info /></div>
            <div>
              <div className="pr-section-title">Additional Details</div>
              <div className="pr-section-sub">Description and availability</div>
            </div>
          </div>
          <div className="pr-field" style={{ marginBottom: 13 }}>
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
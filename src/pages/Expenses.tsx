import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Expense, ExpenseCategory } from '../lib/types'
import {
  Plus, Search, Edit2, Trash2, Wallet, X,
  TrendingDown, Calendar, Tag, Receipt, IndianRupee,
  Banknote, CreditCard, Smartphone, Building2, FileText,
} from 'lucide-react'

export function Expenses() {
  const toast = useToast()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [expRes, catRes] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
    ])
    setExpenses((expRes.data ?? []) as Expense[])
    setCategories((catRes.data ?? []) as ExpenseCategory[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const matchSearch = !search || (e.description ?? '').toLowerCase().includes(search.toLowerCase()) || (e.category_name ?? '').toLowerCase().includes(search.toLowerCase())
      const matchCat = !categoryFilter || e.category_id === categoryFilter
      return matchSearch && matchCat
    })
  }, [expenses, search, categoryFilter])

  const visibleExpenses = filtered.slice((page - 1) * pageSize, page * pageSize)

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered])

  // Derived stats — no logic change
  const stats = useMemo(() => {
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = expenses
      .filter((e) => (e.expense_date ?? '').startsWith(monthPrefix))
      .reduce((s, e) => s + Number(e.amount || 0), 0)

    const byCategory = new Map<string, number>()
    expenses.forEach((e) => {
      const name = e.category_name ?? 'Uncategorized'
      byCategory.set(name, (byCategory.get(name) ?? 0) + Number(e.amount || 0))
    })
    let topCategory = '—'
    let topAmount = 0
    byCategory.forEach((amt, name) => {
      if (amt > topAmount) { topAmount = amt; topCategory = name }
    })

    return { thisMonth, topCategory, topAmount, count: expenses.length }
  }, [expenses])

  const handleSave = async (data: Partial<Expense>) => {
    if (editing) {
      const { error } = await supabase.from('expenses').update(data).eq('id', editing.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Expense updated')
    } else {
      const { error } = await supabase.from('expenses').insert(data)
      if (error) { toast(`Error: ${error.message}`, 'error'); return }
      toast('Expense created')
    }
    setModalOpen(false)
    setEditing(null)
    fetchData()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('expenses').delete().eq('id', deleteId)
    if (error) { toast(`Error: ${error.message}`, 'error'); return }
    toast('Expense deleted')
    setDeleteId(null)
    fetchData()
  }

  if (loading) return <Loading label="Loading expenses..." />

  return (
    <div className="ex-root">
      <style>{`
        .ex-root {
          --ex-card: #ffffff;
          --ex-border: #e6ebf2;
          --ex-text: #0f172a;
          --ex-muted: #64748b;
          --ex-soft: #94a3b8;
          display: grid;
          gap: 18px;
          animation: exFade .38s ease both;
        }
        @keyframes exFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes exRise { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes exRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes exShine { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(240%) skewX(-18deg); } }
        @keyframes exPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,.4); }
          50%      { box-shadow: 0 0 0 10px rgba(244,63,94,0); }
        }

        /* ═══ Header ═══ */
        .ex-header {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          padding: 22px 24px;
          border-radius: 20px;
          background:
            radial-gradient(circle at 12% 20%, rgba(244,63,94,.16), transparent 42%),
            radial-gradient(circle at 88% 80%, rgba(245,158,11,.16), transparent 46%),
            linear-gradient(135deg, #ffffff, #fff7f7);
          border: 1px solid #ffe0e0;
          box-shadow: 0 20px 40px -32px rgba(15,23,42,.35);
          overflow: hidden;
        }
        .ex-header::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #f43f5e, #fb7185, #fbbf24, #f59e0b);
        }
        .ex-header h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(92deg, #0f172a 0%, #e11d48 55%, #f59e0b 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .ex-header-sub {
          margin-top: 6px;
          font-size: 13.5px;
          color: var(--ex-muted);
          font-weight: 500;
        }
        .ex-header-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 8px;
          padding: 3px 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffe4e6, #fee2e2);
          color: #be123c;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        /* Add button */
        .ex-add {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 20px;
          border-radius: 12px;
          background: linear-gradient(115deg, #e11d48, #f59e0b);
          border: none;
          color: #fff;
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: .01em;
          cursor: pointer;
          overflow: hidden;
          isolation: isolate;
          box-shadow: 0 14px 28px -14px rgba(225,29,72,.85);
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .24s ease;
        }
        .ex-add::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,.32) 50%, transparent 68%);
          transform: translateX(-140%);
          z-index: -1;
        }
        .ex-add:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 34px -14px rgba(225,29,72,.95);
        }
        .ex-add:hover::after { animation: exShine .9s ease; }
        .ex-add:active { transform: scale(.96); }

        /* ═══ Stat cards ═══ */
        .ex-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 14px;
        }
        .ex-stat {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--ex-card);
          border: 1px solid var(--ex-border);
          border-radius: 16px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          animation: exRise .5s cubic-bezier(.22,1,.36,1) both;
          transition: transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s ease, border-color .26s ease;
        }
        .ex-stat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--ec1), var(--ec2));
        }
        .ex-stat::after {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 140px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--ec1) 0%, transparent 68%);
          opacity: .12;
          z-index: -1;
          transition: opacity .35s ease, transform .45s ease;
        }
        .ex-stat:hover {
          transform: translateY(-4px);
          border-color: transparent;
          box-shadow: 0 22px 34px -22px var(--ecs), 0 3px 10px -4px rgba(15,23,42,.06);
        }
        .ex-stat:hover::after { opacity: .22; transform: scale(1.18); }

        .ex-stat.c-rose    { --ec1:#f43f5e; --ec2:#fb7185; --ecs: rgba(244,63,94,.55); }
        .ex-stat.c-amber   { --ec1:#f59e0b; --ec2:#fbbf24; --ecs: rgba(245,158,11,.55); }
        .ex-stat.c-indigo  { --ec1:#6366f1; --ec2:#818cf8; --ecs: rgba(99,102,241,.55); }
        .ex-stat.c-slate   { --ec1:#64748b; --ec2:#94a3b8; --ecs: rgba(100,116,139,.55); }

        .ex-stat-ico {
          width: 46px; height: 46px;
          border-radius: 13px;
          display: grid; place-items: center;
          color: #fff;
          background: linear-gradient(135deg, var(--ec1), var(--ec2));
          box-shadow: 0 10px 20px -10px var(--ecs);
          flex-shrink: 0;
          transition: transform .34s cubic-bezier(.34,1.56,.64,1);
        }
        .ex-stat-ico svg { width: 20px; height: 20px; }
        .ex-stat:hover .ex-stat-ico { transform: scale(1.1) rotate(-8deg); }

        .ex-stat-body { min-width: 0; flex: 1; }
        .ex-stat-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: var(--ex-muted);
          margin-bottom: 4px;
        }
        .ex-stat-value {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -.02em;
          color: var(--ex-text);
          font-variant-numeric: tabular-nums;
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ex-stat.c-rose .ex-stat-value  { color: #be123c; }
        .ex-stat.c-amber .ex-stat-value { color: #b45309; }
        .ex-stat.c-indigo .ex-stat-value{ color: #4338ca; }
        .ex-stat-sub {
          font-size: 11.5px;
          color: var(--ex-soft);
          margin-top: 3px;
          font-weight: 600;
        }

        /* ═══ Filters ═══ */
        .ex-filters {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) 220px;
          gap: 12px;
          padding: 14px;
          background: linear-gradient(135deg, #ffffff, #fdf6f7);
          border: 1px solid var(--ex-border);
          border-radius: 16px;
          box-shadow: 0 12px 30px -24px rgba(15,23,42,.35);
          animation: exRise .45s cubic-bezier(.22,1,.36,1) .05s both;
        }
        @media (max-width: 720px) {
          .ex-filters { grid-template-columns: 1fr; }
        }
        .ex-search {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          height: 46px;
          border-radius: 12px;
          border: 1.5px solid var(--ex-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .ex-search:focus-within {
          border-color: #fda4af;
          box-shadow: 0 0 0 4px rgba(244,63,94,.12);
          transform: translateY(-1px);
        }
        .ex-search svg { color: #e11d48; flex-shrink: 0; }
        .ex-search input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          color: var(--ex-text);
          height: 100%;
        }
        .ex-search input::placeholder { color: #94a3b8; font-weight: 500; }
        .ex-clear {
          width: 26px; height: 26px;
          display: grid; place-items: center;
          border-radius: 8px;
          background: #f1f5f9;
          border: none;
          color: var(--ex-muted);
          cursor: pointer;
          transition: all .18s ease;
        }
        .ex-clear:hover { background: #fee2e2; color: #dc2626; transform: scale(1.08); }

        .ex-cat-select {
          position: relative;
          display: flex;
          align-items: center;
          height: 46px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1.5px solid var(--ex-border);
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .ex-cat-select:focus-within {
          border-color: #fda4af;
          box-shadow: 0 0 0 4px rgba(244,63,94,.12);
          transform: translateY(-1px);
        }
        .ex-cat-select svg { color: #e11d48; margin-right: 8px; flex-shrink: 0; }
        .ex-cat-select select {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          font-weight: 700;
          color: var(--ex-text);
          height: 100%;
          cursor: pointer;
          appearance: none;
        }
        .ex-cat-select::after {
          content: '';
          width: 8px; height: 8px;
          border-right: 2px solid #e11d48;
          border-bottom: 2px solid #e11d48;
          transform: rotate(45deg) translateY(-2px);
          margin-left: -8px;
          pointer-events: none;
        }

        /* ═══ Table panel ═══ */
        .ex-panel {
          background: var(--ex-card);
          border: 1px solid var(--ex-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 40px -32px rgba(15,23,42,.4);
          animation: exRise .5s cubic-bezier(.22,1,.36,1) .1s both;
          transition: box-shadow .26s ease, border-color .26s ease;
        }
        .ex-panel:hover {
          box-shadow: 0 24px 48px -30px rgba(15,23,42,.4);
          border-color: #f1d6d6;
        }
        .ex-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .ex-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--ex-soft);
          padding: 13px 18px;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
          border-bottom: 1px solid var(--ex-border);
          white-space: nowrap;
        }
        .ex-table tbody td {
          padding: 13px 18px;
          border-bottom: 1px solid #f1f5f9;
          color: var(--ex-text);
          vertical-align: middle;
        }
        .ex-table tbody tr:last-child td { border-bottom: none; }
        .ex-table tbody tr {
          animation: exRowIn .4s ease both;
          transition: background .16s ease, box-shadow .16s ease;
        }
        .ex-table tbody tr:hover {
          background: linear-gradient(90deg, #fef2f2, #ffffff);
          box-shadow: inset 3px 0 0 #f43f5e;
        }
        .ex-idx {
          font-size: 12px;
          font-weight: 700;
          color: var(--ex-soft);
          font-variant-numeric: tabular-nums;
        }
        .ex-amount {
          font-weight: 800;
          color: #be123c;
          font-variant-numeric: tabular-nums;
        }
        .ex-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .02em;
          white-space: nowrap;
        }
        .ex-badge.cat {
          background: linear-gradient(135deg, #eef2ff, #e0e7ff);
          color: #4338ca;
        }
        .ex-badge.pay {
          background: #f1f5f9;
          color: #475569;
          text-transform: capitalize;
        }
        .ex-badge svg { width: 11px; height: 11px; }
        .ex-actions { display: flex; gap: 6px; }
        .ex-act {
          width: 32px; height: 32px;
          display: grid; place-items: center;
          border-radius: 9px;
          background: #f8fafc;
          border: 1px solid var(--ex-border);
          color: var(--ex-muted);
          cursor: pointer;
          transition: all .2s cubic-bezier(.22,1,.36,1);
        }
        .ex-act:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px -8px rgba(79,70,229,.7);
        }
        .ex-act.danger:hover {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
          box-shadow: 0 8px 16px -8px rgba(244,63,94,.7);
        }
        .ex-act:active { transform: scale(.9); }

        /* ═══ Expense Form modal ═══ */
        .ex-form { display: flex; flex-direction: column; }

        .ex-live-preview {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 14px;
          background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
          border: 1px solid #fecdd3;
          margin-bottom: 18px;
          position: relative;
          overflow: hidden;
          animation: exRise .45s cubic-bezier(.22,1,.36,1) both;
        }
        .ex-live-preview::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #f43f5e, #fb7185, #fbbf24);
        }
        .ex-live-ico {
          width: 46px; height: 46px;
          border-radius: 14px;
          display: grid; place-items: center;
          flex-shrink: 0;
          color: #fff;
          background: linear-gradient(135deg, #e11d48, #f59e0b);
          box-shadow: 0 12px 24px -12px rgba(225,29,72,.9);
          animation: exPulse 2.4s ease-in-out infinite;
        }
        .ex-live-ico svg { width: 22px; height: 22px; }
        .ex-live-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: #be123c;
        }
        .ex-live-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -.02em;
          color: #be123c;
          font-variant-numeric: tabular-nums;
          line-height: 1.15;
          margin-top: 3px;
        }

        .ex-section-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ex-muted);
          margin: 18px 0 12px;
        }
        .ex-section-label::before {
          content: '';
          width: 4px; height: 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, #e11d48, #f59e0b);
        }
        .ex-section-label:first-child { margin-top: 0; }

        .ex-form .form-input,
        .ex-form .form-select,
        .ex-form .form-textarea {
          height: 42px;
          border-radius: 10px;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .ex-form .form-textarea { height: auto; min-height: 84px; padding: 11px 12px; }
        .ex-form .form-input:focus,
        .ex-form .form-select:focus,
        .ex-form .form-textarea:focus {
          border-color: #fda4af;
          box-shadow: 0 0 0 3px rgba(244,63,94,.13);
        }

        @media (prefers-reduced-motion: reduce) {
          .ex-root *, .ex-root *::before, .ex-root *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      {/* ═══ Header ═══ */}
      <div className="ex-header">
        <div>
          <h2>Expenses</h2>
          <div className="ex-header-sub">
            Track business expenses by category
            {stats.thisMonth > 0 && (
              <span className="ex-header-chip">
                {formatCurrency(stats.thisMonth)} this month
              </span>
            )}
          </div>
        </div>
        <button
          className="ex-add"
          onClick={() => { setEditing(null); setModalOpen(true) }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* ═══ Stat cards ═══ */}
      <div className="ex-stats">
        <div className="ex-stat c-rose" style={{ animationDelay: '.02s' }}>
          <div className="ex-stat-ico"><TrendingDown size={20} /></div>
          <div className="ex-stat-body">
            <div className="ex-stat-label">Total Expenses</div>
            <div className="ex-stat-value">{formatCurrency(totalAmount)}</div>
          </div>
        </div>
        <div className="ex-stat c-amber" style={{ animationDelay: '.06s' }}>
          <div className="ex-stat-ico"><Calendar size={20} /></div>
          <div className="ex-stat-body">
            <div className="ex-stat-label">This Month</div>
            <div className="ex-stat-value">{formatCurrency(stats.thisMonth)}</div>
          </div>
        </div>
        <div className="ex-stat c-indigo" style={{ animationDelay: '.10s' }}>
          <div className="ex-stat-ico"><Tag size={20} /></div>
          <div className="ex-stat-body">
            <div className="ex-stat-label">Top Category</div>
            <div className="ex-stat-value">{stats.topCategory}</div>
            {stats.topAmount > 0 && <div className="ex-stat-sub">{formatCurrency(stats.topAmount)}</div>}
          </div>
        </div>
        <div className="ex-stat c-slate" style={{ animationDelay: '.14s' }}>
          <div className="ex-stat-ico"><Receipt size={20} /></div>
          <div className="ex-stat-body">
            <div className="ex-stat-label">Entries</div>
            <div className="ex-stat-value">{filtered.length}</div>
            {filtered.length !== stats.count && <div className="ex-stat-sub">of {stats.count} total</div>}
          </div>
        </div>
      </div>

      {/* ═══ Filters ═══ */}
      <div className="ex-filters">
        <div className="ex-search">
          <Search size={17} />
          <input
            placeholder="Search by description or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="ex-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="ex-cat-select">
          <Tag size={16} />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ Table / Empty ═══ */}
      {filtered.length === 0 ? (
        <div className="ex-panel">
          <EmptyState
            icon={<Wallet />}
            title={expenses.length === 0 ? 'No expenses yet' : 'No matching expenses'}
            message={
              expenses.length === 0
                ? 'Start tracking your business expenses here'
                : 'Try changing the search or filter above'
            }
            action={
              expenses.length === 0 ? (
                <button className="ex-add" onClick={() => { setEditing(null); setModalOpen(true) }}>
                  <Plus size={16} /> Add Expense
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="ex-panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="ex-table">
              <thead>
                <tr>
                  <th style={{ width: 42 }}>#</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Method</th>
                  <th className="rp-text-right" style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((e, idx) => (
                  <tr key={e.id} style={{ animationDelay: `${Math.min(idx, 12) * 0.02}s` }}>
                    <td className="ex-idx">{(page - 1) * pageSize + idx + 1}</td>
                    <td>{formatDate(e.expense_date)}</td>
                    <td>
                      <span className="ex-badge cat">{e.category_name ?? 'Uncategorized'}</span>
                    </td>
                    <td>{e.description ?? '-'}</td>
                    <td>
                      <span className="ex-badge pay">
                        {paymentIcon(e.payment_method)}
                        {e.payment_method}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="ex-amount">
                      {formatCurrency(e.amount)}
                    </td>
                    <td>
                      <div className="ex-actions">
                        <button
                          className="ex-act"
                          onClick={() => { setEditing(e); setModalOpen(true) }}
                          title="Edit expense"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="ex-act danger"
                          onClick={() => setDeleteId(e.id)}
                          title="Delete expense"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {modalOpen && (
        <ExpenseForm
          expense={editing}
          categories={categories}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Expense"
        message="Are you sure?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

/* ───────────── Helpers ───────────── */
function paymentIcon(method: string) {
  const m = (method ?? '').toLowerCase()
  const size = 11
  if (m === 'cash') return <Banknote size={size} />
  if (m === 'card') return <CreditCard size={size} />
  if (m === 'upi') return <Smartphone size={size} />
  if (m === 'bank_transfer') return <Building2 size={size} />
  if (m === 'cheque') return <FileText size={size} />
  return <IndianRupee size={size} />
}

/* ───────────── Expense form modal ───────────── */
function ExpenseForm({
  expense,
  categories,
  onClose,
  onSave,
}: {
  expense: Expense | null
  categories: ExpenseCategory[]
  onClose: () => void
  onSave: (data: Partial<Expense>) => void
}) {
  const [form, setForm] = useState({
    expense_date: expense?.expense_date ?? new Date().toISOString().split('T')[0],
    category_id: expense?.category_id ?? '',
    amount: expense?.amount ?? '',
    payment_method: expense?.payment_method ?? 'cash',
    description: expense?.description ?? '',
    reference: expense?.reference ?? '',
    remarks: expense?.remarks ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.amount) return
    const cat = categories.find((c) => c.id === form.category_id)
    onSave({
      expense_date: form.expense_date,
      category_id: form.category_id || null,
      category_name: cat?.name ?? null,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      description: form.description || null,
      reference: form.reference || null,
      remarks: form.remarks || null,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit Expense' : 'Add Expense'}
      size="md"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {expense ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="ex-form">
        {/* Live amount preview */}
        {form.amount && Number(form.amount) > 0 && (
          <div className="ex-live-preview">
            <div className="ex-live-ico">
              <TrendingDown />
            </div>
            <div>
              <div className="ex-live-label">Expense Amount</div>
              <div className="ex-live-value">{formatCurrency(Number(form.amount))}</div>
            </div>
          </div>
        )}

        <div className="ex-section-label">Basic Information</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              className="form-input"
              type="date"
              value={form.expense_date}
              onChange={(e) => set('expense_date', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={form.category_id}
              onChange={(e) => set('category_id', e.target.value)}
            >
              <option value="">Select Category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="ex-section-label">Payment</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Amount <span className="req">*</span></label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Payment Method</label>
            <select
              className="form-select"
              value={form.payment_method}
              onChange={(e) => set('payment_method', e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="ex-section-label">Additional Details</div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input
            className="form-input"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Short description of the expense"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Reference</label>
          <input
            className="form-input"
            value={form.reference}
            onChange={(e) => set('reference', e.target.value)}
            placeholder="Bill / voucher number"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea
            className="form-textarea"
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
          />
        </div>
      </form>
    </Modal>
  )
}
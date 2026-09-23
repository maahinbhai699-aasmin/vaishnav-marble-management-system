import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
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
    <div>
      {/* ───────────── Header ───────────── */}
      <div className="page-header">
        <div>
          <h2>Expenses</h2>
          <div className="page-sub">Track business expenses by category</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true) }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* ───────────── Stat cards ───────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard
          icon={<TrendingDown size={18} />}
          label="Total Expenses"
          value={formatCurrency(totalAmount)}
          tone="error"
        />
        <StatCard
          icon={<Calendar size={18} />}
          label="This Month"
          value={formatCurrency(stats.thisMonth)}
          tone="warning"
        />
        <StatCard
          icon={<Tag size={18} />}
          label="Top Category"
          value={stats.topCategory}
          sub={stats.topAmount > 0 ? formatCurrency(stats.topAmount) : undefined}
          tone="primary"
        />
        <StatCard
          icon={<Receipt size={18} />}
          label="Entries"
          value={filtered.length}
          sub={filtered.length !== stats.count ? `of ${stats.count} total` : undefined}
          tone="neutral"
        />
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
            placeholder="Search by description or category..."
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
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ minWidth: 180 }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ───────────── Table / Empty ───────────── */}
      {filtered.length === 0 ? (
        <div className="card">
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
                <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
                  <Plus size={16} /> Add Expense
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((e, idx) => (
                <tr key={e.id}>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td>{formatDate(e.expense_date)}</td>
                  <td>
                    <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                      {e.category_name ?? 'Uncategorized'}
                    </span>
                  </td>
                  <td>{e.description ?? '-'}</td>
                  <td>
                    <span
                      className="badge badge-neutral"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        textTransform: 'capitalize',
                      }}
                    >
                      {paymentIcon(e.payment_method)}
                      {e.payment_method}
                    </span>
                  </td>
                  <td
                    className="text-right font-semibold"
                    style={{ color: 'var(--error-600)' }}
                  >
                    {formatCurrency(e.amount)}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setEditing(e); setModalOpen(true) }}
                        title="Edit expense"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
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

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'primary',
}: {
  label: string
  value: ReactNode
  sub?: string
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: palette.color,
            lineHeight: 1.2,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
        {sub && (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
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
      <form onSubmit={handleSubmit}>
        {/* ── Live amount preview ── */}
        {form.amount && Number(form.amount) > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              background: '#fef2f2',
              borderRadius: 10,
              border: '1px dashed #fecaca',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--error-600, #dc2626)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TrendingDown size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                className="text-muted"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Expense Amount
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--error-600, #dc2626)', lineHeight: 1.2 }}>
                {formatCurrency(Number(form.amount))}
              </div>
            </div>
          </div>
        )}

        {/* ── Section: Basic Info ── */}
        {sectionLabel('Basic Information')}
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

        {/* ── Section: Payment ── */}
        <div style={{ marginTop: 16 }}>
          {sectionLabel('Payment')}
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
        </div>

        {/* ── Section: Additional Details ── */}
        <div style={{ marginTop: 16 }}>
          {sectionLabel('Additional Details')}
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
        </div>
      </form>
    </Modal>
  )
}
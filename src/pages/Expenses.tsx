import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { Loading, EmptyState, ConfirmDialog } from '../components/Feedback'
import { Pagination } from '../components/Pagination'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Expense, ExpenseCategory } from '../lib/types'
import { Plus, Search, Edit2, Trash2, Wallet } from 'lucide-react'

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
      <div className="page-header">
        <div>
          <h2>Expenses</h2>
          <div className="page-sub">Track business expenses by category</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Expense</button>
      </div>

      <div className="stat-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon error"><Wallet /></div>
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value">{formatCurrency(totalAmount)}</div>
          <div className="stat-sub">{filtered.length} entries</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-input">
          <Search />
          <input className="form-input" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Wallet />} title="No expenses found" message="Track your business expenses here" action={<button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={16} /> Add Expense</button>} /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th className="text-right">Amount</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visibleExpenses.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.expense_date)}</td>
                  <td><span className="badge badge-neutral">{e.category_name ?? '-'}</span></td>
                  <td>{e.description ?? '-'}</td>
                  <td><span className="badge badge-neutral">{e.payment_method}</span></td>
                  <td className="text-right font-semibold" style={{ color: 'var(--error-600)' }}>{formatCurrency(e.amount)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(e); setModalOpen(true) }}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(e.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {modalOpen && <ExpenseForm expense={editing} categories={categories} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} />}
      <ConfirmDialog open={!!deleteId} title="Delete Expense" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel="Delete" danger />
    </div>
  )
}

function ExpenseForm({ expense, categories, onClose, onSave }: { expense: Expense | null; categories: ExpenseCategory[]; onClose: () => void; onSave: (data: Partial<Expense>) => void }) {
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
    <Modal open onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'} size="md"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit}>{expense ? 'Update' : 'Create'}</button></>}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Select Category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Amount <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Payment Method</label>
            <select className="form-select" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Reference</label>
          <input className="form-input" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea className="form-textarea" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}

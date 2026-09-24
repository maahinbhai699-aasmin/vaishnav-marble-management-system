import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="pagination" aria-label="Pagination">
      <span className="pagination-summary">Showing {start}-{end} of {total}</span>
      <div className="pagination-controls">
        <button className="btn btn-secondary btn-sm" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button>
        <span className="pagination-page">Page {page} of {totalPages}</span>
        <button className="btn btn-secondary btn-sm" aria-label="Next page" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button>
      </div>
    </div>
  )
}

// Global enhancement for shared list pagination styling
const paginationStyles = `
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96));
    border-bottom-left-radius: 12px;
    border-bottom-right-radius: 12px;
  }
  .pagination-summary, .pagination-page {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pagination .btn {
    border-radius: 10px;
    min-height: 34px;
    padding: 6px 10px;
    background: white;
    border: 1px solid var(--border);
    color: var(--text-heading);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
  }
  .pagination .btn:hover:not(:disabled) {
    background: var(--primary-50);
    border-color: var(--primary-200);
    color: var(--primary-700);
  }
`

if (typeof document !== 'undefined') {
  const existing = document.getElementById('copilot-pagination-style')
  if (!existing) {
    const style = document.createElement('style')
    style.id = 'copilot-pagination-style'
    style.textContent = paginationStyles
    document.head.appendChild(style)
  }
}

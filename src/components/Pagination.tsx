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

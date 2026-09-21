import { type ReactNode } from 'react'
import { Loader2, Inbox } from 'lucide-react'

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loading">
      <Loader2 size={32} className="spinner" style={{ borderWidth: 0 }} />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ?? <Inbox />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  danger = false,
}: {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

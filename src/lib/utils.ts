import { supabase } from './supabase'
import type { InventoryType } from './types'

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '₹0'
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateInput(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return formatDateInput(new Date().toISOString())
}

export function calcSqft(length: number, width: number): number {
  return Math.round((length * width) * 100) / 100
}

export function getInventoryType(categoryName?: string): InventoryType {
  const normalized = (categoryName ?? '').trim().toLowerCase()

  if (!normalized) return 'piece'

  if (
    normalized.includes('marble') ||
    normalized.includes('granite') ||
    normalized.includes('slab')
  ) return 'slab'

  if (
    normalized.includes('tile') ||
    normalized.includes('ceramic') ||
    normalized.includes('porcelain') ||
    normalized.includes('vitrified') ||
    normalized.includes('box')
  ) return 'box'

  return 'piece'
}

export function getDefaultUnitForCategory(categoryName?: string): string {
  const type = getInventoryType(categoryName)
  if (type === 'slab') return 'Sq.Ft'
  if (type === 'box') return 'Box'
  return 'Piece'
}

export function getInventoryStockCount(product: {
  stock_count?: number | null
  stock_sqft?: number | null
  category?: { inventory_type?: string | null; name?: string | null } | null
}): number {
  const invType = product.category?.inventory_type ?? getInventoryType(product.category?.name ?? '')
  if (invType === 'slab' || invType === 'box') {
    return Number(product.stock_count ?? 0)
  }
  return Number(product.stock_count ?? 0)
}

export function getInventoryStockArea(product: {
  stock_count?: number | null
  stock_sqft?: number | null
  category?: { inventory_type?: string | null; name?: string | null } | null
}): number {
  const invType = product.category?.inventory_type ?? getInventoryType(product.category?.name ?? '')
  if (invType === 'slab' || invType === 'box') {
    return Number(product.stock_sqft ?? 0)
  }
  return 0
}

export function getInventoryStockValue(product: {
  stock_count?: number | null
  stock_sqft?: number | null
  category?: { inventory_type?: string | null; name?: string | null } | null
}, fallbackUnit?: string | null): number {
  const invType = product.category?.inventory_type ?? getInventoryType(product.category?.name ?? fallbackUnit ?? '')

  if (invType === 'slab' || invType === 'box') {
    return Number(product.stock_sqft ?? 0)
  }

  return Number(product.stock_count ?? 0)
}

export function getInventoryMetricLabel(categoryName?: string): string {
  const type = getInventoryType(categoryName)
  if (type === 'slab') return 'Sq.Ft'
  if (type === 'box') return 'Box / Sq.Ft'
  return 'Pieces'
}

export function paymentStatusColor(status: string): string {
  switch (status) {
    case 'paid': return 'badge-success'
    case 'partial': return 'badge-warning'
    case 'unpaid': return 'badge-danger'
    default: return 'badge-neutral'
  }
}

export function slabStatusColor(status: string): string {
  switch (status) {
    case 'available': return 'badge-success'
    case 'reserved': return 'badge-info'
    case 'partially_sold': return 'badge-warning'
    case 'sold': return 'badge-neutral'
    case 'damaged': return 'badge-danger'
    default: return 'badge-neutral'
  }
}

export function stockStatus(product: { stock_count: number; stock_sqft: number; min_stock_level: number; category?: { inventory_type: string } | null }): string {
  const invType = product.category?.inventory_type
  const stock = invType === 'slab' || invType === 'box' ? product.stock_sqft : product.stock_count
  if (stock <= 0) return 'out_of_stock'
  if (product.min_stock_level > 0 && stock <= product.min_stock_level) return 'low_stock'
  return 'in_stock'
}

export function stockStatusLabel(status: string): string {
  switch (status) {
    case 'in_stock': return 'In Stock'
    case 'low_stock': return 'Low Stock'
    case 'out_of_stock': return 'Out of Stock'
    default: return status
  }
}

export function stockStatusColor(status: string): string {
  switch (status) {
    case 'in_stock': return 'badge-success'
    case 'low_stock': return 'badge-warning'
    case 'out_of_stock': return 'badge-danger'
    default: return 'badge-neutral'
  }
}

export function generateInvoiceNumber(prefix: string, count: number): string {
  const year = new Date().getFullYear()
  const num = String(count + 1).padStart(4, '0')
  return `${prefix}${year}${num}`
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export async function fetchCount(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

// Generate next invoice number by querying existing count
export async function nextInvoiceNumber(prefix: string): Promise<string> {
  const { count } = await supabase
    .from(prefix === 'INV' ? 'sales' : prefix === 'PUR' ? 'purchases' : prefix === 'QUO' ? 'quotations' : prefix === 'TRF' ? 'stock_transfers' : prefix === 'SR' ? 'sales_returns' : prefix === 'PR' ? 'purchase_returns' : 'sales')
    .select('*', { count: 'exact', head: true })
  return generateInvoiceNumber(prefix, count ?? 0)
}

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type { Category, Subcategory, Location, Unit, Supplier, Customer, Product, Settings, ExpenseCategory, Slab } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any

export function useSupabaseQuery<T>(
  table: string,
  query?: (q: AnyQuery) => AnyQuery,
  deps?: unknown[]
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: AnyQuery = supabase.from(table).select('*')
    if (query) q = query(q)
    const { data: result, error } = await q
    if (error) setError(error.message)
    else setData((result ?? []) as T[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useCategories() {
  return useSupabaseQuery<Category>('categories', (q) => q.order('display_order'))
}

export function useSubcategories() {
  return useSupabaseQuery<Subcategory>('subcategories', (q) => q.order('name'))
}

export function useLocations() {
  return useSupabaseQuery<Location>('locations', (q) => q.order('name'))
}

export function useUnits() {
  return useSupabaseQuery<Unit>('units', (q) => q.order('name'))
}

export function useSuppliers() {
  return useSupabaseQuery<Supplier>('suppliers', (q) => q.order('name'))
}

export function useCustomers() {
  return useSupabaseQuery<Customer>('customers', (q) => q.order('name'))
}

export function useProducts() {
  return useSupabaseQuery<Product>(
    'products',
    (q) => q.select('*, category:categories(*), subcategory:subcategories(*), supplier:suppliers(*), location:locations(*)').order('name'),
    []
  )
}

export function useExpenseCategories() {
  return useSupabaseQuery<ExpenseCategory>('expense_categories', (q) => q.order('name'))
}

export function useSettings(): { data: Settings | null; loading: boolean; refetch: () => void } {
  const { data, loading, refetch } = useSupabaseQuery<Settings>('settings')
  return { data: data[0] ?? null, loading, refetch }
}

export function useProductsByCategory(categoryId?: string) {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!categoryId) { setData([]); setLoading(false); return }
    setLoading(true)
    const { data: result } = await supabase
      .from('products')
      .select('*, category:categories(*), subcategory:subcategories(*), supplier:suppliers(*), location:locations(*)')
      .eq('category_id', categoryId)
      .order('name')
    setData(result ?? [])
    setLoading(false)
  }, [categoryId])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, refetch: fetch }
}

export function useSlabsByProduct(productId?: string) {
  const [data, setData] = useState<Slab[]>([])
  const [loading, setLoading] = useState(true)
  const fetch = useCallback(async () => {
    if (!productId) { setData([]); setLoading(false); return }
    setLoading(true)
    const { data: result } = await supabase
      .from('slabs')
      .select('*, product:products(*), location:locations(*), supplier:suppliers(*)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
    setData(result ?? [])
    setLoading(false)
  }, [productId])
  useEffect(() => { fetch() }, [fetch])
  return { data, loading, refetch: fetch }
}

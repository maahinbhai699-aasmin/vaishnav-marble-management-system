import { supabase } from './supabase'
import type { Product, Slab } from './types'
import { calcSqft } from './utils'

export interface StockMovementInput {
  product_id: string | null
  category_id?: string | null
  subcategory_id?: string | null
  slab_id?: string | null
  transaction_type: 'opening' | 'purchase' | 'sale' | 'customer_return' | 'supplier_return' | 'damage' | 'wastage' | 'transfer_in' | 'transfer_out' | 'adjustment_increase' | 'adjustment_decrease' | 'reserved' | 'reserve_release'
  reference_number?: string
  reference_id?: string
  stock_in_count?: number
  stock_out_count?: number
  stock_in_sqft?: number
  stock_out_sqft?: number
  unit?: string
  cost_price?: number
  selling_price?: number
  location_id?: string | null
  user_name?: string
  remarks?: string
}

export async function recordStockMovement(input: StockMovementInput): Promise<void> {
  let balance_count = 0
  let balance_sqft = 0
  let inventory_type: 'slab' | 'box' | 'piece' = 'piece'

  if (input.product_id) {
    const { data: prod } = await supabase
      .from('products')
      .select('stock_count, stock_sqft, category:categories(inventory_type)')
      .eq('id', input.product_id)
      .maybeSingle()
    if (prod) {
      balance_count = Number(prod.stock_count)
      balance_sqft = Number(prod.stock_sqft)
      const type = (prod as { category?: { inventory_type?: string } } | null)?.category?.inventory_type ?? 'piece'
      inventory_type = type === 'slab' ? 'slab' : type === 'box' ? 'box' : 'piece'
    }
  }

  const in_count = input.stock_in_count ?? 0
  const out_count = input.stock_out_count ?? 0
  const in_sqft = input.stock_in_sqft ?? 0
  const out_sqft = input.stock_out_sqft ?? 0

  const new_balance_count = balance_count + in_count - out_count
  const new_balance_sqft = inventory_type === 'piece' ? 0 : balance_sqft + in_sqft - out_sqft

  await supabase.from('stock_movements').insert({
    product_id: input.product_id,
    category_id: input.category_id ?? null,
    subcategory_id: input.subcategory_id ?? null,
    slab_id: input.slab_id ?? null,
    transaction_type: input.transaction_type,
    reference_number: input.reference_number ?? null,
    reference_id: input.reference_id ?? null,
    stock_in_count: in_count,
    stock_out_count: out_count,
    stock_in_sqft: in_sqft,
    stock_out_sqft: out_sqft,
    balance_count: new_balance_count,
    balance_sqft: new_balance_sqft,
    unit: input.unit ?? null,
    cost_price: input.cost_price ?? 0,
    selling_price: input.selling_price ?? 0,
    location_id: input.location_id ?? null,
    user_name: input.user_name ?? null,
    remarks: input.remarks ?? null,
  })

  // Update product stock using category-specific logic
  if (input.product_id) {
    await supabase
      .from('products')
      .update({
        stock_count: new_balance_count,
        stock_sqft: inventory_type === 'piece' ? 0 : new_balance_sqft,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.product_id)
  }
}

export async function recordDamage(
  product: Product,
  quantity: number,
  sqft: number,
  reason: string,
  locationId?: string | null,
  slabId?: string | null,
): Promise<void> {
  await recordStockMovement({
    product_id: product.id,
    category_id: product.category_id,
    slab_id: slabId ?? null,
    transaction_type: 'damage',
    stock_out_count: quantity,
    stock_out_sqft: sqft,
    unit: product.selling_unit ?? 'Piece',
    cost_price: product.cost_price,
    remarks: reason,
    location_id: locationId ?? product.location_id,
  })

  // Update product damaged counters
  await supabase
    .from('products')
    .update({
      damaged_count: Number(product.damaged_count) + quantity,
      damaged_sqft: Number(product.damaged_sqft) + sqft,
    })
    .eq('id', product.id)

  // Update slab status if applicable
  if (slabId) {
    await supabase
      .from('slabs')
      .update({ status: 'damaged' })
      .eq('id', slabId)
  }
}

export async function createSlabFromPurchase(
  product: Product,
  slabNumber: string,
  length: number,
  width: number,
  thickness: number,
  purchaseRate: number,
  sellingRate: number,
  batchNumber?: string,
  locationId?: string | null,
  supplierId?: string | null,
  purchaseRef?: string,
): Promise<Slab | null> {
  const totalSqft = calcSqft(length, width)
  const { data, error } = await supabase
    .from('slabs')
    .insert({
      slab_number: slabNumber,
      product_id: product.id,
      category_id: product.category_id,
      batch_number: batchNumber ?? null,
      length,
      width,
      thickness,
      total_sqft: totalSqft,
      remaining_sqft: totalSqft,
      purchase_rate: purchaseRate,
      selling_rate: sellingRate,
      location_id: locationId ?? product.location_id,
      supplier_id: supplierId ?? product.supplier_id,
      purchase_reference: purchaseRef ?? null,
      status: 'available',
    })
    .select('*')
    .maybeSingle()

  if (error) return null
  return data as Slab
}

export async function sellSlabFull(slab: Slab, saleId: string, invoiceNumber: string): Promise<void> {
  // Mark slab as sold
  await supabase
    .from('slabs')
    .update({
      status: 'sold',
      sold_sqft: slab.total_sqft,
      remaining_sqft: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slab.id)

  // Record stock movement - full slab out
  await recordStockMovement({
    product_id: slab.product_id,
    slab_id: slab.id,
    transaction_type: 'sale',
    reference_number: invoiceNumber,
    reference_id: saleId,
    stock_out_count: 1,
    stock_out_sqft: slab.total_sqft,
    unit: 'Slab',
    cost_price: slab.purchase_rate,
    selling_price: slab.selling_rate,
    remarks: `Full slab sale: ${slab.slab_number}`,
  })
}

export async function sellSlabPartial(slab: Slab, sellSqft: number, saleId: string, invoiceNumber: string): Promise<void> {
  const newSoldSqft = Number(slab.sold_sqft) + sellSqft
  const newRemainingSqft = Number(slab.remaining_sqft) - sellSqft
  const newStatus = newRemainingSqft <= 0 ? 'sold' : 'partially_sold'

  await supabase
    .from('slabs')
    .update({
      sold_sqft: newSoldSqft,
      remaining_sqft: newRemainingSqft,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slab.id)

  // Stock movement - only sqft out, slab count unchanged unless fully sold
  const slabCountOut = newStatus === 'sold' ? 1 : 0
  await recordStockMovement({
    product_id: slab.product_id,
    slab_id: slab.id,
    transaction_type: 'sale',
    reference_number: invoiceNumber,
    reference_id: saleId,
    stock_out_count: slabCountOut,
    stock_out_sqft: sellSqft,
    unit: 'Sq.Ft',
    cost_price: slab.purchase_rate * (sellSqft / slab.total_sqft),
    selling_price: slab.selling_rate,
    remarks: `Partial slab sale: ${slab.slab_number} (${sellSqft} Sq.Ft)`,
  })
}

export async function returnSlabStock(
  slab: Slab,
  returnSqft: number,
  isFullSlab: boolean,
  referenceId: string,
  referenceNumber: string,
): Promise<void> {
  const newSoldSqft = Math.max(0, Number(slab.sold_sqft) - returnSqft)
  const newRemainingSqft = Math.min(Number(slab.total_sqft), Number(slab.remaining_sqft) + returnSqft)
  let newStatus: Slab['status'] = 'available'
  if (newSoldSqft > 0) newStatus = 'partially_sold'

  await supabase
    .from('slabs')
    .update({
      sold_sqft: newSoldSqft,
      remaining_sqft: newRemainingSqft,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slab.id)

  await recordStockMovement({
    product_id: slab.product_id,
    slab_id: slab.id,
    transaction_type: 'customer_return',
    reference_number: referenceNumber,
    reference_id: referenceId,
    stock_in_count: isFullSlab ? 1 : 0,
    stock_in_sqft: returnSqft,
    unit: 'Sq.Ft',
    remarks: `Slab return: ${slab.slab_number}`,
  })
}

export async function transferSlabLocation(slab: Slab, toLocationId: string, _transferId: string, _transferNumber: string): Promise<void> {
  await supabase
    .from('slabs')
    .update({ location_id: toLocationId, updated_at: new Date().toISOString() })
    .eq('id', slab.id)
}

export async function updateCustomerTotals(customerId: string, purchaseAmount: number, paidAmount: number): Promise<void> {
  const { data: cust } = await supabase
    .from('customers')
    .select('total_purchase, total_paid, total_due')
    .eq('id', customerId)
    .maybeSingle()
  if (!cust) return

  await supabase
    .from('customers')
    .update({
      total_purchase: Number(cust.total_purchase) + purchaseAmount,
      total_paid: Number(cust.total_paid) + paidAmount,
      total_due: Number(cust.total_purchase) + purchaseAmount - Number(cust.total_paid) - paidAmount,
      last_purchase_date: new Date().toISOString(),
    })
    .eq('id', customerId)
}

export async function updateSupplierTotals(supplierId: string, purchaseAmount: number, paidAmount: number): Promise<void> {
  const { data: sup } = await supabase
    .from('suppliers')
    .select('total_purchase, total_paid, total_due')
    .eq('id', supplierId)
    .maybeSingle()
  if (!sup) return

  await supabase
    .from('suppliers')
    .update({
      total_purchase: Number(sup.total_purchase) + purchaseAmount,
      total_paid: Number(sup.total_paid) + paidAmount,
      total_due: Number(sup.total_purchase) + purchaseAmount - Number(sup.total_paid) - paidAmount,
    })
    .eq('id', supplierId)
}

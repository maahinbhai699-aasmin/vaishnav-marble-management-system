export type InventoryType = 'slab' | 'box' | 'piece' | 'mixed' | 'job'

export interface Category {
  id: string
  name: string
  inventory_type: InventoryType
  display_order: number
  created_at: string
}

export interface Subcategory {
  id: string
  category_id: string
  name: string
  created_at: string
}

export interface Location {
  id: string
  name: string
  address: string | null
  created_at: string
}

export interface Unit {
  id: string
  name: string
  type: 'area' | 'quantity' | 'box' | 'slab'
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  company_name: string | null
  mobile: string | null
  email: string | null
  address: string | null
  gst_number: string | null
  products_supplied: string | null
  total_purchase: number
  total_paid: number
  total_due: number
  created_at: string
}

export interface Customer {
  id: string
  name: string
  mobile: string | null
  address: string | null
  gst_number: string | null
  email: string | null
  customer_type: string
  total_purchase: number
  total_paid: number
  total_due: number
  last_purchase_date: string | null
  created_at: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  category_id: string | null
  subcategory_id: string | null
  brand: string | null
  origin: string | null
  model: string | null
  color: string | null
  finish: string | null
  material: string | null
  thickness: string | null
  size: string | null
  length: number | null
  width: number | null
  height: number | null
  selling_unit: string | null
  purchase_price: number
  cost_price: number
  retail_price: number
  wholesale_price: number
  dealer_price: number
  min_selling_price: number
  gst_rate: number
  min_stock_level: number
  supplier_id: string | null
  location_id: string | null
  rack_number: string | null
  image_url: string | null
  description: string | null
  is_active: boolean
  stock_count: number
  stock_sqft: number
  reserved_count: number
  reserved_sqft: number
  damaged_count: number
  damaged_sqft: number
  created_at: string
  updated_at: string
  category?: Category
  subcategory?: Subcategory
  supplier?: Supplier
  location?: Location
}

export interface Slab {
  id: string
  slab_number: string
  product_id: string
  category_id: string | null
  batch_number: string | null
  length: number
  width: number
  thickness: number | null
  total_sqft: number
  sold_sqft: number
  remaining_sqft: number
  purchase_rate: number
  selling_rate: number
  location_id: string | null
  rack_number: string | null
  status: 'available' | 'reserved' | 'partially_sold' | 'sold' | 'damaged'
  supplier_id: string | null
  purchase_reference: string | null
  created_at: string
  updated_at: string
  product?: Product
  location?: Location
  supplier?: Supplier
}

export interface Purchase {
  id: string
  invoice_number: string
  supplier_id: string | null
  purchase_date: string
  subtotal: number
  discount: number
  gst_amount: number
  transport_charge: number
  other_charge: number
  total_amount: number
  paid_amount: number
  due_amount: number
  payment_status: 'paid' | 'partial' | 'unpaid'
  notes: string | null
  created_at: string
  supplier?: Supplier
  purchase_items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string | null
  category_id: string | null
  slab_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  slab_count: number
  sqft: number
  purchase_rate: number
  gst_rate: number
  amount: number
  created_at: string
  product?: Product
}

export interface Sale {
  id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  sale_date: string
  subtotal: number
  cutting_charge: number
  polishing_charge: number
  loading_charge: number
  delivery_charge: number
  other_charge: number
  discount: number
  gst_amount: number
  grand_total: number
  paid_amount: number
  due_amount: number
  payment_method: string
  payment_status: 'paid' | 'partial' | 'unpaid'
  salesperson: string | null
  notes: string | null
  created_at: string
  customer?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string | null
  category_id: string | null
  slab_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  slab_count: number
  sqft: number
  rate: number
  gst_rate: number
  amount: number
  cost_amount: number
  gross_profit: number
  created_at: string
  product?: Product
}

export interface Payment {
  id: string
  customer_id: string | null
  sale_id: string | null
  amount: number
  payment_method: string
  transaction_number: string | null
  payment_date: string
  reference: string | null
  notes: string | null
  created_at: string
  customer?: Customer
  sale?: Sale
}

export interface SupplierPayment {
  id: string
  supplier_id: string | null
  purchase_id: string | null
  amount: number
  payment_method: string
  transaction_number: string | null
  payment_date: string
  reference: string | null
  notes: string | null
  created_at: string
  supplier?: Supplier
  purchase?: Purchase
}

export interface Quotation {
  id: string
  quotation_number: string
  customer_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  quotation_date: string
  valid_until: string | null
  subtotal: number
  discount: number
  gst_amount: number
  other_charge: number
  grand_total: number
  notes: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'
  created_at: string
  customer?: Customer
  quotation_items?: QuotationItem[]
}

export interface QuotationItem {
  id: string
  quotation_id: string
  product_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  sqft: number
  rate: number
  gst_rate: number
  amount: number
  created_at: string
  product?: Product
}

export interface StockMovement {
  id: string
  movement_date: string
  product_id: string | null
  category_id: string | null
  subcategory_id: string | null
  slab_id: string | null
  transaction_type: string
  reference_number: string | null
  reference_id: string | null
  stock_in_count: number
  stock_out_count: number
  stock_in_sqft: number
  stock_out_sqft: number
  balance_count: number
  balance_sqft: number
  unit: string | null
  cost_price: number
  selling_price: number
  location_id: string | null
  user_name: string | null
  remarks: string | null
  created_at: string
  product?: Product
  category?: Category
  location?: Location
}

export interface Expense {
  id: string
  expense_date: string
  category_id: string | null
  category_name: string | null
  amount: number
  payment_method: string
  description: string | null
  reference: string | null
  remarks: string | null
  created_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  created_at: string
}

export interface Settings {
  id: string
  business_name: string
  address: string | null
  phone: string | null
  gst_number: string | null
  email: string | null
  logo_url: string | null
  terms_conditions: string | null
  bank_name: string | null
  bank_account: string | null
  bank_ifsc: string | null
  upi_id: string | null
  created_at: string
  updated_at: string
}

export interface StockTransfer {
  id: string
  transfer_number: string
  from_location_id: string | null
  to_location_id: string | null
  transfer_date: string
  notes: string | null
  created_at: string
  from_location?: Location
  to_location?: Location
  stock_transfer_items?: StockTransferItem[]
}

export interface StockTransferItem {
  id: string
  transfer_id: string
  product_id: string | null
  slab_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  slab_count: number
  sqft: number
  created_at: string
  product?: Product
}

export interface SalesReturn {
  id: string
  return_number: string
  sale_id: string | null
  customer_id: string | null
  return_date: string
  total_amount: number
  reason: string | null
  notes: string | null
  created_at: string
  customer?: Customer
  sale?: Sale
  sales_return_items?: SalesReturnItem[]
}

export interface SalesReturnItem {
  id: string
  return_id: string
  product_id: string | null
  slab_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  sqft: number
  rate: number
  amount: number
  reason: string | null
  created_at: string
  product?: Product
}

export interface PurchaseReturn {
  id: string
  return_number: string
  purchase_id: string | null
  supplier_id: string | null
  return_date: string
  total_amount: number
  reason: string | null
  notes: string | null
  created_at: string
  supplier?: Supplier
  purchase?: Purchase
  purchase_return_items?: PurchaseReturnItem[]
}

export interface PurchaseReturnItem {
  id: string
  return_id: string
  product_id: string | null
  slab_id: string | null
  description: string | null
  unit: string | null
  quantity: number
  sqft: number
  rate: number
  amount: number
  reason: string | null
  created_at: string
  product?: Product
}

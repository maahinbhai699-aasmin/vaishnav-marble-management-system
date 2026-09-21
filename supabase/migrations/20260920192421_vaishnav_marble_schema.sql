/*
# Vaishnav Marble Shop - Complete Schema

Creates the full database for a Marble, Granite, Tiles, Sanitaryware, Kitchen Sink and Bathroom Vanity management system.

## Tables created:
1. categories, 2. subcategories, 3. locations, 4. units, 5. suppliers, 6. customers,
7. products (refs suppliers, categories, subcategories, locations),
8. product_units, 9. slabs (refs products, categories, locations, suppliers),
10. purchases + purchase_items, 11. sales + sale_items, 12. payments, 13. supplier_payments,
14. quotations + quotation_items, 15. sales_returns + items, 16. purchase_returns + items,
17. stock_transfers + items, 18. stock_movements (ledger), 19. expense_categories + expenses, 20. settings

## Security:
- Single-tenant app (no auth). All policies use TO anon, authenticated with USING (true).
- RLS enabled on every table.
*/

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  inventory_type text NOT NULL CHECK (inventory_type IN ('slab','box','piece')),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Subcategories
CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(category_id, name)
);

-- Locations
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Units
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('area','quantity','box','slab')),
  created_at timestamptz DEFAULT now()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  mobile text,
  email text,
  address text,
  gst_number text,
  products_supplied text,
  total_purchase numeric(14,2) DEFAULT 0,
  total_paid numeric(14,2) DEFAULT 0,
  total_due numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text,
  address text,
  gst_number text,
  email text,
  customer_type text DEFAULT 'retail' CHECK (customer_type IN ('retail','contractor','builder','interior_designer','dealer','wholesale')),
  total_purchase numeric(14,2) DEFAULT 0,
  total_paid numeric(14,2) DEFAULT 0,
  total_due numeric(14,2) DEFAULT 0,
  last_purchase_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE,
  barcode text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  brand text,
  origin text,
  model text,
  color text,
  finish text,
  material text,
  thickness text,
  size text,
  length numeric(12,2),
  width numeric(12,2),
  height numeric(12,2),
  selling_unit text,
  purchase_price numeric(14,2) DEFAULT 0,
  cost_price numeric(14,2) DEFAULT 0,
  retail_price numeric(14,2) DEFAULT 0,
  wholesale_price numeric(14,2) DEFAULT 0,
  dealer_price numeric(14,2) DEFAULT 0,
  min_selling_price numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 18,
  min_stock_level numeric(14,2) DEFAULT 0,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  rack_number text,
  image_url text,
  description text,
  is_active boolean DEFAULT true,
  stock_count numeric(14,2) DEFAULT 0,
  stock_sqft numeric(14,2) DEFAULT 0,
  reserved_count numeric(14,2) DEFAULT 0,
  reserved_sqft numeric(14,2) DEFAULT 0,
  damaged_count numeric(14,2) DEFAULT 0,
  damaged_sqft numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Product units
CREATE TABLE IF NOT EXISTS product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  conversion_factor numeric(14,4) DEFAULT 1,
  UNIQUE(product_id, unit_id)
);

-- Slabs
CREATE TABLE IF NOT EXISTS slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slab_number text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  batch_number text,
  length numeric(12,2) NOT NULL,
  width numeric(12,2) NOT NULL,
  thickness numeric(12,2),
  total_sqft numeric(14,2) NOT NULL,
  sold_sqft numeric(14,2) DEFAULT 0,
  remaining_sqft numeric(14,2) NOT NULL,
  purchase_rate numeric(14,2) DEFAULT 0,
  selling_rate numeric(14,2) DEFAULT 0,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  rack_number text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','partially_sold','sold','damaged')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  transport_charge numeric(14,2) DEFAULT 0,
  other_charge numeric(14,2) DEFAULT 0,
  total_amount numeric(14,2) DEFAULT 0,
  paid_amount numeric(14,2) DEFAULT 0,
  due_amount numeric(14,2) DEFAULT 0,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('paid','partial','unpaid')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  slab_count numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  purchase_rate numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_mobile text,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric(14,2) DEFAULT 0,
  cutting_charge numeric(14,2) DEFAULT 0,
  polishing_charge numeric(14,2) DEFAULT 0,
  loading_charge numeric(14,2) DEFAULT 0,
  delivery_charge numeric(14,2) DEFAULT 0,
  other_charge numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  paid_amount numeric(14,2) DEFAULT 0,
  due_amount numeric(14,2) DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque','other')),
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('paid','partial','unpaid')),
  salesperson text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  slab_count numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  rate numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  cost_amount numeric(14,2) DEFAULT 0,
  gross_profit numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Payments (customer)
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque','other')),
  transaction_number text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Supplier payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque','other')),
  transaction_number text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Quotations
CREATE TABLE IF NOT EXISTS quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_mobile text,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  subtotal numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  gst_amount numeric(14,2) DEFAULT 0,
  other_charge numeric(14,2) DEFAULT 0,
  grand_total numeric(14,2) DEFAULT 0,
  notes text,
  status text DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  rate numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Sales returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric(14,2) DEFAULT 0,
  reason text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  rate numeric(14,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Purchase returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric(14,2) DEFAULT 0,
  reason text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  rate numeric(14,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  from_location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  description text,
  unit text,
  quantity numeric(14,2) DEFAULT 0,
  slab_count numeric(14,2) DEFAULT 0,
  sqft numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Stock movements (ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date timestamptz DEFAULT now(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  slab_id uuid REFERENCES slabs(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('opening','purchase','sale','customer_return','supplier_return','damage','wastage','transfer_in','transfer_out','adjustment_increase','adjustment_decrease','reserved','reserve_release')),
  reference_number text,
  reference_id uuid,
  stock_in_count numeric(14,2) DEFAULT 0,
  stock_out_count numeric(14,2) DEFAULT 0,
  stock_in_sqft numeric(14,2) DEFAULT 0,
  stock_out_sqft numeric(14,2) DEFAULT 0,
  balance_count numeric(14,2) DEFAULT 0,
  balance_sqft numeric(14,2) DEFAULT 0,
  unit text,
  cost_price numeric(14,2) DEFAULT 0,
  selling_price numeric(14,2) DEFAULT 0,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  user_name text,
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Expense categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  category_name text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','upi','card','bank_transfer','cheque','other')),
  description text,
  reference text,
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL UNIQUE,
  address text,
  phone text,
  gst_number text,
  email text,
  logo_url text,
  terms_conditions text,
  bank_name text,
  bank_account text,
  bank_ifsc text,
  upi_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_slabs_product ON slabs(product_id);
CREATE INDEX IF NOT EXISTS idx_slabs_status ON slabs(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);

-- ===== RLS + Policies (single-tenant, no auth) =====

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'categories','subcategories','locations','units','suppliers','customers',
    'products','product_units','slabs','purchases','purchase_items','sales','sale_items',
    'payments','supplier_payments','quotations','quotation_items',
    'sales_returns','sales_return_items','purchase_returns','purchase_return_items',
    'stock_transfers','stock_transfer_items','stock_movements',
    'expense_categories','expenses','settings'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'categories','subcategories','locations','units','suppliers','customers',
    'products','product_units','slabs','purchases','purchase_items','sales','sale_items',
    'payments','supplier_payments','quotations','quotation_items',
    'sales_returns','sales_return_items','purchase_returns','purchase_return_items',
    'stock_transfers','stock_transfer_items','stock_movements',
    'expense_categories','expenses','settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true);', 'anon_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', 'anon_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', 'anon_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO anon, authenticated USING (true);', 'anon_delete_' || t, t);
  END LOOP;
END $$;

-- ===== Seed data =====

INSERT INTO categories (name, inventory_type, display_order) VALUES
  ('Marble','slab',1),('Granite','slab',2),('Tiles','box',3),
  ('Sanitaryware','piece',4),('Kitchen Sink','piece',5),('Bathroom Vanity','piece',6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO subcategories (category_id, name)
SELECT c.id, s.name FROM categories c
JOIN (VALUES
  ('Marble','Indian Marble'),('Marble','Imported Marble'),('Marble','White Marble'),('Marble','Beige Marble'),('Marble','Black Marble'),('Marble','Green Marble'),('Marble','Designer Marble'),('Marble','Onyx Marble'),('Marble','Other Marble'),
  ('Granite','Indian Granite'),('Granite','Imported Granite'),('Granite','Black Granite'),('Granite','White Granite'),('Granite','Red Granite'),('Granite','Green Granite'),('Granite','Grey Granite'),('Granite','Designer Granite'),('Granite','Other Granite'),
  ('Tiles','Floor Tiles'),('Tiles','Wall Tiles'),('Tiles','Bathroom Tiles'),('Tiles','Kitchen Tiles'),('Tiles','Outdoor Tiles'),('Tiles','Elevation Tiles'),('Tiles','Parking Tiles'),('Tiles','Designer Tiles'),('Tiles','Other Tiles'),
  ('Sanitaryware','Wall Hung WC'),('Sanitaryware','One Piece WC'),('Sanitaryware','Two Piece WC'),('Sanitaryware','Wash Basin'),('Sanitaryware','Counter Basin'),('Sanitaryware','Table Top Basin'),('Sanitaryware','Bathroom Accessories'),('Sanitaryware','Urinal'),('Sanitaryware','Other Sanitaryware'),
  ('Kitchen Sink','Stainless Steel Sink'),('Kitchen Sink','Single Bowl Sink'),('Kitchen Sink','Double Bowl Sink'),('Kitchen Sink','Handmade Sink'),('Kitchen Sink','Designer Sink'),('Kitchen Sink','Quartz Sink'),('Kitchen Sink','Other Kitchen Sink'),
  ('Bathroom Vanity','Wall Mounted Vanity'),('Bathroom Vanity','Floor Standing Vanity'),('Bathroom Vanity','Designer Vanity'),('Bathroom Vanity','Mirror Cabinet'),('Bathroom Vanity','PVC Vanity'),('Bathroom Vanity','Wooden Vanity'),('Bathroom Vanity','Other Vanity')
) AS s(cat, name) ON c.name = s.cat
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO locations (name) VALUES
  ('Main Showroom'),('Marble Yard'),('Granite Yard'),('Tile Godown'),('Sanitaryware Godown'),('Warehouse'),('Rack'),('Other Location')
ON CONFLICT (name) DO NOTHING;

INSERT INTO units (name, type) VALUES
  ('Sq.Ft','area'),('Sq.Mtr','area'),('Slab','slab'),('Box','box'),('Piece','quantity'),('Lot','quantity')
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_categories (name) VALUES
  ('Transport'),('Loading'),('Unloading'),('Labour'),('Electricity'),('Rent'),('Salary'),('Maintenance'),('Packaging'),('Office Expense'),('Marketing'),('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (business_name, address, phone, gst_number, email, terms_conditions)
VALUES ('Vaishnav Marble Shop', '', '', '', '', 'Goods once sold will not be taken back. All disputes subject to local jurisdiction.')
ON CONFLICT (business_name) DO NOTHING;

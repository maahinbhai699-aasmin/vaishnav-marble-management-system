-- Repair policies for the single-tenant app using the public anon client.
-- Apply this migration to the connected Supabase project.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'categories','subcategories','locations','units','suppliers','customers',
      'products','product_units','slabs','purchases','purchase_items','sales','sale_items',
      'payments','supplier_payments','quotations','quotation_items',
      'sales_returns','sales_return_items','purchase_returns','purchase_return_items',
      'stock_transfers','stock_transfer_items','stock_movements',
      'expense_categories','expenses','settings'
    ])
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated;', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'anon_select_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);', 'anon_select_' || table_name, table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'anon_insert_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true);', 'anon_insert_' || table_name, table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'anon_update_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', 'anon_update_' || table_name, table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'anon_delete_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (true);', 'anon_delete_' || table_name, table_name);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

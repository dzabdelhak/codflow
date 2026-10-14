-- Security-test personas for RBAC black-box testing. COMPLETE SET:
--   specials : admin, noscopes, inactive
--   scoped   : exactly ONE scope per persona (every scope in cod-shared/rbac/scopes.ts,
--              mcp:view excluded by design decision — MCP out of test scope)
-- Idempotent: ON CONFLICT DO NOTHING on unique email/api_key/id.
-- The personas join the merchant the runner sets in app.merchant_id (lib/common.sh).
-- Teardown: teardown-personas.sql removes everything with sectest-% prefix.

-- ─── Specials ────────────────────────────────────────────────────────────────
INSERT INTO users (id, name, email, email_verified, role, status, api_key, created_at, updated_at, language) VALUES
  ('sectest-admin',    'SEC-TEST Admin',    'sectest-admin@codflow.test',    false, 'admin', 'active',   'sectest_key_admin_0f4c9a1e7b2d8e63',    now(), now(), 'en'),
  ('sectest-noscopes', 'SEC-TEST NoScopes', 'sectest-noscopes@codflow.test', false, 'staff', 'active',   'sectest_key_noscopes_5b8e2d714ac09f36', now(), now(), 'en'),
  ('sectest-inactive', 'SEC-TEST Inactive', 'sectest-inactive@codflow.test', false, 'staff', 'inactive', 'sectest_key_inactive_9d31c6fa28be5074', now(), now(), 'en')
ON CONFLICT DO NOTHING;

INSERT INTO user_scopes (id, user_id, scope, granted_by, granted_at) VALUES
  ('sectest-sc-inactive', 'sectest-inactive', 'orders:read', 'sectest-seed', now()::text)
ON CONFLICT DO NOTHING;

-- ─── One persona per scope ───────────────────────────────────────────────────
INSERT INTO users (id, name, email, email_verified, role, status, api_key, created_at, updated_at, language) VALUES
  ('sectest-s-dashboard-view',            'SEC-TEST dashboard:view',            'sectest-s-dashboard-view@codflow.test',            false, 'staff', 'active', 'sectest_key_s_dashboard_view_000001', now(), now(), 'en'),
  ('sectest-s-orders-read',               'SEC-TEST orders:read',               'sectest-s-orders-read@codflow.test',               false, 'staff', 'active', 'sectest_key_s_orders_read_000002', now(), now(), 'en'),
  ('sectest-s-orders-create',             'SEC-TEST orders:create',             'sectest-s-orders-create@codflow.test',             false, 'staff', 'active', 'sectest_key_s_orders_create_000003', now(), now(), 'en'),
  ('sectest-s-orders-update',             'SEC-TEST orders:update',             'sectest-s-orders-update@codflow.test',             false, 'staff', 'active', 'sectest_key_s_orders_update_000004', now(), now(), 'en'),
  ('sectest-s-orders-delete',             'SEC-TEST orders:delete',             'sectest-s-orders-delete@codflow.test',             false, 'staff', 'active', 'sectest_key_s_orders_delete_000005', now(), now(), 'en'),
  ('sectest-s-orders-assign',             'SEC-TEST orders:assign',             'sectest-s-orders-assign@codflow.test',             false, 'staff', 'active', 'sectest_key_s_orders_assign_000006', now(), now(), 'en'),
  ('sectest-s-customers-read',            'SEC-TEST customers:read',            'sectest-s-customers-read@codflow.test',            false, 'staff', 'active', 'sectest_key_s_customers_read_000007', now(), now(), 'en'),
  ('sectest-s-customers-create',          'SEC-TEST customers:create',          'sectest-s-customers-create@codflow.test',          false, 'staff', 'active', 'sectest_key_s_customers_create_000008', now(), now(), 'en'),
  ('sectest-s-customers-update',          'SEC-TEST customers:update',          'sectest-s-customers-update@codflow.test',          false, 'staff', 'active', 'sectest_key_s_customers_update_000009', now(), now(), 'en'),
  ('sectest-s-customers-delete',          'SEC-TEST customers:delete',          'sectest-s-customers-delete@codflow.test',          false, 'staff', 'active', 'sectest_key_s_customers_delete_000010', now(), now(), 'en'),
  ('sectest-s-products-read',             'SEC-TEST products:read',             'sectest-s-products-read@codflow.test',             false, 'staff', 'active', 'sectest_key_s_products_read_000011', now(), now(), 'en'),
  ('sectest-s-products-create',           'SEC-TEST products:create',           'sectest-s-products-create@codflow.test',           false, 'staff', 'active', 'sectest_key_s_products_create_000012', now(), now(), 'en'),
  ('sectest-s-products-update',           'SEC-TEST products:update',           'sectest-s-products-update@codflow.test',           false, 'staff', 'active', 'sectest_key_s_products_update_000013', now(), now(), 'en'),
  ('sectest-s-products-delete',           'SEC-TEST products:delete',           'sectest-s-products-delete@codflow.test',           false, 'staff', 'active', 'sectest_key_s_products_delete_000014', now(), now(), 'en'),
  ('sectest-s-products-manage',           'SEC-TEST products:manage',           'sectest-s-products-manage@codflow.test',           false, 'staff', 'active', 'sectest_key_s_products_manage_000015', now(), now(), 'en'),
  ('sectest-s-delivery-read',             'SEC-TEST delivery:read',             'sectest-s-delivery-read@codflow.test',             false, 'staff', 'active', 'sectest_key_s_delivery_read_000016', now(), now(), 'en'),
  ('sectest-s-delivery-create',           'SEC-TEST delivery:create',           'sectest-s-delivery-create@codflow.test',           false, 'staff', 'active', 'sectest_key_s_delivery_create_000017', now(), now(), 'en'),
  ('sectest-s-delivery-update',           'SEC-TEST delivery:update',           'sectest-s-delivery-update@codflow.test',           false, 'staff', 'active', 'sectest_key_s_delivery_update_000018', now(), now(), 'en'),
  ('sectest-s-delivery-delete',           'SEC-TEST delivery:delete',           'sectest-s-delivery-delete@codflow.test',           false, 'staff', 'active', 'sectest_key_s_delivery_delete_000019', now(), now(), 'en'),
  ('sectest-s-delivery-assign',           'SEC-TEST delivery:assign',           'sectest-s-delivery-assign@codflow.test',           false, 'staff', 'active', 'sectest_key_s_delivery_assign_000020', now(), now(), 'en'),
  ('sectest-s-delivery-manage',           'SEC-TEST delivery:manage',           'sectest-s-delivery-manage@codflow.test',           false, 'staff', 'active', 'sectest_key_s_delivery_manage_000021', now(), now(), 'en'),
  ('sectest-s-delivery-dispatch',         'SEC-TEST delivery:dispatch',         'sectest-s-delivery-dispatch@codflow.test',         false, 'staff', 'active', 'sectest_key_s_delivery_dispatch_000022', now(), now(), 'en'),
  ('sectest-s-customer-groups-read',      'SEC-TEST customer_groups:read',      'sectest-s-customer-groups-read@codflow.test',      false, 'staff', 'active', 'sectest_key_s_customer_groups_read_000023', now(), now(), 'en'),
  ('sectest-s-customer-groups-manage',    'SEC-TEST customer_groups:manage',    'sectest-s-customer-groups-manage@codflow.test',    false, 'staff', 'active', 'sectest_key_s_customer_groups_manage_000024', now(), now(), 'en'),
  ('sectest-s-customer-tags-read',        'SEC-TEST customer_tags:read',        'sectest-s-customer-tags-read@codflow.test',        false, 'staff', 'active', 'sectest_key_s_customer_tags_read_000025', now(), now(), 'en'),
  ('sectest-s-customer-tags-manage',      'SEC-TEST customer_tags:manage',      'sectest-s-customer-tags-manage@codflow.test',      false, 'staff', 'active', 'sectest_key_s_customer_tags_manage_000026', now(), now(), 'en'),
  ('sectest-s-product-groups-read',       'SEC-TEST product_groups:read',       'sectest-s-product-groups-read@codflow.test',       false, 'staff', 'active', 'sectest_key_s_product_groups_read_000027', now(), now(), 'en'),
  ('sectest-s-product-groups-manage',     'SEC-TEST product_groups:manage',     'sectest-s-product-groups-manage@codflow.test',     false, 'staff', 'active', 'sectest_key_s_product_groups_manage_000028', now(), now(), 'en'),
  ('sectest-s-stock-read',                'SEC-TEST stock:read',                'sectest-s-stock-read@codflow.test',                false, 'staff', 'active', 'sectest_key_s_stock_read_000029', now(), now(), 'en'),
  ('sectest-s-stock-manage',              'SEC-TEST stock:manage',              'sectest-s-stock-manage@codflow.test',              false, 'staff', 'active', 'sectest_key_s_stock_manage_000030', now(), now(), 'en'),
  ('sectest-s-settings-view',             'SEC-TEST settings:view',             'sectest-s-settings-view@codflow.test',             false, 'staff', 'active', 'sectest_key_s_settings_view_000031', now(), now(), 'en'),
  ('sectest-s-settings-team',             'SEC-TEST settings:team',             'sectest-s-settings-team@codflow.test',             false, 'staff', 'active', 'sectest_key_s_settings_team_000032', now(), now(), 'en'),
  ('sectest-s-settings-integrations',     'SEC-TEST settings:integrations',     'sectest-s-settings-integrations@codflow.test',     false, 'staff', 'active', 'sectest_key_s_settings_integrations_000033', now(), now(), 'en'),
  ('sectest-s-settings-notifications',    'SEC-TEST settings:notifications',    'sectest-s-settings-notifications@codflow.test',    false, 'staff', 'active', 'sectest_key_s_settings_notifications_000034', now(), now(), 'en'),
  ('sectest-s-reviews-read',              'SEC-TEST reviews:read',              'sectest-s-reviews-read@codflow.test',              false, 'staff', 'active', 'sectest_key_s_reviews_read_000035', now(), now(), 'en'),
  ('sectest-s-reviews-manage',            'SEC-TEST reviews:manage',            'sectest-s-reviews-manage@codflow.test',            false, 'staff', 'active', 'sectest_key_s_reviews_manage_000036', now(), now(), 'en'),
  ('sectest-s-offers-read',               'SEC-TEST offers:read',               'sectest-s-offers-read@codflow.test',               false, 'staff', 'active', 'sectest_key_s_offers_read_000037', now(), now(), 'en'),
  ('sectest-s-offers-manage',             'SEC-TEST offers:manage',             'sectest-s-offers-manage@codflow.test',             false, 'staff', 'active', 'sectest_key_s_offers_manage_000038', now(), now(), 'en'),
  ('sectest-s-abandoned-orders-read',     'SEC-TEST abandoned_orders:read',     'sectest-s-abandoned-orders-read@codflow.test',     false, 'staff', 'active', 'sectest_key_s_abandoned_orders_read_000039', now(), now(), 'en'),
  ('sectest-s-abandoned-orders-manage',   'SEC-TEST abandoned_orders:manage',   'sectest-s-abandoned-orders-manage@codflow.test',   false, 'staff', 'active', 'sectest_key_s_abandoned_orders_manage_000040', now(), now(), 'en')
ON CONFLICT DO NOTHING;

INSERT INTO user_scopes (id, user_id, scope, granted_by, granted_at) VALUES
  ('sectest-sc-s-01', 'sectest-s-dashboard-view',          'dashboard:view',            'sectest-seed', now()::text),
  ('sectest-sc-s-02', 'sectest-s-orders-read',             'orders:read',               'sectest-seed', now()::text),
  ('sectest-sc-s-03', 'sectest-s-orders-create',           'orders:create',             'sectest-seed', now()::text),
  ('sectest-sc-s-04', 'sectest-s-orders-update',           'orders:update',             'sectest-seed', now()::text),
  ('sectest-sc-s-05', 'sectest-s-orders-delete',           'orders:delete',             'sectest-seed', now()::text),
  ('sectest-sc-s-06', 'sectest-s-orders-assign',           'orders:assign',             'sectest-seed', now()::text),
  ('sectest-sc-s-07', 'sectest-s-customers-read',          'customers:read',            'sectest-seed', now()::text),
  ('sectest-sc-s-08', 'sectest-s-customers-create',        'customers:create',          'sectest-seed', now()::text),
  ('sectest-sc-s-09', 'sectest-s-customers-update',        'customers:update',          'sectest-seed', now()::text),
  ('sectest-sc-s-10', 'sectest-s-customers-delete',        'customers:delete',          'sectest-seed', now()::text),
  ('sectest-sc-s-11', 'sectest-s-products-read',           'products:read',             'sectest-seed', now()::text),
  ('sectest-sc-s-12', 'sectest-s-products-create',         'products:create',           'sectest-seed', now()::text),
  ('sectest-sc-s-13', 'sectest-s-products-update',         'products:update',           'sectest-seed', now()::text),
  ('sectest-sc-s-14', 'sectest-s-products-delete',         'products:delete',           'sectest-seed', now()::text),
  ('sectest-sc-s-15', 'sectest-s-products-manage',         'products:manage',           'sectest-seed', now()::text),
  ('sectest-sc-s-16', 'sectest-s-delivery-read',           'delivery:read',             'sectest-seed', now()::text),
  ('sectest-sc-s-17', 'sectest-s-delivery-create',         'delivery:create',           'sectest-seed', now()::text),
  ('sectest-sc-s-18', 'sectest-s-delivery-update',         'delivery:update',           'sectest-seed', now()::text),
  ('sectest-sc-s-19', 'sectest-s-delivery-delete',         'delivery:delete',           'sectest-seed', now()::text),
  ('sectest-sc-s-20', 'sectest-s-delivery-assign',         'delivery:assign',           'sectest-seed', now()::text),
  ('sectest-sc-s-21', 'sectest-s-delivery-manage',         'delivery:manage',           'sectest-seed', now()::text),
  ('sectest-sc-s-22', 'sectest-s-delivery-dispatch',       'delivery:dispatch',         'sectest-seed', now()::text),
  ('sectest-sc-s-23', 'sectest-s-customer-groups-read',    'customer_groups:read',      'sectest-seed', now()::text),
  ('sectest-sc-s-24', 'sectest-s-customer-groups-manage',  'customer_groups:manage',    'sectest-seed', now()::text),
  ('sectest-sc-s-25', 'sectest-s-customer-tags-read',      'customer_tags:read',        'sectest-seed', now()::text),
  ('sectest-sc-s-26', 'sectest-s-customer-tags-manage',    'customer_tags:manage',      'sectest-seed', now()::text),
  ('sectest-sc-s-27', 'sectest-s-product-groups-read',     'product_groups:read',       'sectest-seed', now()::text),
  ('sectest-sc-s-28', 'sectest-s-product-groups-manage',   'product_groups:manage',     'sectest-seed', now()::text),
  ('sectest-sc-s-29', 'sectest-s-stock-read',              'stock:read',                'sectest-seed', now()::text),
  ('sectest-sc-s-30', 'sectest-s-stock-manage',            'stock:manage',              'sectest-seed', now()::text),
  ('sectest-sc-s-31', 'sectest-s-settings-view',           'settings:view',             'sectest-seed', now()::text),
  ('sectest-sc-s-32', 'sectest-s-settings-team',           'settings:team',             'sectest-seed', now()::text),
  ('sectest-sc-s-33', 'sectest-s-settings-integrations',   'settings:integrations',     'sectest-seed', now()::text),
  ('sectest-sc-s-34', 'sectest-s-settings-notifications',  'settings:notifications',    'sectest-seed', now()::text),
  ('sectest-sc-s-35', 'sectest-s-reviews-read',            'reviews:read',              'sectest-seed', now()::text),
  ('sectest-sc-s-36', 'sectest-s-reviews-manage',          'reviews:manage',            'sectest-seed', now()::text),
  ('sectest-sc-s-37', 'sectest-s-offers-read',             'offers:read',               'sectest-seed', now()::text),
  ('sectest-sc-s-38', 'sectest-s-offers-manage',           'offers:manage',             'sectest-seed', now()::text),
  ('sectest-sc-s-39', 'sectest-s-abandoned-orders-read',   'abandoned_orders:read',     'sectest-seed', now()::text),
  ('sectest-sc-s-40', 'sectest-s-abandoned-orders-manage', 'abandoned_orders:manage',   'sectest-seed', now()::text)
ON CONFLICT DO NOTHING;

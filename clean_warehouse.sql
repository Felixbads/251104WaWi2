-- SQL-Skript zur Bereinigung und intelligenten Neusynchronisierung des Lagers 4

-- Transaktion beginnen
BEGIN;

-- 1. Lagerbestand für Lager 4 löschen
DELETE FROM inventory_items WHERE warehouse_id = 4;

-- 2. Automaten ermitteln, die mit Lager 4 verbunden sind
WITH warehouse_machines AS (
  SELECT machine_id 
  FROM machine_warehouse_assignments 
  WHERE warehouse_id = 4
),
-- 3. Produkte aus den Automaten-Slots
slot_products AS (
  SELECT DISTINCT p.id, p.product_name
  FROM products p
  JOIN vendon_product_slots vps ON p.vendon_id = vps.product_id::text
  JOIN warehouse_machines wm ON vps.machine_id = wm.machine_id
),
-- 4. Produkte aus den Transaktionen
transaction_products AS (
  SELECT DISTINCT p.id, p.product_name
  FROM products p
  JOIN vendon_transactions vt ON 
    (vt.product_id::text = p.vendon_id OR 
     vt.product_name = p.product_name OR 
     vt.name = p.product_name)
  JOIN warehouse_machines wm ON vt.machine_id = wm.machine_id
),
-- 5. Alle relevanten Produkte vereinigen
all_products AS (
  SELECT id, product_name FROM slot_products
  UNION
  SELECT id, product_name FROM transaction_products
)
-- 6. Produkte zum Lager hinzufügen
INSERT INTO inventory_items 
  (warehouse_id, product_id, quantity, min_quantity, reorder_point, status, created_at, updated_at)
SELECT 
  4, ap.id, 0, 0, 0, 'active', NOW(), NOW()
FROM all_products ap;

-- Transaktion bestätigen
COMMIT;
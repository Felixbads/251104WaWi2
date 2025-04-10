-- Produktbereinigungsmigration
-- Erstellt: 10. April 2025
-- Dieser SQL-Skript bereinigt die Produktdatenbank, indem Duplikate entfernt werden

-- Schritt 1: Erstelle eine temporäre Tabelle für die eindeutigen Produkte
CREATE TEMPORARY TABLE unique_products AS
SELECT DISTINCT ON (LOWER(product_name)) 
    id, 
    product_name, 
    price, 
    vendon_id,
    sku,
    barcode,
    description,
    status,
    created_at,
    updated_at,
    supplier_id,
    custom1,
    custom2,
    custom3,
    extra_data
FROM products 
ORDER BY LOWER(product_name), created_at DESC;

-- Schritt 2: Erstelle eine Zuordnungstabelle, die alte Produkt-IDs zu neuen Produkt-IDs zuordnet
CREATE TEMPORARY TABLE product_id_mapping AS
SELECT p.id AS old_id, up.id AS new_id
FROM products p
LEFT JOIN unique_products up ON LOWER(p.product_name) = LOWER(up.product_name)
WHERE p.id != up.id;

-- Schritt 3: Aktualisiere alle Fremdschlüsselbeziehungen auf die neuen Produkt-IDs
-- Aktualisiere order_items
UPDATE order_items oi
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE oi.product_id = pm.old_id;

-- Aktualisiere inventory_count_items
UPDATE inventory_count_items ici
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE ici.product_id = pm.old_id;

-- Aktualisiere inventory_items
UPDATE inventory_items ii
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE ii.product_id = pm.old_id;

-- Aktualisiere inventory_movements
UPDATE inventory_movements im
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE im.product_id = pm.old_id;

-- Aktualisiere purchase_conditions
UPDATE purchase_conditions pc
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE pc.product_id = pm.old_id;

-- Aktualisiere inventory_batches
UPDATE inventory_batches ib
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE ib.product_id = pm.old_id;

-- Aktualisiere refill_batch_movements
UPDATE refill_batch_movements rbm
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE rbm.product_id = pm.old_id;

-- Aktualisiere product_batches
UPDATE product_batches pb
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE pb.product_id = pm.old_id;

-- Aktualisiere product_movements
UPDATE product_movements pm2
SET product_id = pm.new_id
FROM product_id_mapping pm
WHERE pm2.product_id = pm.old_id;

-- Schritt 4: Lösche alle Produkte außer den eindeutigen
DELETE FROM products
WHERE id NOT IN (SELECT id FROM unique_products);

-- Schritt 5: Bereinige die temporären Tabellen
DROP TABLE unique_products;
DROP TABLE product_id_mapping;

-- Erfolgsmeldung
SELECT 'Produktbereinigung abgeschlossen. Die Produkttabelle enthält jetzt nur noch eindeutige Produkte.' AS message;
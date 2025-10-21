
-- MANUAL PACKAGE CORRECTIONS
-- Passe diese Werte an deine tatsächlichen Produkte an

BEGIN;

-- Beispiel: Kalter Hund
UPDATE products 
SET 
  package_quantity = 6,
  package_size = '6 Stück',
  updated_at = NOW()
WHERE id = 82;

-- Weitere Produkte hier manuell hinzufügen:
-- UPDATE products SET package_quantity = X, package_size = 'X Stück' WHERE id = Y;

COMMIT;

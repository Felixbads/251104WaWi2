/**
 * Fix für die Vendon-Synchronisierung
 * 
 * Dieses Skript erweitert die vendonSync.ts Datei, um zu verhindern, 
 * dass Produktduplikate in der Zukunft erstellt werden.
 * 
 * Erstellt: 10. April 2025
 */

// Ersetze in server/services/vendonSync.ts den folgenden Code:

/*
// Verarbeite jeden Produkt-Datensatz einzeln, aber effizienter
for (const product of products) {
  try {
    if (!product.id) {
      console.warn("Produkt ohne ID übersprungen");
      errors++;
      continue;
    }
    
    const vendonId = product.id.toString();
    
    // Verbesserte Produktnamenextraktion
    let productName = product.name;
    
    // Wenn kein Name vorhanden ist, versuche verschiedene Felder
    if (!productName && product.product_name) {
      productName = product.product_name;
    } else if (!productName && product.title) {
      productName = product.title;
    } else if (!productName && product.label) {
      productName = product.label;
    } else if (!productName) {
      // Fallback
      productName = `Produkt ${vendonId}`;
    }
    
    // Extrahiere Produktdaten mit mehr Informationen
    const productData = {
      vendonId,
      productName: productName,
      price: product.price || 0,
      status: product.status || 'active',
      sku: product.sku || product.code || null,
      barcode: product.barcode || product.code || null,
      // Felder aus dem extraData-Feld können später extrahiert werden
      extraData: JSON.stringify(product)
    };
*/

// Mit diesem verbesserten Code:

/*
// Verarbeite jeden Produkt-Datensatz einzeln, aber effizienter
for (const product of products) {
  try {
    if (!product.id) {
      console.warn("Produkt ohne ID übersprungen");
      errors++;
      continue;
    }
    
    const vendonId = product.id.toString();
    
    // Verbesserte Produktnamenextraktion
    let productName = product.name;
    
    // Wenn kein Name vorhanden ist, versuche verschiedene Felder
    if (!productName && product.product_name) {
      productName = product.product_name;
    } else if (!productName && product.title) {
      productName = product.title;
    } else if (!productName && product.label) {
      productName = product.label;
    } else if (!productName) {
      // Fallback
      productName = `Produkt ${vendonId}`;
    }
    
    // Extrahiere Produktdaten mit mehr Informationen
    const productData = {
      vendonId,
      productName: productName,
      price: product.price || 0,
      status: product.status || 'active',
      sku: product.sku || product.code || null,
      barcode: product.barcode || product.code || null,
      // Felder aus dem extraData-Feld können später extrahiert werden
      extraData: JSON.stringify(product)
    };
    
    // Prüfe, ob das Produkt bereits existiert (nach Namen und Vendon-ID)
    const existingProductByVendonId = await db.select().from(products).where(eq(products.vendonId, vendonId)).limit(1);
    const existingProductByName = await db.select().from(products).where(eq(products.productName, productName)).limit(1);
    
    if (existingProductByVendonId.length > 0) {
      // Aktualisiere das bestehende Produkt
      console.log(`Aktualisiere bestehendes Produkt (vendonId: ${vendonId}): ${productName}`);
      await db.update(products)
        .set({
          productName,
          price: productData.price,
          status: productData.status,
          sku: productData.sku,
          barcode: productData.barcode,
          extraData: productData.extraData,
          updatedAt: new Date()
        })
        .where(eq(products.vendonId, vendonId));
      
      updated++;
    } else if (existingProductByName.length > 0) {
      // Aktualisiere das bestehende Produkt und setze vendonId
      console.log(`Aktualisiere bestehendes Produkt (Name: ${productName}) und setze vendonId: ${vendonId}`);
      await db.update(products)
        .set({
          vendonId,
          price: productData.price,
          status: productData.status,
          sku: productData.sku,
          barcode: productData.barcode,
          extraData: productData.extraData,
          updatedAt: new Date()
        })
        .where(eq(products.productName, productName));
      
      updated++;
    } else {
      // Erstelle ein neues Produkt
      console.log(`Erstelle neues Produkt: ${productName} (vendonId: ${vendonId})`);
      await db.insert(products).values({
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      created++;
    }
*/

/**
 * Zusätzliche Hinweise:
 * 
 * 1. Der Synchronisierungsprozess prüft jetzt, ob ein Produkt bereits existiert,
 *    bevor ein neues erstellt wird. Es sucht sowohl nach vendonId als auch Produktnamen.
 * 
 * 2. Dadurch werden Duplikate vermieden und vorhandene Produkte aktualisiert.
 * 
 * 3. Führen Sie nach dieser Änderung die product_cleanup_migration.sql aus, um 
 *    bestehende Duplikate zu bereinigen.
 * 
 * 4. Sie können auch die Synchronisierung anpassen, um regelmäßig eine Bereinigung 
 *    der Produkte durchzuführen.
 */
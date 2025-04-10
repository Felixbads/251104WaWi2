/**
 * Fix für die vendonSync.ts zur Vermeidung duplizierter Produkte
 * Erstellt: 10. April 2025
 * 
 * Änderungen in der syncProducts Funktion in server/services/vendonSync.ts:
 * 
 * Diese Änderungen stellen sicher, dass bei der Produktsynchronisierung 
 * bestehende Produkte aktualisiert werden, anstatt neue zu erstellen, 
 * wenn ein Produkt mit dem gleichen Namen bereits existiert.
 */

// Suchen Sie in der Funktion syncProducts() nach diesem Code-Abschnitt:

/*
// Prüfe, ob das Produkt bereits existiert anhand der Map (nicht DB-Abfrage für jedes Produkt)
const existing = existingProductMap[vendonId];

if (existing) {
  // Aktualisieren des bestehenden Produkts
  console.log(`Aktualisiere Produkt: ${productName} (vendonId: ${vendonId})`);
  
  await storage.updateProduct(existing.id, {
    ...productData,
    updatedAt: new Date()
  });
  
  itemsUpdated++;
} else {
  // Erstellen eines neuen Produkts
  console.log(`Erstelle neues Produkt: ${productName} (vendonId: ${vendonId})`);
  
  await storage.createProduct({
    ...productData,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  itemsSaved++;
}
*/

// Ersetzen Sie diesen Code durch die folgende verbesserte Version:

/*
// Prüfe, ob das Produkt bereits existiert (nach Namen und Vendon-ID)
const existing = existingProductMap[vendonId];

// Suche auch nach Produkten mit dem gleichen Namen
const existingByName = (existingProducts as any[]).find(p => 
  p.productName?.toLowerCase() === productName.toLowerCase()
);

if (existing) {
  // Aktualisieren des bestehenden Produkts
  console.log(`Aktualisiere bestehendes Produkt (vendonId: ${vendonId}): ${productName}`);
  
  await storage.updateProduct(existing.id, {
    ...productData,
    updatedAt: new Date()
  });
  
  itemsUpdated++;
} else if (existingByName) {
  // Aktualisiere das bestehende Produkt und setze vendonId
  console.log(`Aktualisiere bestehendes Produkt (Name: ${productName}) und setze vendonId: ${vendonId}`);
  
  await storage.updateProduct(existingByName.id, {
    ...productData,
    updatedAt: new Date()
  });
  
  itemsUpdated++;
} else {
  // Erstellen eines neuen Produkts
  console.log(`Erstelle neues Produkt: ${productName} (vendonId: ${vendonId})`);
  
  await storage.createProduct({
    ...productData,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  itemsSaved++;
}
*/

/**
 * Die Hauptänderung in diesem Fix:
 * 
 * 1. Wir prüfen nicht nur, ob ein Produkt mit der gleichen vendonId existiert,
 *    sondern auch, ob ein Produkt mit dem gleichen Namen existiert.
 * 
 * 2. Falls ein Produkt mit dem gleichen Namen, aber unterschiedlicher vendonId existiert,
 *    aktualisieren wir das bestehende Produkt anstatt ein neues zu erstellen.
 * 
 * 3. Dadurch wird die Creation von Duplikaten verhindert, was Speicherplatz spart
 *    und die Konsistenz der Datenbank gewährleistet.
 */
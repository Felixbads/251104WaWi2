// Cache-Invalidation Helper für Inventur-Bereiche
// Diese Funktion stellt sicher, dass der Cache konsistent aktualisiert wird
// und unnötige Mehrfachabfragen vermieden werden

import { QueryClient } from '@tanstack/react-query';

/**
 * Invalidiert den Cache für Inventurelemente 
 * und alle damit verbundenen Abfragen
 * 
 * @param queryClient Der QueryClient aus @tanstack/react-query
 * @param inventoryId ID der Inventur
 * @param productId Optional: Produkt-ID für spezifischere Invalidierung
 */
export function invalidateInventoryCache(
  queryClient: QueryClient,
  inventoryId: number | string,
  productId?: number
) {
  console.log(`Invalidiere Cache für Inventur ${inventoryId}${productId ? ` und Produkt ${productId}` : ''}`);
  
  // Wichtigste Abfrage: Liste der Inventur-Items
  queryClient.invalidateQueries({ 
    queryKey: [`/api/inventory-counts/${inventoryId}/items`]
  });
  
  // Die Inventur selbst invalidieren
  queryClient.invalidateQueries({ 
    queryKey: [`/api/inventory-counts/${inventoryId}`]
  });
  
  // Wenn eine Produkt-ID angegeben ist, die zugehörigen Batches invalidieren
  if (productId) {
    queryClient.invalidateQueries({
      queryKey: [`/api/products/${productId}/batches`]
    });
  }
  
  // Kann bei Bedarf erweitert werden, um weitere verwandte Queries zu invalidieren
}
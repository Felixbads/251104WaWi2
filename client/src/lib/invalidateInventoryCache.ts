// Cache-Invalidation Helper für Inventur-Bereiche
// Diese Funktion stellt sicher, dass der Cache konsistent aktualisiert wird
// und unnötige Mehrfachabfragen vermieden werden, ohne dabei die Scroll-Position zurückzusetzen

import { QueryClient } from '@tanstack/react-query';

/**
 * Invalidiert den Cache für Inventurelemente 
 * und alle damit verbundenen Abfragen mit verbessertem Scroll-Handling
 * 
 * @param queryClient Der QueryClient aus @tanstack/react-query
 * @param inventoryId ID der Inventur
 * @param productId Optional: Produkt-ID für spezifischere Invalidierung
 * @param preserveScroll Optional: Scroll-Position wiederherstellen (default: true)
 */
export function invalidateInventoryCache(
  queryClient: QueryClient,
  inventoryId: number | string,
  productId?: number,
  preserveScroll: boolean = true
) {
  console.log(`Invalidiere Cache für Inventur ${inventoryId}${productId ? ` und Produkt ${productId}` : ''}`);
  
  // Wenn scroll-preservation aktiv ist, speichere aktuelle Position
  let savedScrollPosition: number | null = null;
  if (preserveScroll && typeof window !== 'undefined') {
    savedScrollPosition = window.scrollY;
    console.log(`Cache-Invalidierung speichert Scroll-Position: ${savedScrollPosition}`);
  }
  
  // Wichtigste Abfrage: Liste der Inventur-Items
  queryClient.invalidateQueries({ 
    queryKey: [`/api/inventory-counts/${inventoryId}/items`],
    refetchType: 'none' // Verhindert sofortiges Refetchen
  });
  
  // Die Inventur selbst invalidieren
  queryClient.invalidateQueries({ 
    queryKey: [`/api/inventory-counts/${inventoryId}`],
    refetchType: 'none'
  });
  
  // Wenn eine Produkt-ID angegeben ist, die zugehörigen Batches invalidieren
  if (productId) {
    queryClient.invalidateQueries({
      queryKey: [`/api/products/${productId}/batches`],
      refetchType: 'none'
    });
  }
  
  // Stelle Scroll-Position wieder her, nachdem alle Cache-Operationen abgeschlossen sind
  if (preserveScroll && savedScrollPosition !== null) {
    // Zuerst in der Session speichern für bessere Persistenz
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('inventur_scroll_position', savedScrollPosition.toString());
    }
    
    // Verzögert wiederherstellen für bessere Zuverlässigkeit
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        // Von Session Storage lesen für den Fall, dass zwischenzeitlich aktualisiert wurde
        const posToRestore = window.sessionStorage.getItem('inventur_scroll_position') || savedScrollPosition.toString();
        
        // Mit auto-Verhalten für sofortigen Sprung ohne Animation
        window.scrollTo({
          top: parseInt(posToRestore, 10),
          behavior: 'auto'
        });
        
        console.log(`Cache-Invalidierung stellte Scroll-Position wieder her: ${posToRestore}`);
        
        // Sicherheitsmaßnahme: Nach einer Sekunde noch einmal scrollen, falls nötig
        setTimeout(() => {
          if (Math.abs(window.scrollY - parseInt(posToRestore, 10)) > 10) {
            window.scrollTo({
              top: parseInt(posToRestore, 10),
              behavior: 'auto'
            });
          }
        }, 1000);
      }
    }, 100);
  }
}
/**
 * Kombinierter Batch-Handler für optimierte Inventur-Flows
 * 
 * Diese Datei implementiert den 4-Punkte-Plan für optimierte Batch-Handling:
 * 1. Kombinierter Batch-Erstellung & Verlinkung in einem Durchgang
 * 2. Optimierte React Query Defaults (staleTime, cacheTime, keine automatischen Refetches)
 * 3. Cache-Invalidierung nur in onSuccess Callback (nicht in useEffect)
 * 4. Seite nicht neuladen, sondern mit optimistischem Update arbeiten
 */

import { format } from 'date-fns';
import { QueryClient, useMutation } from '@tanstack/react-query';
import { invalidateInventoryCache } from '../../../lib/invalidateInventoryCache';
import { type Toast } from '@/hooks/use-toast';

interface ProductBatch {
  id: number;
  productId: number;
  batchNumber: string;
  warehouseId: number;
  expiryDate: string | null;
  initialQuantity: number;
  currentQuantity: number;
  notes?: string | null;
  createdAt?: string;
  status?: string;
}

interface InventoryCountItem {
  id: number;
  productId: number;
  expectedQuantity: number;
  countedQuantity?: number | null;
  batchId?: number | null;
  productName?: string;
}

interface CreateAndLinkBatchOptions {
  item: InventoryCountItem;
  warehouseId: number;
  inventoryId: string;
  batchNumber: string;
  expiryDate: string | null;
  quantity?: number;
  notes?: string | null;
  queryClient: QueryClient;
  toast?: Toast;
  onSuccess?: (batch: ProductBatch) => void;
}

/**
 * Generiert eine einzigartige Batch-Nummer basierend auf Datum/Zeit und Zufallszahl
 * Format: CHG-YYYYMMDD-HHMMSS-XXX
 */
export function generateBatchNumber(): string {
  const now = new Date();
  const dateStr = format(now, 'yyyyMMdd');
  const timeStr = format(now, 'HHmmss');
  const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CHG-${dateStr}-${timeStr}-${randomStr}`;
}

/**
 * Konvertiert ein Datum 3 Monate in der Zukunft in ISO-Format
 */
export function getDefaultExpiryDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return format(date, 'yyyy-MM-dd');
}

/**
 * Hook zur Batch-Verknüpfung mit einem Inventory Item
 */
export function useBatchLinkMutation(
  queryClient: QueryClient,
  inventoryId: string,
  onSuccessCallback?: () => void
) {
  return useMutation({
    mutationFn: async ({ itemId, batchId }: { itemId: number, batchId: number }) => {
      // Speichere die aktuelle Scroll-Position
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
      }
      
      const response = await fetch(`/api/inventory-counts/items/${itemId}/batch`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        body: JSON.stringify({ batchId })
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Verknüpfen der Charge: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Cache erst nach erfolgreicher Operation invalidieren
      invalidateInventoryCache(queryClient, inventoryId);
      
      // Stelle die Scroll-Position wieder her
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
          if (savedPos) {
            window.scrollTo(0, parseInt(savedPos, 10));
          }
        }
        
        // Optional: Callback für weitere Aktionen
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      }, 50);
    }
  });
}

/**
 * Kombinierte Funktion zum Erstellen und Verlinken einer Charge in einer Sequenz
 */
export async function createAndLinkBatch({
  item,
  warehouseId,
  inventoryId,
  batchNumber,
  expiryDate,
  quantity = 0,
  notes = null,
  queryClient,
  toast,
  onSuccess
}: CreateAndLinkBatchOptions): Promise<ProductBatch> {
  
  // Speichere die aktuelle Scroll-Position
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
  }
  
  try {
    // Definiere die Batch-Daten mit Standardwerten
    const batchData = {
      productId: item.productId,
      batchNumber,
      warehouseId,
      expiryDate,
      initialQuantity: quantity || item.countedQuantity || 0,
      currentQuantity: quantity || item.countedQuantity || 0,
      receivedDate: format(new Date(), 'yyyy-MM-dd'),
      notes: notes || `Erstellt bei Inventur #${inventoryId}`,
      status: 'active'
    };
    
    // Schritt 1: Batch erstellen
    const createResponse = await fetch('/api/inventory-counts/product-batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(batchData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Fehler beim Erstellen der Charge: ${errorText}`);
    }
    
    const newBatch = await createResponse.json();
    
    if (!newBatch || !newBatch.id) {
      throw new Error('Keine gültige Batch-ID in der Antwort erhalten');
    }
    
    // Schritt 2: Mit dem Inventurposten verknüpfen
    const linkResponse = await fetch(`/api/inventory-counts/items/${item.id}/batch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ batchId: newBatch.id })
    });
    
    if (!linkResponse.ok) {
      const errorText = await linkResponse.text();
      throw new Error(`Charge erstellt, aber Fehler beim Verknüpfen: ${errorText}`);
    }
    
    // Optimistisches Update des Caches, bevor wir invalidieren
    queryClient.setQueryData(
      [`/api/inventory-counts/${inventoryId}/items`],
      (old?: any[]) => {
        if (!old) return old;
        console.log("Optimistisches Update im Cache für Inventur-Items");
        return old.map(oldItem =>
          oldItem.id === item.id
            ? { 
                ...oldItem, 
                batchId: newBatch.id,
                batch: newBatch
              }
            : oldItem
        );
      }
    );
    
    // Cache nach erfolgreicher Operation invalidieren,
    // aber mit Verzögerung damit die Scroll-Position beibehalten wird
    setTimeout(() => {
      invalidateInventoryCache(queryClient, inventoryId, item.productId);
    }, 100);
    
    // Stelle die Scroll-Position wieder her
    if (typeof window !== 'undefined') {
      const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
      if (savedPos) {
        setTimeout(() => {
          window.scrollTo({
            top: parseInt(savedPos, 10),
            behavior: 'auto'
          });
        }, 50);
      }
    }
    
    // Optional: Erfolgsmeldung anzeigen
    if (toast) {
      toast({
        title: 'Charge erstellt und verknüpft',
        description: `Die Charge ${batchNumber} wurde erfolgreich erstellt und verknüpft.`
      });
    }
    
    // Optional: Callback für weitere Aktionen
    if (onSuccess) {
      onSuccess(newBatch);
    }
    
    return newBatch;
  } catch (error) {
    // Bei Fehler die Scroll-Position wiederherstellen
    if (typeof window !== 'undefined') {
      const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
      if (savedPos) {
        window.scrollTo(0, parseInt(savedPos, 10));
      }
    }
    
    // Optional: Fehlermeldung anzeigen
    if (toast) {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    }
    
    throw error;
  }
}
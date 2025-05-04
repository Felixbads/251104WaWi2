/**
 * Kombinierter Batch-Handler für optimierte Inventur-Flows
 * 
 * Diese Datei implementiert den 4-Punkte-Plan für optimierte Batch-Handling:
 * 1. Kombinierter Batch-Erstellung & Verlinkung in einem Durchgang
 * 2. Optimierte React Query Defaults (staleTime, cacheTime, keine automatischen Refetches)
 * 3. Cache-Invalidierung nur in onSuccess Callback (nicht in useEffect)
 * 4. Seite nicht neuladen, sondern mit optimistischem Update arbeiten
 */

import { QueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Interface für Batches
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

// Interface für Inventory Item
interface InventoryCountItem {
  id: number;
  productId: number;
  expectedQuantity: number;
  countedQuantity?: number | null;
  batchId?: number | null;
  productName?: string;
}

/**
 * Generiert eine einzigartige Batch-Nummer basierend auf Datum/Zeit
 */
export function generateBatchNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CHG-${dateStr}-${timeStr}-${random}`;
}

/**
 * Konvertiert ein Datum 3 Monate in der Zukunft in ISO-Format
 */
export function getDefaultExpiryDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date.toISOString().split('T')[0];
}

/**
 * Hook zur Batch-Verknüpfung mit einem Inventory Item
 */
export function useBatchLinkMutation(
  inventoryId: string,
  queryClient: QueryClient,
  onSuccess?: () => void
) {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ itemId, batchId }: { itemId: number; batchId: number | null }) => {
      const apiEndpoint = `/api/inventory-counts/items/${itemId}/batch`;
      
      const response = await fetch(apiEndpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batchId })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler: ${response.status} - ${errorText}`);
      }
      
      return response.status === 204 ? {} : response.json();
    },
    onSuccess: (data, variables) => {
      // Erfolgsmeldung
      toast({
        title: "Charge verknüpft",
        description: "Die Charge wurde erfolgreich mit dem Artikel verknüpft."
      });
      
      // Optimistisches Update für sofortige UI-Reaktion
      queryClient.setQueryData(
        [`/api/inventory-counts/${inventoryId}/items`],
        (old?: InventoryCountItem[]) => {
          if (!old) return old;
          return old.map(item =>
            item.id === variables.itemId ? { ...item, batchId: variables.batchId } : item
          );
        }
      );
      
      // WICHTIG: Nur hier, im onSuccess Handler, den Cache invalidieren
      // und mit Verzögerung, damit UI flüssig bleibt
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/inventory-counts/${inventoryId}/items`],
          refetchType: 'none'  // Verhindert sofortiges Refetching
        });
      }, 300);
      
      // Optional callback
      if (onSuccess) onSuccess();
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
  batchNumber = generateBatchNumber(),
  expiryDate = getDefaultExpiryDate(),
  notes = null,
  queryClient,
  toast,
  onSuccess
}: {
  item: InventoryCountItem;
  warehouseId: number;
  inventoryId: string;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string | null;
  queryClient: QueryClient;
  toast: any;
  onSuccess?: () => void;
}) {
  try {
    if (!item.productId) {
      throw new Error("Keine gültige Produkt-ID für Batch-Erstellung vorhanden");
    }
    
    console.log(`Erstelle neue Charge für Produkt ${item.productId} in Lager ${warehouseId}`);
    
    // 1. Batch erstellen
    const createRes = await fetch('/api/inventory-counts/product-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: item.productId,
        warehouseId: warehouseId,
        batchNumber: batchNumber,
        expiryDate: expiryDate,
        initialQuantity: item.countedQuantity || 1,
        currentQuantity: item.countedQuantity || 1,
        notes: notes || `Auto-erstellt bei Inventur #${inventoryId}`
      })
    });
    
    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Fehler bei Batch-Erstellung: ${createRes.status} - ${errorText}`);
    }
    
    // 2. Neue Batch-Infos extrahieren
    const newBatch = await createRes.json() as ProductBatch;
    console.log("Neue Charge erstellt:", newBatch);
    
    // 3. Batch mit Inventur-Item verknüpfen
    console.log(`Verknüpfe Batch ${newBatch.id} mit Item ${item.id}`);
    
    const linkRes = await fetch(`/api/inventory-counts/items/${item.id}/batch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ batchId: newBatch.id })
    });
    
    if (!linkRes.ok) {
      const errorText = await linkRes.text();
      throw new Error(`Fehler bei Batch-Verknüpfung: ${linkRes.status} - ${errorText}`);
    }
    
    // 4. Erfolgsfall: Optimistisches Update und Cache-Invalidierung
    // Optimistisches Update für sofortige UI-Reaktion
    queryClient.setQueryData(
      [`/api/inventory-counts/${inventoryId}/items`],
      (old?: InventoryCountItem[]) => {
        if (!old) return old;
        return old.map(itemData =>
          itemData.id === item.id ? { ...itemData, batchId: newBatch.id } : itemData
        );
      }
    );
    
    // Erfolgsmeldung 
    toast({
      title: "Charge erstellt und verknüpft",
      description: `Die Charge ${batchNumber} wurde erfolgreich erstellt und verknüpft.`
    });
    
    // Verzögerte Cache-Invalidierung
    setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: [`/api/inventory-counts/${inventoryId}/items`],
        refetchType: 'none'
      });
    }, 300);
    
    // Optional callback
    if (onSuccess) onSuccess();
    
    return newBatch;
  } catch (error: any) {
    console.error("Fehler bei Batch-Erstellung und Verknüpfung:", error);
    toast({
      title: "Fehler",
      description: error.message || "Die Charge konnte nicht erstellt oder verknüpft werden.",
      variant: "destructive"
    });
    throw error;
  }
}
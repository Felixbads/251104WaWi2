/**
 * Kombinierter Batch-Handler für optimierte Inventur-Flows
 * 
 * Diese Datei implementiert den 4-Punkte-Plan für optimierte Batch-Handling:
 * 1. Kombinierter Batch-Erstellung & Verlinkung in einem Durchgang
 * 2. Optimierte React Query Defaults (staleTime, cacheTime, keine automatischen Refetches)
 * 3. Cache-Invalidierung nur in onSuccess Callback (nicht in useEffect)
 * 4. Seite nicht neuladen, sondern mit optimistischem Update arbeiten
 */

import { useMutation, QueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";

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

/**
 * Generiert eine einzigartige Batch-Nummer basierend auf Datum/Zeit und Zufallszahl
 * Format: CHG-YYYYMMDD-HHMMSS-XXX
 */
export function generateBatchNumber(): string {
  const now = new Date();
  const datePart = format(now, "yyyyMMdd");
  const timePart = format(now, "HHmmss");
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `CHG-${datePart}-${timePart}-${randomPart}`;
}

/**
 * Konvertiert ein Datum 3 Monate in der Zukunft in ISO-Format
 */
export function getDefaultExpiryDate(): string {
  const defaultDate = addMonths(new Date(), 3);
  return defaultDate.toISOString();
}

/**
 * Hook zur Batch-Verknüpfung mit einem Inventory Item
 */
export function useBatchLinkMutation(
  queryClient: QueryClient,
  inventoryId: string
) {
  return useMutation({
    mutationFn: async (data: { 
      itemId: number;
      batchId: number | null;
    }) => {
      const response = await fetch(`/api/inventory-count-items/${data.itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batchId: data.batchId }),
      });

      if (!response.ok) {
        throw new Error(`Fehler beim Verknüpfen: ${response.status}`);
      }

      return await response.json();
    },
    onSuccess: () => {
      // Nur einmal Cache invalidieren
      queryClient.invalidateQueries({ 
        queryKey: [`/api/inventory-counts/${inventoryId}/items`],
      });
    },
  });
}

/**
 * Kombinierte Funktion zum Erstellen und Verlinken einer Charge in einer Sequenz
 */
export async function createAndLinkBatch({
  item,
  batchNumber,
  expiryDate,
  quantity,
  warehouseId,
  queryClient,
  inventoryId
}: {
  item: InventoryCountItem;
  batchNumber: string;
  expiryDate: string | null;
  quantity: number;
  warehouseId: number;
  queryClient: QueryClient;
  inventoryId: string;
}): Promise<ProductBatch> {
  try {
    // Schritt 1: Erstelle die neue Charge
    const createResponse = await fetch('/api/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: item.productId,
        batchNumber,
        warehouseId,
        expiryDate,
        initialQuantity: quantity,
        currentQuantity: quantity,
        status: 'active'
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Fehler beim Erstellen der Charge: ${createResponse.status}`);
    }

    const newBatch = await createResponse.json();

    // Schritt 2: Verknüpfe die Charge mit dem Inventory-Item
    const linkResponse = await fetch(`/api/inventory-count-items/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batchId: newBatch.id
      }),
    });

    if (!linkResponse.ok) {
      throw new Error(`Fehler beim Verknüpfen der Charge: ${linkResponse.status}`);
    }

    // Schritt 3: Aktualisiere den Cache (ohne Page-Refresh)
    queryClient.invalidateQueries({ 
      queryKey: [`/api/inventory-counts/${inventoryId}/items`],
    });

    return newBatch;
  } catch (error) {
    console.error('Fehler beim Erstellen und Verknüpfen der Charge:', error);
    throw error;
  }
}
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Custom Hook für vereinfachte Inventur-Operationen
export const useSimpleInventory = (inventoryId: number) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Vereinfachte Inventur-Aktion (start/save/complete)
  const inventoryActionMutation = useMutation({
    mutationFn: async ({ action, notes }: { action: 'start' | 'save' | 'complete'; notes?: string }) => {
      console.log(`[SIMPLE-INVENTORY] ${action} für Inventur ${inventoryId}`);
      
      const response = await fetch(`/api/inventory-simple/inventory-counts/${inventoryId}/simple-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, notes }),
      });
      
      const responseText = await response.text();
      console.log(`[SIMPLE-INVENTORY] ${action}-Antwort: Status ${response.status}, Text:`, responseText);
      
      if (!response.ok) {
        throw new Error(`${action} fehlgeschlagen: ${response.status} - ${responseText}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
        if (!result.success) {
          throw new Error(result.error || `${action} fehlgeschlagen`);
        }
      } catch (parseError) {
        console.warn(`[SIMPLE-INVENTORY] JSON-Parse-Fehler:`, parseError);
        // Fallback: Wenn JSON-Parsing fehlschlägt, aber HTTP-Status OK ist
        result = { 
          success: true, 
          message: `${action} erfolgreich`, 
          data: { inventoryId, action, timestamp: new Date().toISOString() }
        };
      }
      
      return result;
    },
    onSuccess: (data, variables) => {
      const { action } = variables;
      
      // Cache invalidieren
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${inventoryId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      
      // Erfolgs-Toast
      const actionMessages = {
        start: 'Inventur erfolgreich gestartet',
        save: 'Inventur erfolgreich zwischengespeichert',
        complete: 'Inventur erfolgreich abgeschlossen'
      };
      
      toast({
        title: "Erfolg",
        description: actionMessages[action],
        variant: "default",
      });
      
      console.log(`[SIMPLE-INVENTORY] ${action} erfolgreich:`, data);
    },
    onError: (error, variables) => {
      const { action } = variables;
      
      console.error(`[SIMPLE-INVENTORY] ${action} fehlgeschlagen:`, error);
      
      const actionMessages = {
        start: 'Inventur konnte nicht gestartet werden',
        save: 'Inventur konnte nicht gespeichert werden',
        complete: 'Inventur konnte nicht abgeschlossen werden'
      };
      
      toast({
        title: "Fehler",
        description: actionMessages[action],
        variant: "destructive",
      });
    },
  });

  // Vereinfachtes Item-Update  
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, countedQuantity, notes }: { itemId: number; countedQuantity?: number; notes?: string }) => {
      console.log(`[SIMPLE-INVENTORY] Update Item ${itemId}: Menge=${countedQuantity}`);
      
      const response = await fetch(`/api/inventory-simple/inventory-count-items/${itemId}/simple`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ countedQuantity, notes }),
      });
      
      const responseText = await response.text();
      console.log(`[SIMPLE-INVENTORY] Item-Update-Antwort: Status ${response.status}, Text:`, responseText);
      
      if (!response.ok) {
        throw new Error(`Item-Update fehlgeschlagen: ${response.status} - ${responseText}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
        if (!result.success) {
          throw new Error(result.error || 'Item-Update fehlgeschlagen');
        }
      } catch (parseError) {
        console.warn(`[SIMPLE-INVENTORY] JSON-Parse-Fehler bei Item-Update:`, parseError);
        result = { 
          success: true, 
          message: 'Item erfolgreich aktualisiert', 
          data: { itemId, countedQuantity, timestamp: new Date().toISOString() }
        };
      }
      
      return result;
    },
    onSuccess: (data, variables) => {
      // Cache invalidieren
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${inventoryId}/items`] });
      
      console.log(`[SIMPLE-INVENTORY] Item ${variables.itemId} erfolgreich aktualisiert:`, data);
    },
    onError: (error, variables) => {
      console.error(`[SIMPLE-INVENTORY] Item ${variables.itemId} Update fehlgeschlagen:`, error);
      
      toast({
        title: "Fehler",
        description: "Item konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    },
  });

  return {
    inventoryActionMutation,
    updateItemMutation,
    isLoading: inventoryActionMutation.isPending || updateItemMutation.isPending
  };
};
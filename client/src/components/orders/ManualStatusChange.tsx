import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// UI Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Icons
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

interface ManualStatusChangeProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
}

// Funktion zur Aktualisierung der Bestellung
const updateOrder = async (id: number, data: any) => {
  const response = await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Fehler beim Aktualisieren der Bestellung");
  }

  return response.json();
};

export default function ManualStatusChange({ order, isOpen, onClose }: ManualStatusChangeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [selectedStatus, setSelectedStatus] = useState<string>(order?.status || "draft");
  const [note, setNote] = useState<string>("");
  
  // Mutations
  const updateOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return updateOrder(order.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${order.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/dashboard/open'] });
      
      toast({
        title: "Status aktualisiert",
        description: "Der Bestellstatus wurde erfolgreich aktualisiert."
      });
      
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  });
  
  // Vereinfachte Statusoptionen
  const statusOptions = [
    { value: "draft", label: "Entwurf" },
    { value: "ordered", label: "Bestellt" },
    { value: "completed", label: "Abgeschlossen" }
  ];
  
  // Status aktualisieren
  const handleStatusChange = async () => {
    if (!order) return;
    
    try {
      // Bestehende Statushistorie als Array verarbeiten
      let currentHistory = [];
      
      try {
        // Versuchen, die Statushistorie zu parsen, wenn sie als String vorliegt
        if (typeof order.statusHistory === 'string' && order.statusHistory) {
          currentHistory = JSON.parse(order.statusHistory);
        } else if (Array.isArray(order.statusHistory)) {
          currentHistory = order.statusHistory;
        }
      } catch (parseError) {
        console.error("Fehler beim Parsen der Statushistorie:", parseError);
        // Fallback zu leerem Array, wenn das Parsing fehlschlägt
        currentHistory = [];
      }
      
      // Neuen Status hinzufügen
      const newStatusEntry = {
        status: selectedStatus,
        timestamp: new Date().toISOString(),
        note: note || `Status manuell auf "${statusOptions.find(s => s.value === selectedStatus)?.label || selectedStatus}" geändert`
      };
      
      // Sicherstellen, dass wir ein Array haben
      const newHistory = Array.isArray(currentHistory) ? [...currentHistory, newStatusEntry] : [newStatusEntry];
      
      // Bestellung aktualisieren
      updateOrderMutation.mutate({
        status: selectedStatus,
        statusHistory: JSON.stringify(newHistory)
      });
      
    } catch (error) {
      toast({
        title: "Fehler beim Aktualisieren",
        description: `${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bestellstatus manuell ändern</DialogTitle>
          <DialogDescription>
            Hier können Sie den Status der Bestellung #{order?.orderNumber || order?.id} manuell ändern.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {order?.status === "completed" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Achtung</AlertTitle>
              <AlertDescription>
                Diese Bestellung ist bereits abgeschlossen. Eine Statusänderung kann unerwünschte Auswirkungen haben.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="status">Neuer Status</Label>
            <Select 
              value={selectedStatus} 
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status auswählen" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="note">Anmerkung (optional)</Label>
            <Textarea
              id="note"
              placeholder="Grund für die manuelle Statusänderung"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleStatusChange}
            disabled={updateOrderMutation.isPending || selectedStatus === order?.status}
          >
            {updateOrderMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird aktualisiert...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Status aktualisieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// UI Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Eigene Komponenten
import { GoodsReceiptForm } from "./GoodsReceiptForm";

// API-Funktionen für den Wareneingang
const receiveOrderItems = async (orderId: number, data: any) => {
  const response = await fetch(`/api/orders/${orderId}/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Fehler beim Erfassen des Wareneingangs");
  }
  
  return response.json();
};

interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null; // Die komplette Bestellung mit allen Positionen
  onComplete: (updatedOrder: any) => void;
}

export default function ReceiveOrderDialog({
  open,
  onOpenChange,
  order,
  onComplete,
}: ReceiveOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("receipt");

  // Eingehende Bestellung verarbeiten
  const processMutation = useMutation({
    mutationFn: (data: any) => receiveOrderItems(order?.id, data),
    onSuccess: (data) => {
      // Cache aktualisieren
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${order?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      // Erfolgsbenachrichtigung
      toast({
        title: "Wareneingang erfasst",
        description: `Der Wareneingang für die Bestellung ${order?.orderNumber} wurde erfolgreich verarbeitet.`,
      });
      
      // Dialog-Callback
      onComplete(data);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Wareneingang",
        description: error.message || "Die Eingangsdaten konnten nicht verarbeitet werden.",
        variant: "destructive",
      });
    },
  });

  // Dialog-Status zurücksetzen, wenn sich der Open-Status ändert
  useEffect(() => {
    if (open) {
      setActiveTab("receipt");
    }
  }, [open]);

  // Wareneingang abbrechen
  const handleCancel = () => {
    onOpenChange(false);
  };

  // Wareneingang abschließen
  const handleComplete = (formData: any) => {
    if (!order) return;
    
    // Mutation auslösen
    processMutation.mutate(formData);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wareneingang erfassen</DialogTitle>
          <DialogDescription>
            Erfassen Sie hier den Wareneingang für Bestellung {order.orderNumber}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="receipt">Wareneingang mit MHD-Erfassung</TabsTrigger>
          </TabsList>
          
          <TabsContent value="receipt" className="mt-4">
            <GoodsReceiptForm 
              order={order} 
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
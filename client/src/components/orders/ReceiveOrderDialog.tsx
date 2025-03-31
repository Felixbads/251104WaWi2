import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { processOrderReceipt } from "@/lib/api";

// UI Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Camera, FileUp, Loader2, PackageCheck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// Schema für die Wareneingangs-Erfassung
const receiveOrderSchema = z.object({
  receiptDate: z.date().default(() => new Date()),
  receiptNumber: z.string().min(1, "Bitte geben Sie eine Wareneingangsnummer ein"),
  notes: z.string().optional(),
  deliveryNoteNumber: z.string().optional(),
  carrierName: z.string().optional(),
  documentsAttached: z.boolean().default(false),
  qualityCheckPassed: z.boolean().default(true),
  receivedItems: z.array(
    z.object({
      orderItemId: z.number(),
      receivedQuantity: z.number().min(0, {
        message: "Die Menge kann nicht negativ sein"
      }),
      damageDescription: z.string().optional(),
      qualityIssues: z.boolean().default(false)
    })
  )
});

type ReceiveOrderValues = z.infer<typeof receiveOrderSchema>;

// Props für die Komponente
interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any; // In echter Implementierung typisch Order
  onComplete: (updatedOrder: any) => void;
}

// Wareneingang-Dialog Komponente
export default function ReceiveOrderDialog({ 
  open, 
  onOpenChange, 
  order, 
  onComplete 
}: ReceiveOrderDialogProps) {
  // Hooks
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);
  
  // Formular
  const form = useForm<ReceiveOrderValues>({
    resolver: zodResolver(receiveOrderSchema),
    defaultValues: {
      receiptDate: new Date(),
      receiptNumber: `WE-${format(new Date(), 'yyyyMMdd')}-${order?.id || '0000'}`,
      deliveryNoteNumber: "",
      notes: "",
      carrierName: "",
      documentsAttached: false,
      qualityCheckPassed: true,
      receivedItems: []
    }
  });
  
  // Wenn sich die Bestellung ändert, Formular aktualisieren
  useEffect(() => {
    if (order && order.orderItems) {
      form.reset({
        ...form.getValues(),
        receiptNumber: `WE-${format(new Date(), 'yyyyMMdd')}-${order.id || '0000'}`,
        receivedItems: order.orderItems.map((item: any) => ({
          orderItemId: item.id,
          receivedQuantity: item.quantity,
          damageDescription: '',
          qualityIssues: false
        }))
      });
    }
  }, [order, form]);
  
  // Wenn Bestellung null ist oder nicht im Status "ordered"/"partial"
  if (!order || (order.status !== "ordered" && order.status !== "partial")) {
    return null;
  }
  
  // API-Mutation für Wareneingang
  const receiptMutation = useMutation({
    mutationFn: (data: ReceiveOrderValues) => {
      return processOrderReceipt(order.id, {
        receiptDate: data.receiptDate,
        receiptNumber: data.receiptNumber,
        deliveryNoteNumber: data.deliveryNoteNumber,
        qualityCheckPassed: data.qualityCheckPassed,
        notes: data.notes,
        receivedItems: data.receivedItems
      });
    },
    onSuccess: (updatedOrder) => {
      // Bestelldaten im Cache aktualisieren
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders', order.id] });
      
      // Prüfen, ob komplett oder teilweise geliefert
      const complete = updatedOrder.status === "completed";
      
      // Erfolg anzeigen
      toast({
        title: complete ? "Wareneingang vollständig erfasst" : "Teillieferung erfasst",
        description: `Die Bestellung ${order.orderNumber} wurde aktualisiert.`,
      });
      
      // Callback aufrufen
      onComplete(updatedOrder);
    },
    onError: (error) => {
      console.error("Fehler beim Erfassen des Wareneingangs:", error);
      toast({
        title: "Fehler beim Erfassen des Wareneingangs",
        description: "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
    }
  });

  // Formular absenden
  const onSubmit = async (data: ReceiveOrderValues) => {
    try {
      setIsSubmitting(true);
      console.log("Wareneingang wird erfasst:", data);
      
      // API-Aufruf zum Erfassen des Wareneingangs
      await receiptMutation.mutateAsync(data);
    } catch (error) {
      // Fehler wird bereits in der Mutation behandelt
      console.error("Fehler im Formular-Handler:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Prüfen, ob die Lieferung komplett ist
  const isCompleteDelivery = (receivedItems: any[]) => {
    return receivedItems.every((item) => {
      const orderItem = order.orderItems.find((oi: any) => oi.id === item.orderItemId);
      return item.receivedQuantity >= orderItem.quantity;
    });
  };
  
  // Unvollständigen Wareneingang prüfen
  const hasPartialReceipt = form.watch('receivedItems').some(
    (item) => {
      const orderItem = order.orderItems.find((oi: any) => oi.id === item.orderItemId);
      return orderItem && item.receivedQuantity > 0 && item.receivedQuantity < orderItem.quantity;
    }
  );
  
  // Fehlenden Wareneingang prüfen
  const hasMissingItems = form.watch('receivedItems').some(
    (item) => item.receivedQuantity === 0
  );
  
  // Datei-Upload Handler
  const handleFileUpload = () => {
    // In echter Implementierung: Datei hochladen
    setHasUploaded(true);
    toast({
      title: "Datei hochgeladen",
      description: "Der Lieferschein wurde erfolgreich hochgeladen."
    });
    form.setValue('documentsAttached', true);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center">
            <PackageCheck className="h-5 w-5 mr-2 text-primary" />
            Wareneingang erfassen
          </DialogTitle>
          <DialogDescription>
            Bestellung {order.orderNumber} von {order.supplierName} für {order.locationName || "Hauptlager"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <FormField
                control={form.control}
                name="receiptDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eingangsdatum</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        value={format(field.value || new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => {
                          const date = new Date(e.target.value);
                          field.onChange(date);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="receiptNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wareneingangsnummer</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="deliveryNoteNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferscheinnummer</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="z.B. LS-12345" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center space-x-6 mb-4">
              <FormField
                control={form.control}
                name="documentsAttached"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel>Lieferschein beigefügt</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="qualityCheckPassed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel>Qualitätsprüfung bestanden</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            <Card className="mb-4">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Dokumente hochladen</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-md p-4 flex flex-col items-center justify-center text-center">
                  <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="font-medium">Lieferschein hochladen</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    PDF, JPG oder PNG Datei
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    onClick={handleFileUpload}
                  >
                    Datei auswählen
                  </Button>
                </div>
                
                <div className="border rounded-md p-4 flex flex-col items-center justify-center text-center">
                  <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="font-medium">Foto aufnehmen</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Dokumentieren Sie den Zustand der Lieferung
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    onClick={handleFileUpload}
                  >
                    Kamera öffnen
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <div className="flex-1 overflow-hidden">
              <h3 className="text-lg font-medium mb-2">Wareneingang Positionen</h3>
              
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">Pos.</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Bestellt</TableHead>
                      <TableHead className="text-right">Erhalten</TableHead>
                      <TableHead>Qualität</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.orderItems.map((item: any, index: number) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.positionNumber || index + 1}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity} {item.unit || 'stk'}
                        </TableCell>
                        <TableCell className="text-right">
                          <FormField
                            control={form.control}
                            name={`receivedItems.${index}.receivedQuantity`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    className="w-20 text-right"
                                    onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`receivedItems.${index}.qualityIssues`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-0 text-sm">
                                  {field.value ? "Problem" : "OK"}
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          {form.watch(`receivedItems.${index}.qualityIssues`) && (
                            <FormField
                              control={form.control}
                              name={`receivedItems.${index}.damageDescription`}
                              render={({ field }) => (
                                <FormItem className="mt-2">
                                  <FormControl>
                                    <Textarea
                                      {...field}
                                      placeholder="Beschreibung der Mängel"
                                      className="text-sm h-20"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            
            {(hasPartialReceipt || hasMissingItems) && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {hasMissingItems ? "Unvollständige Lieferung" : "Teillieferung"}
                </AlertTitle>
                <AlertDescription>
                  {hasMissingItems
                    ? "Einige bestellte Artikel wurden nicht geliefert. Die Bestellung bleibt im Status 'Teilgeliefert'."
                    : "Nicht alle bestellten Mengen wurden vollständig geliefert. Die Bestellung wird als 'Teilgeliefert' markiert."}
                </AlertDescription>
              </Alert>
            )}
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Anmerkungen zum Wareneingang</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Zusätzliche Informationen zum Wareneingang..."
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormDescription>
                    Dokumentieren Sie hier besondere Vorkommnisse oder Abweichungen.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
              <Button 
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <PackageCheck className="h-4 w-4 mr-2" />
                Wareneingang abschließen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
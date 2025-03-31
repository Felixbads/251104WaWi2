import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

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
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Camera, FileUp, PackageCheck, Truck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Schema für die Wareneingangs-Erfassung
const receiveOrderSchema = z.object({
  receiptDate: z.date().default(() => new Date()),
  receiptNumber: z.string().optional(),
  notes: z.string().optional(),
  deliveryNoteNumber: z.string().optional(),
  carrierName: z.string().optional(),
  documentsAttached: z.boolean().default(false),
  qualityCheckPassed: z.boolean().default(true),
  customsChecked: z.boolean().default(false),
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
  // Zustände
  const [hasUploaded, setHasUploaded] = useState(false);
  const [showQualityIssues, setShowQualityIssues] = useState(false);
  
  // Formular
  const form = useForm<ReceiveOrderValues>({
    resolver: zodResolver(receiveOrderSchema),
    defaultValues: {
      receiptDate: new Date(),
      receiptNumber: `WE-${format(new Date(), 'yyyyMMdd')}-${order?.id || '0000'}`,
      receivedItems: order?.orderItems?.map((item: any) => ({
        orderItemId: item.id,
        receivedQuantity: item.quantity,
        damageDescription: '',
        qualityIssues: false
      })) || []
    }
  });
  
  // Wenn Bestellung null ist oder nicht im Status "ordered"/"partial"
  if (!order || (order.status !== "ordered" && order.status !== "partial")) {
    return null;
  }
  
  // Formular absenden
  const onSubmit = (data: ReceiveOrderValues) => {
    console.log("Wareneingang erfasst:", data);
    
    // In echter Implementierung: API-Aufruf zur Aktualisierung der Bestellung
    // ...
    
    // Demo: Bestellung aktualisieren und zurückgeben
    const updatedOrder = {
      ...order,
      status: "delivered",
      actualDeliveryDate: data.receiptDate.toISOString(),
      // Weitere Aktualisierungen...
    };
    
    onComplete(updatedOrder);
  };
  
  // Unvollständigen Wareneingang prüfen
  const hasPartialReceipt = form.watch('receivedItems').some(
    (item) => {
      const orderItem = order.orderItems.find((oi: any) => oi.id === item.orderItemId);
      return item.receivedQuantity > 0 && item.receivedQuantity < orderItem.quantity;
    }
  );
  
  // Fehlenden Wareneingang prüfen
  const hasMissingItems = form.watch('receivedItems').some(
    (item) => item.receivedQuantity === 0
  );
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center">
            <PackageCheck className="h-5 w-5 mr-2 text-primary" />
            Wareneingang erfassen
          </DialogTitle>
          <DialogDescription>
            Bestellung {order.orderNumber} von {order.supplierName} für {order.locationName}
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
                        value={format(field.value, 'yyyy-MM-dd')}
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
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          setShowQualityIssues(!checked);
                        }}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel>Qualitätsprüfung bestanden</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="customsChecked"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel>Zollprüfung (wenn erforderlich)</FormLabel>
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
                  <Button variant="outline" size="sm" type="button">
                    Datei auswählen
                  </Button>
                </div>
                
                <div className="border rounded-md p-4 flex flex-col items-center justify-center text-center">
                  <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="font-medium">Foto aufnehmen</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Dokumentieren Sie den Zustand der Lieferung
                  </p>
                  <Button variant="outline" size="sm" type="button">
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
                        <TableCell>{item.positionNumber}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity} {item.unit}
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
              <Alert variant="warning" className="mt-4">
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
              <Button type="submit">
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
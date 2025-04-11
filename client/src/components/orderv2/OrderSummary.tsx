import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Loader2, Check, AlertTriangle, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Alert, 
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";

type OrderSummaryProps = {
  warehouseName: string;
  supplierName: string;
  selectedProducts: any[];
  additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  };
  onSubmit: () => void;
  isSubmitting: boolean;
};

const OrderSummary: React.FC<OrderSummaryProps> = ({
  warehouseName,
  supplierName,
  selectedProducts,
  additionalInfo,
  onSubmit,
  isSubmitting
}) => {
  // Calculate totals
  const totalItems = selectedProducts.length;
  const totalQuantity = selectedProducts.reduce((sum, product) => sum + product.orderQuantity, 0);
  const totalAmount = selectedProducts.reduce((sum, product) => sum + (product.price || 0) * product.orderQuantity, 0);
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };
  
  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return 'Nicht angegeben';
    return format(date, 'PPP', { locale: de });
  };
  
  // Get priority label
  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'Hoch';
      case 'urgent':
        return 'Dringend';
      default:
        return 'Normal';
    }
  };
  
  // Get priority badge variant
  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'secondary';
      case 'urgent':
        return 'destructive';
      default:
        return 'outline';
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Order Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Bestelldetails</CardTitle>
            <CardDescription>Übersicht der Bestellinformationen</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex flex-col">
                <dt className="text-sm font-medium text-muted-foreground">Lieferant</dt>
                <dd className="text-base">{supplierName}</dd>
              </div>
              
              <div className="flex flex-col">
                <dt className="text-sm font-medium text-muted-foreground">Ziellager</dt>
                <dd className="text-base">{warehouseName}</dd>
              </div>
              
              <div className="flex flex-col">
                <dt className="text-sm font-medium text-muted-foreground">Gewünschter Liefertermin</dt>
                <dd className="text-base">{formatDate(additionalInfo.expectedDeliveryDate)}</dd>
              </div>
              
              <div className="flex flex-col">
                <dt className="text-sm font-medium text-muted-foreground">Priorität</dt>
                <dd className="flex items-center">
                  <Badge variant={getPriorityBadgeVariant(additionalInfo.priority)}>
                    {getPriorityLabel(additionalInfo.priority)}
                  </Badge>
                </dd>
              </div>
              
              {additionalInfo.notes && (
                <div className="flex flex-col">
                  <dt className="text-sm font-medium text-muted-foreground">Anmerkungen</dt>
                  <dd className="text-base whitespace-pre-line">{additionalInfo.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
        
        {/* Order Totals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Bestellübersicht</CardTitle>
            <CardDescription>Zusammenfassung der Bestellung</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-muted-foreground">Anzahl Positionen</dt>
                <dd className="text-base font-medium">{totalItems}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-muted-foreground">Gesamtmenge</dt>
                <dd className="text-base font-medium">{totalQuantity} Stk.</dd>
              </div>
              
              <Separator />
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-muted-foreground">Zwischensumme</dt>
                <dd className="text-base font-medium">{formatCurrency(totalAmount)}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-muted-foreground">MwSt.</dt>
                <dd className="text-base font-medium">{formatCurrency(totalAmount * 0.19)}</dd>
              </div>
              
              <Separator />
              
              <div className="flex justify-between">
                <dt className="text-base font-medium">Gesamtbetrag</dt>
                <dd className="text-lg font-bold">{formatCurrency(totalAmount * 1.19)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      
      {/* Order Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>Übersicht aller bestellten Produkte</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Produkt</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                  <TableHead className="text-right">Einzelpreis</TableHead>
                  <TableHead className="text-right">Gesamtpreis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProducts.map((product, index) => (
                  <TableRow key={product.id || index}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">{product.orderQuantity} {product.unit || 'Stk.'}</TableCell>
                    <TableCell className="text-right">
                      {product.price 
                        ? formatCurrency(product.price)
                        : 'Auf Anfrage'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {product.price 
                        ? formatCurrency(product.price * product.orderQuantity)
                        : 'Auf Anfrage'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          
          {selectedProducts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Keine Produkte ausgewählt. Bitte kehren Sie zum vorherigen Schritt zurück.
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Submit Section */}
      <Alert variant="info" className="bg-blue-50 dark:bg-blue-950">
        <Info className="h-4 w-4" />
        <AlertTitle>Hinweis zur Bestellaufgabe</AlertTitle>
        <AlertDescription>
          Nach dem Abschicken wird eine Bestell-PDF erstellt und kann per E-Mail an den Lieferanten gesendet werden.
          Der Status der Bestellung wird auf "bestellt" gesetzt und in der Liste der anstehenden Lieferungen angezeigt.
        </AlertDescription>
      </Alert>
      
      {selectedProducts.length === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Keine Produkte ausgewählt</AlertTitle>
          <AlertDescription>
            Bitte wählen Sie mindestens ein Produkt aus, bevor Sie die Bestellung aufgeben.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex justify-end">
        <Button 
          onClick={onSubmit}
          disabled={isSubmitting || selectedProducts.length === 0}
          className="w-full sm:w-auto"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Bestellung wird gespeichert...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Bestellung aufgeben
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default OrderSummary;
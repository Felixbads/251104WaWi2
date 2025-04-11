import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  ArrowRight, 
  Loader2, 
  Building, 
  Truck, 
  Calendar, 
  FileText, 
  CreditCard, 
  Truck as TruckIcon,
  Info,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const subtotal = selectedProducts.reduce(
    (sum, product) => sum + product.price * product.orderQuantity,
    0
  );
  
  // Assume VAT is 19%
  const vat = subtotal * 0.19;
  const total = subtotal + vat;
  
  // Get priority label
  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'Niedrig';
      case 'normal':
        return 'Normal';
      case 'high':
        return 'Hoch';
      case 'urgent':
        return 'Dringend';
      default:
        return priority;
    }
  };
  
  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'text-blue-500';
      case 'normal':
        return 'text-green-500';
      case 'high':
        return 'text-orange-500';
      case 'urgent':
        return 'text-red-500';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bestellzusammenfassung</CardTitle>
          <CardDescription>
            Überprüfen Sie Ihre Bestellung vor dem Abschluss
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Lieferant</h3>
                <div className="flex items-center">
                  <Truck className="h-4 w-4 mr-2 text-primary" />
                  <span className="font-medium">{supplierName}</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Ziellager</h3>
                <div className="flex items-center">
                  <Building className="h-4 w-4 mr-2 text-primary" />
                  <span className="font-medium">{warehouseName}</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Priorität</h3>
                <div className="flex items-center">
                  <AlertTriangle className={`h-4 w-4 mr-2 ${getPriorityColor(additionalInfo.priority)}`} />
                  <span className={`font-medium ${getPriorityColor(additionalInfo.priority)}`}>
                    {getPriorityLabel(additionalInfo.priority)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Bestelldatum</h3>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-primary" />
                  <span className="font-medium">{format(new Date(), 'PPP', { locale: de })}</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Erwartetes Lieferdatum</h3>
                <div className="flex items-center">
                  <TruckIcon className="h-4 w-4 mr-2 text-primary" />
                  <span className="font-medium">
                    {additionalInfo.expectedDeliveryDate
                      ? format(additionalInfo.expectedDeliveryDate, 'PPP', { locale: de })
                      : 'Nicht angegeben'}
                  </span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Zahlungsbedingungen</h3>
                <div className="flex items-center">
                  <CreditCard className="h-4 w-4 mr-2 text-primary" />
                  <span className="font-medium">30 Tage nach Rechnungseingang</span>
                </div>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div>
            <h3 className="text-lg font-medium mb-3">Bestellte Produkte</h3>
            <div className="border rounded-md">
              <ScrollArea className="max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Preis</TableHead>
                      <TableHead className="text-right">Summe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.productName}</TableCell>
                        <TableCell className="text-right">{product.orderQuantity}</TableCell>
                        <TableCell className="text-right">{product.price.toFixed(2)} €</TableCell>
                        <TableCell className="text-right">
                          {(product.price * product.orderQuantity).toFixed(2)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
          
          {additionalInfo.notes && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Anmerkungen</h3>
              <div className="flex items-start mt-1">
                <FileText className="h-4 w-4 mr-2 mt-0.5 text-primary" />
                <p className="text-sm">{additionalInfo.notes}</p>
              </div>
            </div>
          )}
          
          <div className="bg-muted p-4 rounded-md">
            <div className="flex justify-between mb-2">
              <span>Zwischensumme</span>
              <span>{subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>MwSt. (19%)</span>
              <span>{vat.toFixed(2)} €</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium text-lg">
              <span>Gesamtsumme</span>
              <span>{total.toFixed(2)} €</span>
            </div>
          </div>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Hinweis zur Bestellung</AlertTitle>
            <AlertDescription>
              Mit dem Abschluss der Bestellung wird diese als Entwurf gespeichert. Sie können die Bestellung anschließend per E-Mail an den Lieferanten senden.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={onSubmit} disabled={isSubmitting} className="w-full md:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Bestellung wird erstellt...
              </>
            ) : (
              <>
                Bestellung abschließen
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default OrderSummary;
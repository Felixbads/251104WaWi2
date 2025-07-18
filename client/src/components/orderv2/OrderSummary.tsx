import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardList, 
  Save, 
  Printer, 
  Send,
  Loader2,
  BuildingIcon,
  Truck,
  CalendarIcon,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  calculatePackageInfo, 
  formatPackageDisplay, 
  formatTotalQuantity, 
  formatOrderSummaryPackage 
} from '../../../../shared/package-utils';

interface OrderSummaryProps {
  warehouseName: string;
  supplierName: string;
  selectedProducts: any[];
  additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
    deliveryType: string;
    deliveryAddress: string;
    pickupLocation: string;
  };
  onCreateOrder: () => void;
  isCreatingOrder: boolean;
  onSendOrderEmail?: () => void;
  pdfBlob?: Blob | null;
  orderId?: number | null;
  orderData?: any;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({
  warehouseName,
  supplierName,
  selectedProducts,
  additionalInfo,
  onCreateOrder,
  isCreatingOrder,
  onSendOrderEmail,
  pdfBlob,
  orderId,
  orderData
}) => {
  // Calculate total with package logic and safety checks
  const total = Array.isArray(selectedProducts) ? selectedProducts.reduce((sum, product) => {
    const price = product?.price || 0;
    let quantity = product?.orderQuantity || 0;
    
    // Apply package logic if package information is available
    if (product?.packageSize && product?.packageQuantity) {
      const packageInfo = calculatePackageInfo(product);
      quantity = packageInfo.totalQuantity;
    }
    
    return sum + (price * quantity);
  }, 0) : 0;
  
  // Get priority display text and color
  const getPriorityInfo = (priority: string) => {
    switch (priority) {
      case 'low':
        return { text: 'Niedrig', color: 'bg-blue-100 text-blue-800' };
      case 'normal':
        return { text: 'Normal', color: 'bg-green-100 text-green-800' };
      case 'high':
        return { text: 'Hoch', color: 'bg-amber-100 text-amber-800' };
      case 'urgent':
        return { text: 'Dringend', color: 'bg-red-100 text-red-800' };
      default:
        return { text: 'Normal', color: 'bg-green-100 text-green-800' };
    }
  };
  
  const priorityInfo = getPriorityInfo(additionalInfo.priority);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellzusammenfassung</CardTitle>
        <CardDescription>
          Überprüfen Sie Ihre Bestellung vor dem Absenden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Order overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <div className="font-medium text-muted-foreground">Ziel:</div>
            <div className="flex items-center">
              <BuildingIcon className="h-4 w-4 mr-2 text-primary" />
              <span>{warehouseName}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-muted-foreground">Lieferant:</div>
            <div className="flex items-center">
              <Truck className="h-4 w-4 mr-2 text-primary" />
              <span>{supplierName}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-muted-foreground">Lieferdatum:</div>
            <div className="flex items-center">
              <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
              <span>
                {additionalInfo.expectedDeliveryDate 
                  ? format(additionalInfo.expectedDeliveryDate, 'PPP', { locale: de })
                  : 'Nicht festgelegt'}
              </span>
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Priority */}
        <div className="flex items-center">
          <span className="text-sm font-medium mr-2">Priorität:</span>
          <Badge className={priorityInfo.color} variant="outline">
            {priorityInfo.text}
          </Badge>
        </div>
        
        {/* Delivery Type */}
        {additionalInfo.deliveryType && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Lieferart:</div>
            <div className="flex items-center">
              <Truck className="h-4 w-4 mr-2 text-primary" />
              <span>{additionalInfo.deliveryType === 'delivery' ? 'Anlieferung' : 'Abholung'}</span>
            </div>
            {additionalInfo.deliveryType === 'delivery' && additionalInfo.deliveryAddress && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="font-medium mb-1">Lieferadresse:</div>
                <div className="whitespace-pre-wrap">{additionalInfo.deliveryAddress}</div>
              </div>
            )}
            {additionalInfo.deliveryType === 'pickup' && additionalInfo.pickupLocation && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="font-medium mb-1">Abholort:</div>
                <div>{additionalInfo.pickupLocation}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes if present */}
        {additionalInfo.notes && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Notizen:</div>
            <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
              {additionalInfo.notes}
            </div>
          </div>
        )}
        
        {/* Products table */}
        <div>
          <div className="text-sm font-medium mb-2">Produkte:</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead className="text-right">Artikelnummer</TableHead>
                <TableHead className="text-right">Lieferanten-Art.-Nr.</TableHead>
                <TableHead className="text-right">Gebinde</TableHead>
                <TableHead className="text-right">Anzahl Gebinde</TableHead>
                <TableHead className="text-right">Gesamtanzahl</TableHead>
                <TableHead className="text-right">Einzelpreis</TableHead>
                <TableHead className="text-right">Gesamt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(selectedProducts) ? selectedProducts.map((product, index) => {
                const orderSummaryPackage = formatOrderSummaryPackage(product);
                const unitPrice = product?.price || 0;
                const totalPrice = (product?.orderQuantity || 0) * unitPrice;

                return (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{product?.name || ''}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{orderSummaryPackage.articleNumber}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{orderSummaryPackage.supplierArticleNumber}</TableCell>
                    <TableCell className="text-right text-sm">{orderSummaryPackage.packageDisplay}</TableCell>
                    <TableCell className="text-right">{orderSummaryPackage.packageCount}</TableCell>
                    <TableCell className="text-right font-medium">{orderSummaryPackage.totalQuantity}</TableCell>
                    <TableCell className="text-right">{unitPrice.toFixed(2)} €</TableCell>
                    <TableCell className="text-right font-medium">{totalPrice.toFixed(2)} €</TableCell>
                  </TableRow>
                );
              }) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>Gesamtsumme</TableCell>
                <TableCell className="text-right font-bold">
                  {Array.isArray(selectedProducts) ? 
                    selectedProducts.reduce((sum, product) => {
                      const quantity = product?.orderQuantity || 0;
                      const unitPrice = product?.price || 0;
                      const vatRate = product?.vatRate || 19;
                      const netPrice = unitPrice / (1 + vatRate / 100);
                      return sum + (quantity * netPrice);
                    }, 0).toFixed(2) : '0.00'} €
                </TableCell>
                <TableCell className="text-right font-bold">
                  {Array.isArray(selectedProducts) ? 
                    selectedProducts.reduce((sum, product) => {
                      const quantity = product?.orderQuantity || 0;
                      const unitPrice = product?.price || 0;
                      const vatRate = product?.vatRate || 19;
                      const netPrice = unitPrice / (1 + vatRate / 100);
                      const vatAmount = unitPrice - netPrice;
                      return sum + (quantity * vatAmount);
                    }, 0).toFixed(2) : '0.00'} €
                </TableCell>
                <TableCell className="text-right font-bold">{total.toFixed(2)} €</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        
        {/* Warning if no prices are set */}
        {Array.isArray(selectedProducts) && selectedProducts.some(product => !product?.price) && (
          <div className="flex items-center bg-amber-100 text-amber-800 p-3 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <span>Einige Produkte haben keinen Preis. Die Gesamtsumme kann unvollständig sein.</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button 
          onClick={onCreateOrder}
          disabled={isCreatingOrder}
          className="w-full sm:w-auto"
        >
          {isCreatingOrder ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Bestellung wird erstellt...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Bestellung erstellen
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default OrderSummary;
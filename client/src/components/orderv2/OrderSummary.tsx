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

interface OrderSummaryProps {
  warehouseName: string;
  supplierName: string;
  selectedProducts: any[];
  additionalInfo: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
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
  // Calculate total with safety checks
  const total = Array.isArray(selectedProducts) ? selectedProducts.reduce((sum, product) => {
    const price = product?.price || 0;
    const quantity = product?.orderQuantity || 0;
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
                <TableHead className="text-right">Einheitspreis</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead className="text-right">Gesamt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(selectedProducts) ? selectedProducts.map((product, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{product?.name || ''}</TableCell>
                  <TableCell className="text-right">{(product?.price || 0).toFixed(2)} €</TableCell>
                  <TableCell className="text-right">{product?.orderQuantity || 0}</TableCell>
                  <TableCell className="text-right">
                    {((product?.price || 0) * (product?.orderQuantity || 0)).toFixed(2)} €
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Gesamtsumme</TableCell>
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
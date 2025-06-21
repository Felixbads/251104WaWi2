import React, { useState } from 'react';
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  CheckSquare, 
  AlertTriangle, 
  Package, 
  CalendarCheck, 
  Loader2,
  Save,
  Mail,
  Camera,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface OrderItem {
  id: number;
  name?: string;
  productName?: string; // API kann auch productName statt name zurückgeben
  orderedQuantity: number;
  receivedQuantity?: number;
  price?: number;
  unitPrice?: number; // API kann auch unitPrice statt price zurückgeben
  damaged?: boolean;
  comment?: string;
  expiryDate?: string; // MHD für die Batch-Erstellung
}

interface GoodsReceiptFormProps {
  order: any; // Make the type more flexible to accommodate different API structures
  onSubmit?: (receivedItems: OrderItem[], receiptNote: string, documents: File[]) => void;
  onSaveComplete?: (receivedItems: OrderItem[]) => void;
  isSubmitting: boolean;
}

const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({
  order,
  onSubmit,
  onSaveComplete,
  isSubmitting
}) => {
  // Defensive programming to handle potentially undefined or malformed order data
  if (!order) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Bestelldaten verfügbar</h3>
            <p className="text-muted-foreground mb-4">
              Die Bestelldaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
            </p>
            <Button onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Sicherstellen, dass wir die richtigen Bestellungsposten haben (entweder items oder orderItems)
  // API gibt tatsächlich orderItems zurück, nicht items
  const orderItems = (order.orderItems && Array.isArray(order.orderItems)) ? 
                    order.orderItems : 
                    (order.items && Array.isArray(order.items)) ? 
                    order.items : [];

  console.log('[GoodsReceiptForm] Order data:', order);
  console.log('[GoodsReceiptForm] OrderItems found:', orderItems);
  
  // If no items found, show error state
  if (orderItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Bestellpositionen verfügbar</h3>
            <p className="text-muted-foreground mb-4">
              Die Bestellpositionen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
            </p>
            <Button onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const [receivedItems, setReceivedItems] = useState<OrderItem[]>(
    orderItems.map(item => ({
      ...item,
      // Wichtig: orderItemId für die API-Übertragung (aus der Datenbank-ID)
      orderItemId: item.id || item.orderItemId,
      // Stellen sicher, dass der Name vorhanden ist (entweder name oder productName)
      name: item.name || item.product_name || item.productName || 'Artikel ohne Namen',
      // Stellen sicher, dass die orderedQuantity korrekt ist (kann orderQuantity, orderedQuantity oder quantity sein)
      orderedQuantity: item.orderQuantity || item.orderedQuantity || item.quantity || 0,
      receivedQuantity: item.orderQuantity || item.orderedQuantity || item.quantity || 0,
      damaged: false,
      comment: '',
      expiryDate: '' // Leeres Feld für MHD hinzufügen
    }))
  );
  
  const [receiptNote, setReceiptNote] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  
  // Calculate total received vs ordered
  const totalOrdered = orderItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const totalReceived = receivedItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
  const isComplete = totalReceived === totalOrdered;
  const hasDiscrepancies = receivedItems.some(item => 
    item.receivedQuantity !== item.orderedQuantity || item.damaged
  );
  
  // Handle input change
  const handleQuantityChange = (id: number, receivedQuantity: number) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, receivedQuantity } : item
      )
    );
  };
  
  // Handle damaged state change
  const handleDamagedChange = (id: number, damaged: boolean) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, damaged } : item
      )
    );
  };
  
  // Handle comment change
  const handleCommentChange = (id: number, comment: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, comment } : item
      )
    );
  };
  
  // Handler für MHD-Änderung
  const handleExpiryDateChange = (id: number, expiryDate: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, expiryDate } : item
      )
    );
  };
  
  // Handle document upload
  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setDocuments(prev => [...prev, ...newFiles]);
    }
  };
  
  // Remove document
  const removeDocument = (index: number) => {
    setDocuments(docs => docs.filter((_, i) => i !== index));
  };
  
  // Handle submit
  const handleSubmit = () => {
    console.log('[GoodsReceiptForm] Submitting received items:', receivedItems);
    
    if (onSubmit) {
      onSubmit(receivedItems, receiptNote, documents);
    }
    
    if (onSaveComplete) {
      onSaveComplete(receivedItems);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wareneingang erfassen</CardTitle>
        <CardDescription>
          Erfassen Sie den Wareneingang für Bestellung {order.orderNumber}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Order info summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Bestellnummer:</div>
            <div className="font-medium">{order.orderNumber}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Bestelldatum:</div>
            <div className="font-medium">
              {order.orderDate && !isNaN(new Date(order.orderDate).getTime()) 
                ? format(new Date(order.orderDate), 'PPP', { locale: de })
                : order.created_at && !isNaN(new Date(order.created_at).getTime())
                ? format(new Date(order.created_at), 'PPP', { locale: de })
                : 'Datum nicht verfügbar'
              }
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Lager:</div>
            <div className="font-medium">{order.warehouseName}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Lieferant:</div>
            <div className="font-medium">{order.supplierName}</div>
          </div>
        </div>
        
        {/* Status indicators */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={isComplete ? "success" : "outline"} className="flex items-center gap-1">
            {isComplete ? <CheckSquare className="h-3 w-3" /> : null}
            {isComplete ? "Vollständig" : "Unvollständig"}
          </Badge>
          
          {hasDiscrepancies && (
            <Badge variant="warning" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Abweichungen
            </Badge>
          )}
          
          <Badge variant="outline" className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {totalReceived} von {totalOrdered} Artikeln
          </Badge>
          
          <Badge variant="outline" className="flex items-center gap-1">
            <CalendarCheck className="h-3 w-3" />
            Eingang: {format(new Date(), 'PPP', { locale: de })}
          </Badge>
        </div>
        
        {/* Receipt note */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Anmerkungen zum Wareneingang</label>
          <Textarea 
            placeholder="Fügen Sie hier allgemeine Hinweise zum Wareneingang hinzu" 
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            rows={3}
          />
        </div>
        
        {/* Document upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Dokumente hochladen (Lieferschein, Fotos, etc.)</label>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => document.getElementById('document-upload')?.click()}>
              <Mail className="mr-2 h-4 w-4" />
              Dokument hinzufügen
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => document.getElementById('photo-upload')?.click()}>
              <Camera className="mr-2 h-4 w-4" />
              Foto hinzufügen
            </Button>
            <input 
              id="document-upload" 
              type="file" 
              multiple 
              onChange={handleDocumentUpload} 
              className="hidden" 
            />
            <input 
              id="photo-upload" 
              type="file" 
              accept="image/*" 
              multiple 
              onChange={handleDocumentUpload} 
              className="hidden" 
            />
          </div>
          
          {/* Document list */}
          {documents.length > 0 && (
            <div className="mt-2">
              <div className="text-sm mb-1">Hochgeladene Dokumente:</div>
              <div className="flex flex-wrap gap-2">
                {documents.map((doc, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {doc.type.startsWith('image/') ? (
                      <Camera className="h-3 w-3" />
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    <span className="max-w-[200px] truncate">{doc.name}</span>
                    <button 
                      type="button" 
                      onClick={() => removeDocument(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Products table */}
        <div>
          <div className="text-sm font-medium mb-2">Artikel:</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Artikel</TableHead>
                <TableHead className="text-right">Bestellt</TableHead>
                <TableHead className="text-right">Erhalten</TableHead>
                <TableHead className="text-right hidden md:table-cell">Preis</TableHead>
                <TableHead className="text-center">MHD</TableHead>
                <TableHead className="hidden md:table-cell">Anmerkung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivedItems.map((item) => {
                const isDifferent = item.receivedQuantity !== item.orderedQuantity;
                
                return (
                  <TableRow key={item.id} className={item.damaged ? 'bg-destructive/10' : isDifferent ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`damaged-${item.id}`}
                          checked={item.damaged}
                          onCheckedChange={(checked) => handleDamagedChange(item.id, !!checked)}
                        />
                        <label 
                          htmlFor={`damaged-${item.id}`}
                          className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Beschädigt
                        </label>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{item.name || item.productName || 'Unbekannter Artikel'}</TableCell>
                    <TableCell className="text-right">{item.orderedQuantity}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        value={item.receivedQuantity}
                        onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                        className={`w-16 h-8 text-center float-right ${
                          item.receivedQuantity !== item.orderedQuantity ? "border-amber-500" : ""
                        }`}
                      />
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">{(item.price || item.unitPrice || 0).toFixed(2)} €</TableCell>

                    <TableCell>
                      <Input
                        type="date"
                        value={item.expiryDate || ''}
                        onChange={(e) => handleExpiryDateChange(item.id, e.target.value)}
                        className="w-32 h-8 text-xs"
                        placeholder="TT.MM.JJJJ"
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Input
                        type="text"
                        placeholder="Anmerkung"
                        value={item.comment || ''}
                        onChange={(e) => handleCommentChange(item.id, e.target.value)}
                        className="text-xs"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {/* Mobile comments for items */}
        <div className="block md:hidden">
          <div className="text-sm font-medium mb-2">Anmerkungen zu einzelnen Artikeln:</div>
          {receivedItems.map((item) => (
            <div key={`comment-${item.id}`} className="mb-2">
              <div className="text-xs font-medium mb-1">{item.name}:</div>
              <Input
                type="text"
                placeholder="Anmerkung"
                value={item.comment || ''}
                onChange={(e) => handleCommentChange(item.id, e.target.value)}
                className="text-xs"
              />
            </div>
          ))}
        </div>
        
        {/* Warning for discrepancies */}
        {hasDiscrepancies && (
          <Alert variant="destructive" className="bg-amber-50 border-amber-300 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Achtung</AlertTitle>
            <AlertDescription>
              Es gibt Abweichungen zwischen der bestellten und der erhaltenen Ware. 
              Bitte stellen Sie sicher, dass alle Anmerkungen erfasst sind.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wareneingang wird erfasst...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Wareneingang bestätigen
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default GoodsReceiptForm;
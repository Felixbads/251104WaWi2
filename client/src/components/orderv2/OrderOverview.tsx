import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Building2, 
  Truck, 
  Calendar, 
  Euro, 
  Package, 
  Clock,
  Mail,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle,
  Edit,
  Send,
  Download,
  Printer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import OrderStatusWorkflow from './OrderStatusWorkflow';

// Interfaces
interface OrderOverviewProps {
  order: any; // Complete order data
  onNavigateToStep?: (step: string) => void;
  onEditOrder?: () => void;
  onSendEmail?: () => void;
  onDownloadPdf?: () => void;
  onPrint?: () => void;
}

// Helper functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getStatusBadge = (status: string) => {
  const statusMap = {
    'draft': { label: 'Entwurf', color: 'bg-gray-100 text-gray-800' },
    'sent': { label: 'Versendet', color: 'bg-blue-100 text-blue-800' },
    'confirmed': { label: 'Bestätigt', color: 'bg-green-100 text-green-800' },
    'shipped': { label: 'Versandt', color: 'bg-purple-100 text-purple-800' },
    'delivered': { label: 'Geliefert', color: 'bg-indigo-100 text-indigo-800' },
    'received': { label: 'Eingegangen', color: 'bg-emerald-100 text-emerald-800' },
    'cancelled': { label: 'Storniert', color: 'bg-red-100 text-red-800' }
  };
  
  const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.draft;
  return (
    <Badge className={statusInfo.color}>
      {statusInfo.label}
    </Badge>
  );
};

const getPriorityBadge = (priority: string) => {
  const priorityMap = {
    'low': { label: 'Niedrig', color: 'bg-gray-100 text-gray-800' },
    'normal': { label: 'Normal', color: 'bg-blue-100 text-blue-800' },
    'high': { label: 'Hoch', color: 'bg-orange-100 text-orange-800' },
    'urgent': { label: 'Dringend', color: 'bg-red-100 text-red-800' }
  };
  
  const priorityInfo = priorityMap[priority as keyof typeof priorityMap] || priorityMap.normal;
  return (
    <Badge variant="outline" className={priorityInfo.color}>
      {priorityInfo.label}
    </Badge>
  );
};

/**
 * OrderOverview - Vollständige Bestellübersicht mit allen relevanten Informationen
 */
const OrderOverview: React.FC<OrderOverviewProps> = ({ 
  order, 
  onNavigateToStep,
  onEditOrder,
  onSendEmail,
  onDownloadPdf,
  onPrint
}) => {
  // Calculate order totals
  const items = order.items || order.orderItems || [];
  const subtotal = items.reduce((sum: number, item: any) => 
    sum + (item.quantity * item.unitPrice), 0);
  const vatAmount = order.vatAmount || (subtotal * 0.19); // 19% MwSt
  const total = order.totalAmount || (subtotal + vatAmount);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bestellübersicht</h1>
          <p className="text-muted-foreground mt-1">
            Bestellung #{order.orderNumber || order.order_number || order.id}
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onEditOrder && (
            <Button variant="outline" onClick={onEditOrder}>
              <Edit className="h-4 w-4 mr-2" />
              Bearbeiten
            </Button>
          )}
          {onSendEmail && (
            <Button variant="outline" onClick={onSendEmail}>
              <Send className="h-4 w-4 mr-2" />
              E-Mail senden
            </Button>
          )}
          {onDownloadPdf && (
            <Button variant="outline" onClick={onDownloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              PDF herunterladen
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" />
              Drucken
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Basic Order Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Bestellinformationen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Bestellnummer</label>
                  <p className="font-mono text-lg">{order.orderNumber || order.order_number || order.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <div className="mt-1">
                    {getStatusBadge(order.status)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Bestelldatum</label>
                  <p>{order.orderDate ? format(new Date(order.orderDate), 'dd.MM.yyyy HH:mm', { locale: de }) : '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Priorität</label>
                  <div className="mt-1">
                    {getPriorityBadge(order.priority || 'normal')}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Erstellt von</label>
                  <p>{order.createdByName || order.created_by_name || 'System'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Warenwert</label>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(total)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Supplier Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Lieferant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">
                    {order.supplierName || order.supplier_name || 'Unbekannter Lieferant'}
                  </h3>
                  {order.supplierCompany && (
                    <p className="text-sm text-gray-600">{order.supplierCompany}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {order.supplierEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span>{order.supplierEmail}</span>
                    </div>
                  )}
                  {order.supplierPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{order.supplierPhone}</span>
                    </div>
                  )}
                  {order.supplierAddress && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span>{order.supplierAddress}</span>
                    </div>
                  )}
                </div>

                {/* Supplier Confirmation Status */}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Lieferantenbestätigung:</span>
                  <div className="flex items-center gap-2">
                    {order.supplierConfirmed || order.supplier_confirmed ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 text-sm">Bestätigt</span>
                        {order.confirmedDate && (
                          <span className="text-xs text-gray-500">
                            ({format(new Date(order.confirmedDate), 'dd.MM.yyyy', { locale: de })})
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span className="text-orange-600 text-sm">Ausstehend</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warehouse Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Lager
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">
                    {order.warehouseName || order.warehouse_name || 'Unbekanntes Lager'}
                  </h3>
                  {order.warehouseLocation && (
                    <p className="text-sm text-gray-600">{order.warehouseLocation}</p>
                  )}
                </div>
                
                {order.deliveryAddress && (
                  <div className="text-sm">
                    <label className="font-medium text-gray-600">Lieferadresse:</label>
                    <p className="mt-1">{order.deliveryAddress}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Delivery Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Lieferinformationen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Geplanter Liefertermin</label>
                  <p className="text-lg">
                    {order.expectedDeliveryDate ? 
                      format(new Date(order.expectedDeliveryDate), 'dd.MM.yyyy', { locale: de }) : 
                      'Nicht festgelegt'
                    }
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Tatsächlicher Liefertermin</label>
                  <p className="text-lg">
                    {order.actualDeliveryDate ? 
                      format(new Date(order.actualDeliveryDate), 'dd.MM.yyyy', { locale: de }) : 
                      'Noch nicht geliefert'
                    }
                  </p>
                </div>
                {order.trackingNumber && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-600">Sendungsverfolgung</label>
                    <p className="font-mono">{order.trackingNumber}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Warenpositionen ({items.length} Artikel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Einzelpreis</TableHead>
                      <TableHead className="text-right">Gesamtpreis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.productName || item.product_name}</p>
                            {item.productDescription && (
                              <p className="text-sm text-gray-500">{item.productDescription}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity} {item.unit || 'Stk'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPrice || item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency((item.quantity || 0) * (item.unitPrice || item.unit_price || 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Order Summary */}
              <Separator className="my-4" />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Zwischensumme:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>MwSt (19%):</span>
                  <span>{formatCurrency(vatAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Gesamtsumme:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notizen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Status Workflow */}
        <div className="space-y-6">
          <OrderStatusWorkflow 
            order={order} 
            onNavigateToStep={onNavigateToStep}
          />
          
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Schnellaktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.status === 'draft' && onSendEmail && (
                <Button className="w-full" onClick={onSendEmail}>
                  <Send className="h-4 w-4 mr-2" />
                  Bestellung versenden
                </Button>
              )}
              
              {(order.status === 'delivered' || order.status === 'shipped') && onNavigateToStep && (
                <Button 
                  className="w-full" 
                  onClick={() => onNavigateToStep('goodsReceipt')}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Wareneingang erfassen
                </Button>
              )}
              
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Bestellung als PDF
              </Button>
              
              <Button variant="outline" className="w-full">
                <Edit className="h-4 w-4 mr-2" />
                Bestellung bearbeiten
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrderOverview;
import React, { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// UI Components
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

// Icons
import {
  ArrowLeft,
  Package,
  ClipboardCheck,
  Clock,
  Copy,
  Edit,
  Send,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// Formatierung des Status
const formatStatus = (status: string) => {
  switch (status) {
    case "draft":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800">Entwurf</Badge>;
    case "ordered":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Bestellt</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-orange-100 text-orange-800">Teilweise geliefert</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-100 text-green-800">Abgeschlossen</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-100 text-red-800">Storniert</Badge>;
    case "pending":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Bestellt</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-green-100 text-green-800">Abgeschlossen</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

// Formatierung der Priorität
const formatPriority = (priority: string) => {
  switch (priority) {
    case "normal":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800">Normal</Badge>;
    case "high":
      return <Badge variant="outline" className="bg-amber-100 text-amber-800">Hoch</Badge>;
    case "urgent":
      return <Badge variant="outline" className="bg-red-100 text-red-800">Dringend</Badge>;
    default:
      return <Badge variant="outline">{priority || 'Normal'}</Badge>;
  }
};

// Formatierung des Datums
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  } catch {
    return "-";
  }
};

// Formatierung der Zeit
const formatTime = (dateString: string | null) => {
  if (!dateString) return "";
  try {
    return new Date(dateString).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
};

// Formatierung von Währungen
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(amount)) return "0,00 €";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Tabs State
  const [activeTab, setActiveTab] = useState("overview");
  
  // Lade Bestelldetails
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['/api/orders', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await fetch(`/api/orders/${id}`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bestellung');
      }
      return response.json();
    }
  });

  // Lade Bestellpositionen
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/orders', id, 'items'],
    enabled: !!id,
    queryFn: async () => {
      const response = await fetch(`/api/orders/${id}/items`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bestellpositionen');
      }
      return response.json();
    }
  });

  // Copy Order Mutation
  const copyOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/orders/${id}/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Fehler beim Kopieren der Bestellung');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success && result.order) {
        toast({
          title: "Bestellung kopiert",
          description: `Neue Bestellung ${result.order.orderNumber} erstellt`,
        });
        navigate(`/bestellungen/${result.order.id}`);
      }
    },
    onError: (error) => {
      console.error('Fehler beim Kopieren:', error);
      toast({
        title: "Fehler beim Kopieren",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive"
      });
    }
  });

  const handleBack = () => {
    navigate("/bestellungen");
  };

  const handleCopyOrder = () => {
    copyOrderMutation.mutate();
  };

  if (isLoading || itemsLoading) {
    return (
      <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6 space-y-6">
        <div className="flex items-center justify-center min-h-64">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Bestellung wird geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6 space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück zur Übersicht
        </Button>
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <CardTitle>Fehler beim Laden</CardTitle>
            </div>
            <CardDescription className="text-red-600">
              Die Bestelldetails konnten nicht geladen werden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Berechne Gesamtwerte
  const totalQuantity = orderItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
  const totalAmount = orderItems.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unitPrice || item.unit_price || 0)), 0);

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          <h1 className="text-2xl font-bold">Bestellung {order.orderNumber || order.order_number}</h1>
          <div className="ml-2">{formatStatus(order.status)}</div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyOrder}
            disabled={copyOrderMutation.isPending}
            className="gap-2"
          >
            {copyOrderMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Kopieren
          </Button>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span>Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span>Positionen</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Übersicht Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Bestelldetails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Bestellnummer</h3>
                    <p className="font-medium">{order.orderNumber || order.order_number}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                    <div>{formatStatus(order.status)}</div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Erstellt am</h3>
                    <p>{formatDate(order.createdAt || order.created_at || order.orderDate || order.order_date)} {formatTime(order.createdAt || order.created_at)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Letzte Aktualisierung</h3>
                    <p>{formatDate(order.updatedAt || order.updated_at)} {formatTime(order.updatedAt || order.updated_at)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Liefertermin (erwartet)</h3>
                    <p>{formatDate(order.expectedDeliveryDate || order.expected_delivery_date)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Priorität</h3>
                    <div>{formatPriority(order.priority)}</div>
                  </div>
                </div>
                
                {order.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Anmerkungen</h3>
                      <p className="text-sm whitespace-pre-line">{order.notes}</p>
                    </div>
                  </>
                )}
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Bestellübersicht</h3>
                  <div className="space-y-4">
                    {/* Lieferung Information */}
                    <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-900">Lieferung an</span>
                      </div>
                      <div className="text-sm space-y-1">
                        <div><span className="font-medium">Lager:</span> {order.warehouseName || order.warehouse_name || 'Unbekanntes Lager'}</div>
                        <div><span className="font-medium">Liefertermin:</span> {formatDate(order.expectedDeliveryDate || order.expected_delivery_date) || 'Nicht angegeben'}</div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Art:</span>
                          {order.delivery_type === 'pickup' ? (
                            <span className="inline-flex items-center gap-1 text-blue-700">
                              <Package className="h-3 w-3" />
                              Abholung
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <Package className="h-3 w-3" />
                              Lieferung
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bestellte Produkte */}
                    <div className="bg-gray-50 p-3 rounded-md border">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="h-4 w-4 text-gray-600" />
                        <span className="font-medium text-gray-900">Bestellte Produkte ({orderItems.length})</span>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {orderItems.length === 0 ? (
                          <p className="text-sm text-gray-500">Keine Positionen gefunden</p>
                        ) : (
                          orderItems.map((item: any, index: number) => (
                            <div key={item.id || index} className="flex justify-between items-center text-sm">
                              <span className="flex-1 font-medium text-gray-800">
                                {item.productName || item.product_name || `Produkt ${index + 1}`}
                              </span>
                              <span className="text-gray-600">
                                {item.quantity || 0} {item.unit || 'Stk'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Zusammenfassung */}
                    <div className="bg-muted/50 p-3 rounded-md">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">Anzahl Positionen:</span>
                        <span className="font-medium">{orderItems.length}</span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">Gesamtmenge:</span>
                        <span className="font-medium">{totalQuantity} Stück</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Gesamtbetrag:</span>
                        <span className="font-medium text-lg">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Lieferant */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Lieferant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
                  <div className="text-lg font-medium">{order.supplierName || order.supplier_name || 'Unbekannter Lieferant'}</div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Ziel-Lager</h3>
                  <div className="text-sm font-medium text-blue-700">{order.warehouseName || order.warehouse_name || order.locationName || order.location_name || 'Unbekanntes Lager'}</div>
                  {(order.expectedDeliveryDate || order.expected_delivery_date) && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Liefertermin: {formatDate(order.expectedDeliveryDate || order.expected_delivery_date)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Positionen Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle>Bestellpositionen</CardTitle>
              <CardDescription>
                {orderItems.length} {orderItems.length === 1 ? "Position" : "Positionen"} mit insgesamt {formatCurrency(totalAmount)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orderItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Keine Bestellpositionen gefunden</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artikel</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Einzelpreis</TableHead>
                      <TableHead>Gesamtpreis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.productName || item.product_name}
                          {(item.sku || item.supplierSku || item.supplier_sku) && (
                            <div className="text-xs text-muted-foreground">
                              {item.sku && `SKU: ${item.sku}`}
                              {item.supplierSku && ` | Lieferanten-Nr: ${item.supplierSku}`}
                              {item.supplier_sku && ` | Lieferanten-Nr: ${item.supplier_sku}`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.quantity || 0} {item.unit || 'Stk'}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(item.unitPrice || item.unit_price || 0)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency((item.quantity || 0) * (item.unitPrice || item.unit_price || 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
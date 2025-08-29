import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ChevronRight,
  Building2,
  Truck,
  PackageCheck,
  FileText,
  ClipboardCheck,
  ArrowLeft,
  ArrowRight,
  Copy,
  BarChart4,
  Clipboard,
  Package2,
  Plus,
  Check,
  X,
  Eye,
  AlertCircle
} from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Import custom components
import WarehouseSelector from '@/components/orderv2/WarehouseSelector';
import SupplierSelector from '@/components/orderv2/SupplierSelector';
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';
import AdditionalInfoForm from '@/components/orderv2/AdditionalInfoForm';
import OrderSummary from '@/components/orderv2/OrderSummary';

// Enhanced Order Mode Types
export type EnhancedOrderMode = 'special' | 'emergency' | 'copy';

// Define the enhanced order steps
type EnhancedOrderStep = 'mode' | 'warehouse' | 'supplier' | 'products' | 'additionalInfo' | 'summary' | 'complete';

interface OrderModeOption {
  id: EnhancedOrderMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

// Enhanced Order List Component for Copy Mode
const OrderListForCopy: React.FC<{
  onSelectOrder: (orderId: number) => void;
  onViewOrder: (orderId: number) => void;
  onCancel: () => void;
}> = ({ onSelectOrder, onViewOrder, onCancel }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['/api/orders', { limit: 100 }],
    staleTime: 1000 * 60 * 5,
  });

  const filteredOrders = React.useMemo(() => {
    if (!orders?.data) return [];
    
    return orders.data.filter((order: any) => {
      const matchesSearch = 
        searchTerm === '' ||
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.supplierName && order.supplierName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellung zum Kopieren auswählen</CardTitle>
          <CardDescription>Lade verfügbare Bestellungen...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellung zum Kopieren auswählen</CardTitle>
        <CardDescription>
          Wählen Sie eine bestehende Bestellung als Vorlage für Ihre neue Bestellung.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="search">Suchen</Label>
            <Input
              id="search"
              placeholder="Bestellnummer oder Lieferant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="w-full px-3 py-2 border border-input rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Alle Status</option>
              <option value="completed">Abgeschlossen</option>
              <option value="delivered">Geliefert</option>
              <option value="ordered">Bestellt</option>
              <option value="open">Offen</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bestellnummer</TableHead>
                <TableHead>Lieferant</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Betrag</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order: any) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>
                    {order.orderDate ? format(new Date(order.orderDate), 'dd.MM.yyyy', { locale: de }) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      order.status === 'completed' ? 'default' :
                      order.status === 'delivered' ? 'secondary' :
                      order.status === 'ordered' ? 'outline' : 'destructive'
                    }>
                      {order.status === 'completed' ? 'Abgeschlossen' :
                       order.status === 'delivered' ? 'Geliefert' :
                       order.status === 'ordered' ? 'Bestellt' :
                       order.status === 'open' ? 'Offen' : order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewOrder(order.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onSelectOrder(order.id)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Kopieren
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Package2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Bestellungen gefunden.</p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
      </CardFooter>
    </Card>
  );
};

const EnhancedOrderProcess: React.FC = () => {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  // State for the enhanced order process
  const [step, setStep] = useState<EnhancedOrderStep>('mode');
  const [orderMode, setOrderMode] = useState<EnhancedOrderMode>('special');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [sourceOrderId, setSourceOrderId] = useState<number | null>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [selectedOrderForView, setSelectedOrderForView] = useState<number | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState<{
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
    deliveryType: string;
    deliveryAddress: string;
    pickupLocation: string;
  }>({
    expectedDeliveryDate: null,
    priority: 'normal',
    notes: '',
    deliveryType: '',
    deliveryAddress: '',
    pickupLocation: ''
  });

  // Enhanced Order Modes with detailed descriptions
  const orderModes: OrderModeOption[] = [
    {
      id: 'special',
      title: 'Sonderbestellung',
      description: 'Spezielle Bestellung für besondere Anlässe oder einmalige Anforderungen.',
      icon: <BarChart4 className="h-8 w-8" />,
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      features: ['Individuelle Anpassung', 'Sonderkonditionen', 'Flexible Lieferung']
    },
    {
      id: 'emergency',
      title: 'Eilbestellung',
      description: 'Dringliche Bestellung mit höchster Priorität und Express-Lieferung.',
      icon: <AlertCircle className="h-8 w-8" />,
      color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      features: ['Höchste Priorität', 'Express-Lieferung', 'Sofortige Bearbeitung']
    },
    {
      id: 'copy',
      title: 'Bestellung kopieren',
      description: 'Erstellen Sie eine neue Bestellung basierend auf einer bestehenden Bestellung.',
      icon: <Copy className="h-8 w-8" />,
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      features: ['Vorlage verwenden', 'Zeitsparend', 'Bewährte Zusammenstellung']
    }
  ];

  // Step navigation functions
  const goToNextStep = () => {
    switch (step) {
      case 'mode':
        if (orderMode === 'copy') {
          setShowCopyDialog(true);
        } else {
          setStep('warehouse');
        }
        break;
      case 'warehouse':
        setStep('supplier');
        break;
      case 'supplier':
        setStep('products');
        break;
      case 'products':
        setStep('additionalInfo');
        break;
      case 'additionalInfo':
        setStep('summary');
        break;
      case 'summary':
        setStep('complete');
        break;
    }
  };

  const goToPreviousStep = () => {
    switch (step) {
      case 'warehouse':
        setStep('mode');
        break;
      case 'supplier':
        setStep('warehouse');
        break;
      case 'products':
        setStep('supplier');
        break;
      case 'additionalInfo':
        setStep('products');
        break;
      case 'summary':
        setStep('additionalInfo');
        break;
    }
  };

  // Handle order copy selection
  const handleOrderCopySelection = async (orderId: number) => {
    try {
      setSourceOrderId(orderId);
      setShowCopyDialog(false);
      
      // Load order data for copying
      const orderResponse = await apiRequest(`/api/orders/${orderId}`);
      if (orderResponse) {
        // Pre-fill warehouse and supplier if available
        if (orderResponse.locationId) {
          setWarehouseId(orderResponse.locationId);
          setWarehouseName(orderResponse.locationName || '');
        }
        if (orderResponse.supplierId) {
          setSupplierId(orderResponse.supplierId);
          setSupplierName(orderResponse.supplierName || '');
        }
        
        toast({
          title: 'Bestellung ausgewählt',
          description: `Bestellung ${orderResponse.orderNumber} wurde als Vorlage ausgewählt.`,
        });
      }
      
      setStep('warehouse');
    } catch (error) {
      console.error('Error loading order for copy:', error);
      toast({
        title: 'Fehler',
        description: 'Bestellung konnte nicht geladen werden.',
        variant: 'destructive',
      });
    }
  };

  // Handle view order
  const handleViewOrder = (orderId: number) => {
    setSelectedOrderForView(orderId);
    // You could open a modal here or navigate to order detail page
    window.open(`/bestellungen/detail/${orderId}`, '_blank');
  };

  // Progress indicator
  const getStepNumber = (currentStep: EnhancedOrderStep): number => {
    const steps = ['mode', 'warehouse', 'supplier', 'products', 'additionalInfo', 'summary', 'complete'];
    return steps.indexOf(currentStep) + 1;
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'mode':
        return (
          <Card className="w-full max-w-5xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                <span>Bestellmodus wählen</span>
              </CardTitle>
              <CardDescription>
                Wählen Sie zuerst den passenden Bestellmodus für Ihre neue Bestellung.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orderModes.map(mode => (
                  <Card 
                    key={mode.id}
                    className={`cursor-pointer transition-all hover:border-primary hover:bg-accent/50 ${
                      orderMode === mode.id ? 'border-primary bg-accent/50' : ''
                    }`}
                    onClick={() => setOrderMode(mode.id)}
                  >
                    <div className="p-4">
                      <div className={`rounded-full p-3 mb-4 w-fit ${mode.color}`}>
                        {mode.icon}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-lg">{mode.title}</h3>
                          {orderMode === mode.id && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{mode.description}</p>
                        <div className="space-y-1">
                          {mode.features.map((feature, index) => (
                            <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => navigate('/bestellungen')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zur Übersicht
              </Button>
              <Button onClick={goToNextStep} disabled={!orderMode}>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        );

      case 'warehouse':
        return (
          <div className="w-full max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={goToPreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="text-sm text-muted-foreground">
                Schritt {getStepNumber(step)} von 6
              </div>
            </div>
            <WarehouseSelector
              selectedWarehouseId={warehouseId}
              onSelectWarehouse={(id, name) => {
                setWarehouseId(id);
                setWarehouseName(name);
              }}
            />
            <div className="flex justify-end">
              <Button onClick={goToNextStep} disabled={!warehouseId}>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'supplier':
        return (
          <div className="w-full max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={goToPreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="text-sm text-muted-foreground">
                Schritt {getStepNumber(step)} von 6
              </div>
            </div>
            <SupplierSelector
              selectedSupplierId={supplierId}
              onSelectSupplier={(id, name) => {
                setSupplierId(id);
                setSupplierName(name);
              }}
            />
            <div className="flex justify-end">
              <Button onClick={goToNextStep} disabled={!supplierId}>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'products':
        return (
          <div className="w-full max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={goToPreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="text-sm text-muted-foreground">
                Schritt {getStepNumber(step)} von 6
              </div>
            </div>
            <ProductSelectionTable
              supplierId={supplierId!}
              warehouseId={warehouseId!}
              sourceOrderId={sourceOrderId}
              mode={orderMode === 'copy' ? 'copy' : 'new'}
              selectedProducts={selectedProducts}
              setSelectedProducts={setSelectedProducts}
            />
            <div className="flex justify-end">
              <Button onClick={goToNextStep} disabled={selectedProducts.length === 0}>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'additionalInfo':
        return (
          <div className="w-full max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={goToPreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="text-sm text-muted-foreground">
                Schritt {getStepNumber(step)} von 6
              </div>
            </div>
            <AdditionalInfoForm
              additionalInfo={additionalInfo}
              onAdditionalInfoChange={setAdditionalInfo}
              orderMode={orderMode}
            />
            <div className="flex justify-end">
              <Button onClick={goToNextStep}>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'summary':
        return (
          <div className="w-full max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={goToPreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="text-sm text-muted-foreground">
                Schritt {getStepNumber(step)} von 6
              </div>
            </div>
            <OrderSummary
              warehouseName={warehouseName}
              supplierName={supplierName}
              selectedProducts={selectedProducts}
              additionalInfo={additionalInfo}
              orderMode={orderMode}
              onCreateOrder={() => {
                // Handle order creation
                toast({
                  title: 'Bestellung erstellt',
                  description: 'Ihre Bestellung wurde erfolgreich erstellt.',
                });
                setStep('complete');
              }}
            />
          </div>
        );

      case 'complete':
        return (
          <Card className="w-full max-w-2xl mx-auto text-center">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle>Bestellung erfolgreich erstellt!</CardTitle>
              <CardDescription>
                Ihre {orderModes.find(m => m.id === orderMode)?.title.toLowerCase()} wurde erfolgreich angelegt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Bestellmodus: {orderModes.find(m => m.id === orderMode)?.title}</p>
                <p>Lager: {warehouseName}</p>
                <p>Lieferant: {supplierName}</p>
                <p>Positionen: {selectedProducts.length}</p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => navigate('/bestellungen')}>
                Zur Bestellübersicht
              </Button>
              <Button onClick={() => {
                // Reset state for new order
                setStep('mode');
                setOrderMode('special');
                setWarehouseId(null);
                setWarehouseName('');
                setSupplierId(null);
                setSupplierName('');
                setSelectedProducts([]);
                setSourceOrderId(null);
                setAdditionalInfo({
                  expectedDeliveryDate: null,
                  priority: 'normal',
                  notes: '',
                  deliveryType: '',
                  deliveryAddress: '',
                  pickupLocation: ''
                });
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Bestellung
              </Button>
            </CardFooter>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Neue Bestellung erstellen</h1>
        <p className="text-muted-foreground">
          Folgen Sie dem geführten Prozess, um eine neue Bestellung zu erstellen.
        </p>
      </div>

      {/* Progress indicator */}
      {step !== 'complete' && (
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {['mode', 'warehouse', 'supplier', 'products', 'additionalInfo', 'summary'].map((stepName, index) => {
              const isActive = step === stepName;
              const isCompleted = getStepNumber(step) > index + 1;
              const stepLabels = {
                mode: 'Modus',
                warehouse: 'Lager',
                supplier: 'Lieferant',
                products: 'Produkte',
                additionalInfo: 'Details',
                summary: 'Zusammenfassung'
              };

              return (
                <div key={stepName} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted ? 'bg-primary text-primary-foreground' :
                    isActive ? 'bg-primary/20 text-primary border-2 border-primary' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="ml-2 text-sm">
                    <div className={`font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {stepLabels[stepName as keyof typeof stepLabels]}
                    </div>
                  </div>
                  {index < 5 && <div className="flex-1 h-px bg-muted mx-4"></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step content */}
      {renderStepContent()}

      {/* Copy Order Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bestellung kopieren</DialogTitle>
            <DialogDescription>
              Wählen Sie eine bestehende Bestellung als Vorlage aus.
            </DialogDescription>
          </DialogHeader>
          <OrderListForCopy
            onSelectOrder={handleOrderCopySelection}
            onViewOrder={handleViewOrder}
            onCancel={() => setShowCopyDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedOrderProcess;
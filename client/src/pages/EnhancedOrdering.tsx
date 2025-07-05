import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShoppingCart, Package, Calendar, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EnhancedOrderingProcess from '@/components/ordering/EnhancedOrderingProcess';

interface Supplier {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
  deliveryDays?: number;
  minimumOrderValue?: number;
}

interface Warehouse {
  id: number;
  name: string;
  address?: string;
  type: string;
  status: string;
}

export default function EnhancedOrdering() {
  const [, setLocation] = useLocation();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [showOrderingProcess, setShowOrderingProcess] = useState(false);

  // Fetch suppliers
  const { data: suppliers = [], isLoading: loadingSuppliers, error: suppliersError } = useQuery({
    queryKey: ['/api/suppliers'],
    select: (response: any) => {
      console.log('Suppliers API response:', response);
      // API response is { data: [...] }, so we need to access response.data
      const supplierData = response.data || response;
      const activeSuppliers = supplierData.filter((s: any) => s.status === 'active');
      console.log('Active suppliers after filter:', activeSuppliers);
      return activeSuppliers;
    }
  });

  // Fetch warehouses/locations
  const { data: warehouses = [], isLoading: loadingWarehouses, error: warehousesError } = useQuery({
    queryKey: ['/api/warehouses'],
    select: (response: any) => {
      console.log('Warehouses API response:', response);
      // API response is { data: [...] }, so we need to access response.data
      const warehouseData = response.data || response;
      const activeWarehouses = warehouseData.filter((w: any) => w.status === 'active');
      console.log('Active warehouses after filter:', activeWarehouses);
      return activeWarehouses;
    }
  });



  // Auto-select if only one supplier/warehouse
  useEffect(() => {
    if (suppliers.length === 1 && !selectedSupplier) {
      console.log('Auto-selecting single supplier:', suppliers[0]);
      setSelectedSupplier(suppliers[0]);
    }
    if (warehouses.length === 1 && !selectedWarehouse) {
      console.log('Auto-selecting single warehouse:', warehouses[0]);
      setSelectedWarehouse(warehouses[0]);
    }
  }, [suppliers, warehouses, selectedSupplier, selectedWarehouse]);

  const handleOrderSuccess = (orderId: number) => {
    console.log('Order created successfully:', orderId);
    // Navigate to order details or orders list
    setLocation(`/orders/${orderId}`);
  };

  const handleStartOrdering = () => {
    if (selectedSupplier && selectedWarehouse) {
      setShowOrderingProcess(true);
    }
  };

  const handleBack = () => {
    if (showOrderingProcess) {
      setShowOrderingProcess(false);
    } else {
      setLocation('/orders');
    }
  };

  if (showOrderingProcess && selectedSupplier && selectedWarehouse) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück zur Auswahl
          </Button>
          <div className="flex items-center gap-4 mb-4">
            <Badge variant="secondary" className="px-3 py-1">
              <Package className="h-4 w-4 mr-2" />
              {selectedWarehouse.name}
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              <ShoppingCart className="h-4 w-4 mr-2" />
              {selectedSupplier.name}
            </Badge>
          </div>
        </div>
        
        <EnhancedOrderingProcess
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          suppliers={suppliers}
          warehouseId={selectedWarehouse.id}
          warehouseName={selectedWarehouse.name}
          warehouses={warehouses}
          onOrderSuccess={handleOrderSuccess}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/orders')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zu Bestellungen
        </Button>
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Erweiterte Bestellfunktion</h1>
          <p className="text-muted-foreground text-lg">
            Intelligente Bestellabwicklung mit Warenkorb, Prognosen und MHD-Tracking
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Smart Shopping Cart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Intelligenter Warenkorb mit automatischen Mengenvorschlägen und Preiskalkulationen
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-lg">AI-Prognosen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Verkaufsprognosen basierend auf historischen Daten und saisonalen Trends
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-2">
                <Calendar className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="text-lg">MHD-Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Automatische Verfolgung von Mindesthaltbarkeitsdaten und FIFO-Prinzip
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Warehouse Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Lager / Standort auswählen
            </CardTitle>
            <CardDescription>
              Wählen Sie das Ziellager für Ihre Bestellung
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingWarehouses ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : warehouses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Keine aktiven Lager gefunden</p>
              </div>
            ) : (
              <div className="space-y-3">
                {warehouses.map((warehouse) => (
                  <div
                    key={warehouse.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedWarehouse?.id === warehouse.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedWarehouse(warehouse)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{warehouse.name}</h3>
                        {warehouse.address && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {warehouse.address}
                          </p>
                        )}
                      </div>
                      <Badge variant={warehouse.type === 'main' ? 'default' : 'secondary'}>
                        {warehouse.type === 'main' ? 'Hauptlager' : 'Standort'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supplier Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Lieferant auswählen
            </CardTitle>
            <CardDescription>
              Wählen Sie den gewünschten Lieferanten für Ihre Bestellung
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuppliers ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Keine aktiven Lieferanten gefunden</p>
              </div>
            ) : (
              <div className="space-y-3">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedSupplier?.id === supplier.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedSupplier(supplier)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{supplier.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {supplier.deliveryDays && (
                            <Badge variant="outline" className="text-xs">
                              {supplier.deliveryDays} Tage Lieferzeit
                            </Badge>
                          )}
                          {supplier.minimumOrderValue && (
                            <Badge variant="outline" className="text-xs">
                              Mind. {supplier.minimumOrderValue}€
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Button */}
      <div className="mt-8 text-center">
        <Button 
          size="lg" 
          onClick={handleStartOrdering}
          disabled={!selectedSupplier || !selectedWarehouse}
          className="px-8"
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          Bestellung erstellen
        </Button>
        
        {(!selectedSupplier || !selectedWarehouse) && (
          <p className="text-sm text-muted-foreground mt-3">
            Bitte wählen Sie Lager und Lieferant aus, um fortzufahren
          </p>
        )}
      </div>
    </div>
  );
}
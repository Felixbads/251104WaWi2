import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';

// Import components
import EnhancedOrderModeSelector, { EnhancedOrderMode } from '@/components/orderv2/EnhancedOrderModeSelector';
import WarehouseSelector from '@/components/orderv2/WarehouseSelector';
import SupplierSelector from '@/components/orderv2/SupplierSelector';
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';

type ProcessStep = 'mode' | 'warehouse' | 'supplier' | 'products' | 'summary';

interface OrderData {
  mode: EnhancedOrderMode;
  warehouseId: number | null;
  warehouseName: string;
  supplierId: number | null;
  supplierName: string;
  products: any[];
  sourceOrderId?: number;
}

const EnhancedOrderProcess: React.FC = () => {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // Process state
  const [currentStep, setCurrentStep] = useState<ProcessStep>('mode');
  const [orderData, setOrderData] = useState<OrderData>({
    mode: 'standard',
    warehouseId: null,
    warehouseName: '',
    supplierId: null,
    supplierName: '',
    products: [],
  });

  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') as EnhancedOrderMode;
    const sourceOrderId = urlParams.get('sourceOrderId');
    
    if (mode) {
      setOrderData(prev => ({
        ...prev,
        mode,
        sourceOrderId: sourceOrderId ? parseInt(sourceOrderId) : undefined
      }));
    }
  }, []);

  const stepTitles = {
    mode: 'Bestellmodus wählen',
    warehouse: 'Lager auswählen',
    supplier: 'Lieferant auswählen',
    products: 'Produkte hinzufügen',
    summary: 'Bestellung erstellen'
  };

  const steps: ProcessStep[] = ['mode', 'warehouse', 'supplier', 'products', 'summary'];
  const currentStepIndex = steps.indexOf(currentStep);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    } else {
      navigate('/bestellungen');
    }
  };

  const handleModeSelect = (mode: EnhancedOrderMode) => {
    setOrderData(prev => ({ ...prev, mode }));
  };

  const handleWarehouseSelect = (id: number, name: string) => {
    setOrderData(prev => ({ ...prev, warehouseId: id, warehouseName: name }));
  };

  const handleSupplierSelect = (id: number, name: string) => {
    setOrderData(prev => ({ ...prev, supplierId: id, supplierName: name }));
  };

  const handleProductsChange = (products: any[]) => {
    setOrderData(prev => ({ ...prev, products }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'mode':
        return !!orderData.mode;
      case 'warehouse':
        return !!orderData.warehouseId;
      case 'supplier':
        return !!orderData.supplierId;
      case 'products':
        return orderData.products.length > 0;
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'mode':
        return (
          <EnhancedOrderModeSelector
            mode={orderData.mode}
            onSelectMode={handleModeSelect}
            onNext={handleNext}
            onBack={handleBack}
          />
        );

      case 'warehouse':
        return (
          <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Lager auswählen</CardTitle>
            </CardHeader>
            <CardContent>
              <WarehouseSelector
                selectedWarehouseId={orderData.warehouseId}
                onSelectWarehouse={handleWarehouseSelect}
              />
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Weiter
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case 'supplier':
        return (
          <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Lieferant auswählen</CardTitle>
            </CardHeader>
            <CardContent>
              <SupplierSelector
                selectedSupplierId={orderData.supplierId}
                onSelectSupplier={handleSupplierSelect}
              />
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Weiter
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case 'products':
        return (
          <Card className="w-full max-w-6xl mx-auto">
            <CardHeader>
              <CardTitle>Produkte hinzufügen</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductSelectionTable
                supplierId={orderData.supplierId}
                warehouseId={orderData.warehouseId}
                mode={orderData.mode}
                sourceOrderId={orderData.sourceOrderId}
                onSelectionChange={handleProductsChange}
              />
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Bestellung erstellen
                  <CheckCircle className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case 'summary':
        return (
          <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Bestellung erstellen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium">Bestellmodus</h3>
                    <p className="text-muted-foreground">{orderData.mode}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Lager</h3>
                    <p className="text-muted-foreground">{orderData.warehouseName}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Lieferant</h3>
                    <p className="text-muted-foreground">{orderData.supplierName}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Produkte</h3>
                    <p className="text-muted-foreground">{orderData.products.length} Artikel</p>
                  </div>
                </div>
                
                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Zurück
                  </Button>
                  <Button 
                    onClick={() => {
                      toast({
                        title: 'Bestellung erstellt',
                        description: 'Die Bestellung wurde erfolgreich angelegt.',
                      });
                      navigate('/bestellungen');
                    }}
                  >
                    Bestellung abschließen
                    <CheckCircle className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`flex items-center ${
                index <= currentStepIndex ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : index === currentStepIndex
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentStepIndex ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:block">
                {stepTitles[step]}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-4 ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      {renderStepContent()}
    </div>
  );
};

export default EnhancedOrderProcess;
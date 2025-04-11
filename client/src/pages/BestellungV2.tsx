import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// Icons
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  FileText,
  LineChart,
  Loader2,
  Save,
  Send,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react';

// Order Components
import WarehouseSelector from '@/components/orderv2/WarehouseSelector';
import OrderModeSelector from '@/components/orderv2/OrderModeSelector';
import SupplierSelector from '@/components/orderv2/SupplierSelector';
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';
import AdditionalInfoForm from '@/components/orderv2/AdditionalInfoForm';
import OrderSummary from '@/components/orderv2/OrderSummary';
import GoodsReceiptForm from '@/components/orderv2/GoodsReceiptForm';

// Types
type OrderMode = 'new' | 'copy' | 'forecast';
type OrderStep = 'warehouse' | 'mode' | 'supplier' | 'products' | 'additionalInfo' | 'summary' | 'confirmation';

const BestellungV2 = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for multi-step form
  const [currentStep, setCurrentStep] = useState<OrderStep>('warehouse');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState<string>('');
  const [orderMode, setOrderMode] = useState<OrderMode>('new');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState<string>('');
  const [sourceOrderId, setSourceOrderId] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState({
    expectedDeliveryDate: null as Date | null,
    priority: 'normal',
    notes: '',
  });
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [pdfContentRef, setPdfContentRef] = useState<React.RefObject<HTMLDivElement>>(React.createRef());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  
  // Get steps as array for navigation purposes
  const steps: OrderStep[] = ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'confirmation'];
  
  // Helper to determine if we can go to the next step
  const canProceed = () => {
    switch (currentStep) {
      case 'warehouse':
        return warehouseId !== null;
      case 'mode':
        return orderMode !== null;
      case 'supplier':
        return supplierId !== null;
      case 'products':
        return selectedProducts.length > 0;
      case 'additionalInfo':
        return additionalInfo.expectedDeliveryDate !== null;
      case 'summary':
        return true;
      default:
        return false;
    }
  };
  
  // Navigation functions
  const goToNextStep = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };
  
  const goToPreviousStep = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };
  
  // Generate PDF for order
  const generatePdf = async () => {
    if (!pdfContentRef.current) return;
    
    setIsGeneratingPdf(true);
    
    try {
      const content = pdfContentRef.current;
      const canvas = await html2canvas(content, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      
      // Calculate PDF dimensions based on A4 paper
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Convert to blob
      const pdfBlob = pdf.output('blob');
      setPdfBlob(pdfBlob);
      
      toast({
        title: "PDF erfolgreich generiert",
        description: "Sie können das PDF jetzt herunterladen oder per E-Mail versenden."
      });
    } catch (error) {
      toast({
        title: "Fehler beim Generieren des PDFs",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  
  // Send order via email
  const sendOrderEmail = async () => {
    if (!createdOrderId || !pdfBlob) return;
    
    try {
      // Convert PDF to base64
      const reader = new FileReader();
      const pdfBase64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            resolve(base64);
          } else {
            reject(new Error("Fehler beim Konvertieren der PDF-Datei"));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(pdfBlob);
      });
      
      const pdfBase64 = await pdfBase64Promise;
      
      // Prepare email data
      const emailData = {
        orderId: createdOrderId,
        supplierEmail: `supplier-${supplierId}@example.com`, // In a real scenario, this would come from the supplier data
        pdfBase64: pdfBase64,
        additionalNotes: additionalInfo.notes || "Bitte bestätigen Sie den Erhalt dieser Bestellung."
      };
      
      // Show loading toast
      toast({
        title: "E-Mail wird gesendet",
        description: "Bitte warten..."
      });
      
      // Send API request
      await apiRequest('post', '/api/email/order-confirmation', {
        body: emailData
      });
      
      toast({
        title: "E-Mail versendet",
        description: "Die Bestellung wurde erfolgreich per E-Mail an den Lieferanten versendet."
      });
    } catch (error) {
      toast({
        title: "Fehler beim Senden der E-Mail",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  // Create new order in database
  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => {
      return apiRequest('post', '/api/orders', {
        body: orderData
      });
    },
    onSuccess: (data) => {
      setCreatedOrderId(data.id);
      // Invalidate orders query to refresh any order lists
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      // Move to confirmation step
      setCurrentStep('confirmation');
      // Generate PDF
      setTimeout(() => {
        generatePdf();
      }, 500);
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Speichern der Bestellung",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handle order submission
  const submitOrder = () => {
    // Create the order data object
    const orderData = {
      warehouseId,
      warehouseName,
      supplierId,
      supplierName,
      expectedDeliveryDate: additionalInfo.expectedDeliveryDate,
      priority: additionalInfo.priority,
      notes: additionalInfo.notes,
      orderItems: selectedProducts.map(product => ({
        productId: product.id,
        productName: product.name,
        quantity: product.orderQuantity,
        unitPrice: product.price,
        totalPrice: product.price * product.orderQuantity
      })),
      totalAmount: selectedProducts.reduce((sum, product) => sum + (product.price * product.orderQuantity), 0)
    };
    
    // Submit the order
    createOrderMutation.mutate(orderData);
  };
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 'warehouse':
        return (
          <WarehouseSelector 
            selectedWarehouseId={warehouseId} 
            onSelectWarehouse={(id, name) => {
              setWarehouseId(id);
              setWarehouseName(name);
            }}
          />
        );
      case 'mode':
        return (
          <OrderModeSelector 
            selectedMode={orderMode} 
            onSelectMode={setOrderMode}
            onSourceOrderSelect={setSourceOrderId}
          />
        );
      case 'supplier':
        return (
          <SupplierSelector 
            selectedSupplierId={supplierId} 
            onSelectSupplier={(id, name) => {
              setSupplierId(id);
              setSupplierName(name);
            }}
          />
        );
      case 'products':
        return (
          <ProductSelectionTable 
            supplierId={supplierId!}
            warehouseId={warehouseId!}
            sourceOrderId={sourceOrderId}
            mode={orderMode}
            selectedProducts={selectedProducts}
            onProductsChange={setSelectedProducts}
          />
        );
      case 'additionalInfo':
        return (
          <AdditionalInfoForm 
            additionalInfo={additionalInfo}
            onAdditionalInfoChange={setAdditionalInfo}
          />
        );
      case 'summary':
        return (
          <OrderSummary 
            warehouseName={warehouseName}
            supplierName={supplierName}
            selectedProducts={selectedProducts}
            additionalInfo={additionalInfo}
            onSubmit={submitOrder}
            isSubmitting={createOrderMutation.isPending}
          />
        );
      case 'confirmation':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-xl">
                <Check className="h-6 w-6 inline-block mr-2 text-green-500" />
                Bestellung erfolgreich erstellt
              </CardTitle>
              <CardDescription className="text-center">
                Ihre Bestellung wurde erfolgreich gespeichert und kann jetzt weitergeleitet werden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mt-4 p-6 bg-muted rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Bestellnummer: {createdOrderId}</h3>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lieferant</p>
                    <p>{supplierName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lager</p>
                    <p>{warehouseName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Anzahl Produkte</p>
                    <p>{selectedProducts.length}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gesamtbetrag</p>
                    <p>
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR'
                      }).format(selectedProducts.reduce((sum, p) => sum + (p.price * p.orderQuantity), 0))}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3 mt-6 justify-center">
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => generatePdf()}
                  disabled={isGeneratingPdf}
                >
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF erzeugen
                </Button>
                
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => {
                    if (pdfBlob) {
                      const url = URL.createObjectURL(pdfBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Bestellung_${createdOrderId}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      toast({
                        title: "PDF nicht verfügbar",
                        description: "Bitte erzeugen Sie zuerst ein PDF.",
                        variant: "destructive"
                      });
                    }
                  }}
                  disabled={!pdfBlob}
                >
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
                
                <Button 
                  className="gap-2"
                  onClick={sendOrderEmail}
                  disabled={!pdfBlob}
                >
                  <Send className="h-4 w-4" />
                  Per E-Mail versenden
                </Button>
                
                <Button 
                  variant="secondary" 
                  className="gap-2"
                  asChild
                >
                  <Link to={`/orders/${createdOrderId}`}>
                    <ChevronRight className="h-4 w-4" />
                    Zur Bestellungsübersicht
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };
  
  // Get the current step's title and description
  const getStepInfo = () => {
    switch (currentStep) {
      case 'warehouse':
        return {
          title: "Lagerauswahl",
          description: "Wählen Sie das Ziellager für die Bestellung aus."
        };
      case 'mode':
        return {
          title: "Bestellmodus",
          description: "Wählen Sie, wie Sie die Bestellung erstellen möchten."
        };
      case 'supplier':
        return {
          title: "Lieferantenauswahl",
          description: "Wählen Sie den Lieferanten für diese Bestellung aus."
        };
      case 'products':
        return {
          title: "Produktauswahl",
          description: "Wählen Sie die Produkte und Mengen für Ihre Bestellung."
        };
      case 'additionalInfo':
        return {
          title: "Zusatzinformationen",
          description: "Geben Sie weitere Informationen zur Bestellung an."
        };
      case 'summary':
        return {
          title: "Bestellungsübersicht",
          description: "Überprüfen Sie Ihre Bestellung vor dem Absenden."
        };
      case 'confirmation':
        return {
          title: "Bestellung abgeschlossen",
          description: "Ihre Bestellung wurde erfolgreich aufgegeben."
        };
      default:
        return {
          title: "",
          description: ""
        };
    }
  };
  
  const { title, description } = getStepInfo();
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button variant="ghost" asChild className="mr-4">
          <Link to="/orders">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zur Übersicht
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Bestellung 2.0</h1>
          <p className="text-muted-foreground">Neues, erweitertes Bestellsystem</p>
        </div>
      </div>
      
      {/* Progress Stepper */}
      {currentStep !== 'confirmation' && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex justify-between">
              {steps.slice(0, steps.indexOf('confirmation')).map((step, index) => (
                <div key={step} className="flex flex-col items-center">
                  <div 
                    className={`rounded-full flex items-center justify-center w-10 h-10 ${
                      steps.indexOf(currentStep) >= index 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="text-xs mt-2 text-center w-20">
                    {getStepInfo()[step]?.title || step}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-6">
              <div className="absolute h-1 bg-muted top-0 left-0 right-0">
                <div 
                  className="h-1 bg-primary transition-all" 
                  style={{ width: `${(100 * steps.indexOf(currentStep)) / (steps.indexOf('confirmation'))}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Main Content Card */}
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}
        </CardContent>
        
        {currentStep !== 'confirmation' && (
          <CardFooter className="justify-between">
            <Button 
              variant="outline" 
              onClick={goToPreviousStep}
              disabled={currentStep === 'warehouse'}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            
            {currentStep !== 'summary' ? (
              <Button 
                onClick={goToNextStep}
                disabled={!canProceed()}
              >
                Weiter
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button 
                onClick={submitOrder}
                disabled={createOrderMutation.isPending || !canProceed()}
              >
                {createOrderMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bestellung wird gespeichert...
                  </>
                ) : (
                  <>
                    Bestellung aufgeben
                    <Save className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        )}
      </Card>
      
      {/* Hidden PDF content for generation */}
      <div className="hidden">
        <div ref={pdfContentRef} className="p-8 bg-white" style={{ width: '210mm', minHeight: '297mm' }}>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold">Bestellung #{createdOrderId}</h1>
              <p className="text-sm">Erstellt am: {new Date().toLocaleDateString('de-DE')}</p>
            </div>
            <div className="text-right">
              <h2 className="font-bold">Nationale Parkverwaltung Sächsische Schweiz</h2>
              <p className="text-sm">Nationalpark Zentrum</p>
              <p className="text-sm">Dresdner Str. 2B, 01814 Bad Schandau</p>
              <p className="text-sm">info@nationalpark-saechsische-schweiz.de</p>
            </div>
          </div>
          
          <div className="mt-10">
            <h2 className="font-bold mb-1">Lieferant:</h2>
            <p>{supplierName}</p>
            <p>[Lieferantenadresse]</p>
          </div>
          
          <div className="mt-6">
            <h2 className="font-bold mb-1">Lieferadresse:</h2>
            <p>{warehouseName}</p>
            <p>[Lageradresse]</p>
          </div>
          
          <div className="mt-8">
            <h3 className="font-bold border-b pb-2 mb-2">Bestellpositionen</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Produkt</th>
                  <th className="py-2 text-right">Menge</th>
                  <th className="py-2 text-right">Einheitspreis</th>
                  <th className="py-2 text-right">Gesamtpreis</th>
                </tr>
              </thead>
              <tbody>
                {selectedProducts.map((product, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{product.name}</td>
                    <td className="py-2 text-right">{product.orderQuantity} {product.unit || 'Stk.'}</td>
                    <td className="py-2 text-right">
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR'
                      }).format(product.price)}
                    </td>
                    <td className="py-2 text-right">
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR'
                      }).format(product.price * product.orderQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-bold">Gesamtbetrag:</td>
                  <td className="py-2 text-right font-bold">
                    {new Intl.NumberFormat('de-DE', {
                      style: 'currency',
                      currency: 'EUR'
                    }).format(selectedProducts.reduce((sum, p) => sum + (p.price * p.orderQuantity), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div className="mt-8">
            <h3 className="font-bold mb-2">Zusatzinformationen</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-medium">Gewünschter Liefertermin:</p>
                <p>{additionalInfo.expectedDeliveryDate?.toLocaleDateString('de-DE') || 'Nicht angegeben'}</p>
              </div>
              <div>
                <p className="font-medium">Priorität:</p>
                <p>{additionalInfo.priority === 'high' ? 'Hoch' : additionalInfo.priority === 'urgent' ? 'Dringend' : 'Normal'}</p>
              </div>
            </div>
            {additionalInfo.notes && (
              <div className="mt-4">
                <p className="font-medium">Anmerkungen:</p>
                <p>{additionalInfo.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BestellungV2;
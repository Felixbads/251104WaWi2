import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, CircleAlert, Package, PlusCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface ProductBatch {
  id: number;
  productId: number;
  batchNumber: string;
  expiryDate: string | null;
  createdAt?: string;
  currentQuantity: number;
  warehouseId: number;
  status?: string;
}

interface InventoryCountItem {
  id: number;
  productId: number;
  productName: string;
  expectedQuantity: number;
  countedQuantity?: number | null;
  batchId?: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

interface InventoryCountBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: InventoryCountItem | null;
  availableBatches: ProductBatch[];
  onBatchSelect: (batchId: number | null) => void;
  inventoryId: string;
}

export default function InventoryCountBatchDialog({
  open,
  onOpenChange,
  selectedItem,
  availableBatches,
  onBatchSelect,
  inventoryId
}: InventoryCountBatchDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State-Verwaltung
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(availableBatches.length === 0 ? 'new' : 'existing');
  
  // Für automatische Batch-Nummerngenerierung
  const [newBatchNumber, setNewBatchNumber] = useState(() => generateBatchNumber());
  
  // Setze Standarddatum auf 3 Monate in der Zukunft für neue Chargen
  const [expiryDate, setExpiryDate] = useState<Date | null>(
    new Date(new Date().setMonth(new Date().getMonth() + 3))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  /**
   * Generiert eine eindeutige Chargennummer basierend auf dem aktuellen Zeitstempel.
   * Format: CHG-YYYYMMDD-HHMMSS-RRR (RRR = Zufallszahl)
   */
  function generateBatchNumber(): string {
    const now = new Date();
    const dateStr = format(now, 'yyyyMMdd');
    const timeStr = format(now, 'HHmmss');
    const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `CHG-${dateStr}-${timeStr}-${randomStr}`;
  }

  // Bei Öffnen des Dialogs den aktuellen Batch setzen und eine neue Chargennummer generieren
  useEffect(() => {
    if (open && selectedItem) {
      setSelectedBatchId(selectedItem.batchId ? selectedItem.batchId.toString() : null);
      
      // Generiere jedes Mal eine neue Chargennummer, wenn der Dialog geöffnet wird
      if (!newBatchNumber) {
        setNewBatchNumber(generateBatchNumber());
      }
    }
  }, [open, selectedItem]);

  // Formatiert ein Datum für die Anzeige
  const formatBatchDate = (dateStr: string | null) => {
    if (!dateStr) return "Kein Datum";
    return format(new Date(dateStr), 'dd.MM.yyyy');
  };

  // Mutation zum Erstellen einer neuen Charge
  const createBatchMutation = useMutation({
    mutationFn: async (batchData: any) => {
      if (!selectedItem || !selectedItem.productId) {
        throw new Error('Kein Produkt ausgewählt');
      }

      console.log("Erstelle neue Charge für Produkt:", selectedItem.productId);
      
      // Hole zuerst die Inventurdaten, um die korrekte Lager-ID zu bekommen
      const inventoryResponse = await fetch(`/api/inventory-counts/${inventoryId}`);
      if (!inventoryResponse.ok) {
        throw new Error('Fehler beim Laden der Inventurdaten');
      }
      const inventoryData = await inventoryResponse.json();
      
      // Ergänze die vom Benutzer übergebenen Daten mit den erforderlichen Werten
      const completeBatchData = {
        ...batchData,
        warehouseId: inventoryData.warehouseId, // Verwende die korrekte Lager-ID
        receivedDate: format(new Date(), 'yyyy-MM-dd')
      };
      
      console.log("Sende Chargen-Daten:", JSON.stringify(completeBatchData, null, 2));

      const response = await fetch(`/api/inventory-counts/product-batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(completeBatchData),
      });

      // Überprüfe auf detaillierte Fehlermeldungen
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        
        try {
          errorData = JSON.parse(errorText);
          throw new Error(errorData.details || errorData.error || `Serverfehler: ${response.status}`);
        } catch (parseError) {
          // Wenn JSON-Parse fehlschlägt, verwende den Rohtext
          throw new Error(`Serverfehler (${response.status}): ${errorText.substring(0, 200)}`);
        }
      }

      return await response.json();
    },
    onSuccess: (data) => {
      console.log("Charge erfolgreich erstellt:", data);
      
      // Batch-ID aktualisieren
      if (data && data.id) {
        // Setzte eine kurze Verzögerung, damit Backend-Updates abgeschlossen werden können
        setTimeout(() => {
          console.log("Aktualisiere Batch-ID auf:", data.id);
          onBatchSelect(data.id);
          
          // Cache invalidieren - sowohl Items als auch Batches
          queryClient.invalidateQueries({ 
            queryKey: [`/api/inventory-counts/${inventoryId}/items`]
          });
          
          queryClient.invalidateQueries({ 
            queryKey: [`/api/products/${selectedItem?.productId}/batches`]
          });
          
          // Erfolgsmeldung anzeigen
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            onOpenChange(false);
            
            // Stelle die Scroll-Position wieder her
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
                if (savedPos) {
                  window.scrollTo(0, parseInt(savedPos, 10));
                }
              }
            }, 50);
          }, 1500);
        }, 300);
      }
    },
    onError: (error: any) => {
      console.error('Fehler beim Erstellen der Charge:', error);
      toast({
        title: 'Fehler',
        description: error.message || 'Die Charge konnte nicht erstellt werden.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  // Handler für Batch-Auswahl
  const handleBatchChange = (value: string) => {
    setSelectedBatchId(value);
  };

  // Handler zum Speichern der Batch-Auswahl
  const handleSaveBatchSelection = () => {
    // Speichere zuerst die Scroll-Position
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
    }
    
    if (selectedBatchId === 'none') {
      // Wenn "Keine Charge" ausgewählt wurde, sende null für manuelle Aufhebung
      // oder auto für automatische Chargenerstellung
      const autoCreateBatch = confirm("Möchten Sie eine neue Charge automatisch erstellen?\n\nOK = Ja, automatisch eine Charge erstellen\nAbbrechen = Nein, keine Charge zuweisen");
      
      if (autoCreateBatch) {
        // Automatisches Erstellen einer neuen Charge
        
        // Generiere eine neue Chargennummer
        const autoChargennummer = generateBatchNumber();
        
        // Standarddatum 3 Monate in der Zukunft
        const defaultExpiry = new Date();
        defaultExpiry.setMonth(defaultExpiry.getMonth() + 3);
        
        // Informiere den Benutzer über den automatischen Vorgang
        toast({
          title: 'Automatische Erstellung',
          description: `Neue Charge wird erstellt: ${autoChargennummer}`,
        });
        
        // Die Daten für die neue Charge
        const batchData = {
          productId: selectedItem?.productId,
          batchNumber: autoChargennummer,
          expiryDate: format(defaultExpiry, 'yyyy-MM-dd'),
          initialQuantity: selectedItem?.countedQuantity || 1,
          currentQuantity: selectedItem?.countedQuantity || 1
        };
        
        // Schließe Dialog sofort für besseres UI-Erlebnis
        onOpenChange(false);
        
        // Starte die Erstellung im Hintergrund
        createBatchMutation.mutate(batchData);
      } else {
        // Nutzer möchte wirklich keine Charge, also wird null übergeben
        onBatchSelect(null);
        onOpenChange(false);
        
        // Stelle die Scroll-Position wieder her
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
            if (savedPos) {
              window.scrollTo(0, parseInt(savedPos, 10));
            }
          }
        }, 50);
      }
    } else if (selectedBatchId) {
      // Eine bestehende Charge wurde ausgewählt
      onBatchSelect(parseInt(selectedBatchId));
      onOpenChange(false);
      
      // Stelle die Scroll-Position wieder her
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
          if (savedPos) {
            window.scrollTo(0, parseInt(savedPos, 10));
          }
        }
      }, 50);
    } else {
      toast({
        title: 'Keine Auswahl',
        description: 'Bitte wählen Sie eine Charge aus oder erstellen Sie eine neue.',
        variant: 'destructive',
      });
    }
  };

  // Diese Funktion ist bereits oben definiert worden und kann entfernt werden, da sie dupliziert ist

  // Handler zum Erstellen einer neuen Charge
  const handleCreateNewBatch = () => {
    // Speichere zuerst die aktuelle Scroll-Position im sessionStorage
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
    }
    
    // Verwende die bereits generierte Chargennummer (oder erzeuge eine neue, falls nötig)
    const autoChargennummer = newBatchNumber || generateBatchNumber();
    
    // Setze Ablaufdatum - Standard: 3 Monate in der Zukunft
    let effectiveExpiryDate = expiryDate;
    if (!effectiveExpiryDate) {
      const defaultDate = new Date();
      defaultDate.setMonth(defaultDate.getMonth() + 3);
      effectiveExpiryDate = defaultDate;
      setExpiryDate(defaultDate); // Für die UI aktualisieren
    }
      
    toast({
      title: 'Charge wird erstellt',
      description: `Automatisch generierte Chargennummer: ${autoChargennummer}`,
    });
    
    setIsSubmitting(true);
    setNewBatchNumber(autoChargennummer); // Aktualisiert das Feld für bessere UX

    // Die eigentlichen Daten, die an die API gesendet werden
    const batchData = {
      productId: selectedItem?.productId,
      batchNumber: autoChargennummer,
      expiryDate: effectiveExpiryDate ? format(effectiveExpiryDate, 'yyyy-MM-dd') : format(new Date(new Date().setMonth(new Date().getMonth() + 3)), 'yyyy-MM-dd'),
      initialQuantity: selectedItem?.countedQuantity || 1,
      currentQuantity: selectedItem?.countedQuantity || 1
    };
    
    // Speichere die aktuelle Scroll-Position vor dem API-Call
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
    }
    
    // Rufe die mutationFn direkt mit den richtigen Daten auf
    createBatchMutation.mutate(batchData);
  };

  // Status-Farben für Batches
  const getBatchStatusColor = (expiryDateStr: string | null) => {
    if (!expiryDateStr) return "bg-gray-100 text-gray-800";
    
    try {
      const expiryDate = new Date(expiryDateStr);
      const now = new Date();
      
      if (isNaN(expiryDate.getTime())) {
        console.warn("Ungültiges Datumsformat für MHD:", expiryDateStr);
        return "bg-gray-100 text-gray-800";
      }
      
      // Abgelaufen
      if (expiryDate < now) {
        return "bg-red-100 text-red-800";
      }
      
      // Läuft bald ab (innerhalb von 14 Tagen)
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(now.getDate() + 14);
      if (expiryDate < twoWeeksFromNow) {
        return "bg-yellow-100 text-yellow-800";
      }
      
      // OK
      return "bg-green-100 text-green-800";
    } catch (error) {
      console.error("Fehler beim Verarbeiten des MHD-Datums:", error);
      return "bg-gray-100 text-gray-800";
    }
  };

  // Status-Text für Batches
  const getBatchStatusText = (expiryDateStr: string | null) => {
    if (!expiryDateStr) return "Kein MHD";
    
    try {
      const expiryDate = new Date(expiryDateStr);
      const now = new Date();
      
      if (isNaN(expiryDate.getTime())) {
        console.warn("Ungültiges Datumsformat für MHD-Status-Text:", expiryDateStr);
        return "Kein MHD";
      }
      
      // Abgelaufen
      if (expiryDate < now) {
        return "Abgelaufen";
      }
      
      // Läuft bald ab (innerhalb von 14 Tagen)
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(now.getDate() + 14);
      if (expiryDate < twoWeeksFromNow) {
        return "Läuft bald ab";
      }
      
      // OK
      return "Gültig";
    } catch (error) {
      console.error("Fehler beim Verarbeiten des MHD-Datums für Status-Text:", error);
      return "Kein MHD";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {showSuccess ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-center">Charge erfolgreich gespeichert!</h3>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Charge für {selectedItem?.productName}</DialogTitle>
              <DialogDescription>
                Wählen Sie eine bestehende Charge oder erstellen Sie eine neue
              </DialogDescription>
            </DialogHeader>

            <Tabs 
              defaultValue="existing" 
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Bestehende Chargen</TabsTrigger>
                <TabsTrigger value="new">Neue Charge</TabsTrigger>
              </TabsList>
              
              <TabsContent value="existing" className="mt-4">
                {availableBatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6">
                    <Package className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-center text-muted-foreground">
                      Keine bestehenden Chargen für dieses Produkt verfügbar.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab('new')}
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Neue Charge erstellen
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <Select 
                        value={selectedBatchId || "none"} 
                        onValueChange={handleBatchChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Charge auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Verfügbare Chargen</SelectLabel>
                            <SelectItem value="none">Keine Charge</SelectItem>
                            {availableBatches.map((batch) => (
                              <SelectItem 
                                key={batch.id} 
                                value={batch.id.toString()}
                              >
                                {batch.batchNumber} - MHD: {formatBatchDate(batch.expiryDate)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {selectedBatchId && selectedBatchId !== 'none' && (
                      <div className="border rounded-md p-4 mb-6">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium">Chargen-Details</h4>
                            <p className="text-sm text-muted-foreground">
                              Informationen zur ausgewählten Charge
                            </p>
                          </div>
                          {selectedBatchId && selectedBatchId !== 'none' && (
                            <Badge 
                              className={getBatchStatusColor(
                                availableBatches.find(b => b.id.toString() === selectedBatchId)?.expiryDate || null
                              )}
                            >
                              {getBatchStatusText(
                                availableBatches.find(b => b.id.toString() === selectedBatchId)?.expiryDate || null
                              )}
                            </Badge>
                          )}
                        </div>
                        
                        <Separator className="my-3" />
                        
                        {selectedBatchId && selectedBatchId !== 'none' && (
                          <div className="space-y-2">
                            {(() => {
                              const batch = availableBatches.find(b => b.id.toString() === selectedBatchId);
                              if (!batch) return null;
                              
                              return (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Chargennummer:</span>
                                    <span className="text-sm font-medium">{batch.batchNumber}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">MHD:</span>
                                    <span className="text-sm font-medium">{formatBatchDate(batch.expiryDate)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Aktuelle Menge:</span>
                                    <span className="text-sm font-medium">{batch.currentQuantity}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
              
              <TabsContent value="new" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <label 
                      htmlFor="batchNumber" 
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Chargennummer (automatisch)
                    </label>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="batchNumber"
                        placeholder="Automatisch generiert"
                        value={newBatchNumber}
                        readOnly
                        className="bg-gray-50 font-medium"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setNewBatchNumber(generateBatchNumber())}
                        title="Neue Chargennummer regenerieren"
                      >
                        <CircleAlert className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Die Chargennummer wird automatisch im Format CHG-YYYYMMDD-HHMMSS-RRR generiert und muss nicht manuell eingegeben werden.
                    </p>
                  </div>
                  
                  <div>
                    <label 
                      htmlFor="expiryDate" 
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Mindesthaltbarkeitsdatum (MHD)
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expiryDate ? (
                            format(expiryDate, 'dd.MM.yyyy')
                          ) : (
                            <span>Datum wählen</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={expiryDate || undefined}
                          onSelect={(date) => setExpiryDate(date || null)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div>
                    <label 
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Menge
                    </label>
                    <div className="text-sm border rounded p-2 bg-muted">
                      Diese wird automatisch mit dem gezählten Wert gefüllt: 
                      <span className="font-bold ml-1">
                        {selectedItem?.countedQuantity ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Abbrechen
              </Button>
              {activeTab === 'existing' ? (
                <Button 
                  onClick={handleSaveBatchSelection}
                  disabled={isSubmitting}
                >
                  Übernehmen
                </Button>
              ) : (
                <Button 
                  onClick={handleCreateNewBatch}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Wird erstellt...' : 'Charge erstellen'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
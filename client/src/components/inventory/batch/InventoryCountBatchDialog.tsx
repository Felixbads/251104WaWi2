import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { invalidateInventoryCache } from '../../../lib/invalidateInventoryCache';
import { createAndLinkBatch, generateBatchNumber, getDefaultExpiryDate } from './CreateAndLinkBatchHandler';
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
  warehouseId: number; // Lagernummer ist wichtig für die korrekte Batch-Erstellung
  onBatchCreated?: () => void; // Callback zum Neuladen der Batches
}

export default function InventoryCountBatchDialog({
  open,
  onOpenChange,
  selectedItem,
  availableBatches,
  onBatchSelect,
  inventoryId,
  warehouseId,
  onBatchCreated
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
  
  // Neue State für die Menge der Charge
  const [batchQuantity, setBatchQuantity] = useState<number>(1);
  
  // Wir verwenden jetzt die importierte Funktion aus CreateAndLinkBatchHandler.ts
  // für eine konsistente Batch-Nummern-Generierung im ganzen System

  // Bei Öffnen des Dialogs den aktuellen Batch setzen und eine neue Chargennummer generieren
  useEffect(() => {
    if (open && selectedItem) {
      setSelectedBatchId(selectedItem.batchId ? selectedItem.batchId.toString() : null);
      
      // Generiere jedes Mal eine neue Chargennummer, wenn der Dialog geöffnet wird
      // Verwende hierfür die zentralisierte Funktion aus CreateAndLinkBatchHandler
      setNewBatchNumber(generateBatchNumber());
      
      // Setze auch das Default-Ablaufdatum
      setExpiryDate(new Date(getDefaultExpiryDate()));
      
      // Setze Standardmenge auf verfügbaren Lagerbestand (expectedQuantity)
      setBatchQuantity(selectedItem.expectedQuantity || 1);
    }
  }, [open, selectedItem]);

  // Formatiert ein Datum für die Anzeige
  const formatBatchDate = (dateStr: string | null) => {
    if (!dateStr) return "Kein Datum";
    return format(new Date(dateStr), 'dd.MM.yyyy');
  };

  // Mutation zum Verknüpfen einer Charge mit einem Inventurposten
  const linkBatchMutation = useMutation({
    mutationFn: async ({ itemId, batchId }: { itemId: number, batchId: number }) => {
      console.log(`Verknüpfe Inventurposten ${itemId} mit Charge ${batchId}...`);
      
      // Verwende den korrekten API-Endpunkt, der vom Server zur Verfügung gestellt wird
      const apiEndpoint = `/api/inventory-counts/items/${itemId}/batch`;
      console.log(`FETCH: ${apiEndpoint} mit Daten: { batchId: ${batchId} }`);
      
      // Speichere die aktuelle Scroll-Position
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ batchId }), // Server erwartet batchId als Parameter
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Fehler beim Verknüpfen: ${response.status} - ${errorText}`);
        throw new Error(`Verknüpfung fehlgeschlagen: ${response.status} - ${errorText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Verknüpfung erfolgreich:", data);
      
      // Cache invalidieren nur nach erfolgreicher Verknüpfung
      // und mit einem kleinen Verzögerung, damit UI flüssig bleibt
      setTimeout(() => {
        console.log("Verzögerte Cache-Invalidierung für Inventur", inventoryId);
        invalidateInventoryCache(
          queryClient, 
          inventoryId, 
          selectedItem?.productId
        );
      }, 300);
      
      // Erfolgsmeldung anzeigen
      toast({
        title: "Charge verknüpft",
        description: "Die Charge wurde erfolgreich mit dem Inventurposten verknüpft."
      });
      
      // Dialog schließen
      setTimeout(() => {
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
    },
    onError: (error) => {
      console.error("Fehler bei der Batch-Verknüpfung:", error);
      
      toast({
        title: "Fehler bei der Verknüpfung",
        description: "Die Charge wurde erstellt, konnte aber nicht mit dem Inventurposten verknüpft werden.",
        variant: "destructive"
      });
      
      // Dialog trotz Fehler schließen, da Charge erstellt wurde
      onOpenChange(false);
      
      // Stelle die Scroll-Position wieder her
      if (typeof window !== 'undefined') {
        const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
        if (savedPos) {
          window.scrollTo(0, parseInt(savedPos, 10));
        }
      }
    }
  });

  // Mutation zum Erstellen einer neuen Charge
  const createBatchMutation = useMutation({
    mutationFn: async (batchData: any) => {
      try {
        if (!selectedItem || !selectedItem.productId) {
          throw new Error('Kein Produkt ausgewählt');
        }
  
        console.log("Erstelle neue Charge für Produkt:", selectedItem.productId);
        
        // Speichere aktuelle Scroll-Position vorsorglich
        if (typeof window !== 'undefined') {
          console.log("Speichere Scroll-Position:", window.scrollY);
          window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
        }
  
        // Verwende die direkt übergebene warehouseId
        if (!warehouseId) {
          console.error("Keine gültige Lager-ID übergeben");
          throw new Error("Keine gültige Lager-ID übergeben");
        }
        
        console.log("Verwende Lager-ID:", warehouseId);
        
        // Ergänze die vom Benutzer übergebenen Daten mit den erforderlichen Werten
        const completeBatchData = {
          ...batchData,
          warehouseId: warehouseId, // Verwende die übergebene Lager-ID
          receivedDate: format(new Date(), 'yyyy-MM-dd')
        };
        
        console.log("Sende Chargen-Daten:", JSON.stringify(completeBatchData, null, 2));
  
        // Verwende die korrekte API-Route für Inventur-Chargen
        const response = await fetch(`/api/inventory-counts/product-batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify(completeBatchData),
        });
  
        // Überprüfe auf detaillierte Fehlermeldungen
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Server-Antwort-Fehler (${response.status}):`, errorText);
          
          let errorData;
          try {
            errorData = JSON.parse(errorText);
            throw new Error(errorData.details || errorData.error || `Serverfehler: ${response.status}`);
          } catch (parseError) {
            // Wenn JSON-Parse fehlschlägt, verwende den Rohtext
            throw new Error(`Serverfehler (${response.status}): ${errorText.substring(0, 200)}`);
          }
        }
  
        const result = await response.json();
        console.log("Charge erfolgreich erstellt mit Ergebnis:", result);
        return result;
      } catch (error) {
        console.error("Fehler in mutationFn:", error);
        
        // Stelle die Scroll-Position bei einem Fehler wieder her
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
            if (savedPos) {
              console.log("Stelle Scroll-Position nach Fehler wieder her:", savedPos);
              window.scrollTo(0, parseInt(savedPos, 10));
            }
          }
        }, 50);
        
        throw error; // Fehler weiterleiten für onError-Handler
      }
    },
    onSuccess: (data) => {
      console.log("Charge erfolgreich erstellt:", data);
    },
    onError: (error: any) => {
      console.error('Fehler beim Erstellen der Charge:', error);
      
      // Detaillierte Fehleranzeige
      toast({
        title: 'Fehler',
        description: error.message || 'Die Charge konnte nicht erstellt werden.',
        variant: 'destructive',
      });
      
      // Status zurücksetzen
      setIsSubmitting(false);
      
      // Sicherstellen, dass die Scroll-Position in jedem Fall wiederhergestellt wird
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
          if (savedPos) {
            console.log("Stelle Scroll-Position nach Fehler in onError wieder her:", savedPos);
            window.scrollTo(0, parseInt(savedPos, 10));
          }
        }
      }, 100);
    },
  });
  
  // Kombinierter Handler zum Erstellen und Verknüpfen einer Charge in einem Durchgang
  const handleCreateAndLink = async () => {
    setIsSubmitting(true);
    if (!selectedItem || !selectedItem.productId) {
      toast({
        title: 'Fehler',
        description: 'Produkt kann nicht ermittelt werden.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }
    
    if (!newBatchNumber) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie eine Chargennummer ein.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }
    
    // Validierung: Chargenmenge darf nicht größer als der gezählte Bestand sein
    // Verwende countedQuantity (eingegebener Wert) statt expectedQuantity (alter Bestand)
    const availableQuantity = selectedItem.countedQuantity ?? selectedItem.expectedQuantity ?? 0;
    if (batchQuantity > availableQuantity) {
      toast({
        title: 'Fehler',
        description: `Die Chargenmenge (${batchQuantity}) darf nicht größer als der gezählte Bestand (${availableQuantity}) sein.`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Verwende unseren optimierten Handler
      await createAndLinkBatch({
        item: selectedItem,
        warehouseId,
        inventoryId,
        batchNumber: newBatchNumber,
        expiryDate: expiryDate ? format(expiryDate, 'yyyy-MM-dd') : null,
        quantity: batchQuantity,
        notes: `Erstellt bei Inventur #${inventoryId}`,
        queryClient,
        onSuccess: () => {
          // Batch-Liste neu laden
          if (onBatchCreated) {
            onBatchCreated();
          }
          
          // Dialog schließen
          onOpenChange(false);
          
          // Formularzustände zurücksetzen
          setNewBatchNumber('');
          setExpiryDate(null);
          setBatchQuantity(1);
          setIsSubmitting(false);
        }
      });
      
    } catch (error: any) {
      console.error('Fehler bei der kombinierten Aktion:', error);
      setIsSubmitting(false);
    }
  };

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
        // Automatisches Erstellen einer neuen Charge mit optimiertem Prozess
        
        // Generiere eine neue Chargennummer mit zentralisierter Funktion
        const autoChargennummer = generateBatchNumber();
        
        // Standarddatum 3 Monate in der Zukunft mit zentralisierter Funktion
        const defaultExpiryDate = getDefaultExpiryDate();
        
        // Informiere den Benutzer über den automatischen Vorgang
        toast({
          title: 'Automatische Erstellung',
          description: `Neue Charge wird erstellt: ${autoChargennummer}`,
        });
        
        // Speichere die aktuelle Scroll-Position
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
        }
        
        // Nutze die zentralisierte Funktion für Batch-Erstellung und Verknüpfung
        try {
          setIsSubmitting(true);
          
          if (!selectedItem) {
            throw new Error('Kein Produkt ausgewählt');
          }
          
          // Führe die kombinierte Operation aus
          createAndLinkBatch({
            item: selectedItem,
            batchNumber: autoChargennummer,
            expiryDate: defaultExpiryDate,
            quantity: selectedItem.countedQuantity || 1,
            warehouseId,
            queryClient,
            inventoryId
          }).then(newBatch => {
            // Toast-Benachrichtigung entfernt - keine störende Meldung mehr
            
            // Dialog schließen
            onOpenChange(false);
            
            // Stelle die Scroll-Position wieder her
            setTimeout(() => {
              const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
              if (savedPos) {
                window.scrollTo(0, parseInt(savedPos, 10));
              }
            }, 50);
          }).catch(error => {
            console.error('Fehler beim automatischen Erstellen:', error);
            toast({
              title: 'Fehler',
              description: 'Die Charge konnte nicht automatisch erstellt werden.',
              variant: 'destructive',
            });
          }).finally(() => {
            setIsSubmitting(false);
          });
        } catch (error) {
          console.error('Fehler bei Batch-Initialisierung:', error);
          setIsSubmitting(false);
        }
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

  // Generiert eine Farbe für den Badge basierend auf dem Ablaufdatum
  const getBatchStatusColor = (expiryDate: string | null) => {
    if (!expiryDate) return "";
    
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return "bg-destructive"; // Abgelaufen
    } else if (diffDays < 30) {
      return "bg-warning text-warning-foreground"; // Bald ablaufend
    } else {
      return "bg-success text-success-foreground"; // Gültig
    }
  };

  // Generiert einen Text für den Badge basierend auf dem Ablaufdatum
  const getBatchStatusText = (expiryDate: string | null) => {
    if (!expiryDate) return "Kein MHD";
    
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return "Abgelaufen";
    } else if (diffDays < 30) {
      return `Läuft bald ab (${diffDays} Tage)`;
    } else {
      return `Gültig (${diffDays} Tage)`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent 
        className="max-w-lg overflow-y-auto max-h-[90vh] bg-white dark:bg-gray-900 border shadow-xl"
        style={{ zIndex: 50 }}
      >
        <>
            <DialogHeader>
              <DialogTitle>
                <div className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Charge auswählen oder erstellen
                </div>
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <div>
                  Wählen Sie eine bestehende Charge aus oder erstellen Sie eine neue für den Artikel: <br />
                  <span className="font-medium">{selectedItem?.productName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm bg-blue-50 p-2 rounded-md">
                  <span>Verfügbarer Bestand:</span>
                  <span className="font-semibold text-blue-600">{selectedItem?.expectedQuantity || 0} Stück</span>
                </div>
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="existing" className="flex-1">
                  Bestehende Chargen {availableBatches.length > 0 && `(${availableBatches.length})`}
                </TabsTrigger>
                <TabsTrigger value="new" className="flex-1">
                  Neue Charge erstellen
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="existing">
                <div className="mb-4 p-2 bg-blue-50 rounded text-sm">
                  <strong>Debug Info:</strong> {availableBatches.length} Chargen gefunden für Produkt {selectedItem?.productId} in Lager {warehouseId}
                </div>
                {availableBatches.length === 0 ? (
                  <div className="flex flex-col items-center p-4 border rounded-md mb-4">
                    <CircleAlert className="h-12 w-12 text-amber-500 mb-2" />
                    <h3 className="text-lg font-medium mb-1">Keine Chargen verfügbar</h3>
                    <p className="text-center text-muted-foreground mb-4">
                      Für dieses Produkt sind noch keine Chargen vorhanden. 
                      Erstellen Sie eine neue Charge, um fortzufahren.
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
                        <Separator className="my-2" />
                        <div className="text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Chargennummer:</span>
                            <span className="font-medium">
                              {availableBatches.find(b => b.id.toString() === selectedBatchId)?.batchNumber}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">MHD:</span>
                            <span>
                              {formatBatchDate(
                                availableBatches.find(b => b.id.toString() === selectedBatchId)?.expiryDate || null
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Aktuelle Menge:</span>
                            <span>
                              {availableBatches.find(b => b.id.toString() === selectedBatchId)?.currentQuantity || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
              
              <TabsContent value="new">
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Chargennummer
                    </label>
                    <Input
                      value={newBatchNumber}
                      onChange={(e) => setNewBatchNumber(e.target.value)}
                      placeholder="Chargennummer eingeben"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Eine eindeutige Kennung für diese Charge
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Menge der Charge
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max={selectedItem?.countedQuantity ?? selectedItem?.expectedQuantity}
                      value={batchQuantity}
                      onChange={(e) => setBatchQuantity(parseInt(e.target.value) || 1)}
                      placeholder="Anzahl eingeben"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-muted-foreground">
                        Anzahl der Produkte in dieser Charge
                      </p>
                      {(selectedItem?.countedQuantity ?? selectedItem?.expectedQuantity) && (
                        <p className="text-xs text-blue-600 font-medium">
                          Max verfügbar: {selectedItem.countedQuantity ?? selectedItem.expectedQuantity}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Mindesthaltbarkeitsdatum
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expiryDate ? format(expiryDate, 'dd.MM.yyyy') : <span>Datum auswählen</span>}
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Datum, an dem die Charge abläuft
                    </p>
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
                  Auswahl speichern
                </Button>
              ) : (
                <Button 
                  onClick={handleCreateAndLink}
                  disabled={isSubmitting || !newBatchNumber}
                >
                  {isSubmitting ? 'Wird gespeichert...' : 'Charge erstellen & verknüpfen'}
                </Button>
              )}
            </DialogFooter>
          </>
      </DialogContent>
    </Dialog>
  );
}
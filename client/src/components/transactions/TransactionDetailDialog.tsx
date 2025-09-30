import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Transaction as BaseTransaction } from "@/lib/api";

// Erweiterte Schnittstelle für Transaktionen mit allen Feldern, die von der API zurückgegeben werden
interface ExtendedTransaction extends BaseTransaction {
  // Allgemeine Felder
  status?: string;
  source?: string;
  extraData?: string | any;
  
  // Produktdetails
  article?: string;
  stockId?: string | number;
  
  // Preisdetails
  priceVat?: number;
  priceWoVat?: number;
  vat?: number;
  
  // Standortdetails
  locationName?: string;
  locationId?: string | number;
  
  // Zahlungsdetails
  paymentType?: string;
  discountCode?: string;
  discountAmount?: number;
  
  // Zeitstempel
  registeredDt?: string | Date;
  transactionDt?: string | Date;
  updatedAt?: string | Date;
  
  // Sonstige
  note?: string;
  
  // Chargen-Informationen
  batchId?: number;
  batchNumber?: string;
  batchExpiryDate?: string;
  supplierBatchNumber?: string;
  
  // Bestellungs-Informationen
  orderId?: number;
  orderNumber?: string;
  orderDate?: string;
  orderStatus?: string;
  
  // Lieferanten-Informationen
  supplierName?: string;
  supplierCompanyName?: string;
  
  // Lieferschein-Informationen
  deliveryNoteId?: number;
  deliveryNoteNumber?: string;
  deliveryDate?: string;
}
import { 
  ShoppingCart, 
  CircleAlert, 
  ArrowUpDown, 
  Clock, 
  Euro, 
  CreditCard, 
  Package, 
  Tag,
  Info,
  CheckCircle,
  XCircle,
  TruckIcon,
  FileText,
  Layers
} from "lucide-react";
import { getTransaction, Transaction } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TransactionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: number | null;
}

export function TransactionDetailDialog({
  open,
  onOpenChange,
  transactionId,
}: TransactionDetailDialogProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [transaction, setTransaction] = useState<ExtendedTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Lade Transaktionsdetails, wenn sich die ID ändert oder der Dialog geöffnet wird
  useEffect(() => {
    if (open && transactionId) {
      setIsLoading(true);
      setError(null);
      
      // Transaktionsdetails abrufen
      getTransaction(transactionId)
        .then((data: ExtendedTransaction) => {
          setTransaction(data as ExtendedTransaction);
          setIsLoading(false);
        })
        .catch((err: Error) => {
          console.error("Fehler beim Laden der Transaktion:", err);
          setError(err);
          setIsLoading(false);
        });
    } else {
      // Zurücksetzen, wenn der Dialog geschlossen wird
      setTransaction(null);
    }
  }, [open, transactionId]);

  // Handling für Dialog-Schließen
  const handleDialogClose = () => {
    onOpenChange(false);
    // Setze den aktiven Tab zurück, wenn der Dialog geschlossen wird
    setActiveTab("details");
  };

  // Formatiere das Datum
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return format(date, "PPpp", { locale: de });
    } catch (error) {
      return String(dateString);
    }
  };

  // Render-Inhalt basierend auf Ladezustand und Daten
  const renderContent = () => {
    if (isLoading) {
      return <Skeleton className="h-[400px] w-full" />;
    }

    if (error) {
      return (
        <div className="rounded-md bg-destructive/15 p-4 text-center">
          <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <h3 className="font-medium text-destructive">Fehler beim Laden der Transaktion</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message || "Beim Abrufen der Transaktion ist ein Fehler aufgetreten."}
          </p>
        </div>
      );
    }

    if (!transaction) {
      return (
        <div className="text-center p-8">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Daten verfügbar</h3>
          <p className="text-muted-foreground">Die angeforderte Transaktion konnte nicht gefunden werden.</p>
        </div>
      );
    }

    // Extrahiere extraData als JSON-Objekt, wenn vorhanden
    let extraData = {};
    try {
      if (transaction.extraData) {
        extraData = typeof transaction.extraData === 'string' 
          ? JSON.parse(transaction.extraData) 
          : transaction.extraData;
      }
    } catch (e) {
      console.error("Fehler beim Parsen von extraData:", e);
      extraData = { error: "Fehler beim Parsen der Daten" };
    }

    return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="details" className="flex-1">
            Details
          </TabsTrigger>
          <TabsTrigger value="vendon-data" className="flex-1">
            Vendon API-Daten
          </TabsTrigger>
        </TabsList>

        {/* Tab: Allgemeine Details */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Linke Spalte: Allgemeine Infos */}
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <ShoppingCart className="h-4 w-4 mr-1" /> Transaktionsdetails
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">ID:</div>
                  <div className="font-medium">{transaction.id}</div>
                  
                  <div className="text-muted-foreground">Vendon ID:</div>
                  <div className="font-medium">{transaction.vendonId || "-"}</div>
                  
                  <div className="text-muted-foreground">Status:</div>
                  <div className="font-medium">
                    <Badge variant={transaction.status === "success" ? "success" : transaction.status === "failed" ? "destructive" : "outline"}>
                      {transaction.status === "success" ? "Erfolgreich" : 
                       transaction.status === "failed" ? "Fehlgeschlagen" : 
                       transaction.status || "Unbekannt"}
                    </Badge>
                  </div>
                  
                  <div className="text-muted-foreground">Datum:</div>
                  <div className="font-medium">{formatDate(transaction.datetime)}</div>
                  
                  <div className="text-muted-foreground">Quelle:</div>
                  <div className="font-medium">{transaction.source || "-"}</div>
                </div>
              </div>

              {/* Produkt-Informationen */}
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <Package className="h-4 w-4 mr-1" /> Produktinformationen
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Produkt:</div>
                  <div className="font-medium">{transaction.productName || "-"}</div>
                  
                  <div className="text-muted-foreground">Produkt-ID:</div>
                  <div className="font-medium">{transaction.productId || "-"}</div>
                  
                  <div className="text-muted-foreground">Menge:</div>
                  <div className="font-medium">{transaction.quantity || 1}</div>
                  
                  <div className="text-muted-foreground">Artikel:</div>
                  <div className="font-medium">{transaction.article || "-"}</div>
                  
                  <div className="text-muted-foreground">Stock ID:</div>
                  <div className="font-medium">{transaction.stockId || "-"}</div>
                </div>
              </div>

              {/* Rückverfolgung: Charge, Bestellung, Lieferung */}
              {(transaction.batchNumber || transaction.orderNumber || transaction.deliveryNoteNumber) && (
                <div className="rounded-md border p-4 bg-blue-50/50 dark:bg-blue-950/20">
                  <h3 className="text-sm font-medium mb-3 flex items-center">
                    <Layers className="h-4 w-4 mr-1" /> Produktrückverfolgung
                  </h3>
                  
                  <div className="space-y-3">
                    {/* Charge */}
                    {transaction.batchNumber && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                          <Package className="h-3 w-3 mr-1" />
                          Charge
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm pl-4">
                          <div className="text-muted-foreground">Chargennr.:</div>
                          <div className="font-medium">{transaction.batchNumber}</div>
                          
                          {transaction.supplierBatchNumber && (
                            <>
                              <div className="text-muted-foreground">Lieferanten-Charge:</div>
                              <div className="font-medium">{transaction.supplierBatchNumber}</div>
                            </>
                          )}
                          
                          {transaction.batchExpiryDate && (
                            <>
                              <div className="text-muted-foreground">MHD:</div>
                              <div className="font-medium">
                                {format(new Date(transaction.batchExpiryDate), 'dd.MM.yyyy', { locale: de })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bestellung */}
                    {transaction.orderNumber && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                          <FileText className="h-3 w-3 mr-1" />
                          Bestellung
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm pl-4">
                          <div className="text-muted-foreground">Bestellnr.:</div>
                          <div className="font-medium">{transaction.orderNumber}</div>
                          
                          {transaction.orderDate && (
                            <>
                              <div className="text-muted-foreground">Bestelldatum:</div>
                              <div className="font-medium">
                                {format(new Date(transaction.orderDate), 'dd.MM.yyyy', { locale: de })}
                              </div>
                            </>
                          )}
                          
                          {transaction.supplierName && (
                            <>
                              <div className="text-muted-foreground">Lieferant:</div>
                              <div className="font-medium">
                                {transaction.supplierName}
                                {transaction.supplierCompanyName && transaction.supplierCompanyName !== transaction.supplierName && (
                                  <div className="text-xs text-muted-foreground">{transaction.supplierCompanyName}</div>
                                )}
                              </div>
                            </>
                          )}
                          
                          {transaction.orderStatus && (
                            <>
                              <div className="text-muted-foreground">Status:</div>
                              <div className="font-medium">
                                <Badge variant={
                                  transaction.orderStatus === 'delivered' ? 'success' : 
                                  transaction.orderStatus === 'cancelled' ? 'destructive' : 
                                  'outline'
                                }>
                                  {transaction.orderStatus === 'pending' ? 'Ausstehend' :
                                   transaction.orderStatus === 'ordered' ? 'Bestellt' :
                                   transaction.orderStatus === 'delivered' ? 'Geliefert' :
                                   transaction.orderStatus === 'cancelled' ? 'Storniert' :
                                   transaction.orderStatus}
                                </Badge>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Lieferung */}
                    {(transaction.deliveryNoteNumber || transaction.deliveryDate) && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                          <TruckIcon className="h-3 w-3 mr-1" />
                          Lieferung
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm pl-4">
                          {transaction.deliveryNoteNumber && (
                            <>
                              <div className="text-muted-foreground">Lieferscheinnr.:</div>
                              <div className="font-medium">{transaction.deliveryNoteNumber}</div>
                            </>
                          )}
                          
                          {transaction.deliveryDate && (
                            <>
                              <div className="text-muted-foreground">Lieferdatum:</div>
                              <div className="font-medium">
                                {format(new Date(transaction.deliveryDate), 'dd.MM.yyyy', { locale: de })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rechte Spalte: Preis, Automat, Zahlung */}
            <div className="space-y-4">
              {/* Preisdetails */}
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <Euro className="h-4 w-4 mr-1" /> Preisdetails
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Preis:</div>
                  <div className="font-medium">
                    {transaction.price?.toFixed(2)} {transaction.currency || "€"}
                  </div>
                  
                  <div className="text-muted-foreground">MwSt-Betrag:</div>
                  <div className="font-medium">
                    {transaction.priceVat 
                      ? `${transaction.priceVat.toFixed(2)} ${transaction.currency || "€"}` 
                      : "-"}
                  </div>
                  
                  <div className="text-muted-foreground">Netto-Preis:</div>
                  <div className="font-medium">
                    {transaction.priceWoVat 
                      ? `${transaction.priceWoVat.toFixed(2)} ${transaction.currency || "€"}` 
                      : "-"}
                  </div>
                  
                  <div className="text-muted-foreground">MwSt-Satz:</div>
                  <div className="font-medium">
                    {transaction.vat ? `${transaction.vat}%` : "-"}
                  </div>
                </div>
              </div>

              {/* Automaten-Informationen */}
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <Tag className="h-4 w-4 mr-1" /> Automateninformationen
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Automat:</div>
                  <div className="font-medium">{transaction.machineName || "-"}</div>
                  
                  <div className="text-muted-foreground">Automaten-ID:</div>
                  <div className="font-medium">{transaction.machineId || "-"}</div>
                  
                  <div className="text-muted-foreground">Standort:</div>
                  <div className="font-medium">{transaction.locationName || "-"}</div>
                  
                  <div className="text-muted-foreground">Standort-ID:</div>
                  <div className="font-medium">{transaction.locationId || "-"}</div>
                </div>
              </div>

              {/* Zahlungsdetails */}
              <div className="rounded-md border p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  <CreditCard className="h-4 w-4 mr-1" /> Zahlungsdetails
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Zahlungsmethode:</div>
                  <div className="font-medium">
                    {transaction.paymentMethod === "CASH" 
                      ? "Bargeld" 
                      : transaction.paymentMethod === "CASHLESS" 
                      ? "Kartenzahlung" 
                      : transaction.paymentMethod || "-"}
                  </div>
                  
                  <div className="text-muted-foreground">Zahlungstyp:</div>
                  <div className="font-medium">{transaction.paymentType || "-"}</div>
                  
                  <div className="text-muted-foreground">Rabattcode:</div>
                  <div className="font-medium">{transaction.discountCode || "-"}</div>
                  
                  <div className="text-muted-foreground">Rabattbetrag:</div>
                  <div className="font-medium">
                    {transaction.discountAmount 
                      ? `${transaction.discountAmount.toFixed(2)} ${transaction.currency || "€"}` 
                      : "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Zeitstempel und Metadaten */}
          <div className="rounded-md border p-4">
            <h3 className="text-sm font-medium mb-2 flex items-center">
              <Clock className="h-4 w-4 mr-1" /> Zeitstempel
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="grid grid-cols-2">
                <div className="text-muted-foreground">Transaktionsdatum:</div>
                <div className="font-medium">{formatDate(transaction.datetime)}</div>
              </div>
              
              <div className="grid grid-cols-2">
                <div className="text-muted-foreground">Registriert am:</div>
                <div className="font-medium">{formatDate(transaction.registeredDt)}</div>
              </div>
              
              <div className="grid grid-cols-2">
                <div className="text-muted-foreground">Transaktion am:</div>
                <div className="font-medium">{formatDate(transaction.transactionDt)}</div>
              </div>
              
              <div className="grid grid-cols-2">
                <div className="text-muted-foreground">Aktualisiert am:</div>
                <div className="font-medium">{formatDate(transaction.updatedAt)}</div>
              </div>
            </div>
          </div>

          {/* Weitere Anmerkungen */}
          {transaction.note && (
            <div className="rounded-md border p-4">
              <h3 className="text-sm font-medium mb-2 flex items-center">
                <Info className="h-4 w-4 mr-1" /> Anmerkungen
              </h3>
              <p className="text-sm">{transaction.note}</p>
            </div>
          )}
        </TabsContent>

        {/* Tab: Vendon API-Daten (Rohdaten) */}
        <TabsContent value="vendon-data" className="space-y-4">
          <div className="rounded-md border p-4 bg-muted/20">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium flex items-center">
                <ArrowUpDown className="h-4 w-4 mr-1" /> 
                Vendon API-Rohdaten
              </h3>
              <Badge variant="outline" className="text-xs bg-primary/5">
                Aus der Vendon API
              </Badge>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4">
              Diese Daten werden direkt aus der Vendon API übernommen und im Feld <code>extraData</code> gespeichert.
              Hier können Sie sehen, welche spezifischen Felder aus der API kommen.
            </p>
            
            <ScrollArea className="h-[400px] rounded-md border p-2 bg-muted/5">
              <Accordion type="multiple" className="w-full">
                {/* Basis Vendon-Daten als Accordion-Item */}
                <AccordionItem value="vendon-base">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Vendon</Badge>
                      Basis-Daten
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">vendonId</div>
                        <div className="font-medium">{transaction.vendonId || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">machineId</div>
                        <div className="font-medium">{transaction.machineId || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">datetime</div>
                        <div className="font-medium">{transaction.datetime || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">productId</div>
                        <div className="font-medium">{transaction.productId || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">price</div>
                        <div className="font-medium">{transaction.price || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">currency</div>
                        <div className="font-medium">{transaction.currency || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">paymentMethod</div>
                        <div className="font-medium">{transaction.paymentMethod || "-"}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                        <div className="text-primary font-mono">source</div>
                        <div className="font-medium">{transaction.source || "-"}</div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Extra Daten als Accordion-Item */}
                <AccordionItem value="extra-data">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">extraData</Badge>
                      Erweiterte Vendon-Rohdaten
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {Object.keys(extraData).length > 0 ? (
                      <div className="space-y-2 text-sm">
                        {Object.entries(extraData).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-2 gap-1 px-1 py-1 hover:bg-muted/20 rounded">
                            <div className="text-primary font-mono">{key}</div>
                            <div className="font-medium">
                              {value === null 
                                ? "null" 
                                : typeof value === "object" 
                                ? JSON.stringify(value) 
                                : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine erweiterten Daten verfügbar</p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Komplette Rohdaten als JSON */}
                <AccordionItem value="raw-json">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">JSON</Badge>
                      Komplette Rohdaten
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="p-2 bg-muted/10 rounded text-xs overflow-auto max-h-[300px]">
                      {JSON.stringify(transaction, null, 2)}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Transaktionsdetails
            {transaction?.vendonId && (
              <Badge variant="outline" className="ml-2">
                Vendon ID: {transaction.vendonId}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {transaction
              ? `Transaktion vom ${formatDate(transaction.datetime)} | ${transaction.productName || "Unbekanntes Produkt"}`
              : "Transaktionsdetails werden geladen..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-2">
          {renderContent()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleDialogClose}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
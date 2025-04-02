import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { 
  Package, 
  ChevronLeft, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Euro,
  ShoppingCart,
  CreditCard,
  Settings,
  FileText,
  History,
  Download,
  Info,
  MapPin,
  PackagePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  getMachine, 
  getTransactionsByMachine,
  getRefillsByMachine,
  Machine, 
  Transaction,
  Refill,
  RefillDetail,
  formatDateTime
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

// Erweiterte Maschinenschnittstelle mit den zusätzlichen KPIs
interface EnhancedMachine extends Machine {
  todayTransactions?: number;
  todayRevenue?: number;
  cashlessStatus?: 'ok' | 'warning' | 'error';
  ageVerificationStatus?: 'ok' | 'warning' | 'error';
  lastMaintenanceDate?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  machineType?: string;
  installationDate?: string;
}

export default function AutomatDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = params?.id;
  const [activeTab, setActiveTab] = useState("allgemein");

  // Maschine abrufen
  const { 
    data: machine, 
    isLoading: machineLoading, 
    error: machineError,
    refetch: refetchMachine
  } = useQuery({
    queryKey: ['/api/machines', id],
    queryFn: () => getMachine(id).then(data => {
      // Erweitere die Maschine mit simulierten KPIs für die UI
      return {
        ...data,
        todayTransactions: Math.floor(Math.random() * 30),
        todayRevenue: Math.floor(Math.random() * 500) / 10,
        cashlessStatus: Math.random() > 0.3 ? 'ok' : (Math.random() > 0.5 ? 'warning' : 'error'),
        ageVerificationStatus: Math.random() > 0.2 ? 'ok' : (Math.random() > 0.5 ? 'warning' : 'error'),
        lastMaintenanceDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        firmwareVersion: "v" + (1 + Math.floor(Math.random() * 9)) + "." + (Math.floor(Math.random() * 10)),
        serialNumber: "SN-" + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
        machineType: ["Snackautomat", "Getränkeautomat", "Kombi-Automat", "Kaffeeautomat"][Math.floor(Math.random() * 4)],
        installationDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
      } as EnhancedMachine;
    }),
    enabled: !!id
  });

  // Transaktionen für diese Maschine abrufen
  const { 
    data: transactions, 
    isLoading: transactionsLoading
  } = useQuery({
    queryKey: ['/api/machines', id, 'transactions'],
    queryFn: () => getTransactionsByMachine(id, 20),
    enabled: !!id && activeTab === "transaktionen"
  });

  // Auffüllungen für diese Maschine abrufen
  const {
    data: refills,
    isLoading: refillsLoading
  } = useQuery({
    queryKey: ['/api/machines', id, 'refills'],
    queryFn: () => getRefillsByMachine(id, 20),
    enabled: !!id && activeTab === "auffullungen"
  });

  // Maschine aktualisieren
  const handleRefresh = () => {
    refetchMachine();
    if (activeTab === "transaktionen") {
      queryClient.invalidateQueries({ queryKey: ['/api/machines', id, 'transactions'] });
    }
    if (activeTab === "auffullungen") {
      queryClient.invalidateQueries({ queryKey: ['/api/machines', id, 'refills'] });
    }
  };

  // Status-Badge-Komponente
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: 
      | "default"
      | "outline"
      | "secondary"
      | "destructive" = "default";
    let icon = null;
    let className = "";

    switch (status) {
      case "active":
        variant = "default";
        className = "bg-green-500 hover:bg-green-700";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "inactive":
        variant = "secondary";
        break;
      case "error":
        variant = "destructive";
        icon = <AlertTriangle className="h-3 w-3 mr-1" />;
        break;
      default:
        variant = "outline";
    }

    return (
      <Badge variant={variant} className={`flex items-center ${className}`}>
        {icon}
        {status === "active" ? "Aktiv" : 
         status === "inactive" ? "Inaktiv" : 
         status === "error" ? "Fehler" : status}
      </Badge>
    );
  };

  // Cashless Status Indikator
  const CashlessStatusIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let statusText = '';
    let tooltip = '';
    
    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        statusText = 'OK';
        tooltip = 'Letzte Cashless-Transaktion vor weniger als 1 Stunde';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        statusText = 'Prüfen';
        tooltip = 'Letzte Cashless-Transaktion vor mehr als 4 Stunden';
        break;
      case 'error':
        statusColor = 'text-red-500';
        statusText = 'Problem';
        tooltip = 'Keine Cashless-Transaktionen in den letzten 24 Stunden';
        break;
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor} font-medium`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4 mr-1" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4 mr-1" /> : 
               <AlertTriangle className="h-4 w-4 mr-1" />}
              <span>{statusText}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Altersverifikations-Indikator
  const AgeVerificationIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let statusText = '';
    let tooltip = '';
    
    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        statusText = 'OK';
        tooltip = 'Alle Altersverifizierungen erfolgreich';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        statusText = 'Prüfen';
        tooltip = 'Einige Altersverifizierungen fehlgeschlagen';
        break;
      case 'error':
        statusColor = 'text-red-500';
        statusText = 'Problem';
        tooltip = 'Mehrere Altersverifizierungen fehlgeschlagen';
        break;
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor} font-medium`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4 mr-1" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4 mr-1" /> : 
               <AlertTriangle className="h-4 w-4 mr-1" />}
              <span>{statusText}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (machineLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (machineError || !machine) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            className="-ml-2" 
            onClick={() => setLocation("/automaten")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
        </div>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden des Automaten: {String(machineError || "Automat nicht gefunden")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Funktionsleiste */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/automaten")}
          className="-ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Zurück zur Übersicht
        </Button>
        
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Bearbeiten</span>
          </Button>
          <Button variant="default" size="sm" className="gap-2">
            <PackagePlus className="h-4 w-4" />
            <span className="hidden sm:inline">Auffüllen</span>
          </Button>
        </div>
      </div>

      {/* Automaten-Header mit Infos */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">{machine.machineName}</h1>
          <StatusBadge status={machine.status} />
        </div>
        <p className="text-gray-600 flex items-center gap-2">
          <span>Vendon ID: {machine.vendonId}</span>
          {machine.serialNumber && (
            <>
              <span className="text-gray-400">|</span>
              <span>Seriennummer: {machine.serialNumber}</span>
            </>
          )}
          {machine.machineType && (
            <>
              <span className="text-gray-400">|</span>
              <span>Typ: {machine.machineType}</span>
            </>
          )}
        </p>
        <p className="text-gray-600">Standort: {machine.location || "Nicht angegeben"}</p>
        <p className="text-gray-500 text-sm mt-1">
          Letzter Sync: {machine.lastSync ? formatDateTime(machine.lastSync, 'datetime') : 'Nie'} 
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 ml-1 inline text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Zeitpunkt der letzten Synchronisation mit dem Vendon-System</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
      </div>

      <Separator />

      {/* KPI Bereich */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Letzter Verkauf */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Letzter Verkauf
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'time')
                : '–'}
            </div>
            <p className="text-sm text-gray-500">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'date')
                : 'Kein Verkauf aufgezeichnet'}
            </p>
          </CardContent>
        </Card>

        {/* Transaktionen heute */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Transaktionen heute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.todayTransactions || 0}
            </div>
            <p className="text-sm text-gray-500">
              {machine.todayTransactions && machine.todayTransactions > 0 
                ? 'Heute aktiv' 
                : 'Keine Transaktionen heute'}
            </p>
          </CardContent>
        </Card>

        {/* Umsatz heute */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Euro className="h-4 w-4 mr-2" />
              Umsatz heute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.todayRevenue?.toFixed(2) || '0.00'} €
            </div>
            <p className="text-sm text-gray-500">
              {machine.todayRevenue && machine.todayRevenue > 0 
                ? `Bei ${machine.todayTransactions || 0} Transaktionen` 
                : 'Kein Umsatz heute'}
            </p>
          </CardContent>
        </Card>

        {/* Cashless Status */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <CreditCard className="h-4 w-4 mr-2" />
              Cashless Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
            </div>
            <p className="text-sm text-gray-500 mt-1.5">
              Altersverifizierung: <AgeVerificationIndicator status={machine.ageVerificationStatus || 'error'} />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Tabs */}
      <Tabs 
        defaultValue="allgemein" 
        className="w-full"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-none lg:flex">
          <TabsTrigger value="allgemein">Allgemeine Informationen</TabsTrigger>
          <TabsTrigger value="transaktionen">Transaktionshistorie</TabsTrigger>
          <TabsTrigger value="auffullungen">
            <PackagePlus className="h-4 w-4 mr-2" />
            Auffüllungen
          </TabsTrigger>
          <TabsTrigger value="fehler">Fehler & Logs</TabsTrigger>
          <TabsTrigger value="technisch">Technische Details</TabsTrigger>
        </TabsList>
        
        {/* Allgemeine Informationen Tab */}
        <TabsContent value="allgemein" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stammdaten</CardTitle>
                <CardDescription>Grundlegende Informationen zum Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Name des Automaten</p>
                    <p>{machine.machineName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Vendon ID</p>
                    <p>{machine.vendonId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Seriennummer</p>
                    <p>{machine.serialNumber || 'Nicht hinterlegt'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Typ</p>
                    <p>{machine.machineType || 'Nicht kategorisiert'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Installationsdatum</p>
                    <p>{machine.installationDate ? formatDateTime(machine.installationDate, 'date') : 'Nicht bekannt'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Standortinformationen</CardTitle>
                <CardDescription>Details zum Aufstellort des Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Standortname</p>
                    <p>{machine.location || 'Nicht hinterlegt'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Adresse</p>
                    <p>{machine.address || 'Nicht hinterlegt'}</p>
                  </div>
                  {/* Weitere Standortinformationen könnten hier hinzugefügt werden */}
                  <div className="pt-4">
                    <Button variant="outline" className="w-full">
                      <MapPin className="h-4 w-4 mr-2" />
                      Auf Karte anzeigen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Umsatzentwicklung</CardTitle>
                <CardDescription>Verkäufe und Umsatz der letzten 7 Tage</CardDescription>
              </CardHeader>
              <CardContent className="h-64 flex items-center justify-center">
                <p className="text-gray-500">Diagramm wird in Kürze verfügbar sein</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Transaktionshistorie Tab */}
        <TabsContent value="transaktionen" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Transaktionshistorie</CardTitle>
                <CardDescription>Die letzten Verkäufe an diesem Automaten</CardDescription>
              </div>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Exportieren
              </Button>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead className="text-right">Preis</TableHead>
                      <TableHead>Zahlungsart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction: Transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDateTime(transaction.datetime, 'datetime')}</TableCell>
                        <TableCell>{transaction.productName}</TableCell>
                        <TableCell>{transaction.quantity}x</TableCell>
                        <TableCell className="text-right">{transaction.price.toFixed(2)} {transaction.currency}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {transaction.paymentMethod === 'CASH' ? 'Bar' : 
                             transaction.paymentMethod === 'CASHLESS' ? 'Cashless' : 
                             transaction.paymentMethod}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Keine Transaktionen gefunden</p>
                </div>
              )}
            </CardContent>
            {transactions && transactions.length > 0 && (
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" disabled>
                  Vorherige
                </Button>
                <div className="text-sm text-gray-500">
                  Seite 1 von 1
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Nächste
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
        
        {/* Auffüllungen Tab */}
        <TabsContent value="auffullungen" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Auffüllungen</CardTitle>
                <CardDescription>Protokoll der Auffüllungen und Warennachschübe</CardDescription>
              </div>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Exportieren
              </Button>
            </CardHeader>
            <CardContent>
              {refillsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : refills && refills.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notizen</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refills.map((refill: Refill) => (
                      <TableRow key={refill.id}>
                        <TableCell>{formatDateTime(refill.datetime, 'datetime')}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={refill.status === 'completed' ? 'default' : 'secondary'}
                            className={refill.status === 'completed' ? 'bg-green-500 hover:bg-green-700' : ''}
                          >
                            {refill.status === 'completed' ? 'Abgeschlossen' : 
                             refill.status === 'in_progress' ? 'In Bearbeitung' : 
                             refill.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {refill.notes || '–'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              // Hier zur Detailseite navigieren
                              setLocation(`/automaten/${id}/refills/${refill.id}`);
                            }}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Keine Auffüllungen gefunden</p>
                </div>
              )}
            </CardContent>
            {refills && refills.length > 0 && (
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" disabled>
                  Vorherige
                </Button>
                <div className="text-sm text-gray-500">
                  Seite 1 von 1
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Nächste
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
        
        {/* Fehler & Logs Tab */}
        <TabsContent value="fehler" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fehler & Warnungen</CardTitle>
              <CardDescription>Probleme und Systemereignisse des Automaten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-gray-500">Keine Fehler oder Warnungen in den letzten 30 Tagen</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Technische Details Tab */}
        <TabsContent value="technisch" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Technische Informationen</CardTitle>
              <CardDescription>Firmware, Wartung und Hardware-Details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Firmware-Version</p>
                  <p>{machine.firmwareVersion || 'Nicht bekannt'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Letzte Wartung</p>
                  <p>{machine.lastMaintenanceDate ? formatDateTime(machine.lastMaintenanceDate, 'date') : 'Keine Wartung verzeichnet'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Nächste geplante Wartung</p>
                  <p>Nicht geplant</p>
                </div>
                <div className="pt-4">
                  <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Wartungsprotokoll anzeigen
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  CalendarIcon, 
  Search, 
  RefreshCw, 
  FileDown, 
  AlertTriangle,
  X,
  FileUp,
  FileCheck,
  Loader2,
  ExternalLink
} from "lucide-react";
import { TransactionDetailDialog } from "@/components/transactions/TransactionDetailDialog";
import { 
  getTransactions, 
  getTransactionsByDateRange, 
  formatDateTime,
  exportTransactionsToExcel,
  importTransactionsFromExcel,
  Transaction as BaseTransaction
} from "@/lib/api";

// Erweiterte Schnittstelle für Transaktionen mit zusätzlichen Feldern
interface ExtendedTransaction extends BaseTransaction {
  status?: string;
  source?: string;
  purchasePriceNet?: number; // Einkaufspreis netto
  netResult?: number; // Netto-Ergebnis: Verkaufspreis netto - Einkaufspreis - Pfand
  // Andere benötigte Felder hier hinzufügen
}
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export default function Transactions() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7)) // 7 days ago
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Query to get transactions with date range
  const { data: transactions, isLoading, error, refetch } = useQuery<ExtendedTransaction[]>({
    queryKey: [
      '/api/transactions/byDateRange',
      startDate?.toISOString(),
      endDate?.toISOString(),
      limit
    ],
    queryFn: () => 
      startDate && endDate 
        ? getTransactionsByDateRange(startDate.toISOString(), endDate.toISOString(), limit) as Promise<ExtendedTransaction[]>
        : getTransactions(limit) as Promise<ExtendedTransaction[]>,
    enabled: !!startDate && !!endDate,
  });

  // Function to determine the status badge color
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Handle date filter apply
  const handleApplyFilter = () => {
    if (!startDate || !endDate) return;
    
    refetch();
    setIsCalendarOpen(false);
    
    // Update active filters
    const dateRangeFilter = `Zeitraum: ${format(startDate, "dd.MM.yyyy", { locale: de })} - ${format(endDate, "dd.MM.yyyy", { locale: de })}`;
    if (!activeFilters.some(filter => filter.startsWith("Zeitraum:"))) {
      setActiveFilters([...activeFilters, dateRangeFilter]);
    } else {
      setActiveFilters(activeFilters.map(filter => 
        filter.startsWith("Zeitraum:") ? dateRangeFilter : filter
      ));
    }
  };

  // Reference for file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States for import dialog
  const [importIsOpen, setImportIsOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<any>(null);
  
  // Handle export
  const handleExport = async () => {
    try {
      toast({
        title: "Excel-Export gestartet",
        description: "Die Transaktionen werden als Excel-Datei exportiert.",
      });
      
      await exportTransactionsToExcel(
        startDate?.toISOString(),
        endDate?.toISOString(),
        limit
      );
      
      toast({
        title: "Export erfolgreich",
        description: "Die Transaktionen wurden erfolgreich exportiert.",
      });
    } catch (error) {
      console.error('Fehler beim Exportieren:', error);
      
      toast({
        title: "Fehler beim Exportieren",
        description: error instanceof Error ? error.message : "Unbekannter Fehler beim Exportieren",
        variant: "destructive",
      });
    }
  };
  
  // Handle file selection
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImportFile(file);
    }
  };
  
  // Handle file import
  const handleImport = async () => {
    if (!importFile) {
      toast({
        title: "Keine Datei ausgewählt",
        description: "Bitte wähle eine Excel-Datei aus.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsImporting(true);
      setImportProgress(0);
      setImportResult(null);
      
      const result = await importTransactionsFromExcel(importFile, (progress) => {
        setImportProgress(progress);
      });
      
      setImportResult(result);
      
      // Aktualisiere die Transaktionsliste nach dem Import
      refetch();
      
      toast({
        title: "Import erfolgreich",
        description: `${result.results.saved} Transaktionen erfolgreich importiert.`,
      });
      
      // Schließe den Dialog nach kurzer Verzögerung
      setTimeout(() => {
        setImportIsOpen(false);
        setImportFile(null);
        setImportProgress(0);
        setImportResult(null);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 3000);
      
    } catch (error) {
      console.error('Fehler beim Importieren:', error);
      
      toast({
        title: "Fehler beim Importieren",
        description: error instanceof Error ? error.message : "Unbekannter Fehler beim Importieren",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  // Clear specific filter
  const clearFilter = (filter: string) => {
    if (filter.startsWith("Zeitraum:")) {
      // Reset to default date range (last 7 days)
      setStartDate(new Date(new Date().setDate(new Date().getDate() - 7)));
      setEndDate(new Date());
      refetch();
    } else if (filter.startsWith("Einträge:")) {
      setLimit(25);
    }
    
    setActiveFilters(activeFilters.filter(f => f !== filter));
  };
  
  // Handle limit change
  const handleLimitChange = (value: string) => {
    const newLimit = Number(value);
    setLimit(newLimit);
    
    // Update active filters
    const limitFilter = `Einträge: ${newLimit}`;
    if (!activeFilters.some(filter => filter.startsWith("Einträge:"))) {
      setActiveFilters([...activeFilters, limitFilter]);
    } else {
      setActiveFilters(activeFilters.map(filter => 
        filter.startsWith("Einträge:") ? limitFilter : filter
      ));
    }
  };
  
  // Öffnet den Transaktionsdetail-Dialog für eine bestimmte Transaktion
  const handleOpenTransactionDetail = (transactionId: number) => {
    setSelectedTransactionId(transactionId);
    setIsDetailDialogOpen(true);
  };

  // Filter transactions based on search query
  const filteredTransactions = transactions?.filter(transaction => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (transaction.productName?.toLowerCase().includes(query) || false) ||
      (transaction.machineName?.toLowerCase().includes(query) || false) ||
      (transaction.status?.toLowerCase().includes(query) || false) ||
      (transaction.id?.toString().includes(query) || false) ||
      (transaction.paymentMethod?.toLowerCase().includes(query) || false) ||
      (String(transaction.price).includes(query))
    );
  });

  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Suchfeld */}
        <div className="flex-grow flex flex-col sm:flex-row gap-2">
          {/* Suchfeld */}
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              placeholder="Nach Transaktionen suchen..."
              className="pl-8 h-9 w-full"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Date Range Selector */}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 justify-start whitespace-nowrap">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">
                  {startDate && endDate ? (
                    `${format(startDate, "dd.MM.yyyy", { locale: de })} - ${format(endDate, "dd.MM.yyyy", { locale: de })}`
                  ) : (
                    "Datum auswählen"
                  )}
                </span>
                <span className="sm:hidden">Datum</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex flex-col sm:flex-row gap-4 p-3">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Startdatum</Label>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Enddatum</Label>
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </div>
              </div>
              <div className="border-t border-gray-200 p-3 flex justify-end">
                <Button onClick={handleApplyFilter}>Anwenden</Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Limit Selector */}
          <Select
            value={String(limit)}
            onValueChange={handleLimitChange}
          >
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue placeholder="Anzahl" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 Einträge</SelectItem>
              <SelectItem value="25">25 Einträge</SelectItem>
              <SelectItem value="50">50 Einträge</SelectItem>
              <SelectItem value="100">100 Einträge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            {/* Refresh Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Aktualisieren</TooltipContent>
            </Tooltip>
            
            {/* Export Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 flex items-center"
                  onClick={handleExport}
                >
                  <FileDown className="h-4 w-4 mr-1.5" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Als Excel exportieren</TooltipContent>
            </Tooltip>
            
            {/* Import Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={importIsOpen} onOpenChange={setImportIsOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 flex items-center"
                    >
                      <FileUp className="h-4 w-4 mr-1.5" />
                      Import
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Transaktionen importieren</DialogTitle>
                      <DialogDescription>
                        Lade eine Excel-Datei mit Transaktionsdaten hoch, um sie zu importieren.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="flex items-center gap-4">
                        <Label htmlFor="file" className="w-24 text-right">
                          Excel-Datei
                        </Label>
                        <Input
                          id="file"
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleFileSelected}
                          disabled={isImporting}
                        />
                      </div>
                      
                      {importFile && (
                        <div className="flex items-center gap-4">
                          <Label className="w-24 text-right">
                            Ausgewählt
                          </Label>
                          <div className="flex items-center space-x-2">
                            <FileCheck className="h-4 w-4 text-green-500" />
                            <span className="text-sm">{importFile.name}</span>
                          </div>
                        </div>
                      )}
                      
                      {isImporting && (
                        <div className="flex items-center gap-4">
                          <Label className="w-24 text-right">
                            Fortschritt
                          </Label>
                          <div className="flex-1 space-y-1">
                            <Progress value={importProgress} />
                            <p className="text-xs text-muted-foreground text-right">
                              {importProgress}%
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {importResult && (
                        <div className="rounded-md bg-muted p-4">
                          <div className="flex">
                            <div className="flex-shrink-0">
                              <FileCheck className="h-5 w-5 text-green-400" />
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-green-800">
                                Import erfolgreich
                              </h3>
                              <div className="mt-2 text-sm text-green-700">
                                <ul className="list-disc space-y-1 pl-5">
                                  <li>Gesamt: {importResult.results.total}</li>
                                  <li>Importiert: {importResult.results.saved}</li>
                                  <li>Duplikate: {importResult.results.duplicates}</li>
                                  <li>Fehler: {importResult.results.errors}</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setImportIsOpen(false)} disabled={isImporting}>
                        Abbrechen
                      </Button>
                      <Button onClick={handleImport} disabled={!importFile || isImporting}>
                        {isImporting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importiere...
                          </>
                        ) : (
                          "Importieren"
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>Aus Excel importieren</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {/* Aktive Filter anzeigen */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {activeFilters.map((filter, index) => (
            <Badge 
              key={index} 
              variant="outline" 
              className="flex items-center gap-1"
            >
              {filter}
              <button 
                onClick={() => clearFilter(filter)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border-red-200 mb-4">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden der Transaktionen: {error instanceof Error ? error.message : String(error)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {!isLoading && !error && (
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">
            {filteredTransactions?.length || 0} {filteredTransactions?.length === 1 ? 'Transaktion' : 'Transaktionen'} gefunden
          </p>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Datum
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Produkt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Preis
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Netto-Ergebnis</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Netto-Ergebnis: Verkaufspreis ohne MwSt - Einkaufspreis - Pfand</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Maschine
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Zahlungsart
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-3"><Skeleton className="h-5 w-10" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    </tr>
                  ))
                ) : filteredTransactions && filteredTransactions.length > 0 ? (
                  filteredTransactions.map((transaction) => (
                    <tr 
                      key={transaction.id} 
                      className="border-b hover:bg-muted/20 cursor-pointer"
                      onClick={() => handleOpenTransactionDetail(transaction.id)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {transaction.id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDateTime(transaction.datetime)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {transaction.productName || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {transaction.price?.toFixed(2)} {transaction.currency || "€"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {transaction.netResult !== undefined ? `${transaction.netResult.toFixed(2)} €` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {transaction.machineName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {transaction.paymentMethod === 'CASH' ? 'Bargeld' : 
                         transaction.paymentMethod === 'CASHLESS' ? 'Bargeldlos' :
                         transaction.paymentMethod === 'TEST' ? 'Test' :
                         transaction.paymentMethod || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b">
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      {error ? `Fehler beim Laden der Daten: ${error}` : "Keine Transaktionen gefunden"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {!isLoading && !error && filteredTransactions && filteredTransactions.length > 0 && (
            <div className="bg-muted/20 px-4 py-3 border-t">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Zeige <span className="font-medium">{filteredTransactions.length}</span>{" "}
                  von <span className="font-medium">{transactions?.length || 0}</span>{" "}
                  Einträgen
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={limit >= 100} 
                    onClick={() => handleLimitChange(String(Math.min(limit + 25, 100)))}
                  >
                    Mehr laden
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaktionsdetail-Dialog */}
      <TransactionDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        transactionId={selectedTransactionId}
      />
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Calendar,
  Package,
  ArrowDown,
  Search,
  Filter,
  Download,
  Clock,
  MapPin,
  User
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { getRemovedProducts, getMachines, type RemovedProduct, type Machine } from "@/lib/api";

interface RemovedProductsTabProps {
  productId?: number;
}

export default function RemovedProductsTab({ productId }: RemovedProductsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [dateRange, setDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;

  // Query für entnommene Produkte
  const { data: removedProducts, isLoading, error } = useQuery({
    queryKey: [
      `/removed-products${productId ? `/${productId}` : ''}`,
      searchTerm,
      selectedMachineId,
      dateRange,
      currentPage
    ],
    queryFn: () => getRemovedProducts({
      productName: searchTerm || undefined,
      machineId: selectedMachineId ? parseInt(selectedMachineId) : undefined,
      startDate: dateRange.from?.toISOString(),
      endDate: dateRange.to?.toISOString(),
      page: currentPage,
      limit
    }),
  });

  // Query für Automaten (für Filter)
  const { data: machines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  const handleExportData = () => {
    if (!removedProducts?.items) return;
    
    const csvContent = [
      // Header
      'Datum,Automat,Produkt,Entfernte Anzahl,Operator,Position',
      // Data rows
      ...removedProducts.items.map(item => 
        `${format(new Date(item.datetime), 'dd.MM.yyyy HH:mm', { locale: de })},${item.machineName},"${item.productName}",${item.removed},${item.operator || ''},${item.position || ''}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `entnommene-produkte-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            Fehler beim Laden der Daten: {error instanceof Error ? error.message : 'Unbekannter Fehler'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter und Suchbereich */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDown className="h-5 w-5 text-red-500" />
            Entnommene Produkte
          </CardTitle>
          <CardDescription>
            {productId 
              ? "Übersicht aller Entnahmen für dieses Produkt"
              : "Übersicht aller aus Automaten entnommenen Produkte (abgelaufene/beschädigte Waren)"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Erste Zeile: Suche und Automat */}
            <div className="flex flex-col md:flex-row gap-4">
              {!productId && (
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Nach Produktname suchen..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}
              
              <div className="w-full md:w-64">
                <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle Automaten" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alle Automaten</SelectItem>
                    {machines?.items?.map((machine: Machine) => (
                      <SelectItem key={machine.id} value={machine.id.toString()}>
                        {machine.machineName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Zweite Zeile: Datumsbereich und Export */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <DatePickerWithRange
                  date={dateRange}
                  onDateChange={setDateRange}
                  placeholder="Zeitraum auswählen..."
                />
              </div>
              
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={!removedProducts?.items?.length}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Exportieren
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ergebnistabelle */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Lade Daten...</span>
              </div>
            </div>
          ) : !removedProducts?.items?.length ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Entnahmen gefunden</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedMachineId || dateRange.from 
                  ? "Versuchen Sie andere Filtereinstellungen."
                  : "Es wurden noch keine Produkte aus Automaten entfernt."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Statistiken */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {removedProducts.items.reduce((sum, item) => sum + item.removed, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Gesamt entfernt</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {new Set(removedProducts.items.map(item => item.productName)).size}
                  </div>
                  <div className="text-sm text-muted-foreground">Verschiedene Produkte</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {new Set(removedProducts.items.map(item => item.machineId)).size}
                  </div>
                  <div className="text-sm text-muted-foreground">Betroffene Automaten</div>
                </div>
              </div>

              {/* Tabelle */}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Datum
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          Automat
                        </div>
                      </TableHead>
                      {!productId && (
                        <TableHead>
                          <div className="flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            Produkt
                          </div>
                        </TableHead>
                      )}
                      <TableHead className="text-right">Entfernt</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          Operator
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {removedProducts.items.map((item) => (
                      <TableRow key={`${item.refillId}-${item.id}`}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(item.datetime), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.machineName}</div>
                        </TableCell>
                        {!productId && (
                          <TableCell>
                            <div className="font-medium">{item.productName}</div>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Badge variant="destructive" className="font-mono">
                            -{item.removed}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.position && (
                            <Badge variant="outline" className="font-mono">
                              {item.position}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{item.operator || '-'}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {removedProducts.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Seite {removedProducts.page} von {removedProducts.totalPages} 
                    ({removedProducts.total} Einträge)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= removedProducts.totalPages}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
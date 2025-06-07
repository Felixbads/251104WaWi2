import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Calendar,
  Package,
  ArrowDown,
  Download,
  Clock,
  User,
  Filter
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getRemovedProductsByMachine, type RemovedProduct } from "@/lib/api";

interface RemovedProductsMachineTabProps {
  machineId: number;
}

export default function RemovedProductsMachineTab({ machineId }: RemovedProductsMachineTabProps) {
  const [dateFilter, setDateFilter] = useState<string>("30"); // Letzten 30 Tage als Standard
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;

  // Berechne Datumsbereich basierend auf dem Filter
  const getDateRange = () => {
    const now = new Date();
    const startDate = new Date();
    
    switch (dateFilter) {
      case "7":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90":
        startDate.setDate(now.getDate() - 90);
        break;
      case "365":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return {};
    }
    
    return {
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    };
  };

  const dateRange = getDateRange();

  // Query für entnommene Produkte dieses Automaten
  const { data: removedProducts, isLoading, error } = useQuery({
    queryKey: [`/machines/${machineId}/removed-products`, dateFilter, currentPage],
    queryFn: () => getRemovedProductsByMachine(machineId, {
      ...dateRange,
      page: currentPage,
      limit
    }),
  });

  const handleExportData = () => {
    if (!removedProducts?.items) return;
    
    const csvContent = [
      // Header
      'Datum,Produkt,Entfernte Anzahl,Operator,Position',
      // Data rows
      ...removedProducts.items.map(item => 
        `${format(new Date(item.datetime), 'dd.MM.yyyy HH:mm', { locale: de })},"${item.productName}",${item.removed},${item.operator || ''},${item.position || ''}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `entnommene-produkte-automat-${machineId}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
      {/* Filter und Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDown className="h-5 w-5 text-red-500" />
            Entnommene Produkte
          </CardTitle>
          <CardDescription>
            Übersicht aller aus diesem Automaten entnommenen Produkte (abgelaufene/beschädigte Waren)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2">Zeitraum</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Zeitraum auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Letzte 7 Tage</SelectItem>
                  <SelectItem value="30">Letzte 30 Tage</SelectItem>
                  <SelectItem value="90">Letzte 90 Tage</SelectItem>
                  <SelectItem value="365">Letztes Jahr</SelectItem>
                </SelectContent>
              </Select>
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
        </CardContent>
      </Card>

      {/* Statistiken und Ergebnisse */}
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
                In dem ausgewählten Zeitraum wurden keine Produkte aus diesem Automaten entfernt.
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
                    {removedProducts.items.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Entnahme-Vorgänge</div>
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
                          <Package className="h-4 w-4" />
                          Produkt
                        </div>
                      </TableHead>
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
                          <div className="font-medium">{item.productName}</div>
                        </TableCell>
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
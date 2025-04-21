import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { 
  Eye, FilePenLine, ClockIcon, CheckCircle2, 
  AlertCircle, RefreshCcw, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow
} from '@/components/ui/table';

// Typ-Definitionen für bessere Type-Safety
interface Warehouse {
  id: number;
  name: string;
}

interface InventoryCount {
  id: number;
  warehouseId: number;
  warehouseName?: string;
  warehouse?: {
    name: string;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'open';
  startDate: string | null;
  endDate: string | null;
  itemCount: number;
  notes?: string;
}

// Definiere Status-Typen für Inventuren
const statusTypes = {
  pending: { label: 'Geplant', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200', icon: ClockIcon },
  in_progress: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200', icon: RefreshCcw },
  open: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200', icon: RefreshCcw },
  completed: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800 hover:bg-green-200', icon: CheckCircle2 },
  cancelled: { label: 'Abgebrochen', color: 'bg-red-100 text-red-800 hover:bg-red-200', icon: AlertCircle },
};

// Hilfsfunktion zum Formatieren von Datum
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function InventurListe() {
  const [, setLocation] = useLocation();
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');

  // Lade Inventurdaten
  const { data: inventurDaten = [], isLoading: isLoadingInventur } = useQuery<InventoryCount[]>({
    queryKey: ['/api/inventory-counts'],
    staleTime: 60 * 1000, // 1 Minute Cache
  });

  // Lade verfügbare Lager
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
  });

  // Filtere Inventuren nach ausgewähltem Lager
  const filteredInventuren = inventurDaten.filter((inventur) => {
    if (warehouseFilter === 'all') {
      return true;
    }
    return inventur.warehouseId?.toString() === warehouseFilter;
  });

  // Inventurdetails anzeigen
  const openInventurDetail = (id: number) => {
    setLocation(`/inventur/${id}`);
  };
  
  // Inventurdetailseite mit der neuen verbesserten Version öffnen
  const openNewInventurDetail = (id: number) => {
    setLocation(`/inventur-detail/${id}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Inventurvorgänge</CardTitle>
          <CardDescription>
            Übersicht aller durchgeführten und geplanten Inventuren
          </CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Select 
            value={warehouseFilter} 
            onValueChange={setWarehouseFilter}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Lager auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Positionen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventuren.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Keine Inventurergebnisse gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filteredInventuren.map((inventur) => {
                  const StatusIcon = statusTypes[inventur.status as keyof typeof statusTypes]?.icon || ClockIcon;
                  const statusLabel = statusTypes[inventur.status as keyof typeof statusTypes]?.label || 'Unbekannt';
                  const statusColor = statusTypes[inventur.status as keyof typeof statusTypes]?.color || 'bg-gray-100 text-gray-800 hover:bg-gray-200';
                  
                  return (
                    <TableRow key={inventur.id}>
                      <TableCell className="font-medium">{inventur.id}</TableCell>
                      <TableCell>{inventur.warehouseName || inventur.warehouse?.name || 'Unbekanntes Lager'}</TableCell>
                      <TableCell>
                        <Badge className={statusColor} variant="outline">
                          <StatusIcon className="h-3.5 w-3.5 mr-1" />
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inventur.startDate ? formatDate(new Date(inventur.startDate)) : 'Nicht gestartet'}
                      </TableCell>
                      <TableCell>{inventur.itemCount || 0}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => openNewInventurDetail(inventur.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ansehen
                          </Button>
                          {inventur.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                            >
                              <FilePenLine className="h-4 w-4 mr-1" />
                              Bericht
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
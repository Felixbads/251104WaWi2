import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { 
  Eye, FilePenLine, ClockIcon, CheckCircle2, 
  AlertCircle, RefreshCcw, Filter, ChevronRight
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Import der CSS für responsive Anpassungen
import '@/styles/responsive-guidelines.css';

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

  // Render-Funktion für Mobile (Accordion mit Karten)
  const renderMobileInventurList = () => {
    if (filteredInventuren.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Keine Inventurergebnisse gefunden
        </div>
      );
    }

    return (
      <Accordion type="single" collapsible className="w-full">
        {filteredInventuren.map((inventur) => {
          const StatusIcon = statusTypes[inventur.status as keyof typeof statusTypes]?.icon || ClockIcon;
          const statusLabel = statusTypes[inventur.status as keyof typeof statusTypes]?.label || 'Unbekannt';
          const statusColor = statusTypes[inventur.status as keyof typeof statusTypes]?.color || 'bg-gray-100 text-gray-800 hover:bg-gray-200';
          
          return (
            <AccordionItem key={inventur.id} value={`inventur-${inventur.id}`} className="border-b">
              <AccordionTrigger className="py-4 hover:bg-gray-50 rounded-md px-2">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <div className="font-semibold"># {inventur.id}</div>
                    <Badge className={statusColor} variant="outline">
                      <StatusIcon className="h-3.5 w-3.5 mr-1" />
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {inventur.itemCount || 0} Positionen
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 px-2">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Lager</div>
                      <div>{inventur.warehouseName || inventur.warehouse?.name || 'Unbekanntes Lager'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Datum</div>
                      <div>{inventur.startDate ? formatDate(new Date(inventur.startDate)) : 'Nicht gestartet'}</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 touch-target"
                      onClick={() => openNewInventurDetail(inventur.id)}
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      Ansehen
                    </Button>
                    {inventur.status === 'completed' && (
                      <Button
                        variant="outline"
                        className="flex-1 touch-target"
                      >
                        <FilePenLine className="h-4 w-4 mr-1.5" />
                        Bericht
                      </Button>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  };

  // Render-Funktion für Desktop (Tabelle)
  const renderDesktopInventurTable = () => {
    return (
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
    );
  };

  // Lade-Status
  if (isLoadingInventur || isLoadingWarehouses) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-7 w-40 mb-2" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0 pb-2">
        <div>
          <CardTitle>Inventurvorgänge</CardTitle>
          <CardDescription>
            Übersicht aller durchgeführten und geplanten Inventuren
          </CardDescription>
        </div>
        <div className="flex items-center w-full md:w-auto">
          <div className="w-full md:w-auto">
            <Select 
              value={warehouseFilter} 
              onValueChange={setWarehouseFilter}
            >
              <SelectTrigger className="w-full md:w-[180px]">
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
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Ansicht (Accordion) - wird nur auf kleinen Bildschirmen angezeigt */}
        <div className="block md:hidden table-responsive-cards">
          {renderMobileInventurList()}
        </div>
        
        {/* Desktop Ansicht (Tabelle) - wird nur auf größeren Bildschirmen angezeigt */}
        <div className="hidden md:block table-container">
          {renderDesktopInventurTable()}
        </div>
      </CardContent>
    </Card>
  );
}
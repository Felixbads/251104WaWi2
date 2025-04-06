import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CircleAlert, Package, Search, PlusCircle, RefreshCw, 
  Clock, ArrowUpDown, History, FileBarChart2, Archive
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WarehouseInventoryProps {
  warehouseId: number;
  inventory: any[]; // Array von Inventarpositionen
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
}

interface InventoryItem {
  id: number;
  productId: number;
  warehouseId: number;
  productName: string;
  warehouseName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity?: number;
  reorderPoint?: number;
  lastCountDate?: string;
  lastRefillDate?: string;
  status?: string;
  notes?: string;
}

export default function WarehouseInventory({ 
  warehouseId, 
  inventory, 
  isLoading, 
  error, 
  onRefresh 
}: WarehouseInventoryProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('current');
  const [sortField, setSortField] = useState<string>('productName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Deduplizierte Lagerbestände - nur ein Eintrag pro Produkt-ID
  const deduplicatedInventory = useMemo(() => {
    if (!Array.isArray(inventory)) return [];

    // Verwende eine Map, um nur den neuesten Eintrag pro Produkt-ID zu behalten
    const productMap = new Map<number, InventoryItem>();
    
    // Konvertiere die Einträge in das typsichere Format InventoryItem
    inventory.forEach(item => {
      const typedItem: InventoryItem = {
        id: Number(item.id),
        productId: Number(item.productId),
        warehouseId: Number(item.warehouseId),
        productName: item.productName || "Unbekannter Artikel",
        warehouseName: item.warehouseName || "Unbekanntes Lager",
        quantity: Number(item.quantity) || 0,
        minQuantity: Number(item.minQuantity) || 0,
        maxQuantity: item.maxQuantity ? Number(item.maxQuantity) : undefined,
        reorderPoint: item.reorderPoint ? Number(item.reorderPoint) : undefined,
        lastCountDate: item.lastCountDate,
        lastRefillDate: item.lastRefillDate,
        status: item.status,
        notes: item.notes
      };
      
      // Wenn dieses Produkt noch nicht in der Map ist oder der aktuelle Eintrag eine höhere ID hat
      // (was bedeutet, dass es neuer ist), dann füge es zur Map hinzu
      if (!productMap.has(typedItem.productId) || 
          typedItem.id > productMap.get(typedItem.productId)!.id) {
        productMap.set(typedItem.productId, typedItem);
      }
    });
    
    // Konvertiere die Map zurück in ein Array
    return Array.from(productMap.values());
  }, [inventory]);

  // Sortiere und filtere die Einträge
  const processedItems = useMemo(() => {
    if (!deduplicatedInventory || deduplicatedInventory.length === 0) return [];
    
    // Filtere nach Suchbegriff
    let filtered = deduplicatedInventory.filter(item => 
      item.productName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Filtere nach Tab
    if (activeTab === 'critical') {
      filtered = filtered.filter(item => 
        item.quantity <= item.minQuantity && item.minQuantity > 0
      );
    } else if (activeTab === 'empty') {
      filtered = filtered.filter(item => item.quantity === 0);
    } else if (activeTab === 'available') {
      filtered = filtered.filter(item => item.quantity > 0);
    }
    
    // Sortiere die Ergebnisse
    return filtered.sort((a, b) => {
      let aValue = a[sortField as keyof InventoryItem];
      let bValue = b[sortField as keyof InventoryItem];
      
      // Behandle undefined und null-Werte
      if (aValue === undefined || aValue === null) aValue = '';
      if (bValue === undefined || bValue === null) bValue = '';
      
      // Sortiere String-Werte
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      // Sortiere Zahlen
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
      
      // Fallback - String-Vergleich
      return sortDirection === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
  }, [deduplicatedInventory, searchQuery, activeTab, sortField, sortDirection]);

  // Funktion zum Ändern der Sortierung
  const handleSort = (field: string) => {
    if (sortField === field) {
      // Wenn das gleiche Feld angeklickt wird, ändere die Richtung
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Neues Feld - setze auf aufsteigende Sortierung
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Render Funktion für die Sortier-Header
  const renderSortableHeader = (label: string, field: string) => (
    <TableHead className={field === 'quantity' || field === 'minQuantity' ? "text-right" : ""}>
      <button 
        onClick={() => handleSort(field)}
        className="flex items-center space-x-1 focus:outline-none"
      >
        <span>{label}</span>
        {sortField === field && (
          <ArrowUpDown className={`h-4 w-4 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} />
        )}
      </button>
    </TableHead>
  );

  // Statistik über den Lagerbestand
  const stats = useMemo(() => ({
    total: deduplicatedInventory.length,
    critical: deduplicatedInventory.filter(item => 
      item.quantity <= item.minQuantity && item.minQuantity > 0
    ).length,
    empty: deduplicatedInventory.filter(item => item.quantity === 0).length,
    available: deduplicatedInventory.filter(item => item.quantity > 0).length
  }), [deduplicatedInventory]);

  // Rendering bei Ladevorgang
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[200px]" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Rendering bei Fehler
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-center">
        <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">Fehler beim Laden der Lagerbestände</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Lagerbestände ist ein Fehler aufgetreten.'}
        </p>
        <Button 
          variant="secondary" 
          className="mt-4"
          onClick={onRefresh}
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter-Bereich */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 flex-grow">
          <Label htmlFor="search">Suche</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Artikel oder Produktname suchen"
              className="pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  onClick={onRefresh}
                  className="whitespace-nowrap"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Aktualisieren
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Automatischen Lagerabgleich durchführen</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  className="whitespace-nowrap" 
                  onClick={() => window.location.hash = 'new-item'}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Artikel hinzufügen
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Neuen Artikel zum Lagerbestand hinzufügen</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="bg-secondary/20">
          <CardBody onClick={() => setActiveTab('current')} className="p-3 cursor-pointer hover:bg-secondary/30 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Alle Artikel</p>
                <h3 className="text-2xl font-bold">{stats.total}</h3>
              </div>
              <Package className="h-8 w-8 text-primary" />
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-destructive/10">
          <CardBody onClick={() => setActiveTab('critical')} className="p-3 cursor-pointer hover:bg-destructive/20 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Kritischer Bestand</p>
                <h3 className="text-2xl font-bold">{stats.critical}</h3>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-amber-50">
          <CardBody onClick={() => setActiveTab('empty')} className="p-3 cursor-pointer hover:bg-amber-100 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Ohne Bestand</p>
                <h3 className="text-2xl font-bold">{stats.empty}</h3>
              </div>
              <Archive className="h-8 w-8 text-amber-500" />
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-green-50">
          <CardBody onClick={() => setActiveTab('available')} className="p-3 cursor-pointer hover:bg-green-100 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Verfügbar</p>
                <h3 className="text-2xl font-bold">{stats.available}</h3>
              </div>
              <FileBarChart2 className="h-8 w-8 text-green-600" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Tabs für verschiedene Ansichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="current">Alle Artikel</TabsTrigger>
          <TabsTrigger value="critical">Kritischer Bestand</TabsTrigger>
          <TabsTrigger value="empty">Ohne Bestand</TabsTrigger>
          <TabsTrigger value="available">Verfügbar</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Haupttabelle */}
      {processedItems.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Artikel gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? "Es wurden keine Artikel gefunden, die den Filterkriterien entsprechen."
              : "In diesem Lager wurden noch keine Artikel angelegt."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => window.location.hash = 'new-item'}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Artikel zum Lager hinzufügen
            </Button>
            
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Lagerabgleich durchführen
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {renderSortableHeader('Artikel', 'productName')}
                {renderSortableHeader('Bestand', 'quantity')}
                {renderSortableHeader('Min. Bestand', 'minQuantity')}
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Letzte Aktivität</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedItems.map((item: InventoryItem) => (
                <TableRow key={item.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => window.location.href = `/inventory/${item.id}`}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.minQuantity}</TableCell>
                  <TableCell className="text-center">
                    {(item.quantity <= item.minQuantity && item.minQuantity > 0) ? (
                      <Badge variant="destructive">Kritisch</Badge>
                    ) : item.quantity === 0 ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Leer
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
                        OK
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.lastRefillDate && (new Date(item.lastRefillDate) > (item.lastCountDate ? new Date(item.lastCountDate) : new Date(0))) ? (
                      <div className="flex items-center justify-end space-x-1">
                        <Clock className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-sm">
                          {new Date(item.lastRefillDate).toLocaleDateString('de-DE')}
                          <span className="text-xs text-muted-foreground ml-1">Refill</span>
                        </span>
                      </div>
                    ) : item.lastCountDate ? (
                      <div className="flex items-center justify-end space-x-1">
                        <History className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-sm">
                          {new Date(item.lastCountDate).toLocaleDateString('de-DE')}
                          <span className="text-xs text-muted-foreground ml-1">Inventur</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Keine Aktivität</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Hilfsfunktion für Card-Komponente
function CardBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-4 ${className || ''}`} {...props}>
      {children}
    </div>
  );
}

// AlertCircle-Komponente
function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
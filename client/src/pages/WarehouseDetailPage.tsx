import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeftIcon,
  Building2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  InfoIcon,
  Download,
  CalendarIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Definiere Typen für die Daten
type Warehouse = {
  id: number;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: string;
};

type Product = {
  id: number;
  name: string;
  sku?: string;
};

type InventoryBatch = {
  id: number;
  batchNumber: string;
  expiryDate?: string;
  currentQuantity: number;
  initialQuantity: number;
  receivedDate: string;
  supplierRef?: string;
  notes?: string;
  daysUntilExpiry?: number;
};

type InventoryItem = {
  id: number;
  productId: number;
  warehouseId: number;
  productName: string;
  sku?: string;
  category?: string;
  currentStock: number;
  minimumStock?: number;
  location?: string;
  lastCountDate?: string;
  batches?: InventoryBatch[];
};

type InventoryMovement = {
  id: number;
  productId: number;
  sourceType: string;
  sourceId?: number;
  destinationType: string;
  destinationId?: number;
  quantity: number;
  movementType: string;
  performedAt: string;
  productName?: string;
  productSku?: string;
  batchId?: number;
  batchNumber?: string;
  expiryDate?: string;
  sourceName?: string;
  destinationName?: string;
  reason?: string;
  previousStock?: number;
  currentStock?: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
};

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const warehouseId = parseInt(id);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 30)) // Standard: 30 Tage zurück
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [showDateFilter, setShowDateFilter] = useState(false);
  
  // Lade Lagerdaten
  const { data: warehouse, isLoading: warehouseLoading } = useQuery<Warehouse>({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}`],
    enabled: !isNaN(warehouseId)
  });
  
  // Lade Inventardaten mit Batches
  const { 
    data: inventoryData, 
    isLoading: inventoryLoading,
    refetch: refetchInventory
  } = useQuery<{items: InventoryItem[], total: number, page: number, limit: number}>({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/inventory`, {
      page: 1,
      limit: 1000,
      search: searchTerm
    }],
    enabled: !isNaN(warehouseId)
  });
  
  // Lade Warenbewegungen
  const { 
    data: movementsData, 
    isLoading: movementsLoading,
    refetch: refetchMovements
  } = useQuery<{items: InventoryMovement[], total: number, page: number, limit: number}>({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/movements`, { 
      page: 1,
      limit: 1000,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      productId: selectedProductId
    }],
    enabled: !isNaN(warehouseId)
  });
  
  const inventory = inventoryData?.items || [];
  const movements = movementsData?.items || [];
  
  // Inventar ist bereits mit Batches vom Backend kombiniert
  const inventoryWithBatches = inventory;
  
  // Filtere Daten nach Suchbegriff
  const filteredInventory = inventoryWithBatches.filter((item: InventoryItem) => {
    const productName = item.product?.name?.toLowerCase() || '';
    return productName.includes(searchTerm.toLowerCase());
  });
  
  // Zeige Lade-Indikator, wenn Daten geladen werden
  if (warehouseLoading || inventoryLoading) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin mb-4" />
          <p className="text-lg">Lade Lagerdaten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Kopfzeile mit Lagerinformationen */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/lager">
            <Button variant="outline" size="icon">
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center">
              <Building2 className="h-6 w-6 mr-2 text-primary" />
              {warehouse?.name || 'Lager'}
            </h1>
            {warehouse?.description && (
              <p className="text-sm text-muted-foreground mt-1">{warehouse.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              refetchInventory();
              refetchMovements();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
          
          <Popover open={showDateFilter} onOpenChange={setShowDateFilter}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Zeitraum
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 border-b">
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="startDate">Startdatum</Label>
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      className="rounded-md border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Enddatum</Label>
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      className="rounded-md border"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-3">
                  <Button 
                    size="sm" 
                    onClick={() => setShowDateFilter(false)}
                  >
                    Anwenden
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      {/* Suchleiste */}
      <div className="w-full max-w-sm">
        <Input
          placeholder="Produkte suchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Hauptinhalt */}
      <div className="space-y-6">
        {filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <InfoIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">Keine Produkte im Lager</p>
              <p className="text-sm text-muted-foreground mt-2">
                Dieses Lager enthält noch keine Produkte oder es wurden keine gefunden, die Ihren Suchkriterien entsprechen.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredInventory.map((item: InventoryItem) => (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader className="bg-muted/40 px-6 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {item.productName || 'Unbekanntes Produkt'}
                    {item.sku && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        (SKU: {item.sku})
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge>
                      Bestand: {item.currentStock || 0} Stk.
                    </Badge>
                    {item.minimumStock && item.currentStock < item.minimumStock && (
                      <Badge variant="destructive">
                        Unter Mindestbestand
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <Accordion type="single" collapsible defaultValue="batches">
                  <AccordionItem value="batches" className="border-0">
                    <AccordionTrigger className="px-6 py-3 hover:no-underline">
                      <span className="text-sm font-medium">Chargen (FIFO)</span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="max-h-72 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Chargennummer</TableHead>
                              <TableHead>MHD</TableHead>
                              <TableHead>Eingangsdatum</TableHead>
                              <TableHead className="text-right">Bestand</TableHead>
                              <TableHead className="text-right">Tage bis MHD</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {item.batches && item.batches.length > 0 ? (
                              // Batches sind bereits nach MHD sortiert (FIFO) vom Backend
                              item.batches
                                .map((batch) => (
                                <TableRow key={batch.id}>
                                  <TableCell>{batch.batchNumber}</TableCell>
                                  <TableCell>
                                    {batch.expiryDate ? format(parseISO(batch.expiryDate), 'dd.MM.yyyy', { locale: de }) : '-'}
                                  </TableCell>
                                  <TableCell>
                                    {format(parseISO(batch.receivedDate), 'dd.MM.yyyy', { locale: de })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {batch.currentQuantity} Stk.
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {batch.daysUntilExpiry !== null && batch.daysUntilExpiry !== undefined ? (
                                      <Badge variant={batch.daysUntilExpiry < 30 ? "destructive" : batch.daysUntilExpiry < 90 ? "secondary" : "default"}>
                                        {batch.daysUntilExpiry} Tage
                                      </Badge>
                                    ) : '-'}
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                                  Keine Chargen vorhanden
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="movements" className="border-0">
                    <AccordionTrigger 
                      className="px-6 py-3 hover:no-underline"
                      onClick={() => setSelectedProductId(item.productId)}
                    >
                      <span className="text-sm font-medium">Warenbewegungen</span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum/Zeit</TableHead>
                              <TableHead>Artikel</TableHead>
                              <TableHead>Bewegungstyp</TableHead>
                              <TableHead>Chargennummer</TableHead>
                              <TableHead>MHD</TableHead>
                              <TableHead>Menge</TableHead>
                              <TableHead>Von/Nach</TableHead>
                              <TableHead className="text-right">Vorher</TableHead>
                              <TableHead className="text-right">Nachher</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {movements
                              .filter((movement: InventoryMovement) => 
                                movement.productId === item.productId
                              )
                              .sort((a: InventoryMovement, b: InventoryMovement) => 
                                new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
                              )
                              .map((movement: InventoryMovement) => {
                                // Bestimme, ob es sich um Eingang oder Ausgang handelt
                                const isOutbound = 
                                  (movement.sourceType === 'warehouse' && movement.sourceId === warehouseId);
                                
                                // Bestimme die Bewegungsart basierend auf dem Typ
                                let movementTypeLabel = 'Unbekannt';
                                let movementVariant: "default" | "destructive" | "secondary" | "outline" = "default";
                                
                                if (movement.movementType === 'REFILL') {
                                  movementTypeLabel = 'Refill-Prozess';
                                  movementVariant = "destructive";
                                } else if (movement.movementType === 'OUT' && movement.referenceType === 'MANUAL') {
                                  movementTypeLabel = 'Manuelle Entnahme';
                                  movementVariant = "secondary";
                                } else if (movement.movementType === 'TRANSFER') {
                                  movementTypeLabel = 'Lagerumbuchung';
                                  movementVariant = "outline";
                                } else if (movement.movementType === 'IN' && movement.referenceType === 'ORDER') {
                                  movementTypeLabel = 'Wareneingang';
                                  movementVariant = "default";
                                } else if (movement.movementType === 'DISPOSAL') {
                                  movementTypeLabel = 'Entsorgung';
                                  movementVariant = "destructive";
                                } else if (movement.movementType === 'ADJUST') {
                                  movementTypeLabel = 'Inventurkorrektur';
                                  movementVariant = "secondary";
                                } else {
                                  movementTypeLabel = movement.movementType;
                                }
                                
                                // Bestimme die Quelle oder das Ziel der Bewegung
                                let directionEntity = isOutbound ? movement.destinationName : movement.sourceName;
                                
                                return (
                                  <TableRow key={movement.id}>
                                    <TableCell>
                                      {format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                                    </TableCell>
                                    <TableCell>{movement.productName || 'Unbekannt'}</TableCell>
                                    <TableCell>
                                      <Badge variant={movementVariant}>
                                        {movementTypeLabel}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{movement.batchNumber || '-'}</TableCell>
                                    <TableCell>
                                      {movement.expiryDate ? format(parseISO(movement.expiryDate), 'dd.MM.yyyy', { locale: de }) : '-'}
                                    </TableCell>
                                    <TableCell>{movement.quantity} Stk.</TableCell>
                                    <TableCell>{directionEntity || '-'}</TableCell>
                                    <TableCell className="text-right">
                                      {movement.previousStock !== undefined && movement.previousStock !== null
                                        ? `${movement.previousStock} Stk.`
                                        : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {movement.currentStock !== undefined && movement.currentStock !== null
                                        ? `${movement.currentStock} Stk.`
                                        : '-'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            {!movements.some((m: InventoryMovement) => m.productId === item.productId) && (
                              <TableRow>
                                <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                                  Keine Warenbewegungen für diesen Zeitraum
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
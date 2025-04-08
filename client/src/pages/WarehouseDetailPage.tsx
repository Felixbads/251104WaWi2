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
  productId: number;
  warehouseId: number;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  incomingDate: string;
};

type InventoryItem = {
  id: number;
  productId: number;
  warehouseId: number;
  product?: Product;
  currentStock: number;
  minimumStock?: number;
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
  batchId?: number;
  batchNumber?: string;
  sourceName?: string;
  destinationName?: string;
  reason?: string;
  previousStock?: number;
  currentStock?: number;
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
  const { data: warehouse, isLoading: warehouseLoading } = useQuery({
    queryKey: ['/api/warehouses', warehouseId],
    enabled: !isNaN(warehouseId)
  });
  
  // Lade Inventardaten
  const { 
    data: inventory = [], 
    isLoading: inventoryLoading,
    refetch: refetchInventory
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'inventory'],
    enabled: !isNaN(warehouseId)
  });
  
  // Lade Inventarbatches, gruppiert nach Produkt
  const { 
    data: batches = [], 
    isLoading: batchesLoading,
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'batches'],
    enabled: !isNaN(warehouseId)
  });
  
  // Lade Warenbewegungen
  const { 
    data: movements = [], 
    isLoading: movementsLoading,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'movements', { 
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      productId: selectedProductId
    }],
    enabled: !isNaN(warehouseId)
  });
  
  // Führe Inventar und Batches zusammen
  const inventoryWithBatches = inventory.map((item: InventoryItem) => {
    const productBatches = batches.filter((batch: InventoryBatch) => 
      batch.productId === item.productId && batch.warehouseId === warehouseId
    );
    
    return {
      ...item,
      batches: productBatches
    };
  });
  
  // Filtere Daten nach Suchbegriff
  const filteredInventory = inventoryWithBatches.filter((item: InventoryItem) => {
    const productName = item.product?.name?.toLowerCase() || '';
    return productName.includes(searchTerm.toLowerCase());
  });
  
  // Zeige Lade-Indikator, wenn Daten geladen werden
  if (warehouseLoading || (inventoryLoading && batchesLoading)) {
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
                    {item.product?.name || 'Unbekanntes Produkt'}
                    {item.product?.sku && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        (SKU: {item.product.sku})
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
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {item.batches && item.batches.length > 0 ? (
                              // Sortiere Batches nach MHD (älteste zuerst - FIFO)
                              [...item.batches]
                                .sort((a, b) => 
                                  new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
                                )
                                .map((batch) => (
                                <TableRow key={batch.id}>
                                  <TableCell>{batch.batchNumber}</TableCell>
                                  <TableCell>
                                    {format(parseISO(batch.expiryDate), 'dd.MM.yyyy', { locale: de })}
                                  </TableCell>
                                  <TableCell>
                                    {format(parseISO(batch.incomingDate), 'dd.MM.yyyy', { locale: de })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {batch.quantity} Stk.
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
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
                              <TableHead>Datum</TableHead>
                              <TableHead>Typ</TableHead>
                              <TableHead>Menge</TableHead>
                              <TableHead>Quelle/Ziel</TableHead>
                              <TableHead className="text-right">Bestand</TableHead>
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
                                
                                // Bestimme die Quelle oder das Ziel der Bewegung
                                let directionEntity = isOutbound ? movement.destinationName : movement.sourceName;
                                if (!directionEntity) {
                                  if (isOutbound) {
                                    // Bei Ausgang zeige das Ziel
                                    directionEntity = `${movement.destinationType} ${movement.destinationId}`;
                                  } else {
                                    // Bei Eingang zeige die Quelle
                                    directionEntity = `${movement.sourceType} ${movement.sourceId}`;
                                  }
                                }
                                
                                return (
                                  <TableRow key={movement.id}>
                                    <TableCell>
                                      {format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={isOutbound ? "destructive" : "success"}>
                                        {isOutbound ? 'Ausgang' : 'Eingang'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{movement.quantity} Stk.</TableCell>
                                    <TableCell>{directionEntity || 'Unbekannt'}</TableCell>
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
                                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
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
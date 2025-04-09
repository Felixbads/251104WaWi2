import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, Loader2, Calendar, Clock, ChevronRight, ChevronDown,
  ArrowDownToLine, ArrowUpToLine, RotateCcw, Truck
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";

interface ProductBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: number, warehouseId: number, name: string } | null;
}

interface BatchMovement {
  id: number;
  batchId: number;
  movementType: string;
  quantity: number;
  performedAt: string;
  destinationType?: string;
  destinationName?: string;
  machineName?: string;
}

export default function ProductBatchDialog({
  open,
  onOpenChange,
  product
}: ProductBatchDialogProps) {
  const [expandedBatches, setExpandedBatches] = useState<number[]>([]);

  // Toggle für expandierte Zeilen
  const toggleBatchExpansion = (batchId: number) => {
    if (expandedBatches.includes(batchId)) {
      setExpandedBatches(expandedBatches.filter(id => id !== batchId));
    } else {
      setExpandedBatches([...expandedBatches, batchId]);
    }
  };

  // Laden der Batches für das ausgewählte Produkt
  const { data: productBatches = [], isLoading: isBatchesLoading } = useQuery<any[]>({
    queryKey: ['/api/inventory-batches/product', product?.id || 0, 'warehouse', product?.warehouseId || 0],
    queryFn: async ({ queryKey }) => {
      try {
        const [_, productId, __, warehouseId] = queryKey;
        if (!productId || productId === 0 || !warehouseId || warehouseId === 0) return [];
        const response = await fetch(`/api/inventory-batches/product/${productId}/warehouse/${warehouseId}`);
        if (!response.ok) return [];
        return response.json();
      } catch (error) {
        console.error("Fehler beim Laden der Produkt-Chargen:", error);
        return [];
      }
    },
    enabled: !!product && !!product.id && !!product.warehouseId && open,
  });

  // Laden der Batch-Bewegungen
  const { data: batchMovements = {}, isLoading: isMovementsLoading } = useQuery<Record<number, BatchMovement[]>>({
    queryKey: ['/api/inventory-batches/movements', productBatches],
    queryFn: async () => {
      try {
        // Für jeden Batch die Bewegungen abrufen
        const batchIds = productBatches.map((batch: any) => batch.id);
        if (!batchIds.length) return {};
        
        const response = await fetch(`/api/inventory/movements?batchIds=${batchIds.join(',')}`);
        if (!response.ok) return {};
        
        const movementsData = await response.json();
        
        // Gruppiere Bewegungen nach Batch-ID
        const movementsByBatch: Record<number, BatchMovement[]> = {};
        for (const movement of movementsData) {
          if (!movement.batchId) continue;
          
          if (!movementsByBatch[movement.batchId]) {
            movementsByBatch[movement.batchId] = [];
          }
          movementsByBatch[movement.batchId].push(movement);
        }
        
        return movementsByBatch;
      } catch (error) {
        console.error("Fehler beim Laden der Batch-Bewegungen:", error);
        return {};
      }
    },
    enabled: !!productBatches.length && open,
  });

  // Icon für Bewegungstyp
  const getMovementIcon = (type: string) => {
    switch(type) {
      case 'IN': return <ArrowDownToLine className="h-4 w-4 text-emerald-500" />;
      case 'OUT': return <ArrowUpToLine className="h-4 w-4 text-destructive" />;
      case 'REFILL': return <RotateCcw className="h-4 w-4 text-amber-500" />;
      case 'TRANSFER': return <Truck className="h-4 w-4 text-blue-500" />;
      default: return <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Text für Bewegungstyp
  const getMovementTypeLabel = (type: string) => {
    switch(type) {
      case 'IN': return 'Eingang';
      case 'OUT': return 'Ausgang';
      case 'REFILL': return 'Auffüllung';
      case 'TRANSFER': return 'Transfer';
      case 'INTERNAL': return 'Intern';
      case 'ADJUSTMENT': return 'Anpassung';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chargen für {product?.name}</DialogTitle>
          <DialogDescription>
            Übersicht aller Chargen im Lager mit Ablaufdaten (MHD) und Bewegungshistorie
          </DialogDescription>
        </DialogHeader>
        
        {isBatchesLoading ? (
          <div className="py-6 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : productBatches.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">Keine Chargen gefunden</h3>
            <p className="text-muted-foreground text-sm">
              Für dieses Produkt sind keine Chargen im Lager vorhanden.
            </p>
          </div>
        ) : (
          <div className="rounded-md border mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Chargen-Nr.</TableHead>
                  <TableHead>Eingangsdatum</TableHead>
                  <TableHead>MHD</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productBatches.map((batch: any) => {
                  const isExpired = new Date(batch.expiryDate) < new Date();
                  const isExpiringSoon = !isExpired && 
                    new Date(batch.expiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                  
                  const batchMovementsList = batchMovements[batch.id] || [];
                  const hasMovements = batchMovementsList.length > 0;
                  const isExpanded = expandedBatches.includes(batch.id);
                  
                  return (
                    <>
                      <TableRow 
                        key={batch.id} 
                        className={isExpanded ? "border-b-0" : ""}
                      >
                        <TableCell className="p-2">
                          {hasMovements && (
                            <button 
                              onClick={() => toggleBatchExpansion(batch.id)}
                              className="p-1 rounded-md hover:bg-muted"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                        <TableCell>
                          {batch.receivedDate ? (
                            <div className="flex items-center">
                              <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                              <span>{format(parseISO(batch.receivedDate), 'dd.MM.yyyy', {locale: de})}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unbekannt</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <span className={
                              isExpired ? 'text-destructive font-medium' :
                              isExpiringSoon ? 'text-amber-500 font-medium' : ''
                            }>
                              {format(parseISO(batch.expiryDate), 'dd.MM.yyyy', {locale: de})}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {batch.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {isExpired ? (
                            <Badge variant="destructive">Abgelaufen</Badge>
                          ) : isExpiringSoon ? (
                            <Badge variant="warning">Bald ablaufend</Badge>
                          ) : (
                            <Badge variant="outline">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Bewegungshistorie für diesen Batch */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0 bg-muted/30">
                            <div className="p-4">
                              <h4 className="text-sm font-medium mb-2">Bewegungshistorie</h4>
                              
                              {isMovementsLoading ? (
                                <div className="py-2 flex items-center">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                                  <span className="text-sm text-muted-foreground">Lade Bewegungen...</span>
                                </div>
                              ) : batchMovementsList.length > 0 ? (
                                <div className="rounded-md border bg-background">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Datum</TableHead>
                                        <TableHead>Typ</TableHead>
                                        <TableHead>Menge</TableHead>
                                        <TableHead>Details</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {batchMovementsList.map((movement) => (
                                        <TableRow key={movement.id}>
                                          <TableCell className="text-xs">
                                            {format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', {locale: de})}
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center space-x-1.5">
                                              {getMovementIcon(movement.movementType)}
                                              <span className="text-xs">{getMovementTypeLabel(movement.movementType)}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-xs">
                                            <span className={movement.quantity < 0 ? "text-destructive" : "text-emerald-600"}>
                                              {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-xs">
                                            {movement.movementType === 'REFILL' && movement.machineName && (
                                              <span>Auffüllung zu Automat: {movement.machineName}</span>
                                            )}
                                            {movement.movementType === 'TRANSFER' && (
                                              <span>Transfer: {movement.destinationName || 'Unbekannt'}</span>
                                            )}
                                            {movement.movementType === 'OUT' && (
                                              <span>Ausgang</span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground py-2">
                                  Keine Bewegungen für diese Charge gefunden.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
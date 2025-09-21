import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, MoveDown, MoveUp, Package2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Movement {
  id: number;
  productName: string;
  quantity: number;
  movementType: string;
  performedAt: string;
  sourceType?: string;
  destinationType?: string;
  referenceType?: string;
  reason?: string;
  machineName?: string;
  sourceWarehouseName?: string;
  destinationWarehouseName?: string;
  previousStock?: number | null;
  currentStock?: number | null;
  notes?: string;
}

interface MovementsResponse {
  items: Movement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface WarehouseMovementsTableProps {
  warehouseId: number;
  limit?: number;
}

const WarehouseMovementsTable: React.FC<WarehouseMovementsTableProps> = ({ 
  warehouseId, 
  limit = 50
}) => {
  const { data, isLoading, error } = useQuery<MovementsResponse>({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/movements`, { limit }],
  });
  
  // Extract movements array from the response
  const movements = data?.items || [];

  // Formatiert ein Datum im deutschen Format
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'dd.MM.yyyy HH:mm', { locale: de });
    } catch (e) {
      return dateString;
    }
  };

  // Gibt ein passendes Badge für den Movement-Typ zurück
  const getMovementTypeBadge = (movementType: string) => {
    switch (movementType) {
      case 'IN':
        return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Eingang</Badge>;
      case 'OUT':
        return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Ausgang</Badge>;
      case 'TRANSFER':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Transfer</Badge>;
      case 'REFILL':
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">Befüllung</Badge>;
      default:
        return <Badge variant="outline">{movementType}</Badge>;
    }
  };

  // Gibt eine Kurzbeschreibung für die Bewegung zurück
  const getMovementDescription = (movement: Movement) => {
    const { sourceType, destinationType, movementType, referenceType, reason, machineName, sourceWarehouseName, destinationWarehouseName, notes } = movement;
    
    // Basis der Beschreibung ist der Grund, falls vorhanden
    if (reason) return reason;
    
    // Ansonsten bauen wir eine Beschreibung basierend auf den Typen
    if (movementType === 'IN') {
      if (sourceType === 'supplier' && destinationType === 'warehouse') {
        return 'Wareneingang von Lieferant';
      } else if (sourceType === 'machine' && destinationType === 'warehouse') {
        return `Rücknahme von Automat ${machineName ? `(${machineName})` : ''}`;
      } else if (referenceType === 'order') {
        return 'Bestellung eingegangen';
      } else if (referenceType === 'return') {
        return 'Retoure';
      }
      return 'Eingang';
    } else if (movementType === 'OUT') {
      if (sourceType === 'warehouse' && destinationType === 'machine') {
        return `Befüllung Automat ${machineName ? `(${machineName})` : ''}`;
      } else if (sourceType === 'warehouse' && destinationType === 'disposal') {
        return 'Entsorgung';
      } else if (referenceType === 'expiry') {
        return 'Ablauf';
      } else if (referenceType === 'damage') {
        return 'Beschädigung';
      } else if (referenceType === 'reconciliation') {
        return 'Bestandsabgleich';
      }
      return 'Ausgang';
    } else if (movementType === 'TRANSFER') {
      if (sourceWarehouseName && destinationWarehouseName) {
        return `Transfer: ${sourceWarehouseName} → ${destinationWarehouseName}`;
      }
      return 'Transfer zwischen Lagern';
    } else if (movementType === 'REFILL') {
      // Bei REFILL-Bewegungen die Informationen aus den Notes extrahieren
      if (notes) {
        // Extrahiere Durchführer aus Notes
        const performerMatch = notes.match(/Durchgeführt von: ([^,]+)/i);
        const performer = performerMatch ? performerMatch[1] : null;
        
        // Extrahiere Automat aus Notes oder nutze machineName
        const machineMatch = notes.match(/Automat: ([^-]+)/i);
        const machine = machineName || (machineMatch ? machineMatch[1].trim() : '');
        
        if (performer && machine) {
          return `Refill ${machine} (${performer})`;
        } else if (machine) {
          return `Refill ${machine}`;
        }
      }
      
      if (destinationType === 'machine' && machineName) {
        return `Befüllung Automat ${machineName}`;
      }
      return 'Befüllung von Automat';
    }
    
    return 'Bestandsbewegung';
  };

  if (isLoading) {
    return (
      <Card className="my-6">
        <CardHeader>
          <CardTitle>Warenbewegungen</CardTitle>
          <CardDescription>Ladevorgang...</CardDescription>
        </CardHeader>
        <CardContent className="animate-pulse">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="my-6 bg-red-50 dark:bg-red-900/20">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400">Fehler</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Die Warenbewegungen konnten nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package2 className="h-5 w-5" />
          Warenbewegungen
        </CardTitle>
        <CardDescription>
          Die letzten {limit} Bestandsbewegungen im Lager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Datum</TableHead>
                <TableHead className="font-medium">Produkt</TableHead>
                <TableHead className="font-medium text-center">Typ</TableHead>
                <TableHead className="font-medium">Beschreibung</TableHead>
                <TableHead className="font-medium text-right">Menge</TableHead>
                <TableHead className="font-medium text-center">Bestand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length > 0 ? (
                movements.map((movement: Movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-muted-foreground" />
                        {formatDate(movement.performedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {movement.productName}
                    </TableCell>
                    <TableCell className="text-center">
                      {getMovementTypeBadge(movement.movementType)}
                    </TableCell>
                    <TableCell>
                      {getMovementDescription(movement)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex items-center justify-end">
                        {movement.movementType === 'IN' && <MoveDown className="h-4 w-4 mr-1 text-green-600" />}
                        {movement.movementType === 'OUT' && <MoveUp className="h-4 w-4 mr-1 text-red-600" />}
                        {movement.movementType === 'TRANSFER' && <MoveUp className="h-4 w-4 mr-1 text-blue-600" />}
                        {movement.movementType === 'REFILL' && <MoveUp className="h-4 w-4 mr-1 text-purple-600" />}
                        {Math.abs(movement.quantity)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {movement.movementType === 'REFILL' ? (
                        <div className="text-sm">
                          {(movement.previousStock !== null && movement.previousStock !== undefined && movement.previousStock !== 0) || 
                           (movement.currentStock !== null && movement.currentStock !== undefined && movement.currentStock !== 0) ? (
                            <div className="font-mono">
                              {movement.previousStock !== null && movement.previousStock !== undefined ? movement.previousStock : 'N/A'} → {movement.currentStock !== null && movement.currentStock !== undefined ? movement.currentStock : 'N/A'}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-xs">
                              Entnahme: {Math.abs(movement.quantity)} Stück
                            </div>
                          )}
                          {movement.machineName && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Automat: {movement.machineName}
                            </div>
                          )}
                        </div>
                      ) : movement.previousStock !== null && movement.currentStock !== null ? (
                        <div className="font-mono text-sm">
                          {movement.previousStock} → {movement.currentStock}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <CalendarRange className="h-8 w-8 mb-2" />
                      <p>Keine Warenbewegungen gefunden.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default WarehouseMovementsTable;
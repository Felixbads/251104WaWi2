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

interface WarehouseMovementsTableProps {
  warehouseId: number;
  limit?: number;
}

const WarehouseMovementsTable: React.FC<WarehouseMovementsTableProps> = ({ 
  warehouseId, 
  limit = 50
}) => {
  const { data: movements = [], isLoading, error } = useQuery({
    queryKey: [`/api/inventory/warehouse/${warehouseId}/movements`, { limit }],
  });

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
      default:
        return <Badge variant="outline">{movementType}</Badge>;
    }
  };

  // Gibt eine Kurzbeschreibung für die Bewegung zurück
  const getMovementDescription = (movement: any) => {
    const { source_type, destination_type, movement_type, reference_type, reason } = movement;
    
    // Basis der Beschreibung ist der Grund, falls vorhanden
    if (reason) return reason;
    
    // Ansonsten bauen wir eine Beschreibung basierend auf den Typen
    if (movement_type === 'IN') {
      if (source_type === 'supplier' && destination_type === 'warehouse') {
        return 'Wareneingang von Lieferant';
      } else if (source_type === 'machine' && destination_type === 'warehouse') {
        return 'Rücknahme von Automat';
      } else if (reference_type === 'order') {
        return 'Bestellung eingegangen';
      } else if (reference_type === 'return') {
        return 'Retoure';
      }
      return 'Eingang';
    } else if (movement_type === 'OUT') {
      if (source_type === 'warehouse' && destination_type === 'machine') {
        return 'Befüllung Automat';
      } else if (source_type === 'warehouse' && destination_type === 'disposal') {
        return 'Entsorgung';
      } else if (reference_type === 'expiry') {
        return 'Ablauf';
      } else if (reference_type === 'damage') {
        return 'Beschädigung';
      } else if (reference_type === 'reconciliation') {
        return 'Bestandsabgleich';
      }
      return 'Ausgang';
    } else if (movement_type === 'TRANSFER') {
      return 'Transfer zwischen Lagern';
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length > 0 ? (
                movements.map((movement: any) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-muted-foreground" />
                        {formatDate(movement.performed_at)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {movement.product_name}
                    </TableCell>
                    <TableCell className="text-center">
                      {getMovementTypeBadge(movement.movement_type)}
                    </TableCell>
                    <TableCell>
                      {getMovementDescription(movement)}
                    </TableCell>
                    <TableCell className="text-right font-mono flex items-center justify-end">
                      {movement.movement_type === 'IN' && <MoveDown className="h-4 w-4 mr-1 text-green-600" />}
                      {movement.movement_type === 'OUT' && <MoveUp className="h-4 w-4 mr-1 text-red-600" />}
                      {movement.quantity}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
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
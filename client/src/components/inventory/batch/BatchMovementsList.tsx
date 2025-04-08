import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { CircleAlert, FileBox, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type BatchMovementsListProps = {
  batchId: number;
};

export default function BatchMovementsList({ batchId }: BatchMovementsListProps) {
  // Query für Batch-Bewegungen
  const { data: movements, isLoading, error } = useQuery<any[]>({
    queryKey: ['/api/inventory/movements', batchId],
    queryFn: async () => {
      const response = await fetch(`/api/inventory/movements?batchId=${batchId}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Batch-Bewegungen: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 1000 * 30, // 30 Sekunden
    enabled: !!batchId,
  });

  // Rendering bei Ladevorgang
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  // Rendering bei Fehler
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-center">
        <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">Fehler beim Laden der Chargenbewegungen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Chargenbewegungen ist ein Fehler aufgetreten.'}
        </p>
      </div>
    );
  }

  // Wenn keine Bewegungen vorhanden sind
  if (!movements || !Array.isArray(movements) || movements.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg">
        <FileBox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Keine Bewegungen für diese Charge</h3>
        <p className="text-muted-foreground">
          Für diese Charge wurden noch keine Bewegungen erfasst.
        </p>
      </div>
    );
  }

  // Hilfsfunktion zum Anzeigen des Bewegungstyps
  const getMovementTypeBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'IN':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center gap-1">
            <ArrowDown className="h-3 w-3" />
            Eingang
          </Badge>
        );
      case 'OUT':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-100 flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            Ausgang
          </Badge>
        );
      case 'TRANSFER':
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-800 hover:bg-purple-100 flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Transfer
          </Badge>
        );
      case 'EXPIRY':
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100 flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            Ablaufdatum
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {type}
          </Badge>
        );
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Referenz</TableHead>
            <TableHead className="text-right">Menge</TableHead>
            <TableHead>Von</TableHead>
            <TableHead>Nach</TableHead>
            <TableHead>Durchgeführt von</TableHead>
            <TableHead>Notizen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.isArray(movements) && movements.map((movement: any) => (
            <TableRow key={movement.id}>
              <TableCell>
                {format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
              </TableCell>
              <TableCell>{getMovementTypeBadge(movement.movementType)}</TableCell>
              <TableCell>{movement.referenceType}/{movement.referenceId}</TableCell>
              <TableCell className="text-right">{movement.quantity}</TableCell>
              <TableCell>{movement.sourceName || "-"}</TableCell>
              <TableCell>{movement.destinationName || "-"}</TableCell>
              <TableCell>{movement.performedBy || "System"}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={movement.notes || ""}>
                {movement.notes || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
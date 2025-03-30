import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Search, ArrowDownUp, ArrowUp, ArrowDown, ArrowLeftRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Hilfs-Komponente für das Bewegungssymbol
const MovementIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'IN':
      return <ArrowDown className="h-4 w-4 text-green-600" />;
    case 'OUT':
      return <ArrowUp className="h-4 w-4 text-red-600" />;
    case 'TRANSFER':
      return <ArrowLeftRight className="h-4 w-4 text-blue-600" />;
    default:
      return <ArrowDownUp className="h-4 w-4" />;
  }
};

// Hilfs-Komponente für den Bewegungstyp-Badge
const MovementTypeBadge = ({ type }: { type: string }) => {
  switch (type) {
    case 'IN':
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          <ArrowDown className="mr-1 h-3 w-3" /> Eingang
        </Badge>
      );
    case 'OUT':
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">
          <ArrowUp className="mr-1 h-3 w-3" /> Ausgang
        </Badge>
      );
    case 'TRANSFER':
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <ArrowLeftRight className="mr-1 h-3 w-3" /> Umbuchung
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <ArrowDownUp className="mr-1 h-3 w-3" /> {type}
        </Badge>
      );
  }
};

// Hilfs-Komponente für den Referenztyp-Badge
const ReferenceTypeBadge = ({ type }: { type: string }) => {
  switch (type) {
    case 'ORDER':
      return <Badge variant="secondary">Bestellung</Badge>;
    case 'REFILL':
      return <Badge variant="secondary">Auffüllung</Badge>;
    case 'INVENTORY_COUNT':
      return <Badge variant="secondary">Inventur</Badge>;
    case 'MANUAL':
      return <Badge variant="secondary">Manuell</Badge>;
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

export default function InventoryMovements() {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedReferenceType, setSelectedReferenceType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Abfrage der Warenbewegungen
  const { data: movements, isLoading, error } = useQuery({
    queryKey: ['/api/inventory-movements', { 
      movementType: selectedType !== 'all' ? selectedType : undefined,
      referenceType: selectedReferenceType !== 'all' ? selectedReferenceType : undefined,
      limit: 100 
    }],
    staleTime: 1000 * 30, // 30 Sekunden
  });

  // Abfrage der Lager für Filter
  const { data: warehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

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
        <h3 className="font-medium text-destructive">Fehler beim Laden der Warenbewegungen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Warenbewegungen ist ein Fehler aufgetreten.'}
        </p>
      </div>
    );
  }

  // Filtere Bewegungen basierend auf der Suche
  const filteredMovements = movements 
    ? movements.filter((movement: any) => 
        movement.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.sourceWarehouseName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.destinationWarehouseName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Filter-Bereich */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
          <div className="space-y-2">
            <Label htmlFor="movementType">Bewegungstyp</Label>
            <Select 
              value={selectedType} 
              onValueChange={setSelectedType}
            >
              <SelectTrigger id="movementType">
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="IN">Eingang</SelectItem>
                <SelectItem value="OUT">Ausgang</SelectItem>
                <SelectItem value="TRANSFER">Umbuchung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="referenceType">Referenztyp</Label>
            <Select 
              value={selectedReferenceType} 
              onValueChange={setSelectedReferenceType}
            >
              <SelectTrigger id="referenceType">
                <SelectValue placeholder="Alle Referenzen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Referenzen</SelectItem>
                <SelectItem value="ORDER">Bestellung</SelectItem>
                <SelectItem value="REFILL">Auffüllung</SelectItem>
                <SelectItem value="INVENTORY_COUNT">Inventur</SelectItem>
                <SelectItem value="MANUAL">Manuell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="search">Suche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Produkt oder Lager suchen"
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <Button onClick={() => window.location.hash = 'new-movement'}>
          <ArrowDownUp className="mr-2 h-4 w-4" />
          Neue Warenbewegung
        </Button>
      </div>

      {/* Haupttabelle */}
      {filteredMovements.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <ArrowDownUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Warenbewegungen gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || selectedType !== 'all' || selectedReferenceType !== 'all'
              ? "Es wurden keine Warenbewegungen gefunden, die den Filterkriterien entsprechen."
              : "Es wurden noch keine Warenbewegungen verzeichnet."}
          </p>
          <Button onClick={() => window.location.hash = 'new-movement'}>
            Erste Warenbewegung erstellen
          </Button>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Artikel</TableHead>
                <TableHead>Menge</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead>Ziel</TableHead>
                <TableHead>Referenz</TableHead>
                <TableHead>Hinweise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.map((movement: any) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(movement.createdAt).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell>
                    <MovementTypeBadge type={movement.movementType} />
                  </TableCell>
                  <TableCell className="font-medium">{movement.productName || "Unbekannter Artikel"}</TableCell>
                  <TableCell>{movement.quantity}</TableCell>
                  <TableCell>
                    {movement.sourceWarehouseName || (movement.movementType === 'IN' ? 'Extern' : '-')}
                  </TableCell>
                  <TableCell>
                    {movement.destinationWarehouseName || (movement.movementType === 'OUT' ? 'Extern' : '-')}
                  </TableCell>
                  <TableCell>
                    <ReferenceTypeBadge type={movement.referenceType} />
                    {movement.referenceId && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        #{movement.referenceId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {movement.notes || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ToDo: Implementieren Sie die Dialoge für das Hinzufügen von Warenbewegungen */}
    </div>
  );
}
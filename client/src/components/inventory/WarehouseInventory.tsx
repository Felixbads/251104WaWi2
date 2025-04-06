import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CircleAlert, Package, Search, PlusCircle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface WarehouseInventoryProps {
  warehouseId: number;
  inventory: any[]; // Array von Inventarpositionen
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
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

  // Filtere Lagerbestände basierend auf der Suche
  const filteredItems = inventory 
    ? inventory.filter((item: any) => 
        item.productName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Filter-Bereich */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Label htmlFor="search">Suche</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Produkt suchen"
              className="pl-8"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onRefresh}
            className="whitespace-nowrap"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Lagerabgleich
          </Button>

          <Button className="whitespace-nowrap" onClick={() => window.location.hash = 'new-item'}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Artikel hinzufügen
          </Button>
        </div>
      </div>

      {/* Haupttabelle */}
      {filteredItems.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Artikel gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? "Es wurden keine Artikel gefunden, die den Filterkriterien entsprechen."
              : "In diesem Lager wurden noch keine Artikel angelegt."}
          </p>
          <Button onClick={() => window.location.hash = 'new-item'}>
            Artikel zum Lager hinzufügen
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead className="text-right">Bestand</TableHead>
                <TableHead className="text-right">Min. Bestand</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Letzte Zählung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName || "Unbekannter Artikel"}</TableCell>
                  <TableCell>{item.warehouseName || "Unbekanntes Lager"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
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
                    {item.lastCountDate ? (
                      new Date(item.lastCountDate).toLocaleDateString('de-DE')
                    ) : (
                      <span className="text-muted-foreground">Nie</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ToDo: Implementieren Sie die Dialoge für das Hinzufügen und Bearbeiten von Lagerbeständen */}
    </div>
  );
}
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Package2, Search } from 'lucide-react';

interface WarehouseInventoryTableProps {
  warehouseId: number;
}

const WarehouseInventoryTable: React.FC<WarehouseInventoryTableProps> = ({ warehouseId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: inventory = [], isLoading, error } = useQuery({
    queryKey: [`/api/inventory/warehouse/${warehouseId}`],
  });
  
  // Filtern der Inventardaten basierend auf dem Suchbegriff
  const filteredInventory = React.useMemo(() => {
    if (!searchTerm.trim()) return inventory;
    
    return inventory.filter((item: any) => {
      const searchTermLower = searchTerm.toLowerCase();
      return (
        item.product_name?.toLowerCase().includes(searchTermLower) ||
        item.category?.toLowerCase().includes(searchTermLower) ||
        item.sku?.toLowerCase().includes(searchTermLower)
      );
    });
  }, [inventory, searchTerm]);

  // Status-Badge für den Bestand
  const getStockStatusBadge = (item: any) => {
    if (item.quantity <= 0) {
      return <Badge variant="destructive">Nicht auf Lager</Badge>;
    }
    
    if (item.min_quantity > 0 && item.quantity <= item.min_quantity) {
      return <Badge variant="warning" className="bg-amber-500">Kritisch</Badge>;
    }
    
    return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Auf Lager</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="my-6">
        <CardHeader>
          <CardTitle>Lagerbestand</CardTitle>
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
          <p>Der Lagerbestand konnte nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package2 className="h-5 w-5" />
          Lagerbestand
        </CardTitle>
        <CardDescription>
          Übersicht aller Produkte im Lager mit aktuellen Bestandsmengen
        </CardDescription>
        <div className="relative w-full md:w-96 my-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Nach Produkten suchen..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Produkt</TableHead>
                <TableHead className="font-medium">Kategorie</TableHead>
                <TableHead className="font-medium">SKU</TableHead>
                <TableHead className="font-medium text-right">Chargen</TableHead>
                <TableHead className="font-medium text-right">Bestand</TableHead>
                <TableHead className="font-medium text-right">Min. Bestand</TableHead>
                <TableHead className="font-medium text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.length > 0 ? (
                filteredInventory.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>{item.category || '-'}</TableCell>
                    <TableCell>{item.sku || '-'}</TableCell>
                    <TableCell className="text-right">{item.batch_count || 0}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.min_quantity || 0}</TableCell>
                    <TableCell className="text-center">
                      {getStockStatusBadge(item)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    {searchTerm ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Search className="h-8 w-8 mb-2" />
                        <p>Keine Produkte für "{searchTerm}" gefunden.</p>
                        <p className="text-sm">Versuchen Sie einen anderen Suchbegriff.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mb-2" />
                        <p>Keine Produkte im Lager vorhanden.</p>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filteredInventory.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            {filteredInventory.length} {filteredInventory.length === 1 ? 'Produkt' : 'Produkte'} {searchTerm && 'gefunden'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WarehouseInventoryTable;
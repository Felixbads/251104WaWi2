import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Package2, 
  Search, 
  ArrowLeft,
  Calendar,
  Building2, 
  Warehouse 
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Bewegungshistorie-Seite
const MovementHistoryPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const params = useParams<{ productId: string }>();
  const productId = params.productId ? parseInt(params.productId, 10) : null;
  const [searchTerm, setSearchTerm] = useState('');

  // Produktdetails abrufen
  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  // Produktchargen abrufen
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: [`/api/product-batches/product/${productId}`],
    enabled: !!productId,
  });

  // Automat-Informationen für ein Produkt und dessen Chargen abrufen
  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: [`/api/product-movements/${productId}`],
    enabled: !!productId,
  });

  // Gefilterte Bewegungen basierend auf Suchbegriff
  const filteredMovements = React.useMemo(() => {
    if (!searchTerm) return movements;
    return movements.filter((movement: any) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (movement.machineName || '').toLowerCase().includes(searchLower) ||
        (movement.batchNumber || '').toLowerCase().includes(searchLower) ||
        (movement.location || '').toLowerCase().includes(searchLower)
      );
    });
  }, [movements, searchTerm]);

  // Gruppierte Bewegungen nach Automaten
  const groupedByMachine = React.useMemo(() => {
    const grouped: Record<string, any[]> = {};
    
    filteredMovements.forEach((movement: any) => {
      const machineId = movement.machineId;
      if (!grouped[machineId]) {
        grouped[machineId] = [];
      }
      grouped[machineId].push(movement);
    });
    
    return grouped;
  }, [filteredMovements]);

  // Zurück zur vorherigen Seite
  const handleBack = () => {
    window.history.back();
  };

  if (productLoading || batchesLoading || movementsLoading) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <button 
        onClick={handleBack}
        className="mb-4 flex items-center text-sm text-blue-600 hover:text-blue-800"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Zurück
      </button>
      
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package2 className="h-5 w-5" />
                Bewegungshistorie
              </CardTitle>
              <CardDescription>
                {product ? product.name : 'Produkt'} - Verteilung in Automaten nach Chargen
              </CardDescription>
            </div>
            
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nach Automaten oder Chargen suchen..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Produktdetails */}
          {product && (
            <div className="mb-6 p-4 bg-muted/20 rounded-md">
              <h3 className="text-lg font-medium mb-2">{product.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Kategorie</p>
                  <p>{product.category || 'Keine Kategorie'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Chargen</p>
                  <p>{batches.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">In Automaten</p>
                  <p>{Object.keys(groupedByMachine).length || 0}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Keine Daten */}
          {filteredMovements.length === 0 && (
            <div className="text-center py-8">
              <Package2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Keine Bewegungen gefunden</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? `Keine Ergebnisse für "${searchTerm}"`
                  : 'Dieses Produkt ist derzeit in keinem Automaten'}
              </p>
            </div>
          )}

          {/* Bewegungen nach Automaten gruppiert */}
          {filteredMovements.length > 0 && (
            <div className="space-y-6">
              {Object.entries(groupedByMachine).map(([machineId, machineBatches]) => {
                const machine = machineBatches[0]; // Nehme die erste Bewegung für Maschinen-Metadaten
                
                return (
                  <Card key={machineId} className="border border-muted">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center">
                            <Building2 className="h-4 w-4 mr-2" />
                            {machine.machineName || `Automat ${machineId}`}
                          </CardTitle>
                          {machine.location && (
                            <CardDescription>{machine.location}</CardDescription>
                          )}
                        </div>
                        <Badge variant="outline" className="bg-primary/10">
                          {machineBatches.length} {machineBatches.length === 1 ? 'Charge' : 'Chargen'}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[180px]">Charge</TableHead>
                            <TableHead>MHD</TableHead>
                            <TableHead>Eingelagert am</TableHead>
                            <TableHead>Herkunftslager</TableHead>
                            <TableHead className="text-right">Menge</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machineBatches.map((batch, index) => {
                            const isExpired = batch.expiryDate && new Date(batch.expiryDate) < new Date();
                            const isExpiringSoon = batch.expiryDate && !isExpired && 
                              new Date(batch.expiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                            
                            return (
                              <TableRow key={`${machineId}-${batch.batchId || index}`}>
                                <TableCell className="font-medium">{batch.batchNumber || 'Unbekannt'}</TableCell>
                                <TableCell>
                                  {batch.expiryDate ? (
                                    <div className="flex items-center">
                                      <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                                      <span className={
                                        isExpired ? 'text-destructive font-medium' :
                                        isExpiringSoon ? 'text-amber-500 font-medium' : ''
                                      }>
                                        {format(new Date(batch.expiryDate), 'dd.MM.yyyy', { locale: de })}
                                      </span>
                                    </div>
                                  ) : (
                                    'Unbekannt'
                                  )}
                                </TableCell>
                                <TableCell>
                                  {batch.movementDate ? 
                                    format(new Date(batch.movementDate), 'dd.MM.yyyy', { locale: de }) : 
                                    'Unbekannt'
                                  }
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center">
                                    <Warehouse className="h-3 w-3 mr-1 text-muted-foreground" />
                                    {batch.warehouseName || `Lager ${batch.warehouseId || '?'}`}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {batch.quantity || 0}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          
          {filteredMovements.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Insgesamt {filteredMovements.length} {filteredMovements.length === 1 ? 'Bewegung' : 'Bewegungen'} in {Object.keys(groupedByMachine).length} {Object.keys(groupedByMachine).length === 1 ? 'Automat' : 'Automaten'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MovementHistoryPage;
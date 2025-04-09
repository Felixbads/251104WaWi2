import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Importiere die interne Umlagerungskomponente
import InternalMovement from '@/components/inventory/InternalMovement';

// UI Komponenten
import {
  ChevronLeft,
  Download,
  Filter,
  Truck,
  FileDown,
  FileUp,
  Package,
  RefreshCw,
  ShoppingCart,
  User,
  RotateCw,
  AlertTriangle,
  ArrowRightLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Hauptkomponente für die Warenbewegungsseite
export default function WarehouseMovement() {
  const params = useParams();
  const warehouseId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Abfragen der Lagerdaten
  const { data: warehouse, isLoading: warehouseLoading } = useQuery({
    queryKey: ['/api/warehouses', warehouseId],
    enabled: !!warehouseId
  });

  // Abfragen der Warenbewegungen
  const { 
    data: movements = [], 
    isLoading: movementsLoading,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'movements'],
    enabled: !!warehouseId
  });

  // Lade-Indikator
  if (warehouseLoading || movementsLoading) {
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/warehouses/${warehouseId}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-12">
              <RefreshCw className="h-12 w-12 animate-spin mb-4" />
              <p className="text-muted-foreground">Lade Warenbewegungen...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Hilfsfunktion zum Formatieren des Datums
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch (error) {
      return 'Ungültiges Datum';
    }
  };

  // Hilfsfunktion zum Bestimmen des Badge-Typs
  const getMovementBadgeVariant = (type: string) => {
    switch (type) {
      case 'IN': return 'default';
      case 'OUT': return 'destructive';
      case 'TRANSFER': return 'secondary';
      case 'ADJUSTMENT': return 'outline';
      case 'REFILL': return 'destructive';
      case 'MANUAL': return 'outline';
      case 'INTERNAL': return 'secondary';
      default: return 'default';
    }
  };

  // Hilfsfunktion zur Anzeige des Bewegungstyps
  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'IN': return 'Eingang';
      case 'OUT': return 'Ausgang';
      case 'TRANSFER': return 'Transfer';
      case 'ADJUSTMENT': return 'Korrektur';
      case 'REFILL': return 'Auffüllung';
      case 'MANUAL': return 'Manuell';
      case 'INTERNAL': return 'Umlagerung';
      default: return type;
    }
  };

  // Hauptansicht
  return (
    <div className="container py-6 space-y-6">
      {/* Kopfzeile mit Navigationslink */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/warehouses/${warehouseId}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
          <h1 className="text-xl font-semibold">
            Warenbewegungen: {warehouse?.name || 'Lager'}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'movements'] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>
      
      {/* Tabs für verschiedene Bewegungstypen */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span>Alle Bewegungen</span>
          </TabsTrigger>
          <TabsTrigger value="out" className="flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            <span>Ausgang</span>
          </TabsTrigger>
          <TabsTrigger value="internal" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            <span>Interne Umlagerung</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Tab: Alle Bewegungen */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Alle Warenbewegungen</CardTitle>
              <CardDescription>
                Alle Ein- und Ausgänge sowie Anpassungen des Lagerbestands
              </CardDescription>
            </CardHeader>
            <CardContent>
              {movements.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Datum</TableHead>
                        <TableHead className="w-[150px]">Typ</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="w-[150px]">Menge</TableHead>
                        <TableHead>Quelle/Ziel</TableHead>
                        <TableHead className="w-[150px]">Durchgeführt von</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((movement: any) => (
                        <TableRow key={`all-${movement.id}`}>
                          <TableCell className="font-medium">
                            {formatDate(movement.performedAt || movement.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getMovementBadgeVariant(movement.movementType)}>
                              {getMovementTypeLabel(movement.movementType)}
                            </Badge>
                          </TableCell>
                          <TableCell>{movement.productName}</TableCell>
                          <TableCell>
                            <span className={Number(movement.quantity) < 0 ? "text-destructive" : "text-emerald-600"}>
                              {Number(movement.quantity) < 0 ? "-" : "+"}{Math.abs(Number(movement.quantity))} {movement.unit || 'Stk.'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {movement.movementType === 'TRANSFER' && (
                              <span>{movement.sourceWarehouseName} → {movement.destinationWarehouseName}</span>
                            )}
                            {movement.movementType === 'OUT' && (
                              <span>{movement.sourceWarehouseName} → Ausgang</span>
                            )}
                            {movement.movementType === 'REFILL' && (
                              <span>{movement.sourceWarehouseName} → {movement.machineName}</span>
                            )}
                            {movement.movementType === 'INTERNAL' && (
                              <span>{movement.notes || 'Interne Umlagerung'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span>{movement.performedByName || 'System'}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Keine Warenbewegungen gefunden</h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    Es wurden keine Warenbewegungen für dieses Lager gefunden.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        

        
        {/* Tab: Ausgang */}
        <TabsContent value="out">
          <Card>
            <CardHeader>
              <CardTitle>Warenausgänge</CardTitle>
              <CardDescription>
                Produkte, die das Lager verlassen haben (inkl. Auffüllungen für Automaten)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button variant="default">
                  <FileDown className="mr-2 h-4 w-4" />
                  Neuen Ausgang erfassen
                </Button>
              </div>
              
              {movements.filter((m: any) => m.movementType === 'OUT' || m.movementType === 'REFILL').length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Datum</TableHead>
                        <TableHead className="w-[150px]">Typ</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="w-[150px]">Menge</TableHead>
                        <TableHead>Ziel</TableHead>
                        <TableHead className="w-[150px]">Durchgeführt von</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements
                        .filter((m: any) => m.movementType === 'OUT' || m.movementType === 'REFILL')
                        .map((movement: any) => (
                          <TableRow key={`out-${movement.id}`}>
                            <TableCell className="font-medium">
                              {formatDate(movement.performedAt || movement.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getMovementBadgeVariant(movement.movementType)}>
                                {getMovementTypeLabel(movement.movementType)}
                              </Badge>
                            </TableCell>
                            <TableCell>{movement.productName}</TableCell>
                            <TableCell>
                              <span className="text-destructive">
                                -{Math.abs(Number(movement.quantity))} {movement.unit || 'Stk.'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {movement.movementType === 'REFILL' ? (
                                <span>{movement.machineName || 'Automat'}</span>
                              ) : (
                                <span>Ausgang</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <User className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>{movement.performedByName || 'System'}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <FileDown className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Keine Ausgänge gefunden</h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    Es wurden keine Warenausgänge gefunden.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Interne Umlagerung */}
        <TabsContent value="internal">
          <Card>
            <CardHeader>
              <CardTitle>Interne Umlagerungen</CardTitle>
              <CardDescription>
                Verschiebung von Produkten innerhalb des Lagers zwischen verschiedenen Lagerplätzen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Links: Formular für neue Umlagerung */}
                <div>
                  <InternalMovement 
                    warehouseId={warehouseId} 
                    onSuccess={() => refetchMovements()}
                  />
                </div>
                
                {/* Rechts: Liste der bisherigen internen Umlagerungen */}
                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Bisherige Umlagerungen</CardTitle>
                      <CardDescription>
                        Übersicht aller internen Produktverschiebungen
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {movements.filter((m: any) => m.movementType === 'INTERNAL').length > 0 ? (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[150px]">Datum</TableHead>
                                <TableHead>Produkt</TableHead>
                                <TableHead className="w-[100px]">Menge</TableHead>
                                <TableHead>Details</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {movements
                                .filter((m: any) => m.movementType === 'INTERNAL')
                                .map((movement: any) => (
                                  <TableRow key={`internal-${movement.id}`}>
                                    <TableCell className="font-medium">
                                      {formatDate(movement.performedAt || movement.createdAt)}
                                    </TableCell>
                                    <TableCell>{movement.productName}</TableCell>
                                    <TableCell>
                                      {Math.abs(Number(movement.quantity))} {movement.unit || 'Stk.'}
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm">
                                        {movement.notes || 'Interne Umlagerung'}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          <Package className="h-8 w-8 text-muted-foreground mb-4" />
                          <h3 className="text-base font-medium mb-2">Keine Umlagerungen gefunden</h3>
                          <p className="text-muted-foreground text-sm max-w-md">
                            Es wurden keine internen Umlagerungen durchgeführt.
                            Nutzen Sie das Formular, um Produkte zwischen Lagerplätzen zu verschieben.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
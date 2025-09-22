import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Users, Search, Filter, RefreshCw, Loader2, AlertTriangle,
  Package, Clock, Building2, MonitorSmartphone, User,
  ArrowRight, CalendarDays
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';

interface WithdrawalMovement {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  movementType: string;
  direction: string;
  performedAt: string | null;
  performedBy: number;
  actorUsernameSnapshot: string | null;
  sourceWarehouseId: number;
  sourceWarehouseName: string;
  machineId: number | null;
  machineName: string | null;
  referenceType: string;
  referenceId: string;
  notes: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
}

interface Warehouse {
  id: number;
  name: string;
  status: string;
}

export default function WarehouseWithdrawals() {
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7'); // Tage
  
  // Lade Lager-Entnahmen (nur OUT-Bewegungen)
  const {
    data: withdrawals = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/inventory-movements', { 
      sourceWarehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
      movementType: 'OUT',
      direction: 'OUT',
      limit: 100,
      days: parseInt(dateRange)
    }],
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });

  // Lade Lagerdaten für das Dropdown
  const { data: warehousesResponse } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  const warehouses = warehousesResponse?.data || [];
  
  // Suche und Filterung
  const filteredWithdrawals = Array.isArray(withdrawals) ? withdrawals.filter((movement: WithdrawalMovement) => {
    const matchesSearch = !searchTerm || 
      (movement.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       movement.machineName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       movement.actorUsernameSnapshot?.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesWarehouse = warehouseFilter === "all" || !warehouseFilter || movement.sourceWarehouseId === parseInt(warehouseFilter);
    
    const matchesUser = userFilter === "all" || !userFilter || 
      (movement.actorUsernameSnapshot?.toLowerCase().includes(userFilter.toLowerCase()));
    
    return matchesSearch && matchesWarehouse && matchesUser;
  }) : [];

  // Get unique users for filter
  const uniqueUsers = Array.from(new Set(
    withdrawals
      .map((m: WithdrawalMovement) => m.actorUsernameSnapshot)
      .filter(Boolean)
  )).sort();

  // Statistiken berechnen
  const totalWithdrawals = filteredWithdrawals.length;
  const totalQuantity = filteredWithdrawals.reduce((sum: number, movement: WithdrawalMovement) => sum + Math.abs(movement.quantity), 0);
  const uniqueProducts = new Set(filteredWithdrawals.map((m: WithdrawalMovement) => m.productId)).size;
  const uniqueMachines = new Set(filteredWithdrawals.map((m: WithdrawalMovement) => m.machineId).filter(Boolean)).size;

  // Bewegungstyp Badge
  const getMovementTypeBadge = (movement: WithdrawalMovement) => {
    if (movement.referenceType === 'REFILL') {
      return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Automat-Auffüllung</Badge>;
    } else if (movement.referenceType === 'DISPOSAL') {
      return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Entsorgung</Badge>;
    } else if (movement.referenceType === 'TRANSFER') {
      return <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Umlagerung</Badge>;
    }
    return <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50">Entnahme</Badge>;
  };

  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Lager-Entnahmen werden geladen...</p>
      </div>
    );
  }

  // Fehler-Anzeige
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <AlertTriangle className="h-10 w-10 text-red-500 mb-4" />
        <p className="text-muted-foreground mb-4">Fehler beim Laden der Entnahmen</p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Lager-Entnahmen
          </h2>
          <p className="text-muted-foreground mt-1">
            Übersicht aller Entnahmen aus den Lagern mit Benutzer- und Automaten-Informationen
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      {/* Statistiken */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{totalWithdrawals}</p>
                <p className="text-sm text-muted-foreground">Entnahmen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ArrowRight className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{totalQuantity}</p>
                <p className="text-sm text-muted-foreground">Stück total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{uniqueProducts}</p>
                <p className="text-sm text-muted-foreground">Verschiedene Produkte</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <MonitorSmartphone className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{uniqueMachines}</p>
                <p className="text-sm text-muted-foreground">Automaten betroffen</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter & Suche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Suchfeld */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                value={searchTerm}
                placeholder="Produkt, Automat oder Benutzer..."
                className="pl-8"
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-withdrawals"
              />
            </div>

            {/* Lager-Filter */}
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alle Lager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lager</SelectItem>
                {warehouses.map((warehouse: Warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Benutzer-Filter */}
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alle Benutzer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Benutzer</SelectItem>
                {uniqueUsers.map((user: string) => (
                  <SelectItem key={user} value={user}>
                    {user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Zeitraum-Filter */}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue placeholder="Zeitraum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Heute</SelectItem>
                <SelectItem value="7">Letzte 7 Tage</SelectItem>
                <SelectItem value="30">Letzte 30 Tage</SelectItem>
                <SelectItem value="90">Letzte 90 Tage</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter zurücksetzen */}
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchTerm('');
                setWarehouseFilter('all');
                setUserFilter('all');
                setDateRange('7');
              }}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entnahmen-Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Entnahmen-Details ({filteredWithdrawals.length})
          </CardTitle>
          <CardDescription>
            Detaillierte Liste aller Lager-Entnahmen mit Benutzer- und Automaten-Informationen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredWithdrawals.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Entnahmen gefunden</h3>
              <p className="text-muted-foreground">
                {searchTerm || warehouseFilter || userFilter 
                  ? "Versuchen Sie, die Filter zu ändern oder die Suche anzupassen."
                  : "Es wurden keine Entnahmen im ausgewählten Zeitraum gefunden."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Datum/Zeit
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Benutzer
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Produkt
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Lager
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <MonitorSmartphone className="h-4 w-4" />
                        Automat
                      </div>
                    </TableHead>
                    <TableHead>Typ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWithdrawals.map((movement: WithdrawalMovement) => (
                    <TableRow 
                      key={movement.id}
                      data-testid={`row-withdrawal-${movement.id}`}
                    >
                      <TableCell className="font-mono text-sm">
                        {movement.performedAt ? (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div>{format(parseISO(movement.performedAt), 'dd.MM.yyyy', { locale: de })}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(parseISO(movement.performedAt), 'HH:mm', { locale: de })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Kein Datum</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-user-${movement.id}`}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {movement.actorUsernameSnapshot || 'Unbekannt'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-product-${movement.id}`}>
                        <div>
                          <div className="font-medium">{movement.productName}</div>
                          {movement.batchNumber && (
                            <div className="text-xs text-muted-foreground">
                              Charge: {movement.batchNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-quantity-${movement.id}`}>
                        <span className="text-red-600 font-semibold">
                          -{Math.abs(movement.quantity)}
                        </span>
                      </TableCell>
                      <TableCell data-testid={`text-warehouse-${movement.id}`}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{movement.sourceWarehouseName}</span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-machine-${movement.id}`}>
                        {movement.machineName ? (
                          <div className="flex items-center gap-2">
                            <MonitorSmartphone className="h-4 w-4 text-blue-600" />
                            <span className="text-blue-800 font-medium">{movement.machineName}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Kein Automat</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`badge-type-${movement.id}`}>
                        {getMovementTypeBadge(movement)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
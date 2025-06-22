import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductInventoryViewProps {
  productId: number;
  productName: string;
}

interface InventoryItem {
  id: number;
  warehouseId: number;
  warehouseName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  location?: string;
  lastRefill?: string;
}

interface MachineInventory {
  machineId: number;
  machineName: string;
  locationName?: string;
  currentStock: number;
  maxCapacity: number;
  lastRefill?: string;
  status: 'ok' | 'low' | 'empty' | 'unknown';
}

export default function ProductInventoryView({ productId, productName }: ProductInventoryViewProps) {
  const [refreshing, setRefreshing] = useState(false);

  // Fetch warehouse inventory
  const { data: warehouseInventory, isLoading: isLoadingWarehouse, refetch: refetchWarehouse, error: warehouseError } = useQuery({
    queryKey: [`/api/products/${productId}/warehouse-inventory`],
    queryFn: async () => {
      const url = `/api/products/${productId}/warehouse-inventory`;
      console.log('Fetching warehouse inventory from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch warehouse inventory');
      const data = await response.json();
      console.log('Warehouse inventory received:', data);
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch machine inventory
  const { data: machineInventory, isLoading: isLoadingMachine, refetch: refetchMachine, error: machineError } = useQuery({
    queryKey: [`/api/products/${productId}/machine-inventory`],
    queryFn: async () => {
      const url = `/api/products/${productId}/machine-inventory`;
      console.log('Fetching machine inventory from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch machine inventory');
      const data = await response.json();
      console.log('Machine inventory received:', data);
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWarehouse(), refetchMachine()]);
    setRefreshing(false);
  };

  const getStockStatus = (current: number, min: number, max: number) => {
    if (current === 0) return { status: 'empty', color: 'destructive', text: 'Leer' };
    if (current <= min) return { status: 'low', color: 'warning', text: 'Niedrig' };
    if (current >= max * 0.8) return { status: 'full', color: 'success', text: 'Gut gefüllt' };
    return { status: 'ok', color: 'default', text: 'OK' };
  };

  const getMachineStatus = (status: string) => {
    switch (status) {
      case 'empty': return { color: 'destructive', text: 'Leer' };
      case 'low': return { color: 'warning', text: 'Niedrig' };
      case 'ok': return { color: 'success', text: 'OK' };
      default: return { color: 'secondary', text: 'Unbekannt' };
    }
  };

  if (isLoadingWarehouse || isLoadingMachine) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Lagerbestand für {productName}</h3>
          <p className="text-sm text-muted-foreground">Aktuelle Bestände in Lagern und Automaten</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Warehouse Inventory */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lagerbestände
          </CardTitle>
        </CardHeader>
        <CardContent>
          {warehouseInventory?.data && warehouseInventory.data.length > 0 ? (
            <div className="space-y-3">
              {warehouseInventory.data.map((item: InventoryItem) => {
                const status = getStockStatus(item.quantity, item.minQuantity || 5, item.maxQuantity || 100);
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{item.warehouseName}</div>
                      {item.location && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.location}
                        </div>
                      )}
                      {item.lastRefill && (
                        <div className="text-xs text-muted-foreground">
                          Letzter Zugang: {new Date(item.lastRefill).toLocaleDateString('de-DE')}
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-bold text-lg">{item.quantity}</div>
                      <Badge variant={status.color === 'success' ? 'default' : status.color === 'warning' ? 'secondary' : 'destructive'} className="text-xs">
                        {status.text}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Keine Lagerbestände gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Machine Inventory */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Automatenbestände
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machineInventory?.data && machineInventory.data.length > 0 ? (
            <div className="space-y-3">
              {machineInventory.data.map((machine: MachineInventory) => {
                const statusInfo = getMachineStatus(machine.status);
                const fillPercentage = machine.maxCapacity > 0 ? (machine.currentStock / machine.maxCapacity) * 100 : 0;
                
                return (
                  <div key={machine.machineId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium">{machine.machineName}</div>
                        {machine.locationName && (
                          <div className="text-sm text-muted-foreground">{machine.locationName}</div>
                        )}
                      </div>
                      <Badge variant={statusInfo.color === 'success' ? 'default' : statusInfo.color === 'warning' ? 'secondary' : 'destructive'}>
                        {statusInfo.text}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Füllstand</span>
                      <span className="font-medium">
                        {machine.currentStock} / {machine.maxCapacity}
                      </span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          fillPercentage > 80 ? 'bg-green-500' : 
                          fillPercentage > 30 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(fillPercentage, 100)}%` }}
                      ></div>
                    </div>
                    
                    {machine.lastRefill && (
                      <div className="text-xs text-muted-foreground">
                        Letzte Auffüllung: {new Date(machine.lastRefill).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Keine Automatenbestände gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
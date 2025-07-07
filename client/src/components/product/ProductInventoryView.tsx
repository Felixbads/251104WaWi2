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
  const [activeTab, setActiveTab] = useState('warehouse');

  // Fetch warehouse inventory
  const { data: warehouseInventory, isLoading: isLoadingWarehouse, refetch: refetchWarehouse, error: warehouseError } = useQuery({
    queryKey: [`/api/products/${productId}/warehouse-inventory`],
    queryFn: async () => {
      const url = `/api/products/${productId}/warehouse-inventory`;
      console.log('Fetching warehouse inventory from:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch warehouse inventory');
      const data = await response.json();
      console.log('Warehouse inventory received:', data);
      return data.data || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch machine inventory
  const { data: machineInventory, isLoading: isLoadingMachine, refetch: refetchMachine, error: machineError } = useQuery({
    queryKey: [`/api/products/${productId}/machine-inventory`],
    queryFn: async () => {
      const url = `/api/products/${productId}/machine-inventory`;
      console.log('Fetching machine inventory from:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch machine inventory');
      const data = await response.json();
      console.log('Machine inventory received:', data);
      return data.data || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch refill history
  const { data: refillHistory, isLoading: isLoadingRefills } = useQuery({
    queryKey: [`/api/products/${productId}/refills`],
    queryFn: async () => {
      const url = `/api/products/${productId}/refills?timeRange=30d`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return []; // Return empty array if endpoint doesn't exist yet
      return response.json();
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

  if ((isLoadingWarehouse && !warehouseInventory) || (isLoadingMachine && !machineInventory)) {
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
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium ${
            activeTab === 'warehouse' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('warehouse')}
        >
          Lagerbestände
        </button>
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium ${
            activeTab === 'machines' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('machines')}
        >
          Automatenbestände
        </button>
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium ${
            activeTab === 'refills' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('refills')}
        >
          Nachfüllhistorie
        </button>
      </div>

      {/* Warehouse Inventory Tab */}
      {activeTab === 'warehouse' && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lagerbestände
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(warehouseInventory || []).length > 0 ? (
            <div className="space-y-3">
              {warehouseInventory.map((item: any) => {
                const status = getStockStatus(item.current_stock, item.minimum_stock || 5, item.maximum_stock || 100);
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{item.warehouse_name}</div>
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
      )}
      
      {/* Machine Inventory Tab */}
      {activeTab === 'machines' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Automatenbestände
            </CardTitle>
          </CardHeader>
        <CardContent>
          {(machineInventory || []).length > 0 ? (
            <div className="space-y-3">
              {machineInventory.map((machine: any) => {
                const statusInfo = getMachineStatus(machine.status);
                
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
                      <span className="text-sm">Anzahl</span>
                      <span className="font-medium text-lg">
                        {machine.currentStock}
                      </span>
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
      )}
      
      {/* Refill History Tab */}
      {activeTab === 'refills' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Nachfüllhistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {refillHistory && refillHistory.length > 0 ? (
                refillHistory.map((refill: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{refill.machineName}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(refill.refillDate).toLocaleDateString('de-DE')} um{' '}
                          {new Date(refill.refillDate).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {refill.quantity} nachgefüllt
                      </Badge>
                    </div>
                    {refill.batchId && (
                      <p className="text-sm text-gray-600">Charge: {refill.batchId}</p>
                    )}
                    {refill.notes && (
                      <p className="text-sm text-gray-600 mt-1">{refill.notes}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Keine Nachfüllhistorie verfügbar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
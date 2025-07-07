import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, RefreshCw, Calendar } from 'lucide-react';

interface ProductInventoryViewSimpleProps {
  productId: number;
  productName: string;
}

export default function ProductInventoryViewSimple({ productId, productName }: ProductInventoryViewSimpleProps) {
  const [activeTab, setActiveTab] = useState('warehouse');

  // Fetch complete inventory (both warehouse and machine data)
  const { data: inventoryData, isLoading: inventoryLoading, refetch: refetchInventory } = useQuery({
    queryKey: [`/api/products/${productId}/inventory`],
    queryFn: async () => {
      console.log(`[INVENTORY] Fetching inventory for product ${productId}`);
      const response = await fetch(`/api/products/${productId}/inventory`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      
      if (!response.ok) {
        console.error(`[INVENTORY] API error: ${response.status} ${response.statusText}`);
        return { machineStocks: [], warehouseStocks: [] };
      }
      
      const data = await response.json();
      console.log(`[INVENTORY] Received data:`, data);
      
      if (!data.success) {
        console.error(`[INVENTORY] API returned error:`, data.error);
        return { machineStocks: [], warehouseStocks: [] };
      }
      
      return {
        machineStocks: data.machineStocks || [],
        warehouseStocks: data.warehouseStocks || []
      };
    }
  });

  // Fetch refill history
  const { data: refillData, isLoading: refillLoading, refetch: refetchRefills } = useQuery({
    queryKey: [`/api/products/${productId}/refills`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/refills?timeRange=30d`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) return [];
      return response.json();
    }
  });

  const handleRefresh = () => {
    console.log('[INVENTORY] Manual refresh triggered');
    refetchInventory();
    refetchRefills();
  };

  // Extract data for easier access
  const warehouseData = inventoryData?.warehouseStocks || [];
  const machineData = inventoryData?.machineStocks || [];
  const warehouseLoading = inventoryLoading;
  const machineLoading = inventoryLoading;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'warehouse' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('warehouse')}
        >
          Lagerbestände
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'machines' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('machines')}
        >
          Automatenbestände
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'refills' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('refills')}
        >
          Nachfüllhistorie
        </button>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Warehouse Tab */}
      {activeTab === 'warehouse' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Lagerbestände
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryLoading ? (
              <div className="text-center py-8">Lade Lagerbestände...</div>
            ) : warehouseData && warehouseData.length > 0 ? (
              <div className="space-y-3">
                {warehouseData.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{item.warehouse_name}</div>
                      {item.location && <div className="text-sm text-gray-500">{item.location}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{item.current_stock} Stk.</div>
                      <div className="text-sm text-gray-500">
                        Min: {item.minimum_stock || '-'} / Max: {item.maximum_stock || '-'}
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* Machine Tab */}
      {activeTab === 'machines' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Automatenbestände
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryLoading ? (
              <div className="text-center py-8">Lade Automatenbestände...</div>
            ) : machineData && machineData.length > 0 ? (
              <div className="space-y-3">
                {machineData.map((machine: any, index: number) => (
                  <div key={machine.machine_id || index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{machine.machine_name || 'Automat unbekannt'}</div>
                      {machine.location && (
                        <div className="text-sm text-gray-500">{machine.location}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{machine.current_stock || 0}</div>
                      <div className="text-sm text-gray-500">
                        Max: {machine.max_capacity || '-'}
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* Refills Tab */}
      {activeTab === 'refills' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Nachfüllhistorie (letzte 30 Tage)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {refillLoading ? (
              <div className="text-center py-8">Lade Nachfüllhistorie...</div>
            ) : refillData && refillData.length > 0 ? (
              <div className="space-y-3">
                {refillData.slice(0, 10).map((refill: any, index: number) => (
                  <div key={refill.id || index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{refill.machineName || refill.machine_name || 'Automat unbekannt'}</div>
                      <div className="text-sm text-gray-500">
                        {refill.refill_date || refill.datetime ? (
                          `${new Date(refill.refill_date || refill.datetime).toLocaleDateString('de-DE')} um ${new Date(refill.refill_date || refill.datetime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Datum nicht verfügbar'
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">+{refill.quantity_added || refill.quantity || 0} Stk.</div>
                      <Badge variant="outline">{refill.refill_type || 'Nachfüllung'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Keine Nachfüllungen gefunden</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
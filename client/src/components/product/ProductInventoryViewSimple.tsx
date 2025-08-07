import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, RefreshCw, Calendar } from 'lucide-react';
import ProductWithdrawalChart from './ProductWithdrawalChart';

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
      const response = await fetch(`/api/products/${productId}/refill-history`, {
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
              <div className="space-y-4">
                {warehouseData.map((item: any) => (
                  <div key={item.warehouse_id || item.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium text-lg">{item.warehouse_name}</div>
                        <div className="text-sm text-gray-500">
                          Gesamt: {item.current_stock} Stk. | Min: {item.minimum_stock || '-'} | Max: {item.maximum_stock || '-'}
                        </div>
                      </div>
                    </div>
                    {item.batches && item.batches.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t">
                        <div className="text-sm font-medium text-gray-700">Chargen:</div>
                        {item.batches.map((batch: any, idx: number) => {
                          const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                          const today = new Date();
                          const daysUntilExpiry = expiryDate ? Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                          const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                          const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                          
                          return (
                            <div 
                              key={`${batch.batch_number}-${idx}`}
                              className={`flex items-center justify-between p-2 rounded ${
                                isExpired ? 'bg-red-50 border-red-200' : 
                                isExpiringSoon ? 'bg-yellow-50 border-yellow-200' : 
                                'bg-gray-50'
                              } border`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">Charge: {batch.batch_number}</span>
                                  {batch.location_in_warehouse && (
                                    <span className="text-xs text-gray-500">({batch.location_in_warehouse})</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  MHD: {expiryDate ? expiryDate.toLocaleDateString('de-DE') : 'Kein MHD'}
                                  {daysUntilExpiry !== null && (
                                    <span className={`ml-2 font-medium ${
                                      isExpired ? 'text-red-600' : 
                                      isExpiringSoon ? 'text-yellow-600' : 
                                      'text-green-600'
                                    }`}>
                                      {isExpired ? `Abgelaufen vor ${Math.abs(daysUntilExpiry)} Tagen` :
                                       `Noch ${daysUntilExpiry} Tage`}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold">{batch.quantity} Stk.</div>
                                <Badge variant={batch.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                  {batch.status || 'aktiv'}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                {machineData.map((machine: any, index: number) => {
                  const fillPercentage = machine.max_capacity > 0 
                    ? Math.round((machine.current_stock / machine.max_capacity) * 100) 
                    : 0;
                  const isLow = fillPercentage < 30;
                  const isCritical = fillPercentage < 10;
                  
                  return (
                    <div key={machine.machine_id || index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium text-lg">{machine.machine_name || 'Automat unbekannt'}</div>
                          {machine.location && (
                            <div className="text-sm text-gray-500">{machine.location}</div>
                          )}
                          {machine.last_refill_date && (
                            <div className="text-xs text-gray-400 mt-1">
                              Letzte Nachfüllung: {new Date(machine.last_refill_date).toLocaleDateString('de-DE')}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {machine.current_stock || 0} / {machine.max_capacity || 0} Stk.
                          </div>
                          <div className={`text-sm font-medium ${
                            isCritical ? 'text-red-600' : 
                            isLow ? 'text-yellow-600' : 
                            'text-green-600'
                          }`}>
                            {fillPercentage}% gefüllt
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            isCritical ? 'bg-red-500' : 
                            isLow ? 'bg-yellow-500' : 
                            'bg-green-500'
                          }`}
                          style={{ width: `${fillPercentage}%` }}
                        />
                      </div>
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

      {/* Refills Tab */}
      {activeTab === 'refills' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Nachfüllhistorie (letzte 50 Einträge)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {refillLoading ? (
              <div className="text-center py-8">Lade Nachfüllhistorie...</div>
            ) : refillData && refillData.length > 0 ? (
              <div className="space-y-3">
                {refillData.map((refill: any, index: number) => {
                  const quantity = refill.quantity || (refill.quantity_added - refill.quantity_removed) || 0;
                  const isRemoval = refill.action_type === 'removed' || quantity < 0;
                  const isAddition = refill.action_type === 'added' || quantity > 0;
                  
                  return (
                    <div key={refill.id || index} className={`border rounded-lg p-4 ${
                      isRemoval ? 'bg-red-50 border-red-200' : 
                      isAddition ? 'bg-green-50 border-green-200' : 
                      'bg-gray-50'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-lg">
                            {refill.machine_name || 'Automat unbekannt'}
                          </div>
                          {refill.machine_location && (
                            <div className="text-sm text-gray-600">{refill.machine_location}</div>
                          )}
                          <div className="text-sm text-gray-500 mt-1">
                            {refill.refill_date ? (
                              <>
                                {new Date(refill.refill_date).toLocaleDateString('de-DE')} um{' '}
                                {new Date(refill.refill_date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                              </>
                            ) : (
                              'Datum nicht verfügbar'
                            )}
                          </div>
                          {(refill.operator_name || refill.operator) && (
                            <div className="text-sm text-gray-600 mt-1">
                              Durchgeführt von: {refill.operator_name || refill.operator}
                            </div>
                          )}
                          {refill.notes && (
                            <div className="text-sm text-gray-500 italic mt-1">{refill.notes}</div>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className={`text-lg font-bold ${
                            isRemoval ? 'text-red-600' : 
                            isAddition ? 'text-green-600' : 
                            'text-gray-600'
                          }`}>
                            {isRemoval ? '-' : '+'}{Math.abs(quantity)} Stk.
                          </div>
                          <Badge 
                            variant={isRemoval ? 'destructive' : 'default'} 
                            className="mt-1"
                          >
                            {isRemoval ? 'Entnahme' : 
                             isAddition ? 'Nachfüllung' : 
                             'Anpassung'}
                          </Badge>
                          {refill.refill_type && (
                            <div className="text-xs text-gray-500 mt-1">{refill.refill_type}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Keine Nachfüllungen gefunden</p>
              </div>
            )}
            
            {/* Withdrawal Chart */}
            {!refillLoading && (
              <ProductWithdrawalChart productId={productId} productName={productName} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
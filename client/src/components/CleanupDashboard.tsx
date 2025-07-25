import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface CleanupStats {
  draftOrders: number;
  inventory: {
    totalItems: number;
    totalQuantity: number;
    nonZeroItems: number;
  };
}

interface Order {
  id: number;
  order_number: string;
  supplier_name: string;
  status: string;
  created_at: string;
  total_amount: number;
}

interface InventoryItem {
  id: number;
  product_name: string;
  warehouse_name: string;
  quantity: number;
  updated_at: string;
}

export default function CleanupDashboard() {
  const [selectedTab, setSelectedTab] = useState<'orders' | 'inventory'>('orders');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch cleanup statistics
  const { data: stats, isLoading: statsLoading } = useQuery<CleanupStats>({
    queryKey: ['/api/cleanup/stats'],
    enabled: true
  });

  // Fetch all orders
  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders-direct'],
    enabled: selectedTab === 'orders'
  });

  // Fetch inventory items
  const { data: inventory, isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory-items'],
    enabled: selectedTab === 'inventory'
  });

  // Delete individual order
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      return await apiRequest(`/api/cleanup/orders/${orderId}`, {}, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders-direct'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cleanup/stats'] });
      toast({
        title: "Erfolgreich",
        description: "Bestellung wurde gelöscht",
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Löschen der Bestellung",
        variant: "destructive"
      });
    }
  });

  // Delete individual inventory item
  const deleteInventoryMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return await apiRequest(`/api/cleanup/inventory/${itemId}`, {}, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cleanup/stats'] });
      toast({
        title: "Erfolgreich",
        description: "Lagerbestand wurde gelöscht",
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Löschen des Lagerbestands",
        variant: "destructive"
      });
    }
  });

  // Reset all inventory
  const resetInventoryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/cleanup/inventory/reset', {}, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cleanup/stats'] });
      toast({
        title: "Erfolgreich",
        description: "Alle Lagerbestände wurden auf 0 gesetzt",
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Zurücksetzen der Lagerbestände",
        variant: "destructive"
      });
    }
  });

  const handleDeleteOrder = (orderId: number) => {
    if (window.confirm('Sind Sie sicher, dass Sie diese Bestellung löschen möchten?')) {
      deleteOrderMutation.mutate(orderId);
    }
  };

  const handleDeleteInventoryItem = (itemId: number) => {
    if (window.confirm('Sind Sie sicher, dass Sie diesen Lagerbestand löschen möchten?')) {
      deleteInventoryMutation.mutate(itemId);
    }
  };

  const handleResetInventory = () => {
    if (window.confirm('Sind Sie sicher, dass Sie alle Lagerbestände auf 0 setzen möchten?')) {
      resetInventoryMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System-Bereinigung</h1>
          <p className="text-muted-foreground">Verwalten Sie Entwürfe und Lagerbestände</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entwurfs-Bestellungen</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.draftOrders || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.draftOrders === 0 ? "Alle bereinigt" : "Bereinigung empfohlen"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lagerbestände</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.inventory?.nonZeroItems || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Artikel mit Bestand > 0
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtmenge</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.inventory?.totalQuantity || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Stück in allen Lagern
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-2">
        <Button
          variant={selectedTab === 'orders' ? 'default' : 'outline'}
          onClick={() => setSelectedTab('orders')}
        >
          Bestellungen
        </Button>
        <Button
          variant={selectedTab === 'inventory' ? 'default' : 'outline'}
          onClick={() => setSelectedTab('inventory')}
        >
          Lagerbestände
        </Button>
      </div>

      {/* Orders Tab */}
      {selectedTab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Bestellungen verwalten</CardTitle>
            <CardDescription>
              Einzelne Bestellungen löschen oder alle Entwürfe bereinigen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="text-center py-8">Lade Bestellungen...</div>
            ) : (
              <div className="space-y-2">
                {orders?.slice(0, 20).map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div>
                        <p className="font-medium">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.supplier_name}</p>
                      </div>
                      <Badge variant={order.status === 'draft' ? 'secondary' : 'default'}>
                        {order.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('de-DE')}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteOrder(order.id)}
                        disabled={deleteOrderMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inventory Tab */}
      {selectedTab === 'inventory' && (
        <Card>
          <CardHeader>
            <CardTitle>Lagerbestände verwalten</CardTitle>
            <CardDescription>
              Einzelne Lagerbestände löschen oder alle auf 0 setzen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Button
                variant="destructive"
                onClick={handleResetInventory}
                disabled={resetInventoryMutation.isPending}
              >
                {resetInventoryMutation.isPending ? "Setze zurück..." : "Alle Bestände auf 0 setzen"}
              </Button>
            </div>
            
            {inventoryLoading ? (
              <div className="text-center py-8">Lade Lagerbestände...</div>
            ) : (
              <div className="space-y-2">
                {inventory?.filter(item => item.quantity > 0).slice(0, 20).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">{item.warehouse_name}</p>
                      </div>
                      <Badge variant="outline">
                        {item.quantity} Stück
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        {new Date(item.updated_at).toLocaleDateString('de-DE')}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteInventoryItem(item.id)}
                        disabled={deleteInventoryMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
/**
 * WIEDERKEHRENDE BESTELLUNGEN TAB-KOMPONENTE
 * 
 * Hauptkomponente für die Verwaltung wiederkehrender Bestellungen
 * mit Scheduler-Steuerung und Wareneingang-Management
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Calendar, Clock, Mail, Package, Play, Pause, Plus, RefreshCw, TrendingUp, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import RecurringOrderConfigDialog from './RecurringOrderConfigDialog';

interface RecurringOrder {
  id: number;
  name: string;
  description?: string;
  orderType: 'shipping' | 'goods_receipt';
  supplierName: string;
  warehouseName: string;
  interval: string;
  nextExecutionDate: string;
  isActive: boolean;
  forecastEnabled: boolean;
  priority: string;
  totalExecutions: number;
  lastExecutionDate?: string;
}

interface SchedulerStatus {
  isRunning: boolean;
  activeTasks: number;
  nextCheckTime: string;
  config: any;
}

export default function RecurringOrdersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<RecurringOrder | undefined>();

  // Query für wiederkehrende Bestellungen
  const { data: recurringOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/recurring-orders'],
    queryFn: () => apiRequest('/api/recurring-orders').then(res => res.data)
  });

  // Query für Scheduler-Status
  const { data: schedulerStatus, isLoading: statusLoading } = useQuery<SchedulerStatus>({
    queryKey: ['/api/recurring-orders/scheduler/status'],
    queryFn: () => apiRequest('/api/recurring-orders/scheduler/status').then(res => res),
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren
  });

  // Query für Lieferanten und Lager - KORRIGIERT: GET-Methode verwenden
  const { data: suppliers = [] } = useQuery({
    queryKey: ['/api/suppliers/all-for-conditions'],
    queryFn: () => apiRequest('/api/suppliers/all-for-conditions', { method: 'GET' }).then(res => Array.isArray(res) ? res : [])
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('/api/warehouses', { method: 'GET' }).then(res => Array.isArray(res) ? res : [])
  });

  // Query für ausstehende Wareneingänge
  const { data: pendingGoodsReceipts = [] } = useQuery({
    queryKey: ['/api/recurring-orders/goods-receipt/pending'],
    queryFn: () => apiRequest('/api/recurring-orders/goods-receipt/pending').then(res => res)
  });

  // Mutations
  const startSchedulerMutation = useMutation({
    mutationFn: () => apiRequest('/api/recurring-orders/scheduler/start', { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Scheduler gestartet",
        description: "Der automatische Scheduler für wiederkehrende Bestellungen wurde gestartet."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-orders/scheduler/status'] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Scheduler konnte nicht gestartet werden.",
        variant: "destructive"
      });
    }
  });

  const stopSchedulerMutation = useMutation({
    mutationFn: () => apiRequest('/api/recurring-orders/scheduler/stop', { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Scheduler gestoppt",
        description: "Der automatische Scheduler wurde gestoppt."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-orders/scheduler/status'] });
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recurring-orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: "Bestellung gelöscht",
        description: "Die wiederkehrende Bestellung wurde erfolgreich gelöscht."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-orders'] });
    }
  });

  const executeOrderMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recurring-orders/${id}/execute`, { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Bestellung ausgeführt",
        description: "Die wiederkehrende Bestellung wurde manuell ausgeführt."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-orders'] });
    }
  });

  // TEST-FUNKTIONALITÄTEN HINZUGEFÜGT
  const testEmailMutation = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) => 
      apiRequest('/api/recurring-orders/test-email', { 
        method: 'POST', 
        body: { recurringOrderId: id, recipientEmail: email }
      }),
    onSuccess: (data) => {
      toast({
        title: "Test-E-Mail gesendet",
        description: data.message
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test-E-Mail Fehler",
        description: error?.message || "Fehler beim Senden der Test-E-Mail",
        variant: "destructive"
      });
    }
  });

  const testExecutionMutation = useMutation({
    mutationFn: ({ id, dryRun }: { id: number; dryRun: boolean }) => 
      apiRequest('/api/recurring-orders/test-execution', { 
        method: 'POST', 
        body: { recurringOrderId: id, dryRun }
      }),
    onSuccess: (data) => {
      toast({
        title: dryRun ? "Test-Simulation erfolgreich" : "Test-Bestellung erstellt",
        description: data.message
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test-Ausführung Fehler",
        description: error?.message || "Fehler bei der Test-Ausführung",
        variant: "destructive"
      });
    }
  });

  const saveOrderMutation = useMutation({
    mutationFn: (data: any) => {
      if (data.id) {
        return apiRequest(`/api/recurring-orders/${data.id}`, { 
          method: 'PUT', 
          body: data 
        });
      } else {
        return apiRequest('/api/recurring-orders', { 
          method: 'POST', 
          body: data 
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "Die wiederkehrende Bestellung wurde erfolgreich gespeichert."
      });
      setConfigDialogOpen(false);
      setSelectedOrder(undefined);
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-orders'] });
    }
  });

  const handleCreateNew = () => {
    setSelectedOrder(undefined);
    setConfigDialogOpen(true);
  };

  const handleEdit = (order: RecurringOrder) => {
    setSelectedOrder(order);
    setConfigDialogOpen(true);
  };

  const getOrderTypeDisplay = (orderType: string) => {
    return orderType === 'shipping' ? 'Versand' : 'Wareneingang';
  };

  const getOrderTypeBadgeVariant = (orderType: string) => {
    return orderType === 'shipping' ? 'default' : 'secondary';
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'normal': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const formatNextExecution = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Morgen';
    if (diffDays < 0) return `Überfällig (${Math.abs(diffDays)} Tage)`;
    return `In ${diffDays} Tagen`;
  };

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scheduler-Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Automatisierung-Status
              </CardTitle>
              <CardDescription>
                Scheduler für automatische Bestellausführung
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={schedulerStatus?.isRunning ? "destructive" : "default"}
                size="sm"
                onClick={() => schedulerStatus?.isRunning ? stopSchedulerMutation.mutate() : startSchedulerMutation.mutate()}
                disabled={startSchedulerMutation.isPending || stopSchedulerMutation.isPending}
              >
                {schedulerStatus?.isRunning ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Stoppen
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Starten
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {schedulerStatus?.isRunning ? (
                  <Badge variant="default" className="text-green-700 bg-green-100">
                    Aktiv
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    Gestoppt
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">Status</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{schedulerStatus?.activeTasks || 0}</div>
              <div className="text-sm text-muted-foreground">Aktive Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{recurringOrders.filter((o: any) => o.isActive).length}</div>
              <div className="text-sm text-muted-foreground">Aktive Bestellungen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{pendingGoodsReceipts.length}</div>
              <div className="text-sm text-muted-foreground">Wareneingänge</div>
            </div>
          </div>
          
          {schedulerStatus?.nextCheckTime && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Clock className="w-4 h-4" />
                Nächste Prüfung: {schedulerStatus.nextCheckTime}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ausstehende Wareneingänge */}
      {pendingGoodsReceipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Ausstehende Wareneingänge ({pendingGoodsReceipts.length})
            </CardTitle>
            <CardDescription>
              Bestellungen, die zum Wareneingang bereit sind
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {pendingGoodsReceipts.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{order.orderNumber}</div>
                    <div className="text-sm text-muted-foreground">
                      {order.supplierName} → {order.warehouseName}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      {order.status}
                    </Badge>
                    <Button size="sm" variant="outline">
                      Verarbeiten
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wiederkehrende Bestellungen Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Wiederkehrende Bestellungen ({recurringOrders.length})
              </CardTitle>
              <CardDescription>
                Verwalten Sie automatische Bestellungen und Wareneingänge
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew}>
              <Plus className="w-4 h-4 mr-2" />
              Neue Bestellung
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recurringOrders.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Noch keine wiederkehrenden Bestellungen erstellt.
              </p>
              <Button onClick={handleCreateNew} className="mt-4">
                Erste Bestellung erstellen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Lager</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead>Nächste Ausführung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurringOrders.map((order: RecurringOrder) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {order.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getOrderTypeBadgeVariant(order.orderType)}>
                        {getOrderTypeDisplay(order.orderType)}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>{order.warehouseName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{order.interval}</Badge>
                        {order.forecastEnabled && (
                          <TrendingUp className="w-4 h-4 text-blue-500" title="Prognose aktiviert" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {order.nextExecutionDate ? 
                          formatNextExecution(order.nextExecutionDate) : 
                          'Nicht geplant'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={order.isActive ? "default" : "secondary"}>
                          {order.isActive ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                        <Badge variant={getPriorityBadgeVariant(order.priority)}>
                          {order.priority}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(order)}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => executeOrderMutation.mutate(order.id)}
                          disabled={executeOrderMutation.isPending}
                        >
                          Ausführen
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testEmailMutation.mutate({ id: order.id, email: 'test@example.com' })}
                          disabled={testEmailMutation.isPending}
                          className="text-blue-600"
                        >
                          📧 Test-E-Mail
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testExecutionMutation.mutate({ id: order.id, dryRun: true })}
                          disabled={testExecutionMutation.isPending}
                          className="text-green-600"
                        >
                          🧪 Test-Sim
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testExecutionMutation.mutate({ id: order.id, dryRun: false })}
                          disabled={testExecutionMutation.isPending}
                          className="text-orange-600"
                        >
                          🚀 Test-Real
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Konfigurationsdialog */}
      <RecurringOrderConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        recurringOrder={selectedOrder}
        suppliers={suppliers}
        warehouses={warehouses}
        onSave={(data) => saveOrderMutation.mutate(data)}
      />
    </div>
  );
}
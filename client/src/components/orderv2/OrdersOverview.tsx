import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  FileSpreadsheet, 
  Package, 
  CheckCircle2, 
  Clock,
  XCircle,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Send,
  Truck,
  ShoppingBag,
  Mail,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { orderKeys } from '@/lib/queryKeys';
import { deleteOrder } from '@/lib/api';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

// Status-Definitionen für Bestellungen mit Icons und Farben
const ORDER_STATUS: {
  [key: string]: {
    label: string; 
    color: string; 
    icon: React.ComponentType<any>
  }
} = {
  draft: { 
    label: 'Entwurf', 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
    icon: Clock
  },
  pending: { 
    label: 'Offen', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    icon: AlertCircle
  },
  processing: { 
    label: 'In Bearbeitung', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Truck
  },
  shipped: { 
    label: 'Versendet', 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
    icon: ShoppingBag
  },
  delivered: { 
    label: 'Geliefert', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Package
  },
  canceled: { 
    label: 'Storniert', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle
  },
  completed: { 
    label: 'Abgeschlossen', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: CheckCircle2
  },
  cancelled: { 
    label: 'Storniert', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle
  },
  sent: { 
    label: 'Gesendet', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Send
  },
  confirmed: { 
    label: 'Bestätigt', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: CheckCircle2
  }
};

// Diese Schnittstelle definiert, wie die Statusbasierte Weiterleitung für Bestellungen erfolgt
interface OrderRoutingOptions {
  orderId: number;
  status: string;
  action: 'edit' | 'sent' | 'goods-receipt' | 'details';
}

interface OrdersOverviewProps {
  // Allgemeine Funktionen für Bestellungen
  onSelectOrder: (orderId: number) => void;
  // Neue Routing-Funktion für statusabhängige Navigation
  onOrderAction?: (options: OrderRoutingOptions) => void;
  onStartWarehouseReceiptProcess?: (orderId: number) => void;
  onCreateNew?: () => void; // Prop für den "Neue Bestellung"-Button
  ordersData?: any[]; // Bestellungsdaten direkt von der Elternkomponente
  isLoading?: boolean; // Ladezustand von der Elternkomponente
}

const OrdersOverview: React.FC<OrdersOverviewProps> = ({ 
  onSelectOrder, 
  onOrderAction,
  onStartWarehouseReceiptProcess,
  onCreateNew,
  ordersData,
  isLoading: externalLoading
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filter-State - 'draft' mit einbeziehen
  const [searchTerm, setSearchTerm] = useState('');
  // Kein Filter als Standard, damit auch Bestellungen mit Status 'draft' angezeigt werden
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'orderDate', 
    direction: 'desc' 
  });
  
  // Mutation zum Ändern des Bestellstatus
  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, status, sentDate }: { id: number, status: string, sentDate?: Date }) => {
      return apiRequest(`/api/orders/${id}/status`, {
        status,
        ...(sentDate && { sentDate: sentDate.toISOString() })
      }, 'patch');
    },
    onSuccess: () => {
      // Cache invalidieren, damit die Änderungen sofort sichtbar sind
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      queryClient.invalidateQueries({queryKey: ['/api/orders-direct']});
      
      toast({
        title: 'Status aktualisiert',
        description: 'Der Bestellstatus wurde erfolgreich aktualisiert.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: `Beim Aktualisieren des Status ist ein Fehler aufgetreten: ${error.message || 'Unbekannter Fehler'}`,
        variant: 'destructive',
      });
    }
  });
  
  // Spezifische Mutation zum Markieren als "Versendet"
  const markAsSentMutation = useMutation({
    mutationFn: async ({ id, sentDate }: { id: number, sentDate: Date }) => {
      return changeStatusMutation.mutateAsync({ id, status: 'sent', sentDate });
    }
  });
  
  // Mutation zum Löschen von Entwurfs-Bestellungen
  const deleteOrderMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast({
        title: "Bestellung gelöscht",
        description: "Die Entwurfs-Bestellung wurde erfolgreich gelöscht."
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error?.message || "Die Bestellung konnte nicht gelöscht werden."
      });
    }
  });
  
  // Funktion zum Markieren einer Bestellung als versendet (wurde ersetzt durch handleChangeStatus)
  const handleMarkAsSent = (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    markAsSentMutation.mutate({
      id: orderId,
      sentDate: new Date()
    });
  };

  // Allgemeine Funktion zum Ändern des Status einer Bestellung
  const handleChangeStatus = (orderId: number, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Spezialfall: Bei "sent" muss ein Versanddatum gesetzt werden
    if (newStatus === 'sent') {
      markAsSentMutation.mutate({
        id: orderId,
        sentDate: new Date()
      });
    } else {
      // Für alle anderen Status-Änderungen
      changeStatusMutation.mutate({
        id: orderId, 
        status: newStatus
      });
    }
  };
  
  // Dieser Code wurde mit der obigen Implementierung zusammengeführt
  
  // Funktion, die basierend auf dem Status die korrekte Aktion bestimmt
  const getActionByOrderStatus = (status: string): 'edit' | 'sent' | 'goods-receipt' | 'details' => {
    switch (status) {
      case 'draft':
        // Entwurf: editierbar (bearbeiten)
        return 'edit';
      case 'sent':
        // Versendet: Details & E-Mail-Overview
        return 'sent';
      case 'received':
      case 'partial_received':
        // Wareneingang: zum Protokollieren neuer Wareneingänge
        return 'goods-receipt';
      default:
        // Fallback für alle anderen Statūs
        return 'details';
    }
  };
  
  // Verbesserte Abfrage für Bestellungen mit Filtern und debounce für die Suche
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  // Debounce für Suchbegriff
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms Debounce-Zeit
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Bestellungen direkt über den SQL-Endpunkt laden
  const { data: apiResponse, isLoading: queryLoading, isError, error, refetch } = useQuery({
    queryKey: ['/api/orders-direct'],
    queryFn: async () => {
      // Wenn externe Daten vorhanden sind, diese verwenden
      if (ordersData) {
        console.log("Verwende externe Bestellungsdaten:", ordersData.length, "Einträge");
        return ordersData;
      }
      
      try {
        console.log("Lade Bestellungen über direkten SQL-Endpunkt");
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const response = await fetch('/api/orders-direct', {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          },
          timeout: 180000 // 3 Minuten Timeout
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Laden der Bestellungen: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log("API-Antwort erhalten:", result);
        console.log("Type of result:", typeof result);
        console.log("Is Array:", Array.isArray(result));
        console.log("Length:", result?.length);
        
        if (Array.isArray(result)) {
          console.log("Verwende result direkt als Array mit", result.length, "Einträgen");
          return result;
        } else if (result && result.data && Array.isArray(result.data)) {
          console.log("Verwende result.data als Array mit", result.data.length, "Einträgen");
          return result.data;
        } else {
          console.warn("Unerwartetes Antwortformat:", result);
          console.warn("Gebe leeres Array zurück");
          return [];
        }
      } catch (error) {
        console.error("Fehler beim Laden der Bestellungen:", error);
        return [];
      }
    },
    refetchOnWindowFocus: false,
    refetchInterval: 60000 // Alle 60 Sekunden aktualisieren
  });
  
  // Filtern und Sortieren der Bestellungen
  const filteredOrders = React.useMemo(() => {
    if (!apiResponse) return [];
    
    let filtered = [...apiResponse];
    
    // Nach Status filtern
    if (statusFilter) {
      filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    // Nach Suchbegriff filtern
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(order => {
        return (
          (order.order_number && order.order_number.toLowerCase().includes(searchLower)) ||
          (order.supplier_name && order.supplier_name.toLowerCase().includes(searchLower)) ||
          (order.location_name && order.location_name.toLowerCase().includes(searchLower))
        );
      });
    }
    
    // Sortieren
    filtered.sort((a, b) => {
      const fieldA = a[sortBy.field] || '';
      const fieldB = b[sortBy.field] || '';
      
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        return sortBy.direction === 'asc' 
          ? fieldA.localeCompare(fieldB) 
          : fieldB.localeCompare(fieldA);
      } else {
        // Fallback für Datumsfelder oder numerische Felder
        const valA = fieldA ? new Date(fieldA).getTime() : 0;
        const valB = fieldB ? new Date(fieldB).getTime() : 0;
        
        return sortBy.direction === 'asc' ? valA - valB : valB - valA;
      }
    });
    
    return filtered;
  }, [apiResponse, statusFilter, debouncedSearchTerm, sortBy]);
  
  // Handler für Sortieränderungen
  const handleSort = (field: string) => {
    setSortBy(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  // Handler für das Aktualisieren der Tabelle
  const handleRefresh = () => {
    refetch();
  };
  
  const isLoading = externalLoading || queryLoading;
  
  return (
    <div className="space-y-4">
      {/* Header mit Suchfeld und Filtern */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex-1 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen nach Bestellnummer, Lieferant oder Lager"
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <div className="flex items-center">
                <Filter className="mr-2 h-4 w-4" />
                <span>{statusFilter ? ORDER_STATUS[statusFilter]?.label || 'Status' : 'Alle Status'}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(ORDER_STATUS).map(([key, {label}]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
            
            {onCreateNew && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={onCreateNew}
              >
                <Package className="h-4 w-4 mr-1" />
                Neue Bestellung
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            // Lade-Zustand
            <div className="p-4">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isError ? (
            // Fehler-Zustand
            <div className="p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Fehler beim Laden der Bestellungen</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.'}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Erneut versuchen
              </Button>
            </div>
          ) : filteredOrders.length === 0 ? (
            // Keine Bestellungen vorhanden
            <div className="p-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Keine Bestellungen gefunden</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {statusFilter || debouncedSearchTerm 
                  ? 'Keine Bestellungen entsprechen den Filterkriterien.' 
                  : 'Es wurden noch keine Bestellungen erstellt.'}
              </p>
              {onCreateNew && (
                <Button onClick={onCreateNew}>
                  <Package className="h-4 w-4 mr-2" />
                  Neue Bestellung erstellen
                </Button>
              )}
            </div>
          ) : (
            // Bestellungen-Tabelle
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="w-[150px] cursor-pointer"
                      onClick={() => handleSort('order_number')}
                    >
                      <div className="flex items-center">
                        Bestellnr.
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('supplier_name')}
                    >
                      <div className="flex items-center">
                        Lieferant
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hidden md:table-cell"
                      onClick={() => handleSort('location_name')}
                    >
                      <div className="flex items-center">
                        Lager
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('order_date')}
                    >
                      <div className="flex items-center">
                        Datum
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">
                        Status
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer text-right hidden md:table-cell"
                      onClick={() => handleSort('total_amount')}
                    >
                      <div className="flex items-center justify-end">
                        Betrag
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      Aktionen
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    // Statusdefinition ermitteln oder Fallback
                    const statusInfo = ORDER_STATUS[order.status] || { 
                      label: order.status, 
                      color: 'bg-gray-100 text-gray-800',
                      icon: AlertCircle
                    };
                    const StatusIcon = statusInfo.icon;
                    
                    // Formatierung des Datums
                    let formattedDate = 'Kein Datum';
                    try {
                      if (order.order_date) {
                        formattedDate = format(
                          new Date(order.order_date), 
                          'dd.MM.yyyy', 
                          { locale: de }
                        );
                      }
                    } catch (e) {
                      console.error("Fehler beim Formatieren des Datums:", e);
                    }
                    
                    return (
                      <TableRow 
                        key={order.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          // Statusbasierte Navigation direkt implementiert
                          if (order.status === 'draft') {
                            window.location.href = `/bestellungen/workflow?step=sendOrder&orderId=${order.id}`;
                          } else if (order.status === 'sent' || order.status === 'partially_received') {
                            window.location.href = `/bestellungen/${order.id}/wareneingang`;
                          } else {
                            window.location.href = `/bestellungen/${order.id}`;
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          {order.order_number || 'Unbekannt'}
                        </TableCell>
                        <TableCell className="font-medium text-primary">
                          {order.supplier_name || 'Unbekannter Lieferant'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {order.warehouse_name || order.location_name || 'Unbekanntes Lager'}
                        </TableCell>
                        <TableCell>
                          {formattedDate}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={`${statusInfo.color} capitalize flex w-fit items-center gap-1`}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                            <span>{statusInfo.label}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {order.total_amount !== undefined && order.total_amount !== null
                            ? `${Number(order.total_amount).toLocaleString('de-DE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })} €`
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="sr-only">Aktionen</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Statusbasiertes Routing entsprechend der Anforderungen
                                  if (onOrderAction) {
                                    // Neue smarte Routing-Funktion
                                    const action = getActionByOrderStatus(order.status);
                                    onOrderAction({
                                      orderId: order.id,
                                      status: order.status,
                                      action
                                    });
                                  } else {
                                    // Navigation zur Bestelldetails
                                    window.location.href = `/bestellungen/${order.id}`;
                                  }
                                }}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                <span>Details anzeigen</span>
                              </DropdownMenuItem>
                              
                              {/* Status-abhängige Aktionen im Dropdown-Menü */}
                              {order.status === 'draft' && (
                                <>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={(e) => handleChangeStatus(order.id, 'sent', e)}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    <span>Als „Versendet" markieren</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="cursor-pointer text-red-600 hover:text-red-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const confirmDelete = window.confirm(
                                        `Möchten Sie die Entwurfs-Bestellung "${order.order_number || 'Unbekannt'}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
                                      );
                                      if (confirmDelete) {
                                        deleteOrderMutation.mutate(order.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Löschen</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              
                              {order.status === 'sent' && (
                                <>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={(e) => handleChangeStatus(order.id, 'draft', e)}
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    <span>Zurück auf „Entwurf" setzen</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onOrderAction) {
                                        onOrderAction({
                                          orderId: order.id,
                                          status: order.status,
                                          action: 'goods-receipt'
                                        });
                                      } else if (onStartWarehouseReceiptProcess) {
                                        onStartWarehouseReceiptProcess(order.id);
                                      }
                                    }}
                                  >
                                    <Package className="mr-2 h-4 w-4" />
                                    <span>Wareneingang starten</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              
                              {/* Bei Wareneingang kann man wieder zurück zu Versendet oder komplett abschließen */}
                              {(order.status === 'received' || order.status === 'partial_received') && (
                                <>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={(e) => handleChangeStatus(order.id, 'sent', e)}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    <span>Zurück auf „Versendet" setzen</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={(e) => handleChangeStatus(order.id, 'completed', e)}
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    <span>Als „Abgeschlossen" markieren</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              
                              {/* Alter MarkAsSent Menüeintrag entfernt, jetzt durch handleChangeStatus in neuer Implementierung ersetzt */}
                              
                              {/* Alter Wareneingang-Menüeintrag entfernt, jetzt durch neue Status-basierte Funktionen ersetzt */}
                              
                              {/* E-Mail-Versand Option, nur für bestimmte Status */}
                              {['draft', 'sent'].includes(order.status) && (
                                <DropdownMenuItem 
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Navigation zur E-Mail-Seite
                                    window.location.href = `/bestellungen/${order.id}`;
                                  }}
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  <span>E-Mail senden</span>
                                </DropdownMenuItem>
                              )}
                              
                              {/* Weitere Optionen hier */}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrdersOverview;
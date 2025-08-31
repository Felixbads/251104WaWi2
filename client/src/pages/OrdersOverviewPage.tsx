import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useLocation } from 'wouter';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Package, 
  CheckCircle2, 
  Clock,
  XCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Send,
  Truck,
  ShoppingBag,
  Mail,
  Plus,
  Eye,
  Edit,
  PackageCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { orderKeys } from '@/lib/queryKeys';

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    icon: React.ComponentType<any>;
    nextAction: 'shipping' | 'goods-receipt' | 'details';
  }
} = {
  draft: { 
    label: 'Entwurf', 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
    icon: Clock,
    nextAction: 'shipping'
  },
  pending: { 
    label: 'Offen', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    icon: AlertCircle,
    nextAction: 'shipping'
  },
  sent: { 
    label: 'Gesendet', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Send,
    nextAction: 'goods-receipt'
  },
  processing: { 
    label: 'In Bearbeitung', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Truck,
    nextAction: 'goods-receipt'
  },
  shipped: { 
    label: 'Versendet', 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
    icon: ShoppingBag,
    nextAction: 'goods-receipt'
  },
  delivered: { 
    label: 'Geliefert', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Package,
    nextAction: 'goods-receipt'
  },
  completed: { 
    label: 'Abgeschlossen', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: CheckCircle2,
    nextAction: 'details'
  },
  canceled: { 
    label: 'Storniert', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle,
    nextAction: 'details'
  },
  cancelled: { 
    label: 'Storniert', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle,
    nextAction: 'details'
  }
};

const OrdersOverviewPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  
  // Filter-State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'order_date', 
    direction: 'desc' 
  });
  
  // Debounced search
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Bestellungen laden
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/api/orders-direct'],
    queryFn: async () => {
      try {
        console.log("Lade Bestellungen über direkten SQL-Endpunkt");
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const response = await fetch('/api/orders-direct', {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          },
          timeout: 180000
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Laden der Bestellungen: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log("Bestellungen geladen:", result?.length || 0, "Einträge");
        
        if (Array.isArray(result)) {
          return result;
        } else if (result && result.data && Array.isArray(result.data)) {
          return result.data;
        } else {
          console.warn("Unerwartetes Antwortformat:", result);
          return [];
        }
      } catch (error) {
        console.error("Fehler beim Laden der Bestellungen:", error);
        return [];
      }
    },
    refetchOnWindowFocus: false,
    refetchInterval: 60000
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
  
  // Filtern und Sortieren der Bestellungen
  const filteredOrders = React.useMemo(() => {
    console.log("🔍 filteredOrders Debug:", {
      apiResponse: apiResponse?.length,
      statusFilter,
      debouncedSearchTerm,
      sortBy
    });
    
    if (!apiResponse) {
      console.log("❌ Keine apiResponse vorhanden");
      return [];
    }
    
    let filtered = [...apiResponse];
    console.log("✅ Initial filtered array:", filtered.length);
    
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
  
  // Handler für Bestellungsauswahl mit intelligenter Navigation
  const handleOrderClick = (order: any) => {
    const orderStatus = order.status;
    const statusInfo = ORDER_STATUS[orderStatus];
    
    if (statusInfo) {
      switch (statusInfo.nextAction) {
        case 'shipping':
          // Für nicht versendete Bestellungen: zum Versand
          navigate(`/bestellungen/workflow?step=sendOrder&orderId=${order.id}`);
          break;
        case 'goods-receipt':
          // Für versendete Bestellungen: zum Wareneingang
          navigate(`/bestellungen/workflow?step=goodsReceipt&orderId=${order.id}`);
          break;
        default:
          // Für abgeschlossene/stornierte Bestellungen: zur Übersicht
          navigate(`/bestellungen/workflow?step=viewOrder&orderId=${order.id}`);
      }
    } else {
      // Fallback: zur allgemeinen Übersicht
      navigate(`/bestellungen/workflow?step=viewOrder&orderId=${order.id}`);
    }
  };
  
  // Handler für Status-Änderungen
  const handleChangeStatus = (orderId: number, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (newStatus === 'sent') {
      changeStatusMutation.mutate({
        id: orderId,
        status: newStatus,
        sentDate: new Date()
      });
    } else {
      changeStatusMutation.mutate({
        id: orderId, 
        status: newStatus
      });
    }
  };
  
  const handleRefresh = () => {
    refetch();
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bestellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie alle Bestellungen und deren Status
          </p>
        </div>
        <Button 
          onClick={() => navigate('/bestellungen/workflow?step=mode')}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Neue Bestellung
        </Button>
      </div>
      
      {/* Filter und Suche */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        </div>
      </div>
      
      {/* Bestellungen-Tabelle */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
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
            <div className="p-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Keine Bestellungen gefunden</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {statusFilter || debouncedSearchTerm 
                  ? 'Keine Bestellungen entsprechen den Filterkriterien.' 
                  : 'Es wurden noch keine Bestellungen erstellt.'}
              </p>
              <Button onClick={() => navigate('/bestellungen/workflow?step=mode')}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Bestellung erstellen
              </Button>
            </div>
          ) : (
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
                    <TableHead className="text-right">
                      Nächste Aktion
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      Aktionen
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const statusInfo = ORDER_STATUS[order.status] || { 
                      label: order.status, 
                      color: 'bg-gray-100 text-gray-800',
                      icon: AlertCircle,
                      nextAction: 'details' as const
                    };
                    const StatusIcon = statusInfo.icon;
                    
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
                      console.warn('Fehler beim Formatieren des Datums:', order.order_date, e);
                    }
                    
                    const getNextActionLabel = (action: string) => {
                      switch (action) {
                        case 'shipping': return 'Versand';
                        case 'goods-receipt': return 'Wareneingang';
                        default: return 'Details';
                      }
                    };
                    
                    const getNextActionIcon = (action: string) => {
                      switch (action) {
                        case 'shipping': return Send;
                        case 'goods-receipt': return PackageCheck;
                        default: return Eye;
                      }
                    };
                    
                    const NextActionIcon = getNextActionIcon(statusInfo.nextAction);
                    
                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleOrderClick(order)}
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
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="flex w-fit items-center gap-1 ml-auto">
                            <NextActionIcon className="h-3.5 w-3.5" />
                            {getNextActionLabel(statusInfo.nextAction)}
                          </Badge>
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
                                  handleOrderClick(order);
                                }}
                              >
                                <NextActionIcon className="mr-2 h-4 w-4" />
                                {getNextActionLabel(statusInfo.nextAction)}
                              </DropdownMenuItem>
                              
                              {order.status !== 'sent' && order.status !== 'completed' && (
                                <DropdownMenuItem 
                                  className="cursor-pointer"
                                  onClick={(e) => handleChangeStatus(order.id, 'sent', e)}
                                  disabled={changeStatusMutation.isPending}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Als gesendet markieren
                                </DropdownMenuItem>
                              )}
                              
                              {order.status !== 'completed' && order.status !== 'cancelled' && (
                                <DropdownMenuItem 
                                  className="cursor-pointer"
                                  onClick={(e) => handleChangeStatus(order.id, 'completed', e)}
                                  disabled={changeStatusMutation.isPending}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Als abgeschlossen markieren
                                </DropdownMenuItem>
                              )}
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

export default OrdersOverviewPage;
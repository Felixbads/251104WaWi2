import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  RefreshCw,
  MoreHorizontal,
  Send,
  Truck,
  ShoppingBag,
  Mail
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Status-Mapping für Bestellungen
const orderStatusMap = {
  draft: { label: 'Entwurf', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
  pending: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' },
  shipped: { label: 'Versandt', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' },
  delivered: { label: 'Geliefert', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300' },
  completed: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
  cancelled: { label: 'Storniert', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' },
  sent: { label: 'Gesendet', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
  confirmed: { label: 'Bestätigt', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' }
};

interface OrdersOverviewProps {
  onSelectOrder: (orderId: number) => void;
  onStartWarehouseReceiptProcess: (orderId: number) => void;
  onStartNewOrder: () => void;
}

const OrdersOverview: React.FC<OrdersOverviewProps> = ({ 
  onSelectOrder, 
  onStartWarehouseReceiptProcess,
  onStartNewOrder
}) => {
  const { toast } = useToast();
  
  // Filter-State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'orderDate', 
    direction: 'desc' 
  });
  
  // Mutation zum Ändern des Bestellstatus auf "versendet"
  const markAsSentMutation = useMutation({
    mutationFn: (orderData: { id: number, sentDate: Date }) => {
      return apiRequest(`/api/orders/${orderData.id}/mark-sent`, orderData, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Bestellung als versendet markiert',
        description: 'Die Bestellung wurde erfolgreich als versendet markiert.',
      });
      refetch(); // Aktualisiere die Liste der Bestellungen
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Markieren der Bestellung',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  });
  
  // Funktion zum Markieren einer Bestellung als versendet
  const handleMarkAsSent = (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    markAsSentMutation.mutate({
      id: orderId,
      sentDate: new Date()
    });
  };
  
  // Abfrage für Bestellungen
  const { data: ordersResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/orders'],
    queryFn: async () => {
      const response = await fetch('/api/orders');
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bestellungen');
      }
      return response.json();
    }
  });
  
  // Extrahiere das Datenarray aus der Antwort
  const orders = ordersResponse?.data || [];
  
  // Filterfunktion für Bestellungen
  const filteredOrders = React.useMemo(() => {
    if (!orders || !Array.isArray(orders)) return [];
    
    return orders.filter((order: any) => {
      // Suche
      const searchFields = [
        order.orderNumber,
        order.supplierName,
        order.warehouseName || order.locationName,
        order.notes
      ].filter(Boolean).join(' ').toLowerCase();
      
      const matchesSearch = !searchTerm || searchFields.includes(searchTerm.toLowerCase());
      
      // Status-Filter
      const matchesStatus = !statusFilter || order.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);
  
  // Sortierfunktion für Bestellungen
  const sortedOrders = React.useMemo(() => {
    if (!filteredOrders.length) return [];
    
    return [...filteredOrders].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy.field) {
        case 'orderDate':
          aValue = new Date(a.orderDate || a.createdAt || 0).getTime();
          bValue = new Date(b.orderDate || b.createdAt || 0).getTime();
          break;
        case 'supplierName':
          aValue = a.supplierName?.toLowerCase() || '';
          bValue = b.supplierName?.toLowerCase() || '';
          break;
        case 'warehouseName':
          aValue = (a.warehouseName || a.locationName || '').toLowerCase();
          bValue = (b.warehouseName || b.locationName || '').toLowerCase();
          break;
        case 'totalAmount':
          aValue = a.totalAmount || 0;
          bValue = b.totalAmount || 0;
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        default:
          aValue = a.orderDate || a.createdAt || 0;
          bValue = b.orderDate || b.createdAt || 0;
      }
      
      const sortOrder = sortBy.direction === 'asc' ? 1 : -1;
      
      if (aValue < bValue) return -1 * sortOrder;
      if (aValue > bValue) return 1 * sortOrder;
      return 0;
    });
  }, [filteredOrders, sortBy]);
  
  // Sortierung umschalten
  const toggleSort = (field: string) => {
    if (sortBy.field === field) {
      setSortBy({
        field,
        direction: sortBy.direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setSortBy({ field, direction: 'asc' });
    }
  };
  
  // Formatierungsfunktionen
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, 'dd.MM.yyyy', { locale: de });
    } catch (e) {
      return 'Ungültiges Datum';
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  };
  
  // Status-Badge Komponente
  const OrderStatusBadge = ({ status }: { status: string }) => {
    const statusConfig = orderStatusMap[status as keyof typeof orderStatusMap] || 
                        { label: status, color: 'bg-gray-100 text-gray-800' };
    
    return (
      <Badge variant="outline" className={`font-medium ${statusConfig.color}`}>
        {statusConfig.label}
      </Badge>
    );
  };
  
  // Leere Tabellenzustand
  const EmptyState = () => (
    <div className="text-center py-8">
      <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground opacity-30" />
      <h3 className="mt-4 text-lg font-medium">Keine Bestellungen gefunden</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        Es konnten keine Bestellungen mit den aktuellen Filterkriterien gefunden werden.
      </p>
      <Button onClick={() => {
        setSearchTerm('');
        setStatusFilter(null);
      }} variant="outline" className="mt-4">
        Filter zurücksetzen
      </Button>
    </div>
  );
  
  return (
    <div className="space-y-4">
      {/* Desktop-Ansicht: Filter-Leiste */}
      <div className="hidden md:flex justify-between items-center gap-4 mb-4">
        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter || 'all'}
            onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="draft">Entwurf</SelectItem>
              <SelectItem value="pending">In Bearbeitung</SelectItem>
              <SelectItem value="shipped">Versandt</SelectItem>
              <SelectItem value="delivered">Geliefert</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
              <SelectItem value="cancelled">Storniert</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={() => refetch()} size="icon" title="Aktualisieren">
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button onClick={onStartNewOrder}>
            Neue Bestellung
          </Button>
        </div>
      </div>
      
      {/* Mobile-Ansicht: Filter-Leiste */}
      <div className="flex flex-col md:hidden gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter || 'all'}
            onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="draft">Entwurf</SelectItem>
              <SelectItem value="pending">In Bearbeitung</SelectItem>
              <SelectItem value="shipped">Versandt</SelectItem>
              <SelectItem value="delivered">Geliefert</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
              <SelectItem value="cancelled">Storniert</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={() => refetch()} size="icon" title="Aktualisieren">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        <Button onClick={onStartNewOrder} className="w-full">
          Neue Bestellung
        </Button>
      </div>
      
      {/* Desktop-Tabelle */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer"
                    onClick={() => toggleSort('orderDate')}
                  >
                    <div className="flex items-center">
                      Datum
                      {sortBy.field === 'orderDate' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer"
                    onClick={() => toggleSort('supplierName')}
                  >
                    <div className="flex items-center">
                      Lieferant
                      {sortBy.field === 'supplierName' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer"
                    onClick={() => toggleSort('warehouseName')}
                  >
                    <div className="flex items-center">
                      Lager
                      {sortBy.field === 'warehouseName' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer text-right"
                    onClick={() => toggleSort('totalAmount')}
                  >
                    <div className="flex items-center justify-end">
                      Wert netto
                      {sortBy.field === 'totalAmount' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer"
                    onClick={() => toggleSort('status')}
                  >
                    <div className="flex items-center">
                      Status
                      {sortBy.field === 'status' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-rose-500">
                      <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                      <p>Fehler beim Laden der Bestellungen</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                        Erneut versuchen
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map((order: any) => (
                    <TableRow 
                      key={order.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectOrder(order.id)}
                    >
                      <TableCell className="font-medium">
                        {order.orderDate || order.createdAt
                          ? formatDate(order.orderDate || order.createdAt)
                          : 'Kein Datum'}
                      </TableCell>
                      <TableCell>
                        {order.supplierName || 'Unbekannter Lieferant'}
                      </TableCell>
                      <TableCell>
                        {order.warehouseName || order.locationName || 'Unbekanntes Lager'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {order.totalAmount ? formatCurrency(order.totalAmount) : '—'}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Aktionen</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              onSelectOrder(order.id);
                            }}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Details anzeigen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {order.status === 'draft' && (
                              <DropdownMenuItem 
                                onClick={(e) => handleMarkAsSent(order.id, e)}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Als versendet markieren
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartWarehouseReceiptProcess(order.id);
                              }}
                              disabled={!['shipped', 'delivered'].includes(order.status)}
                            >
                              <Package className="mr-2 h-4 w-4" />
                              Wareneingang erfassen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      
      {/* Mobile Kartenansicht */}
      <div className="md:hidden space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-28 mb-1" />
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="pb-3">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-0">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-8" />
              </CardFooter>
            </Card>
          ))
        ) : error ? (
          <Card>
            <CardContent className="text-center py-10 text-rose-500">
              <AlertCircle className="mx-auto h-8 w-8 mb-2" />
              <p>Fehler beim Laden der Bestellungen</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                Erneut versuchen
              </Button>
            </CardContent>
          </Card>
        ) : sortedOrders.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState />
            </CardContent>
          </Card>
        ) : (
          sortedOrders.map((order: any) => (
            <Card 
              key={order.id} 
              className="cursor-pointer hover:bg-accent/5"
              onClick={() => onSelectOrder(order.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base">
                    {order.orderNumber || `Bestellung #${order.id}`}
                  </CardTitle>
                  <OrderStatusBadge status={order.status} />
                </div>
                <CardDescription>
                  {order.orderDate || order.createdAt
                    ? formatDate(order.orderDate || order.createdAt)
                    : 'Kein Datum'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Lieferant</p>
                    <p className="text-sm font-medium truncate">
                      {order.supplierName || 'Unbekannt'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lager</p>
                    <p className="text-sm font-medium truncate">
                      {order.warehouseName || order.locationName || 'Unbekannt'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Wert netto</p>
                    <p className="text-sm font-medium">
                      {order.totalAmount ? formatCurrency(order.totalAmount) : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-0">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOrder(order.id);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Details
                </Button>
                {order.status === 'draft' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleMarkAsSent(order.id, e)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Versenden
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!['shipped', 'delivered'].includes(order.status)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartWarehouseReceiptProcess(order.id);
                    }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Wareneingang
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default OrdersOverview;
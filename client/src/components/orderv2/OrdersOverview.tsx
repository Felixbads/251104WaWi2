import React, { useState, useEffect } from 'react';
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
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Send,
  Truck,
  ShoppingBag,
  Mail
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
import { Skeleton } from "@/components/ui/skeleton";

// Status-Mapping für Bestellungen
// Einheitliches Status-Mapping für die gesamte Anwendung mit Icons
const orderStatusMap = {
  // Aktuelle API-Status
  open: { 
    label: 'Offen', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Clock
  },
  ordered: { 
    label: 'Bestellt', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    icon: Package
  },
  partial: { 
    label: 'Teilgeliefert', 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
    icon: Truck
  },
  delivered: { 
    label: 'Geliefert', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: CheckCircle2
  },
  canceled: { 
    label: 'Storniert', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle
  },
  
  // Legacy-Status für Abwärtskompatibilität
  draft: { 
    label: 'Entwurf', 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    icon: Mail
  },
  pending: { 
    label: 'In Bearbeitung', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    icon: Clock
  },
  shipped: { 
    label: 'Versandt', 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
    icon: Truck
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

interface OrdersOverviewProps {
  onSelectOrder: (orderId: number) => void;
  onStartWarehouseReceiptProcess?: (orderId: number) => void;
  onCreateNew?: () => void; // Prop für den "Neue Bestellung"-Button
}

const OrdersOverview: React.FC<OrdersOverviewProps> = ({ 
  onSelectOrder, 
  onStartWarehouseReceiptProcess,
  onCreateNew
}) => {
  const { toast } = useToast();
  
  // Filter-State - 'draft' mit einbeziehen
  const [searchTerm, setSearchTerm] = useState('');
  // Kein Filter als Standard, damit auch Bestellungen mit Status 'draft' angezeigt werden
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
  
  // Verbesserte Abfrage für Bestellungen mit Filtern und debounce für die Suche
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  // Debounce für Suchbegriff
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms Debounce-Zeit
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Abfrage für Bestellungen mit Filtern
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: orderKeys.list({ 
      status: statusFilter ? [statusFilter] : ['draft', 'sent', 'delivered', 'canceled'], 
      search: debouncedSearchTerm
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('sortField', sortBy.field);
      params.append('sortOrder', sortBy.direction);
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
      
      return apiRequest(`/api/orders?${params.toString()}`, undefined, 'get');
    }
  });
  
  // Daten aus der API-Antwort extrahieren
  const data = apiResponse?.data;
  
  // Sortierfunktion
  const handleSort = (field: string) => {
    setSortBy({
      field,
      direction: sortBy.field === field && sortBy.direction === 'asc' ? 'desc' : 'asc'
    });
  };
  
  // Funktionen für Datumsformatierung und Währungsformatierung
  const formatDate = (date: string | null) => {
    if (!date) return 'Kein Datum';
    try {
      return format(parseISO(date), 'dd.MM.yyyy', { locale: de });
    } catch {
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
  
  // Status-Badge Komponente mit Icons
  const OrderStatusBadge = ({ status }: { status: string }) => {
    const statusConfig = orderStatusMap[status as keyof typeof orderStatusMap] || 
                        { label: status, color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
    
    const IconComponent = statusConfig.icon;
    
    return (
      <Badge variant="outline" className={`font-medium ${statusConfig.color} flex items-center gap-1.5 py-1 px-2`}>
        {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
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
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bestellungen</h1>
          
          {/* Nur einen Button für neue Bestellung anzeigen */}
          {onCreateNew && (
            <Button onClick={onCreateNew} className="whitespace-nowrap">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Neue Bestellung
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mb-4">
          Verwalten Sie Ihre Bestellungen und überwachen Sie deren Status
        </p>
        
        {/* Filter-Leiste für Desktop und Mobile */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Suchen nach Bestellnummer, Lieferant oder Produktname..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex gap-2">
            <Select
              value={statusFilter || 'all'}
              onValueChange={(value) => {
                // Sofort das Filter anwenden
                setStatusFilter(value === 'all' ? null : value);
                // Sofort aktualisieren
                setTimeout(() => refetch(), 10);
              }}
            >
              <SelectTrigger className="w-[180px] bg-background">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status filtern" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
                <SelectItem value="sent">Gesendet</SelectItem>
                <SelectItem value="delivered">Geliefert</SelectItem>
                <SelectItem value="canceled">Storniert</SelectItem>
                {/* Weitere Status entsprechend der API-Anforderungen */}
              </SelectContent>
            </Select>
            
            <Button variant="outline" onClick={() => refetch()} size="icon" title="Aktualisieren">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Desktop-Tabelle */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('orderNumber')}
                    >
                      Nr.
                      {sortBy.field === 'orderNumber' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('supplierName')}
                    >
                      Lieferant
                      {sortBy.field === 'supplierName' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('warehouseName')}
                    >
                      Lager
                      {sortBy.field === 'warehouseName' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      {sortBy.field === 'status' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('orderDate')}
                    >
                      Bestelldatum
                      {sortBy.field === 'orderDate' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-1 px-0 font-medium"
                      onClick={() => handleSort('totalAmount')}
                    >
                      Betrag
                      {sortBy.field === 'totalAmount' && 
                        <ArrowUpDown className={`h-3 w-3 ${sortBy.direction === 'asc' ? 'rotate-180' : ''}`} />
                      }
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      <AlertCircle className="mx-auto h-6 w-6 text-destructive mb-2" />
                      <p className="text-destructive font-medium">Fehler beim Laden der Bestellungen</p>
                      <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
                      <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-2">
                        Erneut versuchen
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.map((order: any) => (
                    <TableRow 
                      key={order.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectOrder(order.id)}
                    >
                      <TableCell className="font-medium">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>{order.supplierName}</TableCell>
                      <TableCell>{order.warehouseName}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <OrderStatusBadge status={order.status} />
                          {order.priority === 'high' && (
                            <span className="ml-2 bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded-full flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Dringend
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(order.orderDate)}</TableCell>
                      <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* Verbesserte und konsistentere Bestellaktionen basierend auf Status */}
                          {order.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="E-Mail senden"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectOrder(order.id);
                              }}
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              Senden
                            </Button>
                          )}
                          
                          {order.status === 'sent' && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Wareneingang buchen"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onStartWarehouseReceiptProcess) {
                                  onStartWarehouseReceiptProcess(order.id);
                                }
                              }}
                            >
                              <Truck className="h-4 w-4 mr-1" />
                              Eingang
                            </Button>
                          )}
                          
                          {order.status === 'ordered' && onStartWarehouseReceiptProcess && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Wareneingang buchen"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartWarehouseReceiptProcess(order.id);
                              }}
                            >
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/orderDetail/${order.id}`, '_blank');
                                }}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Öffnen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/api/orders/${order.id}/pdf`, '_blank');
                                }}
                              >
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                PDF anzeigen
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `/sendOrderEmail/${order.id}`;
                              }}>
                                <Mail className="mr-2 h-4 w-4" />
                                E-Mail senden
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      
      {/* Mobile-Ansicht: Karten */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-5 w-36" />
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            </Card>
          ))
        ) : isError ? (
          <Card className="p-4">
            <div className="text-center py-4">
              <AlertCircle className="mx-auto h-6 w-6 text-destructive mb-2" />
              <p className="text-destructive font-medium">Fehler beim Laden der Bestellungen</p>
              <p className="text-muted-foreground text-sm mb-2">{(error as Error).message}</p>
              <Button onClick={() => refetch()} variant="outline" size="sm">
                Erneut versuchen
              </Button>
            </div>
          </Card>
        ) : data?.length === 0 ? (
          <Card className="p-4">
            <EmptyState />
          </Card>
        ) : (
          data?.map((order: any) => (
            <Card 
              key={order.id} 
              className="overflow-hidden"
              onClick={() => onSelectOrder(order.id)}
            >
              <CardContent className="p-0">
                <div className="p-4 cursor-pointer hover:bg-muted/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium">{order.orderNumber}</div>
                      <div className="text-sm text-muted-foreground">{order.supplierName}</div>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <div>{order.warehouseName}</div>
                    <div className="font-medium">{formatCurrency(order.totalAmount)}</div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground mt-1">
                    Bestellt am {formatDate(order.orderDate)}
                  </div>
                </div>
                
                <div className="border-t border-border p-2 bg-muted/50 flex justify-end gap-1">
                  {order.status === 'open' && (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Als versendet markieren"
                      onClick={(e) => handleMarkAsSent(order.id, e)}
                      disabled={markAsSentMutation.isPending}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Versandt
                    </Button>
                  )}
                  
                  {order.status === 'ordered' && onStartWarehouseReceiptProcess && (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Wareneingang buchen"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartWarehouseReceiptProcess(order.id);
                      }}
                    >
                      <Truck className="h-4 w-4 mr-1" />
                      Wareneingang
                    </Button>
                  )}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/orderDetail/${order.id}`, '_blank');
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Öffnen
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/orders/${order.id}/pdf`, '_blank');
                        }}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        PDF anzeigen
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/sendOrderEmail/${order.id}`;
                      }}>
                        <Mail className="mr-2 h-4 w-4" />
                        E-Mail senden
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default OrdersOverview;
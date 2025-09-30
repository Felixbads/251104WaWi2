import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Package, AlertCircle, TrendingDown, DollarSign } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ExpiredProductsListProps = {
  warehouseId?: number;
};

interface ExpiredProduct {
  id: number;
  batch_number: string;
  product_name: string;
  product_sku?: string;
  quantity_expired: number;
  original_quantity: number;
  expiry_date: string;
  received_date?: string;
  expired_at: string;
  supplier_batch_number?: string;
  supplier_name?: string;
  location_in_warehouse?: string;
  reason: string;
  notes?: string;
  estimated_value?: number;
  processed_by_name?: string;
}

interface ExpiredProductsResponse {
  success: boolean;
  data: {
    items: ExpiredProduct[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    stats: {
      totalEntries: number;
      totalQuantityExpired: number;
      totalEstimatedValue: number;
      uniqueProducts: number;
      earliestExpiry?: string;
      latestExpiry?: string;
    };
  };
  message: string;
}

/**
 * ExpiredProductsList Komponente
 * 
 * Diese Komponente zeigt abgelaufene Produktchargen und deren Ausbuchungsdetails an.
 */
export default function ExpiredProductsList({ warehouseId }: ExpiredProductsListProps) {
  const { data, isLoading, error } = useQuery<ExpiredProductsResponse>({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'expired-products'],
    enabled: !!warehouseId,
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getReasonBadge = (reason: string) => {
    const variants: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
      'automatic_expiry': { label: 'Automatisch abgelaufen', variant: 'destructive' },
      'manual': { label: 'Manuell ausgebucht', variant: 'secondary' },
      'damaged': { label: 'Beschädigt', variant: 'destructive' },
      'recalled': { label: 'Rückruf', variant: 'destructive' },
    };
    
    const info = variants[reason] || { label: reason, variant: 'outline' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  if (isLoading) {
    return (
      <Card data-testid="expired-products-loading">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-muted-foreground" />
            Abgelaufene Produkte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Fehler beim Laden der abgelaufenen Produkte';
    return (
      <Card data-testid="expired-products-error">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-muted-foreground" />
            Abgelaufene Produkte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 border border-destructive rounded-md bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <span className="text-sm text-destructive font-medium">Fehler beim Laden der Daten</span>
              <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = data?.data.stats;
  const items = data?.data.items || [];

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-entries">
          <CardHeader className="pb-2">
            <CardDescription>Gesamt Einträge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold" data-testid="stat-total-entries-value">{stats?.totalEntries || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-quantity-expired">
          <CardHeader className="pb-2">
            <CardDescription>Ausgebuchte Menge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <span className="text-2xl font-bold" data-testid="stat-quantity-expired-value">{stats?.totalQuantityExpired || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-unique-products">
          <CardHeader className="pb-2">
            <CardDescription>Betroffene Produkte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold" data-testid="stat-unique-products-value">{stats?.uniqueProducts || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-estimated-value">
          <CardHeader className="pb-2">
            <CardDescription>Geschätzter Wert</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold" data-testid="stat-estimated-value-amount">
                {stats?.totalEstimatedValue && stats.totalEstimatedValue > 0 
                  ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(stats.totalEstimatedValue)
                  : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card data-testid="expired-products-table">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-muted-foreground" />
            Abgelaufene Produkte (<span data-testid="expired-products-count">{items.length}</span>)
          </CardTitle>
          <CardDescription>
            Automatisch ausgebuchte Produkte nach Ablauf des Mindesthaltbarkeitsdatums
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12" data-testid="expired-products-empty">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Keine abgelaufenen Produkte gefunden</p>
              <p className="text-sm text-muted-foreground mt-2">
                Alle Produkte sind aktuell im gültigen Zeitraum
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Chargennummer</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead>MHD</TableHead>
                    <TableHead>Ausgebucht am</TableHead>
                    <TableHead>Grund</TableHead>
                    <TableHead>Lagerort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} data-testid={`expired-product-row-${item.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          {item.product_sku && (
                            <div className="text-xs text-muted-foreground">SKU: {item.product_sku}</div>
                          )}
                          {item.supplier_name && (
                            <div className="text-xs text-muted-foreground">{item.supplier_name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-mono text-sm">{item.batch_number}</div>
                          {item.supplier_batch_number && (
                            <div className="text-xs text-muted-foreground">
                              Lieferant: {item.supplier_batch_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <div className="font-bold text-red-600">-{item.quantity_expired}</div>
                          <div className="text-xs text-muted-foreground">
                            von {item.original_quantity}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(item.expiry_date)}</div>
                        {item.received_date && (
                          <div className="text-xs text-muted-foreground">
                            Eingang: {formatDate(item.received_date)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDateTime(item.expired_at)}</div>
                        {item.processed_by_name && (
                          <div className="text-xs text-muted-foreground">
                            von {item.processed_by_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{getReasonBadge(item.reason)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {item.location_in_warehouse || '—'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
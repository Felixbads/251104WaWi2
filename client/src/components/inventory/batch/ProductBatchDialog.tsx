import { useQuery } from '@tanstack/react-query';
import { 
  Package, Loader2, Calendar, Clock
} from 'lucide-react';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';

interface ProductBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: number, warehouseId: number, name: string } | null;
}

export default function ProductBatchDialog({
  open,
  onOpenChange,
  product
}: ProductBatchDialogProps) {
  // Laden der Batches für das ausgewählte Produkt
  const { data: productBatches = [], isLoading: isBatchesLoading } = useQuery<any[]>({
    queryKey: ['/api/product-batches/product', product?.id || 0, 'warehouse', product?.warehouseId || 0],
    queryFn: async ({ queryKey }) => {
      const [_, productId, __, warehouseId] = queryKey;
      if (!productId || !warehouseId) return [];
      const response = await fetch(`/api/product-batches/product/${productId}/warehouse/${warehouseId}`);
      if (!response.ok) throw new Error('Failed to fetch product batches');
      return response.json();
    },
    enabled: !!product && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chargen für {product?.name}</DialogTitle>
          <DialogDescription>
            Übersicht aller Chargen im Lager mit Ablaufdaten (MHD)
          </DialogDescription>
        </DialogHeader>
        
        {isBatchesLoading ? (
          <div className="py-6 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : productBatches.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">Keine Chargen gefunden</h3>
            <p className="text-muted-foreground text-sm">
              Für dieses Produkt sind keine Chargen im Lager vorhanden.
            </p>
          </div>
        ) : (
          <div className="rounded-md border mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chargen-Nr.</TableHead>
                  <TableHead>Eingangsdatum</TableHead>
                  <TableHead>MHD</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productBatches.map((batch: any) => {
                  const isExpired = new Date(batch.expiryDate) < new Date();
                  const isExpiringSoon = !isExpired && 
                    new Date(batch.expiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                  
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                      <TableCell>
                        {batch.receivedDate ? (
                          <div className="flex items-center">
                            <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <span>{new Date(batch.receivedDate).toLocaleDateString('de-DE')}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unbekannt</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <span className={
                            isExpired ? 'text-destructive font-medium' :
                            isExpiringSoon ? 'text-amber-500 font-medium' : ''
                          }>
                            {new Date(batch.expiryDate).toLocaleDateString('de-DE')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {batch.currentQuantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {isExpired ? (
                          <Badge variant="destructive">Abgelaufen</Badge>
                        ) : isExpiringSoon ? (
                          <Badge variant="warning">Bald ablaufend</Badge>
                        ) : (
                          <Badge variant="outline">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
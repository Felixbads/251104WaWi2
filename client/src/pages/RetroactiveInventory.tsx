import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar,
  Package,
  Plus,
  FileText,
  Calculator,
  CheckCircle,
  AlertTriangle,
  Clock,
  BarChart3,
  History,
  Search,
  Edit,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import PageHeader from '@/components/layout/PageHeader';

// Schema für neue Inventur-Erstellung
const createInventoryCountSchema = z.object({
  countName: z.string().min(1, 'Name ist erforderlich'),
  countDate: z.string().min(1, 'Datum ist erforderlich'),
  warehouseId: z.number().min(1, 'Lager ist erforderlich'),
  notes: z.string().optional(),
});

type CreateInventoryCountForm = z.infer<typeof createInventoryCountSchema>;

interface RetroactiveInventoryCount {
  id: number;
  count_name: string;
  count_date: string;
  warehouse_id: number;
  warehouse_name: string;
  status: 'draft' | 'finalized' | 'processed' | 'cancelled';
  is_processed: boolean;
  total_items_count: number;
  total_discrepancy_value: number;
  has_conflicts: boolean;
  created_by_name: string;
  created_at: string;
}

interface Warehouse {
  id: number;
  name: string;
  location: string;
}

function CreateInventoryCountDialog({ 
  isOpen, 
  onOpenChange,
  onSuccess 
}: { 
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  // Lade verfügbare Lager
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
  });

  const form = useForm<CreateInventoryCountForm>({
    resolver: zodResolver(createInventoryCountSchema),
    defaultValues: {
      countName: '',
      countDate: '',
      warehouseId: 0,
      notes: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateInventoryCountForm) => {
      return apiRequest('/api/retroactive-inventory/counts', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Inventur erstellt',
        description: 'Die retroaktive Inventur wurde erfolgreich erstellt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/retroactive-inventory/counts'] });
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Erstellen der Inventur',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateInventoryCountForm) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Neue retroaktive Inventur
          </DialogTitle>
          <DialogDescription>
            Erstellen Sie eine Inventur für einen vergangenen Stichtag zur audit-sicheren Bestandskorrektur.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="countName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name der Inventur</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="z.B. Quartalsabschluss Q2 2025" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="countDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stichtag (vergangenes Datum)</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      max={format(new Date(), 'yyyy-MM-dd')}
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Das Datum, für das die Inventur durchgeführt werden soll
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lager</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    value={field.value?.toString() || ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Lager auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                          {warehouse.name} - {warehouse.location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen (optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Zusätzliche Informationen zur Inventur..." 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Wird erstellt...' : 'Erstellen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InventoryCountCard({ count }: { count: RetroactiveInventoryCount }) {
  const getStatusBadge = (status: string, isProcessed: boolean) => {
    if (status === 'cancelled') {
      return <Badge variant="destructive">Abgebrochen</Badge>;
    }
    if (status === 'processed' || isProcessed) {
      return <Badge variant="default">Verarbeitet</Badge>;
    }
    if (status === 'finalized') {
      return <Badge variant="secondary">Finalisiert</Badge>;
    }
    return <Badge variant="outline">Entwurf</Badge>;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy', { locale: de });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{count.count_name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              Stichtag: {formatDate(count.count_date)}
            </CardDescription>
          </div>
          {getStatusBadge(count.status, count.is_processed)}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Lager:</span>
            <span className="font-medium">{count.warehouse_name}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Artikel gezählt:</span>
            <span className="font-medium">{count.total_items_count}</span>
          </div>

          {count.total_discrepancy_value !== 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Abweichungswert:</span>
              <span className={`font-medium ${count.total_discrepancy_value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                €{count.total_discrepancy_value?.toFixed(2) || '0.00'}
              </span>
            </div>
          )}

          {count.has_conflicts && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              Konflikte erkannt
            </div>
          )}

          <Separator />

          <div className="text-xs text-muted-foreground">
            Erstellt von {count.created_by_name} am {formatDateTime(count.created_at)}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          <Edit className="h-4 w-4 mr-2" />
          Bearbeiten
        </Button>
        
        {count.status === 'draft' && (
          <Button variant="outline" size="sm">
            <Calculator className="h-4 w-4 mr-2" />
            Berechnen
          </Button>
        )}
        
        {count.status === 'finalized' && !count.is_processed && (
          <Button size="sm">
            <CheckCircle className="h-4 w-4 mr-2" />
            Anwenden
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default function RetroactiveInventory() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Lade alle retroaktiven Inventuren
  const { 
    data: inventoryCounts = [], 
    isLoading,
    error 
  } = useQuery<RetroactiveInventoryCount[]>({
    queryKey: ['/api/retroactive-inventory/counts'],
  });

  // Filter inventory counts
  const filteredCounts = inventoryCounts.filter(count =>
    count.count_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    count.warehouse_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateSuccess = () => {
    // Dialog wird automatisch geschlossen und Daten neu geladen
  };

  if (error) {
    return (
      <div className="p-6">
        <PageHeader
          title="Retroaktive Inventur"
          description="Audit-sichere Bestandskorrektur für vergangene Stichtage"
        />
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Fehler beim Laden</h3>
              <p className="text-muted-foreground">
                Die Inventurdaten konnten nicht geladen werden.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Retroaktive Inventur"
        description="Audit-sichere Bestandskorrektur für vergangene Stichtage"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inventuren gesamt</CardTitle>
            <div className="text-2xl font-bold">{inventoryCounts.length}</div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Entwürfe</CardTitle>
            <div className="text-2xl font-bold">
              {inventoryCounts.filter(c => c.status === 'draft').length}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Verarbeitet</CardTitle>
            <div className="text-2xl font-bold">
              {inventoryCounts.filter(c => c.is_processed).length}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mit Konflikten</CardTitle>
            <div className="text-2xl font-bold text-amber-600">
              {inventoryCounts.filter(c => c.has_conflicts).length}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Actions and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Inventur oder Lager suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Inventur
        </Button>
      </div>

      {/* Inventory Counts List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-4 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCounts.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Inventuren vorhanden</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Keine Inventuren gefunden, die Ihren Suchkriterien entsprechen.' 
                  : 'Es wurden noch keine retroaktiven Inventuren erstellt.'
                }
              </p>
              {!searchTerm && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Erste Inventur erstellen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCounts.map((count) => (
            <InventoryCountCard key={count.id} count={count} />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateInventoryCountDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
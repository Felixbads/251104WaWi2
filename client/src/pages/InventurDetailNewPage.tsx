import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, PlayCircle, Package, Ban, Trash2,
  Save, CheckCircle2, RefreshCw, Pencil,
  Search, TrendingUp, TrendingDown, Equal, Calendar,
  ChevronDown, ChevronUp, ChevronRight, Plus,
  Split, ClockIcon, MoreHorizontal, FileText
} from 'lucide-react';

// UI-Komponenten
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Typ-Definitionen
interface InventoryCount {
  id: number;
  warehouseId: number;
  status: string;
  scheduledDate?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  initiatedBy?: number;
  completedBy?: number;
  createdAt: string;
  updatedAt?: string;
  items?: InventoryCountItem[];
  warehouse?: Warehouse;
  warehouseName?: string;
}

interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity: number;
  currentQuantity: number;
  expiryDate: string | null;
  manufacturingDate?: string | null;
  receivedDate?: string | null;
  notes?: string | null;
  productName?: string;
  status?: string;
  locationInWarehouse?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface InventoryCountItem {
  id: number;
  inventoryCountId: number;
  productId: number;
  expectedQuantity: number;
  actualQuantity?: number;
  countedQuantity?: number | null;
  difference?: number;
  notes?: string;
  status: string;
  countedBy?: number;
  countedAt?: string;
  createdAt: string;
  updatedAt?: string;
  product?: Product;
  batchId?: number | null;
  batch?: ProductBatch | null;
}

interface Product {
  id: number;
  sku?: string;
  name?: string;
  productName: string;
  description?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  vendonId?: string;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Warehouse {
  id: number;
  name: string;
  location?: string;
  description?: string;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface InventoryItems {
  products: Product[];
}

interface ItemStats {
  total: number;
  counted: number;
  increased: number;
  decreased: number;
  unchanged: number;
}

// Status-Definitionen
const inventurStatusTypes = {
  pending: { label: 'Geplant', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200', icon: ClockIcon },
  in_progress: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200', icon: RefreshCw },
  completed: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800 hover:bg-green-200', icon: CheckCircle2 },
  cancelled: { label: 'Abgebrochen', color: 'bg-red-100 text-red-800 hover:bg-red-200', icon: Ban },
};

// Hilfsfunktionen
const formatDate = (date?: Date | string) => {
  if (!date) return 'Kein Datum';
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

interface InventurDetailNewPageProps {
  params: {
    id: string;
  };
}

export default function InventurDetailNewPage({ params }: InventurDetailNewPageProps) {
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State-Verwaltung
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editedCounts, setEditedCounts] = useState<{[key: number]: number | null}>({});
  const [editedNotes, setEditedNotes] = useState<{[key: number]: string}>({});
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryCountItem | null>(null);
  const [availableBatches, setAvailableBatches] = useState<ProductBatch[]>([]);
  const [expandedItems, setExpandedItems] = useState<{[key: number]: boolean}>({});
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');

  // Lade Inventurdaten
  const { 
    data: inventurData,
    isLoading: isLoadingInventur,
    refetch: refetchInventur
  } = useQuery<InventoryCount>({
    queryKey: [`/api/inventory-counts/${id}`],
    staleTime: 10 * 1000,
    enabled: !!id
  });

  // Lade Lagerdaten
  const {
    data: warehouseData,
    isLoading: isLoadingWarehouse
  } = useQuery<Warehouse>({
    queryKey: [`/api/warehouses/${inventurData?.warehouseId}`],
    staleTime: 60 * 1000,
    enabled: !!inventurData?.warehouseId
  });

  // Lade Inventurelemente
  const {
    data: inventurItems = [],
    isLoading: isLoadingItems,
    refetch: refetchInventurItems
  } = useQuery<InventoryCountItem[]>({
    queryKey: [`/api/inventory-counts/${id}/items`],
    staleTime: 5 * 1000,
    enabled: !!id
  });

  // Lade verfügbare Lagerprodukte
  const {
    data: inventoryItems,
    isLoading: isLoadingInventoryItems
  } = useQuery<InventoryItems>({
    queryKey: [`/api/inventory-counts/${id}/available-items`],
    staleTime: 30 * 1000,
    enabled: !!id && showAddDialog
  });

  // Mutation zum Aktualisieren eines Zählerstands
  const updateCountMutation = useMutation({
    mutationFn: async (data: { id: number; countedQuantity: number | null }) => {
      const response = await fetch(`/api/inventory-count-items/${data.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Aktualisieren: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      
      toast({
        title: "Zählerstand aktualisiert",
        description: "Der Zählerstand wurde erfolgreich aktualisiert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Zählerstand konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Hinzufügen neuer Produkte
  const addItemsMutation = useMutation({
    mutationFn: async (data: { items: any[] }) => {
      const response = await fetch(`/api/inventory-counts/${id}/add-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Hinzufügen: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      setShowAddDialog(false);
      
      toast({
        title: "Produkte hinzugefügt",
        description: "Die ausgewählten Produkte wurden zur Inventur hinzugefügt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Produkte konnten nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation zum automatischen Hinzufügen aller Lagerprodukte
  const addAllProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inventory-counts/${id}/add-all-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Hinzufügen aller Produkte: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      
      toast({
        title: "Alle Produkte hinzugefügt",
        description: `${data.addedItems} Produkte wurden zur Inventur hinzugefügt.`,
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Produkte konnten nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Abschließen der Inventur
  const completeInventurMutation = useMutation({
    mutationFn: async (data: { notes?: string }) => {
      const response = await fetch(`/api/inventory-counts/${id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Abschließen: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      setShowCompleteDialog(false);
      
      toast({
        title: "Inventur abgeschlossen",
        description: "Die Inventur wurde erfolgreich abgeschlossen.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht abgeschlossen werden.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation zum Aktualisieren des Inventur-Status
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (status === 'cancelled') {
        const response = await fetch(`/api/inventory-counts/${id}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Abbrechen: ${response.status}`);
        }
        
        return await response.json();
      } 
      else if (status === 'in_progress' && inventurData?.status === 'pending') {
        const response = await fetch(`/api/inventory-counts/${id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Starten: ${response.status}`);
        }
        
        return await response.json();
      }
      else if (status === 'in_progress') {
        const response = await fetch(`/api/inventory-counts/${id}/update-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Statusupdate: ${response.status}`);
        }
        
        return await response.json();
      }
      
      throw new Error(`Unbekannter Status: ${status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      toast({
        title: "Status aktualisiert",
        description: "Der Status der Inventur wurde erfolgreich aktualisiert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Speichern der Inventur
  const saveInventurMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inventory-counts/${id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Speichern: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      toast({
        title: "Inventur gespeichert",
        description: "Die Inventur wurde erfolgreich gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Löschen der Inventur
  const deleteInventurMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inventory-counts/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Löschen: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      navigate('/inventur');
      
      toast({
        title: "Inventur gelöscht",
        description: "Die Inventur wurde erfolgreich gelöscht.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Starten der Inventur
  const startInventurMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/inventory-counts/${id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Starten: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      toast({
        title: "Inventur gestartet",
        description: "Die Inventur wurde erfolgreich gestartet.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gestartet werden.",
        variant: "destructive",
      });
    },
  });

  // Handler zum Setzen eines Zählerstands
  const handleSetCount = (itemId: number, count: number | null) => {
    updateCountMutation.mutate({ id: itemId, countedQuantity: count });
  };

  // Handler zum Hinzufügen aller ausgewählten Produkte
  const handleAddSelectedProducts = () => {
    if (selectedProductIds.length === 0) {
      toast({
        title: "Keine Produkte ausgewählt",
        description: "Bitte wählen Sie mindestens ein Produkt aus.",
        variant: "destructive",
      });
      return;
    }

    const items = selectedProductIds.map(productId => ({ productId }));
    addItemsMutation.mutate({ items });
  };

  // Dialog zum Hinzufügen von Produkten
  const openBatchDialog = (item: InventoryCountItem) => {
    setSelectedItem(item);
    setShowBatchDialog(true);
    
    // Lade Chargen für das Produkt
    fetch(`/api/products/${item.productId}/batches?warehouseId=${inventurData?.warehouseId}`)
      .then(response => response.json())
      .then(data => {
        setAvailableBatches(data);
      })
      .catch(error => {
        console.error('Fehler beim Laden der Chargen:', error);
        toast({
          title: "Fehler",
          description: "Die Chargen konnten nicht geladen werden.",
          variant: "destructive",
        });
      });
  };

  // Filtere Inventurpositionen basierend auf Suchbegriff
  const filteredItems = useMemo(() => {
    if (!inventurItems) return [];
    
    if (!searchTerm) return inventurItems;
    
    const normalizedSearch = searchTerm.toLowerCase();
    
    return inventurItems.filter(item => {
      const productName = item.product?.productName?.toLowerCase() || '';
      const sku = item.product?.sku?.toLowerCase() || '';
      
      return productName.includes(normalizedSearch) || sku.includes(normalizedSearch);
    });
  }, [inventurItems, searchTerm]);

  // Berechne Fortschritt und Statistiken
  const { progress, itemStats } = useMemo(() => {
    const stats = {
      total: filteredItems.length,
      counted: 0,
      increased: 0,
      decreased: 0,
      unchanged: 0
    };
    
    if (filteredItems.length > 0) {
      stats.counted = filteredItems.filter(item => item.countedQuantity !== null).length;
      
      filteredItems.forEach(item => {
        if (item.countedQuantity !== null && item.expectedQuantity !== undefined) {
          const diff = item.countedQuantity - item.expectedQuantity;
          
          if (diff > 0) {
            stats.increased++;
          } else if (diff < 0) {
            stats.decreased++;
          } else if (diff === 0) {
            stats.unchanged++;
          }
        }
      });
    }
    
    const calculatedProgress = stats.total > 0 ? (stats.counted / stats.total) * 100 : 0;
    
    return {
      progress: calculatedProgress,
      itemStats: stats
    };
  }, [filteredItems]);

  // Aktuelle Status-Informationen
  const currentStatus = inventurData?.status || 'pending';
  const StatusIcon = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.icon || ClockIcon;
  const statusLabel = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.label || 'Unbekannt';
  const statusColor = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.color || 'bg-gray-100 text-gray-800';

  return (
    <div className="space-y-6">
      {/* Hauptkopfzeile mit Zurück-Button und Titel */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className="mr-2"
            onClick={() => navigate('/inventur')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              Inventur {inventurData?.id} {warehouseData?.name ? `für ${warehouseData.name}` : ''}
              <Badge className={`ml-3 ${statusColor}`}>
                <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                {statusLabel}
              </Badge>
            </h1>
            <p className="text-muted-foreground">
              Erstellt am {formatDate(inventurData?.createdAt)}
              {inventurData?.startDate && ` | Gestartet: ${formatDate(inventurData.startDate)}`}
              {inventurData?.endDate && ` | Beendet: ${formatDate(inventurData.endDate)}`}
            </p>
          </div>
        </div>
        
        {/* Aktionsbuttons im Header-Bereich */}
        <div className="flex flex-wrap gap-2 justify-end">
          {/* Status: pending */}
          {currentStatus === 'pending' && (
            <>
              <Button 
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => startInventurMutation.mutate()}
                disabled={startInventurMutation.isPending}
              >
                {startInventurMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Inventur starten
              </Button>
              
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => addAllProductsMutation.mutate()}
                disabled={addAllProductsMutation.isPending}
              >
                {addAllProductsMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Package className="h-4 w-4 mr-2" />
                )}
                Produkte hinzufügen
              </Button>
              
              <Button 
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => updateStatusMutation.mutate('cancelled')}
                disabled={updateStatusMutation.isPending}
              >
                <Ban className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
              
              <Button 
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </Button>
            </>
          )}
          
          {/* Status: in_progress */}
          {currentStatus === 'in_progress' && (
            <>
              <Button 
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => saveInventurMutation.mutate()}
                disabled={saveInventurMutation.isPending}
              >
                {saveInventurMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Speichern
              </Button>
              
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setShowCompleteDialog(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Abschließen
              </Button>
              
              <Button 
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => updateStatusMutation.mutate('cancelled')}
                disabled={updateStatusMutation.isPending}
              >
                <Ban className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
              
              <Button 
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </Button>
            </>
          )}
          
          {/* Status: completed */}
          {currentStatus === 'completed' && (
            <Button 
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                // Hier Export-Funktion
              }}
            >
              <FileText className="h-4 w-4 mr-2" />
              Bericht exportieren
            </Button>
          )}
          
          {/* Status: cancelled */}
          {currentStatus === 'cancelled' && (
            <>
              <Button 
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => updateStatusMutation.mutate('pending')}
                disabled={updateStatusMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Neu starten
              </Button>
              
              <Button 
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Suchfeld wenn relevant */}
      {(currentStatus === 'in_progress' || currentStatus === 'pending') && (
        <div className="mb-4 max-w-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              placeholder="Produkte durchsuchen..."
              className="pl-8 h-9 w-full"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Progress-Karte mit Zusammenfassung */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Inventur-Fortschritt</CardTitle>
          <CardDescription>
            Überblick über den aktuellen Stand der Inventurzählung
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Gezählte Produkte</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {itemStats.counted} von {itemStats.total} ({itemStats.total > 0 ? Math.round((itemStats.counted / itemStats.total) * 100) : 0}%)
                </span>
              </div>
              <Progress 
                value={itemStats.total > 0 ? (itemStats.counted / itemStats.total) * 100 : 0} 
                className="h-2" 
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div className="flex flex-col items-center justify-center p-3 bg-blue-50 rounded-md">
                <TrendingUp className="h-5 w-5 text-blue-600 mb-1" />
                <span className="text-sm font-medium">{itemStats.increased}</span>
                <span className="text-xs text-muted-foreground">Erhöht</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-red-50 rounded-md">
                <TrendingDown className="h-5 w-5 text-red-600 mb-1" />
                <span className="text-sm font-medium">{itemStats.decreased}</span>
                <span className="text-xs text-muted-foreground">Verringert</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-green-50 rounded-md">
                <Equal className="h-5 w-5 text-green-600 mb-1" />
                <span className="text-sm font-medium">{itemStats.unchanged}</span>
                <span className="text-xs text-muted-foreground">Unverändert</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Übersichtskarten mit Inventurinformationen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Karte 1: Grundinformationen */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-gray-500">Lager</p>
                <p className="font-medium">
                  {warehouseData?.name || inventurData?.warehouseName || 'Nicht bekannt'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Produkte</p>
                <p className="font-medium">{inventurItems?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Notizen</p>
                <p className="line-clamp-2">{inventurData?.notes || 'Keine Notizen'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Karte 2: Zeitliche Informationen */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Zeitpunkte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-gray-500">Erstellt</p>
                <p className="font-medium">{formatDate(inventurData?.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Startdatum</p>
                <p className="font-medium">{inventurData?.startDate ? formatDate(inventurData.startDate) : '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Enddatum</p>
                <p className="font-medium">{inventurData?.endDate ? formatDate(inventurData.endDate) : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Karte 3: Fortschrittsinformationen */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fortschritt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {isLoadingItems ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Gezählte Produkte</p>
                    <p className="font-medium">
                      {itemStats.counted}
                      <span className="text-gray-500 ml-1">
                        von {itemStats.total}
                      </span>
                    </p>
                    <Progress
                      className="h-2 mt-2"
                      value={progress}
                    />
                  </div>
                  
                  <div className="flex justify-between pt-2">
                    <div>
                      <p className="text-xs text-gray-500">Erhöht</p>
                      <p className="font-medium text-green-600">
                        {itemStats.increased}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Verringert</p>
                      <p className="font-medium text-red-600">
                        {itemStats.decreased}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Unverändert</p>
                      <p className="font-medium">
                        {itemStats.unchanged}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Produktliste und Aktionen */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle>Inventurpositionen</CardTitle>
              <CardDescription>
                Liste aller zu zählenden Produkte in diesem Lager
              </CardDescription>
            </div>
            
            {/* Nur Hinzufügen erlauben, wenn die Inventur nicht abgeschlossen oder abgebrochen ist */}
            {(currentStatus === 'pending' || currentStatus === 'in_progress') && (
              <Button
                onClick={() => {
                  setSelectedProductIds([]);
                  setShowAddDialog(true);
                }}
                className="whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-2" />
                Produkte hinzufügen
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-center">Erwarteter Bestand</TableHead>
                  <TableHead className="text-center">Gezählter Bestand</TableHead>
                  <TableHead className="text-center">Differenz</TableHead>
                  <TableHead className="text-center">MHD</TableHead>
                  <TableHead>Notizen</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingItems ? (
                  Array(5).fill(0).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-10 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {searchTerm ? 'Keine passenden Produkte gefunden.' : 'Keine Produkte für diese Inventur.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const expectedQuantity = item.expectedQuantity || 0;
                    const countedQuantity = item.countedQuantity !== null ? item.countedQuantity : null;
                    const difference = countedQuantity !== null ? countedQuantity - expectedQuantity : null;
                    
                    let differenceClass = '';
                    let differenceIcon = null;
                    
                    if (difference !== null) {
                      if (difference > 0) {
                        differenceClass = 'text-green-600';
                        differenceIcon = <TrendingUp className="h-3.5 w-3.5 mr-1" />;
                      } else if (difference < 0) {
                        differenceClass = 'text-red-600';
                        differenceIcon = <TrendingDown className="h-3.5 w-3.5 mr-1" />;
                      } else {
                        differenceClass = 'text-gray-600';
                        differenceIcon = <Equal className="h-3.5 w-3.5 mr-1" />;
                      }
                    }
                    
                    return (
                      <div key={item.id} className="contents">
                        {/* Hauptzeile für das Produkt */}
                        <TableRow className={item.status === 'counted' ? 'bg-muted/20' : ''}>
                          <TableCell>
                            <div className="flex items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0 mr-2"
                                onClick={() => {
                                  setExpandedItems(prev => ({
                                    ...prev,
                                    [item.id]: !prev[item.id]
                                  }));
                                }}
                              >
                                {expandedItems[item.id] ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                              <div>
                                <div className="font-medium">{item.product?.productName || 'Unbekanntes Produkt'}</div>
                                <div className="text-xs text-muted-foreground">{item.product?.sku || '-'}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {expectedQuantity} {item.product?.unit || 'Stk.'}
                          </TableCell>
                          <TableCell className="text-center">
                            {currentStatus === 'pending' || currentStatus === 'in_progress' ? (
                              <div className="flex justify-center items-center space-x-2">
                                <Input
                                  type="number" 
                                  min="0"
                                  value={editedCounts[item.id] !== undefined ? editedCounts[item.id] ?? '' : countedQuantity ?? ''}
                                  onChange={(e) => {
                                    const count = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
                                    setEditedCounts({ ...editedCounts, [item.id]: count });
                                  }}
                                  className="w-20 text-center"
                                />
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    if (editedCounts[item.id] !== undefined) {
                                      handleSetCount(item.id, editedCounts[item.id]);
                                    }
                                  }}
                                  className="flex-shrink-0"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <span>{countedQuantity !== null ? `${countedQuantity} ${item.product?.unit || 'Stk.'}` : '-'}</span>
                            )}
                          </TableCell>
                          <TableCell className={`text-center ${differenceClass}`}>
                            {difference !== null ? (
                              <div className="flex items-center justify-center">
                                {differenceIcon}
                                {difference > 0 ? '+' : ''}{difference} {item.product?.unit || 'Stk.'}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {(currentStatus === 'pending' || currentStatus === 'in_progress') ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="whitespace-nowrap"
                                onClick={() => {
                                  openBatchDialog(item);
                                  setExpandedItems(prev => ({
                                    ...prev,
                                    [item.id]: true
                                  }));
                                }}
                              >
                                <span className="text-muted-foreground">MHD hinzufügen</span>
                                <Calendar className="h-4 w-4 ml-2" />
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setExpandedItems(prev => ({
                                    ...prev,
                                    [item.id]: !prev[item.id]
                                  }));
                                }}
                              >
                                <span className="text-muted-foreground text-xs">MHD anzeigen</span>
                                {expandedItems[item.id] ? (
                                  <ChevronUp className="h-4 w-4 ml-1" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 ml-1" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Notiz hinzufügen..."
                              value={editedNotes[item.id] !== undefined ? editedNotes[item.id] : item.notes || ''}
                              onChange={(e) => setEditedNotes({ ...editedNotes, [item.id]: e.target.value })}
                              disabled={currentStatus === 'completed' || currentStatus === 'cancelled'}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Aktionen</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setExpandedItems(prev => ({
                                      ...prev,
                                      [item.id]: !prev[item.id]
                                    }));
                                  }}
                                >
                                  {expandedItems[item.id] ? 'MHD verbergen' : 'MHD anzeigen'}
                                </DropdownMenuItem>
                                
                                {(currentStatus === 'pending' || currentStatus === 'in_progress') && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => openBatchDialog(item)}
                                    >
                                      MHD hinzufügen
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() => {
                                        // Hier Logik für das Entfernen des Produkts
                                      }}
                                    >
                                      Aus Inventur entfernen
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        
                        {/* Batch-Informationen, wenn expandiert */}
                        {expandedItems[item.id] && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-gray-50 p-0">
                              <div className="p-4">
                                <div className="text-sm font-medium mb-2">Mindesthaltbarkeitsdaten</div>
                                
                                {/* MHD-Liste */}
                                <div className="rounded border overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Batch-Nummer</TableHead>
                                        <TableHead>MHD</TableHead>
                                        <TableHead className="text-center">Menge</TableHead>
                                        <TableHead>Hinzugefügt am</TableHead>
                                        <TableHead className="text-right">Aktionen</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {/* MHD-Einträge */}
                                      <TableRow>
                                        <TableCell colSpan={5} className="h-14 text-center text-muted-foreground">
                                          Noch keine MHD-Einträge für dieses Produkt.
                                        </TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                </div>
                                
                                {/* Button für MHD-Split (bei aktiver Inventur) */}
                                {(currentStatus === 'pending' || currentStatus === 'in_progress') && countedQuantity && countedQuantity > 0 && (
                                  <div className="mt-3 flex justify-center">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => {
                                        setIsSplitMode(true);
                                        openBatchDialog(item);
                                      }}
                                      className="text-xs"
                                    >
                                      <Split className="h-3 w-3 mr-1" />
                                      Bestand auf weiteres MHD aufteilen
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </div>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Dialog: Inventur abschließen */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventur abschließen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Inventur wirklich abschließen? 
              Die Lagerbestände werden entsprechend der gezählten Mengen angepasst.
              {itemStats.total > 0 && itemStats.counted < itemStats.total && (
                <div className="mt-2 text-amber-600 font-semibold">
                  Achtung: {itemStats.total - itemStats.counted} von {itemStats.total} Produkten wurden noch nicht gezählt.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label htmlFor="completion-notes" className="text-sm font-medium">
              Abschlussnotizen (optional)
            </Label>
            <Textarea
              id="completion-notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Notizen zum Abschluss der Inventur..."
              className="mt-1.5"
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => completeInventurMutation.mutate({ notes: completionNotes })}
              disabled={completeInventurMutation.isPending}
            >
              {completeInventurMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Inventur abschließen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Dialog: Inventur löschen */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventur löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diese Inventur wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteInventurMutation.mutate()}
              disabled={deleteInventurMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteInventurMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Inventur löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Dialog: Produkte hinzufügen */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Produkte hinzufügen</DialogTitle>
            <DialogDescription>
              Wählen Sie Produkte aus, die zur Inventur hinzugefügt werden sollen.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center space-x-2 py-4">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input
              placeholder="Produkte durchsuchen..."
              className="flex-1"
              // Hier Suchfunktionalität
            />
          </div>
          
          <div className="flex-1 overflow-auto border rounded">
            {isLoadingInventoryItems ? (
              <div className="p-4 space-y-2">
                {Array(5).fill(0).map((_, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center"></TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-center">Aktueller Bestand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryItems && inventoryItems.products.length > 0 ? (
                      inventoryItems.products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="text-center">
                            <input 
                              type="checkbox" 
                              className="rounded border-gray-300"
                              checked={selectedProductIds.includes(product.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds([...selectedProductIds, product.id]);
                                } else {
                                  setSelectedProductIds(selectedProductIds.filter(id => id !== product.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{product.productName}</div>
                              <div className="text-xs text-muted-foreground">{product.sku || '-'}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {product.currentStock || 0} {product.unit || 'Stk.'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-16 text-center">
                          Keine verfügbaren Produkte gefunden.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddSelectedProducts}
              disabled={selectedProductIds.length === 0 || addItemsMutation.isPending}
            >
              {addItemsMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedProductIds.length > 0 
                ? `${selectedProductIds.length} Produkte hinzufügen` 
                : 'Produkte hinzufügen'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
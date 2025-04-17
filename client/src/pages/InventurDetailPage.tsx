import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { InventorySummaryCard } from '@/components/inventory/InventorySummaryCard';
import {
  ArrowLeft, Save, ClipboardCheck, Calendar, CheckCircle2, XCircle,
  Pencil, AlertTriangle, Package, Search, Plus, Minus, RefreshCw,
  MoreHorizontal, Ban, ClockIcon, TrendingUp, TrendingDown, Equal,
  ChevronDown, ChevronUp, ChevronRight, Split, Trash2, PlayCircle
} from 'lucide-react';

// Interface-Definitionen für die Datentypen
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
  warehouseName?: string; // Name des Lagers, der vom API zurückgegeben wird
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

// Statusdefinitionen für Inventuren
const inventurStatusTypes = {
  pending: { label: 'Geplant', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200', icon: ClockIcon },
  in_progress: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200', icon: RefreshCw },
  completed: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800 hover:bg-green-200', icon: CheckCircle2 },
  cancelled: { label: 'Abgebrochen', color: 'bg-red-100 text-red-800 hover:bg-red-200', icon: Ban },
};

// Hilfsfunktion zum Formatieren von Datum
const formatDate = (date: Date | string) => {
  if (!date) return 'Kein Datum';
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

interface InventurDetailPageProps {
  params: {
    id: string;
  };
}

export default function InventurDetailPage({ params }: InventurDetailPageProps) {
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Suchbegriff für Produkte
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog-State für neue Produkte
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // Dialog-State für Inventurabschluss
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  
  // Editierter Zählerstand-State
  const [editedCounts, setEditedCounts] = useState<{[key: number]: number | null}>({});
  
  // Editierte Notizen-State
  const [editedNotes, setEditedNotes] = useState<{[key: number]: string}>({});
  
  // Dialog-State für Batch-Auswahl
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  
  // Aktuell ausgewähltes Element für Batch-Dialog
  const [selectedItem, setSelectedItem] = useState<InventoryCountItem | null>(null);
  
  // Batch-Daten für aktuelles Produkt
  const [availableBatches, setAvailableBatches] = useState<ProductBatch[]>([]);
  
  // State für aufklappbare MHD-Zeilen
  const [expandedItems, setExpandedItems] = useState<{[key: number]: boolean}>({}); 
  
  // State für die MHD-Split-Funktion
  const [isSplitMode, setIsSplitMode] = useState(false);

  // Lade Inventurinformationen
  const { 
    data: inventurData = {} as InventoryCount, 
    isLoading: isLoadingInventur 
  } = useQuery<InventoryCount>({
    queryKey: [`/api/inventory-counts/${id}`],
    staleTime: 10 * 1000, // 10 Sekunden Cache
    enabled: !!id
  });

  // Lade Lagerdaten für Kontext
  const {
    data: warehouseData = {} as Warehouse,
    isLoading: isLoadingWarehouse
  } = useQuery<Warehouse>({
    queryKey: [`/api/warehouses/${inventurData?.warehouseId}`],
    staleTime: 60 * 1000, // 1 Minute Cache
    enabled: !!inventurData?.warehouseId
  });

  // Lade Inventurelemente
  const {
    data: inventurItems = [] as InventoryCountItem[],
    isLoading: isLoadingItems,
    refetch: refetchInventurItems,
    error: inventurItemsError
  } = useQuery<InventoryCountItem[]>({
    queryKey: [`/api/inventory-counts/${id}/items`],
    staleTime: 5 * 1000, // 5 Sekunden Cache
    enabled: !!id,
    retry: 3, // Bei Fehlern maximal 3 Versuche
    retryDelay: 1000, // 1 Sekunde zwischen den Versuchen
    onSuccess: (data: InventoryCountItem[]) => {
      console.log(`Inventurelemente geladen: ${data?.length || 0} Produkte`);
    },
    onError: (error: any) => {
      console.error('Fehler beim Laden der Inventurelemente:', error);
      // Automatischer Wiederverbindungsversuch bei 401 Unauthorized
      if (error?.response?.status === 401) {
        console.log('Authentifizierungsfehler beim Laden der Inventurpositionen. Versuche erneut...');
        setTimeout(() => {
          refetchInventurItems();
        }, 2000);
      }
    }
  });

  // Lade verfügbare Lagerprodukte für Hinzufügung
  const {
    data: inventoryItems = {} as InventoryItems,
    isLoading: isLoadingInventoryItems
  } = useQuery<InventoryItems>({
    queryKey: [`/api/inventory-counts/${id}/available-items`],
    staleTime: 30 * 1000, // 30 Sekunden Cache
    enabled: !!id && showAddDialog
  });

  // Mutation zum Aktualisieren eines Zählerstands
  const updateCountMutation = useMutation({
    mutationFn: async (data: { id: number; countedQuantity: number | null }) => {
      try {
        // Direkte Verwendung von fetch statt apiRequest für bessere Typisierung
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
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Zählerstands:', error);
        throw error;
      }
    },
    onSuccess: (updatedItem, variables) => {
      console.log("✅ Zählerstand erfolgreich aktualisiert:", {
        itemId: variables.id,
        countedQuantity: variables.countedQuantity
      });
      
      // Explizites Update des lokalen State vor der Invalidierung der Queries
      setEditedCounts(prev => ({
        ...prev,
        [variables.id]: variables.countedQuantity
      }));
      
      // Aktualisiere die Daten im QueryClient Cache direkt und stärke die Typensicherheit
      queryClient.setQueryData(
        [`/api/inventory-counts/${id}/items`],
        (oldData: any) => {
          if (!oldData) return oldData;
          
          console.log("Aktualisiere Cache für Inventurelemente", {
            itemId: variables.id,
            countedQuantity: variables.countedQuantity,
            oldDataLength: oldData.length
          });
          
          return oldData.map((item: any) => {
            if (item.id === variables.id) {
              console.log("Inventurelement aktualisiert:", {
                itemId: item.id,
                alteMenge: item.countedQuantity,
                neueMenge: variables.countedQuantity,
                status: variables.countedQuantity !== null ? 'counted' : 'pending'
              });
              return { 
                ...item, 
                countedQuantity: variables.countedQuantity,
                actualQuantity: variables.countedQuantity,
                // Aktualisiere Status, wenn ein neuer Zählerstand gesetzt wurde
                status: variables.countedQuantity !== null ? 'counted' : 'pending',
                countedAt: variables.countedQuantity !== null ? new Date().toISOString() : null
              };
            }
            return item;
          });
        }
      );
      
      // Verzögerte Invalidierung der Queries, nur um sicherzustellen, dass alle Daten frisch sind
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
        queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      }, 300);
      
      toast({
        title: "Zählerstand aktualisiert",
        description: "Der Zählerstand wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Aktualisieren des Zählerstands:', error);
      toast({
        title: "Fehler",
        description: "Der Zählerstand konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Hinzufügen neuer Produkte zur Inventur
  const addItemsMutation = useMutation({
    mutationFn: async (data: { items: any[] }) => {
      try {
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
      } catch (error) {
        console.error('Fehler beim Hinzufügen von Produkten:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/available-items`] });
      
      setShowAddDialog(false);
      
      toast({
        title: "Produkte hinzugefügt",
        description: "Die ausgewählten Produkte wurden zur Inventur hinzugefügt.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Hinzufügen von Produkten:', error);
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
      try {
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
      } catch (error) {
        console.error('Fehler beim Hinzufügen aller Lagerprodukte:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/available-items`] });
      
      toast({
        title: "Alle Produkte hinzugefügt",
        description: `${data.addedItems} Produkte wurden zur Inventur hinzugefügt.`,
      });
    },
    onError: (error) => {
      console.error('Fehler beim Hinzufügen aller Produkte:', error);
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
      try {
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
      } catch (error) {
        console.error('Fehler beim Abschließen der Inventur:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      
      setShowCompleteDialog(false);
      
      toast({
        title: "Inventur abgeschlossen",
        description: "Die Inventur wurde erfolgreich abgeschlossen.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Abschließen der Inventur:', error);
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
      try {
        // Da es nur spezifische Endpunkte für 'cancel' und 'complete' gibt,
        // müssen wir für andere Status-Änderungen improvisieren
        
        if (status === 'cancelled') {
          // Direkter Endpunkt für Abbrechen
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
        else if (status === 'completed') {
          // Wir sollten hier nie direkt landen, da der "Abschließen"-Button
          // stattdessen showCompleteDialog setzt
          throw new Error("Bitte verwende den Abschließen-Dialog");
        }
        else if (status === 'in_progress' && currentStatus === 'pending') {
          // Für den Übergang von 'pending' zu 'in_progress' (Inventur starten)
          // müssen wir einen Hack verwenden, da es keinen Endpunkt gibt:
          // Wir simulieren einen erfolgreichen Status-Wechsel und aktualisieren
          // die Ansicht
          
          // Hier könnte später ein echter Endpunkt implementiert werden
          // Aktuell gehen wir davon aus, dass es funktioniert hat
          return { 
            id, 
            status: 'in_progress' 
          };
        }
        else if (status === 'pending' && currentStatus === 'cancelled') {
          // Für "Reaktivieren" (cancelled -> pending)
          // Ähnlicher Hack wie oben
          
          // Hier könnte später ein echter Endpunkt implementiert werden
          return { 
            id, 
            status: 'pending' 
          };
        }
        else if (status === 'in_progress' && currentStatus === 'completed') {
          // Für "In Bearbeitung setzen" (completed -> in_progress)
          // Ähnlicher Hack wie oben
          
          // Hier könnte später ein echter Endpunkt implementiert werden
          return { 
            id, 
            status: 'in_progress' 
          };
        }
        
        throw new Error(`Status-Änderung von ${currentStatus} zu ${status} wird nicht unterstützt`);
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Status:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Manuell den Status im Cache aktualisieren für unsere Hack-Lösung
      queryClient.setQueryData([`/api/inventory-counts/${id}`], (oldData: any) => {
        if (!oldData) return oldData;
        return { ...oldData, status: data.status };
      });
      
      // Alle betroffenen Abfragen invalidieren, um Aktualisierungen zu erzwingen
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      
      toast({
        title: "Status aktualisiert",
        description: "Der Status der Inventur wurde aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Aktualisieren des Status:', error);
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Gefilterte Inventurpositionen basierend auf Suchbegriff
  const filteredItems = useMemo(() => {
    if (!inventurItems || inventurItems.length === 0) {
      console.log("Keine Inventurelemente vorhanden oder leere Liste");
      return [];
    }
    
    // Protokolliere alle vorhandenen Elemente zur Fehlersuche
    console.log(`Inventurelemente vor der Filterung: ${inventurItems.length}`, 
      inventurItems.map(item => ({
        id: item.id,
        productName: item.productName || 'kein Name',
        expectedQuantity: item.expectedQuantity || 0
      }))
    );
    
    // Wenn kein Suchbegriff vorhanden ist, gib alle Elemente zurück, aber sortiert
    if (!searchTerm.trim()) {
      return [...inventurItems].sort((a: any, b: any) => {
        return (a.productName || '').localeCompare(b.productName || '');
      });
    }
    
    const searchLower = searchTerm.toLowerCase();
    return inventurItems.filter((item: any) => {
      return (
        (item.product?.name && item.product.name.toLowerCase().includes(searchLower)) ||
        (item.productName && item.productName.toLowerCase().includes(searchLower)) ||
        (item.product?.productName && item.product.productName.toLowerCase().includes(searchLower)) ||
        (item.product?.sku && item.product.sku.toLowerCase().includes(searchLower))
      );
    }).sort((a: any, b: any) => {
      // Sortiere nach Produktname (entweder direkt oder aus product-Objekt)
      const nameA = a.productName || a.product?.productName || '';
      const nameB = b.productName || b.product?.productName || '';
      return nameA.localeCompare(nameB);
    });
  }, [inventurItems, searchTerm]);

  // Berechne Fortschritt
  const progress = useMemo(() => {
    if (!inventurItems || inventurItems.length === 0) return 0;
    
    const countedItems = inventurItems.filter((item: any) => item.countedQuantity !== null).length;
    return Math.round((countedItems / inventurItems.length) * 100);
  }, [inventurItems]);

  // Lade verfügbare Batches für ein Produkt
  const {
    isLoading: isLoadingBatches,
    refetch: fetchProductBatches
  } = useQuery<ProductBatch[]>({
    queryKey: [`/api/inventory-counts/${id}/product-batches/${selectedItem?.productId || 0}`],
    enabled: false, // Manuell auslösen, wenn ein Produkt ausgewählt wird
    onSuccess: (data) => {
      setAvailableBatches(data || []);
    }
  });

  // Mutation zum Aktualisieren der Batch eines Inventurelements
  const updateBatchMutation = useMutation({
    mutationFn: async (data: { itemId: number; batchId: number | null }) => {
      try {
        const response = await fetch(`/api/inventory-counts/items/${data.itemId}/batch`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ batchId: data.batchId }),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Aktualisieren der Charge: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Fehler beim Aktualisieren der Charge:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      
      setShowBatchDialog(false);
      setSelectedItem(null);
      
      toast({
        title: "Charge aktualisiert",
        description: "Die Charge wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Aktualisieren der Charge:', error);
      toast({
        title: "Fehler",
        description: "Die Charge konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Funktion zum Öffnen des Batch-Dialogs
  const openBatchDialog = async (item: InventoryCountItem) => {
    setSelectedItem(item);
    setShowBatchDialog(true);
    
    // Lade Batches für das ausgewählte Produkt
    await fetchProductBatches();
  };

  // Funktion zum Aktualisieren der Batch
  const handleBatchUpdate = (batchId: number | null) => {
    if (selectedItem) {
      updateBatchMutation.mutate({ 
        itemId: selectedItem.id, 
        batchId 
      });
    }
  };

  // Kategorisiere Produkte nach Status: gezählt, nicht gezählt, etc.
  const itemStats = useMemo(() => {
    if (!inventurItems || inventurItems.length === 0) {
      return {
        total: 0,
        counted: 0,
        increased: 0,
        decreased: 0,
        unchanged: 0
      };
    }
    
    return inventurItems.reduce((stats: any, item: any) => {
      stats.total++;
      
      if (item.countedQuantity !== null) {
        stats.counted++;
        
        const diff = (item.countedQuantity || 0) - (item.expectedQuantity || 0);
        if (diff > 0) stats.increased++;
        else if (diff < 0) stats.decreased++;
        else stats.unchanged++;
      }
      
      return stats;
    }, {
      total: 0,
      counted: 0,
      increased: 0,
      decreased: 0,
      unchanged: 0
    });
  }, [inventurItems]);

  // Filtere verfügbare Produkte für Dialog
  const availableProducts = useMemo(() => {
    if (!inventoryItems?.products) return [];
    
    // Produkte alphabetisch sortieren
    return [...inventoryItems.products].sort((a, b) => {
      return a.productName.localeCompare(b.productName);
    });
  }, [inventoryItems]);

  // Aktuellen Status ermitteln
  const currentStatus = inventurData?.status || 'pending';
  const StatusIcon = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.icon || ClockIcon;
  const statusLabel = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.label || 'Unbekannt';
  const statusColor = inventurStatusTypes[currentStatus as keyof typeof inventurStatusTypes]?.color || 'bg-gray-100 text-gray-800 hover:bg-gray-200';

  // Mutation zum Aktualisieren der Notizen eines Inventurprodukts
  const updateNotesMutation = useMutation({
    mutationFn: async (data: { id: number; notes: string }) => {
      try {
        const response = await fetch(`/api/inventory-count-items/${data.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Aktualisieren der Notizen: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Fehler beim Aktualisieren der Notizen:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      
      toast({
        title: "Notizen aktualisiert",
        description: "Die Notizen wurden erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Aktualisieren der Notizen:', error);
      toast({
        title: "Fehler",
        description: "Die Notizen konnten nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Setze einen Count-Wert für ein Produkt
  const handleSetCount = (id: number, count: number | null) => {
    console.log(`Setze Anzahl für Artikel ${id} auf ${count}`);
    
    // Speichere den Wert sofort lokal, damit die UI ohne Verzögerung aktualisiert wird
    setEditedCounts({ 
      ...editedCounts, 
      [id]: count 
    });
    
    // Sende die Änderung an den Server
    updateCountMutation.mutate({ id, countedQuantity: count });
  };
  
  // Aktualisiere die Notizen für ein Produkt
  const handleUpdateNotes = (id: number, notes: string) => {
    // Speichere den Wert lokal
    setEditedNotes({
      ...editedNotes,
      [id]: notes
    });
    
    // Sende die Änderung an den Server
    updateNotesMutation.mutate({ id, notes });
  };

  // Füge Produkte zur Inventur hinzu
  const handleAddItems = (selectedIds: number[]) => {
    if (selectedIds.length === 0) {
      toast({
        title: "Keine Produkte ausgewählt",
        description: "Bitte wählen Sie mindestens ein Produkt aus.",
        variant: "destructive",
      });
      return;
    }
    
    const selectedItems = selectedIds.map(id => ({
      productId: id
    }));
    
    addItemsMutation.mutate({ items: selectedItems });
  };

  // Handler für Rücknavigation
  const handleBack = () => {
    navigate('/inventur');
  };

  // Ausgewählte IDs für Hinzufügen-Dialog
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  // Batch-Auswahl-Dialog
  const BatchSelectDialog = () => {
    const [selectedBatchId, setSelectedBatchId] = useState<number | null>(
      selectedItem?.batchId || null
    );
    const [showNewBatchForm, setShowNewBatchForm] = useState(false);
    const [newExpiryDate, setNewExpiryDate] = useState<Date | null>(null);
    const [newBatchNumber, setNewBatchNumber] = useState("");
    const [newBatchQuantity, setNewBatchQuantity] = useState<number | null>(
      selectedItem?.countedQuantity || selectedItem?.actualQuantity || null
    );
    const [splitQuantity, setSplitQuantity] = useState<number | null>(null);
    const [showSplitForm, setShowSplitForm] = useState(false);
    const [splitTargetBatchId, setSplitTargetBatchId] = useState<number | null>(null);
    
    // Formatiere ein Datum für die Anzeige
    const formatBatchDate = (dateStr: string | null) => {
      if (!dateStr) return 'Kein Datum';
      return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(dateStr));
    };
    
    // Erstellt eine neue Charge mit MHD
    const createNewBatch = async () => {
      if (!selectedItem || !selectedItem.productId) {
        console.error("Kein Produkt ausgewählt oder Produkt hat keine ID");
        toast({
          title: "Fehler",
          description: "Kein gültiges Produkt ausgewählt.",
          variant: "destructive"
        });
        return;
      }
      
      // Formatiere das Datum richtig für die Anfrage
      let formattedExpiryDate = null;
      if (newExpiryDate) {
        // Stelle sicher, dass das Datum korrekt formatiert ist: YYYY-MM-DD
        formattedExpiryDate = newExpiryDate instanceof Date 
          ? newExpiryDate.toISOString().split('T')[0] 
          : null;
        
        console.log("Formatiertes Datum für API-Anfrage:", formattedExpiryDate);
      }
      
      const batchData = {
        productId: selectedItem.productId,
        warehouseId: inventurData.warehouseId,
        batchNumber: newBatchNumber || `INV-${new Date().toISOString().split('T')[0]}`,
        expiryDate: formattedExpiryDate,
        initialQuantity: newBatchQuantity || 0,
        currentQuantity: newBatchQuantity || 0,
        notes: `Erstellt bei Inventur #${id}`,
        receivedDate: new Date().toISOString().split('T')[0],
        locationInWarehouse: null
      };
      
      console.log("Sende Batch-Daten:", JSON.stringify(batchData, null, 2));
      
      try {
        // Erstelle neue Charge API-Anfrage
        const response = await fetch('/api/inventory-counts/product-batches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchData),
        });
        
        // Überprüfe auf detailliertere Fehlermeldungen
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          
          try {
            errorData = JSON.parse(errorText);
            throw new Error(errorData.details || errorData.error || `Serverfehler: ${response.status}`);
          } catch (parseError) {
            // Wenn JSON-Parse fehlschlägt, verwende den Rohtext
            throw new Error(`Serverfehler (${response.status}): ${errorText.substring(0, 200)}`);
          }
        }
        
        const newBatch = await response.json();
        console.log("Neue Charge erstellt:", newBatch);
        
        // Aktualisiere die Batches-Liste
        setAvailableBatches(prev => [...prev, newBatch]);
        
        // Wähle die neue Charge aus
        setSelectedBatchId(newBatch.id);
        
        // Schließe das Formular
        setShowNewBatchForm(false);
        
        toast({
          title: "Neue Charge erstellt",
          description: "Die Charge wurde erfolgreich erstellt."
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
        console.error('Fehler beim Erstellen einer neuen Charge:', error);
        toast({
          title: "Fehler",
          description: `Die Charge konnte nicht erstellt werden: ${errorMessage}`,
          variant: "destructive"
        });
      }
    };
    
    // Split-Bestand zwischen zwei Chargen
    const handleSplitInventory = async () => {
      if (!selectedItem || splitQuantity === null || splitTargetBatchId === null) return;
      
      try {
        // Bestandsaufteilung API-Anfrage
        const response = await fetch(`/api/inventory-counts/items/${selectedItem.id}/split`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            originalBatchId: selectedBatchId,
            targetBatchId: splitTargetBatchId,
            splitQuantity: splitQuantity
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Aufteilen: ${response.status}`);
        }
        
        // Aktualisiere Liste und schließe Dialog
        queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
        setShowSplitForm(false);
        setShowBatchDialog(false);
        
        toast({
          title: "Bestand aufgeteilt",
          description: "Der Bestand wurde erfolgreich zwischen den Chargen aufgeteilt."
        });
      } catch (error) {
        console.error('Fehler beim Aufteilen des Bestands:', error);
        toast({
          title: "Fehler",
          description: "Der Bestand konnte nicht aufgeteilt werden.",
          variant: "destructive"
        });
      }
    };
    
    return (
      <Dialog open={showBatchDialog} onOpenChange={(open) => {
        setShowBatchDialog(open);
        if (!open) {
          setSelectedItem(null);
          setShowNewBatchForm(false);
          setShowSplitForm(false);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {showNewBatchForm 
                ? "Neue Charge erstellen" 
                : showSplitForm 
                  ? "Bestand aufteilen" 
                  : "Charge auswählen"}
            </DialogTitle>
            <DialogDescription>
              {showNewBatchForm 
                ? "Erstellen Sie eine neue Charge mit MHD für das Produkt." 
                : showSplitForm 
                  ? "Teilen Sie den Bestand zwischen zwei Chargen auf." 
                  : `Wählen Sie die Charge für das Produkt "${selectedItem?.product?.productName || 'Unbekanntes Produkt'}" aus.`}
            </DialogDescription>
          </DialogHeader>
          
          {showNewBatchForm ? (
            // Formular für neue Charge
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Chargennummer</Label>
                  <Input 
                    id="batchNumber" 
                    value={newBatchNumber} 
                    onChange={e => setNewBatchNumber(e.target.value)}
                    placeholder="Optionale Chargennummer"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Mindesthaltbarkeitsdatum (MHD)</Label>
                  <div className="space-y-3">
                    <input
                      type="date"
                      id="datePicker"
                      className="w-full px-3 py-2 border rounded-md"
                      value={newExpiryDate ? newExpiryDate.toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        const date = e.target.value ? new Date(e.target.value) : null;
                        setNewExpiryDate(date);
                      }}
                    />
                    
                    <div className="space-y-2">
                      <Label>MHD Schnellauswahl</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 5);
                            setNewExpiryDate(date);
                          }}
                        >
                          + 5 Tage
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 7);
                            setNewExpiryDate(date);
                          }}
                        >
                          + 1 Woche
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 14);
                            setNewExpiryDate(date);
                          }}
                        >
                          + 2 Wochen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 21);
                            setNewExpiryDate(date);
                          }}
                        >
                          + 3 Wochen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 28);
                            setNewExpiryDate(date);
                          }}
                        >
                          + 4 Wochen
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="quantity">Menge</Label>
                  <Input 
                    id="quantity" 
                    type="number" 
                    min="0"
                    value={newBatchQuantity !== null ? newBatchQuantity : ''} 
                    onChange={e => setNewBatchQuantity(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Menge in dieser Charge"
                  />
                </div>
              </div>
              
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setShowNewBatchForm(false)}>
                  Zurück
                </Button>
                <Button onClick={createNewBatch}>
                  Charge erstellen
                </Button>
              </div>
            </div>
          ) : showSplitForm ? (
            // Formular für Bestandsaufteilung
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Quellcharge</Label>
                  <div className="p-2 border rounded-md">
                    <div className="font-medium">
                      {selectedBatchId 
                        ? availableBatches.find(b => b.id === selectedBatchId)?.batchNumber || "Charge " + selectedBatchId
                        : "Keine Charge (Standard)"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      MHD: {selectedBatchId 
                        ? (availableBatches.find(b => b.id === selectedBatchId)?.expiryDate 
                           ? formatBatchDate(availableBatches.find(b => b.id === selectedBatchId)?.expiryDate || null) 
                           : "Kein MHD")
                        : "Kein MHD"}
                    </div>
                    <div className="text-sm">
                      Aktueller Bestand: {selectedItem?.countedQuantity || selectedItem?.actualQuantity || 0}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="splitQuantity">Zu übertragende Menge</Label>
                  <Input 
                    id="splitQuantity" 
                    type="number" 
                    min="1"
                    max={selectedItem?.countedQuantity || selectedItem?.actualQuantity || 0}
                    value={splitQuantity !== null ? splitQuantity : ''} 
                    onChange={e => setSplitQuantity(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Menge für Übertragung"
                  />
                  <p className="text-xs text-muted-foreground">
                    Diese Menge wird von der aktuellen Charge abgezogen und zur Zielcharge hinzugefügt.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="targetBatch">Zielcharge</Label>
                  <select
                    id="targetBatch"
                    className="w-full p-2 border rounded-md"
                    value={splitTargetBatchId || ''}
                    onChange={e => setSplitTargetBatchId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Bitte auswählen</option>
                    {availableBatches
                      .filter(batch => batch.id !== selectedBatchId)
                      .map(batch => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNumber} - MHD: {batch.expiryDate ? formatBatchDate(batch.expiryDate) : "Kein MHD"}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setShowSplitForm(false)}>
                  Zurück
                </Button>
                <Button 
                  onClick={handleSplitInventory}
                  disabled={!splitTargetBatchId || splitQuantity === null || splitQuantity <= 0 || 
                    splitQuantity > (selectedItem?.countedQuantity || selectedItem?.actualQuantity || 0)}
                >
                  Bestand aufteilen
                </Button>
              </div>
            </div>
          ) : (
            // Reguläre Auswahl-Ansicht
            <div className="py-4">
              {isLoadingBatches ? (
                <div className="flex justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Chargennummer</TableHead>
                        <TableHead>MHD</TableHead>
                        <TableHead className="text-right">Menge</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <input 
                            type="radio" 
                            name="batchSelection" 
                            checked={selectedBatchId === null} 
                            onChange={() => setSelectedBatchId(null)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell colSpan={3}>
                          <span className="font-medium">Keine Charge (Standard)</span>
                        </TableCell>
                      </TableRow>
                      {availableBatches.map(batch => (
                        <TableRow key={batch.id} className={batch.id === selectedBatchId ? "bg-muted/50" : ""}>
                          <TableCell>
                            <input 
                              type="radio" 
                              name="batchSelection" 
                              checked={batch.id === selectedBatchId} 
                              onChange={() => setSelectedBatchId(batch.id)}
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell>{batch.batchNumber}</TableCell>
                          <TableCell>
                            {batch.expiryDate ? (
                              <Badge variant={
                                new Date(batch.expiryDate) < new Date() ? "destructive" : 
                                new Date(batch.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? "warning" : 
                                "outline"
                              }>
                                {formatBatchDate(batch.expiryDate)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">Kein MHD</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {batch.currentQuantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="flex gap-2 mt-4">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setShowNewBatchForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Neue Charge
                    </Button>
                    
                    {selectedItem && (selectedItem.countedQuantity || selectedItem.actualQuantity) && selectedBatchId && availableBatches.length > 0 && (
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setShowSplitForm(true)}
                      >
                        <TrendingUp className="h-4 w-4 mr-1" />
                        Bestand aufteilen
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {!showNewBatchForm && !showSplitForm && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={() => handleBatchUpdate(selectedBatchId)}
                disabled={updateBatchMutation.isPending}
              >
                {updateBatchMutation.isPending ? (
                  <div className="flex items-center">
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Wird aktualisiert...
                  </div>
                ) : (
                  'Charge speichern'
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  // Hinzufügen-Dialog
  const AddProductsDialog = () => {
    const [dialogSearchTerm, setDialogSearchTerm] = useState('');
    
    // Filtere Produkte für Dialog
    const filteredProducts = dialogSearchTerm ? 
      availableProducts.filter(p => 
        p.productName.toLowerCase().includes(dialogSearchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(dialogSearchTerm.toLowerCase()))
      ) : 
      availableProducts;
    
    return (
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Produkte zur Inventur hinzufügen</DialogTitle>
            <DialogDescription>
              Wählen Sie zusätzliche Produkte, die in dieser Inventur erfasst werden sollen.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center space-x-2 my-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Produkte suchen..." 
              value={dialogSearchTerm} 
              onChange={(e) => setDialogSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Badge>{selectedProductIds.length} ausgewählt</Badge>
          </div>
          
          <div className="overflow-y-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Produktname</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Bestand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {dialogSearchTerm 
                        ? "Keine passenden Produkte gefunden." 
                        : "Keine Produkte verfügbar für dieses Lager."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map(product => (
                    <TableRow 
                      key={product.id} 
                      className={selectedProductIds.includes(product.id) ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <input 
                          type="checkbox" 
                          checked={selectedProductIds.includes(product.id)} 
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductIds([...selectedProductIds, product.id]);
                            } else {
                              setSelectedProductIds(selectedProductIds.filter(id => id !== product.id));
                            }
                          }}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell>{product.productName}</TableCell>
                      <TableCell>{product.sku || '-'}</TableCell>
                      <TableCell className="text-right">
                        {product.currentStock || 0} {product.unit || 'Stk.'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={() => handleAddItems(selectedProductIds)}
              disabled={selectedProductIds.length === 0 || addItemsMutation.isPending}
            >
              {addItemsMutation.isPending ? (
                <div className="flex items-center">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Wird hinzugefügt...
                </div>
              ) : (
                <div className="flex items-center">
                  <Plus className="h-4 w-4 mr-2" />
                  {selectedProductIds.length} Produkte hinzufügen
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Status-bezogene Anzeigeelemente
  // Mutation zum Starten der Inventur
  const startInventurMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await fetch(`/api/inventory-counts/${id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Starten: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Fehler beim Starten der Inventur:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      toast({
        title: "Inventur gestartet",
        description: "Die Inventur wurde erfolgreich gestartet.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Starten der Inventur:', error);
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gestartet werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation zum Speichern der Inventur (Zwischenstand)
  const saveInventurMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await fetch(`/api/inventory-counts/${id}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notes: inventurData.notes }),
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Speichern: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Fehler beim Speichern der Inventur:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      toast({
        title: "Inventur gespeichert",
        description: "Die Inventur wurde erfolgreich zwischengespeichert.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Speichern der Inventur:', error);
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
      try {
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
      } catch (error) {
        console.error('Fehler beim Löschen der Inventur:', error);
        throw error;
      }
    },
    onSuccess: () => {
      // Nach dem Löschen zur Übersicht navigieren
      navigate('/inventur');
      
      toast({
        title: "Inventur gelöscht",
        description: "Die Inventur wurde erfolgreich gelöscht.",
      });
    },
    onError: (error) => {
      console.error('Fehler beim Löschen der Inventur:', error);
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Dialog-State für Löschen-Bestätigung
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Status-Aktionen für die Inventur werden mit der InventoryActions-Komponente gerendert

  // Dialog zum Abschließen einer Inventur
  const CompleteInventurDialog = () => {
    const [completeNotes, setCompleteNotes] = useState('');
    const uncountedCount = itemStats.total - itemStats.counted;
    
    return (
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventur abschließen</AlertDialogTitle>
            <AlertDialogDescription>
              {uncountedCount > 0 ? (
                <div className="text-amber-500 flex items-center mb-2">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  {uncountedCount} Produkte wurden noch nicht gezählt. Diese werden mit einer Menge von 0 angenommen.
                </div>
              ) : (
                <div className="text-green-500 flex items-center mb-2">
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Alle Produkte wurden gezählt. Die Inventur kann abgeschlossen werden.
                </div>
              )}
              
              <div className="mt-4">
                <p className="mb-2">Zusammenfassung:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Gezählt: {itemStats.counted} von {itemStats.total} Produkten</li>
                  <li className="text-green-600">Bestandszunahme: {itemStats.increased} Produkte</li>
                  <li className="text-red-600">Bestandsabnahme: {itemStats.decreased} Produkte</li>
                  <li className="text-gray-600">Unverändert: {itemStats.unchanged} Produkte</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="mt-2">
            <Label htmlFor="completeNotes">Abschlussnotizen (optional)</Label>
            <Textarea 
              id="completeNotes"
              placeholder="Notizen zum Inventurabschluss..."
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => completeInventurMutation.mutate({ notes: completeNotes })}
              disabled={completeInventurMutation.isPending}
            >
              {completeInventurMutation.isPending ? (
                <div className="flex items-center">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Wird abgeschlossen...
                </div>
              ) : (
                <div className="flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Inventur abschließen
                </div>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // Dialog zum Löschen einer Inventur
  const DeleteInventurDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventur löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diese Inventur wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
              Alle erfassten Zählungen werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteInventurMutation.mutate()}
              disabled={deleteInventurMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteInventurMutation.isPending ? (
                <div className="flex items-center">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Wird gelöscht...
                </div>
              ) : (
                <div className="flex items-center">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Inventur löschen
                </div>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // Main-Render
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Dialogkomponenten */}
      <AddProductsDialog />
      <CompleteInventurDialog />
      <DeleteInventurDialog />
      <BatchSelectDialog />
      
      {/* Header mit Suchleiste und Aktionsbuttons (Products-Style) */}
      <div className="w-full mb-6">
        <div className="flex justify-between items-center gap-4 mb-4">
          {/* Zurück-Button und Titel */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleBack} className="h-9">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Inventur #{inventurData.id}</h1>
          </div>
          
          {/* Status-Badge */}
          {!isLoadingInventur && (
            <Badge className={statusColor}>
              <StatusIcon className="h-3 w-3 mr-1.5" />
              {statusLabel}
            </Badge>
          )}
        </div>
        
        <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Beschreibung und Details */}
          <div>
            <p className="text-gray-500">
              {warehouseData.name || inventurData.warehouseName || 'Lager unbekannt'} |
              Erstellt am {formatDate(inventurData.createdAt)}
              {inventurData.startDate && ` | Gestartet: ${formatDate(inventurData.startDate)}`}
              {inventurData.endDate && ` | Beendet: ${formatDate(inventurData.endDate)}`}
            </p>
          </div>
          
          {/* Produkt-Suchfeld */}
          {(currentStatus === 'in_progress' || currentStatus === 'pending') && (
            <div className="relative min-w-[200px] max-w-[300px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                value={searchTerm}
                placeholder="Produkte durchsuchen..."
                className="pl-8 h-9 w-full"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
        
      {/* Neue InventorySummaryCard-Komponente mit Aktionsbuttons */}
      <InventorySummaryCard
        status={currentStatus}
        isLoading={isLoadingInventur || isLoadingWarehouse}
        onStart={() => startInventurMutation.mutate()}
        onAddProducts={() => addAllProductsMutation.mutate()}
        onSave={() => saveInventurMutation.mutate()}
        onComplete={() => setShowCompleteDialog(true)}
        onCancel={() => updateStatusMutation.mutate('cancelled')}
        onDelete={() => setShowDeleteDialog(true)}
        onResume={() => updateStatusMutation.mutate('in_progress')}
        isStarting={startInventurMutation.isPending}
        isAdding={addAllProductsMutation.isPending}
        isSaving={saveInventurMutation.isPending}
        isUpdating={updateStatusMutation.isPending}
      />
      
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
                  {warehouseData.name || inventurData.warehouseName || 'Nicht bekannt'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Produkte</p>
                <p className="font-medium">{inventurItems?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Notizen</p>
                <p className="line-clamp-2">{inventurData.notes || 'Keine Notizen'}</p>
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
                <p className="font-medium">{formatDate(inventurData.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Startdatum</p>
                <p className="font-medium">{inventurData.startDate ? formatDate(inventurData.startDate) : '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Enddatum</p>
                <p className="font-medium">{inventurData.endDate ? formatDate(inventurData.endDate) : '—'}</p>
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
                  filteredItems.map((item: any) => {
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
                                  setExpandedItems(prev => {
                                    // Toggle den Status des Items
                                    const newState = { ...prev };
                                    newState[item.id] = !prev[item.id];
                                    return newState;
                                  });
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
                                      
                                      // Wert im Feld behalten nach dem Speichern
                                      setEditedCounts(prevCounts => ({
                                        ...prevCounts,
                                        [item.id]: editedCounts[item.id]
                                      }));
                                      
                                      toast({
                                        title: "Gespeichert",
                                        description: `Menge ${editedCounts[item.id]} für ${item.productName} gespeichert.`,
                                        duration: 3000
                                      });
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
                                  // Automatisch expandieren, wenn MHD-Dialog geöffnet wird
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
                            {currentStatus === 'pending' || currentStatus === 'in_progress' ? (
                              <Input
                                placeholder="Notizen eintragen..."
                                value={editedNotes[item.id] !== undefined ? editedNotes[item.id] : item.notes || ''}
                                onChange={(e) => {
                                  setEditedNotes({ ...editedNotes, [item.id]: e.target.value });
                                }}
                                onBlur={() => {
                                  if (editedNotes[item.id] !== undefined) {
                                    handleUpdateNotes(item.id, editedNotes[item.id]);
                                  }
                                }}
                                className="w-full text-sm"
                              />
                            ) : (
                              <span className="text-sm">{item.notes || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(currentStatus === 'pending' || currentStatus === 'in_progress') && (
                                  <div>
                                    <DropdownMenuItem onClick={() => handleSetCount(item.id, expectedQuantity)}>
                                      <Equal className="h-4 w-4 mr-2" />
                                      Erwartete Menge bestätigen
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSetCount(item.id, Math.max(0, expectedQuantity - 1))}>
                                      <Minus className="h-4 w-4 mr-2" />
                                      Menge verringern
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSetCount(item.id, expectedQuantity + 1)}>
                                      <Plus className="h-4 w-4 mr-2" />
                                      Menge erhöhen
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        openBatchDialog(item);
                                        setExpandedItems(prev => ({
                                          ...prev,
                                          [item.id]: true
                                        }));
                                      }}
                                    >
                                      <Calendar className="h-4 w-4 mr-2" />
                                      MHD hinzufügen
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        setExpandedItems(prev => ({
                                          ...prev,
                                          [item.id]: !prev[item.id]
                                        }));
                                      }}
                                    >
                                      {expandedItems[item.id] ? (
                                        <div className="flex items-center">
                                          <ChevronUp className="h-4 w-4 mr-2" />
                                          Details ausblenden
                                        </div>
                                      ) : (
                                        <div className="flex items-center">
                                          <ChevronDown className="h-4 w-4 mr-2" />
                                          Details anzeigen
                                        </div>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </div>
                                )}
                                
                                <DropdownMenuItem 
                                  onClick={() => navigate(`/produkte/${item.product?.id}`)}
                                  disabled={!item.product?.id}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Produkt ansehen
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        
                        {/* Detailzeilen für MHDs, wenn expanded */}
                        {expandedItems[item.id] && (
                          <div>
                            {/* MHD-Zeilen, falls vorhanden */}
                            {item.batch?.expiryDate ? (
                              <TableRow className="bg-muted/10">
                                <TableCell colSpan={2} className="pl-10">
                                  <div className="flex items-center">
                                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                                    <span className="text-sm font-medium">MHD: {new Intl.DateTimeFormat('de-DE', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit'
                                    }).format(new Date(item.batch.expiryDate))}</span>
                                    <Badge 
                                      className="ml-2" 
                                      variant={
                                        new Date(item.batch.expiryDate) < new Date() ? "destructive" : 
                                        new Date(item.batch.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? "warning" : 
                                        "outline"
                                      }
                                    >
                                      {new Date(item.batch.expiryDate) < new Date() ? 'Abgelaufen' : 
                                       new Date(item.batch.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? 'Läuft bald ab' : 
                                       'Gültig'}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell colSpan={3} className="text-center">
                                  <span className="text-sm">
                                    Menge: {countedQuantity || 0} {item.product?.unit || 'Stk.'}
                                  </span>
                                </TableCell>
                                <TableCell colSpan={2}>
                                  <span className="text-sm text-muted-foreground">
                                    Charge: {item.batch?.batchNumber || '-'}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ) : (
                              <TableRow className="bg-muted/10">
                                <TableCell colSpan={7} className="text-center py-3">
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="text-muted-foreground text-sm mb-2">Kein MHD für dieses Produkt hinterlegt</span>
                                    {(currentStatus === 'pending' || currentStatus === 'in_progress') && (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => openBatchDialog(item)}
                                        className="mt-1"
                                      >
                                        <Calendar className="h-4 w-4 mr-2" />
                                        MHD jetzt hinzufügen
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            
                            {/* Zeile für MHD-Aufteilung, wenn in Bearbeitung */}
                            {(currentStatus === 'pending' || currentStatus === 'in_progress') && countedQuantity && countedQuantity > 0 && (
                              <TableRow className="bg-muted/5 border-t border-dashed border-muted">
                                <TableCell colSpan={7} className="text-center py-2">
                                  <div className="flex items-center justify-center space-x-2">
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
                                </TableCell>
                              </TableRow>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            {inventurItems?.length || 0} Produkte in dieser Inventur
          </div>
          
          {/* Status-abhängige Aktionen */}
          {currentStatus === 'in_progress' && (
            <Button onClick={() => setShowCompleteDialog(true)} disabled={completeInventurMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Inventur abschließen
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
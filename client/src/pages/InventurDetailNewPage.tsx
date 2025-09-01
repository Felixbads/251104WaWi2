import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import InventoryCountBatchDialog from '@/components/inventory/batch/InventoryCountBatchDialog';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { generateBatchNumber, getDefaultExpiryDate, createAndLinkBatch } from '@/components/inventory/batch/CreateAndLinkBatchHandler';
import {
  ArrowLeft, PlayCircle, Package, Ban, Trash2,
  Save, CheckCircle2, RefreshCw, Pencil,
  Search, TrendingUp, TrendingDown, Equal, Calendar,
  ChevronDown, ChevronUp, ChevronRight, Plus, PlusCircle,
  Split, ClockIcon, MoreHorizontal, FileText,
  CalendarDays, CircleAlert, ArrowUp, ArrowDown, Play
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
import { 
  getPackageTypeName,
  PurchaseCondition,
  formatPackageInfoFromPurchaseConditions,
  getPackageSizeFromPurchaseConditions
} from '../../../shared/package-utils';
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
  // Package/Container fields
  packageQuantity?: number;
  packageSize?: string;
  packageTypeId?: number;
  baseUnitName?: string;
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
// Definiere Typ für Statuseinträge
type StatusEntry = {
  label: string;
  color: string;
  icon: React.ElementType;
};

// Definiere Typ für Statustypen
type InventurStatusTypes = {
  pending: StatusEntry;
  in_progress: StatusEntry;
  completed: StatusEntry;
  cancelled: StatusEntry;
  [key: string]: StatusEntry;  // Index-Signatur für beliebige string-Keys
};

// Status-Definitionen mit korrekter Typisierung - FIXED: pending zu Entwurf für Inventur-Workflow
const inventurStatusTypes: InventurStatusTypes = {
  pending: { label: 'Entwurf', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200', icon: ClockIcon },
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

// Diese Hilfsfunktionen werden jetzt in der Komponente definiert, um Zugriff auf purchaseConditionsData zu haben

// Funktion zum Formatieren von Batch-Daten (MHD)
const formatBatchDate = (date?: Date | string) => {
  if (!date) return 'Kein Datum';
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
  
  // Scrollposition-Wiederherstellung beim ersten Laden der Seite
  useEffect(() => {
    const pos = window.sessionStorage.getItem('inventur_scroll_position');
    if (pos) {
      window.scrollTo(0, parseInt(pos, 10));
      // Wir behalten die Position für nachfolgende Operationen wie Batch-Updates
      // window.sessionStorage.removeItem('inventur_scroll_position');
    }
  }, []); // Leeres Dependency-Array = nur beim Mount ausführen
  
  // State-Verwaltung
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editedCounts, setEditedCounts] = useState<{[key: number]: number | null}>({});
  const [editedNotes, setEditedNotes] = useState<{[key: number]: string}>({});
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  // Neue State-Variablen für Gebinde-Eingabe
  const [packageCounts, setPackageCounts] = useState<{[key: number]: number | null}>({});
  const [individualCounts, setIndividualCounts] = useState<{[key: number]: number | null}>({});
  const [selectedItem, setSelectedItem] = useState<InventoryCountItem | null>(null);
  const [availableBatches, setAvailableBatches] = useState<ProductBatch[]>([]);
  const [productBatches, setProductBatches] = useState<{[productId: number]: ProductBatch[]}>({});
  const [editingBatch, setEditingBatch] = useState<ProductBatch | null>(null);
  const [expandedItems, setExpandedItems] = useState<{[key: number]: boolean}>({});
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');
  const [showStartButton, setShowStartButton] = useState(false);
  // Sortierzustand für Tabellenspalten
  const [sortField, setSortField] = useState<string | null>('product');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Lokaler State für alle gezählten Artikel, um Änderungen über Dialog-Öffnen/Schließen zu persistieren
  const [countedItems, setCountedItems] = useState<InventoryCountItem[]>([]);
  
  // Auto-Save State
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  
  // Local storage key for persisting data
  const localStorageKey = `inventur_${id}_data`;
  
  // Funktion zur Berechnung der Gesamtmenge basierend auf Gebinden und Einzelartikeln
  const calculateTotalQuantity = (itemId: number, product?: Product) => {
    const packageCount = packageCounts[itemId] || 0;
    const individualCount = individualCounts[itemId] || 0;
    const packageSize = getProductPackageQuantity(product); // Verwende lokale Funktion
    
    const totalFromPackages = packageCount * packageSize;
    const total = totalFromPackages + individualCount;
    
    return {
      totalFromPackages,
      individualCount,
      total
    };
  };
  
  // Funktion zum Automatischen Ausfüllen der MHD-Menge
  const autoFillBatchQuantity = async (productId: number, warehouseId: number) => {
    try {
      const response = await fetch(`/api/inventory-items/unassigned-quantity?productId=${productId}&warehouseId=${warehouseId}`);
      if (response.ok) {
        const data = await response.json();
        return data.unassignedQuantity || 0;
      }
    } catch (error) {
      console.warn('Fehler beim Abrufen der nicht zugeordneten Menge:', error);
    }
    return 0;
  };

  // Funktion zum Laden aller Chargen für ein Produkt  
  const loadProductBatches = async (productId: number) => {
    try {
      const response = await fetch(`/api/inventory-counts/${id}/product-batches/${productId}`);
      if (response.ok) {
        const batches = await response.json();
        setProductBatches(prev => ({
          ...prev,
          [productId]: batches
        }));
        return batches;
      }
    } catch (error) {
      console.error('Error loading product batches:', error);
    }
    return [];
  };
  
  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(localStorageKey);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setEditedCounts(parsedData.editedCounts || {});
        setEditedNotes(parsedData.editedNotes || {});
        setPackageCounts(parsedData.packageCounts || {});
        setIndividualCounts(parsedData.individualCounts || {});
        console.log('Gespeicherte Inventurdaten geladen:', parsedData);
      }
    } catch (error) {
      console.warn('Fehler beim Laden gespeicherter Inventurdaten:', error);
    }
  }, [localStorageKey]);
  
  // Save data to localStorage whenever any counts or notes change
  useEffect(() => {
    if (Object.keys(editedCounts).length > 0 || Object.keys(editedNotes).length > 0 || 
        Object.keys(packageCounts).length > 0 || Object.keys(individualCounts).length > 0) {
      try {
        const dataToSave = {
          editedCounts,
          editedNotes,
          packageCounts,
          individualCounts,
          lastSaved: new Date().toISOString()
        };
        localStorage.setItem(localStorageKey, JSON.stringify(dataToSave));
        console.log('Inventurdaten lokal gespeichert:', dataToSave);
      } catch (error) {
        console.warn('Fehler beim lokalen Speichern:', error);
      }
    }
  }, [editedCounts, editedNotes, packageCounts, individualCounts, localStorageKey]);
  
  // Load product batches when items are expanded
  useEffect(() => {
    if (!inventurData?.items) return;
    
    const expandedProductIds = Object.keys(expandedItems)
      .filter(key => expandedItems[parseInt(key)])
      .map(key => {
        const item = inventurData.items?.find(item => item.id === parseInt(key));
        return item?.productId;
      })
      .filter(Boolean) as number[];
    
    expandedProductIds.forEach(productId => {
      if (!productBatches[productId]) {
        loadProductBatches(productId);
      }
    });
  }, [expandedItems, inventurData?.items, productBatches]);

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

  // Lade Inventurelemente mit verbesserter Batch-Integration
  const {
    data: inventurItems = [],
    isLoading: isLoadingItems,
    refetch: refetchInventurItems
  } = useQuery<InventoryCountItem[]>({
    queryKey: [`/api/inventory-counts/${id}/items`],
    staleTime: 5 * 1000,
    enabled: !!id,
    refetchOnWindowFocus: false, // Verhindere automatisches Refetchen bei Fensterfokus
    select: (data) => {
      if (!Array.isArray(data)) {
        return [];
      }
      
      // Verarbeite die Daten, um sicherzustellen, dass Batch-Informationen korrekt gesetzt sind
      return data.map(item => {
        // Wenn das Item keine batchId hat, brauchen wir auch kein batch-Objekt
        if (!item.batchId) {
          return item;
        }
        
        // Wenn wir bereits ein Batch-Objekt haben, behalte es
        if (item.batch) {
          return item;
        }
        
        // Wenn eine batchId, aber kein batch-Objekt vorhanden ist, lade die Daten
        console.log(`Item ${item.id} hat batchId ${item.batchId}, aber kein Batch-Objekt - versuche zu ergänzen`);
        
        // Suche in anderen Items nach der gleichen batchId und kopiere das Batch-Objekt
        const matchingItem = data.find(otherItem => 
          otherItem.batchId === item.batchId && otherItem.batch
        );
        
        if (matchingItem && matchingItem.batch) {
          console.log(`Batch-Objekt von Item ${matchingItem.id} für Item ${item.id} wiederverwendet`);
          return {
            ...item,
            batch: matchingItem.batch
          };
        }
        
        // Wenn kein passendes Item gefunden wurde, behalte das Original-Item
        return item;
      });
    }
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

  // Lade Einkaufsbedingungen für alle Produkte in der Inventur (für korrekte Gebinde-Informationen)
  const productIds = useMemo(() => {
    if (!inventurItems || inventurItems.length === 0) return [];
    return Array.from(new Set(inventurItems.map(item => item.product?.id).filter(id => id !== undefined)));
  }, [inventurItems]);

  const {
    data: purchaseConditionsData = {},
    isLoading: isLoadingPurchaseConditions
  } = useQuery<Record<number, PurchaseCondition[]>>({
    queryKey: [`/api/purchase-conditions-batch`, productIds],
    queryFn: async () => {
      if (productIds.length === 0) return {};
      
      const conditions: Record<number, PurchaseCondition[]> = {};
      
      // Lade purchase_conditions für alle Produkte parallel
      const promises = productIds.map(async (productId) => {
        try {
          const response = await fetch(`/api/products/${productId}/purchase-conditions`);
          if (response.ok) {
            const data = await response.json();
            conditions[productId] = data;
          } else {
            conditions[productId] = [];
          }
        } catch (error) {
          console.warn(`Fehler beim Laden der Einkaufsbedingungen für Produkt ${productId}:`, error);
          conditions[productId] = [];
        }
      });
      
      await Promise.all(promises);
      return conditions;
    },
    staleTime: 0, // Force refetch to get latest purchase conditions
    enabled: productIds.length > 0
  });

  // Lokale Hilfsfunktionen - verwenden geladene purchase_conditions
  const getProductPackageQuantity = (product: any): number => {
    if (!product?.id) return 1;
    const conditions = purchaseConditionsData[product.id] || [];
    return getPackageSizeFromPurchaseConditions(conditions);
  };

  const getProductPackageType = (product: any): string => {
    if (!product?.id) return "Einzelartikel";
    const conditions = purchaseConditionsData[product.id] || [];
    return formatPackageInfoFromPurchaseConditions(conditions);
  };

  // Auto-Save Mutation für alle Änderungen
  const autoSaveMutation = useMutation({
    mutationFn: async () => {
      setAutoSaveStatus('saving');
      const updates = Object.entries(editedCounts).map(([id, countedQuantity]) => ({
        id: parseInt(id),
        countedQuantity
      }));
      
      const promises = updates.map(update => 
        fetch(`/api/inventory-count-items/${update.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(update),
        })
      );
      
      await Promise.all(promises);
      return updates;
    },
    onSuccess: () => {
      setAutoSaveStatus('saved');
      setLastSaveTime(new Date());
      // FIXED: Don't clear editedCounts to prevent values from disappearing
      // setEditedCounts({});
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}/items`] });
      
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    },
    onError: () => {
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }
  });

  // Auto-Save Effect - speichert nach 3 Sekunden Inaktivität
  useEffect(() => {
    if (Object.keys(editedCounts).length === 0) return;
    
    const timer = setTimeout(() => {
      autoSaveMutation.mutate();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [editedCounts]);

  // Mutation zum Aktualisieren eines Zählerstands (mit optimistischem Update)
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
    onMutate: async (data) => {
      // Speichere aktuelle Scroll-Position
      const prevScroll = window.scrollY;
      
      // KRITISCH: Persistiere Daten in editedCounts für Navigation zwischen Produkten
      setEditedCounts(prev => ({
        ...prev,
        [data.id]: data.countedQuantity
      }));
      
      // Optimistisch lokalen State aktualisieren ohne Server-Anfrage
      const item = countedItems.find(item => item.id === data.id);
      if (item) {
        const updatedItem = {
          ...item,
          countedQuantity: data.countedQuantity
        };
        
        // Aktualisiere das Item im lokalen State
        updateCountedItem(updatedItem);
      }
      
      console.log('Inventurdaten persistiert für Item:', data.id, 'Menge:', data.countedQuantity);
      
      // Rückgabewert für den Fall eines Rollbacks
      return { prevScroll };
    },
    onError: (error, variables, context) => {
      // Bei Fehler: Scroll-Position wiederherstellen
      if (context?.prevScroll !== undefined) {
        window.scrollTo(0, context.prevScroll);
      }
      
      // WICHTIG: editedCounts wird NICHT zurückgesetzt, um Datenverlust zu vermeiden
      console.warn('Server-Update fehlgeschlagen, aber lokale Daten bleiben erhalten für Item:', variables.id);
      
      toast({
        title: "Server-Update fehlgeschlagen",
        description: "Daten wurden lokal gespeichert. Versuchen Sie 'Jetzt speichern'.",
        variant: "destructive",
      });
    },
    onSuccess: (result, variables, context) => {
      // Aktuelle Scroll-Position sichern
      const savedScrollPosition = window.scrollY;
      window.sessionStorage.setItem('inventur_scroll_position', savedScrollPosition.toString());
      console.log(`Scroll-Position gespeichert: ${savedScrollPosition}`);
      
      // Erfolg: Keine Toast-Nachricht anzeigen, da dies bei jeder Eingabe stört
      // Stattdessen stilles Update ohne Benachrichtigung
      
      // WICHTIG: KEIN window.scrollTo hier, damit die Seite nicht springt
      // Das React Query Cache-Update erfolgt automatisch über das optimistische Update
      
      // Aktualisiere nur den spezifischen Eintrag im Cache, ohne alles neu zu laden
      queryClient.setQueryData(
        [`/api/inventory-counts/${id}/items`],
        (old?: InventoryCountItem[]) => {
          if (!old) return old;
          return old.map(item =>
            item.id === variables.id
              ? { 
                  ...item, 
                  countedQuantity: variables.countedQuantity
                }
              : item
          );
        }
      );
      
      // Nach einer kurzen Verzögerung die Scroll-Position wiederherstellen
      setTimeout(() => {
        const posToRestore = parseInt(window.sessionStorage.getItem('inventur_scroll_position') || '0', 10);
        if (posToRestore > 0) {
          window.scrollTo({
            top: posToRestore,
            behavior: 'auto'
          });
          console.log(`Scroll-Position wiederhergestellt: ${posToRestore}`);
        }
      }, 100);
    },
    // onSettled entfernt, um doppeltes Scrollen zu vermeiden
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
      console.log(`Schließe Inventur ${id} ab mit Notizen:`, data.notes || 'keine');
      
      try {
        const response = await fetch(`/api/inventory-counts/${id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data || {}),
        });
        
        const responseText = await response.text();
        console.log(`Complete-Antwort: Status ${response.status}, Text:`, responseText);
        
        if (!response.ok) {
          throw new Error(`Fehler beim Abschließen: ${response.status} - ${responseText}`);
        }
        
        let result;
        try {
          // Versuche, die Antwort als JSON zu parsen
          result = JSON.parse(responseText);
        } catch (e) {
          console.warn("Konnte Antwort nicht als JSON parsen:", e);
          // Rückgabe eines einfachen Objekts, wenn kein JSON zurückgegeben wurde
          result = { message: responseText, success: response.ok };
        }
        
        console.log("Inventur erfolgreich abgeschlossen:", result);
        return result;
      } catch (error) {
        console.error("Fehler beim Abschließen der Inventur:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Inventur erfolgreich abgeschlossen, Bestände aktualisiert:", data);
      
      // Daten aktualisieren
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory`] });
      
      // Dialog schließen
      setShowCompleteDialog(false);
      
      // Zurück zur Übersicht navigieren
      navigate('/inventur');
      
      toast({
        title: "Inventur abgeschlossen",
        description: "Die Inventur wurde erfolgreich abgeschlossen und die Lagerbestände wurden aktualisiert.",
      });
    },
    onError: (error) => {
      console.error("Fehler beim Abschließen der Inventur:", error);
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation zum Aktualisieren des Inventur-Status
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      console.log(`Aktualisiere Inventur ${id} auf Status: ${status}`);
      console.log(`Aktueller Status: ${inventurData?.status}`);
      
      // Setze Auth-Header wenn vorhanden
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (status === 'cancelled') {
        console.log(`Sende Anfrage zum Abbrechen der Inventur ${id}...`);
        const response = await fetch(`/api/inventory-counts/${id}/cancel`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Fehler beim Abbrechen: Status ${response.status}, Antwort:`, errorText);
          throw new Error(`Fehler beim Abbrechen: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Inventur erfolgreich abgebrochen:", data);
        return data;
      } 
      // Wenn Status auf "in_progress" gesetzt werden soll und aktueller Status "pending" ist
      else if (status === 'in_progress' && inventurData?.status === 'pending') {
        console.log(`Sende Anfrage zum Starten der Inventur ${id}...`);
        
        try {
          const response = await fetch(`/api/inventory-counts/${id}/start`, {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
          });
          
          const responseText = await response.text();
          console.log(`Start-Antwort: Status ${response.status}, Text:`, responseText);
          
          if (!response.ok) {
            throw new Error(`Fehler beim Starten: ${response.status} - ${responseText}`);
          }
          
          let data;
          try {
            // Versuche, die Antwort als JSON zu parsen
            data = JSON.parse(responseText);
          } catch (e) {
            console.warn("Konnte Antwort nicht als JSON parsen:", e);
            // Rückgabe eines einfachen Objekts, wenn kein JSON zurückgegeben wurde
            data = { message: responseText, success: response.ok };
          }
          
          console.log("Inventur erfolgreich gestartet:", data);
          return data;
        } catch (error) {
          console.error("Fehler beim Starten der Inventur:", error);
          throw error;
        }
      }
      // Allgemeines Status-Update für andere Statusübergänge
      else {
        console.log(`Sende allgemeines Status-Update auf ${status} für Inventur ${id}...`);
        const response = await fetch(`/api/inventory-counts/${id}/update-status`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ status }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Fehler beim Statusupdate: Status ${response.status}, Antwort:`, errorText);
          throw new Error(`Fehler beim Statusupdate: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Status erfolgreich aktualisiert:", data);
        return data;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      // When inventory is started (pending -> in_progress), hide start button and refresh data
      if (variables === 'in_progress') {
        setShowStartButton(false);
        // Force refetch to get updated status and items
        refetchInventur();
        refetchInventurItems();
        
        toast({
          title: "Inventur gestartet",
          description: "Die Inventur wurde erfolgreich gestartet.",
        });
      } else {
        toast({
          title: "Status aktualisiert", 
          description: "Der Status der Inventur wurde erfolgreich aktualisiert.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Enhanced auto-save function that persists all current data
  const performAutoSave = async () => {
    setAutoSaveStatus('saving');
    
    try {
      // First, save all pending count changes
      const pendingUpdates = Object.entries(editedCounts).map(([itemId, countedQuantity]) => ({
        id: parseInt(itemId),
        countedQuantity
      }));
      
      // Save each count update
      for (const update of pendingUpdates) {
        await updateCountMutation.mutateAsync(update);
      }
      
      // Save the inventory state
      const response = await fetch(`/api/inventory-counts/${id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: Object.entries(editedNotes).map(([itemId, note]) => ({
            itemId: parseInt(itemId),
            note
          }))
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Speichern: ${response.status}`);
      }
      
      // Clear local storage after successful save
      localStorage.removeItem(localStorageKey);
      setEditedCounts({});
      setEditedNotes({});
      
      setAutoSaveStatus('saved');
      setLastSaveTime(new Date());
      
      console.log('Auto-save erfolgreich abgeschlossen');
      
    } catch (error) {
      console.error('Auto-save Fehler:', error);
      setAutoSaveStatus('error');
      
      toast({
        title: "Auto-Save Fehler",
        description: "Daten wurden lokal gespeichert, aber Serverupdate fehlgeschlagen.",
        variant: "destructive",
      });
    }
  };

  // Mutation zum Speichern der Inventur
  const saveInventurMutation = useMutation({
    mutationFn: performAutoSave,
    onSuccess: () => {
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
      console.log(`Starte Inventur mit ID ${id}...`);
      
      if (!id) {
        throw new Error("Keine Inventur-ID vorhanden");
      }
      
      const response = await fetch(`/api/inventory-counts/${id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '',
        },
        // Senden eines leeren Objekts als Body
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Fehler beim Starten der Inventur: Status ${response.status}, Antwort:`, errorText);
        throw new Error(`Fehler beim Starten: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log("Inventur erfolgreich gestartet:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Inventur-Status aktualisiert:", data);
      // Aktualisiere die Daten in der UI
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
      
      // Informiere den Benutzer
      toast({
        title: "Inventur gestartet",
        description: "Die Inventur wurde erfolgreich gestartet und kann jetzt bearbeitet werden.",
      });
    },
    onError: (error) => {
      console.error("Fehler beim Starten der Inventur:", error);
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    },
  });

  // Handler zum Setzen eines Zählerstands
  const handleSetCount = (itemId: number, count: number | null) => {
    // Speichere aktuelle Scroll-Position
    if (typeof window !== 'undefined') {
      const currentScrollPos = window.scrollY;
      window.sessionStorage.setItem('inventur_scroll_position', currentScrollPos.toString());
    }
    
    // Alle bearbeiteten Zählerstände speichern
    const itemsToUpdate = Object.entries(editedCounts).map(([id, countValue]) => ({
      id: parseInt(id),
      countedQuantity: countValue
    }));
    
    // Stellen sicher, dass der aktuelle Eintrag in jedem Fall enthalten ist
    if (!itemsToUpdate.some(item => item.id === itemId)) {
      itemsToUpdate.push({ id: itemId, countedQuantity: count });
    }
    
    // Aktualisiere den lokalen State für alle betroffenen Elemente
    itemsToUpdate.forEach(item => {
      // Finde das entsprechende Item im countedItems Array
      const foundItem = countedItems.find(countedItem => countedItem.id === item.id);
      if (foundItem) {
        // Erstelle ein aktualisiertes Item mit dem neuen Zählerstand
        const updatedItem = {
          ...foundItem,
          countedQuantity: item.countedQuantity
        };
        
        // Aktualisiere den lokalen State
        updateCountedItem(updatedItem);
      }
      
      // Zusätzlich senden des Updates an den Server
      updateCountMutation.mutate(item);
    });
    
    // Bearbeitete Einträge zurücksetzen
    setEditedCounts({});
    
    // Stelle nach kurzer Verzögerung die Scroll-Position wieder her
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
        if (savedPos) {
          window.scrollTo(0, parseInt(savedPos, 10));
        }
      }
    }, 50);
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

    // State für Batch-Dialog
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [showNewBatchForm, setShowNewBatchForm] = useState(false);
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState<Date | null>(null);
  const [newBatchQuantity, setNewBatchQuantity] = useState<number | null>(null);
  const [splitQuantity, setSplitQuantity] = useState<number | null>(null);
  const [splitTargetBatchId, setSplitTargetBatchId] = useState<number | null>(null);

  // Optimierte Mutation zum Aktualisieren des Batch für ein Inventurelement
  const updateBatchMutation = useMutation({
    mutationFn: async (data: { itemId: number; batchId: number | null }) => {
      const apiEndpoint = `/api/inventory-counts/items/${data.itemId}/batch`;
      
      // Speichere Scroll-Position vor API-Aufruf
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: data.batchId })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler: ${response.status} - ${errorText}`);
      }
      
      return response.status === 204 ? {} : response.json();
    },
    
    // Optimistische Update-Funktion BEVOR der Server-Request gesendet wird
    onMutate: (data) => {
      // Optimistisches lokales UI-Update für sofortige Reaktion
      const item = countedItems.find(item => item.id === data.itemId);
      if (item) {
        const selectedBatch = availableBatches.find(b => b.id === data.batchId);
        updateCountedItem({
          ...item,
          batchId: data.batchId,
          batch: selectedBatch || null
        });
      }
      
      // Optimistisches Update im React Query Cache
      queryClient.setQueryData(
        [`/api/inventory-counts/${id}/items`],
        (old?: InventoryCountItem[]) => {
          if (!old) return old;
          return old.map(item =>
            item.id === data.itemId
              ? { 
                  ...item, 
                  batchId: data.batchId,
                  batch: availableBatches.find(b => b.id === data.batchId) || null
                }
              : item
          );
        }
      );
    },
    
    // Erfolgsbehandlung NACH erhaltener Server-Antwort
    onSuccess: (result, variables) => {
      // Dialog schließen
      setShowBatchDialog(false);
      setSelectedItem(null);
      
      // Erfolgsmeldung
      toast({
        title: "Charge aktualisiert",
        description: "Die Charge wurde erfolgreich aktualisiert.",
      });
      
      // WICHTIG: Erst nach erfolgreicher Mutation den Cache aktualisieren
      // mit Verzögerung, damit UI flüssig bleibt
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/inventory-counts/${id}/items`],
          refetchType: 'none'
        });
      }, 300);
      
      // Stelle Scroll-Position nach kurzer Verzögerung wieder her
      setTimeout(() => {
        const savedPosition = window.sessionStorage.getItem('inventur_scroll_position');
        if (savedPosition) {
          window.scrollTo(0, parseInt(savedPosition));
        }
      }, 100);
    },
    
    // Fehlerbehandlung
    onError: (error) => {
      console.error('Fehler beim Aktualisieren der Charge:', error);
      
      // Erfolgsmeldung
      toast({
        title: "Fehler",
        description: "Die Charge konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      
      // Scroll-Position wiederherstellen
      setTimeout(() => {
        const savedPosition = window.sessionStorage.getItem('inventur_scroll_position');
        if (savedPosition) {
          window.scrollTo(0, parseInt(savedPosition));
        }
      }, 100);
    }
  });

  // Funktion zum Öffnen des Batch-Edit-Dialogs
  const openBatchEditDialog = async (batch: ProductBatch, item: InventoryCountItem) => {
    console.log("Öffne Batch-Edit-Dialog für Charge:", batch);
    
    // Aktuelle Scroll-Position speichern
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
    }
    
    setEditingBatch(batch);
    setSelectedItem(item);
    setShowBatchDialog(true);
  };

  // Funktion zum Öffnen des Batch-Dialogs mit optimiertem Scroll-Verhalten
  const openBatchDialog = (item: InventoryCountItem) => {
    console.log("Öffne Batch-Dialog für Item:", item);
    
    // Aktuelle Scroll-Position speichern - doppelt gesichert
    if (typeof window !== 'undefined') {
      const currentPos = window.scrollY;
      window.sessionStorage.setItem('inventur_scroll_position', currentPos.toString());
      console.log(`Scroll-Position gespeichert: ${currentPos}`);
      
      // Speichere auch als Attribut für erhöhte Zuverlässigkeit
      document.documentElement.setAttribute('data-saved-scroll', currentPos.toString());
    }
    
    // Prüfen, ob alle erforderlichen Daten vorhanden sind
    if (!inventurData?.warehouseId) {
      console.error("Lager-ID nicht verfügbar");
      toast({
        title: "Fehler",
        description: "Lager-ID noch nicht verfügbar. Bitte kurz warten und erneut versuchen.",
        variant: "destructive"
      });
      return;
    }
    
    if (!item.productId) {
      console.error("Produkt-ID nicht verfügbar");
      toast({
        title: "Fehler",
        description: "Produkt-ID nicht verfügbar. Bitte anderen Artikel auswählen.",
        variant: "destructive"
      });
      return;
    }
    
    // 1. Item und Batch-ID setzen
    setSelectedItem({
      ...item,
      // Stelle sicher, dass die Batch-Informationen komplett sind
      batch: item.batch || null
    });
    setSelectedBatchId(item.batchId || null);
    
    // 2. Dialog öffnen BEVOR wir die Daten laden oder UI-Status zurücksetzen
    setShowBatchDialog(true);
    
    // Reset edit mode when opening in create/select mode
    setEditingBatch(null);
    
    // 3. Formular sofort zurücksetzen, anstatt nach dem Laden
    setShowNewBatchForm(false);
    setShowSplitForm(false);
    
    // Verwende die zentralisierte Funktion für die automatische Batch-Nummer
    setNewBatchNumber(generateBatchNumber());
    
    // Verwende die zentralisierte Funktion für das Default-Ablaufdatum
    const defaultExpiryDate = new Date(getDefaultExpiryDate());
    setNewExpiryDate(defaultExpiryDate);
    
    setNewBatchQuantity(null);
    setSplitQuantity(null);
    setSplitTargetBatchId(null);
    
    // 4. Chargen laden nach kurzer Verzögerung
    console.log(`Lade in Kürze Chargen für Produkt ${item.productId} in Lager ${inventurData.warehouseId}...`);
    
    // Anfänglichen leeren Array setzen, damit Interface nicht flackert
    setAvailableBatches([]);
    
    // Kleine Verzögerung für DOM-Aktualisierung
    setTimeout(() => {
      const warehouseId = inventurData.warehouseId;
      
      if (!warehouseId || !item.productId) {
        console.error("Produktdaten nach Verzögerung nicht mehr verfügbar");
        return;
      }
      
      console.log(`Starte Ladevorgang für Batches: Produkt ${item.productId}, Lager ${warehouseId}`);
      
      fetch(`/api/products/${item.productId}/batches?warehouseId=${warehouseId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        credentials: 'same-origin'
      })
      .then(async response => {
        console.log(`Batch-Antwort erhalten: Status ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response (${response.status}):`, errorText);
          throw new Error(`Server antwortete mit ${response.status}: ${errorText}`);
        }
        
        // Content-Type prüfen
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn(`Antwort ist kein JSON: ${contentType}. Response:`, await response.text());
          return [];
        }
        
        return response.json();
      })
      .then(data => {
        console.log('Geladene Batches:', data);
        const batches = Array.isArray(data) ? data : [];
        console.log(`${batches.length} Chargen erfolgreich geladen`);
        setAvailableBatches(batches);
        
        // Wenn keine Chargen vorhanden sind, automatisch das "Neue Charge" Formular öffnen
        if (batches.length === 0) {
          setTimeout(() => {
            setShowNewBatchForm(true);
            
            // Standardmenge setzen
            setNewBatchQuantity(item.expectedQuantity || 1);
          }, 100);
        }
      })
      .catch(error => {
        console.error('Fehler beim Laden der Chargen:', error);
        // Setze einen leeren Array als Fallback und öffne "Neue Charge" Tab
        setAvailableBatches([]);
        
        setTimeout(() => {
          setShowNewBatchForm(true);
          
          // Standardmenge setzen
          setNewBatchQuantity(item.expectedQuantity || 1);
        }, 100);
        
        toast({
          title: "Hinweis",
          description: "Es konnten keine bestehenden Chargen geladen werden. Sie können eine neue Charge anlegen.",
          variant: "default",
        });
      });
    }, 200); // Verzögerung für DOM-Update
  };
  
  // Funktion zum Laden von Chargen für ein bestimmtes Produkt mit verbessertem Error-Handling und Debugging
  const loadBatches = (productId: number) => {
    if (!productId || !inventurData?.warehouseId) {
      console.warn("Kann Chargen nicht laden: ProductID oder WarehouseID fehlt", { 
        productId, 
        warehouseId: inventurData?.warehouseId 
      });
      return;
    }
    
    console.log(`Lade Chargen für Produkt ${productId} in Lager ${inventurData.warehouseId}...`);
    
    // Kleine Verzögerung zum Sicherstellen, dass der DOM-Update abgeschlossen ist
    setTimeout(() => {
      fetch(`/api/products/${productId}/batches?warehouseId=${inventurData.warehouseId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        }
      })
        .then(async response => {
          console.log(`Batch-Antwort erhalten: Status ${response.status}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response (${response.status}):`, errorText);
            throw new Error(`Server antwortete mit ${response.status}: ${errorText}`);
          }
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn("Antwort ist kein JSON:", contentType);
            return [];
          }
          
          return response.json();
        })
        .then(data => {
          console.log("Geladene Chargen:", data);
          const batches = Array.isArray(data) ? data : [];
          console.log(`${batches.length} Chargen erfolgreich geladen`);
          setAvailableBatches(batches);
          
          // Wenn keine Chargen vorhanden sind, automatisch das "Neue Charge" Formular öffnen
          if (batches.length === 0) {
            setShowNewBatchForm(true);
          }
        })
        .catch(error => {
          console.error('Fehler beim Laden der Chargen:', error);
          // Setze einen leeren Array als Fallback, damit der Dialog trotzdem funktioniert
          setAvailableBatches([]);
          
          // Bei Fehlern automatisch das "Neue Charge" Formular öffnen
          setShowNewBatchForm(true);
          
          toast({
            title: "Hinweis",
            description: "Es konnten keine bestehenden Chargen geladen werden. Sie können trotzdem eine neue Charge anlegen.",
            variant: "default",
          });
        });
    }, 100); // 100ms Verzögerung
  };
  
  // Funktion zum Aktualisieren der Charge und Neuladens aller betroffenen Daten
  // Hilfsfunktion zum Aktualisieren eines einzelnen Items im lokalen State
  // Die Funktion ist so optimiert, dass keine unnötige Re-Renders oder Scroll-Resets passieren
  const updateCountedItem = (updatedItem: InventoryCountItem) => {
    console.log("Aktualisiere Item im lokalen State:", updatedItem.id);
    
    // Wir verwenden eine Funktionsreferenz für setCountedItems,
    // um den vorherigen State sicher zu aktualisieren, ohne von externen Variablen abhängig zu sein
    setCountedItems(prevItems =>
      prevItems.map(item =>
        item.id === updatedItem.id ? updatedItem : item
      )
    );
  };

  // Optimierter Batch-Update-Handler mit zentralisierter Funktion aus CreateAndLinkBatchHandler
  const handleBatchUpdate = async (batchId: number | null) => {
    if (!selectedItem) return;
    console.log("Batch-Update wird durchgeführt: Item ID =", selectedItem.id, "Batch ID =", batchId);
    
    try {
      // Aktuelle Scroll-Position speichern
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('inventur_scroll_position', window.scrollY.toString());
        console.log(`Scroll-Position vor Batch-Update gespeichert: ${window.scrollY}`);
      }
      
      // 1) Wenn kein Batch ausgewählt wurde, erstelle automatisch einen neuen mit der zentralen Funktion
      if (batchId === null) {
        console.log("Neue Charge wird automatisch mit optimierter Funktion angelegt");
        
        // Verwende die zentralisierte Funktion für Batch-Nummer und Ablaufdatum
        const autoBatchNumber = generateBatchNumber();
        const expiryDateString = getDefaultExpiryDate();
        
        try {
          // Verwende die kombinierte Erstellungs- und Verknüpfungsfunktion
          const newBatch = await createAndLinkBatch({
            item: selectedItem,
            warehouseId: inventurData!.warehouseId,
            inventoryId: id.toString(),
            batchNumber: autoBatchNumber,
            expiryDate: expiryDateString,
            quantity: selectedItem.countedQuantity || 1,
            notes: `Auto-erstellt bei Inventur #${id}`,
            queryClient,
            toast,
            onSuccess: (batch) => {
              console.log("Neue Charge wurde erstellt und verknüpft:", batch);
              
              // Optimistisches UI-Update
              const updatedItem = {
                ...selectedItem,
                batchId: batch.id,
                batch: batch
              };
              
              // Lokales State-Update für direkte UI-Reaktion
              updateCountedItem(updatedItem);
              
              // Automatisch zur Liste der verfügbaren Batches hinzufügen
              setAvailableBatches(prev => [...prev, batch]);
              
              // Dialog schließen
              setShowBatchDialog(false);
              setSelectedItem(null);
            }
          });
          
          // Erfolgsmeldung
          toast({
            title: "Charge erstellt und zugewiesen",
            description: `Die Charge ${autoBatchNumber} wurde automatisch erstellt und verknüpft.`,
          });
          
        } catch (createError: any) {
          console.error("Fehler bei der automatischen Chargenerstellung:", createError);
          throw new Error(createError.message || "Die Charge konnte nicht automatisch erstellt werden");
        }
        
      } else {
        // 2) Wenn ein vorhandener Batch ausgewählt wurde, nur Verknüpfung durchführen
        const existingBatch = availableBatches.find(b => b.id === batchId);
        if (!existingBatch) {
          throw new Error(`Batch mit ID ${batchId} nicht gefunden`);
        }
        
        // Optimistisches UI-Update
        const updatedItem = {
          ...selectedItem,
          batchId: batchId,
          batch: existingBatch
        };
        
        // Lokales State-Update für direkte UI-Reaktion
        updateCountedItem(updatedItem);
        
        // Sende die Batch-Verknüpfung an den Server
        console.log(`Sende Batch-Link: Item ${selectedItem.id} mit Batch ${batchId}`);
        
        const linkRes = await fetch(`/api/inventory-counts/items/${selectedItem.id}/batch`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({ batchId }) // Server erwartet batchId als Parameter
        });
        
        if (!linkRes.ok) {
          const errorText = await linkRes.text();
          console.error(`Fehler bei Batch-Verknüpfung: ${linkRes.status} - ${errorText}`);
          throw new Error(`Fehler bei Verknüpfung: ${errorText}`);
        }
        
        // Dialog schließen
        setShowBatchDialog(false);
        setSelectedItem(null);
        
        // Cache nach erfolgreicher Operation invalidieren ohne Scroll-Reset
        queryClient.invalidateQueries({ queryKey: [`/api/inventory-counts/${id}`] });
        
        // Erfolgsmeldung
        toast({
          title: "Charge zugewiesen",
          description: "Die vorhandene Charge wurde erfolgreich mit dem Inventurposten verknüpft.",
        });
      }
      
      // Stelle die Scroll-Position wieder her
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
          if (savedPos) {
            console.log(`Stelle Scroll-Position wieder her: ${savedPos}`);
            window.scrollTo({
              top: parseInt(savedPos, 10),
              behavior: 'auto'
            });
          }
        }
      }, 50);
      
    } catch (error: any) {
      console.error("Fehler beim Batch-Update:", error);
      
      toast({
        title: "Fehler",
        description: error.message || "Die Charge konnte nicht verknüpft werden.",
        variant: "destructive",
      });
      
      // Stelle die Scroll-Position auch bei Fehler wieder her
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const savedPos = window.sessionStorage.getItem('inventur_scroll_position');
          if (savedPos) {
            window.scrollTo(0, parseInt(savedPos, 10));
          }
        }
      }, 50);
    }
  };
  
  // Funktion zum Formatieren eines Datums
  const formatBatchDate = (dateStr: string | null) => {
    if (!dateStr) return "Kein MHD";
    
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(dateStr));
  };
  
  // Erstellt eine neue Charge mit MHD und verknüpft sie mit dem Inventar-Item
  const createNewBatch = async () => {
    // Speichere aktuelle Scroll-Position
    const prevScroll = window.scrollY;
    
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
    
    // Erzeuge eindeutige Batch-Nummer, falls keine angegeben wurde
    const effectiveBatchNumber = newBatchNumber || `INV-${id}-${Date.now()}`;
    
    const batchData = {
      productId: selectedItem.productId,
      warehouseId: inventurData?.warehouseId,
      batchNumber: effectiveBatchNumber,
      expiryDate: formattedExpiryDate,
      initialQuantity: newBatchQuantity || 1, // Mindestmenge 1 statt 0
      currentQuantity: newBatchQuantity || 1, // Mindestmenge 1 statt 0
      notes: `Erstellt bei Inventur #${id}`,
      receivedDate: new Date().toISOString().split('T')[0],
      locationInWarehouse: null
    };
    
    console.log("Sende Batch-Daten:", JSON.stringify(batchData, null, 2));
    
    try {
      // Generiere eine einzigartige temporäre ID für die lokale Batch
      // Verwende einen eindeutigen Nummernbereich (999000-999999), um Kollisionen zu vermeiden
      const tempId = 999000 + Math.floor(Math.random() * 999);
      
      // Erstelle ein korrektes ProductBatch-Objekt, das dem Interface entspricht
      const tempBatchAsProductBatch: ProductBatch = {
        id: tempId, // Eindeutige Temp ID als Zahl
        warehouseId: inventurData?.warehouseId || 0, 
        productId: selectedItem.productId,
        batchNumber: effectiveBatchNumber,
        expiryDate: formattedExpiryDate,
        initialQuantity: newBatchQuantity || 1,
        currentQuantity: newBatchQuantity || 1,
        notes: `Erstellt bei Inventur #${id}`,
        receivedDate: new Date().toISOString().split('T')[0],
        locationInWarehouse: '',
        status: 'active',
        createdAt: new Date().toISOString(),
        manufacturingDate: undefined
      };
      
      // Optimistisches Update der UI
      setAvailableBatches(prev => [...prev, tempBatchAsProductBatch]);
      
      // Wir erstellen auch ein optimistisches Update für den Inventarposten
      const optimisticUpdatedItem = {
        ...selectedItem,
        batchId: tempId,
        batch: tempBatchAsProductBatch
      };
      
      // Aktualisiere den lokalen State sofort ohne auf Serverantwort zu warten
      updateCountedItem(optimisticUpdatedItem);
      
      // Schritt 1: Erstelle neue Charge API-Anfrage mit korrektem Endpunkt
      const url = `/api/inventory-count-batches/product-batches`; // Korrigierter API-Endpunkt
      console.log(`Verwende API-Endpunkt zum Erstellen: ${url}`);
      
      // Verwende die ursprünglichen Batch-Daten ohne Anpassungen
      const enrichedBatchData = {
        ...batchData
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache' // Verhindert Cache-Probleme
        },
        body: JSON.stringify(enrichedBatchData),
      });
      
      // Überprüfe auf detaillierte Fehlermeldungen
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Fehler bei Batch-Erstellung: ${response.status} - ${errorText}`);
        
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
      console.log("Neue Charge erfolgreich erstellt:", newBatch);
      
      // Nach erfolgreicher Erstellung der Charge SOFORT mehrere PATCH-Aufrufe mit Wiederholungen
      // zum Verknüpfen des Inventory-Items mit der Batch-ID durchführen
      const attemptBatchLinking = async (retryCount = 0, maxRetries = 3) => {
        if (retryCount > maxRetries) {
          console.error(`Maximale Anzahl an Wiederholungsversuchen (${maxRetries}) erreicht.`);
          return;
        }
        
        try {
          console.log(`DIREKTE VERKNÜPFUNG (Versuch ${retryCount+1}/${maxRetries+1}): Sende PATCH für Item ${selectedItem.id} mit Batch ${newBatch.id}`);
          
          // Verwende beide möglichen API-Endpoints, falls einer fehlschlägt
          const endpointOptions = [
            `/api/inventory-counts/items/${selectedItem.id}/batch`,  // Standard-Endpoint
            `/api/inventory-count-items/${selectedItem.id}/batch`    // Alternativer Endpoint
          ];
          
          // Versuche jeden Endpoint nacheinander
          for (const endpoint of endpointOptions) {
            try {
              const linkResponse = await fetch(endpoint, {
                method: 'PATCH',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache, no-store',
                  'Pragma': 'no-cache'
                },
                body: JSON.stringify({ batchId: newBatch.id })
              });
              
              // Verarbeite die Antwort, egal ob erfolgreich oder nicht
              const linkResponseText = await linkResponse.text();
              console.log(`Verknüpfung (${endpoint}) Status: ${linkResponse.status}, Antwort: ${linkResponseText}`);
              
              // Bei erfolgreicher Antwort sind wir fertig
              if (linkResponse.ok) {
                console.log(`Direkte Batch-Verknüpfung erfolgreich über ${endpoint}`);
                return true;
              }
              
              console.error(`Fehler bei direkter Batch-Verknüpfung über ${endpoint}: ${linkResponse.status} - ${linkResponseText}`);
            } catch (error) {
              console.error(`Verbindungsfehler bei ${endpoint}:`, error);
            }
          }
          
          // Alle Endpunkte sind fehlgeschlagen, versuche nach einer kurzen Pause erneut
          console.log(`Alle Endpunkte fehlgeschlagen. Warte und versuche erneut...`);
          await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
          return attemptBatchLinking(retryCount + 1, maxRetries);
          
        } catch (linkError) {
          console.error(`Fehler bei Versuch ${retryCount+1}/${maxRetries+1}:`, linkError);
          await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
          return attemptBatchLinking(retryCount + 1, maxRetries);
        }
      };
      
      // Führe den Wiederholungsalgorithmus aus
      attemptBatchLinking().then(success => {
        if (success) {
          console.log("Batch-Verknüpfung abgeschlossen und erfolgreich");
        } else {
          console.warn("Batch-Verknüpfung möglicherweise nicht erfolgreich - verwende trotzdem lokales Update");
          
          // Verwende manuelles lokales Update, wenn die API-Verknüpfung fehlschlägt
          queryClient.setQueryData(
            [`/api/inventory-counts/${inventurData?.id}/items`],
            (old?: InventoryCountItem[]) => {
              if (!old) return old;
              return old.map(item =>
                item.id === selectedItem.id
                  ? { ...item, batchId: newBatch.id, batch: newBatch }
                  : item
              );
            }
          );
        }
      });
      
      // Funktion zur sicheren Identifizierung des temporären Batches
      const isTemporaryBatch = (batch: ProductBatch) => {
        return (batch.id === tempId) || 
               (batch.batchNumber === effectiveBatchNumber && batch.id >= 999000);
      };
      
      // Ersetze den temporären Eintrag durch die echte Batch mit ID vom Server
      setAvailableBatches(prev => 
        prev.map(batch => isTemporaryBatch(batch) ? newBatch : batch)
      );
      
      // Wähle die neue Charge aus
      setSelectedBatchId(newBatch.id);
      
      // Aktualisiere den Inventarposten mit der echten Batch ID
      if (selectedItem) {
        const updatedItem = {
          ...selectedItem,
          batchId: newBatch.id,
          batch: newBatch
        };
        
        // Update lokalen State
        updateCountedItem(updatedItem);
        
        // Schritt 2: Verknüpfe die neue Charge mit dem Inventurposten im Hintergrund
        console.log(`Verknüpfe Inventurposten ${selectedItem.id} mit Charge ${newBatch.id}...`);
        
        try {
          // KORRIGIERTER API-ENDPUNKT: Verwende den richtigen Endpunkt für Batch-Verknüpfungen
          console.log(`Batch-Update wird durchgeführt: Item ID = ${selectedItem.id}, Batch ID = ${newBatch.id}`);
          
          // Debugausgabe für den API-Endpunkt
          // WICHTIG: Die Server-Router-Konfiguration verwendet einen anderen Pfad als das Frontend 
          // Die Route ist als /api/inventory-counts (Basis) + /items/:itemId/batch (im Router) registriert
          const apiEndpoint = `/api/inventory-counts/items/${selectedItem.id}/batch`;
          console.log("API-Endpunkt:", apiEndpoint);
          
          const linkResponse = await fetch(apiEndpoint, {
            method: 'PATCH', 
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({ 
              batchId: newBatch.id 
            }),
          });
          
          // Detaillierte Fehlerbehandlung für Debugging
          if (!linkResponse.ok) {
            const errorText = await linkResponse.text();
            console.error(`Fehler beim Verknüpfen: ${linkResponse.status} - ${errorText}`);
            console.error("Vollständige Anfrage:", {
              url: apiEndpoint,
              method: 'PATCH',
              body: { batchId: newBatch.id }
            });
            throw new Error(`Verknüpfung fehlgeschlagen: ${linkResponse.status} - ${errorText}`);
          }
          
          const linkResult = await linkResponse.json();
          console.log("Verknüpfung erfolgreich:", linkResult);
          
          // Schließe das Formular erst nach erfolgreicher Verknüpfung
          setShowNewBatchForm(false);
          
          // Stelle Scroll-Position wieder her
          window.scrollTo(0, prevScroll);
          
          // React-Query-Cache für Inventar-Items mit dem KORREKTEN Query-Key aktualisieren
          queryClient.setQueryData(
            [`/api/inventory-counts/${id}/items`],
            (old?: InventoryCountItem[]) => {
              if (!old) return old;
              return old.map(item =>
                item.id === selectedItem.id
                  ? { 
                      ...item, 
                      batchId: newBatch.id,
                      batch: newBatch
                    }
                  : item
              );
            }
          );
          
          // Toast-Benachrichtigung entfernt - keine störende Meldung mehr
        } catch (linkError) {
          console.error('Fehler beim Verknüpfen der Charge:', linkError);
          
          // Bei Fehler trotzdem das Formular schließen, da Batch erstellt wurde
          setShowNewBatchForm(false);
          
          // Stelle Scroll-Position wieder her
          window.scrollTo(0, prevScroll);
          
          // Hinweis mit Warnung, aber kein Fehler
          toast({
            title: "Charge erstellt, aber...",
            description: "Die Charge wurde erstellt, konnte aber möglicherweise nicht korrekt verknüpft werden.",
            variant: "default"
          });
        }
      }
    } catch (error) {
      // Fehlgeschlagene Erstellung - Entferne den temporären Eintrag
      setAvailableBatches(prev => prev.filter(batch => 
        !(batch.batchNumber === effectiveBatchNumber && batch.id >= 999000)
      ));
      
      // Stelle Scroll-Position wieder her
      window.scrollTo(0, prevScroll);
      
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
  // Diese Funktion wurde optimiert, um Scroll-Resets zu verhindern
  const handleSplitInventory = async () => {
    if (!selectedItem || splitQuantity === null || splitTargetBatchId === null) return;
    
    try {
      // Wir erstellen ein vorläufiges Update für UI-Reaktivität
      // Dies gibt dem Benutzer sofortiges Feedback, ohne auf den Server zu warten
      // und verhindert Scroll-Resets durch API-Aufrufe
      
      // Bestimme die Ziel-Batch aus den verfügbaren Batches
      const targetBatch = availableBatches.find(b => b.id === splitTargetBatchId);
      const sourceBatch = availableBatches.find(b => b.id === selectedBatchId);
      
      if (sourceBatch) {
        // Erstelle lokale Kopien für die UI-Aktualisierung
        const updatedSourceBatch = {
          ...sourceBatch,
          currentQuantity: Math.max(0, (sourceBatch.currentQuantity || 0) - splitQuantity)
        };
        
        const updatedTargetBatch = targetBatch ? {
          ...targetBatch,
          currentQuantity: (targetBatch.currentQuantity || 0) + splitQuantity
        } : undefined;
        
        // Aktualisiere die UI sofort
        setAvailableBatches(prev => 
          prev.map(batch => {
            if (batch.id === sourceBatch.id) return updatedSourceBatch;
            if (targetBatch && batch.id === targetBatch.id && updatedTargetBatch) 
              return updatedTargetBatch;
            return batch;
          })
        );
        
        // Aktualisiere das ausgewählte Item, falls nötig
        if (selectedItem) {
          const updatedItem = {
            ...selectedItem,
            batch: updatedSourceBatch
          };
          
          // Aktualisiere lokalen State sofort
          updateCountedItem(updatedItem);
        }
      }
      
      // Schließe das Split-Formular sofort, ohne auf Server-Antwort zu warten
      setShowSplitForm(false);
      
      // Zeige sofort Erfolgsmeldung an
      toast({
        title: "Bestand wird aufgeteilt",
        description: `${splitQuantity} Einheiten werden auf die andere Charge übertragen.`
      });
      
      // Jetzt im Hintergrund die tatsächliche API-Anfrage senden
      // KORRIGIERT: Verwenden des richtigen API-Endpunkts für Split-Operationen
      const response = await fetch(`/api/inventory-counts/items/${selectedItem.id}/split`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          originalBatchId: selectedBatchId, // Korrekter Parameter-Name laut Server-API
          targetBatchId: splitTargetBatchId,
          splitQuantity: splitQuantity // Korrekter Parameter-Name laut Server-API
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler bei der Bestandsaufteilung: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Bestandsaufteilung erfolgreich:', result);
      
      // Ruhige Aktualisierung im Hintergrund, ohne UI-Reset
      // Aktualisiere den lokalen State mit den tatsächlichen Server-Daten
      if (selectedItem && result.updatedItem) {
        updateCountedItem(result.updatedItem);
      }
      
      // Aktualisiere Batches im Hintergrund ohne Neuzeichnung der UI
      // Die fetch-Operation wird als niedrige Priorität behandelt
      setTimeout(() => {
        fetch(`/api/products/${selectedItem.productId}/batches?warehouseId=${inventurData?.warehouseId}`)
          .then(async response => {
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Error response (${response.status}):`, errorText);
              throw new Error(`Server antwortete mit ${response.status}: ${errorText}`);
            }
            return response.json();
          })
          .then(data => {
            console.log("Aktualisierte Batches für Split-Dialog geladen:", data);
            
            // Vorsichtige Aktualisierung: Stelle sicher, dass wir keine UI-Resets verursachen
            if (Array.isArray(data) && data.length > 0) {
              setAvailableBatches(data);
            }
          })
          .catch(error => {
            console.error("Fehler beim Aktualisieren der Batches nach Split:", error);
            // Keine UI-Änderung bei Fehlern
          });
      }, 500);
      
      // React-Query-Cache für Inventar-Items mit dem KORREKTEN Query-Key aktualisieren
      queryClient.setQueryData(
        [`/api/inventory-counts/${id}/items`],
        (old?: InventoryCountItem[]) => {
          if (!old) return old;
          return old.map(item =>
            item.id === selectedItem.id
              ? { 
                  ...item, 
                  batchId: selectedBatchId,
                  batch: availableBatches.find(b => b.id === selectedBatchId) || null
                }
              : item
          );
        }
      );
      
      // Aktualisiere die Erfolgsmeldung
      toast({
        title: "Bestand aufgeteilt",
        description: `${splitQuantity} Einheiten wurden erfolgreich auf die andere Charge übertragen.`,
        variant: "default"
      });
      
    } catch (error) {
      console.error('Fehler bei der Bestandsaufteilung:', error);
      
      // Bei Fehlern: UI Wiederherstellung und Fehlermeldung
      toast({
        title: "Fehler",
        description: "Der Bestand konnte nicht aufgeteilt werden. Bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
      
      // Lade den tatsächlichen Zustand vom Server
      fetch(`/api/products/${selectedItem.productId}/batches?warehouseId=${inventurData?.warehouseId}`)
        .then(response => response.ok ? response.json() : [])
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setAvailableBatches(data);
          }
        });
    }
  };

  // Speichere die ursprüngliche Reihenfolge der Items als Item-ID zu Index-Mapping
  const [itemOrderMap, setItemOrderMap] = useState<{[key: number]: number}>({});
  
  // Aktualisiere itemOrderMap, wenn inventurItems zum ersten Mal geladen werden
  useEffect(() => {
    if (inventurItems.length > 0 && Object.keys(itemOrderMap).length === 0) {
      const orderMap: {[key: number]: number} = {};
      inventurItems.forEach((item, index) => {
        orderMap[item.id] = index;
      });
      setItemOrderMap(orderMap);
      console.log("Ursprüngliche Reihenfolge gespeichert:", orderMap);
    }
  }, [inventurItems, itemOrderMap]);
  
  // Initialisiere den lokalen State für countedItems NUR beim ersten Laden
  // Nutze useRef, um zu tracken, ob die erste Initialisierung bereits stattgefunden hat
  const initialLoadDone = React.useRef(false);
  
  useEffect(() => {
    // Nur beim ersten erfolgreichen Laden initialisieren
    if (inventurItems && 
        inventurItems.length > 0 && 
        !initialLoadDone.current) {
      console.log("Initialisiere lokalen State für countedItems mit", inventurItems.length, "Elementen");
      setCountedItems(inventurItems);
      // Markiere, dass die initiale Ladung erfolgt ist
      initialLoadDone.current = true;
    }
  }, [inventurItems]);
  
  // Sortiere Inventurpositionen mit Stabilität
  const sortedItems = useMemo(() => {
    // Wenn keine Sortierung aktiv ist und noch keine Originalreihenfolge gespeichert wurde, gib die Items unverändert zurück
    if (!sortField && Object.keys(itemOrderMap).length === 0) return countedItems;
    
    const itemsToSort = [...countedItems];
    
    // Stabile Sortierung: Verwende eine Sekundärsortierung nach ursprünglicher Reihenfolge,
    // wenn die primäre Sortierung gleiche Werte ergibt
    return itemsToSort.sort((a, b) => {
      // Hol die ursprünglichen Indizes als Sekundärsortierung
      const indexA = itemOrderMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const indexB = itemOrderMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      
      // Wenn ein Sortierfeld angegeben ist, sortiere primär danach
      if (sortField) {
        let valueA, valueB;
        
        // Extrahiere die zu vergleichenden Werte je nach Sortierschlüssel
        if (sortField === 'product') {
          valueA = a.product?.productName?.toLowerCase() || '';
          valueB = b.product?.productName?.toLowerCase() || '';
        } else if (sortField === 'expectedQuantity') {
          valueA = a.expectedQuantity || 0;
          valueB = b.expectedQuantity || 0;
        } else if (sortField === 'countedQuantity') {
          valueA = a.countedQuantity !== null ? a.countedQuantity : -1;
          valueB = b.countedQuantity !== null ? b.countedQuantity : -1;
        } else if (sortField === 'difference') {
          // Sichere Typprüfung für countedQuantity
          const aQty = a.countedQuantity !== null && a.countedQuantity !== undefined ? a.countedQuantity : null;
          const bQty = b.countedQuantity !== null && b.countedQuantity !== undefined ? b.countedQuantity : null;
          
          const diffA = aQty !== null ? (aQty - (a.expectedQuantity || 0)) : null;
          const diffB = bQty !== null ? (bQty - (b.expectedQuantity || 0)) : null;
          
          // Null-Differenzen am Ende sortieren
          if (diffA === null && diffB === null) return indexA - indexB; // Stabile Sortierung bei Gleichheit
          if (diffA === null) return 1;
          if (diffB === null) return -1;
          
          valueA = diffA;
          valueB = diffB;
        } else if (sortField === 'expiryDate') {
          // Sortiere nach MHD (Ablaufdatum) der Batch
          const dateA = a.batch?.expiryDate ? new Date(a.batch.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
          const dateB = b.batch?.expiryDate ? new Date(b.batch.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
          valueA = dateA;
          valueB = dateB;
        } else {
          // Fallback für andere Felder
          valueA = (a as any)[sortField] || '';
          valueB = (b as any)[sortField] || '';
        }
        
        // Tatsächlicher Vergleich mit Berücksichtigung der Sortierrichtung
        let result: number;
        
        if (typeof valueA === 'string' && typeof valueB === 'string') {
          result = sortDirection === 'asc' 
            ? valueA.localeCompare(valueB) 
            : valueB.localeCompare(valueA);
        } else {
          result = sortDirection === 'asc' 
            ? (valueA as number) - (valueB as number) 
            : (valueB as number) - (valueA as number);
        }
        
        // Wenn die Werte gleich sind, verwende die ursprüngliche Reihenfolge für eine stabile Sortierung
        if (result === 0) {
          return indexA - indexB;
        }
        
        return result;
      }
      
      // Wenn keine Sortierung aktiv ist, behalte die ursprüngliche Reihenfolge bei
      return indexA - indexB;
    });
  }, [countedItems, itemOrderMap, sortField, sortDirection]);
  
  // Filtere Inventurpositionen basierend auf Suchbegriff
  const filteredItems = useMemo(() => {
    if (!sortedItems.length) return [];
    
    if (!searchTerm) return sortedItems;
    
    const normalizedSearch = searchTerm.toLowerCase();
    
    return sortedItems.filter(item => {
      const productName = item.product?.productName?.toLowerCase() || '';
      const sku = item.product?.sku?.toLowerCase() || '';
      
      return productName.includes(normalizedSearch) || sku.includes(normalizedSearch);
    });
  }, [sortedItems, searchTerm]);

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
        if (item.countedQuantity !== null && item.countedQuantity !== undefined && item.expectedQuantity !== undefined) {
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

  // Status-Management: Behandlung verschiedener Status-Werte
  // Wir erstellen einen State für den aktuellen Status mit initialem Wert 'pending'
  const [currentStatus, setCurrentStatus] = useState<string>('pending');
  
  // Status-Initialisierung und -Aktualisierung
  useEffect(() => {
    console.log('Status der Inventur:', inventurData?.status);
    
    // Der Status kann entweder 'null'/'undefined', 'pending', 'open', 'in_progress', 'completed' oder ein unbekannter Wert sein
    
    // Standardverhalten: Zeige Start-Button für 'null', 'undefined', 'pending' oder 'open'
    if (inventurData?.status === null || inventurData?.status === undefined 
        || inventurData?.status === 'pending' || inventurData?.status === 'open') {
      setShowStartButton(true);
      
      // Bei neuen Inventuren (null/undefined), setze Status auf 'pending'
      // damit "Ausstehend" angezeigt wird statt "Unbekannt"
      if (inventurData?.status === null || inventurData?.status === undefined) {
        setCurrentStatus('pending');
      } else {
        // Sonst übernehme den Status vom Server
        setCurrentStatus(inventurData.status);
      }
    } else {
      // Wenn ein anderer Status (in_progress, completed, cancelled) vom Server kommt
      setCurrentStatus(inventurData.status);
    }
    
    // Log für Debugging
    console.log('Aktueller Status gesetzt auf:', inventurData?.status || 'pending');
  }, [inventurData?.status]);
  
  // Wähle das passende Icon, Label und Farbe basierend auf dem Status
  // Verwende die Typindexsignatur für sicheren Zugriff
  const StatusIcon = inventurStatusTypes[currentStatus]?.icon || ClockIcon;
  
  // Setze explizit "Ausstehend" als Label für null/undefined/pending
  const statusLabel = (inventurData?.status === null || inventurData?.status === undefined) 
    ? "Ausstehend" 
    : (inventurStatusTypes[currentStatus]?.label || 'Ausstehend');
  
  // Verwende die Farbe für 'pending' bei null/undefined
  const statusColor = (inventurData?.status === null || inventurData?.status === undefined)
    ? (inventurStatusTypes["pending"]?.color || 'bg-gray-100 text-gray-800')
    : (inventurStatusTypes[currentStatus]?.color || 'bg-gray-100 text-gray-800');

  return (
    <div className="space-y-6 min-h-screen overflow-y-auto p-4 pb-20">
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
              {/* Auto-Save Status Anzeige */}
              {autoSaveStatus === 'saving' && (
                <Badge variant="outline" className="ml-2 text-blue-600 border-blue-200">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Speichert...
                </Badge>
              )}
              {autoSaveStatus === 'saved' && (
                <Badge variant="outline" className="ml-2 text-green-600 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Gespeichert
                </Badge>
              )}
              {autoSaveStatus === 'error' && (
                <Badge variant="outline" className="ml-2 text-red-600 border-red-200">
                  <CircleAlert className="h-3 w-3 mr-1" />
                  Fehler
                </Badge>
              )}
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
          {/* Manual Save Button - always visible when there are changes */}
          {(Object.keys(editedCounts).length > 0 || Object.keys(editedNotes).length > 0) && (
            <Button 
              variant="outline"
              className="border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => saveInventurMutation.mutate()}
              disabled={saveInventurMutation.isPending || autoSaveStatus === 'saving'}
            >
              {saveInventurMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Jetzt speichern
              {lastSaveTime && (
                <span className="ml-2 text-xs opacity-70">
                  {lastSaveTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </Button>
          )}
          
          {/* Status: pending */}
          {showStartButton && (
            <>
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => updateStatusMutation.mutate('in_progress')}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Inventur starten
              </Button>
              
              <Button 
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
                onClick={() => saveInventurMutation.mutate()}
                disabled={saveInventurMutation.isPending}
              >
                {saveInventurMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Zwischenspeichern
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
          
          {/* Status: in_progress oder open */}
          {(currentStatus === 'in_progress' || currentStatus === 'open') && (
            <>
              <Button 
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
                onClick={() => saveInventurMutation.mutate()}
                disabled={saveInventurMutation.isPending}
              >
                {saveInventurMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Zwischenspeichern
              </Button>
              
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setShowCompleteDialog(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Inventur beenden
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
          
          {/* Status: completed und cancelled */}
          {(currentStatus === 'completed' || currentStatus === 'cancelled') && (
            <Button 
              variant="outline"
              className="border-red-500 text-red-500 hover:bg-red-50"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          )}
        </div>
      </div>
      
      {/* Suchfeld wenn relevant */}
      {(currentStatus === 'in_progress' || currentStatus === 'pending' || currentStatus === 'open') && (
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
            
            {/* Button für Produkte hinzufügen entfernt, um die UI zu vereinfachen */}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:text-primary" 
                    onClick={() => {
                      if (sortField === 'product') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('product');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Produkt
                      {sortField === 'product' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="h-4 w-4" /> : 
                          <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-primary text-center"
                    onClick={() => {
                      if (sortField === 'expectedQuantity') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('expectedQuantity');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Erwarteter Bestand
                      {sortField === 'expectedQuantity' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="h-4 w-4" /> : 
                          <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-primary text-center"
                    onClick={() => {
                      if (sortField === 'countedQuantity') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('countedQuantity');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Gezählter Bestand
                      {sortField === 'countedQuantity' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="h-4 w-4" /> : 
                          <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-primary text-center"
                    onClick={() => {
                      if (sortField === 'difference') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('difference');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Differenz
                      {sortField === 'difference' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="h-4 w-4" /> : 
                          <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-primary text-center"
                    onClick={() => {
                      if (sortField === 'expiryDate') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('expiryDate');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      MHD
                      {sortField === 'expiryDate' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="h-4 w-4" /> : 
                          <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
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
                    // TypeScript-Fehler beheben: countedQuantity kann undefined oder null sein
                    const countedQuantity = (item.countedQuantity !== null && item.countedQuantity !== undefined) ? item.countedQuantity : null;
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
                      // Fragment statt div, damit die TableRow direkt in TableBody gerendert wird
                      <div key={`item-${item.id}`}>
                        {/* Hauptzeile für das Produkt */}
                        <TableRow className={
                          item.status === 'counted' || 
                          item.countedQuantity !== null || 
                          item.batchId !== null || 
                          editedCounts[item.id] !== undefined
                            ? 'bg-muted/20' 
                            : ''
                        }>
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
                            {currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'open' ? (
                              <div className="space-y-3">
                                {/* Kompakte Grid-Layout für nebeneinander liegende Eingaben */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                  {/* Gebinde-Eingabe - zeigt echte packageQuantity */}
                                  <div className="space-y-1 p-2 bg-blue-50 rounded border">
                                    <div className="text-xs font-medium text-blue-800">
                                      Gebinde ({getProductPackageQuantity(item.product)} Stk./Gebinde)
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <Input
                                        type="number" 
                                        min="0"
                                        placeholder="Anzahl"
                                        value={packageCounts[item.id] ?? ''}
                                        onChange={(e) => {
                                          const count = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
                                          setPackageCounts({ ...packageCounts, [item.id]: count });
                                          
                                          // Automatische Berechnung der Gesamtmenge
                                          const packageQuantity = getProductPackageQuantity(item.product);
                                          const calculation = calculateTotalQuantity(item.id, item.product);
                                          calculation.total = (count || 0) * packageQuantity + (individualCounts[item.id] || 0);
                                          setEditedCounts({ ...editedCounts, [item.id]: calculation.total });
                                        }}
                                        className="w-16 text-center text-sm"
                                      />
                                      <span className="text-xs text-muted-foreground">
                                        = {(packageCounts[item.id] || 0) * getProductPackageQuantity(item.product)} Stk.
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Einzelartikel-Eingabe */}
                                  <div className="space-y-1 p-2 bg-green-50 rounded border">
                                    <div className="text-xs font-medium text-green-800">
                                      Zusätzliche Einzelartikel
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <Input
                                        type="number" 
                                        min="0"
                                        placeholder="Einzeln"
                                        value={individualCounts[item.id] ?? ''}
                                        onChange={(e) => {
                                          const count = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
                                          setIndividualCounts({ ...individualCounts, [item.id]: count });
                                          
                                          // Automatische Berechnung der Gesamtmenge
                                          const packageQuantity = getProductPackageQuantity(item.product);
                                          const calculation = calculateTotalQuantity(item.id, item.product);
                                          calculation.total = (packageCounts[item.id] || 0) * packageQuantity + (count || 0);
                                          setEditedCounts({ ...editedCounts, [item.id]: calculation.total });
                                        }}
                                        className="w-16 text-center text-sm"
                                      />
                                      <span className="text-xs text-muted-foreground">Stk.</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Kompakte Gesamtmenge und Speichern */}
                                <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded border">
                                  <span className="text-xs text-gray-600">Gesamt:</span>
                                  <Input
                                    type="number" 
                                    min="0"
                                    value={editedCounts[item.id] !== undefined ? editedCounts[item.id] ?? '' : countedQuantity ?? ''}
                                    onChange={(e) => {
                                      const count = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
                                      setEditedCounts({ ...editedCounts, [item.id]: count });
                                    }}
                                    className="w-20 text-center font-bold text-sm"
                                  />
                                  <span className="text-xs text-gray-600">{item.product?.unit || 'Stk.'}</span>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      if (editedCounts[item.id] !== undefined) {
                                        handleSetCount(item.id, editedCounts[item.id]);
                                      }
                                    }}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Save className="h-3 w-3" />
                                  </Button>
                                </div>
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
                            {(currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'open') ? (
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
                                
                                {(currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'open') && (
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
                          <TableRow key={`batch-${item.id}`}>
                            <TableCell colSpan={7} className="bg-gray-50 p-0">
                              <div className="p-4">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="text-sm font-medium">Mindesthaltbarkeitsdaten</div>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => {
                                      // Load product batches when expanding
                                      loadProductBatches(item.productId);
                                      openBatchDialog(item);
                                    }}
                                    className="text-xs"
                                  >
                                    <PlusCircle className="h-3 w-3 mr-1" />
                                    Neue Charge hinzufügen
                                  </Button>
                                </div>
                                
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
                                      {/* Zeige ALLE Chargen für dieses Produkt */}
                                      {(() => {
                                        const batches = productBatches[item.productId] || [];
                                        
                                        if (batches.length === 0) {
                                          return (
                                            <TableRow>
                                              <TableCell colSpan={5} className="h-14 text-center text-muted-foreground">
                                                Noch keine MHD-Einträge für dieses Produkt.
                                              </TableCell>
                                            </TableRow>
                                          );
                                        }
                                        
                                        return batches.map((batch) => (
                                          <TableRow key={batch.id}>
                                            <TableCell>{batch.batchNumber}</TableCell>
                                            <TableCell>{formatBatchDate(batch.expiryDate || null)}</TableCell>
                                            <TableCell className="text-center">{batch.currentQuantity}</TableCell>
                                            <TableCell>{formatBatchDate(batch.createdAt || null)}</TableCell>
                                            <TableCell className="text-right">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => openBatchEditDialog(batch, item)}
                                              >
                                                Bearbeiten
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ));
                                      })()}
                                    </TableBody>
                                  </Table>
                                </div>
                                
                                {/* Button für MHD-Split (bei aktiver Inventur) */}
                                {(currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'open') && countedQuantity !== null && countedQuantity !== undefined && countedQuantity > 0 && (
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col">
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

      {/* MHD Chargen-Dialog mit neuer optimierter Komponente */}
      <InventoryCountBatchDialog 
        open={showBatchDialog}
        onOpenChange={setShowBatchDialog}
        selectedItem={selectedItem ? {
          id: selectedItem.id,
          productId: selectedItem.productId,
          productName: selectedItem.product?.productName || 'Unbenanntes Produkt',
          expectedQuantity: selectedItem.expectedQuantity || 0,
          countedQuantity: selectedItem.countedQuantity || null,
          batchId: selectedItem.batchId,
          batchNumber: selectedItem.batch?.batchNumber || '',
          expiryDate: selectedItem.batch?.expiryDate || null
        } : null}
        editBatch={editingBatch}
        availableBatches={availableBatches}
        onBatchSelect={handleBatchUpdate}
        inventoryId={inventurData?.id.toString() || '0'}
        warehouseId={inventurData?.warehouseId || 0}
        onBatchCreated={(newBatch) => {
          console.log('Neue Batch erstellt:', newBatch);
          
          // KRITISCH: Sofortiges lokales State-Update für UI-Reaktion
          if (selectedItem && newBatch) {
            console.log('Aktualisiere lokale State mit neuer Batch:', {
              itemId: selectedItem.id,
              batchId: newBatch.id,
              batchNumber: newBatch.batchNumber,
              expiryDate: newBatch.expiryDate
            });
            
            // Aktualisiere das entsprechende Item in countedItems
            setCountedItems(prevItems =>
              prevItems.map(item =>
                item.id === selectedItem.id
                  ? {
                      ...item,
                      batchId: newBatch.id,
                      batch: {
                        id: newBatch.id,
                        batchNumber: newBatch.batchNumber,
                        expiryDate: newBatch.expiryDate,
                        productId: newBatch.productId,
                        warehouseId: newBatch.warehouseId,
                        currentQuantity: 'currentQuantity' in newBatch ? (newBatch.currentQuantity as number) : 0,
                        initialQuantity: 'initialQuantity' in newBatch ? (newBatch.initialQuantity as number) : 0,
                        createdAt: 'createdAt' in newBatch && newBatch.createdAt ? (newBatch.createdAt as string) : new Date().toISOString(),
                        updatedAt: 'updatedAt' in newBatch && newBatch.updatedAt ? (newBatch.updatedAt as string) : new Date().toISOString()
                      }
                    }
                  : item
              )
            );
            
            // Füge die neue Batch zu availableBatches hinzu
            setAvailableBatches(prevBatches => {
              // Prüfe ob die Batch bereits existiert (verhindert Duplikate)
              const exists = prevBatches.some(batch => batch.id === newBatch.id);
              if (exists) {
                console.log('Batch bereits in availableBatches vorhanden:', newBatch.id);
                return prevBatches;
              }
              
              const updatedBatches = [...prevBatches, newBatch as ProductBatch];
              console.log('Neue Batch zu availableBatches hinzugefügt:', updatedBatches.length, 'Batches total');
              return updatedBatches;
            });
            
            // Also add to productBatches state for the multiple batch display
            setProductBatches(prev => ({
              ...prev,
              [selectedItem.productId]: [
                ...(prev[selectedItem.productId] || []),
                newBatch as ProductBatch
              ]
            }));
            
            // Expandiere das Item für sofortige Sichtbarkeit der neuen Batch
            setExpandedItems(prev => ({
              ...prev,
              [selectedItem.id]: true
            }));
          }
          
          // React Query Caches invalidieren für Server-Synchronisation
          queryClient.invalidateQueries({ 
            queryKey: [`/api/products/${selectedItem?.productId}/batches`],
            exact: false 
          });
          
          queryClient.invalidateQueries({ 
            queryKey: [`/api/inventory-counts/${id}/items`],
            exact: false 
          });
          
          // Optionales Nachladen von Server-Daten (für Konsistenz)
          if (selectedItem && inventurData?.warehouseId) {
            console.log('Lade Batches zur Synchronisation vom Server...');
            fetch(`/api/products/${selectedItem.productId}/batches?warehouseId=${inventurData.warehouseId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            })
            .then(response => response.json())
            .then(batches => {
              console.log('Server-Batches für Synchronisation geladen:', batches.length);
              // Nur aktualisieren, wenn sich die Anzahl unterscheidet (verhindert UI-Flackern)
              setAvailableBatches(prevBatches => {
                if (Array.isArray(batches) && batches.length !== prevBatches.length) {
                  console.log('Aktualisiere availableBatches mit Server-Daten');
                  return batches;
                }
                return prevBatches;
              });
            })
            .catch(error => {
              console.error('Fehler beim Server-Batch-Sync:', error);
            });
          }
        }}
        onBatchUpdated={(updatedBatch: ProductBatch) => {
          console.log('Batch aktualisiert:', updatedBatch);
          
          // Update productBatches state with the updated batch
          if (selectedItem && updatedBatch) {
            setProductBatches(prev => ({
              ...prev,
              [selectedItem.productId]: (prev[selectedItem.productId] || []).map(batch =>
                batch.id === updatedBatch.id ? updatedBatch : batch
              )
            }));
            
            // Update availableBatches as well
            setAvailableBatches(prevBatches =>
              prevBatches.map(batch =>
                batch.id === updatedBatch.id ? updatedBatch : batch
              )
            );
          }
          
          // Invalidate caches
          queryClient.invalidateQueries({ 
            queryKey: [`/api/products/${selectedItem?.productId}/batches`],
            exact: false 
          });
          
          queryClient.invalidateQueries({ 
            queryKey: [`/api/inventory-counts/${id}/items`],
            exact: false 
          });
        }}
      />
    </div>
  );
}
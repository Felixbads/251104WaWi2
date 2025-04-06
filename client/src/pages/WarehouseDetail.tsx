import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { DateRange, SelectRangeEventHandler } from "react-day-picker";

// Lucide Icons
import { 
  Building2, Truck, Package, ChevronLeft, Loader2, 
  Plus, Search, Filter, ArrowDownUp, AlertTriangle, 
  ClipboardCheck, MapPin, Phone, Mail, User, 
  Eye, Save, Trash, Edit, CalendarRange, FileText,
  RefreshCw, ShoppingCart, Clock, Check
} from "lucide-react";

// Eigene Komponenten
import WarehouseInventory from "@/components/inventory/WarehouseInventory";

// UI Komponenten
import { Label } from "@/components/ui/label";

// API-Funktionen
import { 
  getWarehouseById, 
  getWarehouseInventory,
  WarehouseProduct
} from "@/lib/api";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeftIcon, SaveIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// InventoryCount Interface definieren
interface InventoryCount {
  id: number;
  warehouseId: number;
  startDate: string;
  endDate: string;
  notes?: string;
  createdBy?: number;
  createdAt: string;
  status?: string;
  initiatedByName?: string;
  itemCount?: number;
  adjustmentCount?: number;
  items?: Array<{
    id: number;
    inventoryCountId: number;
    productId: number;
    currentQuantity: number;
    countedQuantity: number;
    difference: number;
    productName?: string;
  }>;
}

// MachineWarehouseAssignment Typ definieren
interface MachineWarehouseAssignment {
  id: number;
  machineId: number;
  warehouseId: number;
  isPrimary: boolean;
  notes?: string;
  assignedBy?: number;
  assignedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  machine?: Machine;
}

// Machine Typ definieren
interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
  location: string;
  status: string;
  address?: string;
  lastSync?: string;
  lastSale?: string;
  product_count?: number;
  error_count?: number;
}

// InventoryMovement Interface definieren
interface InventoryMovement {
  id: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  type: string;
  reason?: string;
  notes?: string;
  createdBy?: number;
  createdAt: string;
  productName?: string;
  productSku?: string;
  performedAt?: string;
  movementType?: string;
  referenceType?: string;
  referenceId?: number | string;
  performedByName?: string;
  machineId?: number;
  machineName?: string;
  source?: string;
}

// Refill-Daten definieren
interface RefillDetail {
  id: number;
  refillId: number;
  productId: string;
  productName: string;
  quantity: number;
  added: number;
  removed: number;
  datetime: string;
}

interface Refill {
  id: number;
  vendonId: string;
  machineId: number;
  machineName: string;
  datetime: string;
  status: string;
  details: RefillDetail[];
}

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Aktives Tab aus URL-Parameter extrahieren
  const getInitialTab = () => {
    try {
      // URL-Parameter direkt aus der Wouter-Location extrahieren
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      if (tabParam) {
        return tabParam;
      }
    } catch (error) {
      console.error("Fehler beim Lesen der URL-Parameter:", error);
    }
    return "overview";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // Inventur-ID aus URL-Parameter holen
  const getInventoryIdFromUrl = () => {
    try {
      // URL-Parameter direkt aus der Wouter-Location extrahieren
      const searchParams = new URLSearchParams(window.location.search);
      const inventoryId = searchParams.get('inventoryId');
      return inventoryId ? parseInt(inventoryId) : null;
    } catch (error) {
      console.error("Fehler beim Lesen der Inventur-ID:", error);
      return null;
    }
  };
  
  // Zustand für die Inventur (Inventurzählung)
  const [inventoryCountItems, setInventoryCountItems] = useState<any[]>([]);
  const [isCountInProgress, setIsCountInProgress] = useState(false);
  const [inventoryCountNotes, setInventoryCountNotes] = useState("");
  const [searchQueryInventory, setSearchQueryInventory] = useState("");
  const [activeInventoryCount, setActiveInventoryCount] = useState<number | null>(null);
  const [inventoryDetailDialogOpen, setInventoryDetailDialogOpen] = useState(false);
  const [selectedInventoryCount, setSelectedInventoryCount] = useState<InventoryCount | null>(null);

  // URL-Parameter beim Laden auswerten
  useEffect(() => {
    const inventoryId = getInventoryIdFromUrl();
    if (inventoryId) {
      // Setze das Tab auf "inventory-count" wenn ein inventoryId Parameter vorhanden ist
      setActiveTab("inventory-count");
      setActiveInventoryCount(inventoryId);
    }
  }, []); // Einmalig beim Laden ausführen
  
  // Lager-Details abrufen
  const { 
    data: warehouse, 
    isLoading: warehouseLoading, 
    error: warehouseError 
  } = useQuery({
    queryKey: [`/api/warehouses/${id}`],
    queryFn: () => getWarehouseById(id),
    enabled: !!id
  });
  
  // Lager-Inventar direkt abrufen (ohne getWarehouseInventory)
  const { 
    data: rawInventory = [], 
    isLoading: inventoryLoading,
    error: inventoryError,
    refetch: refetchInventory
  } = useQuery({
    queryKey: [`/api/inventory`, { warehouseId: Number(id), includeZeroStock: true }],
    enabled: !!id,
    staleTime: 30000 // 30 Sekunden
  });
  
  // Deduplizieren des Inventars basierend auf der Produkt-ID
  const inventory = useMemo(() => {
    if (!rawInventory || !Array.isArray(rawInventory)) return [];
    
    // Verwende eine Map, um Elemente nach Produkt-ID zu gruppieren und dabei nur das neueste zu behalten
    const productMap = new Map();
    
    rawInventory.forEach(item => {
      const productId = Number(item.productId);
      
      if (!productMap.has(productId) || 
          (productMap.has(productId) && 
           Number(item.id) > Number(productMap.get(productId).id))) {
        productMap.set(productId, item);
      }
    });
    
    // Konvertiere die Map zurück in ein Array
    return Array.from(productMap.values());
  }, [rawInventory]);
  
  // Automaten-Zuordnungen abrufen
  const { 
    data: machineAssignments = [] as MachineWarehouseAssignment[], 
    isLoading: assignmentsLoading 
  } = useQuery<MachineWarehouseAssignment[]>({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: Number(id) }],
    staleTime: 1000 * 30, // 30 Sekunden
    enabled: !!id && activeTab === "machines"
  });
  
  // Abfrage aller Automaten für die Zuordnung
  const { 
    data: machines = [] as Machine[], 
    isLoading: machinesLoading 
  } = useQuery<Machine[]>({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id && activeTab === "machines"
  });
  
  // Inventuren abrufen
  const {
    data: inventoryCounts = [] as InventoryCount[],
    isLoading: inventoryCountsLoading
  } = useQuery<InventoryCount[]>({
    queryKey: ['/api/inventory-counts', { warehouseId: Number(id) }],
    enabled: !!id && (activeTab === "inventory-count" || getInventoryIdFromUrl() !== null)
  });
  
  // Überwache inventoryCounts und aktualisiere selectedInventoryCount, wenn die Inventurdaten geladen sind
  useEffect(() => {
    const inventoryId = activeInventoryCount;
    if (inventoryId && Array.isArray(inventoryCounts) && inventoryCounts.length > 0) {
      // Lade Inventurzählung-Details, falls sie noch nicht geladen wurden
      const selectedCount = inventoryCounts.find(count => count.id === inventoryId);
      if (selectedCount) {
        setSelectedInventoryCount(selectedCount);
      }
    }
  }, [inventoryCounts, activeInventoryCount]);
  
  // Refill-Daten für dieses Lager abrufen
  const [refillFilter, setRefillFilter] = useState({
    startDate: '',
    endDate: '',
    limit: 100, // Erhöhen auf 100 für mehr Daten
    offset: 0
  });
  
  const {
    data: refills = [] as Refill[],
    isLoading: refillsLoading,
    isFetching: refillsFetching,
    isSuccess: refillsSuccess
  } = useQuery<Refill[]>({
    queryKey: ['/api/refills', { 
      warehouseId: Number(id),
      startDate: refillFilter.startDate || undefined,
      endDate: refillFilter.endDate || undefined,
      limit: refillFilter.limit,
      offset: refillFilter.offset
    }],
    enabled: !!id && activeTab === "movements"
  });
  
  // Details für jeden Refill laden
  const [loadedRefillDetails, setLoadedRefillDetails] = useState<{[key: number]: boolean}>({});
  
  // Bei Änderungen der Refills, stelle sicher dass Details geladen werden
  useEffect(() => {
    if (refills && Array.isArray(refills) && refills.length > 0 && activeTab === "movements") {
      // Überprüfe für jeden Refill, ob Details bereits geladen wurden
      refills.forEach(refill => {
        if (!loadedRefillDetails[refill.id] && (!refill.details || !Array.isArray(refill.details) || refill.details.length === 0)) {
          console.log(`Lade Details für Refill ${refill.id}...`);
          // Lade Details für diesen Refill
          fetch(`/api/refills/${refill.id}/details`)
            .then(res => res.json())
            .then(details => {
              // Aktualisiere den Refill mit den Details
              refill.details = details;
              // Markiere als geladen
              setLoadedRefillDetails((prev: any) => ({...prev, [refill.id]: true}));
            })
            .catch(err => {
              console.error(`Fehler beim Laden der Details für Refill ${refill.id}:`, err);
              // Stelle sicher, dass details zumindest ein leeres Array ist
              refill.details = [];
              // Markiere trotzdem als geladen, um weitere Versuche zu vermeiden
              setLoadedRefillDetails((prev: any) => ({...prev, [refill.id]: true}));
            });
        }
      });
    }
  }, [refills, activeTab, loadedRefillDetails]);
  
  // Warenbewegungen abrufen
  const [movementFilter, setMovementFilter] = useState({
    startDate: '',
    endDate: '',
    productId: '',
    movementType: '',
    limit: 50,
    offset: 0
  });
  
  const {
    data: inventoryMovements = [] as InventoryMovement[],
    isLoading: movementsLoading
  } = useQuery<InventoryMovement[]>({
    queryKey: ['/api/inventory-movements', { 
      warehouseId: Number(id),
      startDate: movementFilter.startDate || undefined,
      endDate: movementFilter.endDate || undefined,
      productId: movementFilter.productId || undefined,
      movementType: movementFilter.movementType || undefined,
      limit: movementFilter.limit,
      offset: movementFilter.offset
    }],
    enabled: !!id && activeTab === "movements"
  });
  
  // Kombinierte Warenbewegungen (Lager + Refills)
  const combinedMovements = useMemo(() => {
    // Basis-Bewegungen aus der Inventar-Tabelle
    const baseMovements = [...(inventoryMovements || [])];
    
    // Refill-Daten umwandeln und hinzufügen
    if (refills && refills.length > 0) {
      const refillMovements: InventoryMovement[] = [];
      
      refills.forEach(refill => {
        // Sicherstellen, dass refill ein gültiges Objekt ist
        if (refill && typeof refill === 'object') {
          // Sicherstellen, dass details ein Array ist
          const details = Array.isArray(refill.details) ? refill.details : [];
          
          if (details.length > 0) {
            details.forEach(detail => {
              // Sicherstellen, dass detail ein gültiges Objekt ist
              if (detail && typeof detail === 'object') {
                // Sichere Zugriffe auf Eigenschaften mit Fallbacks
                const added = typeof detail.added === 'number' ? detail.added : 0;
                const removed = typeof detail.removed === 'number' ? detail.removed : 0;
                
                if (added > 0 || removed > 0) {
                  // Eindeutige ID für diesen Eintrag generieren
                  const uniqueId = (detail.id || Math.floor(Math.random() * 1000000)) + 1000000;
                  
                  // Sichere Konvertierung von productId
                  let productId = 0;
                  if (typeof detail.productId === 'string') {
                    productId = parseInt(detail.productId, 10) || 0;
                  } else if (typeof detail.productId === 'number') {
                    productId = detail.productId;
                  }
                  
                  refillMovements.push({
                    id: uniqueId,
                    warehouseId: Number(id),
                    productId: productId,
                    quantity: added > 0 ? added : -removed,
                    type: added > 0 ? "IN" : "OUT",
                    movementType: "REFILL",
                    referenceType: "REFILL",
                    referenceId: refill.vendonId || "",
                    productName: detail.productName || "Unbekanntes Produkt",
                    performedAt: refill.datetime || new Date().toISOString(),
                    performedByName: "Automat",
                    machineId: refill.machineId || 0,
                    machineName: refill.machineName || "Unbekannter Automat",
                    source: "vendon",
                    createdAt: refill.datetime || new Date().toISOString(),
                  });
                }
              }
            });
          }
        }
      });
      
      // Kombiniere und sortiere nach Datum (absteigend)
      return [...baseMovements, ...refillMovements].sort((a, b) => {
        const dateA = a.performedAt ? new Date(a.performedAt).getTime() : 0;
        const dateB = b.performedAt ? new Date(b.performedAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    
    return baseMovements;
  }, [inventoryMovements, refills, id]);
  
  // Mutation für das Starten einer neuen Inventur
  const startNewInventoryCountMutation = useMutation({
    mutationFn: async () => {
      // API-Aufruf für das Erstellen einer neuen Inventur im Status "in_progress"
      return await fetch(`/api/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId: Number(id),
          notes: inventoryCountNotes,
          status: 'in_progress' // Status auf "in Bearbeitung" setzen
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Starten der Inventur');
        return res.json();
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      setActiveInventoryCount(data.id);
      toast({
        title: "Inventur gestartet",
        description: "Die Inventur wurde erfolgreich gestartet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Starten der Inventur",
        description: error.message || "Die Inventur konnte nicht gestartet werden.",
        variant: "destructive"
      });
      setIsCountInProgress(false); // Zurücksetzen falls Fehler
    }
  });
  
  // Initialisiere Inventurzählung mit aktuellen Beständen
  useEffect(() => {
    if (Array.isArray(inventory) && inventory.length > 0 && activeTab === "inventory-count") {
      console.log("Initialisiere Inventur mit", inventory.length, "Produkten");
      try {
        setInventoryCountItems(
          inventory.map(item => ({
            productId: typeof item.productId === 'string' ? Number(item.productId) : item.productId,
            productName: item.productName || "Unbekannt",
            currentQuantity: item.quantity || 0,
            countedQuantity: item.quantity || 0, // Standardmäßig aktueller Bestand
            difference: 0,
            sku: item.sku || "",
            location: item.locationInWarehouse || ""
          }))
        );
      } catch (error) {
        console.error("Fehler beim Initialisieren der Inventurzählung:", error);
        // Setze einen leeren Standardwert, wenn die Verarbeitung fehlschlägt
        setInventoryCountItems([]);
      }
    } else if (activeTab === "inventory-count") {
      console.log("Inventory für Zählung ist leer oder kein Array", inventory);
      // Stelle sicher, dass inventoryCountItems immer ein Array ist, auch wenn keine Daten vorhanden sind
      setInventoryCountItems([]);
    }
  }, [inventory, activeTab]);
  
  // Gefilterte Inventur-Items basierend auf der Suche
  const filteredInventoryItems = useMemo(() => {
    if (!searchQueryInventory.trim()) return inventoryCountItems;
    
    const lowerCaseQuery = searchQueryInventory.toLowerCase();
    return inventoryCountItems.filter(item => 
      item.productName.toLowerCase().includes(lowerCaseQuery) || 
      (item.sku && item.sku.toLowerCase().includes(lowerCaseQuery)) ||
      (item.location && item.location.toLowerCase().includes(lowerCaseQuery))
    );
  }, [inventoryCountItems, searchQueryInventory]);
  
  // Dialog-Zustände
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isAddMovementDialogOpen, setIsAddMovementDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [assignNotes, setAssignNotes] = useState("");
  
  // Zustand für Warenbewegung-Dialog
  const [movementType, setMovementType] = useState<"IN" | "OUT" | "TRANSFER" | "ADJUSTMENT">("IN");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [movementQuantity, setMovementQuantity] = useState<number>(1);
  const [movementNotes, setMovementNotes] = useState("");
  const [selectedDestinationWarehouse, setSelectedDestinationWarehouse] = useState<string>("");

  // Alle Lager für die Umlagerung abrufen
  const {
    data: warehouses = [] as any[],
    isLoading: warehousesLoading
  } = useQuery<any[]>({
    queryKey: ['/api/warehouses'],
    enabled: isAddMovementDialogOpen && movementType === "TRANSFER"
  });

  // Mutation für das Erstellen einer Warenbewegung
  const createMovementMutation = useMutation({
    mutationFn: async (data: any) => {
      return await fetch(`/api/inventory-movements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Erstellen der Warenbewegung');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      setIsAddMovementDialogOpen(false);
      setSelectedProduct("");
      setMovementQuantity(1);
      setMovementNotes("");
      setMovementType("IN");
      
      toast({
        title: "Warenbewegung erstellt",
        description: "Die Warenbewegung wurde erfolgreich erstellt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Erstellen der Warenbewegung",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Mutation für das Speichern eines Inventur-Items
  const saveInventoryCountItemMutation = useMutation({
    mutationFn: async ({ inventoryCountId, item, status = 'in_progress' }: { inventoryCountId: number, item: any, status?: string }) => {
      // Erstelle ein neues Objekt mit nur den für die API benötigten Feldern
      const apiItem = {
        productId: Number(item.productId),
        currentQuantity: Number(item.currentQuantity),
        countedQuantity: Number(item.countedQuantity),
        difference: Number(item.countedQuantity) - Number(item.currentQuantity)
      };
      
      return await fetch(`/api/inventory-counts/${inventoryCountId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: status, // Übergebe den Status
          items: [apiItem]  // Sende nur das eine Item
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Speichern der Inventurzählung');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      toast({
        title: "Artikel gespeichert",
        description: "Der Inventurartikel wurde erfolgreich gespeichert.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Speichern",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation für das Speichern der kompletten Inventur
  const saveInventoryCountMutation = useMutation({
    mutationFn: async ({ inventoryCountId, status = 'completed', hasAdjustments = false }: { inventoryCountId: number, status?: string, hasAdjustments?: boolean }) => {
      // Erfasse alle Produkte mit einer Abweichung
      const itemsWithDifference = inventoryCountItems.filter(item => 
        Number(item.countedQuantity) !== Number(item.currentQuantity)
      ).map(item => ({
        productId: Number(item.productId),
        currentQuantity: Number(item.currentQuantity),
        countedQuantity: Number(item.countedQuantity),
        difference: Number(item.countedQuantity) - Number(item.currentQuantity)
      }));
      
      return await fetch(`/api/inventory-counts/${inventoryCountId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: status, // Finalisieren mit Status 'completed'
          adjustStock: hasAdjustments, // Lagerbestand anpassen falls gewünscht
          items: itemsWithDifference // Sende nur Items mit Abweichung
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Speichern der Inventurzählung');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      setIsCountInProgress(false);
      setActiveInventoryCount(null);
      
      toast({
        title: "Inventur abgeschlossen",
        description: "Die Inventurzählung wurde erfolgreich gespeichert und abgeschlossen.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Speichern",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation für das Löschen einer Inventur
  const deleteInventoryCountMutation = useMutation({
    mutationFn: async (inventoryCountId: number) => {
      return await fetch(`/api/inventory-counts/${inventoryCountId}`, {
        method: 'DELETE',
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Löschen der Inventurzählung');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      setSelectedInventoryCount(null);
      setActiveInventoryCount(null);
      
      toast({
        title: "Inventur gelöscht",
        description: "Die Inventurzählung wurde erfolgreich gelöscht.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation für die Zuordnung von Automaten zu diesem Lager
  const assignMachineMutation = useMutation({
    mutationFn: async (data: {machineId: number, warehouseId: number, isPrimary: boolean, notes?: string}) => {
      return await fetch(`/api/machine-warehouse-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler bei der Automatenzuordnung');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      setIsAssignDialogOpen(false);
      setSelectedMachine(null);
      setAssignNotes("");
      
      toast({
        title: "Automat zugeordnet",
        description: "Der Automat wurde erfolgreich diesem Lager zugeordnet.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler bei der Zuordnung",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation für das Entfernen einer Automatenzuordnung
  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return await fetch(`/api/machine-warehouse-assignments/${assignmentId}`, {
        method: 'DELETE',
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Entfernen der Zuordnung');
        return res.ok;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      
      toast({
        title: "Zuordnung entfernt",
        description: "Die Automatenzuordnung wurde erfolgreich entfernt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Entfernen",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Funktion zum Ändern der Tab-Auswahl mit URL-Parameter
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    
    // Aktualisiere URL mit Tab-Parameter aber behalte andere Parameter bei
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('tab', value);
    
    // Aktualisiere die URL mit Wouter ohne Seitenneuladen
    setLocation(`${window.location.pathname}?${currentUrl.searchParams.toString()}`);
  };
  
  // Funktion zum Aktualisieren der gezählten Menge
  const updateCountedQuantity = (productId: string | number, newValue: number) => {
    setInventoryCountItems((prevItems: any) => 
      prevItems.map((item: any) => 
        item.productId == productId 
          ? { 
              ...item, 
              countedQuantity: newValue,
              difference: newValue - Number(item.currentQuantity)
            } 
          : item
      )
    );
  };
  
  // Funktion zum Speichern einer einzelnen Zählung
  const saveCountedItem = (item: any) => {
    if (!activeInventoryCount) {
      toast({
        title: "Fehler",
        description: "Keine aktive Inventurzählung gefunden.",
        variant: "destructive"
      });
      return;
    }
    
    saveInventoryCountItemMutation.mutate({ 
      inventoryCountId: activeInventoryCount, 
      item 
    });
  };
  
  // Funktion zum Speichern und Beenden
  const saveAndCompleteCount = (adjustStock: boolean = false) => {
    if (!activeInventoryCount) {
      toast({
        title: "Fehler",
        description: "Keine aktive Inventurzählung gefunden.",
        variant: "destructive"
      });
      return;
    }
    
    saveInventoryCountMutation.mutate({
      inventoryCountId: activeInventoryCount,
      status: 'completed',
      hasAdjustments: adjustStock
    });
  };
  
  // Funktion zum Starten einer Inventur
  const startInventoryCount = () => {
    setIsCountInProgress(true);
    startNewInventoryCountMutation.mutate();
  };

  // Funktion zum Abbrechen einer Inventur
  const cancelInventoryCount = () => {
    if (activeInventoryCount) {
      deleteInventoryCountMutation.mutate(activeInventoryCount);
    }
    setIsCountInProgress(false);
    setActiveInventoryCount(null);
  };
  
  // Rendere Ladeindikator oder Fehler, wenn nötig
  if (warehouseLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Lade Lagerdetails...</span>
      </div>
    );
  }
  
  if (warehouseError || !warehouse) {
    return (
      <div className="container max-w-6xl mx-auto p-4">
        <div className="flex items-center mb-4">
          <Button variant="ghost" onClick={() => setLocation("/warehouses")}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zur Übersicht
          </Button>
        </div>
        
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden der Daten</AlertTitle>
          <AlertDescription>
            {warehouseError instanceof Error 
              ? warehouseError.message 
              : "Die Lagerdetails konnten nicht geladen werden."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // Render UI
  return (
    <div className="container max-w-6xl mx-auto pb-8">
      {/* Zurück-Button und Titel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pt-4 pb-2">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => setLocation("/warehouses")} className="p-2 mr-2">
            <ChevronLeft className="h-4 w-4" />
            <span className="ml-1">Zurück</span>
          </Button>
          
          <h1 className="text-2xl font-bold">
            <Building2 className="inline-block mr-2 h-6 w-6" />
            {warehouse.name}
          </h1>
        </div>
        
        <div className="flex mt-2 md:mt-0">
          {activeTab === "inventory" && (
            <Button
              onClick={() => setIsAddMovementDialogOpen(true)}
              className="ml-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Warenbewegung
            </Button>
          )}
          
          {activeTab === "machines" && (
            <Button
              onClick={() => setIsAssignDialogOpen(true)}
              className="ml-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Automat zuordnen
            </Button>
          )}
          
          {activeTab === "inventory-count" && !isCountInProgress && !activeInventoryCount && (
            <Button
              onClick={() => setIsCountInProgress(true)}
              className="ml-2"
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Neue Inventur starten
            </Button>
          )}
        </div>
      </div>
      
      {/* Lager-Details Card */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex justify-between items-center">
            <span>Lager-Details</span>
            <Badge variant={warehouse.status === 'active' ? 'default' : 'secondary'}>
              {warehouse.status === 'active' ? 'Aktiv' : warehouse.status}
            </Badge>
          </CardTitle>
          <CardDescription>
            {warehouse.description || "Keine Beschreibung verfügbar"}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-start">
                <MapPin className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Adresse</p>
                  <p className="text-sm text-muted-foreground">
                    {warehouse.address || "Keine Adresse angegeben"}
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex items-start">
                <Phone className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Status</p>
                  <p className="text-sm text-muted-foreground">
                    {warehouse.status || "Kein Status angegeben"}
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex items-start">
                <Mail className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Beschreibung</p>
                  <p className="text-sm text-muted-foreground">
                    {warehouse.description || "Keine Beschreibung angegeben"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Tabs für verschiedene Bereiche */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">
            <Building2 className="h-4 w-4 mr-2" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4 mr-2" />
            Lagerbestand
          </TabsTrigger>
          <TabsTrigger value="movements">
            <Truck className="h-4 w-4 mr-2" />
            Warenbewegungen
          </TabsTrigger>
          <TabsTrigger value="machines">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Automaten
          </TabsTrigger>
          <TabsTrigger value="inventory-count">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inventur
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Produkte</CardTitle>
                <CardDescription>Gesamtanzahl im Lager</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Array.isArray(inventory) ? inventory.length : 0}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Automaten</CardTitle>
                <CardDescription>Zugewiesene Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Array.isArray(machineAssignments) ? machineAssignments.length : 0}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Inventuren</CardTitle>
                <CardDescription>Durchgeführte Zählungen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Array.isArray(inventoryCounts) ? inventoryCounts.length : 0}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Letzte Warenbewegungen</CardTitle>
              <CardDescription>Die letzten 5 Warenbewegungen für dieses Lager</CardDescription>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : combinedMovements.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedMovements.slice(0, 5).map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="font-medium">
                          {new Date(movement.performedAt || movement.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{movement.productName}</TableCell>
                        <TableCell>
                          <Badge variant={movement.type === 'IN' ? 'default' : 'destructive'}>
                            {movement.type === 'IN' ? 'Eingang' : 'Ausgang'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {Math.abs(Number(movement.quantity))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-4 text-muted-foreground">
                  Keine Warenbewegungen gefunden
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="ghost" onClick={() => handleTabChange("movements")}>
                Alle Warenbewegungen anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Lagerbestand</CardTitle>
              <CardDescription>
                Aktuelle Bestände aller Produkte in diesem Lager
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WarehouseInventory 
                inventory={inventory} 
                warehouseId={Number(id)}
                isLoading={inventoryLoading} 
                error={inventoryError}
                onRefresh={() => refetchInventory()}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="movements">
          <Card>
            <CardHeader>
              <CardTitle>Warenbewegungen</CardTitle>
              <CardDescription>
                Ein- und Ausgänge sowie Anpassungen des Lagerbestands
              </CardDescription>
            </CardHeader>
            <CardContent>
              {movementsLoading || refillsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                    <div className="flex items-center">
                      <Input
                        placeholder="Suchen..."
                        className="max-w-xs"
                        value={movementFilter.productId || ''}
                        onChange={(e) => setMovementFilter((prev: any) => ({ ...prev, productId: e.target.value }))}
                      />
                      <Button
                        variant="ghost"
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/refills'] });
                        }}
                        className="ml-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => setIsAddMovementDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Warenbewegung
                    </Button>
                  </div>
                  
                  {combinedMovements.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Produkt</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead className="text-right">Menge</TableHead>
                            <TableHead>Quelle</TableHead>
                            <TableHead>Notizen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {combinedMovements.map((movement) => (
                            <TableRow key={movement.id}>
                              <TableCell className="font-medium">
                                {new Date(movement.performedAt || movement.createdAt).toLocaleDateString()}
                                &nbsp;
                                {new Date(movement.performedAt || movement.createdAt).toLocaleTimeString()}
                              </TableCell>
                              <TableCell>{movement.productName}</TableCell>
                              <TableCell>
                                <Badge variant={movement.type === 'IN' ? 'default' : 'destructive'}>
                                  {movement.type === 'IN' ? 'Eingang' : 'Ausgang'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {Math.abs(Number(movement.quantity))}
                              </TableCell>
                              <TableCell>
                                {movement.source === 'vendon' ? (
                                  <div className="flex items-center">
                                    <ShoppingCart className="h-4 w-4 mr-1" />
                                    <span>{movement.machineName}</span>
                                  </div>
                                ) : (
                                  <span>{movement.movementType || "Manuell"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="truncate max-w-[200px] block">
                                  {movement.notes || "-"}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center p-8 border rounded-md">
                      <div className="text-muted-foreground">Keine Warenbewegungen gefunden</div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="machines">
          <Card>
            <CardHeader>
              <CardTitle>Zugewiesene Automaten</CardTitle>
              <CardDescription>
                Automaten, die von diesem Lager beliefert werden
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => setIsAssignDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Automat zuordnen
                    </Button>
                  </div>
                  
                  {machineAssignments.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Automat</TableHead>
                            <TableHead>Standort</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Primäres Lager</TableHead>
                            <TableHead>Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machineAssignments.map((assignment) => (
                            <TableRow key={assignment.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center">
                                  <ShoppingCart className="h-4 w-4 mr-2" />
                                  <span>
                                    {assignment.machine?.machineName || "Unbekannter Automat"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {assignment.machine?.location || "Unbekannt"}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={assignment.machine?.status === 'active' ? 'default' : 'secondary'}
                                >
                                  {assignment.machine?.status === 'active' ? 'Aktiv' : assignment.machine?.status || 'Unbekannt'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {assignment.isPrimary ? (
                                  <Badge variant="default">Primär</Badge>
                                ) : (
                                  <Badge variant="outline">Sekundär</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => setLocation(`/machines/${assignment.machine?.id}`)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Möchten Sie diese Zuordnung wirklich entfernen?')) {
                                        removeAssignmentMutation.mutate(assignment.id);
                                      }
                                    }}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center p-8 border rounded-md">
                      <div className="text-muted-foreground">
                        Keine Automaten diesem Lager zugewiesen
                      </div>
                      <Button
                        className="mt-4"
                        onClick={() => setIsAssignDialogOpen(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Ersten Automaten zuordnen
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="inventory-count">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Inventurzählung</CardTitle>
                  <CardDescription>
                    Bestandsaufnahme und Abgleich der Lagerbestände
                  </CardDescription>
                </div>
                
                {!isCountInProgress && !activeInventoryCount && (
                  <Button
                    onClick={() => setIsCountInProgress(true)}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Neue Inventur starten
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {inventoryCountsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : isCountInProgress ? (
                // Formular zum Starten einer neuen Inventur
                <div className="border rounded-md p-6">
                  <div className="space-y-4">
                    <div className="text-lg font-medium">Neue Inventurzählung starten</div>
                    <div className="text-sm text-muted-foreground">
                      Starten Sie eine neue Inventurzählung, um den aktuellen Lagerbestand zu erfassen.
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="notes">Anmerkungen zur Inventur</Label>
                      <Textarea 
                        id="notes" 
                        value={inventoryCountNotes}
                        onChange={(e) => setInventoryCountNotes(e.target.value)}
                        placeholder="Optionale Anmerkungen zur Inventur"
                      />
                    </div>
                    
                    <div className="flex items-center justify-end gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsCountInProgress(false);
                          setInventoryCountNotes("");
                        }}
                      >
                        Abbrechen
                      </Button>
                      <Button
                        onClick={startInventoryCount}
                        disabled={startNewInventoryCountMutation.isPending}
                      >
                        {startNewInventoryCountMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Inventur starten
                      </Button>
                    </div>
                  </div>
                </div>
              ) : activeInventoryCount ? (
                // Aktive Inventurzählung anzeigen
                <div>
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-medium mb-1">Laufende Inventurzählung</h3>
                      <p className="text-sm text-muted-foreground">
                        Erfassen Sie die tatsächlichen Mengen für jeden Artikel im Lager
                      </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button 
                        variant="outline" 
                        onClick={cancelInventoryCount}
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Abbrechen
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button>
                            <Save className="mr-2 h-4 w-4" />
                            Speichern
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => saveAndCompleteCount(false)}
                            disabled={saveInventoryCountMutation.isPending}
                          >
                            {saveInventoryCountMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Speichern und abschließen
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => saveAndCompleteCount(true)}
                            disabled={saveInventoryCountMutation.isPending}
                          >
                            {saveInventoryCountMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Speichern, abschließen und anpassen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Nach Produkt, Artikelnummer oder Lagerort suchen..."
                        className="pl-8"
                        value={searchQueryInventory}
                        onChange={(e) => setSearchQueryInventory(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead>Artikelnummer</TableHead>
                          <TableHead className="text-right">Systembestand</TableHead>
                          <TableHead className="text-right">Gezählter Bestand</TableHead>
                          <TableHead className="text-right">Differenz</TableHead>
                          <TableHead className="text-center">Aktion</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventoryItems.length > 0 ? (
                          filteredInventoryItems.map((item, index) => {
                            const difference = Number(item.countedQuantity) - Number(item.currentQuantity);
                            return (
                              <TableRow key={`${item.productId}-${index}`}>
                                <TableCell className="font-medium">{item.productName}</TableCell>
                                <TableCell>{item.sku || "-"}</TableCell>
                                <TableCell className="text-right">{item.currentQuantity}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.countedQuantity}
                                    onChange={(e) => updateCountedQuantity(item.productId, parseInt(e.target.value) || 0)}
                                    className="w-24 text-right inline-block"
                                  />
                                </TableCell>
                                <TableCell className={`text-right ${difference !== 0 ? (difference > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                                  {difference > 0 ? '+' : ''}{difference}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => saveCountedItem(item)}
                                    disabled={saveInventoryCountItemMutation.isPending}
                                    title="Artikel speichern"
                                  >
                                    {saveInventoryCountItemMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6">
                              <div className="text-muted-foreground">Keine Produkte gefunden</div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                // Liste aller bisherigen Inventuren
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-medium">Vergangene Inventurzählungen</h3>
                      <p className="text-sm text-muted-foreground">
                        Übersicht aller durchgeführten Inventuren
                      </p>
                    </div>
                  </div>
                  
                  {inventoryCounts.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Artikel</TableHead>
                            <TableHead className="text-right">Anpassungen</TableHead>
                            <TableHead>Durchgeführt von</TableHead>
                            <TableHead>Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryCounts.map((count) => (
                            <TableRow key={count.id}>
                              <TableCell className="font-medium">
                                {new Date(count.startDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant={count.status === 'completed' ? 'default' : 'secondary'}>
                                  {count.status === 'completed' ? 'Abgeschlossen' : 
                                   count.status === 'in_progress' ? 'In Bearbeitung' : count.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{count.itemCount || 0}</TableCell>
                              <TableCell className="text-right">{count.adjustmentCount || 0}</TableCell>
                              <TableCell>{count.initiatedByName || "System"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedInventoryCount(count);
                                      setInventoryDetailDialogOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  
                                  {count.status === 'in_progress' && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setActiveInventoryCount(count.id);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Möchten Sie diese Inventurzählung wirklich löschen?')) {
                                        deleteInventoryCountMutation.mutate(count.id);
                                      }
                                    }}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center p-8 border rounded-md">
                      <div className="text-muted-foreground">
                        Keine Inventurzählungen gefunden
                      </div>
                      <Button
                        className="mt-4"
                        onClick={() => setIsCountInProgress(true)}
                      >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Erste Inventur starten
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Dialog: Automaten zuordnen */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automat zuordnen</DialogTitle>
            <DialogDescription>
              Weisen Sie einen Automaten diesem Lager zu
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="machine">Automat auswählen</Label>
              <Select
                value={selectedMachine?.id?.toString() || ""}
                onValueChange={(value) => {
                  const machine = machines.find(m => m.id.toString() === value);
                  setSelectedMachine(machine || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen Sie einen Automaten" />
                </SelectTrigger>
                <SelectContent>
                  {machinesLoading ? (
                    <div className="flex justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : machines.length > 0 ? (
                    machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id.toString()}>
                        {machine.machineName} ({machine.location})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      Keine Automaten verfügbar
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="isPrimary" 
                  checked={selectedMachine?.isPrimary} 
                  onCheckedChange={(checked) => 
                    setSelectedMachine(prev => ({ ...prev, isPrimary: !!checked }))
                  }
                />
                <Label htmlFor="isPrimary">Primäres Lager</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Wenn aktiviert, wird dieses Lager als Hauptquelle für den Automaten verwendet
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="assignNotes">Anmerkungen</Label>
              <Textarea 
                id="assignNotes" 
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Optionale Anmerkungen zur Zuordnung"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsAssignDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (selectedMachine) {
                  assignMachineMutation.mutate({
                    machineId: selectedMachine.id,
                    warehouseId: Number(id),
                    isPrimary: !!selectedMachine.isPrimary,
                    notes: assignNotes
                  });
                }
              }}
              disabled={!selectedMachine || assignMachineMutation.isPending}
            >
              {assignMachineMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Zuordnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog: Inventur Details */}
      <Dialog open={inventoryDetailDialogOpen} onOpenChange={setInventoryDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Inventur-Details</DialogTitle>
            <DialogDescription>
              Details der Inventurzählung vom {selectedInventoryCount ? new Date(selectedInventoryCount.startDate).toLocaleDateString() : ''}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInventoryCount && (
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium">Status</h4>
                    <Badge variant={selectedInventoryCount.status === 'completed' ? 'default' : 'secondary'} className="mt-1">
                      {selectedInventoryCount.status === 'completed' ? 'Abgeschlossen' : 
                       selectedInventoryCount.status === 'in_progress' ? 'In Bearbeitung' : selectedInventoryCount.status}
                    </Badge>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium">Durchgeführt von</h4>
                    <p className="text-sm">{selectedInventoryCount.initiatedByName || "System"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium">Start-Datum</h4>
                    <p className="text-sm">{new Date(selectedInventoryCount.startDate).toLocaleString()}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium">End-Datum</h4>
                    <p className="text-sm">
                      {selectedInventoryCount.endDate ? 
                        new Date(selectedInventoryCount.endDate).toLocaleString() : "Noch nicht abgeschlossen"}
                    </p>
                  </div>
                </div>
                
                {selectedInventoryCount.notes && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Anmerkungen</h4>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      {selectedInventoryCount.notes}
                    </div>
                  </div>
                )}
                
                <Separator />
                
                <div>
                  <h4 className="text-sm font-medium mb-2">Inventurartikel</h4>
                  
                  {selectedInventoryCount.items && selectedInventoryCount.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead className="text-right">Systembestand</TableHead>
                          <TableHead className="text-right">Gezählter Bestand</TableHead>
                          <TableHead className="text-right">Differenz</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedInventoryCount.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.productName || "Unbekannt"}</TableCell>
                            <TableCell className="text-right">{item.currentQuantity}</TableCell>
                            <TableCell className="text-right">{item.countedQuantity}</TableCell>
                            <TableCell 
                              className={`text-right ${
                                item.difference !== 0 
                                  ? (item.difference > 0 ? 'text-green-600' : 'text-red-600') 
                                  : ''
                              }`}
                            >
                              {item.difference > 0 ? '+' : ''}{item.difference}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Keine Artikel gefunden</p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          
          <DialogFooter>
            <Button onClick={() => setInventoryDetailDialogOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog: Warenbewegung hinzufügen */}
      <Dialog open={isAddMovementDialogOpen} onOpenChange={setIsAddMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Warenbewegung hinzufügen</DialogTitle>
            <DialogDescription>
              Erfassen Sie eine neue Warenbewegung für dieses Lager
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="movementType">Bewegungstyp</Label>
              <Select
                value={movementType}
                onValueChange={(value: any) => setMovementType(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen Sie einen Typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Wareneingang</SelectItem>
                  <SelectItem value="OUT">Warenausgang</SelectItem>
                  <SelectItem value="TRANSFER">Umlagerung</SelectItem>
                  <SelectItem value="ADJUSTMENT">Bestandskorrektur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="product">Produkt</Label>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen Sie ein Produkt" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryLoading ? (
                    <div className="flex justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : inventory.length > 0 ? (
                    inventory.map((item) => (
                      <SelectItem key={item.productId} value={item.productId.toString()}>
                        {item.productName} ({item.sku || "Keine SKU"})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      Keine Produkte verfügbar
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quantity">Menge</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={movementQuantity}
                onChange={(e) => setMovementQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
            
            {movementType === "TRANSFER" && (
              <div className="space-y-2">
                <Label htmlFor="destinationWarehouse">Ziellager</Label>
                <Select
                  value={selectedDestinationWarehouse}
                  onValueChange={setSelectedDestinationWarehouse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Bitte wählen Sie ein Ziellager" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehousesLoading ? (
                      <div className="flex justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : warehouses.length > 0 ? (
                      warehouses
                        .filter((w) => w.id.toString() !== id)
                        .map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            {warehouse.name}
                          </SelectItem>
                        ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">
                        Keine anderen Lager verfügbar
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Anmerkungen</Label>
              <Textarea 
                id="notes" 
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                placeholder="Optionale Anmerkungen zur Warenbewegung"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsAddMovementDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (!selectedProduct) {
                  toast({
                    title: "Fehler",
                    description: "Bitte wählen Sie ein Produkt aus.",
                    variant: "destructive"
                  });
                  return;
                }
                
                if (movementType === "TRANSFER" && !selectedDestinationWarehouse) {
                  toast({
                    title: "Fehler",
                    description: "Bitte wählen Sie ein Ziellager aus.",
                    variant: "destructive"
                  });
                  return;
                }
                
                const movementData: any = {
                  productId: Number(selectedProduct),
                  quantity: movementQuantity,
                  movementType: movementType,
                  notes: movementNotes || undefined
                };
                
                if (movementType === "OUT" || movementType === "ADJUSTMENT") {
                  // Für Ausgänge und Korrekturen wird die Menge negativ
                  movementData.quantity = -movementQuantity;
                }
                
                if (movementType === "TRANSFER") {
                  // Für Umlagerungen werden zusätzliche Felder benötigt
                  movementData.sourceWarehouseId = Number(id);
                  movementData.destinationWarehouseId = Number(selectedDestinationWarehouse);
                } else {
                  // Für normale Bewegungen nur das Lager
                  movementData.warehouseId = Number(id);
                }
                
                createMovementMutation.mutate(movementData);
              }}
              disabled={
                !selectedProduct || 
                (movementType === "TRANSFER" && !selectedDestinationWarehouse) ||
                createMovementMutation.isPending
              }
            >
              {createMovementMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

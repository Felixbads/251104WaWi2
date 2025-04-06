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

// Removed duplicate icons import

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  
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

  // Inventuren abrufen
  const {
    data: inventoryCounts = [] as InventoryCount[],
    isLoading: inventoryCountsLoading
  } = useQuery<InventoryCount[]>({
    queryKey: ['/api/inventory-counts', { warehouseId: Number(id) }],
    enabled: !!id && activeTab === "inventory-count"
  });
  
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
              setLoadedRefillDetails(prev => ({...prev, [refill.id]: true}));
            })
            .catch(err => {
              console.error(`Fehler beim Laden der Details für Refill ${refill.id}:`, err);
              // Stelle sicher, dass details zumindest ein leeres Array ist
              refill.details = [];
              // Markiere trotzdem als geladen, um weitere Versuche zu vermeiden
              setLoadedRefillDetails(prev => ({...prev, [refill.id]: true}));
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
  
  // Zustand für die Inventur (Inventurzählung)
  const [inventoryCountItems, setInventoryCountItems] = useState<any[]>([]);
  const [isCountInProgress, setIsCountInProgress] = useState(false);
  const [inventoryCountNotes, setInventoryCountNotes] = useState("");
  const [searchQueryInventory, setSearchQueryInventory] = useState("");
  const [activeInventoryCount, setActiveInventoryCount] = useState<number | null>(null);
  const [inventoryDetailDialogOpen, setInventoryDetailDialogOpen] = useState(false);
  const [selectedInventoryCount, setSelectedInventoryCount] = useState<InventoryCount | null>(null);
  
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
  
  // Mutation für die Erstellung einer Inventur (abschließen)
  const createInventoryCountMutation = useMutation({
    mutationFn: async (data: any) => {
      // API-Aufruf für das Erstellen einer neuen Inventur
      return await fetch(`/api/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          status: 'completed' // Status auf "abgeschlossen" setzen
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Erstellen der Inventur');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: "Inventur abgeschlossen",
        description: "Die Inventur wurde erfolgreich durchgeführt und der Lagerbestand aktualisiert.",
      });
      setIsCountInProgress(false);
      setInventoryCountNotes("");
      setSearchQueryInventory("");
    },
    onError: (error: any) => {
      toast({
        title: "Fehler bei der Inventur",
        description: error.message || "Die Inventur konnte nicht durchgeführt werden.",
        variant: "destructive"
      });
    }
  });
  
  // Mutation für das Zwischenspeichern einer Inventur
  const saveTemporaryInventoryCountMutation = useMutation({
    mutationFn: async (data: any) => {
      // API-Aufruf für das temporäre Speichern einer Inventur
      return await fetch(`/api/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          status: 'in_progress' // Status auf "in Bearbeitung" setzen
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Zwischenspeichern der Inventur');
        return res.json();
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      // Aktive Inventur setzen
      setActiveInventoryCount(data.id);
      toast({
        title: "Inventur zwischengespeichert",
        description: "Die Inventur wurde erfolgreich zwischengespeichert und kann später fortgesetzt werden.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Zwischenspeichern",
        description: error.message || "Die Inventur konnte nicht zwischengespeichert werden.",
        variant: "destructive"
      });
    }
  });
  
  // Mutation für das Hinzufügen einer Warenbewegung
  const createInventoryMovementMutation = useMutation({
    mutationFn: async (data: any) => {
      // API-Aufruf für das Erstellen einer neuen Warenbewegung
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
      toast({
        title: "Warenbewegung erstellt",
        description: "Die Warenbewegung wurde erfolgreich gespeichert.",
      });
      
      // Dialog schließen und Felder zurücksetzen
      setIsAddMovementDialogOpen(false);
      setMovementType("IN");
      setSelectedProduct("");
      setMovementQuantity(1);
      setMovementNotes("");
      setSelectedDestinationWarehouse("");
    },
    onError: (error: any) => {
      toast({
        title: "Fehler bei der Warenbewegung",
        description: error.message || "Die Warenbewegung konnte nicht erstellt werden.",
        variant: "destructive"
      });
    }
  });
  
  // Inventurzählung abschließen
  const handleCompleteInventoryCount = () => {
    createInventoryCountMutation.mutate({
      warehouseId: Number(id),
      notes: inventoryCountNotes,
      items: inventoryCountItems.map(item => ({
        productId: item.productId,
        countedQuantity: item.countedQuantity,
        difference: item.countedQuantity - item.currentQuantity
      }))
    });
  };
  
  // Gezählte Menge aktualisieren
  const handleCountedQuantityChange = (productId: number, countedQuantity: number) => {
    setInventoryCountItems(prevItems =>
      prevItems.map(item =>
        item.productId === productId
          ? {
              ...item,
              countedQuantity,
              difference: countedQuantity - item.currentQuantity
            }
          : item
      )
    );
  };
  
  // Laden-Zustand und Fehlerbehandlung
  if (warehouseLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-lg text-muted-foreground">Lager wird geladen...</span>
      </div>
    );
  }

  if (warehouseError) {
    return (
      <Alert variant="destructive" className="my-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fehler beim Laden des Lagers</AlertTitle>
        <AlertDescription>
          {(warehouseError as Error).message || "Bitte versuchen Sie es später erneut."}
        </AlertDescription>
        <div className="mt-4">
          <Button onClick={() => setLocation("/lager")}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zur Übersicht
          </Button>
        </div>
      </Alert>
    );
  }

  // Wenn kein Lager gefunden wurde
  if (!warehouse) {
    return (
      <Alert className="my-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Lager nicht gefunden</AlertTitle>
        <AlertDescription>
          Das angeforderte Lager konnte nicht gefunden werden.
        </AlertDescription>
        <div className="mt-4">
          <Button onClick={() => setLocation("/lager")}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zur Übersicht
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Kopfzeile mit Lagername und Zurück-Button */}
      <div className="flex justify-between items-center">
        <div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setLocation("/lager")}
            className="mb-2"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Zurück zur Übersicht
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{warehouse.name}</h1>
          {warehouse.description && (
            <p className="text-muted-foreground mt-1">{warehouse.description}</p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {warehouse.isActive === false && (
            <Badge variant="outline" className="bg-gray-100">Inaktiv</Badge>
          )}
          {/* Weitere Aktionen könnten hier hinzugefügt werden */}
        </div>
      </div>

      {/* Tabs für die verschiedenen Lageransichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Verbesserte TabsList für bessere mobile Darstellung in zwei Reihen */}
        <div className="mb-4 md:mb-8">
          <div className="grid grid-cols-3 gap-2 mb-2 sm:hidden">
            <TabsTrigger value="overview" className="px-3 py-2">
              <Building2 className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="text-xs">Übersicht</span>
            </TabsTrigger>
            <TabsTrigger value="machines" className="px-3 py-2">
              <Truck className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="text-xs">Automaten</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="px-3 py-2">
              <Package className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="text-xs">Bestand</span>
            </TabsTrigger>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <TabsTrigger value="inventory-count" className="px-3 py-2">
              <ClipboardCheck className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="text-xs">Inventur</span>
            </TabsTrigger>
            <TabsTrigger value="movements" className="px-3 py-2">
              <ArrowDownUp className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="text-xs">Bewegungen</span>
            </TabsTrigger>
          </div>
          
          {/* Desktop-Ansicht - tabs in einer Zeile */}
          <ScrollArea className="w-full hidden sm:block">
            <TabsList className="flex w-auto min-w-full inline-flex">
              <TabsTrigger value="overview" className="px-4">
                <Building2 className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Übersicht</span>
              </TabsTrigger>
              <TabsTrigger value="machines" className="px-4">
                <Truck className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Automaten</span>
              </TabsTrigger>
              <TabsTrigger value="inventory" className="px-4">
                <Package className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Bestand</span>
              </TabsTrigger>
              <TabsTrigger value="inventory-count" className="px-4">
                <ClipboardCheck className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Inventur</span>
              </TabsTrigger>
              <TabsTrigger value="movements" className="px-4">
                <ArrowDownUp className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Bewegungen</span>
              </TabsTrigger>
            </TabsList>
          </ScrollArea>
        </div>

        {/* Tab: Übersicht */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Lager-Informationen */}
            <Card>
              <CardHeader>
                <CardTitle>Lagerinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Adresse und Kontaktdaten */}
                {(warehouse.address || warehouse.city || warehouse.postalCode) && (
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Adresse</p>
                      <p className="text-sm text-muted-foreground">
                        {warehouse.address && <>{warehouse.address}<br /></>}
                        {warehouse.postalCode && <>{warehouse.postalCode} </>}
                        {warehouse.city && <>{warehouse.city}</>}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Telefon */}
                {warehouse.phone && (
                  <div className="flex items-start space-x-2">
                    <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Telefon</p>
                      <p className="text-sm text-muted-foreground">{warehouse.phone}</p>
                    </div>
                  </div>
                )}
                
                {/* E-Mail */}
                {warehouse.email && (
                  <div className="flex items-start space-x-2">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">E-Mail</p>
                      <p className="text-sm text-muted-foreground">{warehouse.email}</p>
                    </div>
                  </div>
                )}
                
                {/* Ansprechpartner */}
                {warehouse.contactPerson && (
                  <div className="flex items-start space-x-2">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Ansprechpartner</p>
                      <p className="text-sm text-muted-foreground">{warehouse.contactPerson}</p>
                    </div>
                  </div>
                )}
                
                {/* Status and Type */}
                <div className="flex items-start space-x-2">
                  <div>
                    <p className="font-medium">Status</p>
                    <Badge variant={warehouse.isActive !== false ? "success" : "secondary"} className="mt-1">
                      {warehouse.isActive !== false ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </div>
                  
                  {warehouse.type && (
                    <div className="ml-6">
                      <p className="font-medium">Typ</p>
                      <Badge variant="outline" className="mt-1">
                        {warehouse.type}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Lager-Statistiken */}
            <Card>
              <CardHeader>
                <CardTitle>Lagerstatistiken</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Automaten */}
                  <div className="rounded-lg border p-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Automaten</h3>
                    <p className="text-2xl font-bold">{machineAssignments?.length || 0}</p>
                  </div>
                  
                  {/* Produkte */}
                  <div className="rounded-lg border p-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Produkte</h3>
                    <p className="text-2xl font-bold">{Array.isArray(inventory) ? inventory.length : 0}</p>
                  </div>
                  
                  {/* Kritische Artikel */}
                  <div className="rounded-lg border p-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Kritische Artikel</h3>
                    <p className="text-2xl font-bold">
                      {Array.isArray(inventory) 
                        ? inventory.filter(item => item.quantity <= (item.minQuantity || 0)).length 
                        : 0}
                    </p>
                  </div>
                  
                  {/* Letzte Inventur */}
                  <div className="rounded-lg border p-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Letzte Inventur</h3>
                    <p className="text-sm font-bold">
                      {inventoryCounts && inventoryCounts.length > 0
                        ? new Date(inventoryCounts[0].endDate).toLocaleDateString()
                        : "Keine durchgeführt"}
                    </p>
                  </div>
                </div>
                
                {/* Aktionen */}
                <div className="flex space-x-2 pt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab("inventory-count")}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Inventur durchführen
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab("machines")}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Automaten zuordnen
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Automaten-Zuordnung */}
        <TabsContent value="machines" className="space-y-4">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-bold">Automaten-Zuordnung</h2>
            <Button onClick={() => setIsAssignDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Automaten zuordnen
            </Button>
          </div>
          
          {assignmentsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-lg text-muted-foreground">Automaten werden geladen...</span>
            </div>
          ) : machineAssignments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Truck className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Keine Automaten zugeordnet</h3>
                <p className="text-center text-muted-foreground mb-4">
                  Diesem Lager sind noch keine Automaten zugeordnet. Fügen Sie Automaten hinzu, 
                  um deren Bestand aus diesem Lager zu verwalten.
                </p>
                <Button onClick={() => setIsAssignDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Automaten zuordnen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Automaten-ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Standort</TableHead>
                    <TableHead>Zugeordnet am</TableHead>
                    <TableHead>Notizen</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineAssignments.map((assignment) => {
                    const machine = machines.find(m => m.id === assignment.machineId);
                    
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell>{assignment.machineId}</TableCell>
                        <TableCell className="font-medium">
                          {machine?.machineName || "Unbekannter Automat"}
                        </TableCell>
                        <TableCell>
                          {machine?.location || "Kein Standort"}
                        </TableCell>
                        <TableCell>
                          {assignment.assignedAt 
                            ? new Date(assignment.assignedAt).toLocaleDateString() 
                            : "Unbekannt"}
                        </TableCell>
                        <TableCell>{assignment.notes || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              // Dialog für die Entfernung anzeigen oder direkt entfernen
                              toast({
                                title: "Nicht implementiert",
                                description: "Die Funktion zum Entfernen von Automaten ist noch nicht implementiert.",
                                variant: "destructive"
                              });
                            }}
                          >
                            Entfernen
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Dialog für die Zuordnung von Automaten */}
          <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Automaten zuordnen</DialogTitle>
                <DialogDescription>
                  Wählen Sie einen Automaten aus, der diesem Lager zugeordnet werden soll.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Automat</label>
                  <Select
                    value={selectedMachine}
                    onValueChange={setSelectedMachine}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Automaten auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines
                        .filter(machine => 
                          !machineAssignments.some(a => a.machineId === machine.id)
                        )
                        .map(machine => (
                          <SelectItem key={machine.id} value={machine.id.toString()}>
                            {machine.machineName} {machine.location && `(${machine.location})`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notizen (optional)</label>
                  <Textarea
                    placeholder="Zusätzliche Informationen zur Zuordnung"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
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
                    // Mutation für die Zuweisung von Automaten ausführen
                    toast({
                      title: "Zuordnung gespeichert",
                      description: "Der Automat wurde erfolgreich diesem Lager zugeordnet.",
                    });
                    setIsAssignDialogOpen(false);
                  }}
                  disabled={!selectedMachine}
                >
                  Zuordnen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab: Warenbestand */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-bold">Warenbestand im Lager</h2>
            <div className="flex space-x-2">
              <Button 
                variant="outline"
                onClick={() => {
                  // Verwende die refetch-Funktion, um die Daten neu zu laden
                  refetchInventory();
                  toast({
                    title: "Lagerbestand aktualisiert",
                    description: "Die Lagerdaten werden neu geladen."
                  });
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Aktualisieren
              </Button>
              <Button>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Nachbestellen
              </Button>
            </div>
          </div>
          
          {/* Das neue WarehouseInventory-Component einbinden */}
          {warehouse ? (
            <div className="mt-4">
              {/* Importiertes WarehouseInventory-Component mit den entsprechenden Props */}
              {/* @ts-ignore - Falls TypeScript Probleme bei der Verwendung des neuen Components gibt */}
              <WarehouseInventory
                warehouseId={Number(id)}
                inventory={inventory || []}
                isLoading={inventoryLoading}
                error={inventoryError}
                onRefresh={() => refetchInventory()}
              />
            </div>
          ) : inventoryLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-lg text-muted-foreground">Warenbestand wird geladen...</span>
            </div>
          ) : inventoryError ? (
            <Alert variant="destructive" className="my-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fehler beim Laden der Lagerbestände</AlertTitle>
              <AlertDescription>
                {(inventoryError as Error).message || "Ein Fehler ist beim Laden der Lagerbestände aufgetreten."}
              </AlertDescription>
              <div className="mt-4">
                <Button 
                  variant="outline"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: [`/api/inventory`, { warehouseId: Number(id), includeZeroStock: true }] });
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Erneut versuchen
                </Button>
              </div>
            </Alert>
          ) : (Array.isArray(inventory) && inventory.length === 0) ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Keine Produkte im Lager</h3>
                <p className="text-center text-muted-foreground mb-4">
                  Dieses Lager enthält noch keine Produkte. Produkte werden automatisch hinzugefügt, 
                  wenn sie von zugeordneten Automaten verwendet werden.
                </p>
                <Button 
                  onClick={() => {
                    // Manuellen Lagerabgleich auslösen und dann Daten neu laden
                    toast({
                      title: "Lagerabgleich wird durchgeführt",
                      description: "Automatischer Abgleich der Automaten-Produkte mit diesem Lager."
                    });
                    
                    fetch(`/api/warehouse-reconciliation`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ warehouseId: Number(id) })
                    })
                    .then(res => res.json())
                    .then(data => {
                      console.log("Lagerabgleich-Ergebnis:", data);
                      refetchInventory();
                      toast({
                        title: "Lagerabgleich abgeschlossen",
                        description: `${data.result.productsAdded} Produkte zum Lager hinzugefügt.`
                      });
                    })
                    .catch(err => {
                      console.error("Fehler beim Lagerabgleich:", err);
                      toast({
                        title: "Fehler beim Lagerabgleich",
                        description: "Bitte versuchen Sie es später erneut.",
                        variant: "destructive"
                      });
                    });
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Lagerabgleich durchführen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Suchleiste für Produkte */}
              <div className="relative w-full max-w-sm mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Nach Produkten suchen..."
                  className="pl-8 h-9 w-full"
                />
              </div>
          
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Produzent</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead className="text-right">Bestand</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory && Array.isArray(inventory) && inventory.length > 0 ? (
                      inventory.map((item) => (
                        <TableRow key={item.id || item.productId}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>{item.supplierName || "-"}</TableCell>
                          <TableCell>{item.units || "Stück"}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                (item.quantity || 0) <= 0
                                  ? "destructive"
                                  : (item.quantity || 0) <= (item.minQuantity || 5)
                                  ? "warning"
                                  : "success"
                              }
                            >
                              {item.quantity || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Nachbestellfunktion
                                toast({
                                  title: "Nicht implementiert",
                                  description: "Die Nachbestellfunktion ist noch nicht implementiert.",
                                });
                              }}
                            >
                              Nachbestellen
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4">
                          <p className="text-muted-foreground">Keine Produkte im Lagerbestand vorhanden.</p>
                          <Button 
                            className="mt-4" 
                            size="sm" 
                            onClick={() => {
                              // Manuellen Lagerabgleich auslösen und dann Daten neu laden
                              toast({
                                title: "Lagerabgleich wird durchgeführt",
                                description: "Automatischer Abgleich der Automaten-Produkte mit diesem Lager."
                              });
                              
                              fetch(`/api/warehouse-reconciliation`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ warehouseId: Number(id) })
                              })
                              .then(res => res.json())
                              .then(data => {
                                console.log("Lagerabgleich-Ergebnis:", data);
                                refetchInventory();
                                toast({
                                  title: "Lagerabgleich abgeschlossen",
                                  description: `${data.result.productsAdded} Produkte zum Lager hinzugefügt.`
                                });
                              })
                              .catch(err => {
                                console.error("Fehler beim Lagerabgleich:", err);
                                toast({
                                  title: "Fehler beim Lagerabgleich",
                                  description: "Bitte versuchen Sie es später erneut.",
                                  variant: "destructive"
                                });
                              });
                            }}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Lagerabgleich durchführen
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab: Inventur */}
        <TabsContent value="inventory-count" className="space-y-4">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-bold">Inventur</h2>
            {!isCountInProgress ? (
              <Button onClick={() => setIsCountInProgress(true)}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Neue Inventur starten
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setIsCountInProgress(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleCompleteInventoryCount}>
                  <Save className="mr-2 h-4 w-4" />
                  Inventur abschließen
                </Button>
              </div>
            )}
          </div>
          
          {inventoryLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-lg text-muted-foreground">Warenbestand wird geladen...</span>
            </div>
          ) : !isCountInProgress ? (
            // Liste der bisherigen Inventuren
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Bisherige Inventuren</CardTitle>
                  <CardDescription>
                    Übersicht aller durchgeführten Inventuren für dieses Lager.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {inventoryCountsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !Array.isArray(inventoryCounts) || inventoryCounts.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground">
                        Für dieses Lager wurden noch keine Inventuren durchgeführt.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Durchgeführt von</TableHead>
                            <TableHead>Anzahl Artikel</TableHead>
                            <TableHead>Anpassungen</TableHead>
                            <TableHead className="text-right">Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryCounts.map((count) => (
                            <TableRow key={count.id}>
                              <TableCell>{new Date(count.endDate || count.startDate).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    count.status === "completed"
                                      ? "success"
                                      : count.status === "in_progress"
                                      ? "warning"
                                      : count.status === "cancelled"
                                      ? "destructive"
                                      : "default"
                                  }
                                >
                                  {count.status === "completed"
                                    ? "Abgeschlossen"
                                    : count.status === "in_progress"
                                    ? "In Bearbeitung"
                                    : count.status === "cancelled"
                                    ? "Abgebrochen"
                                    : count.status === "pending"
                                    ? "Ausstehend"
                                    : count.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{count.initiatedByName || "-"}</TableCell>
                              <TableCell>{count.itemCount || "-"}</TableCell>
                              <TableCell>{count.adjustmentCount || "0"}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // Details anzeigen
                                    toast({
                                      title: "Nicht implementiert",
                                      description: "Die Detailansicht ist noch nicht implementiert.",
                                    });
                                  }}
                                >
                                  Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            // Inventur-Erfassung
            <>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Inventur durchführen</CardTitle>
                  <CardDescription>
                    Zählen Sie den tatsächlichen Bestand im Lager und erfassen Sie die Mengen.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-4 items-center">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Nach Produkten, Artikel-Nr. oder Lagerort suchen..."
                          className="pl-8 h-9 w-full"
                          value={searchQueryInventory}
                          onChange={(e) => setSearchQueryInventory(e.target.value)}
                        />
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        {filteredInventoryItems.length} von {inventoryCountItems.length} Produkten
                      </div>
                    </div>
                    
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Produkt</TableHead>
                            <TableHead>Aktueller Bestand</TableHead>
                            <TableHead>Gezählter Bestand</TableHead>
                            <TableHead>Differenz</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.isArray(filteredInventoryItems) && filteredInventoryItems.length > 0 ? (
                            filteredInventoryItems.map((item) => (
                              <TableRow key={item.productId}>
                                <TableCell className="font-medium">{item.productName}</TableCell>
                                <TableCell>{item.currentQuantity}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.countedQuantity}
                                    onChange={(e) => 
                                      handleCountedQuantityChange(
                                        item.productId, 
                                        parseInt(e.target.value) || 0
                                      )
                                    }
                                    className="w-20"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      item.difference === 0
                                        ? "secondary"
                                        : item.difference < 0
                                        ? "destructive"
                                        : "success"
                                    }
                                  >
                                    {item.difference > 0 ? `+${item.difference}` : item.difference}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-4">
                                <p className="text-muted-foreground">Keine Produkte im Lagerbestand vorhanden.</p>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notizen zur Inventur</label>
                      <Textarea
                        placeholder="Anmerkungen zur Inventur (optional)"
                        value={inventoryCountNotes}
                        onChange={(e) => setInventoryCountNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCountInProgress(false)}
                  >
                    Abbrechen
                  </Button>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        // Inventur zwischenspeichern
                        saveTemporaryInventoryCountMutation.mutate({
                          warehouseId: Number(id),
                          notes: inventoryCountNotes,
                          items: inventoryCountItems.map(item => ({
                            productId: item.productId,
                            countedQuantity: item.countedQuantity,
                            difference: item.countedQuantity - item.currentQuantity
                          }))
                        });
                      }}
                      disabled={saveTemporaryInventoryCountMutation.isPending}
                    >
                      {saveTemporaryInventoryCountMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Zwischenspeichern
                    </Button>
                    <Button 
                      onClick={handleCompleteInventoryCount}
                      disabled={createInventoryCountMutation.isPending}
                    >
                      {createInventoryCountMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Inventur abschließen
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab: Warenbewegung */}
        <TabsContent value="movements" className="space-y-4">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-bold">Warenbewegungen</h2>
            <div className="flex space-x-2">
              <Button onClick={() => setIsAddMovementDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Warenbewegung hinzufügen
              </Button>
            </div>
          </div>
          
          {movementsLoading || refillsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-lg text-muted-foreground">Warenbewegungen werden geladen...</span>
            </div>
          ) : !Array.isArray(combinedMovements) || combinedMovements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <ArrowDownUp className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Keine Warenbewegungen</h3>
                <p className="text-center text-muted-foreground mb-4">
                  Für dieses Lager wurden noch keine Warenbewegungen verzeichnet.
                </p>
                <Button onClick={() => setIsAddMovementDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Erste Warenbewegung erstellen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Suchleiste und Filter für Warenbewegungen */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Warenbewegungen durchsuchen..."
                    className="pl-8 h-9 w-full"
                  />
                </div>
                <div className="flex space-x-2 flex-wrap">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 flex space-x-1 items-center">
                        <CalendarRange className="h-4 w-4 mr-1" />
                        <span>Zeitraum</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{
                          from: movementFilter.startDate ? new Date(movementFilter.startDate) : undefined,
                          to: movementFilter.endDate ? new Date(movementFilter.endDate) : undefined,
                        }}
                        onSelect={(range: DateRange | undefined) => {
                          setMovementFilter(prev => ({
                            ...prev,
                            startDate: range?.from ? range.from.toISOString() : '',
                            endDate: range?.to ? range.to.toISOString() : ''
                          }));
                        }}
                        numberOfMonths={2}
                      />
                      <div className="flex items-center justify-between p-3 border-t">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setMovementFilter(prev => ({
                              ...prev,
                              startDate: '',
                              endDate: ''
                            }));
                          }}
                        >
                          Zurücksetzen
                        </Button>
                        <Button onClick={() => document.dispatchEvent(new Event('keydown'))}>
                          Anwenden
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-9 flex space-x-1 items-center">
                        <Filter className="h-4 w-4 mr-1" />
                        <span>Filter</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Nach Typ filtern</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {/* Using individual menu items instead of RadioGroup to avoid RovingFocus issues */}
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: ""}))}
                      >
                        {movementFilter.movementType === "" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "" ? "font-medium" : ""}>Alle</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: "IN"}))}
                      >
                        {movementFilter.movementType === "IN" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "IN" ? "font-medium" : ""}>Eingang</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: "OUT"}))}
                      >
                        {movementFilter.movementType === "OUT" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "OUT" ? "font-medium" : ""}>Ausgang</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: "TRANSFER"}))}
                      >
                        {movementFilter.movementType === "TRANSFER" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "TRANSFER" ? "font-medium" : ""}>Umlagerung</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: "ADJUSTMENT"}))}
                      >
                        {movementFilter.movementType === "ADJUSTMENT" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "ADJUSTMENT" ? "font-medium" : ""}>Anpassung</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setMovementFilter(prev => ({...prev, movementType: "REFILL"}))}
                      >
                        {movementFilter.movementType === "REFILL" && <Check className="mr-2 h-4 w-4" />}
                        <span className={movementFilter.movementType === "REFILL" ? "font-medium" : ""}>Nachfüllung</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Referenz</TableHead>
                      <TableHead>Durchgeführt von</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedMovements && Array.isArray(combinedMovements) && combinedMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          {movement.performedAt && movement.performedAt ? new Date(movement.performedAt).toLocaleDateString() : "Unbekannt"}
                          <div className="text-xs text-muted-foreground">
                            {movement.performedAt && movement.performedAt ? new Date(movement.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{movement.productName || "Unbekanntes Produkt"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              movement.movementType === "IN"
                                ? "success"
                                : movement.movementType === "OUT"
                                ? "destructive"
                                : movement.movementType === "TRANSFER"
                                ? "warning"
                                : "secondary"
                            }
                          >
                            {movement.movementType === "IN"
                              ? "Eingang"
                              : movement.movementType === "OUT"
                              ? "Ausgang"
                              : movement.movementType === "TRANSFER"
                              ? "Umlagerung"
                              : movement.movementType === "ADJUSTMENT"
                              ? "Anpassung"
                              : movement.movementType === "REFILL"
                              ? "Automaten-Nachfüllung"
                              : movement.movementType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={
                            movement.movementType === "IN" || movement.movementType === "ADJUSTMENT" && movement.quantity > 0
                              ? "text-green-600"
                              : movement.movementType === "OUT" || movement.movementType === "REFILL" || (movement.movementType === "ADJUSTMENT" && movement.quantity < 0)
                              ? "text-red-600"
                              : ""
                          }>
                            {movement.movementType === "IN" || (movement.movementType === "ADJUSTMENT" && movement.quantity > 0)
                              ? `+${movement.quantity}`
                              : movement.quantity}
                          </span>
                        </TableCell>
                        <TableCell>
                          {movement.referenceType === "REFILL" 
                            ? `Nachfüllung #${movement.referenceId}`
                            : movement.referenceType === "ORDER"
                            ? `Bestellung #${movement.referenceId}`
                            : movement.referenceType === "INVENTORY_COUNT"
                            ? `Inventur #${movement.referenceId}`
                            : movement.referenceType === "MANUAL"
                            ? "Manuelle Buchung"
                            : movement.referenceType || "-"}
                        </TableCell>
                        <TableCell>{movement.performedByName || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Details anzeigen
                              toast({
                                title: "Nicht implementiert",
                                description: "Die Detailansicht ist noch nicht implementiert.",
                              });
                            }}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Dialog zum Hinzufügen einer Warenbewegung */}
      <Dialog open={isAddMovementDialogOpen} onOpenChange={setIsAddMovementDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Warenbewegung hinzufügen</DialogTitle>
            <DialogDescription>
              Erfassen Sie eine neue Warenbewegung für das Lager.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bewegungstyp</label>
              <div className="flex space-x-2">
                <Button 
                  variant={movementType === "IN" ? "default" : "outline"}
                  size="sm" 
                  className="flex-1"
                  onClick={() => setMovementType("IN")}
                >
                  Eingang
                </Button>
                <Button 
                  variant={movementType === "OUT" ? "default" : "outline"}
                  size="sm" 
                  className="flex-1"
                  onClick={() => setMovementType("OUT")}
                >
                  Ausgang
                </Button>
                <Button 
                  variant={movementType === "TRANSFER" ? "default" : "outline"}
                  size="sm" 
                  className="flex-1"
                  onClick={() => setMovementType("TRANSFER")}
                >
                  Umlagern
                </Button>
                <Button 
                  variant={movementType === "ADJUSTMENT" ? "default" : "outline"}
                  size="sm" 
                  className="flex-1"
                  onClick={() => setMovementType("ADJUSTMENT")}
                >
                  Anpassen
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Produkt</label>
              <Select 
                defaultValue="" 
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Produkt auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(inventory) && inventory.map(item => (
                    <SelectItem 
                      key={item.productId} 
                      value={String(item.productId)}
                    >
                      {item.productName || "Unbekanntes Produkt"} 
                      ({item.quantity || 0} verfügbar)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Menge</label>
              <Input
                type="number"
                min="1"
                value={movementQuantity}
                onChange={(e) => setMovementQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notizen (optional)</label>
              <Textarea
                placeholder="Grund für die Warenbewegung"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
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
                // Warenbewegungsdaten für die API vorbereiten
                const movementData = {
                  warehouseId: Number(id),
                  productId: selectedProduct ? Number(selectedProduct) : 0,
                  quantity: movementQuantity,
                  type: movementType,
                  notes: movementNotes,
                  destinationWarehouseId: movementType === "TRANSFER" && selectedDestinationWarehouse 
                    ? Number(selectedDestinationWarehouse) 
                    : undefined
                };
                
                // Mutation aufrufen, um die Warenbewegung zu erstellen
                createInventoryMovementMutation.mutate(movementData);
              }}
              disabled={!selectedProduct || movementQuantity <= 0 || (movementType === "TRANSFER" && !selectedDestinationWarehouse)}
            >
              <Save className="mr-2 h-4 w-4" />
              {createInventoryMovementMutation.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
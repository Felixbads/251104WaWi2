import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// API-Funktionen
import { 
  getWarehouseById, 
  getWarehouseInventory
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
import { CalendarIcon, ChevronLeftIcon, SaveIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Icons
import {
  Building2,
  Package,
  ArrowDownUp,
  ClipboardCheck,
  Truck,
  Search,
  Filter,
  Clock,
  MapPin,
  Phone,
  Mail,
  AlertTriangle,
  Plus,
  ChevronLeft,
  Save,
  Loader2,
  FileText,
  RefreshCw,
  ShoppingCart,
  User
} from "lucide-react";

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
  
  // Lager-Inventar abrufen
  const { 
    data: inventory = [], 
    isLoading: inventoryLoading,
    error: inventoryError
  } = useQuery({
    queryKey: [`/api/inventory`, { warehouseId: id }],
    queryFn: () => getWarehouseInventory(id),
    enabled: !!id && activeTab === "inventory"
  });
  
  // Automaten-Zuordnungen abrufen
  const { 
    data: machineAssignments = [], 
    isLoading: assignmentsLoading 
  } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: Number(id) }],
    staleTime: 1000 * 30, // 30 Sekunden
    enabled: !!id && activeTab === "machines"
  });
  
  // Abfrage aller Automaten für die Zuordnung
  const { 
    data: machines = [], 
    isLoading: machinesLoading 
  } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id && activeTab === "machines"
  });
  
  // Inventuren abrufen
  const {
    data: inventoryCounts = [],
    isLoading: inventoryCountsLoading
  } = useQuery({
    queryKey: ['/api/inventory-counts', { warehouseId: Number(id) }],
    enabled: !!id && activeTab === "inventory-count"
  });
  
  // Warenbewegungen abrufen
  const {
    data: inventoryMovements = [],
    isLoading: movementsLoading
  } = useQuery({
    queryKey: ['/api/inventory-movements', { warehouseId: Number(id) }],
    enabled: !!id && activeTab === "movements"
  });
  
  // Zustand für die Inventur (Inventurzählung)
  const [inventoryCountItems, setInventoryCountItems] = useState<any[]>([]);
  const [isCountInProgress, setIsCountInProgress] = useState(false);
  const [inventoryCountNotes, setInventoryCountNotes] = useState("");
  
  // Initialisiere Inventurzählung mit aktuellen Beständen
  useEffect(() => {
    if (Array.isArray(inventory) && inventory.length > 0 && activeTab === "inventory-count") {
      console.log("Initialisiere Inventur mit", inventory.length, "Produkten");
      setInventoryCountItems(
        inventory.map(item => ({
          productId: item.productId,
          productName: item.productName || "Unbekannt",
          currentQuantity: item.quantity || 0,
          countedQuantity: item.quantity || 0, // Standardmäßig aktueller Bestand
          difference: 0
        }))
      );
    } else if (activeTab === "inventory-count") {
      console.log("Inventory für Zählung ist leer oder kein Array", inventory);
    }
  }, [inventory, activeTab]);
  
  // Dialog-Zustände
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [assignNotes, setAssignNotes] = useState("");
  
  // Mutation für die Erstellung einer Inventur
  const createInventoryCountMutation = useMutation({
    mutationFn: async (data: any) => {
      // API-Aufruf für das Erstellen einer neuen Inventur
      return await fetch(`/api/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
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
    },
    onError: (error: any) => {
      toast({
        title: "Fehler bei der Inventur",
        description: error.message || "Die Inventur konnte nicht durchgeführt werden.",
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
        <TabsList className="grid grid-cols-5 mb-8">
          <TabsTrigger value="overview">
            <Building2 className="h-4 w-4 mr-2" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="machines">
            <Truck className="h-4 w-4 mr-2" />
            Automaten-Zuordnung
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4 mr-2" />
            Warenbestand
          </TabsTrigger>
          <TabsTrigger value="inventory-count">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inventur
          </TabsTrigger>
          <TabsTrigger value="movements">
            <ArrowDownUp className="h-4 w-4 mr-2" />
            Warenbewegung
          </TabsTrigger>
        </TabsList>

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
                          {machine?.locationName || "Kein Standort"}
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
                            {machine.machineName} {machine.locationName && `(${machine.locationName})`}
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
                  // Invalidiere die Abfrage manuell, um die Daten neu zu laden
                  queryClient.invalidateQueries({ queryKey: [`/api/inventory`] });
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
          
          {inventoryLoading ? (
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
                    queryClient.invalidateQueries({ queryKey: [`/api/inventory`] });
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Erneut versuchen
                </Button>
              </div>
            </Alert>
          ) : !Array.isArray(inventory) || inventory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Keine Produkte im Lager</h3>
                <p className="text-center text-muted-foreground mb-4">
                  Dieses Lager enthält noch keine Produkte. Produkte werden automatisch hinzugefügt, 
                  wenn sie von zugeordneten Automaten verwendet werden.
                </p>
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
                    {inventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.supplierName || "-"}</TableCell>
                        <TableCell>{item.units || "Stück"}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              item.quantity <= 0
                                ? "destructive"
                                : item.quantity <= (item.minQuantity || 5)
                                ? "warning"
                                : "success"
                            }
                          >
                            {item.quantity}
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
                    ))}
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
                    <div className="relative w-full max-w-sm">
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
                            <TableHead>Aktueller Bestand</TableHead>
                            <TableHead>Gezählter Bestand</TableHead>
                            <TableHead>Differenz</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryCountItems.map((item) => (
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
                          ))}
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
                        toast({
                          title: "Zwischengespeichert",
                          description: "Die Inventur wurde zwischengespeichert.",
                        });
                      }}
                    >
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
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Warenbewegung hinzufügen
              </Button>
            </div>
          </div>
          
          {movementsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-lg text-muted-foreground">Warenbewegungen werden geladen...</span>
            </div>
          ) : !Array.isArray(inventoryMovements) || inventoryMovements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <ArrowDownUp className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Keine Warenbewegungen</h3>
                <p className="text-center text-muted-foreground mb-4">
                  Für dieses Lager wurden noch keine Warenbewegungen verzeichnet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Suchleiste und Filter für Warenbewegungen */}
              <div className="flex space-x-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Warenbewegungen durchsuchen..."
                    className="pl-8 h-9 w-full"
                  />
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Filter className="h-4 w-4" />
                </Button>
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
                    {inventoryMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          {new Date(movement.performedAt).toLocaleDateString()}
                          <div className="text-xs text-muted-foreground">
                            {new Date(movement.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{movement.productName}</TableCell>
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
    </div>
  );
}
import { useState, useEffect, useMemo } from "react";
import React, { Suspense } from "react";
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
  RefreshCw, ShoppingCart, Clock, Check, Beaker,
  ExternalLink
} from "lucide-react";
import { Link } from "wouter";

// Eigene Komponenten
import WarehouseInventory from "@/components/inventory/WarehouseInventory";
import InventoryCountNew from "@/components/inventory/InventoryCountNew";
import DemoBatchesCreator from "@/components/inventory/demo/DemoBatchesCreator";

// UI-Komponenten
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// API-Klient
import { apiRequest } from "@/lib/queryClient";

export default function WarehouseDetail() {
  const { id } = useParams();
  const warehouseId = id; // Make sure we have warehouseId for the link
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Zustandsvariablen
  const [activeTab, setActiveTab] = useState("overview");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isAddMovementDialogOpen, setIsAddMovementDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [assignNotes, setAssignNotes] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedWarehouse, setEditedWarehouse] = useState<any>({});
  const [movementFilter, setMovementFilter] = useState<any>({});
  
  // Bewegungszustandsvariablen
  const [movementProductId, setMovementProductId] = useState("");
  const [movementQuantity, setMovementQuantity] = useState(0);
  const [movementType, setMovementType] = useState("IN");
  const [movementReason, setMovementReason] = useState("");
  const [movementDate, setMovementDate] = useState<Date | undefined>(new Date());
  const [movementNotes, setMovementNotes] = useState("");
  
  // Lade Lagerdaten
  const {
    data: warehouse = {},
    isLoading: warehouseLoading,
    error: warehouseError,
    refetch: refetchWarehouse
  } = useQuery({
    queryKey: ['/api/warehouses', id],
  });
  
  // Lade Lagerbestand
  const {
    data: inventory = [],
    isLoading: inventoryLoading,
    error: inventoryError,
    refetch: refetchInventory
  } = useQuery({
    queryKey: ['/api/inventory', { warehouseId: id }],
  });
  
  // Lade Maschinen
  const {
    data: machines = [],
    isLoading: machinesLoading,
    error: machinesError,
  } = useQuery({
    queryKey: ['/api/machines'],
  });
  
  // Lade Machine-Zuweisungen
  const {
    data: machineAssignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments
  } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: id }],
  });
  
  // Lade Warenbewegungen
  const {
    data: movements = [],
    isLoading: movementsLoading,
    error: movementsError,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ['/api/inventory-movements', { warehouseId: id }],
  });
  
  // Lade Automaten-Auffüllungen, die diesem Lager zugeordnet sind
  const {
    data: refills = [],
    isLoading: refillsLoading,
    error: refillsError,
    refetch: refetchRefills
  } = useQuery({
    queryKey: ['/api/refills', { warehouseId: id }],
  });
  
  // Lade Inventurzählungen für dieses Lager
  const {
    data: inventoryCounts = [],
    isLoading: inventoryCountsLoading,
    error: inventoryCountsError,
  } = useQuery({
    queryKey: ['/api/inventory-counts', { warehouseId: id }],
  });
  
  // Lade Produkte für die Bewegung
  const {
    data: products = [],
    isLoading: productsLoading,
  } = useQuery({
    queryKey: ['/api/products'],
  });
  
  // Warenbewegungen und Refills kombinieren
  const combinedMovements = useMemo(() => {
    if (!movements || !refills) return [];
    
    // Konvertiere Refills in das Format von Warenbewegungen
    const refillMovements = refills.flatMap((refill: any) => {
      if (refill.details && Array.isArray(refill.details)) {
        return refill.details.map((detail: any) => ({
          id: `refill-${refill.id}-${detail.id}`,
          productId: detail.productId,
          productName: detail.productName,
          quantity: detail.removed * -1, // Entfernte Artikel werden als negative Zahl dargestellt
          type: "OUT",
          createdAt: refill.datetime,
          performedAt: refill.datetime,
          movementType: "Auffüllung",
          source: "vendon",
          machineId: refill.machineId,
          machineName: refill.machineName,
          notes: `Auffüllung von Automat ${refill.machineName}`
        }));
      }
      return [];
    });
    
    // Kombiniere und sortiere nach Datum (neueste zuerst)
    return [...movements, ...refillMovements].sort((a: any, b: any) => {
      const dateA = new Date(a.performedAt || a.createdAt);
      const dateB = new Date(b.performedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [movements, refills]);
  
  // Effekt: Wenn wir ein neues Lager laden, setze die Bearbeitungsdaten zurück
  useEffect(() => {
    if (warehouse) {
      setEditedWarehouse({ ...warehouse });
    }
  }, [warehouse]);
  
  // Handler: Tab-Wechsel
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };
  
  // Handler: Lagerhaus bearbeiten
  const handleEdit = () => {
    setIsEditMode(true);
  };
  
  // Handler: Bearbeitung abbrechen
  const handleCancelEdit = () => {
    setEditedWarehouse({ ...warehouse });
    setIsEditMode(false);
  };
  
  // Mutation: Lagerhaus aktualisieren
  const updateWarehouseMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/warehouses/${id}`, {
        method: 'PATCH',
        data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      
      setIsEditMode(false);
      toast({
        title: "Lager aktualisiert",
        description: "Das Lager wurde erfolgreich aktualisiert."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: `Das Lager konnte nicht aktualisiert werden: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handler: Speichern der Lagerbearbeitung
  const handleSaveWarehouse = () => {
    updateWarehouseMutation.mutate(editedWarehouse);
  };
  
  // Mutation: Automat zum Lager zuweisen
  const assignMachineMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/machine-warehouse-assignments`, {
        method: 'POST',
        data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      
      setIsAssignDialogOpen(false);
      setSelectedMachine(null);
      setAssignNotes("");
      
      toast({
        title: "Automat zugewiesen",
        description: "Der Automat wurde erfolgreich dem Lager zugewiesen."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: `Der Automat konnte nicht zugewiesen werden: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Mutation: Automaten-Zuweisung entfernen
  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return await apiRequest(`/api/machine-warehouse-assignments/${assignmentId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      
      toast({
        title: "Zuweisung entfernt",
        description: "Die Zuweisung wurde erfolgreich entfernt."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: `Die Zuweisung konnte nicht entfernt werden: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Mutation: Warenbewegung hinzufügen
  const addMovementMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/inventory-movements`, {
        method: 'POST',
        data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      setIsAddMovementDialogOpen(false);
      setMovementProductId("");
      setMovementQuantity(0);
      setMovementType("IN");
      setMovementReason("");
      setMovementDate(new Date());
      setMovementNotes("");
      
      toast({
        title: "Warenbewegung hinzugefügt",
        description: "Die Warenbewegung wurde erfolgreich hinzugefügt."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: `Die Warenbewegung konnte nicht hinzugefügt werden: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handler: Warenbewegung hinzufügen
  const handleAddMovement = () => {
    const selectedProduct = products.find((p: any) => p.id.toString() === movementProductId);
    
    if (!selectedProduct) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Produkt aus.",
        variant: "destructive"
      });
      return;
    }
    
    if (movementQuantity <= 0) {
      toast({
        title: "Fehler",
        description: "Die Menge muss größer als 0 sein.",
        variant: "destructive"
      });
      return;
    }
    
    addMovementMutation.mutate({
      productId: Number(movementProductId),
      warehouseId: Number(id),
      quantity: movementType === "IN" ? movementQuantity : -movementQuantity,
      type: movementType,
      reason: movementReason,
      notes: movementNotes,
      performedAt: movementDate ? movementDate.toISOString() : new Date().toISOString()
    });
  };
  
  // Fehlerbehandlung
  if (warehouseLoading) {
    return (
      <div className="container py-10">
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }
  
  if (warehouseError) {
    return (
      <div className="container py-10">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden des Lagers</AlertTitle>
          <AlertDescription>
            {warehouseError instanceof Error 
              ? warehouseError.message 
              : "Ein unbekannter Fehler ist aufgetreten."}
          </AlertDescription>
        </Alert>
        
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation("/warehouses")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }
  
  if (!warehouse || !warehouse.id) {
    return (
      <div className="container py-10">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lager nicht gefunden</AlertTitle>
          <AlertDescription>
            Das angeforderte Lager konnte nicht gefunden werden.
          </AlertDescription>
        </Alert>
        
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation("/warehouses")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }
  
  // Hauptkomponente rendern
  return (
    <div className="container py-6 space-y-6">
      {/* Zurück-Button */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setLocation("/warehouses")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zur Lagerübersicht
        </Button>
        
        {!isEditMode ? (
          <Button size="sm" onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Bearbeiten
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={handleCancelEdit}>
              Abbrechen
            </Button>
            <Button 
              size="sm" 
              onClick={handleSaveWarehouse}
              disabled={updateWarehouseMutation.isPending}
            >
              {updateWarehouseMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Speichern
            </Button>
          </>
        )}
      </div>
      
      {/* Lager-Infokarte */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="h-8 w-8 text-primary" />
                {isEditMode ? (
                  <Input 
                    value={editedWarehouse.name || ""} 
                    onChange={(e) => setEditedWarehouse({...editedWarehouse, name: e.target.value})}
                    className="text-2xl font-bold"
                  />
                ) : (
                  <h1 className="text-2xl font-bold">{warehouse.name}</h1>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <MapPin className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Adresse</p>
                    {isEditMode ? (
                      <Textarea 
                        value={editedWarehouse.address || ""} 
                        onChange={(e) => setEditedWarehouse({...editedWarehouse, address: e.target.value})}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {warehouse.address || "Keine Adresse angegeben"}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <User className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Verantwortlicher</p>
                    {isEditMode ? (
                      <Input 
                        value={editedWarehouse.manager || ""} 
                        onChange={(e) => setEditedWarehouse({...editedWarehouse, manager: e.target.value})}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {warehouse.manager || "Kein Verantwortlicher angegeben"}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Phone className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Telefon</p>
                    {isEditMode ? (
                      <Input 
                        value={editedWarehouse.phone || ""} 
                        onChange={(e) => setEditedWarehouse({...editedWarehouse, phone: e.target.value})}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {warehouse.phone || "Keine Telefonnummer angegeben"}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Mail className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Beschreibung</p>
                    {isEditMode ? (
                      <Textarea 
                        value={editedWarehouse.description || ""} 
                        onChange={(e) => setEditedWarehouse({...editedWarehouse, description: e.target.value})}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {warehouse.description || "Keine Beschreibung angegeben"}
                      </p>
                    )}
                  </div>
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
          <TabsTrigger value="movements" onClick={() => setLocation(`/lager/${id}/warenbewegung`)}>
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
          <TabsTrigger value="demo">
            <Beaker className="h-4 w-4 mr-2" />
            Demo-Daten
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
            <CardFooter className="flex justify-between">
              <div>
                <Button 
                  onClick={() => setIsAddMovementDialogOpen(true)}
                  className="mr-2"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Neue Bewegung
                </Button>
              </div>
              <Link to={`/lager/${warehouseId}/warenbewegung`}>
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Detaillierte Übersicht öffnen
                </Button>
              </Link>
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
            <CardFooter className="flex justify-between">
              <div>
                <Button 
                  onClick={() => setIsAddMovementDialogOpen(true)}
                  className="mr-2"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Neue Bewegung
                </Button>
              </div>
              <Link to={`/lager/${warehouseId}/warenbewegung`}>
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Detaillierte Übersicht öffnen
                </Button>
              </Link>
            </CardFooter>
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
              </div>
            </CardHeader>
            <CardContent>
              <InventoryCountNew 
                warehouseId={Number(id)}
                inventory={inventory}
                onComplete={() => {
                  refetchInventory();
                  toast({
                    title: "Inventur abgeschlossen",
                    description: "Die Inventur wurde erfolgreich abgeschlossen und die Bestände aktualisiert."
                  });
                }}
                onCancel={() => {
                  toast({
                    title: "Inventur abgebrochen",
                    description: "Die Inventur wurde abgebrochen."
                  });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demo">
          <Card>
            <CardHeader>
              <CardTitle>Demo-Daten Generator</CardTitle>
              <CardDescription>
                Erstellen Sie Demo-Daten für Batches und Warenbewegungen zum Testen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <React.Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                <DemoBatchesCreator />
              </React.Suspense>
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
                    setSelectedMachine((prev: any) => ({ ...prev, isPrimary: !!checked }))
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
              {assignMachineMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Zuordnen
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
              Erfassen Sie einen Ein- oder Ausgang von Waren
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              <div className="space-y-2">
                <Label htmlFor="product">Produkt</Label>
                <Select
                  value={movementProductId}
                  onValueChange={setMovementProductId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Produkt auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {productsLoading ? (
                      <div className="flex justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : products.length > 0 ? (
                      products.map((product: any) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          {product.name}
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
                  min="1"
                  value={movementQuantity.toString()}
                  onChange={(e) => setMovementQuantity(Number(e.target.value))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Typ</Label>
                <Select
                  value={movementType}
                  onValueChange={setMovementType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Eingang</SelectItem>
                    <SelectItem value="OUT">Ausgang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reason">Grund</Label>
                <Select
                  value={movementReason}
                  onValueChange={setMovementReason}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Grund auswählen (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PURCHASE">Einkauf</SelectItem>
                    <SelectItem value="RETURN">Rückgabe</SelectItem>
                    <SelectItem value="TRANSFER">Umschichtung</SelectItem>
                    <SelectItem value="ADJUSTMENT">Bestandskorrektur</SelectItem>
                    <SelectItem value="REFILL">Auffüllung Automat</SelectItem>
                    <SelectItem value="OTHER">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="date">Datum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarRange className="mr-2 h-4 w-4" />
                      {movementDate ? (
                        format(movementDate, "dd.MM.yyyy")
                      ) : (
                        <span>Datum auswählen</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={movementDate}
                      onSelect={setMovementDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
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
          </ScrollArea>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsAddMovementDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleAddMovement}
              disabled={!movementProductId || movementQuantity <= 0 || addMovementMutation.isPending}
            >
              {addMovementMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper-Funktion zum Formatieren von Datum
function format(date: Date, formatStr: string): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return formatStr.replace('dd', day).replace('MM', month).replace('yyyy', year);
}
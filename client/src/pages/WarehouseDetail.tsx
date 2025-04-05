import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CircleAlert, Building2, ArrowLeft, Edit, Truck, Package2, ClipboardList,
  Plus, Minus, RefreshCw, Archive, Pencil, RotateCw, MoveRight, ArrowRightLeft,
  FileSpreadsheet, ClipboardList as ClipboardListIcon
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { WarehouseFormDialog } from '@/components/inventory/WarehouseFormDialog';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LocationStockTab } from '@/components/stock/LocationStockTab';

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('info');
  const [isEditWarehouseDialogOpen, setIsEditWarehouseDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  // Primärlager-Funktion wurde entfernt
  const [assignNotes, setAssignNotes] = useState('');
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [isAddInventoryDialogOpen, setIsAddInventoryDialogOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  
  // Abfrage des Lagers
  const { data: warehouse, isLoading: warehouseLoading, error } = useQuery({
    queryKey: [`/api/warehouses/${id}`],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Abfrage aller Produkte (Vendon)
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Abfrage der Lagerbestände in diesem Lager
  const { data: inventoryItems, isLoading: inventoryLoading } = useQuery({
    queryKey: ['/api/inventory', { warehouseId: Number(id) }],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Abfrage aller Automaten für die Zuordnung
  const { data: machines, isLoading: machinesLoading } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Abfrage der Maschinen, die diesem Lager zugeordnet sind
  const { data: machineAssignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: Number(id) }],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Mutation für das Erstellen von Automaten-Zuordnungen
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/machine-warehouse-assignments', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      toast({
        title: 'Automat zugeordnet',
        description: 'Der Automat wurde erfolgreich diesem Lager zugeordnet.',
      });
      setIsAssignDialogOpen(false);
      setSelectedMachine(null);
      // Primärlager-Funktion wurde entfernt
      setAssignNotes('');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler bei der Zuordnung',
        description: error.message || 'Der Automat konnte nicht zugeordnet werden.',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation für den Lagerabgleich
  const reconcileWarehouseMutation = useMutation({
    mutationFn: async () => {
      setIsReconciling(true);
      try {
        return await apiRequest('/api/warehouse-reconciliation', {
          method: 'POST',
          body: JSON.stringify({ warehouseId: Number(id) })
        });
      } catch (error) {
        setIsReconciling(false);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: 'Lagerabgleich durchgeführt',
        description: 'Die Produkte aus den Automaten wurden mit dem Lagerbestand abgeglichen.',
      });
      setIsReconciling(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Lagerabgleich',
        description: error.message || 'Der Lagerabgleich konnte nicht durchgeführt werden.',
        variant: 'destructive'
      });
      setIsReconciling(false);
    }
  });

  // Mutation für das Löschen von Automaten-Zuordnungen
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return await apiRequest(`/api/machine-warehouse-assignments/${assignmentId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      toast({
        title: 'Zuordnung entfernt',
        description: 'Die Zuordnung wurde erfolgreich entfernt.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Entfernen',
        description: error.message || 'Die Zuordnung konnte nicht entfernt werden.',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation für das Hinzufügen von Produkten zum Inventar
  const addInventoryMutation = useMutation({
    mutationFn: async (data: any) => {
      // Für jedes ausgewählte Produkt einen Inventareintrag erstellen
      const promises = data.productIds.map((productId: number) => {
        return apiRequest('/api/inventory', {
          method: 'POST',
          body: JSON.stringify({
            warehouseId: parseInt(id),
            productId: productId,
            quantity: 0, // Anfangsbestand 0
            minQuantity: data.minQuantity || 5, // Standardwert für min. Bestand
            location: data.location || '',
            notes: data.notes || ''
          })
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: 'Produkte hinzugefügt',
        description: 'Die ausgewählten Produkte wurden dem Lagerbestand hinzugefügt.',
      });
      setIsAddInventoryDialogOpen(false);
      setSelectedProductIds([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Hinzufügen',
        description: error.message || 'Die Produkte konnten nicht hinzugefügt werden.',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation für Bestandsänderungen
  const updateInventoryMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number, quantity: number }) => {
      return await apiRequest(`/api/inventory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: 'Bestand aktualisiert',
        description: 'Der Lagerbestand wurde erfolgreich aktualisiert.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler bei der Aktualisierung',
        description: error.message || 'Der Bestand konnte nicht aktualisiert werden.',
        variant: 'destructive'
      });
    }
  });
  
  // Metriken berechnen
  const totalItems = inventoryItems?.length || 0;
  const totalStock = inventoryItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  const criticalItems = inventoryItems?.filter(item => 
    item.quantity !== null && 
    item.minQuantity !== null && 
    item.quantity <= item.minQuantity
  ).length || 0;
  const assignedMachines = machineAssignments?.length || 0;
  // Primärlager-Funktion wurde entfernt
  const primaryAssignments = 0;
  
  // Filter-Funktion für Produkte basierend auf Suchbegriff und bereits vorhandenen Einträgen
  const productsList = products && 'data' in products ? products.data : [];
  const filteredProducts = productsList.filter(product => {
    // Prüfen, ob das Produkt bereits dem Lager zugeordnet ist
    const isAlreadyInInventory = inventoryItems?.some(item => item.productId === product.id) || false;
    
    // Prüfen, ob der Suchbegriff im Produktnamen enthalten ist
    const matchesSearch = product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    
    // Nur Produkte anzeigen, die noch nicht im Inventar sind und dem Suchbegriff entsprechen
    return !isAlreadyInInventory && matchesSearch;
  });
  
  // Handler für die Bestandsänderung
  const handleQuantityChange = (inventoryItemId: number, currentQuantity: number, delta: number) => {
    const newQuantity = Math.max(0, currentQuantity + delta); // Verhindere negative Bestände
    updateInventoryMutation.mutate({ id: inventoryItemId, quantity: newQuantity });
  };
  
  // Handler für die Automaten-Zuordnung
  const handleAssignMachine = () => {
    if (!selectedMachine) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie einen Automaten aus.',
        variant: 'destructive'
      });
      return;
    }
    
    createAssignmentMutation.mutate({
      machineId: selectedMachine,
      warehouseId: parseInt(id),
      isPrimary: false, // Primärlager-Funktion entfernt, für Kompatibilität auf false gesetzt
      notes: assignNotes
    });
  };
  
  // Handler für das Hinzufügen von Produkten
  const handleAddProducts = () => {
    if (selectedProductIds.length === 0) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie mindestens ein Produkt aus.',
        variant: 'destructive'
      });
      return;
    }
    
    addInventoryMutation.mutate({
      productIds: selectedProductIds,
      minQuantity: 5, // Standardwert
      location: '', // Optional
      notes: '' // Optional
    });
  };
  
  // Toggle-Funktion für Produkt-Auswahl
  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds(prevSelected => {
      if (prevSelected.includes(productId)) {
        return prevSelected.filter(id => id !== productId);
      } else {
        return [...prevSelected, productId];
      }
    });
  };
  
  // Rendering bei Ladevorgang
  if (warehouseLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }
  
  // Rendering bei Fehler
  if (error || !warehouse) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => setLocation('/lager')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
        
        <div className="rounded-md bg-destructive/15 p-4 text-center">
          <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <h3 className="font-medium text-destructive">
            {!warehouse ? 'Lager nicht gefunden' : 'Fehler beim Laden des Lagers'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as Error)?.message || 'Das angeforderte Lager konnte nicht geladen werden.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <Button
            variant="outline"
            onClick={() => setLocation('/lager')}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          <h1 className="text-2xl font-bold">{warehouse.name}</h1>
          {!warehouse.isActive && (
            <Badge variant="outline" className="bg-muted ml-2">Inaktiv</Badge>
          )}
        </div>
        <Button 
          onClick={() => setIsEditWarehouseDialogOpen(true)}
        >
          <Edit className="mr-2 h-4 w-4" />
          Lager bearbeiten
        </Button>
      </div>
      
      {/* Metriken/KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <Package2 className="h-4 w-4 mr-2 text-primary" />
              Artikel
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{totalItems}</div>
            <p className="text-sm text-muted-foreground">Artikel im Lager</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <ClipboardList className="h-4 w-4 mr-2 text-primary" />
              Gesamtbestand
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{totalStock}</div>
            <p className="text-sm text-muted-foreground">Einheiten verfügbar</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <CircleAlert className="h-4 w-4 mr-2 text-destructive" />
              Kritische Bestände
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{criticalItems}</div>
            <p className="text-sm text-muted-foreground">Artikel nachzubestellen</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <Truck className="h-4 w-4 mr-2 text-primary" />
              Zugeordnete Automaten
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{assignedMachines}</div>
            <p className="text-sm text-muted-foreground">Keine Primärlager-Funktion</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Lagerdetails und Bestände */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Lagerinfo</TabsTrigger>
          <TabsTrigger value="inventory">Lagerbestand</TabsTrigger>
          <TabsTrigger value="movements">Warenbewegungen</TabsTrigger>
          <TabsTrigger value="machines">Automaten-Zuordnung</TabsTrigger>
          <TabsTrigger value="stocks">Automat-Bestand</TabsTrigger>
          <TabsTrigger value="counts">Inventur</TabsTrigger>
        </TabsList>
        
        <TabsContent value="info" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Lagerinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h3 className="font-medium">Adresse</h3>
                <p className="text-muted-foreground">
                  {[
                    warehouse.address,
                    `${warehouse.postalCode || ''} ${warehouse.city || ''}`,
                    warehouse.country
                  ].filter(Boolean).join(', ') || 'Keine Adresse angegeben'}
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Beschreibung</h3>
                <p className="text-muted-foreground">
                  {warehouse.description || 'Keine Beschreibung vorhanden'}
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Kontakt</h3>
                <p className="text-muted-foreground">
                  {warehouse.contactPerson || 'Kein Ansprechpartner angegeben'}
                  {warehouse.contactPhone && ` · ${warehouse.contactPhone}`}
                  {warehouse.contactEmail && ` · ${warehouse.contactEmail}`}
                </p>
              </div>
              
              {warehouse.notes && (
                <div>
                  <h3 className="font-medium">Notizen</h3>
                  <p className="text-muted-foreground">{warehouse.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="inventory" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Lagerbestand</CardTitle>
                <CardDescription>Übersicht aller Artikel in diesem Lager</CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => reconcileWarehouseMutation.mutate()}
                  disabled={isReconciling}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${isReconciling ? 'animate-spin' : ''}`} />
                  {isReconciling ? 'Abgleich läuft...' : 'Automaten abgleichen'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsAddInventoryDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Produkte hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {inventoryLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : inventoryItems && inventoryItems.length > 0 ? (
                <div className="rounded-md border">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Artikel</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Bestand</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Min. Bestand</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="bg-popover divide-y divide-border">
                      {inventoryItems.map((item) => {
                        // Bestimmen des Status
                        let statusColor = 'bg-green-100 text-green-800';
                        let statusText = 'OK';
                        
                        if (item.quantity === 0) {
                          statusColor = 'bg-red-100 text-red-800';
                          statusText = 'Leer';
                        } else if (item.minQuantity !== null && item.quantity <= item.minQuantity) {
                          statusColor = 'bg-yellow-100 text-yellow-800';
                          statusText = 'Kritisch';
                        }
                        
                        return (
                          <tr key={item.id}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="font-medium">{item.productName}</div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {item.quantity !== null ? item.quantity : '-'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {item.minQuantity !== null ? item.minQuantity : '-'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
                                {statusText}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex space-x-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleQuantityChange(item.id, item.quantity || 0, 1)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleQuantityChange(item.id, item.quantity || 0, -1)}
                                  disabled={(item.quantity || 0) <= 0}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <h3 className="text-lg font-medium">Keine Artikel vorhanden</h3>
                  <p className="text-muted-foreground mb-4">
                    In diesem Lager sind noch keine Artikel hinterlegt.
                  </p>
                  <Button onClick={() => setIsAddInventoryDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Produkte hinzufügen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="movements" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Warenbewegungen</CardTitle>
              <CardDescription>Ein- und Ausgänge von Waren in diesem Lager</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-4">
                <div className="flex space-x-2">
                  <Button variant="outline">
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Alle Bewegungen
                  </Button>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Eingang
                  </Button>
                  <Button variant="outline">
                    <Minus className="h-4 w-4 mr-2" />
                    Ausgang
                  </Button>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Bewegung
                </Button>
              </div>
              
              <div className="rounded-md border p-8 text-center">
                <MoveRight className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Keine Warenbewegungen</h3>
                <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                  Für dieses Lager wurden noch keine Warenbewegungen erfasst. 
                  Erfassen Sie Ein- und Ausgänge, um Ihren Lagerbestand zu verfolgen.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="stocks" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Automaten-Bestand</CardTitle>
              <CardDescription>Aktuelle Bestände in den Automaten an diesem Standort</CardDescription>
            </CardHeader>
            <CardContent>
              <LocationStockTab locationId={Number(id)} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="machines" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Automaten-Zuordnung</CardTitle>
                <CardDescription>Verwalten Sie, welche Automaten mit diesem Lager verknüpft sind</CardDescription>
              </div>
              <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Automat zuordnen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Automat diesem Lager zuordnen</DialogTitle>
                    <DialogDescription>
                      Wählen Sie einen Automaten aus, der diesem Lager zugeordnet werden soll.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="machine">Automat</Label>
                      <Select
                        value={selectedMachine?.toString() || ''}
                        onValueChange={(value) => setSelectedMachine(parseInt(value))}
                      >
                        <SelectTrigger id="machine">
                          <SelectValue placeholder="Automat auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {machines?.filter(machine => {
                            // Prüfen, ob der Automat bereits zugeordnet ist
                            return !machineAssignments?.some(
                              assignment => assignment.machineId === machine.id
                            );
                          }).map(machine => (
                            <SelectItem key={machine.id} value={machine.id.toString()}>
                              {machine.machineName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Primärlager-Funktion wurde entfernt */}
                    
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notizen (optional)</Label>
                      <Input
                        id="notes"
                        value={assignNotes}
                        onChange={(e) => setAssignNotes(e.target.value)}
                        placeholder="Notizen zur Zuordnung"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                      Abbrechen
                    </Button>
                    <Button 
                      onClick={handleAssignMachine}
                      disabled={createAssignmentMutation.isPending || !selectedMachine}
                    >
                      {createAssignmentMutation.isPending ? 'Wird zugeordnet...' : 'Zuordnen'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : machineAssignments && machineAssignments.length > 0 ? (
                <div className="rounded-md border">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Automat</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Zugewiesen am</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notizen</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="bg-popover divide-y divide-border">
                      {machineAssignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="font-medium">{assignment.machineName}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {/* Primärlager-Funktion wurde entfernt */}
                            <Badge variant="outline">Standard</Badge>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {assignment.assignedAt ? 
                              new Date(assignment.assignedAt).toLocaleDateString('de-DE') 
                              : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="max-w-xs truncate">
                              {assignment.notes || '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteAssignmentMutation.mutate(assignment.id)}
                              disabled={deleteAssignmentMutation.isPending}
                            >
                              Entfernen
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Truck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <h3 className="text-lg font-medium">Keine Automaten zugeordnet</h3>
                  <p className="text-muted-foreground mb-4">
                    Diesem Lager sind noch keine Automaten zugewiesen.
                  </p>
                  <Button onClick={() => setIsAssignDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Automat zuordnen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="counts" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Inventuren</CardTitle>
                <CardDescription>Verwalten und durchführen von Lagerbestandsaufnahmen</CardDescription>
              </div>
              <Button>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Neue Inventur starten
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border p-8 text-center">
                <ClipboardListIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Keine Inventuren vorhanden</h3>
                <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                  Es wurden noch keine Inventuren für dieses Lager durchgeführt. 
                  Starten Sie eine neue Inventur, um den tatsächlichen Bestand zu ermitteln.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Dialog für Lager bearbeiten */}
      <WarehouseFormDialog 
        warehouse={warehouse}
        open={isEditWarehouseDialogOpen} 
        onOpenChange={setIsEditWarehouseDialogOpen} 
        isNew={false}
      />
      
      {/* Dialog für Produkte hinzufügen */}
      <Dialog open={isAddInventoryDialogOpen} onOpenChange={setIsAddInventoryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Produkte zum Lagerbestand hinzufügen</DialogTitle>
            <DialogDescription>
              Wählen Sie die Produkte aus, die Sie dem Lagerbestand hinzufügen möchten.
              Der Anfangsbestand ist zunächst 0.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Produkte suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Badge variant="outline">
                {filteredProducts?.length || 0} Produkte verfügbar
              </Badge>
            </div>
            
            <div className="border rounded-md">
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-2">
                  {productsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : filteredProducts && filteredProducts.length > 0 ? (
                    filteredProducts.map(product => (
                      <div key={product.id} className="flex items-center space-x-2 py-2 border-b last:border-0">
                        <Checkbox 
                          id={`product-${product.id}`}
                          checked={selectedProductIds.includes(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                        />
                        <Label 
                          htmlFor={`product-${product.id}`}
                          className="flex-grow cursor-pointer"
                        >
                          {product.productName}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground">Keine passenden Produkte gefunden</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <div className="flex justify-between items-center w-full">
              <span className="text-sm text-muted-foreground">
                {selectedProductIds.length} Produkte ausgewählt
              </span>
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setIsAddInventoryDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleAddProducts}
                  disabled={addInventoryMutation.isPending || selectedProductIds.length === 0}
                >
                  {addInventoryMutation.isPending ? 'Wird hinzugefügt...' : 'Produkte hinzufügen'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Building2, ArrowLeft, Edit, Truck, Package2, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { WarehouseFormDialog } from '@/components/inventory/WarehouseFormDialog';
import MachineAssignments from '@/components/inventory/MachineAssignments';

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('info');
  const [isEditWarehouseDialogOpen, setIsEditWarehouseDialogOpen] = useState(false);
  
  // Abfrage des Lagers
  const { data: warehouse, isLoading: warehouseLoading, error } = useQuery({
    queryKey: [`/api/warehouses/${id}`],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Abfrage der Lagerbestände in diesem Lager
  const { data: inventoryItems, isLoading: inventoryLoading } = useQuery({
    queryKey: ['/api/inventory', { warehouseId: id }],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Abfrage der Maschinen, die diesem Lager zugeordnet sind
  const { data: machineAssignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: id }],
    staleTime: 1000 * 30, // 30 Sekunden
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
  const primaryAssignments = machineAssignments?.filter(a => a.isPrimary).length || 0;
  
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
            <p className="text-sm text-muted-foreground">{primaryAssignments} als Primärlager</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Lagerdetails und Bestände */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Lagerinfo</TabsTrigger>
          <TabsTrigger value="inventory">Lagerbestand</TabsTrigger>
          <TabsTrigger value="machines">Automaten</TabsTrigger>
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
            <CardHeader>
              <CardTitle>Lagerbestand</CardTitle>
              <CardDescription>Übersicht aller Artikel in diesem Lager</CardDescription>
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
                  <p className="text-muted-foreground">
                    In diesem Lager sind noch keine Artikel hinterlegt.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="machines" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Zugeordnete Automaten</CardTitle>
              <CardDescription>Automaten, die diesem Lager zugewiesen sind</CardDescription>
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
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Primärlager</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Zugewiesen am</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notizen</th>
                      </tr>
                    </thead>
                    <tbody className="bg-popover divide-y divide-border">
                      {machineAssignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="font-medium">{assignment.machineName}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {assignment.isPrimary ? (
                              <Badge className="bg-primary text-primary-foreground">Primär</Badge>
                            ) : (
                              <Badge variant="outline">Sekundär</Badge>
                            )}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Truck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <h3 className="text-lg font-medium">Keine Automaten zugeordnet</h3>
                  <p className="text-muted-foreground">
                    Diesem Lager sind noch keine Automaten zugewiesen.
                  </p>
                </div>
              )}
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
    </div>
  );
}
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft, Package, Warehouse, DownloadCloud, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/api";
import { getRefillById, getWarehouseById, getWarehouseInventory, updateWarehouseInventory, Refill, RefillProduct, WarehouseProduct } from "@/lib/api";

export default function RefillDetail() {
  const { id, refillId } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [isUpdating, setIsUpdating] = useState(false);

  // Refill Daten abrufen
  const { 
    data: refill,
    isLoading: isLoadingRefill,
    isError: isErrorRefill,
    error: errorRefill
  } = useQuery({
    queryKey: ['/api/refills', refillId],
    queryFn: () => refillId ? getRefillById(refillId) : Promise.reject('Refill ID is required'),
    enabled: !!refillId,
  });

  // Wenn Refill geladen wurde, Warenhaus Daten abrufen
  const { 
    data: warehouse,
    isLoading: isLoadingWarehouse,
    isError: isErrorWarehouse
  } = useQuery({
    queryKey: ['/api/warehouses', refill?.warehouseId],
    queryFn: () => getWarehouseById(refill?.warehouseId),
    enabled: !!refill?.warehouseId,
  });

  // Lagerbestand abrufen
  const { 
    data: inventory,
    isLoading: isLoadingInventory,
    isError: isErrorInventory,
    refetch: refetchInventory
  } = useQuery({
    queryKey: ['/api/warehouses', refill?.warehouseId, 'inventory'],
    queryFn: () => getWarehouseInventory(refill?.warehouseId),
    enabled: !!refill?.warehouseId,
  });

  const handleLagerbestandsChange = async () => {
    if (!refill || !warehouse || !inventory) return;

    setIsUpdating(true);
    try {
      // Erstelle ein Update für die Lagerbestände basierend auf den Auffüllprodukten
      const updatedProducts = [...inventory];
      
      // Für jedes Produkt in der Auffüllung
      refill.products.forEach((refillProduct) => {
        // Suche es im Lagerbestand
        const inventoryProduct = updatedProducts.find(p => p.productId === refillProduct.productId);
        
        if (inventoryProduct) {
          // Wenn es existiert, reduziere den Bestand
          inventoryProduct.quantity -= refillProduct.quantity;
        } else {
          // Wenn nicht, füge es mit negativem Bestand hinzu
          updatedProducts.push({
            id: Math.random().toString(36).substring(7), // Temporäre ID
            warehouseId: warehouse.id,
            productId: refillProduct.productId,
            productName: refillProduct.productName,
            quantity: -refillProduct.quantity,
            minQuantity: 0,
            lastUpdated: new Date().toISOString(),
          });
        }
      });
      
      // Update an die API senden
      await updateWarehouseInventory(warehouse.id, updatedProducts);
      
      // Daten neu laden
      await refetchInventory();
      
      // Refill-Status in der UI aktualisieren
      queryClient.invalidateQueries({ queryKey: ['/api/refills', refillId] });
      queryClient.invalidateQueries({ queryKey: ['/api/machines', id, 'refills'] });
      
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Lagerbestands:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Lade-/Fehlerzustand
  if (isLoadingRefill) {
    return (
      <div className="container mx-auto p-4 max-w-5xl">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/automaten/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <h1 className="text-xl font-semibold ml-2">Auffüllung wird geladen...</h1>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isErrorRefill) {
    return (
      <div className="container mx-auto p-4 max-w-5xl">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/automaten/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <h1 className="text-xl font-semibold ml-2">Fehler beim Laden</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Auffüllung konnte nicht geladen werden</h2>
              <p className="text-gray-500 mb-4">
                {errorRefill instanceof Error ? errorRefill.message : "Ein unbekannter Fehler ist aufgetreten."}
              </p>
              <Button onClick={() => setLocation(`/automaten/${id}`)}>
                Zurück zur Automatenübersicht
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!refill) {
    return (
      <div className="container mx-auto p-4 max-w-5xl">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/automaten/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <h1 className="text-xl font-semibold ml-2">Auffüllung nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Auffüllung nicht gefunden</h2>
              <p className="text-gray-500 mb-4">
                Die angeforderte Auffüllung konnte nicht gefunden werden.
              </p>
              <Button onClick={() => setLocation(`/automaten/${id}`)}>
                Zurück zur Automatenübersicht
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/automaten/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <h1 className="text-xl font-semibold ml-2">Auffüllung Details</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke Spalte - Basisinfo */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">Basisinformationen</CardTitle>
                  <CardDescription>Details zur Auffüllung</CardDescription>
                </div>
                <Badge variant={
                  refill.status === "completed" ? "outline" :
                  refill.status === "pending" ? "secondary" : "default"
                } className={`ml-2 ${
                  refill.status === "completed" ? "bg-green-100 text-green-800 hover:bg-green-200" :
                  refill.status === "pending" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200" : ""
                }`}>
                  {refill.status === "completed" ? "Abgeschlossen" :
                   refill.status === "pending" ? "Ausstehend" : refill.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Auffüllung ID</p>
                  <p>{refill.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Zeitpunkt</p>
                  <p>{formatDateTime(refill.timestamp)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Automat</p>
                  <p>{refill.machineName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Zugehöriges Lager</p>
                  {isLoadingWarehouse ? (
                    <Skeleton className="h-6 w-32" />
                  ) : isErrorWarehouse ? (
                    <p className="text-red-500">Fehler beim Laden</p>
                  ) : warehouse ? (
                    <div className="flex items-center gap-1">
                      <Warehouse className="h-4 w-4 text-gray-500" />
                      <span>{warehouse.name}</span>
                    </div>
                  ) : (
                    <p className="text-gray-400">Kein Lager zugeordnet</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Notizen</p>
                  <p>{refill.notes || "Keine Notizen"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rechte Spalte - Produktdetails & Lagerbestand */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Auffüll-Details</TabsTrigger>
              <TabsTrigger value="inventory">Lagerbestand</TabsTrigger>
            </TabsList>
            
            {/* Auffüll-Details Tab */}
            <TabsContent value="details" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Aufgefüllte Produkte</CardTitle>
                  <CardDescription>Produkte, die bei dieser Auffüllung verwendet wurden</CardDescription>
                </CardHeader>
                <CardContent>
                  {refill.products && refill.products.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead>Menge</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Fach/Position</TableHead>
                          <TableHead>Lagerbestand</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {refill.products.map((product: RefillProduct) => (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">{product.productName}</TableCell>
                            <TableCell>{product.quantity} Stk.</TableCell>
                            <TableCell>
                              {product.quantity > 0 ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800">Aufgefüllt</Badge>
                              ) : product.quantity < 0 ? (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800">Entnommen</Badge>
                              ) : (
                                <Badge variant="outline">Ausgetauscht</Badge>
                              )}
                            </TableCell>
                            <TableCell>{product.position || product.slot || '–'}</TableCell>
                            <TableCell>
                              {/* Lagerbestandsänderung würde hier angezeigt werden, falls verfügbar */}
                              <span className="text-gray-500">Wird geladen...</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Keine Produktdetails verfügbar</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t pt-4">
                  <div className="space-y-2 w-full">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Gesamtzahl Produkte:</span>
                      <span className="font-medium">{refill.products?.reduce((sum, p) => sum + p.quantity, 0) || 0} Stk.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Anzahl unterschiedlicher Produkte:</span>
                      <span className="font-medium">{refill.products?.length || 0}</span>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
            
            {/* Lagerbestand Tab */}
            <TabsContent value="inventory" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Lagerbestand</CardTitle>
                      <CardDescription>Aktueller Bestand im Lager "{warehouse?.name}"</CardDescription>
                    </div>
                    <Button 
                      onClick={handleLagerbestandsChange} 
                      disabled={isUpdating || !warehouse}
                      variant="outline"
                      className="gap-1"
                    >
                      <DownloadCloud className="h-4 w-4" />
                      {isUpdating ? "Wird aktualisiert..." : "Lagerbestand anpassen"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingInventory ? (
                    <div className="space-y-3">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : isErrorInventory ? (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <p className="text-gray-500">Fehler beim Laden des Lagerbestands</p>
                    </div>
                  ) : inventory && inventory.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead>Aktueller Bestand</TableHead>
                          <TableHead>Mindestbestand</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Produkte, die in der Auffüllung verwendet wurden, vorab filtern */}
                        {inventory
                          .filter(item => {
                            // Entweder das Produkt ist in der Auffüllung oder alle anzeigen
                            return refill.products.some(p => p.productId === item.productId);
                          })
                          .map((product: WarehouseProduct) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-medium">{product.productName}</TableCell>
                              <TableCell className={product.quantity < 0 ? "text-red-500 font-medium" : ""}>
                                {product.quantity} Stk.
                              </TableCell>
                              <TableCell>{product.minQuantity} Stk.</TableCell>
                              <TableCell>
                                <Badge variant={
                                  product.quantity <= 0 ? "destructive" :
                                  product.quantity <= product.minQuantity ? "secondary" : "outline"
                                } className={`${
                                  product.quantity <= 0 ? "" :
                                  product.quantity <= product.minQuantity ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200" : ""
                                }`}>
                                  {product.quantity <= 0 ? "Kritisch" :
                                   product.quantity <= product.minQuantity ? "Nachbestellen" : "OK"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <Warehouse className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Keine Lagerbestandsdaten verfügbar</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                  <p className="text-sm text-gray-500">
                    Letzte Aktualisierung: {inventory && inventory.length > 0 
                      ? formatDateTime(inventory[0].lastUpdated) 
                      : "Nicht verfügbar"}
                  </p>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
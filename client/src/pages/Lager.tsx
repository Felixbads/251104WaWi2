
import { PageTitle } from "@/components/ui/page-title";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Warehouse, Package, Building, CircleAlert } from "lucide-react";
import WarehouseList from "@/components/inventory/WarehouseList";

export default function LagerPage() {
  const { toast } = useToast();
  
  const { data: warehouses, isLoading, error } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 60 * 1000, // 1 minute
  });
  
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/products'],
    staleTime: 60 * 1000, // 1 minute
  });
  
  // Handle loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-8">
        <PageTitle 
          title="Lager" 
          icon={<Warehouse className="h-6 w-6" />}
          description="Verwalten Sie Ihre Lager und Bestände"
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  // Handle error state
  if (error) {
    return (
      <div className="container mx-auto py-6">
        <PageTitle 
          title="Lager" 
          icon={<Warehouse className="h-6 w-6" />}
          description="Verwalten Sie Ihre Lager und Bestände" 
        />
        <div className="bg-destructive/10 p-4 rounded-lg border border-destructive flex items-start mt-6">
          <CircleAlert className="h-5 w-5 text-destructive mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-destructive">Fehler beim Laden der Lagerdaten</h3>
            <p className="text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageTitle 
        title="Lager" 
        icon={<Warehouse className="h-6 w-6" />}
        description="Verwalten Sie Ihre Lager und Bestände"
      />
      
      <Tabs defaultValue="warehouses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="warehouses" className="flex items-center">
            <Building className="mr-2 h-4 w-4" />
            <span>Lagerorte</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center">
            <Package className="mr-2 h-4 w-4" />
            <span>Bestand</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="warehouses" className="space-y-4">
          <WarehouseList />
        </TabsContent>
        
        <TabsContent value="inventory" className="space-y-4">
          <div className="bg-muted rounded-lg p-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Bestandsübersicht folgt in Kürze</h3>
            <p className="text-muted-foreground">
              Die Bestandverwaltung wird in einem zukünftigen Update verfügbar sein.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

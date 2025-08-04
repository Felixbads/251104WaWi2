import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Search, CheckCircle2, PhoneCall, Mail, RefreshCw, Star, StarOff } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from '@/lib/queryClient';

interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  orderVolume?: number;
  annualRevenue?: number;
  productCount?: number;
  isFavorite?: boolean;
}

interface SupplierSelectorProps {
  selectedSupplierId: number | null;
  onSelectSupplier: (id: number, name: string) => void;
}

const SupplierSelector: React.FC<SupplierSelectorProps> = ({
  selectedSupplierId,
  onSelectSupplier
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Mutation for adding/removing favorites
  const addToFavoritesMutation = useMutation({
    mutationFn: async (supplierId: number) => {
      const response = await fetch('/api/supplier-analytics/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('authToken') ? `Bearer ${localStorage.getItem('authToken')}` : ''
        },
        body: JSON.stringify({ supplierId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add supplier to favorites');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-analytics/overview'] });
    }
  });

  const removeFromFavoritesMutation = useMutation({
    mutationFn: async (supplierId: number) => {
      const response = await fetch(`/api/supplier-analytics/favorites/${supplierId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': localStorage.getItem('authToken') ? `Bearer ${localStorage.getItem('authToken')}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove supplier from favorites');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-analytics/overview'] });
    }
  });

  // Handle favorite toggle
  const handleFavoriteToggle = (supplierId: number, isFavorite: boolean, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row selection
    
    if (isFavorite) {
      removeFromFavoritesMutation.mutate(supplierId);
    } else {
      addToFavoritesMutation.mutate(supplierId);
    }
  };
  
  // Fetch suppliers with analytics (SORTIERT NACH VERKAUFSVOLUMEN)
  const { data: suppliersResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/supplier-analytics/overview'],
    queryFn: async () => {
      try {
        console.log("🚀 SupplierSelector: Lade Lieferanten mit Analytics (sortiert nach Verkaufsvolumen)...");
        
        // Analytics-Endpunkt nutzen - BEREITS NACH VERKAUFSVOLUMEN SORTIERT!
        const response = await fetch('/api/supplier-analytics/overview', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': localStorage.getItem('authToken') ? `Bearer ${localStorage.getItem('authToken')}` : ''
          }
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Abrufen der Lieferanten: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("📊 SupplierSelector: Analytics-Daten geladen (SORTIERT):", data);
        
        return data;
      } catch (error) {
        console.error("SupplierSelector: Fehler beim Laden der Lieferanten:", error);
        throw error;
      }
    }
  });
  
  // Extract suppliers from analytics response (ALREADY SORTED: favorites first, then by order volume)
  const suppliers = React.useMemo(() => {
    if (!suppliersResponse) return [];
    
    let suppliersList = [];
    
    // Handle analytics response - already sorted by favorites first, then order volume DESC
    if (suppliersResponse.success && suppliersResponse.data && Array.isArray(suppliersResponse.data)) {
      suppliersList = suppliersResponse.data.map((analytics: any) => ({
        id: analytics.supplierId,
        name: analytics.supplierName,
        // Analytics-Daten für Anzeige
        orderVolume: analytics.orderVolume || 0,
        annualRevenue: analytics.annualRevenue || 0,
        productCount: analytics.productCount || 0,
        isFavorite: analytics.isFavorite || false,
        // Standard-Felder (falls verfügbar)
        contactPerson: analytics.contactPerson || '',
        email: analytics.email || '',
        phone: analytics.phone || ''
      }));
    }
    else {
      console.warn("❌ Unbekanntes Analytics-Antwortformat:", suppliersResponse);
      return [];
    }
    
    const favoriteCount = suppliersList.filter((s: any) => s.isFavorite).length;
    console.log(`🎯 ${suppliersList.length} Lieferanten geladen (${favoriteCount} Favoriten zuerst, dann nach Bestellvolumen sortiert)`);
    return suppliersList; // NO additional sorting needed - backend already sorts correctly!
  }, [suppliersResponse]);
  
  // Filter suppliers based on search query
  const filteredSuppliers = suppliers?.filter((supplier: Supplier) => 
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lieferant auswählen</CardTitle>
        <CardDescription>
          Wählen Sie den Lieferanten aus, bei dem Sie bestellen möchten. Favoriten werden zuerst angezeigt, gefolgt von Lieferanten sortiert nach Bestellvolumen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Lieferant suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
        </div>
        
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Lieferanten werden geladen...</span>
            </div>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 p-6 rounded-md border border-destructive text-center space-y-4">
            <div className="text-destructive font-medium">
              Fehler beim Laden der Lieferanten
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              Die Lieferantenliste konnte nicht geladen werden. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.
            </p>
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Neu laden
            </Button>
          </div>
        ) : (
          <Table>
            <TableCaption>Liste der verfügbaren Lieferanten</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Favorit</TableHead>
                <TableHead>Name & Bestellungen</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers && filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier: Supplier) => (
                  <TableRow 
                    key={supplier.id} 
                    className={`cursor-pointer hover:bg-muted/50 ${selectedSupplierId === supplier.id ? 'bg-primary/10' : ''} ${supplier.isFavorite ? 'bg-yellow-50 border-l-4 border-l-yellow-400' : ''}`}
                    onClick={() => onSelectSupplier(supplier.id, supplier.name)}
                  >
                    <TableCell className="w-16">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-8 w-8"
                        onClick={(e) => handleFavoriteToggle(supplier.id, supplier.isFavorite || false, e)}
                        disabled={addToFavoritesMutation.isPending || removeFromFavoritesMutation.isPending}
                      >
                        {supplier.isFavorite ? (
                          <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        ) : (
                          <StarOff className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold text-base flex items-center gap-2">
                          {supplier.name}
                          {supplier.isFavorite && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                              Favorit
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
                          {supplier.contactPerson && (
                            <span className="flex items-center gap-1">
                              <PhoneCall className="w-3 h-3" />
                              {supplier.contactPerson}
                            </span>
                          )}
                          {(supplier.orderVolume || 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              {supplier.orderVolume} Bestellungen
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {selectedSupplierId === supplier.id ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <div className="w-5 h-5"></div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                    {searchQuery ? "Keine Lieferanten gefunden" : "Keine Lieferanten verfügbar"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierSelector;
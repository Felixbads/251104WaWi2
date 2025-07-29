import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Truck, Search, CheckCircle2, PhoneCall, Mail, RefreshCw } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
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
  
  // Extract suppliers from analytics response (BEREITS NACH VERKAUFSVOLUMEN SORTIERT!)
  const suppliers = React.useMemo(() => {
    if (!suppliersResponse) return [];
    
    let suppliersList = [];
    
    // Handle analytics response - bereits nach orderVolume DESC sortiert
    if (suppliersResponse.success && suppliersResponse.data && Array.isArray(suppliersResponse.data)) {
      suppliersList = suppliersResponse.data.map((analytics: any) => ({
        id: analytics.supplierId,
        name: analytics.supplierName,
        // Analytics-Daten für Anzeige
        orderVolume: analytics.orderVolume,
        annualRevenue: analytics.annualRevenue,
        productCount: analytics.productCount,
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
    
    console.log(`🎯 ${suppliersList.length} Lieferanten geladen (BEREITS SORTIERT nach Verkaufsvolumen)`);
    return suppliersList; // KEINE weitere Sortierung nötig - Backend sortiert bereits!
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
          Wählen Sie den Lieferanten aus, bei dem Sie bestellen möchten.
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
                <TableHead>Name & Umsatz</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers && filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier: Supplier) => (
                  <TableRow 
                    key={supplier.id} 
                    className={`cursor-pointer hover:bg-muted/50 ${selectedSupplierId === supplier.id ? 'bg-primary/10' : ''}`}
                    onClick={() => onSelectSupplier(supplier.id, supplier.name)}
                  >
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold text-base">{supplier.name}</div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
                          {supplier.contactPerson && (
                            <span className="flex items-center gap-1">
                              <PhoneCall className="w-3 h-3" />
                              {supplier.contactPerson}
                            </span>
                          )}
                          {/* Revenue display removed as requested - numbers after supplier names removed */}
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
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
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
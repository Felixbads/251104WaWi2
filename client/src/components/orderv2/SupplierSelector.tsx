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
  
  // Fetch suppliers
  const { data: suppliersResponse, isLoading, error } = useQuery({
    queryKey: ['/api/suppliers'],
  });
  
  // Extract suppliers from response (handles both array and {data: []} formats)
  const suppliers = Array.isArray(suppliersResponse) 
    ? suppliersResponse 
    : (suppliersResponse as any)?.data || [];
  
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
              onClick={() => window.location.reload()}
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
                <TableHead>Name</TableHead>
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
                      <div className="flex items-center justify-between">
                        <span>{supplier.name}</span>
                        {selectedSupplierId === supplier.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
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
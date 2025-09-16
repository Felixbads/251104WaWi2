import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Building2, Search, CheckCircle2 } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

// Comprehensive warehouse type definitions to handle different response formats
interface BaseWarehouse {
  id: number;
  name: string;
  location?: string | null;
  type?: string | null;
  city?: string | null;
  address?: string | null;
  postal_code?: string | null;
  postalCode?: string | null;
  is_active?: boolean;
  isActive?: boolean;
}

interface Warehouse extends BaseWarehouse {
  name: string;
  location: string;
  type: string;
}

// API response formats
interface PaginatedWarehouseResponse {
  data: BaseWarehouse[];
  meta?: Record<string, any>;
}

interface SQLWarehouseResponse {
  rows: BaseWarehouse[];
}

type WarehouseApiResponse = BaseWarehouse[] | PaginatedWarehouseResponse | SQLWarehouseResponse | unknown;

interface WarehouseSelectorProps {
  selectedWarehouseId: number | null;
  onSelectWarehouse: (id: number, name: string) => void;
}

const WarehouseSelector: React.FC<WarehouseSelectorProps> = ({
  selectedWarehouseId,
  onSelectWarehouse
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch warehouses with proper typing
  const { data: warehousesData, isLoading, error } = useQuery<WarehouseApiResponse>({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 minute
  });
  
  // Type-safe warehouse data normalization
  const warehouses = React.useMemo((): Warehouse[] => {
    if (!warehousesData) return [];
    
    const normalizeWarehouse = (w: BaseWarehouse): Warehouse => ({
      id: w.id,
      name: w.name || '',
      location: w.location || w.city || '',
      type: w.type || '',
      city: w.city,
      address: w.address,
      postal_code: w.postal_code || w.postalCode,
      is_active: w.is_active ?? w.isActive ?? true
    });
    
    // Handle direct array format
    if (Array.isArray(warehousesData)) {
      return warehousesData.map(normalizeWarehouse);
    }
    
    // Handle paginated response format { data: [], meta: {} }
    if (warehousesData && typeof warehousesData === 'object') {
      const response = warehousesData as PaginatedWarehouseResponse | SQLWarehouseResponse;
      
      // Check for data property (paginated format)
      if ('data' in response && Array.isArray(response.data)) {
        return response.data.map(normalizeWarehouse);
      }
      
      // Check for rows property (SQL result format)
      if ('rows' in response && Array.isArray(response.rows)) {
        return response.rows.map(normalizeWarehouse);
      }
    }
    
    return [];
  }, [warehousesData]);
  
  // Type-safe warehouse filtering
  const filteredWarehouses = warehouses.filter((warehouse: Warehouse) => 
    warehouse.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (warehouse.location && warehouse.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (warehouse.type && warehouse.type.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lager auswählen</CardTitle>
        <CardDescription>
          Wählen Sie das Ziellager aus, für das Sie eine Bestellung erstellen möchten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Lager suchen..."
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
          </div>
        ) : error ? (
          <div className="bg-destructive/20 p-4 rounded-md text-destructive">
            Fehler beim Laden der Lager. Bitte versuchen Sie es später erneut.
          </div>
        ) : (
          <Table>
            <TableCaption>Liste der verfügbaren Lager</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWarehouses && filteredWarehouses.length > 0 ? (
                filteredWarehouses.map((warehouse: Warehouse) => (
                  <TableRow 
                    key={warehouse.id} 
                    className={`cursor-pointer hover:bg-muted/50 ${selectedWarehouseId === warehouse.id ? 'bg-primary/10' : ''}`}
                    onClick={() => onSelectWarehouse(warehouse.id, warehouse.name)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center justify-between">
                        <span>{warehouse.name}</span>
                        {selectedWarehouseId === warehouse.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                    {searchQuery ? "Keine Lager gefunden" : "Keine Lager verfügbar"}
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

export default WarehouseSelector;
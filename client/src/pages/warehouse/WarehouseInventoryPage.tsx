import React, { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, MapPin, Clock } from 'lucide-react';
import { Link } from 'wouter';
import WarehouseStats from '../../components/inventory/WarehouseStats';
import WarehouseInventoryTable from '../../components/inventory/WarehouseInventoryTable';
import WarehouseMovementsTable from '../../components/inventory/WarehouseMovementsTable';
import WarehouseMachineAssignments from '../../components/inventory/WarehouseMachineAssignments';

// Typdefinition für die Warehouse-Info
interface WarehouseInfo {
  id: number;
  name: string;
  address?: string;
  postal_code?: string;
  city?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function WarehouseInventoryPage() {
  const { id } = useParams();
  const warehouseId = parseInt(id || '0');
  const [activeTab, setActiveTab] = useState('inventory');
  
  // Lade die Grundinformationen des Lagers mit Typisierung
  const { data: warehouse, isLoading, error } = useQuery<WarehouseInfo>({
    queryKey: [`/api/inventory/warehouse/${warehouseId}/info`],
  });
  
  // Debug-Ausgabe
  console.log("Warehouse info loaded:", warehouse);

  // Formatiert einen Zeitstempel als relatives Datum (vor X Tagen)
  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const differenceInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    
    if (differenceInDays === 0) {
      return 'Heute';
    } else if (differenceInDays === 1) {
      return 'Gestern';
    } else if (differenceInDays < 7) {
      return `Vor ${differenceInDays} Tagen`;
    } else if (differenceInDays < 30) {
      const weeks = Math.floor(differenceInDays / 7);
      return `Vor ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
    } else {
      const months = Math.floor(differenceInDays / 30);
      return `Vor ${months} ${months === 1 ? 'Monat' : 'Monaten'}`;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-10 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
        <div className="h-24 bg-muted rounded mb-6"></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !warehouseId) {
    return (
      <div className="container mx-auto py-10">
        <Card className="bg-red-50 dark:bg-red-900/20">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Fehler</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Das angeforderte Lager konnte nicht gefunden werden.</p>
            <Button asChild className="mt-4">
              <Link href="/warehouses">Zurück zur Übersicht</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/warehouses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            {warehouse?.name || `Lager #${warehouseId}`}
          </h1>
          {warehouse?.address && (
            <div className="text-muted-foreground flex items-center mt-1">
              <MapPin className="h-4 w-4 mr-1" />
              {warehouse?.address}, {warehouse?.postal_code} {warehouse?.city}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          {warehouse?.is_active ? (
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Aktiv</Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">Inaktiv</Badge>
          )}
          {warehouse?.updated_at && (
            <div className="text-sm text-muted-foreground flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              Aktualisiert: {formatRelativeDate(warehouse?.updated_at)}
            </div>
          )}
        </div>
      </div>

      <WarehouseStats warehouseId={warehouseId} />

      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="mt-6"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Lagerbestand</TabsTrigger>
          <TabsTrigger value="movements">Warenbewegungen</TabsTrigger>
          <TabsTrigger value="machines">Automaten-Zuordnung</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <WarehouseInventoryTable warehouseId={warehouseId} />
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <WarehouseMovementsTable warehouseId={warehouseId} />
        </TabsContent>

        <TabsContent value="machines" className="space-y-4">
          <WarehouseMachineAssignments />
        </TabsContent>
      </Tabs>
    </div>
  );
}
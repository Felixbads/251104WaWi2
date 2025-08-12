import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { 
  ChevronLeft, 
  Euro,
  MapPin,
  BarChart as BarChartIcon,
  TrendingUp,
  Plus,
  Edit,
  Save,
  X,
  Zap,
  Home,
  Radio,
  CreditCard,
  Shield,
  Settings,
  Heart,
  Building2,
  Users,
  Activity,
  AlertTriangle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Location Detail Component
export default function LocationDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const locationId = params.id!;

  // Fetch location data
  const { data: locationData, isLoading: locationLoading } = useQuery({
    queryKey: ['/api/locations', locationId],
    enabled: !!locationId
  });

  // Fetch machines for this location
  const { data: machinesData, isLoading: machinesLoading } = useQuery({
    queryKey: ['/api/machines', 'by-location', locationId],
    enabled: !!locationId
  });

  const locationName = locationData?.name || `Standort ${locationId}`;

  if (locationLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setLocation('/standort-status')}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center space-x-2">
            <Building2 className="h-8 w-8" />
            <span>{locationName}</span>
          </h1>
          <p className="text-muted-foreground">
            Standort-Details und Kostenverwaltung
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="machines">Automaten</TabsTrigger>
          <TabsTrigger value="costs">Kosten</TabsTrigger>
          <TabsTrigger value="analytics">Auswertungen</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <LocationOverviewTab 
            locationId={locationId} 
            locationData={locationData}
            machinesData={machinesData}
          />
        </TabsContent>

        <TabsContent value="machines">
          <LocationMachinesTab 
            locationId={locationId}
            machinesData={machinesData}
            isLoading={machinesLoading}
          />
        </TabsContent>

        <TabsContent value="costs">
          <LocationCostsTab locationId={locationId} />
        </TabsContent>

        <TabsContent value="analytics">
          <LocationAnalyticsTab locationId={locationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Location Overview Tab
function LocationOverviewTab({ 
  locationId, 
  locationData, 
  machinesData 
}: { 
  locationId: string;
  locationData: any;
  machinesData: any;
}) {
  const machineCount = machinesData?.length || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Automaten</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{machineCount}</div>
          <p className="text-xs text-muted-foreground">
            Aktive Automaten an diesem Standort
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Status</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">Aktiv</div>
          <p className="text-xs text-muted-foreground">
            Standort ist betriebsbereit
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Adresse</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            {locationData?.address ? (
              <div>
                <p>{locationData.address}</p>
                {locationData.city && (
                  <p>{locationData.postalCode} {locationData.city}</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Adresse hinterlegt</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Location Machines Tab
function LocationMachinesTab({ 
  locationId, 
  machinesData, 
  isLoading 
}: { 
  locationId: string;
  machinesData: any;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div>Lade Automaten...</div>;
  }

  if (!machinesData || machinesData.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Keine Automaten</h3>
            <p className="text-muted-foreground">
              An diesem Standort sind noch keine Automaten zugeordnet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {machinesData.map((machine: any) => (
        <Card key={machine.id} className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg">{machine.machineName}</CardTitle>
            <CardDescription>ID: {machine.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <Badge variant="outline">Aktiv</Badge>
              </div>
              {machine.vendonId && (
                <div className="flex justify-between text-sm">
                  <span>Vendon ID:</span>
                  <span className="font-mono">{machine.vendonId}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Location Analytics Tab
function LocationAnalyticsTab({ locationId }: { locationId: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Umsatzanalyse</CardTitle>
          <CardDescription>
            Umsatzentwicklung für diesen Standort
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChartIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Umsatzanalyse wird implementiert...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Location Costs Tab - Simple stub for now
function LocationCostsTab({ locationId }: { locationId: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kostenverwaltung</CardTitle>
          <CardDescription>
            Kosten für Standort {locationId}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Euro className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Kostenverwaltung wird implementiert...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
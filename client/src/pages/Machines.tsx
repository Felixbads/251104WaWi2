import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Package, 
  Search, 
  Plus, 
  Filter, 
  Map, 
  Grid, 
  List, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getMachines, Machine } from "@/lib/api";

export default function Machines() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid");
  const [, setLocation] = useLocation();

  // Daten abrufen
  const { data: machines, isLoading, error } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  // Status Filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Filter- und Suchfunktionen
  const filteredMachines = machines?.filter((machine: Machine) => {
    // Sicherstellen, dass die Maschine und ihre Eigenschaften definiert sind
    if (!machine || !machine.machineName) return false;
    
    const matchesSearch = machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (machine.location?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesStatus = !statusFilter || machine.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  // Machine Card Component
  const MachineCard = ({ machine }: { machine: Machine }) => {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg truncate">{machine.machineName}</CardTitle>
            <StatusBadge status={machine.status} />
          </div>
          <CardDescription>{machine.location}</CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-sm text-gray-500">Produkte</p>
              <p className="font-medium">{machine.product_count || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fehler</p>
              <p className="font-medium">{machine.error_count || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Letzte Synch.</p>
              <p className="font-medium text-sm">
                {machine.lastSync ? new Date(machine.lastSync).toLocaleDateString() : '–'}
              </p>
            </div>
          </div>
          {machine.lastSale && (
            <div className="mt-2">
              <p className="text-sm text-gray-500">Letzter Verkauf</p>
              <p className="font-medium text-sm">
                {new Date(machine.lastSale).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setLocation(`/machines/${machine.id}`)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Details
          </Button>
        </CardFooter>
      </Card>
    );
  };

  // Machine List Item Component
  const MachineListItem = ({ machine }: { machine: Machine }) => {
    return (
      <div className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="flex-grow mr-4">
          <div className="flex items-center mb-1">
            <h3 className="font-medium truncate mr-2">{machine.machineName}</h3>
            <StatusBadge status={machine.status} />
          </div>
          <p className="text-sm text-gray-600">{machine.location}</p>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-gray-500">Produkte</p>
            <p className="font-medium">{machine.product_count || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Fehler</p>
            <p className="font-medium">{machine.error_count || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Letzte Synch.</p>
            <p className="font-medium">
              {machine.lastSync ? new Date(machine.lastSync).toLocaleDateString() : '–'}
            </p>
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setLocation(`/machines/${machine.id}`)}
          >
            Details
          </Button>
        </div>
      </div>
    );
  };

  // Status Badge Component
  const StatusBadge = ({ status }: { status: string }) => {
    // Beachte, dass das ursprüngliche "success" auf "default" geändert wird
    // um die Badge-Komponente zu unterstützen
    let variant: 
      | "default"
      | "outline"
      | "secondary"
      | "destructive" = "default";
    let icon = null;
    let className = "";

    switch (status) {
      case "active":
        variant = "default"; // anstatt "success" verwenden wir "default" mit grüner Farbe
        className = "bg-green-500 hover:bg-green-700";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "inactive":
        variant = "secondary";
        break;
      case "error":
        variant = "destructive";
        icon = <AlertTriangle className="h-3 w-3 mr-1" />;
        break;
      default:
        variant = "outline";
    }

    return (
      <Badge variant={variant} className={`flex items-center ${className}`}>
        {icon}
        {status === "active" ? "Aktiv" : 
         status === "inactive" ? "Inaktiv" : 
         status === "error" ? "Fehler" : status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Package className="h-6 w-6 mr-2" />
            Maschinen
          </h1>
          <p className="text-gray-500 mt-1">
            Verwalten und überwachen Sie alle Automaten im Netzwerk
          </p>
        </div>
        <Button onClick={() => setLocation("/machines/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Maschine
        </Button>
      </div>

      <Separator />

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Maschinen suchen..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {/* Filter dialog implementieren */}}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <div className="border rounded-md p-1 flex">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              className="h-8 w-8 rounded-sm"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              className="h-8 w-8 rounded-sm"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "map" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("map")}
              className="h-8 w-8 rounded-sm"
            >
              <Map className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs for Status Filtering */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setStatusFilter(null)}>
            Alle
          </TabsTrigger>
          <TabsTrigger value="active" onClick={() => setStatusFilter("active")}>
            Aktiv
          </TabsTrigger>
          <TabsTrigger value="inactive" onClick={() => setStatusFilter("inactive")}>
            Inaktiv
          </TabsTrigger>
          <TabsTrigger value="error" onClick={() => setStatusFilter("error")}>
            Fehler
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden der Maschinen: {String(error)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {!isLoading && !error && (
        <p className="text-sm text-gray-500">
          {filteredMachines.length} {filteredMachines.length === 1 ? 'Maschine' : 'Maschinen'} gefunden
        </p>
      )}

      {/* Machines Grid/List View */}
      {!isLoading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMachines.map((machine: Machine) => (
            <MachineCard key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "list" && (
        <div className="border rounded-md divide-y">
          {filteredMachines.map((machine: Machine) => (
            <MachineListItem key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "map" && (
        <Card className="h-[500px] flex items-center justify-center">
          <CardContent>
            <p className="text-gray-500">
              Kartenansicht wird in Kürze verfügbar sein
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {!isLoading && !error && filteredMachines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium">Keine Maschinen gefunden</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? `Keine Ergebnisse für "${searchTerm}"`
              : "Es wurden keine Maschinen gefunden, die den Filterkriterien entsprechen"}
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setSearchTerm("");
              setStatusFilter(null);
            }}
          >
            Filter zurücksetzen
          </Button>
        </div>
      )}
    </div>
  );
}
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  MoreHorizontal,
  Plus,
  Search,
  AlertTriangle,
  RefreshCw,
  PanelTop,
  Unlink,
  Truck,
  ShoppingBag,
  LineChart,
  Calendar,
  BarChart,
  Clipboard,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import MachineAssignmentDialog from "./MachineAssignmentDialog";

interface MachinesTabProps {
  warehouseId: number;
}

export default function MachinesTab({ warehouseId }: MachinesTabProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  
  // Abrufen der zugewiesenen Automaten
  const { data: machines, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'machines'],
    retry: 1,
  });

  // Filtere Automaten basierend auf dem Suchbegriff
  const filteredMachines = machines?.filter((machine: any) => {
    return (
      machine.machineName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      machine.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      machine.vendonId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }) || [];

  // Handler zum Entfernen einer Zuordnung
  const handleRemoveAssignment = async (assignmentId: number) => {
    try {
      await apiRequest(`/api/warehouse3/machine-assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      
      toast({
        title: "Zuordnung entfernt",
        description: "Die Automatenzuordnung wurde erfolgreich entfernt.",
      });
      
      // Daten neu laden
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'machines'] });
    } catch (err) {
      console.error("Fehler beim Entfernen der Zuordnung:", err);
      toast({
        title: "Fehler",
        description: "Die Automatenzuordnung konnte nicht entfernt werden.",
        variant: "destructive",
      });
    }
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zugewiesene Automaten</CardTitle>
          <CardDescription>Alle diesem Lager zugeordneten Automaten</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Automaten..."
                  className="pl-8"
                  disabled
                />
              </div>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" /> Automat zuweisen
              </Button>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Automat</TableHead>
                    <TableHead>Vendon ID</TableHead>
                    <TableHead>Standort</TableHead>
                    <TableHead className="text-right">Produkte</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wenn ein Fehler aufgetreten ist
  if (isError) {
    return (
      <Card className="bg-destructive/10 border-destructive">
        <CardHeader>
          <CardTitle>Automaten konnten nicht geladen werden</CardTitle>
          <CardDescription>
            Beim Abrufen der Automatendaten ist ein Fehler aufgetreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
            <p className="mb-4 text-muted-foreground">{(error as Error)?.message || "Ein unbekannter Fehler ist aufgetreten"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'machines'] })}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wenn keine Automaten zugewiesen sind
  if (!machines || machines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zugewiesene Automaten</CardTitle>
          <CardDescription>Alle diesem Lager zugeordneten Automaten</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <PanelTop className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Automaten zugewiesen</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Diesem Lager sind noch keine Automaten zugewiesen. Weisen Sie Automaten zu, um mit dem Management zu beginnen.
            </p>
            <Button onClick={() => setIsAssignDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Automat zuweisen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Status Badge für Automaten
  const MachineStatusBadge = ({ needsRefill, lastRefill }: { needsRefill: boolean, lastRefill: string | null }) => {
    // Wenn keine Auffüllung in den letzten 7 Tagen
    if (needsRefill) {
      return <Badge variant="destructive">Auffüllung nötig</Badge>;
    }
    
    if (lastRefill) {
      // Prüfen, ob die letzte Auffüllung max. 3 Tage her ist
      const refillDate = new Date(lastRefill);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      if (refillDate > threeDaysAgo) {
        return <Badge variant="outline" className="text-green-600 border-green-600">Kürzlich aufgefüllt</Badge>;
      }
    }
    
    return <Badge variant="outline">Aktiv</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zugewiesene Automaten</CardTitle>
        <CardDescription>
          Verwalten Sie die zugewiesenen Automaten für dieses Lager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Automaten..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Automat zuweisen
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Automaten zuweisen</DialogTitle>
                  <DialogDescription>
                    Weisen Sie diesem Lager einen oder mehrere nicht zugeordnete Automaten zu.
                  </DialogDescription>
                </DialogHeader>
                <MachineAssignmentDialog 
                  warehouseId={warehouseId} 
                  onClose={() => setIsAssignDialogOpen(false)}
                  onSuccess={() => {
                    setIsAssignDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'machines'] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="mb-2 text-sm text-muted-foreground">
            {filteredMachines.length} {filteredMachines.length === 1 ? 'Automat' : 'Automaten'} zugewiesen
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Automat</TableHead>
                  <TableHead>Vendon ID</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead className="text-right">Produkte</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.map((machine: any) => (
                  <TableRow key={machine.id}>
                    <TableCell>
                      <div className="font-medium">{machine.machineName}</div>
                    </TableCell>
                    <TableCell>{machine.vendonId || "–"}</TableCell>
                    <TableCell>{machine.location || "Unbekannt"}</TableCell>
                    <TableCell className="text-right">
                      {machine.productCount || 0}
                    </TableCell>
                    <TableCell>
                      <MachineStatusBadge 
                        needsRefill={machine.needsRefill || false} 
                        lastRefill={machine.lastRefillDate} 
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <span className="sr-only">Aktionen</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${machine.machineId}`}>
                              <PanelTop className="mr-2 h-4 w-4" /> Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/refills/new?machineId=${machine.machineId}`}>
                              <Truck className="mr-2 h-4 w-4" /> Auffüllung erstellen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${machine.machineId}/products`}>
                              <ShoppingBag className="mr-2 h-4 w-4" /> Produkte
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${machine.machineId}/stats`}>
                              <LineChart className="mr-2 h-4 w-4" /> Statistiken
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${machine.machineId}/sales`}>
                              <BarChart className="mr-2 h-4 w-4" /> Verkäufe
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${machine.machineId}/refills`}>
                              <Calendar className="mr-2 h-4 w-4" /> Auffüllhistorie
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Unlink className="mr-2 h-4 w-4" /> Zuweisung aufheben
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Automatenzuweisung aufheben</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sind Sie sicher, dass Sie die Zuweisung von "{machine.machineName}" zu diesem Lager aufheben möchten? 
                                  Die Zuweisung kann jederzeit wiederhergestellt werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleRemoveAssignment(machine.assignmentId)}
                                >
                                  Zuweisung aufheben
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="w-full flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Manuelle Auffüllungen können über die Aktionen bei jedem Automaten erstellt werden.
          </div>
          <Link href={`/warehouse3/${warehouseId}/machines/assign-bulk`}>
            <Button variant="outline" size="sm">
              <Clipboard className="mr-2 h-4 w-4" /> Massenweise zuweisen
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
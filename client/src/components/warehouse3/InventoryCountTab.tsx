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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clipboard,
  Calendar,
  BookOpen,
  CheckCircle,
  Clock,
  XCircle,
  CalendarCheck,
  Mail,
  Eye,
  ArrowUpRightSquare,
  Trash2,
  FileBarChart,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface InventoryCountTabProps {
  warehouseId: number;
}

export default function InventoryCountTab({ warehouseId }: InventoryCountTabProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Abrufen der Inventurzählungen
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'inventory-counts', { 
      page: currentPage, 
      search: searchTerm,
      status: statusFilter,
    }],
    retry: 1,
  });

  // Formatiere das Datum für die Anzeige
  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return format(new Date(date), "dd.MM.yyyy", { locale: de });
  };

  // Status-Badge-Komponente
  const StatusBadge = ({ status }: { status: string }) => {
    const statusMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline" | "success" }> = {
      pending: { label: "Ausstehend", variant: "secondary" },
      in_progress: { label: "In Bearbeitung", variant: "default" },
      completed: { label: "Abgeschlossen", variant: "success" },
      cancelled: { label: "Storniert", variant: "destructive" },
    };
    
    const statusInfo = statusMap[status?.toLowerCase()] || { label: status, variant: "outline" };
    
    // Custom success badge für "completed"
    if (statusInfo.variant === "success") {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100/80">
          {statusInfo.label}
        </Badge>
      );
    }
    
    return <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>;
  };

  // Handler zum Löschen einer Inventur
  const handleDeleteCount = async (countId: number) => {
    try {
      await apiRequest(`/api/warehouse3/inventory-counts/${countId}`, null, 'DELETE');
      
      toast({
        title: "Inventur gelöscht",
        description: "Die Inventur wurde erfolgreich gelöscht.",
      });
      
      // Daten neu laden
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'inventory-counts'] });
    } catch (err) {
      console.error("Fehler beim Löschen der Inventur:", err);
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventuren</CardTitle>
          <CardDescription>Übersicht aller Inventurzählungen für dieses Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Inventuren..."
                  className="pl-8"
                  disabled
                />
              </div>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" /> Neue Inventur
              </Button>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Geplant für</TableHead>
                    <TableHead>Produkte</TableHead>
                    <TableHead>Erstellt von</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
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
          <CardTitle>Inventuren konnten nicht geladen werden</CardTitle>
          <CardDescription>
            Beim Abrufen der Inventurdaten ist ein Fehler aufgetreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
            <p className="mb-4 text-muted-foreground">{(error as Error)?.message || "Ein unbekannter Fehler ist aufgetreten"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'inventory-counts'] })}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wenn keine Daten vorhanden sind
  if (!data || !data.items || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventuren</CardTitle>
          <CardDescription>Übersicht aller Inventurzählungen für dieses Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <div className="relative max-w-[230px] flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Inventuren..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <Select
              value={statusFilter || ""}
              onValueChange={(value) => setStatusFilter(value || null)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Alle Status</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
                <SelectItem value="cancelled">Storniert</SelectItem>
              </SelectContent>
            </Select>
            
            {(searchTerm || statusFilter) && (
              <Button 
                variant="ghost" 
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter(null);
                }}
              >
                Filter zurücksetzen
              </Button>
            )}
          </div>
          
          <div className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Clipboard className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Inventuren gefunden</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {(searchTerm || statusFilter)
                ? "Versuchen Sie andere Filtereinstellungen oder erstellen Sie eine neue Inventur."
                : "Für dieses Lager wurden noch keine Inventuren durchgeführt. Erstellen Sie eine Inventur, um den aktuellen Bestand zu prüfen und anzupassen."}
            </p>
            
            <Link href={`/warehouse3/${warehouseId}/counts/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Inventur erstellen
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Seitenzahlen berechnen
  const totalPages = Math.ceil(data.total / itemsPerPage);

  // Status Icon
  const StatusIcon = ({ status }: { status: string }) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'in_progress':
        return <BookOpen className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventuren</CardTitle>
        <CardDescription>
          Übersicht aller Inventurzählungen für dieses Lager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between mb-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative max-w-[230px] flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Inventuren..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Select
                value={statusFilter || ""}
                onValueChange={(value) => setStatusFilter(value || null)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Status</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
              
              {(searchTerm || statusFilter) && (
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter(null);
                  }}
                >
                  Filter zurücksetzen
                </Button>
              )}
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Neue Inventur
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Neue Inventur erstellen</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie eine neue Inventur für dieses Lager.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-muted-foreground mb-4">
                    Bei einer Inventur können Sie den aktuellen Lagerbestand prüfen und korrigieren. Sie können eine Inventur für das gesamte Lager oder nur für bestimmte Produkte durchführen.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium mb-1">Sofortige Inventur</div>
                        <div className="text-sm text-muted-foreground">Inventur sofort starten und durchführen</div>
                      </div>
                      <Link href={`/warehouse3/${warehouseId}/counts/new`}>
                        <Button>
                          <Clipboard className="mr-2 h-4 w-4" /> Erstellen
                        </Button>
                      </Link>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium mb-1">Geplante Inventur</div>
                        <div className="text-sm text-muted-foreground">Inventur für einen späteren Zeitpunkt planen</div>
                      </div>
                      <Link href={`/warehouse3/${warehouseId}/counts/schedule`}>
                        <Button variant="outline">
                          <Calendar className="mr-2 h-4 w-4" /> Planen
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button">
                    Abbrechen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Geplant für</TableHead>
                  <TableHead>Produkte</TableHead>
                  <TableHead>Erstellt von</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((count: any) => (
                  <TableRow key={count.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="font-medium">
                          {count.startDate ? formatDate(count.startDate) : formatDate(count.createdAt)}
                        </div>
                        {count.endDate && (
                          <div className="text-xs text-muted-foreground">
                            Abgeschlossen: {formatDate(count.endDate)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={count.status} />
                        <StatusBadge status={count.status} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {count.scheduledDate ? (
                        <div className="flex items-center">
                          <CalendarCheck className="h-4 w-4 mr-1.5 text-muted-foreground" />
                          {formatDate(count.scheduledDate)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {count.itemCount || 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-1.5 text-muted-foreground" />
                        {count.initiatedByName || `#${count.initiatedBy || 'System'}`}
                      </div>
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
                            <Link href={`/warehouse3/${warehouseId}/counts/${count.id}`}>
                              <Eye className="mr-2 h-4 w-4" /> Details
                            </Link>
                          </DropdownMenuItem>
                          {count.status === 'pending' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/counts/${count.id}/start`}>
                                <ArrowUpRightSquare className="mr-2 h-4 w-4" /> Starten
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {count.status === 'in_progress' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/counts/${count.id}/continue`}>
                                <ArrowUpRightSquare className="mr-2 h-4 w-4" /> Fortsetzen
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {count.status === 'completed' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/counts/${count.id}/report`}>
                                <FileBarChart className="mr-2 h-4 w-4" /> Bericht
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/counts/${count.id}/print`}>
                              <Mail className="mr-2 h-4 w-4" /> Drucken
                            </Link>
                          </DropdownMenuItem>
                          {count.status === 'pending' && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Löschen
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Inventur löschen</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Sind Sie sicher, dass Sie diese Inventur löschen möchten? 
                                      Diese Aktion kann nicht rückgängig gemacht werden.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteCount(count.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Löschen
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* Paginierung */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Zeige {(currentPage - 1) * itemsPerPage + 1} bis{" "}
              {Math.min(currentPage * itemsPerPage, data.total)} von {data.total} Einträgen
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t flex justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Tipp:</span>{" "}
          Regelmäßige Inventuren helfen, Abweichungen im Bestand frühzeitig zu erkennen.
        </div>
        <Link href={`/warehouse3/${warehouseId}/counts/report`}>
          <Button variant="outline" size="sm">
            <Mail className="mr-2 h-4 w-4" /> Inventurbericht
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
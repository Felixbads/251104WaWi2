import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  Calendar,
  PackageCheck,
  ArrowDownUp,
  PanelTop,
  Truck,
  Clipboard,
  FileCheck,
  ShoppingBag,
  Mail,
  Eye,
  RotateCcw,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RefillsTabProps {
  warehouseId: number;
}

export default function RefillsTab({ warehouseId }: RefillsTabProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterMachine, setFilterMachine] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [refillToCancel, setRefillToCancel] = useState<any>(null);
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });
  
  // Abrufen der Auffüllungen für dieses Lager
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'refills', { 
      page: currentPage, 
      search: searchTerm,
      status: filterStatus,
      machineId: filterMachine,
      startDate: dateRange.from,
      endDate: dateRange.to,
    }],
    retry: 1,
  });

  // Abrufen der Automaten für Filter
  const { data: machines } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'machines'],
    retry: 1,
  });

  // Cancel refill mutation
  const cancelMutation = useMutation({
    mutationFn: async (refillId: number) => {
      const response = await apiRequest(`/api/warehouse3/warehouses/${warehouseId}/refills/${refillId}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to cancel refill');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/warehouse3/warehouses', warehouseId, 'refills']
      });
      toast({
        title: "Auffüllung storniert",
        description: "Die Auffüllung wurde erfolgreich storniert.",
      });
      setCancelDialogOpen(false);
      setRefillToCancel(null);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Stornieren",
        description: error.message || "Die Auffüllung konnte nicht storniert werden.",
        variant: "destructive",
      });
    },
  });

  // Formatiere das Datum für die Anzeige
  const formatRefillDate = (date: string | Date | null | undefined) => {
    if (!date) return "–";
    return format(new Date(date), "dd.MM.yyyy HH:mm", { locale: de });
  };

  // Status-Badge
  const StatusBadge = ({ status }: { status: string }) => {
    const statusMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Ausstehend", variant: "secondary" },
      in_progress: { label: "In Bearbeitung", variant: "secondary" },
      completed: { label: "Abgeschlossen", variant: "outline" },
      cancelled: { label: "Storniert", variant: "destructive" },
    };
    
    const statusInfo = statusMap[status?.toLowerCase()] || { label: status, variant: "default" };
    
    return (
      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
    );
  };

  // Filter zurücksetzen
  const resetFilters = () => {
    setSearchTerm("");
    setFilterStatus(null);
    setFilterMachine(null);
    setDateRange({
      from: undefined,
      to: undefined,
    });
    setCurrentPage(1);
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auffüllungen</CardTitle>
          <CardDescription>Auffüllungen von Automaten aus diesem Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Auffüllungen..."
                  className="pl-8"
                  disabled
                />
              </div>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" /> Neue Auffüllung
              </Button>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Automat</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Produkte</TableHead>
                    <TableHead>Durchgeführt von</TableHead>
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
                        <Skeleton className="h-5 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
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
          <CardTitle>Auffüllungen konnten nicht geladen werden</CardTitle>
          <CardDescription>
            Beim Abrufen der Auffüllungsdaten ist ein Fehler aufgetreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
            <p className="mb-4 text-muted-foreground">{(error as Error)?.message || "Ein unbekannter Fehler ist aufgetreten"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'refills'] })}
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
          <CardTitle>Auffüllungen</CardTitle>
          <CardDescription>Auffüllungen von Automaten aus diesem Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2 mb-6">
            <div className="relative w-[250px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Auffüllungen..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <Select
              value={filterStatus || ""}
              onValueChange={(value) => setFilterStatus(value || null)}
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
            
            {machines && machines.length > 0 && (
              <Select
                value={filterMachine || ""}
                onValueChange={(value) => setFilterMachine(value || null)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Automat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Automaten</SelectItem>
                  {machines.map((machine: any) => (
                    <SelectItem key={machine.machineId} value={machine.machineId.toString()}>
                      {machine.machineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <Calendar className="mr-2 h-4 w-4" /> 
                  {dateRange.from || dateRange.to ? (
                    <span>
                      {dateRange.from ? format(dateRange.from, "dd.MM.yy") : "..."}
                      {" - "}
                      {dateRange.to ? format(dateRange.to, "dd.MM.yy") : "..."}
                    </span>
                  ) : "Zeitraum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{
                    from: dateRange.from,
                    to: dateRange.to,
                  }}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
                <div className="border-t p-3 flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDateRange({ from: undefined, to: undefined })}
                  >
                    Zurücksetzen
                  </Button>
                  <Button size="sm">Anwenden</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Truck className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Auffüllungen gefunden</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {(searchTerm || filterStatus || filterMachine || dateRange.from || dateRange.to)
                ? "Versuchen Sie andere Filtereinstellungen oder erfassen Sie neue Auffüllungen."
                : "Es wurden noch keine Auffüllungen aus diesem Lager erfasst. Erfassen Sie Auffüllungen, um Automaten aus dem Lagerbestand zu befüllen."}
            </p>
            
            {(searchTerm || filterStatus || filterMachine || dateRange.from || dateRange.to) && (
              <Button 
                variant="outline" 
                className="mr-2"
                onClick={resetFilters}
              >
                Filter zurücksetzen
              </Button>
            )}
            
            <Link href={`/warehouse3/${warehouseId}/refills/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Auffüllung erstellen
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Seitenzahlen berechnen
  const totalPages = Math.ceil(data.total / itemsPerPage);

  return (
    <>
      <Card>
      <CardHeader>
        <CardTitle>Auffüllungen</CardTitle>
        <CardDescription>
          Auffüllungen von Automaten aus diesem Lager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <div className="relative w-[230px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Auffüllungen..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Select
                value={filterStatus || ""}
                onValueChange={(value) => setFilterStatus(value || null)}
              >
                <SelectTrigger className="w-[160px]">
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
              
              {machines && machines.length > 0 && (
                <Select
                  value={filterMachine || ""}
                  onValueChange={(value) => setFilterMachine(value || null)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Automat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alle Automaten</SelectItem>
                    {machines.map((machine: any) => (
                      <SelectItem key={machine.machineId} value={machine.machineId.toString()}>
                        {machine.machineName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Calendar className="mr-2 h-4 w-4" /> 
                    {dateRange.from || dateRange.to ? (
                      <span>
                        {dateRange.from ? format(dateRange.from, "dd.MM.yy") : "..."}
                        {" - "}
                        {dateRange.to ? format(dateRange.to, "dd.MM.yy") : "..."}
                      </span>
                    ) : "Zeitraum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{
                      from: dateRange.from,
                      to: dateRange.to,
                    }}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                  <div className="border-t p-3 flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDateRange({ from: undefined, to: undefined })}
                    >
                      Zurücksetzen
                    </Button>
                    <Button size="sm">Anwenden</Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              {(searchTerm || filterStatus || filterMachine || dateRange.from || dateRange.to) && (
                <Button 
                  variant="ghost" 
                  onClick={resetFilters}
                >
                  Filter zurücksetzen
                </Button>
              )}
            </div>
            
            <Link href={`/warehouse3/${warehouseId}/refills/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Neue Auffüllung
              </Button>
            </Link>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Datum</TableHead>
                  <TableHead>Automat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Produkte</TableHead>
                  <TableHead>Durchgeführt von</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((refill: any) => (
                  <TableRow key={refill.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatRefillDate(refill.refillDate || refill.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center">
                        <PanelTop className="h-4 w-4 mr-1.5 text-muted-foreground" />
                        {refill.machineName || `Automat #${refill.machineId}`}
                      </div>
                      {refill.location && (
                        <div className="text-xs text-muted-foreground">{refill.location}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={refill.status || "pending"} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {refill.itemCount || 0}
                    </TableCell>
                    <TableCell>
                      {refill.performedBy ? (
                        refill.performedByName || `#${refill.performedBy}`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
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
                            <Link href={`/warehouse3/${warehouseId}/refills/${refill.id}`}>
                              <Eye className="mr-2 h-4 w-4" /> Details
                            </Link>
                          </DropdownMenuItem>
                          {refill.status === 'pending' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/refills/${refill.id}/complete`}>
                                <FileCheck className="mr-2 h-4 w-4" /> Abschließen
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/refills/${refill.id}/print`}>
                              <Mail className="mr-2 h-4 w-4" /> Drucken
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${refill.machineId}`}>
                              <PanelTop className="mr-2 h-4 w-4" /> Automat anzeigen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/machines/${refill.machineId}/products`}>
                              <ShoppingBag className="mr-2 h-4 w-4" /> Automatprodukte
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {refill.status === 'completed' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/refills/${refill.id}/reverse`}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Rückgängig machen
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {refill.status === 'pending' && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => {
                                setRefillToCancel(refill);
                                setCancelDialogOpen(true);
                              }}
                            >
                              <Clock className="mr-2 h-4 w-4" /> Stornieren
                            </DropdownMenuItem>
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
        <div className="text-sm text-muted-foreground flex items-center">
          <PackageCheck className="h-4 w-4 mr-1.5" /> 
          Auffüllungen reduzieren automatisch den Lagerbestand entsprechend.
        </div>
        <Link href={`/warehouse3/${warehouseId}/refills/report`}>
          <Button variant="outline" size="sm">
            <Mail className="mr-2 h-4 w-4" /> Bericht erstellen
          </Button>
        </Link>
      </CardFooter>
    </Card>

    {/* Cancel Confirmation Dialog */}
    <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Auffüllung stornieren</AlertDialogTitle>
          <AlertDialogDescription>
            Sind Sie sicher, dass Sie die Auffüllung für "{refillToCancel?.machineName}" stornieren möchten?
            <br /><br />
            Diese Aktion kann nicht rückgängig gemacht werden. Die bereits reservierten Produkte werden wieder zum verfügbaren Lagerbestand hinzugefügt.
            {refillToCancel?.items && refillToCancel.items.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-center space-x-2 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Betroffene Produkte: {refillToCancel.items.length} Artikel
                  </span>
                </div>
                <div className="mt-2 text-xs text-amber-700">
                  Alle reservierten Mengen werden zurück ins Lager gebucht.
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (refillToCancel) {
                cancelMutation.mutate(refillToCancel.id);
              }
            }}
            disabled={cancelMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? "Storniere..." : "Auffüllung stornieren"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
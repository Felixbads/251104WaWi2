import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Truck, 
  Search, 
  Plus, 
  Filter, 
  Grid, 
  List, 
  AlertTriangle, 
  ExternalLink,
  Mail,
  Phone,
  Globe,
  ShoppingBag,
  Clipboard,
  Tag,
  Download,
  RefreshCw,
  Info as InfoIcon,
  MapPin,
  CalendarClock,
  X,
  CheckCircle,
  PackageCheck,
  Edit,
  Trash2,
  FileSpreadsheet,
  Upload,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Package,
  Calendar,
  BarChart3,
  Users,
  Eye
} from "lucide-react";
import { ExportImportButtons } from "@/components/ExportImportButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogClose 
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier, Supplier } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

// Types for enhanced supplier data
interface SupplierAnalytics {
  productsCount: number;
  currentYearSales: number;
  currentYearRevenue: number;
  lastYearSales: number;
  lastYearRevenue: number;
  salesGrowth: number;
  revenueGrowth: number;
  recentSales: number;
  recentRevenue: number;
  activeProducts: number;
  lowStockCount: number;
  topProducts: Array<{
    product_name: string;
    sales_count: number;
    revenue: number;
  }>;
}

interface EnhancedSupplier extends Supplier {
  analytics?: SupplierAnalytics;
}

// Filter and sort types
interface FilterState {
  status: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  stockLevel: string | null;
  salesRange: string | null;
}

const defaultFilters: FilterState = {
  status: null,
  sortBy: 'currentYearRevenue',
  sortOrder: 'desc',
  stockLevel: null,
  salesRange: null,
};

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// Formular Schema für Lieferanten
const supplierFormSchema = z.object({
  name: z.string().min(1, "Lieferantenname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url("Ungültige Website-URL").optional().or(z.literal("")),
  contactPerson: z.string().optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
});

// Filter Dialog Component
interface FilterDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: FilterState) => void;
  currentFilters: FilterState;
}

const FilterDialog = ({ isOpen, onOpenChange, onApplyFilters, currentFilters }: FilterDialogProps) => {
  const [filters, setFilters] = useState<FilterState>(currentFilters);

  const handleApply = () => {
    onApplyFilters(filters);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Filter und Sortierung</DialogTitle>
          <DialogDescription>
            Filtern Sie die Lieferantenliste nach Ihren Kriterien
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select 
              value={filters.status || "all"} 
              onValueChange={(value) => setFilters({...filters, status: value === "all" ? null : value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stock Level Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Lagerstatus</label>
            <Select 
              value={filters.stockLevel || "all"} 
              onValueChange={(value) => setFilters({...filters, stockLevel: value === "all" ? null : value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle Lagerbestände" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lagerbestände</SelectItem>
                <SelectItem value="low">Niedrige Bestände</SelectItem>
                <SelectItem value="normal">Normale Bestände</SelectItem>
                <SelectItem value="high">Hohe Bestände</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sales Range Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Umsatzbereich</label>
            <Select 
              value={filters.salesRange || "all"} 
              onValueChange={(value) => setFilters({...filters, salesRange: value === "all" ? null : value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle Umsätze" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Umsätze</SelectItem>
                <SelectItem value="high">Hoher Umsatz (&gt;10k€)</SelectItem>
                <SelectItem value="medium">Mittlerer Umsatz (1k-10k€)</SelectItem>
                <SelectItem value="low">Niedriger Umsatz (&lt;1k€)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Sortierung</label>
            <div className="flex gap-2">
              <Select 
                value={filters.sortBy} 
                onValueChange={(value) => setFilters({...filters, sortBy: value})}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="currentYearRevenue">Jahresumsatz</SelectItem>
                  <SelectItem value="currentYearSales">Verkäufe</SelectItem>
                  <SelectItem value="productsCount">Produktanzahl</SelectItem>
                  <SelectItem value="lowStockCount">Niedrige Bestände</SelectItem>
                </SelectContent>
              </Select>
              
              <Select 
                value={filters.sortOrder} 
                onValueChange={(value) => setFilters({...filters, sortOrder: value as 'asc' | 'desc'})}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Aufsteigend</SelectItem>
                  <SelectItem value="desc">Absteigend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => setFilters(defaultFilters)}
          >
            Zurücksetzen
          </Button>
          <Button onClick={handleApply}>
            Anwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Supplier Form Dialog Component
interface SupplierFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier;
  mode: 'create' | 'edit';
}

const SupplierFormDialog = ({ isOpen, onOpenChange, supplier, mode }: SupplierFormDialogProps) => {
  const queryClient = useQueryClient();
  
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name || "",
      email: supplier?.email || "",
      phone: supplier?.phone || "",
      address: supplier?.address || "",
      website: supplier?.website || "",
      contactPerson: supplier?.contactPerson || "",
      notes: supplier?.notes || "",
      paymentTerms: supplier?.paymentTerms || "",
      deliveryTerms: supplier?.deliveryTerms || "",
      status: supplier?.status as "active" | "inactive" | "pending" || "active",
    },
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-analytics'] });
      toast({ description: "Lieferant erfolgreich erstellt!" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        variant: "destructive", 
        description: `Fehler beim Erstellen: ${error.message}` 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-analytics'] });
      toast({ description: "Lieferant erfolgreich aktualisiert!" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ 
        variant: "destructive", 
        description: `Fehler beim Aktualisieren: ${error.message}` 
      });
    },
  });

  const onSubmit = (values: SupplierFormValues) => {
    if (mode === 'create') {
      createMutation.mutate(values);
    } else if (supplier) {
      updateMutation.mutate({ id: supplier.id, data: values });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Neuen Lieferanten erstellen' : 'Lieferant bearbeiten'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? 'Fügen Sie einen neuen Lieferanten zum System hinzu.' 
              : 'Bearbeiten Sie die Lieferanteninformationen.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferantenname *</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. ABC Großhandel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ansprechpartner</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Max Mustermann" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="kontakt@lieferant.de" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input placeholder="+49 123 456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Straße, PLZ Ort, Land" 
                      {...field} 
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://www.lieferant.de" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zahlungsbedingungen</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. 30 Tage netto" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="deliveryTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferbedingungen</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. 3-5 Werktage" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Status auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="inactive">Inaktiv</SelectItem>
                      <SelectItem value="pending">Ausstehend</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Zusätzliche Informationen zum Lieferanten..." 
                      {...field} 
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {mode === 'create' ? 'Erstellen' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// Delete Dialog Component
interface DeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

const DeleteDialog = ({ isOpen, onOpenChange, supplier }: DeleteDialogProps) => {
  const queryClient = useQueryClient();
  
  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-analytics'] });
      toast({ description: "Lieferant erfolgreich gelöscht!" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ 
        variant: "destructive", 
        description: `Fehler beim Löschen: ${error.message}` 
      });
    },
  });

  const handleDelete = () => {
    if (supplier) {
      deleteMutation.mutate(supplier.id);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lieferant löschen</DialogTitle>
          <DialogDescription>
            Sind Sie sicher, dass Sie den Lieferanten "{supplier?.name}" löschen möchten? 
            Diese Aktion kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Supplier Card Component
interface SupplierCardProps {
  supplier: EnhancedSupplier; 
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}

const SupplierCard = ({ supplier, onEdit, onDelete }: SupplierCardProps) => {
  const analytics = supplier.analytics;
  
  // Status-Badge Farbe
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'inactive': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Growth indicator
  const getGrowthIndicator = (growth: number) => {
    if (growth > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (growth < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{supplier.name}</CardTitle>
              {supplier.contactPerson && (
                <CardDescription className="text-sm text-gray-600">
                  {supplier.contactPerson}
                </CardDescription>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${getStatusColor(supplier.status)}`}>
              {supplier.status === 'active' ? 'Aktiv' : 
               supplier.status === 'inactive' ? 'Inaktiv' : 'Ausstehend'}
            </Badge>
            
            {analytics && analytics.lowStockCount > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {analytics.lowStockCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Niedrige Bestände</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contact Information */}
        <div className="grid grid-cols-1 gap-2 text-sm">
          {supplier.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4" />
              <span className="truncate">{supplier.email}</span>
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4" />
              <span>{supplier.phone}</span>
            </div>
          )}
          {supplier.website && (
            <div className="flex items-center gap-2 text-gray-600">
              <Globe className="h-4 w-4" />
              <a 
                href={supplier.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
              >
                Website
              </a>
            </div>
          )}
        </div>

        {/* Analytics Section */}
        {analytics && (
          <>
            <Separator />
            <div className="space-y-3">
              {/* Revenue and Sales */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Jahresumsatz</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-green-600">
                      €{analytics.currentYearRevenue.toLocaleString()}
                    </span>
                    {getGrowthIndicator(analytics.revenueGrowth)}
                  </div>
                  {analytics.revenueGrowth !== 0 && (
                    <div className="text-xs text-gray-500">
                      {analytics.revenueGrowth > 0 ? '+' : ''}{analytics.revenueGrowth.toFixed(1)}% zum Vorjahr
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Verkäufe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-blue-600">
                      {analytics.currentYearSales.toLocaleString()}
                    </span>
                    {getGrowthIndicator(analytics.salesGrowth)}
                  </div>
                  {analytics.salesGrowth !== 0 && (
                    <div className="text-xs text-gray-500">
                      {analytics.salesGrowth > 0 ? '+' : ''}{analytics.salesGrowth.toFixed(1)}% zum Vorjahr
                    </div>
                  )}
                </div>
              </div>

              {/* Products and Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium">Produkte:</span>
                  <span className="font-bold">{analytics.productsCount}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium">Aktiv:</span>
                  <span className="font-bold">{analytics.activeProducts}</span>
                </div>
              </div>

              {/* Top Product */}
              {analytics.topProducts && analytics.topProducts.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Tag className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">Top-Produkt:</span>
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {analytics.topProducts[0].product_name} 
                    ({analytics.topProducts[0].sales_count} Verkäufe)
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Address */}
        {supplier.address && (
          <>
            <Separator />
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="text-xs leading-relaxed">{supplier.address}</span>
            </div>
          </>
        )}

        {/* Payment Terms */}
        {(supplier.paymentTerms || supplier.deliveryTerms) && (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-2 text-sm">
              {supplier.paymentTerms && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">Zahlung: {supplier.paymentTerms}</span>
                </div>
              )}
              {supplier.deliveryTerms && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Truck className="h-4 w-4" />
                  <span className="text-xs">Lieferung: {supplier.deliveryTerms}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="pt-4 border-t bg-gray-50/50">
        <div className="flex justify-between items-center w-full">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onEdit(supplier)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Bearbeiten
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onDelete(supplier)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Löschen
            </Button>
          </div>
          
          <div className="flex gap-1">
            {supplier.email && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`mailto:${supplier.email}`}>
                      <Mail className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>E-Mail senden</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            {supplier.website && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={supplier.website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Website öffnen</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

// Excel Import Dialog Component
interface ExcelImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExcelImportDialog = ({ isOpen, onOpenChange }: ExcelImportDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        variant: "destructive",
        description: "Bitte wählen Sie eine Excel-Datei (.xlsx oder .xls) aus."
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch('/api/suppliers/import', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const result = await response.json();
        toast({
          description: `Erfolgreich ${result.imported} Lieferanten importiert!`
        });
        queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
        onOpenChange(false);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Import fehlgeschlagen');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: `Import-Fehler: ${error.message}`
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lieferanten aus Excel importieren</DialogTitle>
          <DialogDescription>
            Laden Sie eine Excel-Datei hoch, um mehrere Lieferanten gleichzeitig zu importieren.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drag & Drop Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-sm text-gray-600 mb-2">
              Datei hier ablegen oder klicken zum Auswählen
            </p>
            <p className="text-xs text-gray-500">
              Unterstützte Formate: .xlsx, .xls
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Datei auswählen
            </Button>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Upload läuft...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Excel Template Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Excel-Vorlage</h4>
            <p className="text-sm text-blue-800 mb-2">
              Die Excel-Datei sollte folgende Spalten enthalten:
            </p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Name (Pflichtfeld)</li>
              <li>• E-Mail</li>
              <li>• Telefon</li>
              <li>• Adresse</li>
              <li>• Website</li>
              <li>• Ansprechpartner</li>
              <li>• Status (active/inactive/pending)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main Suppliers Component
export default function Suppliers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [_, setLocation] = useLocation();

  // Queries
  const suppliersQuery = useQuery({
    queryKey: ['/api/suppliers'],
    queryFn: getSuppliers,
  });

  const analyticsQuery = useQuery({
    queryKey: ['/api/supplier-analytics'],
  });

  // Enhanced suppliers with analytics
  const suppliersWithAnalytics = useMemo(() => {
    if (!suppliersQuery.data || !analyticsQuery.data) return [];
    
    const analyticsMap = new Map();
    analyticsQuery.data.forEach((analytics: any) => {
      analyticsMap.set(analytics.supplierId, analytics);
    });

    return suppliersQuery.data.map((supplier: Supplier) => ({
      ...supplier,
      analytics: analyticsMap.get(supplier.id),
    }));
  }, [suppliersQuery.data, analyticsQuery.data]);

  // Filter and sort suppliers
  const filteredAndSortedSuppliers = useMemo(() => {
    if (!suppliersWithAnalytics) return [];

    let filtered = suppliersWithAnalytics.filter((supplier: EnhancedSupplier) => {
      // Search filter
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const matchesSearch = 
          supplier.name.toLowerCase().includes(search) ||
          (supplier.email && supplier.email.toLowerCase().includes(search)) ||
          (supplier.contactPerson && supplier.contactPerson.toLowerCase().includes(search));
        
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status && supplier.status !== filters.status) {
        return false;
      }

      // Stock level filter
      if (filters.stockLevel && supplier.analytics) {
        const { lowStockCount } = supplier.analytics;
        switch (filters.stockLevel) {
          case 'low':
            if (lowStockCount === 0) return false;
            break;
          case 'normal':
            if (lowStockCount !== 0) return false;
            break;
          case 'high':
            // Could implement based on inventory levels
            break;
        }
      }

      // Sales range filter
      if (filters.salesRange && supplier.analytics) {
        const { currentYearRevenue } = supplier.analytics;
        switch (filters.salesRange) {
          case 'high':
            if (currentYearRevenue <= 10000) return false;
            break;
          case 'medium':
            if (currentYearRevenue <= 1000 || currentYearRevenue > 10000) return false;
            break;
          case 'low':
            if (currentYearRevenue > 1000) return false;
            break;
        }
      }

      return true;
    });

    // Sort suppliers
    filtered.sort((a: EnhancedSupplier, b: EnhancedSupplier) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'currentYearRevenue':
          aValue = a.analytics?.currentYearRevenue || 0;
          bValue = b.analytics?.currentYearRevenue || 0;
          break;
        case 'currentYearSales':
          aValue = a.analytics?.currentYearSales || 0;
          bValue = b.analytics?.currentYearSales || 0;
          break;
        case 'productsCount':
          aValue = a.analytics?.productsCount || 0;
          bValue = b.analytics?.productsCount || 0;
          break;
        case 'lowStockCount':
          aValue = a.analytics?.lowStockCount || 0;
          bValue = b.analytics?.lowStockCount || 0;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return filters.sortOrder === 'asc' ? comparison : -comparison;
      } else {
        const comparison = aValue - bValue;
        return filters.sortOrder === 'asc' ? comparison : -comparison;
      }
    });

    return filtered;
  }, [suppliersWithAnalytics, searchQuery, filters]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (!filteredAndSortedSuppliers.length) return { totalRevenue: 0, totalSales: 0, lowStockSuppliers: 0, activeSuppliers: 0, avgProducts: 0 };
    
    const suppliers = filteredAndSortedSuppliers;
    const totalRevenue = suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.analytics?.currentYearRevenue || 0), 0);
    const totalSales = suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.analytics?.currentYearSales || 0), 0);
    const lowStockSuppliers = suppliers.filter((s: EnhancedSupplier) => (s.analytics?.lowStockCount || 0) > 0).length;
    const activeSuppliers = suppliers.filter((s: EnhancedSupplier) => s.status === 'active').length;
    const avgProducts = suppliers.length > 0 ? 
      suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.analytics?.productsCount || 0), 0) / suppliers.length : 0;

    return { totalRevenue, totalSales, lowStockSuppliers, activeSuppliers, avgProducts };
  }, [filteredAndSortedSuppliers]);

  // Handlers
  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormMode('edit');
    setIsFormDialogOpen(true);
  };

  const handleDeleteSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDeleteDialogOpen(true);
  };

  const handleApplyFilters = (filters: FilterState) => {
    setFilters(filters);
  };

  // Loading state
  if (suppliersQuery.isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }, (_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lieferanten</h1>
            <p className="text-gray-600 mt-1">
              Verwalten Sie Ihre Lieferanten und deren Leistungsdaten
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ExportImportButtons 
              onExport={() => console.log('Export')}
              onImport={() => setIsImportDialogOpen(true)}
              entityName="Lieferanten"
            />
            <Button onClick={() => {
              setFormMode('create');
              setSelectedSupplier(null);
              setIsFormDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Lieferant
            </Button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Gesamtumsatz</p>
                  <p className="text-2xl font-bold text-green-600">
                    €{summaryMetrics.totalRevenue.toLocaleString()}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Verkäufe</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {summaryMetrics.totalSales.toLocaleString()}
                  </p>
                </div>
                <ShoppingBag className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Aktive Lieferanten</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {summaryMetrics.activeSuppliers}
                  </p>
                </div>
                <Users className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Niedrige Bestände</p>
                  <p className="text-2xl font-bold text-red-600">
                    {summaryMetrics.lowStockSuppliers}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ø Produkte</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {summaryMetrics.avgProducts.toFixed(0)}
                  </p>
                </div>
                <Package className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Lieferanten suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsFilterDialogOpen(true)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="grid">
                  <Grid className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Button variant="outline" size="sm" onClick={() => {
              suppliersQuery.refetch();
              analyticsQuery.refetch();
            }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {filteredAndSortedSuppliers.length} von {suppliersWithAnalytics.length} Lieferanten
          </span>
          {(filters.status || filters.stockLevel || filters.salesRange) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFilters(defaultFilters)}
            >
              <X className="h-4 w-4 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>

        {/* Suppliers Grid/List */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedSuppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                onEdit={handleEditSupplier}
                onDelete={handleDeleteSupplier}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedSuppliers.map((supplier) => (
              <Card key={supplier.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Truck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{supplier.name}</h3>
                        <p className="text-sm text-gray-600">{supplier.contactPerson}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {supplier.analytics && (
                        <div className="text-right">
                          <p className="text-sm font-medium">€{supplier.analytics.currentYearRevenue.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{supplier.analytics.currentYearSales} Verkäufe</p>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditSupplier(supplier)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteSupplier(supplier)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {filteredAndSortedSuppliers.length === 0 && !suppliersQuery.isLoading && (
          <div className="text-center py-12">
            <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Keine Lieferanten gefunden
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || filters.status || filters.stockLevel || filters.salesRange
                ? "Versuchen Sie, Ihre Suchkriterien anzupassen."
                : "Erstellen Sie Ihren ersten Lieferanten, um loszulegen."
              }
            </p>
            {!searchQuery && !filters.status && !filters.stockLevel && !filters.salesRange && (
              <Button onClick={() => {
                setFormMode('create');
                setSelectedSupplier(null);
                setIsFormDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Ersten Lieferanten erstellen
              </Button>
            )}
          </div>
        )}

        {/* Dialogs */}
        <FilterDialog
          isOpen={isFilterDialogOpen}
          onOpenChange={setIsFilterDialogOpen}
          onApplyFilters={handleApplyFilters}
          currentFilters={filters}
        />

        <SupplierFormDialog
          isOpen={isFormDialogOpen}
          onOpenChange={setIsFormDialogOpen}
          supplier={selectedSupplier}
          mode={formMode}
        />

        <DeleteDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          supplier={selectedSupplier}
        />

        <ExcelImportDialog
          isOpen={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
        />
      </div>
    </TooltipProvider>
  );
}
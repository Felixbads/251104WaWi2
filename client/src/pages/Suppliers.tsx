import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  MapPin,
  CalendarClock,
  X,
  CheckCircle,
  PackageCheck,
  Edit,
  Trash2,
  FileSpreadsheet,
  Upload
} from "lucide-react";
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

// Filter Dialog Komponente
interface FilterDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: FilterState) => void;
  currentFilters: FilterState;
}

// Filter-Status
interface FilterState {
  status: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// Standard Filter-Status
const defaultFilters: FilterState = {
  status: null,
  sortBy: 'name',
  sortOrder: 'asc',
};

// Formular Schema für Lieferanten
const supplierFormSchema = z.object({
  name: z.string().min(1, "Lieferantenname ist erforderlich"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
  website: z.string().url("Ungültige Website-URL").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("Deutschland"),
  status: z.string().default("active"),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  minimumOrderValue: z.number().optional().or(z.literal("").transform(() => undefined)),
  deliveryDays: z.string().optional(),
  taxId: z.string().optional(),
  accountNumber: z.string().optional(),
  bankDetails: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// Filter Dialog Komponente
const FilterDialog = ({ isOpen, onOpenChange, onApplyFilters, currentFilters }: FilterDialogProps) => {
  const [filters, setFilters] = useState<FilterState>(currentFilters);

  const handleStatusChange = (value: string) => {
    setFilters(prev => ({
      ...prev,
      status: value === 'alle' ? null : value,
    }));
  };

  const handleSortByChange = (value: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: value,
    }));
  };

  const handleSortOrderChange = (value: 'asc' | 'desc') => {
    setFilters(prev => ({
      ...prev,
      sortOrder: value,
    }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  const applyFilters = () => {
    onApplyFilters(filters);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Filter und Sortierung</DialogTitle>
          <DialogDescription>
            Filtern und sortieren Sie die Lieferantenliste nach verschiedenen Kriterien.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={filters.status || 'alle'} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder="Status wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Sortieren nach</Label>
            <Select value={filters.sortBy} onValueChange={handleSortByChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sortierkriterium wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="city">Stadt</SelectItem>
                <SelectItem value="updatedAt">Letzte Aktualisierung</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Sortierreihenfolge</Label>
            <Select value={filters.sortOrder} onValueChange={handleSortOrderChange as (value: string) => void}>
              <SelectTrigger>
                <SelectValue placeholder="Reihenfolge wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Aufsteigend</SelectItem>
                <SelectItem value="desc">Absteigend</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetFilters}>Zurücksetzen</Button>
          <Button onClick={applyFilters}>Filter anwenden</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Form Label Komponente
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    {children}
  </span>
);

// Dialog zum Hinzufügen/Bearbeiten von Lieferanten
interface SupplierFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier;
  mode: 'create' | 'edit';
}

const SupplierFormDialog = ({ isOpen, onOpenChange, supplier, mode }: SupplierFormDialogProps) => {
  // Form mit Validierung
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: supplier ? {
      ...supplier,
      minimumOrderValue: supplier.minimumOrderValue || undefined,
    } : {
      name: '',
      status: 'active',
      country: 'Deutschland'
    }
  });
  
  // Mutation zum Erstellen eines neuen Lieferanten
  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Lieferant wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Hinzufügen des Lieferanten: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation zum Aktualisieren eines Lieferanten
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SupplierFormValues> }) => 
      updateSupplier(id, data),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Lieferant wurde erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Aktualisieren des Lieferanten: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  const onSubmit = (values: SupplierFormValues) => {
    if (mode === 'create') {
      createMutation.mutate(values);
    } else if (mode === 'edit' && supplier) {
      updateMutation.mutate({ id: supplier.id, data: values });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Neuen Lieferanten anlegen' : 'Lieferanten bearbeiten'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? 'Fügen Sie einen neuen Lieferanten mit allen relevanten Informationen hinzu.' 
              : 'Bearbeiten Sie die Informationen des ausgewählten Lieferanten.'}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hauptdaten */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Kontaktdaten */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" value={field.value || ''} />
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
                      <Input {...field} value={field.value || ''} />
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
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Adresse */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stadt</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Land</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Lieferbedingungen */}
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zahlungsbedingungen</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
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
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="minimumOrderValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mindestbestellwert (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        {...field} 
                        value={field.value ?? ''} 
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          field.onChange(value);
                        }} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="deliveryDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Liefertage</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='z.B. "Mo, Mi, Fr"' value={field.value || ''} />
                    </FormControl>
                    <FormDescription>Kommagetrennt, z.B. "Mo, Mi, Fr"</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Buchhalterische Daten */}
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Steuer-ID</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kontonummer</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="bankDetails"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Bankverbindung</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Notizen */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Notizen</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Abbrechen
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <span className="flex items-center">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </span>
                ) : (
                  mode === 'create' ? 'Lieferanten anlegen' : 'Änderungen speichern'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// Dialog zum Löschen eines Lieferanten
interface DeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

const DeleteDialog = ({ isOpen, onOpenChange, supplier }: DeleteDialogProps) => {
  // Mutation zum Löschen eines Lieferanten
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSupplier(id),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Lieferant wurde erfolgreich gelöscht.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Löschen des Lieferanten: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  const handleDelete = () => {
    if (supplier) {
      deleteMutation.mutate(supplier.id);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lieferanten löschen</DialogTitle>
          <DialogDescription>
            Sind Sie sicher, dass Sie den Lieferanten "{supplier?.name}" löschen möchten?
            Diese Aktion kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        
        {supplier?.productsCount && supplier.productsCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-md p-3 text-yellow-800 text-sm">
            <AlertTriangle className="h-4 w-4 inline-block mr-2" />
            Diesem Lieferanten sind {supplier.productsCount} Produkte zugeordnet. 
            Bitte entfernen Sie zuerst die Zuordnung der Produkte, bevor Sie den Lieferanten löschen.
          </div>
        )}
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Abbrechen
          </Button>
          <Button 
            type="button" 
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending || (supplier?.productsCount && supplier.productsCount > 0)}
          >
            {deleteMutation.isPending ? (
              <span className="flex items-center">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Löschen...
              </span>
            ) : 'Lieferanten löschen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Lieferantenkarte Komponente
const SupplierCard = ({ 
  supplier, 
  onEdit, 
  onDelete 
}: { 
  supplier: Supplier; 
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-medium truncate">{supplier.name}</CardTitle>
          <StatusBadge status={supplier.status} />
        </div>
        {supplier.city && (
          <CardDescription className="flex items-center text-sm text-gray-500">
            <MapPin className="h-3.5 w-3.5 mr-1" />
            {supplier.city}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        <div className="grid grid-cols-1 gap-2">
          {/* Kontaktdaten */}
          <div className="flex flex-col space-y-1.5">
            {supplier.contactPerson && (
              <div className="text-sm flex items-center">
                <span className="font-medium mr-1">Ansprechpartner:</span> {supplier.contactPerson}
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              {supplier.phone && (
                <a 
                  href={`tel:${supplier.phone}`} 
                  className="inline-flex items-center text-xs text-gray-500 hover:text-primary"
                >
                  <Phone className="h-3 w-3 mr-1" />
                  {supplier.phone}
                </a>
              )}
              
              {supplier.email && (
                <a 
                  href={`mailto:${supplier.email}`} 
                  className="inline-flex items-center text-xs text-gray-500 hover:text-primary"
                >
                  <Mail className="h-3 w-3 mr-1" />
                  {supplier.email}
                </a>
              )}
              
              {supplier.website && (
                <a 
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs text-gray-500 hover:text-primary"
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Website
                </a>
              )}
            </div>
          </div>
          
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div className="flex flex-col">
              <div className="text-xs text-gray-500 flex items-center">
                <ShoppingBag className="h-3 w-3 mr-1" />
                Produkte
              </div>
              <span className="font-medium">{supplier.productsCount || 0}</span>
            </div>
            
            <div className="flex flex-col">
              <div className="text-xs text-gray-500 flex items-center">
                <Clipboard className="h-3 w-3 mr-1" />
                Offene Bestellungen
              </div>
              <span className="font-medium">{supplier.openOrdersCount || 0}</span>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-2 flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1 mr-1"
          onClick={() => onEdit(supplier)}
        >
          <Edit className="h-3.5 w-3.5 mr-1.5" />
          Bearbeiten
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          className="flex-none text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(supplier)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
};

// Lieferantenliste Komponente
const SupplierListItem = ({ 
  supplier, 
  onEdit, 
  onDelete 
}: { 
  supplier: Supplier; 
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}) => {
  return (
    <div className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50">
      <div className="flex-grow mr-4">
        <div className="flex items-center mb-1">
          <h3 className="font-medium mr-2">{supplier.name}</h3>
          <StatusBadge status={supplier.status} />
        </div>
        
        <div className="flex flex-wrap gap-x-4 text-sm text-gray-600">
          {supplier.city && (
            <span className="flex items-center">
              <MapPin className="h-3.5 w-3.5 mr-1" />
              {supplier.city}
            </span>
          )}
          
          {supplier.contactPerson && (
            <span>{supplier.contactPerson}</span>
          )}
          
          {supplier.phone && (
            <a 
              href={`tel:${supplier.phone}`} 
              className="flex items-center text-gray-500 hover:text-primary"
            >
              <Phone className="h-3.5 w-3.5 mr-1" />
              {supplier.phone}
            </a>
          )}
          
          {supplier.email && (
            <a 
              href={`mailto:${supplier.email}`} 
              className="flex items-center text-gray-500 hover:text-primary"
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              {supplier.email}
            </a>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-6 text-sm">
        <div className="text-center">
          <p className="text-xs text-gray-500">Produkte</p>
          <p className="font-medium">{supplier.productsCount || 0}</p>
        </div>
        
        <div className="text-center">
          <p className="text-xs text-gray-500">Bestellungen</p>
          <p className="font-medium">{supplier.openOrdersCount || 0}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onEdit(supplier)}
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
          
          <Button 
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(supplier)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Status-Badge-Komponente
const StatusBadge = ({ status }: { status: string }) => {
  let variant: 
    | "default"
    | "outline"
    | "secondary"
    | "destructive" = "default";
  let className = "";

  switch (status) {
    case "active":
      variant = "default";
      className = "bg-green-500 hover:bg-green-700";
      break;
    case "inactive":
      variant = "secondary";
      break;
    default:
      variant = "outline";
  }

  return (
    <Badge variant={variant} className={`${className}`}>
      {status === "active" ? "Aktiv" : 
       status === "inactive" ? "Inaktiv" : status}
    </Badge>
  );
};

// SupplierGridSkeleton für Lade-Ansicht
const SupplierGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-5/6" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Skeleton className="h-3 w-3/4 mb-1" />
                <Skeleton className="h-4 w-1/3" />
              </div>
              <div>
                <Skeleton className="h-3 w-3/4 mb-1" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Skeleton className="h-9 w-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

// SupplierListSkeleton für Lade-Ansicht
const SupplierListSkeleton = () => {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="p-3 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-5 w-8 mx-auto" />
              </div>
              <div className="text-center">
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-5 w-8 mx-auto" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-9" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Hauptseite für Lieferanten
// Excel Import Dialog Component
interface ExcelImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExcelImportDialog = ({ isOpen, onOpenChange }: ExcelImportDialogProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [importStats, setImportStats] = useState<{
    total: number;
    added: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsUploading(true);
      setUploadStatus('processing');
      
      // Datei einlesen
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          
          // Excel-Datei parsen mit xlsx
          const workbook = await import('xlsx').then(XLSX => XLSX.read(data, { type: 'array' }));
          
          // Erste Tabelle auswählen
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          
          // In JSON konvertieren
          const jsonData = await import('xlsx').then(XLSX => XLSX.utils.sheet_to_json(sheet));
          
          if (!jsonData || jsonData.length === 0) {
            throw new Error("Die Excel-Datei enthält keine gültigen Daten.");
          }
          
          // Importierte Daten verarbeiten und importieren
          const importResults = await processExcelData(jsonData);
          
          setImportStats(importResults);
          setUploadStatus('success');
          
          // Lieferantenliste aktualisieren
          queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
          
          // Erfolgsbenachrichtigung
          toast({
            title: "Import erfolgreich",
            description: `${importResults.added} neue Lieferanten hinzugefügt, ${importResults.updated} aktualisiert.`,
          });
          
        } catch (error) {
          console.error("Fehler beim Verarbeiten der Excel-Datei:", error);
          setUploadStatus('error');
          toast({
            title: "Importfehler",
            description: `Die Excel-Datei konnte nicht verarbeitet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
            variant: "destructive",
          });
        }
      };
      
      reader.onerror = (error) => {
        console.error("Fehler beim Lesen der Datei:", error);
        setUploadStatus('error');
        toast({
          title: "Uploadfehler",
          description: "Die Datei konnte nicht gelesen werden.",
          variant: "destructive",
        });
      };
      
      reader.readAsArrayBuffer(file);
      
    } catch (error) {
      console.error("Fehler beim Dateiupload:", error);
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };
  
  // Verarbeitet die Excel-Daten und importiert sie
  const processExcelData = async (data: any[]): Promise<{
    total: number;
    added: number;
    updated: number;
    skipped: number;
    errors: number;
  }> => {
    const stats = {
      total: data.length,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    
    // Field mapping from Excel to our schema
    for (const row of data) {
      try {
        // Standardisierte Feldnamen
        const supplierData = {
          name: row['Name'] || row['Lieferant'] || row['Firma'] || row['Lieferantenname'] || '',
          contactPerson: row['Ansprechpartner'] || row['Kontaktperson'] || '',
          email: row['E-Mail'] || row['Email'] || row['E-mail'] || '',
          phone: row['Telefon'] || row['Tel'] || row['Telefonnummer'] || '',
          website: row['Website'] || row['Webseite'] || row['URL'] || '',
          address: row['Adresse'] || row['Straße'] || '',
          city: row['Stadt'] || row['Ort'] || '',
          postalCode: row['PLZ'] || row['Postleitzahl'] || '',
          country: row['Land'] || 'Deutschland',
          status: row['Status'] === 'Inaktiv' ? 'inactive' : 'active',
          notes: row['Notizen'] || row['Bemerkungen'] || '',
          paymentTerms: row['Zahlungsbedingungen'] || '',
          deliveryTerms: row['Lieferbedingungen'] || '',
          minimumOrderValue: row['Mindestbestellwert'] || undefined,
          deliveryDays: row['Liefertage'] || '',
          taxId: row['Steuernummer'] || row['USt-ID'] || '',
          accountNumber: row['Kontonummer'] || '',
          bankDetails: row['Bankverbindung'] || ''
        };
        
        // Pflichtfeld prüfen
        if (!supplierData.name) {
          stats.skipped++;
          continue;
        }
        
        // Prüfen, ob Lieferant bereits existiert (nach Namen)
        const existingSuppliers = await getSuppliers({ search: supplierData.name });
        const existingSupplier = existingSuppliers.data?.find((s: any) => 
          s.name.toLowerCase() === supplierData.name.toLowerCase()
        );
        
        if (existingSupplier) {
          // Aktualisieren
          await updateSupplier(existingSupplier.id, supplierData);
          stats.updated++;
        } else {
          // Neu anlegen
          await createSupplier(supplierData);
          stats.added++;
        }
      } catch (error) {
        console.error("Fehler beim Importieren des Lieferanten:", error);
        stats.errors++;
      }
    }
    
    return stats;
  };
  
  const handleResetClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadStatus('idle');
    setImportStats(null);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Lieferanten importieren</DialogTitle>
          <DialogDescription>
            Laden Sie eine Excel-Datei mit Lieferantendaten hoch. Die Datei sollte mindestens eine Spalte "Name" enthalten.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {uploadStatus === 'idle' && (
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-4 flex text-sm leading-6 text-gray-600 dark:text-gray-400">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80 focus-within:outline-none"
                >
                  <span>Excel-Datei hochladen</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    ref={fileInputRef}
                    className="sr-only"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="pl-1">oder hier ablegen</p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Unterstützte Formate: Excel (.xlsx, .xls)
              </p>
            </div>
          )}
          
          {uploadStatus === 'processing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Daten werden verarbeitet...
              </p>
            </div>
          )}
          
          {uploadStatus === 'success' && importStats && (
            <div className="rounded-lg p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                <h3 className="ml-2 text-lg font-medium text-green-800 dark:text-green-300">
                  Import erfolgreich
                </h3>
              </div>
              <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                <p><strong>Gesamt:</strong> {importStats.total} Lieferanten verarbeitet</p>
                <p><strong>Neu hinzugefügt:</strong> {importStats.added} Lieferanten</p>
                <p><strong>Aktualisiert:</strong> {importStats.updated} Lieferanten</p>
                <p><strong>Übersprungen:</strong> {importStats.skipped} Einträge (kein Name)</p>
                <p><strong>Fehler:</strong> {importStats.errors} Einträge</p>
              </div>
            </div>
          )}
          
          {uploadStatus === 'error' && (
            <div className="rounded-lg p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                <h3 className="ml-2 text-lg font-medium text-red-800 dark:text-red-300">
                  Import fehlgeschlagen
                </h3>
              </div>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                Beim Import ist ein Fehler aufgetreten. Bitte überprüfen Sie das Format Ihrer Excel-Datei.
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          {uploadStatus === 'success' || uploadStatus === 'error' ? (
            <Button onClick={handleResetClick}>Zurücksetzen</Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function Suppliers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [currentFilters, setCurrentFilters] = useState<FilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const limit = 20; // Anzahl der Lieferanten pro Seite

  // Daten abrufen
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/suppliers', searchTerm, currentFilters, page, limit],
    queryFn: () => getSuppliers({ 
      limit,
      offset: (page - 1) * limit,
      status: currentFilters.status || undefined,
      search: searchTerm || undefined
    })
  });

  // Funktionen für Dialoge
  const handleCreateSupplier = () => {
    setCreateDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setEditDialogOpen(true);
  };

  const handleDeleteSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setDeleteDialogOpen(true);
  };

  const handleApplyFilters = (filters: FilterState) => {
    setCurrentFilters(filters);
    setPage(1); // Zurück zur ersten Seite bei Filteränderung
  };

  // Aktualisieren der Daten
  const handleRefresh = () => {
    refetch();
  };

  // Simulierte Kopplung von Produkten und Bestellungen (in einer echten App würden diese vom Backend kommen)
  const enhancedSuppliers = data?.data ? data.data.map(supplier => ({
    ...supplier,
    productsCount: Math.floor(Math.random() * 20), // In einer echten App: supplier.productsCount
    openOrdersCount: Math.floor(Math.random() * 3) // In einer echten App: supplier.openOrdersCount
  })) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Truck className="h-6 w-6 mr-2" />
            Lieferanten
          </h1>
          <p className="text-gray-500 mt-1">
            Verwalten und überwachen Sie alle Lieferanten im System
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCreateSupplier} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Neuer Lieferant
          </Button>
          <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Separator />

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Lieferanten suchen..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => setFilterDialogOpen(true)}
          >
            <Filter className="h-4 w-4" />
            Filter
            {(currentFilters.status || currentFilters.sortBy !== 'name' || currentFilters.sortOrder !== 'asc') && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {Object.values(currentFilters).filter(v => v !== null && v !== 'name' && v !== 'asc').length}
              </Badge>
            )}
          </Button>
          
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => setExcelImportOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Excel Import</span>
            <span className="sm:hidden">Import</span>
          </Button>
          
          <Tabs defaultValue={viewMode} onValueChange={(value) => setViewMode(value as "grid" | "list")}>
            <TabsList>
              <TabsTrigger value="grid" className="flex items-center gap-1">
                <Grid className="h-4 w-4" />
                <span className="hidden sm:inline">Kacheln</span>
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Liste</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Aktive Filter anzeigen */}
      {(currentFilters.status || currentFilters.sortBy !== 'name' || currentFilters.sortOrder !== 'asc') && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-gray-500">Aktive Filter:</span>
          
          {currentFilters.status && (
            <Badge variant="outline" className="flex items-center gap-1">
              Status: {currentFilters.status === 'active' ? 'Aktiv' : 'Inaktiv'}
              <button onClick={() => setCurrentFilters({...currentFilters, status: null})}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          
          {(currentFilters.sortBy !== 'name' || currentFilters.sortOrder !== 'asc') && (
            <Badge variant="outline" className="flex items-center gap-1">
              Sortierung: {
                currentFilters.sortBy === 'name' ? 'Name' : 
                currentFilters.sortBy === 'city' ? 'Stadt' : 
                'Letzte Aktualisierung'
              } ({currentFilters.sortOrder === 'asc' ? 'aufsteigend' : 'absteigend'})
              <button onClick={() => setCurrentFilters({...currentFilters, sortBy: 'name', sortOrder: 'asc'})}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => setCurrentFilters(defaultFilters)}
          >
            Alle Filter zurücksetzen
          </Button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-3" />
            <div>
              <h3 className="font-medium">Fehler beim Laden der Lieferanten</h3>
              <p className="text-sm">{error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'}</p>
            </div>
          </div>
          <Button variant="outline" className="mt-3" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Content / Data */}
      {isLoading ? (
        viewMode === 'grid' ? <SupplierGridSkeleton /> : <SupplierListSkeleton />
      ) : !data?.data || data.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium mb-1">Keine Lieferanten gefunden</h3>
          {searchTerm ? (
            <p className="text-gray-500 mb-4">
              Es wurden keine Lieferanten gefunden, die "{searchTerm}" enthalten.
            </p>
          ) : currentFilters.status ? (
            <p className="text-gray-500 mb-4">
              Es wurden keine Lieferanten mit dem Status "{currentFilters.status}" gefunden.
            </p>
          ) : (
            <p className="text-gray-500 mb-4">
              Derzeit sind keine Lieferanten im System vorhanden.
              Fügen Sie Ihren ersten Lieferanten hinzu, um Ihn hier zu sehen.
            </p>
          )}
          <Button onClick={handleCreateSupplier}>
            <Plus className="h-4 w-4 mr-2" />
            Lieferanten hinzufügen
          </Button>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {enhancedSuppliers?.map((supplier) => (
                <SupplierCard 
                  key={supplier.id} 
                  supplier={supplier} 
                  onEdit={handleEditSupplier}
                  onDelete={handleDeleteSupplier}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              {enhancedSuppliers?.map((supplier) => (
                <SupplierListItem 
                  key={supplier.id} 
                  supplier={supplier}
                  onEdit={handleEditSupplier}
                  onDelete={handleDeleteSupplier}
                />
              ))}
            </div>
          )}
          
          {/* Pagination (vereinfacht) */}
          {data && data.meta.pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                Zeige {(page - 1) * limit + 1} bis {Math.min(page * limit, data.meta.total)} von {data.meta.total} Lieferanten
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                >
                  Zurück
                </Button>
                <span className="text-sm">
                  Seite {page} von {data.meta.pages}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === data.meta.pages}
                  onClick={() => setPage(p => Math.min(p + 1, data.meta.pages))}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialoge */}
      <FilterDialog 
        isOpen={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        onApplyFilters={handleApplyFilters}
        currentFilters={currentFilters}
      />
      
      <SupplierFormDialog 
        isOpen={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
      />
      
      <ExcelImportDialog
        isOpen={excelImportOpen}
        onOpenChange={setExcelImportOpen}
      />
      
      {selectedSupplier && (
        <>
          <SupplierFormDialog 
            isOpen={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            supplier={selectedSupplier}
            mode="edit"
          />
          
          <DeleteDialog 
            isOpen={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            supplier={selectedSupplier}
          />
        </>
      )}
    </div>
  );
}
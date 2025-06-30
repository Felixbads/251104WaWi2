import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Phone, Mail, Globe, MapPin, Building, Truck, 
  Calendar, Clock, Edit, Package, FileText, BarChart, AlertTriangle,
  RefreshCw, Download, CheckCircle, X, Trash2, Save, Plus, Check, Search, Euro
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/layout/PageHeader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import SupplierDashboard from "../components/supplier/SupplierDashboard";
import SupplierStatistics from "../components/supplier/SupplierStatistics";
import { 
  updateSupplier, 
  getPurchaseConditionsBySupplier, 
  createPurchaseCondition, 
  updatePurchaseCondition, 
  deletePurchaseCondition, 
  PurchaseCondition,
  getProducts,
  assignProductToSupplier,
  unassignProductFromSupplier
} from "@/lib/api";
import PurchaseConditionForm from "@/components/forms/PurchaseConditionForm";
import SupplierEmailTemplates from "@/components/suppliers/SupplierEmailTemplates";
import { SupplierEditDialog } from "@/components/SupplierEditDialog";
import { apiRequest } from "@/lib/queryClient";

interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  status: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  minimumOrderValue?: number;
  deliveryDays?: string;
  taxId?: string;
  bankDetails?: string;
  productsCount?: number;
  openOrdersCount?: number;
}

// Schema für das Lieferanten-Formular
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
  showPricesInOrders: z.boolean().default(true),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showAddPurchaseCondition, setShowAddPurchaseCondition] = useState(false);
  const [editingPurchaseCondition, setEditingPurchaseCondition] = useState<PurchaseCondition | null>(null);
  const [deletingPurchaseConditionId, setDeletingPurchaseConditionId] = useState<number | null>(null);
  const [showProductAssignmentDialog, setShowProductAssignmentDialog] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  
  // Mutation zum Aktualisieren des Lieferanten
  const updateSupplierMutation = useMutation({
    mutationFn: async (updatedSupplier: Partial<Supplier>) => {
      return apiRequest(`/api/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedSupplier),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      toast({
        title: "Lieferant aktualisiert",
        description: "Der Lieferant wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Aktualisieren des Lieferanten.",
        variant: "destructive",
      });
    },
  });
  
  // Lieferantendaten abfragen
  const { data: supplier, isLoading, error } = useQuery<Supplier>({
    queryKey: [`/api/suppliers/${id}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Produkte des Lieferanten abfragen
  const { data: productsResponse, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products', { supplierId: parseInt(id) }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id
  });
  
  // Produkte extrahieren und als Array zur Verfügung stellen
  const products = productsResponse?.data ? productsResponse.data : [];
  
  // Debugging-Ausgabe (temporär)
  console.log(`Lieferant ${id} - Produkte geladen:`, products?.length, 
    productsResponse);
  
  // Alle verfügbaren Produkte abfragen (für Zuordnung)
  const { data: allProductsResponse, isLoading: isAllProductsLoading } = useQuery({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60, // 1 Minute
    enabled: showProductAssignmentDialog
  });
  
  // Alle Produkte extrahieren
  const allProducts = allProductsResponse?.data 
    ? allProductsResponse.data.map((product: any) => ({
        ...product
      }))
    : [];
  
  // Bestellungen des Lieferanten abfragen
  const { data: ordersResponse, isLoading: isOrdersLoading } = useQuery({
    queryKey: ['/api/orders', { supplierId: parseInt(id) }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id
  });
  
  // Bestellungen extrahieren und als Array zur Verfügung stellen
  const orders = ordersResponse?.data ? ordersResponse.data : [];
  
  // Einkaufsbedingungen des Lieferanten abfragen
  const { 
    data: purchaseConditions, 
    isLoading: isPurchaseConditionsLoading,
    refetch: refetchPurchaseConditions
  } = useQuery({
    queryKey: [`/api/suppliers/${id}/purchase-conditions`],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id
  });
  
  // Mutation für das Aktualisieren des Lieferanten
  const updateMutation = useMutation({
    mutationFn: (data: Partial<SupplierFormValues>) => 
      updateSupplier(parseInt(id), data),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Lieferant erfolgreich aktualisiert",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      setIsEditDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Aktualisieren des Lieferanten: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation für das Erstellen einer neuen Einkaufsbedingung
  const createPurchaseConditionMutation = useMutation({
    mutationFn: (data: any) => {
      console.log("Erstelle Einkaufsbedingung mit Daten:", data);
      // Stelle sicher, dass alle erforderlichen Felder vorhanden sind
      const condition = {
        ...data,
        supplierId: parseInt(id), // Stelle sicher, dass die ID als Nummer vorliegt
        productId: Number(data.productId), // Stelle sicher, dass die Produkt-ID als Nummer vorliegt
        unitPrice: Number(data.unitPrice), // Stelle sicher, dass der Preis als Nummer vorliegt
        isPreferred: !!data.isPreferred // Standardwert für isPreferred
      };
      console.log("Formatierte Daten:", condition);
      return createPurchaseCondition(condition);
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Einkaufsbedingung erfolgreich erstellt",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${id}/purchase-conditions`] });
      setShowAddPurchaseCondition(false);
    },
    onError: (error) => {
      console.error("Fehler beim Erstellen der Einkaufsbedingung:", error);
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Einkaufsbedingung: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation für das Aktualisieren einer Einkaufsbedingung
  const updatePurchaseConditionMutation = useMutation({
    mutationFn: (data: { id: number, data: Partial<PurchaseCondition> }) => 
      updatePurchaseCondition(data.id, data.data),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Einkaufsbedingung erfolgreich aktualisiert",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${id}/purchase-conditions`] });
      setEditingPurchaseCondition(null);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Aktualisieren der Einkaufsbedingung: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation für das Löschen einer Einkaufsbedingung
  const deletePurchaseConditionMutation = useMutation({
    mutationFn: (id: number) => 
      deletePurchaseCondition(id),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Einkaufsbedingung erfolgreich gelöscht",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${id}/purchase-conditions`] });
      setDeletingPurchaseConditionId(null);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Löschen der Einkaufsbedingung: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation für das Zuweisen eines Produkts zu einem Lieferanten
  const assignProductToSupplierMutation = useMutation({
    mutationFn: (productId: number) => {
      // Sicherstellen, dass supplier nicht undefined ist
      if (!supplier) {
        throw new Error("Lieferant nicht gefunden");
      }
      return assignProductToSupplier(productId, parseInt(id), supplier.name);
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Produkt erfolgreich zugeordnet",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products`, { supplierId: parseInt(id) }] });
      setShowProductAssignmentDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler bei der Zuordnung des Produkts: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation für das Entfernen der Zuordnung eines Produkts von einem Lieferanten
  const removeProductFromSupplierMutation = useMutation({
    mutationFn: (productId: number) => {
      return unassignProductFromSupplier(productId);
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Produktzuordnung erfolgreich entfernt",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products`, { supplierId: parseInt(id) }] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Entfernen der Produktzuordnung: ${error}`,
        variant: "destructive",
      });
    }
  });

  // WICHTIG: Form-Initialisierung erfolgt immer, unabhängig vom Zustand der Komponente
  // Standardwerte für das Formular definieren
  const defaultValues = supplier ? {
    ...supplier,
    minimumOrderValue: supplier.minimumOrderValue || undefined,
  } : {
    name: '',
    status: 'active',
    country: 'Deutschland'
  };
  
  // Form Hook für das Bearbeiten des Lieferanten - wird immer initialisiert
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues
  });
  
  // Funktionen nach allen Hook-Aufrufen definieren
  const handleBack = () => {
    navigate('/lieferanten');
  };
  
  const handleEdit = () => {
    setIsEditDialogOpen(true);
  };
  
  const handleCreateOrder = () => {
    navigate(`/bestellungen/neu?supplierId=${id}`);
  };
  
  // Handler für das Absenden des Formulars
  const onSubmit = (values: SupplierFormValues) => {
    // Die ID muss nicht übergeben werden, da updateSupplier sie bereits als Parameter nimmt
    updateMutation.mutate(values);
  };
  
  // Handler für Einkaufsbedingungen
  const handleAddPurchaseCondition = () => {
    setShowAddPurchaseCondition(true);
  };
  
  const handleEditPurchaseCondition = (condition: PurchaseCondition) => {
    setEditingPurchaseCondition(condition);
  };
  
  const handleDeletePurchaseCondition = (id: number) => {
    setDeletingPurchaseConditionId(id);
  };

  const handleUpdateSupplier = (updatedData: Partial<Supplier>) => {
    updateSupplierMutation.mutate(updatedData);
  };
  
  // Handler für die Einkaufsbedingungsformulare
  const handleCreatePurchaseCondition = (data: any) => {
    createPurchaseConditionMutation.mutate(data);
  };
  
  const handleUpdatePurchaseCondition = (data: any) => {
    if (editingPurchaseCondition) {
      updatePurchaseConditionMutation.mutate({
        id: editingPurchaseCondition.id,
        data
      });
    }
  };
  
  const handleConfirmDelete = () => {
    if (deletingPurchaseConditionId) {
      deletePurchaseConditionMutation.mutate(deletingPurchaseConditionId);
    }
  };
  
  // Helper für den Status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Aktiv</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inaktiv</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  // Refreshing function für die Daten
  const handleRefresh = () => {
    window.location.reload();
  };

  // Export function 
  const handleExport = () => {
    toast({
      title: "Info",
      description: "Export-Funktion wird implementiert."
    });
  };
  
  // Rendering-Bedingungen nach dem Definieren aller Hooks und Funktionen
  if (isLoading) {
    return (
      <div className="container space-y-6">
        <PageHeader
          showRefresh={true}
          showDownload={true}
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (error || !supplier) {
    return (
      <div className="container space-y-6">
        <PageHeader
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <CardTitle>Fehler beim Laden</CardTitle>
            </div>
            <CardDescription className="text-red-600">
              Der Lieferant konnte nicht geladen werden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container space-y-6">
      {/* Standardisierter PageHeader */}
      <PageHeader
        showRefresh={true}
        showDownload={true}
        additionalButtons={
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
              <Button onClick={handleCreateOrder}>
                <FileText className="h-4 w-4 mr-2" />
                Neue Bestellung
              </Button>
            </div>
          </TooltipProvider>
        }
        onRefresh={handleRefresh}
        onDownload={handleExport}
      />
      
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Lieferanten bearbeiten
            </DialogTitle>
            <DialogDescription>
              Bearbeiten Sie die Informationen des Lieferanten.
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
                      <FormLabel>Mindestbestellwert</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={field.value || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === '' ? '' : parseFloat(value));
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
                        <Input {...field} value={field.value || ''} placeholder="z.B. Mo, Mi, Fr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Steuerinformationen */}
                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Steuernummer/USt-ID</FormLabel>
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
                    <FormItem>
                      <FormLabel>Bankverbindung</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Anmerkungen */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Anmerkungen</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>Speichern...</>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Speichern
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Lieferanten Header */}
      <div>
        <h1 className="text-2xl font-bold">{supplier.name}</h1>
        <div className="text-muted-foreground flex items-center gap-2">
          <span>Lieferantendetails</span>
          {getStatusBadge(supplier.status)}
        </div>
      </div>
      
      <Tabs defaultValue="dashboard">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full h-auto p-1">
            <TabsTrigger value="dashboard" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <BarChart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Building className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Info</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Produkte</span>
            </TabsTrigger>
            <TabsTrigger value="purchaseConditions" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Einkauf</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Truck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Bestellungen</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <BarChart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Statistiken</span>
            </TabsTrigger>
            <TabsTrigger value="emailTemplates" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>E-Mail</span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <SupplierDashboard supplierId={parseInt(id!)} supplier={supplier} />
        </TabsContent>
        
        {/* Informationen Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Kontaktinformationen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Kontaktdaten</h3>
                  
                  {supplier.contactPerson && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">Ansprechpartner:</span>
                      <span>{supplier.contactPerson}</span>
                    </div>
                  )}
                  
                  <div className="space-y-1.5">
                    {supplier.phone && (
                      <div className="flex items-center">
                        <Phone className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={`tel:${supplier.phone}`} className="hover:underline">
                          {supplier.phone}
                        </a>
                      </div>
                    )}
                    
                    {supplier.email && (
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={`mailto:${supplier.email}`} className="hover:underline">
                          {supplier.email}
                        </a>
                      </div>
                    )}
                    
                    {supplier.website && (
                      <div className="flex items-center">
                        <Globe className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {supplier.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Adresse</h3>
                  
                  <div className="pl-1">
                    {supplier.address && <p>{supplier.address}</p>}
                    {(supplier.postalCode || supplier.city) && (
                      <p>
                        {supplier.postalCode && `${supplier.postalCode} `}
                        {supplier.city}
                      </p>
                    )}
                    {supplier.country && <p>{supplier.country}</p>}
                    
                    {(supplier.address || supplier.city) && (
                      <a 
                        href={`https://maps.google.com/maps?q=${encodeURIComponent(
                          [
                            supplier.address,
                            supplier.postalCode,
                            supplier.city,
                            supplier.country
                          ].filter(Boolean).join(', ')
                        )}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-primary hover:underline mt-2"
                      >
                        <MapPin className="h-3.5 w-3.5 mr-1" />
                        Auf Google Maps anzeigen
                      </a>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Lieferbedingungen</h3>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {supplier.deliveryTerms && (
                      <div className="col-span-2">
                        <span className="font-medium">Lieferbedingungen:</span>
                        <p className="text-sm">{supplier.deliveryTerms}</p>
                      </div>
                    )}
                    
                    {supplier.deliveryDays && (
                      <div className="col-span-2">
                        <span className="font-medium">Liefertage:</span>
                        <p className="text-sm">{supplier.deliveryDays}</p>
                      </div>
                    )}
                    
                    {supplier.minimumOrderValue && (
                      <div>
                        <span className="font-medium">Mindestbestellwert:</span>
                        <p className="text-sm">{supplier.minimumOrderValue.toFixed(2)} €</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Zahlungsinformationen</h3>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {supplier.paymentTerms && (
                      <div className="col-span-2">
                        <span className="font-medium">Zahlungsbedingungen:</span>
                        <p className="text-sm">{supplier.paymentTerms}</p>
                      </div>
                    )}
                    
                    {supplier.bankDetails && (
                      <div className="col-span-2">
                        <span className="font-medium">Bankverbindung:</span>
                        <p className="text-sm">{supplier.bankDetails}</p>
                      </div>
                    )}
                    
                    {supplier.taxId && (
                      <div>
                        <span className="font-medium">Steuernummer/USt-ID:</span>
                        <p className="text-sm">{supplier.taxId}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Beschreibung */}
          {(supplier.shortDescription || supplier.notes) && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                {supplier.shortDescription && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Kurzbeschreibung</h4>
                    <p className="whitespace-pre-line">{supplier.shortDescription}</p>
                  </div>
                )}
                {supplier.notes && (
                  <div>
                    <h4 className="font-medium mb-2">Anmerkungen</h4>
                    <p className="whitespace-pre-line">{supplier.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Fotos */}
          {supplier.photos && supplier.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Fotos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {supplier.photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo}
                        alt={`${supplier.name} Foto ${index + 1}`}
                        className="w-full h-32 object-cover rounded border"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Produkte Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Produkte</CardTitle>
                <CardDescription>
                  Alle Produkte dieses Lieferanten
                </CardDescription>
              </div>
              <Button onClick={() => setShowProductAssignmentDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Produkt zuordnen
              </Button>
            </CardHeader>
            <CardContent>
              {isProductsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center p-3 border rounded-md">
                      <div className="flex-grow">
                        <Skeleton className="h-5 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : !products || products.length === 0 ? (
                <div className="text-center p-6">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Produkte gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Für diesen Lieferanten sind noch keine Produkte erfasst.
                  </p>
                  <Button variant="outline" onClick={() => setShowProductAssignmentDialog(true)}>
                    Produkte zuordnen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product: any) => (
                    <div 
                      key={product.id} 
                      className="flex items-center p-3 border rounded-md hover:bg-accent"
                    >
                      <div 
                        className="flex-grow cursor-pointer"
                        onClick={() => navigate(`/produkte/${product.id}`)}
                      >
                        <h3 className="font-medium">{product.productName || product.name || 'Unbenanntes Produkt'}</h3>
                        <div className="text-sm text-muted-foreground">
                          {product.sku && <span className="mr-2">SKU: {product.sku}</span>}
                          {product.supplierSku && <span className="mr-2">Lieferanten-Nr.: {product.supplierSku}</span>}
                          {product.category && <span className="mr-2">• {product.category}</span>}
                        </div>
                        {/* Einkaufsbedingungen anzeigen */}
                        {(product.unitPrice || product.minQuantity || product.deliveryTime) && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                            {product.unitPrice && (
                              <span className="flex items-center">
                                <Euro className="h-3 w-3 mr-1" />
                                EK: {product.unitPrice.toFixed(2)} €
                              </span>
                            )}
                            {product.minQuantity && (
                              <span>Min: {product.minQuantity}</span>
                            )}
                            {product.deliveryTime && (
                              <span className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {product.deliveryTime}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {/* Hauptpreis (Einkaufspreis) */}
                          <Badge variant={product.unitPrice ? "default" : "outline"} className="mb-1">
                            {product.unitPrice ? `${product.unitPrice.toFixed(2)} €` : 
                             product.purchasePrice ? `${product.purchasePrice.toFixed(2)} €` : 
                             product.price ? `${product.price.toFixed(2)} €` : 'k.A.'}
                          </Badge>
                          {/* Bruttopreis falls verfügbar */}
                          {product.grossPrice && product.grossPrice !== product.unitPrice && (
                            <div className="text-xs text-muted-foreground">
                              Brutto: {product.grossPrice.toFixed(2)} €
                            </div>
                          )}
                          {/* Bevorzugter Lieferant Indikator */}
                          {product.isPreferred && (
                            <div className="text-xs text-green-600 font-medium">
                              ⭐ Bevorzugt
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProductFromSupplierMutation.mutate(product.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => navigate('/produkte?supplierId=' + id)}>
                Alle Produkte anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Bestellungen Tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Bestellungen</CardTitle>
              <CardDescription>
                Alle Bestellungen bei diesem Lieferanten
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isOrdersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <Skeleton className="h-5 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="text-right">
                        <Skeleton className="h-6 w-16 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !orders || orders.length === 0 ? (
                <div className="text-center p-6">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Bestellungen gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Bei diesem Lieferanten wurden noch keine Bestellungen aufgegeben.
                  </p>
                  <Button onClick={handleCreateOrder}>
                    Neue Bestellung erstellen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order: any) => (
                    <div 
                      key={order.id} 
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-accent cursor-pointer"
                      onClick={() => navigate(`/bestellungen/${order.id}`)}
                    >
                      <div>
                        <h3 className="font-medium">Bestellung #{order.orderNumber || order.id}</h3>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1" />
                          {new Date(order.createdAt).toLocaleDateString('de-DE')}
                          
                          {order.itemCount && (
                            <span className="ml-3 flex items-center">
                              <Package className="h-3.5 w-3.5 mr-1" />
                              {order.itemCount} Positionen
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-medium">
                          {order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : 'k.A.'}
                        </div>
                        <div className="text-sm">
                          {order.status === 'completed' ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800">Abgeschlossen</Badge>
                          ) : order.status === 'pending' ? (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">In Bearbeitung</Badge>
                          ) : order.status === 'draft' ? (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">Entwurf</Badge>
                          ) : (
                            <Badge variant="outline">{order.status}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => navigate('/bestellungen?supplierId=' + id)}>
                Alle Bestellungen anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Einkaufsbedingungen Tab */}
        <TabsContent value="purchaseConditions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Einkaufsbedingungen</CardTitle>
                <CardDescription>
                  Preise und Konditionen für Produkte dieses Lieferanten
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAddPurchaseCondition(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Kondition
              </Button>
            </CardHeader>
            <CardContent>
              {isPurchaseConditionsLoading ? (
                <div className="flex flex-col space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !purchaseConditions || purchaseConditions.length === 0 ? (
                <div className="text-center p-6">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Einkaufsbedingungen gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Für diesen Lieferanten sind noch keine Einkaufsbedingungen erfasst.
                  </p>
                  <Button onClick={() => setShowAddPurchaseCondition(true)}>
                    Einkaufsbedingung hinzufügen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-8 gap-2 px-3 py-2 font-medium text-sm text-muted-foreground">
                    <div className="col-span-3">Produkt</div>
                    <div className="col-span-1 text-right">Preis</div>
                    <div className="col-span-1 text-center">Min. Menge</div>
                    <div className="col-span-2">Gültigkeitszeitraum</div>
                    <div className="col-span-1 text-right">Aktionen</div>
                  </div>
                  
                  {purchaseConditions.map((condition) => (
                    <div 
                      key={condition.id} 
                      className="grid grid-cols-8 gap-2 p-3 border rounded-md items-center"
                    >
                      <div className="col-span-3">
                        <div className="font-medium">{condition.productName || 'Unbekanntes Produkt'}</div>
                        {condition.productSku && (
                          <div className="text-xs text-muted-foreground">SKU: {condition.productSku}</div>
                        )}
                      </div>
                      <div className="col-span-1 text-right font-medium">
                        {condition.unitPrice.toFixed(2)} €
                      </div>
                      <div className="col-span-1 text-center">
                        {condition.minQuantity || 'k.A.'}
                      </div>
                      <div className="col-span-2 text-sm">
                        {condition.validFrom && condition.validTo ? (
                          <>
                            {new Date(condition.validFrom).toLocaleDateString('de-DE')} - {new Date(condition.validTo).toLocaleDateString('de-DE')}
                          </>
                        ) : condition.validFrom ? (
                          <>Ab {new Date(condition.validFrom).toLocaleDateString('de-DE')}</>
                        ) : condition.validTo ? (
                          <>Bis {new Date(condition.validTo).toLocaleDateString('de-DE')}</>
                        ) : (
                          'Unbegrenzt'
                        )}
                      </div>
                      <div className="col-span-1 flex justify-end space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditPurchaseCondition(condition)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeletePurchaseCondition(condition.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Statistiken Tab */}
        <TabsContent value="stats" className="space-y-6">
          <SupplierStatistics supplierId={parseInt(id!)} supplier={supplier} />
        </TabsContent>
        
        {/* E-Mail-Vorlagen Tab */}
        <TabsContent value="emailTemplates">
          <SupplierEmailTemplates 
            supplierId={parseInt(id)} 
            supplierName={supplier?.name || ''} 
          />
        </TabsContent>
      </Tabs>

      {/* Dialog zum Erstellen einer neuen Einkaufsbedingung */}
      <Dialog open={showAddPurchaseCondition} onOpenChange={setShowAddPurchaseCondition}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neue Einkaufsbedingung erstellen</DialogTitle>
            <DialogDescription>
              Erstellen Sie eine neue Einkaufsbedingung für diesen Lieferanten.
            </DialogDescription>
          </DialogHeader>
          <PurchaseConditionForm
            supplierId={parseInt(id)}
            onSubmit={handleCreatePurchaseCondition}
            onCancel={() => setShowAddPurchaseCondition(false)}
            isLoading={createPurchaseConditionMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog zum Bearbeiten einer Einkaufsbedingung */}
      <Dialog open={!!editingPurchaseCondition} onOpenChange={(open) => !open && setEditingPurchaseCondition(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Einkaufsbedingung bearbeiten</DialogTitle>
            <DialogDescription>
              Bearbeiten Sie die ausgewählte Einkaufsbedingung.
            </DialogDescription>
          </DialogHeader>
          {editingPurchaseCondition && (
            <PurchaseConditionForm
              supplierId={parseInt(id)}
              initialData={editingPurchaseCondition}
              onSubmit={handleUpdatePurchaseCondition}
              onCancel={() => setEditingPurchaseCondition(null)}
              isLoading={updatePurchaseConditionMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog zum Löschen einer Einkaufsbedingung */}
      <AlertDialog 
        open={!!deletingPurchaseConditionId} 
        onOpenChange={(open) => !open && setDeletingPurchaseConditionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einkaufsbedingung löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie diese Einkaufsbedingung löschen möchten? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={deletePurchaseConditionMutation.isPending}
            >
              {deletePurchaseConditionMutation.isPending ? "Löschen..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Dialog zur Produktzuordnung */}
      <Dialog open={showProductAssignmentDialog} onOpenChange={setShowProductAssignmentDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Produkte zuordnen</DialogTitle>
            <DialogDescription>
              Wählen Sie die Produkte aus, die diesem Lieferanten zugeordnet werden sollen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Produkte suchen..." 
                className="w-full pl-10" 
                type="search"
                onChange={(e) => {
                  setProductSearchTerm(e.target.value);
                }}
              />
            </div>
            
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              {isAllProductsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : allProducts.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Produkte gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Es sind keine Produkte vorhanden, die zugeordnet werden können.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {allProducts
                    .filter((product: any) => 
                      productSearchTerm === "" || 
                      (product.productName && product.productName.toLowerCase().includes(productSearchTerm.toLowerCase())) ||
                      (product.sku && product.sku.toLowerCase().includes(productSearchTerm.toLowerCase())))
                    .map((product: any) => (
                    <div 
                      key={product.id} 
                      className={`p-3 flex items-center ${
                        product.supplierId !== null && product.supplierId !== undefined
                          ? 'bg-gray-50 text-muted-foreground opacity-60 cursor-not-allowed' 
                          : 'hover:bg-accent cursor-pointer'
                      }`}
                      onClick={() => {
                        if (product.supplierId === null || product.supplierId === undefined) {
                          assignProductToSupplierMutation.mutate(product.id);
                        }
                      }}
                    >
                      <div className="flex-grow">
                        <div className="font-medium">
                          {product.productName || product.name}
                          {product.supplierId === parseInt(id) && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Bereits zugeordnet
                            </Badge>
                          )}
                          {product.supplierId !== null && product.supplierId !== undefined && product.supplierId !== parseInt(id) && (
                            <Badge className="ml-2 bg-yellow-100 text-yellow-800 border-yellow-200">
                              Anderer Lieferant
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {product.sku && <span className="mr-3">SKU: {product.sku}</span>}
                          {product.category && <span>Kategorie: {product.category}</span>}
                        </div>
                      </div>
                      {product.supplierId === null && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation(); // Verhindert, dass der Klick das übergeordnete div-Element auslöst
                            assignProductToSupplierMutation.mutate(product.id);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Zuordnen
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductAssignmentDialog(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Edit Dialog */}
      {supplier && (
        <SupplierEditDialog
          supplier={supplier}
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={handleUpdateSupplier}
        />
      )}
    </div>
  );
}
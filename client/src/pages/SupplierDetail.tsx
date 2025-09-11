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
  RefreshCw, Download, CheckCircle, XCircle, X, Trash2, Save, Plus, Check, Search, Euro,
  Shield, QrCode, MessageSquare, ExternalLink
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
import { Supplier } from "../../../shared/schema";
import PurchaseConditionForm from "@/components/forms/PurchaseConditionForm";
import SupplierEmailTemplates from "@/components/suppliers/SupplierEmailTemplates";
import { SupplierEditDialog } from "@/components/SupplierEditDialog";
import UnifiedPurchaseConditionsManager from "@/components/purchase-conditions/UnifiedPurchaseConditionsManager";
import SupplierDiscountManager from "@/components/SupplierDiscountManager";
import SupplierInformationTab from "@/components/suppliers/SupplierInformationTab";
import ProductOverviewTable from "@/components/ProductOverviewTable";
import { apiRequest } from "@/lib/queryClient";

// Inline editing component for supplier fields
function SupplierInlineEditCard({ supplier, onUpdate }: { supplier: any; onUpdate: (data: any) => void }) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const { toast } = useToast();

  const handleEdit = (field: string, currentValue: any) => {
    setEditingField(field);
    setEditValues({ [field]: currentValue || '' });
  };

  const handleSave = async (field: string) => {
    try {
      await onUpdate({ [field]: editValues[field] });
      setEditingField(null);
      setEditValues({});
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Fehler beim Speichern des Feldes",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValues({});
  };

  const EditableField = ({ 
    label, 
    field, 
    value, 
    type = "input",
    icon 
  }: { 
    label: string; 
    field: string; 
    value: any; 
    type?: "input" | "textarea" | "email" | "url" | "tel";
    icon?: any;
  }) => {
    const isEditing = editingField === field;
    
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
        <div className="flex items-center gap-2 flex-1">
          {icon && icon}
          <span className="font-medium text-sm text-muted-foreground min-w-[120px]">{label}:</span>
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              {type === "textarea" ? (
                <Textarea
                  value={editValues[field] || ''}
                  onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                  className="flex-1"
                  rows={3}
                />
              ) : (
                <Input
                  type={type === "email" ? "email" : type === "url" ? "url" : "text"}
                  value={editValues[field] || ''}
                  onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                  className="flex-1"
                  placeholder={type === "tel" ? "+49 123 456-789" : undefined}
                />
              )}
              <div className="flex gap-1">
                <Button size="sm" onClick={() => handleSave(field)}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm">
                {value ? (
                  type === "email" ? (
                    <a href={`mailto:${value}`} className="hover:underline text-blue-600">{value}</a>
                  ) : type === "url" ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">
                      {value.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    value
                  )
                ) : (
                  <span className="text-muted-foreground italic">Nicht angegeben</span>
                )}
              </span>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => handleEdit(field, value)}
                className="h-6 w-6 p-0"
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Grundinformationen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Grundinformationen
          </CardTitle>
          <CardDescription>
            Klicken Sie auf das Bearbeiten-Symbol, um Felder direkt zu bearbeiten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <EditableField
            label="Firmenname"
            field="name"
            value={supplier?.name || ''}
            icon={<Building className="h-4 w-4 text-muted-foreground" />}
          />
        </CardContent>
      </Card>

      {/* Kontaktinformationen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Kontaktinformationen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <EditableField
            label="Ansprechpartner"
            field="contactPerson"
            value={supplier?.contactPerson || ''}
          />
          <EditableField
            label="Telefon"
            field="phone"
            value={supplier?.phone || ''}
            type="tel"
            icon={<Phone className="h-4 w-4 text-muted-foreground" />}
          />
          <EditableField
            label="E-Mail"
            field="email"
            value={supplier?.email || ''}
            type="email"
            icon={<Mail className="h-4 w-4 text-muted-foreground" />}
          />
          <EditableField
            label="Website"
            field="website"
            value={supplier?.website || ''}
            type="url"
            icon={<Globe className="h-4 w-4 text-muted-foreground" />}
          />
        </CardContent>
      </Card>

      {/* Adressinformationen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Adressinformationen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <EditableField
            label="Straße/Hausnummer"
            field="address"
            value={supplier?.address || ''}
          />
          <EditableField
            label="Postleitzahl"
            field="postalCode"
            value={supplier?.postalCode || ''}
          />
          <EditableField
            label="Stadt"
            field="city"
            value={supplier?.city || ''}
          />
          <EditableField
            label="Land"
            field="country"
            value={supplier?.country || ''}
          />
        </CardContent>
      </Card>

      {/* Beschreibungen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Beschreibungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <EditableField
            label="Kurzbeschreibung"
            field="shortDescription"
            value={supplier?.shortDescription || ''}
            type="textarea"
          />
          <EditableField
            label="Detailbeschreibung"
            field="description"
            value={supplier?.description || ''}
            type="textarea"
          />
        </CardContent>
      </Card>

      {/* Bilder und Medien */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bilder und Medien
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <Package className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">Lieferanten-Bilder hochladen</p>
              <Button variant="outline" size="sm" className="mt-2">
                <Plus className="h-4 w-4 mr-2" />
                Bilder hinzufügen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notizen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Interne Notizen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EditableField
            label="Notizen"
            field="notes"
            value={supplier?.notes || ''}
            type="textarea"
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface SupplierPortalData {
  activePins: any[];
  feedback: any[];
  portalUrl: string | null;
  lastAccess: string | null;
  totalAccess: number;
}

// Portal Analytics Component for individual supplier details
function SupplierPortalAnalytics({ supplierId, supplierName }: { supplierId: number; supplierName: string }) {
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);

  const { data: portalData, isLoading, refetch } = useQuery<{ success: boolean; data: SupplierPortalData }>({
    queryKey: [`/api/supplier-portal/admin/analytics/${supplierId}`],
    enabled: !!supplierId,
  });

  // Debug Ausgabe für Fehlerbehebung
  console.log('Portal Data für Lieferant', supplierId, ':', portalData);

  const handleGeneratePin = async () => {
    try {
      setIsGeneratingPin(true);
      const response = await fetch(`/api/supplier-portal/admin/generate-pin/${supplierId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: `MANUAL-${Date.now()}` })
      });

      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Error generating PIN:', error);
    } finally {
      setIsGeneratingPin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const data = portalData?.data;

  return (
    <div className="space-y-6">
      {/* Portal Access Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Portal-Zugang für {supplierName}
          </CardTitle>
          <CardDescription>
            Verwalten Sie den sicheren Portal-Zugang für diesen Lieferanten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Direkter Portal-Link - erstelle automatisch aus PINs wenn verfügbar */}
          {(portalData?.data?.portalUrl || (portalData?.data?.activePins && portalData.data.activePins.length > 0)) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-blue-900">Lieferanten-Portal</h3>
                  <p className="text-sm text-blue-700">Direkter Zugang zum sicheren Lieferanten-Portal</p>
                  {portalData?.data?.lastAccess && (
                    <p className="text-xs text-blue-600 mt-1">
                      Letzter Zugriff: {new Date(portalData.data.lastAccess).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => {
                    const portalUrl = portalData?.data?.portalUrl || 
                      (portalData?.data?.activePins?.length > 0 
                        ? `${window.location.origin}/lieferant/${portalData.data.activePins[0].access_token}`
                        : null);
                    if (portalUrl) window.open(portalUrl, '_blank');
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Portal öffnen
                </Button>
              </div>
            </div>
          )}

          {/* Kein Portal-Link verfügbar */}
          {!portalData?.data?.portalUrl && (!portalData?.data?.activePins || portalData.data.activePins.length === 0) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-700">Lieferanten-Portal</h3>
                  <p className="text-sm text-gray-600">Noch kein aktiver Portal-Zugang vorhanden</p>
                  <p className="text-xs text-gray-500 mt-1">Generieren Sie zuerst einen PIN-Code</p>
                </div>
                <Button variant="outline" disabled>
                  <Shield className="h-4 w-4 mr-2" />
                  Kein Zugang
                </Button>
              </div>
            </div>
          )}



          <Button
            onClick={handleGeneratePin}
            disabled={isGeneratingPin}
            className="w-full"
            size="lg"
          >
            <QrCode className="h-4 w-4 mr-2" />
            {isGeneratingPin ? 'Generiere PIN...' : 'Neuen PIN generieren'}
          </Button>
        </CardContent>
      </Card>

      {/* PIN Information */}
      {data?.activePins && data.activePins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Aktive PINs ({data.activePins.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.activePins.map((pin: any) => (
                <div key={pin.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="font-mono text-xl font-bold text-green-600">
                      PIN: {pin.pin_code}
                    </div>
                    <Badge variant="outline" className="text-sm">
                      Gültig bis: {new Date(pin.valid_until).toLocaleDateString('de-DE')}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Zugriffe:</span>
                      <span className="ml-1 font-medium">{pin.access_count || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Erstellt:</span>
                      <span className="ml-1">{new Date(pin.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  {pin.last_access_at && (
                    <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                      <strong>Letzter Zugriff:</strong> {new Date(pin.last_access_at).toLocaleString('de-DE')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Access Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Zugriffs-Statistiken
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{data?.totalAccess || 0}</div>
                <div className="text-sm text-muted-foreground">Gesamt-Zugriffe</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">
                  {data?.lastAccess ? new Date(data.lastAccess).toLocaleDateString('de-DE') : 'Noch nie'}
                </div>
                <div className="text-sm text-muted-foreground">Letzter Zugriff</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Info */}
        <Card>
          <CardHeader>
            <CardTitle>Portal-Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={data?.portalUrl ? "default" : "secondary"}>
                {data?.portalUrl ? "Aktiv" : "Inaktiv"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Aktive PINs:</span>
              <span className="font-medium">{data?.activePins?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Offene Rückmeldungen:</span>
              <span className="font-medium">{data?.feedback?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Overview */}
      {data?.feedback && data.feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Lieferanten-Rückmeldungen ({data.feedback.length})
            </CardTitle>
            <CardDescription>
              Änderungsanfragen und Feedback von diesem Lieferanten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {data.feedback.map((feedback: any) => (
                <div key={feedback.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-lg">{feedback.feedback_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {feedback.entity_type} • {feedback.field_name}
                      </div>
                    </div>
                    <Badge variant={
                      feedback.status === 'completed' ? 'default' : 
                      feedback.status === 'in_progress' ? 'secondary' : 'outline'
                    }>
                      {feedback.status === 'completed' ? 'Erledigt' :
                       feedback.status === 'in_progress' ? 'In Bearbeitung' : 'Offen'}
                    </Badge>
                  </div>
                  {feedback.comment && (
                    <div className="bg-gray-50 p-3 rounded border-l-4 border-blue-500">
                      <p className="text-sm italic">"{feedback.comment}"</p>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    Eingereicht am: {new Date(feedback.created_at).toLocaleString('de-DE')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



// Schema für das Lieferanten-Formular
const supplierFormSchema = z.object({
  name: z.string().min(1, "Lieferantenname ist erforderlich"),
  contactPerson: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
  website: z.string().url("Ungültige Website-URL").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().default("Deutschland"),
  status: z.string().default("active"),
  notes: z.string().optional().or(z.literal("")),
  paymentTerms: z.string().optional().or(z.literal("")),
  deliveryTerms: z.string().optional().or(z.literal("")),
  minimumOrderValue: z.number().optional().or(z.literal("").transform(() => undefined)),
  deliveryDays: z.string().optional().or(z.literal("")),
  taxId: z.string().optional().or(z.literal("")),
  accountNumber: z.string().optional().or(z.literal("")),
  bankDetails: z.string().optional().or(z.literal("")),
  showPricesInOrders: z.boolean().default(true),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showProductAssignmentDialog, setShowProductAssignmentDialog] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Check if this is a "new supplier" route
  const isNewSupplier = id === 'new';
  const supplierId = isNewSupplier ? null : parseInt(id);
  
  // Mutation zum Aktualisieren des Lieferanten
  const updateSupplierMutation = useMutation({
    mutationFn: async (updatedSupplier: Partial<Supplier>) => {
      // Convert null values to undefined for consistency
      const cleanUpdatedSupplier = Object.fromEntries(
        Object.entries(updatedSupplier).map(([key, value]) => [key, value === null ? undefined : value])
      );
      return apiRequest(`/api/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(cleanUpdatedSupplier),
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
  
  // Mutation zum Erstellen eines neuen Lieferanten
  const createSupplierMutation = useMutation({
    mutationFn: async (newSupplier: SupplierFormValues) => {
      // Debug: Log the data being sent
      console.log('Creating supplier with data:', newSupplier);
      
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSupplier),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      toast({
        title: "Lieferant erstellt",
        description: "Der neue Lieferant wurde erfolgreich erstellt.",
      });
      // Navigate to the newly created supplier
      if (response?.data?.id) {
        navigate(`/lieferanten/${response.data.id}`);
      } else {
        navigate('/lieferanten');
      }
    },
    onError: (error) => {
      console.error('Create error:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Erstellen des Lieferanten.",
        variant: "destructive",
      });
    },
  });
  
  // Lieferantendaten abfragen (nur wenn nicht "new")
  const { data: supplier, isLoading, error } = useQuery<Supplier>({
    queryKey: [`/api/suppliers/${id}`],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !isNewSupplier && !!supplierId && !isNaN(supplierId),
    retry: 2,
    retryDelay: 1000,
  });
  
  // Produkte des Lieferanten abfragen (nur wenn nicht "new" und Supplier geladen)
  const { data: productsResponse, isLoading: isProductsLoading, error: productsError } = useQuery<{data?: any[]; products?: any[]}>({
    queryKey: ['/api/products', { supplierId: supplierId }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !isNewSupplier && !!supplierId && !isNaN(supplierId) && !!supplier, // Warte auf Supplier-Daten
    retry: 2,
  });
  
  // Produkte extrahieren und als Array zur Verfügung stellen
  const products = (() => {
    try {
      if (!productsResponse) return [];
      if (Array.isArray(productsResponse)) return productsResponse;
      if (Array.isArray(productsResponse?.data)) return productsResponse.data;
      if (Array.isArray(productsResponse?.products)) return productsResponse.products;
      return [];
    } catch (error) {
      console.error('Fehler beim Verarbeiten der Produktdaten:', error);
      return [];
    }
  })();
  
  // Debug-Ausgabe für Produkte (orders und purchaseConditions werden später definiert)
  console.log(`Lieferant ${id} - Produkte geladen:`, products?.length, products);
  console.log(`Lieferant ${id} - Original response:`, productsResponse);
  
  // Alle verfügbaren Produkte abfragen (für Zuordnung)
  const { data: allProductsResponse, isLoading: isAllProductsLoading } = useQuery<{data?: any[]} | any[]>({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60, // 1 Minute
    enabled: showProductAssignmentDialog
  });
  
  // Alle Produkte extrahieren
  const allProducts = Array.isArray(allProductsResponse) 
    ? allProductsResponse.map((product: any) => ({ ...product }))
    : Array.isArray(allProductsResponse?.data) 
    ? allProductsResponse.data.map((product: any) => ({ ...product }))
    : [];
  
  // Bestellungen des Lieferanten abfragen (nur wenn Supplier geladen)
  const { data: ordersResponse, isLoading: isOrdersLoading, error: ordersError } = useQuery<{data?: any[]; orders?: any[]}>({
    queryKey: ['/api/orders', { supplierId: parseInt(id) }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id && !isNaN(parseInt(id)) && !!supplier, // Warte auf Supplier-Daten
    retry: 2,
  });
  
  // Bestellungen extrahieren und als Array zur Verfügung stellen
  const orders = (() => {
    try {
      if (!ordersResponse) return [];
      if (Array.isArray(ordersResponse)) return ordersResponse;
      if (Array.isArray(ordersResponse?.orders)) return ordersResponse.orders;
      if (Array.isArray(ordersResponse?.data)) return ordersResponse.data;
      return [];
    } catch (error) {
      console.error('Fehler beim Verarbeiten der Bestellungsdaten:', error);
      return [];
    }
  })();
  
  // Einkaufsbedingungen des Lieferanten abfragen (nur wenn Supplier geladen)
  const { 
    data: purchaseConditionsResponse, 
    isLoading: isPurchaseConditionsLoading,
    error: purchaseConditionsError,
    refetch: refetchPurchaseConditions
  } = useQuery<{data?: any[]}>({
    queryKey: [`/api/suppliers/${id}/purchase-conditions`],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id && !isNaN(parseInt(id)) && !!supplier, // Warte auf Supplier-Daten
    retry: 2,
  });
  
  // Extract purchase conditions from response
  const purchaseConditions = (() => {
    try {
      if (!purchaseConditionsResponse) return [];
      if (Array.isArray(purchaseConditionsResponse)) return purchaseConditionsResponse;
      if (Array.isArray(purchaseConditionsResponse?.data)) return purchaseConditionsResponse.data;
      return [];
    } catch (error) {
      console.error('Fehler beim Verarbeiten der Einkaufsbedingungen:', error);
      return [];
    }
  })();

  // Debugging-Ausgabe (nach Variablendefinition)
  console.log(`Lieferant ${id} - Bestellungen:`, orders?.length, orders);
  console.log(`Lieferant ${id} - Einkaufsbedingungen:`, purchaseConditions?.length, purchaseConditions);
  
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
  

  
  // Mutation für das Zuweisen eines Produkts zu einem Lieferanten
  const assignProductToSupplierMutation = useMutation({
    mutationFn: (productId: number) => {
      // Sicherstellen, dass supplier und ID valide sind
      if (!supplier?.id || !supplier?.name || isNaN(parseInt(id))) {
        throw new Error("Lieferant-Daten sind unvollständig oder ungültig");
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
    status: supplier?.status || 'active',
    country: supplier?.country || 'Deutschland',
    minimumOrderValue: supplier?.minimumOrderValue || undefined,
  } : {
    name: '',
    status: 'active',
    country: 'Deutschland',
    showPricesInOrders: true
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
    if (isNewSupplier) {
      // Neuen Lieferant erstellen
      createSupplierMutation.mutate(values);
    } else {
      // Bestehenden Lieferant aktualisieren
      updateMutation.mutate(values);
    }
  };
  
  const handleUpdateSupplier = (updatedData: Partial<Supplier>) => {
    updateSupplierMutation.mutate(updatedData);
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
  
  // Show error only if not a new supplier and there's actually an error
  if (!isNewSupplier && (error || !supplier)) {
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

  // Render new supplier form if this is a new supplier
  if (isNewSupplier) {
    return (
      <div className="container space-y-6">
        <PageHeader
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Neuen Lieferanten erstellen</h1>
          <p className="text-muted-foreground">Geben Sie die Informationen für den neuen Lieferanten ein.</p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Lieferantendaten</CardTitle>
            <CardDescription>
              Füllen Sie die folgenden Felder aus, um einen neuen Lieferanten zu erstellen.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                          <Input {...field} placeholder="Name des Lieferanten" />
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
                        <FormLabel>Kontaktperson</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Kontaktperson" />
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
                          <Input {...field} placeholder="+49 123 456-789" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-Mail</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="kontakt@beispiel.de" />
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
                          <Input {...field} placeholder="https://www.beispiel.de" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Adresse</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Straße und Hausnummer" />
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
                          <Input {...field} placeholder="Stadt" />
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
                          <Input {...field} placeholder="01234" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Notizen</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Zusätzliche Informationen" rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-between pt-6">
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={createSupplierMutation.isPending}>
                    {createSupplierMutation.isPending && (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Lieferant erstellen
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
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
                
                {/* Bestellungseinstellungen - prominenter dargestellt */}
                <div className="md:col-span-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Euro className="h-5 w-5" />
                    Bestellungseinstellungen
                  </h3>
                  
                  <FormField
                    control={form.control}
                    name="showPricesInOrders"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              id="showPricesInOrders"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="w-5 h-5 text-blue-600 bg-white border-2 border-blue-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="showPricesInOrders" className="text-base font-medium text-blue-900">
                              Euro-Werte in Bestellungen anzeigen
                            </label>
                          </div>
                        </FormControl>
                        <FormDescription className="ml-8 text-blue-700">
                          <strong>Wichtig:</strong> Einige Lieferanten möchten keine Preise in den Bestellungen sehen - nur Artikelnummer, Bezeichnung und Menge. 
                          Deaktivieren Sie diese Option, wenn der Lieferant preisfreie Bestellungen bevorzugt.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Preisanzeige-Einstellung für E-Mails */}
                <FormField
                  control={form.control}
                  name="showPricesInOrders"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <div className="flex items-center space-x-2 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value || false}
                            onChange={(e) => field.onChange(e.target.checked)}
                            className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500"
                          />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel className="text-sm font-medium text-orange-800">
                            Preise in Bestell-E-Mails anzeigen
                          </FormLabel>
                          <p className="text-xs text-orange-700">
                            Wenn deaktiviert, werden in Bestell-E-Mails an diesen Lieferanten keine Preise angezeigt
                          </p>
                        </div>
                      </div>
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
        <h1 className="text-2xl font-bold">{supplier?.name}</h1>
        <div className="text-muted-foreground flex items-center gap-2">
          <span>{supplier?.contactPerson ? `Kontakt: ${supplier.contactPerson}` : 'Lieferant'}</span>
          {getStatusBadge(supplier?.status || "ACTIVE")}
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
            <TabsTrigger value="discountConditions" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Euro className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Rabatte</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Truck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Bestellungen</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <BarChart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Statistiken</span>
            </TabsTrigger>
            <TabsTrigger value="portal" className="flex items-center gap-1 px-2 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Portal</span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <SupplierDashboard supplierId={parseInt(id!)} supplier={supplier} />
        </TabsContent>
        
        {/* Informationen Tab */}
        <TabsContent value="info" className="space-y-6">
          <SupplierInformationTab supplier={supplier} supplierId={parseInt(id!)} />
        </TabsContent>
        
        {/* Produkte Tab - NEUE KORREKTE PRODUKTANZEIGE */}
        <TabsContent value="products" className="space-y-6">
          <ProductOverviewTable 
            supplierId={parseInt(id!)} 
            supplierName={supplier?.name}
          />
        </TabsContent>
        
        
        {/* Einkaufsbedingungen Tab */}
        <TabsContent value="purchaseConditions" className="space-y-6">
          <UnifiedPurchaseConditionsManager 
            mode="supplier"
            entityId={parseInt(id!)}
            entityName={supplier?.name || 'Lieferant'}
          />
        </TabsContent>
        
        {/* Rabattbedingungen Tab */}
        <TabsContent value="discountConditions" className="space-y-6">
          <SupplierDiscountManager supplierId={parseInt(id!)} />
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
        
        {/* Statistiken Tab */}
        <TabsContent value="stats" className="space-y-6">
          <SupplierStatistics supplierId={parseInt(id!)} supplier={supplier} />
        </TabsContent>
        
        {/* E-Mail-Vorlagen Tab - erweiterte Sichtbarkeit */}
        <TabsContent value="emailTemplates">
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800 flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Automatische E-Mail-Vorlagen für Bestellungen
                </CardTitle>
                <CardDescription className="text-green-700">
                  <strong>Wichtige Funktion:</strong> Erstellen Sie lieferanten-spezifische E-Mail-Vorlagen, die automatisch 
                  bei Bestellungen verwendet werden. Jeder Lieferant kann individuelle Vorlagen für Standard-, 
                  Nachbestellungs- und Eilbestellungen haben.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <SupplierEmailTemplates 
              supplierId={parseInt(id)} 
              supplierName={supplier?.name || ''} 
            />
          </div>
        </TabsContent>
        
        {/* Portal Tab */}
        <TabsContent value="portal" className="space-y-6">
          <SupplierPortalAnalytics 
            supplierId={parseInt(id!)} 
            supplierName={supplier?.name || 'Unbekannter Lieferant'} 
          />
        </TabsContent>
      </Tabs>




      
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
                          {product.productName || product.product_name || product.name}
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
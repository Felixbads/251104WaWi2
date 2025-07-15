import { useState } from "react";
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
  Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types for location costs
interface LocationCost {
  id: number;
  locationId: number;
  costType: string;
  amount: number;
  currency: string;
  frequency: string;
  description?: string;
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface NewLocationCost {
  costType: string;
  amount: number;
  frequency: string;
  description?: string;
}

// Cost types with German labels and icons
const COST_TYPES = [
  { value: 'stromabschlag', label: 'Stromabschlag', icon: Zap },
  { value: 'miete', label: 'Miete', icon: Home },
  { value: 'vendon_telemetrie', label: 'Vendon-Telemetrie', icon: Radio },
  { value: 'kartenzahlungsmodul', label: 'Kartenzahlungsmodul', icon: CreditCard },
  { value: 'versicherung', label: 'Versicherung', icon: Shield },
  { value: 'sonstige_laufende_kosten', label: 'Sonstige laufende Kosten', icon: Settings },
  { value: 'spende', label: 'Spende', icon: Heart }
];

const FREQUENCIES = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Vierteljährlich' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'one-time', label: 'Einmalig' }
];

// Location Costs Tab Component
function LocationCostsTab({ locationId }: { locationId: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newCost, setNewCost] = useState<NewLocationCost>({
    costType: '',
    amount: 0,
    frequency: 'monthly',
    description: ''
  });
  const { toast } = useToast();

  // Fetch location costs
  const { data: costs = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/location-costs/${locationId}`],
    enabled: !!locationId
  });

  // Create cost mutation
  const createCostMutation = useMutation({
    mutationFn: (data: NewLocationCost) => 
      apiRequest(`/api/location-costs/${locationId}`, data, 'POST'),
    onSuccess: () => {
      toast({ title: "Kostenpunkt erfolgreich hinzugefügt" });
      setIsAdding(false);
      setNewCost({ costType: '', amount: 0, frequency: 'monthly', description: '' });
      refetch();
    },
    onError: () => {
      toast({ title: "Fehler beim Hinzufügen des Kostenpunkts", variant: "destructive" });
    }
  });

  // Update cost mutation
  const updateCostMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LocationCost> }) => 
      apiRequest(`/api/location-costs/item/${id}`, data, 'PUT'),
    onSuccess: () => {
      toast({ title: "Kostenpunkt erfolgreich aktualisiert" });
      setEditingId(null);
      refetch();
    },
    onError: () => {
      toast({ title: "Fehler beim Aktualisieren des Kostenpunkts", variant: "destructive" });
    }
  });

  // Delete cost mutation
  const deleteCostMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/location-costs/item/${id}`, {}, 'DELETE'),
    onSuccess: () => {
      toast({ title: "Kostenpunkt erfolgreich gelöscht" });
      refetch();
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen des Kostenpunkts", variant: "destructive" });
    }
  });

  const handleAddCost = () => {
    if (!newCost.costType || newCost.amount <= 0) {
      toast({ title: "Bitte füllen Sie alle Pflichtfelder aus", variant: "destructive" });
      return;
    }
    createCostMutation.mutate(newCost);
  };

  const getCostTypeInfo = (costType: string) => {
    return COST_TYPES.find(ct => ct.value === costType) || 
           { label: costType, icon: Settings };
  };

  const getFrequencyLabel = (frequency: string) => {
    return FREQUENCIES.find(f => f.value === frequency)?.label || frequency;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Standortkosten verwalten</h3>
          <p className="text-sm text-muted-foreground">
            Laufende Kosten für diesen Standort erfassen und verwalten
          </p>
        </div>
        <Button 
          onClick={() => setIsAdding(true)} 
          disabled={isAdding}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Kostenpunkt hinzufügen
        </Button>
      </div>

      {/* Add new cost form */}
      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Neuen Kostenpunkt hinzufügen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="costType">Kostenart *</Label>
                <Select 
                  value={newCost.costType} 
                  onValueChange={(value) => setNewCost(prev => ({ ...prev, costType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kostenart auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_TYPES.map(type => {
                      const Icon = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="amount">Betrag (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newCost.amount}
                  onChange={(e) => setNewCost(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <Label htmlFor="frequency">Häufigkeit</Label>
                <Select 
                  value={newCost.frequency} 
                  onValueChange={(value) => setNewCost(prev => ({ ...prev, frequency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(freq => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="description">Beschreibung</Label>
                <Input
                  value={newCost.description}
                  onChange={(e) => setNewCost(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optionale Beschreibung"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleAddCost}
                disabled={createCostMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                Speichern
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsAdding(false);
                  setNewCost({ costType: '', amount: 0, frequency: 'monthly', description: '' });
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Costs list */}
      <div className="space-y-4">
        {costs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Euro className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Kosten erfasst</h3>
              <p className="text-muted-foreground text-center mb-4">
                Fügen Sie Kostenpunkte hinzu, um die Wirtschaftlichkeit dieses Standorts zu verfolgen.
              </p>
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Ersten Kostenpunkt hinzufügen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {costs.map((cost: LocationCost) => {
              const costTypeInfo = getCostTypeInfo(cost.costType);
              const Icon = costTypeInfo.icon;
              
              return (
                <Card key={cost.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{costTypeInfo.label}</h4>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="font-mono">€{cost.amount.toFixed(2)}</span>
                            <Badge variant="outline">
                              {getFrequencyLabel(cost.frequency)}
                            </Badge>
                            {cost.description && (
                              <span>{cost.description}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant={cost.isActive ? "default" : "secondary"}>
                          {cost.isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(cost.id)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteCostMutation.mutate(cost.id)}
                          disabled={deleteCostMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Location Profitability Tab Component
function LocationProfitabilityTab({ locationId }: { locationId: string }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  // Fetch profitability data
  const { data: profitabilityData, isLoading } = useQuery({
    queryKey: [`/api/enhanced-profitability/location/${locationId}`, selectedMonth],
    enabled: !!locationId
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const data = profitabilityData?.data || {
    umsatzNetto: 0,
    wareneinsatz: 0,
    rohertrag: 0,
    fixkosten: 0,
    nettoErgebnis: 0,
    products: []
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Wirtschaftlichkeitsanalyse</h3>
          <p className="text-sm text-muted-foreground">
            Detaillierte Gewinn- und Verlustrechnung für diesen Standort
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="month">Monat:</Label>
          <Input
            id="month"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Umsatz netto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              €{data.umsatzNetto.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wareneinsatz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              €{data.wareneinsatz.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rohertrag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              €{data.rohertrag.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fixkosten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              €{data.fixkosten.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Netto-Ergebnis vor Steuern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.nettoErgebnis >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              €{data.nettoErgebnis.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Details */}
      {data.products && data.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChartIcon className="w-5 h-5" />
              Produktdetails
            </CardTitle>
            <CardDescription>
              Aufschlüsselung nach einzelnen Produkten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-right">Verkäufe</TableHead>
                    <TableHead className="text-right">Umsatz</TableHead>
                    <TableHead className="text-right">Kosten</TableHead>
                    <TableHead className="text-right">Gewinn</TableHead>
                    <TableHead className="text-right">Marge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.products.map((product: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {product.productName || `Produkt ${index + 1}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.salesCount || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        €{(product.revenue || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        €{(product.costs || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={product.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          €{(product.profit || 0).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={product.margin >= 20 ? "default" : product.margin >= 10 ? "secondary" : "destructive"}>
                          {(product.margin || 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Main LocationDetail Component
export default function LocationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Mock location data - in real app, fetch this from an API
  const locationName = `Standort ${id}`;

  if (!id) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Standort nicht gefunden</h1>
          <p className="mt-2 text-muted-foreground">
            Die angeforderte Standort-ID ist ungültig.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation('/standort-status')}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Zurück
        </Button>
        
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-lg">
            <MapPin className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{locationName}</h1>
            <p className="text-muted-foreground">
              Standort-ID: {id}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="kosten" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="kosten" className="flex items-center gap-2">
            <Euro className="w-4 h-4" />
            Kosten
          </TabsTrigger>
          <TabsTrigger value="wirtschaftlichkeit" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Wirtschaftlichkeit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kosten">
          <LocationCostsTab locationId={id} />
        </TabsContent>

        <TabsContent value="wirtschaftlichkeit">
          <LocationProfitabilityTab locationId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
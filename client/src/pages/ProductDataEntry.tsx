import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Save, SaveAll, Package, Euro, FileText, Image, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Complete product interface matching ALL database fields from schema.ts
interface Product {
  id: number;
  vendonId: string;
  productName: string;
  price?: number | null;
  category?: string | null;
  description?: string | null;
  status?: string | null;
  sku?: string | null;
  barcode?: string | null;
  supplierId?: number | null;
  supplierName?: string | null;
  supplierSku?: string | null;
  articleSupplier?: string | null;
  packageSize?: string | null;
  shelfLifeDays?: number | null;
  minOrderQuantity?: number | null;
  vat?: number | null;
  depositPrice?: number | null;
  depositVat?: number | null;
  productType?: string | null;
  article?: string | null;
  tags?: string | null;
  units?: string | null;
  recipe?: string | null;
  costPrice?: number | null;
  warehouseLocation?: string | null;
  vendonUpdatedAt?: string | null;
  accountId?: number | null;
  accountName?: string | null;
  accountTimezone?: string | null;
  amountMax?: number | null;
  amountStandard?: number | null;
  amountCritical?: number | null;
  refillUnitSize?: number | null;
  minRefill?: number | null;
  critical?: boolean | null;
  carbonFootprint?: number | null;
  waterUsage?: number | null;
  packagingType?: string | null;
  packagingRecyclable?: boolean | null;
  transportDistance?: number | null;
  isOrganic?: boolean | null;
  isLocal?: boolean | null;
  isVegan?: boolean | null;
  isVegetarian?: boolean | null;
  sustainabilityScore?: number | null;
  certifications?: string | null;
  shortDescription?: string | null;
  ingredients?: string | null;
  allergens?: string | null;
  nutritionalInfo?: string | null;
  photos?: string[] | null;
  additionalData?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Supplier {
  id: number;
  name: string;
}

export default function ProductDataEntry() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editedProducts, setEditedProducts] = useState<Record<number, Partial<Product>>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load products from database
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => apiRequest("/api/products?limit=1000"),
  });

  // Load suppliers for dropdown
  const { data: suppliers = [] } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("/api/suppliers"),
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Product> }) =>
      apiRequest(`/api/products/${id}`, { method: "PATCH", data }),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Produkt erfolgreich aktualisiert",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Fehler beim Aktualisieren des Produkts",
        variant: "destructive",
      });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: (updates: Array<{ id: number; data: Partial<Product> }>) =>
      Promise.all(
        updates.map(({ id, data }) =>
          apiRequest(`/api/products/${id}`, { method: "PATCH", data })
        )
      ),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: `${Object.keys(editedProducts).length} Produkte erfolgreich aktualisiert`,
      });
      setEditedProducts({});
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Fehler beim Bulk-Update",
        variant: "destructive",
      });
    },
  });

  const filteredProducts = products.filter((product: Product) =>
    product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFieldChange = (productId: number, field: keyof Product, value: any) => {
    setEditedProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const saveProduct = (productId: number) => {
    const changes = editedProducts[productId];
    if (changes) {
      updateProductMutation.mutate({ id: productId, data: changes });
      setEditedProducts(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
    }
  };

  const saveAllProducts = () => {
    const updates = Object.entries(editedProducts).map(([id, data]) => ({
      id: parseInt(id),
      data
    }));
    if (updates.length > 0) {
      bulkUpdateMutation.mutate(updates);
    }
  };

  const getFieldValue = (product: Product, field: keyof Product) => {
    const productId = product.id;
    return editedProducts[productId]?.[field] !== undefined 
      ? editedProducts[productId][field] 
      : product[field];
  };

  const hasChanges = Object.keys(editedProducts).length > 0;

  if (loadingProducts) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Lade Produktdaten...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Produktdaten bearbeiten</h1>
          <p className="text-muted-foreground">
            Bearbeiten Sie Produktinformationen direkt in der Tabelle
          </p>
        </div>
        {hasChanges && (
          <Button 
            onClick={saveAllProducts}
            disabled={bulkUpdateMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            <SaveAll className="mr-2 h-4 w-4" />
            Alle speichern ({Object.keys(editedProducts).length})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Produkte durchsuchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Badge variant="outline">
              <Package className="mr-1 h-3 w-3" />
              {filteredProducts.length} Produkte
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Aktion</th>
                  <th className="text-left p-2 font-medium min-w-[200px]">Produktname</th>
                  <th className="text-left p-2 font-medium">SKU</th>
                  <th className="text-left p-2 font-medium">Barcode</th>
                  <th className="text-left p-2 font-medium">Kategorie</th>
                  <th className="text-left p-2 font-medium">
                    <Euro className="inline mr-1 h-4 w-4" />
                    Preis
                  </th>
                  <th className="text-left p-2 font-medium">MwSt %</th>
                  <th className="text-left p-2 font-medium">
                    <Package className="inline mr-1 h-4 w-4" />
                    Pfand
                  </th>
                  <th className="text-left p-2 font-medium">Pfand MwSt %</th>
                  <th className="text-left p-2 font-medium">Einheit</th>
                  <th className="text-left p-2 font-medium">Produkttyp</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Lieferant</th>
                  <th className="text-left p-2 font-medium">Lieferanten-SKU</th>
                  <th className="text-left p-2 font-medium">Artikel-Nr.</th>
                  <th className="text-left p-2 font-medium">Packungsgröße</th>
                  <th className="text-left p-2 font-medium">MHD Tage</th>
                  <th className="text-left p-2 font-medium">Min. Bestellmenge</th>
                  <th className="text-left p-2 font-medium">Einkaufspreis</th>
                  <th className="text-left p-2 font-medium">Lagerort</th>
                  <th className="text-left p-2 font-medium">
                    <FileText className="inline mr-1 h-4 w-4" />
                    Kurzbeschreibung
                  </th>
                  <th className="text-left p-2 font-medium">Beschreibung</th>
                  <th className="text-left p-2 font-medium">Inhaltsstoffe</th>
                  <th className="text-left p-2 font-medium">Allergene</th>
                  <th className="text-left p-2 font-medium">Nährwerte</th>
                  <th className="text-left p-2 font-medium">Rezept</th>
                  <th className="text-left p-2 font-medium">Tags</th>
                  <th className="text-left p-2 font-medium">
                    <Image className="inline mr-1 h-4 w-4" />
                    Fotos (URLs)
                  </th>
                  <th className="text-left p-2 font-medium">Verpackungstyp</th>
                  <th className="text-left p-2 font-medium">Recycelbar</th>
                  <th className="text-left p-2 font-medium">CO₂-Fußabdruck</th>
                  <th className="text-left p-2 font-medium">Wasserverbrauch</th>
                  <th className="text-left p-2 font-medium">Transportdistanz</th>
                  <th className="text-left p-2 font-medium">Bio</th>
                  <th className="text-left p-2 font-medium">Lokal</th>
                  <th className="text-left p-2 font-medium">Vegan</th>
                  <th className="text-left p-2 font-medium">Vegetarisch</th>
                  <th className="text-left p-2 font-medium">Nachhaltigkeitsscore</th>
                  <th className="text-left p-2 font-medium">Zertifizierungen</th>
                  <th className="text-left p-2 font-medium">Max. Menge</th>
                  <th className="text-left p-2 font-medium">Standard Menge</th>
                  <th className="text-left p-2 font-medium">Kritische Menge</th>
                  <th className="text-left p-2 font-medium">Nachfüll-Einheit</th>
                  <th className="text-left p-2 font-medium">Min. Nachfüllung</th>
                  <th className="text-left p-2 font-medium">Kritisch</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: Product) => (
                  <tr key={product.id} className="border-b hover:bg-muted/30">
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveProduct(product.id)}
                        disabled={!editedProducts[product.id] || updateProductMutation.isPending}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'productName') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'productName', e.target.value)}
                        className="min-w-[200px]"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'sku') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'sku', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'barcode') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'barcode', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={getFieldValue(product, 'category') || ''}
                        onValueChange={(value) => handleFieldChange(product.id, 'category', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Kategorie" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Getränke">Getränke</SelectItem>
                          <SelectItem value="Snacks">Snacks</SelectItem>
                          <SelectItem value="Süßwaren">Süßwaren</SelectItem>
                          <SelectItem value="Milchprodukte">Milchprodukte</SelectItem>
                          <SelectItem value="Fleischwaren">Fleischwaren</SelectItem>
                          <SelectItem value="Backwaren">Backwaren</SelectItem>
                          <SelectItem value="Warme Speisen">Warme Speisen</SelectItem>
                          <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'price') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'price', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'vat') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'vat', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'depositPrice') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'depositPrice', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'depositVat') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'depositVat', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'units') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'units', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={getFieldValue(product, 'productType') || ''}
                        onValueChange={(value) => handleFieldChange(product.id, 'productType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Typ" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="food">Lebensmittel</SelectItem>
                          <SelectItem value="beverage">Getränk</SelectItem>
                          <SelectItem value="snack">Snack</SelectItem>
                          <SelectItem value="other">Sonstiges</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select
                        value={getFieldValue(product, 'status') || ''}
                        onValueChange={(value) => handleFieldChange(product.id, 'status', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Aktiv</SelectItem>
                          <SelectItem value="inactive">Inaktiv</SelectItem>
                          <SelectItem value="discontinued">Eingestellt</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select
                        value={getFieldValue(product, 'supplierId')?.toString() || ''}
                        onValueChange={(value) => handleFieldChange(product.id, 'supplierId', parseInt(value) || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Lieferant" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((supplier: Supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id.toString()}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'supplierSku') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'supplierSku', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'articleSupplier') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'articleSupplier', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'packageSize') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'packageSize', e.target.value)}
                        placeholder="z.B. 6x0,5L"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'shelfLifeDays') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'shelfLifeDays', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'minOrderQuantity') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'minOrderQuantity', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'costPrice') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'costPrice', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'warehouseLocation') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'warehouseLocation', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'shortDescription') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'shortDescription', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'description') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'description', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'ingredients') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'ingredients', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'allergens') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'allergens', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'nutritionalInfo') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'nutritionalInfo', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                        placeholder="JSON Format"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={getFieldValue(product, 'recipe') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'recipe', e.target.value)}
                        className="min-w-[200px]"
                        rows={2}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'tags') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'tags', e.target.value)}
                        placeholder="Tag1, Tag2"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        value={Array.isArray(getFieldValue(product, 'photos')) 
                          ? (getFieldValue(product, 'photos') as string[]).join('\n') 
                          : getFieldValue(product, 'photos') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'photos', e.target.value.split('\n').filter(url => url.trim()))}
                        className="min-w-[200px]"
                        rows={3}
                        placeholder="Eine URL pro Zeile"
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={getFieldValue(product, 'packagingType') || ''}
                        onValueChange={(value) => handleFieldChange(product.id, 'packagingType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Verpackung" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="glass">Glas</SelectItem>
                          <SelectItem value="plastic">Plastik</SelectItem>
                          <SelectItem value="aluminum">Aluminium</SelectItem>
                          <SelectItem value="paper">Papier</SelectItem>
                          <SelectItem value="biodegradable">Biologisch abbaubar</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'packagingRecyclable') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'packagingRecyclable', checked)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'carbonFootprint') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'carbonFootprint', parseFloat(e.target.value) || null)}
                        placeholder="kg CO₂"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'waterUsage') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'waterUsage', parseFloat(e.target.value) || null)}
                        placeholder="Liter"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={getFieldValue(product, 'transportDistance') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'transportDistance', parseFloat(e.target.value) || null)}
                        placeholder="km"
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'isOrganic') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'isOrganic', checked)}
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'isLocal') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'isLocal', checked)}
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'isVegan') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'isVegan', checked)}
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'isVegetarian') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'isVegetarian', checked)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={getFieldValue(product, 'sustainabilityScore') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'sustainabilityScore', parseFloat(e.target.value) || null)}
                        placeholder="0-100"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={getFieldValue(product, 'certifications') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'certifications', e.target.value)}
                        placeholder="Bio, Fairtrade"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'amountMax') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'amountMax', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'amountStandard') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'amountStandard', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'amountCritical') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'amountCritical', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'refillUnitSize') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'refillUnitSize', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={getFieldValue(product, 'minRefill') || ''}
                        onChange={(e) => handleFieldChange(product.id, 'minRefill', parseInt(e.target.value) || null)}
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={getFieldValue(product, 'critical') || false}
                        onCheckedChange={(checked) => handleFieldChange(product.id, 'critical', checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Keine Produkte gefunden</h3>
              <p>Keine Produkte verfügbar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
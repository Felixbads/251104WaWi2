import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, Search } from "lucide-react";

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
  const { data: productsData = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => fetch('/api/products?limit=1000').then(res => res.json()),
  });

  // Load suppliers for dropdown
  const { data: suppliersData = [] } = useQuery({
    queryKey: ["/api/suppliers"],  
    queryFn: () => fetch('/api/suppliers').then(res => res.json()),
  });

  // Ensure data is always an array
  const products = Array.isArray(productsData) ? productsData : 
                   (productsData?.products && Array.isArray(productsData.products)) ? productsData.products : [];
  
  const suppliers = Array.isArray(suppliersData) ? suppliersData : 
                    (suppliersData?.suppliers && Array.isArray(suppliersData.suppliers)) ? suppliersData.suppliers : [];

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

  const getStringValue = (product: Product, field: keyof Product): string => {
    const value = product[field];
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const getBooleanValue = (product: Product, field: keyof Product): boolean => {
    const value = product[field];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  };

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
    if (!changes) return;

    updateProductMutation.mutate({
      id: productId,
      data: changes
    });

    setEditedProducts(prev => {
      const newState = { ...prev };
      delete newState[productId];
      return newState;
    });
  };

  const saveBulkChanges = () => {
    const updates = Object.entries(editedProducts).map(([id, data]) => ({
      id: parseInt(id),
      data
    }));

    bulkUpdateMutation.mutate(updates);
  };

  const getCurrentValue = (product: Product, field: keyof Product) => {
    const productId = product.id;
    const editedValue = editedProducts[productId]?.[field];
    return editedValue !== undefined ? editedValue : product[field];
  };

  if (loadingProducts) {
    return <div className="p-6">Lade Produktdaten...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Produktdatenbearbeitung</h1>
        
        {/* Search and Bulk Actions */}
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Suche nach Produktname, SKU oder Barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {Object.keys(editedProducts).length > 0 && (
            <Button
              onClick={saveBulkChanges}
              disabled={bulkUpdateMutation.isPending}
              className="whitespace-nowrap"
            >
              Alle Änderungen speichern ({Object.keys(editedProducts).length})
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          {filteredProducts.length} von {products.length} Produkten angezeigt
        </div>
      </div>

      {/* Products Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium min-w-[80px]">Aktion</th>
                <th className="text-left p-2 font-medium min-w-[200px]">Produktname</th>
                <th className="text-left p-2 font-medium">SKU</th>
                <th className="text-left p-2 font-medium">Barcode</th>
                <th className="text-left p-2 font-medium">Preis</th>
                <th className="text-left p-2 font-medium">Kategorie</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Lieferant</th>
                <th className="text-left p-2 font-medium">Pfand</th>
                <th className="text-left p-2 font-medium">MwSt</th>
                <th className="text-left p-2 font-medium">Bio</th>
                <th className="text-left p-2 font-medium">Lokal</th>
                <th className="text-left p-2 font-medium">Vegan</th>
                <th className="text-left p-2 font-medium">Vegetarisch</th>
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
                      value={getStringValue(product, 'productName')}
                      onChange={(e) => handleFieldChange(product.id, 'productName', e.target.value)}
                      className="min-w-[200px]"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={getStringValue(product, 'sku')}
                      onChange={(e) => handleFieldChange(product.id, 'sku', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={getStringValue(product, 'barcode')}
                      onChange={(e) => handleFieldChange(product.id, 'barcode', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={getStringValue(product, 'price')}
                      onChange={(e) => handleFieldChange(product.id, 'price', parseFloat(e.target.value) || null)}
                    />
                  </td>
                  <td className="p-2">
                    <Select
                      value={getStringValue(product, 'category')}
                      onValueChange={(value) => handleFieldChange(product.id, 'category', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kategorie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Getränke">Getränke</SelectItem>
                        <SelectItem value="Snacks">Snacks</SelectItem>
                        <SelectItem value="Süßwaren">Süßwaren</SelectItem>
                        <SelectItem value="Fleisch">Fleisch</SelectItem>
                        <SelectItem value="Milchprodukte">Milchprodukte</SelectItem>
                        <SelectItem value="Alkohol">Alkohol</SelectItem>
                        <SelectItem value="Sonstige">Sonstige</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Select
                      value={getStringValue(product, 'status')}
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
                      value={getStringValue(product, 'supplierId')}
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
                      type="number"
                      step="0.01"
                      value={getStringValue(product, 'depositPrice')}
                      onChange={(e) => handleFieldChange(product.id, 'depositPrice', parseFloat(e.target.value) || null)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={getStringValue(product, 'vat')}
                      onChange={(e) => handleFieldChange(product.id, 'vat', parseFloat(e.target.value) || null)}
                    />
                  </td>
                  <td className="p-2">
                    <Checkbox
                      checked={getBooleanValue(product, 'isOrganic')}
                      onCheckedChange={(checked) => handleFieldChange(product.id, 'isOrganic', checked === true)}
                    />
                  </td>
                  <td className="p-2">
                    <Checkbox
                      checked={getBooleanValue(product, 'isLocal')}
                      onCheckedChange={(checked) => handleFieldChange(product.id, 'isLocal', checked === true)}
                    />
                  </td>
                  <td className="p-2">
                    <Checkbox
                      checked={getBooleanValue(product, 'isVegan')}
                      onCheckedChange={(checked) => handleFieldChange(product.id, 'isVegan', checked === true)}
                    />
                  </td>
                  <td className="p-2">
                    <Checkbox
                      checked={getBooleanValue(product, 'isVegetarian')}
                      onCheckedChange={(checked) => handleFieldChange(product.id, 'isVegetarian', checked === true)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Keine Produkte gefunden.
        </div>
      )}
    </div>
  );
}
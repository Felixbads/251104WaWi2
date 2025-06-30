import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, Search, Upload } from "lucide-react";

interface Product {
  id: number;
  vendonId: string;
  productName: string;
  price?: number | null;
  category?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  status?: string | null;
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
  certifications?: string | null;
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

  // Fetch products
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => fetch('/api/products?limit=1000').then(res => res.json()),
  });

  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ["/api/suppliers"],  
    queryFn: () => fetch('/api/suppliers').then(res => res.json()),
  });

  // Ensure data is always an array - API returns { data: [...], meta: {...} }
  const products = Array.isArray(productsData) ? productsData : 
                   (productsData?.data && Array.isArray(productsData.data)) ? productsData.data : [];
  
  const suppliers = Array.isArray(suppliersData) ? suppliersData : 
                    (suppliersData?.data && Array.isArray(suppliersData.data)) ? suppliersData.data : [];

  // Single product update mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Product> }) => {
      return apiRequest(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
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
    mutationFn: async (updates: Array<{ id: number; data: Partial<Product> }>) => {
      return Promise.all(
        updates.map(({ id, data }) =>
          apiRequest(`/api/products/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
          })
        )
      );
    },
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
    product.category?.toLowerCase().includes(searchTerm.toLowerCase())
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
              placeholder="Suche nach Produktname oder Kategorie..."
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
                <th className="text-left p-2 font-medium min-w-[150px]">Kurzbeschreibung</th>
                <th className="text-left p-2 font-medium min-w-[200px]">Detailbeschreibung</th>
                <th className="text-left p-2 font-medium">Preis</th>
                <th className="text-left p-2 font-medium">Kategorie</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Lieferant</th>
                <th className="text-left p-2 font-medium">Pfand</th>
                <th className="text-left p-2 font-medium">MwSt</th>
                <th className="text-left p-2 font-medium">Gebindegröße</th>
                <th className="text-left p-2 font-medium min-w-[150px]">Inhaltsstoffe</th>
                <th className="text-left p-2 font-medium min-w-[150px]">Allergene</th>
                <th className="text-left p-2 font-medium">Bio</th>
                <th className="text-left p-2 font-medium">Lokal</th>
                <th className="text-left p-2 font-medium">Vegan</th>
                <th className="text-left p-2 font-medium">Vegetarisch</th>
                <th className="text-left p-2 font-medium">Foto</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product: Product) => (
                <tr key={product.id} className="border-b hover:bg-muted/30">
                  {/* Aktion */}
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
                  
                  {/* Produktname */}
                  <td className="p-2">
                    <Input
                      value={String(getCurrentValue(product, 'productName') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'productName', e.target.value)}
                      className="min-w-[200px]"
                    />
                  </td>
                  
                  {/* Kurzbeschreibung */}
                  <td className="p-2">
                    <Input
                      value={String(getCurrentValue(product, 'shortDescription') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'shortDescription', e.target.value)}
                      className="min-w-[150px]"
                    />
                  </td>
                  
                  {/* Detailbeschreibung */}
                  <td className="p-2">
                    <textarea
                      value={String(getCurrentValue(product, 'description') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'description', e.target.value)}
                      className="w-full p-1 border rounded resize-none min-w-[200px] h-16"
                      rows={2}
                    />
                  </td>
                  
                  {/* Preis */}
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={String(getCurrentValue(product, 'price') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'price', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  
                  {/* Kategorie */}
                  <td className="p-2">
                    <select
                      value={String(getCurrentValue(product, 'category') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                      className="w-full p-1 border rounded"
                    >
                      <option value="">Kategorie wählen</option>
                      <option value="Getränke">Getränke</option>
                      <option value="Snacks">Snacks</option>
                      <option value="Süßwaren">Süßwaren</option>
                      <option value="Milchprodukte">Milchprodukte</option>
                      <option value="Fleischwaren">Fleischwaren</option>
                      <option value="Backwaren">Backwaren</option>
                      <option value="Alkoholische Getränke">Alkoholische Getränke</option>
                      <option value="Sonstiges">Sonstiges</option>
                    </select>
                  </td>
                  
                  {/* Status */}
                  <td className="p-2">
                    <select
                      value={String(getCurrentValue(product, 'status') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'status', e.target.value)}
                      className="w-full p-1 border rounded"
                    >
                      <option value="active">Aktiv</option>
                      <option value="inactive">Inaktiv</option>
                      <option value="discontinued">Eingestellt</option>
                    </select>
                  </td>
                  
                  {/* Lieferant */}
                  <td className="p-2">
                    <select
                      value={String(getCurrentValue(product, 'supplierId') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'supplierId', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-1 border rounded"
                    >
                      <option value="">Kein Lieferant</option>
                      {suppliers.map((supplier: Supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Pfand */}
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={String(getCurrentValue(product, 'depositPrice') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'depositPrice', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  
                  {/* MwSt */}
                  <td className="p-2">
                    <select
                      value={String(getCurrentValue(product, 'vat') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'vat', parseInt(e.target.value) || 19)}
                      className="w-full p-1 border rounded"
                    >
                      <option value="7">7%</option>
                      <option value="19">19%</option>
                    </select>
                  </td>
                  
                  {/* Gebindegröße */}
                  <td className="p-2">
                    <Input
                      value={String(getCurrentValue(product, 'packageSize') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'packageSize', e.target.value)}
                    />
                  </td>
                  
                  {/* Inhaltsstoffe */}
                  <td className="p-2">
                    <textarea
                      value={String(getCurrentValue(product, 'ingredients') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'ingredients', e.target.value)}
                      className="w-full p-1 border rounded resize-none min-w-[150px] h-16"
                      rows={2}
                    />
                  </td>
                  
                  {/* Allergene */}
                  <td className="p-2">
                    <textarea
                      value={String(getCurrentValue(product, 'allergens') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'allergens', e.target.value)}
                      className="w-full p-1 border rounded resize-none min-w-[150px] h-16"
                      rows={2}
                    />
                  </td>
                  
                  {/* Bio */}
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={Boolean(getCurrentValue(product, 'isOrganic'))}
                      onChange={(e) => handleFieldChange(product.id, 'isOrganic', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  
                  {/* Lokal */}
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={Boolean(getCurrentValue(product, 'isLocal'))}
                      onChange={(e) => handleFieldChange(product.id, 'isLocal', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  
                  {/* Vegan */}
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={Boolean(getCurrentValue(product, 'isVegan'))}
                      onChange={(e) => handleFieldChange(product.id, 'isVegan', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  
                  {/* Vegetarisch */}
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={Boolean(getCurrentValue(product, 'isVegetarian'))}
                      onChange={(e) => handleFieldChange(product.id, 'isVegetarian', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  
                  {/* Foto */}
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // TODO: Implement file upload functionality
                            console.log('File selected:', file.name);
                          }
                        }}
                        className="text-xs"
                      />
                      <Button size="sm" variant="outline" className="text-xs">
                        <Upload className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
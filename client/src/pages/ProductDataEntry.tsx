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

  // Fetch product categories
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/product-categories"],
    queryFn: () => fetch('/api/product-categories').then(res => res.json()),
  });

  // Ensure data is always an array - API returns { data: [...], meta: {...} }
  const products = Array.isArray(productsData) ? productsData : 
                   (productsData?.data && Array.isArray(productsData.data)) ? productsData.data : [];
  
  const suppliers = Array.isArray(suppliersData) ? suppliersData : 
                    (suppliersData?.data && Array.isArray(suppliersData.data)) ? suppliersData.data : [];

  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  // Single product update mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Product> }) => {
      const response = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
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
        updates.map(async ({ id, data }) => {
          const response = await fetch(`/api/products/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          return response.json();
        })
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

  // Handle file upload
  const handleFileUpload = async (productId: number, file: File) => {
    try {
      const formData = new FormData();
      formData.append('photos', file);

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update the product with the photo URL
        if (result.uploadedPhotos && result.uploadedPhotos[0]) {
          const photoUrl = result.uploadedPhotos[0].url;
          handleFieldChange(productId, 'photoUrl', photoUrl);
        }
        
        toast({
          title: "Erfolg",
          description: "Foto wurde erfolgreich hochgeladen.",
        });
        
        // Refresh the products data to show updated photo status
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Fehler",
        description: "Foto konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    }
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
                <th className="text-left p-2 font-medium w-16">Aktion</th>
                <th className="text-left p-2 font-medium w-16">Foto</th>
                <th className="text-left p-2 font-medium w-56">Produktname</th>
                <th className="text-left p-2 font-medium w-44">Kurzbeschreibung</th>
                <th className="text-left p-2 font-medium w-52">Detailbeschreibung</th>
                <th className="text-left p-2 font-medium w-32">Kategorie</th>
                <th className="text-left p-2 font-medium w-40">Lieferant</th>
                <th className="text-left p-2 font-medium w-20">Pfand</th>
                <th className="text-left p-2 font-medium w-32">Gebindegröße</th>
                <th className="text-left p-2 font-medium w-48">Inhaltsstoffe</th>
                <th className="text-left p-2 font-medium w-48">Allergene</th>
                <th className="text-left p-2 font-medium w-20">Upload</th>
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
                  
                  {/* Foto Thumbnail */}
                  <td className="p-2 w-16">
                    <div className="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center">
                      {String(getCurrentValue(product, 'description')).includes('Foto hochgeladen:') ? (
                        <div className="w-10 h-10 bg-green-100 rounded flex items-center justify-center">
                          <span className="text-xs text-green-600">📷</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Kein Foto</span>
                      )}
                    </div>
                  </td>
                  
                  {/* Produktname (Read-only from Vendon) */}
                  <td className="p-2 w-56">
                    <div className="text-xs bg-gray-50 p-2 rounded border leading-tight max-h-16 overflow-y-auto">
                      {String(getCurrentValue(product, 'productName') || '')}
                    </div>
                  </td>
                  
                  {/* Kurzbeschreibung */}
                  <td className="p-2 w-44">
                    <Input
                      value={String(getCurrentValue(product, 'shortDescription') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'shortDescription', e.target.value)}
                      className="w-full text-xs"
                    />
                  </td>
                  
                  {/* Detailbeschreibung */}
                  <td className="p-2 w-52">
                    <textarea
                      value={String(getCurrentValue(product, 'description') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'description', e.target.value)}
                      className="w-full p-1 border rounded resize-none h-16 text-xs"
                      rows={2}
                    />
                  </td>
                  
                  {/* Kategorie */}
                  <td className="p-2 w-32">
                    <select
                      value={String(getCurrentValue(product, 'category') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                      className="w-full p-1 border rounded text-xs"
                    >
                      <option value="">Kategorie wählen</option>
                      {categories.map((category: string) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Lieferant */}
                  <td className="p-2 w-40">
                    <select
                      value={String(getCurrentValue(product, 'supplierId') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'supplierId', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-1 border rounded text-xs"
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
                  <td className="p-2 w-20">
                    <Input
                      type="number"
                      step="0.01"
                      value={String(getCurrentValue(product, 'depositPrice') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'depositPrice', parseFloat(e.target.value) || 0)}
                      className="w-full text-xs"
                    />
                  </td>
                  
                  {/* Gebindegröße */}
                  <td className="p-2 w-32">
                    <Input
                      value={String(getCurrentValue(product, 'packageSize') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'packageSize', e.target.value)}
                      className="w-full text-xs"
                    />
                  </td>
                  
                  {/* Inhaltsstoffe */}
                  <td className="p-2 w-48">
                    <textarea
                      value={String(getCurrentValue(product, 'ingredients') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'ingredients', e.target.value)}
                      className="w-full p-1 border rounded resize-none h-16 text-xs"
                      rows={2}
                    />
                  </td>
                  
                  {/* Allergene */}
                  <td className="p-2 w-48">
                    <textarea
                      value={String(getCurrentValue(product, 'allergens') || '')}
                      onChange={(e) => handleFieldChange(product.id, 'allergens', e.target.value)}
                      className="w-full p-1 border rounded resize-none h-16 text-xs"
                      rows={2}
                    />
                  </td>
                  
                  {/* Foto Upload */}
                  <td className="p-2 w-20">
                    <div className="flex flex-col gap-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(product.id, file);
                          }
                        }}
                        className="text-xs hidden"
                        id={`file-${product.id}`}
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs h-6 px-2"
                        onClick={() => document.getElementById(`file-${product.id}`)?.click()}
                      >
                        <Upload className="h-3 w-3" />
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
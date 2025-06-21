import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { PhotoUpload } from '@/components/PhotoUpload';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@shared/schema';

interface ProductEditDialogProps {
  product: Product;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedProduct: Partial<Product>) => void;
}

export function ProductEditDialog({ product, isOpen, onOpenChange, onSave }: ProductEditDialogProps) {
  const [formData, setFormData] = useState({
    productName: product.productName || '',
    shortDescription: product.shortDescription || '',
    description: product.description || '',
    ingredients: product.ingredients || '',
    allergens: product.allergens || '',
    nutritionalInfo: product.nutritionalInfo || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    price: product.price || 0,
    category: product.category || '',
    packageSize: product.packageSize || '',
    minOrderQuantity: product.minOrderQuantity || 1,
    shelfLifeDays: product.shelfLifeDays || 0,
    isOrganic: product.isOrganic || false,
    isVegan: product.isVegan || false,
    isVegetarian: product.isVegetarian || false,
    isLocal: product.isLocal || false,
    sustainabilityScore: product.sustainabilityScore || 0,
    photos: product.photos || []
  });

  const { toast } = useToast();

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.productName.trim()) {
      toast({
        title: "Validierungsfehler",
        description: "Produktname ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    onSave(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Produkt bearbeiten: {product.productName}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">Allgemein</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="ingredients">Inhaltsstoffe</TabsTrigger>
            <TabsTrigger value="nutrition">Nährwerte</TabsTrigger>
            <TabsTrigger value="media">Fotos</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Grundinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="productName">Produktname *</Label>
                  <Input
                    id="productName"
                    value={formData.productName}
                    onChange={(e) => handleInputChange('productName', e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="shortDescription">Kurzbeschreibung</Label>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => handleInputChange('shortDescription', e.target.value)}
                    placeholder="Kurze Produktbeschreibung..."
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Detailbeschreibung</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Detaillierte Produktbeschreibung..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => handleInputChange('sku', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      value={formData.barcode}
                      onChange={(e) => handleInputChange('barcode', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Preis (€)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Kategorie</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produktdetails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="packageSize">Gebindegröße</Label>
                    <Input
                      id="packageSize"
                      value={formData.packageSize}
                      onChange={(e) => handleInputChange('packageSize', e.target.value)}
                      placeholder="z.B. 6x0,5L"
                    />
                  </div>
                  <div>
                    <Label htmlFor="minOrderQuantity">Mindestbestellmenge</Label>
                    <Input
                      id="minOrderQuantity"
                      type="number"
                      value={formData.minOrderQuantity}
                      onChange={(e) => handleInputChange('minOrderQuantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="shelfLifeDays">Haltbarkeit (Tage)</Label>
                    <Input
                      id="shelfLifeDays"
                      type="number"
                      value={formData.shelfLifeDays}
                      onChange={(e) => handleInputChange('shelfLifeDays', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sustainabilityScore">Nachhaltigkeitsscore (0-100)</Label>
                    <Input
                      id="sustainabilityScore"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.sustainabilityScore}
                      onChange={(e) => handleInputChange('sustainabilityScore', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Produkteigenschaften</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isOrganic"
                        checked={formData.isOrganic}
                        onCheckedChange={(checked) => handleInputChange('isOrganic', checked)}
                      />
                      <Label htmlFor="isOrganic">Bio/Organisch</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isVegan"
                        checked={formData.isVegan}
                        onCheckedChange={(checked) => handleInputChange('isVegan', checked)}
                      />
                      <Label htmlFor="isVegan">Vegan</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isVegetarian"
                        checked={formData.isVegetarian}
                        onCheckedChange={(checked) => handleInputChange('isVegetarian', checked)}
                      />
                      <Label htmlFor="isVegetarian">Vegetarisch</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isLocal"
                        checked={formData.isLocal}
                        onCheckedChange={(checked) => handleInputChange('isLocal', checked)}
                      />
                      <Label htmlFor="isLocal">Regional</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ingredients" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Inhaltsstoffe und Allergene</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ingredients">Inhaltsstoffe</Label>
                  <Textarea
                    id="ingredients"
                    value={formData.ingredients}
                    onChange={(e) => handleInputChange('ingredients', e.target.value)}
                    placeholder="Wasser, Zucker, Kohlensäure, natürliche Aromen..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="allergens">Allergene</Label>
                  <Textarea
                    id="allergens"
                    value={formData.allergens}
                    onChange={(e) => handleInputChange('allergens', e.target.value)}
                    placeholder="Kann Spuren von Nüssen enthalten..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Nährwertangaben</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="nutritionalInfo">Nährwerte (pro 100g/ml)</Label>
                  <Textarea
                    id="nutritionalInfo"
                    value={formData.nutritionalInfo}
                    onChange={(e) => handleInputChange('nutritionalInfo', e.target.value)}
                    placeholder="Energie: 42 kcal / 176 kJ&#10;Fett: 0g&#10;- davon gesättigte Fettsäuren: 0g&#10;Kohlenhydrate: 10,6g&#10;- davon Zucker: 10,6g&#10;Eiweiß: 0g&#10;Salz: 0,01g"
                    rows={8}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="media" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produktfotos</CardTitle>
              </CardHeader>
              <CardContent>
                <PhotoUpload
                  photos={formData.photos}
                  onPhotosChange={(photos) => handleInputChange('photos', photos)}
                  maxPhotos={10}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
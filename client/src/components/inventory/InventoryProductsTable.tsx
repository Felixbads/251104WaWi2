import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { CartItem, useInventoryCart } from "./InventoryCartContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface InventoryProduct {
  id: number;
  productId: number;
  productName: string;
  packageSize?: string | null;
  quantity: number;
  warehouseId: number;
  warehouseName?: string;
  status?: string;
}

interface InventoryProductsTableProps {
  products: InventoryProduct[];
  onAddToCart: (product: InventoryProduct, quantity: number) => void;
  warehouseId: number;
}

type UnitType = 'pieces' | 'packages';

// Hilfsfunktion zum Parsen der Gebindegröße
function parsePackageSize(packageSize: string | null | undefined): number {
  if (!packageSize) return 1;
  
  // Regex für verschiedene Formate: "24x330ml", "6x0,5L", "12 Flaschen", etc.
  const patterns = [
    /^(\d+)x/,          // "24x330ml" -> 24
    /^(\d+)\s*Stück/i,  // "12 Stück" -> 12
    /^(\d+)\s*Fl/i,     // "6 Flaschen" -> 6
    /^(\d+)[^0-9]/,     // "20..." -> 20
    /(\d+)/             // Fallback für erste Zahl
  ];
  
  for (const pattern of patterns) {
    const match = packageSize.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 1) return num;
    }
  }
  
  return 1; // Fallback für einzelne Stücke
}

// Gebinde-Informationen für ein Produkt
function getPackageInfo(product: InventoryProduct) {
  const packageCount = parsePackageSize(product.packageSize);
  const hasPackaging = packageCount > 1;
  
  return {
    packageCount,
    hasPackaging,
    piecesInStock: product.quantity,
    packagesInStock: hasPackaging ? Math.floor(product.quantity / packageCount) : 0,
    packageLabel: product.packageSize ? `Gebinde (${product.packageSize})` : 'Gebinde'
  };
}

export default function InventoryProductsTable({
  products,
  onAddToCart,
  warehouseId
}: InventoryProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const { cartItems } = useInventoryCart();

  // Hilfsfunktion: Verfügbare Menge berechnen (Lagerbestand - Warenkorb-Menge)
  const getAvailableQuantity = (product: InventoryProduct) => {
    const cartItem = cartItems.find(item => item.productId === product.productId);
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    return Math.max(0, product.quantity - cartQuantity);
  };

  // Hilfsfunktion: Erweiterte Produktinformationen mit verfügbaren Mengen
  const getEnhancedProductInfo = (product: InventoryProduct) => {
    const availableQuantity = getAvailableQuantity(product);
    const packageInfo = getPackageInfo({ ...product, quantity: availableQuantity });
    return {
      ...product,
      availableQuantity,
      packageInfo
    };
  };
  const [quantityInputs, setQuantityInputs] = useState<Record<number, number>>({});
  const [unitTypes, setUnitTypes] = useState<Record<number, UnitType>>({});
  
  // Filtert Produkte basierend auf dem Suchbegriff
  const filteredProducts = products.filter((product) => {
    if (searchTerm === "") return true;
    
    const term = searchTerm.toLowerCase();
    return (
      product.productName.toLowerCase().includes(term) ||
      String(product.productId).includes(term)
    );
  });

  // Berechnet die tatsächliche Stückzahl basierend auf der Einheit
  const calculateActualQuantity = (product: InventoryProduct, inputQuantity: number, unitType: UnitType): number => {
    if (unitType === 'pieces') {
      return inputQuantity;
    } else {
      const packageInfo = getPackageInfo(product);
      return inputQuantity * packageInfo.packageCount;
    }
  };

  // Fügt ein Produkt zum Warenkorb hinzu
  const handleAddToCart = (product: InventoryProduct) => {
    const inputQuantity = quantityInputs[product.id] || 1;
    const unitType = unitTypes[product.id] || 'pieces';
    const actualQuantity = calculateActualQuantity(product, inputQuantity, unitType);
    
    const availableQuantity = getAvailableQuantity(product);
    if (actualQuantity > 0 && actualQuantity <= availableQuantity) {
      onAddToCart(product, actualQuantity);
      
      // Zurücksetzen der Auswahl und Menge nach dem Hinzufügen
      const newSelected = new Set(selectedRows);
      newSelected.delete(product.id);
      setSelectedRows(newSelected);
      
      const newQuantities = { ...quantityInputs };
      delete newQuantities[product.id];
      setQuantityInputs(newQuantities);
      
      const newUnitTypes = { ...unitTypes };
      delete newUnitTypes[product.id];
      setUnitTypes(newUnitTypes);
    }
  };

  // Behandelt Checkbox-Änderungen
  const handleCheckboxChange = (productId: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedRows(newSelected);
  };

  // Behandelt Mengenänderungen
  const handleQuantityChange = (productId: number, value: string) => {
    const quantity = parseInt(value) || 0;
    setQuantityInputs(prev => ({
      ...prev,
      [productId]: quantity
    }));
  };

  // Behandelt Einheitenwechsel
  const handleUnitTypeChange = (productId: number, unitType: UnitType) => {
    setUnitTypes(prev => ({
      ...prev,
      [productId]: unitType
    }));
  };

  // Fügt alle ausgewählten Produkte zum Warenkorb hinzu
  const handleAddSelectedToCart = () => {
    selectedRows.forEach(productId => {
      const product = products.find(p => p.id === productId);
      if (product) {
        handleAddToCart(product);
      }
    });
  };

  // Berechnet verfügbare Menge für Anzeige (berücksichtigt Warenkorb)
  const getAvailableQuantityDisplay = (enhancedProduct: any, unitType: UnitType): string => {
    const packageInfo = enhancedProduct.packageInfo;
    
    if (unitType === 'pieces') {
      return `${enhancedProduct.availableQuantity} Stück verfügbar`;
    } else if (packageInfo.hasPackaging) {
      return `${packageInfo.packagesInStock} Gebinde verfügbar (${packageInfo.packagesInStock * packageInfo.packageCount} Stück)`;
    } else {
      return `${enhancedProduct.availableQuantity} Stück verfügbar`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Suchleiste */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Produkte suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {selectedRows.size > 0 && (
          <Button onClick={handleAddSelectedToCart} className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            Ausgewählte hinzufügen ({selectedRows.size})
          </Button>
        )}
      </div>

      {/* Produkttabelle */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedRows.has(p.id))}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedRows(new Set(filteredProducts.map(p => p.id)));
                    } else {
                      setSelectedRows(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Produktname</TableHead>
              <TableHead>Gebindegröße</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead>Einheit</TableHead>
              <TableHead>Menge</TableHead>
              <TableHead>Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => {
              const enhancedProduct = getEnhancedProductInfo(product);
              const packageInfo = enhancedProduct.packageInfo;
              const unitType = unitTypes[product.id] || 'pieces';
              const inputQuantity = quantityInputs[product.id] || 1;
              const actualQuantity = calculateActualQuantity(product, inputQuantity, unitType);
              const isValidQuantity = actualQuantity > 0 && actualQuantity <= enhancedProduct.availableQuantity;

              return (
                <TableRow key={product.id} className={selectedRows.has(product.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(product.id)}
                      onCheckedChange={(checked) => handleCheckboxChange(product.id, !!checked)}
                    />
                  </TableCell>
                  
                  <TableCell className="font-medium">
                    {product.productName}
                  </TableCell>
                  
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {product.packageSize || "Einzelstück"}
                    </span>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{enhancedProduct.availableQuantity} Stück verfügbar</div>
                      {enhancedProduct.packageInfo.hasPackaging && (
                        <div className="text-muted-foreground">
                          {enhancedProduct.packageInfo.packagesInStock} Gebinde verfügbar
                        </div>
                      )}
                      {enhancedProduct.availableQuantity < product.quantity && (
                        <div className="text-xs text-orange-600">
                          ({product.quantity - enhancedProduct.availableQuantity} im Warenkorb)
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {packageInfo.hasPackaging ? (
                      <Select
                        value={unitType}
                        onValueChange={(value: UnitType) => handleUnitTypeChange(product.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pieces">Stück</SelectItem>
                          <SelectItem value="packages">{packageInfo.packageLabel}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">Stück</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min="1"
                        max={unitType === 'pieces' ? enhancedProduct.availableQuantity : enhancedProduct.packageInfo.packagesInStock}
                        value={inputQuantity}
                        onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                        className={`w-24 ${!isValidQuantity ? 'border-red-500' : ''}`}
                      />
                      <div className="text-xs text-muted-foreground">
                        {getAvailableQuantityDisplay(enhancedProduct, unitType)}
                      </div>
                      {actualQuantity !== inputQuantity && (
                        <div className="text-xs text-blue-600">
                          = {actualQuantity} Stück
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => handleAddToCart(product)}
                      disabled={!isValidQuantity}
                      className="flex items-center gap-1"
                    >
                      <PlusCircle className="h-3 w-3" />
                      Hinzufügen
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "Keine Produkte gefunden." : "Keine Produkte im Lager verfügbar."}
        </div>
      )}
    </div>
  );
}
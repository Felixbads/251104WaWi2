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
import { CartItem } from "./InventoryCartContext";
import { Checkbox } from "@/components/ui/checkbox";

export interface InventoryProduct {
  id: number;
  productId: number;
  productName: string;
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

export default function InventoryProductsTable({
  products,
  onAddToCart,
  warehouseId
}: InventoryProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [quantityInputs, setQuantityInputs] = useState<Record<number, number>>({});
  
  // Filtert Produkte basierend auf dem Suchbegriff
  const filteredProducts = products.filter((product) => {
    if (searchTerm === "") return true;
    
    const term = searchTerm.toLowerCase();
    return (
      product.productName.toLowerCase().includes(term) ||
      String(product.productId).includes(term)
    );
  });

  // Fügt ein Produkt zum Warenkorb hinzu
  const handleAddToCart = (product: InventoryProduct) => {
    const quantity = quantityInputs[product.id] || 1;
    
    if (quantity > 0 && quantity <= product.quantity) {
      onAddToCart(product, quantity);
      
      // Zurücksetzen der Auswahl und Menge nach dem Hinzufügen
      const newSelected = new Set(selectedRows);
      newSelected.delete(product.id);
      setSelectedRows(newSelected);
      
      const newQuantities = { ...quantityInputs };
      delete newQuantities[product.id];
      setQuantityInputs(newQuantities);
    }
  };

  // Verarbeitet Änderungen an der Mengeneingabe
  const handleQuantityChange = (id: number, value: string) => {
    const parsedValue = parseInt(value, 10);
    if (!isNaN(parsedValue) && parsedValue > 0) {
      setQuantityInputs(prev => ({ ...prev, [id]: parsedValue }));
    }
  };

  // Schaltet die Auswahl eines Produkts um
  const toggleRowSelection = (id: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      
      // Entferne die Mengeneingabe
      const newQuantities = { ...quantityInputs };
      delete newQuantities[id];
      setQuantityInputs(newQuantities);
    } else {
      newSelected.add(id);
      
      // Initialisiere Mengeneingabe mit 1
      setQuantityInputs(prev => ({ ...prev, [id]: 1 }));
    }
    setSelectedRows(newSelected);
  };

  // Fügt alle ausgewählten Produkte zum Warenkorb hinzu
  const addSelectedToCart = () => {
    selectedRows.forEach(id => {
      const product = products.find(p => p.id === id);
      if (product) {
        handleAddToCart(product);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Produktname oder ID..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {selectedRows.size > 0 && (
          <Button 
            variant="outline" 
            onClick={addSelectedToCart}
            className="whitespace-nowrap"
          >
            {selectedRows.size} ausgewählte hinzufügen
          </Button>
        )}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: 50 }}>
                <span className="sr-only">Auswahl</span>
              </TableHead>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Verfügbar</TableHead>
              <TableHead className="text-right">Menge</TableHead>
              <TableHead style={{ width: 100 }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Keine Produkte gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(product.id)}
                      onCheckedChange={() => toggleRowSelection(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{product.productName}</div>
                      <div className="text-sm text-muted-foreground">ID: {product.productId}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{product.quantity}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      max={product.quantity}
                      value={quantityInputs[product.id] || ""}
                      onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                      placeholder="Menge"
                      className="w-20 text-right"
                      disabled={!selectedRows.has(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddToCart(product)}
                      disabled={
                        !selectedRows.has(product.id) || 
                        !quantityInputs[product.id] ||
                        quantityInputs[product.id] <= 0 ||
                        quantityInputs[product.id] > product.quantity
                      }
                    >
                      <PlusCircle className="h-4 w-4 mr-1" /> 
                      <span>Hinzufügen</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
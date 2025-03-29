import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCcw, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Products() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Mock data for demonstration
  const mockProducts = [
    { id: 1, productName: "Espresso", category: "Kaffee", price: 1.5, status: "active" },
    { id: 2, productName: "Cappuccino", category: "Kaffee", price: 2.0, status: "active" },
    { id: 3, productName: "Latte Macchiato", category: "Kaffee", price: 2.3, status: "active" },
    { id: 4, productName: "Schokolade", category: "Heiße Getränke", price: 1.8, status: "active" },
    { id: 5, productName: "Cola", category: "Kaltgetränke", price: 1.8, status: "active" },
    { id: 6, productName: "Wasser", category: "Kaltgetränke", price: 1.2, status: "inactive" },
    { id: 7, productName: "Snickers", category: "Snacks", price: 1.2, status: "active" },
    { id: 8, productName: "Mars", category: "Snacks", price: 1.2, status: "active" },
    { id: 9, productName: "Twix", category: "Snacks", price: 1.2, status: "active" },
  ];

  // Simulate loading
  setTimeout(() => {
    setIsLoading(false);
  }, 1000);

  // Handle refresh
  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Aktualisiert",
        description: "Die Produktdaten wurden aktualisiert.",
      });
    }, 1000);
  };

  // Filter products based on search query
  const filteredProducts = mockProducts.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.productName.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      String(product.price).includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Produkte</CardTitle>
          <CardDescription>
            Alle verfügbaren Produkte im Vendon-System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
            {/* Search Field */}
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                className="pl-10"
                placeholder="Nach Produkten suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Refresh Button */}
            <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
              {isLoading ? (
                <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Wird geladen...</>
              ) : (
                <><RefreshCcw className="h-4 w-4 mr-2" /> Aktualisieren</>
              )}
            </Button>
          </div>

          {/* Products Table */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Produkt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kategorie
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preis
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Skeleton className="h-8 w-8 rounded mr-2" />
                            <Skeleton className="h-5 w-24" />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-20" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-20" />
                        </td>
                      </tr>
                    ))
                  ) : filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                              <Package className="h-4 w-4 text-primary-600" />
                            </div>
                            <div className="text-sm font-medium text-gray-900">{product.productName}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.price.toFixed(2)} €
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={product.status === "active" ? "default" : "secondary"}>
                            {product.status === "active" ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        Keine Produkte gefunden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Zeige <span className="font-medium">{filteredProducts.length}</span>{" "}
                  von <span className="font-medium">{mockProducts.length}</span>{" "}
                  Einträgen
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

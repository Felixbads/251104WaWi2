import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EcoImpactCard } from './EcoImpactCard';
import { 
  Leaf, 
  Filter, 
  TrendingUp, 
  Target,
  Award,
  Search,
  TreePine,
  Droplets,
  Recycle
} from 'lucide-react';

interface Product {
  id: number;
  productName: string;
  price: number;
  category?: string;
  carbonFootprint?: number;
  waterUsage?: number;
  packagingType?: string;
  packagingRecyclable?: boolean;
  transportDistance?: number;
  isOrganic?: boolean;
  isLocal?: boolean;
  isVegan?: boolean;
  isVegetarian?: boolean;
  sustainabilityScore?: number;
  certifications?: string;
}

interface EcoStats {
  totalProducts: number;
  sustainableProducts: number;
  avgCarbonFootprint: number;
  avgWaterUsage: number;
  avgSustainabilityScore: number;
  topCategories: Array<{
    category: string;
    score: number;
    count: number;
  }>;
}

export function EcoImpactDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('sustainability');
  const [showOnlySustainable, setShowOnlySustainable] = useState(false);

  // Fetch products with eco data
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['/api/eco/products'],
    queryFn: () => fetch('/api/eco/products').then(res => res.json()) as Promise<Product[]>
  });

  // Fetch eco statistics
  const { data: ecoStats } = useQuery({
    queryKey: ['/api/eco/statistics'],
    queryFn: () => fetch('/api/eco/statistics').then(res => res.json()) as Promise<EcoStats>
  });

  // Filter and sort products
  const filteredProducts = (products || [])
    .filter(product => {
      const matchesSearch = product.productName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      const matchesSustainable = !showOnlySustainable || (product.sustainabilityScore || 0) >= 70;
      return matchesSearch && matchesCategory && matchesSustainable;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'sustainability':
          return (b.sustainabilityScore || 0) - (a.sustainabilityScore || 0);
        case 'carbon':
          return (a.carbonFootprint || 999) - (b.carbonFootprint || 999);
        case 'water':
          return (a.waterUsage || 999) - (b.waterUsage || 999);
        case 'price':
          return a.price - b.price;
        default:
          return 0;
      }
    });

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TreePine className="h-8 w-8 text-green-600" />
            Nachhaltigkeits-Tracker
          </h1>
          <p className="text-muted-foreground">
            Entdecken Sie umweltfreundliche Produkte und verfolgen Sie Ihre nachhaltigen Entscheidungen
          </p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Nachhaltigkeitsziele
        </Button>
      </div>

      {/* Overview Statistics */}
      {ecoStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nachhaltige Produkte</p>
                  <p className="text-2xl font-bold text-green-600">
                    {ecoStats.sustainableProducts}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    von {ecoStats.totalProducts} Produkten
                  </p>
                </div>
                <Leaf className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ø CO₂-Fußabdruck</p>
                  <p className="text-2xl font-bold">
                    {ecoStats.avgCarbonFootprint.toFixed(3)}
                  </p>
                  <p className="text-xs text-muted-foreground">kg CO₂</p>
                </div>
                <TreePine className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ø Wasserverbrauch</p>
                  <p className="text-2xl font-bold">
                    {ecoStats.avgWaterUsage.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">Liter</p>
                </div>
                <Droplets className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ø Nachhaltigkeit</p>
                  <p className="text-2xl font-bold text-green-600">
                    {ecoStats.avgSustainabilityScore.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">von 100 Punkten</p>
                </div>
                <Award className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value="products" onValueChange={() => {}} defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="products">Produktvergleich</TabsTrigger>
          <TabsTrigger value="impact">Umweltauswirkung</TabsTrigger>
          <TabsTrigger value="trends">Trends & Ziele</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter & Suche
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Produktsuche</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Produktname suchen..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Kategorie</label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Kategorien" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Kategorien</SelectItem>
                      {(categories || []).map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sortierung</label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sustainability">Nachhaltigkeit</SelectItem>
                      <SelectItem value="carbon">CO₂-Fußabdruck</SelectItem>
                      <SelectItem value="water">Wasserverbrauch</SelectItem>
                      <SelectItem value="price">Preis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Filter</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="sustainable-only"
                      checked={showOnlySustainable}
                      onChange={(e) => setShowOnlySustainable(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="sustainable-only" className="text-sm">
                      Nur nachhaltige Produkte
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(product => (
              <EcoImpactCard
                key={product.id}
                product={product}
                showComparison={true}
                comparisonData={ecoStats ? {
                  avgCarbonFootprint: ecoStats.avgCarbonFootprint,
                  avgWaterUsage: ecoStats.avgWaterUsage,
                  avgSustainabilityScore: ecoStats.avgSustainabilityScore
                } : undefined}
              />
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Leaf className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Keine Produkte gefunden</h3>
                <p className="text-muted-foreground">
                  Versuchen Sie andere Suchbegriffe oder Filter.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="impact" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Umweltauswirkung Ihrer Entscheidungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Recycle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Verfolgen Sie Ihre Nachhaltigkeitsziele</h3>
                <p className="text-muted-foreground mb-4">
                  Hier sehen Sie bald detaillierte Auswertungen Ihrer umweltfreundlichen Produktwahlen.
                </p>
                <Badge variant="secondary">Bald verfügbar</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Nachhaltigkeitstrends & Ziele
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Target className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Setzen Sie sich Nachhaltigkeitsziele</h3>
                <p className="text-muted-foreground mb-4">
                  Verfolgen Sie Ihren Fortschritt und entdecken Sie Trends in nachhaltigen Produktwahlen.
                </p>
                <Badge variant="secondary">In Entwicklung</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  Euro, 
  ShoppingCart, 
  Target,
  PieChart,
  BarChart3,
  Calculator,
  Percent,
  Package,
  ExternalLink
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line } from 'recharts';

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

// German currency formatting
const formatEuro = (amount: number) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

interface ProfitabilityData {
  totalRevenue: number;
  totalCosts: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  vatAmount: number;
  depositAmount: number;
  topProducts: Array<{
    productName: string;
    revenue: number;
    costs: number;
    profit: number;
    margin: number;
    quantity: number;
  }>;
  monthlySummary: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    revenue: number;
    profit: number;
    count: number;
  }>;
}

export default function ModernProfitabilityDashboard() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');
  const [, setLocation] = useLocation();

  // Fetch products for ID mapping
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await fetch('/api/products', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    }
  });

  // Function to navigate to product details
  const navigateToProduct = (productName: string) => {
    if (!products) return;
    
    const product = products.find((p: any) => 
      p.product_name === productName || p.name === productName
    );
    
    if (product) {
      setLocation(`/produkte/${product.id}`);
    }
  };
  
  // Fetch profitability data
  const { data: profitData, isLoading } = useQuery<ProfitabilityData>({
    queryKey: ['profitability-modern', selectedTimeframe],
    queryFn: async () => {
      const response = await fetch(`/api/profitability-modern?timeframe=${selectedTimeframe}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch profitability data');
      return response.json();
    },
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Lade Wirtschaftlichkeitsdaten...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <TrendingUp className="h-10 w-10 text-blue-600" />
            Wirtschaftlichkeits-Dashboard
          </h1>
          <p className="text-xl text-gray-600">Transparente Gewinn- und Kostenanalyse für Ihre Automaten</p>
          
          {/* Timeframe Selector */}
          <div className="flex justify-center gap-2">
            {[
              { value: '7d', label: '7 Tage' },
              { value: '30d', label: '30 Tage' },
              { value: '90d', label: '90 Tage' },
              { value: '1y', label: '1 Jahr' }
            ].map((timeframe) => (
              <Button
                key={timeframe.value}
                variant={selectedTimeframe === timeframe.value ? 'default' : 'outline'}
                onClick={() => setSelectedTimeframe(timeframe.value)}
                className="min-w-[80px]"
              >
                {timeframe.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
              <Euro className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatEuro(profitData?.totalRevenue || 0)}</div>
              <p className="text-xs text-green-100">inkl. MwSt und Pfand</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamtkosten</CardTitle>
              <ShoppingCart className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatEuro(profitData?.totalCosts || 0)}</div>
              <p className="text-xs text-red-100">Einkauf + Logistik</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bruttogewinn</CardTitle>
              <TrendingUp className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatEuro(profitData?.grossProfit || 0)}</div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {profitData?.grossMargin?.toFixed(1) || 0}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nettogewinn</CardTitle>
              <Target className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatEuro(profitData?.netProfit || 0)}</div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                  {profitData?.netMargin?.toFixed(1) || 0}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Analytics */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="products">Top Produkte</TabsTrigger>
            <TabsTrigger value="trends">Verlauf</TabsTrigger>
            <TabsTrigger value="categories">Kategorien</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Revenue vs Costs Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Umsatz vs. Kosten
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[
                      { name: 'Umsatz', value: profitData?.totalRevenue || 0, fill: '#10B981' },
                      { name: 'Kosten', value: profitData?.totalCosts || 0, fill: '#EF4444' },
                      { name: 'Gewinn', value: profitData?.grossProfit || 0, fill: '#3B82F6' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => formatEuro(value)} />
                      <Tooltip formatter={(value) => formatEuro(Number(value))} />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* German Tax Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Deutsche Steueraufschlüsselung
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Netto-Umsatz</span>
                      <span className="font-bold">{formatEuro((profitData?.totalRevenue || 0) - (profitData?.vatAmount || 0) - (profitData?.depositAmount || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-orange-600">+ MwSt (19%)</span>
                      <span className="font-bold text-orange-600">{formatEuro(profitData?.vatAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-600">+ Pfand (steuerfrei)</span>
                      <span className="font-bold text-blue-600">{formatEuro(profitData?.depositAmount || 0)}</span>
                    </div>
                    <hr />
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">Brutto-Umsatz</span>
                      <span className="text-lg font-bold">{formatEuro(profitData?.totalRevenue || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Top Produkte nach Gewinn
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profitData?.topProducts?.slice(0, 10).map((product, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors group"
                      onClick={() => navigateToProduct(product.productName)}
                    >
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 group-hover:text-blue-600 flex items-center gap-2">
                          {product.productName}
                          <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-sm text-gray-500">
                          {product.quantity} Stück verkauft
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-bold text-green-600">{formatEuro(product.profit)}</div>
                        <div className="flex items-center space-x-2">
                          <Progress value={product.margin} className="w-20" />
                          <span className="text-xs text-gray-500">{product.margin.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Gewinnentwicklung über Zeit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={profitData?.monthlySummary || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => formatEuro(value)} />
                    <Tooltip formatter={(value) => formatEuro(Number(value))} />
                    <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} name="Umsatz" />
                    <Line type="monotone" dataKey="costs" stroke="#EF4444" strokeWidth={2} name="Kosten" />
                    <Line type="monotone" dataKey="profit" stroke="#3B82F6" strokeWidth={2} name="Gewinn" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Category Revenue Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Umsatz nach Kategorien
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={profitData?.categoryBreakdown || []}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="revenue"
                        label={({category, percent}: {category: string, percent: number}) => `${category} ${(percent * 100).toFixed(0)}%`}
                      >
                        {(profitData?.categoryBreakdown || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatEuro(Number(value))} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Category Performance Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="h-5 w-5" />
                    Kategorie-Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {profitData?.categoryBreakdown?.map((category, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <h3 className="font-medium">{category.category}</h3>
                          <p className="text-sm text-gray-500">{category.count} Produkte</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{formatEuro(category.profit)}</div>
                          <div className="text-xs text-gray-500">
                            {((category.profit / category.revenue) * 100).toFixed(1)}% Marge
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
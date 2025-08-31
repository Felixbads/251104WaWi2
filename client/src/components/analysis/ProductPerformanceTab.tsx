import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, ArrowUpRightIcon, ArrowDownRightIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/utils";
import axios from "axios";

interface ProductPerformanceTabProps {
  buildQueryUrl: (endpoint: string) => string;
}

interface ProductPerformance {
  productId: number;
  productName: string;
  sales: number;
  revenue: number;
  costPrice: number;
  vat: number;
  depositFee: number;
  margin: number;
  marginPercent: number;
}

interface ApiResponse {
  products: ProductPerformance[];
  topMarginProducts: ProductPerformance[];
  lowMarginProducts: ProductPerformance[];
  totalSales: number;
  totalRevenue: number;
  totalMargin: number;
  averageMarginPercent: number;
  metadata: {
    period: string;
    startDate: string;
    endDate: string;
    lastUpdated: string;
  };
}

export default function ProductPerformanceTab({ buildQueryUrl }: ProductPerformanceTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // URL mit Benutzertoken erstellen
        const url = buildQueryUrl('/api/statistics/product-performance');
        
        // Daten abrufen
        const response = await axios.get<ApiResponse>(url);
        setData(response.data);
      } catch (err) {
        console.error("Fehler beim Laden der Produktleistungsdaten:", err);
        setError("Die Produktleistungsdaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [buildQueryUrl]);
  
  const handleExport = () => {
    if (!data) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Titel
    doc.setFontSize(16);
    doc.text("Produktleistungsanalyse", pageWidth / 2, 20, { align: "center" });
    
    // Metadaten
    doc.setFontSize(10);
    doc.text(`Zeitraum: ${data.metadata.period}`, 14, 30);
    doc.text(`Von: ${data.metadata.startDate} bis: ${data.metadata.endDate}`, 14, 35);
    doc.text(`Erstellt am: ${data.metadata.lastUpdated}`, 14, 40);
    
    // Zusammenfassung
    doc.setFontSize(12);
    doc.text("Leistungsübersicht:", 14, 50);
    doc.setFontSize(10);
    doc.text(`Gesamtumsatz: ${formatCurrency(data.totalRevenue)}`, 14, 55);
    doc.text(`Gesamtmarge: ${formatCurrency(data.totalMargin)}`, 14, 60);
    doc.text(`Durchschnittliche Marge: ${(data.averageMarginPercent || 0).toFixed(2)}%`, 14, 65);
    
    // Top-Produkte nach Marge
    doc.setFontSize(12);
    doc.text("Top-Produkte nach Marge:", 14, 75);
    doc.setFontSize(9);
    
    let yPos = 80;
    data.topMarginProducts.forEach((product, index) => {
      doc.text(`${index + 1}. ${product.productName}`, 14, yPos);
      doc.text(`Marge: ${formatCurrency(product.margin)} (${(product.marginPercent || 0).toFixed(2)}%)`, 100, yPos);
      yPos += 5;
    });
    
    // Produkte mit niedriger Marge
    yPos += 5;
    doc.setFontSize(12);
    doc.text("Produkte mit niedriger Marge:", 14, yPos);
    doc.setFontSize(9);
    
    yPos += 5;
    data.lowMarginProducts.forEach((product, index) => {
      doc.text(`${index + 1}. ${product.productName}`, 14, yPos);
      doc.text(`Marge: ${formatCurrency(product.margin)} (${(product.marginPercent || 0).toFixed(2)}%)`, 100, yPos);
      yPos += 5;
    });
    
    // PDF speichern
    doc.save("Produktleistungsanalyse.pdf");
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col space-y-4">
        <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
        </div>
        <div className="animate-pulse h-60 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>Keine Daten verfügbar.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Produktleistungsanalyse</h3>
          <p className="text-sm text-muted-foreground">
            Zeitraum: {data.metadata.period} | Letzte Aktualisierung: {data.metadata.lastUpdated}
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportieren
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Gesamtumsatz</CardTitle>
            <CardDescription>im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalRevenue)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Aus {data.totalSales} Verkäufen
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Gesamtmarge</CardTitle>
            <CardDescription>nach Abzug aller Kosten</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalMargin)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {data.totalMargin > 0 ? (
                <span className="flex items-center text-green-600">
                  <ArrowUpRightIcon className="h-4 w-4 mr-1" />
                  Positiv
                </span>
              ) : (
                <span className="flex items-center text-red-600">
                  <ArrowDownRightIcon className="h-4 w-4 mr-1" />
                  Negativ
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Ø Marge</CardTitle>
            <CardDescription>aller Produkte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data.averageMarginPercent || 0).toFixed(2)}%</div>
            <Progress
              value={data.averageMarginPercent || 0}
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Top-Produkte nach Marge</CardTitle>
            <CardDescription>Produkte mit der höchsten Marge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topMarginProducts.map((product) => (
                <div key={product.productId} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{product.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      Verkäufe: {product.sales} | Umsatz: {formatCurrency(product.revenue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">{formatCurrency(product.margin)}</div>
                    <div className="text-sm">{(product.marginPercent || 0).toFixed(2)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Produkte mit niedriger Marge</CardTitle>
            <CardDescription>Verbesserungspotenzial identifizieren</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.lowMarginProducts.map((product) => (
                <div key={product.productId} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{product.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      Verkäufe: {product.sales} | Umsatz: {formatCurrency(product.revenue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600">{formatCurrency(product.margin)}</div>
                    <div className="text-sm">{(product.marginPercent || 0).toFixed(2)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Alle Produkte</CardTitle>
          <CardDescription>Sortiert nach Umsatz</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Produkt</th>
                  <th className="text-right py-2 px-4">Verkäufe</th>
                  <th className="text-right py-2 px-4">Umsatz</th>
                  <th className="text-right py-2 px-4">EK-Preis</th>
                  <th className="text-right py-2 px-4">MwSt</th>
                  <th className="text-right py-2 px-4">Pfand</th>
                  <th className="text-right py-2 px-4">Marge</th>
                  <th className="text-right py-2 px-4">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.productId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{product.productName}</td>
                    <td className="text-right py-2 px-4">{product.sales}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(product.revenue)}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(product.costPrice)}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(product.vat)}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(product.depositFee)}</td>
                    <td className={`text-right py-2 px-4 font-medium ${product.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(product.margin)}
                    </td>
                    <td className={`text-right py-2 px-4 ${product.marginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(product.marginPercent || 0).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getProduct } from '@/lib/api';
import { Loader2, ArrowLeft, Truck, Package, Tag, Info, Clipboard, Clock, BarChart3, Calendar, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>('details');
  const { toast } = useToast();

  // Hole Produktdaten
  const { data: product, isLoading, error } = useQuery({
    queryKey: [`/api/products/${id}`],
    queryFn: () => getProduct(id),
    staleTime: 1000 * 60, // 1 Minute
  });

  // Parst die Tags, wenn vorhanden
  const tags = product?.tags ? JSON.parse(product.tags) : [];
  const isAlcohol = tags.includes('alcohol') || product?.requiresAgeVerification;

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6">
      {/* Back button and header */}
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mr-2" 
          onClick={() => setLocation('/produkte')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        <h1 className="text-2xl font-bold">Produktdetails</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Lade Produktdaten...</span>
        </div>
      )}

      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-800">Fehler beim Laden der Produktdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.'}
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setLocation('/produkte')}>
              Zurück zur Produktübersicht
            </Button>
          </CardFooter>
        </Card>
      )}

      {product && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linke Spalte: Produktdetails */}
          <div className="lg:col-span-2">
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{product.productName}</CardTitle>
                    {product.sku && (
                      <CardDescription className="flex items-center mt-1">
                        <Tag className="h-3 w-3 mr-1" />
                        {product.sku}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAlcohol && (
                      <span><Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        18+
                      </Badge></span>
                    )}
                    {product.category && (
                      <span><Badge variant="secondary">
                        {product.category}
                      </Badge></span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-2 w-full mb-4">
                    <TabsTrigger value="details">
                      <Info className="h-4 w-4 mr-1" />
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="inventory">
                      <Package className="h-4 w-4 mr-1" />
                      Bestand
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                      {/* Preis */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Preis</h3>
                        <p className="text-lg font-semibold">{product.price?.toFixed(2) || '–'} €</p>
                        {product.vat && <p className="text-xs text-gray-500">zzgl. {product.vat}% MwSt.</p>}
                      </div>

                      {/* Kostpreis (falls vorhanden) */}
                      {product.costPrice && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Kostpreis</h3>
                          <p className="text-lg font-semibold">{product.costPrice.toFixed(2)} €</p>
                          {product.costPrice && product.price && (
                            <p className="text-xs text-gray-500">
                              Marge: {((product.price - product.costPrice) / product.price * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}

                      {/* Lieferant */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lieferant</h3>
                        <p className="font-medium">{product.supplier || '–'}</p>
                      </div>

                      {/* Produkt-ID */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Produkt-ID</h3>
                        <p className="font-medium">
                          {product.id}
                          {product.vendonId && (
                            <span className="text-xs text-gray-500 ml-2">
                              (Vendon: {product.vendonId})
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Kategorie */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Kategorie</h3>
                        <p className="font-medium">{product.category || '–'}</p>
                      </div>

                      {/* Beschreibung */}
                      {product.description && (
                        <div className="col-span-2">
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Beschreibung</h3>
                          <p className="font-medium whitespace-pre-line">{product.description}</p>
                        </div>
                      )}

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="col-span-2">
                          <h3 className="text-sm font-medium text-gray-500 mb-2">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag: string) => (
                              <span key={tag}>
                                <Badge variant="outline" className="bg-gray-50">
                                  {tag}
                                </Badge>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Artikel/Barcode */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Artikelnummer</h3>
                        <p className="font-medium">{product.article || '–'}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Barcode</h3>
                        <p className="font-medium">{product.barcode || '–'}</p>
                      </div>

                      {/* Pfand */}
                      {(product.depositPrice !== null && product.depositPrice !== undefined) && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Pfand</h3>
                          <p className="font-medium">{product.depositPrice.toFixed(2)} €</p>
                          {product.depositVat && <p className="text-xs text-gray-500">zzgl. {product.depositVat}% MwSt.</p>}
                        </div>
                      )}

                      {/* Typ */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Produkttyp</h3>
                        <p className="font-medium">{product.productType || 'Standard'}</p>
                      </div>

                      {/* Einheiten */}
                      {product.units && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Einheiten</h3>
                          <p className="font-medium">{product.units}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="inventory">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                      {/* Aktueller Bestand */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Aktueller Bestand</h3>
                        <p className="text-lg font-semibold">{typeof product.inStock === 'number' ? product.inStock : '–'}</p>
                      </div>

                      {/* Nachfüllgröße */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Standardnachfüllmenge</h3>
                        <p className="font-medium">{product.refillUnitSize || '–'}</p>
                      </div>

                      {/* Minimale Menge */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Mindestbestand</h3>
                        <p className="font-medium">{product.amountCritical || '–'}</p>
                      </div>

                      {/* Maximale Menge */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Maximalbestand</h3>
                        <p className="font-medium">{product.amountMax || '–'}</p>
                      </div>

                      {/* Lagerort */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lagerort</h3>
                        <p className="font-medium">{product.warehouseLocation || '–'}</p>
                      </div>

                      {/* Verkäufe */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Verkäufe</h3>
                        <p className="font-medium">{product.salesCount || '0'}</p>
                      </div>

                      {/* Letzter Verkauf */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Letzter Verkauf</h3>
                        <p className="font-medium">
                          {product.lastSale ? formatDateTime(product.lastSale, 'datetime') : '–'}
                        </p>
                      </div>

                      {/* Kritisch */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                        <div className="flex gap-2">
                          {product.critical && (
                            <span><Badge variant="destructive">Kritischer Bestand</Badge></span>
                          )}
                          {!product.critical && typeof product.inStock === 'number' && product.inStock > 0 && (
                            <span><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Auf Lager
                            </Badge></span>
                          )}
                          {!product.critical && typeof product.inStock === 'number' && product.inStock <= 0 && (
                            <span><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              Nicht auf Lager
                            </Badge></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>

              <CardFooter className="flex justify-between border-t pt-4">
                <div className="text-sm text-gray-500">
                  Aktualisiert: {product.updatedAt ? formatDateTime(product.updatedAt, 'datetime') : 'Unbekannt'}
                </div>
                <div className="text-sm text-gray-500">
                  Erstellt: {product.createdAt ? formatDateTime(product.createdAt, 'date') : 'Unbekannt'}
                </div>
              </CardFooter>
            </Card>
          </div>

          {/* Rechte Spalte: Aktionen und Zusatzinfos */}
          <div>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Aktionen</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Bestand anpassen",
                      description: `Weiterleitung zur Bestandsanpassung für "${product?.productName || `Produkt #${id}`}"`,
                    });
                    setLocation(`/lager?adjust=product&id=${id}`);
                  }}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Bestand anpassen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Verkaufsstatistik",
                      description: `Weiterleitung zur Verkaufsstatistik für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/auswertungen?productId=${id}&view=sales`);
                  }}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Verkaufsstatistik
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Bestandsverlauf",
                      description: `Weiterleitung zum Bestandsverlauf für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/lager?productId=${id}&view=history`);
                  }}
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  Bestandsverlauf
                </Button>
                <Separator className="my-2" />
                <Button 
                  variant={product?.critical || (typeof product?.inStock === 'number' && product?.inStock <= 0) ? "default" : "outline"}
                  className={`w-full justify-start ${product?.critical || (typeof product?.inStock === 'number' && product?.inStock <= 0) ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200 hover:text-amber-900" : ""}`}
                  onClick={() => {
                    toast({
                      title: "Bestellung anlegen",
                      description: `Weiterleitung zur Bestellungsseite mit "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/bestellungen/neu?productId=${id}`);
                  }}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Bestellung anlegen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Nachfüllungen anzeigen",
                      description: `Weiterleitung zur Übersicht der Nachfüllungen für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/automaten?view=refills&productId=${id}`);
                  }}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Nachfüllungen anzeigen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Verkäufe anzeigen",
                      description: `Weiterleitung zur Transaktionsübersicht für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/transactions?productId=${id}`);
                  }}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Verkäufe anzeigen
                </Button>
              </CardContent>
            </Card>

            {product && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Zusammenfassung</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Produktname</h3>
                      <p className="font-medium">{product.productName}</p>
                    </div>
                    
                    <div className="flex justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Preis</h3>
                        <p className="font-medium">{product.price?.toFixed(2) || '–'} €</p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Bestand</h3>
                        <p className="font-medium">
                          {typeof product.inStock === 'number' ? product.inStock : '–'}
                        </p>
                      </div>
                    </div>
                    
                    {product.supplier && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lieferant</h3>
                        <p className="font-medium">{product.supplier}</p>
                      </div>
                    )}
                    
                    {product.category && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Kategorie</h3>
                        <p className="font-medium">{product.category}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
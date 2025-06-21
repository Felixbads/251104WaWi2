import { Router, Request, Response } from 'express';
import { db } from '../db';
import { suppliers, products, warehouses, warehouseInventory } from '../../shared/schema';
import { eq, and, isNotNull, ne } from 'drizzle-orm';
import { interAppAuthMiddleware, interAppRateLimitMiddleware } from '../middleware/inter-app-auth';

const router = Router();

// Middleware für alle Inter-App Routen
router.use(interAppAuthMiddleware);
router.use(interAppRateLimitMiddleware(200, 1)); // 200 Requests pro Minute

interface AuthenticatedRequest extends Request {
  isInterAppAuthenticated?: boolean;
  interAppSource?: string;
}

/**
 * GET /api/inter-app/suppliers
 * Liefert alle Lieferanten mit vollständigen Informationen
 */
router.get('/suppliers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`[INTER-APP-API] Lieferanten-Anfrage von ${req.interAppSource}`);
    
    const allSuppliers = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        contactPerson: suppliers.contactPerson,
        phone: suppliers.phone,
        email: suppliers.email,
        website: suppliers.website,
        address: suppliers.address,
        city: suppliers.city,
        postalCode: suppliers.postalCode,
        country: suppliers.country,
        status: suppliers.status,
        notes: suppliers.notes,
        paymentTerms: suppliers.paymentTerms,
        deliveryTerms: suppliers.deliveryTerms,
        minimumOrderValue: suppliers.minimumOrderValue,
        deliveryDays: suppliers.deliveryDays,
        createdAt: suppliers.createdAt,
        updatedAt: suppliers.updatedAt
      })
      .from(suppliers)
      .where(eq(suppliers.status, 'active'))
      .orderBy(suppliers.name);

    // Zähle Produkte pro Lieferant
    const suppliersWithCounts = await Promise.all(
      allSuppliers.map(async (supplier) => {
        const productCount = await db
          .select({ count: products.id })
          .from(products)
          .where(and(
            eq(products.supplierId, supplier.id),
            eq(products.status, 'active')
          ));

        return {
          ...supplier,
          productCount: productCount.length,
          // Vollständigkeitsstatus
          completeness: {
            hasDescription: !!supplier.notes && supplier.notes.length >= 30,
            hasWebsite: !!supplier.website,
            hasCompleteAddress: !!(supplier.address && supplier.city && supplier.postalCode),
            hasContact: !!(supplier.email || supplier.phone)
          }
        };
      })
    );

    res.json({
      success: true,
      data: suppliersWithCounts,
      total: suppliersWithCounts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler beim Abrufen der Lieferanten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Lieferanten',
      code: 'SUPPLIERS_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/inter-app/suppliers/:id
 * Liefert einen spezifischen Lieferanten mit allen Details
 */
router.get('/suppliers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Lieferanten-ID',
        code: 'INVALID_SUPPLIER_ID'
      });
    }

    const supplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (supplier.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lieferant nicht gefunden',
        code: 'SUPPLIER_NOT_FOUND'
      });
    }

    // Hole alle Produkte des Lieferanten
    const supplierProducts = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        status: products.status,
        ean: products.ean,
        createdAt: products.createdAt
      })
      .from(products)
      .where(eq(products.supplierId, supplierId))
      .orderBy(products.name);

    res.json({
      success: true,
      data: {
        ...supplier[0],
        products: supplierProducts,
        productCount: supplierProducts.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler beim Abrufen des Lieferanten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Lieferanten',
      code: 'SUPPLIER_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/inter-app/products
 * Liefert alle Produkte mit Lieferanten-Informationen
 */
router.get('/products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { supplier_id, limit = '100', offset = '0' } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 500); // Max 500
    const offsetNum = parseInt(offset as string) || 0;

    let query = db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        status: products.status,
        ean: products.ean,
        category: products.category,
        supplierId: products.supplierId,
        supplierName: suppliers.name,
        supplierEmail: suppliers.email,
        supplierWebsite: suppliers.website,
        createdAt: products.createdAt
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(eq(products.status, 'active'));

    if (supplier_id) {
      const supplierIdNum = parseInt(supplier_id as string);
      if (!isNaN(supplierIdNum)) {
        query = query.where(and(
          eq(products.status, 'active'),
          eq(products.supplierId, supplierIdNum)
        ));
      }
    }

    const allProducts = await query
      .limit(limitNum)
      .offset(offsetNum)
      .orderBy(products.name);

    // Zähle Gesamtanzahl für Pagination
    const totalCountResult = await db
      .select({ count: products.id })
      .from(products)
      .where(supplier_id ? 
        and(eq(products.status, 'active'), eq(products.supplierId, parseInt(supplier_id as string))) :
        eq(products.status, 'active')
      );

    res.json({
      success: true,
      data: allProducts.map(product => ({
        ...product,
        // Vollständigkeitsstatus
        completeness: {
          hasDescription: !!product.description && product.description.length >= 10,
          hasPrice: !!product.price && product.price > 0,
          hasEan: !!product.ean,
          hasSupplier: !!product.supplierId
        }
      })),
      pagination: {
        total: totalCountResult.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < totalCountResult.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler beim Abrufen der Produkte:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Produkte',
      code: 'PRODUCTS_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/inter-app/products/:id
 * Liefert ein spezifisches Produkt mit allen Details
 */
router.get('/products/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Produkt-ID',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    const product = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        status: products.status,
        ean: products.ean,
        category: products.category,
        supplierId: products.supplierId,
        supplierName: suppliers.name,
        supplierEmail: suppliers.email,
        supplierWebsite: suppliers.website,
        supplierAddress: suppliers.address,
        supplierCity: suppliers.city,
        supplierPostalCode: suppliers.postalCode,
        supplierCountry: suppliers.country,
        createdAt: products.createdAt
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Produkt nicht gefunden',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: product[0],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler beim Abrufen des Produkts:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Produkts',
      code: 'PRODUCT_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/inter-app/warehouses
 * Liefert alle Lager mit Inventar-Zusammenfassung
 */
router.get('/warehouses', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const allWarehouses = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.status, 'active'))
      .orderBy(warehouses.name);

    // Hole Inventar-Statistiken für jedes Lager
    const warehousesWithStats = await Promise.all(
      allWarehouses.map(async (warehouse) => {
        const inventoryCount = await db
          .select({ count: warehouseInventory.id })
          .from(warehouseInventory)
          .where(eq(warehouseInventory.warehouseId, warehouse.id));

        return {
          ...warehouse,
          inventoryCount: inventoryCount.length
        };
      })
    );

    res.json({
      success: true,
      data: warehousesWithStats,
      total: warehousesWithStats.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler beim Abrufen der Lager:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Lager',
      code: 'WAREHOUSES_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/inter-app/health
 * Gesundheitscheck der API
 */
router.get('/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Teste Datenbankverbindung
    const dbTest = await db.select({ count: suppliers.id }).from(suppliers).limit(1);
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      source: req.interAppSource
    });

  } catch (error) {
    console.error('[INTER-APP-API] Health Check Fehler:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Datenbankverbindung fehlgeschlagen',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/inter-app/data-completeness
 * Analysiert die Vollständigkeit der Daten
 */
router.get('/data-completeness', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Lieferanten-Vollständigkeit
    const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.status, 'active'));
    const supplierStats = {
      total: allSuppliers.length,
      withDescription: allSuppliers.filter(s => s.notes && s.notes.length >= 30).length,
      withWebsite: allSuppliers.filter(s => !!s.website).length,
      withCompleteAddress: allSuppliers.filter(s => s.address && s.city && s.postalCode).length,
      withContact: allSuppliers.filter(s => s.email || s.phone).length
    };

    // Produkt-Vollständigkeit
    const allProducts = await db.select().from(products).where(eq(products.status, 'active'));
    const productStats = {
      total: allProducts.length,
      withDescription: allProducts.filter(p => p.description && p.description.length >= 10).length,
      withPrice: allProducts.filter(p => p.price && p.price > 0).length,
      withSupplier: allProducts.filter(p => !!p.supplierId).length,
      withEan: allProducts.filter(p => !!p.ean).length
    };

    res.json({
      success: true,
      data: {
        suppliers: {
          ...supplierStats,
          completeness: {
            description: Math.round((supplierStats.withDescription / supplierStats.total) * 100),
            website: Math.round((supplierStats.withWebsite / supplierStats.total) * 100),
            address: Math.round((supplierStats.withCompleteAddress / supplierStats.total) * 100),
            contact: Math.round((supplierStats.withContact / supplierStats.total) * 100)
          }
        },
        products: {
          ...productStats,
          completeness: {
            description: Math.round((productStats.withDescription / productStats.total) * 100),
            price: Math.round((productStats.withPrice / productStats.total) * 100),
            supplier: Math.round((productStats.withSupplier / productStats.total) * 100),
            ean: Math.round((productStats.withEan / productStats.total) * 100)
          }
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[INTER-APP-API] Fehler bei Vollständigkeitsanalyse:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Vollständigkeitsanalyse',
      code: 'COMPLETENESS_ANALYSIS_ERROR'
    });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { suppliers, products, warehouses } from '../../shared/schema';
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
        shortDescription: suppliers.shortDescription,
        photos: suppliers.photos,
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

    console.log(`[INTER-APP-API] ${allSuppliers.length} Lieferanten gefunden`);

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
            hasDescription: !!(supplier.shortDescription && supplier.shortDescription.length >= 30) || 
                           !!(supplier.notes && supplier.notes.length >= 30),
            hasWebsite: !!supplier.website,
            hasCompleteAddress: !!(supplier.address && supplier.city && supplier.postalCode),
            hasContact: !!(supplier.email || supplier.phone),
            hasPhotos: !!(supplier.photos && supplier.photos.length > 0)
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
 * Liefert einen spezifischen Lieferanten mit allen Produkten
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

    // Hole Lieferanten-Details
    const supplier = await db
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
        shortDescription: suppliers.shortDescription,
        photos: suppliers.photos,
        paymentTerms: suppliers.paymentTerms,
        deliveryTerms: suppliers.deliveryTerms,
        minimumOrderValue: suppliers.minimumOrderValue,
        deliveryDays: suppliers.deliveryDays,
        createdAt: suppliers.createdAt,
        updatedAt: suppliers.updatedAt
      })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));

    if (!supplier || supplier.length === 0) {
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
        vendonId: products.vendonId,
        productName: products.productName,
        shortDescription: products.shortDescription,
        description: products.description,
        ingredients: products.ingredients,
        allergens: products.allergens,
        nutritionalInfo: products.nutritionalInfo,
        photos: products.photos,
        price: products.price,
        category: products.category,
        status: products.status,
        sku: products.sku,
        barcode: products.barcode,
        packageSize: products.packageSize,
        shelfLifeDays: products.shelfLifeDays,
        minOrderQuantity: products.minOrderQuantity,
        vat: products.vat,
        depositPrice: products.depositPrice,
        depositVat: products.depositVat,
        productType: products.productType,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt
      })
      .from(products)
      .where(eq(products.supplierId, supplierId))
      .orderBy(products.productName);

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

    // Build the base query
    let whereConditions = [eq(products.status, 'active')];
    
    if (supplier_id) {
      const supplierIdNum = parseInt(supplier_id as string);
      if (!isNaN(supplierIdNum)) {
        whereConditions.push(eq(products.supplierId, supplierIdNum));
      }
    }

    const allProducts = await db
      .select({
        id: products.id,
        vendonId: products.vendonId,
        productName: products.productName,
        price: products.price,
        category: products.category,
        description: products.description,
        shortDescription: products.shortDescription,
        ingredients: products.ingredients,
        allergens: products.allergens,
        nutritionalInfo: products.nutritionalInfo,
        photos: products.photos,
        status: products.status,
        sku: products.sku,
        barcode: products.barcode,
        supplierId: products.supplierId,
        supplierName: products.supplierName,
        supplierSku: products.supplierSku,
        packageSize: products.packageSize,
        shelfLifeDays: products.shelfLifeDays,
        minOrderQuantity: products.minOrderQuantity,
        vat: products.vat,
        depositPrice: products.depositPrice,
        depositVat: products.depositVat,
        productType: products.productType,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        // Supplier information
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          email: suppliers.email,
          website: suppliers.website,
          shortDescription: suppliers.shortDescription,
          photos: suppliers.photos
        }
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(and(...whereConditions))
      .limit(limitNum)
      .offset(offsetNum)
      .orderBy(products.productName);

    // Vollständigkeitsstatus für jedes Produkt hinzufügen
    const productsWithCompleteness = allProducts.map(product => ({
      ...product,
      completeness: {
        hasDescription: !!(product.shortDescription && product.shortDescription.length >= 10) ||
                      !!(product.description && product.description.length >= 10),
        hasPrice: !!(product.price && product.price > 0),
        hasBarcode: !!product.barcode,
        hasSupplier: !!product.supplierId,
        hasIngredients: !!product.ingredients,
        hasAllergens: !!product.allergens,
        hasNutritionalInfo: !!product.nutritionalInfo,
        hasPhotos: !!(product.photos && product.photos.length > 0)
      }
    }));

    // Gesamtanzahl für Pagination ermitteln
    const totalCount = await db
      .select({ count: products.id })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(and(...whereConditions));

    res.json({
      success: true,
      data: productsWithCompleteness,
      pagination: {
        total: totalCount.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: totalCount.length > offsetNum + limitNum
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
 * Liefert ein spezifisches Produkt mit vollständigen Informationen
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
        vendonId: products.vendonId,
        productName: products.productName,
        price: products.price,
        category: products.category,
        description: products.description,
        shortDescription: products.shortDescription,
        ingredients: products.ingredients,
        allergens: products.allergens,
        nutritionalInfo: products.nutritionalInfo,
        photos: products.photos,
        status: products.status,
        sku: products.sku,
        barcode: products.barcode,
        supplierId: products.supplierId,
        supplierName: products.supplierName,
        supplierSku: products.supplierSku,
        packageSize: products.packageSize,
        shelfLifeDays: products.shelfLifeDays,
        minOrderQuantity: products.minOrderQuantity,
        vat: products.vat,
        depositPrice: products.depositPrice,
        depositVat: products.depositVat,
        productType: products.productType,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        // Supplier information
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          email: suppliers.email,
          website: suppliers.website,
          address: suppliers.address,
          city: suppliers.city,
          postalCode: suppliers.postalCode,
          shortDescription: suppliers.shortDescription,
          photos: suppliers.photos
        }
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(eq(products.id, productId));

    if (!product || product.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Produkt nicht gefunden',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    const productWithCompleteness = {
      ...product[0],
      completeness: {
        hasDescription: !!(product[0].shortDescription && product[0].shortDescription.length >= 10) ||
                      !!(product[0].description && product[0].description.length >= 10),
        hasPrice: !!(product[0].price && product[0].price > 0),
        hasBarcode: !!product[0].barcode,
        hasSupplier: !!product[0].supplierId,
        hasIngredients: !!product[0].ingredients,
        hasAllergens: !!product[0].allergens,
        hasNutritionalInfo: !!product[0].nutritionalInfo,
        hasPhotos: !!(product[0].photos && product[0].photos.length > 0)
      }
    };

    res.json({
      success: true,
      data: productWithCompleteness,
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
 * GET /api/inter-app/health
 * Health Check für die API
 */
router.get('/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Test database connection
    const healthCheck = await db.select({ count: suppliers.id }).from(suppliers).limit(1);
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[INTER-APP-API] Health Check fehlgeschlagen:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
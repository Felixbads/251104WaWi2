import express, { Request, Response } from 'express';
import { storage } from '../storage';
import { db, rawDb } from '../db';
import { productBatches, products, warehouses, inventoryItems as inventoryItemsSchema } from '@shared/schema';
import { eq, and, gt, inArray, asc, min, sql, isNotNull, desc } from 'drizzle-orm';

// Definiere eine Interface für das formatierte Inventar-Item
interface FormattedInventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  quantity: number | null;
  minQuantity: number | null;
  status: string | null;
  notes: string | null;
  lastUpdated: Date | null;
  productName?: string;
  warehouseName?: string;
  targetQuantity?: number;
  locationInWarehouse?: string;
  nextExpiryDate?: string | null; // MHD des am frühesten ablaufenden Batches
  batchNumber?: string | null; // Chargennummern (kommagetrennt wenn mehrere)
  [key: string]: any; // Für alle zusätzlichen Felder
}

const router = express.Router();

// GET /api/inventory - Lagerbestand eines oder aller Lager abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log(`Inventory query with params:`, req.query);
    const warehouseId = req.query.warehouseId ? 
      isNaN(parseInt(req.query.warehouseId as string)) ? undefined : parseInt(req.query.warehouseId as string) 
      : undefined;
    const includeZeroStock = req.query.includeZeroStock === 'true';
    const critical = req.query.critical === 'true';
    
    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    
    // Logging für Debugging
    console.log(`Processing inventory request with warehouseId=${warehouseId}, includeZeroStock=${includeZeroStock}, critical=${critical}, page=${page}, pageSize=${pageSize}`);
    
    // Wenn direkter Zugriff auf die Datenbank besser funktioniert, nutzen wir das für Fehlerbehandlung
    if (warehouseId) {
      try {
        // Versuche einen Direct-Query statt ORM für bessere Kontrolle der SQL-Abfrage
        const offset = (page - 1) * pageSize;
        const directQuery = `
          WITH inventory_with_batches AS (
            -- Inventardaten mit Batch-Informationen
            SELECT 
              i.id, 
              i.warehouse_id as "warehouseId",
              i.product_id as "productId",
              -- Verwende Batch-Summe wenn verfügbar, sonst inventory_items Menge
              COALESCE(batch_summary.total_quantity, i.quantity) as quantity,
              i.min_quantity as "minQuantity",
              i.status,
              CASE 
                WHEN batch_summary.batch_numbers IS NOT NULL 
                THEN CONCAT(COALESCE(i.notes, ''), ' | Chargen: ', batch_summary.batch_numbers)
                ELSE i.notes
              END as notes,
              i.location_in_warehouse as "locationInWarehouse",
              COALESCE(i.updated_at, i.created_at) as "lastUpdated",
              p.product_name as "productName",
              w.name as "warehouseName",
              batch_summary.next_expiry_date as "nextExpiryDate",
              batch_summary.batch_numbers as "batchNumber"
            FROM 
              inventory_items i
            LEFT JOIN
              products p ON i.product_id = p.id
            LEFT JOIN
              warehouses w ON i.warehouse_id = w.id
            LEFT JOIN (
              -- Aggregierte Batch-Daten pro Produkt-Lager-Kombination
              SELECT 
                pb.product_id,
                pb.warehouse_id,
                SUM(pb.current_quantity) as total_quantity,
                MIN(pb.expiry_date) as next_expiry_date,
                STRING_AGG(
                  CONCAT(pb.batch_number, ' (MHD: ', TO_CHAR(pb.expiry_date, 'DD.MM.YYYY'), ', Menge: ', pb.current_quantity, ')'), 
                  ', ' 
                  ORDER BY pb.expiry_date ASC
                ) as batch_numbers
              FROM 
                product_batches pb
              WHERE 
                pb.status = 'active'
                ${!includeZeroStock ? 'AND pb.current_quantity > 0' : ''}
              GROUP BY 
                pb.product_id, pb.warehouse_id
            ) batch_summary ON i.product_id = batch_summary.product_id AND i.warehouse_id = batch_summary.warehouse_id
            WHERE 
              i.warehouse_id = $1
              ${!includeZeroStock ? 'AND COALESCE(batch_summary.total_quantity, i.quantity) > 0' : ''}
              ${critical ? 'AND COALESCE(batch_summary.total_quantity, i.quantity) <= COALESCE(i.min_quantity, 0) AND COALESCE(batch_summary.total_quantity, i.quantity) > 0' : ''}
          ),
          batch_only_products AS (
            -- Produkte die nur in Batches existieren, aber nicht in inventory_items
            SELECT 
              (-1 * (pb.product_id * 1000 + pb.warehouse_id)) as id,
              pb.warehouse_id as "warehouseId",
              pb.product_id as "productId",
              SUM(pb.current_quantity) as quantity,
              5 as "minQuantity", -- Standardwert
              'active' as status,
              CONCAT('Automatisch aus Batches generiert | Chargen: ', 
                STRING_AGG(
                  CONCAT(pb.batch_number, ' (MHD: ', TO_CHAR(pb.expiry_date, 'DD.MM.YYYY'), ', Menge: ', pb.current_quantity, ')'), 
                  ', ' 
                  ORDER BY pb.expiry_date ASC
                )
              ) as notes,
              NULL as "locationInWarehouse",
              NOW() as "lastUpdated",
              p.product_name as "productName",
              w.name as "warehouseName",
              MIN(pb.expiry_date) as "nextExpiryDate",
              STRING_AGG(pb.batch_number, ', ' ORDER BY pb.expiry_date ASC) as "batchNumber"
            FROM 
              product_batches pb
            LEFT JOIN
              products p ON pb.product_id = p.id
            LEFT JOIN
              warehouses w ON pb.warehouse_id = w.id
            LEFT JOIN
              inventory_items i ON pb.product_id = i.product_id AND pb.warehouse_id = i.warehouse_id
            WHERE 
              pb.status = 'active' 
              AND pb.warehouse_id = $1
              AND i.id IS NULL -- Nur Produkte die NICHT in inventory_items sind
              ${!includeZeroStock ? 'AND pb.current_quantity > 0' : ''}
            GROUP BY 
              pb.product_id, pb.warehouse_id, p.product_name, w.name
          )
          -- Kombiniere die Ergebnisse
          SELECT * FROM inventory_with_batches
          UNION ALL
          SELECT * FROM batch_only_products
          ORDER BY "productName"
          LIMIT $2
          OFFSET $3;
        `;
        
        // Count query for total items
        const countQuery = `
          WITH inventory_with_batches AS (
            SELECT i.id
            FROM inventory_items i
            LEFT JOIN (
              SELECT 
                pb.product_id,
                pb.warehouse_id,
                SUM(pb.current_quantity) as total_quantity
              FROM 
                product_batches pb
              WHERE 
                pb.status = 'active'
                ${!includeZeroStock ? 'AND pb.current_quantity > 0' : ''}
              GROUP BY 
                pb.product_id, pb.warehouse_id
            ) batch_summary ON i.product_id = batch_summary.product_id AND i.warehouse_id = batch_summary.warehouse_id
            WHERE 
              i.warehouse_id = $1
              ${!includeZeroStock ? 'AND COALESCE(batch_summary.total_quantity, i.quantity) > 0' : ''}
              ${critical ? 'AND COALESCE(batch_summary.total_quantity, i.quantity) <= COALESCE(i.min_quantity, 0) AND COALESCE(batch_summary.total_quantity, i.quantity) > 0' : ''}
          ),
          batch_only_products AS (
            SELECT DISTINCT pb.product_id
            FROM product_batches pb
            LEFT JOIN inventory_items i ON pb.product_id = i.product_id AND pb.warehouse_id = i.warehouse_id
            WHERE pb.status = 'active' 
              AND pb.warehouse_id = $1
              AND i.id IS NULL
              ${!includeZeroStock ? 'AND pb.current_quantity > 0' : ''}
          )
          SELECT COUNT(*) as total FROM (
            SELECT id FROM inventory_with_batches
            UNION
            SELECT product_id as id FROM batch_only_products
          ) combined;
        `;
        
        const [result, countResult] = await Promise.all([
          rawDb.query(directQuery, [warehouseId, pageSize, offset]),
          rawDb.query(countQuery, [warehouseId])
        ]);
        
        console.log(`Direct query returned ${result.rows.length} rows for warehouse ${warehouseId}, page ${page}`);
        
        const totalItems = parseInt(countResult.rows[0]?.total || '0', 10);
        const totalPages = Math.ceil(totalItems / pageSize);
        
        if (result.rows.length > 0 || page === 1) {
          // Transformiere die Zahlenfelder in die richtigen Typen
          const formattedResult = result.rows.map(row => ({
            ...row,
            id: parseInt(row.id),
            warehouseId: parseInt(row.warehouseId),
            productId: parseInt(row.productId),
            quantity: parseInt(row.quantity) || 0,
            minQuantity: parseInt(row.minQuantity) || 0
          }));
          
          return res.json({
            items: formattedResult,
            pagination: {
              page,
              pageSize,
              total: totalItems,
              totalPages,
              hasNext: page < totalPages,
              hasPrevious: page > 1
            }
          });
        }
      } catch (directError) {
        console.error("Error with direct inventory query:", directError);
        // Wir versuchen es mit dem Fallback-Verfahren, statt sofort einen Fehler zurückzugeben
      }
    }
    
    // Fallback zum Standard-Verfahren mit ORM
    // Lagerbestand abrufen - wenn warehouseId undefined ist, werden alle Lagerbestände abgerufen
    const inventoryItems = await storage.getInventoryItems({
      warehouseId,
      includeZeroStock,
      critical
    });
    
    console.log(`getInventoryItems returned ${inventoryItems.length} items from storage`);
    
    // Hole die frühesten ablaufenden Batches für jedes Produkt und die Summen
    let batchInventoryQuery = db
      .select({
        productId: productBatches.productId,
        warehouseId: productBatches.warehouseId,
        // Summe der aktuellen Mengen aller aktiven Batches
        quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
        // Frühestes Ablaufdatum
        nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
      })
      .from(productBatches)
      .where(
        and(
          // Nur aktive Batches
          eq(productBatches.status, 'active')
        )
      )
      .groupBy(productBatches.productId, productBatches.warehouseId);
    
    // Wenn ein bestimmtes Lager gefiltert wird
    if (warehouseId) {
      batchInventoryQuery = db
        .select({
          productId: productBatches.productId,
          warehouseId: productBatches.warehouseId,
          quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
          nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
        })
        .from(productBatches)
        .where(
          and(
            eq(productBatches.status, 'active'),
            eq(productBatches.warehouseId, warehouseId)
          )
        )
        .groupBy(productBatches.productId, productBatches.warehouseId);
    }
    
    // Wenn includeZeroStock auf false gesetzt ist, erstellen wir eine neue Query mit having-Klausel
    if (!includeZeroStock) {
      if (warehouseId) {
        batchInventoryQuery = db
          .select({
            productId: productBatches.productId,
            warehouseId: productBatches.warehouseId,
            quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
            nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
          })
          .from(productBatches)
          .where(
            and(
              eq(productBatches.status, 'active'),
              eq(productBatches.warehouseId, warehouseId)
            )
          )
          .groupBy(productBatches.productId, productBatches.warehouseId)
          .having(sql`SUM(${productBatches.currentQuantity}) > 0`);
      } else {
        batchInventoryQuery = db
          .select({
            productId: productBatches.productId,
            warehouseId: productBatches.warehouseId,
            quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
            nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
          })
          .from(productBatches)
          .where(eq(productBatches.status, 'active'))
          .groupBy(productBatches.productId, productBatches.warehouseId)
          .having(sql`SUM(${productBatches.currentQuantity}) > 0`);
      }
    }
    
    // Führe die Batch-Inventur durch
    const batchInventory = await batchInventoryQuery;
    console.log(`Batch inventory query returned ${batchInventory.length} entries`);
    
    // Wenn keine Inventardaten vorhanden sind, aber Batch-Daten existieren, können wir versuchen,
    // Inventareinträge aus den Batches zu erstellen
    if (inventoryItems.length === 0 && batchInventory.length > 0) {
      console.log(`No inventory items found but ${batchInventory.length} batch items found. Generating inventory from batches.`);
    }
    
    // Hole zusätzliche Produktinformationen, wenn Batches vorhanden sind
    let productInfoMap = new Map();
    let warehouseInfoMap = new Map();
    
    if (batchInventory.length > 0) {
      // Sammle alle Produkt-IDs und Lager-IDs
      const productIds = Array.from(new Set(batchInventory.map(item => item.productId)));
      const warehouseIds = Array.from(new Set(batchInventory.map(item => item.warehouseId)));
      
      // Lade alle Produktdaten in einem einzigen Query
      const productData = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));
      
      // Lade alle Lagerdaten in einem einzigen Query
      const warehouseData = await db
        .select()
        .from(warehouses)
        .where(inArray(warehouses.id, warehouseIds));
      
      // Erstelle Maps für schnellen Zugriff
      productData.forEach(product => {
        productInfoMap.set(product.id, product);
      });
      
      warehouseData.forEach(warehouse => {
        warehouseInfoMap.set(warehouse.id, warehouse);
      });
      
      console.log(`Loaded ${productData.length} products and ${warehouseData.length} warehouses for batch inventory`);
    }
    
    // Zuerst alle bestehenden Inventareinträge
    let formattedInventory: FormattedInventoryItem[] = await Promise.all(
      inventoryItems.map(async (item) => {
        // Erstelle ein Basisobjekt mit den garantierten Feldern
        const inventoryItem: FormattedInventoryItem = {
          id: item.id,
          warehouseId: item.warehouseId,
          productId: item.productId,
          quantity: item.quantity || 0,
          minQuantity: item.minQuantity || 0,
          status: item.status || 'active',
          notes: item.notes || '',
          lastUpdated: item.updatedAt || item.createdAt || new Date()
        };
        
        // Suche nach Batch-Daten für dieses Produkt-Lager-Paar
        const batchData = batchInventory.find(
          batch => batch.productId === item.productId && batch.warehouseId === item.warehouseId
        );
        
        // Wenn Batch-Daten vorhanden sind, aktualisiere die Menge und setze das Ablaufdatum
        if (batchData) {
          // Bei aktiven Batches verwenden wir die Batch-Menge
          if (item.status === 'active') {
            inventoryItem.quantity = batchData.quantity;
          }
          inventoryItem.nextExpiryDate = batchData.nextExpiryDate;
          
          // Hole detaillierte Batch-Informationen für dieses Produkt-Lager-Paar
          try {
            const detailedBatches = await db
              .select({
                batchNumber: productBatches.batchNumber,
                expiryDate: productBatches.expiryDate,
                currentQuantity: productBatches.currentQuantity
              })
              .from(productBatches)
              .where(
                and(
                  eq(productBatches.productId, item.productId),
                  eq(productBatches.warehouseId, item.warehouseId),
                  eq(productBatches.status, 'active')
                )
              )
              .orderBy(asc(productBatches.expiryDate));
            
            if (detailedBatches.length > 0) {
              // Erstelle eine formatierte Batch-String
              const batchStrings = detailedBatches.map(batch => 
                `${batch.batchNumber} (MHD: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('de-DE') : 'N/A'}, Menge: ${batch.currentQuantity})`
              );
              inventoryItem.batchNumber = batchStrings.join(', ');
              
              // Aktualisiere die Notes mit Batch-Informationen
              const originalNotes = inventoryItem.notes || '';
              inventoryItem.notes = originalNotes ? `${originalNotes} | Chargen: ${batchStrings.join(', ')}` : `Chargen: ${batchStrings.join(', ')}`;
            }
          } catch (error) {
            console.error(`Error fetching detailed batch information for product ${item.productId}:`, error);
          }
        }
        
        // Füge optionale Felder hinzu, wenn sie existieren
        if ('productName' in item && item.productName) {
          inventoryItem.productName = item.productName;
        } else if (productInfoMap.has(item.productId)) {
          inventoryItem.productName = productInfoMap.get(item.productId).productName;
        }
        
        if ('warehouseName' in item && item.warehouseName) {
          inventoryItem.warehouseName = item.warehouseName;
        } else if (warehouseInfoMap.has(item.warehouseId)) {
          inventoryItem.warehouseName = warehouseInfoMap.get(item.warehouseId).name;
        }
        
        if ('targetQuantity' in item) {
          inventoryItem.targetQuantity = item.targetQuantity;
        }
        
        if ('locationInWarehouse' in item) {
          inventoryItem.locationInWarehouse = item.locationInWarehouse;
        }
        
        return inventoryItem;
      })
    );
    
    // Jetzt füge alle Batch-Einträge hinzu, die noch nicht im traditionellen Inventar sind
    // Erstelle eine Map der vorhandenen Einträge für schnellen Zugriff
    const existingEntries = new Map();
    formattedInventory.forEach(item => {
      const key = `${item.productId}-${item.warehouseId}`;
      existingEntries.set(key, true);
    });
    
    console.log(`Adding batch-only items to inventory...`);
    // Füge neue Einträge aus dem Batch-Inventar hinzu
    for (const batchItem of batchInventory) {
      const key = `${batchItem.productId}-${batchItem.warehouseId}`;
      
      // Überspringe, wenn dieser Eintrag bereits existiert
      if (existingEntries.has(key)) {
        continue;
      }
      
      // Hole Produktdaten
      const productInfo = productInfoMap.get(batchItem.productId);
      const warehouseInfo = warehouseInfoMap.get(batchItem.warehouseId);
      
      if (!productInfo) {
        console.warn(`Product with ID ${batchItem.productId} not found for batch inventory entry`);
        continue;
      }
      
      // Hole detaillierte Batch-Informationen für dieses Produkt
      let batchDetails = '';
      let batchNumbers = '';
      try {
        const detailedBatches = await db
          .select({
            batchNumber: productBatches.batchNumber,
            expiryDate: productBatches.expiryDate,
            currentQuantity: productBatches.currentQuantity
          })
          .from(productBatches)
          .where(
            and(
              eq(productBatches.productId, batchItem.productId),
              eq(productBatches.warehouseId, batchItem.warehouseId),
              eq(productBatches.status, 'active')
            )
          )
          .orderBy(asc(productBatches.expiryDate));
        
        if (detailedBatches.length > 0) {
          const batchStrings = detailedBatches.map(batch => 
            `${batch.batchNumber} (MHD: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('de-DE') : 'N/A'}, Menge: ${batch.currentQuantity})`
          );
          batchDetails = batchStrings.join(', ');
          batchNumbers = detailedBatches.map(batch => batch.batchNumber).join(', ');
        }
      } catch (error) {
        console.error(`Error fetching detailed batch information for batch-only product ${batchItem.productId}:`, error);
      }
      
      // Erstelle einen neuen Eintrag basierend auf Batch-Daten
      const newInventoryItem: FormattedInventoryItem = {
        // Virtuelle ID für Batch-basierte Einträge
        id: -1 * (batchItem.productId * 1000 + batchItem.warehouseId), // Negative ID um Konflikte zu vermeiden
        warehouseId: batchItem.warehouseId,
        productId: batchItem.productId,
        quantity: batchItem.quantity,
        minQuantity: 5, // Standardwert
        status: 'active',
        notes: batchDetails ? `Automatisch aus Batches generiert | Chargen: ${batchDetails}` : 'Automatisch aus Batches generiert',
        lastUpdated: new Date(),
        productName: productInfo.productName,
        warehouseName: warehouseInfo ? warehouseInfo.name : 'Unbekanntes Lager',
        nextExpiryDate: batchItem.nextExpiryDate,
        batchNumber: batchNumbers || null
      };
      
      formattedInventory.push(newInventoryItem);
    }
    
    // Zusätzlicher Fallback, wenn keine Items gefunden werden: Versuche, alle Produkte zu laden, 
    // die mit dem Lager verknüpft sind, über machine-warehouse-assignments
    if (formattedInventory.length === 0 && warehouseId) {
      console.log(`No inventory items found, trying to load products from machine assignments for warehouse ${warehouseId}`);
      try {
        const machineQuery = `
          WITH machines_in_warehouse AS (
            SELECT 
              machine_id 
            FROM 
              machine_warehouse_assignments 
            WHERE 
              warehouse_id = $1
          ),
          products_in_machines AS (
            SELECT DISTINCT
              p.id as product_id,
              p.product_name,
              p.sku,
              p.price
            FROM
              machine_stocks ms
            JOIN
              products p ON ms.product_id = p.id
            WHERE
              ms.machine_id IN (SELECT machine_id FROM machines_in_warehouse)
              AND ms.current_quantity > 0
          )
          SELECT * FROM products_in_machines
          ORDER BY product_name;
        `;
        
        const machineResult = await rawDb.query(machineQuery, [warehouseId]);
        console.log(`Found ${machineResult.rows.length} products from machine assignments`);
        
        if (machineResult.rows.length > 0) {
          // Erstelle Dummy-Inventareinträge für diese Produkte
          const warehouseInfo = await db
            .select()
            .from(warehouses)
            .where(eq(warehouses.id, warehouseId))
            .limit(1);
          
          if (warehouseInfo.length > 0) {
            const warehouseName = warehouseInfo[0].name;
            
            // Verwende die gefundenen Produkte, um Inventareinträge zu erstellen
            const machineProducts = machineResult.rows.map((product, index) => ({
              id: -10000 - index, // Negative ID um Konflikte zu vermeiden
              warehouseId: warehouseId,
              productId: parseInt(product.product_id),
              quantity: 0, // Kein Bestand vorhanden
              minQuantity: 5, // Standardwert
              status: 'active',
              notes: 'Automatisch aus verknüpften Automaten generiert',
              lastUpdated: new Date(),
              productName: product.product_name,
              warehouseName: warehouseName,
              sku: product.sku,
              price: parseFloat(product.price) || 0
            }));
            
            formattedInventory = [...formattedInventory, ...machineProducts];
          }
        }
      } catch (machineError) {
        console.error("Error loading products from machine assignments:", machineError);
      }
    }
    
    console.log(`Returning ${formattedInventory.length} formatted inventory items`);
    res.json(formattedInventory);
  } catch (error) {
    console.error("Error fetching warehouse inventory:", error);
    res.status(500).json({ 
      error: "Failed to fetch warehouse inventory", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
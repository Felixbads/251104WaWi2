import { Request, Response } from 'express';
import { storage } from '../storage';

export async function getRemovedProducts(req: Request, res: Response) {
  try {
    const query = req.query as {
      limit?: string;
      offset?: string;
    };

    const limit = parseInt(query.limit || '5');
    
    console.log("Fetching removed products with limit:", limit);

    const queryResult = await storage.db.query(`
      SELECT 
        t.product_name,
        COUNT(*) as removal_count,
        SUM(t.quantity) as total_quantity,
        MAX(t.datetime) as last_removal
      FROM transactions t
      WHERE t.product_name IS NOT NULL
        AND t.quantity > 0
        AND t.datetime >= NOW() - INTERVAL '7 days'
      GROUP BY t.product_name
      ORDER BY removal_count DESC
      LIMIT $1
    `, [limit]);

    console.log("Query executed successfully");
    console.log("Query result type:", typeof queryResult);
    console.log("Has rows:", !!queryResult?.rows);
    console.log("Rows length:", queryResult?.rows?.length || 0);

    const rows = queryResult?.rows || [];
    
    console.log("Extracted rows:", rows.length);
    console.log("Sample data:", rows.slice(0, 2));

    const products = rows.map((row: any) => ({
      productName: row.product_name,
      removed: parseInt(row.removal_count) || 0,
      totalQuantity: parseInt(row.total_quantity) || 0,
      lastRemoval: row.last_removal
    }));

    console.log("Processed products:", products.length);

    res.json({
      products,
      analytics: {
        byProduct: products.map(p => ({
          name: p.productName,
          count: p.removed
        })),
        byMachine: [],
        byDate: []
      }
    });

  } catch (error) {
    console.error('Fehler beim Abrufen der entfernten Produkte:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der entfernten Produkte',
      products: [],
      analytics: {
        byProduct: [],
        byMachine: [],
        byDate: []
      }
    });
  }
}
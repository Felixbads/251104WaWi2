import { Request, Response } from 'express';
import { storage } from '../storage';

export async function getRemovedProducts(req: Request, res: Response) {
  try {
    const query = req.query as {
      limit?: string;
    };

    const limit = parseInt(query.limit || '5');
    
    console.log("Fetching removed products with limit:", limit);

    // Use direct SQL query to get top products from transactions
    const queryResult = await storage.execute(`
      SELECT 
        product_name,
        COUNT(*) as removal_count,
        SUM(quantity) as total_quantity
      FROM transactions 
      WHERE product_name IS NOT NULL 
        AND datetime >= NOW() - INTERVAL '7 days'
      GROUP BY product_name 
      ORDER BY COUNT(*) DESC 
      LIMIT $1
    `, [limit]);

    console.log("Direct SQL query result:", queryResult.length);

    // Convert to expected format
    const products = queryResult.map((row: any) => ({
      productName: row.product_name,
      removed: parseInt(row.removal_count),
      totalQuantity: parseInt(row.total_quantity || row.removal_count),
      lastRemoval: new Date()
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
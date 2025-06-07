import { Request, Response } from 'express';
import { storage } from '../storage';

export async function getRemovedProducts(req: Request, res: Response) {
  try {
    const query = req.query as {
      limit?: string;
    };

    const limit = parseInt(query.limit || '5');
    
    console.log("Fetching removed products with limit:", limit);

    // Use transactions table to get top removed products
    const transactions = await storage.getTransactions({ 
      limit: 1000,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    });

    console.log("Transactions fetched:", transactions.length);

    // Count products by name
    const productCounts: Record<string, number> = {};
    transactions.forEach(tx => {
      if (tx.productName) {
        productCounts[tx.productName] = (productCounts[tx.productName] || 0) + (tx.quantity || 1);
      }
    });

    // Convert to array and sort
    const products = Object.entries(productCounts)
      .map(([name, count]) => ({
        productName: name,
        removed: count,
        totalQuantity: count,
        lastRemoval: new Date()
      }))
      .sort((a, b) => b.removed - a.removed)
      .slice(0, limit);

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
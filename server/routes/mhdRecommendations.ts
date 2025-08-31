/**
 * API-Routen für MHD-optimierte Befüllungsempfehlungen
 */

import { Express, Request, Response } from "express";
import { z } from "zod";
import { getWeek, getYear } from "date-fns";
import { de } from "date-fns/locale";
import * as mhdForecast from "../services/mhdOptimizedForecast";
import * as recommendationEngine from "../services/refillRecommendationEngine";
import { authenticateUser } from "../middleware/auth";

// API-Prefix
const API_PREFIX = "/api/mhd-recommendations";

// Schema für Parameter-Validierung
const generateRecommendationSchema = z.object({
  machineId: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  weekNumber: z.number().int().min(1).max(53).optional(),
  year: z.number().int().min(2020).max(2030).optional(),
  daysAhead: z.number().int().min(1).max(14).default(7),
});

const batchGenerateSchema = z.object({
  weekNumber: z.number().int().min(1).max(53).optional(),
  year: z.number().int().min(2020).max(2030).optional(),
  onlyCritical: z.boolean().default(true),
  machineIds: z.array(z.number().int().positive()).optional(),
  productIds: z.array(z.number().int().positive()).optional(),
});

const filterSchema = z.object({
  machineIds: z.array(z.number().int().positive()).optional(),
  productIds: z.array(z.number().int().positive()).optional(),
  supplierIds: z.array(z.number().int().positive()).optional(),
  status: z.array(z.string()).optional(),
  weekNumber: z.number().int().min(1).max(53).optional(),
  year: z.number().int().min(2020).max(2030).optional(),
  priorityThreshold: z.number().min(0).max(1).optional(),
  riskCategory: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

const approveSchema = z.object({
  recommendationIds: z.array(z.number().int().positive()),
  notes: z.string().optional(),
});

const executeSchema = z.object({
  recommendationId: z.number().int().positive(),
  executedQuantity: z.number().int().positive(),
  notes: z.string().optional(),
});

/**
 * Registriert alle MHD-Empfehlungs-Routen
 */
export function registerMHDRecommendationRoutes(app: Express): void {
  
  /**
   * GET /api/mhd-recommendations/critical
   * Holt alle kritischen MHD-Produkte für Dashboard
   */
  app.get(`${API_PREFIX}/critical`, authenticateUser, async (req: Request, res: Response) => {
    try {
      console.log(`[MHD-API] Hole kritische MHD-Produkte`);
      
      const criticalProducts = await mhdForecast.getCriticalMHDProducts();
      
      res.json({
        success: true,
        data: criticalProducts,
        summary: {
          total: criticalProducts.length,
          critical: criticalProducts.filter(p => p.riskCategory === 'critical').length,
          high: criticalProducts.filter(p => p.riskCategory === 'high').length,
        }
      });
    } catch (error) {
      console.error("[MHD-API] Fehler beim Abrufen kritischer Produkte:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler beim Abrufen kritischer MHD-Produkte" 
      });
    }
  });

  /**
   * POST /api/mhd-recommendations/generate
   * Generiert einzelne Empfehlung für Maschine/Produkt
   */
  app.post(`${API_PREFIX}/generate`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const params = generateRecommendationSchema.parse(req.body);
      
      console.log(`[MHD-API] Generiere Empfehlung für Maschine ${params.machineId}`);
      
      const recommendation = await mhdForecast.generateWeeklyRecommendation(params);
      const savedId = await mhdForecast.saveRecommendation(recommendation, "Manuell generiert");
      
      res.json({
        success: true,
        data: {
          id: savedId,
          ...recommendation
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler bei Empfehlungs-Generierung:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Empfehlungs-Generierung" 
      });
    }
  });

  /**
   * POST /api/mhd-recommendations/batch-generate
   * Batch-Generierung von Empfehlungen
   */
  app.post(`${API_PREFIX}/batch-generate`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const params = batchGenerateSchema.parse(req.body);
      
      console.log(`[MHD-API] Batch-Generierung für KW ${params.weekNumber}/${params.year}`);
      
      const result = await recommendationEngine.generateWeeklyRecommendations(
        params.weekNumber,
        params.year,
        {
          onlyCritical: params.onlyCritical,
          machineIds: params.machineIds,
          productIds: params.productIds,
        }
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler bei Batch-Generierung:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Batch-Generierung" 
      });
    }
  });

  /**
   * GET /api/mhd-recommendations
   * Holt Empfehlungen mit Filteroptionen
   */
  app.get(`${API_PREFIX}`, authenticateUser, async (req: Request, res: Response) => {
    try {
      // Parse query parameters
      const queryParams = {
        ...req.query,
        machineIds: req.query.machineIds ? String(req.query.machineIds).split(',').map(Number) : undefined,
        productIds: req.query.productIds ? String(req.query.productIds).split(',').map(Number) : undefined,
        supplierIds: req.query.supplierIds ? String(req.query.supplierIds).split(',').map(Number) : undefined,
        status: req.query.status ? String(req.query.status).split(',') : undefined,
        weekNumber: req.query.weekNumber ? Number(req.query.weekNumber) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        priorityThreshold: req.query.priorityThreshold ? Number(req.query.priorityThreshold) : undefined,
      };
      
      const filter = filterSchema.parse(queryParams);
      
      console.log(`[MHD-API] Hole Empfehlungen mit Filter:`, filter);
      
      const recommendations = await recommendationEngine.getRecommendations(filter);
      
      res.json({
        success: true,
        data: recommendations,
        total: recommendations.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Filter-Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler beim Abrufen der Empfehlungen:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler beim Abrufen der Empfehlungen" 
      });
    }
  });

  /**
   * GET /api/mhd-recommendations/grouped
   * Holt gruppierte Empfehlungen (nach Lieferant/Maschine)
   */
  app.get(`${API_PREFIX}/grouped`, authenticateUser, async (req: Request, res: Response) => {
    try {
      // Parse query parameters (same as above)
      const queryParams = {
        ...req.query,
        machineIds: req.query.machineIds ? String(req.query.machineIds).split(',').map(Number) : undefined,
        productIds: req.query.productIds ? String(req.query.productIds).split(',').map(Number) : undefined,
        supplierIds: req.query.supplierIds ? String(req.query.supplierIds).split(',').map(Number) : undefined,
        status: req.query.status ? String(req.query.status).split(',') : undefined,
        weekNumber: req.query.weekNumber ? Number(req.query.weekNumber) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        priorityThreshold: req.query.priorityThreshold ? Number(req.query.priorityThreshold) : undefined,
      };
      
      const filter = filterSchema.parse(queryParams);
      
      console.log(`[MHD-API] Hole gruppierte Empfehlungen`);
      
      const grouped = await recommendationEngine.getGroupedRecommendations(filter);
      
      res.json({
        success: true,
        data: grouped
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Filter-Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler beim Abrufen gruppierter Empfehlungen:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler beim Abrufen gruppierter Empfehlungen" 
      });
    }
  });

  /**
   * POST /api/mhd-recommendations/approve
   * Genehmigt Empfehlungen
   */
  app.post(`${API_PREFIX}/approve`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const { recommendationIds, notes } = approveSchema.parse(req.body);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: "Benutzer-Authentifizierung erforderlich" 
        });
      }
      
      console.log(`[MHD-API] Genehmige ${recommendationIds.length} Empfehlungen`);
      
      const result = await recommendationEngine.batchApproveRecommendations(
        recommendationIds, 
        userId, 
        notes
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler bei Genehmigung:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Genehmigung" 
      });
    }
  });

  /**
   * POST /api/mhd-recommendations/execute
   * Markiert Empfehlung als ausgeführt
   */
  app.post(`${API_PREFIX}/execute`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const { recommendationId, executedQuantity, notes } = executeSchema.parse(req.body);
      
      console.log(`[MHD-API] Markiere Empfehlung ${recommendationId} als ausgeführt`);
      
      const success = await recommendationEngine.markRecommendationExecuted(
        recommendationId, 
        executedQuantity, 
        notes
      );
      
      if (success) {
        res.json({
          success: true,
          message: "Empfehlung als ausgeführt markiert"
        });
      } else {
        res.status(404).json({
          success: false,
          error: "Empfehlung nicht gefunden"
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Ungültige Parameter", 
          details: error.errors 
        });
      }
      
      console.error("[MHD-API] Fehler bei Ausführung:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Ausführung" 
      });
    }
  });

  /**
   * GET /api/mhd-recommendations/order-list
   * Erstellt Bestellliste basierend auf genehmigten Empfehlungen
   */
  app.get(`${API_PREFIX}/order-list`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const weekNumber = req.query.weekNumber ? Number(req.query.weekNumber) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const supplierIds = req.query.supplierIds 
        ? String(req.query.supplierIds).split(',').map(Number) 
        : undefined;
      
      console.log(`[MHD-API] Erstelle Bestellliste für KW ${weekNumber}/${year}`);
      
      const orderList = await recommendationEngine.createOrderList(
        weekNumber, 
        year, 
        supplierIds
      );
      
      res.json({
        success: true,
        data: orderList,
        summary: {
          totalSuppliers: orderList.length,
          totalProducts: orderList.reduce((sum, s) => sum + s.totalProducts, 0),
          totalQuantity: orderList.reduce((sum, s) => sum + s.totalQuantity, 0),
        }
      });
    } catch (error) {
      console.error("[MHD-API] Fehler bei Bestelllisten-Erstellung:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Bestelllisten-Erstellung" 
      });
    }
  });

  /**
   * GET /api/mhd-recommendations/dashboard-stats
   * Holt Dashboard-Statistiken für MHD-Empfehlungen
   */
  app.get(`${API_PREFIX}/dashboard-stats`, authenticateUser, async (req: Request, res: Response) => {
    try {
      console.log(`[MHD-API] Hole Dashboard-Statistiken`);
      
      const stats = await recommendationEngine.getDashboardStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error("[MHD-API] Fehler bei Dashboard-Statistiken:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler beim Abrufen der Dashboard-Statistiken" 
      });
    }
  });

  /**
   * GET /api/mhd-recommendations/risk-analysis/:machineId/:productId
   * Holt detaillierte Risiko-Analyse für spezifisches Produkt
   */
  app.get(`${API_PREFIX}/risk-analysis/:machineId/:productId`, authenticateUser, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.machineId, 10);
      const productId = parseInt(req.params.productId, 10);
      
      if (isNaN(machineId) || isNaN(productId)) {
        return res.status(400).json({
          success: false,
          error: "Ungültige Maschinen- oder Produkt-ID"
        });
      }
      
      console.log(`[MHD-API] Risiko-Analyse für M${machineId}/P${productId}`);
      
      const analysis = await mhdForecast.calculateExpiryRisk(machineId, productId);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error("[MHD-API] Fehler bei Risiko-Analyse:", error);
      res.status(500).json({ 
        success: false, 
        error: "Fehler bei der Risiko-Analyse" 
      });
    }
  });

  console.log(`[MHD-API] ✅ MHD-Empfehlungsrouten registriert unter ${API_PREFIX}`);
}
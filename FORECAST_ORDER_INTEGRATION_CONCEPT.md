# Forecast-Based Order Integration Concept

## Overview
Integration von prognosebasierten Bestellungen in das bestehende Bestellsystem mit Fokus auf Lieferanten-Aggregation und lagerorientierte Lieferung.

## Core Concept: Supplier-Centric Ordering with Warehouse-Specific Delivery

### 1. Order Flow Architecture

#### Traditional Flow (Current)
```
Warehouse Selection → Supplier Selection → Product Selection → Order Creation
```

#### Enhanced Forecast Flow (New)
```
Forecast Mode Selection → Multi-Warehouse Analysis → Supplier Aggregation → Location-Specific Delivery Planning → Order Creation
```

### 2. Key Components

#### A. Forecast Order Mode
- **Multi-Warehouse Forecast Analysis**: Analyse aller Lager eines Lieferanten
- **Consolidated Demand Calculation**: Summierung der prognostizierten Nachfrage
- **Intelligent Allocation**: Verteilung basierend auf Lagerkapazitäten und Transportoptimierung

#### B. Supplier-Level Aggregation
```typescript
interface SupplierForecastOrder {
  supplierId: number;
  supplierName: string;
  totalOrderValue: number;
  forecastPeriod: {
    weeksAhead: number;
    startDate: string;
    endDate: string;
  };
  warehouseAllocations: WarehouseAllocation[];
  consolidatedProducts: ConsolidatedProduct[];
  deliveryOptimization: DeliveryPlan;
}

interface WarehouseAllocation {
  warehouseId: number;
  warehouseName: string;
  locationName: string;
  products: ProductAllocation[];
  deliveryPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedDeliveryDate: string;
}

interface ConsolidatedProduct {
  productId: number;
  productName: string;
  totalDemand: number;
  warehouseBreakdown: {
    warehouseId: number;
    currentStock: number;
    predictedSales: number;
    suggestedQuantity: number;
  }[];
  weatherImpact: number;
  holidayImpact: number;
  consolidatedOrderQuantity: number;
}
```

### 3. Implementation Strategy

#### Phase 1: Enhanced Order Mode Selection
- Extend `OrderModeSelector` component
- Add "Prognosebasierte Bestellung" mode
- Include forecast parameters (weeks ahead, weather/holiday factors)

#### Phase 2: Multi-Warehouse Forecast Engine
- Create `SupplierForecastService` for cross-warehouse analysis
- Implement demand aggregation algorithms
- Develop delivery optimization logic

#### Phase 3: Smart Allocation System
- Location-based delivery routing
- Inventory capacity constraints
- Transportation cost optimization

### 4. User Interface Flow

#### Step 1: Forecast Configuration
```
┌─────────────────────────────────────┐
│ Prognosebasierte Bestellung         │
├─────────────────────────────────────┤
│ Vorhersagezeitraum: [2] Wochen      │
│ ☑ Wetterdaten berücksichtigen       │
│ ☑ Feiertage berücksichtigen         │
│ ☑ Alle Lager analysieren            │
│                                     │
│ [Lieferanten-Prognose starten]      │
└─────────────────────────────────────┘
```

#### Step 2: Supplier Selection & Analysis
```
┌─────────────────────────────────────┐
│ Lieferanten-Bedarfsanalyse          │
├─────────────────────────────────────┤
│ Dr. Quendt GmbH                     │
│ • 4 Lager betroffen                 │
│ • Gesamtbedarf: €2,847.50           │
│ • Optimierte Lieferroute            │
│                                     │
│ GUSTAV MÜLLER GmbH                  │
│ • 2 Lager betroffen                 │
│ • Gesamtbedarf: €1,234.80           │
│ • Standardlieferung                 │
└─────────────────────────────────────┘
```

#### Step 3: Consolidated Product View
```
┌─────────────────────────────────────────────────────────────┐
│ Dr. Quendt GmbH - Konsolidierte Bestellung                 │
├─────────────────────────────────────────────────────────────┤
│ Produkt              │ Gesamt │ Bad Schandau │ Hohenstein   │
│ Quendt Domino       │   48    │     20       │     28       │
│ Quendt Baumkuchen   │   24    │     12       │     12       │
│                     │         │              │              │
│ Lieferplan:                                                 │
│ • Bad Schandau: Do, 12.06. (Priorität: HOCH)              │
│ • Hohenstein:   Fr, 13.06. (Priorität: MITTEL)            │
└─────────────────────────────────────────────────────────────┘
```

### 5. Technical Implementation

#### A. New API Endpoints

```typescript
// Supplier-level forecast analysis
GET /api/forecast/supplier-analysis
POST /api/forecast/multi-warehouse-suggestions
POST /api/orders/forecast-based

// Enhanced order creation with allocation
POST /api/orders/consolidated-supplier-order
```

#### B. Database Extensions

```sql
-- Order allocation tracking
CREATE TABLE order_allocations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  planned_delivery_date DATE,
  delivery_priority VARCHAR(10),
  allocation_method VARCHAR(20), -- 'forecast', 'manual', 'auto'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Forecast order metadata
CREATE TABLE forecast_orders (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  forecast_period_weeks INTEGER,
  weather_included BOOLEAN DEFAULT true,
  holidays_included BOOLEAN DEFAULT true,
  total_warehouses_affected INTEGER,
  consolidation_savings DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6. Business Logic

#### A. Demand Consolidation Algorithm
1. **Cross-Warehouse Analysis**: Sammle Prognosen für alle Lager eines Lieferanten
2. **Minimum Order Quantities**: Berücksichtige MOQs und Packaging-Einheiten
3. **Volume Discounts**: Nutze Mengenrabatte durch Konsolidierung
4. **Delivery Optimization**: Plane effiziente Lieferrouten

#### B. Smart Allocation Rules
```typescript
class AllocationEngine {
  allocateProducts(
    consolidatedDemand: ConsolidatedProduct[],
    warehouses: Warehouse[]
  ): AllocationPlan {
    // 1. Priority-based allocation (critical stock levels first)
    // 2. Capacity constraints (storage limits)
    // 3. Geographic optimization (delivery routes)
    // 4. Seasonal adjustments (weather/holiday factors)
  }
}
```

### 7. Integration Points

#### A. Existing Order System Enhancement
- Extend `BestellungV2` component with forecast mode
- Enhance `ProductSelectionTable` for multi-warehouse view
- Update `OrderSummary` to show allocation breakdown

#### B. Forecast Service Integration
- Leverage existing `forecastService.getEnhancedOrderSuggestions`
- Create new `supplierForecastService` for aggregation
- Integrate with weather and holiday services

### 8. User Benefits

#### A. For Operations Managers
- **Consolidated View**: Überblick über alle Lager eines Lieferanten
- **Optimized Orders**: Reduzierte Transportkosten durch Konsolidierung
- **Predictive Planning**: Automatische Berücksichtigung von Wetter und Feiertagen

#### B. For Warehouse Managers
- **Location-Specific Delivery**: Klare Zuordnung der Lieferungen
- **Priority Management**: Priorisierung basierend auf Bestandslevels
- **Transparency**: Nachvollziehbare Allokationsentscheidungen

### 9. Implementation Phases

#### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Extend order mode selection
- [ ] Create supplier forecast service
- [ ] Implement basic aggregation logic

#### Phase 2: UI Enhancement (Week 3-4)
- [ ] Multi-warehouse product selection interface
- [ ] Allocation planning components
- [ ] Delivery optimization display

#### Phase 3: Advanced Features (Week 5-6)
- [ ] Route optimization integration
- [ ] Volume discount calculations
- [ ] Advanced allocation algorithms

#### Phase 4: Testing & Refinement (Week 7-8)
- [ ] User acceptance testing
- [ ] Performance optimization
- [ ] Documentation completion

### 10. Success Metrics

- **Order Efficiency**: Reduction in separate orders per supplier
- **Cost Savings**: Transportation and administrative cost reduction
- **Forecast Accuracy**: Improved prediction through multi-location data
- **User Adoption**: Percentage of orders using forecast mode
- **Inventory Optimization**: Reduced stockouts and overstock situations

This concept provides a comprehensive framework for integrating forecast-based ordering while maintaining the flexibility and efficiency of the existing system.
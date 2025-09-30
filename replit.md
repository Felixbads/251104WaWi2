# German Warehouse Management System (Warenwirtschaft)

## Overview
This project is an advanced AI-powered inventory and price management system for German vending machine networks. Its purpose is to provide real-time operational intelligence and financial analysis. Key capabilities include machine-specific transaction and revenue intelligence, automated warehouse management and inventory tracking, and real-time synchronization with Vendon vending machine systems. The system integrates weather and holiday data for predictive models, aiming to optimize stock levels and pricing strategies for improved profitability and efficiency.

## User Preferences
- Technical documentation preferred in German.
- Focus on performance and scalability.
- Detailed explanations for system optimizations.
- TypeScript with strict types.
- Comprehensive error handling.
- Performance-oriented implementations.
- Batch processing where possible.

## System Architecture
The system employs a robust architecture designed for complex vending machine operations:

### Technology Stack
-   **Frontend**: React + TypeScript for the user interface, incorporating advanced data visualization.
-   **Backend**: Express.js, with comprehensive route modularity for organized API endpoints.
-   **Database**: PostgreSQL, managed with Drizzle ORM for reliable and efficient data handling.

### Core Features and Design Principles
-   **Data Intelligence**: Provides granular insights into machine-specific transactions and revenue.
-   **Inventory Management**: Automates warehouse management and inventory tracking processes.
-   **Predictive Analytics**: Integrates external data (weather, holidays) to enhance forecasting for demand and sales.
-   **Real-time Synchronization**: Maintains data consistency with Vendon vending machine systems.
-   **Performance Optimization**: Implements batch processing for database operations, enforces proper user authentication for modifying routes, and performs data deduplication (especially for machines). Deployment shifted to Reserved VM for stable background processes.
-   **UI/UX Decisions**: Dashboard displays only authentic, real-time data. Improved user experience for withdrawals and goods receipt workflows. Robust handling of API responses for dropdowns to prevent data display errors.
-   **Stock Ratios Endpoints**: Comprehensive API endpoints for managing and retrieving stock ratios, including system-wide averages, machine-specific data, and formatted outputs for external APIs, with rate-limiting and error resilience for Vendon API calls.
-   **Purchase Conditions Integration**: System-wide architecture migration to use `purchase_conditions.packaging_quantity/packaging_unit` for consistent package processing, replacing `products.package_size`. This includes updates across inventory, goods receipt, and warehouse transfer modules, ensuring consistent API usage and dual-field input for "Gebinde" and "Einzelstücke".
-   **Email Integration**: All order confirmation emails now include secure, time-limited portal links for suppliers, integrated consistently across different email systems.
-   **Robust Data Handling**: API-Frontend compatibility fixes for inconsistent data structures (e.g., `is_active` vs `isActive`). Intelligent package recognition logic prevents redundant input fields for products with package information already in their name.
-   **Database Integrity**: Critical bug fixes for database duplication issues, particularly for machine records, by ensuring unique constraints and correct Vendon sync logic. This significantly improved analytics performance.
-   **Analytics and Charting**: Repaired data flow for machine detail pages, ensuring analytics charts display correctly by adapting to daily backend data and intelligently distributing it hourly. Implemented loading, error, and empty states for all revenue charts and product performance sections.
-   **Centralized Ordering**: Consolidated fragmented ordering processes into a single "Neue Bestellung" function with an OrderModeSelector, enhancing user experience with improved search, filter, and sort options for order copying.
-   **Routing Consistency**: Resolved all routing issues, ensuring functional and consistent URL structures for machine details (`/automaten/:id`) and correct navigation from status overviews to machine details using `vendon_id`.
-   **MHD-Optimized Refill Templates**: Comprehensive system for managing perishable products (milk, cheese, sausage) with expiration date (MHD) optimization. Features automated product categorization by shelf life, risk-based quantity adjustments for refill templates, bidirectional Vendon API synchronization (import → optimize → upload), and batch processing for multiple machines. The system applies intelligent reduction algorithms (70% for critical, 50% for high, 30% for medium risk) to prevent stock spoilage while maintaining availability for popular products.
-   **Refills Tracking System**: Critical warehouse operations feature that tracks inventory reduction through machine refills. Resolved 500 error by removing out-of-pattern temporary warehouse-specific route in favor of standardized general route (`/api/warehouse3/warehouses/:warehouseId/refills`) using storage-first pattern with proper authentication, authorization, and audit logging. This ensures consistent refill data display across all warehouses and prevents inventory tracking disruptions.
-   **Inventory UI Cleanup (Sept 2025)**: Removed non-functional UI elements from warehouse inventory interface: eliminated "Lagerort" column (referencing non-existent `item.location` field) and "Barcode anzeigen" menu item from InventoryTab. These removals resolved runtime display errors and streamlined the interface to show only functional columns: Produkt, Bestand, Status, MHD, and Aktionen.
-   **Inventory Calculation Logic**: Complete inventory tracking through four primary operations: (1) **Wareneingang** (goods receipt) increases stock via `createProductBatch()` calling `updateProductStock()`, (2) **Umlagerung** (transfer) updates source/destination warehouse inventory_items directly via `/warehouse-movements/transfer` endpoint, (3) **Automaten-Befüllung** (machine refill) reduces stock using FIFO batch logic via `createRefillTrackingItem()` and `updateProductStock()`, and (4) all operations log movements in `inventory_movements` table with previousStock/currentStock audit trail. Stock calculations incorporate batch tracking for expiry dates (MHD) and maintain consistency across warehouse operations.

## External Dependencies
-   **Vendon API**: Primary integration for real-time vending machine data collection and synchronization.
-   **PostgreSQL**: Relational database used for persistent data storage.
# German Warehouse Management System (Warenwirtschaft)

## Overview
This project is an advanced AI-powered inventory and price management system designed for German vending machine networks. Its core purpose is to provide real-time operational intelligence and financial analysis for complex vending machine ecosystems. Key capabilities include machine-specific transaction and revenue intelligence, automated warehouse management and inventory tracking, and real-time synchronization with Vendon vending machine systems. The system also integrates weather and holiday data for predictive models, aiming to optimize stock levels and pricing strategies.

## User Preferences
- Technical documentation preferred in German.
- Focus on performance and scalability.
- Detailed explanations for system optimizations.
- TypeScript with strict types.
- Comprehensive error handling.
- Performance-oriented implementations.
- Batch processing where possible.

## System Architecture
The system employs a robust architecture to manage complex vending machine operations:

### Technology Stack
-   **Frontend**: React + TypeScript for the user interface, incorporating advanced data visualization.
-   **Backend**: Express.js, featuring comprehensive route modularity for organized API endpoints.
-   **Database**: PostgreSQL, managed with Drizzle ORM for reliable and efficient data handling.

### Core Features and Design Principles
-   **Data Intelligence**: Provides granular insights into machine-specific transactions and revenue.
-   **Inventory Management**: Automates warehouse management and inventory tracking processes.
-   **Predictive Analytics**: Integrates external data sources like weather and holidays to enhance forecasting models for demand and sales.
-   **Real-time Synchronization**: Maintains real-time data consistency with Vendon vending machine systems.
-   **Performance Optimization**:
    -   **Batch Processing**: Implemented for database operations (e.g., transaction duplication checks and insertions) to significantly reduce SQL queries and database connections, improving sync times.
    -   **Authentication Enhancement**: All modifying routes, particularly for retroactive inventory, now enforce proper user authentication, using `req.user.id` and `req.user.username` for auditability instead of hardcoded values.
    -   **Data Deduplication**: Critical for machines, where significant duplicate entries were eliminated through database cleanup and optimized API queries (`DISTINCT ON`).
    -   **Deployment Strategy**: Shifted from autoscale to Reserved VM deployment for stable background processes critical for continuous operations.
-   **UI/UX Decisions**:
    -   Dashboard displays only authentic, real-time data, removing misleading hardcoded estimations for net value and margin.
    -   Improved user experience for "withdrawal over 7 days" by providing clear status messages.
    -   Intelligent navigation for goods receipt workflows based on order status.
    -   Robust handling of API responses for dropdowns and lists to ensure correct display of warehouse names and machine data, preventing "zero" or "no warehouse found" issues.

### Feature Specifications
-   **Stock Ratios Endpoints**: Comprehensive API endpoints for managing and retrieving stock ratios, including system-wide averages, machine-specific data, and formatted outputs for external APIs.
    -   Implemented `StockRatioService` for calculating and managing stock levels.
    -   Incorporates rate-limiting and error resilience for external API calls (Vendon).

## External Dependencies
-   **Vendon API**: Primary integration for real-time vending machine data collection and synchronization.
-   **PostgreSQL**: Relational database used for persistent data storage.
```
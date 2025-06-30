# Vending Machine Management System

## Overview

This is a comprehensive vending machine management platform (Warenwirtschaftssystem) built with React and Node.js. The system manages vending machines, inventory, orders, suppliers, and provides real-time monitoring capabilities. It integrates with the Vendon API for transaction data and machine telemetry.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Custom component library with shadcn/ui base
- **Styling**: Tailwind CSS with responsive design patterns
- **Build Tool**: Vite for fast development and optimized builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **API Design**: RESTful endpoints with structured error handling
- **External Integration**: Vendon API for real-time vending machine data
- **Authentication**: Role-based access control with user approval system

### Data Storage Solutions
- **Primary Database**: PostgreSQL hosted on Neon (serverless)
- **Schema Management**: Drizzle ORM with TypeScript schema definitions
- **Backup Strategy**: Automated database backups with 7-day retention
- **Data Sync**: Real-time synchronization with Vendon API for transactions and machine status

## Key Components

### Core Business Logic
1. **Vending Machine Management**: Real-time monitoring, status tracking, and configuration
2. **Inventory System**: Multi-warehouse inventory tracking with batch management and expiration dates
3. **Order Processing**: Complete order lifecycle from creation to delivery with PDF generation
4. **Supplier Management**: Comprehensive supplier database with product catalogs
5. **Transaction Processing**: Real-time transaction import and historical data analysis
6. **User Management**: Role-based access with approval workflows

### Technical Components
1. **Storage Layer**: `server/storage/database-storage.ts` - Database abstraction layer
2. **API Layer**: `server/routes/` - Modular route handlers for different business domains
3. **Sync Services**: `server/services/vendonSync.ts` - Real-time data synchronization
4. **PDF Generation**: Order and document generation with customizable templates
5. **Excel Import System**: Bulk data import capabilities for historical transactions

## Data Flow

### Real-time Data Synchronization
1. Vendon API provides machine status, transactions, and telemetry data
2. Background sync service polls API endpoints every 5 minutes
3. Data is normalized and stored in local PostgreSQL database
4. Frontend receives updates through API polling and displays real-time status

### Order Processing Flow
1. User selects warehouse and supplier
2. Products are selected with quantities and delivery preferences
3. Order is validated and stored with generated order number
4. PDF documents are generated for customer and internal use
5. Email notifications are sent to relevant parties
6. Order status is tracked through completion

### Inventory Management Flow
1. Products are synchronized from Vendon API and supplier catalogs
2. Warehouse assignments link products to physical locations
3. Inventory movements track all stock changes with audit trail
4. Automated reorder points trigger procurement notifications
5. Batch tracking manages expiration dates and quality control

## External Dependencies

### Core APIs
- **Vendon Cloud API**: Machine data, transactions, and telemetry
- **SMTP Service**: Email notifications for orders and system alerts
- **PostgreSQL**: Primary data storage on Neon platform

### Libraries and Frameworks
- **React Ecosystem**: React, React DOM, React Hook Form
- **State Management**: TanStack Query, Zustand
- **UI Components**: Radix UI primitives, Lucide React icons
- **Data Processing**: date-fns, Zod validation, XLSX for Excel handling
- **PDF Generation**: jsPDF, html2canvas for document creation

### Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **Vite**: Fast development server and build tool
- **Tailwind CSS**: Utility-first styling framework
- **ESLint/Prettier**: Code quality and formatting

## Deployment Strategy

### Production Environment
- **Platform**: Replit with autoscale deployment target
- **Build Process**: `npm run build` creates production-optimized bundle
- **Runtime**: `npm run start` serves production application
- **Port Configuration**: Internal port 5000 mapped to external port 80

### Database Management
- **Schema Deployment**: `npm run db:push` applies schema changes
- **Migrations**: Drizzle migrations for database versioning
- **Backup System**: Automated daily backups with retention policy
- **Connection Pooling**: PostgreSQL connection pooling for performance

### Environment Configuration
- **Development**: Hot reloading with Vite dev server
- **Production**: Optimized build with compression and caching
- **Environment Variables**: Secure handling of API keys and database credentials
- **Monitoring**: Application health checks and error logging

## Changelog

- June 30, 2025: External Photo API and Supplier Upload System Implemented
  - ✓ Complete supplier photo upload system with automatic scaling (thumbnail, medium, large)
  - ✓ External API for accessing photo data with supplier/producer relationships
  - ✓ New endpoints: `/api/photos/external/{entityType}/{entityId}` and `/api/photos/external/search/{entityType}`
  - ✓ Comprehensive API documentation for external application integration
  - ✓ Photo upload for suppliers with WebP conversion and multiple size variants
  - ✓ Structured data access maintaining supplier-product relationships for external apps
  - System now provides complete photo management for both products and suppliers with external API access
- June 30, 2025: Advanced Photo Upload System with Image Processing Implemented
  - ✓ Complete photo upload system with Sharp-based image processing
  - ✓ Automatic image scaling: thumbnail (150x150), medium (400x400), large (800x800)
  - ✓ WebP format conversion for optimal performance (25-35% smaller files)
  - ✓ Multiple file upload support with comprehensive error handling
  - ✓ Photo upload API tested and confirmed working: `/api/photos/upload`
  - ✓ Comprehensive photo upload analysis document created
  - ✓ Support for both product and supplier photo management
  - Image processing creates multiple size variants automatically for responsive display
- June 30, 2025: Product Categories and Photo Upload Fixed
  - ✓ Fixed product categories dropdown to show all available categories from database
  - ✓ Added "Aufstriche" and "Gerichte im Glas" to product categories table
  - ✓ Corrected category list to match user interface (Getränke, Snacks, Süßwaren, etc.)
  - ✓ Repaired photo upload functionality with proper Multer middleware integration
  - ✓ Fixed photo upload endpoint `/api/photos/upload` with correct URL generation
  - Categories now load from `product_categories` table instead of existing product categories only
- June 30, 2025: Consolidated Product Detail View with Mobile-First Design
  - ✓ Consolidated Details and Overview tabs into single comprehensive Details tab
  - ✓ Removed Nährwerte, Fotos, and Übersicht tabs as requested
  - ✓ Implemented mobile-first responsive design with adaptive grid layouts
  - ✓ Added purchase conditions (Einkaufsbedingungen) section under supplier information
  - ✓ Enhanced ingredient and nutrition display with improved visual hierarchy
  - ✓ Integrated photo gallery within consolidated Details view
  - ✓ Optimized typography and spacing for better mobile readability
  - ✓ Maintained comprehensive product information in organized card sections
- June 30, 2025: Enhanced Product Data Entry Interface
  - ✓ Implemented focused tabular product editing interface with required fields only
  - ✓ Removed unwanted fields (Preis, Status, MwSt, Bio, Lokal, Vegan, Vegetarisch) from display
  - ✓ Made product name read-only with improved display styling for better readability
  - ✓ Added functional photo upload capability with file selection and progress indication
  - ✓ Implemented individual and bulk save functionality for product updates
  - ✓ Optimized table layout with proper column widths for enhanced readability
  - ✓ Added search functionality to filter products by name or category
  - Interface now displays only editable fields: Kurzbeschreibung, Detailbeschreibung, Gebindegröße, Inhaltsstoffe, Allergene, and Foto hochladen
- June 24, 2025: Complete StandortStatus consistency fixes implemented
  - RESOLVED: Fixed "Letzter Verkauf" to derive from recentTransactions[0] with consistent datetime display
  - RESOLVED: Fixed "Letzter bargeldloser Verkauf" to show formatted datetime instead of payment method
  - RESOLVED: Fixed backend cashless sale query to properly exclude CASH transactions
  - RESOLVED: Added intelligent fallback for door opening times using refill datetime when door events missing
  - RESOLVED: All timestamp displays now consistently show both date and time across all fields
  - Frontend now displays harmonized data without contradictory timestamps
- June 24, 2025: Fixed location status data synchronization issues
  - RESOLVED: Fixed door event query in location-status API (event_name → event_type = 'A')
  - RESOLVED: Manual refills sync successfully retrieved today's Stolpen refill data
  - Dashboard now displays current refill dates instead of 18-day-old data
  - Door events from June 22nd now properly detected and displayed
  - Location status accurately shows "daysAgo: 0" for today's refills
- June 24, 2025: Identified critical Vendon API synchronization failure
  - Events and refills endpoints returning 400 Bad Request errors
  - Most recent door events are from June 7th (17 days old)
  - Location status displaying "Letzte Türöffnung 07.06.2025" due to stale data
  - Only transaction sync is working; events/refills sync broken for weeks
  - Need updated API key with proper events/refills endpoint access
- June 24, 2025: Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.
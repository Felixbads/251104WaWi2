# Vending Machine Management System

## Overview
This is a comprehensive vending machine management platform (Warenwirtschaftssystem) built with React and Node.js. The system facilitates the management of vending machines, inventory, orders, and suppliers, while also providing real-time monitoring capabilities. It integrates with the Vendon API for transaction data and machine telemetry, aiming to streamline operations and enhance profitability in the vending industry. Key capabilities include multi-warehouse inventory tracking, automated order processing with intelligent forecasting, and detailed profitability analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (2025-08-04)
### PDF Email Attachment System with Fallback Implementation
**Issue**: Implement PDF attachment feature for order emails with two modes - standard HTML emails and PDF attachments with cover letters. PDF preview functionality and editable cover letter text required.

**Solution**: Complete PDF email system with robust fallback:
- **Backend**: PDF service using Puppeteer with enhanced Chrome launch options for container environments
- **Email System**: Two modes - HTML emails with full order details, or PDF attachments with short cover letters
- **Fallback Handling**: When PDF generation fails (due to missing system dependencies), automatically falls back to HTML email
- **API Endpoints**: `/api/orders-email-working/{id}/pdf-preview` and `/api/orders-email-working/{id}/send-email-working`
- **Frontend**: EmailDialog with PDF toggle, cover text field, preview functionality, and user-friendly error handling
- **Error Management**: Graceful degradation - system remains fully functional even when PDF is unavailable

**Impact**: Complete email functionality for order processing. PDF mode provides professional attachments when available, HTML mode ensures reliable communication regardless of system constraints. Users receive clear feedback about delivery method used.

### Transaction Display and Net Profit Calculation Fix
**Issue**: Transaction overview showed incorrect NETTO values - displaying gross sales price instead of actual net profit. Vita Cola showed €2.80 in NETTO column instead of correct €2.00 after deducting purchase price (€0.65) and deposit (€0.15).

**Solution**: Complete overhaul of transaction calculation system:
- **Database**: Fixed Vita Cola deposit_price from 0 to correct 0.15€
- **Backend**: Enhanced SQL queries in transaction endpoints to JOIN with products and purchase_conditions tables
- **Formula**: Implemented correct net profit calculation: `COALESCE(price_wo_vat, price - price_vat) - unit_price - deposit_price`
- **API**: Added comprehensive fields: priceWoVat, priceVat, purchasePriceNet, depositPrice, netResult
- **Frontend**: Transaction table already correctly configured to display netResult in NETTO column

**Impact**: Transaction overview now shows realistic profit margins instead of gross sales amounts. Example: Vita Cola correctly shows €2.00 net profit (€2.80 - €0.65 - €0.15) rather than €2.80 gross price.

## Previous Changes (2025-08-01)
### Bulk Order Product Visibility Fix
**Issue**: Products with Gustav Müller purchase conditions (e.g., Apfelschorle) were not appearing in bulk order dialogs because SQL queries filtered only by `p.supplier_id = ${supplierId}`, excluding products with purchase conditions but no direct supplier_id relationship.

**Solution**: Updated all SQL queries in `server/routes/bulk-orders.ts` to include products with purchase conditions:
- Changed `WHERE p.supplier_id = ${supplierId}` to `WHERE (p.supplier_id = ${supplierId} OR pc.supplier_id = ${supplierId})`
- Applied fix to all three query types: inventory, sales analysis, and forecast queries
- Now includes all products with Gustav Müller purchase conditions regardless of supplier_id field setting

**Impact**: Ensures complete product visibility in bulk ordering system, preventing missed ordering opportunities for products with valid purchase conditions.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter
- **UI Components**: Custom library with shadcn/ui base, Radix UI primitives, Lucide React icons
- **Styling**: Tailwind CSS with responsive design patterns
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with Drizzle ORM (hosted on Neon)
- **API Design**: RESTful endpoints with structured error handling
- **External Integration**: Vendon API for real-time vending machine data
- **Authentication**: Role-based access control with user approval system
- **Core Business Logic**: Vending machine monitoring, inventory management (with batch and expiration tracking), comprehensive order processing (including recurring orders and bulk orders), supplier management, transaction processing, user management, and detailed profitability analysis.
- **Key Technical Components**: Database abstraction layer (`server/storage/database-storage.ts`), modular API route handlers (`server/routes/`), real-time data synchronization services (`server/services/vendonSync.ts`), PDF generation, and Excel import system.
- **Data Flow**: Real-time data synchronization from Vendon API to local PostgreSQL, automated order processing from creation to delivery, and robust inventory management including batch tracking and reorder points.

### System Design Choices
- **UI/UX**: Mobile-first design, clean card layouts, consistent currency formatting (EUR), dynamic email templates for business communication, and unified component architecture to eliminate redundancy.
- **Inventory**: Comprehensive package-based system supporting various unit types (Gebinde, Stück), FIFO-based MHD (minimum shelf life) management, and retroactive inventory counting.
- **Forecasting**: Enhanced Prophet system for seasonal sales forecasting, incorporating holiday/vacation factors, and weather-based predictions.
- **Product Management**: Streamlined product detail view with inline editing, photo upload with image processing (scaling, WebP conversion), and comprehensive cost/revenue analysis.
- **Supplier Interaction**: Dedicated supplier portal with token-based access, discount condition management, and detailed analytics.
- **Deployment**: Production-ready builds with resolved TypeScript compilation issues, automated database schema management (Drizzle migrations), and secure environment configuration.

## External Dependencies
- **Vendon Cloud API**: Primary source for machine data, transactions, and telemetry.
- **PostgreSQL**: Main database, hosted on Neon (serverless).
- **SMTP Service**: For email notifications and system alerts.
- **Libraries**:
    - **React Ecosystem**: React, React DOM, React Hook Form.
    - **State Management**: TanStack Query, Zustand.
    - **UI Utilities**: Radix UI primitives, Lucide React icons, shadcn/ui.
    - **Date/Time**: date-fns.
    - **Validation**: Zod.
    - **Spreadsheet Handling**: XLSX (for Excel import/export).
    - **PDF Generation**: jsPDF, html2canvas.
    - **Image Processing**: Sharp (for photo uploads).
- **Development Tools**: TypeScript, Vite, Tailwind CSS, ESLint, Prettier.
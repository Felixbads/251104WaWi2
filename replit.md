# Vending Machine Management System

## Overview
This is a comprehensive vending machine management platform (Warenwirtschaftssystem) built with React and Node.js. The system facilitates the management of vending machines, inventory, orders, and suppliers, while also providing real-time monitoring capabilities. It integrates with the Vendon API for transaction data and machine telemetry, aiming to streamline operations and enhance profitability in the vending industry. Key capabilities include multi-warehouse inventory tracking, automated order processing with intelligent forecasting, and detailed profitability analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

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
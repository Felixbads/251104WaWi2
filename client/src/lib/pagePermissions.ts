/**
 * Page Permissions Utility
 * 
 * This module provides functions for registering pages and checking permissions
 * in the page access control system.
 */

import { InsertPagePermission } from "../../../shared/schema";

/**
 * Register a new page in the page permissions system
 * This function should be called when creating new pages to ensure they are
 * tracked in the permission system.
 */
export async function registerPage(
  pageId: string, 
  pageTitle: string, 
  options?: {
    category?: string;
    description?: string;
    visibleForEmployee?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const pageData: InsertPagePermission = {
      pageId,
      pageTitle,
      category: options?.category,
      description: options?.description,
      visibleForEmployee: options?.visibleForEmployee ?? false,
    };

    const response = await fetch('/api/page-permissions/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pageData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to register page');
    }

    console.log(`[PAGE-PERMISSIONS] Successfully registered page: ${pageId} - ${pageTitle}`);
    return { success: true };

  } catch (error) {
    console.error(`[PAGE-PERMISSIONS] Error registering page ${pageId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Check if a page is visible for employees
 * This function can be used in components to conditionally show/hide content
 */
export async function isPageVisibleForEmployee(pageId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/page-permissions?search=${encodeURIComponent(pageId)}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`[PAGE-PERMISSIONS] Failed to check visibility for ${pageId}`);
      return false;
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      return false;
    }

    const permission = result.data.find((p: any) => p.pageId === pageId);
    return permission?.visibleForEmployee ?? false;

  } catch (error) {
    console.error(`[PAGE-PERMISSIONS] Error checking visibility for ${pageId}:`, error);
    return false;
  }
}

/**
 * Get current user role from authentication context
 * This is used to determine if permission checks should be applied
 */
export function getCurrentUserRole(): string | null {
  try {
    // In the demo system, we can check the demo user
    const demoUser = {
      id: 1,
      username: "Admin",
      role: "admin"
    };
    
    // In a real implementation, this would check the actual user context
    // For now, return admin role since the demo system auto-logs in as admin
    return demoUser.role;
  } catch (error) {
    console.error('[PAGE-PERMISSIONS] Error getting user role:', error);
    return null;
  }
}

/**
 * Check if the current user should see a page
 * This combines role and permission checks
 */
export async function shouldShowPage(pageId: string): Promise<boolean> {
  const userRole = getCurrentUserRole();
  
  // Admins can always see all pages
  if (userRole === 'admin') {
    return true;
  }
  
  // For non-admin users (employees), check permission
  if (userRole === 'user' || userRole === 'employee') {
    return await isPageVisibleForEmployee(pageId);
  }
  
  // Unknown role or no role - deny access
  return false;
}

/**
 * Navigation helper to filter menu items based on permissions
 */
export async function filterNavigationItems(
  navigationItems: Array<{ id: string; title: string; path: string; }>
): Promise<Array<{ id: string; title: string; path: string; }>> {
  const userRole = getCurrentUserRole();
  
  // Admins see everything
  if (userRole === 'admin') {
    return navigationItems;
  }
  
  // For other users, filter based on permissions
  const filteredItems = [];
  
  for (const item of navigationItems) {
    const shouldShow = await shouldShowPage(item.id);
    if (shouldShow) {
      filteredItems.push(item);
    }
  }
  
  return filteredItems;
}

/**
 * Auto-register common pages
 * This function can be called during app initialization to ensure
 * all standard pages are registered
 */
export async function autoRegisterCommonPages(): Promise<void> {
  const commonPages = [
    { pageId: 'dashboard', pageTitle: 'Dashboard', category: 'overview' },
    { pageId: 'warenumlagerung', pageTitle: 'Warenumlagerung', category: 'inventory', visibleForEmployee: true },
    { pageId: 'lagerbestand', pageTitle: 'Lagerbestand', category: 'inventory', visibleForEmployee: true },
    { pageId: 'automaten', pageTitle: 'Automaten', category: 'machines', visibleForEmployee: true },
    { pageId: 'produkte', pageTitle: 'Produkte', category: 'products', visibleForEmployee: true },
    { pageId: 'produzenten', pageTitle: 'Produzenten', category: 'suppliers', visibleForEmployee: true },
    { pageId: 'bestellungen', pageTitle: 'Bestellungen', category: 'orders', visibleForEmployee: true },
    { pageId: 'wareneingang', pageTitle: 'Wareneingang', category: 'orders', visibleForEmployee: true },
    { pageId: 'einstellungen', pageTitle: 'Einstellungen', category: 'settings' },
    { pageId: 'seitenfreigabe', pageTitle: 'Seitenfreigabe', category: 'settings' },
    { pageId: 'benutzerverwaltung', pageTitle: 'Benutzerverwaltung', category: 'settings' },
    { pageId: 'transaktionen', pageTitle: 'Transaktionen', category: 'analytics' },
    { pageId: 'prognosen', pageTitle: 'Prognosen', category: 'analytics' },
    { pageId: 'berichte', pageTitle: 'Berichte', category: 'analytics' },
  ];

  console.log('[PAGE-PERMISSIONS] Auto-registering common pages...');
  
  for (const page of commonPages) {
    await registerPage(page.pageId, page.pageTitle, {
      category: page.category,
      visibleForEmployee: page.visibleForEmployee
    });
  }
  
  console.log('[PAGE-PERMISSIONS] Auto-registration completed');
}
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Types
export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  currentStock?: number;
  sku?: string;
}

interface InventoryCartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateItem: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  itemCount: number;
  isInCart: (productId: string) => boolean;
}

// Create context
const InventoryCartContext = createContext<InventoryCartContextType | undefined>(undefined);

// Provider component
export const InventoryCartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // Add item to cart
  const addItem = (item: CartItem) => {
    setItems(prevItems => {
      // Check if item already exists
      const existingItemIndex = prevItems.findIndex(i => i.productId === item.productId);
      
      if (existingItemIndex >= 0) {
        // Update existing item
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: updatedItems[existingItemIndex].quantity + item.quantity
        };
        return updatedItems;
      } else {
        // Add new item
        return [...prevItems, item];
      }
    });
  };

  // Update item quantity
  const updateItem = (productId: string, quantity: number) => {
    setItems(prevItems => 
      prevItems.map(item => 
        item.productId === productId 
          ? { ...item, quantity } 
          : item
      )
    );
  };

  // Remove item from cart
  const removeItem = (productId: string) => {
    setItems(prevItems => prevItems.filter(item => item.productId !== productId));
  };

  // Clear cart
  const clearCart = () => {
    setItems([]);
  };

  // Check if item is in cart
  const isInCart = (productId: string) => {
    return items.some(item => item.productId === productId);
  };

  // Get total item count
  const itemCount = items.length;

  return (
    <InventoryCartContext.Provider 
      value={{ 
        items, 
        addItem, 
        updateItem, 
        removeItem, 
        clearCart, 
        itemCount,
        isInCart
      }}
    >
      {children}
    </InventoryCartContext.Provider>
  );
};

// Custom hook to use the cart context
export const useInventoryCart = () => {
  const context = useContext(InventoryCartContext);
  if (context === undefined) {
    throw new Error('useInventoryCart must be used within an InventoryCartProvider');
  }
  return context;
};
import React, { createContext, useContext, useState } from 'react';

export interface CartItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  maxQuantity?: number;
  warehouseId: number;
  selectedBatchIds?: number[];
  batchInfo?: {
    batchId: number;
    batchNumber: string;
    quantity: number;
    expiryDate?: string;
  }[];
  // Erweiterte Package-Informationen
  packageTypeId?: number;
  packageTypeName?: string;
  packageQuantity?: number;  // Anzahl Gebinde
  individualQuantity?: number;  // Anzahl Einzelstück
}

interface InventoryCartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clearCart: () => void;
  isInCart: (id: number) => boolean;
  cartTotal: number;
}

const InventoryCartContext = createContext<InventoryCartContextType | undefined>(undefined);

export function InventoryCartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Gesamtmenge aller Waren im Warenkorb berechnen
  const cartTotal = cartItems.reduce((total, item) => total + item.quantity, 0);

  // Produkt zum Warenkorb hinzufügen oder Menge aktualisieren, wenn es bereits vorhanden ist
  const addToCart = (item: CartItem) => {
    setCartItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(cartItem => cartItem.id === item.id);
      
      if (existingItemIndex > -1) {
        // Artikel bereits im Warenkorb, Menge aktualisieren
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        const newQuantity = existingItem.quantity + item.quantity;
        
        // Stellen Sie sicher, dass die Menge nicht die maximal verfügbare Menge überschreitet
        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: Math.min(newQuantity, item.maxQuantity ?? Number.MAX_SAFE_INTEGER)
        };
        
        return updatedItems;
      } else {
        // Neuen Artikel zum Warenkorb hinzufügen
        return [...prevItems, item];
      }
    });
  };

  // Prüfen, ob ein Produkt bereits im Warenkorb ist
  const isInCart = (id: number) => {
    return cartItems.some(item => item.id === id);
  };

  // Produkt aus dem Warenkorb entfernen
  const removeFromCart = (id: number) => {
    setCartItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  // Menge eines Produkts im Warenkorb aktualisieren
  const updateQuantity = (id: number, quantity: number) => {
    setCartItems(prevItems => 
      prevItems.map(item => 
        item.id === id 
          ? { ...item, quantity: Math.min(quantity, item.maxQuantity ?? Number.MAX_SAFE_INTEGER) } 
          : item
      )
    );
  };

  // Warenkorb leeren
  const clearCart = () => {
    setCartItems([]);
  };

  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    isInCart,
    cartTotal
  };

  return (
    <InventoryCartContext.Provider value={value}>
      {children}
    </InventoryCartContext.Provider>
  );
}

// Custom Hook für den einfachen Zugriff auf den Warenkorb-Kontext
export function useInventoryCart() {
  const context = useContext(InventoryCartContext);
  if (context === undefined) {
    throw new Error('useInventoryCart must be used within an InventoryCartProvider');
  }
  return context;
}
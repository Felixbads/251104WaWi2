import React from 'react';
import Header from './Header';
import { Toaster } from '@/components/ui/toaster';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-6">
        {children}
      </main>
      <footer className="border-t py-4 bg-muted/40">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Proviant O-mat
        </div>
      </footer>
      <Toaster />
    </div>
  );
};

export default Layout;
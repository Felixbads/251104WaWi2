import React from 'react';
import { Toaster } from '@/components/ui/toaster';
import AppShell from './AppShell';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
};

export default Layout;
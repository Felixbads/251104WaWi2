import React from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X, Home, Package, ShoppingBag, Truck, Settings, BarChart2, Users, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoImage from '@assets/Logo Quadrat.png';

const Header: React.FC = () => {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const menuItems = [
    { title: 'Dashboard', icon: <Home className="h-4 w-4 mr-2" />, path: '/' },
    { title: 'Lagerbestand', icon: <Package className="h-4 w-4 mr-2" />, path: '/lager' },
    { title: 'Produkte', icon: <ShoppingBag className="h-4 w-4 mr-2" />, path: '/produkte' },
    { title: 'Lieferanten', icon: <Truck className="h-4 w-4 mr-2" />, path: '/lieferanten' },
    { title: 'Automaten', icon: <Database className="h-4 w-4 mr-2" />, path: '/automaten' },
    { title: 'Bestellungen', icon: <ShoppingBag className="h-4 w-4 mr-2" />, path: '/bestellungen' },
    { title: 'Berichte', icon: <BarChart2 className="h-4 w-4 mr-2" />, path: '/berichte' },
    { title: 'Benutzer', icon: <Users className="h-4 w-4 mr-2" />, path: '/benutzer' },
    { title: 'Einstellungen', icon: <Settings className="h-4 w-4 mr-2" />, path: '/settings' }
  ];

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMobileMenu}
            className="md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
          
          <Link href="/" className="flex items-center gap-2">
            <img 
              src={logoImage} 
              alt="Proviant O-mat Logo" 
              className="h-8 w-8 rounded" 
            />
            <span className="hidden font-bold text-xl md:inline-block text-primary">
              Proviant O-mat
            </span>
          </Link>
        </div>
        
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {menuItems.map((item, index) => (
            <Link
              key={index}
              href={item.path}
              className="flex items-center transition-colors hover:text-primary"
            >
              {item.icon}
              {item.title}
            </Link>
          ))}
        </nav>
        
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="h-4 w-4 mr-1" /> Menü
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Navigation</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {menuItems.map((item, index) => (
                <DropdownMenuItem 
                  key={index}
                  onClick={() => setLocation(item.path)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    {item.icon}
                    {item.title}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-background w-full h-full">
          <div className="flex flex-col p-4">
            <div className="flex justify-between items-center mb-8">
              <Link href="/" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                <img 
                  src={logoImage} 
                  alt="Proviant O-mat Logo" 
                  className="h-8 w-8 rounded" 
                />
                <span className="font-bold text-xl text-primary">
                  Proviant O-mat
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMobileMenu}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex flex-col gap-4">
              {menuItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.path}
                  className="flex items-center p-2 transition-colors hover:bg-muted rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.icon}
                  <span className="text-base">{item.title}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
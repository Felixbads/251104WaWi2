import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { 
  Home, 
  Package, 
  Truck, 
  Users, 
  Settings, 
  BarChart3, 
  Database,
  Zap,
  Building,
  ShoppingCart,
  Calendar,
  Sync,
  Server,
  Shield
} from 'lucide-react';
import { useAuth } from '@/lib';

const navigationItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home, roles: ['user', 'admin'] },
  { href: '/transactions', label: 'Transaktionen', icon: BarChart3, roles: ['user', 'admin'] },
  { href: '/automaten', label: 'Automaten', icon: Zap, roles: ['user', 'admin'] },
  { href: '/standort-status', label: 'Standort-Status', icon: Building, roles: ['user', 'admin'] },
  { href: '/produkte', label: 'Produkte', icon: Package, roles: ['user', 'admin'] },
  { href: '/lieferanten', label: 'Lieferanten', icon: Truck, roles: ['user', 'admin'] },
  { href: '/bestellungen', label: 'Bestellungen', icon: ShoppingCart, roles: ['user', 'admin'] },
  { href: '/lager-neu', label: 'Lager', icon: Database, roles: ['user', 'admin'] },
  { href: '/calendar-overview', label: 'Kalender', icon: Calendar, roles: ['user', 'admin'] },
  { href: '/enhanced-forecast', label: 'Prognosen', icon: BarChart3, roles: ['user', 'admin'] },
  { href: '/sync', label: 'Synchronisation', icon: Sync, roles: ['user', 'admin'] },
  { href: '/benutzer', label: 'Benutzer', icon: Users, roles: ['admin'] },
  { href: '/seitenfreigabe', label: 'Seitenfreigabe', icon: Shield, roles: ['admin'] },
  { href: '/inter-app-verbindungen', label: 'App-Verbindungen', icon: Server, roles: ['admin'] },
  { href: '/settings', label: 'Einstellungen', icon: Settings, roles: ['user', 'admin'] },
];

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const visibleItems = navigationItems.filter(item => 
    item.roles.includes(user?.role || 'user')
  );

  return (
    <nav className="space-y-1">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || 
          (item.href !== '/dashboard' && location.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="mr-3 h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
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
  RefreshCw,
  Server,
  Shield
} from 'lucide-react';
import { useAuth } from '@/lib';

const navigationSections = [
  {
    title: 'ÜBERSICHT',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home, roles: ['user', 'admin'] },
      { href: '/automaten-new', label: 'Automaten', icon: Zap, roles: ['user', 'admin'] },
      { href: '/transactions', label: 'Transaktionen', icon: BarChart3, roles: ['user', 'admin'] },
      { href: '/standort-status', label: 'Standort-Status', icon: Building, roles: ['user', 'admin'] },
    ]
  },
  {
    title: 'VERWALTUNG',
    items: [
      { href: '/produkte', label: 'Produkte', icon: Package, roles: ['user', 'admin'] },
      { href: '/lieferanten', label: 'Lieferanten', icon: Truck, roles: ['user', 'admin'] },
      { href: '/bestellungen', label: 'Bestellungen', icon: ShoppingCart, roles: ['user', 'admin'] },
      { href: '/lager-neu', label: 'Lager', icon: Database, roles: ['user', 'admin'] },
    ]
  },
  {
    title: 'ANALYSE',
    items: [
      { href: '/enhanced-forecast', label: 'Prognosen', icon: BarChart3, roles: ['user', 'admin'] },
      { href: '/calendar-overview', label: 'Kalender', icon: Calendar, roles: ['user', 'admin'] },
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      { href: '/sync', label: 'Synchronisation', icon: RefreshCw, roles: ['user', 'admin'] },
      { href: '/benutzer', label: 'Benutzer', icon: Users, roles: ['admin'] },
      { href: '/seitenfreigabe', label: 'Seitenfreigabe', icon: Shield, roles: ['admin'] },
      { href: '/inter-app-verbindungen', label: 'App-Verbindungen', icon: Server, roles: ['admin'] },
      { href: '/settings', label: 'Einstellungen', icon: Settings, roles: ['user', 'admin'] },
    ]
  },
  {
    title: 'LEGACY',
    items: [
      { href: '/automaten', label: 'Automaten (Alt)', icon: Zap, roles: ['user', 'admin'] },
    ]
  }
];

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const getVisibleSections = () => {
    return navigationSections.map(section => ({
      ...section,
      items: section.items.filter(item => 
        item.roles.includes(user?.role || 'user')
      )
    })).filter(section => section.items.length > 0);
  };

  const visibleSections = getVisibleSections();

  return (
    <nav className="space-y-6">
      {visibleSections.map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.title}
          </h3>
          <div className="space-y-1">
            {section.items.map((item) => {
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
          </div>
        </div>
      ))}
    </nav>
  );
}
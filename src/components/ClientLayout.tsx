import React from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Home, Calendar as CalendarIcon, LogIn, LogOut, ShieldCheck, Star } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { PropertyToggle } from './PropertyToggle';
import { Footer } from './Footer';
import { getClientConfig } from '../config/clientConfig';

export const ClientLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { t } = useTranslation();
  const config = getClientConfig();

  const navItems = [
    { path: '/', labelKey: 'nav.home', icon: Home },
    { path: '/booking', labelKey: 'nav.bookings', icon: CalendarIcon },
    { path: '/testimonials', labelKey: 'nav.reviews', icon: Star },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-pearl-white flex flex-col">
      {/* Client Top Bar — single row that scales from a logo-only tile on
          phones to the full chalet wordmark from md upwards. The brand lockup
          is allowed to shrink/truncate so the property toggle never overflows. */}
      <header className="fixed top-0 w-full z-50 bg-pearl-white/90 backdrop-blur-xl shadow-[0px_10px_30px_rgba(1,31,54,0.04)] px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <Link
          to="/"
          aria-label={config.chaletName}
          className="flex items-center gap-2 min-w-0 shrink"
        >
          {config.logoPath && (
            <img
              src={config.logoPath}
              alt=""
              className="h-9 w-9 rounded-md object-contain bg-white/60 p-0.5 shrink-0"
              onError={(e) => { (e.currentTarget.style.display = 'none'); }}
            />
          )}
          <span className="hidden md:inline font-headline text-xl font-bold text-primary-navy tracking-widest uppercase truncate">
            {t('common.alMalak')}
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <PropertyToggle variant="light" />
          <LanguageToggle />
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-full hover:bg-primary-navy/5 text-primary-navy/40 transition-colors"
              title={t('nav.adminPortal')}
              aria-label={t('nav.adminPortal')}
            >
              <ShieldCheck size={20} />
            </button>
          )}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 rounded-xl hover:bg-primary-navy/5 text-primary-navy transition-colors text-xs font-bold uppercase tracking-wider"
              title={t('nav.logout')}
              aria-label={t('nav.logout')}
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 rounded-xl bg-primary-navy text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
              title={t('nav.login')}
              aria-label={t('nav.login')}
            >
              <LogIn size={18} />
              <span className="hidden sm:inline">{t('nav.login')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16 pb-32 flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>

      {/* Client Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-around items-center h-20 pb-safe px-12 bg-pearl-white border-t border-primary-navy/5 shadow-[0px_-10px_40px_rgba(1,31,54,0.06)] rounded-t-[20px]">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              "flex flex-col items-center justify-center transition-all duration-300",
              isActive(item.path)
                ? "text-secondary-gold font-bold scale-105"
                : "text-primary-navy/40"
            )}
          >
            <item.icon size={24} fill={isActive(item.path) ? "currentColor" : "none"} />
            <span className="text-[11px] font-medium tracking-wide mt-1">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

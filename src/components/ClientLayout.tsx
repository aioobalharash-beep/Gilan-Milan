import React from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Home, Calendar as CalendarIcon, LogIn, LogOut, ShieldCheck, Star } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { Footer } from './Footer';

export const ClientLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { t } = useTranslation();

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
      {/* Client Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-pearl-white/90 backdrop-blur-xl shadow-[0px_10px_30px_rgba(1,31,54,0.04)] px-6 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="font-headline text-xl font-bold text-primary-navy tracking-widest uppercase"
        >
          {t('common.alMalak')}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-full hover:bg-primary-navy/5 text-primary-navy/40 transition-colors"
              title={t('nav.adminPortal')}
            >
              <ShieldCheck size={20} />
            </button>
          )}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-primary-navy/5 text-primary-navy transition-colors text-xs font-bold uppercase tracking-wider"
              title={t('nav.logout')}
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-navy text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
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

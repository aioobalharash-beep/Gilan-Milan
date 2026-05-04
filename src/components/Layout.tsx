import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  Users,
  ReceiptText,
  BarChart3,
  Menu,
  Bell,
  LogOut,
  CheckCheck,
  CreditCard,
  CalendarPlus,
  Settings,
  X,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '../services/api';
import { LanguageToggle } from './LanguageToggle';
import { BrandMark } from './BrandMark';
import { Footer } from './Footer';

interface Notification {
  id: string;
  type: 'new_booking' | 'pending_payment';
  title: string;
  message: string;
  booking_id: string;
  read: boolean;
  created_at: string;
}

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isRTL } = useLanguage();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    notificationsApi.list()
      .then((data: any) => setNotifications(data))
      .catch(console.error);
  }, []);

  // Refresh notifications every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      notificationsApi.list()
        .then((data: any) => setNotifications(data))
        .catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.read) {
      await notificationsApi.markRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }
    setShowNotifications(false);
    navigate('/admin/calendar');
  };

  const navItems = [
    { path: '/admin', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { path: '/admin/calendar', labelKey: 'nav.calendar', icon: CalendarIcon },
    { path: '/admin/guests', labelKey: 'nav.guests', icon: Users },
    { path: '/admin/invoices', labelKey: 'nav.invoices', icon: ReceiptText },
    { path: '/admin/reports', labelKey: 'nav.reports', icon: BarChart3 },
  ];

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const currentLabel = navItems.find(item => isActive(item.path))?.labelKey || 'nav.dashboard';

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Drawer animation direction (slides from start side)
  const drawerX = isRTL ? 280 : -280;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-primary-navy text-white h-screen sticky top-0 py-8 px-6">
        <Link to="/" className="block mb-10 group">
          <BrandMark variant="dark" size="md" className="group-hover:text-secondary-gold transition-colors" />
          <p className="text-[10px] font-lato uppercase tracking-widest text-white/50 font-bold mt-1">{t('nav.managementPortal')}</p>
        </Link>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-lato uppercase text-xs font-bold tracking-wider",
                isActive(item.path)
                  ? "bg-white/10 text-secondary-gold border-e-4 border-secondary-gold ltr:translate-x-1 rtl:-translate-x-1"
                  : "text-white/60 hover:bg-white/5 hover:text-secondary-gold"
              )}
            >
              <item.icon size={18} fill={isActive(item.path) ? "currentColor" : "none"} />
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4 pt-6 border-t border-white/10">
          <LanguageToggle variant="dark" />
          <button
            onClick={() => navigate('/admin/edit-property')}
            className="flex items-center gap-3 text-white/60 text-xs font-bold uppercase tracking-wider hover:text-secondary-gold transition-colors"
          >
            <Settings size={16} />
            <span className="text-sm">{t('nav.editProperty')}</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 text-white/60 text-xs font-bold uppercase tracking-wider hover:text-secondary-gold transition-colors"
          >
            <span className="text-sm">{t('nav.viewClientPortal')}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 text-white/60 text-xs font-bold uppercase tracking-wider hover:text-secondary-gold transition-colors"
          >
            <LogOut size={16} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: drawerX }}
              animate={{ x: 0 }}
              exit={{ x: drawerX }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="md:hidden fixed start-0 top-0 bottom-0 w-[280px] bg-primary-navy text-white z-50 flex flex-col py-8 px-6 shadow-2xl"
            >
              {/* Header + Close */}
              <div className="flex items-center justify-between mb-10">
                <div>
                  <BrandMark variant="dark" size="sm" />
                  <p className="text-[9px] font-lato uppercase tracking-widest text-white/50 font-bold mt-1">{t('nav.managementPortal')}</p>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              {/* Nav Items */}
              <nav className="flex-1 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-lato uppercase text-xs font-bold tracking-wider",
                      isActive(item.path)
                        ? "bg-white/10 text-secondary-gold"
                        : "text-white/60 hover:bg-white/5 hover:text-secondary-gold"
                    )}
                  >
                    <item.icon size={18} fill={isActive(item.path) ? "currentColor" : "none"} />
                    {t(item.labelKey)}
                  </button>
                ))}
              </nav>

              {/* Bottom Actions */}
              <div className="mt-auto space-y-3 pt-6 border-t border-white/10">
                <LanguageToggle variant="dark" />
                <button
                  onClick={() => navigate('/admin/edit-property')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 text-xs font-bold uppercase tracking-wider hover:bg-white/5 hover:text-secondary-gold transition-all"
                >
                  <Settings size={16} />
                  {t('nav.editProperty')}
                </button>
                <button
                  onClick={() => { setMobileOpen(false); navigate('/'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 text-xs font-bold uppercase tracking-wider hover:bg-white/5 hover:text-secondary-gold transition-all"
                >
                  <ExternalLink size={16} />
                  {t('nav.viewClientPortal')}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 text-xs font-bold uppercase tracking-wider hover:bg-white/5 hover:text-red-400 transition-all"
                >
                  <LogOut size={16} />
                  {t('nav.logout')}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 bg-pearl-white/80 backdrop-blur-xl border-b border-primary-navy/5 h-16 flex items-center justify-between px-6 md:px-8">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 rounded-full hover:bg-primary-navy/5">
              <Menu size={20} />
            </button>
            <Link to="/" className="md:hidden hover:text-secondary-gold transition-colors">
              <BrandMark variant="light" size="sm" />
            </Link>
            <h2 className="hidden md:block text-xl font-bold font-headline capitalize">{t(currentLabel)}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-full hover:bg-primary-navy/5 transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 end-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute end-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-primary-navy/10 overflow-hidden z-50">
                  <div className="flex items-center justify-between p-4 border-b border-primary-navy/5">
                    <h4 className="font-bold text-sm text-primary-navy">{t('common.notifications')}</h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-1 text-[10px] font-bold text-secondary-gold uppercase tracking-wider hover:underline"
                      >
                        <CheckCheck size={12} />
                        {t('common.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-primary-navy/40">{t('common.noNotifications')}</div>
                    ) : (
                      notifications.slice(0, 15).map(notif => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className={cn(
                            "w-full text-start px-4 py-3 border-b border-primary-navy/5 hover:bg-primary-navy/3 transition-colors flex gap-3",
                            !notif.read && "bg-blue-50/50"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                            notif.type === 'pending_payment' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                          )}>
                            {notif.type === 'pending_payment' ? <CreditCard size={14} /> : <CalendarPlus size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs text-start", !notif.read ? "font-bold text-primary-navy" : "font-medium text-primary-navy/70")}>{notif.title}</p>
                            <p className="text-[11px] text-primary-navy/50 truncate text-start">{notif.message}</p>
                            <p className="text-[10px] text-primary-navy/30 mt-0.5 text-start">
                              {new Date(notif.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!notif.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-3 ps-4 border-s border-primary-navy/10">
              <div className="text-end">
                <p className="text-xs font-bold">{user?.name || 'Admin'}</p>
                <p className="text-[10px] text-primary-navy/50 uppercase font-bold">{t('common.curator')}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary-navy/10 flex items-center justify-center">
                <Users size={16} />
              </div>
            </div>
          </div>
        </header>

        {/* View Content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8 flex flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </main>

        {/* Bottom Nav for Mobile */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 flex justify-around items-center h-20 pb-safe bg-pearl-white/90 backdrop-blur-xl border-t border-secondary-gold/10 shadow-[0_-4px_30px_rgba(1,31,54,0.05)] rounded-t-[20px]">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center transition-all duration-300",
                isActive(item.path)
                  ? "text-secondary-gold scale-105"
                  : "text-primary-navy/40"
              )}
            >
              <item.icon size={20} fill={isActive(item.path) ? "currentColor" : "none"} />
              <span className="text-[10px] uppercase font-bold tracking-wider mt-1">{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

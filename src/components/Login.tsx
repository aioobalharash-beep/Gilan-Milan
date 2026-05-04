import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, LogIn, AlertCircle, ArrowLeft, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sendPasswordResetEmail } from '../services/firebase';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { getClientConfig, isAdminEmail } from '../config/clientConfig';
import { BrandMark } from './BrandMark';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const config = getClientConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(email.trim());
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const signedIn = await login(email, password);
      // Admin role must match an email on the allowlist; anything else is signed out.
      if (signedIn.role === 'admin' && !isAdminEmail(signedIn.email)) {
        await logout();
        setError('This account is not authorized as an administrator.');
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-primary-navy flex items-center justify-center p-6">
      <div className="fixed top-4 end-4 z-50">
        <LanguageToggle variant="dark" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-10">
          <BrandMark variant="dark" size="lg" className="h-24 sm:h-28 mx-auto" />
          <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] font-bold mt-4 text-center">
            {t('common.luxuryDesertSanctuary')}
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium mb-6"
        >
          <ArrowLeft size={18} />
          {t('login.backToHome')}
        </button>

        <div className="bg-white rounded-[28px] p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="font-headline text-2xl font-bold text-primary-navy">
              {t('login.signIn')}
            </h2>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-xs font-medium"
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('login.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-pearl-white border-none rounded-xl py-3.5 px-5 focus:ring-1 focus:ring-secondary-gold/50 placeholder:text-primary-navy/20 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('login.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full bg-pearl-white border-none rounded-xl py-3.5 px-5 pe-12 focus:ring-1 focus:ring-secondary-gold/50 placeholder:text-primary-navy/20 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-4 top-1/2 -translate-y-1/2 text-primary-navy/30 hover:text-primary-navy/60"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              {resetSent ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600"
                >
                  <Mail size={12} />
                  {t('login.resetSent')}
                </motion.p>
              ) : (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-[11px] font-bold text-secondary-gold hover:underline disabled:opacity-50"
                >
                  {resetLoading ? t('common.loading') : t('login.forgotPassword')}
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-navy text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-primary-navy/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  {t('login.signIn')}
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-white/20 text-[10px] text-center mt-8 uppercase tracking-widest font-bold">
          {config.chaletName}
        </p>
      </motion.div>
    </div>
  );
};

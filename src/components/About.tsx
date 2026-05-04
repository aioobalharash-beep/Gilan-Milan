import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MapPin, Phone, Mail } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useProperty } from '../contexts/PropertyContext';
import { propertyDetailsDocId } from '../services/firestore';
import { bl } from '../utils/bilingual';
import { getClientConfig } from '../config/clientConfig';

const DEFAULT_ABOUT_EN = `Gilan & Milan Chalet is a luxury retreat nestled in the heart of Oman's breathtaking landscape. We blend modern comfort with traditional Omani heritage to create an unforgettable stay.

Each chalet features spacious living areas, a fully equipped culinary studio, private outdoor spaces, and panoramic views. Every detail has been curated to ensure our guests enjoy the highest standard of hospitality.

Whether you seek a peaceful escape, a family gathering, or a celebration with friends, Gilan & Milan Chalet provides the perfect setting with concierge service, daily maintenance, private parking, and secure perimeter access.`;

const DEFAULT_ABOUT_AR = `شاليه جيلان وميلان هو ملاذ فاخر يقع في قلب المشهد الطبيعي الخلّاب في سلطنة عُمان. نمزج بين الراحة العصرية والتراث العماني الأصيل لنقدّم لضيوفنا تجربة إقامة لا تُنسى.

تتميّز الشاليهات بمساحات معيشة واسعة، ومطبخ مجهّز بالكامل، وأماكن خاصة في الهواء الطلق، وإطلالات بانورامية. روعي كل تفصيل ليحظى ضيوفنا بأعلى مستويات الضيافة.

سواء كنت تبحث عن ملاذ هادئ، أو لمّة عائلية، أو احتفال مع الأصدقاء، يوفّر شاليه جيلان وميلان المكان الأمثل مع خدمة الكونسيرج، والصيانة اليومية، ومواقف خاصة، ومحيط آمن.`;

export const About: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isAr = lang === 'ar';

  const [aboutEn, setAboutEn] = useState('');
  const [aboutAr, setAboutAr] = useState('');
  const { activePropertyId, activeProperty } = useProperty();
  const config = getClientConfig();
  // Resolve display name from the active toggle so the About page tracks the
  // currently-selected chalet. Falls back to the configured client name when
  // no property is loaded yet (or rules block the read).
  const propertyDisplayName = activeProperty
    ? bl(activeProperty.name as any, isAr ? 'ar' : 'en') || config.chaletName
    : config.chaletName;
  const propertyDisplayNameAr = activeProperty
    ? bl(activeProperty.name as any, 'ar') || (isAr ? config.chaletName : 'شاليه جيلان وميلان')
    : 'شاليه جيلان وميلان';
  const propertyDisplayNameEn = activeProperty
    ? bl(activeProperty.name as any, 'en') || config.chaletName
    : config.chaletName;

  useEffect(() => {
    if (!activePropertyId) return;
    const apply = (data: any) => {
      setAboutEn(typeof data.aboutEn === 'string' ? data.aboutEn : '');
      setAboutAr(typeof data.aboutAr === 'string' ? data.aboutAr : '');
    };
    getDoc(doc(db, 'settings', propertyDetailsDocId(activePropertyId)))
      .then(async snap => {
        if (snap.exists()) { apply(snap.data()); return; }
        const legacy = await getDoc(doc(db, 'settings', 'property_details'));
        if (legacy.exists()) apply(legacy.data());
      })
      .catch(console.error);
  }, [activePropertyId]);

  const arText = aboutAr.trim() || DEFAULT_ABOUT_AR;
  const enText = aboutEn.trim() || DEFAULT_ABOUT_EN;
  const text = isAr ? arText : enText;
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  return (
    <div className="p-6 space-y-8 max-w-lg mx-auto pb-24">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-primary-navy/60 hover:text-primary-navy transition-colors text-sm font-medium"
      >
        <ArrowLeft size={18} />
        {t('login.backToHome')}
      </button>

      <section className="text-center space-y-2">
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">
          {isAr ? 'قصتنا' : 'Our Story'}
        </span>
        <h2 className="font-headline text-3xl font-bold text-primary-navy">
          {isAr ? `عن ${propertyDisplayNameAr}` : `About ${propertyDisplayNameEn}`}
        </h2>
      </section>

      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-6 text-sm text-primary-navy/70 leading-relaxed whitespace-pre-line"
      >
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-4">
        <h3 className="font-bold text-primary-navy text-sm uppercase tracking-wider">
          {isAr ? 'تواصل معنا' : 'Contact'}
        </h3>
        <div className="space-y-3 text-sm text-primary-navy/70">
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-secondary-gold flex-shrink-0" />
            <span>{isAr ? `${propertyDisplayNameAr}، سلطنة عُمان` : `${propertyDisplayNameEn}, Oman`}</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-secondary-gold flex-shrink-0" />
            <span dir="ltr">+{config.social.whatsapp.replace(/^\+?/, '').replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-secondary-gold flex-shrink-0" />
            <span dir="ltr">{config.admin.email}</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-center text-primary-navy/30 font-bold uppercase tracking-widest">
        {isAr ? `${propertyDisplayNameAr} — سلطنة عُمان` : `${propertyDisplayNameEn} — Oman`}
      </p>
    </div>
  );
};

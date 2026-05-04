import React, { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { getClientConfig } from '../config/clientConfig';

type BrandSize = 'sm' | 'md' | 'lg';
type BrandVariant = 'light' | 'dark';

const SIZE_MAP: Record<BrandSize, { text: string; logo: string }> = {
  sm: { text: 'text-lg', logo: 'h-7' },
  md: { text: 'text-2xl', logo: 'h-9' },
  lg: { text: 'text-4xl', logo: 'h-14' },
};

interface BrandMarkProps {
  variant?: BrandVariant;
  size?: BrandSize;
  className?: string;
}

export const BrandMark = React.memo<BrandMarkProps>(({ variant = 'dark', size = 'md', className }) => {
  const { chaletName, logoPath } = getClientConfig();
  const [logoFailed, setLogoFailed] = useState(false);
  const sizes = SIZE_MAP[size];
  const color = variant === 'dark' ? 'text-white' : 'text-primary-navy';
  const showLogo = !!logoPath && !logoFailed;

  if (showLogo) {
    return (
      <img
        src={logoPath as string}
        alt={chaletName}
        onError={() => setLogoFailed(true)}
        className={cn(sizes.logo, 'w-auto object-contain', className)}
      />
    );
  }

  return (
    <h1
      aria-label={chaletName}
      className={cn('font-headline font-bold tracking-tight', sizes.text, color, className)}
    >
      {chaletName}
    </h1>
  );
});
BrandMark.displayName = 'BrandMark';

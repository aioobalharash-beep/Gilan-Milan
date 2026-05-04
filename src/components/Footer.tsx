import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full py-4 px-6 text-center">
      <p className="text-xs text-primary-navy/50 font-lato tracking-wide">
        Powered by{' '}
        <a
          href="https://www.mahara.tech"
          target="_blank"
          rel="noopener noreferrer"
          className="text-secondary-gold/80 hover:text-secondary-gold transition-colors"
        >
          Mahara Tech
        </a>
      </p>
    </footer>
  );
};

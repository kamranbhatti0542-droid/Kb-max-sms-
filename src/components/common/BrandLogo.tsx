import React from 'react';
import { Radio, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', showTagline = true }) => {
  const { settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;
  const siteName = settings?.siteName || 'KB MAX';
  const tagline = settings?.tagline || 'Live SMS Relay & Gateway';

  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  };

  const textSizes = {
    sm: 'text-base font-bold',
    md: 'text-xl font-black tracking-tight',
    lg: 'text-2xl font-black tracking-tight',
    xl: 'text-3xl font-black tracking-tight',
  };

  return (
    <div className="flex items-center gap-3 select-none">
      {settings?.logoType === 'custom_url' && settings.customLogoUrl ? (
        <img
          src={settings.customLogoUrl}
          alt={siteName}
          className={`${iconSizes[size]} object-contain rounded-lg border border-slate-800`}
        />
      ) : (
        <div className="relative flex items-center justify-center">
          <div
            className={`${iconSizes[size]} rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border ${theme.accentBorder} flex items-center justify-center shadow-lg relative overflow-hidden group`}
          >
            <div className="absolute inset-0 bg-emerald-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
            <Radio className={`${size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : size === 'xl' ? 'w-7 h-7' : 'w-4.5 h-4.5'} ${theme.primaryText} relative z-10 animate-pulse`} />
          </div>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      )}

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`${textSizes[size]} text-white tracking-wider font-mono uppercase`}>
            {siteName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            LIVE
          </span>
        </div>
        {showTagline && (
          <span className="text-xs text-slate-400 font-medium tracking-wide">
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};

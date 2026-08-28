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
  const [imgError, setImgError] = React.useState(false);

  // Reset img error if logo url changes
  React.useEffect(() => {
    setImgError(false);
  }, [settings?.customLogoUrl]);

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-base font-black tracking-wider',
    md: 'text-xl font-black tracking-wider',
    lg: 'text-2xl font-black tracking-wider',
    xl: 'text-3xl font-black tracking-widest',
  };

  const hasCustomLogo = settings?.logoType === 'custom_url' && settings.customLogoUrl && !imgError;

  return (
    <div className="flex items-center gap-3 select-none">
      {hasCustomLogo ? (
        <div className="relative shrink-0 flex items-center justify-center">
          <img
            src={settings.customLogoUrl}
            alt={siteName}
            onError={() => setImgError(true)}
            className={`${iconSizes[size]} max-h-16 max-w-[180px] w-auto object-contain rounded-xl border border-slate-700/80 bg-slate-950/90 p-1 shadow-lg`}
          />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      ) : (
        <div className="relative shrink-0 flex items-center justify-center">
          <div
            className={`${iconSizes[size]} rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border ${theme.accentBorder} flex items-center justify-center shadow-lg relative overflow-hidden group`}
          >
            <div className="absolute inset-0 bg-emerald-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
            <Radio className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : size === 'xl' ? 'w-8 h-8' : 'w-5 h-5'} ${theme.primaryText} relative z-10 animate-pulse`} />
          </div>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      )}

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className={`${textSizes[size]} uppercase font-black font-sans bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent drop-shadow-sm truncate`}>
            {siteName}
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
            LIVE
          </span>
        </div>
        {showTagline && (
          <span className="text-[11px] text-slate-400 font-semibold tracking-wide truncate">
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};

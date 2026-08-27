import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  User, 
  Lock, 
  Palette, 
  Image as ImageIcon, 
  Server, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Clock, 
  Terminal, 
  Globe, 
  RefreshCw,
  Sparkles,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';
import type { ThemePreset, SiteSettings } from '../../types';

export const SettingsView: React.FC = () => {
  const { session, settings, updateSettings, logout } = useAuth();
  const currentTheme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [activeTab, setActiveTab] = useState<'security' | 'branding' | 'theme' | 'vps'>('security');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Admin credentials form
  const [adminUsername, setAdminUsername] = useState(settings?.adminUsername || 'Kamran_Bhatti');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Branding Form
  const [siteName, setSiteName] = useState(settings?.siteName || 'KB MAX');
  const [tagline, setTagline] = useState(settings?.tagline || 'Live SMS Relay & Gateway Portal');
  const [logoType, setLogoType] = useState<'icon' | 'custom_url'>(settings?.logoType || 'icon');
  const [customLogoUrl, setCustomLogoUrl] = useState(settings?.customLogoUrl || '');

  // Theme Form
  const [selectedTheme, setSelectedTheme] = useState<ThemePreset>(settings?.theme || 'emerald');
  const [clientSessionMinutes, setClientSessionMinutes] = useState(settings?.clientSessionMinutes || 5);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    if (newPassword && newPassword !== confirmPassword) {
      setNotice({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          username: adminUsername,
          oldPassword: oldPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotice({ type: 'success', message: 'Admin login credentials updated successfully!' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setNotice({ type: 'error', message: data.error || 'Failed to update credentials' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Network error updating credentials' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBrandingAndTheme = async () => {
    setIsSaving(true);
    setNotice(null);

    const success = await updateSettings({
      siteName,
      tagline,
      logoType,
      customLogoUrl,
      theme: selectedTheme,
      clientSessionMinutes: Number(clientSessionMinutes) || 5,
    });

    setIsSaving(false);
    if (success) {
      setNotice({ type: 'success', message: 'Branding and theme customized successfully!' });
    } else {
      setNotice({ type: 'error', message: 'Failed to update settings' });
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const vpsSetupCommands = `# 1. Update VPS server
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20+ and PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm install -g pm2

# 3. Clone or upload KB MAX project to VPS
cd /var/www
# git clone <your-repo> kbmax
cd kbmax
npm install
npm run build

# 4. Start KB MAX on VPS using PM2 (Runs 24/7 on port 3000)
pm2 start dist/server.cjs --name "kbmax-live-sms"
pm2 startup
pm2 save

# 5. Configure Nginx Reverse Proxy (Optional for SSL / Custom Domain)
# Point your domain (e.g. sms.kbmax.com) to http://127.0.0.1:3000`;

  return (
    <div className="space-y-6" id="admin-settings-view">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs font-mono font-bold">
            SYSTEM PREFERENCES & BRANDING
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Settings
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
          Customize admin credentials, add custom logos, change theme colors, configure client session timers, and view VPS deployment instructions.
        </p>

        {/* Tab Selector */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'security'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Admin Credentials</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'branding'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Logo & Site Title</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('theme')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'theme'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Theme & Timers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vps')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'vps'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>VPS Deployment Guide</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-2xl text-xs flex items-center gap-2.5 font-medium ${
              notice.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{notice.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab 1: Security / Admin Credentials */}
      {activeTab === 'security' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Change Admin Username & Password</h3>
          </div>

          <form onSubmit={handleSaveCredentials} className="space-y-4 max-w-lg text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Admin Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Current Password (Leave blank if not changing password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                New Password (Optional)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>
            </div>

            {newPassword && (
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? 'Updating...' : 'Save Credentials'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Branding & Logo */}
      {activeTab === 'branding' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Website Title, Tagline & Logo Customization</h3>
          </div>

          <div className="space-y-4 max-w-lg text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Website Name</label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="KB MAX"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Live SMS Relay & Gateway Portal"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Logo Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLogoType('icon')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    logoType === 'icon'
                      ? 'bg-slate-800 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="block text-xs">Cyber Beacon Icon (Default)</span>
                  <span className="text-[10px] text-slate-400">High-tech animated radar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLogoType('custom_url')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    logoType === 'custom_url'
                      ? 'bg-slate-800 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="block text-xs">Custom Logo Image URL</span>
                  <span className="text-[10px] text-slate-400">Paste your logo image link</span>
                </button>
              </div>
            </div>

            {logoType === 'custom_url' && (
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Custom Logo Image URL</label>
                <input
                  type="url"
                  value={customLogoUrl}
                  onChange={(e) => setCustomLogoUrl(e.target.value)}
                  placeholder="https://example.com/your-logo.png"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveBrandingAndTheme}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              {isSaving ? 'Saving...' : 'Save Branding Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Theme Presets & Client Session Timer */}
      {activeTab === 'theme' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Palette className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Color Themes & Session Timer Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">
                Select Theme Palette
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(Object.keys(THEMES) as ThemePreset[]).map((tKey) => {
                  const t = THEMES[tKey];
                  const isSelected = selectedTheme === tKey;
                  return (
                    <button
                      key={tKey}
                      type="button"
                      onClick={() => setSelectedTheme(tKey)}
                      className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden ${
                        isSelected
                          ? 'bg-slate-800 border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">{t.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-4 h-4 rounded-full ${t.primaryBg.split(' ')[0]}`} />
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{tKey}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Client Session Duration Setting */}
            <div className="border-t border-slate-800 pt-4 max-w-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-emerald-400" />
                <label className="font-semibold text-slate-300 text-xs">
                  Client Auto-Logout Session Timer (Minutes)
                </label>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                Strictly enforced on the server. Clients will be forcefully logged out when this timer expires.
              </p>
              <input
                type="number"
                min={1}
                max={120}
                value={clientSessionMinutes}
                onChange={(e) => setClientSessionMinutes(Number(e.target.value))}
                className="w-32 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm font-bold"
              />
              <span className="ml-2 text-xs text-slate-400">Minutes (Default: 5 min)</span>
            </div>

            <button
              type="button"
              onClick={handleSaveBrandingAndTheme}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              {isSaving ? 'Saving...' : 'Apply Theme & Timers'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: VPS Setup Guide */}
      {activeTab === 'vps' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">VPS Installation & Continuous 24/7 Hosting</h3>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(vpsSetupCommands, 'vps-script')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all"
            >
              {copiedKey === 'vps-script' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'vps-script' ? 'Copied' : 'Copy Commands'}</span>
            </button>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <p>
              Run these commands in your Ubuntu/Debian VPS terminal to run KB MAX persistently on port 3000 using PM2:
            </p>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-emerald-400 text-[11px] overflow-x-auto select-all leading-relaxed">
              {vpsSetupCommands}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

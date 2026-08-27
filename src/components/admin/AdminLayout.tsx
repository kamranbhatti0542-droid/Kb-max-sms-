import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Server, 
  Users, 
  Radio, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X,
  Volume2,
  VolumeX,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../common/BrandLogo';
import { DashboardView } from './DashboardView';
import { ApiProvidersView } from './ApiProvidersView';
import { ClientsView } from './ClientsView';
import { LiveSMSView } from './LiveSMSView';
import { SettingsView } from './SettingsView';
import { THEMES } from '../../utils/theme';
import { soundManager } from '../../utils/sound';

export const AdminLayout: React.FC = () => {
  const { session, logout, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'providers' | 'clients' | 'sms' | 'settings'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.setMuted(!next);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'providers', label: 'API Provider', icon: Server },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'sms', label: 'Live SMS Relay', icon: Radio },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans selection:bg-emerald-500 selection:text-black">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <BrandLogo size="sm" showTagline={false} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={`fixed md:sticky top-0 z-50 md:z-20 h-screen w-64 bg-slate-900/95 md:bg-slate-900/80 backdrop-blur-xl border-r border-slate-800 flex flex-col justify-between p-4 transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        id="admin-sidebar"
      >
        <div className="space-y-6">
          {/* Logo */}
          <div className="px-2 pt-2 flex items-center justify-between">
            <BrandLogo size="md" />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5" id="admin-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`admin-nav-${item.id}`}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? `${theme.primaryBg} shadow-lg scale-[1.02]`
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                  <span className="tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User & Logout Section */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white block">{session?.username}</span>
                <span className="text-[10px] text-emerald-400 font-mono">Admin Role</span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleSound}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all hidden md:block"
              title={soundEnabled ? 'Mute audio' : 'Unmute audio'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Logout Button */}
          <button
            id="admin-logout-btn"
            type="button"
            onClick={() => logout('Admin logged out safely.')}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 hover:border-rose-500/40 text-xs font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardView onNavigate={(t) => setActiveTab(t as any)} />}
          {activeTab === 'providers' && <ApiProvidersView />}
          {activeTab === 'clients' && <ClientsView />}
          {activeTab === 'sms' && <LiveSMSView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

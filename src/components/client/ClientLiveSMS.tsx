import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, 
  Clock, 
  LogOut, 
  Search, 
  Copy, 
  Check, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Download, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Globe,
  SlidersHorizontal,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../common/BrandLogo';
import { soundManager } from '../../utils/sound';
import { THEMES } from '../../utils/theme';
import { resolveCountryName, formatDateTime } from '../../utils/countryLookup';
import type { SmsMessage, Partition } from '../../types';

export const ClientLiveSMS: React.FC = () => {
  const { session, logout, formattedTimeRemaining, timeRemaining, isExpiringSoon, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [selectedPart, setSelectedPart] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCli, setSelectedCli] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pagination State - 25 rows per page default
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const previousMessageCount = useRef<number>(0);

  const fetchPartitions = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/partitions', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const parts: Partition[] = data.partitions || [];
        setPartitions(parts);
        setSelectedPart((prev) => {
          if (!prev || prev === 'all' || !parts.some((p) => p.id === prev)) {
            return parts[0]?.id || '1';
          }
          return prev;
        });
      }
    } catch {
      // Ignore
    }
  }, [session]);

  const fetchLiveMessages = useCallback(async (manual = false) => {
    if (!session) return;
    if (manual) setIsRefreshing(true);

    try {
      const queryPart = selectedPart && selectedPart !== 'all' ? `&part=${encodeURIComponent(selectedPart)}` : '';
      const res = await fetch(`/api/sms?limit=500${queryPart}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        logout('Session terminated: Your client access has expired or was revoked by admin.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const newMsgs: SmsMessage[] = data.messages || [];

        if (previousMessageCount.current > 0 && newMsgs.length > previousMessageCount.current && soundEnabled) {
          soundManager.playNewSmsPing();
        }
        previousMessageCount.current = newMsgs.length;
        setMessages(newMsgs);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, [session, logout, soundEnabled, selectedPart]);

  useEffect(() => {
    fetchPartitions();
  }, [fetchPartitions]);

  useEffect(() => {
    if (!selectedPart) return;
    fetchLiveMessages();
    const interval = setInterval(() => {
      fetchLiveMessages();
      fetchPartitions();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchLiveMessages, fetchPartitions, selectedPart]);

  const handleCopyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(`content-${id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.setMuted(!next);
  };

  // Helper to match message against active selected partition
  const matchesPartition = (m: SmsMessage, partFilter: string): boolean => {
    if (!partFilter || partFilter === 'all') return true;
    const target = partFilter.toLowerCase();
    const mPartId = String(m.partId || '').toLowerCase();
    const mPart = String(m.part || '').toLowerCase();
    const mPartName = String(m.partName || '').toLowerCase();

    if (target === '1' || target === 'part_1') {
      return mPartId === 'part_1' || mPartId === '1' || mPart === '1' || mPartName.includes('part 1');
    }
    if (target === '2' || target === 'part_2') {
      return mPartId === 'part_2' || mPartId === '2' || mPart === '2' || mPartName.includes('part 2');
    }

    return mPartId === target || mPartName === target || mPart === target;
  };

  // Distinct countries & CLIs based on active partition filter
  const partFiltered = messages.filter((m) => matchesPartition(m, selectedPart));

  const availableCountries = Array.from(
    new Set(partFiltered.map((m) => resolveCountryName(m.country, m.phone)).filter(Boolean))
  );

  const availableClis = Array.from(
    new Set(partFiltered.map((m) => m.cli || m.service || m.sender).filter(Boolean))
  );

  // Filtered Messages
  const filteredMessages = partFiltered.filter((m) => {
    const country = resolveCountryName(m.country, m.phone);
    const cli = m.cli || m.service || m.sender;

    const matchesCountry = selectedCountry === 'all' || country.toLowerCase() === selectedCountry.toLowerCase();
    const matchesCli = selectedCli === 'all' || cli.toLowerCase() === selectedCli.toLowerCase();

    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesCountry && matchesCli;

    const matchesQuery =
      m.phone.toLowerCase().includes(q) ||
      country.toLowerCase().includes(q) ||
      cli.toLowerCase().includes(q) ||
      m.sender.toLowerCase().includes(q) ||
      m.service.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q);

    return matchesCountry && matchesCli && matchesQuery;
  });

  // Calculate 25-line pagination
  const totalEntries = filteredMessages.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalEntries);
  const paginatedMessages = filteredMessages.slice(startIndex, endIndex);

  // Active partition label
  const activePartitionObj = partitions.find((p) => p.id === selectedPart);
  const activePartitionLabel = activePartitionObj?.name || 'Selected Stream';

  // Export to CSV helper
  const handleExportCsv = () => {
    if (filteredMessages.length === 0) return;
    const headers = ['Date & Time', 'Country', 'Mobile Number', 'CLI', 'SMS Content'];
    const rows = filteredMessages.map((m) => [
      `"${formatDateTime(m.timestamp)}"`,
      `"${resolveCountryName(m.country, m.phone)}"`,
      `"${m.phone}"`,
      `"${m.cli || m.service || m.sender}"`,
      `"${m.message.replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const safeName = activePartitionLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.setAttribute('download', `live_sms_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar with Countdown Timer */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Client Feed</span>
              </span>
            </div>
          </div>

          {/* Session Timer & User Details */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Countdown Session Timer */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors ${
                isExpiringSoon
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
              title="Automatic session auto-logout countdown (5 minutes strict)"
            >
              <Clock className={`w-3.5 h-3.5 ${isExpiringSoon ? 'text-rose-400' : 'text-emerald-400'}`} />
              <span className="hidden xs:inline text-slate-400 font-sans font-normal">Session:</span>
              <span className="text-white font-mono">{formattedTimeRemaining}</span>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleSound}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
              title={soundEnabled ? 'Mute incoming audio notifications' : 'Enable audio notifications'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Logged in Client Pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-semibold">{session?.username}</span>
            </div>

            {/* Logout Button */}
            <button
              id="btn-client-logout"
              type="button"
              onClick={() => logout('Logged out successfully')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Warning bar when <= 60 seconds left */}
        <AnimatePresence>
          {isExpiringSoon && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-rose-600 text-white text-xs px-4 py-1 text-center font-medium flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-3.5 h-3.5 animate-bounce" />
              <span>Security notice: Your session is ending in {timeRemaining} seconds!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Stream Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-4" id="client-live-sms-container">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                <Radio className={`w-6 h-6 ${theme.text} animate-pulse`} />
                <span>Live SMS Stream</span>
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>LIVE SYNC</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Active Stream: <strong className="text-emerald-400 font-bold">{activePartitionLabel}</strong> (Only APIs assigned to this partition stream are displayed).
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sound Toggle */}
            <button
              id="btn-client-toggle-sound"
              type="button"
              onClick={toggleSound}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title={soundEnabled ? 'Mute sound alerts' : 'Enable sound alerts'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
            </button>

            {/* Refresh Button */}
            <button
              id="btn-client-refresh-sms"
              type="button"
              onClick={() => fetchLiveMessages(true)}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh feed"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Export CSV */}
            <button
              id="btn-client-export-csv"
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export filtered records to CSV"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stream / Partition Switcher Bar - Strictly Individual Named Partitions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 pl-2 pr-1">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Select Stream:</span>
            </span>

            {/* DYNAMIC PARTITIONS BUTTONS */}
            {partitions.map((part) => {
              const count = messages.filter((m) => matchesPartition(m, part.id)).length;
              const isSelected = selectedPart === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => {
                    setSelectedPart(part.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20 border border-indigo-500/50'
                      : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{part.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-indigo-950 text-indigo-200' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active: <strong className="text-white">{activePartitionLabel}</strong></span>
          </div>
        </div>

        {/* Filter Toolbar (Search + Country + CLI Dropdowns + Rows per page) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-client-search-sms"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={`Search in ${activePartitionLabel} by Mobile, Country, CLI, or SMS text...`}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 font-sans"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Country Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <select
                value={selectedCountry}
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-slate-300 font-semibold text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Countries ({availableCountries.length})</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* CLI Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              <select
                value={selectedCli}
                onChange={(e) => {
                  setSelectedCli(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-slate-300 font-semibold text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All CLIs ({availableClis.length})</option>
                {availableClis.map((cli) => (
                  <option key={cli} value={cli} className="bg-slate-900 text-white">
                    {cli}
                  </option>
                ))}
              </select>
            </div>

            {/* Rows Per Page Selector */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
              <span className="text-slate-500">Rows:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent text-emerald-400 font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value={10} className="bg-slate-900 text-white">10 per page</option>
                <option value={25} className="bg-slate-900 text-white">25 per page</option>
                <option value={50} className="bg-slate-900 text-white">50 per page</option>
                <option value={100} className="bg-slate-900 text-white">100 per page</option>
              </select>
            </div>

            <div className="text-xs text-slate-400 font-mono px-2.5 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
              {totalEntries} total
            </div>
          </div>
        </div>

        {/* Main Table: Clean format without hardcoded Part 1/2 columns or badges */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" id="client-recent-sms-status-table">
              <thead>
                <tr className="bg-slate-950/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 text-[11px]">
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">DATE & TIME</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">COUNTRY</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">MOBILE NUMBER</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">CLI</th>
                  <th className="py-3.5 px-4 font-semibold">SMS CONTENT</th>
                  <th className="py-3.5 px-4 text-right font-semibold whitespace-nowrap">COPY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {paginatedMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                      <Radio className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                      <p className="text-sm font-semibold text-slate-300">
                        No live SMS entries found in {activePartitionLabel}
                      </p>
                      <p className="text-xs text-slate-500">
                        Incoming messages assigned to this stream will automatically populate this table in real-time.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedMessages.map((msg) => {
                    const countryName = resolveCountryName(msg.country, msg.phone);
                    const cliName = msg.cli || msg.service || msg.sender;
                    const dateStr = formatDateTime(msg.timestamp);

                    return (
                      <tr
                        key={msg.id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        {/* DATE & TIME (e.g. 2026-08-27 06:10:44) */}
                        <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                          {dateStr}
                        </td>

                        {/* COUNTRY Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                            {countryName}
                          </span>
                        </td>

                        {/* MOBILE NUMBER (e.g. 224610351009) */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-white text-xs tracking-tight">
                          {msg.phone || (msg as any).num || (msg as any).number || 'N/A'}
                        </td>

                        {/* CLI Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-sky-950/60 text-sky-300 border border-sky-500/30 font-mono">
                            {cliName}
                          </span>
                        </td>

                        {/* SMS CONTENT */}
                        <td className="py-3.5 px-4 text-slate-300 leading-relaxed max-w-xl break-words">
                          <span className="text-xs text-slate-200 font-sans select-text">
                            {msg.message}
                          </span>
                        </td>

                        {/* Clean 1-click copy action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCopyContent(msg.message, msg.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center gap-1 transition-all cursor-pointer"
                            title="Copy SMS Content"
                          >
                            {copiedId === `content-${msg.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300 font-semibold text-[11px]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Copy</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 25-line Pagination Navigation Footer */}
          <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2 font-sans">
              <span>
                Showing <strong className="text-white font-mono">{totalEntries > 0 ? startIndex + 1 : 0}</strong> to{' '}
                <strong className="text-white font-mono">{endIndex}</strong> of{' '}
                <strong className="text-white font-mono">{totalEntries}</strong> entries
                <span className="ml-2 text-indigo-400 font-sans">
                  (Stream: {activePartitionLabel})
                </span>
              </span>
            </div>

            {/* Page Navigator */}
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First Page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              {/* Prev Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg font-mono text-white font-bold">
                Page {currentPage} of {totalPages}
              </span>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Last Page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

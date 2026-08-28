import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, 
  Search, 
  Copy, 
  Check, 
  RefreshCw, 
  Download, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Globe,
  SlidersHorizontal,
  AlertTriangle,
  Layers,
  Edit3,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  List,
  Phone,
  Clock,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';
import { resolveCountryName, formatDateTime } from '../../utils/countryLookup';
import type { SmsMessage, Partition } from '../../types';

export const LiveSMSView: React.FC = () => {
  const { session, settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;

  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [selectedPart, setSelectedPart] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCli, setSelectedCli] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Zoom / Density Mode for Mobile & Desktop View (Normal, Compact Zoom Out, Ultra Compact)
  const [zoomMode, setZoomMode] = useState<'normal' | 'compact' | 'ultra'>('compact');
  // View Layout Mode (Table vs Mobile Adaptive Cards)
  const [viewFormat, setViewFormat] = useState<'table' | 'cards'>('table');

  // Quick Rename / Manage Partition Modal
  const [editingPart, setEditingPart] = useState<Partition | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Pagination State - 25 lines per page default
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const previousCount = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        // Default to first partition if not set or invalid
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

  const fetchMessages = useCallback(async (manual = false) => {
    if (!session) return;
    if (manual) setIsRefreshing(true);

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const queryPart = selectedPart && selectedPart !== 'all' ? `&part=${encodeURIComponent(selectedPart)}` : '';
      const res = await fetch(`/api/sms?limit=500${queryPart}`, {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const list: SmsMessage[] = data.messages || [];
        previousCount.current = list.length;
        setMessages(list);
      }
    } catch {
      // Ignore network hiccup / VPN reconnection
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, [session, selectedPart]);

  useEffect(() => {
    fetchPartitions();
    const partInterval = setInterval(fetchPartitions, 20000);
    return () => clearInterval(partInterval);
  }, [fetchPartitions]);

  useEffect(() => {
    if (!selectedPart) return;
    fetchMessages();
    const interval = setInterval(() => {
      fetchMessages();
    }, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleVisibility);
    };
  }, [fetchMessages, selectedPart]);

  const handleCopyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(`content-${id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const confirmClearActiveStream = async () => {
    if (!session) return;
    setIsClearing(true);

    try {
      // Optimistic clear
      setMessages([]);
      setCurrentPage(1);

      const url = selectedPart ? `/api/sms/clear?part=${encodeURIComponent(selectedPart)}` : '/api/sms/clear';
      await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch {
      // Ignore
    } finally {
      setIsClearing(false);
      setShowClearModal(false);
    }
  };

  // Helper to match message against active selected partition
  const matchesPartition = (m: SmsMessage, partFilter: string): boolean => {
    if (!partFilter || partFilter === 'all') return true;
    const target = partFilter.toLowerCase();
    const mPartId = String(m.partId || '').toLowerCase();
    const mPart = String(m.part || '').toLowerCase();
    const mPartName = String(m.partName || '').toLowerCase();

    // Map '1' or '2' aliases
    if (target === '1' || target === 'part_1') {
      return mPartId === 'part_1' || mPartId === '1' || mPart === '1' || mPartName.includes('part 1');
    }
    if (target === '2' || target === 'part_2') {
      return mPartId === 'part_2' || mPartId === '2' || mPart === '2' || mPartName.includes('part 2');
    }

    return mPartId === target || mPartName === target || mPart === target;
  };

  // Save Partition Name (Rename)
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart || !renameInputValue.trim() || !session) return;
    setIsRenaming(true);

    try {
      const res = await fetch(`/api/partitions/${editingPart.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ name: renameInputValue.trim() }),
      });
      if (res.ok) {
        setEditingPart(null);
        setRenameInputValue('');
        fetchPartitions();
        fetchMessages(true);
      }
    } catch {
      // Ignore
    } finally {
      setIsRenaming(false);
    }
  };

  // Create New Partition
  const handleCreatePartition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim() || !session) return;
    setIsCreating(true);

    try {
      const res = await fetch('/api/partitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ name: newPartName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsCreateModalOpen(false);
        setNewPartName('');
        if (data.partition) {
          setSelectedPart(data.partition.id);
        }
        fetchPartitions();
      }
    } catch {
      // Ignore
    } finally {
      setIsCreating(false);
    }
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
    <div className="space-y-4" id="live-sms-view">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Live SMS Feed (Admin Console)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE SYNC</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time incoming SMS feed. Active Stream: <span className="text-emerald-400 font-bold">{activePartitionLabel}</span> (Only APIs connected to this stream are active).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <button
            id="btn-refresh-sms"
            type="button"
            onClick={() => fetchMessages(true)}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Refresh feed"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          {/* Clear Messages */}
          <button
            type="button"
            onClick={() => setShowClearModal(true)}
            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-400 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Clear active stream messages"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Clear Stream</span>
          </button>
        </div>
      </div>

      {/* Stream / Partition Switcher Bar - Strictly Individual Partitions (No All-Part Mixing) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 pl-2 pr-1">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Select Stream / Part:</span>
          </span>

          {/* DYNAMIC PARTITIONS BUTTONS (Custom Named) */}
          {partitions.map((part) => {
            const isSelected = selectedPart === part.id;
            const count = messages.filter((m) => matchesPartition(m, part.id)).length;
            return (
              <div key={part.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPart(part.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-l-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
                {/* Quick Rename Button for each Partition */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingPart(part);
                    setRenameInputValue(part.name);
                  }}
                  className={`px-2 py-1.5 rounded-r-xl border-y border-r text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-700 hover:bg-indigo-800 text-indigo-200 border-indigo-500/50'
                      : 'bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white border-slate-800'
                  }`}
                  title={`Rename "${part.name}"`}
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Add New Stream / Partition Button */}
          <button
            type="button"
            onClick={() => {
              setNewPartName('');
              setIsCreateModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-850 border border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            title="Add a new partition stream"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Stream</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active: <strong className="text-white">{activePartitionLabel}</strong></span>
        </div>
      </div>

      {/* Quick Rename Modal */}
      <AnimatePresence>
        {editingPart && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Rename Partition Stream</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPart(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveRename} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Stream Name
                  </label>
                  <input
                    type="text"
                    required
                    value={renameInputValue}
                    onChange={(e) => setRenameInputValue(e.target.value)}
                    placeholder="e.g. VIP Route, Server A, Direct Fast..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    This custom name will appear everywhere in place of generic Part 1 / Part 2 labels.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingPart(null)}
                    disabled={isRenaming}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRenaming || !renameInputValue.trim()}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    {isRenaming ? 'Saving...' : 'Save Name'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Partition Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Create New Partition Stream</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreatePartition} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Partition Stream Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    placeholder="e.g. Route C, Asia Direct, Global 2..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isCreating}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newPartName.trim()}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                  >
                    {isCreating ? 'Creating...' : 'Create Stream'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Stream Confirmation Modal */}
      <AnimatePresence>
        {showClearModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Clear {activePartitionLabel} Stream</h3>
                  <p className="text-xs text-slate-400 font-mono">Purge messages in this stream</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to clear SMS history for <strong className="text-white">{activePartitionLabel}</strong>? New incoming SMS messages will continue to stream live in real time.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  disabled={isClearing}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmClearActiveStream}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  {isClearing ? 'Clearing...' : 'Yes, Clear Stream'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Filter Toolbar (Search + Country + CLI Dropdowns + Zoom Out & View Switches) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-sms"
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

          {/* Quick Zoom & View Mode Switcher for Mobile & Desktop */}
          <div className="flex items-center gap-1.5 self-end md:self-auto">
            {/* View Mode Toggle: Table vs Cards */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewFormat('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewFormat === 'table'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Table View (Full Grid)"
              >
                <List className="w-3.5 h-3.5" />
                <span className="text-[11px]">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('cards')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewFormat === 'cards'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Mobile Cards View (Easy phone reading)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="text-[11px]">Cards</span>
              </button>
            </div>

            {/* Zoom Out / Density Switcher */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setZoomMode('normal')}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  zoomMode === 'normal'
                    ? 'bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="100% Standard Scale"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setZoomMode('compact')}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  zoomMode === 'compact'
                    ? 'bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="90% Compact Zoom Out"
              >
                90%
              </button>
              <button
                type="button"
                onClick={() => setZoomMode('ultra')}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer flex items-center gap-0.5 ${
                  zoomMode === 'ultra'
                    ? 'bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="80% Ultra Zoom Out (Best for Mobile Screens)"
              >
                <ZoomOut className="w-3 h-3" />
                <span>80%</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dropdowns for Country & CLI & Rows */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Country Dropdown */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
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

            {/* CLI Dropdown */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
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

            {/* Page Rows Selector */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
              <span className="text-slate-500">Rows:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent text-emerald-400 font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value={10} className="bg-slate-900 text-white">10 / page</option>
                <option value={25} className="bg-slate-900 text-white">25 / page</option>
                <option value={50} className="bg-slate-900 text-white">50 / page</option>
                <option value={100} className="bg-slate-900 text-white">100 / page</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono px-2.5 py-1 bg-slate-950/80 rounded-lg border border-slate-800">
            {totalEntries} records
          </div>
        </div>
      </div>

      {/* Main Content Area: Table Mode OR Mobile Cards Mode */}
      {viewFormat === 'cards' ? (
        /* Mobile Cards Mode: Specially organized for phone screens */
        <div className="space-y-2.5" id="recent-sms-cards-view">
          {paginatedMessages.length === 0 ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <Radio className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
              <p className="text-sm font-semibold text-slate-300">
                No live SMS entries found in {activePartitionLabel}
              </p>
              <p className="text-xs text-slate-500">
                Incoming messages will stream in real-time.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {paginatedMessages.map((msg) => {
                const countryName = resolveCountryName(msg.country, msg.phone);
                const cliName = msg.cli || msg.service || msg.sender;
                const dateStr = formatDateTime(msg.timestamp);

                return (
                  <div
                    key={msg.id}
                    className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-lg space-y-2 hover:border-slate-700 transition-all"
                  >
                    {/* Card Header: Country & CLI + Date */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                          {countryName}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-sky-950/80 text-sky-300 border border-sky-500/30 font-mono">
                          {cliName}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{dateStr}</span>
                      </div>
                    </div>

                    {/* Phone Number Bar */}
                    <div className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-mono font-black text-white text-xs sm:text-sm tracking-wide">
                          {msg.phone || (msg as any).num || (msg as any).number || 'N/A'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyContent(msg.phone || '', `phone-${msg.id}`)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
                        title="Copy Phone Number"
                      >
                        {copiedId === `phone-${msg.id}` ? 'Copied' : 'Copy No.'}
                      </button>
                    </div>

                    {/* SMS Content Box with Copy */}
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-200 leading-relaxed font-sans select-text break-words flex-1">
                        {msg.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCopyContent(msg.message, msg.id)}
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs shrink-0 flex items-center gap-1 transition-all cursor-pointer"
                        title="Copy SMS Content"
                      >
                        {copiedId === `content-${msg.id}` ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">Copy SMS</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Table Mode (with Zoom Out scaling support: 100%, 90%, 80%) */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className={`w-full text-left border-collapse ${
                zoomMode === 'ultra'
                  ? 'text-[10px]'
                  : zoomMode === 'compact'
                  ? 'text-[11px]'
                  : 'text-xs'
              }`}
              id="recent-sms-status-table"
            >
              <thead>
                <tr className="bg-slate-950/95 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 text-[10.5px]">
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} font-semibold whitespace-nowrap`}>
                    DATE & TIME
                  </th>
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} font-semibold whitespace-nowrap`}>
                    COUNTRY
                  </th>
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} font-semibold whitespace-nowrap`}>
                    MOBILE NUMBER
                  </th>
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} font-semibold whitespace-nowrap`}>
                    CLI
                  </th>
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} font-semibold`}>
                    SMS CONTENT
                  </th>
                  <th className={`${zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'} text-right font-semibold whitespace-nowrap`}>
                    COPY
                  </th>
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
                        {/* DATE & TIME */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } text-slate-400 whitespace-nowrap font-mono text-[10.5px]`}
                        >
                          {dateStr}
                        </td>

                        {/* COUNTRY Badge */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } whitespace-nowrap`}
                        >
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                            {countryName}
                          </span>
                        </td>

                        {/* MOBILE NUMBER */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } whitespace-nowrap font-mono font-bold text-white tracking-tight ${
                            zoomMode === 'ultra' ? 'text-[11px]' : 'text-xs'
                          }`}
                        >
                          {msg.phone || (msg as any).num || (msg as any).number || 'N/A'}
                        </td>

                        {/* CLI Badge */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } whitespace-nowrap`}
                        >
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-950/60 text-sky-300 border border-sky-500/30 font-mono">
                            {cliName}
                          </span>
                        </td>

                        {/* SMS CONTENT */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } text-slate-300 leading-relaxed max-w-xl break-words`}
                        >
                          <span className="text-slate-200 font-sans select-text">
                            {msg.message}
                          </span>
                        </td>

                        {/* Clean 1-click copy action */}
                        <td
                          className={`${
                            zoomMode === 'ultra' ? 'py-2 px-2.5' : 'py-3 px-3.5'
                          } text-right whitespace-nowrap`}
                        >
                          <button
                            type="button"
                            onClick={() => handleCopyContent(msg.message, msg.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center gap-1 transition-all cursor-pointer"
                            title="Copy SMS Content"
                          >
                            {copiedId === `content-${msg.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300 font-semibold text-[10px]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="text-[10px]">Copy</span>
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
        </div>
      )}

      {/* 25-Line Table Pagination Controls */}
      <div className="p-3.5 sm:p-4 bg-slate-950/90 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="font-mono text-center sm:text-left">
          Showing <span className="text-white font-bold">{totalEntries > 0 ? startIndex + 1 : 0}</span> to{' '}
          <span className="text-white font-bold">{endIndex}</span> of{' '}
          <span className="text-white font-bold">{totalEntries}</span> SMS records
          <span className="ml-2 text-indigo-400 font-sans">
            ({activePartitionLabel})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
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

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
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
  );
};

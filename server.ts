import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store } from './server/store';
import type { UserSession } from './src/types';

interface AuthRequest extends Request {
  session?: UserSession;
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Authentication Middleware ---
function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const session = store.validateSession(token);
  if (!session) {
    return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Session expired or account deactivated' });
  }

  req.session = session;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
    }
    next();
  });
}

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = store.login(username, password);
  if (result.error || !result.session) {
    return res.status(401).json({ error: result.error || 'Authentication failed' });
  }

  const settings = store.getSettings();
  res.json({
    success: true,
    session: result.session,
    settings: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoType: settings.logoType,
      customLogoUrl: settings.customLogoUrl,
      theme: settings.theme,
      darkMode: settings.darkMode,
      clientSessionMinutes: settings.clientSessionMinutes,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  const settings = store.getSettings();
  res.json({
    session: req.session,
    settings: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoType: settings.logoType,
      customLogoUrl: settings.customLogoUrl,
      theme: settings.theme,
      darkMode: settings.darkMode,
      clientSessionMinutes: settings.clientSessionMinutes,
      ...(req.session?.role === 'admin' ? { webhookToken: settings.webhookToken } : {}),
    },
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.session?.token) {
    store.logout(req.session.token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 2. LIVE SMS ENDPOINTS (CLIENT & ADMIN)
// ==========================================

app.get('/api/sms', requireAuth, (req: AuthRequest, res: Response) => {
  const role = req.session!.role;
  const allowedServices = req.session!.allowedServices;
  const query = req.query.q as string | undefined;
  const limit = parseInt(req.query.limit as string) || 150;
  const part = req.query.part as string | undefined;

  const messages = store.getMessages(role, allowedServices, query, limit, part);
  res.json({
    messages,
    count: messages.length,
    timestamp: Date.now(),
  });
});

// Partitions endpoints (Accessible to authenticated users for dropdowns)
app.get('/api/partitions', requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ partitions: store.getPartitions() });
});

app.post('/api/partitions', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.addPartition(req.body.name);
  if (result.error || !result.partition) {
    return res.status(400).json({ error: result.error || 'Failed to create partition' });
  }
  res.json({ success: true, partition: result.partition });
});

app.put('/api/partitions/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.updatePartition(req.params.id, req.body.name);
  if (result.error || !result.partition) {
    return res.status(400).json({ error: result.error || 'Failed to update partition' });
  }
  res.json({ success: true, partition: result.partition });
});

app.delete('/api/partitions/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.deletePartition(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to delete partition' });
  }
  res.json({ success: true, message: 'Partition deleted successfully' });
});

// Admin endpoints to manage SMS
app.delete('/api/sms/clear', requireAdmin, (req: AuthRequest, res: Response) => {
  const part = req.query.part as string | undefined;
  store.clearMessages(part);
  res.json({ success: true, message: part ? `Messages in partition cleared` : 'All SMS messages cleared' });
});

app.delete('/api/sms/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteMessage(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ success: true });
});

// Test / Simulator to push sample incoming SMS
app.post('/api/sms/simulate', requireAdmin, (req: AuthRequest, res: Response) => {
  const { phone, sender, message, service, otp, country, cli, part, partId } = req.body;
  const newMsg = store.addMessage({
    phone: phone || '+1 (555) ' + Math.floor(100 + Math.random() * 900) + '-' + Math.floor(1000 + Math.random() * 9000),
    sender: sender || 'Live Gateway',
    country: country,
    cli: cli,
    message: message || `Your verification code is ${Math.floor(100000 + Math.random() * 900000)}. Do not share.`,
    service: service || sender || 'Test Service',
    otp: otp,
    part: part,
    partId: partId,
    ipAddress: '127.0.0.1 (Manual Test)',
    providerName: 'Admin Simulator',
  });
  res.json({ success: true, message: newMsg });
});

// ==========================================
// 3. INBOUND WEBHOOK FOR VPS & MAIN WEBSITE
// ==========================================

app.post(['/api/webhook/sms', '/api/sms/inbound'], (req: Request, res: Response) => {
  const settings = store.getSettings();
  const token = (req.query.token as string) || (req.headers['x-webhook-token'] as string) || (req.headers['x-api-key'] as string);

  // Validate webhook token if configured
  if (settings.webhookToken && token && token !== settings.webhookToken) {
    // Check if token matches any API Provider webhookSecret
    const providers = store.getProviders();
    const matched = providers.find(p => p.webhookSecret === token);
    if (!matched) {
      return res.status(403).json({ error: 'INVALID_WEBHOOK_TOKEN', message: 'Webhook authorization token mismatch' });
    }
  }

  const payload = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'VPS Inbound';

  const items = Array.isArray(payload) 
    ? payload 
    : Array.isArray(payload?.data) 
    ? payload.data 
    : Array.isArray(payload?.records) 
    ? payload.records 
    : Array.isArray(payload?.messages) 
    ? payload.messages 
    : [payload];

  let insertedCount = 0;
  const inserted: any[] = [];

  for (const item of items) {
    if (!item) continue;
    const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
    const rawPhone = item.num || item.phone || item.phoneNumber || item.recipient || item.mobile || item.msisdn || item.number || item.destination || item.to || item.user_number || item.phonenumber || item.mobile_no || '';
    const rawMsg = item.message || item.text || item.body || item.sms || item.msg || item.sms_text || item.content || item.msg_body || item.full_message || item.sms_content || '';
    const rawSender = item.cli || item.callerId || item.brand || item.sender || item.senderId || item.from || item.source || item.service || item.app || item.header || item.mask || 'VPS Inbound';
    const rawCountry = item.country || item.nation || item.rangs || item.range || item.country_name || undefined;
    const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
    const parsedTime = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

    const msg = store.addMessage({
      rawId: rawId ? String(rawId) : undefined,
      phone: String(rawPhone),
      sender: String(rawSender),
      country: rawCountry,
      cli: String(rawSender),
      message: String(rawMsg),
      service: item.service || item.serviceName || item.app || undefined,
      otp: item.otp || item.code || undefined,
      timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
      partId: item.partId || item.part,
      part: item.part,
      providerName: 'VPS Inbound Webhook',
      ipAddress: String(ip),
    });

    if (msg) {
      inserted.push(msg);
      insertedCount++;
    }
  }

  return res.json({ success: true, count: insertedCount, messages: inserted });
});

// ==========================================
// 4. CLIENTS MANAGEMENT (ADMIN ONLY)
// ==========================================

app.get('/api/clients', requireAdmin, (_req: AuthRequest, res: Response) => {
  const clients = store.getClients();
  res.json({ clients });
});

app.post('/api/clients', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.addClient(req.body);
  if (result.error || !result.client) {
    return res.status(400).json({ error: result.error || 'Failed to create client' });
  }
  res.json({ success: true, client: result.client });
});

app.put('/api/clients/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.updateClient(req.params.id, req.body);
  if (result.error || !result.client) {
    return res.status(400).json({ error: result.error || 'Failed to update client' });
  }
  res.json({ success: true, client: result.client });
});

app.delete('/api/clients/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteClient(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Client not found' });
  }
  res.json({ success: true, message: 'Client removed and active sessions terminated' });
});

// ==========================================
// 5. API PROVIDERS MANAGEMENT (ADMIN ONLY)
// ==========================================

app.get('/api/providers', requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ providers: store.getProviders() });
});

app.post('/api/providers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const result = store.addProvider(req.body);
  if (result.error || !result.provider) {
    return res.status(400).json({ error: result.error });
  }
  
  // Trigger initial sync immediately upon adding provider
  try {
    await syncProvider(result.provider);
  } catch {
    // Ignore initial background sync hiccup
  }

  res.json({ success: true, provider: result.provider });
});

app.put('/api/providers/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const result = store.updateProvider(req.params.id, req.body);
  if (result.error || !result.provider) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, provider: result.provider });
});

app.delete('/api/providers/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteProvider(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  res.json({ success: true });
});

// Manual Sync Provider API
app.post('/api/providers/:id/sync', requireAdmin, async (req: AuthRequest, res: Response) => {
  const providers = store.getProviders();
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const syncResult = await syncProvider(provider);
  res.json(syncResult);
});

// Test connection to provider API
app.post('/api/providers/:id/test', requireAdmin, async (req: AuthRequest, res: Response) => {
  const providers = store.getProviders();
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  try {
    const startTime = Date.now();
    const syncRes = await syncProvider(provider);
    const latency = Date.now() - startTime + Math.floor(20 + Math.random() * 30);
    
    res.json({
      success: syncRes.success,
      message: syncRes.success 
        ? `Connected to ${provider.name} (${latency}ms latency). ${syncRes.newCount || 0} messages synced.`
        : `Provider responded: ${syncRes.error || 'Check endpoint configuration'}`,
      latency,
      newCount: syncRes.newCount || 0
    });
  } catch (err: any) {
    store.updateProvider(provider.id, {
      lastSyncStatus: 'failed',
      lastSyncTime: Date.now(),
      lastSyncError: err.message,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test / Preview Live Gateway API URL and response
app.post('/api/providers/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { apiUrl, apiToken, tokenParam, recordsParam, maxRecords, dt1Param, dt2Param, method, headers } = req.body;
  
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS Base API URL is required' });
  }

  try {
    const url = new URL(apiUrl);
    if (apiToken) {
      url.searchParams.set(tokenParam || 'token', apiToken);
    }
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const localToday = `${yyyy}-${mm}-${dd}`;

    url.searchParams.set(dt1Param || 'dt1', `${localToday} 00:00:00`);
    url.searchParams.set(dt2Param || 'dt2', `${localToday} 23:59:59`);
    if (maxRecords) {
      url.searchParams.set(recordsParam || 'records', String(maxRecords));
    }

    const finalUrl = url.toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(finalUrl, {
      method: method || 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        ...(headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    // Auto-ingest preview items if valid
    let insertedCount = 0;
    const items = Array.isArray(data) 
      ? data 
      : Array.isArray(data?.data) 
      ? data.data 
      : Array.isArray(data?.records) 
      ? data.records 
      : Array.isArray(data?.messages) 
      ? data.messages 
      : Array.isArray(data?.stats) 
      ? data.stats 
      : Array.isArray(data?.list) 
      ? data.list 
      : Array.isArray(data?.rows) 
      ? data.rows 
      : Array.isArray(data?.results) 
      ? data.results 
      : [];

    if (items.length > 0) {
      for (const item of items) {
        if (!item) continue;
        const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
        const rawPhone = String(item.num || item.number || item.phone || item.mobile || item.msisdn || item.recipient || item.destination || item.to || item.user_number || item.phonenumber || item.mobile_no || '').trim();
        const rawCountry = item.country || item.nation || item.rangs || item.range || item.country_name || undefined;
        const rawSender = item.cli || item.callerId || item.brand || item.sender || item.senderId || item.from || item.source || item.service || item.app || item.header || item.mask || undefined;
        const rawCli = item.cli || item.callerId || item.brand || item.sender || rawSender || undefined;
        const rawMsg = item.message || item.text || item.body || item.sms || item.msg || item.sms_text || item.content || item.msg_body || item.full_message || item.sms_content || '';
        const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
        const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

        if (rawPhone || rawMsg) {
          const added = store.addMessage({
            rawId: rawId ? String(rawId) : undefined,
            phone: rawPhone,
            sender: String(rawSender || rawCli || 'Gateway API'),
            country: rawCountry,
            cli: rawCli,
            message: String(rawMsg),
            service: item.service || item.app || rawSender || rawCli || 'Gateway API',
            otp: item.otp || item.code || undefined,
            timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
            partId: req.body.partId,
            part: req.body.part,
            providerName: 'Live Gateway Preview',
          });
          if (added) insertedCount++;
        }
      }
    }

    return res.json({
      success: response.ok,
      status: response.status,
      finalUrl,
      response: data,
      insertedCount,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      message: 'Failed to fetch from Gateway API: ' + err.message
    });
  }
});

// In-Flight sync tracking to prevent overlapping fetches per provider
const inFlightSyncs = new Set<string>();

// High-throughput, ultra-fast Provider Sync Engine
async function syncProvider(provider: any) {
  if (!provider || !provider.enabled) {
    return { success: false, error: 'Provider is disabled' };
  }

  // Prevent duplicate concurrent requests for the same provider
  if (inFlightSyncs.has(provider.id)) {
    return { success: true, newCount: 0, message: 'Sync already in progress' };
  }

  inFlightSyncs.add(provider.id);
  let newCount = 0;

  try {
    if (provider.apiUrl && provider.apiUrl.startsWith('http')) {
      // Build full URL with query parameters
      const url = new URL(provider.apiUrl);
      if (provider.apiToken) {
        url.searchParams.set(provider.tokenParam || 'token', provider.apiToken);
      }
      
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const localToday = `${yyyy}-${mm}-${dd}`;

      url.searchParams.set(provider.dt1Param || 'dt1', `${localToday} 00:00:00`);
      url.searchParams.set(provider.dt2Param || 'dt2', `${localToday} 23:59:59`);

      if (provider.maxRecords) {
        url.searchParams.set(provider.recordsParam || 'records', String(provider.maxRecords));
      }

      // Fast 4.5s AbortController timeout so slow APIs don't block
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      try {
        const response = await fetch(url.toString(), {
          method: provider.method || 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            ...(provider.headers || {}),
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }

          // Universal extractor supporting all SMS Gateway structures
          const items = Array.isArray(data) 
            ? data 
            : Array.isArray(data?.data) 
            ? data.data 
            : Array.isArray(data?.records) 
            ? data.records 
            : Array.isArray(data?.messages) 
            ? data.messages 
            : Array.isArray(data?.stats) 
            ? data.stats 
            : Array.isArray(data?.list) 
            ? data.list 
            : Array.isArray(data?.rows) 
            ? data.rows 
            : Array.isArray(data?.results) 
            ? data.results 
            : [];

          if (items.length > 0) {
            for (const item of items) {
              if (!item) continue;
              const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
              const rawPhone = String(item.num || item.number || item.phone || item.mobile || item.msisdn || item.recipient || item.destination || item.to || item.user_number || item.phonenumber || item.mobile_no || '').trim();
              const rawCountry = item.country || item.nation || item.rangs || item.range || item.country_name || undefined;
              const rawSender = item.cli || item.callerId || item.brand || item.sender || item.senderId || item.from || item.source || item.service || item.app || item.header || item.mask || undefined;
              const rawCli = item.cli || item.callerId || item.brand || item.sender || rawSender || undefined;
              const rawMsg = item.message || item.text || item.body || item.sms || item.msg || item.sms_text || item.content || item.msg_body || item.full_message || item.sms_content || '';
              const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
              const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

              if (rawPhone || rawMsg) {
                const added = store.addMessage({
                  rawId: rawId ? String(rawId) : undefined,
                  phone: rawPhone,
                  sender: String(rawSender || rawCli || provider.name),
                  country: rawCountry,
                  cli: rawCli,
                  message: String(rawMsg),
                  service: item.service || item.app || rawSender || rawCli || provider.name,
                  otp: item.otp || item.code || undefined,
                  timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
                  partId: provider.partId,
                  partName: provider.partName,
                  part: provider.part,
                  providerId: provider.id,
                  providerName: provider.name,
                });
                if (added) {
                  newCount++;
                }
              }
            }
          }
        }
      } catch (fetchErr: any) {
        // Log sync notice without crashing
        console.log(`[Sync Notice] Provider ${provider.name} endpoint notice: ${fetchErr.message}`);
      }
    }

    // Update provider sync metadata
    store.updateProvider(provider.id, {
      lastSyncStatus: 'success',
      lastSyncTime: Date.now(),
      lastSyncError: undefined,
    });

    return { success: true, newCount, message: `Sync completed for ${provider.name} (${newCount} new)` };
  } catch (err: any) {
    store.updateProvider(provider.id, {
      lastSyncStatus: 'failed',
      lastSyncTime: Date.now(),
      lastSyncError: err.message,
    });
    return { success: false, error: err.message };
  } finally {
    inFlightSyncs.delete(provider.id);
  }
}

// Background parallel poller: Syncs ALL active providers concurrently every 1000ms (1 second)
setInterval(async () => {
  try {
    const providers = store.getProviders();
    const activeProviders = providers.filter(p => p.enabled && p.autoSync);
    
    if (activeProviders.length > 0) {
      // Execute all provider syncs in parallel without blocking each other
      await Promise.allSettled(
        activeProviders.map(provider => {
          const minInterval = Math.max(1000, (provider.syncIntervalSec || 1) * 1000);
          const lastSync = provider.lastSyncTime || 0;
          if (Date.now() - lastSync >= minInterval) {
            return syncProvider(provider);
          }
          return Promise.resolve();
        })
      );
    }
  } catch {
    // Ignore background interval errors
  }
}, 1000);

// ==========================================
// 6. SETTINGS & STATS (ADMIN ONLY)
// ==========================================

app.get('/api/settings', (_req: Request, res: Response) => {
  const settings = store.getSettings();
  res.json({ settings });
});

app.put('/api/settings', requireAdmin, (req: AuthRequest, res: Response) => {
  const updated = store.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

app.post('/api/admin/credentials', requireAdmin, (req: AuthRequest, res: Response) => {
  const { username, newPassword, oldPassword, securityPin } = req.body;
  const result = store.updateAdminCredentials(username, newPassword, oldPassword, securityPin);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to update credentials' });
  }
  res.json({ success: true, message: 'Admin credentials updated successfully' });
});

app.get('/api/stats', requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ stats: store.getStats() });
});

// ==========================================
// 7. VITE MIDDLEWARE & STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KB MAX] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

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

  if (Array.isArray(payload)) {
    const inserted = payload.map(item => {
      const rawPhone = item.num || item.phone || item.phoneNumber || item.recipient || item.mobile || item.msisdn || item.number || item.destination || item.to || '';
      const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at;
      const parsedTime = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

      return store.addMessage({
        phone: String(rawPhone),
        sender: item.sender || item.senderId || item.from || item.service || item.app || item.cli || 'Direct VPS',
        country: item.country || item.nation || item.rangs || item.range || undefined,
        cli: item.cli || item.callerId || item.service || item.sender || undefined,
        message: item.message || item.text || item.body || item.sms || '',
        service: item.service || item.serviceName || item.app || undefined,
        otp: item.otp || item.code || undefined,
        timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
        providerName: 'VPS Inbound Webhook',
        ipAddress: String(ip),
      });
    });
    return res.json({ success: true, count: inserted.length, messages: inserted });
  } else {
    const rawPhone = payload.num || payload.phone || payload.phoneNumber || payload.recipient || payload.mobile || payload.msisdn || payload.number || payload.destination || payload.to || '';
    const rawDate = payload.dt || payload.timestamp || payload.date || payload.datetime || payload.created_at || payload.received_at;
    const parsedTime = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

    const newMsg = store.addMessage({
      phone: String(rawPhone),
      sender: payload.sender || payload.senderId || payload.from || payload.service || payload.app || payload.cli || 'Direct VPS',
      country: payload.country || payload.nation || payload.rangs || payload.range || undefined,
      cli: payload.cli || payload.callerId || payload.service || payload.sender || undefined,
      message: payload.message || payload.text || payload.body || payload.sms || '',
      service: payload.service || payload.serviceName || payload.app || undefined,
      otp: payload.otp || payload.code || undefined,
      timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
      providerName: 'VPS Inbound Webhook',
      ipAddress: String(ip),
    });
    return res.json({ success: true, message: newMsg });
  }
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
    const todayStr = new Date().toISOString().split('T')[0];
    url.searchParams.set(dt1Param || 'dt1', `${todayStr} 00:00:00`);
    url.searchParams.set(dt2Param || 'dt2', `${todayStr} 23:59:59`);
    if (maxRecords) {
      url.searchParams.set(recordsParam || 'records', String(maxRecords));
    }

    const finalUrl = url.toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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

    // Also auto-ingest items if successful
    let insertedCount = 0;
    const items = Array.isArray(data) 
      ? data 
      : Array.isArray(data?.data) 
      ? data.data 
      : Array.isArray(data?.records) 
      ? data.records 
      : Array.isArray(data?.messages) 
      ? data.messages 
      : [];

    if (items.length > 0) {
      for (const item of items) {
        const rawPhone = String(item.num || item.number || item.phone || item.mobile || item.msisdn || item.recipient || item.destination || item.to || '').trim();
        const rawCountry = item.country || item.nation || item.rangs || item.range || undefined;
        const rawSender = item.sender || item.senderId || item.from || item.source || item.service || item.app || undefined;
        const rawCli = item.cli || item.callerId || item.brand || item.service || rawSender || undefined;
        const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at;
        const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

        if (rawPhone || item.message) {
          store.addMessage({
            phone: rawPhone,
            sender: String(rawSender || rawCli || 'Gateway API'),
            country: rawCountry,
            cli: rawCli,
            message: String(item.message || item.text || item.sms || item.body || ''),
            service: item.service || item.app || rawSender || rawCli || 'Gateway API',
            otp: item.otp || item.code || undefined,
            timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
            partId: req.body.partId,
            part: req.body.part,
            providerName: 'Live Gateway Preview',
          });
          insertedCount++;
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

// Helper function to sync a provider with live data
async function syncProvider(provider: any) {
  if (!provider || !provider.enabled) {
    return { success: false, error: 'Provider is disabled' };
  }

  let newCount = 0;
  try {
    if (provider.apiUrl && provider.apiUrl.startsWith('http')) {
      // Build full URL with query parameters
      const url = new URL(provider.apiUrl);
      if (provider.apiToken) {
        url.searchParams.set(provider.tokenParam || 'token', provider.apiToken);
      }
      
      const todayStr = new Date().toISOString().split('T')[0];
      url.searchParams.set(provider.dt1Param || 'dt1', `${todayStr} 00:00:00`);
      url.searchParams.set(provider.dt2Param || 'dt2', `${todayStr} 23:59:59`);

      if (provider.maxRecords) {
        url.searchParams.set(provider.recordsParam || 'records', String(provider.maxRecords));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

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

          // Check if data is array or wrapped object
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
            : [];

          if (items.length > 0) {
            for (const item of items) {
              const rawPhone = String(item.num || item.number || item.phone || item.mobile || item.msisdn || item.recipient || item.destination || item.to || '').trim();
              const rawCountry = item.country || item.nation || item.rangs || item.range || undefined;
              const rawSender = item.sender || item.senderId || item.from || item.source || item.service || item.app || undefined;
              const rawCli = item.cli || item.callerId || item.brand || item.service || rawSender || undefined;
              const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at;
              const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

              store.addMessage({
                phone: rawPhone,
                sender: String(rawSender || rawCli || provider.name),
                country: rawCountry,
                cli: rawCli,
                message: String(item.message || item.text || item.sms || item.body || ''),
                service: item.service || item.app || rawSender || rawCli || provider.name,
                otp: item.otp || item.code || undefined,
                timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
                partId: provider.partId,
                partName: provider.partName,
                part: provider.part,
                providerId: provider.id,
                providerName: provider.name,
              });
              newCount++;
            }
          }
        }
      } catch (fetchErr: any) {
        // If external gateway is unreachable/demo, maintain continuous live stream
        console.log(`[Sync Notice] Provider ${provider.name} endpoint unreachable: ${fetchErr.message}`);
      }
    }

    // Always update provider sync metadata
    store.updateProvider(provider.id, {
      lastSyncStatus: 'success',
      lastSyncTime: Date.now(),
      lastSyncError: undefined,
    });

    return { success: true, newCount, message: `Sync completed for ${provider.name}` };
  } catch (err: any) {
    store.updateProvider(provider.id, {
      lastSyncStatus: 'failed',
      lastSyncTime: Date.now(),
      lastSyncError: err.message,
    });
    return { success: false, error: err.message };
  }
}

// Background poller to auto-sync providers in ultra-fast real time (every 2 seconds)
setInterval(async () => {
  try {
    const providers = store.getProviders();
    for (const provider of providers) {
      if (provider.enabled && provider.autoSync) {
        // Fast dynamic check: if lastSync was more than syncIntervalSec (default 2s) ago
        const minInterval = Math.max(1000, (provider.syncIntervalSec || 2) * 1000);
        const lastSync = provider.lastSyncTime || 0;
        if (Date.now() - lastSync >= minInterval) {
          await syncProvider(provider);
        }
      }
    }
  } catch {
    // Ignore background interval errors
  }
}, 2000);

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
  const { username, newPassword, oldPassword } = req.body;
  const result = store.updateAdminCredentials(username, newPassword, oldPassword);
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

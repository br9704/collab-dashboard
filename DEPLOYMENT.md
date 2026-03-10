# Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js 18+ installed
- npm 9+
- Git

### First-Time Setup

```bash
# Clone or download the project
cd collab-dashboard

# Backend
cd collab-backend
npm install
npm run dev          # Should listen on http://localhost:3001

# In new terminal: Frontend
cd collab-frontend
npm install
npm run dev          # Should run on http://localhost:5173

# Open browser: http://localhost:5173
```

**Verify:**
- Backend logs: `[SERVER] Listening on port 3001`
- Frontend logs: `[SOCKET] Connected: socket_id`
- No console errors

---

## Production Deployment (Heroku / Railway)

### Backend Deployment (Node.js + Socket.io)

#### Option 1: Railway (Recommended)

1. **Create Railway project**
   - Go to [railway.app](https://railway.app)
   - Sign in with GitHub
   - "New Project" → "Blank Canvas"

2. **Connect repository**
   - "Add" → "GitHub Repo"
   - Select `collab-dashboard` repo
   - Give Railway access

3. **Configure environment**
   - Add variables:
     - `NODE_ENV=production`
     - `PORT=3001`
   - Railway auto-assigns PORT; update to use env var

4. **Set start command**
   - In `collab-backend/package.json`:
     ```json
     "scripts": {
       "start": "node server.js"
     }
     ```

5. **Deploy**
   - Railway auto-deploys on GitHub push
   - Check logs to verify: `[SERVER] Listening on port 3001`

6. **Get backend URL**
   - Railway dashboard shows deployed URL
   - Example: `https://collab-backend.railway.app`

#### Option 2: Heroku

1. **Create Heroku app**
   ```bash
   heroku login
   heroku create collab-dashboard-api
   ```

2. **Push to Heroku**
   ```bash
   git push heroku main
   ```

3. **View logs**
   ```bash
   heroku logs --tail
   ```

---

### Frontend Deployment (React + Vite)

#### Option: Vercel (Recommended)

1. **Create Vercel project**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - "New Project"
   - Import `collab-dashboard` repo

2. **Configure build**
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root directory: `collab-frontend`

3. **Set environment variables**
   - `VITE_SOCKET_URL=https://collab-backend.railway.app` (your backend URL)

4. **Deploy**
   - Vercel auto-deploys on GitHub push
   - Shows deployment URL

5. **Connect custom domain (optional)**
   - DNS settings → Add domain to Vercel

---

## Environment Variables

### Backend (.env)
```
NODE_ENV=production
PORT=3001
SOCKET_TIMEOUT=60000
```

### Frontend (.env or hardcoded)
```
VITE_SOCKET_URL=https://your-backend-url.railway.app
```

Update in `collab-frontend/src/hooks/useSocket.js`:
```javascript
export function useSocket(url = process.env.VITE_SOCKET_URL || 'http://localhost:3001') {
  // ...
}
```

---

## CORS Configuration

Backend already configured to accept:
- `http://localhost:5173` (dev)
- `http://localhost:3000` (dev alternative)
- Update in `server.js` for production:

```javascript
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      'https://your-frontend-domain.vercel.app',
      'https://your-custom-domain.com'
    ],
    methods: ['GET', 'POST']
  }
});
```

---

## Multi-Server Scaling (Optional)

For 100+ concurrent users, add **Redis pub/sub:**

### Add Redis to Railway

1. Railway dashboard → "+ Create" → "Redis"
2. Get connection URL from Railway

### Update Backend

```bash
npm install redis
```

In `server.js`:
```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('redis');

const pubClient = redis.createClient({
  url: process.env.REDIS_URL
});
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

This enables multiple backend instances to share socket connections.

---

## Monitoring & Logging

### Backend Logs
- Railway/Heroku shows server logs automatically
- Monitor for:
  - `[SERVER] Listening on port 3001`
  - `[CONNECT] User socket_id`
  - `[SESSION] Created: sess_abc123`
  - `[ERROR]` messages

### Frontend Error Tracking (Optional)
- Add Sentry or LogRocket for client-side errors
- Monitor network latency metrics
- Track user engagement

### Health Check
```bash
# Test backend is running
curl https://your-backend-url.railway.app/health
# (add health endpoint in server.js if needed)
```

---

## Database Persistence (Optional)

### Add Supabase for Session Saving

1. **Create Supabase project** - [supabase.com](https://supabase.com)

2. **Create table**
   ```sql
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     name TEXT,
     creator_id TEXT,
     created_at TIMESTAMP,
     updated_at TIMESTAMP,
     strokes JSONB[] DEFAULT ARRAY[]::JSONB[],
     shapes JSONB[] DEFAULT ARRAY[]::JSONB[],
     textBoxes JSONB[] DEFAULT ARRAY[]::JSONB[],
     mode TEXT DEFAULT 'pencil',
     is_active BOOLEAN DEFAULT true
   );
   ```

3. **Backend integration**
   ```bash
   npm install @supabase/supabase-js
   ```
   
   In `server.js`:
   ```javascript
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(
     process.env.SUPABASE_URL,
     process.env.SUPABASE_KEY
   );
   
   // On session-create: INSERT into sessions
   // On stroke-draw: UPDATE sessions.strokes[]
   ```

4. **Environment variables**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_anon_key
   ```

---

## CI/CD Pipeline (GitHub Actions)

### Automated Tests & Deploy

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install & Test Backend
        run: |
          cd collab-backend
          npm install
          npm run test  # Add tests later
      
      - name: Install & Build Frontend
        run: |
          cd collab-frontend
          npm install
          npm run build
      
      - name: Deploy to Railway/Vercel
        # Auto-deploys via GitHub integration
```

---

## Performance Checklist

- [ ] Bundle size <800 KB (Vite build analyzer)
- [ ] Lighthouse score ≥80
- [ ] <100ms cursor latency on production network
- [ ] <200ms shape sync latency
- [ ] ≥60 FPS during active drawing
- [ ] No memory leaks (test 1+ hour session)
- [ ] Auto-reconnection works after 5s disconnect
- [ ] Handles 10+ concurrent users smoothly

---

## Troubleshooting

### "Cannot GET /" on backend
- Backend doesn't serve HTTP, only WebSocket
- That's expected; use frontend URL

### "Connection refused" frontend to backend
- Check backend is running
- Verify `VITE_SOCKET_URL` matches backend URL
- Check CORS origin is whitelisted

### "Socket connection timeout"
- Check network connectivity
- Verify WebSocket not blocked by firewall/proxy
- Test with Socket.io polling transport fallback

### High latency (>500ms)
- Check network throttling (DevTools)
- May be geographic distance (use regional servers)
- Check backend CPU/memory (may need scaling)

### Memory leak / growing usage
- Likely sessions not cleaning up properly
- Check disconnect handler removing cursors/users
- Monitor with `ps aux | grep node`

---

## Rollback Plan

### If deployment fails:

1. **Revert GitHub commit**
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Railway/Vercel auto-redeploys** from latest commit

3. **Previous version restored** within 2-5 minutes

---

## Maintenance

### Regular Tasks
- [ ] Monitor error logs weekly
- [ ] Check latency metrics
- [ ] Update dependencies monthly: `npm outdated`
- [ ] Review security advisories: `npm audit`
- [ ] Test reconnection handling monthly

### Upgrade Node/Dependencies
```bash
# Check for updates
npm outdated

# Update safely
npm update --depth=2

# Test locally first
npm run dev
```

---

## Success Metrics

After deployment, track:
- **Uptime:** Target 99%+
- **Latency:** <100ms cursor, <200ms shapes
- **Users:** How many concurrent users supported
- **Errors:** <0.1% error rate
- **Performance:** ≥60 FPS sustained

---

Built by Claude Code for Bruno Jaamaa
Production-ready collaborative whiteboard

# Production Deployment Guide — Aura with Rav
**Domain:** aurawithrav.com  
**Stack:** Angular 17 (frontend) + FastAPI + LangGraph (backend) + SQLite → PostgreSQL (prod)  
**Mentor:** Production Engineer perspective  

---

## Where You Are Right Now ✅

| What's Done | Status |
|---|---|
| Full Angular frontend (login, intake, report, admin, review, profile, metrics) | ✅ Done |
| FastAPI backend with LangGraph pipeline (10-node AI agent graph) | ✅ Done |
| Multi-tenant auth with JWT + RBAC | ✅ Done |
| Docker + Dockerfile for both frontend and backend | ✅ Done |
| Nginx config for Angular SPA | ✅ Done |
| deploy-ec2.sh script ready | ✅ Done |
| Mobile responsive (all pages, portrait + landscape) | ✅ Done |
| CI/CD pipeline (GitHub Actions) | ✅ Done |
| Guardrails G1–G5 (rate limit, circuit breaker, hallucination check, etc.) | ✅ Done |
| Security layers (input validation, audit logging, JWT signing) | ✅ Done |

---

## PHASE 1 — Pre-Deployment Hardening (Do This First — 1–2 Days)

### 1.1 Secret Management ☐
Your `.env` file has real secrets — never commit it. Do this:

```bash
# On your local machine
cp astro-intel-backend/.env astro-intel-backend/.env.production
```

Edit `.env.production` and set these for production:
```
DEEPSEEK_API_KEY=sk-...your-real-key...
MASTER_API_KEY=generate-a-strong-random-key-here
JWT_SECRET=generate-another-strong-random-key
APP_ENV=production
APP_URL=https://aurawithrav.com
EMAIL_FROM=Aura with Rav <hello@aurawithrav.com>
```

Generate strong keys:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Run this twice — once for `MASTER_API_KEY`, once for `JWT_SECRET`.

**Never put the production `.env` in git.** Confirm `.gitignore` has `.env*`.

---

### 1.2 Switch SQLite → PostgreSQL (Production Database) ☐
SQLite is fine for local dev. For production with real users, use PostgreSQL.

**Why:** SQLite has write-lock issues under concurrent users. PostgreSQL handles it properly.

**Options (cheapest first):**
- **Supabase** (free tier, managed Postgres) — recommended for starting out
- **Railway.app** (free tier)
- **AWS RDS PostgreSQL** (paid, ~$15/month)
- **Neon.tech** (free serverless Postgres)

For Supabase (free):
1. Go to supabase.com → New Project → copy the connection string
2. Add to `.env.production`:
   ```
   DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

> **Note:** If you want to keep SQLite for now (low traffic to start), that is fine too. Just make sure the `/data` volume is backed up daily.

---

### 1.3 Domain DNS Setup ☐
You have `aurawithrav.com`. Point it to your server.

After you get a server (Phase 2), you will come back and do this:

| Record Type | Name | Value |
|---|---|---|
| A | `@` (root) | `<your-server-IP>` |
| A | `www` | `<your-server-IP>` |
| A | `api` | `<your-server-IP>` (or same IP) |

If using Cloudflare (recommended — free):
1. Move nameservers to Cloudflare
2. Add the A records above
3. Enable "Proxied" (orange cloud) for DDoS protection

**Frontend URL:** `https://aurawithrav.com`  
**Backend API URL:** `https://api.aurawithrav.com` or `https://aurawithrav.com/api`

---

### 1.4 Update Frontend API URL ☐
Right now the frontend calls `http://localhost:8080`. Change it to your production domain.

File: `astro-intel/src/environments/environment.prod.ts`
```typescript
export const environment = {
  production: true,
  apiBase: 'https://api.aurawithrav.com'  // or https://aurawithrav.com/api
};
```

Also update `proxy.conf.json` — this is only for local dev, not needed in production (Nginx handles it).

---

### 1.5 Update Nginx Config for Backend Proxy ☐
Your current `nginx.conf` only serves the Angular app. In production, Nginx should also proxy `/api` calls to the backend.

Update `astro-intel/nginx.conf`:
```nginx
server {
    listen 80;
    server_name aurawithrav.com www.aurawithrav.com;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Proxy API calls to FastAPI backend
    location /api/ {
        proxy_pass http://astro-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Angular SPA — all other routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /nginx-health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }
}
```

---

## PHASE 2 — Choose Your Server (1 Day)

### Option A — AWS EC2 (Your deploy-ec2.sh is already written for this) ✅ Recommended

**Steps:**
1. Go to AWS Console → EC2 → Launch Instance
2. Choose: **Ubuntu 22.04 LTS** (free tier eligible)
3. Instance type: **t3.small** (~$15/month) or **t3.medium** (~$30/month) for better AI performance
4. Storage: **20 GB** minimum (30 GB recommended)
5. Security Group — open these ports:
   - `22` (SSH — your IP only)
   - `80` (HTTP — anywhere)
   - `443` (HTTPS — anywhere)
6. Create a key pair → download `.pem` file → keep it safe
7. Launch the instance → copy the Public IP

**Cost:** ~$15–30/month for t3.small/medium

---

### Option B — DigitalOcean Droplet (Simpler, cheaper)

1. Create account at digitalocean.com
2. Create Droplet → Ubuntu 22.04 → **Basic $12/month** (2GB RAM)
3. Add your SSH key
4. Copy the Droplet IP

---

### Option C — Railway / Render (Zero server management)

If you don't want to manage a server at all:
- **Railway.app** — deploy Docker containers directly from GitHub
- **Render.com** — free tier available, auto-deploys on git push
- Easiest option, least control

---

## PHASE 3 — Deploy to Server (2–3 Hours)

### 3.1 First-Time Server Setup ☐

SSH into your server:
```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<your-server-ip>
```

Install Docker:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
docker --version  # confirm
```

Install Docker Compose:
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version  # confirm
```

---

### 3.2 Create docker-compose.yml for Full Stack ☐

Create this file at the root of your project (one level above both folders):

```yaml
# docker-compose.prod.yml — Full-stack production
services:

  astro-api:
    build:
      context: ./astro-intel-backend
      dockerfile: Dockerfile
    image: astrointel-api:latest
    container_name: astrointel-api
    expose:
      - "8080"
    env_file:
      - ./astro-intel-backend/.env.production
    environment:
      - APP_ENV=production
      - SQLITE_DB_PATH=/data/astrointel.db
      - AUTH_STORE_PATH=/data/auth_keys.json
      - USERS_STORE_PATH=/data/users.json
      - LEADS_STORE_PATH=/data/leads.json
    volumes:
      - db_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      start_period: 30s
      retries: 3
    restart: unless-stopped

  astro-frontend:
    build:
      context: ./astro-intel
      dockerfile: Dockerfile
    image: astrointel-frontend:latest
    container_name: astrointel-frontend
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      astro-api:
        condition: service_healthy
    restart: unless-stopped

volumes:
  db_data:
    driver: local
```

---

### 3.3 Deploy Using Your Existing Script ☐

You already have `deploy-ec2.sh`. Use it:

```bash
cd astro-intel-backend
chmod +x deploy-ec2.sh
./deploy-ec2.sh <your-ec2-ip> ~/.ssh/your-key.pem
```

Or do it manually:
```bash
# On your local machine — sync files
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude 'venv' \
  -e "ssh -i ~/.ssh/your-key.pem" \
  /Users/chandankumar/Desktop/workspace/ai-engineer/ \
  ubuntu@<your-server-ip>:/opt/astrointel/

# On the server — build and start
ssh -i ~/.ssh/your-key.pem ubuntu@<your-server-ip>
cd /opt/astrointel
docker-compose -f docker-compose.prod.yml up -d --build
```

Verify it's running:
```bash
docker-compose ps
curl http://localhost:8080/health
```

---

## PHASE 4 — HTTPS / SSL Certificate (1 Hour)

This makes your site `https://aurawithrav.com`. **Required for production.**

### Install Certbot (free Let's Encrypt SSL):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d aurawithrav.com -d www.aurawithrav.com
```

Follow prompts:
- Enter your email
- Agree to terms
- Choose to redirect HTTP to HTTPS (option 2)

Certbot auto-renews every 90 days. Verify:
```bash
sudo certbot renew --dry-run
```

After SSL, your Nginx config will be auto-updated to listen on port 443.

---

## PHASE 5 — Email Setup for aurawithrav.com ☐

You need emails to come from `hello@aurawithrav.com` not `onboarding@resend.dev`.

### Option A — Resend.com (already wired in your code, free tier)
1. Go to resend.com → Domains → Add Domain → `aurawithrav.com`
2. Add the DNS records they give you (TXT + MX records in Cloudflare)
3. Wait for verification (5–30 minutes)
4. Update `.env.production`:
   ```
   RESEND_API_KEY=re_...your-key...
   EMAIL_FROM=Aura with Rav <hello@aurawithrav.com>
   ```

### Option B — Google Workspace (paid, ~$6/month)
- Professional Gmail with your domain
- Best for long-term business email

---

## PHASE 6 — Post-Deploy Checklist ☐

After going live, verify each of these:

| Check | How to verify |
|---|---|
| Site loads at `https://aurawithrav.com` | Open in browser |
| Login works | Log in as superadmin |
| Analysis runs end-to-end | Submit a question, wait for report |
| PDF download works | Click download on a report |
| Admin review page works | Approve/reject an insight |
| Mobile works | Open on your phone |
| HTTPS padlock shows | Green lock in browser |
| API health check passes | `curl https://aurawithrav.com/api/health` |
| Email OTP delivers | Request OTP on profile page |
| Error pages show correctly | Go to a bad URL — should show Angular 404 |

---

## PHASE 7 — Monitoring & Backup (Ongoing)

### 7.1 Basic Uptime Monitoring (Free) ☐
Sign up at **uptimerobot.com** (free):
- Add monitor: `https://aurawithrav.com`
- Add monitor: `https://aurawithrav.com/api/health`
- Set email alerts when site goes down

### 7.2 Database Backup ☐
If using SQLite on the server, add a daily backup cron:
```bash
# On the server — run as ubuntu user
crontab -e
# Add this line:
0 2 * * * docker exec astrointel-api sqlite3 /data/astrointel.db ".backup /data/backup-$(date +\%Y\%m\%d).db"
```

If using PostgreSQL/Supabase — backups are automatic.

### 7.3 Log Monitoring ☐
View live logs:
```bash
# On server
docker logs -f astrointel-api
docker logs -f astrointel-frontend
```

---

## PHASE 8 — Go Live Announcement

Once everything above is ticked, you are live. Then:

1. Share `https://aurawithrav.com` with your first clients
2. Create your first tenant via the admin panel
3. Generate the first reading end-to-end with a real client question
4. Watch the metrics dashboard for usage

---

## Summary — Your Tick List

### Phase 1 — Hardening
- [ ] Generate strong `MASTER_API_KEY` and `JWT_SECRET` for production
- [ ] Create `.env.production` with all production values
- [ ] Confirm `.gitignore` excludes `.env*`
- [ ] Update Angular `environment.prod.ts` with production API URL
- [ ] Update `nginx.conf` to proxy `/api/` to backend

### Phase 2 — Server
- [ ] Choose server (AWS EC2 / DigitalOcean / Railway)
- [ ] Launch server with Ubuntu 22.04, open ports 80 + 443 + 22
- [ ] Install Docker + Docker Compose on server

### Phase 3 — Deploy
- [ ] Create `docker-compose.prod.yml` (full-stack)
- [ ] Sync project files to server (`rsync` or `deploy-ec2.sh`)
- [ ] Run `docker-compose up -d --build` on server
- [ ] Verify health check passes

### Phase 4 — HTTPS
- [ ] Point `aurawithrav.com` DNS A record to server IP
- [ ] Install Certbot + Let's Encrypt SSL certificate
- [ ] Verify `https://aurawithrav.com` loads with green padlock

### Phase 5 — Email
- [ ] Verify `aurawithrav.com` domain in Resend.com
- [ ] Update `EMAIL_FROM` to `hello@aurawithrav.com`

### Phase 6 — Post-Deploy Verification
- [ ] All 10 items in the post-deploy checklist pass

### Phase 7 — Monitoring
- [ ] UptimeRobot monitors set up
- [ ] Database backup cron running
- [ ] Can view Docker logs on server

---

**Estimated total time:** 1–2 focused days  
**Estimated monthly cost:** $15–30/month (server) + $0 (SSL, UptimeRobot, Resend free tier)

You are 90% there. The code is production-ready. This guide is the last 10%.

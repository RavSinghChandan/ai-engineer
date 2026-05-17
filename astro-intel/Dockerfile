# ── Stage 1: Build Angular app ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache — only re-runs when package.json changes)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build production bundle
COPY . .
RUN npx ng build --configuration production

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx site
RUN rm -rf /usr/share/nginx/html/*

# Copy Angular build output
COPY --from=builder /app/dist/astro-intel/browser /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]

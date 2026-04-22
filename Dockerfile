# ---------------------------------------------------------------------
# Optional: Docker-Build fuer Production.
# Nutzt zwei Stages:
#   1. "builder" baut die statischen Assets mit Node.
#   2. Finales Image serviert sie mit nginx:alpine (klein, schnell).
#
# Build:  docker build -t gridfinity-preview .
# Run:    docker run --rm -p 8080:80 \
#           -e VITE_SUPABASE_URL=... \
#           -e VITE_SUPABASE_ANON_KEY=... \
#           gridfinity-preview
# Hinweis: Vite backt die VITE_*-Variablen zur Build-Zeit ins Bundle.
# Deshalb werden sie im "builder"-Stage als Build-Args uebergeben, nicht
# zur Runtime. Siehe docker-compose.yml fuer ein Beispiel.
# ---------------------------------------------------------------------

FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------------------------------------------------------------------
FROM nginx:1.27-alpine AS runner

# Eine einfache SPA-Config: alle unbekannten Routen auf index.html
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

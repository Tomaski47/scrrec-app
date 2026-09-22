# Stage 1: Build the app
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund
COPY . /app
ARG BUILD_REVISION=unknown
ENV BUILD_REVISION=$BUILD_REVISION
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]

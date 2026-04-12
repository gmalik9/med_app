FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

# Build frontend - skip type checking for Docker build
ENV SKIP_TYPE_CHECK=true
# Don't set VITE_API_URL at build time - let it be determined at runtime by the browser
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm install --legacy-peer-deps --only=production

EXPOSE 5173

# Serve built files
CMD ["npx", "http-server", "dist", "-p", "5173"]

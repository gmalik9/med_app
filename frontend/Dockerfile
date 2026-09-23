FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace=frontend --include-workspace-root=false
COPY frontend ./frontend
COPY tools/prepare-vosk-model.py tools/prepare-vosk-runtime.mjs ./tools/
RUN apk add --no-cache python3 ca-certificates \
	&& python3 tools/prepare-vosk-model.py \
	&& node tools/prepare-vosk-runtime.mjs
RUN npm run build --workspace=frontend

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/
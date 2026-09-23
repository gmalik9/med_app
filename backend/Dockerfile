FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace=backend --include-workspace-root=false
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
RUN npm run build --workspace=backend

FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Install from the root lock before removing build-only package managers from the
# runtime filesystem. Keep application dependencies (including OCR/native assets).
# Runtime administration uses: node backend/dist/db/cli.js <command> <flags>.
RUN npm ci --omit=dev --workspace=backend --include-workspace-root=false \
	&& npm cache clean --force \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
		/opt/yarn-v* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
		/usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx \
		/root/.npm /root/.cache /home/node/.npm /home/node/.cache
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=6s CMD node -e "fetch('http://127.0.0.1:5000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]

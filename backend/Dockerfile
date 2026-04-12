FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY src ./src
COPY tsconfig.json .

# Build the TypeScript
RUN npx tsc || true

EXPOSE 5000

CMD ["node", "dist/index.js"]

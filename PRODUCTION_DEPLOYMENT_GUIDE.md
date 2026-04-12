# Production Deployment Guide

## Overview

This guide explains how to deploy the Medical Notes app to production with PostgreSQL, the Node backend, and the Vite-built frontend behind a reverse proxy.

## Recommended Architecture

- Reverse proxy: Nginx or Caddy
- Frontend: static files served by Nginx
- Backend: Node.js process managed by systemd, PM2, or Docker
- Database: PostgreSQL with automated backups
- TLS: Let's Encrypt certificates

## 1. Server Preparation

- Provision a Linux VM
- Install Node.js 18+
- Install PostgreSQL 14+
- Install nginx
- Configure a non-root deployment user

## 2. Environment Variables

Backend `.env`:

```env
PORT=5001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/med_app_db
JWT_SECRET=replace-with-strong-secret
JWT_REFRESH_SECRET=replace-with-another-strong-secret
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
SESSION_TIMEOUT_MINUTES=15
```

Frontend `.env`:

```env
VITE_API_URL=https://your-domain.com
```

## 3. Build and Run

Use the project helper script:

```bash
./app.sh clean
./app.sh build
./app.sh start
```

For Docker-based deployments:

```bash
./app.sh docker-build
./app.sh docker-start
```

## 4. Reverse Proxy

Route `/api` to the backend service and `/` to frontend static assets.

## 5. Security Checklist

- Enable HTTPS
- Restrict database access to private networking
- Rotate JWT secrets periodically
- Backup PostgreSQL daily
- Monitor logs and audit trail
- Configure firewall rules

## 6. Operations

- Health check: `/health`
- Build verification: `npm run build`
- Docker health: `./app.sh health`

## 7. Backup and Recovery

- Schedule `pg_dump` backups
- Encrypt backup files
- Test restoration regularly

## 8. Notes

- Browser Print / Save as PDF can be used for note export until a dedicated PDF pipeline is added.
- Review compliance requirements for HIPAA/GDPR before production use.
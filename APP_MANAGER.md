# 🚀 app.sh - Medical Notes App Manager

Simple command-line script to start, stop, and manage your complete Medical Notes Application running in Docker.

## Quick Start

```bash
# Start all services
./app.sh start

# Stop all services
./app.sh stop

# Check status
./app.sh status
```

## Available Commands

### Service Management
- `./app.sh start` - Start all services (PostgreSQL, Backend, Frontend)
- `./app.sh stop` - Stop all services
- `./app.sh restart` - Restart all services
- `./app.sh status` - Show status of all services
- `./app.sh health` - Check health and test all endpoints

### Logging
- `./app.sh logs` - View recent logs from all services
- `./app.sh logs-f` - Follow logs in real-time (Ctrl+C to exit)
- `./app.sh backend` - View backend logs only
- `./app.sh frontend` - View frontend logs only
- `./app.sh postgres` - View postgres logs only

### Maintenance
- `./app.sh build` - Rebuild all Docker images (after code changes)
- `./app.sh clean` - Stop services and remove all volumes/data

## Features

✅ **Color-coded output** - Green for success, red for errors
✅ **Health checking** - Validates endpoints are responding
✅ **Shows credentials** - Displays default login info after start
✅ **Error handling** - Clear error messages when something fails
✅ **Works anywhere** - Can be run from any directory
✅ **Simple interface** - Easy to remember commands

## Daily Workflow

```bash
# Morning: Start the app
./app.sh start

# Check everything is working
./app.sh health

# Work with the app...

# Night: Stop the app
./app.sh stop
```

## Troubleshooting

```bash
# Something not working? Check the status
./app.sh status

# View all logs to debug
./app.sh logs

# Check if endpoints are responding
./app.sh health

# Restart everything
./app.sh restart

# Look at just backend errors
./app.sh backend
```

## Creating an Alias (Optional)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias medapp='/path/to/med_app/app.sh'
```

Then you can use:
```bash
medapp start    # Much easier to type!
medapp stop
medapp status
```

## Location

The script is located at:
```
~/Documents/girik_academic_resources/personal_projects/med_app/app.sh
```

## What It Does

The script is a user-friendly wrapper around Docker Compose that:

1. **Starts services** - Brings up PostgreSQL, Backend API, and Frontend
2. **Monitors health** - Checks that all services are responding
3. **Shows information** - Displays URLs and default credentials
4. **Views logs** - Makes it easy to see what's happening
5. **Manages containers** - Start, stop, restart, clean up
6. **Validates endpoints** - Tests that services are working

## Related Documentation

- **README.md** - Project overview
- **SETUP.md** - Initial setup and configuration
- **DEPLOYMENT.md** - Docker deployment guide
- **API.md** - Complete API reference

---

**Happy coding! 🎉**

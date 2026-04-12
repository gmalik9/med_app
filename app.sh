#!/bin/bash

# Medical Notes App - Docker Compose Manager
# Usage: ./app.sh [start|stop|restart|status|logs]

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to display usage
usage() {
    cat << EOF
${BLUE}Medical Notes App - Docker Manager${NC}

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  start     - Start all services (PostgreSQL, Backend, Frontend)
  stop      - Stop all services
  restart   - Restart all services
  status    - Show status of all services
  logs      - View logs from all services (press Ctrl+C to exit)
  logs-f    - Follow logs in real-time from all services
  backend   - View backend logs only
  frontend  - View frontend logs only
  postgres  - View postgres logs only
  build     - Build all Docker images
  rebuild   - Clean, build, and start with dummy data (full fresh setup)
  clean     - Stop services and remove all volumes/data
  health    - Check health of all services

Options:
  dummy     - For 'start' or 'restart': seed database with dummy data (e.g., 'start dummy')

Examples:
  $0 start
  $0 start dummy
  $0 rebuild
  $0 restart dummy
  $0 stop
  $0 logs
  $0 restart

EOF
}

# Function to start services
start_services() {
    local seed_db="${1:-false}"
    
    print_info "Starting Medical Notes App..."
    cd "$SCRIPT_DIR"
    
    # Set SEED_DATABASE env var if dummy data requested
    if [ "$seed_db" = "true" ]; then
        export SEED_DATABASE=true
        print_info "Dummy data will be seeded on startup"
    else
        export SEED_DATABASE=false
    fi
    
    if docker-compose up -d; then
        print_status "All services started successfully!"
        print_info "Waiting for services to be ready..."
        sleep 3
        
        print_info "Service URLs:"
        echo "  Frontend:   http://localhost:5173"
        echo "  Backend:    http://localhost:5001"
        echo "  Database:   localhost:5432"
        
        print_info "Default credentials:"
        echo "  Email:      doctor@hospital.com"
        echo "  Password:   SecurePass123!"
        
        if [ "$seed_db" = "true" ]; then
            print_info "Seeding database with dummy data..."
            sleep 2
            curl -s -X POST http://localhost:5001/api/seed > /dev/null 2>&1 && print_status "Database seeded!" || print_warning "Dummy data seeding may have failed, check logs"
        fi
        
        return 0
    else
        print_error "Failed to start services"
        return 1
    fi
}

# Function to stop services
stop_services() {
    print_info "Stopping Medical Notes App..."
    cd "$SCRIPT_DIR"
    
    if docker-compose down; then
        print_status "All services stopped successfully!"
        return 0
    else
        print_error "Failed to stop services"
        return 1
    fi
}

# Function to restart services
restart_services() {
    local seed_db="${1:-false}"
    print_info "Restarting Medical Notes App..."
    stop_services
    sleep 2
    start_services "$seed_db"
}

# Function to show status
show_status() {
    print_info "Service Status:"
    cd "$SCRIPT_DIR"
    docker-compose ps
}

# Function to show logs
show_logs() {
    print_info "Displaying logs (press Ctrl+C to exit)..."
    cd "$SCRIPT_DIR"
    docker-compose logs
}

# Function to follow logs
follow_logs() {
    print_info "Following logs (press Ctrl+C to exit)..."
    cd "$SCRIPT_DIR"
    docker-compose logs -f
}

# Function to show backend logs
show_backend_logs() {
    print_info "Displaying backend logs (press Ctrl+C to exit)..."
    cd "$SCRIPT_DIR"
    docker-compose logs backend
}

# Function to show frontend logs
show_frontend_logs() {
    print_info "Displaying frontend logs (press Ctrl+C to exit)..."
    cd "$SCRIPT_DIR"
    docker-compose logs frontend
}

# Function to show postgres logs
show_postgres_logs() {
    print_info "Displaying postgres logs (press Ctrl+C to exit)..."
    cd "$SCRIPT_DIR"
    docker-compose logs postgres
}

# Function to build images
build_images() {
    print_info "Building Docker images..."
    cd "$SCRIPT_DIR"
    
    if docker-compose build --no-cache; then
        print_status "Docker images built successfully!"
        return 0
    else
        print_error "Failed to build Docker images"
        return 1
    fi
}

# Function to clean everything
clean_all() {
    print_warning "This will stop all services and remove all volumes/data!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Cancelled"
        return 0
    fi
    
    print_info "Cleaning up..."
    cd "$SCRIPT_DIR"
    
    if docker-compose down -v; then
        print_status "All services stopped and volumes removed!"
        return 0
    else
        print_error "Failed to clean up"
        return 1
    fi
}

# Function to check health
check_health() {
    print_info "Checking service health..."
    cd "$SCRIPT_DIR"
    
    # Check if containers are running
    show_status
    
    echo ""
    print_info "Testing endpoints..."
    
    # Test backend
    if curl -s http://localhost:5001/health > /dev/null 2>&1; then
        print_status "Backend API is responding"
    else
        print_error "Backend API is not responding"
    fi
    
    # Test frontend
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        print_status "Frontend is responding"
    else
        print_error "Frontend is not responding"
    fi
    
    # Test database
    if docker-compose exec -T postgres psql -U medapp -d med_app_db -c "SELECT 1;" > /dev/null 2>&1; then
        print_status "Database is responding"
    else
        print_error "Database is not responding"
    fi
}

# Function to rebuild (clean, build, and start with dummy data)
rebuild() {
    print_warning "This will perform a complete rebuild:"
    print_info "1. Stop all services"
    print_info "2. Remove all volumes and data"
    print_info "3. Build all images fresh"
    print_info "4. Start with dummy data"
    echo ""
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Cancelled"
        return 0
    fi
    
    print_info "Starting rebuild..."
    
    # Clean
    print_info "Stopping services and removing volumes..."
    cd "$SCRIPT_DIR"
    docker-compose down -v 2>/dev/null || true
    
    # Build
    print_info "Building Docker images..."
    if ! docker-compose build --no-cache; then
        print_error "Failed to build Docker images"
        return 1
    fi
    
    # Start with dummy data
    print_info "Starting services with dummy data..."
    export SEED_DATABASE=true
    if docker-compose up -d; then
        print_status "Rebuild completed successfully!"
        print_info "Waiting for services to be ready..."
        sleep 5
        
        print_info "Service URLs:"
        echo "  Frontend:   ${GREEN}http://localhost:5173${NC}"
        echo "  Backend:    ${GREEN}http://localhost:5001${NC}"
        echo "  Database:   ${GREEN}localhost:5432${NC}"
        
        print_info "Default credentials:"
        echo "  Email:      doctor@hospital.com"
        echo "  Password:   SecurePass123!"
        
        return 0
    else
        print_error "Failed to start services"
        return 1
    fi
}
case "${1:-}" in
    start)
        if [ "${2:-}" = "dummy" ]; then
            start_services "true"
        else
            start_services "false"
        fi
        ;;
    stop)
        stop_services
        ;;
    restart)
        if [ "${2:-}" = "dummy" ]; then
            restart_services "true"
        else
            restart_services "false"
        fi
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    logs-f)
        follow_logs
        ;;
    backend)
        show_backend_logs
        ;;
    frontend)
        show_frontend_logs
        ;;
    postgres)
        show_postgres_logs
        ;;
    build)
        build_images
        ;;
    rebuild)
        rebuild
        ;;
    clean)
        clean_all
        ;;
    health)
        check_health
        ;;
    "")
        print_error "No command provided"
        echo ""
        usage
        exit 1
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        usage
        exit 1
        ;;
esac

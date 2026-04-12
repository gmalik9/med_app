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

Usage: $0 [COMMAND]

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
  clean     - Stop services and remove all volumes/data
  health    - Check health of all services

Examples:
  $0 start
  $0 stop
  $0 logs
  $0 restart

EOF
}

# Function to start services
start_services() {
    print_info "Starting Medical Notes App..."
    cd "$SCRIPT_DIR"
    
    if docker-compose up -d; then
        print_status "All services started successfully!"
        print_info "Waiting for services to be ready..."
        sleep 3
        
        print_info "Service URLs:"
        echo "  Frontend:   ${GREEN} http://localhost:5173 ${NC}"
        echo "  Backend:    ${GREEN} http://localhost:5001 ${NC}"
        echo "  Database:   ${GREEN} http://localhost:5432 ${NC}"
        
        print_info "Default credentials:"
        echo "  Email:      doctor@hospital.com"
        echo "  Password:   SecurePass123!"
        
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
    print_info "Restarting Medical Notes App..."
    stop_services
    sleep 2
    start_services
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

# Main script logic
case "${1:-}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
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

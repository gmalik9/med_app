#!/bin/bash

# Medical Notes App - Render.com Deployment Helper
# This script helps prepare and deploy the app to Render.com

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
${BLUE}Medical Notes App - Render.com Deployment Helper${NC}

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  prepare       - Prepare code for deployment (git push)
  setup         - Generate secure environment variables
  validate      - Validate app builds for production
  help          - Show this help message

Options for 'prepare':
  --message     - Custom commit message (default: "Deploy to render")

Examples:
  $0 prepare
  $0 prepare --message "Add new features"
  $0 setup
  $0 validate

EOF
}

# Generate secure random strings for JWT secrets
generate_secrets() {
    print_info "Generating secure JWT secrets..."
    
    jwt_secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "")
    jwt_refresh=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "")
    
    if [ -z "$jwt_secret" ]; then
        # Fallback for systems without Node.js
        jwt_secret=$(openssl rand -hex 32 2>/dev/null || echo "your-secure-jwt-secret-here")
        jwt_refresh=$(openssl rand -hex 32 2>/dev/null || echo "your-secure-refresh-secret-here")
    fi
    
    print_status "JWT secrets generated"
    
    cat > /tmp/render_env_vars.txt << EOF
# Copy these environment variables to Render dashboard:
# Service → Settings → Environment Variables

PORT=5000
NODE_ENV=production
DATABASE_URL=<paste Internal Database URL from Render PostgreSQL>
JWT_SECRET=$jwt_secret
JWT_REFRESH_SECRET=$jwt_refresh
ALLOWED_ORIGINS=https://med-app-frontend.onrender.com
SESSION_TIMEOUT_MINUTES=30
SEED_DATABASE=false

# Frontend Environment Variables (if deploying separately):
VITE_API_URL=https://med-app-backend.onrender.com
EOF
    
    echo ""
    print_info "Environment variables saved to /tmp/render_env_vars.txt"
    cat /tmp/render_env_vars.txt
    echo ""
}

# Validate production build
validate_build() {
    print_info "Validating production builds..."
    
    cd "$(dirname "${BASH_SOURCE[0]}")"
    
    # Check backend
    print_info "Building backend..."
    if cd backend && npm run build > /dev/null 2>&1; then
        print_status "Backend build successful"
        cd ..
    else
        print_error "Backend build failed"
        cd ..
        return 1
    fi
    
    # Check frontend
    print_info "Building frontend..."
    if cd frontend && npm run build > /dev/null 2>&1; then
        print_status "Frontend build successful"
        cd ..
    else
        print_error "Frontend build failed"
        cd ..
        return 1
    fi
    
    print_status "All builds successful!"
    echo ""
}

# Prepare for deployment
prepare_deployment() {
    local commit_msg="${1:-Deploy to render}"
    
    cd "$(dirname "${BASH_SOURCE[0]}")"
    
    print_info "Preparing deployment..."
    
    # Check git is initialized
    if [ ! -d .git ]; then
        print_error "Not a git repository"
        return 1
    fi
    
    # Check for uncommitted changes
    if [ -n "$(git status --short)" ]; then
        print_info "Found uncommitted changes"
        git status --short
        echo ""
        
        read -p "Commit these changes? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add .
            git commit -m "$commit_msg"
            print_status "Changes committed"
        else
            print_warning "Deployment cancelled"
            return 0
        fi
    else
        print_status "No uncommitted changes"
    fi
    
    # Push to remote
    print_info "Pushing to GitHub..."
    if git push origin main 2>&1 | grep -q "up to date\|fast-forward"; then
        print_status "Code pushed to GitHub"
    else
        print_warning "Git push may have issues - check manually"
    fi
    
    echo ""
    print_info "Next steps:"
    echo "  1. Go to https://dashboard.render.com"
    echo "  2. If services exist, they will auto-deploy"
    echo "  3. If first time, follow RENDER_DEPLOYMENT.md guide"
    echo "  4. Monitor deployment in Render dashboard"
    echo ""
}

# Main script logic
case "${1:-}" in
    prepare)
        prepare_deployment "$2"
        ;;
    setup)
        generate_secrets
        ;;
    validate)
        validate_build
        ;;
    help)
        usage
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

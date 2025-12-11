#!/bin/bash
# aur-deploy.sh - Deploy lichen to AUR
# 
# Usage:
#   ./aur-deploy.sh          # Deploy current version
#   ./aur-deploy.sh 1.0.1    # Deploy specific version
#
# First-time setup:
#   1. Create an AUR account at https://aur.archlinux.org
#   2. Add your SSH public key to your AUR account
#   3. Clone the AUR repo:
#      git clone ssh://aur@aur.archlinux.org/lichen.git ~/aur-lichen
#   4. Run this script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUR_DIR="${AUR_DIR:-$HOME/aur-lichen}"
PKG_NAME="lichen-audio"
VERSION="${1:-}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              LICHEN AUR DEPLOYMENT                             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if AUR directory exists
if [[ ! -d "$AUR_DIR" ]]; then
    echo -e "${YELLOW}AUR repository not found at $AUR_DIR${NC}"
    echo ""
    echo "First-time setup required:"
    echo ""
    echo "  1. Create an AUR account at https://aur.archlinux.org"
    echo "  2. Add your SSH public key to your AUR account settings"
    echo "  3. Clone the AUR repo (create it if it doesn't exist):"
    echo ""
    echo -e "     ${GREEN}git clone ssh://aur@aur.archlinux.org/lichen-audio.git $AUR_DIR${NC}"
    echo ""
    echo "  If the package doesn't exist yet, create an empty repo:"
    echo ""
    echo -e "     ${GREEN}mkdir -p $AUR_DIR && cd $AUR_DIR${NC}"
    echo -e "     ${GREEN}git init${NC}"
    echo -e "     ${GREEN}git remote add origin ssh://aur@aur.archlinux.org/lichen-audio.git${NC}"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Determine version
if [[ -z "$VERSION" ]]; then
    # Extract version from PKGBUILD
    VERSION=$(grep "^pkgver=" "$SCRIPT_DIR/PKGBUILD" | cut -d'=' -f2)
    echo -e "Using version from PKGBUILD: ${GREEN}$VERSION${NC}"
else
    echo -e "Using specified version: ${GREEN}$VERSION${NC}"
fi

echo ""

# Step 1: Update version in PKGBUILD
echo -e "${BLUE}→ Updating PKGBUILD version to $VERSION...${NC}"
sed -i "s/^pkgver=.*/pkgver=$VERSION/" "$SCRIPT_DIR/PKGBUILD"
sed -i "s/^pkgrel=.*/pkgrel=1/" "$SCRIPT_DIR/PKGBUILD"
echo -e "${GREEN}✓ PKGBUILD updated${NC}"

# Step 2: Create git tag and push to GitHub
echo ""
echo -e "${BLUE}→ Creating git tag v$VERSION...${NC}"
cd "$SCRIPT_DIR"

# Check if tag exists
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}  Tag v$VERSION already exists${NC}"
    read -p "  Delete and recreate? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "v$VERSION"
        git push origin :refs/tags/"v$VERSION" 2>/dev/null || true
    else
        echo -e "${YELLOW}  Using existing tag${NC}"
    fi
fi

# Create tag
git add PKGBUILD LICENSE 2>/dev/null || true
git commit -m "Release v$VERSION" 2>/dev/null || echo "  (no changes to commit)"
git tag -a "v$VERSION" -m "Release v$VERSION" 2>/dev/null || true
echo -e "${GREEN}✓ Tag created${NC}"

# Push to GitHub
echo ""
echo -e "${BLUE}→ Pushing to GitHub...${NC}"
git push origin main --tags
echo -e "${GREEN}✓ Pushed to GitHub${NC}"

# Step 3: Update checksums in PKGBUILD
echo ""
echo -e "${BLUE}→ Calculating source tarball checksum...${NC}"

# Download tarball to calculate checksum
TARBALL_URL="https://github.com/maxberggren/lichen/archive/v$VERSION.tar.gz"
TEMP_FILE=$(mktemp)
if curl -sL "$TARBALL_URL" -o "$TEMP_FILE"; then
    SHA256=$(sha256sum "$TEMP_FILE" | cut -d' ' -f1)
    rm -f "$TEMP_FILE"
    
    # Update PKGBUILD with correct checksum
    sed -i "s/sha256sums=.*/sha256sums=('$SHA256')/" "$SCRIPT_DIR/PKGBUILD"
    echo -e "${GREEN}✓ Checksum: $SHA256${NC}"
else
    echo -e "${YELLOW}⚠ Could not download tarball (GitHub may need a moment to process the tag)${NC}"
    echo "  You may need to run this script again in a minute, or update sha256sums manually."
    rm -f "$TEMP_FILE"
fi

# Step 4: Generate .SRCINFO
echo ""
echo -e "${BLUE}→ Generating .SRCINFO...${NC}"
cd "$SCRIPT_DIR"
makepkg --printsrcinfo > .SRCINFO
echo -e "${GREEN}✓ .SRCINFO generated${NC}"

# Step 5: Copy files to AUR repo
echo ""
echo -e "${BLUE}→ Copying files to AUR repository...${NC}"
cp "$SCRIPT_DIR/PKGBUILD" "$AUR_DIR/"
cp "$SCRIPT_DIR/.SRCINFO" "$AUR_DIR/"
echo -e "${GREEN}✓ Files copied to $AUR_DIR${NC}"

# Step 6: Commit and push to AUR
echo ""
echo -e "${BLUE}→ Pushing to AUR...${NC}"
cd "$AUR_DIR"
git add PKGBUILD .SRCINFO
git commit -m "Update to version $VERSION"
git push origin master

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    DEPLOYMENT COMPLETE!                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Package ${GREEN}lichen $VERSION${NC} is now available on AUR!"
echo ""
echo "Users can install it with:"
echo -e "  ${BLUE}yay -S lichen-audio${NC}"
echo "  or"
echo -e "  ${BLUE}paru -S lichen-audio${NC}"
echo ""


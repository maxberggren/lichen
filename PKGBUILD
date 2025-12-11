# Maintainer: Max Berggren <max@maxberggren.se>
pkgname=lichen
pkgver=1.0.0
pkgrel=1
pkgdesc="Multi-headphone audio router for Linux - route audio to multiple headphones and mix microphones"
arch=('any')
url="https://github.com/maxberggren/lichen"
license=('MIT')
depends=('gtk4' 'libadwaita' 'gjs' 'libpulse' 'alsa-utils')
optdepends=(
    'pipewire-pulse: PipeWire PulseAudio compatibility (recommended)'
    'pulseaudio: Traditional PulseAudio audio server'
)
source=("$pkgname-$pkgver.tar.gz::https://github.com/maxberggren/$pkgname/archive/v$pkgver.tar.gz")
sha256sums=('SKIP')

package() {
    cd "$srcdir/$pkgname-$pkgver"

    # Install main application files
    install -dm755 "$pkgdir/usr/share/$pkgname"
    install -Dm755 lichen.js "$pkgdir/usr/share/$pkgname/lichen.js"

    # Install module directories
    cp -r app "$pkgdir/usr/share/$pkgname/"
    cp -r audio "$pkgdir/usr/share/$pkgname/"
    cp -r ui "$pkgdir/usr/share/$pkgname/"

    # Install desktop entry
    install -Dm644 lichen.desktop "$pkgdir/usr/share/applications/lichen.desktop"

    # Install launcher script
    install -dm755 "$pkgdir/usr/bin"
    cat > "$pkgdir/usr/bin/lichen" << 'EOF'
#!/bin/bash
exec gjs /usr/share/lichen/lichen.js "$@"
EOF
    chmod 755 "$pkgdir/usr/bin/lichen"

    # Install documentation
    install -Dm644 README.md "$pkgdir/usr/share/doc/$pkgname/README.md"

    # Install license
    install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}


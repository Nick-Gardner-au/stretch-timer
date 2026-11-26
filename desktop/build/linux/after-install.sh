#!/bin/bash
# Runs after the .deb is installed. Same as electron-builder's default, plus an AppArmor profile:
# Ubuntu 23.10 and later block the user namespaces Electron's sandbox needs unless the app has one.

APP='/opt/Training/training-desktop'
PROFILE='/etc/apparmor.d/training-desktop'

if type update-alternatives 2>/dev/null >&1; then
    if [ -L '/usr/bin/training-desktop' -a -e '/usr/bin/training-desktop' -a "`readlink '/usr/bin/training-desktop'`" != '/etc/alternatives/training-desktop' ]; then
        rm -f '/usr/bin/training-desktop'
    fi
    update-alternatives --install '/usr/bin/training-desktop' 'training-desktop' "$APP" 100 || ln -sf "$APP" '/usr/bin/training-desktop'
else
    ln -sf "$APP" '/usr/bin/training-desktop'
fi

if [ -d /etc/apparmor.d ] && [ -e /etc/apparmor.d/abi/4.0 ]; then
    cat > "$PROFILE" <<PROFILE_END
# Lets the Training desktop app create the user namespaces its sandbox needs.
abi <abi/4.0>,
include <tunables/global>

profile training-desktop $APP flags=(unconfined) {
  userns,

  include if exists <local/training-desktop>
}
PROFILE_END
    if hash apparmor_parser 2>/dev/null; then
        apparmor_parser -r "$PROFILE" || true
    fi
    chmod 0755 '/opt/Training/chrome-sandbox' || true
elif ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # No user namespaces: use the SUID sandbox helper instead.
    chmod 4755 '/opt/Training/chrome-sandbox' || true
else
    chmod 0755 '/opt/Training/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

#!/bin/bash
# Runs after the .deb is removed: removes the command link and the AppArmor profile.

if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'training-desktop' '/usr/bin/training-desktop' || true
else
    rm -f '/usr/bin/training-desktop'
fi

PROFILE='/etc/apparmor.d/training-desktop'
if [ -f "$PROFILE" ]; then
    if hash apparmor_parser 2>/dev/null; then
        apparmor_parser -R "$PROFILE" 2>/dev/null || true
    fi
    rm -f "$PROFILE"
fi

#!/bin/sh
# Refresh the system font cache for the bundled LXGW Marker Gothic font.
fc-cache -f >/dev/null 2>&1 || true
exit 0

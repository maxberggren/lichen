#!/bin/bash
# lichen-watch.sh - Monitor Lichen logs from your local machine
ssh -t max@lichen.local "journalctl --user -u lichen-headless -f"

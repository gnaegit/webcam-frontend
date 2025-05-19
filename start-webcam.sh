#!/bin/bash
export NVM_DIR="/home/pi/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # Load nvm
cd /home/pi/webcam/webcam-frontend
npm run dev

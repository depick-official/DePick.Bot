#!/bin/bash

# Build the bot frontend
echo "Building DePick.Bot..."
npm run build

# Remove old bot files (keep assets folder intact)
echo "Removing old bot files..."
rm -f ../DePick.BE/public/index.html
rm -f ../DePick.BE/public/assets/index-*.*

# Copy built files to backend
echo "Copying to backend..."
cp -r dist/* ../DePick.BE/public/

echo "✅ Bot deployed to DePick.BE/public"
echo "Assets folder preserved in backend"
echo "Access at: http://localhost:3001/bot/"

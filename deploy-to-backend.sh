#!/bin/bash

# Build the bot frontend
echo "Building DePick.Bot..."
npm run build

# Remove old bot files (keep assets folder intact)
echo "Removing old bot files..."
TARGET="${TARGET:-DePick.BE}"
rm -f ../${TARGET}/public/index.html
rm -f ../${TARGET}/public/assets/index-*.*

# Copy built files to backend
echo "Copying to backend..."
echo "deploying to ../${TARGET}"
cp -r dist/* ../${TARGET}/public/

echo "✅ Bot deployed to ../${TARGET}/public"
echo "Assets folder preserved in backend"
echo "Access at: http://localhost:3001/bot/"

#!/bin/bash

# Pre-push hook: Build before pushing
# This ensures code compiles before being pushed

echo "🔨 Building project before push..."

npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting push."
    exit 1
fi

echo "✅ Build successful, proceeding with push..."


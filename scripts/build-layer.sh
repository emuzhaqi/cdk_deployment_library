#!/bin/bash

# Build Python Lambda Layer
# This script creates a Lambda layer with Python dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LAYER_DIR="$PROJECT_ROOT/layers/python-dependencies"
BUILD_DIR="$LAYER_DIR/build"

echo "Building Python Lambda Layer..."

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$BUILD_DIR"
fi

# Create layer structure
# Lambda layers for Python need the structure: python/lib/pythonX.X/site-packages/
mkdir -p "$BUILD_DIR/python"

echo "Installing dependencies..."
cd "$LAYER_DIR"

# Detect pip command (pip3 on macOS, pip elsewhere)
PIP_CMD="pip3"
if ! command -v pip3 &> /dev/null; then
    PIP_CMD="pip"
fi

# Install dependencies into the layer directory
# Using --platform and --only-binary ensures compatibility with Lambda's Linux environment
$PIP_CMD install \
    --platform manylinux2014_aarch64 \
    --target="$BUILD_DIR/python" \
    --implementation cp \
    --python-version 3.13 \
    --only-binary=:all: \
    --upgrade \
    -r requirements.txt

echo ""
echo "Layer built successfully at: $BUILD_DIR"
echo ""
echo "Layer size:"
du -sh "$BUILD_DIR"
echo ""
echo "To deploy, run: cd cdk && cdk deploy"


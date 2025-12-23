#!/bin/bash
# Build script for WASM resize module

set -e

echo "Building WASM resize module..."

# Check if rustc is installed
if ! command -v rustc &> /dev/null; then
    echo "Error: rustc is not installed. Please install Rust first:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# Install wasm32 target if not already installed
rustup target add wasm32-unknown-unknown

# Build in release mode
cargo build --release --target wasm32-unknown-unknown

# Copy to current directory (src)
cp target/wasm32-unknown-unknown/release/wasm_resize.wasm ../resize.wasm

echo "Build complete! WASM file copied to src/resize.wasm"


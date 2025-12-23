# WASM Resize Module

High-performance image resizing module compiled to WebAssembly.

## Building

### For End Users

**No build required!** A pre-compiled WASM file is already included. Just use the extension.

### For Developers

**Zero dependencies to download!** Verified with `cargo tree` - shows only the project itself:

- ✅ **No external crates** - Empty `[dependencies]` section in `Cargo.toml`
- ✅ **No `cargo fetch` needed** - Nothing to download during build
- ✅ **Verified zero dependencies** - Run `cargo tree` to confirm: only shows `wasm-resize v0.1.0`
- ✅ **Just install Rust** - That's all you need (Rust toolchain itself is required, but that's not a project dependency)

**Prerequisites:**
- Install Rust: https://rustup.rs/
- Install wasm32 target: `rustup target add wasm32-unknown-unknown`

**Note for Chinese users**: The project includes mirror configuration in `.cargo/config.toml` for faster Rust toolchain downloads (only needed during Rust installation, not during build).

### Build Steps

**Linux/macOS:**
```bash
cd src/wasm-resize
chmod +x build.sh
./build.sh
```

**Windows:**
```cmd
cd src\wasm-resize
build.bat
```

**Manual build:**
```bash
# Navigate to wasm-resize directory
cd src/wasm-resize

# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Build
cargo build --release --target wasm32-unknown-unknown

# Copy to src directory
cp target/wasm32-unknown-unknown/release/wasm_resize.wasm ../resize.wasm
```

## Exports

- `resize_rgba(src_ptr, src_w, src_h, dst_ptr, dst_w, dst_h)`: Resize RGBA image data using bilinear interpolation
- `memory`: WebAssembly memory instance

## Usage

The WASM module is automatically loaded by `ImageProcessor` when processing large images (>20MP).

**Note**: A pre-compiled WASM file (`resize.wasm`) is already included in the `src` directory. End users don't need to compile anything - the extension works out of the box. You only need to rebuild if you're modifying the Rust source code.

## Security & Transparency

**This WASM module is 100% open source and contains NO backdoors.**

- ✅ All source code is available in `src/lib.rs` for full auditability
- ✅ **Zero external dependencies** - uses only Rust standard library (no third-party crates)
- ✅ No network requests, no file system access, no data collection
- ✅ The compiled WASM file is generated directly from the open-source Rust code
- 📄 See `SECURITY.md` for complete security statement, dependency list, and verification instructions

### What is `wasm32-unknown-unknown`?

`wasm32-unknown-unknown` is Rust's target triple for compiling to WebAssembly:
- **`wasm32`**: 32-bit WebAssembly architecture
- **`unknown`** (first): Unknown OS (WASM runs in a VM, not a real OS)
- **`unknown`** (second): Unknown environment (WASM has its own ABI)

This produces pure WebAssembly binaries that run in any WASM runtime (browsers, Node.js, etc.) without platform-specific code.


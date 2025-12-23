# Building WASM Module

## For End Users

**You don't need to build anything!** A pre-compiled WASM file (`resize.wasm`) is already included in the `src` directory. The extension works out of the box - just load it in your browser.

## For Developers (Rebuilding from Source)

If you want to modify the Rust source code and rebuild, you'll need:

1. **Rust toolchain** (rustc, cargo) - Install from https://rustup.rs/
2. **wasm32 target** - Install with: `rustup target add wasm32-unknown-unknown`

**That's it!** No project dependencies to download because:
- ✅ **Zero external dependencies** - Verified: `cargo tree` shows only `wasm-resize v0.1.0` with no dependencies
- ✅ **No third-party crates** - Empty `[dependencies]` section in `Cargo.toml`
- ✅ **No `cargo fetch` needed** - Nothing to download during build
- ✅ **No network requests during build** - Build process uses only Rust stdlib (already installed with Rust)

**Note**: Installing Rust itself requires downloading the Rust toolchain (rustc, cargo, stdlib), and adding the wasm32 target downloads the wasm32 stdlib. These are part of Rust installation/setup, not project dependencies. Once Rust is installed, building this project requires zero additional downloads.

After installing Rust, the build process is:
1. Install wasm32 target (one-time): `rustup target add wasm32-unknown-unknown`
2. Build: `cargo build --release --target wasm32-unknown-unknown`
3. Copy: `cp target/wasm32-unknown-unknown/release/wasm_resize.wasm ../resize.wasm`

No `cargo fetch`, no dependency resolution, no waiting for crates to download!

### What is `wasm32-unknown-unknown`?

`wasm32-unknown-unknown` is Rust's target triple for compiling to WebAssembly:

- **`wasm32`**: 32-bit WebAssembly architecture (the standard WASM format)
- **`unknown`** (first): Unknown operating system (WASM runs in a virtual machine, not a real OS)
- **`unknown`** (second): Unknown environment/ABI (WASM has its own ABI, not tied to any specific platform)

This target produces pure WebAssembly binaries that can run in any WASM runtime (browsers, Node.js, WASI, etc.) without platform-specific code. It's the standard way to compile Rust to WebAssembly.

### Configure Chinese Mirror (Optional but Recommended)

If you're in China, the project already includes mirror configuration in `.cargo/config.toml` using ByteDance's rsproxy mirror for faster downloads.

If you want to configure a global mirror (affects all Rust projects), create or edit `~/.cargo/config.toml` (Linux/macOS) or `%USERPROFILE%\.cargo\config.toml` (Windows):

**Option 1: ByteDance rsproxy (Recommended)**
```toml
[source.crates-io]
replace-with = "rsproxy"

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

**Option 2: Tsinghua University Mirror**
```toml
[source.crates-io]
replace-with = "tuna"

[source.tuna]
registry = "https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index.git"
```

## Build Steps

### Windows
```cmd
cd src\wasm-resize
build.bat
```

### Linux/macOS
```bash
cd src/wasm-resize
chmod +x build.sh
./build.sh
```

### Manual Build
```bash
cd src/wasm-resize
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/wasm_resize.wasm ../resize.wasm
```

## Verification

After building, the `src/resize.wasm` file should exist. The extension will automatically load this file for large image processing (>20MP).

**Note**: A pre-compiled WASM file is already included in the repository at `src/resize.wasm`. You only need to rebuild if you modify the Rust source code.

## Notes

- WASM file will be automatically loaded when the extension initializes
- If the WASM file doesn't exist, the system will automatically fall back to Canvas API
- WASM acceleration is only used when processing images larger than 20MP
- A pre-compiled WASM file is included - no compilation required for end users


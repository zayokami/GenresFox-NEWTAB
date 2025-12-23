# Security & Transparency Statement

## Open Source & Auditable

This WASM module is **100% open source** and **fully auditable**. All source code is available in this repository for complete transparency.

### Source Code Location

- **Rust Source Code**: `src/wasm-resize/src/lib.rs`
- **Build Configuration**: `src/wasm-resize/Cargo.toml`
- **Compiled WASM**: `src/resize.wasm` (pre-compiled for convenience)

### No Backdoors, No Hidden Code

**We declare that the compiled WASM file (`resize.wasm`) contains NO backdoors, NO hidden functionality, and NO malicious code.**

The compiled WASM binary is generated directly from the open-source Rust code in this repository. You can:

1. **Review the source code** in `src/wasm-resize/src/lib.rs`
2. **Compile it yourself** using the instructions in `BUILD.md`
3. **Compare the functionality** - the compiled WASM only performs image resizing operations as documented

### Verification

To verify the compiled WASM matches the source code:

1. Review `src/wasm-resize/src/lib.rs` - this is the ONLY source code
2. Compile it yourself: `cd src/wasm-resize && cargo build --release --target wasm32-unknown-unknown`
3. Compare the compiled output with `src/resize.wasm` (they should be functionally identical)

### Dependencies

This project uses **ZERO external dependencies**. Verified with `cargo tree` and `cargo metadata`:

```bash
$ cargo tree
wasm-resize v0.1.0
# No dependencies listed - truly zero!

$ cargo metadata | grep dependencies
"dependencies":[]  # Empty array
```

The `Cargo.toml` has an empty `[dependencies]` section:

```toml
[dependencies]
# Empty - no external dependencies
```

**What this means:**

- ✅ **No third-party crates** - zero external Rust packages (verified)
- ✅ **No `cargo fetch` needed** - nothing to download during build
- ✅ **No network requests during build** - no HTTP/HTTPS dependencies
- ✅ **No external libraries** - no FFI bindings or C libraries
- ✅ **Only Rust standard library** (`std`) - uses only built-in Rust functionality

**Important clarification:**

- **Project dependencies**: ZERO (no third-party crates)
- **Rust toolchain**: Required to compile (rustc, cargo, stdlib) - this is part of Rust installation, not a project dependency
- **wasm32 target**: Required to compile to WASM - downloads Rust stdlib for wasm32, but this is part of Rust toolchain setup, not a project dependency

**For developers**: After installing Rust and adding the wasm32 target (one-time setup), you can build immediately without downloading any project dependencies. The build process only uses the Rust standard library that comes with the Rust installation.

**Verification**: Run `cargo tree` in the `src/wasm-resize` directory - it will show only `wasm-resize v0.1.0` with no dependencies listed.

#### Rust Standard Library Components Used

The code only uses these standard library modules:

- `std::alloc::{alloc, dealloc, Layout}` - Memory allocation
- `std::slice` - Array slicing operations
- `std::ptr` - Pointer operations (for WASM memory access)

No other standard library features are used.

### What the WASM Module Does

The WASM module **ONLY** performs image resizing operations:

- `resize_rgba()`: Bilinear interpolation image resizing
- `resize_rgba_nearest()`: Nearest neighbor image resizing (for large downscaling)
- `alloc_memory()` / `dealloc_memory()`: Memory management utilities
- `get_last_error()`: Error reporting (currently returns null)

**It does NOT:**
- ❌ Make network requests
- ❌ Access the file system
- ❌ Read or write to external storage
- ❌ Execute arbitrary code
- ❌ Collect or transmit any data
- ❌ Access browser APIs beyond WebAssembly memory

### Build Process

The WASM file is compiled using:

- **Rust Compiler**: Official rustc from rustup.rs
- **Target**: `wasm32-unknown-unknown` (standard WebAssembly target)
- **Optimization**: Release mode with size optimization (`opt-level = "z"`)
- **LTO**: Link-time optimization enabled for smaller binary size

### License

This code is licensed under the same MIT License as the main GenresFox project.

---

**Last Updated**: 2025-12-23


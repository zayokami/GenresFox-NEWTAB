@echo off
REM Build script for WASM resize module (Windows)

echo Building WASM resize module...

REM Check if rustc is installed
where rustc >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: rustc is not installed. Please install Rust first:
    echo   Visit https://rustup.rs/
    exit /b 1
)

REM Install wasm32 target if not already installed
rustup target add wasm32-unknown-unknown

REM Build in release mode
cargo build --release --target wasm32-unknown-unknown

REM Copy to parent directory (src)
copy /Y target\wasm32-unknown-unknown\release\wasm_resize.wasm ..\resize.wasm

echo Build complete! WASM file copied to src\resize.wasm


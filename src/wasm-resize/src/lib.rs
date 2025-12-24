//! WASM module for high-performance image resizing
//! Exports resize_rgba function for RGBA image data with error handling and performance optimizations

use std::alloc::{alloc, dealloc, Layout};
use std::cell::{Cell, RefCell};

// Error codes returned by resize functions
// 0 = success, non-zero = error
pub const RESIZE_OK: i32 = 0;
pub const RESIZE_ERR_NULL_PTR: i32 = 1;
pub const RESIZE_ERR_INVALID_SIZE: i32 = 2;
pub const RESIZE_ERR_OVERFLOW: i32 = 3;
pub const RESIZE_ERR_MEMORY: i32 = 4;

// Thread-local storage for last error code (wasm32 is effectively single-threaded,
// but this keeps the API future-proof and explicit)
thread_local! {
    static LAST_ERROR_CODE: Cell<i32> = Cell::new(RESIZE_OK);
}

// Thread-local reusable buffers for LUT computation
// These buffers are reused across resize calls to avoid repeated heap allocations
thread_local! {
    static X_INDICES_NEAREST: RefCell<Vec<usize>> = RefCell::new(Vec::new());
    static X0_INDICES_BILINEAR: RefCell<Vec<usize>> = RefCell::new(Vec::new());
    static X1_INDICES_BILINEAR: RefCell<Vec<usize>> = RefCell::new(Vec::new());
    static FX_VALUES_BILINEAR: RefCell<Vec<f32>> = RefCell::new(Vec::new());
}

#[inline(always)]
fn set_last_error(code: i32) {
    LAST_ERROR_CODE.with(|c| c.set(code));
}

/// Allocate memory (exported for JavaScript to allocate buffers)
/// Returns null pointer on failure
#[no_mangle]
pub extern "C" fn alloc_memory(size: usize) -> *mut u8 {
    if size == 0 {
        set_last_error(RESIZE_ERR_INVALID_SIZE);
        return std::ptr::null_mut();
    }
    
    unsafe {
        let layout = match Layout::from_size_align(size, 1) {
            Ok(l) => l,
            Err(_) => {
                set_last_error(RESIZE_ERR_MEMORY);
                return std::ptr::null_mut();
            }
        };
        
        let ptr = alloc(layout);
        if ptr.is_null() {
            set_last_error(RESIZE_ERR_MEMORY);
            return std::ptr::null_mut();
        }
        
        // Zero-initialize memory for safety
        std::ptr::write_bytes(ptr, 0, size);
        ptr
    }
}

/// Allocate memory without zero-initialization (for performance-critical buffers)
/// Returns null pointer on failure
/// 
/// # Safety
/// The caller must ensure that the allocated memory is fully written before reading,
/// as the contents are uninitialized and may contain arbitrary data.
#[no_mangle]
pub extern "C" fn alloc_memory_uninitialized(size: usize) -> *mut u8 {
    if size == 0 {
        set_last_error(RESIZE_ERR_INVALID_SIZE);
        return std::ptr::null_mut();
    }
    
    unsafe {
        let layout = match Layout::from_size_align(size, 1) {
            Ok(l) => l,
            Err(_) => {
                set_last_error(RESIZE_ERR_MEMORY);
                return std::ptr::null_mut();
            }
        };
        
        let ptr = alloc(layout);
        if ptr.is_null() {
            set_last_error(RESIZE_ERR_MEMORY);
            return std::ptr::null_mut();
        }
        
        // Memory is not zero-initialized for performance
        // Caller must ensure all bytes are written before reading
        ptr
    }
}

/// Deallocate memory
/// Safe to call with null pointer
#[no_mangle]
pub unsafe extern "C" fn dealloc_memory(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    
    let layout = match Layout::from_size_align(size, 1) {
        Ok(l) => l,
        Err(_) => return,
    };
    
    dealloc(ptr, layout);
}

/// Get last error message (for debugging)
/// Returns a pointer to a static string, or null
#[no_mangle]
pub extern "C" fn get_last_error() -> *const u8 {
    // Static null-terminated error messages for WASM consumers
    static OK_MSG: &[u8] = b"OK\0";
    static ERR_NULL_PTR_MSG: &[u8] = b"NULL pointer\0";
    static ERR_INVALID_SIZE_MSG: &[u8] = b"Invalid size or dimensions\0";
    static ERR_OVERFLOW_MSG: &[u8] = b"Overflow in size calculation\0";
    static ERR_MEMORY_MSG: &[u8] = b"Memory error\0";
    static ERR_UNKNOWN_MSG: &[u8] = b"Unknown error\0";

    let code = LAST_ERROR_CODE.with(|c| c.get());
    match code {
        RESIZE_OK => OK_MSG.as_ptr(),
        RESIZE_ERR_NULL_PTR => ERR_NULL_PTR_MSG.as_ptr(),
        RESIZE_ERR_INVALID_SIZE => ERR_INVALID_SIZE_MSG.as_ptr(),
        RESIZE_ERR_OVERFLOW => ERR_OVERFLOW_MSG.as_ptr(),
        RESIZE_ERR_MEMORY => ERR_MEMORY_MSG.as_ptr(),
        _ => ERR_UNKNOWN_MSG.as_ptr(),
    }
}

/// Validate resize parameters and compute safe buffer sizes
#[inline(always)]
fn validate_params(
    src_ptr: *const u8,
    src_w: u32,
    src_h: u32,
    dst_ptr: *mut u8,
    dst_w: u32,
    dst_h: u32,
) -> Result<(usize, usize), i32> {
    // Check null pointers
    if src_ptr.is_null() || dst_ptr.is_null() {
        set_last_error(RESIZE_ERR_NULL_PTR);
        return Err(RESIZE_ERR_NULL_PTR);
    }
    
    // Check dimensions
    if src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 {
        set_last_error(RESIZE_ERR_INVALID_SIZE);
        return Err(RESIZE_ERR_INVALID_SIZE);
    }
    
    // Check for overflow in size calculations
    let src_size_u64 = match (src_w as u64)
        .checked_mul(src_h as u64)
        .and_then(|x| x.checked_mul(4))
    {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_OVERFLOW);
            return Err(RESIZE_ERR_OVERFLOW);
        }
    };
    
    let dst_size_u64 = match (dst_w as u64)
        .checked_mul(dst_h as u64)
        .and_then(|x| x.checked_mul(4))
    {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_OVERFLOW);
            return Err(RESIZE_ERR_OVERFLOW);
        }
    };
    
    // Check reasonable limits (prevent excessive memory allocation)
    // MAX_DIMENSION: 65535 is the maximum value for u16, chosen to:
    // - Prevent excessive memory allocation (65535^2 * 4 bytes = ~17GB for a single image)
    // - Stay within WASM memory constraints (WASM linear memory is limited, typically 2-4GB)
    // - Provide a reasonable upper bound for practical image processing scenarios
    // - Avoid potential integer overflow issues in intermediate calculations
    const MAX_DIMENSION: u32 = 65535;
    
    // MAX_PIXELS: 268,435,456 pixels = 256 megapixels (256MP)
    // This limit ensures:
    // - Reasonable memory usage (256MP * 4 bytes = 1GB for RGBA)
    // - Prevents processing of unreasonably large images that would cause performance issues
    // - Aligns with common high-resolution camera formats (e.g., 16K at 16:9 ≈ 132MP)
    const MAX_PIXELS: u64 = 268_435_456;
    
    if src_w > MAX_DIMENSION
        || src_h > MAX_DIMENSION
        || dst_w > MAX_DIMENSION
        || dst_h > MAX_DIMENSION
    {
        set_last_error(RESIZE_ERR_INVALID_SIZE);
        return Err(RESIZE_ERR_INVALID_SIZE);
    }
    
    let src_pixels = (src_w as u64) * (src_h as u64);
    let dst_pixels = (dst_w as u64) * (dst_h as u64);
    
    if src_pixels > MAX_PIXELS || dst_pixels > MAX_PIXELS {
        set_last_error(RESIZE_ERR_INVALID_SIZE);
        return Err(RESIZE_ERR_INVALID_SIZE);
    }
    
    // We've validated everything; now it's safe to downcast to usize on wasm32
    let src_size = src_size_u64 as usize;
    let dst_size = dst_size_u64 as usize;

    set_last_error(RESIZE_OK);
    Ok((src_size, dst_size))
}

/// Check if the resize operation uses integer scaling ratios
/// Returns (is_integer_x, is_integer_y) where true means the scale factor is an integer
/// 
/// Integer scaling can potentially use fixed-point arithmetic for better performance,
/// though this optimization is not yet implemented.
/// 
/// This function is reserved for future fixed-point arithmetic optimization.
#[allow(dead_code)]
#[inline(always)]
fn is_integer_scaling(src_w: u32, src_h: u32, dst_w: u32, dst_h: u32) -> (bool, bool) {
    let scale_x = src_w as f32 / dst_w as f32;
    let scale_y = src_h as f32 / dst_h as f32;
    
    // Check if scale factors are close to integers (within floating point precision)
    let is_integer_x = (scale_x - scale_x.round()).abs() < 1e-5 && scale_x >= 1.0;
    let is_integer_y = (scale_y - scale_y.round()).abs() < 1e-5 && scale_y >= 1.0;
    
    (is_integer_x, is_integer_y)
}

/// Determine the optimal resize algorithm based on scale factor and image dimensions
/// Returns true if nearest neighbor should be used, false for bilinear interpolation
/// 
/// The threshold is dynamically adjusted based on image size:
/// - For small images (< 1MP): Use bilinear for better quality (threshold = 8.0)
/// - For medium images (1-10MP): Balanced approach (threshold = 4.0)
/// - For large images (> 10MP): Prefer nearest neighbor for performance (threshold = 2.0)
#[inline(always)]
fn should_use_nearest_neighbor(src_w: u32, src_h: u32, dst_w: u32, dst_h: u32) -> bool {
    let scale_factor = (src_w as f32 / dst_w as f32).max(src_h as f32 / dst_h as f32);
    
    // For very large downscaling, always use nearest neighbor
    if scale_factor > 8.0 {
        return true;
    }
    
    // Dynamic threshold based on image size
    let src_pixels = (src_w as u64) * (src_h as u64);
    let threshold = if src_pixels < 1_000_000 {
        // Small images: prefer quality, use bilinear up to 8x downscaling
        8.0
    } else if src_pixels < 10_000_000 {
        // Medium images: balanced approach, use bilinear up to 4x downscaling
        4.0
    } else {
        // Large images: prefer performance, use nearest neighbor for > 2x downscaling
        2.0
    };
    
    scale_factor > threshold
}

/// Fast nearest neighbor resize (for downscaling large images)
/// Returns error code: 0 = success, non-zero = error
#[no_mangle]
pub unsafe extern "C" fn resize_rgba_nearest(
    src_ptr: *const u8,
    src_w: u32,
    src_h: u32,
    dst_ptr: *mut u8,
    dst_w: u32,
    dst_h: u32,
) -> i32 {
    let (src_size, dst_size) = match validate_params(src_ptr, src_w, src_h, dst_ptr, dst_w, dst_h) {
        Ok(sizes) => sizes,
        Err(code) => return code,
    };
    
    let src = match std::slice::from_raw_parts(src_ptr, src_size).get(..) {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_MEMORY);
            return RESIZE_ERR_MEMORY;
        }
    };
    
    let dst = match std::slice::from_raw_parts_mut(dst_ptr, dst_size).get_mut(..) {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_MEMORY);
            return RESIZE_ERR_MEMORY;
        }
    };
    
    let scale_x = src_w as f32 / dst_w as f32;
    let scale_y = src_h as f32 / dst_h as f32;

    // Precompute X mapping: for each destination x, which source pixel (byte index) to sample
    // This avoids recomputing float math inside the inner loop
    // Reuse thread-local buffer to avoid heap allocation on every call
    X_INDICES_NEAREST.with(|x_indices_cell| {
        let mut x_indices = x_indices_cell.borrow_mut();
        let dst_w_usize = dst_w as usize;
        
        // Clear and reserve capacity if needed (reuses existing capacity)
        x_indices.clear();
        let x_cap = x_indices.capacity();
        if x_cap < dst_w_usize {
            x_indices.reserve(dst_w_usize.saturating_sub(x_cap));
        }
        
        // Precompute X indices
        for x in 0..dst_w {
            let src_x = ((x as f32 + 0.5) * scale_x) as u32;
            let src_x = src_x.min(src_w - 1);
            x_indices.push((src_x as usize) * 4);
        }
        
        // Optimized nearest neighbor with pre-calculated indices
        for y in 0..dst_h {
            let src_y = ((y as f32 + 0.5) * scale_y) as u32;
            let src_y = src_y.min(src_h - 1);
            let src_y_offset = (src_y as usize) * (src_w as usize) * 4;
            
            for x in 0..dst_w {
                let src_idx = src_y_offset + x_indices[x as usize];
                let dst_idx = ((y as usize) * (dst_w as usize) + (x as usize)) * 4;
                
                // Copy 4 bytes (RGBA) at once
                if src_idx + 3 < src.len() && dst_idx + 3 < dst.len() {
                    dst[dst_idx] = src[src_idx];
                    dst[dst_idx + 1] = src[src_idx + 1];
                    dst[dst_idx + 2] = src[src_idx + 2];
                    dst[dst_idx + 3] = src[src_idx + 3];
                }
            }
        }
        
        RESIZE_OK
    })
}

/// Resize RGBA image data with automatic algorithm selection
/// 
/// This function serves as the main entry point and handles:
/// 1. Parameter validation
/// 2. Algorithm selection (nearest neighbor vs bilinear interpolation)
/// 3. Delegation to the appropriate resize implementation
/// 
/// The algorithm is automatically chosen based on:
/// - Scale factor (large downscaling uses nearest neighbor for performance)
/// - Image size (dynamic threshold adjustment for optimal quality/performance balance)
/// 
/// Returns error code: 0 = success, non-zero = error
/// 
/// # Safety
/// This function is unsafe because it operates on raw pointers.
/// The caller must ensure:
/// - src_ptr points to valid memory of size src_w * src_h * 4 bytes
/// - dst_ptr points to valid memory of size dst_w * dst_h * 4 bytes
/// - All dimensions are > 0
/// - Memory regions do not overlap
#[no_mangle]
pub unsafe extern "C" fn resize_rgba(
    src_ptr: *const u8,
    src_w: u32,
    src_h: u32,
    dst_ptr: *mut u8,
    dst_w: u32,
    dst_h: u32,
) -> i32 {
    let (src_size, dst_size) = match validate_params(src_ptr, src_w, src_h, dst_ptr, dst_w, dst_h) {
        Ok(sizes) => sizes,
        Err(code) => return code,
    };
    
    let src = match std::slice::from_raw_parts(src_ptr, src_size).get(..) {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_MEMORY);
            return RESIZE_ERR_MEMORY;
        }
    };
    
    let dst = match std::slice::from_raw_parts_mut(dst_ptr, dst_size).get_mut(..) {
        Some(s) => s,
        None => {
            set_last_error(RESIZE_ERR_MEMORY);
            return RESIZE_ERR_MEMORY;
        }
    };
    
    // Select optimal algorithm based on scale factor and image size
    if should_use_nearest_neighbor(src_w, src_h, dst_w, dst_h) {
        return resize_rgba_nearest(src_ptr, src_w, src_h, dst_ptr, dst_w, dst_h);
    }
    
    let scale_x = src_w as f32 / dst_w as f32;
    let scale_y = src_h as f32 / dst_h as f32;

    // ==================== Precompute interpolation parameters along X ====================
    //
    // For each destination x:
    // - Precompute the corresponding source coordinate src_x
    // - Derive x0 / x1 (neighboring source pixel indices)
    // - And the interpolation weight fx
    //
    // This avoids repeated floating point division / floor / clamp in the inner loop.
    // Reuse thread-local buffers to avoid heap allocation on every call

    let dst_w_usize = dst_w as usize;
    
    X0_INDICES_BILINEAR.with(|x0_cell| {
        X1_INDICES_BILINEAR.with(|x1_cell| {
            FX_VALUES_BILINEAR.with(|fx_cell| {
                let mut x0_indices = x0_cell.borrow_mut();
                let mut x1_indices = x1_cell.borrow_mut();
                let mut fx_values = fx_cell.borrow_mut();
                
                // Clear and reserve capacity if needed (reuses existing capacity)
                x0_indices.clear();
                x1_indices.clear();
                fx_values.clear();
                
                // Calculate required capacity before reserving to avoid borrow conflicts
                let x0_cap = x0_indices.capacity();
                let x1_cap = x1_indices.capacity();
                let fx_cap = fx_values.capacity();
                
                if x0_cap < dst_w_usize {
                    x0_indices.reserve(dst_w_usize.saturating_sub(x0_cap));
                }
                if x1_cap < dst_w_usize {
                    x1_indices.reserve(dst_w_usize.saturating_sub(x1_cap));
                }
                if fx_cap < dst_w_usize {
                    fx_values.reserve(dst_w_usize.saturating_sub(fx_cap));
                }
                
                // Precompute X-direction LUT
                for x in 0..dst_w {
                    let src_x = (x as f32 + 0.5) * scale_x - 0.5;
                    let x0 = src_x.floor() as i32;
                    let x1 = (x0 + 1).min(src_w as i32 - 1);
                    let fx = (src_x - x0 as f32).max(0.0).min(1.0);

                    let x0_clamped = x0.clamp(0, src_w as i32 - 1) as usize * 4;
                    let x1_clamped = x1.clamp(0, src_w as i32 - 1) as usize * 4;

                    x0_indices.push(x0_clamped);
                    x1_indices.push(x1_clamped);
                    fx_values.push(fx);
                }
                
                // Optimized bilinear interpolation with bounds checking
                for y in 0..dst_h {
                    let src_y = (y as f32 + 0.5) * scale_y - 0.5;
                    let y0 = src_y.floor() as i32;
                    let y1 = (y0 + 1).min(src_h as i32 - 1);
                    let fy = (src_y - y0 as f32).max(0.0).min(1.0);
                    
                    // Pre-calculate y offsets with clamping to valid range
                    let y0_clamped = y0.clamp(0, src_h as i32 - 1) as usize;
                    let y1_clamped = y1.clamp(0, src_h as i32 - 1) as usize;
                    let y0_offset = y0_clamped * (src_w as usize) * 4;
                    let y1_offset = y1_clamped * (src_w as usize) * 4;
                    
                    for x in 0..dst_w {
                        // Fetch X-direction parameters from the precomputed LUT
                        let lut_index = x as usize;
                        let x0_clamped = x0_indices[lut_index];
                        let x1_clamped = x1_indices[lut_index];
                        let fx = fx_values[lut_index];
                        
                        // Get four neighboring pixels with clamped edge handling
                        let get_pixel_safe = |offset: usize, idx: usize| -> [u8; 4] {
                            let mut pos = offset + idx;
                            // Clamp to last full pixel within bounds (replicate edge pixel)
                            if pos + 3 >= src.len() {
                                if src.len() >= 4 {
                                    pos = src.len() - 4;
                                } else {
                                    return [0, 0, 0, 0];
                                }
                            }
                            [
                                src[pos],
                                src[pos + 1],
                                src[pos + 2],
                                src[pos + 3],
                            ]
                        };
                        
                        let p00 = get_pixel_safe(y0_offset, x0_clamped);
                        let p10 = get_pixel_safe(y0_offset, x1_clamped);
                        let p01 = get_pixel_safe(y1_offset, x0_clamped);
                        let p11 = get_pixel_safe(y1_offset, x1_clamped);
                        
                        // Optimized bilinear interpolation
                        // Use f32 arithmetic for better precision, then clamp to u8
                        let lerp = |a: u8, b: u8, t: f32| -> u8 {
                            let result = a as f32 * (1.0 - t) + b as f32 * t;
                            result.max(0.0).min(255.0) as u8
                        };
                        
                        // Horizontal interpolation
                        let c0 = [
                            lerp(p00[0], p10[0], fx),
                            lerp(p00[1], p10[1], fx),
                            lerp(p00[2], p10[2], fx),
                            lerp(p00[3], p10[3], fx),
                        ];
                        
                        let c1 = [
                            lerp(p01[0], p11[0], fx),
                            lerp(p01[1], p11[1], fx),
                            lerp(p01[2], p11[2], fx),
                            lerp(p01[3], p11[3], fx),
                        ];
                        
                        // Vertical interpolation
                        let result = [
                            lerp(c0[0], c1[0], fy),
                            lerp(c0[1], c1[1], fy),
                            lerp(c0[2], c1[2], fy),
                            lerp(c0[3], c1[3], fy),
                        ];
                        
                        // Write to destination with bounds checking
                        let dst_idx = ((y as usize) * (dst_w as usize) + (x as usize)) * 4;
                        if dst_idx + 3 < dst.len() {
                            dst[dst_idx] = result[0];
                            dst[dst_idx + 1] = result[1];
                            dst[dst_idx + 2] = result[2];
                            dst[dst_idx + 3] = result[3];
                        }
                    }
                }
                
                RESIZE_OK
            })
        })
    })
}

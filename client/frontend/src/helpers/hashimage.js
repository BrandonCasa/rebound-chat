// ============================================
// hashes.js
// Pure JavaScript implementation of:
//   - coarse 16-bit grayscale hash
//   - fine 768-bit color-aware hash
// ============================================

// ---------- 1D + 2D DCT IMPLEMENTATION ----------

/**
 * 1D DCT-II with orthonormal normalization (NumPy/SciPy-compatible).
 * x: Array or typed array of length N (numbers).
 * Returns Float64Array of length N.
 */
export function dct1d(x) {
	const N = x.length;
	const result = new Float64Array(N);

	const factor0 = Math.sqrt(1.0 / N);
	const factor = Math.sqrt(2.0 / N);

	for (let k = 0; k < N; k++) {
		let sum = 0.0;
		for (let n = 0; n < N; n++) {
			sum += x[n] * Math.cos((Math.PI * (n + 0.5) * k) / N);
		}
		result[k] = k === 0 ? factor0 * sum : factor * sum;
	}

	return result;
}

/**
 * 2D DCT-II (orthonormal).
 * a: 2D array (Array of Arrays) of size [rows][cols].
 * Returns 2D Float64Array matrix [rows][cols].
 */
export function dct2(a) {
	const rows = a.length;
	const cols = a[0].length;

	// Copy input to float matrix
	const mat = Array.from({ length: rows }, (_, y) => {
		const row = new Float64Array(cols);
		for (let x = 0; x < cols; x++) {
			row[x] = a[y][x];
		}
		return row;
	});

	// DCT along columns
	const colsTemp = Array.from({ length: cols }, () => new Float64Array(rows));
	for (let x = 0; x < cols; x++) {
		const col = new Float64Array(rows);
		for (let y = 0; y < rows; y++) {
			col[y] = mat[y][x];
		}
		const dctCol = dct1d(col);
		for (let y = 0; y < rows; y++) {
			colsTemp[x][y] = dctCol[y];
		}
	}

	// DCT along rows
	const out = Array.from({ length: rows }, () => new Float64Array(cols));
	for (let y = 0; y < rows; y++) {
		const row = new Float64Array(cols);
		for (let x = 0; x < cols; x++) {
			row[x] = colsTemp[x][y];
		}
		const dctRow = dct1d(row);
		for (let x = 0; x < cols; x++) {
			out[y][x] = dctRow[x];
		}
	}

	return out;
}

// ---------- BIT PACKING ----------

/**
 * Pack an array of bits (0/1 or false/true) into a hex string.
 * Equivalent to NumPy's np.packbits(...).tobytes().hex() with bitorder='big'.
 */
export function bitsToHex(bits) {
	const len = bits.length;
	const bytes = [];
	let byte = 0;
	let bitCount = 0;

	for (let i = 0; i < len; i++) {
		const b = bits[i] ? 1 : 0;
		byte = (byte << 1) | b;
		bitCount++;

		if (bitCount === 8) {
			bytes.push(byte);
			byte = 0;
			bitCount = 0;
		}
	}

	// Pad last byte with zeros if needed
	if (bitCount > 0) {
		byte = byte << (8 - bitCount);
		bytes.push(byte);
	}

	return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- GAUSSIAN BLUR (GRAYSCALE) ----------

/**
 * Build a 1D Gaussian kernel for a given radius (sigma ~ radius).
 */
export function makeGaussianKernel(radius) {
	if (radius <= 0) {
		return new Float32Array([1]);
	}

	const sigma = radius;
	const r = Math.max(1, Math.ceil(sigma * 3));
	const size = 2 * r + 1;
	const kernel = new Float32Array(size);

	const sigma2 = 2 * sigma * sigma;
	let sum = 0.0;
	for (let i = -r; i <= r; i++) {
		const v = Math.exp(-(i * i) / sigma2);
		kernel[i + r] = v;
		sum += v;
	}
	// Normalize
	for (let i = 0; i < size; i++) {
		kernel[i] /= sum;
	}
	return kernel;
}

/**
 * Separable Gaussian blur for grayscale data.
 * gray: Float32Array of length width*height
 * Returns new Float32Array.
 */
export function gaussianBlurGray(gray, width, height, radius) {
	if (radius <= 0) return gray.slice();

	const kernel = makeGaussianKernel(radius);
	const kRadius = (kernel.length - 1) >> 1;

	const tmp = new Float32Array(width * height);
	const out = new Float32Array(width * height);

	// Horizontal pass
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width;
		for (let x = 0; x < width; x++) {
			let sum = 0.0;
			for (let k = -kRadius; k <= kRadius; k++) {
				let xx = x + k;
				if (xx < 0) xx = 0;
				if (xx >= width) xx = width - 1;
				const w = kernel[k + kRadius];
				sum += gray[rowOffset + xx] * w;
			}
			tmp[rowOffset + x] = sum;
		}
	}

	// Vertical pass
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			let sum = 0.0;
			for (let k = -kRadius; k <= kRadius; k++) {
				let yy = y + k;
				if (yy < 0) yy = 0;
				if (yy >= height) yy = height - 1;
				const w = kernel[k + kRadius];
				sum += tmp[yy * width + x] * w;
			}
			out[y * width + x] = sum;
		}
	}

	return out;
}

// ---------- RESIZE HELPERS (GRAYSCALE + RGB) ----------

/**
 * Bilinear resize for grayscale data.
 * src: Float32Array of length srcW*srcH
 * Returns Float32Array of length dstW*dstH
 */
export function resizeGrayBilinear(src, srcW, srcH, dstW, dstH) {
	const dst = new Float32Array(dstW * dstH);

	const xRatio = srcW / dstW;
	const yRatio = srcH / dstH;

	for (let j = 0; j < dstH; j++) {
		const sy = (j + 0.5) * yRatio - 0.5;
		const y0 = Math.max(0, Math.floor(sy));
		const y1 = Math.min(srcH - 1, y0 + 1);
		const wy = sy - y0;

		for (let i = 0; i < dstW; i++) {
			const sx = (i + 0.5) * xRatio - 0.5;
			const x0 = Math.max(0, Math.floor(sx));
			const x1 = Math.min(srcW - 1, x0 + 1);
			const wx = sx - x0;

			const p00 = src[y0 * srcW + x0];
			const p01 = src[y0 * srcW + x1];
			const p10 = src[y1 * srcW + x0];
			const p11 = src[y1 * srcW + x1];

			const top = p00 * (1 - wx) + p01 * wx;
			const bottom = p10 * (1 - wx) + p11 * wx;
			dst[j * dstW + i] = top * (1 - wy) + bottom * wy;
		}
	}

	return dst;
}

/**
 * Bilinear resize for RGB data (3 or 4 channels).
 * src: Uint8ClampedArray or similar, length srcW*srcH*channels
 * channels: 3 or 4
 * Returns Uint8ClampedArray length dstW*dstH*channels
 */
export function resizeRgbBilinear(src, srcW, srcH, dstW, dstH, channels) {
	const dst = new Uint8ClampedArray(dstW * dstH * channels);

	const xRatio = srcW / dstW;
	const yRatio = srcH / dstH;

	for (let j = 0; j < dstH; j++) {
		const sy = (j + 0.5) * yRatio - 0.5;
		const y0 = Math.max(0, Math.floor(sy));
		const y1 = Math.min(srcH - 1, y0 + 1);
		const wy = sy - y0;

		for (let i = 0; i < dstW; i++) {
			const sx = (i + 0.5) * xRatio - 0.5;
			const x0 = Math.max(0, Math.floor(sx));
			const x1 = Math.min(srcW - 1, x0 + 1);
			const wx = sx - x0;

			for (let c = 0; c < channels; c++) {
				const idx00 = (y0 * srcW + x0) * channels + c;
				const idx01 = (y0 * srcW + x1) * channels + c;
				const idx10 = (y1 * srcW + x0) * channels + c;
				const idx11 = (y1 * srcW + x1) * channels + c;

				const p00 = src[idx00];
				const p01 = src[idx01];
				const p10 = src[idx10];
				const p11 = src[idx11];

				const top = p00 * (1 - wx) + p01 * wx;
				const bottom = p10 * (1 - wx) + p11 * wx;
				const value = top * (1 - wy) + bottom * wy;

				dst[(j * dstW + i) * channels + c] = value;
			}
		}
	}

	return dst;
}

// ---------- GRAYSCALE CONVERSION HELPERS ----------

/**
 * Convert RGBA (or RGB) to grayscale (Float32Array).
 * pixels: Uint8ClampedArray (length width*height*3 or *4)
 * channels: 3 or 4
 */
export function rgbaToGrayscale(pixels, width, height, channels) {
	const out = new Float32Array(width * height);
	for (let i = 0; i < width * height; i++) {
		const offset = i * channels;
		const r = pixels[offset + 0];
		const g = pixels[offset + 1];
		const b = pixels[offset + 2];

		// Luma conversion similar to PIL's "L"
		out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
	}
	return out;
}

// ---------- COARSE HASH (16 BITS) ----------

/**
 * Compute a coarse DCT hash (16-bit) from an image's grayscale pixels.
 *
 * Params:
 *   gray: Float32Array of length width*height (0-255)
 *   width, height: dimensions of gray
 *   options:
 *     hashSize (default 4)  -> hashSize x hashSize = 16 bits
 *     dctSize (default 32)  -> DCT is run on dctSize x dctSize image
 *     blurRadius (default 1.5) -> Gaussian blur radius
 *
 * Returns:
 *   Hex string representing packed hash bits.
 */
export function dctHashCoarse16bitFromGray(gray, width, height, { hashSize = 4, dctSize = 32, blurRadius = 1.5 } = {}) {
	// 1) Optional blur
	const blurred = gaussianBlurGray(gray, width, height, blurRadius);

	// 2) Resize to dctSize x dctSize
	const resized = resizeGrayBilinear(blurred, width, height, dctSize, dctSize);

	// 3) Subtract mean
	let sum = 0.0;
	for (let i = 0; i < resized.length; i++) sum += resized[i];
	const mean = sum / resized.length;
	for (let i = 0; i < resized.length; i++) resized[i] -= mean;

	// 4) Convert to 2D array
	const mat = Array.from({ length: dctSize }, (_, y) => {
		const row = new Float64Array(dctSize);
		for (let x = 0; x < dctSize; x++) {
			row[x] = resized[y * dctSize + x];
		}
		return row;
	});

	// 5) DCT
	const dctVals = dct2(mat);

	// 6) Take top-left hashSize x hashSize block
	const blockVals = [];
	for (let y = 0; y < hashSize; y++) {
		for (let x = 0; x < hashSize; x++) {
			blockVals.push(dctVals[y][x]);
		}
	}

	// 7) Median
	const sorted = blockVals.slice().sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	const median = sorted.length % 2 === 0 ? 0.5 * (sorted[mid - 1] + sorted[mid]) : sorted[mid];

	// 8) Bits: 1 if > median, else 0
	const bits = blockVals.map((v) => (v > median ? 1 : 0));

	// 9) Pack to hex
	return bitsToHex(bits);
}

/**
 * Convenience wrapper if you have RGBA or RGB pixels.
 *
 * pixels: Uint8ClampedArray, length width*height*(3 or 4)
 * channels: 3 or 4
 */
export function dctHashCoarse16bitFromRgb(pixels, width, height, channels = 4, options = {}) {
	const gray = rgbaToGrayscale(pixels, width, height, channels);
	return dctHashCoarse16bitFromGray(gray, width, height, options);
}

// ---------- FINE HASH (768 BITS) ----------

/**
 * Compute a fine color-aware DCT hash (768 bits).
 *
 * Params:
 *   pixels: Uint8ClampedArray or similar, length width*height*(3 or 4)
 *   width, height
 *   channels: 3 or 4 (if 4, alpha is ignored)
 *   options:
 *     hashSize (default 16)  -> 16x16=256 bits per channel
 *     dctSize (default 64)   -> DCT on dctSize x dctSize per channel
 *
 * Returns:
 *   Hex string representing packed 768 bits (3 * 256).
 */
export function dctHashFineColor(pixels, width, height, channels = 4, { hashSize = 16, dctSize = 64 } = {}) {
	// 1) Resize RGB to dctSize x dctSize
	const resized = resizeRgbBilinear(pixels, width, height, dctSize, dctSize, channels);

	// 2) Split into channels and process each
	const allBits = [];

	for (let c = 0; c < 3; c++) {
		// R, G, B
		// a) Build float array for this channel
		const channel = new Float64Array(dctSize * dctSize);
		for (let i = 0; i < dctSize * dctSize; i++) {
			const offset = i * channels;
			channel[i] = resized[offset + c];
		}

		// b) Subtract mean
		let sum = 0.0;
		for (let i = 0; i < channel.length; i++) sum += channel[i];
		const mean = sum / channel.length;
		for (let i = 0; i < channel.length; i++) channel[i] -= mean;

		// c) 2D matrix
		const mat = Array.from({ length: dctSize }, (_, y) => {
			const row = new Float64Array(dctSize);
			for (let x = 0; x < dctSize; x++) {
				row[x] = channel[y * dctSize + x];
			}
			return row;
		});

		// d) DCT
		const dctVals = dct2(mat);

		// e) Take top-left hashSize x hashSize block
		const blockVals = [];
		for (let y = 0; y < hashSize; y++) {
			for (let x = 0; x < hashSize; x++) {
				blockVals.push(dctVals[y][x]);
			}
		}

		// f) Median
		const sorted = blockVals.slice().sort((a, b) => a - b);
		const mid = sorted.length >> 1;
		const median = sorted.length % 2 === 0 ? 0.5 * (sorted[mid - 1] + sorted[mid]) : sorted[mid];

		// g) Bits
		const bits = blockVals.map((v) => (v > median ? 1 : 0));
		allBits.push(...bits);
	}

	return bitsToHex(allBits);
}

// ---------- EXAMPLE USAGE (BROWSER CANVAS) ----------
// Assuming you have a canvas with an image drawn onto it:
//
// const canvas = document.getElementById("myCanvas");
// const ctx = canvas.getContext("2d");
// const { width, height } = canvas;
// const imageData = ctx.getImageData(0, 0, width, height);
// const pixels = imageData.data; // Uint8ClampedArray (RGBA)
//
// const coarse = dctHashCoarse16bitFromRgb(pixels, width, height, 4, {
//   hashSize: 4,
//   dctSize: 32,
//   blurRadius: 1.5
// });
//
// const fine = dctHashFineColor(pixels, width, height, 4, {
//   hashSize: 16,
//   dctSize: 64
// });
//
// console.log("coarse_16bit:", coarse);
// console.log("fine_hash   :", fine);

// ---------- EXPORTS (for Node / bundlers) ----------

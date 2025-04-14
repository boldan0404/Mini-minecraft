import Rand from "../lib/rand-seed/Rand.js";
export class Chunk {
    constructor(centerX, centerZ, size) {
        this.x = centerX;
        this.z = centerZ;
        this.size = size;
        this.heights = Array(size).fill(0).map(() => Array(size).fill(0));
        this.seed = `${centerX},${centerZ}`;
        this.generateHeightMap();
        this.generateCubes();
    }
    /**
     * Generate a value noise height map with multiple octaves
     * This creates a smooth, continuous terrain with subtle variations
     */
    generateHeightMap() {
        // Parameters for terrain generation - adjusted for flatter, smoother terrain
        const octaves = 3; // Number of noise layers to combine (at least 3 as required)
        const persistence = 0.3; // Lower persistence for gentler heights
        const lacunarity = 1.8; // Slightly lower lacunarity for smoother transitions
        const baseScale = 12.0; // Larger base scale for broader, flatter features
        const heightScale = 15.0; // Reduced height scale for flatter terrain
        const baseHeight = 40.0; // Higher base height to avoid holes
        // Initialize height map to base height
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                this.heights[i][j] = baseHeight;
            }
        }
        // Generate multiple octaves of noise
        for (let octave = 0; octave < octaves; octave++) {
            // Calculate scale and amplitude for this octave
            const scale = baseScale / Math.pow(lacunarity, octave);
            const amplitude = heightScale * Math.pow(persistence, octave);
            // Ensure we have enough points for smooth interpolation
            // Higher gridSize means smoother terrain between noise points
            const gridSize = Math.max(4, Math.floor(this.size / scale));
            // Create a unique seed for each octave to prevent pattern repetition
            const octaveSeed = `${this.seed}-${octave}`;
            // Generate white noise grid for this octave
            const noiseGrid = this.generateWhiteNoiseGrid(gridSize, octaveSeed);
            // Sample this noise grid for every position in the heightmap
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    // Map coordinates to the noise grid
                    const x = (i / this.size) * (gridSize - 1);
                    const z = (j / this.size) * (gridSize - 1);
                    // Value noise uses bilinear interpolation for smooth transitions
                    const value = this.bilinearInterpolation(noiseGrid, x, z);
                    // Add weighted noise value to heightmap, using a smaller range centered around 0.5
                    // This ensures more subtle variations rather than extreme peaks and valleys
                    this.heights[i][j] += (value - 0.4) * amplitude;
                }
            }
        }
        // Apply post-processing - ensure continuity, smooth transitions, etc.
        this.postProcessHeightMap();
    }
    /**
     * Apply post-processing to the height map for smoother, more continuous terrain
     */
    postProcessHeightMap() {
        // Reduced biome variation for more consistent terrain
        // Only subtle height differences between biomes
        const isMountainous = Math.abs((this.x + this.z) % 10) < 2; // Rarer mountain areas
        const mountainScale = isMountainous ? 1.2 : 1.0; // Less dramatic mountains
        const minHeight = 35; // Higher water/minimum level to ensure no holes
        // More subtle distance-based gradients
        const distanceFromCenter = Math.sqrt(this.x * this.x + this.z * this.z) / 2000.0;
        // Get adjacent chunk heights for boundary continuity 
        // (simulate heights of neighboring chunks to ensure smooth transitions)
        const getContinuityHeight = (chunkX, chunkZ, localI, localJ) => {
            // Create a reproducible seed based on chunk coordinates
            const neighborSeed = `${chunkX},${chunkZ}`;
            const rng = new Rand(neighborSeed);
            // We only need a rough estimate of neighboring heights, not exact calculation
            // This simulates the general height level of adjacent chunks
            return 40 + (rng.next() - 0.5) * 10;
        };
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                // Check for chunk boundary and ensure smooth transitions
                let edgeInfluence = 0;
                // Border smoothing: if near chunk edge, blend with expected neighbor heights
                if (i < 4 || i >= this.size - 4 || j < 4 || j >= this.size - 4) {
                    // Determine which neighboring chunk we're closest to
                    const neighborX = this.x + (j < 4 ? -this.size : (j >= this.size - 4 ? this.size : 0));
                    const neighborZ = this.z + (i < 4 ? -this.size : (i >= this.size - 4 ? this.size : 0));
                    if (neighborX !== this.x || neighborZ !== this.z) {
                        // Get approximate height from neighboring chunk
                        const neighborHeight = getContinuityHeight(neighborX, neighborZ, i, j);
                        // Calculate edge distance (0 at edge, 1 at distance 4 from edge)
                        const edgeDistance = Math.min(Math.min(i, this.size - 1 - i), Math.min(j, this.size - 1 - j)) / 4;
                        // Blend with neighbor height based on edge distance
                        edgeInfluence = (1 - edgeDistance) * (neighborHeight - this.heights[i][j]);
                        this.heights[i][j] += edgeInfluence * 0.7; // Partial influence for smoother transitions
                    }
                }
                // Apply very subtle mountainous scaling to higher terrain
                if (this.heights[i][j] > 50) {
                    this.heights[i][j] = 50 + (this.heights[i][j] - 50) * mountainScale;
                }
                // Reduced distance-based height falloff
                this.heights[i][j] -= distanceFromCenter * 10;
                // Ensure minimum height to prevent holes and max height for range
                this.heights[i][j] = Math.max(minHeight, this.heights[i][j]);
                this.heights[i][j] = Math.min(70, this.heights[i][j]); // Lower max height for flatter terrain
                // Integer heights for blocky terrain
                this.heights[i][j] = Math.floor(this.heights[i][j]);
            }
        }
        // More aggressive smoothing for flatter terrain
        this.smoothHeightMap();
        this.smoothHeightMap(); // Apply twice for extra smoothness
    }
    /**
     * Apply stronger smoothing for more continuous terrain
     */
    smoothHeightMap() {
        // Create a copy of the height map
        const smoothedHeights = Array(this.size).fill(0).map((_, i) => Array(this.size).fill(0).map((_, j) => this.heights[i][j]));
        // Weighted 5x5 smoothing kernel for more continuous terrain
        // Use a larger kernel with distance-based weighting
        for (let i = 2; i < this.size - 2; i++) {
            for (let j = 2; j < this.size - 2; j++) {
                const centerHeight = this.heights[i][j];
                // Apply gaussian-like weighting
                let weightedSum = 0;
                let totalWeight = 0;
                for (let ni = -2; ni <= 2; ni++) {
                    for (let nj = -2; nj <= 2; nj++) {
                        // Skip out of bounds
                        if (i + ni < 0 || i + ni >= this.size || j + nj < 0 || j + nj >= this.size)
                            continue;
                        // Calculate distance-based weight
                        const distance = Math.sqrt(ni * ni + nj * nj);
                        const weight = Math.exp(-distance * 0.8); // Gaussian-like falloff
                        weightedSum += this.heights[i + ni][j + nj] * weight;
                        totalWeight += weight;
                    }
                }
                // Apply the weighted average
                if (totalWeight > 0) {
                    smoothedHeights[i][j] = Math.floor(weightedSum / totalWeight);
                }
            }
        }
        // Special handling for borders to avoid edge artifacts
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                // If we're at the edge (2 blocks from border), use a smaller kernel
                if (i < 2 || i >= this.size - 2 || j < 2 || j >= this.size - 2) {
                    // Just use adjacent neighbors that are in bounds
                    let sum = this.heights[i][j]; // Include self
                    let count = 1;
                    // Check all neighbors within 1 block
                    for (let ni = -1; ni <= 1; ni++) {
                        for (let nj = -1; nj <= 1; nj++) {
                            if (ni === 0 && nj === 0)
                                continue; // Skip self
                            // Check bounds
                            if (i + ni >= 0 && i + ni < this.size && j + nj >= 0 && j + nj < this.size) {
                                sum += this.heights[i + ni][j + nj];
                                count++;
                            }
                        }
                    }
                    smoothedHeights[i][j] = Math.floor(sum / count);
                }
            }
        }
        // Apply the smoothed heights
        this.heights = smoothedHeights;
    }
    /**
     * Generate a grid of white noise with the given seed
     */
    generateWhiteNoiseGrid(size, seed) {
        const grid = [];
        const rng = new Rand(seed);
        for (let i = 0; i < size; i++) {
            grid[i] = [];
            for (let j = 0; j < size; j++) {
                grid[i][j] = rng.next();
            }
        }
        return grid;
    }
    /**
     * Bilinear interpolation for smooth sampling from the noise grid
     */
    bilinearInterpolation(grid, x, z) {
        const x1 = Math.floor(x);
        const x2 = Math.min(x1 + 1, grid.length - 1);
        const z1 = Math.floor(z);
        const z2 = Math.min(z1 + 1, grid[0].length - 1);
        const fx = x - x1;
        const fz = z - z1;
        // Get the four corner values
        const c11 = grid[x1][z1];
        const c21 = grid[x2][z1];
        const c12 = grid[x1][z2];
        const c22 = grid[x2][z2];
        // Apply smoothed interpolation with a smoother curve
        const wx = this.smoothStep(fx);
        const wz = this.smoothStep(fz);
        // Interpolate in x direction
        const i1 = this.lerp(c11, c21, wx);
        const i2 = this.lerp(c12, c22, wx);
        // Interpolate in z direction
        return this.lerp(i1, i2, wz);
    }
    /**
     * Linear interpolation helper
     */
    lerp(a, b, t) {
        return a + t * (b - a);
    }
    /**
     * Smoothstep function for smoother interpolation
     * This gives more natural-looking transitions than linear interpolation
     */
    smoothStep(t) {
        // Improved smoothstep with cubic interpolation: 3t² - 2t³
        return t * t * (3 - 2 * t);
    }
    /**
     * Determine block type based on height and surroundings
     * Adjusted for smoother, flatter terrain
     */
    getBlockType(height, x, z) {
        // Block types:
        // 0 = grass, 1 = stone, 2 = water, 3 = snow
        // Generate biome-specific noise with smoother transitions
        const localX = x - (this.x - this.size / 2);
        const localZ = z - (this.z - this.size / 2);
        // Create a larger-scale, smoother biome noise pattern
        const biomeNoise = Math.sin(localX / 128) * Math.cos(localZ / 128) * 0.3 + 0.5;
        // Water in low areas (set at a higher level to ensure continuous terrain)
        if (height < 35)
            return 2; // Water
        // Snow only on the highest elevations (rarer, but still present)
        if (height > 65 + biomeNoise * 2)
            return 3; // Snow
        // Stone appears on higher elevations but not too extreme
        if (height > 55 - biomeNoise * 5)
            return 1; // Stone
        // Grass is the default ground cover
        return 0; // Grass
    }
    /**
     * Generate cube positions and block types
     */
    /**
     * Generate cube positions and block types
     * Ensures continuous terrain with no gaps
     */
    generateCubes() {
        const topleftx = this.x - this.size / 2;
        const topleftz = this.z - this.size / 2;
        // First find minimum height to ensure we have no gaps
        let minTerrainHeight = Infinity;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = this.heights[i][j];
                if (height < minTerrainHeight) {
                    minTerrainHeight = height;
                }
            }
        }
        // Ensure we generate blocks down to a consistent minimum level
        const baseLevel = Math.max(0, minTerrainHeight - 5); // Go 5 blocks below minimum for safety
        // Count cubes to render - all blocks from their height down to baseLevel
        let cubeCount = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = this.heights[i][j];
                // Add one for top block + enough blocks to reach baseLevel
                cubeCount += Math.max(1, height - baseLevel + 1);
            }
        }
        this.cubes = cubeCount;
        this.cubePositionsF32 = new Float32Array(4 * this.cubes);
        this.blockTypesF32 = new Float32Array(this.cubes);
        let idx = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = this.heights[i][j];
                const worldX = topleftx + j;
                const worldZ = topleftz + i;
                // Add top block
                const blockType = this.getBlockType(height, worldX, worldZ);
                this.cubePositionsF32[4 * idx + 0] = worldX;
                this.cubePositionsF32[4 * idx + 1] = height;
                this.cubePositionsF32[4 * idx + 2] = worldZ;
                this.cubePositionsF32[4 * idx + 3] = 0;
                this.blockTypesF32[idx] = blockType;
                idx++;
                // Fill all blocks down to baseLevel to ensure no gaps
                // This guarantees continuous terrain
                const depthToDraw = height - baseLevel;
                for (let d = 1; d <= depthToDraw; d++) {
                    this.cubePositionsF32[4 * idx + 0] = worldX;
                    this.cubePositionsF32[4 * idx + 1] = height - d;
                    this.cubePositionsF32[4 * idx + 2] = worldZ;
                    this.cubePositionsF32[4 * idx + 3] = 0;
                    // Determine block type for underground blocks
                    // Top few blocks are stone, deeper blocks could be different
                    let undergroundType = 1; // Stone by default
                    if (d > 5 && Math.random() < 0.2) {
                        // Could add other underground block types here
                        // e.g., ore blocks, but keeping it simple with just stone
                    }
                    this.blockTypesF32[idx] = undergroundType;
                    idx++;
                }
            }
        }
    }
    // Get height at specific world coordinates for collision detection
    getHeightAt(worldX, worldZ) {
        const localX = Math.floor(worldX - (this.x - this.size / 2));
        const localZ = Math.floor(worldZ - (this.z - this.size / 2));
        // Check if in bounds
        if (localX >= 0 && localX < this.size && localZ >= 0 && localZ < this.size) {
            return this.heights[localZ][localX];
        }
        return -1; // Out of bounds
    }
    // Accessor methods
    getX() {
        return this.x;
    }
    getZ() {
        return this.z;
    }
    getSize() {
        return this.size;
    }
    getCenterX() {
        return this.x;
    }
    getCenterZ() {
        return this.z;
    }
    cubePositions() {
        return this.cubePositionsF32;
    }
    blockTypes() {
        return this.blockTypesF32;
    }
    numCubes() {
        return this.cubes;
    }
}
//# sourceMappingURL=Chunk.js.map
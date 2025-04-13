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
    // Generate a value noise height map
    generateHeightMap() {
        // Basic parameters for terrain generation
        const octaves = 3;
        const persistence = 0.5;
        const baseScale = 4;
        // Generate multiple octaves of noise
        for (let octave = 0; octave < octaves; octave++) {
            const scale = baseScale * Math.pow(2, octave);
            const amplitude = Math.pow(persistence, octave);
            const gridSize = Math.floor(this.size / scale);
            // Generate white noise grid
            const noiseGrid = this.generateWhiteNoiseGrid(gridSize, octave);
            // Sample this noise grid for every position in the heightmap
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    // Map coordinates to the noise grid
                    const x = (i / this.size) * (gridSize - 1);
                    const z = (j / this.size) * (gridSize - 1);
                    // Bilinear interpolation
                    const value = this.bilinearInterpolation(noiseGrid, x, z);
                    // Add to heightmap
                    this.heights[i][j] += value * amplitude * 20; // Scale factor for height
                }
            }
        }
        // Add a base height and clamp
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                this.heights[i][j] = Math.floor(this.heights[i][j] + 40); // Base height
                this.heights[i][j] = Math.min(100, Math.max(0, this.heights[i][j])); // Clamp to [0,100]
            }
        }
    }
    // Generate a grid of white noise
    generateWhiteNoiseGrid(size, octaveOffset = 0) {
        const grid = [];
        const seedWithOctave = `${this.seed}-${octaveOffset}`;
        const rng = new Rand(seedWithOctave);
        for (let i = 0; i < size; i++) {
            grid[i] = [];
            for (let j = 0; j < size; j++) {
                grid[i][j] = rng.next();
            }
        }
        return grid;
    }
    // Bilinear interpolation for smooth sampling
    bilinearInterpolation(grid, x, z) {
        const x1 = Math.floor(x);
        const x2 = Math.min(x1 + 1, grid.length - 1);
        const z1 = Math.floor(z);
        const z2 = Math.min(z1 + 1, grid[0].length - 1);
        const fx = x - x1;
        const fz = z - z1;
        const c11 = grid[x1][z1];
        const c21 = grid[x2][z1];
        const c12 = grid[x1][z2];
        const c22 = grid[x2][z2];
        const i1 = this.lerp(c11, c21, fx);
        const i2 = this.lerp(c12, c22, fx);
        return this.lerp(i1, i2, fz);
    }
    // Linear interpolation helper
    lerp(a, b, t) {
        return a + t * (b - a);
    }
    // Generate block types based on height
    getBlockType(height, x, z) {
        // 0 = grass, 1 = stone, 2 = water, 3 = snow
        if (height > 80)
            return 3; // Snow on high elevations
        if (height > 60)
            return 1; // Stone for mountains
        if (height < 30)
            return 2; // Water for low areas
        return 0; // Grass for everything else
    }
    // Generate cube positions and block types
    generateCubes() {
        const topleftx = this.x - this.size / 2;
        const topleftz = this.z - this.size / 2;
        // Count cubes to render
        let cubeCount = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = this.heights[i][j];
                cubeCount += Math.min(6, height + 1);
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
                // Add blocks below the surface (up to 5)
                const depthToDraw = Math.min(5, height);
                for (let d = 1; d <= depthToDraw; d++) {
                    this.cubePositionsF32[4 * idx + 0] = worldX;
                    this.cubePositionsF32[4 * idx + 1] = height - d;
                    this.cubePositionsF32[4 * idx + 2] = worldZ;
                    this.cubePositionsF32[4 * idx + 3] = 0;
                    this.blockTypesF32[idx] = 1; // Stone type for underground
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
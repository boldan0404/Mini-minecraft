import { Vec3 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";

// Block type definitions
export enum BlockType {
    AIR = -1,
    GRASS = 0,
    STONE = 1,
    WATER = 2,
    SNOW = 3,
    WOOD = 4,
    LEAVES = 5,
    DIRT = 6,
    SAND = 7,
    COAL = 8,
    IRON = 9,
    GOLD = 10,
    DIAMOND = 11,
    LAVA = 12
}

// Defines a 3D block in the terrain
export interface Block {
    x: number;
    y: number;
    z: number;
    type: BlockType;
}

/**
 * Class for generating true volumetric terrain using 3D Perlin noise
 */
export class VolumetricTerrain {
    private seed: string;
    private chunkX: number;
    private chunkY: number;
    private chunkZ: number;
    private size: number;
    private heightMap: number[][];
    private blockData: (BlockType | null)[][][]; // 3D array to store block types
    
    // Noise configuration parameters - reduced values for better performance
    private readonly CAVE_SCALE = 18.0;
    private readonly CAVE_THRESHOLD = 0.42;
    private readonly SURFACE_VARIATION_SCALE = 12.0;
    private readonly SURFACE_DETAIL_SCALE = 24.0;
    private readonly ORE_SCALE = 8.0;
    private readonly BIOME_SCALE = 80.0;
    
    /**
     * Creates a new volumetric terrain chunk
     * @param chunkX X coordinate of the chunk center
     * @param chunkZ Z coordinate of the chunk center 
     * @param size Size of the chunk (cubic)
     */
    constructor(chunkX: number, chunkZ: number, size: number) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.chunkY = 0; // Always start at y=0 for height consistency
        this.size = size;
        this.seed = `${chunkX},${chunkZ}`;
        
        // Initialize the height map for faster surface access
        this.heightMap = Array(size).fill(0).map(() => Array(size).fill(0));
        
        // Initialize 3D block data
        this.blockData = Array(size).fill(null).map(() => 
            Array(size).fill(null).map(() => 
                Array(size).fill(null)
            )
        );
        
        // Generate terrain data
        this.generateTerrain();
    }
    
    /**
     * Generate the full 3D terrain for this chunk
     */
    private generateTerrain(): void {
        console.log(`Generating terrain for chunk at ${this.chunkX},${this.chunkZ}`);
        
        try {
            // First generate the surface height map to provide an upper bound
            this.generateSurfaceHeightMap();
            
            // Then fill the volume with blocks
            this.generateVolumetricBlocks();
            
            // Add caves and caverns
            this.generateCaves();
            
            // Add ore deposits
            this.generateOreDeposits();
            
            console.log(`Terrain generation complete for chunk at ${this.chunkX},${this.chunkZ}`);
        } catch (error) {
            console.error(`Error generating terrain:`, error);
        }
    }
    
    /**
     * Generate the surface height map as an upper bound for the terrain
     */
    private generateSurfaceHeightMap(): void {
        // Parameters for terrain generation
        const octaves = 3; // Reduced for better performance
        const persistence = 0.5;
        const lacunarity = 2.0;
        const baseScale = this.SURFACE_VARIATION_SCALE;
        const heightScale = 24.0;
        const baseHeight = 40.0;
        
        // Initialize height map to base height
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                this.heightMap[x][z] = baseHeight;
            }
        }
        
        // Generate multiple octaves of noise for the surface
        for (let octave = 0; octave < octaves; octave++) {
            // Calculate scale and amplitude for this octave
            const scale = baseScale / Math.pow(lacunarity, octave);
            const amplitude = heightScale * Math.pow(persistence, octave);
            
            // Generate noise grid for this octave
            const gridSize = Math.max(4, Math.floor(this.size / scale));
            const octaveSeed = `${this.seed}-surface-${octave}`;
            const noiseGrid = this.generateWhiteNoiseGrid(gridSize, octaveSeed);
            
            // Sample this noise grid for every position in the heightmap
            for (let x = 0; x < this.size; x++) {
                for (let z = 0; z < this.size; z++) {
                    // Map coordinates to the noise grid
                    const nx = (x / this.size) * (gridSize - 1);
                    const nz = (z / this.size) * (gridSize - 1);
                    
                    // Get interpolated noise value
                    const value = this.bilinearInterpolation(noiseGrid, nx, nz);
                    
                    // Add weighted noise value to heightmap
                    this.heightMap[x][z] += (value - 0.5) * amplitude;
                }
            }
        }
        
        // Add biome-specific height variations
        this.applyBiomeHeightVariation();
        
        // Smooth heightmap for better terrain
        this.smoothHeightMap();
        
        // Ensure all heights are integers for block alignment
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                this.heightMap[x][z] = Math.floor(this.heightMap[x][z]);
            }
        }
    }
    
    /**
     * Apply biome-specific height variations to the height map
     */
    private applyBiomeHeightVariation(): void {
        // Generate biome map using large-scale noise
        const biomeNoise = this.generate2DNoise(
            this.size, this.size, 
            this.BIOME_SCALE, 
            `${this.seed}-biome`, 1
        );
        
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const biomeValue = biomeNoise[x][z];
                
                // Mountains (high biome values)
                if (biomeValue > 0.65) {
                    const mountainFactor = (biomeValue - 0.65) / 0.35;
                    this.heightMap[x][z] += mountainFactor * 30;
                }
                // Plains (mid biome values)
                else if (biomeValue > 0.4) {
                    const plainsFactor = (biomeValue - 0.4) / 0.25;
                    this.heightMap[x][z] += plainsFactor * 5;
                }
                // Valleys and oceans (low biome values)
                else {
                    const valleyFactor = (0.4 - biomeValue) / 0.4;
                    this.heightMap[x][z] -= valleyFactor * 15;
                }
            }
        }
    }
    
    /**
     * Generate the volumetric blocks for the entire chunk
     */
    private generateVolumetricBlocks(): void {
        // First, determine our biome distribution for material selection
        const biomeNoise = this.generate2DNoise(
            this.size, this.size, 
            this.BIOME_SCALE, 
            `${this.seed}-biome`, 1
        );
        
        const worldY = this.chunkY;
        const worldX = this.chunkX - this.size / 2;
        const worldZ = this.chunkZ - this.size / 2;
        
        // Generate 3D noise for terrain density
        const densityNoise = this.generate3DNoise(
            this.size, this.size, this.size,
            this.SURFACE_DETAIL_SCALE,
            `${this.seed}-density`, 2
        );
        
        // Fill the 3D volume based on height map and density
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                const surfaceHeight = this.heightMap[x][z];
                const biomeValue = biomeNoise[x][z];
                
                // Fill blocks from bottom to top
                for (let y = 0; y < this.size; y++) {
                    const worldHeight = worldY + y;
                    
                    // Default to air
                    let blockType = BlockType.AIR;
                    
                    // Below surface height
                    if (worldHeight <= surfaceHeight) {
                        // Calculate depth from surface
                        const depth = surfaceHeight - worldHeight;
                        
                        // Add some 3D noise variation to break flat layers
                        const densityValue = densityNoise[x][y][z];
                        const densityInfluence = (densityValue - 0.5) * 5;
                        
                        // Surface blocks (0-1 blocks deep)
                        if (depth === 0) {
                            // Choose surface material based on biome and height
                            if (worldHeight < 35) {
                                blockType = BlockType.SAND; // Beach/underwater
                            }
                            else if (worldHeight > 65) {
                                blockType = BlockType.SNOW; // Mountain tops
                            }
                            else {
                                blockType = BlockType.GRASS; // Normal terrain
                            }
                        }
                        // Subsurface blocks (1-4 blocks deep)
                        else if (depth < 4 + densityInfluence) {
                            if (worldHeight < 35) {
                                blockType = BlockType.SAND; // Beach subsurface
                            }
                            else {
                                blockType = BlockType.DIRT; // Soil layer
                            }
                        }
                        // Deep blocks (4+ blocks deep)
                        else {
                            blockType = BlockType.STONE; // Stone layer
                        }
                    }
                    // Water areas
                    else if (worldHeight < 35) {
                        blockType = BlockType.WATER;
                    }
                    
                    // Store the block type
                    this.blockData[x][y][z] = blockType;
                }
            }
        }
    }
    
    /**
     * Generate cave systems using 3D noise
     */
    private generateCaves(): void {
        // For better performance, only generate caves in every other chunk
        if ((this.chunkX + this.chunkZ) % (this.size * 2) !== 0) {
            return;
        }
        
        // Generate 3D noise for cave shapes
        const caveNoise = this.generate3DNoise(
            this.size, this.size, this.size,
            this.CAVE_SCALE,
            `${this.seed}-caves`, 2 // Reduced octaves for better performance
        );
        
        // Secondary noise for more interesting cave shapes
        const detailNoise = this.generate3DNoise(
            this.size, this.size, this.size,
            this.CAVE_SCALE / 2,
            `${this.seed}-cave-detail`, 1 // Reduced octaves
        );
        
        const worldY = this.chunkY;
        
        // Carve caves where noise is above threshold
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                for (let z = 0; z < this.size; z++) {
                    const worldHeight = worldY + y;
                    
                    // Skip carving above a certain height (no sky caves)
                    if (worldHeight > this.heightMap[x][z] - 5) continue;
                    
                    // Skip caves too close to water level to prevent flooding
                    if (worldHeight < 37 && worldHeight > 25) continue;
                    
                    // Get the noise value
                    const noiseValue = caveNoise[x][y][z];
                    const detailValue = detailNoise[x][y][z];
                    
                    // Combine noise values to create more interesting shapes
                    const combinedNoise = (noiseValue * 0.7) + (detailValue * 0.3);
                    
                    // Cave size increases with depth for larger caverns deeper down
                    const depthFactor = Math.min(1.0, (this.heightMap[x][z] - worldHeight) / 30);
                    const threshold = this.CAVE_THRESHOLD - (depthFactor * 0.15);
                    
                    // Carve a cave where noise is above threshold
                    if (combinedNoise > threshold && this.blockData[x][y][z] !== BlockType.AIR) {
                        this.blockData[x][y][z] = BlockType.AIR;
                        
                        // Add lava at the very bottom
                        if (worldHeight < 12 && y > 0 && this.blockData[x][y-1] && 
                            this.blockData[x][y-1][z] === BlockType.AIR) {
                            if (Math.random() < 0.3) {
                                this.blockData[x][y][z] = BlockType.LAVA;
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Generate ore deposits throughout the stone
     */
    private generateOreDeposits(): void {
        // Simplified ore generation for better performance
        const oreChance = 0.05; // 5% chance to check for ore at each position
        const worldY = this.chunkY;
        
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                for (let z = 0; z < this.size; z++) {
                    // Only replace stone blocks
                    if (this.blockData[x][y][z] !== BlockType.STONE) continue;
                    
                    // Skip most positions for performance
                    if (Math.random() > oreChance) continue;
                    
                    const worldHeight = worldY + y;
                    const depth = this.heightMap[x][z] - worldHeight;
                    
                    // Skip if too close to surface
                    if (depth < 5) continue;
                    
                    // Determine ore type based on depth
                    const r = Math.random();
                    
                    // Coal - anywhere, more common
                    if (r < 0.5) {
                        this.blockData[x][y][z] = BlockType.COAL;
                    }
                    // Iron - mid to deep
                    else if (r < 0.8 && depth > 10) {
                        this.blockData[x][y][z] = BlockType.IRON;
                    }
                    // Gold - deep, uncommon
                    else if (r < 0.95 && depth > 25) {
                        this.blockData[x][y][z] = BlockType.GOLD;
                    }
                    // Diamond - very deep, rare
                    else if (depth > 40) {
                        this.blockData[x][y][z] = BlockType.DIAMOND;
                    }
                }
            }
        }
    }
    
    /**
     * Export all the non-empty blocks in the chunk
     * This converts the 3D data into a format usable by the renderer
     */
    public extractBlocks(): Block[] {
        const blocks: Block[] = [];
        const worldX = this.chunkX - this.size / 2;
        const worldY = this.chunkY;
        const worldZ = this.chunkZ - this.size / 2;
        
        console.log(`Extracting blocks from chunk at ${this.chunkX},${this.chunkZ}`);
        
        // Scan entire volume
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                for (let z = 0; z < this.size; z++) {
                    const blockType = this.blockData[x][y][z];
                    
                    // Skip air blocks or null values
                    if (blockType === null || blockType === BlockType.AIR) continue;
                    
                    // Check if block is exposed to air (no need to render completely hidden blocks)
                    if (this.isBlockHidden(x, y, z)) continue;
                    
                    // Add block to output array
                    blocks.push({
                        x: worldX + x,
                        y: worldY + y,
                        z: worldZ + z,
                        type: blockType
                    });
                }
            }
        }
        
        console.log(`Extracted ${blocks.length} visible blocks from chunk`);
        return blocks;
    }
    
    /**
     * Check if a block is completely hidden by other solid blocks
     */
    private isBlockHidden(x: number, y: number, z: number): boolean {
        // Check all six sides
        const directions = [
            { dx: 1, dy: 0, dz: 0 },
            { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 },
            { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 },
            { dx: 0, dy: 0, dz: -1 }
        ];
        
        // Get the current block type (which we know is not null at this point)
        const currentBlockType = this.blockData[x][y][z];
        
        // Special cases: never cull water or lava blocks
        if (currentBlockType === BlockType.WATER || 
            currentBlockType === BlockType.LAVA) {
            return false;
        }
        
        // Check each direction
        for (const dir of directions) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            const nz = z + dir.dz;
            
            // If out of bounds, block is visible from that side
            if (nx < 0 || nx >= this.size || 
                ny < 0 || ny >= this.size || 
                nz < 0 || nz >= this.size) {
                return false;
            }
            
            // Get the neighbor block type
            const neighborBlockType = this.blockData[nx][ny][nz];
            
            // If neighbor is air or null, block is visible
            if (neighborBlockType === null || neighborBlockType === BlockType.AIR) {
                return false;
            }
            
            // If neighbor is transparent and current block is different, it's visible
            if ((neighborBlockType === BlockType.WATER || neighborBlockType === BlockType.LAVA)) {
                return false;
            }
        }
        
        // All sides are covered, block is hidden
        return true;
    }
    
    /**
     * Get height at specific world coordinates
     * @param worldX X coordinate in world space
     * @param worldZ Z coordinate in world space
     * @returns The height of the terrain at the given coordinates, or -1 if out of bounds
     */
    public getHeightAt(worldX: number, worldZ: number): number {
        // Calculate local coordinates within the chunk
        const localX = Math.floor(worldX - (this.chunkX - this.size / 2));
        const localZ = Math.floor(worldZ - (this.chunkZ - this.size / 2));
        
        // Check if the coordinates are within chunk bounds
        if (localX >= 0 && localX < this.size && localZ >= 0 && localZ < this.size) {
            return this.heightMap[localX][localZ];
        }
        
        // Out of bounds
        return -1;
    }
    
    /**
     * Get the block type at specific world coordinates
     * @param worldX X coordinate in world space
     * @param worldY Y coordinate in world space
     * @param worldZ Z coordinate in world space
     * @returns The block type at the given coordinates, or null if out of bounds
     */
    public getBlockAt(worldX: number, worldY: number, worldZ: number): BlockType | null {
        // Calculate local coordinates within the chunk
        const localX = Math.floor(worldX - (this.chunkX - this.size / 2));
        const localY = Math.floor(worldY - this.chunkY);
        const localZ = Math.floor(worldZ - (this.chunkZ - this.size / 2));
        
        // Check if the coordinates are within chunk bounds
        if (localX >= 0 && localX < this.size && 
            localY >= 0 && localY < this.size && 
            localZ >= 0 && localZ < this.size) {
            return this.blockData[localX][localY][localZ];
        }
        
        // Out of bounds
        return null;
    }
    
    /**
     * Set the block type at specific world coordinates
     * @param worldX X coordinate in world space
     * @param worldY Y coordinate in world space
     * @param worldZ Z coordinate in world space
     * @param blockType The new block type
     * @returns True if successful, false if out of bounds
     */
    public setBlockAt(worldX: number, worldY: number, worldZ: number, blockType: BlockType): boolean {
        // Calculate local coordinates within the chunk
        const localX = Math.floor(worldX - (this.chunkX - this.size / 2));
        const localY = Math.floor(worldY - this.chunkY);
        const localZ = Math.floor(worldZ - (this.chunkZ - this.size / 2));
        
        // Check if the coordinates are within chunk bounds
        if (localX >= 0 && localX < this.size && 
            localY >= 0 && localY < this.size && 
            localZ >= 0 && localZ < this.size) {
            this.blockData[localX][localY][localZ] = blockType;
            return true;
        }
        
        // Out of bounds
        return false;
    }
    
    /**
     * Generate 2D noise map
     */
    private generate2DNoise(width: number, height: number, scale: number, seed: string, octaves: number = 1): number[][] {
        const result: number[][] = Array(width).fill(0).map(() => Array(height).fill(0));
        const persistence = 0.5;
        
        for (let octave = 0; octave < octaves; octave++) {
            const octaveScale = scale / Math.pow(2, octave);
            const amplitude = Math.pow(persistence, octave);
            
            // Create a grid of random values
            const gridSize = Math.max(4, Math.ceil(Math.max(width, height) / octaveScale));
            const noiseGrid = this.generateWhiteNoiseGrid(gridSize, `${seed}-oct${octave}`);
            
            // Sample the grid for each point
            for (let x = 0; x < width; x++) {
                for (let z = 0; z < height; z++) {
                    // Map coordinates to the noise grid
                    const nx = (x / width) * (gridSize - 1);
                    const nz = (z / height) * (gridSize - 1);
                    
                    // Get interpolated noise value
                    const value = this.bilinearInterpolation(noiseGrid, nx, nz);
                    
                    // Add to result with amplitude
                    result[x][z] += value * amplitude;
                }
            }
        }
        
        // Normalize values to [0, 1] range
        let min = 1.0;
        let max = 0.0;
        
        for (let x = 0; x < width; x++) {
            for (let z = 0; z < height; z++) {
                min = Math.min(min, result[x][z]);
                max = Math.max(max, result[x][z]);
            }
        }
        
        const range = max - min;
        if (range > 0.001) {
            for (let x = 0; x < width; x++) {
                for (let z = 0; z < height; z++) {
                    result[x][z] = (result[x][z] - min) / range;
                }
            }
        }
        
        return result;
    }
    
    /**
     * Generate 3D noise map using trilinear interpolation
     */
    private generate3DNoise(width: number, height: number, depth: number, scale: number, seed: string, octaves: number = 1): number[][][] {
        // For better performance, use smaller 3D noise grids
        const maxSize = 16; // Cap the grid size
        const adjustedWidth = Math.min(width, maxSize);
        const adjustedHeight = Math.min(height, maxSize);
        const adjustedDepth = Math.min(depth, maxSize);
        
        const result: number[][][] = Array(adjustedWidth).fill(0).map(() => 
            Array(adjustedHeight).fill(0).map(() => 
                Array(adjustedDepth).fill(0)
            )
        );
        
        const persistence = 0.5;
        
        for (let octave = 0; octave < octaves; octave++) {
            const octaveScale = scale / Math.pow(2, octave);
            const amplitude = Math.pow(persistence, octave);
            
            // Create a 3D grid of random values
            const gridSize = Math.max(4, Math.ceil(Math.max(adjustedWidth, adjustedHeight, adjustedDepth) / octaveScale));
            const cappedGridSize = Math.min(gridSize, 8); // Further cap grid size for memory reasons
            const noiseGrid = this.generate3DNoiseGrid(cappedGridSize, `${seed}-oct${octave}`);
            
            // Sample the grid for each point using trilinear interpolation
            for (let x = 0; x < adjustedWidth; x++) {
                for (let y = 0; y < adjustedHeight; y++) {
                    for (let z = 0; z < adjustedDepth; z++) {
                        // Map coordinates to the noise grid
                        const nx = (x / adjustedWidth) * (cappedGridSize - 1);
                        const ny = (y / adjustedHeight) * (cappedGridSize - 1);
                        const nz = (z / adjustedDepth) * (cappedGridSize - 1);
                        
                        // Get interpolated noise value
                        const value = this.trilinearInterpolation(noiseGrid, nx, ny, nz);
                        
                        // Add to result with amplitude
                        result[x][y][z] += value * amplitude;
                    }
                }
            }
        }
        
        // Normalize values to [0, 1] range
        let min = 1.0;
        let max = 0.0;
        
        for (let x = 0; x < adjustedWidth; x++) {
            for (let y = 0; y < adjustedHeight; y++) {
                for (let z = 0; z < adjustedDepth; z++) {
                    min = Math.min(min, result[x][y][z]);
                    max = Math.max(max, result[x][y][z]);
                }
            }
        }
        
        const range = max - min;
        if (range > 0.001) {
            for (let x = 0; x < adjustedWidth; x++) {
                for (let y = 0; y < adjustedHeight; y++) {
                    for (let z = 0; z < adjustedDepth; z++) {
                        result[x][y][z] = (result[x][y][z] - min) / range;
                    }
                }
            }
        }
        
        // If we reduced the size, interpolate back to the original size
        if (adjustedWidth < width || adjustedHeight < height || adjustedDepth < depth) {
            return this.interpolate3DToSize(result, width, height, depth);
        }
        
        return result;
    }
    
    /**
     * Interpolate a smaller 3D grid to a larger size
     */
    private interpolate3DToSize(grid: number[][][], targetWidth: number, targetHeight: number, targetDepth: number): number[][][] {
        const sourceWidth = grid.length;
        const sourceHeight = grid[0].length;
        const sourceDepth = grid[0][0].length;
        
        const result: number[][][] = Array(targetWidth).fill(0).map(() => 
            Array(targetHeight).fill(0).map(() => 
                Array(targetDepth).fill(0)
            )
        );
        
        // Simple trilinear interpolation for upscaling
        for (let x = 0; x < targetWidth; x++) {
            for (let y = 0; y < targetHeight; y++) {
                for (let z = 0; z < targetDepth; z++) {
                    // Map target coordinates to source coordinates
                    const sx = (x / targetWidth) * (sourceWidth - 1);
                    const sy = (y / targetHeight) * (sourceHeight - 1);
                    const sz = (z / targetDepth) * (sourceDepth - 1);
                    
                    // Get interpolated value
                    result[x][y][z] = this.trilinearInterpolation(grid, sx, sy, sz);
                }
            }
        }
        
        return result;
    }
    
    /**
     * Generate a 2D white noise grid
     */
    private generateWhiteNoiseGrid(size: number, seed: string): number[][] {
        const grid: number[][] = [];
        const rng = this.createRNG(seed);
        
        for (let i = 0; i < size; i++) {
            grid[i] = [];
            for (let j = 0; j < size; j++) {
                grid[i][j] = rng();
            }
        }
        
        return grid;
    }
    
    /**
     * Generate a 3D white noise grid
     */
    private generate3DNoiseGrid(size: number, seed: string): number[][][] {
        const grid: number[][][] = [];
        const rng = this.createRNG(seed);
        
        for (let i = 0; i < size; i++) {
            grid[i] = [];
            for (let j = 0; j < size; j++) {
                grid[i][j] = [];
                for (let k = 0; k < size; k++) {
                    grid[i][j][k] = rng();
                }
            }
        }
        
        return grid;
    }
    
    /**
     * Bilinear interpolation for smooth sampling from 2D noise grid
     */
    private bilinearInterpolation(grid: number[][], x: number, z: number): number {
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
     * Trilinear interpolation for smooth sampling from 3D noise grid
     */
    private trilinearInterpolation(grid: number[][][], x: number, y: number, z: number): number {
        const x1 = Math.floor(x);
        const x2 = Math.min(x1 + 1, grid.length - 1);
        const y1 = Math.floor(y);
        const y2 = Math.min(y1 + 1, grid[0].length - 1);
        const z1 = Math.floor(z);
        const z2 = Math.min(z1 + 1, grid[0][0].length - 1);
        
        const fx = x - x1;
        const fy = y - y1;
        const fz = z - z1;
        
        // Apply smoothing functions
        const wx = this.smoothStep(fx);
        const wy = this.smoothStep(fy);
        const wz = this.smoothStep(fz);
        
        // Get the eight corner values
        const c000 = grid[x1][y1][z1];
        const c100 = grid[x2][y1][z1];
        const c010 = grid[x1][y2][z1];
        const c110 = grid[x2][y2][z1];
        const c001 = grid[x1][y1][z2];
        const c101 = grid[x2][y1][z2];
        const c011 = grid[x1][y2][z2];
        const c111 = grid[x2][y2][z2];
        
        // Interpolate along x
        const e00 = this.lerp(c000, c100, wx);
        const e10 = this.lerp(c010, c110, wx);
        const e01 = this.lerp(c001, c101, wx);
        const e11 = this.lerp(c011, c111, wx);
        
        // Interpolate along y
        const p0 = this.lerp(e00, e10, wy);
        const p1 = this.lerp(e01, e11, wy);
        
        // Interpolate along z
        return this.lerp(p0, p1, wz);
    }
    
    /**
     * Linear interpolation helper
     */
    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }
    
    /**
     * Smoothstep function for smoother interpolation
     */
    private smoothStep(t: number): number {
        // Improved smoothstep with cubic interpolation: 3t² - 2t³
        return t * t * (3 - 2 * t);
    }
    
    /**
     * Smooth the height map for more natural-looking terrain
     */
    private smoothHeightMap(): void {
        // Create a copy of the height map
        const smoothedHeights = Array(this.size).fill(0).map((_, i) => 
            Array(this.size).fill(0).map((_, j) => this.heightMap[i][j])
        );
        
        // Apply Gaussian-like smoothing
        for (let i = 1; i < this.size - 1; i++) {
            for (let j = 1; j < this.size - 1; j++) {
                let sum = 0;
                let weight = 0;
                
                // Apply a 3x3 smoothing kernel
                for (let di = -1; di <= 1; di++) {
                    for (let dj = -1; dj <= 1; dj++) {
                        const ni = i + di;
                        const nj = j + dj;
                        
                        // Skip out of bounds
                        if (ni < 0 || ni >= this.size || nj < 0 || nj >= this.size) continue;
                        
                        // Center has highest weight, corners lowest
                        const kernelWeight = 1.0 / (1.0 + Math.abs(di) + Math.abs(dj));
                        
                        sum += this.heightMap[ni][nj] * kernelWeight;
                        weight += kernelWeight;
                    }
                }
                
                // Apply the weighted average
                if (weight > 0) {
                    smoothedHeights[i][j] = sum / weight;
                }
            }
        }
        
        // Apply the smoothed heights
        this.heightMap = smoothedHeights;
    }
    
    /**
     * Create a deterministic random number generator from a seed string
     */
    private createRNG(seed: string): () => number {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        
        // Use mulberry32 algorithm
        let state = hash | 0;
        return function() {
            state = (state + 0x6D2B79F5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
}
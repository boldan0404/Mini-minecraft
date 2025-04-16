import { VolumetricTerrain, BlockType } from "./VolumetricTerrain.js";
/**
 * Enhanced Chunk class that utilizes 3D volumetric terrain generation
 */
export class VolumetricChunk {
    constructor(centerX, centerZ, size) {
        this.heightScale = 128; // Maximum height for volumetric terrain
        this.x = centerX;
        this.z = centerZ;
        this.size = size;
        console.log(`Creating volumetric chunk at ${centerX},${centerZ} with size ${size}`);
        try {
            // Initialize and generate the 3D terrain
            this.terrain = new VolumetricTerrain(centerX, centerZ, size);
            // Extract block data and prepare for rendering
            this.generateCubes();
        }
        catch (error) {
            console.error("Error in VolumetricChunk constructor:", error);
            // Initialize with empty arrays as fallback
            this.cubes = 0;
            this.cubePositionsF32 = new Float32Array(0);
            this.blockTypesF32 = new Float32Array(0);
        }
    }
    /**
     * Generate cube positions and block types from volumetric data
     */
    generateCubes() {
        try {
            // Extract blocks from the terrain
            const blocks = this.terrain.extractBlocks();
            // Set the cube count
            this.cubes = blocks.length;
            console.log(`Generating ${this.cubes} cubes for chunk at ${this.x},${this.z}`);
            // Allocate arrays for WebGL
            this.cubePositionsF32 = new Float32Array(4 * this.cubes);
            this.blockTypesF32 = new Float32Array(this.cubes);
            // Fill arrays with block data
            blocks.forEach((block, idx) => {
                this.cubePositionsF32[4 * idx + 0] = block.x;
                this.cubePositionsF32[4 * idx + 1] = block.y;
                this.cubePositionsF32[4 * idx + 2] = block.z;
                this.cubePositionsF32[4 * idx + 3] = 0;
                this.blockTypesF32[idx] = block.type;
            });
        }
        catch (error) {
            console.error("Error generating cubes:", error);
            // Initialize with empty arrays as fallback
            this.cubes = 0;
            this.cubePositionsF32 = new Float32Array(0);
            this.blockTypesF32 = new Float32Array(0);
        }
    }
    /**
     * Get the terrain height at a specific world coordinate
     * @param worldX X coordinate in world space
     * @param worldZ Z coordinate in world space
     * @returns The height of the terrain at the given coordinates
     */
    getHeightAt(worldX, worldZ) {
        try {
            return this.terrain.getHeightAt(worldX, worldZ);
        }
        catch (error) {
            console.error("Error getting height:", error);
            return -1;
        }
    }
    /**
     * Get the block type at a specific world coordinate
     * @param worldX X coordinate in world space
     * @param worldY Y coordinate in world space
     * @param worldZ Z coordinate in world space
     * @returns The block type at the given coordinates
     */
    getBlockAt(worldX, worldY, worldZ) {
        try {
            return this.terrain.getBlockAt(worldX, worldY, worldZ);
        }
        catch (error) {
            console.error("Error getting block:", error);
            return null;
        }
    }
    /**
     * Set a block type at a specific world coordinate
     * @param worldX X coordinate in world space
     * @param worldY Y coordinate in world space
     * @param worldZ Z coordinate in world space
     * @param blockType The new block type
     * @returns True if successful, false if out of bounds
     */
    setBlockAt(worldX, worldY, worldZ, blockType) {
        try {
            const success = this.terrain.setBlockAt(worldX, worldY, worldZ, blockType);
            // If successful, regenerate cube data for rendering
            if (success) {
                this.generateCubes();
            }
            return success;
        }
        catch (error) {
            console.error("Error setting block:", error);
            return false;
        }
    }
    /**
     * Check if the position is inside a solid block
     * @param worldX X coordinate in world space
     * @param worldY Y coordinate in world space
     * @param worldZ Z coordinate in world space
     * @returns True if the position is inside a solid block
     */
    isSolid(worldX, worldY, worldZ) {
        try {
            const blockType = this.getBlockAt(worldX, worldY, worldZ);
            // If no block or air, it's not solid
            if (blockType === null || blockType === BlockType.AIR) {
                return false;
            }
            // Water and lava are treated as semi-solid for collision
            if (blockType === BlockType.WATER || blockType === BlockType.LAVA) {
                return false;
            }
            // All other block types are solid
            return true;
        }
        catch (error) {
            console.error("Error checking solidity:", error);
            return false;
        }
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
//# sourceMappingURL=VolumetricChunk.js.map
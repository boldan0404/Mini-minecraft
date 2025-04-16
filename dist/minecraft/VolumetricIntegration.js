import { MinecraftAnimation } from "./App.js";
import { VolumetricChunk } from "./VolumetricChunk.js";
import { volumetricCubeVSText, volumetricCubeFSText } from "./UpdatedShaders.js";
import { BlockType } from "./VolumetricTerrain.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Cube } from "./Cube.js";
import { Vec3 } from "../lib/TSM.js";
/**
 * Creates and returns a volumetric Minecraft instance
 */
export function createVolumetricMinecraft(canvas) {
    console.log("Creating volumetric Minecraft instance");
    // Create a standard Minecraft instance
    const minecraft = new MinecraftAnimation(canvas);
    // Replace standard chunks with volumetric ones
    replaceChunks(minecraft);
    // Update rendering system with volumetric shaders
    updateRenderSystem(minecraft);
    // Override interaction methods
    patchInteractionMethods(minecraft);
    console.log("Volumetric Minecraft instance created successfully");
    return minecraft;
}
/**
 * Replace standard chunks with volumetric chunks
 */
function replaceChunks(minecraft) {
    try {
        // Access protected properties (using 'any' type to bypass TypeScript protection)
        const mc = minecraft;
        const chunks = mc.chunks;
        const chunkSize = mc.chunkSize;
        const playerPosition = mc.playerPosition;
        if (!chunks || !playerPosition) {
            console.error("Failed to access chunks or player position");
            return;
        }
        console.log(`Clearing ${chunks.size} existing chunks`);
        // Clear existing chunks
        chunks.clear();
        // Calculate player chunk position
        const playerChunkX = Math.floor(playerPosition.x / chunkSize) * chunkSize;
        const playerChunkZ = Math.floor(playerPosition.z / chunkSize) * chunkSize;
        // Generate fewer chunks initially for better performance
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                // Skip corner chunks for faster startup (only generate 5 chunks instead of 9)
                if (Math.abs(x) === 1 && Math.abs(z) === 1)
                    continue;
                const chunkX = playerChunkX + x * chunkSize;
                const chunkZ = playerChunkZ + z * chunkSize;
                const key = `${chunkX},${chunkZ}`;
                try {
                    console.log(`Creating volumetric chunk at ${key}`);
                    const chunk = new VolumetricChunk(chunkX, chunkZ, chunkSize);
                    chunks.set(key, chunk);
                    console.log(`Chunk created with ${chunk.numCubes()} cubes`);
                }
                catch (error) {
                    console.error(`Failed to create volumetric chunk at ${key}:`, error);
                }
            }
        }
        // Update current chunk reference
        mc.currentChunk = `${playerChunkX},${playerChunkZ}`;
        console.log(`Replaced standard chunks with volumetric chunks`);
    }
    catch (error) {
        console.error("Error replacing chunks:", error);
    }
}
/**
 * Update the rendering system to use volumetric shaders
 */
function updateRenderSystem(minecraft) {
    try {
        console.log("Updating render system with volumetric shaders");
        // Access WebGL context
        const mc = minecraft;
        const gl = mc.ctx;
        if (!gl) {
            console.error("Failed to access WebGL context");
            return;
        }
        // Create cube geometry if it doesn't exist
        if (!mc.cubeGeometry) {
            mc.cubeGeometry = new Cube();
        }
        // Create a new render pass with volumetric shaders
        const volumetricRenderPass = new RenderPass(gl, volumetricCubeVSText, volumetricCubeFSText);
        // Setup the render pass
        setupRenderPass(volumetricRenderPass, minecraft);
        // Replace the existing render pass
        mc.blankCubeRenderPass = volumetricRenderPass;
        console.log("Volumetric render system initialized successfully");
    }
    catch (error) {
        console.error("Failed to update render system:", error);
    }
}
/**
 * Setup the volumetric render pass with attributes and uniforms
 */
function setupRenderPass(renderPass, minecraft) {
    // Access needed properties
    const mc = minecraft;
    const gl = mc.ctx;
    const cubeGeometry = mc.cubeGeometry;
    const gui = mc.gui;
    if (!gl || !cubeGeometry || !gui) {
        console.error("Missing required properties for render pass setup");
        return;
    }
    // Set index buffer data
    renderPass.setIndexBufferData(cubeGeometry.indicesFlat());
    // Add vertex attributes
    renderPass.addAttribute("aVertPos", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cubeGeometry.positionsFlat());
    renderPass.addAttribute("aNorm", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cubeGeometry.normalsFlat());
    renderPass.addAttribute("aUV", 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cubeGeometry.uvFlat());
    // Add instanced attributes
    renderPass.addInstancedAttribute("aOffset", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    renderPass.addInstancedAttribute("aBlockType", 1, gl.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    // Add uniforms
    renderPass.addUniform("uLightPos", (gl, loc) => {
        gl.uniform4fv(loc, mc.lightPosition.xyzw);
    });
    renderPass.addUniform("uTime", (gl, loc) => {
        gl.uniform1f(loc, mc.time);
    });
    renderPass.addUniform("uProj", (gl, loc) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(gui.projMatrix().all()));
    });
    renderPass.addUniform("uView", (gl, loc) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(gui.viewMatrix().all()));
    });
    // Add time of day uniform
    renderPass.addUniform("uTimeOfDay", (gl, loc) => {
        gl.uniform1f(loc, mc.timeOfDay || 0.25);
    });
    // Set draw data
    renderPass.setDrawData(gl.TRIANGLES, cubeGeometry.indicesFlat().length, gl.UNSIGNED_INT, 0);
    // Complete setup
    renderPass.setup();
}
/**
 * Override interaction methods to work with volumetric terrain
 */
function patchInteractionMethods(minecraft) {
    try {
        const mc = minecraft;
        // Save original methods
        const originalInteractWithBlock = mc.interactWithBlock;
        const originalUpdateChunks = mc.updateChunks;
        // Override interactWithBlock method
        mc.interactWithBlock = function (isRemove = false) {
            // Get the camera for ray casting
            const camera = mc.gui.getCamera();
            const cameraPos = camera.pos();
            const cameraDir = camera.forward().negate();
            // Normalize direction
            cameraDir.normalize();
            // Ray cast parameters
            const maxDistance = 5.0; // Maximum reach distance
            const stepSize = 0.1; // Ray step size
            console.log(`Ray casting from ${cameraPos.x},${cameraPos.y},${cameraPos.z} along ${cameraDir.x},${cameraDir.y},${cameraDir.z}`);
            // Ray marching to find target block
            for (let distance = 0; distance <= maxDistance; distance += stepSize) {
                const rayPos = new Vec3([
                    cameraPos.x + cameraDir.x * distance,
                    cameraPos.y + cameraDir.y * distance,
                    cameraPos.z + cameraDir.z * distance
                ]);
                // Find the chunk containing this point
                const chunkX = Math.floor(rayPos.x / mc.chunkSize) * mc.chunkSize;
                const chunkZ = Math.floor(rayPos.z / mc.chunkSize) * mc.chunkSize;
                const chunkKey = `${chunkX},${chunkZ}`;
                // If chunk exists, check for a block
                const chunk = mc.chunks.get(chunkKey);
                if (chunk) {
                    // For volumetric chunks, use specific methods
                    if (chunk instanceof VolumetricChunk) {
                        const blockType = chunk.getBlockAt(rayPos.x, rayPos.y, rayPos.z);
                        // If hit a non-air block
                        if (blockType !== null && blockType !== BlockType.AIR) {
                            console.log(`Hit block of type ${blockType} at ${rayPos.x.toFixed(1)},${rayPos.y.toFixed(1)},${rayPos.z.toFixed(1)}`);
                            if (isRemove) {
                                // Remove block - set to air
                                chunk.setBlockAt(rayPos.x, rayPos.y, rayPos.z, BlockType.AIR);
                                return true;
                            }
                            else {
                                // Place block - step back slightly from hit position
                                const placePos = new Vec3([
                                    rayPos.x - cameraDir.x * 0.5,
                                    rayPos.y - cameraDir.y * 0.5,
                                    rayPos.z - cameraDir.z * 0.5
                                ]);
                                // Choose block type - stone by default
                                const placeBlockType = BlockType.STONE;
                                // Place the block
                                chunk.setBlockAt(placePos.x, placePos.y, placePos.z, placeBlockType);
                                return true;
                            }
                        }
                    }
                    else {
                        // For standard chunks, use original method
                        // Get terrain height at this position
                        const terrainHeight = chunk.getHeightAt(rayPos.x, rayPos.z);
                        // If we hit a block (ray is below terrain)
                        if (terrainHeight >= 0 && rayPos.y <= terrainHeight) {
                            if (isRemove) {
                                // Create a small crater
                                mc.modifyTerrain(rayPos.x, rayPos.z, -1, 1);
                                return true;
                            }
                            else {
                                // Create a small mound
                                mc.modifyTerrain(rayPos.x, rayPos.z, 1, 1);
                                return true;
                            }
                        }
                    }
                }
            }
            return false; // No interaction happened
        };
        // Override updateChunks method to handle volumetric chunks
        mc.updateChunks = function () {
            const playerChunkX = Math.floor(mc.playerPosition.x / mc.chunkSize) * mc.chunkSize;
            const playerChunkZ = Math.floor(mc.playerPosition.z / mc.chunkSize) * mc.chunkSize;
            const newCurrentChunk = `${playerChunkX},${playerChunkZ}`;
            // If player moved to a new chunk
            if (newCurrentChunk !== mc.currentChunk) {
                mc.currentChunk = newCurrentChunk;
                // Get chunks to keep and chunks to add
                const chunksToKeep = new Set();
                // Generate grid of chunks around player
                for (let x = -1; x <= 1; x++) {
                    for (let z = -1; z <= 1; z++) {
                        // Skip corner chunks for better performance
                        if (Math.abs(x) === 1 && Math.abs(z) === 1)
                            continue;
                        const chunkX = playerChunkX + x * mc.chunkSize;
                        const chunkZ = playerChunkZ + z * mc.chunkSize;
                        const key = `${chunkX},${chunkZ}`;
                        chunksToKeep.add(key);
                        // Create new chunk if needed
                        if (!mc.chunks.has(key)) {
                            try {
                                console.log(`Creating new volumetric chunk at ${key}`);
                                const chunk = new VolumetricChunk(chunkX, chunkZ, mc.chunkSize);
                                mc.chunks.set(key, chunk);
                            }
                            catch (error) {
                                console.error(`Failed to create chunk at ${key}:`, error);
                            }
                        }
                    }
                }
                // Remove chunks that are too far away
                for (const key of mc.chunks.keys()) {
                    if (!chunksToKeep.has(key)) {
                        mc.chunks.delete(key);
                    }
                }
            }
        };
        console.log("Patched interaction methods successfully");
    }
    catch (error) {
        console.error("Error patching interaction methods:", error);
    }
}
//# sourceMappingURL=VolumetricIntegration.js.map
import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import { perlinCubeVSText, perlinCubeFSText } from "./Shaders.js";
import { Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
export class MinecraftAnimation extends CanvasAnimation {
    constructor(canvas) {
        super(canvas);
        // Gravity and jump parameters
        this.gravity = 9.8;
        this.jumpVelocity = 10.0;
        this.deltaTime = 0.016; // 60 FPS
        this.canvas2d = document.getElementById("textCanvas");
        this.ctx = Debugger.makeDebugContext(this.ctx);
        let gl = this.ctx;
        this.time = 0;
        this.chunks = new Map();
        this.chunkSize = 64;
        this.gui = new GUI(this.canvas2d, this);
        this.playerPosition = new Vec3([0, 100, 0]);
        this.playerVelocity = new Vec3([0, 0, 0]);
        this.isOnGround = false;
        this.gui.getCamera().setPos(this.playerPosition);
        // Initialize blank cube rendering
        this.blankCubeRenderPass = new RenderPass(gl, perlinCubeVSText, perlinCubeFSText);
        this.cubeGeometry = new Cube();
        this.initBlankCube();
        this.lightPosition = new Vec4([1000, 1000, 1000, 1]);
        this.backgroundColor = new Vec4([0.5, 0.8, 1.0, 1.0]); // Sky blue color
        // Generate initial chunk layout
        this.generateInitialChunks();
    }
    /**
     * Setup the simulation. This can be called again to reset the program.
     */
    reset() {
        this.gui.reset();
        // Reset player position and velocity
        this.playerPosition = new Vec3([0, 100, 0]);
        this.playerVelocity = new Vec3([0, 0, 0]);
        this.isOnGround = false;
        this.gui.getCamera().setPos(this.playerPosition);
        // Clear existing chunks
        this.chunks.clear();
        // Regenerate initial chunks
        this.generateInitialChunks();
    }
    /**
     * Generate chunks in a 3x3 grid around the player
     */
    generateInitialChunks() {
        const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
        const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
        this.currentChunk = `${playerChunkX},${playerChunkZ}`;
        // Generate 3x3 grid of chunks
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const chunkX = playerChunkX + x * this.chunkSize;
                const chunkZ = playerChunkZ + z * this.chunkSize;
                const key = `${chunkX},${chunkZ}`;
                if (!this.chunks.has(key)) {
                    const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
                    this.chunks.set(key, chunk);
                }
            }
        }
    }
    /**
     * Update chunks as player moves
     */
    updateChunks() {
        const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
        const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
        const newCurrentChunk = `${playerChunkX},${playerChunkZ}`;
        // If player moved to a new chunk
        if (newCurrentChunk !== this.currentChunk) {
            this.currentChunk = newCurrentChunk;
            // Get chunks to keep and chunks to add
            const chunksToKeep = new Set();
            // Generate 3x3 grid of chunks around player
            for (let x = -1; x <= 1; x++) {
                for (let z = -1; z <= 1; z++) {
                    const chunkX = playerChunkX + x * this.chunkSize;
                    const chunkZ = playerChunkZ + z * this.chunkSize;
                    const key = `${chunkX},${chunkZ}`;
                    chunksToKeep.add(key);
                    // Create new chunk if needed
                    if (!this.chunks.has(key)) {
                        const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
                        this.chunks.set(key, chunk);
                    }
                }
            }
            // Remove chunks that are too far away
            for (const key of this.chunks.keys()) {
                if (!chunksToKeep.has(key)) {
                    this.chunks.delete(key);
                }
            }
        }
    }
    /**
     * Check if player collides with terrain
     * Returns true if there's a collision
     */
    checkCollision(position) {
        // Player is modeled as a cylinder with radius 0.4 and height 2
        const playerRadius = 0.4;
        const playerHeight = 2.0;
        const checkPoints = [];
        // Add central bottom point
        checkPoints.push({
            x: position.x,
            y: position.y - playerHeight,
            z: position.z
        });
        // Add points around the cylinder at different heights
        // Use 8 points around the circle at 3 different heights
        const heights = [
            position.y - playerHeight, // Bottom
            position.y - playerHeight * 0.5, // Middle
            position.y - 0.2 // Near top
        ];
        for (const height of heights) {
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                checkPoints.push({
                    x: position.x + Math.cos(angle) * playerRadius,
                    y: height,
                    z: position.z + Math.sin(angle) * playerRadius
                });
            }
        }
        // Check all points for collision
        for (const point of checkPoints) {
            // Find the chunk containing this point
            const chunkX = Math.floor(point.x / this.chunkSize) * this.chunkSize;
            const chunkZ = Math.floor(point.z / this.chunkSize) * this.chunkSize;
            const chunkKey = `${chunkX},${chunkZ}`;
            // If chunk exists, check height
            const chunk = this.chunks.get(chunkKey);
            if (chunk) {
                const terrainHeight = chunk.getHeightAt(point.x, point.z);
                // Check collision with terrain
                if (terrainHeight >= 0 && point.y <= terrainHeight) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
    * Draws a single frame
    */
    draw() {
        // Update time for animated effects
        this.time += 1.0;
        // Update chunks if needed
        this.updateChunks();
        // Calculate terrain height beneath player
        const terrainHeight = this.getTerrainHeightBelow();
        const playerHeight = 2.0; // Height of player cylinder
        // Apply physics and handle terrain collisions
        this.applyPhysics(terrainHeight, playerHeight);
        // Update camera position
        this.gui.getCamera().setPos(this.playerPosition);
        // Drawing
        const gl = this.ctx;
        const bg = this.backgroundColor;
        gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.frontFace(gl.CCW);
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.drawScene(0, 0, 1280, 960);
    }
    /**
     * Get maximum terrain height below player (for standing on ground)
     */
    getTerrainHeightBelow() {
        const playerRadius = 0.4;
        let maxHeight = -Infinity;
        const checkPoints = [];
        // Add center point
        checkPoints.push({ x: this.playerPosition.x, z: this.playerPosition.z });
        // Add perimeter points
        for (let angleStep = 0; angleStep < 12; angleStep++) {
            const angle = (angleStep / 12) * Math.PI * 2;
            checkPoints.push({
                x: this.playerPosition.x + Math.cos(angle) * playerRadius,
                z: this.playerPosition.z + Math.sin(angle) * playerRadius
            });
        }
        // Check all points to find the highest terrain
        for (const point of checkPoints) {
            const chunkX = Math.floor(point.x / this.chunkSize) * this.chunkSize;
            const chunkZ = Math.floor(point.z / this.chunkSize) * this.chunkSize;
            const chunkKey = `${chunkX},${chunkZ}`;
            const chunk = this.chunks.get(chunkKey);
            if (chunk) {
                const terrainHeight = chunk.getHeightAt(point.x, point.z);
                if (terrainHeight > maxHeight) {
                    maxHeight = terrainHeight;
                }
            }
        }
        return maxHeight;
    }
    /**
     * Sets up the blank cube drawing
     */
    initBlankCube() {
        this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
        this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
        this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        // Add block type attribute
        this.blankCubeRenderPass.addInstancedAttribute("aBlockType", 1, this.ctx.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.blankCubeRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.blankCubeRenderPass.addUniform("uTime", (gl, loc) => {
            gl.uniform1f(loc, this.time);
        });
        this.blankCubeRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.blankCubeRenderPass.addUniform("uView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
        this.blankCubeRenderPass.setup();
    }
    /**
     * Apply physics to player movement including gravity, ground detection, and collisions
     */
    /**
    * Apply physics to player movement including gravity, ground detection, and collisions
    */
    applyPhysics(terrainHeight, playerHeight) {
        const COLLISION_EPSILON = 0.05;
        const MAX_STEP_HEIGHT = 0.5; // Maximum height player can step up
        // PART 1: Ground detection and vertical movement
        // Check if player is on ground
        const distanceToGround = this.playerPosition.y - playerHeight - terrainHeight;
        if (distanceToGround <= COLLISION_EPSILON) {
            // On ground
            this.isOnGround = true;
            this.playerPosition.y = terrainHeight + playerHeight;
            this.playerVelocity.y = 0;
        }
        else {
            // In air
            this.isOnGround = false;
            // Apply gravity
            this.playerVelocity.y -= this.gravity * this.deltaTime;
        }
        if (!this.isOnGround || this.playerVelocity.y > 0) {
            // Calculate new position with velocity
            const newY = this.playerPosition.y + this.playerVelocity.y * this.deltaTime;
            console.log("Vertical movement: velocity =", this.playerVelocity.y, "new Y =", newY, "delta =", newY - this.playerPosition.y);
            const newVerticalPos = new Vec3([
                this.playerPosition.x,
                newY,
                this.playerPosition.z
            ]);
            // Check for collision with ceiling/terrain above when jumping
            if (!this.checkCollision(newVerticalPos)) {
                // No collision, update position
                this.playerPosition.y = newY;
            }
            else {
                // Hit something - stop vertical movement
                this.playerVelocity.y = 0;
                // If moving downward and hit something, we're on ground
                if (this.playerVelocity.y < 0) {
                    this.isOnGround = true;
                }
            }
        }
        // PART 2: Horizontal movement with improved collision
        // Get movement direction
        const walkDirection = this.gui.walkDir();
        if (walkDirection.length() > 0) {
            const WALK_SPEED = 0.2;
            // First, try direct movement
            let targetX = this.playerPosition.x + walkDirection.x * WALK_SPEED;
            let targetZ = this.playerPosition.z + walkDirection.z * WALK_SPEED;
            // Create test position without changing Y (for level movement)
            let testPos = new Vec3([targetX, this.playerPosition.y, targetZ]);
            // Check if direct movement is possible
            if (!this.checkCollision(testPos)) {
                // Direct movement works - update position
                this.playerPosition.x = targetX;
                this.playerPosition.z = targetZ;
            }
            else {
                // Try step up (for climbing small blocks)
                const stepUpPos = new Vec3([
                    targetX,
                    this.playerPosition.y + MAX_STEP_HEIGHT,
                    targetZ
                ]);
                if (!this.checkCollision(stepUpPos)) {
                    // Can step up to this position
                    this.playerPosition.x = targetX;
                    this.playerPosition.z = targetZ;
                    this.playerPosition.y += MAX_STEP_HEIGHT;
                }
                else {
                    // Can't move combined, try separate X and Z
                    // Try X movement
                    const xPos = new Vec3([
                        targetX,
                        this.playerPosition.y,
                        this.playerPosition.z
                    ]);
                    if (!this.checkCollision(xPos)) {
                        this.playerPosition.x = targetX;
                    }
                    // Try Z movement
                    const zPos = new Vec3([
                        this.playerPosition.x,
                        this.playerPosition.y,
                        targetZ
                    ]);
                    if (!this.checkCollision(zPos)) {
                        this.playerPosition.z = targetZ;
                    }
                }
            }
        }
        // PART 3: Final ground adjustment
        // After movement, if on ground, snap to ground height
        if (this.isOnGround) {
            const newTerrainHeight = this.getTerrainHeightBelow();
            if (newTerrainHeight > -Infinity) {
                // Check if we're on a cliff/dropoff
                if (this.playerPosition.y - playerHeight - newTerrainHeight > 1.0) {
                    // We walked off a cliff, start falling
                    this.isOnGround = false;
                }
                else {
                    // Normal ground, adjust height
                    this.playerPosition.y = newTerrainHeight + playerHeight;
                }
            }
        }
        // Update camera position with player position
        this.gui.getCamera().setPos(this.playerPosition);
    }
    drawScene(x, y, width, height) {
        const gl = this.ctx;
        gl.viewport(x, y, width, height);
        // Render all chunks in the 3x3 grid around player
        for (const chunk of this.chunks.values()) {
            // Update instance buffers for this chunk
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            // Draw all cubes in this chunk
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
    }
    getGUI() {
        return this.gui;
    }
    jump() {
        console.log("Jump called, isOnGround:", this.isOnGround);
        // Only allow jumping when the player is on the ground
        if (this.isOnGround) {
            console.log("Initiating jump!");
            // Apply a strong upward impulse
            this.playerVelocity.y = this.jumpVelocity;
            // Immediately set isOnGround to false to prevent multiple jumps
            this.isOnGround = false;
            // Force an immediate position change to get off the ground
            this.playerPosition.y += 0.1; // Small boost to ensure we're not still touching
        }
    }
}
export function initializeCanvas() {
    const canvas = document.getElementById("glCanvas");
    /* Start drawing */
    const canvasAnimation = new MinecraftAnimation(canvas);
    canvasAnimation.start();
}
//# sourceMappingURL=App.js.map
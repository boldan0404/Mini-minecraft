import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {
  perlinCubeVSText,
  perlinCubeFSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;
  
  // Chunks management
  private chunks: Map<string, Chunk>;
  private currentChunk: string; // Key for current chunk
  private chunkSize: number;
  
  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  
  // Player's head position in world coordinate.
  // Player should extend two units down from this location, and 0.4 units radially.
  private playerPosition: Vec3;
  private playerVelocity: Vec3;
  private isOnGround: boolean;
  private time: number;

  // Gravity and jump parameters
  private readonly gravity: number = 9.8;
  private readonly jumpVelocity: number = 10.0;
  private readonly deltaTime: number = 0.016; // 60 FPS
    // day and night
    private timeOfDay: number = 0.25; // Start at sunrise
    private cycleSpeed: number = 0.01; // Control how fast time changes per frame
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
  
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
    
    this.time = 0;
    this.chunks = new Map<string, Chunk>();
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
  private updateDayNightCycle(): void {
    // Increment time based on speed
    this.timeOfDay += this.cycleSpeed;

    // Wrap around after 1.0 (24-hour cycle)
    if (this.timeOfDay > 1.0) {
      this.timeOfDay -= 1.0;
    }

    // Compute sun position
    const angle = this.timeOfDay * 2.0 * Math.PI;
    const sunX = Math.cos(angle) * 1000.0;
    const sunY = Math.sin(angle) * 1000.0;
    const sunZ = 100.0;

    // Simulate sunlight brightness
    const brightness = Math.max(0.2, sunY / 1000.0); // Clamp night brightness
    const ambientColor = new Vec4([brightness * 0.4, brightness * 0.4, brightness * 0.5, 1.0]);

    // Update global light position (for shaders)
    this.lightPosition = new Vec4([sunX, sunY, sunZ, 1.0]);

    // 🌈 Smoothly blend between night and day sky colors
    const nightSky = new Vec4([0.05, 0.02, 0.1, 1.0]); // deep purple
    const daySky = new Vec4([0.5, 0.8, 1.0, 1.0]);     // sky blue
    const blend = Math.max(0, Math.sin(this.timeOfDay * Math.PI));

    this.backgroundColor = new Vec4([
      daySky.x * blend + nightSky.x * (1 - blend),
      daySky.y * blend + nightSky.y * (1 - blend),
      daySky.z * blend + nightSky.z * (1 - blend),
      1.0
    ]);
  }

  public adjustCycleSpeed(delta: number): void {
    this.cycleSpeed = Math.max(0.0, this.cycleSpeed + delta);
    console.log(`Cycle speed now: ${this.cycleSpeed.toFixed(4)}`);
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {    
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
  private generateInitialChunks(): void {
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
  private updateChunks(): void {
    const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
    const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
    const newCurrentChunk = `${playerChunkX},${playerChunkZ}`;
    
    // If player moved to a new chunk
    if (newCurrentChunk !== this.currentChunk) {
      this.currentChunk = newCurrentChunk;
      
      // Get chunks to keep and chunks to add
      const chunksToKeep = new Set<string>();
      
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

  private checkThoroughCollision(position: Vec3): boolean {
    const playerRadius = 0.4;
    const playerHeight = 2.0;
    
    interface CheckPoint {
      x: number;
      y: number;
      z: number;
    }
    
    const checkPoints: CheckPoint[] = [];
    
    // Bottom central point
    const bottomY = position.y - playerHeight;
    checkPoints.push({
      x: position.x, 
      y: bottomY,
      z: position.z
    });
    
    // TARGETED FIX: More sample points at the bottom to catch thin terrain
    // Use more points around the perimeter
    const numBottomPerimeter = 16;
    for (let i = 0; i < numBottomPerimeter; i++) {
      const angle = (i / numBottomPerimeter) * Math.PI * 2;
      checkPoints.push({
        x: position.x + Math.cos(angle) * playerRadius,
        y: bottomY,
        z: position.z + Math.sin(angle) * playerRadius
      });
    }
    
    // Additional 9 interior points at bottom (in a grid)
    for (let rx = -1; rx <= 1; rx++) {
      for (let rz = -1; rz <= 1; rz++) {
        // Skip center point (already added)
        if (rx === 0 && rz === 0) continue;
        
        checkPoints.push({
          x: position.x + rx * playerRadius * 0.5,
          y: bottomY,
          z: position.z + rz * playerRadius * 0.5
        });
      }
    }
    
    // Body points at multiple heights
    const heights = [
      bottomY + 0.5,           // Lower
      bottomY + 1.0,           // Middle
      bottomY + 1.5           // Upper
    ];
    
    // Check each height
    for (const height of heights) {
      const numPointsInRing = 8;
      for (let i = 0; i < numPointsInRing; i++) {
        const angle = (i / numPointsInRing) * Math.PI * 2;
        checkPoints.push({
          x: position.x + Math.cos(angle) * playerRadius,
          y: height,
          z: position.z + Math.sin(angle) * playerRadius
        });
      }
    }
    
    // Check all points for collision with robust chunk handling
    for (const point of checkPoints) {
      // TARGETED FIX: More robust chunk lookup mechanism
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
      } else {
        // TARGETED FIX: Handle case when chunk doesn't exist
        // Try to use neighboring chunks' heights for safety
        // This helps prevent falling through at chunk boundaries
        
        // Check neighboring chunks in case we're near a boundary
        const neighborChunks = [
          `${chunkX - this.chunkSize},${chunkZ}`,
          `${chunkX + this.chunkSize},${chunkZ}`,
          `${chunkX},${chunkZ - this.chunkSize}`,
          `${chunkX},${chunkZ + this.chunkSize}`
        ];
        
        // Use nearby terrain height if available
        let nearbyHeight = -1;
        for (const neighborKey of neighborChunks) {
          const neighborChunk = this.chunks.get(neighborKey);
          if (neighborChunk) {
            // Use distance to boundary to approximate height
            const nearHeight = neighborChunk.getHeightAt(
              Math.max(Math.min(point.x, neighborChunk.getCenterX() + this.chunkSize/2 - 1), 
                      neighborChunk.getCenterX() - this.chunkSize/2 + 1),
              Math.max(Math.min(point.z, neighborChunk.getCenterZ() + this.chunkSize/2 - 1), 
                      neighborChunk.getCenterZ() - this.chunkSize/2 + 1)
            );
            
            if (nearHeight > nearbyHeight) {
              nearbyHeight = nearHeight;
            }
          }
        }
        
        // Check with approximated height
        if (nearbyHeight >= 0 && point.y <= nearbyHeight) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  
  private checkCollision(position: Vec3): boolean {
    // Player is modeled as a cylinder with radius 0.4 and height 2
    const playerRadius = 0.4;
    const playerHeight = 2.0;
    
    // Check points along the player's cylinder
    interface CheckPoint {
      x: number;
      y: number;
      z: number;
    }
    
    const checkPoints: CheckPoint[] = [];
    
    // Add central bottom point
    checkPoints.push({
      x: position.x, 
      y: position.y - playerHeight,
      z: position.z
    });
    
    // Add rings of points at multiple heights
    const bottomY = position.y - playerHeight;
    const heights = [
      bottomY,                       // Bottom
      position.y - playerHeight * 0.5, // Middle
      position.y - 0.2                // Top
    ];
    
    // Use more points at the bottom
    const numBottomPoints = 12;
    for (let i = 0; i < numBottomPoints; i++) {
      const angle = (i / numBottomPoints) * Math.PI * 2;
      checkPoints.push({
        x: position.x + Math.cos(angle) * playerRadius,
        y: bottomY,
        z: position.z + Math.sin(angle) * playerRadius
      });
    }
    
    // Add points at other heights
    for (let h = 1; h < heights.length; h++) {
      const height = heights[h];
      const numPoints = 8;
      
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
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
  public draw(): void {
    // Update time for animated effects
    this.time += 1.0;
    this.updateDayNightCycle();
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
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
  
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.drawScene(0, 0, 1280, 960);
    
  }
  
  private getTerrainHeightBelow(): number {
    const playerRadius = 0.4;
    let maxHeight = -Infinity;
    
    // Sample points under the player
    interface CheckPoint {
      x: number;
      z: number;
    }
    
    const checkPoints: CheckPoint[] = [];
    
    // Add center point
    checkPoints.push({x: this.playerPosition.x, z: this.playerPosition.z});
    
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

  private sampleTerrainHeight(x: number, z: number, currentMax: number): number {
    const chunkX = Math.floor(x / this.chunkSize) * this.chunkSize;
    const chunkZ = Math.floor(z / this.chunkSize) * this.chunkSize;
    const chunkKey = `${chunkX},${chunkZ}`;
    
    const chunk = this.chunks.get(chunkKey);
    if (chunk) {
      const terrainHeight = chunk.getHeightAt(x, z);
      if (terrainHeight > currentMax) {
        return terrainHeight;
      }
    }
    
    return currentMax;
  }
  
  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aNorm",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.normalsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.uvFlat()
    );
    
    this.blankCubeRenderPass.addInstancedAttribute("aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );
    
    // Add block type attribute
    this.blankCubeRenderPass.addInstancedAttribute("aBlockType",
      1,
      this.ctx.FLOAT,
      false,
      1 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    this.blankCubeRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    
    this.blankCubeRenderPass.addUniform("uTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.time);
    });
    
    this.blankCubeRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    
    this.blankCubeRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });
     // add day and night cycle
     this.blankCubeRenderPass.addUniform("uTimeOfDay",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.timeOfDay);
      });
    
    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();    
  }

  private applyPhysics(terrainHeight: number, playerHeight: number): void {
    const COLLISION_EPSILON = 0.05;
    const MAX_STEP_HEIGHT = 0.5; // Maximum height player can step up
    const MAX_VELOCITY = 20.0; // Cap maximum velocity to prevent extreme tunneling
    
    // Cap max velocity to prevent extreme tunneling
    this.playerVelocity.y = Math.max(Math.min(this.playerVelocity.y, MAX_VELOCITY), -MAX_VELOCITY);
    
    // CRITICAL SAFETY CHECKS
    // If player somehow got below terrain, immediately move them up
    if (this.playerPosition.y - playerHeight < terrainHeight - 0.1) {
      console.log("Emergency ground correction applied");
      this.playerPosition.y = terrainHeight + playerHeight + 0.2;
      this.playerVelocity.y = 0;
      this.isOnGround = true;
      
      // Skip further physics this frame to stabilize
      this.gui.getCamera().setPos(this.playerPosition);
      return;
    }
    
    // PART 1: Ground detection and vertical movement
    const distanceToGround = this.playerPosition.y - playerHeight - terrainHeight;
    
    // First check if we're on the ground
    if (distanceToGround <= COLLISION_EPSILON) {
      this.isOnGround = true;
      this.playerPosition.y = terrainHeight + playerHeight;
      this.playerVelocity.y = 0;
    } else {
      // In air
      this.isOnGround = false;
      // Apply gravity
      this.playerVelocity.y -= this.gravity * this.deltaTime;
    }
    
    if (!this.isOnGround || this.playerVelocity.y > 0) {
      // Calculate the intended movement for this frame
      const intendedYMovement = this.playerVelocity.y * this.deltaTime;
      
      // TARGETED FIX #1: Dynamically scale steps based on velocity magnitude
      // This ensures the step size is always small enough to catch thin terrain
      // When falling quickly, use many more steps
      const minSteps = Math.max(10, Math.ceil(Math.abs(intendedYMovement) / 0.05));
      const steps = minSteps;
      
      // Use continuous collision detection with multiple steps
      let finalY = this.playerPosition.y;
      let collided = false;
      const stepSize = intendedYMovement / steps;
      
      // Step through the movement incrementally
      for (let i = 1; i <= steps; i++) {
        const nextY = this.playerPosition.y + stepSize * i;
        const testPos = new Vec3([this.playerPosition.x, nextY, this.playerPosition.z]);
        
        // TARGETED FIX #2: Use enhanced collision detection when falling at high speeds
        const useEnhancedChecking = this.playerVelocity.y < -10.0;
        if ((useEnhancedChecking && this.checkThoroughCollision(testPos)) || 
            (!useEnhancedChecking && this.checkCollision(testPos))) {
          // Found a collision - stop here
          collided = true;
          break;
        }
        
        // No collision, this position is safe
        finalY = nextY;
      }
      
      // If we collided with something
      if (collided) {
        // If moving downward and collided, we hit the ground
        if (intendedYMovement < 0) {
          this.isOnGround = true;
        }
        
        // Stop vertical movement
        this.playerVelocity.y = 0;
      }
      
      // Update the player's Y position
      this.playerPosition.y = finalY;
      
      // TARGETED FIX #3: Additional safety check with robust ground sampling
      const heightBelowPlayer = this.getRobustTerrainHeightBelow();
      if (heightBelowPlayer > -Infinity && this.playerPosition.y - playerHeight < heightBelowPlayer) {
        console.log("Final safety correction applied");
        this.playerPosition.y = heightBelowPlayer + playerHeight;
        this.playerVelocity.y = 0;
        this.isOnGround = true;
      }
    }
    
    // PART 2: Horizontal movement with improved edge handling
    const walkDirection = this.gui.walkDir();
    
    if (walkDirection.length() > 0) {
      const WALK_SPEED = 0.2;
      
      // Calculate target position
      const targetX = this.playerPosition.x + walkDirection.x * WALK_SPEED;
      const targetZ = this.playerPosition.z + walkDirection.z * WALK_SPEED;
      
      // EDGE CASE FIX: Check if we're about to step off an edge
      if (this.isOnGround) {
        // Get the height at the target position
        const targetHeight = this.getTerrainHeightAtPosition(targetX, targetZ);
        
        // Check if there's a significant drop
        const heightDifference = terrainHeight - targetHeight;
        
        // If we'd fall more than 1 block and not a cliff (which would trigger falling)
        // This is specifically targeting the case of stepping off the edge of a block
        if (heightDifference > 0.5 && heightDifference <= 1.0) {
          // Pre-emptively get the heightmap below the edge
          const adjustedPos = new Vec3([
            this.playerPosition.x + walkDirection.x * 0.1, // Move just a tiny bit
            this.playerPosition.y,
            this.playerPosition.z + walkDirection.z * 0.1
          ]);
          
          // Check if taking a very small step would result in falling
          const probeHeight = this.getTerrainHeightAtPosition(
            adjustedPos.x, adjustedPos.z
          );
          
          // If even a small step would cause a drop, be more careful
          if (terrainHeight - probeHeight > 0.5) {
            // We're at an edge - move more carefully
            const safeSize = 0.05; // Much smaller steps
            let safeX = this.playerPosition.x;
            let safeZ = this.playerPosition.z;
            let stillOnGround = true;
            
            // Try incrementally moving toward target in small steps
            const numSteps = Math.ceil(WALK_SPEED / safeSize);
            for (let step = 1; step <= numSteps; step++) {
              const ratio = step / numSteps;
              const testX = this.playerPosition.x + walkDirection.x * WALK_SPEED * ratio;
              const testZ = this.playerPosition.z + walkDirection.z * WALK_SPEED * ratio;
              
              // Check height at this position
              const heightHere = this.getTerrainHeightAtPosition(testX, testZ);
              
              // If the height difference becomes too much, stop
              if (terrainHeight - heightHere > 0.5) {
                stillOnGround = false;
                break;
              }
              
              // This position is safe
              safeX = testX;
              safeZ = testZ;
            }
            
            // Update position to furthest safe point
            this.playerPosition.x = safeX;
            this.playerPosition.z = safeZ;
            
            // If still on ground, update Y to match terrain
            if (stillOnGround) {
              const finalHeight = this.getTerrainHeightAtPosition(safeX, safeZ);
              if (finalHeight > -Infinity) {
                this.playerPosition.y = finalHeight + playerHeight;
              }
            }
            
            // Skip the rest of movement code since we've handled it specially
            this.gui.getCamera().setPos(this.playerPosition);
            return;
          }
        }
      }
      
      // Normal movement proceeds if we're not at an edge
      // Use different collision strategies based on if we're on ground or in air
      if (this.isOnGround) {
        // When on ground, use simpler collision for smooth walking
        let canMoveX = true;
        let canMoveZ = true;
        
        // Check X movement
        const testPosX = new Vec3([targetX, this.playerPosition.y, this.playerPosition.z]);
        if (this.checkSimpleCollision(testPosX)) {
          canMoveX = false;
        }
        
        // Check Z movement
        const testPosZ = new Vec3([this.playerPosition.x, this.playerPosition.y, targetZ]);
        if (this.checkSimpleCollision(testPosZ)) {
          canMoveZ = false;
        }
        
        // Apply allowed movement
        if (canMoveX) {
          this.playerPosition.x = targetX;
        }
        
        if (canMoveZ) {
          this.playerPosition.z = targetZ;
        }
        
        // If both blocked, try stepping up
        if (!canMoveX && !canMoveZ) {
          const stepUpPos = new Vec3([
            targetX,
            this.playerPosition.y + MAX_STEP_HEIGHT,
            targetZ
          ]);
          
          if (!this.checkSimpleCollision(stepUpPos)) {
            this.playerPosition.x = targetX;
            this.playerPosition.z = targetZ;
            this.playerPosition.y += MAX_STEP_HEIGHT;
          }
        }
      } else {
        // In air - use more careful collision detection
        // Try combined movement first
        const testPos = new Vec3([targetX, this.playerPosition.y, targetZ]);
        if (!this.checkCollision(testPos)) {
          this.playerPosition.x = targetX;
          this.playerPosition.z = targetZ;
        } else {
          // Try X and Z separately
          const testPosX = new Vec3([targetX, this.playerPosition.y, this.playerPosition.z]);
          if (!this.checkCollision(testPosX)) {
            this.playerPosition.x = targetX;
          }
          
          const testPosZ = new Vec3([this.playerPosition.x, this.playerPosition.y, targetZ]);
          if (!this.checkCollision(testPosZ)) {
            this.playerPosition.z = targetZ;
          }
        }
      }
    }
    
    // PART 3: Final ground adjustment
    if (this.isOnGround) {
      const newTerrainHeight = this.getTerrainHeightBelow();
      
      if (newTerrainHeight > -Infinity) {
        // Check if we're on a cliff/dropoff
        if (this.playerPosition.y - playerHeight - newTerrainHeight > 1.0) {
          // We walked off a cliff, start falling
          this.isOnGround = false;
        } else {
          // Normal ground, adjust height to terrain
          this.playerPosition.y = newTerrainHeight + playerHeight;
        }
      }
    }
    
    // Update camera position with player position
    this.gui.getCamera().setPos(this.playerPosition);
  }
  private getTerrainHeightAtPosition(x: number, z: number): number {
    const chunkX = Math.floor(x / this.chunkSize) * this.chunkSize;
    const chunkZ = Math.floor(z / this.chunkSize) * this.chunkSize;
    const chunkKey = `${chunkX},${chunkZ}`;
    
    const chunk = this.chunks.get(chunkKey);
    
    if (chunk) {
      const height = chunk.getHeightAt(x, z);
      if (height >= 0) {
        return height;
      }
    }
    
    // If point is in a gap or missing chunk, check neighboring chunks
    const neighborChunks = [
      `${chunkX - this.chunkSize},${chunkZ}`,
      `${chunkX + this.chunkSize},${chunkZ}`,
      `${chunkX},${chunkZ - this.chunkSize}`,
      `${chunkX},${chunkZ + this.chunkSize}`,
      `${chunkX - this.chunkSize},${chunkZ - this.chunkSize}`,
      `${chunkX + this.chunkSize},${chunkZ - this.chunkSize}`,
      `${chunkX - this.chunkSize},${chunkZ + this.chunkSize}`,
      `${chunkX + this.chunkSize},${chunkZ + this.chunkSize}`
    ];
    
    // Find closest valid height from neighboring chunks
    let bestHeight = -Infinity;
    let bestDistance = Infinity;
    
    for (const neighborKey of neighborChunks) {
      const neighborChunk = this.chunks.get(neighborKey);
      if (neighborChunk) {
        // Find closest valid point in chunk
        const chunkCenterX = neighborChunk.getCenterX();
        const chunkCenterZ = neighborChunk.getCenterZ();
        const chunkSizeHalf = this.chunkSize / 2;
        
        // Clamp position to chunk bounds
        const clampedX = Math.max(Math.min(x, chunkCenterX + chunkSizeHalf - 1), 
                           chunkCenterX - chunkSizeHalf);
        const clampedZ = Math.max(Math.min(z, chunkCenterZ + chunkSizeHalf - 1), 
                           chunkCenterZ - chunkSizeHalf);
        
        // Calculate distance to clamped point
        const distance = Math.sqrt(
          Math.pow(x - clampedX, 2) + 
          Math.pow(z - clampedZ, 2)
        );
        
        // Get height at clamped position
        const height = neighborChunk.getHeightAt(clampedX, clampedZ);
        
        // If valid height and closer than previous best
        if (height >= 0 && distance < bestDistance) {
          bestHeight = height;
          bestDistance = distance;
        }
      }
    }
    
    return bestHeight;
  }  

  private checkSimpleCollision(position: Vec3): boolean {
    // Use a simpler collision model when walking
    const playerRadius = 0.4;
    const playerHeight = 2.0;
    
    interface CheckPoint {
      x: number;
      y: number;
      z: number;
    }
    
    const checkPoints: CheckPoint[] = [];
    
    // Add central bottom point
    checkPoints.push({
      x: position.x, 
      y: position.y - playerHeight,
      z: position.z
    });
    
    // Add just a few points around the perimeter
    const points = 8; // Use 8 points around the circle
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      checkPoints.push({
        x: position.x + Math.cos(angle) * playerRadius,
        y: position.y - playerHeight, // Bottom
        z: position.z + Math.sin(angle) * playerRadius
      });
      
      checkPoints.push({
        x: position.x + Math.cos(angle) * playerRadius,
        y: position.y - playerHeight/2, // Middle
        z: position.z + Math.sin(angle) * playerRadius
      });
    }
    
    // Check all points for collision
    for (const point of checkPoints) {
      const chunkX = Math.floor(point.x / this.chunkSize) * this.chunkSize;
      const chunkZ = Math.floor(point.z / this.chunkSize) * this.chunkSize;
      const chunkKey = `${chunkX},${chunkZ}`;
      
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


  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
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

  public getGUI(): GUI {
    return this.gui;
  }  

  private getRobustTerrainHeightBelow(): number {
    const playerRadius = 0.4;
    let maxHeight = -Infinity;
    
    // Sample points under the player
    interface CheckPoint {
      x: number;
      z: number;
    }
    
    const checkPoints: CheckPoint[] = [];
    
    // Add center point
    checkPoints.push({x: this.playerPosition.x, z: this.playerPosition.z});
    
    // TARGETED FIX: Better ground sampling with more points
    // Sample in a grid pattern plus perimeter
    // Center grid (3x3)
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue; // Skip center (already added)
        
        const x = this.playerPosition.x + i * playerRadius * 0.5;
        const z = this.playerPosition.z + j * playerRadius * 0.5;
        checkPoints.push({x, z});
      }
    }
    
    // Perimeter points (16 points around the circle)
    for (let angleStep = 0; angleStep < 16; angleStep++) {
      const angle = (angleStep / 16) * Math.PI * 2;
      const x = this.playerPosition.x + Math.cos(angle) * playerRadius;
      const z = this.playerPosition.z + Math.sin(angle) * playerRadius;
      checkPoints.push({x, z});
    }
    
    // Enhanced sampling with chunk boundary handling
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
      } else {
        // TARGETED FIX: Try neighbor chunks if exact chunk is missing
        // This helps prevent issues at chunk boundaries
        
        // Check neighboring chunks
        const neighborChunks = [
          `${chunkX - this.chunkSize},${chunkZ}`,
          `${chunkX + this.chunkSize},${chunkZ}`,
          `${chunkX},${chunkZ - this.chunkSize}`,
          `${chunkX},${chunkZ + this.chunkSize}`
        ];
        
        for (const neighborKey of neighborChunks) {
          const neighborChunk = this.chunks.get(neighborKey);
          if (neighborChunk) {
            // Check height at nearest valid point in neighbor
            const clampedX = Math.max(Math.min(point.x, 
                                  neighborChunk.getCenterX() + this.chunkSize/2 - 1), 
                                  neighborChunk.getCenterX() - this.chunkSize/2 + 1);
            const clampedZ = Math.max(Math.min(point.z, 
                                  neighborChunk.getCenterZ() + this.chunkSize/2 - 1), 
                                  neighborChunk.getCenterZ() - this.chunkSize/2 + 1);
            
            const neighborHeight = neighborChunk.getHeightAt(clampedX, clampedZ);
            if (neighborHeight > maxHeight) {
              maxHeight = neighborHeight;
            }
          }
        }
      }
    }
    
    return maxHeight;
  }
  
  public jump(): void {
    // Only allow jumping when the player is on the ground
    if (this.isOnGround) {
      // Apply a strong upward impulse
      this.playerVelocity.y = this.jumpVelocity;
      // Immediately set isOnGround to false to prevent multiple jumps
      this.isOnGround = false;
      
      // Force an immediate position change to get off the ground
      this.playerPosition.y += 0.15;
    }
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
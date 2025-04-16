export const perlinCubeVSText = `
    precision mediump float;
    
    uniform vec4 uLightPos;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    attribute float aBlockType;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float vBlockType;
    varying vec3 modelPos; // Added to track position for variation in texture
    
    void main () {
        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        modelPos = aVertPos.xyz; // Save model-space position for face detection
        normal = normalize(aNorm);
        uv = aUV;
        vBlockType = aBlockType;
    }
`;
export const perlinCubeFSText = `
 // ENHANCED Fragment Shader with More Obvious Time-Varying Perlin Noise
precision mediump float;

uniform vec4 uLightPos;
uniform float uTime;
uniform float uTimeOfDay; // Range [0.0, 1.0] where 0 is midnight, 0.5 is noon

varying vec4 normal;
varying vec4 wsPos;
varying vec2 uv;
varying float vBlockType;
varying vec3 modelPos;

// Random and noise utility functions
float random(in vec2 pt, in float seed) {
    return fract(sin((seed + dot(pt.xy, vec2(12.9898, 78.233)))) * 43758.5453123);
}

vec2 unit_vec(in vec2 xy, in float seed) {
    float theta = 6.28318530718 * random(xy, seed);
    return vec2(cos(theta), sin(theta));
}

// Improved mixing function for smooth derivatives
float smoothmix(float a0, float a1, float w) {
    return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
}

// Enhanced Perlin noise implementation with EXAGGERATED time variation
float perlin(in vec2 pt, in float seed, in float gridSize, in float timeOffset) {
    // ENHANCED: Much stronger time-based animation
    vec2 animatedPt = pt + vec2(sin(timeOffset * 0.03), cos(timeOffset * 0.04)) * 0.3;
    
    // Scale the point to the desired grid size
    vec2 scaledPt = animatedPt * gridSize;
    
    // Get integer grid cell coordinates
    vec2 grid = floor(scaledPt);
    
    // Get local coordinates within the grid cell [0,1]
    vec2 local = fract(scaledPt);
    
    // Get random gradients at the four corners with time seed variation
    // ENHANCED: Stronger seed variation over time
    float timeSeed = seed + sin(timeOffset * 0.005) * 0.5;
    vec2 gradTL = unit_vec(grid, timeSeed);
    vec2 gradTR = unit_vec(grid + vec2(1.0, 0.0), timeSeed);
    vec2 gradBL = unit_vec(grid + vec2(0.0, 1.0), timeSeed);
    vec2 gradBR = unit_vec(grid + vec2(1.0, 1.0), timeSeed);
    
    // Calculate distance vectors from corners to the point
    vec2 distTL = local;
    vec2 distTR = local - vec2(1.0, 0.0);
    vec2 distBL = local - vec2(0.0, 1.0);
    vec2 distBR = local - vec2(1.0, 1.0);
    
    // Calculate dot products for each corner
    float dotTL = dot(gradTL, distTL);
    float dotTR = dot(gradTR, distTR);
    float dotBL = dot(gradBL, distBL);
    float dotBR = dot(gradBR, distBR);
    
    // Use smoothmix instead of mix for smoother interpolation
    float topMix = smoothmix(dotTL, dotTR, local.x);
    float bottomMix = smoothmix(dotBL, dotBR, local.x);
    float finalMix = smoothmix(topMix, bottomMix, local.y);
    
    // Scale the result to approximately [-0.7, 0.7] range and then to [0, 1]
    return finalMix * 0.7071 + 0.5;
}

// Simplified perlin call for static textures (uses the original function)
float staticPerlin(in vec2 pt, in float seed, in float gridSize) {
    return perlin(pt, seed, gridSize, 0.0);
}

// ENHANCED: Grass texture with MUCH more obvious wind movement
vec3 grassTexture(vec2 uv, vec3 position) {
    // Base green color
    vec3 baseColor = vec3(0.3, 0.5, 0.2);
    
    // Use separate noise patterns
    float largeNoise = staticPerlin(uv, 123.456, 2.0);
    float smallNoise = staticPerlin(uv, 789.012, 8.0);
    
    // ENHANCED: Much stronger wind effect on grass tops
    float windFactor = 0.0;
    
    // Darken the sides of the block to make it look like dirt
    float isDirt = 0.0;
    if (abs(normal.y) < 0.1) { // Side faces
        isDirt = 1.0;
        baseColor = vec3(0.4, 0.3, 0.2); // Dirt color
        largeNoise = staticPerlin(uv, 456.789, 3.0);
        smallNoise = staticPerlin(uv, 321.654, 10.0);
    } else if (normal.y > 0.9) { // Top face - add ENHANCED wind animation
        // ENHANCED: Faster, more visible wind waves
        float windTime = uTime * 0.8;
        float windNoise = perlin(uv, 555.666, 3.0, windTime);
        // ENHANCED: Much stronger wind effect
        windFactor = sin(windTime + position.x * 0.2 + position.z * 0.2) * 0.5 + 0.5;
        windFactor *= windNoise * 0.7; // Increased from 0.3 to 0.7
    }
    
    // Add noise variations
    vec3 color = baseColor;
    color *= 0.7 + 0.5 * largeNoise;
    
    // ENHANCED: More obvious small details
    color += vec3(0.1) * (smallNoise - 0.5);
    
    // ENHANCED: More dramatic grass blade patterns to the top with animation
    if (normal.y > 0.9) {
        float bladePattern = perlin(uv * 20.0, 111.222, 5.0, uTime * 0.05); // Increased time factor
        float bladeMask = pow(bladePattern, 2.0) * 0.6; // Reduced exponent, increased intensity
        
        // ENHANCED: More obvious wind effect - make grass really sway
        vec3 windColor = vec3(0.4, 0.6, 0.3); // Brighter color for better contrast
        color = mix(color, windColor, windFactor * bladeMask);
        color += vec3(0.0, 0.15, 0.0) * bladeMask; // Increased intensity
    }
    
    // Day/night cycle effect
    float dayFactor = sin(uTimeOfDay * 3.14159);
    color *= 0.7 + 0.3 * dayFactor;
    
    return color;
}

// ENHANCED: Stone texture with more obvious subtle animation
vec3 stoneTexture(vec2 uv, vec3 position) {
    // Base stone color
    vec3 baseColor = vec3(0.5, 0.5, 0.5);
    
    // Multiple layers of noise - mostly static but with more obvious movement
    float largeNoise = staticPerlin(uv, 333.444, 2.0);
    
    // ENHANCED: Medium details with noticeable movement
    float medNoise = perlin(uv * 2.0, 555.666, 4.0, uTime * 0.02); // Added animation
    
    // ENHANCED: Small details with more obvious time variation - like dust or small particles
    float smallNoise = perlin(uv * 4.0, 777.888, 8.0, uTime * 0.03); // Increased time factor
    
    // Combine noise to create stone texture with more variation
    float stoneFactor = largeNoise * 0.5 + medNoise * 0.35 + smallNoise * 0.15;
    stoneFactor = stoneFactor * 0.7 + 0.7; // Increased contrast
    
    // ENHANCED: Create more obvious moving veins
    float veinNoise = perlin(uv * 3.0, 999.111, 5.0, uTime * 0.01); // Increased time factor
    float vein = smoothstep(0.5, 0.6, veinNoise); // Narrower range for more contrast
    
    // Adjust color with noise and veins
    vec3 color = baseColor * stoneFactor;
    color = mix(color, color * 0.6, vein); // Darker veins for contrast
    
    // ENHANCED: Add more obvious glitter/crystal effect that changes with time
    float glitterNoise = perlin(uv * 30.0, 222.333, 10.0, uTime * 0.3); // Faster animation
    float glitter = pow(glitterNoise, 10.0) * 0.6; // Less exponent, more intensity
    color += vec3(glitter);
    
    // Day/night cycle effect
    float dayFactor = sin(uTimeOfDay * 3.14159);
    color *= 0.7 + 0.3 * dayFactor;
    
    return color;
}

// ENHANCED: Water texture with much more obvious animation
vec3 waterTexture(vec2 uv, vec3 position) {
    // Base water color
    vec3 baseColor = vec3(0.1, 0.3, 0.7);
    
    // Day/night variation of water color
    float dayFactor = sin(uTimeOfDay * 3.14159);
    vec3 nightWater = vec3(0.05, 0.1, 0.3);
    vec3 dayWater = vec3(0.2, 0.4, 0.8);
    baseColor = mix(nightWater, dayWater, dayFactor);
    
    // ENHANCED: Much more obvious animated ripples - faster time for movement
    float time = uTime * 0.08; // Increased from 0.02 to 0.08
    
    // ENHANCED: Multiple wave patterns with increased amplitude
    float wave1 = perlin(uv + vec2(time, time * 0.7), 123.567, 3.0, time);
    float wave2 = perlin(uv + vec2(-time * 0.8, time * 0.5), 765.432, 4.0, time * 1.5);
    float wave3 = perlin(uv * 2.0 + vec2(time * 0.4, -time * 0.3), 246.135, 4.0, time * 0.7);
    
    // ENHANCED: Combine waves for the final effect - more dramatic motion
    float waterPattern = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * 1.3; // Scale up for more contrast
    
    // ENHANCED: Add stronger blue hue variations based on waves
    vec3 color = baseColor;
    color += vec3(-0.1, 0.0, 0.2) * (waterPattern - 0.5);
    
    // ENHANCED: Add larger reflective highlights that move with the waves
    float highlight = pow(waterPattern, 4.0) * 0.7; // Less exponent, more intensity
    
    // Make highlights color vary with time of day (white during day, blue at night)
    vec3 highlightColor = mix(vec3(0.3, 0.4, 0.8), vec3(1.0), dayFactor);
    color += highlightColor * highlight;
    
    // ENHANCED: Add more obvious foam at wave peaks
    float foam = smoothstep(0.65, 0.85, waterPattern); // Narrower range for more contrast
    color = mix(color, vec3(0.8, 0.9, 1.0), foam * 0.5); // Increased intensity
    
    // ENHANCED: Add more obvious depth effect based on position with animation
    float depth = 0.5 + 0.5 * sin(position.y * 0.2 + time * 0.2);
    color = mix(color, color * 0.6, depth * 0.4); // More contrast
    
    return color;
}

// ENHANCED: Snow texture with more obvious time-varying effects
vec3 snowTexture(vec2 uv, vec3 position) {
    // Base snow color
    vec3 baseColor = vec3(0.9, 0.9, 0.95);
    
    // Multiple noise patterns for snow texture
    float largeNoise = staticPerlin(uv, 111.222, 2.0);
    
    // ENHANCED: Small snow details with more obvious movement (like light snow falling or shifting)
    float smallNoise = perlin(uv * 6.0, 333.444, 10.0, uTime * 0.01); // Increased time factor
    
    // ENHANCED: Create more obvious sparkle effect that changes over time
    float sparkleTime = uTime * 0.15; // Increased from 0.05 to 0.15
    float sparkleNoise = perlin(uv * 20.0, 555.666 + sin(sparkleTime) * 100.0, 8.0, sparkleTime);
    float sparkle = pow(sparkleNoise, 8.0) * 1.0; // Less exponent, more intensity
    
    // ENHANCED: Time-varying frost patterns with more movement
    float frostPattern = perlin(uv * 4.0, 999.888, 5.0, uTime * 0.008); // Increased time factor
    float frost = smoothstep(0.4, 0.6, frostPattern) * 0.4; // Increased intensity
    
    // Combine noise patterns
    float snowPattern = largeNoise * 0.3 + smallNoise * 0.7;
    snowPattern = snowPattern * 0.15 + 0.92;
    
    // Apply subtle blue tint in crevices
    vec3 color = mix(baseColor, vec3(0.8, 0.85, 1.0), 1.0 - snowPattern);
    
    // ENHANCED: Add more obvious sparkles that change with time
    color += vec3(sparkle);
    
    // ENHANCED: Add more obvious frost patterns
    color = mix(color, vec3(0.85, 0.9, 1.0), frost);
    
    // Day/night cycle - snow is slightly blue at night
    float dayFactor = sin(uTimeOfDay * 3.14159);
    color = mix(vec3(0.7, 0.8, 0.95) * snowPattern, color, dayFactor * 0.7 + 0.3);
    
    return color;
}

// ENHANCED: Wood texture with more obvious subtle animation
vec3 woodTexture(vec2 uv, vec3 position) {
    // Wood colors
    vec3 lightWood = vec3(0.6, 0.4, 0.2);
    vec3 darkWood = vec3(0.3, 0.2, 0.1);
    
    // Create rings based on distance from center
    float distX = position.x - floor(position.x + 0.5);
    float distZ = position.z - floor(position.z + 0.5);
    float distFromCenter = sqrt(distX * distX + distZ * distZ);
    
    // ENHANCED: Add more obvious noise to the rings with more time variation
    float noiseScale = 8.0;
    float noise = perlin(uv * 10.0, 111.222, noiseScale, uTime * 0.005); // Increased time factor
    
    // ENHANCED: Create more animated ring pattern
    float ringPattern = sin((distFromCenter * 10.0 + position.y * 0.2 + noise * 2.0) * 6.28318) * 0.5 + 0.5;
    
    // ENHANCED: Add more obvious weathering effect that changes over time
    float weatherPattern = perlin(uv * 15.0, 789.456, 12.0, uTime * 0.01); // Increased time factor
    float weatherFactor = smoothstep(0.4, 0.6, weatherPattern) * 0.4; // Increased intensity
    
    // Mix light and dark wood colors based on the ring pattern
    vec3 color = mix(lightWood, darkWood, ringPattern);
    
    // ENHANCED: Add more noise variation to make it more animated
    float detailNoise = perlin(uv * 20.0, 333.444, 15.0, uTime * 0.003); // Increased time factor
    color *= 0.8 + detailNoise * 0.4; // More contrast
    
    // ENHANCED: Add more obvious weathering effect
    color = mix(color, vec3(0.5, 0.3, 0.2), weatherFactor);
    
    // Day/night cycle effect
    float dayFactor = sin(uTimeOfDay * 3.14159);
    color *= 0.7 + 0.3 * dayFactor;
    
    return color;
}

// ENHANCED: Leaf texture with much more obvious wind animation
vec3 leafTexture(vec2 uv, vec3 position) {
    // Base colors for leaves - green with variations
    vec3 lightLeaf = vec3(0.4, 0.6, 0.2);
    vec3 darkLeaf = vec3(0.2, 0.4, 0.1);
    
    // ENHANCED: Wind animation parameters with more movement
    float windSpeed = uTime * 0.15; // Increased from 0.05 to 0.15
    float windStrength = 0.4; // Increased from 0.15 to 0.4
    
    // ENHANCED: Wind effect varies with position to create more obvious wave-like movement
    float windEffect = sin(position.x * 0.3 + position.z * 0.4 + windSpeed) * windStrength;
    
    // ENHANCED: Add more turbulence to the wind
    float turbulence = perlin(uv * 5.0, 456.789, 4.0, windSpeed * 1.5) * 0.8; // Increased intensity
    windEffect += turbulence * 0.3; // Increased from 0.1 to 0.3
    
    // ENHANCED: Adjust UV based on wind for a more obvious "fluttering" effect
    vec2 windUV = uv + vec2(sin(windSpeed + uv.x * 10.0) * 0.04, cos(windSpeed + uv.y * 10.0) * 0.04);
    
    // Create veins and leaf structure with noise
    float noise1 = perlin(windUV, 777.888, 6.0, uTime * 0.005); // Increased time factor
    float noise2 = perlin(windUV * 3.0, 999.000, 12.0, uTime * 0.008); // Increased time factor
    
    // Combine noises for natural-looking pattern
    float pattern = noise1 * 0.7 + noise2 * 0.3;
    
    // ENHANCED: Mix colors based on pattern and wind effect with more contrast
    vec3 baseColor = mix(darkLeaf, lightLeaf, pattern);
    vec3 windColor = lightLeaf * 1.4; // Brighter color for wind-affected areas
    vec3 color = mix(baseColor, windColor, abs(windEffect) * 1.2); // Increased mix factor
    
    // ENHANCED: Add more random variations that change over time
    float variation = perlin(windUV * 25.0, 123.456 + position.x * 7.89, 20.0, uTime * 0.004);
    color *= 0.8 + variation * 0.4; // More contrast
    
    // ENHANCED: Add more obvious highlight that mimics sun shining through leaves
    float highlight = pow(pattern, 3.0) * 0.5; // Less exponent, more intensity
    color += vec3(0.15, 0.3, 0.08) * highlight * (0.5 + 0.5 * sin(uTime * 0.03 + position.x * 0.1));
    
    // Day/night cycle effect
    float dayFactor = sin(uTimeOfDay * 3.14159);
    color *= 0.6 + 0.4 * dayFactor;
    
    return color;
}

// Main shader function
void main() {
    // Choose texture based on block type and apply diffuse lighting
    vec3 kd;
    
    // Generate a block-specific seed from position for texture variation
    float blockSeed = wsPos.x * 1000.0 + wsPos.z * 0.1 + wsPos.y * 10.0;
    
    // Calculate a surface normal-based face ID for consistent texturing
    vec3 absNormal = abs(normal.xyz);
    float faceIdx = 0.0;
    
    // Determine which face we're on (top, sides, bottom)
    if (absNormal.y > 0.9) {
        faceIdx = normal.y > 0.0 ? 0.0 : 1.0; // Top or bottom
    } else if (absNormal.x > 0.9) {
        faceIdx = 2.0; // X-facing sides
    } else {
        faceIdx = 3.0; // Z-facing sides
    }
    
    // Use adjusted UVs based on face
    vec2 adjustedUV = uv;
    if (faceIdx >= 2.0) {
        // Rotate UVs for side faces to prevent obvious tiling patterns
        adjustedUV = faceIdx == 2.0 ? 
                      vec2(uv.y, uv.x) : 
                      vec2(uv.x, 1.0 - uv.y);
    }
    
    // Apply different procedural textures based on block type
    if (vBlockType < 0.5) {
        // Type 0: Grass
        kd = grassTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 1.5) {
        // Type 1: Stone
        kd = stoneTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 2.5) {
        // Type 2: Water
        kd = waterTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 3.5) {
        // Type 3: Snow
        kd = snowTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 4.5) {
        // Type 4: Wood
        kd = woodTexture(adjustedUV, wsPos.xyz);
    } else {
        // Type 5: Leaves
        kd = leafTexture(adjustedUV, wsPos.xyz);
    }
    
    // Enhanced day/night cycle lighting
    float ambientStrength = 0.2 + 0.6 * max(0.0, sin(uTimeOfDay * 3.14159));
    
    // Add atmospheric coloring based on time of day
    vec3 dayAtmosphere = vec3(1.0, 1.0, 1.0);
    vec3 nightAtmosphere = vec3(0.7, 0.8, 1.0); // Slightly blue night
    vec3 atmosphere = mix(nightAtmosphere, dayAtmosphere, max(0.0, sin(uTimeOfDay * 3.14159)));
    
    // Lighting calculation
    vec3 ka = kd * ambientStrength * atmosphere; // Ambient is based on diffuse with day/night atmosphere
    
    /* Compute light fall off */
    vec4 lightDirection = uLightPos - wsPos;
    float dot_nl = dot(normalize(lightDirection), normalize(normal));
    dot_nl = clamp(dot_nl, 0.0, 1.0);
    
    // Final color with enhanced day/night and atmospheric effects
    gl_FragColor = vec4(clamp(ka + dot_nl * kd * atmosphere, 0.0, 1.0), 1.0);
}
`;
export { volumetricCubeVSText, volumetricCubeFSText } from './UpdatedShaders.js';
//# sourceMappingURL=Shaders.js.map
// Export the shader code for volumetric cube rendering

export const volumetricCubeVSText = `
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
    varying vec3 modelPos; // Track position for texture variation
    
    void main () {
        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        modelPos = aVertPos.xyz; // Save model-space position for face detection
        normal = normalize(aNorm);
        uv = aUV;
        vBlockType = aBlockType;
    }
`;

export const volumetricCubeFSText = `
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
    
    // Perlin noise implementation
    float perlin(in vec2 pt, in float seed, in float gridSize) {
        // Scale the point to the desired grid size
        vec2 scaledPt = pt * gridSize;
        
        // Get integer grid cell coordinates
        vec2 grid = floor(scaledPt);
        
        // Get local coordinates within the grid cell [0,1]
        vec2 local = fract(scaledPt);
        
        // Get random gradients at the four corners
        vec2 gradTL = unit_vec(grid, seed);
        vec2 gradTR = unit_vec(grid + vec2(1.0, 0.0), seed);
        vec2 gradBL = unit_vec(grid + vec2(0.0, 1.0), seed);
        vec2 gradBR = unit_vec(grid + vec2(1.0, 1.0), seed);
        
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
    
    // 3D Noise functions for volumetric textures - simplified for performance
    float hash(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
    }
    
    // 3D value noise - simplified
    float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        
        // Smooth interpolation
        vec3 u = f * f * (3.0 - 2.0 * f);
        
        // Mix 8 corners - simplified for better performance
        float n000 = hash(i);
        float n001 = hash(i + vec3(0.0, 0.0, 1.0));
        float n010 = hash(i + vec3(0.0, 1.0, 0.0));
        float n011 = hash(i + vec3(0.0, 1.0, 1.0));
        float n100 = hash(i + vec3(1.0, 0.0, 0.0));
        float n101 = hash(i + vec3(1.0, 0.0, 1.0));
        float n110 = hash(i + vec3(1.0, 1.0, 0.0));
        float n111 = hash(i + vec3(1.0, 1.0, 1.0));
        
        // Interpolate along x
        float n00 = mix(n000, n100, u.x);
        float n01 = mix(n001, n101, u.x);
        float n10 = mix(n010, n110, u.x);
        float n11 = mix(n011, n111, u.x);
        
        // Interpolate along y
        float n0 = mix(n00, n10, u.y);
        float n1 = mix(n01, n11, u.y);
        
        // Interpolate along z
        return mix(n0, n1, u.z);
    }
    
    // Fractal Brownian Motion (FBM) for 3D texture - simplified
    float fbm(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        // Sum octaves of noise - reduced for better performance
        for (int i = 0; i < 3; i++) {
            if (i >= octaves) break;
            value += amplitude * noise3D(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
        }
        
        return value;
    }
    
    // Procedural texture for grass blocks
    vec3 grassTexture(vec2 uv, vec3 position) {
        // Base green color
        vec3 baseColor = vec3(0.3, 0.5, 0.2);
        
        // Use separate noise patterns
        float largeNoise = perlin(uv, 123.456, 2.0); // Large scale variation
        float smallNoise = perlin(uv, 789.012, 8.0); // Small scale details
        
        // Darken the sides of the block to make it look like dirt
        float isDirt = 0.0;
        if (abs(normal.y) < 0.1) { // Side faces
            isDirt = 1.0;
            baseColor = vec3(0.4, 0.3, 0.2); // Dirt color
            largeNoise = perlin(uv, 456.789, 3.0);
            smallNoise = perlin(uv, 321.654, 10.0);
        }
        
        // Add noise variations
        vec3 color = baseColor;
        color *= 0.7 + 0.5 * largeNoise; // Large scale shading
        color += vec3(0.05) * (smallNoise - 0.5); // Small details
        
        // Add some grass blade patterns to the top
        if (normal.y > 0.9) {
            float bladePattern = perlin(uv * 20.0, 111.222, 5.0);
            float bladeMask = pow(bladePattern, 3.0) * 0.3;
            color += vec3(0.0, 0.1, 0.0) * bladeMask;
        }
        
        return color;
    }
    
    // Procedural texture for stone blocks
    vec3 stoneTexture(vec2 uv, vec3 position) {
        // Base stone color
        vec3 baseColor = vec3(0.5, 0.5, 0.5);
        
        // Multiple layers of noise
        float largeNoise = perlin(uv, 333.444, 2.0); // Large scale variation
        float medNoise = perlin(uv * 2.0, 555.666, 4.0); // Medium details
        float smallNoise = perlin(uv * 4.0, 777.888, 8.0); // Small details
        
        // Combine noise to create stone texture
        float stoneFactor = largeNoise * 0.5 + medNoise * 0.35 + smallNoise * 0.15;
        stoneFactor = stoneFactor * 0.6 + 0.7; // Scale and adjust base brightness
        
        // Create occasional darker veins
        float veinNoise = perlin(uv * 3.0, 999.111, 5.0);
        float vein = smoothstep(0.55, 0.65, veinNoise);
        
        // Adjust color with noise and veins
        vec3 color = baseColor * stoneFactor;
        color = mix(color, color * 0.7, vein); // Apply dark veins
        
        return color;
    }
    
    // Procedural texture for water blocks
    vec3 waterTexture(vec2 uv, vec3 position) {
        // Base water color
        vec3 baseColor = vec3(0.1, 0.3, 0.7);
        
        // Animated ripples
        float time = uTime * 0.01; // Slow time factor
        
        // Multiple wave patterns in different directions
        float wave1 = perlin(uv + vec2(time, time * 0.7), 123.567, 4.0);
        float wave2 = perlin(uv + vec2(-time * 0.8, time * 0.5), 765.432, 5.0);
        
        // Combine waves for the final effect
        float waterPattern = (wave1 * 0.6 + wave2 * 0.4);
        
        // Add slight blue hue variations
        vec3 color = baseColor;
        color += vec3(-0.05, 0.0, 0.1) * (waterPattern - 0.5);
        
        // Add reflective highlights
        float highlight = pow(waterPattern, 4.0) * 0.3;
        color += vec3(highlight);
        
        return color;
    }
    
    // Procedural texture for snow blocks
    vec3 snowTexture(vec2 uv, vec3 position) {
        // Base snow color
        vec3 baseColor = vec3(0.9, 0.9, 0.95);
        
        // Multiple noise patterns for snow texture
        float largeNoise = perlin(uv, 111.222, 2.0); // Large undulations
        float smallNoise = perlin(uv * 6.0, 333.444, 10.0); // Small snow details
        
        // Create sparkle effect
        float sparkleNoise = perlin(uv * 20.0, 555.666 + uTime * 0.01, 8.0);
        float sparkle = pow(sparkleNoise, 16.0) * 0.5;
        
        // Combine noise patterns
        float snowPattern = largeNoise * 0.3 + smallNoise * 0.7;
        snowPattern = snowPattern * 0.15 + 0.92; // Scale to make mostly white
        
        // Apply subtle blue tint in crevices
        vec3 color = mix(baseColor, vec3(0.8, 0.85, 1.0), 1.0 - snowPattern);
        
        // Add sparkles
        color += vec3(sparkle);
        
        return color;
    }
    
    // Wood texture procedural function
    vec3 woodTexture(vec2 uv, vec3 position) {
        // Wood colors
        vec3 lightWood = vec3(0.6, 0.4, 0.2);
        vec3 darkWood = vec3(0.3, 0.2, 0.1);
        
        // Create rings based on distance from center
        float distX = position.x - floor(position.x + 0.5);
        float distZ = position.z - floor(position.z + 0.5);
        float distFromCenter = sqrt(distX * distX + distZ * distZ);
        
        // Add some noise to the rings
        float noiseScale = 8.0;
        float noise = perlin(uv * 10.0, 111.222, noiseScale) * 0.1;
        
        // Create ring pattern
        float ringPattern = sin((distFromCenter * 10.0 + position.y * 0.2 + noise) * 6.28318) * 0.5 + 0.5;
        
        // Mix light and dark wood colors based on the ring pattern
        vec3 color = mix(lightWood, darkWood, ringPattern);
        
        // Add some noise variation to make it more natural
        float detailNoise = perlin(uv * 20.0, 333.444, 15.0);
        color *= 0.9 + detailNoise * 0.2;
        
        return color;
    }
    
    // Leaf texture procedural function
    vec3 leafTexture(vec2 uv, vec3 position) {
        // Base colors for leaves - green with variations
        vec3 lightLeaf = vec3(0.4, 0.6, 0.2);
        vec3 darkLeaf = vec3(0.2, 0.4, 0.1);
        
        // Create veins and leaf structure with noise
        float noise1 = perlin(uv, 777.888, 6.0);
        float noise2 = perlin(uv * 3.0, 999.000, 12.0);
        
        // Combine noises for natural-looking pattern
        float pattern = noise1 * 0.7 + noise2 * 0.3;
        
        // Mix colors based on pattern
        vec3 color = mix(darkLeaf, lightLeaf, pattern);
        
        // Add small random variations
        float variation = perlin(uv * 25.0, 123.456 + position.x * 7.89, 20.0);
        color *= 0.9 + variation * 0.2;
        
        // Animate subtle wind movement
        float windEffect = sin(position.x * 0.1 + position.z * 0.1 + uTime * 0.01) * 0.05;
        color *= 0.95 + windEffect;
        
        return color;
    }
    
    // Procedural texture for dirt blocks
    vec3 dirtTexture(vec2 uv, vec3 position) {
        // Base dirt color
        vec3 baseColor = vec3(0.4, 0.3, 0.2);
        
        // Multiple layers of noise
        float largeNoise = perlin(uv, 444.555, 2.0);
        float smallNoise = perlin(uv * 5.0, 666.777, 8.0);
        
        // Combine noise to create soil texture
        vec3 color = baseColor;
        color *= 0.8 + largeNoise * 0.3; // Large scale shading
        color += vec3(0.03) * (smallNoise - 0.5); // Small details
        
        // Add small pebbles and soil chunks
        float pebblePattern = perlin(uv * 15.0, 888.999, 10.0);
        if (pebblePattern > 0.75) {
            color *= 0.9; // Darker pebbles
        }
        
        return color;
    }
    
    // Procedural texture for sand blocks
    vec3 sandTexture(vec2 uv, vec3 position) {
        // Base sand color
        vec3 baseColor = vec3(0.76, 0.7, 0.5);
        
        // Multiple layers of noise
        float largeNoise = perlin(uv, 222.333, 2.0); // Large dunes
        float medNoise = perlin(uv * 5.0, 444.555, 6.0); // Medium grains
        float smallNoise = perlin(uv * 20.0, 666.777, 16.0); // Small grains
        
        // Combine noise layers
        float sandPattern = largeNoise * 0.5 + medNoise * 0.3 + smallNoise * 0.2;
        
        // Adjust base color with pattern
        vec3 color = baseColor * (0.8 + sandPattern * 0.4);
        
        // Add occasional darker specs for small pebbles or shells
        float specNoise = perlin(uv * 30.0, 888.999, 20.0);
        if (specNoise > 0.85) {
            color *= 0.8;
        }
        
        return color;
    }
    
    // Ore textures - simplified versions for better performance
    
    // Coal ore texture
    vec3 coalTexture(vec2 uv, vec3 position) {
        // Stone base with coal seams
        vec3 stoneColor = stoneTexture(uv, position);
        vec3 coalColor = vec3(0.1, 0.1, 0.1); // Very dark
        
        // Create coal seam pattern
        float seamNoise = perlin(uv * 3.0, 123.456, 3.0);
        float seamPattern = smoothstep(0.4, 0.5, seamNoise);
        
        // Mix stone and coal
        return mix(stoneColor, coalColor, seamPattern);
    }
    
    // Iron ore texture
    vec3 ironTexture(vec2 uv, vec3 position) {
        // Stone base with iron deposits
        vec3 stoneColor = stoneTexture(uv, position);
        vec3 ironColor = vec3(0.55, 0.37, 0.25); // Rusty iron color
        
        // Create iron deposit pattern
        float depositNoise = perlin(uv * 3.5, 456.789, 3.0);
        float depositPattern = smoothstep(0.5, 0.6, depositNoise);
        
        // Mix stone and iron
        return mix(stoneColor, ironColor, depositPattern);
    }
    
    // Gold ore texture
    vec3 goldTexture(vec2 uv, vec3 position) {
        // Stone base with gold veins
        vec3 stoneColor = stoneTexture(uv, position);
        vec3 goldColor = vec3(0.9, 0.8, 0.0); // Gold color
        
        // Create gold vein pattern
        float veinNoise = perlin(uv * 4.0, 789.012, 3.0);
        float veinPattern = smoothstep(0.65, 0.7, veinNoise);
        
        // Mix stone and gold
        return mix(stoneColor, goldColor, veinPattern);
    }
    
    // Diamond ore texture
    vec3 diamondTexture(vec2 uv, vec3 position) {
        // Stone base with diamond crystals
        vec3 stoneColor = stoneTexture(uv, position);
        vec3 diamondColor = vec3(0.7, 0.9, 1.0); // Light blue diamond color
        
        // Create diamond crystal pattern
        float crystalNoise = perlin(uv * 4.5, 345.678, 3.0);
        float crystalPattern = smoothstep(0.75, 0.8, crystalNoise);
        
        // Mix stone and diamond
        vec3 color = mix(stoneColor, diamondColor, crystalPattern);
        
        // Add some sparkle
        float sparkle = pow(perlin(uv * 20.0, 999.888 + uTime * 0.02, 16.0), 16.0) * crystalPattern;
        color += vec3(sparkle);
        
        return color;
    }
    
    // Lava texture
    vec3 lavaTexture(vec2 uv, vec3 position) {
        // Animated time for flowing lava
        float time = uTime * 0.005;
        
        // Base lava colors
        vec3 darkLava = vec3(0.5, 0.0, 0.0); // Dark red
        vec3 midLava = vec3(0.8, 0.2, 0.0);  // Medium orange-red
        vec3 brightLava = vec3(1.0, 0.6, 0.0); // Bright orange
        
        // Create flowing lava pattern
        float flow1 = perlin(uv + vec2(time * 0.5, time * 0.2), 123.456, 2.0);
        float flow2 = perlin(uv + vec2(-time * 0.3, time * 0.4), 789.012, 3.0);
        
        // Combine flows for dynamic pattern
        float lavaPattern = flow1 * 0.6 + flow2 * 0.4;
        
        // Create "cracks" in the lava surface
        float crackNoise = perlin(uv * 3.0, 456.789, 3.0);
        float cracks = smoothstep(0.4, 0.6, crackNoise);
        
        // Mix colors based on patterns
        vec3 color = mix(darkLava, midLava, lavaPattern);
        color = mix(color, brightLava, pow(lavaPattern, 2.0) * 0.8);
        
        // Darken cracks
        color = mix(color, darkLava, cracks * 0.7);
        
        // Add glow and emissive effect
        float glow = sin(uTime * 0.01) * 0.1 + 0.9; // Pulsing glow
        color *= glow;
        
        // Add bright spots/embers
        float hotspots = pow(perlin(uv * 5.0 + time, 333.444, 8.0), 3.0) * 0.7;
        color += vec3(1.0, 0.6, 0.0) * hotspots;
        
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
        // The vBlockType values should match the BlockType enum in the VolumetricTerrain class
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
        } else if (vBlockType < 5.5) {
            // Type 5: Leaves
            kd = leafTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 6.5) {
            // Type 6: Dirt
            kd = dirtTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 7.5) {
            // Type 7: Sand
            kd = sandTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 8.5) {
            // Type 8: Coal
            kd = coalTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 9.5) {
            // Type 9: Iron
            kd = ironTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 10.5) {
            // Type 10: Gold
            kd = goldTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 11.5) {
            // Type 11: Diamond
            kd = diamondTexture(adjustedUV, wsPos.xyz);
        } else if (vBlockType < 12.5) {
            // Type 12: Lava
            kd = lavaTexture(adjustedUV, wsPos.xyz);
            
            // Add emissive glow for lava
            vec3 ka = kd * 0.8; // Strong ambient for emissive effect
            gl_FragColor = vec4(ka, 1.0);
            return; // Early exit for lava since it's self-illuminating
        } else {
            // Default: Stone as fallback
            kd = stoneTexture(adjustedUV, wsPos.xyz);
        }
        
        // Ambient light varies with time of day
        float ambientStrength = 0.2 + 0.6 * max(0.0, sin(uTimeOfDay * 3.14159));
        
        // Add moonlight at night
        if (uTimeOfDay < 0.25 || uTimeOfDay > 0.75) {
            float moonFactor = uTimeOfDay < 0.25 ? 
                           (0.25 - uTimeOfDay) / 0.25 : 
                           (uTimeOfDay - 0.75) / 0.25;
            ambientStrength = max(ambientStrength, moonFactor * 0.3); // Soft moonlight
        }
        
        // Lighting calculation
        vec3 ka = kd * ambientStrength; // Ambient is based on diffuse
        
        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
        dot_nl = clamp(dot_nl, 0.0, 1.0);
        
        // Light color changes with time of day
        vec3 lightColor = vec3(1.0, 1.0, 0.9); // Default daylight
        
        // Sunrise/sunset: orange-red light
        if (uTimeOfDay < 0.3 || uTimeOfDay > 0.7) {
            float sunsetFactor = uTimeOfDay < 0.3 ? 
                            (0.3 - uTimeOfDay) / 0.3 : 
                            (uTimeOfDay - 0.7) / 0.3;
            vec3 sunsetColor = vec3(1.0, 0.6, 0.3);
            lightColor = mix(lightColor, sunsetColor, sunsetFactor * 0.8);
        }
        
        gl_FragColor = vec4(clamp(ka + dot_nl * kd * lightColor, 0.0, 1.0), 1.0);
    }
`;
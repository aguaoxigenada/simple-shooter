// Helper script to generate test level JSON
import { randomUUID } from 'crypto';

function generateUUID() {
    return randomUUID();
}

// Helper to create transformation matrix from position and rotation
function createMatrix(x, y, z, rotX = 0, rotY = 0, rotZ = 0) {
    // For simplicity, we'll use identity matrix with translation
    // For rotations, we'd need to compute rotation matrices
    // For now, assuming no rotation except for ground plane
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

// Ground plane rotated -90 degrees on X axis
function createGroundMatrix() {
    // Rotation -90° on X: [1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1]
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
}

const geometries = [];
const materials = [];
const objects = [];

// Ground plane geometry (200x200)
const groundGeoUuid = generateUUID();
geometries.push({
    uuid: groundGeoUuid,
    type: "PlaneGeometry",
    width: 200,
    height: 200,
    widthSegments: 1,
    heightSegments: 1
});

// Ground material (0x90EE90 = light green)
const groundMatUuid = generateUUID();
materials.push({
    uuid: groundMatUuid,
    type: "MeshStandardMaterial",
    color: 0x90EE90,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    envMapRotation: [0, 0, 0, "XYZ"],
    envMapIntensity: 1,
    blendColor: 0
});

// Ground mesh
const groundUuid = generateUUID();
objects.push({
    uuid: groundUuid,
    type: "Mesh",
    name: "Ground",
    layers: 1,
    matrix: createGroundMatrix(),
    up: [0, 1, 0],
    geometry: groundGeoUuid,
    material: groundMatUuid
});

// Box geometry (reused for walls and boxes)
const boxGeoUuid = generateUUID();
geometries.push({
    uuid: boxGeoUuid,
    type: "BoxGeometry",
    width: 1,
    height: 1,
    depth: 1,
    widthSegments: 1,
    heightSegments: 1,
    depthSegments: 1
});

// Wall material (0x696969 = gray)
const wallMatUuid = generateUUID();
materials.push({
    uuid: wallMatUuid,
    type: "MeshStandardMaterial",
    color: 0x696969,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    envMapRotation: [0, 0, 0, "XYZ"],
    envMapIntensity: 1,
    blendColor: 0
});

// Cover box material (0x8B4513 = brown)
const coverMatUuid = generateUUID();
materials.push({
    uuid: coverMatUuid,
    type: "MeshStandardMaterial",
    color: 0x8B4513,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    envMapRotation: [0, 0, 0, "XYZ"],
    envMapIntensity: 1,
    blendColor: 0
});

// Staircase material (0x777777 = gray)
const stairMatUuid = generateUUID();
materials.push({
    uuid: stairMatUuid,
    type: "MeshStandardMaterial",
    color: 0x777777,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    envMapRotation: [0, 0, 0, "XYZ"],
    envMapIntensity: 1,
    blendColor: 0
});

// Ladder material (0xBBBBBB = light gray)
const ladderMatUuid = generateUUID();
materials.push({
    uuid: ladderMatUuid,
    type: "MeshStandardMaterial",
    color: 0xBBBBBB,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    envMapRotation: [0, 0, 0, "XYZ"],
    envMapIntensity: 1,
    blendColor: 0
});

// Helper to create box mesh
function createBoxMesh(name, x, y, z, width, height, depth, materialUuid) {
    const uuid = generateUUID();
    // Create geometry for this specific size
    const geoUuid = generateUUID();
    geometries.push({
        uuid: geoUuid,
        type: "BoxGeometry",
        width: width,
        height: height,
        depth: depth,
        widthSegments: 1,
        heightSegments: 1,
        depthSegments: 1
    });
    
    objects.push({
        uuid: uuid,
        type: "Mesh",
        name: name,
        layers: 1,
        matrix: createMatrix(x, y, z),
        up: [0, 1, 0],
        geometry: geoUuid,
        material: materialUuid
    });
}

// Walls
createBoxMesh("Wall-East", 10, 1, 0, 20, 2, 1, wallMatUuid);
createBoxMesh("Wall-West", -10, 1, 0, 20, 2, 1, wallMatUuid);
createBoxMesh("Wall-North", 0, 1, 10, 1, 2, 20, wallMatUuid);
createBoxMesh("Wall-South", 0, 1, -10, 1, 2, 20, wallMatUuid);

// Cover boxes
createBoxMesh("CoverBox1", 5, 1, 5, 2, 2, 2, coverMatUuid);
createBoxMesh("CoverBox2", -5, 1, -5, 2, 2, 2, coverMatUuid);
createBoxMesh("CoverBox3", 8, 1, -7, 1.5, 2, 1.5, coverMatUuid);
createBoxMesh("CoverBox4", -8, 1, 7, 1.5, 2, 1.5, coverMatUuid);

// Staircase steps (5 steps going north)
// Step parameters: x=-2, z=0, stepCount=5, stepWidth=3, stepHeight=0.4, stepDepth=0.7, direction='north'
const stepWidth = 3;
const stepHeight = 0.4;
const stepDepth = 0.7;
const startX = -2;
const startZ = 0;

for (let i = 0; i < 5; i++) {
    const stepCenterX = startX;
    const stepCenterZ = startZ + (i + 0.5) * stepDepth;
    const stepCenterY = (i + 1) * stepHeight - stepHeight / 2;
    createBoxMesh(`StairStep${i + 1}`, stepCenterX, stepCenterY, stepCenterZ, stepWidth, stepHeight, stepDepth, stairMatUuid);
}

// Platform
const platformCenterX = startX;
const platformCenterZ = startZ + (5 * stepDepth + 2) / 2;
const platformY = 5 * stepHeight + stepHeight / 2;
createBoxMesh("StairPlatform", platformCenterX, platformY, platformCenterZ, stepWidth, stepHeight, 2, stairMatUuid);

// Ladder
createBoxMesh("Ladder", 5, 1.2, 4.2, 0.45, 2.4, 0.3, ladderMatUuid);

// Camera (from scene.js)
const cameraUuid = generateUUID();
const cameraMatrix = [0.860268629274756, -3.469446951953614e-18, -0.5098410394286953, 0, -0.060349594635279044, 0.9929696256119419, -0.10182950966904185, 0, 0.5062566660431148, 0.11836943276065821, 0.8542206187366529, 0, 3, 1.6, 3, 1];

// Scene object
const sceneUuid = generateUUID();
const sceneObject = {
    uuid: sceneUuid,
    type: "Scene",
    name: "Scene",
    layers: 1,
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    up: [0, 1, 0],
    children: objects.map(obj => obj.uuid),
    backgroundRotation: [0, 0, 0, "XYZ"],
    environmentRotation: [0, 0, 0, "XYZ"]
};

// Final JSON structure
const levelJson = {
    metadata: {},
    project: {
        shadows: true,
        shadowType: 1,
        toneMapping: 0,
        toneMappingExposure: 1
    },
    camera: {
        metadata: {
            version: 4.7,
            type: "Object",
            generator: "Object3D.toJSON"
        },
        object: {
            uuid: cameraUuid,
            type: "PerspectiveCamera",
            name: "Camera",
            layers: 1,
            matrix: cameraMatrix,
            up: [0, 1, 0],
            fov: 50,
            zoom: 1,
            near: 0.1,
            far: 2000,
            focus: 10,
            aspect: 1.4937027707808563,
            filmGauge: 35,
            filmOffset: 0
        }
    },
    scene: {
        metadata: {
            version: 4.7,
            type: "Object",
            generator: "Object3D.toJSON"
        },
        geometries: geometries,
        materials: materials,
        object: {
            ...sceneObject,
            children: objects
        }
    },
    scripts: {},
    history: {
        undos: [],
        redos: []
    },
    environment: null
};

console.log(JSON.stringify(levelJson, null, 2));

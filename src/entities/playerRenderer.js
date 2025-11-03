// Renders player visual representations (for multiplayer)
import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { PLAYER } from '../shared/constants.js';

export class PlayerRenderer {
    constructor(playerEntity) {
        this.entity = playerEntity;
        this.group = new THREE.Group();
        this.nameTag = null;
        this.healthBar = null;
        
        this.createPlayerModel();
        this.createNameTag();
        this.createHealthBar();
        
        scene.add(this.group);
    }

    createPlayerModel() {
        // Create a simple capsule representation for the player
        // Head
        const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0x00AAFF });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        this.group.add(head);
        
        // Body (using cylinder since CapsuleGeometry might not be available in all Three.js versions)
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0066CC });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.6;
        body.castShadow = true;
        this.group.add(body);
        
        // Store reference for rotation updates
        this.headMesh = head;
        this.bodyMesh = body;
    }

    createNameTag() {
        // Create a canvas for the name tag
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        this.nameTagCanvas = canvas;
        this.nameTagContext = context;
        
        // Initial render
        this.updateNameTag();
        
        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 2.2;
        sprite.renderOrder = 999; // Render on top
        
        this.nameTag = sprite;
        this.nameTagTexture = texture;
        this.group.add(sprite);
    }
    
    updateNameTag() {
        if (!this.nameTagContext || !this.nameTagCanvas) return;
        
        const context = this.nameTagContext;
        const canvas = this.nameTagCanvas;
        
        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Render background
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Render text
        context.font = 'bold 32px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Use player ID or name if available
        const displayName = this.entity.playerName || this.entity.id.substring(0, 8);
        context.fillText(displayName, canvas.width / 2, canvas.height / 2);
        
        // Update texture
        if (this.nameTagTexture) {
            this.nameTagTexture.needsUpdate = true;
        }
    }

    createHealthBar() {
        // Create health bar as a flat box
        const barWidth = 1.0;
        const barHeight = 0.1;
        const barGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
        
        // Background (red)
        const bgMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: true,
            opacity: 0.7
        });
        const bgBar = new THREE.Mesh(barGeometry, bgMaterial);
        bgBar.position.y = 2.0;
        bgBar.position.z = 0.01; // Slightly behind
        this.group.add(bgBar);
        
        // Health fill (green)
        const healthMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const healthBar = new THREE.Mesh(barGeometry, healthMaterial);
        healthBar.position.y = 2.0;
        this.healthBar = healthBar;
        this.healthBarWidth = barWidth;
        this.group.add(healthBar);
    }

    update() {
        // Update position
        this.group.position.copy(this.entity.position);
        
        // Update rotation (yaw only for body, pitch for head)
        this.group.rotation.y = this.entity.rotation.yaw;
        
        // Name tags always face camera (handled automatically by THREE.Sprite)
        
        // Update health bar
        if (this.healthBar && this.entity.health !== undefined) {
            const healthPercent = this.entity.health / PLAYER.MAX_HEALTH;
            this.healthBar.scale.x = healthPercent;
            
            // Change color based on health
            if (healthPercent > 0.6) {
                this.healthBar.material.color.setHex(0x00FF00); // Green
            } else if (healthPercent > 0.3) {
                this.healthBar.material.color.setHex(0xFFFF00); // Yellow
            } else {
                this.healthBar.material.color.setHex(0xFF0000); // Red
            }
            
            // Hide if full health
            this.healthBar.visible = this.entity.health < PLAYER.MAX_HEALTH;
        }
        
        // Update crouch state
        if (this.entity.isCrouched) {
            this.group.scale.y = PLAYER.CROUCH_HEIGHT / PLAYER.PLAYER_HEIGHT;
        } else {
            this.group.scale.y = 1;
        }
    }

    dispose() {
        // Clean up resources
        if (this.nameTag) {
            this.nameTag.material.dispose();
            this.nameTag.map.dispose();
        }
        if (this.healthBar) {
            this.healthBar.material.dispose();
            this.healthBar.geometry.dispose();
        }
        
        // Remove all meshes
        this.group.traverse((object) => {
            if (object.isMesh) {
                object.geometry.dispose();
                object.material.dispose();
            }
        });
        
        scene.remove(this.group);
    }
}
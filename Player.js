import * as THREE from 'three';
import { CONFIG } from './Config.js';

export class Player {
    constructor(onDestinationReached, onQueueChange, onTaskCompleted) {
        this.onDestinationReached = onDestinationReached;
        this.onQueueChange = onQueueChange;
        this.onTaskCompleted = onTaskCompleted;
        this.group = new THREE.Group();
        this.position = new THREE.Vector3(0, 0, 0);
        this.target = new THREE.Vector3(0, 0, 0);
        this.targetName = '';
        
        // Task Queue
        this.queue = [];

        // State: IDLE, WALKING_TO_LOCATION, WAITING, WALKING_HOME
        this.state = 'IDLE';
        this.lastUpdateTime = 0;
        this.waitTimeRemaining = 0;
        this.savedTarget = null;
        this.homeLocation = { x: 0, z: 0, name: 'House' };
        
        this.isLocked = false;
        this.animationTime = 0;

        this.createMesh();
    }

    setHomeLocation(x, z, name) {
        this.homeLocation = { x, z, name };
    }

    createMesh() {
        const playerAssets = CONFIG.ASSETS.PLAYER;
        if (playerAssets && typeof playerAssets === 'object') {
            this.textures = {};
            const textureLoader = new THREE.TextureLoader();
            
            const directions = ['NE', 'NW', 'SE', 'SW'];
            let loadedCount = 0;
            
            directions.forEach(dir => {
                textureLoader.load(playerAssets[dir], (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    this.textures[dir] = texture;
                    loadedCount++;
                    
                    // Once at least one is loaded (e.g. SE as default), create the sprite
                    if (!this.mesh && dir === 'SE') {
                        const aspect = texture.image.width / texture.image.height;
                        const height = 3.0;
                        const width = height * aspect;
                        
                        const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
                        this.mesh = new THREE.Sprite(material);
                        this.mesh.renderOrder = 999;
                        this.mesh.scale.set(width, height, 1);
                        this.mesh.position.y = height / 2;
                        this.group.add(this.mesh);

                        // Shadow
                        const shadowGeo = new THREE.CircleGeometry(0.4, 32);
                        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
                        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
                        shadow.rotation.x = -Math.PI / 2;
                        shadow.position.y = 0.05;
                        this.group.add(shadow);
                        
                        // Add light once mesh is ready
                        this.light = new THREE.PointLight(0xffffff, 5, 4);
                        this.light.position.y = 1;
                        this.group.add(this.light);
                    }
                });
            });
        } else if (typeof playerAssets === 'string') {
            // ... (original single texture loading logic)
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(playerAssets, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                const aspect = texture.image.width / texture.image.height;
                const height = 3.0;
                const width = height * aspect;
                
                const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
                this.mesh = new THREE.Sprite(material);
                this.mesh.renderOrder = 999;
                this.mesh.scale.set(width, height, 1);
                this.mesh.position.y = height / 2;
                
                // Shadow
                const shadowGeo = new THREE.CircleGeometry(0.4, 32);
                const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
                const shadow = new THREE.Mesh(shadowGeo, shadowMat);
                shadow.rotation.x = -Math.PI / 2;
                shadow.position.y = 0.05;
                this.group.add(shadow);

                this.group.add(this.mesh);
                
                // Add light once mesh is ready
                this.light = new THREE.PointLight(0xffffff, 5, 4);
                this.light.position.y = 1;
                this.group.add(this.light);
            });
        } else {
            // Fallback box
            this.mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 1.6, 0.8),
                new THREE.MeshStandardMaterial({ 
                    color: CONFIG.PLAYER.COLOR, 
                    emissive: 0x555555,
                    metalness: 0.9,
                    roughness: 0.1,
                    depthTest: false
                })
            );
            this.mesh.renderOrder = 999;
            this.mesh.position.y = 0.8;
            this.group.add(this.mesh);

            this.light = new THREE.PointLight(0xffffff, 5, 4);
            this.light.position.y = 1;
            this.group.add(this.light);
        }
    }

    addTask(targetX, targetZ, targetName, targetData) {
        // Add to queue
        this.queue.push({ x: targetX, z: targetZ, name: targetName, data: targetData });
        
        // Only start immediately if IDLE.
        // If WALKING_HOME, WALKING_TO_LOCATION, or WAITING, we queue it.
        // The update loop handles transitioning from WALKING_HOME -> IDLE -> Next Task.
        if (this.state === 'IDLE') {
            this.processNextTask();
        } else {
            // Just notify update
            this.notifyQueueChange();
        }
    }

    clearTasks() {
        this.queue = [];
        this.notifyQueueChange();
    }

    processNextTask() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            // Move will trigger notification
            this.moveTo(next.x, next.z, next.name, next.data);
        } else {
            // Go home will trigger notification
            this.goHome();
        }
    }

    notifyQueueChange() {
        if (this.onQueueChange) {
            let currentName = null;
            if (this.state === 'WALKING_TO_LOCATION' || this.state === 'WAITING') {
                currentName = this.targetName;
            } else if (this.state === 'WALKING_HOME') {
                currentName = "Returning Home";
            }
            // If IDLE, currentName is null (default)
            this.onQueueChange(this.queue, currentName);
        }
    }

    moveTo(targetX, targetZ, targetName, targetData = null, onArrival = null) {
        this.target.set(targetX, 0, targetZ);
        this.targetName = targetName;
        this.targetData = targetData;
        this.state = 'WALKING_TO_LOCATION';
        this.savedTarget = { x: targetX, z: targetZ, name: targetName, data: targetData };
        this.onArrival = onArrival;
        
        this.notifyQueueChange();
    }

    goHome() {
        this.target.set(this.homeLocation.x, 0, this.homeLocation.z);
        this.targetName = this.homeLocation.name;
        this.targetData = { type: 'HOME_RETURN' }; // Mark as return trip
        this.state = 'WALKING_HOME';
        this.isLocked = true; // Ensure locked while walking home
        this.onArrival = null; // Clear any pending arrival callbacks when going home
        
        this.notifyQueueChange();
    }

    update(deltaTime) {
        const speed = CONFIG.PLAYER.SPEED;

        switch (this.state) {
            case 'WALKING_TO_LOCATION':
                this.stepTowards(this.target, speed, deltaTime, 'WAITING');
                if (this.state === 'WAITING') {
                    this.waitTimeRemaining = CONFIG.PLAYER.WAIT_TIME;
                    
                    // Specific callback (Arrival)
                    if (this.onArrival) {
                        this.onArrival();
                        this.onArrival = null;
                    }

                    // Global handler (Arrival - used for locking mainly)
                    if (this.onDestinationReached) {
                        this.onDestinationReached(this.targetName, this.targetData);
                    }
                    
                    this.notifyQueueChange();
                }
                break;
            
            case 'WAITING':
                this.waitTimeRemaining -= deltaTime * 1000;
                if (this.waitTimeRemaining <= 0) {
                    // Task Completed - Trigger Rewards/UI
                    if (this.onTaskCompleted) {
                        this.onTaskCompleted(this.targetName, this.targetData);
                    }
                    // Always go home after task
                    this.goHome();
                }
                break;
            
            case 'WALKING_HOME':
                this.stepTowards(this.target, speed, deltaTime, 'IDLE');
                if (this.state === 'IDLE') {
                    // Arrived home - trigger unlock via GameScene
                    if (this.onDestinationReached) {
                        this.onDestinationReached(this.targetName, this.targetData);
                    }

                    // Check queue for next task
                    if (this.queue.length > 0) {
                        this.processNextTask();
                    } else {
                        // Truly idle
                        if (this.onQueueChange && !this.notifiedIdle) {
                            this.notifyQueueChange();
                            this.notifiedIdle = true;
                        }
                    }
                }
                break;
            
            case 'IDLE':
                // Do nothing
                if (this.onQueueChange && this.queue.length === 0 && !this.notifiedIdle) {
                    // One-time notify to clear current task when idle
                    this.notifyQueueChange(); 
                    this.notifiedIdle = true;
                }
                break;
        }

        if (this.state !== 'IDLE') {
            this.notifiedIdle = false;
        }

        this.group.position.copy(this.position);
        this.animationTime += deltaTime; // Keep track of total time for animation purposes.
        
        // "Energetic" animation: simple bounce while walking
        if (this.mesh && this.state.includes('WALKING')) {
            const bounce = Math.abs(Math.sin(this.animationTime * 15)) * 0.3;
            // Base height depends on mesh type (Sprite vs Box)
            const baseHeight = this.mesh.isSprite ? this.mesh.scale.y / 2 : 0.8;
            this.mesh.position.y = baseHeight + bounce;
            // Slight tilt forward if it's a 3D mesh (sprites don't tilt well usually)
            if (!this.mesh.isSprite) {
                this.mesh.rotation.x = -0.2;
            }
        } else if (this.mesh) {
            const baseHeight = this.mesh.isSprite ? this.mesh.scale.y / 2 : 0.8;
            this.mesh.position.y = baseHeight;
            this.mesh.rotation.x = 0;
        }
    }

    stepTowards(target, speed, deltaTime, nextState) {
        const direction = new THREE.Vector3().subVectors(target, this.position);
        const distance = direction.length();
        const moveDistance = speed * deltaTime;

        // Sprite Direction Switching
        if (this.mesh && this.mesh.isSprite && this.textures) {
            const dx = direction.x;
            const dz = direction.z;
            let dirKey = 'SE'; // Default

            if (Math.abs(dx) > Math.abs(dz)) {
                dirKey = dx > 0 ? 'SE' : 'NW';
            } else {
                dirKey = dz > 0 ? 'SW' : 'NE';
            }

            if (this.textures[dirKey] && this.mesh.material.map !== this.textures[dirKey]) {
                this.mesh.material.map = this.textures[dirKey];
                this.mesh.material.needsUpdate = true;
                
                // Adjust scale for the new texture's aspect ratio
                const aspect = this.textures[dirKey].image.width / this.textures[dirKey].image.height;
                const height = 3.0;
                const width = height * aspect;
                this.mesh.scale.set(width, height, 1);
            }
        } else if (direction.lengthSq() > 0.001 && !this.mesh?.isSprite) {
             // For 3D meshes (fallback), look at target
             this.group.lookAt(target.x, 0, target.z);
        }

        if (distance <= moveDistance) {
            this.position.copy(target);
            this.state = nextState;
        } else {
            direction.normalize().multiplyScalar(moveDistance);
            this.position.add(direction);
        }
    }

    cancelMove() {
        this.queue = [];
        this.state = 'IDLE';
        this.target.copy(this.position);
        this.isLocked = false;
        this.notifyQueueChange();
    }

    addToScene(scene) {
        scene.add(this.group);
    }
}
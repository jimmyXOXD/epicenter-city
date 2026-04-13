import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InputBridge } from './rosie/controls/rosieControls.js';
import { CONFIG } from './Config.js';
import { Building } from './Building.js';
import { Player } from './Player.js';
import { StatsManager } from './StatsManager.js';
import { registry } from './BuildingRegistry.js';

export class GameScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.buildings = [];
        this.player = null;
        this.epicenters = [];
        this.generatedPoints = [];
        this.starterHousePosition = null; // Track the generated starter house coordinates
        
        this.statsManager = new StatsManager(
            () => this.haveKid(),
            (homeKey) => this.handleHomeChange(homeKey),
            () => this.handleWorkOnBusiness(),
            () => this.handleLoadGame()
        );
        this.clock = new THREE.Clock();
        this.statsManager.syncOfflineScore();
        
        // Panning state
        this.isPanning = false;
        this.lastMousePos = new THREE.Vector2();
        this.targetCameraPos = null;

        // Flag Mode State
        this.isFlagMode = false;
        this.placedFlags = [];
        this.flagTexture = null;

        this.init();
    }

    init() {
        // Load Data Files (relative paths work in both browser and Electron)
        Promise.all([
            fetch('./houses.json').then(r => { if (!r.ok) throw new Error('houses.json load failed'); return r.json(); }),
            fetch('./social_places.json').then(r => { if (!r.ok) throw new Error('social_places.json load failed'); return r.json(); })
        ]).then(([houses, social]) => {
            this.houseData = houses;
            this.socialData = social;
            console.log("Loaded game data:", { houses: houses.length, social: social.length });
            
            // Initialize Registry first, then generate world
            registry.init().then(() => {
                console.log("Registry ready. Scaling systems online.");
                this.generateWorld();
            });
        }).catch(err => {
            // ADD THIS CATCH BLOCK
            console.error("FATAL ERROR: Failed to load core world data.", err);
            // Fallback generation so the map at least appears, even if names are broken
            this.generateWorld();
        });

        // Save Game Button
        const saveBtn = document.getElementById('btn-save-game');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const worldData = {
                    epicenters: this.epicenters,
                    points: this.generatedPoints
                };
                const success = this.statsManager.saveGame(
                    this.player.position, 
                    worldData,
                    this.placedFlags,
                    this.player.queue
                );
                if (success) {
                    this.spawnFloatingText("✔ GAME SAVED", this.player.position, '#44ff44');
                    // Change button briefly
                    const originalContent = saveBtn.innerHTML;
                    saveBtn.innerHTML = "✔";
                    setTimeout(() => saveBtn.innerHTML = originalContent, 2000);
                }
            });
        }

        // Load Flag Texture
        new THREE.TextureLoader().load(CONFIG.ASSETS.FLAG, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            this.flagTexture = tex;
        });

        // Clear Flags Button
        const clearFlagsBtn = document.getElementById('clear-flags-btn');
        if (clearFlagsBtn) {
            clearFlagsBtn.addEventListener('click', () => {
                this.placedFlags.forEach(flag => this.scene.remove(flag));
                this.placedFlags = [];
                // Visual feedback
                if (this.player) {
                    this.spawnFloatingText("Flags Cleared", this.player.position, '#ff4444');
                }
            });
        }

        // Flag Mode Toggle
        const flagBtn = document.getElementById('flag-mode-btn');
        if (flagBtn) {
            flagBtn.addEventListener('click', () => {
                this.isFlagMode = !this.isFlagMode;
                if (this.isFlagMode) {
                    flagBtn.style.border = '1.5px solid rgba(170, 68, 255, 1)';
                    flagBtn.style.backgroundColor = 'rgba(170, 68, 255, 0.35)';
                    flagBtn.style.boxShadow = '0 0 15px rgba(170, 68, 255, 0.6)';
                    document.body.style.cursor = 'crosshair';
                } else {
                    flagBtn.style.border = '1.5px solid rgba(170, 68, 255, 0.6)';
                    flagBtn.style.backgroundColor = 'rgba(170, 68, 255, 0.15)';
                    flagBtn.style.boxShadow = '0 0 15px rgba(170, 68, 255, 0.2)';
                    document.body.style.cursor = 'default';
                }

            });
        }

        // Isometric Camera setup
        const aspect = window.innerWidth / window.innerHeight;
        const d = 200; // Increased view distance for larger map
        this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -1000, 10000);
        this.camera.position.set(20, 20, 20);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // OrbitControls setup
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        this.controls.enableRotate = false; // Keep fixed isometric view
        this.controls.minZoom = 0.1;
        this.controls.maxZoom = 40.0;
        this.controls.zoomSpeed = 2; // Adjust zoom speed.
        this.camera.zoom = 25;
        this.controls.update();

        // Moody atmosphere: Fog and Background
        this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0002); // Reduced fog density for larger view
        this.scene.background = new THREE.Color(0x0a0a1a);
        
        // Background (Dynamic Plane)
        const loader = new THREE.TextureLoader();
        loader.load(CONFIG.ASSETS.BACKGROUND, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            
            const bgScaleX = 2050*1.1;
            const bgScaleY = 0.756*bgScaleX;
            const bgOffsetX = -1000;
            const bgOffsetY = -900; // Pushes it below the map
            const bgOffsetZ = bgOffsetX;
            
            const bgGeo = new THREE.PlaneGeometry(1, 1);
            const bgMat = new THREE.MeshBasicMaterial({ 
                map: texture, 
                depthWrite: false 
            });
            const bgMesh = new THREE.Mesh(bgGeo, bgMat);
            
            // Align to Camera
            bgMesh.quaternion.copy(this.camera.quaternion);
            
            // Apply Parameters
            bgMesh.scale.set(bgScaleX, bgScaleY, 1);
            bgMesh.position.set(bgOffsetX, bgOffsetY, bgOffsetZ);
            
            this.scene.add(bgMesh);
        });

        // Lights
        // Dim ambient light for contrast
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);

        // // Moonlight (Global Light)
        // const moonlight = new THREE.DirectionalLight(0xffffff, 0.5);
        // moonlight.position.set(500, 1000, 500);
        // moonlight.target.position.set(0, 0, 0);
        // this.scene.add(moonlight);
        // this.scene.add(moonlight.target);

        // Player SpotLight (Aura pool)
        this.playerLight = new THREE.SpotLight(0xffffff, 10000);
        this.playerLight.angle = Math.PI / 6;
        this.playerLight.penumbra = 0.5;
        this.playerLight.distance = 0;
        this.playerLight.decay = 1.5;
        this.playerLight.castShadow = true;
        
        // Shadow settings
        this.playerLight.shadow.mapSize.width = 2048;
        this.playerLight.shadow.mapSize.height = 2048;
        this.playerLight.shadow.bias = -0.005; 
        this.playerLight.shadow.camera.near = 0.5; 
        this.playerLight.shadow.camera.far = 500; 
        
        this.scene.add(this.playerLight); 
        this.scene.add(this.playerLight.target);




        // Create Player
        this.player = new Player(
            (locationName, data) => this.handleDestinationReached(locationName, data),
            (queue, currentTaskName) => this.statsManager.updateTaskQueueUI(queue, currentTaskName),
            (locationName, data) => this.handleTaskCompleted(locationName, data)
        );
        this.player.addToScene(this.scene);

        this.inputBridge = new InputBridge(this);

        this.statsManager.player = this.player;
        this.statsManager.spawnFloatingText = (t, p, c) => this.spawnFloatingText(t, p, c);

        // Provide save data helper for auto-save on exit
        this.statsManager._getWorldDataForSave = () => {
            return {
                worldData: {
                    epicenters: this.epicenters,
                    points: this.generatedPoints
                },
                placedFlags: this.placedFlags,
                queue: this.player ? this.player.queue : []
            };
        };

        // Resize
        window.addEventListener('resize', () => {
            const aspect = window.innerWidth / window.innerHeight;
            this.camera.left = -d * aspect;
            this.camera.right = d * aspect;
            this.camera.top = d;
            this.camera.bottom = -d;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Interaction
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // Restart button
        const restartBtn = document.getElementById('restart-button');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                // 1. Reset lineage stats and leaderboard tracking [cite: 21, 1074]
                this.statsManager.reset();
                
                // 2. Wipe the existing 3D objects and map data 
                this.clearWorld();
                
                // 3. Generate a completely fresh map with new epicenters [cite: 217, 218]
                // This will also automatically handle player positioning [cite: 266]
                this.generateWorld();
                
                // 4. Ensure player state is reset [cite: 63]
                this.player.state = 'IDLE';
                
                // 5. Hide the Game Over overlay if it's still visible [cite: 1076]
                this.statsManager.isGameOver = false;
                if (this.statsManager.elements.overlay) {
                    this.statsManager.elements.overlay.style.display = 'none';
                }
            });
        }

        this.animate();
    }

    haveKid() {
        this.statsManager.haveKid();
        // Reset building visuals
        this.buildings.forEach(b => {
            if (b.rankLabel) b.group.remove(b.rankLabel);
            b.rankLabel = null;
        });
        // StatsManager handles the home location update via callback if needed
    }

    handleHomeChange(homeKey) {
        // If homeKey is an object (new system)
        if (typeof homeKey === 'object') {
            const data = homeKey;
            if (this.player) {
                this.player.setHomeLocation(data.x, data.z, data.name || 'Home');
                // Update StatsManager position
                this.statsManager.homePosition = { x: data.x, z: data.z };
            }
            return;
        }

        // Legacy string handling
        // Special case for returning to the starter house
        if (homeKey === 'HOUSE' && this.starterHousePosition) {
            this.player.setHomeLocation(this.starterHousePosition.x, this.starterHousePosition.z, 'House');
            this.statsManager.homePosition = { ...this.starterHousePosition };
            return;
        }

    }

    handleWorkOnBusiness() {
        if (!this.player || !this.statsManager.homePosition) return;
        
        const homePos = this.statsManager.homePosition;
        const playerPos = this.player.position;

        // Simple distance check (e.g. within 2 units)
        const dist = Math.sqrt((playerPos.x - homePos.x)**2 + (playerPos.z - homePos.z)**2);
        
        if (dist > 2.0) {
            // Not home, route player
            // Use legacy moveTo if dealing with simple coords, or just call moveTo directly
            this.player.moveTo(homePos.x, homePos.z, this.statsManager.activeHome, null, () => {
                // On Arrival Callback
                this.statsManager.startWorking();
            });
        } else {
            // Already home
            this.statsManager.startWorking();
        }
    }

    handleTaskCompleted(locationName, targetData) {
        // Unlock not needed here as player is already WAITING/WALKING_HOME transition, 
        // but rewards should be granted now.
        
        // --- 1. Dynamic Object Interactions (InstancedMesh) ---
        if (targetData) {
            // Check if returned to home (unlock if so) - handled in handleDestinationReached mostly, 
            // but if task completed involves home? 
            if (targetData.type === 'HOME_RETURN') {
                return;
            }

            if (targetData.type === 'HOUSE' && this.houseData) {
                const level = targetData.level || 1;
                const config = this.houseData.find(h => h.level === level) || this.houseData[0];
                
                const houseObj = {
                    id: `HOUSE_LVL_${level}_${targetData.x}_${targetData.z}`,
                    name: config.houses,
                    description: config.description,
                    price: config['cost (k)'], 
                    bonus: config['popularity gained'],
                    level: level,
                    x: targetData.x,
                    z: targetData.z
                };
                
                this.statsManager.showHomeUI(houseObj);
                return;
            }

            if (targetData.type === 'SOCIAL' && this.socialData) {
                const level = targetData.level || 1;
                const config = this.socialData.find(s => s.level === level) || this.socialData[0];
                
                const screening = config.screening;
                const standing = this.statsManager.getSocialStanding();
                
                if (standing < screening) {
                    this.statsManager.showRejection(config['meeting areas'], screening);
                } else {
                    this.statsManager.showMeeting(screening);
                }
                return;
            }
        }

        // --- 2. Existing Logic (Legacy & Jobs) ---

        // Handle Dynamic Jobs
        if (locationName.startsWith('job_') || locationName.startsWith('Job_')) {
            const isHired = this.statsManager.isHired(locationName);
            
            if (isHired) {
                // Earn money
                const pay = this.statsManager.getJobPay(locationName);
                this.statsManager.addStat('money', pay, Infinity);
                
                // Check for promotion
                if (this.statsManager.checkPromotion(locationName)) {
                    // Visual effect for promotion?
                    const pos = this.player.position.clone();
                    pos.y += 5;
                    this.spawnFloatingText("PROMOTED!", pos, '#ffff44');
                }
            } else {
                this.statsManager.showJobOffer(locationName);
            }
            return;
        }

        // Handle Legacy/Fallback Social (String Based)
        if (locationName.startsWith('Social')) {
             // Extract level
             const level = parseInt(locationName.split(' ')[2]) || 1;
             const screening = level * 10; // Simple screening logic
             const standing = this.statsManager.getSocialStanding();
                
             if (standing < screening) {
                 this.statsManager.showRejection(locationName, screening);
                 return; 
             }
             this.statsManager.showMeeting(screening);
             return;
        }

        if (locationName === 'Gym') {
            this.statsManager.addStat('beauty', CONFIG.PLAYER.GYM_BEAUTY_GAIN, CONFIG.PLAYER.BEAUTY_LIMIT);
            this.statsManager.applyGymBuff();
        } else if (locationName === 'Cashier' || locationName === 'Drug Dealer') {
            if (this.statsManager.isHired(locationName)) {
                // Earn money (including promotion bonus)
                const pay = this.statsManager.getJobPay(locationName);
                this.statsManager.addStat('money', pay, Infinity);
                
                // Check for promotion
                if (this.statsManager.checkPromotion(locationName)) {
                    const building = this.buildings.find(b => b.name === locationName);
                    if (building) {
                        building.showPromotionEffect();
                        building.updateRank(this.statsManager.currentJobPromotions);
                    }
                }
            } else {
                this.statsManager.showJobOffer(locationName);
            }
        } else if (locationName === 'House') {
            // Nothing special for generic house task complete yet
        } else if (locationName === 'Luxury Estate') {
            const houseObj = {
                id: 'LEGACY_LUXURY',
                name: 'Luxury Estate',
                description: 'A legacy mansion.',
                price: 20,
                bonus: 5,
                level: 8,
                x: -16, 
                z: 16
            };
            this.statsManager.showHomeUI(houseObj);
        } else if (locationName === 'Neo-University') {
            if (this.statsManager.isCollegeActive) {
                // 1. Get current stats and config
                const talent = this.statsManager.stats.talent;
                const waitTimeSec = (CONFIG.PLAYER.WAIT_TIME || 1000) / 1000; // 
                
                // 2. 
                // for lifespan ~ 4.16 min,
                // should take either 125 s for talent =1 or 63 s for talent=100.
                // takes about 3-7 s to travel there and back so ~5 s.
                const targetTime100 = 63; // Seconds for 100 Talent
                const targetTime1   = 125; // Seconds for 1 Talent

                // 3. Calculate required increments for the boundary cases,
                // assuming total time per increment is wait + travel.
                const inc100 = 100 / (targetTime100 / (waitTimeSec+5));
                const inc1   = 100 / (targetTime1 / (waitTimeSec+5));

                // 4. Linear interpolation for the current talent level
                // Formula: inc1 + (talent - 1) * ((inc100 - inc1) / (100 - 1))
                const talentRatio = (talent - 1) / 99;
                const increment = inc1 + (talentRatio * (inc100 - inc1));

                // 5. Apply Progress
                this.statsManager.incrementCollegeProgress(increment); // [cite: 93]
                this.updateCollegeVisuals();
            } else {
                this.statsManager.showCollegeUI();
            }
        }
    }

    handleDestinationReached(locationName, targetData) {
        // --- Lock Player Controls ---
        if (this.player) {
            // If arriving at home (or return trip), unlock
            if (targetData && targetData.type === 'HOME_RETURN') {
                this.player.isLocked = false;
                return;
            }
            
            // If arriving at a location to do a task, keep locked (WAITING state handles logic)
            // But we might want to ensure it IS locked if it wasn't
            this.player.isLocked = true;
        }
    }

    updateCollegeVisuals() {
        const collegeBuilding = this.buildings.find(b => b.name === 'Neo-University');
        if (!collegeBuilding) return;

        if (this.statsManager.isCollegeActive) {
            // Create or update progress bar
            if (!collegeBuilding.progressBarGroup) {
                const group = new THREE.Group();
                group.position.set(0, 8, 0); 
                
                // Background
                const bgGeo = new THREE.PlaneGeometry(3, 0.4);
                const bgMat = new THREE.MeshBasicMaterial({ color: 0x221133 });
                const bg = new THREE.Mesh(bgGeo, bgMat);
                
                // Fill
                const fillGeo = new THREE.PlaneGeometry(1, 0.4); 
                const fillMat = new THREE.MeshBasicMaterial({ color: 0xaa44ff });
                const fill = new THREE.Mesh(fillGeo, fillMat);
                fill.position.z = 0.01; 
                fill.geometry.translate(0.5, 0, 0); 
                fill.position.x = -1.5; 
                
                group.add(bg);
                group.add(fill);
                
                // Billboard
                group.userData.isProgressBar = true;
                group.userData.fillMesh = fill;
                
                collegeBuilding.group.add(group);
                collegeBuilding.progressBarGroup = group;
            }
            
            // Update Scale
            const progress = this.statsManager.collegeProgress;
            const max = 100;
            const ratio = Math.min(1, Math.max(0, progress / max));
            
            collegeBuilding.progressBarGroup.userData.fillMesh.scale.set(ratio * 3, 1, 1);
            collegeBuilding.progressBarGroup.visible = true;
            collegeBuilding.progressBarGroup.quaternion.copy(this.camera.quaternion);
            
        } else {
            if (collegeBuilding.progressBarGroup) {
                collegeBuilding.progressBarGroup.visible = false;
            }
        }
    }

    spawnFloatingText(text, position, color = '#44ff44') {
        const div = document.createElement('div');
        div.innerText = text;
        div.style.position = 'absolute';
        div.style.color = color;
        div.style.fontWeight = 'bold';
        div.style.fontSize = '14px';
        div.style.fontFamily = 'Orbitron, sans-serif';
        div.style.pointerEvents = 'none';
        div.style.textShadow = '0 0 2px #000';
        div.style.zIndex = '1000';
        div.style.opacity = '1';
        div.style.transition = 'top 1s ease-out, opacity 1s ease-out';
        
        // Project position
        const vector = position.clone();
        vector.project(this.camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
        
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        
        document.body.appendChild(div);
        
        // Animate
        requestAnimationFrame(() => {
            // Force reflow
            div.offsetHeight; 
            div.style.top = `${y - 50}px`;
            div.style.opacity = '0';
        });
        
        // Cleanup
        setTimeout(() => {
            if (div.parentNode) div.parentNode.removeChild(div);
        }, 1050);
    }

    placeFlag(position, silent = false) {
        if (!this.flagTexture) return;

        // Limit to one flag: Remove existing flags
        this.placedFlags.forEach(flag => this.scene.remove(flag));
        this.placedFlags = [];

        const material = new THREE.SpriteMaterial({ 
            map: this.flagTexture, 
            depthTest: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        
        // Scale appropriately
        sprite.scale.set(3, 6, 1); 
        sprite.position.copy(position);
        sprite.position.y += 10; // Float above
        sprite.renderOrder = 2000; // On top of everything
        
        this.scene.add(sprite);
        this.placedFlags.push(sprite);
        
        // Animation: Bobbing
        const animateFlag = () => {
            if (!sprite.parent) return; // Stopped
            const time = Date.now() * 1e-3;
            sprite.position.y = (position.y + 3) + Math.sin(time) * 0.3;
            requestAnimationFrame(animateFlag);
        };
        animateFlag();

        // Optional: Sound or Text
        if (!silent) {
            this.spawnFloatingText("Location Marked", position, '#ff4444');
        }
    }

    onMouseMove(event) {
        // Throttle: Only run every 3rd frame to save performance
        this.mouseFrame = (this.mouseFrame || 0) + 1;
        if (this.mouseFrame % 3 !== 0) return;

        // Tooltip Logic
        const tooltip = document.getElementById('tooltip');
        
        if (!this.statsManager.isGameOver && !this.statsManager.isPaused) {
            let cursor = 'default';
            let tooltipText = null;

            if (event.target === this.renderer.domElement) {
                this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                
                for (let intersect of intersects) {
                    // Instanced Mesh
                    if (intersect.object.userData.isInstancedBuilding) {
                        const instanceId = intersect.instanceId;
                        if (instanceId !== undefined) {
                            const point = intersect.object.userData.points[instanceId];
                            if (point) {
                                let text = point.name || point.type;
                                if (point.level) text += ` (Level ${point.level})`;
                                if (point.field) text += ` - ${point.field}`;
                                if (point.type === 'HOUSE' || point.type === 'SOCIAL') text += ` - ${point.type}`;
                                
                                tooltipText = text;
                                cursor = 'pointer';
                            }
                        }
                        break;
                    }
                    
                    // Legacy Building
                    if (intersect.object.userData.isBuilding) {
                        const name = intersect.object.userData.name;
                        tooltipText = name;
                        cursor = 'pointer';
                        break;
                    }
                }
            }

            // Apply Tooltip
            if (tooltipText) {
                tooltip.innerText = tooltipText;
                tooltip.style.display = 'block';
                tooltip.style.zIndex = '69';
                tooltip.style.left = `${event.clientX + 15}px`;
                tooltip.style.top = `${event.clientY + 15}px`;
            } else {
                tooltip.style.display = 'none';
            }

            // Apply Cursor
            document.body.style.cursor = cursor;
        }
    }

    handleInteraction(event, buttonType) {
        if (this.statsManager.isGameOver || this.statsManager.isPaused) return;
        
        // Prevent clicking through UI
        // Note: Mobile touch events might pass Touch objects which have 'target'
        if (event.target && event.target !== this.renderer.domElement) return;

        // Allow Left (0) and Right (2) clicks
        if (buttonType !== 0 && buttonType !== 2) return;

        // Right Click: Clear Queue & Go Home
        if (buttonType === 2) {
            if (this.player) {
                this.player.clearTasks();
                this.player.goHome();
                this.spawnFloatingText("Tasks Cleared & Returning Home", this.player.position, '#ff4444');
            }
            return;
        }

        // Raycasting Logic (Left Click / Tap)
        // Support both mouse (clientX) and touch (touches[0].clientX)
        const clientX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
        const clientY = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : 0);

        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let intersect of intersects) {
             // --- NEW FLAG MODE LOGIC ---
             if (this.isFlagMode) {
                // Filter out player parts or UI helpers
                if (intersect.object !== this.player.mesh && 
                    intersect.object !== this.player.group && 
                    !intersect.object.isLine && 
                    intersect.object.visible) {
                    
                    this.placeFlag(intersect.point);
                    // --- AUTO-EXIT LOGIC ---
                    this.isFlagMode = false; // Exit flag mode after placing
                    document.body.style.cursor = 'default';
                    const flagBtn = document.getElementById('flag-mode-btn');
                    if (flagBtn) {
                        flagBtn.style.border = '1.5px solid rgba(170, 68, 255, 0.6)';
                        flagBtn.style.backgroundColor = 'rgba(170, 68, 255, 0.15)';
                        flagBtn.style.boxShadow = '0 0 15px rgba(170, 68, 255, 0.2)';
                        document.body.style.cursor = 'default';
                    }

                    return;
                }
            }

            // Handle Instanced Mesh Buildings
            if (intersect.object.userData.isInstancedBuilding) {
                const instanceId = intersect.instanceId;
                if (instanceId !== undefined) {
                    const point = intersect.object.userData.points[instanceId];
                    // Removed repeat logic
                    
                    // Prepare Task Data
                    let taskName = point.name;
                    let taskId = point.jobId || point.name;
                    
                    if (point.type === 'JOB') {
                         // Gate Check for Level 6+ Jobs
                         if (point.level >= 6) {
                             const fieldExp = this.statsManager.promotionsCount[point.field] || 0;
                             if (fieldExp < 3) {
                                 this.statsManager.showRejection(point.name || 'High Level Job', `3 Promotions in ${point.field}`);
                                 const msg = document.getElementById('rejection-message');
                                 if (msg) msg.innerText = `Requirements Not Met: Need 3 Promotions in the ${point.field} field to apply for executive roles.`;
                                 return;
                             }
                         }
                         taskId = point.jobId;
                    } else if (point.type === 'HOUSE') {
                         taskName = point.name;
                         taskId = 'House';
                    } else if (point.type === 'SOCIAL') {
                         taskName = point.name || 'Club';
                         taskId = point.name || 'Club';
                    } else if (point.type === 'GYM') {
                         taskName = 'Gym';
                         taskId = 'Gym';
                    } else if (point.type === 'SCHOOL') {
                         taskName = 'University';
                         taskId = 'Neo-University';
                    }

                    // Add Task
                    this.player.addTask(point.x, point.z, taskId, point);

                    // Visual Feedback
                    const isBusy = this.player.state !== 'IDLE';
                    const text = isBusy ? `+ Queued: ${taskName}` : `+ Task: ${taskName}`;
                    const pos = isBusy ? this.player.position.clone().add(new THREE.Vector3(0, 5, 0)) : new THREE.Vector3(point.x, 5, point.z);
                    const color = isBusy ? '#FFA500' : '#44ff44'; // Orange for queued
                    
                    this.spawnFloatingText(text, pos, color);

                    break;
                }
            }
            
            
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        
        // 1. UPDATE GAME STATE FIRST (Player movement)
        if (!this.statsManager.isGameOver && !this.statsManager.isTrulyPaused()) {
            const dt = delta * this.statsManager.gameSpeed;
            
            // Player moves to their new position for this frame
            if (this.player) {
                this.player.update(dt);
            }
            this.statsManager.update(delta); 
            
            this.updateCollegeVisuals();
        }

        // 2. UPDATE CAMERA SECOND (Follow the newly calculated player position)
        if (this.player && this.camera && this.controls) {
            const playerPos = this.player.group.position;
            
            // Set position with fixed isometric offset
            this.camera.position.set(playerPos.x + 1000, 1000, playerPos.z + 1000);
            this.controls.target.copy(playerPos);
            this.controls.update();
            
            // SpotLight Follow logic
            if (this.playerLight) {
                this.playerLight.position.set(playerPos.x, 200, playerPos.z);
                this.playerLight.target.position.copy(playerPos);
                this.playerLight.target.updateMatrixWorld();
            }
        }
        
        // 3. RENDER THE SCENE LAST
        this.renderer.render(this.scene, this.camera);
    }

    handleLoadGame() {
        const loadedData = this.statsManager.loadGame();
        if (loadedData) {
            const worldData = loadedData.worldData || {};
            // If worldData is missing or malformed, fallback to defaults (empty array)
            const epicenters = worldData.epicenters || []; 
            const points = worldData.points || null;

            // Clean scene and regenerate
            this.clearWorld();
            this.generateWorld(epicenters, points);

            // Restore Flags
            if (loadedData.placedFlags) {
                loadedData.placedFlags.forEach(pos => {
                    this.placeFlag(new THREE.Vector3(pos.x, pos.y, pos.z), true);
                });
            }

            // Restore Player Position & Queue
            if (loadedData.playerPosition && this.player) {
                this.player.position.copy(loadedData.playerPosition);
                this.player.group.position.copy(loadedData.playerPosition);
                this.player.cancelMove(); // Stop any pending movement
                
                // Restore Queue
                if (loadedData.queue && loadedData.queue.length > 0) {
                    this.player.queue = loadedData.queue;
                    this.player.processNextTask();
                } else {
                    this.player.notifyQueueChange();
                }

                // Sync Home Location
                if (this.statsManager.homePosition) {
                    this.player.setHomeLocation(
                        this.statsManager.homePosition.x, 
                        this.statsManager.homePosition.z, 
                        'Home'
                    );
                }

                // Update camera
                this.camera.position.set(loadedData.playerPosition.x + 1000, 1000, loadedData.playerPosition.z + 1000); // Using standard offset from animate()
                this.controls.target.copy(loadedData.playerPosition);
                this.controls.update();
            }
            
            this.spawnFloatingText("✔ GAME LOADED", this.player.position, '#44ff44');
        }
    }

    clearWorld() {
        // Remove existing world meshes (marked with isGenerated or isInstancedBuilding)
        const toRemove = [];
        this.scene.traverse((object) => {
            if (object.userData.isGenerated || object.userData.isInstancedBuilding) {
                toRemove.push(object);
            }
        });

        toRemove.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        
        // Clear internal lists
        this.buildings = []; 
        this.epicenters = [];
        this.generatedPoints = [];
    }

    generateWorld(savedEpicenters = null, savedPoints = null) {
        console.log("Generating world...", savedEpicenters ? "(From Save)" : "(Fresh)");
        
        // 1. Generate Epicenters
        if (savedEpicenters) {
            this.epicenters = savedEpicenters;
        } else {
            this.epicenters = [];
            for (let i = 0; i < CONFIG.MAP.EPICENTERS; i++) {
                this.epicenters.push({
                    x: (CONFIG.UTILS.random() - 0.5) * CONFIG.MAP.WIDTH,
                    z: (CONFIG.UTILS.random() - 0.5) * CONFIG.MAP.HEIGHT,
                    A: CONFIG.MAP.AMPLITUDE.MIN + CONFIG.UTILS.random() * (CONFIG.MAP.AMPLITUDE.MAX - CONFIG.MAP.AMPLITUDE.MIN),
                    sigma: CONFIG.MAP.SPREAD.MIN + CONFIG.UTILS.random() * (CONFIG.MAP.SPREAD.MAX - CONFIG.MAP.SPREAD.MIN)
                });
            }
        }

        // --- Floor Generation (Moved here so Epicenters are ready) ---
        const loader = new THREE.TextureLoader();
        const TILE_SIZE = 7; 
        const startX = -CONFIG.MAP.WIDTH / 2;
        const startZ = -CONFIG.MAP.HEIGHT / 2;

        const lowTiles = [];
        const midTiles = [];
        const highTiles = [];

        // 1. Sort grid positions into wealth buckets
        for (let x = startX; x < CONFIG.MAP.WIDTH / 2; x += TILE_SIZE) {
            for (let z = startZ; z < CONFIG.MAP.HEIGHT / 2; z += TILE_SIZE) {
                // Decouple visualization from density using a massive sigma multiplier
                // This spreads the wealth gradient visually across the map
                const w = this.getWealth(x, z, 0.9).total; 

                const pos = { x: x + TILE_SIZE/2, z: z + TILE_SIZE/2 };
                
                if (w < 0.3) lowTiles.push(pos);
                else if (w < 0.99) midTiles.push(pos);
                else highTiles.push(pos);
            }
        }

        const floorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
        const dummy = new THREE.Object3D();

        const createFloorMesh = (positions, textureUrl) => {
            if (positions.length === 0) return null;
            
            const tex = loader.load(textureUrl);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

            const mat = new THREE.MeshStandardMaterial({ 
                map: tex,
                roughness: 0.9,
                metalness: 0.1
            });

            const mesh = new THREE.InstancedMesh(floorGeo, mat, positions.length);
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            mesh.userData.isGenerated = true;

            positions.forEach((p, i) => {
                dummy.position.set(p.x, 0, p.z);
                dummy.rotation.x = -Math.PI / 2;
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            this.scene.add(mesh);
            return mesh;
        };

        this.floorLow = createFloorMesh(lowTiles, CONFIG.ASSETS.FLOOR_LOW);
        this.floorMid = createFloorMesh(midTiles, CONFIG.ASSETS.FLOOR_MID);
        this.floorHigh = createFloorMesh(highTiles, CONFIG.ASSETS.FLOOR_HIGH);
        
        // 2. Variable Poisson Sampling (or Restore)
        let points = [];

        if (savedPoints) {
            points = savedPoints;
        } else {
            const activeList = [];
            
            const getRadius = (x, z) => {
                const wealth = this.getWealth(x, z).total;
                return CONFIG.MAP.R_MAX / (1 + wealth);
            };

            const cellSize = CONFIG.MAP.R_MAX;
            const gridW = Math.ceil(CONFIG.MAP.WIDTH / cellSize);
            const gridH = Math.ceil(CONFIG.MAP.HEIGHT / cellSize);
            const grid = new Array(gridW * gridH).fill(null).map(() => []);

            // Initial point
            const initialPoint = { 
                x: (Math.random() - 0.5) * CONFIG.MAP.WIDTH, 
                z: (Math.random() - 0.5) * CONFIG.MAP.HEIGHT
            };
            const initW = this.getWealth(initialPoint.x, initialPoint.z);
            initialPoint.G = initW.total;
            initialPoint.components = initW.components;
            
            points.push(initialPoint);
            activeList.push(initialPoint);
            
            const addToGrid = (p) => {
                const col = Math.floor((p.x + CONFIG.MAP.WIDTH/2) / cellSize);
                const row = Math.floor((p.z + CONFIG.MAP.HEIGHT/2) / cellSize);
                if (col >= 0 && col < gridW && row >= 0 && row < gridH) {
                    grid[row * gridW + col].push(p);
                }
            };
            addToGrid(initialPoint);

            const k = 30; 

            while (activeList.length > 0) {
                const idx = Math.floor(Math.random() * activeList.length);
                const source = activeList[idx];
                let found = false;
                const sourceRadius = getRadius(source.x, source.z);

                for (let i = 0; i < k; i++) {
                    const angle = CONFIG.UTILS.random() * Math.PI * 2;
                    const dist = sourceRadius * (1 + CONFIG.UTILS.random()); 
                    const candX = source.x + Math.cos(angle) * dist;
                    const candZ = source.z + Math.sin(angle) * dist;

                    if (candX < -CONFIG.MAP.WIDTH/2 || candX > CONFIG.MAP.WIDTH/2 || 
                        candZ < -CONFIG.MAP.HEIGHT/2 || candZ > CONFIG.MAP.HEIGHT/2) continue;

                    const candRadius = getRadius(candX, candZ);
                    let valid = true;
                    
                    const col = Math.floor((candX + CONFIG.MAP.WIDTH/2) / cellSize);
                    const row = Math.floor((candZ + CONFIG.MAP.HEIGHT/2) / cellSize);
                    
                    // Check neighbors
                    const searchRange = 2; 
                    for (let r = Math.max(0, row - searchRange); r <= Math.min(gridH - 1, row + searchRange); r++) {
                        for (let c = Math.max(0, col - searchRange); c <= Math.min(gridW - 1, col + searchRange); c++) {
                            const cellPoints = grid[r * gridW + c];
                            for (let p of cellPoints) {
                                const d2 = (candX - p.x)**2 + (candZ - p.z)**2;
                                if (d2 < candRadius * candRadius) {
                                    valid = false;
                                    break;
                                }
                            }
                            if (!valid) break;
                        }
                        if (!valid) break;
                    }

                    if (valid) {
                        const w = this.getWealth(candX, candZ);
                        const newPoint = { 
                            x: candX, 
                            z: candZ, 
                            G: w.total, 
                            components: w.components 
                        };
                        points.push(newPoint);
                        activeList.push(newPoint);
                        addToGrid(newPoint);
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    activeList.splice(idx, 1);
                }
            }
        }
        
        console.log(`Generated ${points.length} points.`);
        this.generatedPoints = points;

        if (!savedPoints) {
            this.assignBuildingTypes(points);
            this.assignJobDetails(points);
        }

        // Find a starter house (Level 1 preferably)
        const starterHouse = points.find(p => p.type === 'HOUSE' && p.level === 1) || points.find(p => p.type === 'HOUSE');
        
        if (starterHouse && this.player && !savedEpicenters) {
            console.log(`Setting player start at ${starterHouse.name} (${starterHouse.x.toFixed(1)}, ${starterHouse.z.toFixed(1)})`);
            
            // Save starter house position for later returns
            this.starterHousePosition = { x: starterHouse.x, z: starterHouse.z };
            
            this.player.position.set(starterHouse.x, 0, starterHouse.z);
            this.player.setHomeLocation(starterHouse.x, starterHouse.z, starterHouse.name);
            this.statsManager.homePosition = { x: starterHouse.x, z: starterHouse.z };
            
            // Move camera to start
            if (this.camera) {
                this.camera.position.set(starterHouse.x + 20, 20, starterHouse.z + 20);
                this.camera.lookAt(starterHouse.x, 0, starterHouse.z);
            }
        }

        this.renderInstancedBuildings(points);
    }

    assignBuildingTypes(points) {
        // Spatial Clustering / Tag Shuffling
        const GRID_SIZE = 50;
        const grid = {}; // 'x_z': [points]

        // Group points into grid cells
        points.forEach(p => {
            const gx = Math.floor(p.x / GRID_SIZE);
            const gz = Math.floor(p.z / GRID_SIZE);
            const key = `${gx}_${gz}`;
            if (!grid[key]) grid[key] = [];
            grid[key].push(p);
        });

        // For each cell, create a shuffled deck of types
        const types = ['HOUSE', 'JOB', 'SOCIAL', 'GYM', 'SCHOOL'];
        // Weights: House 40%, Job 30%, Social 20%, Gym 5%, School 5%
        const deckTemplate = [
            ...Array(35).fill('HOUSE'),     // 35% – dense megablocks, squats, arcologies
            ...Array(30).fill('SOCIAL'),    // 30% – boosted (now the #2 most common)
            ...Array(25).fill('JOB'),       // 25% – slightly less than social
            ...Array(5).fill('GYM'),        // 5% – combat gyms, body-mod clinics
            ...Array(5).fill('SCHOOL')      // 5% – rare corp academies / underground schools
        ];

        Object.values(grid).forEach(cellPoints => {
            // Shuffle deck for this cell
            let deck = [...deckTemplate];
            // Shuffle function
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(CONFIG.UTILS.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }

            let deckIndex = 0;
            cellPoints.forEach(p => {
                if (deckIndex >= deck.length) {
                    deckIndex = 0; // Recycle deck if ran out
                    // reshuffle optionally? Nah, just loop
                }
                p.type = deck[deckIndex++];
            });
        });
    }

    assignJobDetails(points) {
        const fields = Object.keys(registry.fieldColors);
        
        points.forEach(p => {
            if (p.type === 'JOB') {
                // Weighted random based on components
                const totalVal = p.components.reduce((a, b) => a + b, 0);
                let r = CONFIG.UTILS.random() * totalVal;
                let selectedIdx = 0;
                for (let i = 0; i < p.components.length; i++) {
                    r -= p.components[i];
                    if (r <= 0) {
                        selectedIdx = i;
                        break;
                    }
                }
                
                // Set Field
                const fieldName = fields[selectedIdx % fields.length]; 
                p.field = fieldName;
                p.color = registry.fieldColors[fieldName] || { r: 1, g: 1, b: 1 };
                
                // Set Level (1-10)
                const val = p.components[selectedIdx];
                let level = Math.floor(Math.min(10, Math.max(1, (val / 1.5) * 10))); 
                p.level = level;

                // Find matching job in registry
                const candidates = registry.jobs.filter(j => j.field === fieldName && j.level === level);
                if (candidates.length > 0) {
                    const job = candidates[Math.floor(CONFIG.UTILS.random() * candidates.length)];
                    p.jobId = job.id;
                    p.name = job.name;
                } else {
                    // Fallback if no exact match
                    p.jobId = `job_gen_${p.x}_${p.z}`;
                    p.name = `${fieldName} Job`;
                    // Register a temporary job config if needed, or handle in getJobData fallback
                }

            } else if (p.type === 'HOUSE') {
            // Determine level based on wealth G
            let level = Math.floor(Math.min(10, Math.max(1, (p.G / 2.5) * 10)));
            p.level = level;
            p.color = { r: 1, g: 1, b: 1 };
            
            // Fetch real name from your loaded JSON data
            const houseData = this.houseData.find(h => h.level === level);
            p.name = houseData ? houseData.houses : `House Lvl ${level}`;

            } else if (p.type === 'SOCIAL') {
                // Determine level based on wealth G
                let level = Math.floor(Math.min(10, Math.max(1, (p.G / 2.5) * 10)));
                p.level = level;
                p.color = { r: 1, g: 1, b: 1 }; 
                
                // Fetch real name from your loaded JSON data
                const socialData = this.socialData.find(s => s.level === level);
                p.name = socialData ? socialData['meeting areas'] : `Social Lvl ${level}`;

            } else if (p.type === 'SCHOOL') {
                // p.level = 1; // has no levels
                p.color = { r: 1, g: 1, b: 1 };
                p.name = "Neo-University";
            } else {
                // p.level = 1; // has no levels
                p.color = { r: 1, g: 1, b: 1 };
                p.name = p.type;
            }
        });
    }


    renderInstancedBuildings(points) {
        // --- 1. Create Baseplates for Jobs ---
        const jobPoints = points.filter(p => p.type === 'JOB');
        if (jobPoints.length > 0) {
            const baseGeo = new THREE.PlaneGeometry(5, 5); // Slightly larger than average building base
            const baseMat = new THREE.MeshBasicMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false // Avoid z-fighting with floor
            });
            const baseMesh = new THREE.InstancedMesh(baseGeo, baseMat, jobPoints.length);
            baseMesh.frustumCulled = false;
            baseMesh.userData.isGenerated = true;
            
            const dummy = new THREE.Object3D();
            const color = new THREE.Color();
            
            jobPoints.forEach((p, i) => {
                dummy.position.set(p.x-1.5, 0.3, p.z-1.5); // Slightly above floor
                dummy.rotation.x = -Math.PI / 2; // Flat on ground
                dummy.updateMatrix();
                baseMesh.setMatrixAt(i, dummy.matrix);
                
                if (p.color) {
                    baseMesh.setColorAt(i, color.setRGB(p.color.r, p.color.g, p.color.b));
                } else {
                    baseMesh.setColorAt(i, color.setHex(0xffffff));
                }
            });
            
            baseMesh.instanceMatrix.needsUpdate = true;
            if (baseMesh.instanceColor) baseMesh.instanceColor.needsUpdate = true;
            this.scene.add(baseMesh);
        }

        // --- 2. Render Buildings ---
        // Group points by Asset Key
        const groups = {}; 
        
        points.forEach(p => {
            let assetKey = '';
            // Logic to determine assetKey...
            if (p.type === 'JOB') assetKey = `JOB_LVL_${p.level}`;
            else if (p.type === 'HOUSE') assetKey = `HOUSE_LVL_${p.level}`;
            else if (p.type === 'SOCIAL') assetKey = `SOCIAL_LVL_${p.level}`;
            else if (p.type === 'GYM') assetKey = 'GYM'; 
            else if (p.type === 'SCHOOL') assetKey = 'COLLEGE'; 

            const url = CONFIG.ASSETS[assetKey];
            if (!url) return;

            if (!groups[url]) groups[url] = [];
            groups[url].push(p);
        });

        const textureLoader = new THREE.TextureLoader();

        Object.entries(groups).forEach(([url, groupPoints]) => {
            textureLoader.load(url, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                
                const aspect = texture.image.width / texture.image.height;
                const height = 6;
                const width = height * aspect;

                const geometry = new THREE.PlaneGeometry(width, height);
                geometry.translate(0, height / 2, 0);

                // Standard Material for PointLight interaction
                const material = new THREE.MeshStandardMaterial({ 
                    map: texture, 
                    transparent: true,
                    alphaTest: 0.5,
                    roughness: 0.7,
                    metalness: 0.0
                });
                
                // Custom Distance Material for correct point light shadow casting
                const distanceMaterial = new THREE.MeshDistanceMaterial({
                    map: texture,
                    alphaTest: 0.5
                });

                const mesh = new THREE.InstancedMesh(geometry, material, groupPoints.length);
                mesh.customDistanceMaterial = distanceMaterial;
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                
                // Store points data for raycasting
                mesh.userData = { isInstancedBuilding: true, points: groupPoints, isGenerated: true };

                const dummy = new THREE.Object3D();
                const color = new THREE.Color();
                
                // Billboard to camera
                // Note: We need to set rotation based on camera once, but for isometric it's fixed.
                // Or we can just face it towards +Z if it's 2D sprites.
                // The previous code copied camera quaternion.
                dummy.quaternion.copy(this.camera.quaternion);

                for (let i = 0; i < groupPoints.length; i++) {
                    const p = groupPoints[i];
                    dummy.position.set(p.x, 0, p.z);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    
                    // No vertex coloring needed for the sprite itself now
                    mesh.setColorAt(i, color.setHex(0xffffff));
                }

                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

                this.scene.add(mesh);
            });
        });
    }

    getWealth(x, z, sigmaMultiplier = 1) {
        let total = 0;
        const components = [];
        for (let epi of this.epicenters) {
            // Distance check
            const d2 = (x - epi.x)**2 + (z - epi.z)**2;
            const effectiveSigma = epi.sigma * sigmaMultiplier;
            const val = epi.A * Math.exp(-d2 / (2 * effectiveSigma * effectiveSigma));
            total += val;
            components.push(val);
        }
        return { total, components };
    }
}
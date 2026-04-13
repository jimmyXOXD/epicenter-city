import * as THREE from 'three';

export class Building {
    constructor(name, position, color, emissive, screening = null, assetUrl = null) {
        this.name = name;
        this.screening = screening;
        this.group = new THREE.Group();
        this.group.position.set(position.x, 0, position.z);

        if (assetUrl) {
            this.createSprite(assetUrl, color, emissive);
        } else {
            this.createBox(color, emissive);
        }

        // Name label
        // height needs to be adjusted based on asset or box
        const height = assetUrl ? 6 : 5; 
        this.createLabel(name, height, screening);
    }

    createSprite(url, color, emissive) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(url, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            const aspect = texture.image.width / texture.image.height;
            const height = 6;
            const width = height * aspect;
            
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);
            sprite.scale.set(width, height, 1);
            sprite.position.y = height / 2;
            sprite.userData = { isBuilding: true, name: this.name };
            
            // Add a small ground shadow/base
            const baseGeo = new THREE.CircleGeometry(width / 3, 32);
            const baseMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.rotation.x = -Math.PI / 2;
            base.position.y = 0.05;
            this.group.add(base);

            this.mesh = sprite; // For raycasting reference
            this.group.add(sprite);

            // Add a subtle light matching the building theme
            this.light = new THREE.PointLight(emissive, 5, 8);
            this.light.position.y = 2;
            this.group.add(this.light);
        });
    }

    createBox(color, emissive) {
        // Building base
        const height = 4 + Math.random() * 4;
        const geometry = new THREE.BoxGeometry(2, height, 2);
        const material = new THREE.MeshStandardMaterial({ 
            color: color, 
            emissive: emissive,
            emissiveIntensity: 2,
            roughness: 0.1,
            metalness: 0.9
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = height / 2; 
        this.mesh.userData = { isBuilding: true, name: this.name };
        this.group.add(this.mesh);
        
        // Glow point light
        this.light = new THREE.PointLight(emissive, 20, 10);
        this.light.position.y = height / 2;
        this.group.add(this.light);
    }

    createLabel(text, height, screening) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;
        context.fillStyle = 'rgba(0, 0, 0, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = 'Bold 48px Orbitron';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.shadowBlur = 10;
        context.shadowColor = 'white';
        
        let labelText = text.toUpperCase();
        if (screening !== null && screening !== undefined) {
            labelText += ` (${screening})`;
        }
        
        context.fillText(labelText, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.y = height;
        sprite.scale.set(8, 2, 1);
        this.labelSprite = sprite;
        this.group.add(sprite);

        // Sub-label for rank
        this.rankLabel = null;
    }

    updateRank(rank) {
        if (rank <= 0) return;
        
        if (this.rankLabel) {
            this.group.remove(this.rankLabel);
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = 'Bold 32px Orbitron';
        context.fillStyle = '#44ff44';
        context.textAlign = 'center';
        context.fillText(`RANK ${rank}`, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.y = this.labelSprite.position.y - 1.2;
        sprite.scale.set(4, 1, 1);
        this.rankLabel = sprite;
        this.group.add(sprite);
    }

    showPromotionEffect() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = 'Bold 40px Orbitron';
        context.fillStyle = '#ffff44';
        context.textAlign = 'center';
        context.shadowBlur = 10;
        context.shadowColor = '#ffff44';
        context.fillText('PROMOTED!', 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.y = this.labelSprite.position.y + 1.5;
        sprite.scale.set(5, 1.25, 1);
        this.group.add(sprite);

        // Float up and fade out
        let opacity = 1.0;
        const animate = () => {
            if (opacity <= 0) {
                this.group.remove(sprite);
                return;
            }
            sprite.position.y += 0.05;
            opacity -= 0.02;
            sprite.material.opacity = opacity;
            requestAnimationFrame(animate);
        };
        animate();
    }

    addToScene(scene) {
        scene.add(this.group);
    }
}

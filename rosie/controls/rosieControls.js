import * as THREE from 'three';
import { MobileControls } from './rosieMobileControls.js';

/**
 * InputBridge - Translates desktop and mobile inputs into Epicenter City commands.
 * This version is optimized for high-performance interaction and zero-latency response.
 */
export class InputBridge {
    constructor(gameScene) {
        this.gameScene = gameScene;
        this.statsManager = gameScene.statsManager;
        this.player = gameScene.player;

        // Initialize Mobile Gesture detection
        this.mobile = new MobileControls(this);
        
        this.setupDesktopListeners();
    }

    setupDesktopListeners() {
        // Mouse Down for Desktop Interaction
        window.addEventListener('mousedown', (e) => {
            if (!this.gameScene || !this.gameScene.handleInteraction) return;
            this.gameScene.handleInteraction(e, e.button);
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            // Space to toggle Pause
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.statsManager && this.statsManager.elements && this.statsManager.elements.btnPause) {
                    this.statsManager.elements.btnPause.click();
                    if (this.statsManager.updateSpeedUI) {
                        this.statsManager.updateSpeedUI();
                    }
                }
            }

            // Escape to toggle Main Menu / Pause overlay
            if (e.code === 'Escape') {
                e.preventDefault();
                const mainMenuOverlay = document.getElementById('main-menu-overlay');
                
                // If the menu is already open, click resume
                if (mainMenuOverlay && mainMenuOverlay.style.display === 'flex') {
                    const btnResume = document.getElementById('btn-resume-game');
                    if (btnResume) btnResume.click();
                } 
                // Otherwise, open the menu
                else {
                    const btnMainMenu = document.getElementById('btn-main-menu');
                    if (btnMainMenu) btnMainMenu.click();
                }
            }

            // F11 or Alt+Enter: Toggle Fullscreen
            if (e.code === 'F11' || (e.altKey && e.code === 'Enter')) {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });

        // Ensure context menu is prevented for Right Click support
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    toggleFullscreen() {
        // Electron path: use IPC
        if (window.electronAPI && window.electronAPI.isElectron) {
            window.electronAPI.toggleFullscreen();
            return;
        }

        // Browser path: use Fullscreen API
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err);
            });
        } else {
            document.exitFullscreen().catch(err => {
                console.warn('Exit fullscreen failed:', err);
            });
        }
    }

    /**
     * Interface for rosieMobileControls.js
     * Optimized for zero-latency response
     */
    handleInput(type, event) {
        if (!this.gameScene || !this.player || this.statsManager.isPaused) return;

        if (type === 'TAP') {
            if (this.gameScene.handleInteraction) {
                // Button 0 = Add Task (Standard interaction)
                this.gameScene.handleInteraction(event, 0); 
            }
        } else if (type === 'LONG_PRESS') {
            // Button 2 = Cancel / Return Home logic
            this.player.clearTasks();
            this.player.goHome();
            if (this.gameScene.spawnFloatingText) {
                this.gameScene.spawnFloatingText("Tasks Cancelled", this.player.position, "#ff4444");
            }
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }

    update(deltaTime) {
        // Strategic sims don't need per-frame velocity updates
    }
}
import { CONFIG } from './Config.js';
import { Business } from './Business.js';
import { registry } from './BuildingRegistry.js';

export class StatsManager {
    constructor(onHaveKid, onHomeChange, onWorkOnBusiness, onLoadGame) {
        this.injectStyles();
        this.onHaveKid = onHaveKid;
        this.onHomeChange = onHomeChange;
        this.onWorkOnBusiness = onWorkOnBusiness;
        this.onLoadGame = onLoadGame;
        this.player = null; // To be set by GameScene
        this.stats = { ...CONFIG.PLAYER.INITIAL_STATS };
        this.globalRisk = CONFIG.PLAYER.GLOBAL_RISK || 1.0;
        this.activeBuffs = [];
        this.nextGaussian = null; // Buffer for Box-Muller pair
        this.isGameOver = false;
        this.gymBuffTimeRemaining = 0;
        this.isPaused = false;
        this.gameSpeed = 1.0;
        this.isGamePausedManual = false; // Manual toggle vs modal pause
        this.socialCircle = []; // Friends and Spouse
        this.homePosition = { x: 0, z: 0 }; // Default home position
        this.hiredJobs = new Set();
        this.promotionsCount = {}; // Tracks total promotions by Field (e.g., { 'Retail': 5 })
        this.currentJobPromotions = 0; // Tracks promotions in the current specific job
        this.business = null;
        this.popularitySources = {}; // Ledger for popularity gains

        // New Location & Mechanic State
        this.ownsNewHome = false; // Legacy
        this.ownedHomes = new Set(); // New ID-based ownership
        this.activeHomeId = null; 
        this.activeHome = 'HOUSE';
        this.collegeVisits = 0;
        this.isCollegeActive = false;
        this.collegeProgress = 0;
        
        // Lifetime Stats for Leaderboard
        this.lifetimeMaxStats = {
            money: 0,
            popularity: 0,
            beauty: 0,
            talent: 0
        };

        // Game Start State
        this.isGameStarted = false;

        // Business Working State
        this.isWorking = false;
        this.workTimer = 0;

        this.elements = {
            health: document.getElementById('stat-health'),
            healthRate: document.getElementById('health-rate'),
            money: document.getElementById('stat-money'),
            popularity: document.getElementById('stat-popularity'),
            beauty: document.getElementById('stat-beauty'),
            talent: document.getElementById('stat-talent'),
            overlay: document.getElementById('game-over-overlay'),
            meetingOverlay: document.getElementById('meeting-overlay'),
            rejectionOverlay: document.getElementById('rejection-overlay'),
            jobOverlay: document.getElementById('job-overlay'),
            socialPanel: document.getElementById('social-panel'),
            socialList: document.getElementById('social-list'),
            investOverlay: document.getElementById('invest-overlay'),
            disasterOverlay: document.getElementById('disaster-overlay'),
            injuryOverlay: document.getElementById('injury-overlay'),
            injuryRiskValue: document.getElementById('injury-risk-value'),
            eventTimer: document.getElementById('active-event-timer'),
            eventLabel: document.getElementById('event-timer-label'),
            eventTime: document.getElementById('event-timer-time'),
            // Speed controls
            btnPause: document.getElementById('btn-pause'),
            btnSpeed1: document.getElementById('btn-speed-1x'),
            btnSpeed2: document.getElementById('btn-speed-2x'),
            // Startup UI
            startupOverlay: document.getElementById('startup-overlay'),
            startupSetupOverlay: document.getElementById('startup-setup-overlay'),
            founderList: document.getElementById('founder-list'),
            activeBusinessInfo: document.getElementById('active-business-info'),
            // New Startup elements
            startupBankValue: document.getElementById('startup-bank-value'),
            startupInvestSlider: document.getElementById('startup-invest-slider'),
            startupInvestAmount: document.getElementById('startup-invest-amount'),
            btnStartupInvestConfirm: document.getElementById('btn-startup-invest-confirm'),
            // Closure overlay
            closureOverlay: document.getElementById('business-closure-overlay'),
            closureReason: document.getElementById('closure-reason'),
            closureStats: document.getElementById('closure-stats'),
            btnClosureOk: document.getElementById('btn-closure-ok'),
            // Home UI
            homeOverlay: document.getElementById('home-overlay'),
            homeTitle: document.getElementById('home-title'),
            homeDescription: document.getElementById('home-description'),
            homeStats: document.getElementById('home-stats'),
            btnHomeAction: document.getElementById('btn-home-action'),
            btnHomeClose: document.getElementById('btn-home-close'),
            // College UI
            collegeOverlay: document.getElementById('college-overlay'),
            collegeTitle: document.getElementById('college-title'),
            collegeDescription: document.getElementById('college-description'),
            collegeStats: document.getElementById('college-stats'),
            btnCollegeAction: document.getElementById('btn-college-action'),
            btnCollegeClose: document.getElementById('btn-college-close'),
            // Dashboard
            dashboard: document.getElementById('business-dashboard'),
            // Job Info
            jobInfoOverlay: document.getElementById('job-info-overlay'),
            jobInfoDetails: document.getElementById('job-info-details'),
            btnOpenJobInfo: document.getElementById('btn-open-job-info'),
            btnCloseJobInfo: document.getElementById('btn-close-job-info')
        };
        
        this.setupExitButton();
        this.setupStartScreenListeners();
        this.setupJobInfoListeners();
        this.setupMeetingListeners();
        this.setupJobListeners();
        this.setupRejectionListeners();
        this.setupInvestListeners();
        this.setupInjuryListeners();
        this.setupSpeedControls();
        this.setupStartupListeners();
        this.setupClosureListeners();
        this.setupHomeListeners();
        this.setupCollegeListeners();
        this.initializeLeaderboardTabs();
        this.renderLeaderboard();
        this.updateUI();
    }

    saveGame(playerPosition, worldData, placedFlags = [], queue = []) {
        const data = {
            version: CONFIG.SAVE_VERSION,
            stats: this.stats,
            promotionsCount: this.promotionsCount,
            currentJobPromotions: this.currentJobPromotions,
            popularitySources: this.popularitySources,
            ownedHomes: Array.from(this.ownedHomes),
            hiredJobs: Array.from(this.hiredJobs),
            activeHomeId: this.activeHomeId,
            activeHome: this.activeHome,
            ownsNewHome: this.ownsNewHome,
            collegeVisits: this.collegeVisits,
            isCollegeActive: this.isCollegeActive,
            collegeProgress: this.collegeProgress,
            gymBuffTimeRemaining: this.gymBuffTimeRemaining,
            socialCircle: this.socialCircle,
            playerPosition: playerPosition,
            worldData: worldData,
            placedFlags: placedFlags.map(f => ({ x: f.position.x, y: f.position.y, z: f.position.z })),
            queue: queue,
            homePosition: this.homePosition,
            business: this.business ? {
                founders: this.business.founders,
                investmentBank: this.business.investmentBank,
                percentOwned: this.business.percentOwned,
                stage: this.business.stage,
                totalProductsSold: this.business.totalProductsSold,
                lifespan: this.business.lifespan,
                startTimeOffset: Date.now() - this.business.startTime, // Save elapsed time
                progress: this.business.progress,
                isSeekingInvestors: this.business.isSeekingInvestors,
                marketMultiplier: this.business.marketMultiplier,
                marketTier: this.business.marketTier
            } : null,
            timestamp: Date.now()
        };

        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem('EpicenterCity_Save', serialized);
            
            // Verify the write was successful (Steam/standalone persistence check)
            const verification = localStorage.getItem('EpicenterCity_Save');
            if (!verification) {
                console.error("Save verification failed - data did not persist!");
                return false;
            }
            
            console.log(`Game Saved Successfully! (${(serialized.length / 1024).toFixed(1)} KB)`);
            return true;
        } catch (e) {
            console.error("Save Failed:", e);
            
            // Fallback: Try to save a minimal version if full save exceeds quota
            if (e.name === 'QuotaExceededError') {
                try {
                    // Save without world data (largest payload) as emergency fallback
                    const minData = { ...data, worldData: null, placedFlags: [] };
                    localStorage.setItem('EpicenterCity_Save', JSON.stringify(minData));
                    console.warn("Emergency save: Saved without world data due to storage quota.");
                    return true;
                } catch (e2) {
                    console.error("Emergency save also failed:", e2);
                }
            }
            return false;
        }
    }

    loadGame() {
        try {
            const json = localStorage.getItem('EpicenterCity_Save');
            if (!json) return null;

            const data = JSON.parse(json);

            if (data.version && data.version !== CONFIG.SAVE_VERSION) {
                console.warn(`Version Mismatch! Save: ${data.version}, Config: ${CONFIG.SAVE_VERSION}`);
            }

            // Restore Stats
            this.stats = { ...CONFIG.PLAYER.INITIAL_STATS, ...data.stats }; // Merge to ensure new fields exist
            this.promotionsCount = data.promotionsCount || {};
            this.currentJobPromotions = data.currentJobPromotions || 0;
            this.popularitySources = data.popularitySources || {};
            
            // Restore Sets
            this.ownedHomes = new Set(data.ownedHomes || []);
            this.hiredJobs = new Set(data.hiredJobs || []);
            
            // Restore State
            this.activeHomeId = data.activeHomeId;
            this.activeHome = data.activeHome;
            this.ownsNewHome = data.ownsNewHome;
            this.collegeVisits = data.collegeVisits || 0;
            this.isCollegeActive = data.isCollegeActive || false;
            this.collegeProgress = data.collegeProgress || 0;
            this.gymBuffTimeRemaining = data.gymBuffTimeRemaining || 0;
            this.socialCircle = data.socialCircle || [];
            this.homePosition = data.homePosition || { x: 0, z: 0 };

            // Restore Business
            if (data.business) {
                this.business = new Business(data.business.founders);
                // Overwrite properties
                this.business.investmentBank = data.business.investmentBank;
                this.business.percentOwned = data.business.percentOwned;
                this.business.stage = data.business.stage;
                this.business.totalProductsSold = data.business.totalProductsSold;
                this.business.lifespan = data.business.lifespan;
                this.business.startTime = Date.now() - (data.business.startTimeOffset || 0);
                this.business.progress = data.business.progress;
                this.business.isSeekingInvestors = data.business.isSeekingInvestors;
                this.business.marketMultiplier = data.business.marketMultiplier;
                this.business.marketTier = data.business.marketTier;
            } else {
                this.business = null;
            }
            
            this.updateUI();
            this.updateSocialUI();

            // Handle legacy save format where worldData was stored in 'epicenters'
            let worldData = data.worldData;
            if (!worldData && data.epicenters) {
                // If epicenters is an object with points, it's actually worldData
                if (!Array.isArray(data.epicenters) && data.epicenters.points) {
                    worldData = data.epicenters;
                } else {
                    // It's just epicenters array (very old format)
                    worldData = { epicenters: data.epicenters, points: null };
                }
            }

            return {
                playerPosition: data.playerPosition,
                worldData: worldData,
                placedFlags: data.placedFlags || [],
                queue: data.queue || []
            };

        } catch (e) {
            console.error("Load Failed:", e);
            return null;
        }
    }

    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            html, body {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                overscroll-behavior: none;
            }
            @keyframes shake {
                0% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                50% { transform: translateX(5px); }
                75% { transform: translateX(-5px); }
                100% { transform: translateX(0); }
            }
            .shake-error {
                animation: shake 0.3s ease-in-out;
                border-color: #ff4444 !important;
                color: #ff4444 !important;
            }
            @keyframes floatUpFade {
                0% { opacity: 0; transform: translate(-50%, 10px); }
                10% { opacity: 1; transform: translate(-50%, 0); }
                90% { opacity: 1; transform: translate(-50%, 0); }
                100% { opacity: 0; transform: translate(-50%, -20px); }
            }
            .task-queue-container {
                position: absolute;
                bottom: env(safe-area-inset-bottom, 20px);
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: row;
                gap: 10px;
                z-index: 1000;
                pointer-events: none;
                bottom: clamp(20px, 5vh, 40px) !important;
            }
            .task-item {
                background: rgba(0, 0, 0, 0.8);
                border: 1px solid #44ffff;
                padding: 5px 10px;
                border-radius: 4px;
                color: #44ffff;
                font-family: 'Orbitron', sans-serif;
                font-size: 10px;
                box-shadow: 0 0 5px #44ffff;
                opacity: 0.7;
                transition: all 0.3s ease;
            }
            .task-item.current {
                border-color: #44ff44;
                color: #44ff44;
                box-shadow: 0 0 8px #44ff44;
                transform: scale(1.1);
                opacity: 1;
            }
            @keyframes pulseGlow {
                0% { text-shadow: 0 0 10px #ffff44; transform: scale(1); }
                50% { text-shadow: 0 0 25px #ffff44, 0 0 10px #ffaa44; transform: scale(1.05); }
                100% { text-shadow: 0 0 10px #ffff44; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    formatTaskName(name) {
        if (!name) return "";
        // Replace underscores with spaces, remove digits, and trim
        return name.replace(/_/g, ' ').replace(/[0-9]/g, '').trim();
    }

    updateTaskQueueUI(queue, currentTaskName) {
        let container = document.getElementById('task-queue-ui');
        if (!container) {
            container = document.createElement('div');
            container.id = 'task-queue-ui';
            container.className = 'task-queue-container';
            document.body.appendChild(container);
        }
        
        container.innerHTML = '';
        
        // Render current task first if it exists
        if (currentTaskName) {
            const div = document.createElement('div');
            const cleanName = this.formatTaskName(currentTaskName);
            
            // If it says "Returning Home", style it differently
            if (currentTaskName === "Returning Home") {
                div.className = 'task-item';
                div.style.borderColor = '#ffaa44';
                div.style.color = '#ffaa44';
                div.style.boxShadow = '0 0 5px #ffaa44';
                div.innerText = `◄ ${currentTaskName}`; // Keep original "Returning Home" as it's a special system string
            } else {
                div.className = 'task-item current';
                div.innerText = `► ${cleanName}`;
            }
            container.appendChild(div);
        }
        
        // Render queue
        if (queue && queue.length > 0) {
            queue.forEach(task => {
                const div = document.createElement('div');
                div.className = 'task-item';
                div.innerText = this.formatTaskName(task.name);
                container.appendChild(div);
            });
        }
        
        // Hide if empty
        if (!currentTaskName && (!queue || queue.length === 0)) {
            container.style.display = 'none';
        } else {
            container.style.display = 'flex';
        }
    }

    setupStartScreenListeners() {
        const startBtn = document.getElementById('btn-start-game');
        const loadBtn = document.getElementById('btn-load-game');
        const shareBtn = document.getElementById('btn-share-game');
        const startScreen = document.getElementById('start-screen');

        // --- NEW AUDIO LOGIC START ---
        const themeSong = document.getElementById('theme-song');
        if (themeSong) {
            themeSong.volume = 0.5; // Set starting volume (0.0 to 1.0)
            // Browsers block autoplay unless the user interacts first. 
            // The catch() prevents console errors if the browser blocks it.
            themeSong.play().catch(e => console.log("Autoplay waiting for user interaction:", e));
        }

        const fadeOutTheme = () => {
            if (!themeSong || themeSong.paused) return;
            const fadeInterval = setInterval(() => {
                if (themeSong.volume > 0.05) {
                    themeSong.volume -= 0.05;
                } else {
                    themeSong.volume = 0;
                    themeSong.pause();
                    clearInterval(fadeInterval);
                }
            }, 100); // Fades out over 1 second
        };
        // --- NEW AUDIO LOGIC END ---

        // Check for save file
        if (loadBtn) {
            const saveExists = localStorage.getItem('EpicenterCity_Save');
            if (saveExists) {
                loadBtn.style.display = 'inline-block';
                
                loadBtn.onclick = () => {
                    fadeOutTheme();
                    if (this.onLoadGame) {
                        this.onLoadGame();
                        this.isGameStarted = true;
                        if (startScreen) startScreen.style.display = 'none';
                        console.log("Game Loaded!");
                    }
                };
            }
        }

        if (startBtn) {
            startBtn.onclick = () => {
                fadeOutTheme();
                // Clear any existing save data when starting a fresh game
                localStorage.removeItem('EpicenterCity_Save');
                
                this.isGameStarted = true;
                if (startScreen) startScreen.style.display = 'none';
                console.log("Game Started Fresh! Old lineage cleared.");
            };
        }

        if (shareBtn) {
            shareBtn.onclick = async () => {
                const shareData = {
                    title: 'City of Shadows',
                    text: 'Can you survive the City of Shadows? Build your legacy in this cyberpunk life sim!',
                    url: window.location.href,
                };

                const fallbackCopy = async () => {
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        alert('Link copied to clipboard!');
                    } catch (err) {
                        // Fallback for older browsers or if clipboard API fails
                        const textArea = document.createElement("textarea");
                        textArea.value = window.location.href;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try {
                            document.execCommand('copy');
                            alert('Link copied to clipboard!');
                        } catch (err) {
                            console.error('Fallback copy failed', err);
                            alert('Unable to share. Please copy the URL manually.');
                        }
                        document.body.removeChild(textArea);
                    }
                };

                if (navigator.share) {
                    try {
                        await navigator.share(shareData);
                        console.log('Content shared successfully');
                    } catch (err) {
                        console.error('Error sharing:', err);
                        // If it's not a user cancellation (AbortError), try fallback
                        if (err.name !== 'AbortError') {
                            await fallbackCopy();
                        }
                    }
                } else {
                    await fallbackCopy();
                }
            };
        }
    }
    
    setupExitButton() {
        const exitBtn = document.getElementById('btn-exit-desktop');
        if (!exitBtn) return;

        // Show exit button only if running in Electron (desktop)
        const isElectron = window.electronAPI && window.electronAPI.isElectron;
        if (isElectron) {
            exitBtn.style.display = 'inline-block';
            exitBtn.onclick = () => {
                // Auto-save before quitting
                if (this.isGameStarted && !this.isGameOver && this.player) {
                    const worldData = this._getWorldDataForSave ? this._getWorldDataForSave() : null;
                    if (worldData) {
                        this.saveGame(
                            this.player.position,
                            worldData.worldData,
                            worldData.placedFlags,
                            worldData.queue
                        );
                    }
                }
                window.electronAPI.quitGame();
            };
        }
    }

    exitToDesktop() {
        // Called from in-game menu
        const isElectron = window.electronAPI && window.electronAPI.isElectron;
        if (isElectron) {
            window.electronAPI.quitGame();
        } else {
            window.close();
        }
    }

    isTrulyPaused() {
        return !this.isGameStarted || this.isPaused || this.isGamePausedManual || this.isGameOver;
    }

    setupJobInfoListeners() {
        if (this.elements.btnOpenJobInfo) {
            this.elements.btnOpenJobInfo.onclick = () => this.openJobInfoModal();
        }
        if (this.elements.btnCloseJobInfo) {
            this.elements.btnCloseJobInfo.onclick = () => {
                this.elements.jobInfoOverlay.style.display = 'none';
                this.resolvePauseState();
            };
        }
    }

    openJobInfoModal() {
        this.isPaused = true;
        this.elements.jobInfoOverlay.style.display = 'flex';
        
        let content = '';
        
        if (this.hiredJobs.size === 0) {
            content = '<div style="color: #888; text-align: center;">You are currently unemployed.</div>';
        } else {
            // Assume single job for now
            const jobName = Array.from(this.hiredJobs)[0];
            const job = this.getJobData(jobName);
            
            if (job) {
                const totalPay = this.getJobPay(jobName);
                const field = job.field || 'General';
                const fieldPromos = this.promotionsCount[field] || 0;
                
                content = `
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 8px;">
                        <span style="color: #ccc;">Job Title:</span>
                        <span style="color: #44ff44; font-weight: bold;">${(job.name || jobName).toUpperCase()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 8px;">
                        <span style="color: #ccc;">Field:</span>
                        <span style="color: white;">${field}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 8px;">
                        <span style="color: #ccc;">Pay / Visit:</span>
                        <span style="color: #44ff44;">${totalPay.toFixed(1)} K$</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 8px;">
                        <span style="color: #ccc;">Current Job Rank:</span>
                        <span style="color: #ffff44;">${this.currentJobPromotions} / ${job.maxPromotions || 3}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding-bottom: 5px;">
                        <span style="color: #ccc;">Total Field Promotions:</span>
                        <span style="color: #44ffff;">${fieldPromos}</span>
                    </div>
                `;
            } else {
                content = '<div style="color: #ff4444;">Error: Job data not found.</div>';
            }
        }
        
        this.elements.jobInfoDetails.innerHTML = content;
    }

    resolvePauseState() {
        const pauseOverlays = [
            this.elements.meetingOverlay,
            this.elements.rejectionOverlay,
            this.elements.jobOverlay,
            this.elements.investOverlay,
            this.elements.disasterOverlay,
            this.elements.injuryOverlay,
            this.elements.startupOverlay,
            this.elements.startupSetupOverlay,
            this.elements.closureOverlay,
            this.elements.homeOverlay,
            this.elements.collegeOverlay,
            this.elements.jobInfoOverlay,
            document.getElementById('main-menu-overlay')
        ];

        // Check if any overlay is visible (display != 'none')
        const isAnyOverlayVisible = pauseOverlays.some(el => el && getComputedStyle(el).display !== 'none');
        this.isPaused = isAnyOverlayVisible;
    }

    setupCollegeListeners() {
        if (this.elements.btnCollegeClose) {
            this.elements.btnCollegeClose.onclick = () => {
                this.elements.collegeOverlay.style.display = 'none';
                this.resolvePauseState();
            };
        }
    }

    showCollegeUI() {
        this.isPaused = true;
        this.elements.collegeOverlay.style.display = 'flex';
        
        if (this.isCollegeActive) {
            // Already enrolled - this shouldn't normally be called as game scene handles clicking when active
            // But just in case
            this.elements.collegeOverlay.style.display = 'none';
            this.isPaused = false;
            return; 
        }

        if (this.collegeVisits > 0) {
            this.elements.collegeTitle.innerText = "DEGREE COMPLETED";
            this.elements.collegeDescription.innerText = "You have already completed your education for this generation.";
            this.elements.collegeStats.innerHTML = `
                <div style="color: #aa44ff; font-weight: bold;">ALUMNI STATUS</div>
                <div style="margin-top: 5px;">Wait for the next generation to enroll again.</div>
            `;
            this.elements.btnCollegeAction.style.display = 'none';
        } else {
            this.elements.collegeTitle.innerText = "NEO-UNIVERSITY";
            this.elements.collegeDescription.innerText = "Advanced learning program. Boost your status and intellect.";
            this.elements.collegeStats.innerHTML = `
                <div style="display: flex; justify-content: space-between;"><span>Tuition:</span> <span style="color: #ff4444;">${CONFIG.PLAYER.ECONOMY.TUITION_COST}K$</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Reward:</span> <span style="color: #ff44ff;">+10 Popularity</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Requirement:</span> <span>Active Study</span></div>
            `;
            
            const btn = this.elements.btnCollegeAction;
            btn.style.display = 'inline-block';
            btn.innerText = `ENROLL (${CONFIG.PLAYER.ECONOMY.TUITION_COST}K$)`;
            
            // Proactive Disabling
            if (this.stats.money < CONFIG.PLAYER.ECONOMY.TUITION_COST) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.style.background = '#333';
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.background = ''; // Reset to default CSS
            }
            
            btn.onclick = () => {
                if (this.stats.money >= CONFIG.PLAYER.ECONOMY.TUITION_COST) {
                    this.stats.money -= CONFIG.PLAYER.ECONOMY.TUITION_COST;
                    this.isCollegeActive = true;
                    this.collegeProgress = 0;
                    
                    // Success State
                    btn.innerText = "✔ ENROLLED";
                    btn.style.background = "#44ff44";
                    btn.style.color = "#000";
                    btn.disabled = true;
                    
                    setTimeout(() => {
                         this.elements.collegeOverlay.style.display = 'none';
                         this.isPaused = false;
                         this.updateUI();
                    }, 1000); // Brief delay to show success
                } else {
                    btn.classList.add('shake-error');
                    btn.onanimationend = () => btn.classList.remove('shake-error');
                }
            };
        }
    }

    incrementCollegeProgress(amount) {
        if (!this.isCollegeActive) return;
        
        this.collegeProgress += amount;
        
        if (this.collegeProgress >= 100) {
            this.collegeProgress = 100;
            this.completeCollege();
        }
        
        this.updateUI(); // To reflect changes if any
    }

    completeCollege() {
        this.isCollegeActive = false;
        this.collegeVisits++; // Mark as completed for this generation
        this.addPopularity('College', 10);
        
    }

    spawnFloatingText(text, position, color) {
        // This will be overridden or called if GameScene assigns it.
        // If not assigned, we do nothing.
    }

    setupHomeListeners() {
        if (this.elements.btnHomeClose) {
            this.elements.btnHomeClose.onclick = () => {
                this.elements.homeOverlay.style.display = 'none';
                this.resolvePauseState();
            };
        }
    }

    showHomeUI(houseData) {
        if (typeof houseData === 'string') {
            console.warn("Legacy call to showHomeUI with string:", houseData);
            this.showHomeUILegacy(houseData);
            return;
        }

        this.isPaused = true;
        this.elements.homeOverlay.style.display = 'flex';
        
        // Check ownership
        // Legacy: 'HOUSE' is free. 'LEGACY_LUXURY' (mapped from NEW_HOME) costs 20.
        // New: Dynamic houses have price.
        // We consider 'HOUSE' ID as owned by default (starter).
        const isOwned = this.ownedHomes.has(houseData.id) || houseData.id === 'HOUSE' || (houseData.id === 'LEGACY_LUXURY' && this.ownsNewHome);
        const isActive = this.activeHomeId === houseData.id;
        
        this.elements.homeTitle.innerText = (houseData.name || 'HOME').toUpperCase();
        this.elements.homeDescription.innerText = houseData.description || "A place to live.";
        this.elements.homeTitle.style.color = isOwned ? "#44ff44" : "#ffaa44";
        this.elements.homeOverlay.querySelector('#home-card').style.borderColor = isOwned ? "#44ff44" : "#ffaa44";

        this.elements.homeStats.innerHTML = `
            <div style="display: flex; justify-content: space-between;"><span>Price:</span> <span style="color: ${isOwned ? '#44ff44' : '#ffaa44'};">${houseData.price > 0 ? houseData.price.toFixed(0) + 'K$' : 'FREE'}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Bonus:</span> <span style="color: #ff44ff;">+${houseData.bonus || 0} Popularity</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Status:</span> <span style="color: ${isOwned ? '#44ff44' : '#ffaa44'}">${isOwned ? 'OWNED' : 'FOR SALE'}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Current Home:</span> <span>${isActive ? 'YES' : 'NO'}</span></div>
        `;

        // Reset Button
        const btn = this.elements.btnHomeAction;
        // Remove old listeners to prevent stacking
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        this.elements.btnHomeAction = newBtn;
        
        newBtn.style.opacity = "1";
        newBtn.disabled = false;

        if (!isOwned) {
            newBtn.innerText = `BUY (${houseData.price}K$)`;
            newBtn.onclick = () => {
                if (this.stats.money >= houseData.price) {
                    this.stats.money -= houseData.price;
                    this.ownedHomes.add(houseData.id);
                    if (houseData.id === 'LEGACY_LUXURY') this.ownsNewHome = true;
                    
                    this.setActiveHome(houseData);
                    //alert(`Congratulations! You bought the ${houseData.name}.`);

                    // Clear any "Return Home" tasks from the queue since we're changing homes
                    //this.player.clearTasks();
                    this.player.goHome();

                    this.elements.homeOverlay.style.display = 'none';
                    this.isPaused = false;
                    this.updateUI();
                } else {
                    //alert("Not enough money!");
                }
            };
        } else {
            if (isActive) {
                newBtn.innerText = "ALREADY HOME";
                newBtn.disabled = true;
                newBtn.style.opacity = "0.5";
            } else {
                newBtn.innerText = "MOVE IN";
                newBtn.onclick = () => {
                    this.setActiveHome(houseData);
                    
                    // Clear any "Return Home" tasks from the queue since we're changing homes
                    //this.player.clearTasks();
                    this.player.goHome();

                    this.elements.homeOverlay.style.display = 'none';
                    this.isPaused = false;
                    this.updateUI();
                };
            }
        }
    }

    setActiveHome(houseData) {
        // Remove old bonus
        if (this.activeHomeId) {
             this.removePopularitySource('ActiveHome');
        }
        
        this.activeHomeId = houseData.id;
        this.activeHome = houseData.id; // Legacy support
        
        // Add new bonus
        if (houseData.bonus > 0) {
            this.addPopularity('ActiveHome', houseData.bonus);
        }
        
        // Pass coordinates to GameScene
        if (this.onHomeChange) {
            this.onHomeChange(houseData); 
        }
    }
    
    showHomeUILegacy(locationKey) {
        if (locationKey === 'NEW_HOME') {
            this.showHomeUI({
                id: 'LEGACY_LUXURY',
                name: 'Luxury Estate',
                description: 'A legacy mansion.',
                price: 20,
                bonus: 5,
                level: 8,
                x: -16, z: 16
            });
        } else {
             this.showHomeUI({
                id: 'HOUSE',
                name: 'Original House',
                description: 'The humble starting point.',
                price: 0,
                bonus: 0,
                level: 1,
                x: this.homePosition.x, z: this.homePosition.z
            });
        }
    }

    setupClosureListeners() {
        if (this.elements.btnClosureOk) {
            this.elements.btnClosureOk.onclick = () => {
                this.elements.closureOverlay.style.display = 'none';
                this.resolvePauseState();
            };
        }
    }

    showBusinessClosure(reason, business) {
        if (!business) return;
        
        this.isPaused = true;
        this.elements.closureOverlay.style.display = 'flex';
        this.elements.closureReason.innerText = `Reason: ${reason}`;
        
        this.elements.closureStats.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Final Stage:</span> <span>${business.stage}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Products Sold:</span> <span>${business.totalProductsSold}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Remaining Capital:</span> <span style="color: ${business.investmentBank < 0 ? '#ff4444' : '#44ff44'}">${business.investmentBank.toFixed(2)}K$</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Your Equity:</span> <span>${business.percentOwned.toFixed(1)}%</span>
            </div>
        `;
        // Remove the popularity gained from this business
        this.removePopularitySource('BusinessSales');

        // Clear the business
        this.business = null;
        this.updateStartupUI();
        // Hide info button
        const infoBtn = document.getElementById('startup-info-btn');
        if (infoBtn) infoBtn.style.display = 'none';
    }

    setupStartupListeners() {
        document.getElementById('btn-startup-close').onclick = () => {
            this.elements.startupOverlay.style.display = 'none';
            this.resolvePauseState();
        };

        const btnOpenSetup = document.getElementById('btn-open-business-setup');
        if (btnOpenSetup) {
             btnOpenSetup.innerText = `FOUND STARTUP (${CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST}K$)`;
             btnOpenSetup.onclick = () => {
                if (this.stats.money < CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST) {
                    return;
                }
                this.showStartupSetup();
            };
        }

        document.getElementById('btn-startup-cancel').onclick = () => {
            this.elements.startupSetupOverlay.style.display = 'none';
            this.resolvePauseState();
        };

        document.getElementById('btn-startup-launch').onclick = () => {
            this.launchBusiness();
        };
        
        // Use event delegation for dynamically added elements or setup only when elements exist
        // But since we inject innerHTML, we need to re-bind or use static container events
        // Let's bind these dynamically inside updateStartupUI or just use the static IDs if they are now in HTML
        // Wait, the slider and button are injected via innerHTML in updateStartupUI. 
        // So we must bind them THERE.
    }

    showStartupSetup() {
        this.isPaused = true;
        this.elements.startupSetupOverlay.style.display = 'flex';
        this.elements.founderList.innerHTML = '';
        
        const friends = this.socialCircle.filter(p => p.type === 'friend');
        if (friends.length === 0) {
            this.elements.founderList.innerHTML = '<p style="font-size: 12px; color: #888;">No friends found. Go socialize at the Diner or Club first!</p>';
        } else {
            friends.forEach((friend, idx) => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '10px';
                div.style.borderBottom = '1px solid #222';
                div.style.paddingBottom = '5px';
                
                div.innerHTML = `
                    <input type="checkbox" class="founder-checkbox" data-index="${idx}" style="width: 20px; height: 20px; cursor: pointer;">
                    <div style="flex-grow: 1;">
                        <strong>${friend.name}</strong><br/>
                        <span style="font-size: 10px; color: #aaa;">T:${friend.stats.talent} P:${friend.stats.popularity} B:${friend.stats.beauty}</span>
                    </div>
                `;
                this.elements.founderList.appendChild(div);
            });
        }
    }

    launchBusiness() {
        const checkboxes = document.querySelectorAll('.founder-checkbox');
        const selectedIndices = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selectedIndices.push(parseInt(cb.dataset.index));
        });

        if (selectedIndices.length > 3) {
            //alert("You can only choose up to 3 friends (for a total of 4 founders).");
            return;
        }

        const friends = this.socialCircle.filter(p => p.type === 'friend');
        const selectedFriends = selectedIndices.map(idx => friends[idx]);
        
        // Founders include the player
        const founders = [
            { name: 'You', stats: { ...this.stats }, type: 'player' },
            ...selectedFriends
        ];

        this.stats.money -= CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST;
        this.business = new Business(founders);
        
        
        this.elements.startupSetupOverlay.style.display = 'none';
        this.resolvePauseState();
        this.updateStartupUI();
        this.updateUI();
    }

    showStartupUI() {
        this.isPaused = true;
        this.elements.startupOverlay.style.display = 'flex';
        this.updateStartupUI();
    }

    triggerInvestorEvent() {
        // Investor gives coins for 10% equity
        this.business.addCapital(CONFIG.BUSINESS.INVESTOR_GRANT);
        this.business.diluteOwnership(CONFIG.BUSINESS.INVESTOR_EQUITY);
        this.business.investorFundsReceived = (this.business.investorFundsReceived || 0) + CONFIG.BUSINESS.INVESTOR_GRANT;
        
        // Remove alert, use floating div
        const dash = document.getElementById('business-dashboard');
        if (dash) {
            const floatDiv = document.createElement('div');
            floatDiv.style.cssText = `
                color: #ffaa44;
                text-shadow: 0 0 10px #ffaa44;
                background: rgba(0,0,0,0.9);
                border: 2px solid #ffaa44;
                padding: 15px;
                text-align: center;
                border-radius: 10px;
                position: absolute;
                z-index: 9999;
                pointer-events: none;
                left: 50%;
                top: -50px;
                transform: translateX(-50%);
                animation: floatUpFade 4s forwards;
                width: 200px;
                font-family: 'Orbitron', sans-serif;
            `;
            floatDiv.innerHTML = `💰 INVESTOR FOUND!<br><span style="font-size:12px; color: #fff;">They invested 500K$ for 10% equity.</span>`;
            
            // The dashboard has relative positioning in CSS? If not, we might need to append to document body and calculate position
            // But let's assume dashboard container is relative or we can position relative to it.
            // Actually, dashboard is fixed in main.js usually. Let's append to body and center on screen or near dashboard.
            // Safest: Append to dashboard and make sure dashboard has position relative or absolute.
            // If dashboard doesn't have position, absolute will be relative to body or nearest positioned ancestor.
            // Let's set dashboard position to relative just in case via JS if needed, but usually UI panels are fixed/absolute.
            
            // Appending to dashboard directly
            if (getComputedStyle(dash).position === 'static') {
                dash.style.position = 'relative';
            }
            dash.appendChild(floatDiv);
            
            setTimeout(() => {
                floatDiv.remove();
            }, 4000);
        }
    }

    updateStartupUI() {
        if (this.business) {
            document.getElementById('btn-open-business-setup').style.display = 'none';
            this.elements.activeBusinessInfo.style.display = 'block';
            
            const timeRem = this.business.getTimeRemaining(); // in ms
            const minutes = Math.floor(timeRem / 60000); // in minutes
            const seconds = Math.floor((timeRem % 60000) / 1000); // in seconds

            const currentBank = this.business.investmentBank; 
            const monthlyCost = CONFIG.BUSINESS.OPERATING_COST || 5;

            // 2. Convert remaining ms to months (seconds)
            const remainingMonths = Math.floor(timeRem / 1000); // in months, (1 month = 1 second in real time)

            // 3. Calculate remaining liability: (Cost * Months) - Money already in the bank
            // We use Math.max(0, ...) to ensure the slider doesn't go negative if over-funded.
            const remainingExpenses = Math.max(0, (monthlyCost * remainingMonths) - currentBank);

            this.elements.activeBusinessInfo.innerHTML = `
                <div style="color: #ffff44; font-weight: bold; margin-bottom: 5px;">ACTIVE VENTURE</div>
                <div style="display: flex; justify-content: space-between;"><span>Stage:</span> <span>${this.business.stage} - ${this.business.getStageName()}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Progress:</span> <span>${Math.floor(this.business.progress)} / ${this.business.maxProgress}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Founders:</span> <span>${this.business.founders.length}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Products Sold:</span> <span>${this.business.totalProductsSold}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Ownership:</span> <span>${this.business.percentOwned.toFixed(1)}%</span></div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px; color: #ffaa44;">
                    <span>Lifespan:</span> <span>${minutes}:${seconds.toString().padStart(2, '0')}</span>
                </div>
                <button id="btn-business-shutdown" style="width: 100%; margin-top: 10px; padding: 8px; cursor: pointer; background: #ff4444; color: white; border: none; font-family: 'Orbitron'; font-weight: bold; font-size: 12px; border-radius: 4px; box-shadow: 0 0 10px rgba(255, 68, 68, 0.3);">CLOSE BUSINESS</button>
                    <div style="margin-top: 15px; border-top: 1px solid #333; padding-top: 10px;">
                <div style="margin-bottom: 5px; color: #44ffff;">
                        Investment Bank: <span id="startup-bank-value">${Math.floor(currentBank)}</span>K$
                    </div>
                    <input type="range" id="startup-invest-slider" 
                        min="0" 
                        max="${Math.min(Math.ceil(remainingExpenses), Math.floor(this.stats.money))}" 
                        value="0" 
                        step="1" 
                        style="width: 100%; accent-color: #44ffff; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #aaa;">
                        <span>Invest: <span id="startup-invest-amount">0</span>K$</span>
                        <button id="btn-startup-invest-confirm" style="padding: 2px 8px; cursor: pointer; background: #44ffff; color: black; border: none; font-family: 'Orbitron'; font-weight: bold; font-size: 10px;">CONFIRM</button>
                    </div>
                    <div style="font-size: 9px; color: #666; margin-top: 4px;">
                        Target to fully fund: ${Math.ceil(remainingExpenses)}K$
                    </div>
                </div>
                <div style="margin-top: 15px; text-align: center;">
                    <div style="font-size: 10px; color: #aaa; margin-bottom: 5px;">STRATEGY</div>
                    <button id="btn-seek-investors" style="width: 100%; padding: 5px; cursor: pointer; border: 1px solid #ffff44; background: ${this.business.isSeekingInvestors ? '#ffff44' : 'transparent'}; color: ${this.business.isSeekingInvestors ? 'black' : '#ffff44'}; font-family: 'Orbitron'; font-weight: bold; font-size: 11px;">
                        ${this.business.isSeekingInvestors ? 'SEEKING INVESTORS...' : 'SEEK INVESTORS'}
                    </button>
                    <div style="font-size: 9px; color: #888; margin-top: 3px;">
                        ${this.business.isSeekingInvestors ? 'Chance to dilute 10% equity for 500K$ capital.' : 'Activate to find venture capital.'}
                    </div>
                </div>
            `;
            
            // Re-bind events for the new innerHTML elements
            const slider = document.getElementById('startup-invest-slider');
            const display = document.getElementById('startup-invest-amount');
            const btnConfirm = document.getElementById('btn-startup-invest-confirm');
            const btnSeek = document.getElementById('btn-seek-investors');
            const btnShutdown = document.getElementById('btn-business-shutdown');
            
            if (slider && display && btnConfirm) {
                slider.oninput = () => {
                    display.innerText = Math.floor(parseFloat(slider.value));
                };
                
                btnConfirm.onclick = () => {
                    const amount = Math.floor(parseFloat(slider.value));
                    if (amount > 0 && amount <= this.stats.money) {
                        this.stats.money -= amount;
                        this.business.addCapital(amount);
                        this.updateUI(); // Updates money display
                        this.updateStartupUI(); // Refresh startup UI
                    } else if (amount > this.stats.money) {
                         //alert("Not enough cash!");
                    }
                };
            }

            if (btnSeek) {
                btnSeek.onclick = () => {
                    this.business.isSeekingInvestors = !this.business.isSeekingInvestors;
                    this.updateStartupUI();
                };
            }

            if (btnShutdown) {
                btnShutdown.onclick = () => {
                    if (this.business) {
                        // 1. Capture refund before business is nullified
                        const rawRefund = this.business.investmentBank - (this.business.investorFundsReceived || 0);
                        const refund = Math.max(0, rawRefund); // Ensure no negative refund
                        
                        // 2. Trigger the internal shutdown (sets this.business to null)
                        this.business.shutdown(this, "Venture closed by founder.");
                        
                        // 3. Return funds to player
                        this.stats.money += refund;
                        
                        // 4. Close the modal and resume
                        this.elements.startupOverlay.style.display = 'none';
                        this.resolvePauseState();
                        
                        // 5. Full UI Refresh (Dashboard & Money)
                        this.updateUI();
                        this.updateStartupUI();
                    }
                };
            }
            
        } else {
            document.getElementById('btn-open-business-setup').style.display = 'block';
            this.elements.activeBusinessInfo.style.display = 'none';
        }
    }

    setupSpeedControls() {
        const updateSpeedUI = () => {
            const activeStyle = '2px solid #fff';
            const inactiveStyle = '2px solid rgba(170, 68, 255, 0.6)';
            
            this.elements.btnPause.style.borderColor = this.isGamePausedManual ? '#fff' : 'rgba(170, 68, 255, 0.6)';
            this.elements.btnPause.style.color = this.isGamePausedManual ? '#fff' : '#aa44ff';
            this.elements.btnPause.style.background = this.isGamePausedManual ? 'rgba(170, 68, 255, 0.3)' : 'rgba(170, 68, 255, 0.15)';
            this.elements.btnPause.style.boxShadow = this.isGamePausedManual ? '0 0 20px rgba(170, 68, 255, 0.5)' : '0 0 15px rgba(170, 68, 255, 0.2)';
            this.elements.btnPause.innerHTML = this.isGamePausedManual ? '▶' : '∣∣';

            this.elements.btnSpeed1.style.border = (this.gameSpeed === 1.0 && !this.isGamePausedManual) ? activeStyle : inactiveStyle;
            this.elements.btnSpeed2.style.border = (this.gameSpeed === 2.0 && !this.isGamePausedManual) ? activeStyle : inactiveStyle;
        };

        this.updateSpeedUI = updateSpeedUI;
        const btnMainMenu = document.getElementById('btn-main-menu');
        const mainMenuOverlay = document.getElementById('main-menu-overlay');
        const btnConfirmMenu = document.getElementById('btn-confirm-main-menu');
        const btnResume = document.getElementById('btn-resume-game');

        if (btnMainMenu && mainMenuOverlay) {
            // 1. Open Menu & Pause
            btnMainMenu.onclick = () => {
                this.isPaused = true;
                mainMenuOverlay.style.display = 'flex';
            };

            // 2. Quit to Menu (No Save)
            btnConfirmMenu.onclick = () => {
                window.location.reload(); 
            };

            // 3. Resume Game
            btnResume.onclick = () => {
                mainMenuOverlay.style.display = 'none';
                this.resolvePauseState(); // Automatically unpauses if no other windows are open
            };
        }

        this.elements.btnPause.onclick = () => {
            this.isGamePausedManual = !this.isGamePausedManual;
            this.updateEffectivePause();
            updateSpeedUI();
        };

        // Space key listener removed here to prevent duplicate handling.
        // Input logic is now centralized in rosieControls.js to avoid conflicts.

        this.elements.btnSpeed1.onclick = () => {
            this.gameSpeed = 1.0;
            this.isGamePausedManual = false;
            this.updateEffectivePause();
            updateSpeedUI();
        };

        this.elements.btnSpeed2.onclick = () => {
            this.gameSpeed = 2.0;
            this.isGamePausedManual = false;
            this.updateEffectivePause();
            updateSpeedUI();
        };
        
        updateSpeedUI();
    }

    updateEffectivePause() {
        // Effective pause is true if manually paused OR a modal is open (isPaused handled by existing logic)
        // Actually, let's keep isPaused for modal-related pause and add manual toggle logic.
    }



    setupInjuryListeners() {
        const btn = document.getElementById('btn-injury-ok');
        if (btn) {
            btn.onclick = () => {
                this.elements.injuryOverlay.style.display = 'none';
                this.resolvePauseState();
            };
        }
    }

    setupInvestListeners() {
        document.getElementById('btn-open-invest').onclick = () => this.openInvestModal();
        document.getElementById('btn-close-invest').onclick = () => this.closeInvestModal();
        
        const slider = document.getElementById('invest-slider');
        const display = document.getElementById('invest-amount-display');
        
        slider.oninput = () => {
            display.innerText = parseFloat(slider.value).toFixed(2);
        };
        
        document.getElementById('btn-buy-bonds').onclick = () => this.handleInvest('bonds', 'buy');
        document.getElementById('btn-buy-stocks').onclick = () => this.handleInvest('stocks', 'buy');
        document.getElementById('btn-sell-bonds').onclick = () => this.handleInvest('bonds', 'sell');
        document.getElementById('btn-sell-stocks').onclick = () => this.handleInvest('stocks', 'sell');
    }

    openInvestModal() {
        this.isPaused = true;
        this.updateInvestUI();
        this.elements.investOverlay.style.display = 'flex';
    }

    closeInvestModal() {
        this.elements.investOverlay.style.display = 'none';
        this.resolvePauseState();
    }

    updateInvestUI() {
        const slider = document.getElementById('invest-slider');
        const display = document.getElementById('invest-amount-display');
        
        // Update slider max to current cash
        slider.max = Math.floor(this.stats.money);
        
        // If slider value exceeds current money (e.g. after buying), clamp it
        if (parseFloat(slider.value) > this.stats.money) {
            slider.value = Math.floor(this.stats.money);
        }
        
        // Always update display to match current slider value
        display.innerText = Math.floor(parseFloat(slider.value));

        const netWorth = this.stats.money + (this.stats.bonds || 0) + (this.stats.stocks || 0);
        
        document.getElementById('invest-net-worth').innerText = Math.floor(netWorth);
        document.getElementById('invest-cash').innerText = Math.floor(this.stats.money);
        document.getElementById('invest-bonds').innerText = Math.floor(this.stats.bonds || 0);
        
        // Stocks with Profit/Loss display
        const stocksVal = Math.floor(this.stats.stocks || 0);
        // Migration: If we have stocks but no cost basis, initialize it to current value
        if (stocksVal > 0 && (this.stats.stocksCost === undefined || this.stats.stocksCost === null)) {
            this.stats.stocksCost = stocksVal;
        }
        
        const stocksCost = this.stats.stocksCost || 0;
        let profitLossHTML = "";
        
        if (stocksVal > 0 && stocksCost > 0) {
            const diff = stocksVal - stocksCost;
            const color = diff >= 0 ? '#44ff44' : '#ff4444';
            const sign = diff >= 0 ? '+' : '';
            profitLossHTML = ` <span style="color: ${color}; font-size: 0.9em; margin-left: 5px;">(${sign}${Math.floor(diff)} K$)</span>`;
        }
        
        document.getElementById('invest-stocks').innerHTML = stocksVal + profitLossHTML;
    }

    handleInvest(type, action) {
        if (action === 'buy') {
            const slider = document.getElementById('invest-slider');
            const amount = Math.floor(parseFloat(slider.value));
            
            if (amount <= 0 || amount > this.stats.money) return;
            
            this.stats.money -= amount;
            this.stats[type] = (this.stats[type] || 0) + amount;
            
            // Track cost basis for stocks profit/loss
            if (type === 'stocks') {
                this.stats.stocksCost = (this.stats.stocksCost || 0) + amount;
            }
            
        } else if (action === 'sell') {
            const amount = Math.floor(this.stats[type] || 0);
            if (amount <= 0) return;
            
            this.stats[type] = 0;
            this.stats.money += amount;
            
            // Reset cost basis
            if (type === 'stocks') {
                this.stats.stocksCost = 0;
            }
        }
        
        this.updateUI(); // Update main UI (money displayed there)
        this.updateInvestUI(); // Update modal UI
    }

    setupRejectionListeners() {
        document.getElementById('btn-rejection-ok').onclick = () => {
            this.elements.rejectionOverlay.style.display = 'none';
            this.resolvePauseState();
        };
    }

    showRejection(locationName, screeningValue) {
        this.isPaused = true;
        const effectivePop = this.getEffectivePopularity();
        const socialStanding = this.getSocialStanding();
        
        document.getElementById('rejection-message').innerText = `You were turned away from the ${locationName}. You're not important enough yet.`;
        document.getElementById('rejection-stats').innerHTML = `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; margin-bottom: 5px;">
                <span>Popularity (Eff):</span> <span>${Math.floor(effectivePop)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; margin-bottom: 5px;">
                <span>Beauty:</span> <span>${Math.floor(this.stats.beauty)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; margin-bottom: 5px;">
                <span>Talent:</span> <span>${Math.floor(this.stats.talent)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; color: #ff4444;">
                <span>TOTAL STANDING:</span> <span>${Math.floor(socialStanding)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #44ff44;">
                <span>REQUIRED:</span> <span>${screeningValue}</span>
            </div>
        `;
        this.elements.rejectionOverlay.style.display = 'flex';
    }

    getSocialStanding() {
        return this.getEffectivePopularity() + this.stats.beauty + this.stats.talent;
    }

    setupJobListeners() {
        document.getElementById('btn-job-apply').onclick = () => this.handleJobChoice('apply');
        document.getElementById('btn-job-ignore').onclick = () => this.handleJobChoice('ignore');
    }

    getJobData(id) {
        // Try CONFIG first
        if (CONFIG.JOBS[id]) {
            const job = { ...CONFIG.JOBS[id], id: id };
            // Add default fields for legacy jobs
            if (id === 'Cashier') job.field = 'Retail';
            if (id === 'Drug Dealer') job.field = 'Crime';
            return job;
        }
        // Try Registry
        const regJob = registry.jobs.find(j => j.id === id);
        if (regJob) return regJob;
        
        return null;
    }

    showJobOffer(jobName) {
        this.isPaused = true;
        this.currentJobName = jobName;
        const job = this.getJobData(jobName);

        if (!job) {
            console.error("Job data not found for:", jobName);
            this.closeJobOffer();
            return;
        }

        document.getElementById('job-title').innerText = (job.name || jobName).toUpperCase();
        document.getElementById('job-description').innerText = job.description || "A job opportunity.";
        
        // Show Field Requirements
        const currentFieldPromos = this.promotionsCount[job.field] || 0;
        
        document.getElementById('job-stats').innerHTML = `
            <div>FIELD: ${job.field || 'General'} (Level ${job.level || 1})</div>
            <div>PAY: ${job.pay}K$ per visit</div>
            <div>LIFETIME RISK: ${((job.risk || 0) * 100).toFixed(0)}%</div>
            <div>REQ. POPULARITY: ${job.reqPopularity || 0}</div>
            <div>MAX PROMOTIONS: ${job.maxPromotions || 3}</div>
            <div style="margin-top: 5px; color: #aaa; font-size: 10px;">
                Your Experience in ${job.field || 'General'}: ${currentFieldPromos} Promos
            </div>
        `;
        document.getElementById('job-result').innerText = "";
        this.elements.jobOverlay.style.display = 'flex';
        
        document.getElementById('btn-job-apply').disabled = false;
        document.getElementById('btn-job-ignore').disabled = false;
    }

    handleJobChoice(choice) {
        if (choice === 'ignore') {
            this.closeJobOffer();
            return;
        }

        const job = this.getJobData(this.currentJobName);
        const resultText = document.getElementById('job-result');

        if (this.stats.popularity >= (job.reqPopularity || 0)) {
            resultText.innerText = "Accepted! You are now hired.";
            resultText.style.color = '#44ff44';
            
            // Reset promotions count if starting work in a new field
            const newField = job.field || 'General';
            const hasExperienceInOtherFields = Object.keys(this.promotionsCount).some(f => f !== newField);
            
            if (hasExperienceInOtherFields) {
                this.promotionsCount = {};
                // Clear all field experience popularity sources
                Object.keys(this.popularitySources).forEach(key => {
                    if (key.startsWith('FieldExp_')) {
                        this.removePopularitySource(key);
                    }
                });
            }

            // Remove popularity from previous jobs
            this.hiredJobs.forEach(prevJobId => {
                const prevJob = this.getJobData(prevJobId);
                if (prevJob && prevJob.gainedPopularity) {
                    this.removePopularitySource('Job_Base_' + prevJobId);
                }
            });

            // Player can only have one job at a time
            this.hiredJobs.clear();
            this.hiredJobs.add(this.currentJobName);
            // Reset current job specific progress
            this.currentJobPromotions = 0;
            
            // Add popularity for new job
            if (job.gainedPopularity) {
                this.addPopularity('Job_Base_' + this.currentJobName, job.gainedPopularity);
            }
            
            setTimeout(() => this.closeJobOffer(), 1200);
        } else {
            resultText.innerText = "Rejected. You aren't popular enough.";
            resultText.style.color = '#ff4444';
            setTimeout(() => this.closeJobOffer(), 1200);
        }

        document.getElementById('btn-job-apply').disabled = true;
        document.getElementById('btn-job-ignore').disabled = true;
    }

    closeJobOffer() {
        this.elements.jobOverlay.style.display = 'none';
        this.resolvePauseState();
        this.currentJobName = null;
    }

    isHired(jobName) {
        return this.hiredJobs.has(jobName);
    }

    loseAllJobs(resetCareer = true) {
        this.hiredJobs.forEach(jobName => {
            const job = this.getJobData(jobName);
            if (job && job.gainedPopularity) {
                this.removePopularitySource('Job_Base_' + jobName);
            }
        });
        this.hiredJobs.clear();
        this.currentJobPromotions = 0;
        
        if (resetCareer) {
            this.promotionsCount = {};
            // Clear all field experience popularity sources
            Object.keys(this.popularitySources).forEach(key => {
                if (key.startsWith('FieldExp_')) {
                    this.removePopularitySource(key);
                }
            });
        }
        
        this.updateUI();
    }

    checkPromotion(jobName) {
        if (!this.isHired(jobName)) return false;
        
        const job = this.getJobData(jobName);
        if (!job) return false;

        // Check against current job specific progress
        if (this.currentJobPromotions >= (job.maxPromotions || 3)) return false;

        // Chance = 50% for 100 Talent -> (talent/100) * 0.5
        const promotionChance = (this.stats.talent / 100) * 0.5;
        
        if (CONFIG.UTILS.random() < promotionChance) {
            this.currentJobPromotions++;
            
            // Track Field Promotion
            const field = job.field || 'General';
            this.promotionsCount[field] = (this.promotionsCount[field] || 0) + 1;

            // 1. Remove the old field-based popularity first to prevent stacking
            this.removePopularitySource('FieldExp_' + field);

            // 2. Add the NEW total count as the popularity amount
            // This rewards the player for their entire career history in this field
            this.addPopularity('FieldExp_' + field, this.promotionsCount[field]);
            return true;
        }
        return false;
    }

    getJobPay(jobName) {
        const job = this.getJobData(jobName);
        if (!job) return 0;

        let totalPay = job.pay; // Start with Base Pay

        // 1. Sum up all incremental bonuses based on current rank
        if (job.promoBonuses && this.currentJobPromotions > 0) {
            for (let i = 0; i < this.currentJobPromotions; i++) {
                // Add bonus for each level reached (safe against missing data)
                totalPay += (job.promoBonuses[i] || 0);
            }
        }

        // 2. Add Field Experience Bonus (Legacy Skill)
        // Provides 0.5 coins per total career promotion in this field
        const fieldBonus = Math.floor((this.promotionsCount[job.field || 'General'] || 0) * 0.5);
        
        return totalPay + fieldBonus;
    }


    getTotalRisk() {
        let total = this.globalRisk || 1.0;
        
        // Add risk from hired jobs
        this.hiredJobs.forEach(jobName => {
            const job = this.getJobData(jobName);
            if (job && job.risk) {
                total += job.risk;
            }
        });
        
        // Add risk from active buffs
        this.activeBuffs.forEach(buff => {
            if (buff.risk) {
                total += buff.risk;
            }
        });
        
        return total;
    }

    update(deltaTime) {
        if (this.isTrulyPaused()) return;
        
        // Scale deltaTime by game speed
        const dt = deltaTime * this.gameSpeed;

        // --- LIFETIME STATS TRACKING ---
        this.lifetimeMaxStats.money = Math.max(this.lifetimeMaxStats.money, this.stats.money);
        this.lifetimeMaxStats.popularity = Math.max(this.lifetimeMaxStats.popularity, this.getEffectivePopularity());
        this.lifetimeMaxStats.beauty = Math.max(this.lifetimeMaxStats.beauty, this.stats.beauty);
        this.lifetimeMaxStats.talent = Math.max(this.lifetimeMaxStats.talent, this.stats.talent);

        // Work Timer Logic
        if (this.isWorking) {
            this.workTimer -= (dt * 1000); // convert dt (sec) to ms
            if (this.workTimer <= 0) {
                this.completeWork();
            }
        }

        const totalRisk = this.getTotalRisk();

        // --- INJURY CHECK ---
        // New Logic: totalRisk represents the % chance to get injured over the player's lifespan.
        // Lifespan L = 100 / average_decay
        const avgDecay = (CONFIG.PLAYER.HEALTH_DECAY_BASE + CONFIG.PLAYER.HEALTH_DECAY_REDUCED) / 2;
        const lifespan = 100 / avgDecay;
        
        // Probability per second = totalRisk / lifespan
        if (CONFIG.UTILS.random() < (totalRisk / lifespan) * dt) {
            this.stats.health = Math.max(0, this.stats.health - 50);
            this.isPaused = true;

            // Reset duration so it clears upon resume
            this.activeBuffs.forEach(buff => {
                if (buff.risk) buff.duration = 0;
            });

            this.elements.injuryRiskValue.innerText = (totalRisk / lifespan * 100).toFixed(0) + '%';
            this.elements.injuryOverlay.style.display = 'flex';
            console.log(`INJURY! -50 Health due to high risk factors (Risk per second: ${((totalRisk / lifespan) * dt * 100).toFixed(0)}%)`);
        }

        // Determine current decay rate
        let currentDecay = CONFIG.PLAYER.HEALTH_DECAY_BASE;
        if (this.gymBuffTimeRemaining > 0) {
            this.gymBuffTimeRemaining -= dt * 1000;
            currentDecay = CONFIG.PLAYER.HEALTH_DECAY_REDUCED;
        }

        // Handle Active Buffs (Event Duration System)
        if (this.activeBuffs.length > 0) {
            // Display the first active buff/event
            const primaryEvent = this.activeBuffs[0];
            this.elements.eventTimer.style.display = 'block';
            this.elements.eventLabel.innerText = primaryEvent.id.toUpperCase().replace(/_/g, ' ');
            this.elements.eventTime.innerText = `${Math.ceil(primaryEvent.duration)}s`;
            
            // Filter out expired buffs
            this.activeBuffs = this.activeBuffs.filter(buff => {
                buff.duration -= dt;
                if (buff.income) {
                    this.stats.money += buff.income * dt;
                }
                return buff.duration > 0;
            });
        } else {
            this.elements.eventTimer.style.display = 'none';
        }

        // Health decay
        this.stats.health = Math.max(0, this.stats.health - currentDecay * dt);
        
        // Money Inflation (Continuous decay)
        const inflation = CONFIG.PLAYER.INFLATION_RATE || 0.01;
        this.stats.money *= Math.exp(-inflation * dt);
        
        // Stock Market Simulation (Merton Jump Diffusion)
        this.updateStocks(dt);
        
        // Disaster Check
        this.checkDisasters(dt);

        // Update active business lifespan
        if (this.business) {
            // Run business simulation (Sales, etc.)
            // Note: business.update might nullify this.business (e.g. bankruptcy)
            this.business.update(dt, this);

            if (this.business && this.business.isExpired()) {
                this.showBusinessClosure("Lifespan reached. Your startup cycle is complete!", this.business);
            } else if (this.business && this.elements.startupOverlay.style.display === 'flex') {
                this.updateStartupUI();
            }
        }
        
        if (this.stats.health <= 0) {
            this.gameOver();
        }

        this.updateUI(currentDecay);
    }

    checkDisasters(dt) {
        if (this.activeBuffs.length > 0) return; // Wait for previous disaster to clear
        const disasters = CONFIG.PLAYER.DISASTERS || [];
        for (const disaster of disasters) {
            if (CONFIG.UTILS.random() < disaster.probability * dt) {
                this.triggerDisaster(disaster);
                break; // One disaster at a time
            }
        }
    }
    
    triggerDisaster(disaster) {
        this.isPaused = true;
        
        if (disaster.triggersCrash) {
            this.triggerMarketCrash();
        }
        
        document.getElementById('disaster-title').innerText = disaster.title;
        document.getElementById('disaster-description').innerText = disaster.description;
        
        const optionsContainer = document.getElementById('disaster-options');
        optionsContainer.innerHTML = '';
        
        disaster.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.style.padding = '15px';
            btn.style.background = '#330000';
            btn.style.color = '#ffaaaa';
            btn.style.border = '1px solid #ff4444';
            btn.style.fontFamily = 'Orbitron';
            btn.style.cursor = 'pointer';
            btn.style.textAlign = 'left';
            btn.style.display = 'flex';
            btn.style.justifyContent = 'space-between';
            
            btn.innerHTML = `
                <span>${opt.label}</span>
                <span style="font-size: 12px; color: #ff8888;">${opt.effectDescription || ''} ${opt.cost > 0 ? `(-${opt.cost}$)` : ''}</span>
            `;
            
            btn.onclick = () => {
                if (this.stats.money < opt.cost) {
                    return;
                }
                this.stats.money -= opt.cost;
                if (opt.action) opt.action(this);
                this.closeDisaster();
            };
            
            optionsContainer.appendChild(btn);
        });
        
        this.elements.disasterOverlay.style.display = 'flex';
    }
    
    closeDisaster() {
        this.elements.disasterOverlay.style.display = 'none';
        this.resolvePauseState();
        this.updateUI();
    }
    
    addBuff(id, effect) {
        // Replace existing buff with same id or push new
        const existing = this.activeBuffs.find(b => b.id === id);
        if (existing) {
            existing.duration = effect.duration;
            existing.income = effect.income;
            existing.risk = effect.risk;
        } else {
            this.activeBuffs.push({ id, ...effect });
        }
        console.log(`Buff added: ${id}`, effect);
    }

    updateStocks(dt) {
        // Initialize market index if missing (e.g. old save)
        if (!this.stats.marketIndex) this.stats.marketIndex = 100;
        if (!this.stats.stockHistory) this.stats.stockHistory = [];

        const econ = CONFIG.PLAYER.ECONOMY;
        // Convert real time to game years
        const yearsDt = dt / econ.GAME_YEAR_SECONDS;

        // 1. Drift (Growth) — with Itô correction so STOCK_DRIFT really means "expected return"
        const drift = (econ.STOCK_DRIFT - 0.5 * Math.pow(econ.STOCK_VOLATILITY, 2)) * yearsDt;

        // 2. Diffusion (Volatility)
        // Brownian motion: sigma * standard_normal * sqrt(dt)
        const diffusion = econ.STOCK_VOLATILITY * this.getGaussian() * Math.sqrt(yearsDt);

        // 3. Jump (Crash)
        // Poisson process: chance = lambda * dt
        let jump = 0;
        if (CONFIG.UTILS.random() < econ.STOCK_JUMP_LAMBDA * yearsDt) {
            // Crash factor between 0.6 and 0.8
            const crashFactor = econ.STOCK_JUMP_MIN + CONFIG.UTILS.random() * (econ.STOCK_JUMP_MAX - econ.STOCK_JUMP_MIN);
            jump = Math.log(crashFactor);
            console.log(`MARKET CRASH! Stocks dropped by ${((1 - crashFactor) * 100).toFixed(1)}%`);
        }

        // Apply change: S_new = S_old * e^(drift + diffusion + jump)
        const exponent = drift + diffusion + jump;
        
        // Update Market Index
        this.stats.marketIndex *= Math.exp(exponent);
        
        // Update player holdings (if any)
        if (this.stats.stocks > 0) {
            this.stats.stocks *= Math.exp(exponent);
        }

        // Stock History Logic (every 0.5s of real time, adjusted for game speed)
        this.lastChartUpdate = (this.lastChartUpdate || 0) + dt;
        const interval = econ.CHART_UPDATE_INTERVAL || 0.5;
        
        if (this.lastChartUpdate >= interval) {
            this.lastChartUpdate = 0;
            this.stats.stockHistory.push(this.stats.marketIndex);
            
            const limit = econ.CHART_HISTORY_SIZE || 50;
            if (this.stats.stockHistory.length > limit) {
                this.stats.stockHistory.shift();
            }
            
            // Redraw chart immediately when new data arrives
            this.renderStockChart();
        }
    }

    renderStockChart() {
        console.log("Drawing Chart...");
        const canvas = document.getElementById('stock-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const history = this.stats.stockHistory || [];
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (history.length < 2) return;
        
        // Find range
        let min = Math.min(...history);
        let max = Math.max(...history);
        
        // Add padding (10%)
        const range = max - min;
        const padding = range > 0 ? range * 0.1 : 1;
        min -= padding;
        max += padding;
        
        // Determine color (green if up, red if down)
        const latest = history[history.length - 1];
        const previous = history[history.length - 2];
        const color = latest >= previous ? '#44ff44' : '#ff4444';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const stepX = canvas.width / (history.length - 1);
        
        history.forEach((val, i) => {
            const x = i * stepX;
            // Map val to y (invert Y axis so high value is top)
            const y = canvas.height - ((val - min) / (max - min)) * canvas.height;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
    }

    triggerMarketCrash() {
        if (this.stats.stocks <= 0) return;
        
        const econ = CONFIG.PLAYER.ECONOMY;
        const crashFactor = econ.STOCK_JUMP_MIN + CONFIG.UTILS.random() * (econ.STOCK_JUMP_MAX - econ.STOCK_JUMP_MIN);
        this.stats.stocks *= crashFactor;
        
        console.log(`FORCED MARKET CRASH! Stocks dropped by ${((1 - crashFactor) * 100).toFixed(1)}%`);
        this.updateUI();
        if (this.elements.investOverlay.style.display !== 'none') {
            this.updateInvestUI();
        }
    }

    getGaussian() {
        if (this.nextGaussian !== null) {
            const val = this.nextGaussian;
            this.nextGaussian = null;
            return val;
        }
        const [v1, v2] = CONFIG.UTILS.boxMullerPair();
        this.nextGaussian = v2;
        return v1;
    }

    setupMeetingListeners() {
        document.getElementById('btn-friend').onclick = () => this.handleMeetingChoice('friend');
        document.getElementById('btn-marry').onclick = () => this.handleMeetingChoice('spouse');
        document.getElementById('btn-ignore').onclick = () => this.handleMeetingChoice('ignore');
    }

    showMeeting(screening = 0) {
        this.isPaused = true;
        const person = this.generatePerson(screening);
        this.currentMetPerson = person;

        document.getElementById('person-name').innerText = person.name;

        // 1. Calculate Stat Gaps
        const diffTalent = person.stats.talent - this.stats.talent;
        const diffPop = person.stats.popularity - this.stats.popularity;
        const diffBeauty = person.stats.beauty - this.stats.beauty;

        // 2. Formatting Helper (Red if they are better/harder, Green if worse/easier)
        const formatDiff = (val) => {
            const sign = val >= 0 ? '+' : '';
            // If stranger is better (+), show Red (Warning). If stranger is worse (-), show Green (Safe).
            const color = val > 0 ? '#44ff44' : (val < 0 ? '#ff4444' : '#888');
            return `<span style="color: ${color}; font-size: 11px; margin-left: 8px; font-weight: bold;">(${sign}${Math.floor(val)})</span>`;
        };

        // Update Marry Button Text
        const btnMarry = document.getElementById('btn-marry');
        if (btnMarry) {
            btnMarry.innerText = `MARRY (${CONFIG.PLAYER.ECONOMY.MARRY_COST}K$)`;
        }

        // 3. Inject into HTML
        document.getElementById('person-stats').innerHTML = `
            <div>TALENT: ${person.stats.talent} ${formatDiff(diffTalent)}</div>
            <div>POPULARITY: ${person.stats.popularity} ${formatDiff(diffPop)}</div>
            <div>BEAUTY: ${person.stats.beauty} ${formatDiff(diffBeauty)}</div>
        `;

        document.getElementById('meeting-result').innerText = "";
        this.elements.meetingOverlay.style.display = 'flex';
        
        const friendCount = this.socialCircle.filter(p => p.type === 'friend').length;
        const beFriendBtn = document.getElementById('btn-friend');
        
        if (friendCount >= 5) {
            beFriendBtn.disabled = true;
            beFriendBtn.style.opacity = '0.5';
            beFriendBtn.innerText = 'LIMIT REACHED';
        } else {
            beFriendBtn.disabled = false;
            beFriendBtn.style.opacity = '1';
            beFriendBtn.innerText = 'BE FRIENDS';
        }

        // Show choice buttons again in case they were hidden or disabled
        const buttons = document.querySelectorAll('.choice-btn');
        buttons.forEach(b => {
            if (b.id !== 'btn-friend' || friendCount < 5) {
                b.style.display = 'inline-block';
                b.disabled = false;
            }
        });
    }

    generatePerson(screening = 0) {
        const names = ["Alex", "Jordan", "Casey", "Morgan", "Taylor", "Riley", "Quinn"];
        
        // Mean centered around screening/3
        const mean = screening / 3;
        const stdDev = 6;

        const generateStat = () => {
            let val = mean + this.getGaussian() * stdDev;
            // Lower bound cut-off at screening/3
            // Assuming the screening value refers to the mean threshold here.
            return Math.max(Math.floor(val), Math.floor(screening / 3));
        };

        const talent = generateStat();
        const beauty = generateStat();
        const minStat = Math.min(talent, beauty);
        const maxStat = Math.max(talent, beauty);
        const popularity = minStat + Math.floor(CONFIG.UTILS.random() * (maxStat - minStat + 1));

        return {
            name: names[Math.floor(CONFIG.UTILS.random() * names.length)],
            stats: {
                talent,
                beauty,
                popularity
            }
        };
    }

    handleMeetingChoice(type) {
        if (type === 'ignore') {
            this.closeMeeting();
            return;
        }

        const resultText = document.getElementById('meeting-result');
        
        if (type === 'friend') {
            const friendCount = this.socialCircle.filter(p => p.type === 'friend').length;
            if (friendCount >= 5) {
                resultText.innerText = "Friend limit reached (Max 5)!";
                resultText.style.color = '#ff4444';
                return;
            }
        }

        if (type === 'spouse') {
            const cost = CONFIG.PLAYER.ECONOMY.MARRY_COST;
            if (this.stats.money < cost) {
                resultText.innerText = `You need ${cost}K$ to propose!`;
                resultText.style.color = '#ff4444';
                return;
            }
            this.stats.money -= cost;
            this.updateUI();
        }

        const person = this.currentMetPerson;

        // Effective popularity used for gap calculation
        // women tend to valuate talent more (~0.4x) than beauty (~0.25x)
        const playerSum = 
            0.25 * this.stats.beauty +          
            0.35 * this.getEffectivePopularity() +
            0.4 * this.stats.talent;           
        const personSum = 
            0.35 * person.stats.beauty +        
            0.3 * person.stats.popularity + 
            0.35 * person.stats.talent;
        
        const gap = playerSum -personSum ; // positive = you are better
    
        let agreeChance = 0.05;
        if (type === 'spouse') {
            // for males, finding a better than them partner is unlikely according to studies.
            // nontheless, we tampered a little with the graph to make it more playable.
            agreeChance =  0.98 / (1 + Math.exp( -(gap - 2) / 12 ));
        } else {
            // Friendship depends on similarity according to studies
            agreeChance = 1.5 / (1 + Math.exp( Math.abs(gap) / 28 ));
        }

        
        agreeChance = Math.max(0.02, agreeChance); // Min 2% chance

        if (CONFIG.UTILS.random() < agreeChance) {
            resultText.innerText = `They accepted! You are now ${type === 'spouse' ? 'married' : 'friends'}.`;
            resultText.style.color = '#44ff44';
            
            if (type === 'spouse') {
                this.socialCircle = this.socialCircle.filter(p => p.type !== 'spouse');
            }
            
            this.socialCircle.push({ ...person, type });
            this.updateSocialUI();
            
            setTimeout(() => this.closeMeeting(), 1200);
        } else {
            if (type === 'spouse') {
                this.stats.money += CONFIG.PLAYER.ECONOMY.MARRY_COST - 10;
                this.updateUI();
                resultText.innerText = `They rejected you. "Not in my league." (Refunded ${CONFIG.PLAYER.ECONOMY.MARRY_COST - 10}K$)`;
            } else {
                resultText.innerText = `They rejected you. "No chemistry."`;
            }
            resultText.style.color = '#ff4444';
            setTimeout(() => this.closeMeeting(), 1200);
        }
        
        document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    }

    closeMeeting() {
        this.elements.meetingOverlay.style.display = 'none';
        this.resolvePauseState();
        this.currentMetPerson = null;
    }

    haveKid() {
        if (this.stats.money < CONFIG.PLAYER.ECONOMY.HAVE_KID_COST) {
            return;
        }

        // Find spouse to inherit potential
        const spouse = this.socialCircle.find(p => p.type === 'spouse');
        if (spouse) {
            this.stats.maxBeauty = (this.stats.maxBeauty + spouse.stats.beauty) / 2;
            this.stats.talent = (this.stats.talent + spouse.stats.talent) / 2;
        }

        this.stats.money -= CONFIG.PLAYER.ECONOMY.HAVE_KID_COST;
        this.stats.health = 100;
        // this.stats.beauty = 0; // Reset current beauty
        this.stats.beauty = Math.max(0, this.stats.maxBeauty - 20); // Start with a penalty to current beauty that can be regained
        this.stats.generations = (this.stats.generations || 1) + 1; // Increment generation
        
        // Reset Education for next generation
        this.collegeVisits = 0;
        this.isCollegeActive = false;
        this.collegeProgress = 0;
        this.gymBuffTimeRemaining = 0; // Reset gym buff for next generation
        
        // Clean up popularity ledger for personal achievements (Education and Jobs)
        // Note: 'ActiveHome' and 'BusinessSales' are kept as lineage-based status
        // otherwise can add  || key === 'BusinessSales' if we want to reset business legacy as well.
        Object.keys(this.popularitySources).forEach(key => {
            if (key === 'College' || key.startsWith('Job_') || key === 'WarHero' || key.startsWith('FieldExp_')) {
                this.removePopularitySource(key);
            }
        });
        
        // NOTE: this.business is inherited by the next generation automatically
        this.socialCircle = []; // Delete all networks
        this.hiredJobs.clear(); // Lose current job
        this.promotionsCount = {}; // Reset field promotions (Human Capital resets)
        this.currentJobPromotions = 0; // Reset current job rank
        this.updateSocialUI();
        this.updateUI();
        
        const resultText = document.getElementById('meeting-result');
        if (resultText) {
            resultText.innerText = `Generation passed. Talent: ${this.stats.talent.toFixed(1)}, Max Beauty: ${this.stats.maxBeauty.toFixed(1)}.`;
            resultText.style.color = '#44ffff';
        }
        
        // Ensure player spawns at the correct active home
        if (this.onHomeChange) {
            this.onHomeChange(this.activeHome);
        }

        // Clear all active buffs that have a risk component
        this.activeBuffs = this.activeBuffs.filter(buff => !buff.risk);

        // Manually hide the timer if no buffs are left
        if (this.activeBuffs.length === 0) {
            this.elements.eventTimer.style.display = 'none';
        }
    }

    getEffectivePopularity() {
        let bonus = 0;
        this.socialCircle.forEach(p => {
            if (p.type === 'friend') {
                bonus += p.stats.popularity * 0.03;
            } else if (p.type === 'spouse') {
                bonus += p.stats.popularity * 0.1;
            }
        });
        
        return Math.min(100, this.stats.popularity + bonus);
    }

    removeSocial(index) {
        this.socialCircle.splice(index, 1);
        this.updateSocialUI();
        this.updateUI();
    }

    updateSocialUI() {
        if (this.socialCircle.length > 0) {
            this.elements.socialPanel.style.display = 'block';
            this.elements.socialList.innerHTML = '';
            
            this.socialCircle.forEach((p, index) => {
                const div = document.createElement('div');
                div.style.marginBottom = '8px';
                div.style.borderBottom = '1px solid #222';
                div.style.paddingBottom = '4px';
                
                let content = `
                    <strong style="color: ${p.type === 'spouse' ? '#ff44ff' : '#4444ff'}">${p.name} (${p.type.toUpperCase()})</strong><br/>
                    T:${p.stats.talent} P:${p.stats.popularity} B:${p.stats.beauty}
                `;
                
                div.innerHTML = content;

                const controls = document.createElement('div');
                controls.style.display = 'flex';
                controls.style.gap = '5px';
                controls.style.marginTop = '5px';

                if (p.type === 'spouse') {
                    const kidBtn = document.createElement('button');
                    kidBtn.innerText = `HAVE KID (${CONFIG.PLAYER.ECONOMY.HAVE_KID_COST}K$)`;
                    kidBtn.style.fontSize = '9px';
                    kidBtn.style.cursor = 'pointer';
                    kidBtn.style.background = '#44ffff';
                    kidBtn.style.border = 'none';
                    kidBtn.style.fontFamily = 'Orbitron';
                    kidBtn.style.padding = '2px 5px';
                    kidBtn.onclick = () => {
                        if (this.onHaveKid) this.onHaveKid();
                        else this.haveKid();
                    };
                    controls.appendChild(kidBtn);
                }

                // Remove friend / divorce button
                const removeBtn = document.createElement('button');
                removeBtn.innerText = p.type === 'friend' ? 'REMOVE FRIEND' : 'DIVORCE';
                removeBtn.style.fontSize = '9px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.background = '#444';
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.fontFamily = 'Orbitron';
                removeBtn.style.padding = '2px 5px';
                removeBtn.onclick = () => this.removeSocial(index);
                controls.appendChild(removeBtn);

                div.appendChild(controls);
                this.elements.socialList.appendChild(div);
            });
        } else {
            this.elements.socialPanel.style.display = 'none';
        }
    }

    applyGymBuff() {
        this.gymBuffTimeRemaining = CONFIG.PLAYER.GYM_BUFF_DURATION;
    }

    addPopularity(sourceName, amount) {
        if (this.isGameOver) return;
        this.stats.popularity += amount;
        this.popularitySources[sourceName] = (this.popularitySources[sourceName] || 0) + amount;
        this.updateUI();
    }

    removePopularitySource(sourceName) {
        if (this.isGameOver) return;
        if (this.popularitySources[sourceName] !== undefined) {
            this.stats.popularity -= this.popularitySources[sourceName];

            // ADD THIS CLAMP: Prevent popularity from ever going negative
            if (this.stats.popularity < 0) this.stats.popularity = 0;

            delete this.popularitySources[sourceName];
            this.updateUI();
        }
    }

    addStat(name, amount, limit = 100) {
        if (this.isGameOver) return;
        
        // Handle beauty with dynamic maxBeauty limit
        if (name === 'beauty') {
            const actualLimit = Math.min(limit, this.stats.maxBeauty);
            this.stats.beauty = Math.min(actualLimit, this.stats.beauty + amount);
        } else if (name === 'money') {
            // Money has no upper limit
            this.stats.money += amount;
        } else {
            this.stats[name] = Math.max(0, Math.min(limit, this.stats[name] + amount));
        }
        
        this.updateUI();
    }

    updateUI(currentDecay = CONFIG.PLAYER.HEALTH_DECAY_BASE) {
        if (this.isPaused && currentDecay === CONFIG.PLAYER.HEALTH_DECAY_BASE) return;
        
        const totalPop = this.getEffectivePopularity();
        
        // Update bars
        this.updateBar('health', this.stats.health);
        this.updateBar('popularity', totalPop, false, true); // Total pop including friends
        this.updateBar('beauty', this.stats.beauty, true); 
        this.updateBar('talent', this.stats.talent, false, false, true);

        // Update money text
        if (this.elements.money) {
            this.elements.money.innerText = Math.floor(this.stats.money) + ' K$';
        }

        // Update health rate text
        if (this.elements.healthRate) {
            this.elements.healthRate.innerText = `-${currentDecay.toFixed(1)}/s`;
            this.elements.healthRate.style.color = currentDecay < CONFIG.PLAYER.HEALTH_DECAY_BASE ? '#44ff44' : '#ff4444';
        }

        // Update Invest UI if open
        if (this.elements.investOverlay && this.elements.investOverlay.style.display !== 'none') {
            this.updateInvestUI();
        }

        this.updateBusinessDashboard();
        this.updateCollegeDashboard();
    }

    updateCollegeDashboard() {
        const dash = document.getElementById('college-dashboard');
        if (!dash) return;

        if (this.isCollegeActive) {
            dash.style.display = 'block';
            const bar = document.getElementById('college-progress-bar');
            const text = document.getElementById('college-progress-text');
            
            if (bar) bar.style.width = `${this.collegeProgress}%`;
            if (text) text.innerText = `${Math.floor(this.collegeProgress)} / 100`;
        } else {
            dash.style.display = 'none';
        }
    }

    updateBusinessDashboard() {
        if (!this.elements.dashboard) return;

        // 1. Determine desired state
        const desiredState = this.business ? 'ACTIVE' : 'NONE';
        
        // 2. Check current state
        const currentState = this.elements.dashboard.dataset.state;
        
        // 3. Render structure if state changed
        if (currentState !== desiredState) {
            this.renderDashboardStructure(desiredState);
            this.elements.dashboard.dataset.state = desiredState;
        }

        // 4. Update values
        if (desiredState === 'ACTIVE') {
            this.updateDashboardValues();
        } else {
            // Update Start Button state dynamically based on money
            const btnStart = document.getElementById('dash-btn-start');
            if (btnStart) {
                const canAfford = this.stats.money >= CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST;
                if (canAfford) {
                    btnStart.disabled = false;
                    btnStart.style.opacity = '1';
                    btnStart.style.cursor = 'pointer';
                    btnStart.style.background = ''; 
                } else {
                    btnStart.disabled = true;
                    btnStart.style.opacity = '0.5';
                    btnStart.style.cursor = 'not-allowed';
                    btnStart.style.background = '#333';
                }
            }
        }
    }

    renderDashboardStructure(state) {
        if (state === 'NONE') {
            const canAfford = this.stats.money >= CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST;
            const btnStyle = canAfford ? '' : 'opacity: 0.5; cursor: not-allowed; background: #333;';
            const disabledAttr = canAfford ? '' : 'disabled';
            
            this.elements.dashboard.innerHTML = `
                <div style="text-align: center; color: #ffff44; font-weight: bold; border-bottom: 1px solid #555; padding-bottom: 5px; margin-bottom: 5px;">
                    NO ACTIVE VENTURE
                </div>
                <div class="dash-info" style="text-align: center; margin-bottom: 10px;">
                    Start a tech startup to earn passive income and build an empire.
                </div>
                <button class="dash-btn" id="dash-btn-start" style="${btnStyle}" ${disabledAttr}>Start Business (${CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST}K$)</button>
            `;
            
            const btn = document.getElementById('dash-btn-start');
            if (btn) {
                btn.onclick = () => {
                    if (this.stats.money < CONFIG.PLAYER.ECONOMY.START_BUSINESS_COST) {
                        // This shouldn't be reached if disabled, but for safety
                        btn.classList.add('shake-error');
                        btn.onanimationend = () => btn.classList.remove('shake-error');
                        return;
                    }
                    this.showStartupSetup();
                };
            }
        } else {
            this.elements.dashboard.innerHTML = `
                <div id="dash-header" style="text-align: center; color: #44ff44; font-weight: bold; border-bottom: 1px solid #555; padding-bottom: 5px; margin-bottom: 5px;"></div>
                <div id="dash-stats-row" style="display: flex; justify-content: space-between;" class="dash-info"></div>
                <div class="dash-progress-container">
                    <div id="dash-progress-bar" class="dash-progress-bar" style="width: 0%"></div>
                </div>
                <div id="dash-upgrade-text" class="dash-info" style="text-align: right; font-size: 10px;"></div>
                
                <button class="dash-btn" id="dash-btn-work">WORK ON BUSINESS</button>
                <button class="dash-btn" id="dash-btn-info" style="background: transparent; border: 1px solid #ffff44; color: #ffff44;">
                    BUSINESS INFO
                </button>
            `;
            
            const btnWork = document.getElementById('dash-btn-work');
            if (btnWork) {
                btnWork.onclick = () => {
                    if (this.onWorkOnBusiness) this.onWorkOnBusiness();
                };
            }
            
            const btnInfo = document.getElementById('dash-btn-info');
            if (btnInfo) {
                btnInfo.onclick = () => {
                    this.showStartupUI();
                };
            }
        }
    }

    updateDashboardValues() {
        if (!this.business) return;
        
        const b = this.business;
        
        // Update Header
        const header = document.getElementById('dash-header');
        if (header) header.innerText = `${b.getStageName().toUpperCase()} (Stage ${b.stage})`;
        
        // Update Stats Row
        const statsRow = document.getElementById('dash-stats-row');
        if (statsRow) {
            // Override default flex layout for better custom presentation
            statsRow.style.display = 'block';
            
            let marketHTML = `<span style="color: #888;">???</span>`;
            
            if (b.stage > 1 && b.marketTier) {
                marketHTML = `<span style="color: ${b.marketTier.color}; text-shadow: 0 0 8px ${b.marketTier.color}44; font-weight: bold; letter-spacing: 1px;">${b.marketTier.name.toUpperCase()}</span> <span style="color: #888; font-size: 10px;">${b.marketMultiplier.toFixed(1)}x</span>`;
            }

            // Determine the correct price array based on the tier
            const tierName = b.marketTier ? b.marketTier.name.toUpperCase() : 'STANDARD';
            const priceArray = CONFIG.BUSINESS[`PRICES_${tierName}`] || [0, 1];
            const currentPrice = priceArray[b.stage] || 1;

            statsRow.innerHTML = `
                <div style="text-align: center; margin-bottom: 8px; font-size: 10px; color: #aaa; letter-spacing: 0.5px;">
                    MARKET POTENTIAL<br/>
                    <div style="font-size: 13px; margin-top: 2px;">${marketHTML}</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-top: 1px solid #333; padding-top: 6px;">
                    <div style="text-align: center;">
                        <div style="font-size: 9px; color: #888;">UNITS SOLD</div>
                        <div style="font-size: 14px; color: #fff;">${b.totalProductsSold}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 9px; color: #888;">REV / UNIT</div>
                        <div style="font-size: 14px; color: #44ff44;">${currentPrice.toFixed(1)}K$</div>
                    </div>
                </div>
            `;
        }
        
        // Update Progress Bar
        const bar = document.getElementById('dash-progress-bar');
        if (bar) {
            const progressPct = (b.progress / b.maxProgress) * 100;
            bar.style.width = `${progressPct}%`;
        }
        
        // Update Upgrade Text
        const upgradeText = document.getElementById('dash-upgrade-text');
        if (upgradeText) {
            upgradeText.innerText = `Upgrade: ${Math.floor(b.progress)}/${b.maxProgress}`;
        }
        
        // Update Work Button State
        const btnWork = document.getElementById('dash-btn-work');
        if (btnWork) {
            const canWork = !this.isWorking;
            if (btnWork.disabled !== !canWork) {
                btnWork.disabled = !canWork;
            }
            const label = this.isWorking ? 'WORKING...' : 'WORK ON BUSINESS';
            if (btnWork.innerText !== label) {
                btnWork.innerText = label;
            }
        }
    }

    startWorking() {
        if (this.isWorking) return;
        this.isWorking = true;
        this.workTimer = CONFIG.PLAYER.WAIT_TIME; // e.g. 1000ms
        this.updateBusinessDashboard();
    }

    completeWork() {
        this.isWorking = false;
        if (!this.business) {
            this.updateBusinessDashboard();
            return;
        }

        // 1. Get the wait time in seconds
        const waitTimeSec = (CONFIG.PLAYER.WAIT_TIME || 1000) / 1000;

        // 2. Fetch the duration bounds based on the current numeric phase (e.g., 1, 2, 3, or 4)
        const phaseData = CONFIG.BUSINESS.PHASE_DURATIONS[this.business.stage];

        // Fallback logic in case the phase isn't defined in Config
        const minSec = phaseData ? phaseData.min : 30; 
        const maxSec = phaseData ? phaseData.max : 60;

        // 3. Calculate cycles (How many 'ticks' fit into the time window)
        // Note: min time (fastest) = fewer ticks needed; max time (slowest) = more ticks needed
        const fastCycles = minSec / waitTimeSec; 
        const slowCycles = maxSec / waitTimeSec;

        // 4. Calculate required increments to reach 100% progress
        const maxIncrement = 100 / fastCycles; // The "High Talent" push
        const minIncrement = 100 / slowCycles; // The "Low Talent" crawl

        // 5. Interpolate based on talent (Linear scale: 1 to 400)
        const talentFactor = (this.business.stats.talent - 1) / 399;
        const BusinessIncrement = minIncrement + talentFactor * (maxIncrement - minIncrement);

        // 6. Apply the progress
        this.business.incrementProgress(BusinessIncrement);
        
        // Investor check
        if (this.business.isSeekingInvestors) {
            const chance = Math.min(0.2, (this.business.stats.popularity / 100) * 0.2);
            if (Math.random() < chance) {
                this.triggerInvestorEvent();
            }
        }

        this.updateBusinessDashboard();
    }


    updateBar(id, value, isBeauty = false, isPopularity = false, isTalent = false) {
        const el = this.elements[id];
        if (el) {
            // Visual feedback: Beauty bar shows progress toward 100, but is limited by maxBeauty
            el.style.width = `${Math.min(100, Math.max(0, value))}%`;
            
            // Color feedback for health
            if (id === 'health') {
                if (value < 25) el.style.backgroundColor = '#ff4444';
                else if (value < 50) el.style.backgroundColor = '#ffaa44';
                else el.style.backgroundColor = '#44ff44';
            }
            
            // Update labels with limits
            const label = el.parentElement.previousElementSibling;
            if (label) {
                if (isBeauty) {
                    label.innerText = `BEAUTY (${Math.floor(value)} / ${Math.floor(this.stats.maxBeauty)})`;
                } else if (isPopularity) {
                    const totalPop = this.getEffectivePopularity();
                    const bonus = totalPop - this.stats.popularity;
                    label.innerText = `POPULARITY (${Math.floor(totalPop)}) ${bonus > 0 ? `(+${bonus.toFixed(1)} Network)` : ''}`;
                } else if (isTalent) {
                    label.innerText = `TALENT (${Math.floor(value)})`;
                }
            }
        }
    }

    calculateFinalScore() {
        let level10Price = 50000;
        if (registry && registry.houses) {
             const house = registry.houses.find(h => h.level === 10);
             // Check for 'price' (if mapped) or fallback to the raw JSON 'cost (k)'
             if (house) level10Price = house.price || house['cost (k)'] || 50000;
        }
        
        const normalizedMoney = Math.min(100, (this.lifetimeMaxStats.money / level10Price) * 100);
        const total = (normalizedMoney + this.lifetimeMaxStats.popularity + this.lifetimeMaxStats.beauty + this.lifetimeMaxStats.talent) / 4;
        const result = Math.min(100, Math.max(0, total));
        return isNaN(result) ? -1 : result; // Return -1 if score is invalid (e.g., due to missing data), otherwise return the calculated score
    }

    saveToLeaderboard(finalScore) {
        let leaderboard = [];
        try {
            leaderboard = JSON.parse(localStorage.getItem('EpicenterCity_Leaderboard') || '[]');
        } catch (e) {
            leaderboard = [];
        }

        const entry = {
            score: finalScore,
            generations: this.stats.generations || 1,
            peaks: { ...this.lifetimeMaxStats },
            timestamp: Date.now()
        };

        leaderboard.push(entry);
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 5);

        localStorage.setItem('EpicenterCity_Leaderboard', JSON.stringify(leaderboard));

        // Check if this new score is in the top 5
        return leaderboard.some(e => e.timestamp === entry.timestamp);
    }

    /**
     * Upload the final score to Steam leaderboard
     * @param {number} finalScore - The score to upload
     * Wrapped in try/catch to prevent crashes if Steam is unavailable
     */
    async uploadScoreToSteam(finalScore) {
        console.log('Game Over! Final Score:', finalScore);
        const cleanScore = Math.round(finalScore);
        
        // 1. Always save the best score locally first, just in case!
        const currentLocalBest = parseInt(localStorage.getItem('best_local_score')) || 0;
        if (cleanScore > currentLocalBest) {
            localStorage.setItem('best_local_score', cleanScore);
            // Flag it as un-synced!
            localStorage.setItem('unsynced_steam_score', cleanScore);
        }
        
        // 2. Try to upload to Steam
        if (window.steamAPI && window.steamAPI.uploadScore) {
            try {
                console.log('📤 Uploading score to Steam leaderboard...');
                const result = await window.steamAPI.uploadScore(cleanScore);
                
                if (result === true || (result && result.success)) {
                    console.log('✓ Score successfully uploaded to Steam!');
                    // Success! Remove the un-synced flag so we don't upload it again later
                    localStorage.removeItem('unsynced_steam_score');
                } else {
                    console.log(`⚠ Steam upload failed. Score safely backed up in local storage.`);
                }
            } catch (error) {
                console.error('❌ Error uploading score to Steam:', error);
                console.log('  Continuing anyway - local storage backup is intact');
            }
        } else {
            console.log('Steam API not found. Running offline/local mode.');
        }
    }
    /**
     * Checks local storage for any high scores that failed to upload previously,
     * and attempts to sync them with Steam.
     */
    async syncOfflineScore() {
        const unsyncedScore = localStorage.getItem('unsynced_steam_score');
        
        // If there's no pending score, do nothing
        if (!unsyncedScore) return; 

        console.log('🔄 Found an un-synced offline score. Attempting to sync with Steam...');
        
        if (window.steamAPI && window.steamAPI.uploadScore) {
            try {
                const scoreToSync = parseInt(unsyncedScore, 10);
                const result = await window.steamAPI.uploadScore(scoreToSync);
                
                if (result === true || (result && result.success)) {
                    console.log('✓ Offline score successfully synced to Steam!');
                    // Clear the flag so it doesn't keep syncing
                    localStorage.removeItem('unsynced_steam_score');
                } else {
                    console.log('⚠ Sync failed. Steam might still be offline. Will try again later.');
                }
            } catch (error) {
                console.error('❌ Error syncing offline score:', error);
            }
        }
    }

    renderLeaderboard() {
        const listContainer = document.getElementById('leaderboard-list');
        const hallOfFame = document.getElementById('hall-of-fame');
        if (!listContainer || !hallOfFame) return;

        let leaderboard = [];
        try {
            leaderboard = JSON.parse(localStorage.getItem('EpicenterCity_Leaderboard') || '[]');
        } catch (e) {
            leaderboard = [];
        }

        if (leaderboard.length === 0) {
            hallOfFame.style.display = 'none';
            return;
        }

        // Filter out invalid entries
        leaderboard = leaderboard.filter(e => e && typeof e.score === 'number');

        hallOfFame.style.display = 'block';
        listContainer.innerHTML = '';

        leaderboard.forEach((entry, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #333';
            div.style.fontFamily = "'Orbitron', sans-serif";
            div.style.fontSize = '14px';

            const score = typeof entry.score === 'number' ? entry.score : 0;
            const peaks = entry.peaks || { money: 0, popularity: 0, beauty: 0, talent: 0 };
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: 'Orbitron', sans-serif;">
                    <span style="color: #aa44ff; font-weight: bold; text-shadow: 0 0 10px rgba(170, 68, 255, 0.5);">#${index + 1}</span>
                    <span style="color: #ccAAff;">Gen ${entry.generations}</span>
                    <span style="color: #44ffff; font-weight: bold; text-shadow: 0 0 8px rgba(68, 255, 255, 0.4);">SCORE: ${score.toFixed(1)}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 10px; color: #888;">
                    <span>Money: ${Math.floor(peaks.money)}K$</span>
                    <span>Popularity: ${Math.floor(peaks.popularity)}P</span>
                    <span>Beauty: ${Math.floor(peaks.beauty)}B</span>
                    <span>Talent: ${Math.floor(peaks.talent)}T</span>
                </div>
            `;
            listContainer.appendChild(div);
        });
    }

    gameOver() {
        this.isGameOver = true;
        const finalScore = this.calculateFinalScore();
        const isHighScore = this.saveToLeaderboard(finalScore);
        
        // Upload score to Steam leaderboard (if available)
        this.uploadScoreToSteam(finalScore);
        
        // Refresh leaderboard on start screen for next time
        this.renderLeaderboard();

        if (this.elements.overlay) {
            this.elements.overlay.style.display = 'flex';
            
            const overlayContent = this.elements.overlay.querySelector('#game-over-content') || document.createElement('div');
            overlayContent.id = 'game-over-content';
            
            // Reset overlay content if it exists to avoid dupes (except title/button if they are separate)
            // Actually, the overlay in HTML has: h1, p, button. 
            // I'll inject a div between p and button.
            
            // Find existing results div or create
            let resultsDiv = document.getElementById('game-over-results');
            if (!resultsDiv) {
                resultsDiv = document.createElement('div');
                resultsDiv.id = 'game-over-results';
                resultsDiv.style.textAlign = 'center';
                resultsDiv.style.margin = '20px 0';
                
                const btn = document.getElementById('restart-button');
                this.elements.overlay.insertBefore(resultsDiv, btn);
            }
            
            let highScoreAnim = '';
            if (isHighScore) {
                highScoreAnim = `
                    <div style="color: #ffff44; font-size: 24px; font-weight: bold; margin-bottom: 15px; animation: pulseGlow 1.5s infinite;">
                        ★ NEW HIGH SCORE! ★
                    </div>
                `;
            }

            // EXIT TO DESKTOP BUTTON
            // const isElectron = window.electronAPI && window.electronAPI.isElectron;
            // const exitBtnHTML = isElectron ? `
            //     <button id="btn-gameover-exit" style="margin-top: 15px; padding: 12px 30px; background: rgba(255, 68, 68, 0.15); color: #ff4444; border: 1.5px solid rgba(255, 68, 68, 0.6); font-family: 'Orbitron', sans-serif; font-weight: bold; font-size: 14px; cursor: pointer; border-radius: 10px; transition: all 0.3s ease; box-shadow: 0 0 15px rgba(255, 68, 68, 0.2);">EXIT TO DESKTOP</button>
            // ` : '';

            resultsDiv.innerHTML = `
                ${highScoreAnim}
                <div style="font-size: 40px; color: #44ffff; font-weight: bold; text-shadow: 0 0 20px rgba(68, 255, 255, 0.5); margin-bottom: 20px;">
                    SCORE: ${finalScore.toFixed(1)}
                </div>
                
                <div style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 10px; border: 1px solid #333; display: inline-block; text-align: left; min-width: 250px;">
                    <div style="color: #aaa; border-bottom: 1px solid #555; padding-bottom: 5px; margin-bottom: 10px; text-align: center;">LIFETIME PEAKS</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Lineage:</span> <span style="color: white;">${this.stats.generations || 1} Gens</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Max Wealth:</span> <span style="color: #44ff44;">${Math.floor(this.lifetimeMaxStats.money)} K$</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Max Popularity:</span> <span style="color: #ff44ff;">${Math.floor(this.lifetimeMaxStats.popularity)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Max Beauty:</span> <span style="color: #44ffff;">${Math.floor(this.lifetimeMaxStats.beauty)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Max Talent:</span> <span style="color: #ffff44;">${Math.floor(this.lifetimeMaxStats.talent)}</span>
                    </div>
                </div>
            `;

            // const restartBtn = document.getElementById('restart-button');
            // if (restartBtn && exitBtnHTML && !document.getElementById('btn-gameover-exit')) {
            //     restartBtn.insertAdjacentHTML('afterend', exitBtnHTML);
            // }
            
            // // Wire up exit button on game over screen
            // const exitBtn = document.getElementById('btn-gameover-exit');
            // if (exitBtn) {
            //     exitBtn.onclick = () => this.exitToDesktop();
            // }

            // 1. Grab the original button
            const originalBtn = document.getElementById('btn-confirm-main-menu');
            const restartBtn = document.getElementById('restart-button');

            if (originalBtn && restartBtn) {
                // 2. Create a deep clone (true means copy all children/styles)
                const clonedBtn = originalBtn.cloneNode(true);
                
                // 3. Give the clone a unique ID to avoid duplicates
                clonedBtn.id = 'btn-gameover-menu';
                
                // 4. Cloned elements don't keep their original onclick events, 
                //    so we wire it up again here.
                clonedBtn.onclick = () => {
                    window.location.reload(); 
                };

                // 5. Place the clone in the Game Over UI
                restartBtn.after(clonedBtn);
                
                // Ensure it's visible and spaced correctly
                clonedBtn.style.display = 'inline-block';
                clonedBtn.style.marginTop = '10px';
            }
        }
    }

    reset() {
        this.stats = { ...CONFIG.PLAYER.INITIAL_STATS };
        this.lifetimeMaxStats = { money: 0, popularity: 0, beauty: 0, talent: 0 };
        
        // FULL STATE WIPE (Fixes the Ghost Ledger bug)
        this.popularitySources = {};
        this.promotionsCount = {};
        this.currentJobPromotions = 0;
        this.hiredJobs.clear();
        this.socialCircle = [];
        this.business = null;
        this.activeBuffs = [];
        this.ownedHomes = new Set();
        this.activeHomeId = null;
        this.collegeVisits = 0;
        this.isCollegeActive = false;
        this.collegeProgress = 0;
        this.gymBuffTimeRemaining = 0;

        if (this.player) {
            if (typeof this.player.clearTasks === 'function') this.player.clearTasks();
            if (typeof this.player.cancelMove === 'function') this.player.cancelMove();
        }

        this.isGameOver = false;
        if (this.elements.overlay) {
            this.elements.overlay.style.display = 'none';
        }
        this.updateUI();
    }

    /**
     * Initialize leaderboard tab functionality
     * Sets up event listeners for switching between Local, Global, and Friends leaderboards
     */
    initializeLeaderboardTabs() {
        const tabLocal = document.getElementById('tab-local');
        const tabGlobal = document.getElementById('tab-global');
        const tabFriends = document.getElementById('tab-friends');

        if (!tabLocal || !tabGlobal || !tabFriends) return;

        // Set default active tab (Local)
        this.setActiveLeaderboardTab('local');

        // Add click listeners
        tabLocal.addEventListener('click', () => {
            this.setActiveLeaderboardTab('local');
        });

        tabGlobal.addEventListener('click', () => {
            this.setActiveLeaderboardTab('global');
        });

        tabFriends.addEventListener('click', () => {
            this.setActiveLeaderboardTab('friends');
        });
    }

    /**
     * Set the active leaderboard tab and display corresponding content
     * @param {string} tab - 'local', 'global', or 'friends'
     */
    setActiveLeaderboardTab(tab) {
        // Hide all tabs
        const localContent = document.getElementById('leaderboard-list');
        const globalContent = document.getElementById('leaderboard-global');
        const friendsContent = document.getElementById('leaderboard-friends');
        const tabLocal = document.getElementById('tab-local');
        const tabGlobal = document.getElementById('tab-global');
        const tabFriends = document.getElementById('tab-friends');

        if (!localContent || !globalContent || !friendsContent) return;

        // Reset all tab styles
        [tabLocal, tabGlobal, tabFriends].forEach(t => {
            t.style.background = t.id === 'tab-local' ? 'rgba(170, 68, 255, 0.15)' : 
                                 t.id === 'tab-global' ? 'rgba(68, 255, 255, 0.15)' :
                                 'rgba(68, 255, 68, 0.15)';
            t.style.opacity = '0.6';
        });

        // Hide all content
        localContent.style.display = 'none';
        globalContent.style.display = 'none';
        friendsContent.style.display = 'none';

        // Show selected tab and update styling
        if (tab === 'local') {
            localContent.style.display = 'block';
            tabLocal.style.opacity = '1';
            tabLocal.style.background = 'rgba(170, 68, 255, 0.3)';
        } else if (tab === 'global') {
            globalContent.style.display = 'block';
            tabGlobal.style.opacity = '1';
            tabGlobal.style.background = 'rgba(68, 255, 255, 0.3)';
            this.fetchAndDisplaySteamLeaderboard('global');
        } else if (tab === 'friends') {
            friendsContent.style.display = 'block';
            tabFriends.style.opacity = '1';
            tabFriends.style.background = 'rgba(68, 255, 68, 0.3)';
            this.fetchAndDisplaySteamLeaderboard('friends');
        }
    }

    /**
     * Fetch Steam leaderboard data and display it
     * @param {string} type - 'global' or 'friends'
     */
    async fetchAndDisplaySteamLeaderboard(type) {
        if (!window.electronAPI || !window.electronAPI.getSteamLeaderboard) {
            console.log('ℹ Steam API not available');
            return;
        }

        const container = document.getElementById(
            type === 'global' ? 'leaderboard-global' : 'leaderboard-friends'
        );
        if (!container) return;

        // Show loading message
        container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Loading Steam leaderboard...</div>';

        try {
            const result = await window.electronAPI.getSteamLeaderboard('EpicenterCity_Score');

            if (result.error) {
                container.innerHTML = `<div style="color: #ff8888; text-align: center; padding: 20px;">⚠ ${result.error}</div>`;
                return;
            }

            const leaderboardData = type === 'global' ? result.global : result.friends;

            if (!leaderboardData || leaderboardData.length === 0) {
                container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No entries yet</div>';
                return;
            }

            // Clear container
            container.innerHTML = '';

            // Add each entry
            leaderboardData.forEach((entry, index) => {
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.flexDirection = 'column';
                div.style.padding = '10px';
                div.style.borderBottom = '1px solid #333';
                div.style.fontFamily = "'Orbitron', sans-serif";
                div.style.fontSize = '14px';

                const color = type === 'global' ? '#44ffff' : '#44ff44';
                const shadowColor = type === 'global' ? 'rgba(68, 255, 255, 0.4)' : 'rgba(68, 255, 68, 0.4)';

                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: ${color}; font-weight: bold; text-shadow: 0 0 10px ${shadowColor};">#${entry.rank || index + 1}</span>
                        <span style="color: #cccccc;">${entry.name || 'Unknown'}</span>
                        <span style="color: ${color}; font-weight: bold; text-shadow: 0 0 8px ${shadowColor};">SCORE: ${entry.score || 0}</span>
                    </div>
                `;
                container.appendChild(div);
            });

            console.log(`✓ Displayed ${leaderboardData.length} ${type} leaderboard entries`);
        } catch (error) {
            console.error(`Error fetching ${type} leaderboard:`, error);
            container.innerHTML = `<div style="color: #ff8888; text-align: center; padding: 20px;">❌ Error loading leaderboard</div>`;
        }
    }
}
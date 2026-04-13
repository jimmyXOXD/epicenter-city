import { CONFIG } from './Config.js';

export class Business {
    constructor(founders) {
        // founders is an array of characters (player + up to 3 friends)
        this.founders = founders;
        
        // Sum of founders' stats
        const rawStats = founders.reduce((acc, f) => {
            acc.beauty += (f.stats.beauty || 0);
            acc.popularity += (f.stats.popularity || 0);
            acc.talent += (f.stats.talent || 0);
            return acc;
        }, { beauty: 0, popularity: 0, talent: 0 });

        // Normalize to a 1-100 scale (Company Average), 
        // where 100 is for 4 founders with 100 in that stat (400 total).
        const count = founders.length || 1;
        this.stats = {
            beauty: rawStats.beauty /4,
            popularity: rawStats.popularity / 4,
            talent: rawStats.talent / 4
        };

        this.investmentBank = 0;
        this.percentOwned = 100 / founders.length;
        this.stage = 1;
        this.totalProductsSold = 0;
        this.lifespan = 20 * 60 * 1000; // 20 minutes in ms
        this.startTime = Date.now();
        this.accTime = 0; // For sales tick
        this.progress = 0;
        this.maxProgress = CONFIG.BUSINESS.MAX_PROGRESS || 100;
        this.salesSinceLastCheck = 0; // For visual events
        this.isSeekingInvestors = false;
        this.marketMultiplier = 1.0;
        this.marketTier = null;
        this.investorFundsReceived = 0;
        
        // Popularity Tracking
        this.popularityGained = 0;
        this.nextPopularityThreshold = 10;
    }

    generateMarketCap() {
        const tiers = CONFIG.BUSINESS.MARKET_CAP_TIERS;
        const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0);
        let rand = CONFIG.UTILS.random() * totalWeight;
        
        for (const tier of tiers) {
            if (rand < tier.weight) {
                this.marketTier = tier;
                this.marketMultiplier = tier.minMult + CONFIG.UTILS.random() * (tier.maxMult - tier.minMult);
                break;
            }
            rand -= tier.weight;
        }
        
        if (!this.marketTier) {
            this.marketTier = tiers[1]; // Standard
            this.marketMultiplier = 1.0;
        }
    }

    update(dt, statsManager) {
        if (this.isExpired()) return;
        
        // Bankruptcy Check
        if (this.investmentBank <= -10) {
            this.shutdown(statsManager, "Bankruptcy! The bank seized your assets.");
            return;
        }

        this.accTime += dt;
        const tickRate = CONFIG.BUSINESS.TICK_RATE || 1.0;

        while (this.accTime >= tickRate) {
            this.accTime -= tickRate;
            if (this.stage >= 2) {
                this.processSalesTick(statsManager);
            }
        }
    }

    incrementProgress(amount) {
        if (this.stage >= 7) return; // Max stage reached
        
        this.progress += amount;
        if (this.progress >= this.maxProgress) {
            this.upgradeStage();
        }
    }

    upgradeStage() {
        this.stage++;
        this.progress = 0;
        
        if (this.stage === 2) {
            this.generateMarketCap();
        }
        
    }

    processSalesTick(statsManager) {
        const cost = CONFIG.BUSINESS.OPERATING_COST || 2;
        
        // 1. Consume Capital
        this.investmentBank -= cost; // Allow negative temporarily until -10 check in update()

        // 2. Calculate Parameters
        // p (Innovation)
        const p = (CONFIG.BUSINESS.BASE_P || 0.05) + (this.stats.beauty * (CONFIG.BUSINESS.SCALE_P || 0.002));
        
        // q (Imitation)
        const q = (CONFIG.BUSINESS.BASE_Q || 0.25) + (this.stats.popularity * (CONFIG.BUSINESS.SCALE_Q || 0.0025));

        // m (Market Potential)
        let m = CONFIG.BUSINESS.MARKET_POTENTIAL[this.stage] || 30;
        if (this.stage > 4) {
            m += (this.stage - 4) * (CONFIG.BUSINESS.MARKET_POTENTIAL.POST_AUTO_INCREMENT || 0);
        }
        
        // Apply Market Multiplier
        m *= (this.marketMultiplier || 1.0);

        // 3. Crash Mechanic
        // Check for active disaster buffs that trigger a crash
        const isCrashed = statsManager.activeBuffs.some(buff => {
            // Find the disaster definition corresponding to this buff
            // We look for disasters where the buff ID contains the disaster ID
            // e.g. buff 'volcano_risk' matches disaster 'volcano'
            const disaster = CONFIG.PLAYER.DISASTERS.find(d => buff.id.includes(d.id));
            return disaster && disaster.triggersCrash;
        });

        if (isCrashed) {
            m *= 0.2; // Crash multiplier
        }

        // Run 30 simulated days for each real-life second (tick)
        for (let day = 0; day < 30; day++) {

            // 1. Calculate the fraction of the market left to capture
            let remainingMarketFraction = 1 - (this.totalProductsSold / m);

            // 2. Prevent the fraction from going negative if we somehow overshoot
            remainingMarketFraction = Math.max(0, remainingMarketFraction);

            // 3. The True Bass Equation: (Base Chance) * (Remaining Market)
            let chance = (p + (q / m) * this.totalProductsSold) * remainingMarketFraction;
            
            // 4. Clamp (Still good practice, though mathematically it shouldn't exceed 1 now)
            chance = Math.max(0, Math.min(1, chance));

            // 5. Roll for Sale
            if (CONFIG.UTILS.random() < chance) {
                this.totalProductsSold++;
                this.salesSinceLastCheck++;
                
                // Realistic Milestone Popularity System
                if (this.totalProductsSold >= this.nextPopularityThreshold && this.popularityGained < 50) {
                    this.popularityGained++;
                    statsManager.addPopularity('BusinessSales', 1);
                    
                    // Visual feedback
                    if (statsManager.player && statsManager.spawnFloatingText) {
                        statsManager.spawnFloatingText("+1 FAME", statsManager.player.position, "#ff44ff");
                    }
                    
                    // RE-SCALING LOGIC:
                    if (this.popularityGained < 10) {
                        // First 10 points: reach 100 sales (100 / 10 = 10 per point)
                        this.nextPopularityThreshold += 10;
                    } else if (this.popularityGained < 50) {
                        // Next 40 points: reach 1000 sales from 100 ((1000 - 100) / 40 = 22.5 per point)
                        this.nextPopularityThreshold += 22.5;
                    } else {
                        // Maxed out at 50 points
                        this.nextPopularityThreshold = Infinity;
                    }
                }
                
                // Get price based on stage and market tier
                const tierName = this.marketTier ? this.marketTier.name.toUpperCase() : 'STANDARD';
                const priceArray = CONFIG.BUSINESS[`PRICES_${tierName}`] || [0, 1]; // Fallback to avoid crashes
                const revenue = priceArray[this.stage] || 1;
                
                // Player receives their equity share of the revenue
                const playerShare = revenue * (this.percentOwned / 100);
                
                statsManager.addStat('money', playerShare);
                
                // Log for debugging/feedback?
                // console.log(`Sold! Revenue: ${revenue}, Share: ${playerShare.toFixed(2)}, Chance: ${chance.toFixed(2)}`);
            }
        }
        
        // 6. Investor Check (New)
        // Only if seeking investors and not already crashed or bankrupt
        if (this.isSeekingInvestors && this.investmentBank > -10 && this.stage >= 2) {
            // Base chance 0.1% per tick? Or adjusted by progress?
            // Let's say chance is proportional to stage and growth (salesSinceLastCheck)
            // But simplify: 0.5% chance per tick if seeking
            const investorChance = 0.005 * (this.stage); // Increases with stage
            
            if (CONFIG.UTILS.random() < investorChance) {
                this.isSeekingInvestors = false; // Disable after finding one
                statsManager.triggerInvestorEvent();
            }
        }
    }

    shutdown(statsManager, reason) {
        statsManager.showBusinessClosure(reason, this);
    }

    isExpired() {
        return (Date.now() - this.startTime) > this.lifespan;
    }


    getTimeRemaining() {
        const elapsed = Date.now() - this.startTime;
        return Math.max(0, this.lifespan - elapsed);
    }

    getStageName() {
        const names = {
            1: "Preparation",
            2: "Prototype",
            3: "Optimization",
            4: "Automation",
            5: "Scaling",
            6: "Expansion",
            7: "Monopoly"
        };
        return names[this.stage] || "Automation";
    }

    addCapital(amount) {
        this.investmentBank += amount;
    }

    diluteOwnership(equityTakenPercent) {
        // equityTakenPercent is like 10 (for 10%)
        // Remaining equity factor is (100 - 10) / 100 = 0.9
        const factor = (100 - equityTakenPercent) / 100;
        this.percentOwned *= factor;
    }
}
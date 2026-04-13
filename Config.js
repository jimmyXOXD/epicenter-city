export const CONFIG = {
    SAVE_VERSION: 1,
    UTILS: {
        // High-entropy random float between 0 and 1
        random: () => {
            const cryptoArray = new Uint32Array(1);
            window.crypto.getRandomValues(cryptoArray);
            const cryptoRandom = cryptoArray[0] / (0xffffffff + 1);
            // Mix with high-res timer to break any potential hardware patterns
            return (cryptoRandom + (performance.now() % 1)) % 1;
        },
        // Independent Gaussian Pairs
        // Returns a pair of values using Math.sin and Math.cos from a single entropy seed
        // Consumes only one at a time if needed, but returns both
        boxMullerPair: () => {
            const u1 = CONFIG.UTILS.random(); // We need non-zero for log
            const u2 = CONFIG.UTILS.random();
            // Safety for log(0)
            const safeU1 = u1 === 0 ? Number.EPSILON : u1;
            
            const r = Math.sqrt(-2.0 * Math.log(safeU1));
            const theta = 2.0 * Math.PI * u2;
            
            return [r * Math.cos(theta), r * Math.sin(theta)];
        }
    },
    MAP: {
        WIDTH: 1000, // -500 to 500
        HEIGHT: 1000, // -500 to 500
        EPICENTERS: 20,
        R_MAX: 40, // Maximum radius for Poisson sampling (low density)
        AMPLITUDE: { MIN: 0.5, MAX: 1.5 },
        SPREAD: { MIN: 20, MAX: 150 }
    },
    
    JOBS: {
        'Cashier': {
            description: 'Scanning items and handling change at the local mart. Honest work.',
            pay: 1,
            risk: 0.05,
            reqPopularity: 0,
            maxPromotions: 3
        },
        'Drug Dealer': {
            description: 'Moving product in the dark corners of the city. High risk.',
            pay: 1,
            risk: 0.25,
            reqPopularity: 0,
            maxPromotions: 3
        }
    },
    PLAYER: {
        SPEED: 30,
        WAIT_TIME: 500, // ms
        COLOR: 0xffffff,
        INITIAL_STATS: {
            health: 100,
            money: 0,
            bonds: 0,
            stocks: 0,
            stocksCost: 0,
            marketIndex: 100,
            stockHistory: [],
            popularity: 0,
            beauty: 0,
            talent: 10,
            maxBeauty: 20,
            generations: 1
        },
        HEALTH_DECAY_BASE: 0.5, // 0.5 points per second
        HEALTH_DECAY_REDUCED: 0.3, // 0.3 points per second after gym
        GYM_BUFF_DURATION: 1000 * 111, // 111 seconds of reduced decay. 
        // average walk is ~5 seconds, so takes 0.4*5 = 2 health. 
        // comparing to real life data, about 14 secs ((100/0.3)/24) should devote to gym assuming hour a day,
        //  so 14/5 ~ 3 walks. so duration should be 100/0.3/3 ~ 111 secs.
        BEAUTY_LIMIT: 60,
        GYM_BEAUTY_GAIN: 5,
        WORK_MONEY_GAIN: 1,
        INFLATION_RATE: 0.0025, // 0.25% per month
        ECONOMY: {
            TUITION_COST: 420,      // 420K$ for a 7-10 year degree, including living support for fist few years
            START_BUSINESS_COST: 50, // $50,000
            MARRY_COST: 70,        // $70,000
            HAVE_KID_COST: 250,      // $250,000
            GAME_YEAR_SECONDS: 12.0,
            STOCK_DRIFT: 0.09,          // 9% base (compensates for jumps + vol; nets ~7.4% geometric long-term)
            STOCK_VOLATILITY: 0.18,     // Matches historical S&P 500 long-term vol (~16–19%)
            STOCK_JUMP_LAMBDA: 0.10,    //  crash event ~once every 10 years on average
            STOCK_JUMP_MIN: 0.75,
            STOCK_JUMP_MAX: 0.92,       // 8–25% drops (realistic: 1987-style ~20%, 2020 quick drops, etc.)
            CHART_HISTORY_SIZE: 50,
            CHART_UPDATE_INTERVAL: 0.5 // seconds
        },
        GLOBAL_RISK: 0.01, // Multiplier for job danger/accidents (1% baseline)
        // All Disaster risks where multiplied by *(100/0.4)/30, to normalize them to give actuall risk as stated over the time period of 30 s.
        DISASTERS: [
            {
                id: 'volcano',
                title: 'VOLCANIC ERUPTION',
                description: 'Mount Doom is rumbling. Ash fills the sky.',
                probability: 0.0005, // ~30 min
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'EVACUATE', cost: 50, effectDescription: 'Safety first', action: () => {} },
                    { label: 'SELL SOUVENIRS', cost: 0, effectDescription: 'Risk +50%, Gain 200 K$', action: (sm) => { sm.addStat('money', 200); sm.addBuff('volcano_risk', { risk: 0.5*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'tsunami',
                title: 'TSUNAMI WARNING',
                description: 'A massive wave is approaching the coast.',
                probability: 0.0005, // ~30 min
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'RUN TO HILLS', cost: 0, effectDescription: 'Lose Job', action: (sm) => { sm.loseAllJobs(true); } },
                    { label: 'FILM IT', cost: 0, effectDescription: 'Risk +50%, Gain 250 K$', action: (sm) => { sm.addStat('money', 250); sm.addBuff('tsunami_risk', { risk: 0.5*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'war_north',
                title: 'WAR IN THE NORTH',
                description: 'Conflict erupts on the northern border.',
                probability: 0.0015, // ~12 min
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'FIGHT', cost: 0, effectDescription: 'Risk +50%, Gain 350 K$ ,+3 Pop.', action: (sm) => { sm.addStat('money', 350); sm.addPopularity('WarHero', 3); sm.addBuff('war_north_risk', { risk: 0.5*(100/0.4)/30, duration: 30 }); } },
                    { label: 'SHELTER', cost: 0, effectDescription: 'Risk +5%', action: (sm) => { sm.addBuff('war_north_shelter', { risk: 0.05*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'war_east',
                title: 'WAR IN THE EAST',
                description: 'Eastern factions are mobilizing.',
                probability: 0.001, // ~15 min
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'ROB CASTLE', cost: 0, effectDescription: 'Risk +60%, Gain 500 K$', action: (sm) => { sm.addStat('money', 500); sm.addBuff('war_east_risk', { risk: 0.6*(100/0.4)/30, duration: 30 }); } },
                    { label: 'SHELTER', cost: 0, effectDescription: 'Risk +5%', action: (sm) => { sm.addBuff('war_east_shelter', { risk: 0.05*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'pandemic',
                title: 'GLOBAL PANDEMIC',
                description: 'A contagious virus is sweeping the globe.',
                probability: 0.001, // ~15 min
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'BUY MEDS', cost: 20, effectDescription: 'Stay safe', action: () => {} },
                    { label: 'IGNORE', cost: 0, effectDescription: 'Risk +70%', action: (sm) => { sm.addBuff('pandemic_risk', { risk: 0.7*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'nuclear',
                title: 'NUCLEAR WAR',
                description: 'The sirens are blaring. This is not a drill.',
                probability: 0.0001, // ~2.5 hours
                triggersCrash: true,
                duration: 30,
                options: [
                    { label: 'BUNKER', cost: 100, effectDescription: ' Survive', action: () => {} },
                    { label: 'IGNORE', cost: 0, effectDescription: 'Risk +80%', action: (sm) => { sm.addBuff('nuke_risk', { risk: 0.8*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'energy',
                title: 'ENERGY CRISIS',
                description: 'Power grids are failing citywide.',
                probability: 0.001, // ~12 min
                triggersCrash: false,
                duration: 30,
                options: [
                    { label: 'BUY GENERATOR', cost: 40, effectDescription: 'Power up', action: () => {} },
                    { label: 'WORK AT OIL RIG', cost: 0, effectDescription: 'Gain 100K$, Risk +30%', action: (sm) => { sm.addStat('money', 100); sm.addBuff('energy_risk', { risk: 0.3*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'food',
                title: 'FOOD SHORTAGE',
                description: 'Shelves are empty. Panic buying ensues.',
                probability: 0.001, // ~12 min
                triggersCrash: false,
                duration: 30,
                options: [
                    { label: 'HOARD', cost: 20, effectDescription: 'Stockpile', action: () => {} },
                    { label: 'FISH', cost: 0, effectDescription: 'Gain 100K$, Risk +30%', action: (sm) => { sm.addStat('money', 100); sm.addBuff('food_risk', { risk: 0.3*(100/0.4)/30, duration: 30 }); } }
                ]
            },
            {
                id: 'fired',
                title: 'YOU ARE FIRED',
                description: 'Your boss called. Don\'t come in tomorrow.',
                probability: 0.0007, // ~20 min
                triggersCrash: false,
                duration: 0,
                options: [
                    { label: 'ACCEPT FATE', cost: 0, effectDescription: 'Lose Job & Rank', action: (sm) => { sm.loseAllJobs(true); } }
                ]
            },
            {
                id: 'lawsuit',
                title: 'LAWSUIT',
                description: 'You are being sued for negligence.',
                probability: 0.0007, // ~20 min
                triggersCrash: false,
                duration: 0,
                options: [
                    { label: 'SETTLE', cost: 40, effectDescription: 'Lose 40 K$', action: () => {} },
                    { 
                        label: 'CONTEST', 
                        cost: 0, 
                        effectDescription: '50% chance to LOSE ALL ASSETS', 
                        action: (sm) => { 
                            if (CONFIG.UTILS.random() > 0.5) { 
                                // Reset all financial stats in StatsManager [cite: 416, 722, 723]
                                sm.stats.money = 0;
                                sm.stats.bonds = 0;
                                sm.stats.stocks = 0;
                                sm.stats.stocksCost = 0; // Reset cost basis for profit/loss [cite: 725]
                                
                                // Refresh the UI to reflect the total loss [cite: 953]
                                sm.updateUI(); 
                            } 
                        }
                    }
                ]
            },
            {
                id: 'sick',
                title: 'SICKNESS',
                description: 'You feel terrible. Fever rising.',
                probability: 0.003, // ~5 min
                triggersCrash: false,
                duration: 30,
                options: [
                    { label: 'STAY HOME', cost: 10, effectDescription: 'Feel better', action: () => {} },
                    { label: 'IGNORE', cost: 0, effectDescription: 'Risk +70%', action: (sm) => { sm.addBuff('sick_risk', { risk: 0.7*(100/0.4)/30, duration: 30 }); } }
                ]
            }
        ]
    },
    ASSETS: {
        BACKGROUND: 'assets/background4.png',
        FLOOR: 'assets/pavement-texture.jpg.webp',
        GYM: 'assets/kinetic-gym.webp',
        COLLEGE: 'assets/neo-university-vibrant.webp',
        PLAYER: {
            NE: 'assets/isometric-player.webp',
            NW: 'assets/player_left.png',
            SE: 'assets/isometric-player.webp',
            SW: 'assets/player_left.png',
        },
        FLOOR_LOW: 'assets/dark-grey-old-dirty-pavement.webp',
        FLOOR_MID: 'assets/floor-wealth-mid.webp',
        FLOOR_HIGH: 'assets/floor-wealth-high.webp',
        
        // HOUSES
        HOUSE_LVL_1: 'assets/house-lvl-1-shack.webp',
        HOUSE_LVL_2: 'assets/house-cheap-motel.webp',
        HOUSE_LVL_3: 'assets/house-trailer-park.webp',
        HOUSE_LVL_4: 'assets/house-studio-apartment.png',
        HOUSE_LVL_5: 'assets/house-suburban-house.webp',
        HOUSE_LVL_6: 'assets/house-downtown-loft.webp',
        HOUSE_LVL_7: 'assets/house-luxury-condo.webp',
        HOUSE_LVL_8: 'assets/house-mansion.webp',
        HOUSE_LVL_9: 'assets/house-private-estate.webp',
        HOUSE_LVL_10: 'assets/house-mega-penthouse.webp',

        // SOCIAL PLACES
        SOCIAL_LVL_1: 'assets/social-back-alley.webp',
        SOCIAL_LVL_2: 'assets/isometric-diner.png',
        SOCIAL_LVL_3: 'assets/social-dive-bar.webp',
        SOCIAL_LVL_4: 'assets/social-public-park.webp',
        SOCIAL_LVL_5: 'assets/social-arts-club.webp',
        SOCIAL_LVL_6: 'assets/social-coffee-shop.webp',
        SOCIAL_LVL_7: 'assets/social-upscale-nightclub.webp',
        SOCIAL_LVL_8: 'assets/social-fancy-steakhouse.webp',
        SOCIAL_LVL_9: 'assets/social-vip-lounge.webp',
        SOCIAL_LVL_10: 'assets/social-billionaires-club.webp',

        // JOB TEMPLATES
        JOB_LVL_1: 'assets/job-lvl-1-stand.webp',
        JOB_LVL_2: 'assets/job-lvl-2-workshop.webp',
        JOB_LVL_3: 'assets/job-lvl-3-workshop.webp',
        JOB_LVL_4: 'assets/job-lvl-4-office.webp',
        JOB_LVL_5: 'assets/job-lvl-5-corporate.webp',
        JOB_LVL_6: 'assets/job-lvl-6-pavilion.webp',
        JOB_LVL_7: 'assets/job-lvl-7-data-tower.webp',
        JOB_LVL_8: 'assets/job-lvl-8-sky-block.webp',
        JOB_LVL_9: 'assets/job-lvl-9-spire.webp',
        JOB_LVL_10: 'assets/job-lvl-10-apex.webp',
        
        FLAG: 'assets/neon-flag-marker.webp'
    },
    BUSINESS: {
        // using our matlab simulation, we want to find the range for which its reasonable to get
        // ~10 points of popularity (100 sales), and possible for a unicorn business and 
        // very popular and beautiful founders to get 50 popularity (1000 sales).
        // a reasonable timeframe would be 10-20 years, which are about half to full life cycle.


        // p (Innovation): Real data suggests 0.01 to 0.03 for successful tech.
        // We set range: [0.01 (Talent 1) to 0.03 (Talent 100)]
        BASE_P: 0.01,    
        SCALE_P: 0.00025,   //Talent 1 → p=0.01   |   Talent 100 → p=0.035  (perfect range)

        // q (Imitation) - now starts at 0.25 instead of 0.1
        BASE_Q: 0.25,        //  (0.25 to 0.5) 
        SCALE_Q: 0.0025,    // Popularity 1 → q=0.25   |   Popularity 100 → q=0.50  (perfect range)
        

        OPERATING_COST: 5,   // about 5 K$ per month at all stages (simplified).
        TICK_RATE: 1.0,    // seconds.  
        MAX_PROGRESS: 100,
        INVESTOR_GRANT: 500, // how much investors give to investment bank.
        INVESTOR_EQUITY: 10, // how much equity investors take (in percentage points)

        PHASE_DURATIONS: {

            1: { min: 2,  max: 6 },   // Prep

            2: { min: 3,  max: 8 },   // Prototype

            3: { min: 8,  max: 18 },  // Optimize

            4: { min: 15, max: 36 }   // Auto (and potentially levels beyond)

        },

        // only growth and Unicorn should have enough market to reach 1000 sales.
        MARKET_POTENTIAL: {
            1: 0,   // PREP: No sales.
            2: 50,   // PROTOTYPE: Can reach ~50 sales, or more depending on business tier.
            3: 70,  // OPTIMIZE: can reach 70 sales or more, depending on tier.
            4: 100,  // AUTO: The "Unicorn" tier. This ceiling allows for 1000+ sales comfortably.
            
            POST_AUTO_INCREMENT: 0 // maximum m 1500.
        },

        
        // a niche business (~0.5x) should give ~10K$ net profit in the 
        // prototype stage (~13s),another ~50K$ in the optimization (another ~3s),
        // and lose ~20K$ in automation (another ~30s).

        PRICES_NICHE: {
            1: 0,     // PREP: R&D phase, no revenue
            2: (10 + 13*5)/(50*0.5) ,    // PROTOTYPE: ~3K$ per product.
            3: (50 + 3*5)/((70 - 50)*0.5) ,    // OPTIMIZATION:  ~7K$ per product. 
            4: (-20 + 30*5)/((100 - 70)*0.5) ,    // AUTOMATION: ~9K$ per product. 
            5: 10,    // GROWTH: Mild premium recovery
            6: 11,    // SCALE: Stronger positioning
            7: 12    // EMPIRE: Monopoly / luxury pricing
        },

        // a standard business (~1x) should give ~100K$ net profit in the
        // prototype stage (within ~40s according to matlab with mid stats),
        // and ~250K$ in optimization (another ~10s),
        //and lose ~10K$ in automation (another ~26s).

        PRICES_STANDARD: {
            1: 0,     // PREP: R&D phase, no revenue
            2: (100 + 40*5)/(50*1) ,    // PROTOTYPE: ~6K$ per product.
            3: (250 + 10*5)/((70 - 50)*1) ,    // OPTIMIZATION:  ~15K$ per product. 
            4: (-10 + 26*5)/((100 - 70)*1) ,    // AUTOMATION: ~4K$ per product. 
            5: 16,    // GROWTH: Mild premium recovery
            6: 17,    // SCALE: Stronger positioning
            7: 18    // EMPIRE: Monopoly / luxury pricing
        },

        // a growth business (~3x) should give ~200K$ net profit in the 
        // prototype stage (~110s),another ~500K$ in the optimization (another ~40s),
        // and another ~1000K$ in automation (another ~40s).

        PRICES_GROWTH: {
            1: 0,     // PREP: R&D phase, no revenue
            2: (200 + 110*5)/(50*3) ,    // PROTOTYPE: ~5K$ per product.
            3: (500 + 40*5)/((70 - 50)*3) ,    // OPTIMIZATION:  ~12K$ per product. 
            4: (1000 + 40*5)/((100 - 70)*3) ,    // AUTOMATION: ~13K$ per product. 
            5: 18,    // GROWTH: Mild premium recovery
            6: 19,    // SCALE: Stronger positioning
            7: 20    // EMPIRE: Monopoly / luxury pricing
        },

        // a unicorn business (~10x) should give ~300K$ net profit in the 
        // prototype stage (~420s),another ~1000K$ in the optimization (another ~130s),
        // and another ~30000K$ in automation (another ~365s).

        PRICES_UNICORN: {
            1: 0,     // PREP: R&D phase, no revenue
            2: (300 + 420*5)/(50*10) ,    // PROTOTYPE: ~5K$ per product.
            3: (1000 + 130*5)/((70 - 50)*10) ,    // OPTIMIZATION:  ~8K$ per product. 
            4: (30000 + 365*5)/((100 - 70)*10) ,    // AUTOMATION: ~106K$ per product. 
            5: 150,    // GROWTH: Mild premium recovery
            6: 200,    // SCALE: Stronger positioning
            7: 250    // EMPIRE: Monopoly / luxury pricing
        },

        MARKET_CAP_TIERS: [
            { name: 'Niche', weight: 40, minMult: 0.4, maxMult: 0.8 },
            { name: 'Standard', weight: 40, minMult: 0.9, maxMult: 1.2 },
            { name: 'Growth', weight: 15, minMult: 1.5, maxMult: 3.0 },
            { name: 'Unicorn', weight: 5, minMult: 5.0, maxMult: 15.0 }
        ]
    }
};
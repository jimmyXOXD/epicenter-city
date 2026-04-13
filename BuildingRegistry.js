import { CONFIG } from './Config.js';

// Resolve local file paths for both web and Electron environments
function resolveAssetPath(relativePath) {
    // Force a consistent relative path format that works in both 
    // the local dev server and the packaged Electron ASAR.
    return relativePath.startsWith('./') ? relativePath : `./${relativePath}`;
}

export class BuildingRegistry {
    constructor() {
        this.jobs = [];
        this.houses = [];
        this.socialPlaces = [];
        this.fieldColors = {}; // { FieldName: { r, g, b } }
        this.ready = false;
    }

    async init() {
        try {
            await Promise.all([
                this.loadJobs(),
                this.loadHouses(),
                this.loadSocialPlaces()
            ]);
            this.ready = true;
            console.log('BuildingRegistry initialized.');
        } catch (e) {
            console.error('Failed to initialize BuildingRegistry:', e);
        }
    }

    async loadJobs() {
        const response = await fetch(resolveAssetPath('./all_jobs.json'));
        if (!response.ok) throw new Error(`Failed to load all_jobs.json: ${response.status}`);
        const data = await response.json();
        
        // Skip header row if it exists (check if Column1 is "Field")
        const startIdx = (data.length > 0 && data[0].Column1 === "Field") ? 1 : 0;

        for (let i = startIdx; i < data.length; i++) {
            const row = data[i];
            const level = parseInt(row.Column5);
            const field = row.Column1;
            
            // Store Field Color if not exists (normalize to 0-1)
            if (!this.fieldColors[field]) {
                this.fieldColors[field] = {
                    r: parseFloat(row.Column2) / 255,
                    g: parseFloat(row.Column3) / 255,
                    b: parseFloat(row.Column4) / 255
                };
            }

            this.jobs.push({
                id: `job_${i}`,
                field: field,
                name: row.Column6,
                description: row.Column7,
                level: level,
                pay: Math.round(parseFloat(row.Column8*5/(1000*12))), // original in $ per year. normalize to K$ per month and total travel time ~5s.
                promoBonuses: [
                    Math.round(parseFloat((row.Column11 || 0) * 5 / (1000 * 12))),
                    Math.round(parseFloat((row.Column12 || 0) * 5 / (1000 * 12))),
                    Math.round(parseFloat((row.Column13 || 0) * 5 / (1000 * 12)))
                ],
                risk: parseFloat(row.Column9) / 100, // convert to decimal
                maxPromotions: parseInt(row.Column10),
                reqPopularity: parseInt(row.Column14),
                gainedPopularity: parseInt(row.Column15) || 0, // Store Column15
                // Dynamic Asset Mapping
                assetUrl: CONFIG.ASSETS[`JOB_LVL_${level}`]
            });
        }
        console.log(`Loaded ${this.jobs.length} jobs.`);
    }

    async loadHouses() {
        const response = await fetch(resolveAssetPath('./houses.json'));
        if (!response.ok) throw new Error(`Failed to load houses.json: ${response.status}`);
        const data = await response.json();

        this.houses = data.map((row, index) => {
            const level = parseInt(row.level);
            return {
                id: `house_${index}`,
                name: row.houses,
                description: row.description,
                level: level,
                cost: parseInt(row['cost (k)']) * 1000, // Assuming k means thousand
                popularityGain: parseInt(row['popularity gained']),
                assetUrl: CONFIG.ASSETS[`HOUSE_LVL_${level}`]
            };
        });
        console.log(`Loaded ${this.houses.length} houses.`);
    }

    async loadSocialPlaces() {
        const response = await fetch(resolveAssetPath('./social_places.json'));
        if (!response.ok) throw new Error(`Failed to load social_places.json: ${response.status}`);
        const data = await response.json();

        this.socialPlaces = data.map((row, index) => {
            const level = parseInt(row.level);
            return {
                id: `social_${index}`,
                name: row['meeting areas'],
                description: row.description,
                level: level,
                screening: parseInt(row.screening),
                assetUrl: CONFIG.ASSETS[`SOCIAL_LVL_${level}`]
            };
        });
        console.log(`Loaded ${this.socialPlaces.length} social places.`);
    }

    getJobByLevel(level) {
        return this.jobs.filter(j => j.level === level);
    }

    getFieldColor(field) {
        return this.fieldColors[field] || { r: 1, g: 1, b: 1 };
    }
}

export const registry = new BuildingRegistry();
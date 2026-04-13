const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');


// Force the game to ignore Windows DPI scaling (125%, 150%, etc.)
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Steamworks setup - initialized after app.whenReady()
let SteamworksModule = null;
let steamworks = null;
let steamUser = null;
let steamFriends = null;
let steamLeaderboards = null;
let issteamInitialized = false;
let cachedPlayerName = "Unknown";
let localSteamID = null;

// Load steamworks-ffi-node module only
try {
    SteamworksModule = require('steamworks-ffi-node');
    console.log('[Steamworks] steamworks-ffi-node loaded successfully');
} catch (error) {
    console.error('❌ Failed to load steamworks-ffi-node module.');
    console.error('Error details:', error.message);
}

const { LeaderboardUploadScoreMethod } = require('steamworks-ffi-node');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        minWidth: 1280,
        minHeight: 720,
        fullscreen: true,
        autoHideMenuBar: true,
        title: 'EPICENTER CITY',
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#000000',
        show: false, // Don't show until ready
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false // Disable CORS for local file access
        }
    });

    mainWindow.loadFile('index.html');

    // Show window when ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Open DevTools for debugging (can press F12 to close)
        // Comment this out for production builds
        // mainWindow.webContents.openDevTools();
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Register F11 for fullscreen toggle
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
        if (input.alt && input.key === 'Enter') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
    });
}

// IPC handlers for renderer communication
ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
});

ipcMain.on('quit-game', () => {
    app.quit();
});

// ========== STEAMWORKS IPC HANDLERS ==========

// Fetch Leaderboard IPC Handler - FINAL name fix with debug logging
ipcMain.handle('get-steam-leaderboard', async (event) => {
    if (!issteamInitialized || !steamLeaderboards) return { global: [], friends: [] };

    try {
        const leaderboard = await steamLeaderboards.findLeaderboard('EpicenterCity_Score');
        if (!leaderboard) throw new Error('Leaderboard not found');

        console.log(`[Steamworks] Fetching Global and Friends entries...`);

        const rawGlobal = await steamLeaderboards.downloadLeaderboardEntries(leaderboard.handle, 1, -5, 5);
        const rawFriends = await steamLeaderboards.downloadLeaderboardEntries(leaderboard.handle, 2, 0, 0);

        const parseEntries = (entries, listType) => {
            if (!entries || !Array.isArray(entries)) return [];

            return entries.map(entry => {
                const rawID = entry.steamId;
                const idString = rawID ? rawID.toString() : "UnknownID";
                let playerName = "Unknown";

                // Try name lookup
                try {
                    if (steamFriends && rawID) {
                        playerName = steamFriends.getFriendPersonaName(BigInt(idString));
                        console.log(`[Steamworks] DEBUG ${listType} - getFriendPersonaName(${idString}) returned: "${playerName}"`);
                    }
                } catch (e) {
                    console.log(`[Steamworks] Name lookup (BigInt) failed for ${idString}`);
                }

                // Fallback 1: try as string
                if (!playerName || playerName === "Unknown" || playerName === "") {
                    try {
                        playerName = steamFriends.getFriendPersonaName(idString);
                        console.log(`[Steamworks] DEBUG ${listType} - getFriendPersonaName(string) returned: "${playerName}"`);
                    } catch (e2) {}
                }

                // Fallback 2: if still bad (or looks like a SteamID) → use cached local name
                if (!playerName || 
                    playerName === "Unknown" || 
                    playerName === "" || 
                    /^\d{17,18}$/.test(playerName)) {   // catches SteamID strings like 7656119...
                    playerName = cachedPlayerName;
                    console.log(`[Steamworks] ✓ Used cached local name: ${playerName} (rank ${entry.globalRank || 0})`);
                }

                return {
                    rank: entry.globalRank || 0,
                    score: entry.score || 0,
                    steamID: idString,
                    name: playerName
                };
            });
        };

        const globalData = parseEntries(rawGlobal, "Global");
        const friendsData = parseEntries(rawFriends, "Friends");

        console.log(`[Steamworks] ✓ Fetched ${globalData.length} Global and ${friendsData.length} Friends entries`);

        return { global: globalData, friends: friendsData };

    } catch (error) {
        console.error('[Steamworks] Error fetching leaderboards:', error.message);
        return { global: [], friends: [] };
    }
});

// Upload Score IPC Handler - CORRECT modern version for your package
ipcMain.handle('upload-steam-score', async (event, newScore) => {
    if (!issteamInitialized || !steamLeaderboards) return false;

    try {
        const leaderboard = await steamLeaderboards.findLeaderboard('EpicenterCity_Score');
        if (!leaderboard) throw new Error('Leaderboard not found');

        const numericScore = parseInt(newScore, 10);
        if (isNaN(numericScore)) throw new Error(`Invalid score: ${newScore}`);

        console.log(`[Steamworks] Uploading score: ${numericScore} (KEEP BEST)`);

        // THE FIX: Switch back to KeepBest so Steam protects the high scores!
        const result = await steamLeaderboards.uploadScore(
            leaderboard.handle,
            numericScore,
            LeaderboardUploadScoreMethod.KeepBest
        );

        // Accept a boolean 'true' OR an object containing 'success: true'
        if (result === true || (result && result.success)) {
            console.log(`[Steamworks] ✓ SUCCESS! Score uploaded.`);
            return true;
        } else {
            console.error('[Steamworks] Upload failed:', result);
            return false;
        }
    } catch (error) {
        console.error('[Steamworks] Error uploading score:', error.message);
        return false;
    }
});

// Handler to get current Steam user info
ipcMain.handle('get-steam-user-info', async (event) => {
    if (!issteamInitialized || !steamUser || !steamFriends) {
        return { name: 'Offline User', steamID: null };
    }

    try {
        const username = steamFriends.getPersonaName();
        
        let rawID = "Unknown";
        if (typeof steamUser.getSteamID === 'function') rawID = steamUser.getSteamID();
        else if (typeof steamUser.getSteamId === 'function') rawID = steamUser.getSteamId();
        
        return { name: username, steamID: rawID.toString() };
    } catch (error) {
        console.error('Error getting Steam user info:', error);
        return { name: 'Unknown User', steamID: null, error: error.message };
    }
});

// ========== END STEAMWORKS IPC HANDLERS ==========

// App lifecycle
app.whenReady().then(() => {
    // Initialize Steamworks
    if (SteamworksModule) {
        try {
            console.log('[Steamworks] Initializing SDK...');
            
            
            // Determine the correct file name based on OS
            let apiFileName = 'steam_api64.dll';
            if (process.platform === 'linux') apiFileName = 'libsteam_api.so';
            if (process.platform === 'darwin') apiFileName = 'libsteam_api.dylib';
       
            let steamApiPath = null;

            if (app.isPackaged) {
                const exeDir = path.dirname(app.getPath('exe'));
                // Create a search party to find the DLL wherever electron-builder put it!
                const searchPaths = [
                    path.join(exeDir, apiFileName), // Root
                    path.join(exeDir, 'steamworks_sdk', 'redistributable_bin', 'win64', apiFileName), // Windows SDK path
                    path.join(exeDir, 'steamworks_sdk', 'redistributable_bin', 'osx', apiFileName),   // Mac SDK path
                    path.join(exeDir, 'steamworks_sdk', 'redistributable_bin', 'linux64', apiFileName) // Linux SDK path
                ];
                
                for (const searchPath of searchPaths) {
                    if (fs.existsSync(searchPath)) {
                        steamApiPath = searchPath;
                        break;
                    }
                }
            } else {
                // Development
                steamApiPath = path.join(__dirname, apiFileName);
            }
            
            if (!steamApiPath || !fs.existsSync(steamApiPath)) {
                throw new Error(`CRITICAL: ${apiFileName} not found in the build folder!`);
            }
            console.log(`[Steamworks] ✓ DLL file found at: ${steamApiPath}`);
            
            // Instantiate SDK with AppID
            steamworks = new SteamworksModule.SteamworksSDK();
            // steamworks = new SteamworksModule.SteamworksSDK({
            //     appId: 4588740,
            //     steamApiDll: steamApiPath
            // });
            console.log('[Steamworks] SteamworksSDK instance created');

            // Initialize SDK by passing the config object HERE
            const initResult = steamworks.init({
                appId: 4588740,
                steamApiDll: steamApiPath
            });
            console.log(`[Steamworks] init() returned: ${initResult}`);
            
            // // Initialize SDK - this must happen before any other calls
            // const initResult = steamworks.init();
            // console.log(`[Steamworks] init() returned: ${initResult}`);
            
           // Only map the managers if init() returns true
            if (initResult === true) {
                steamUser = steamworks.user;
                steamFriends = steamworks.friends;
                steamLeaderboards = steamworks.leaderboards || steamworks.leaderboard;
                
                console.log('[Steamworks] Managers linked after init() succeeded');

                // ========== ADD THIS AFTER STEAM INIT SUCCEEDS ==========

                console.log('[Steamworks] Managers linked after init() succeeded');

                // === CRITICAL: Start the callback pump (required for leaderboards) ===
                console.log('[Steamworks] Starting callback pump...');
                const CALLBACK_INTERVAL_MS = 16; // ~60 Hz, same as most games
                const callbackInterval = setInterval(() => {
                    if (steamworks && typeof steamworks.runCallbacks === 'function') {
                        steamworks.runCallbacks();
                    }
                }, CALLBACK_INTERVAL_MS);

                // Store the interval so we can clear it later
                global.steamCallbackInterval = callbackInterval; // or attach to steamworks object if you prefer

                // Validate that Steam Client is running and connected
                try {
                    // 1. Fetch the display name!
                    const userName = steamFriends.getPersonaName();

                    // // 2. Store local SteamID so we can recognize our own entry in the leaderboard
                    // if (typeof steamUser.getSteamID === 'function') {
                    //     localSteamID = steamUser.getSteamID();
                    // } else if (typeof steamUser.getSteamId === 'function') {
                    //     localSteamID = steamUser.getSteamId();
                    // }
                    // console.log(`[Steamworks] Local SteamID stored for name lookup: ${localSteamID}`);

                    // SAVE IT PERMANENTLY!
                    if (userName) cachedPlayerName = userName;
                    
                    // 2. Stop trying to strictly validate the ID. We just want leaderboards to work!
                    let rawSteamID = "Unknown";
                    if (typeof steamUser.getSteamID === 'function') rawSteamID = steamUser.getSteamID();
                    else if (typeof steamUser.getSteamId === 'function') rawSteamID = steamUser.getSteamId();
                    else {
                        // Ask Node to print the actual function names so we can see them!
                        console.log("🔍 DEBUG: Found these functions on steamUser:");
                        console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(steamUser)));
                    }

                    // 3. We have the username, so Steam is officially connected. Let it run!
                    if (userName) {
                        issteamInitialized = true;
                        console.log('✓ Steamworks initialized successfully (AppID: 4588740)');
                        console.log(`  Steam User: ${userName} (ID: ${rawSteamID.toString()})`);

                        // 🔍 DUMP ROOT PROPERTIES TO FIND THE ID:
                        console.log("🔍 Root steamworks keys:", Object.keys(steamworks));
                        
                        // NEW: Initialize stats so Steam unlocks database writes for this session!
                        try {
                            if (steamworks.stats && typeof steamworks.stats.requestCurrentStats === 'function') {
                                steamworks.stats.requestCurrentStats();
                                console.log('  [Steamworks] User stats requested from backend.');
                            }
                        } catch (statErr) {
                            console.log('  [Steamworks] Note: Stats initialization skipped.');
                        }
                    } else {
                        throw new Error('Steam user info unavailable - Steam may not be running');
                    }
                } catch (userError) {
                    console.log('⚠ Could not validate Steam connection:', userError.message);
                    console.log('  Steam Client may not be running or user not logged in.');
                    issteamInitialized = false;
                    steamworks = null;
                    steamUser = null;
                    steamFriends = null;
                    steamLeaderboards = null;
                }
            } else {
                throw new Error(`steamworks.init() returned: ${initResult} (expected true)`);
            }
        } catch (error) {
            console.log('⚠ Steamworks initialization failed:', error.message);
            console.log('  Ensure steam_appid.txt exists with AppID 4588740.');
            console.log('  Steam must be running and you must be logged in.');
            console.log('  Ensure steam_api64.dll is present in the app directory.');
            console.log('  Game will run in offline mode. Leaderboards will use local storage.');
            issteamInitialized = false;
            steamworks = null;
            steamUser = null;
            steamLeaderboards = null;
        }
    } else {
        console.log('⚠ Steamworks module not loaded. Check if steamworks-ffi-node is installed and steam_api64.dll is present.');
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

// Clean up shortcuts on quit
app.on('will-quit', () => {
    if (global.steamCallbackInterval) {
        clearInterval(global.steamCallbackInterval);
        console.log('[Steamworks] Callback pump stopped');
    }
    if (steamworks && typeof steamworks.shutdown === 'function') {
        steamworks.shutdown();
    }
    globalShortcut.unregisterAll();
});
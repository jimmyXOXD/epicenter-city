const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

// Force the game to ignore Windows DPI scaling (125%, 150%, etc.)
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Steamworks setup
let greenworks = null;
let steamClient = null;
let issteamInitialized = false;

// Load greenworks native module
try {
    greenworks = require('greenworks');
} catch (error) {
    console.log('Greenworks module not available (native build may not be compiled). Steam features will be disabled.');
}

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

// Handler to upload score to Steam leaderboard
ipcMain.handle('upload-steam-score', async (event, { leaderboardName, score }) => {
    if (!issteamInitialized || !steamClient) {
        console.log('⚠ Steam not initialized. Score uploaded to local storage only.');
        return { success: false, message: 'Steam not initialized', fallback: true };
    }

    try {
        // Upload score to Steam leaderboard
        const leaderboard = steamClient.findLeaderboard(leaderboardName);
        if (!leaderboard) {
            console.warn(`Leaderboard "${leaderboardName}" not found on Steam.`);
            return { success: false, message: 'Leaderboard not found', fallback: true };
        }

        // Upload using ScoreMethod 1 (KeepBest - only uploads if score is better)
        steamClient.uploadScore(leaderboard, Math.round(score), 1);
        console.log(`✓ Score ${score} uploaded to leaderboard: "${leaderboardName}"`);
        
        return { success: true, message: 'Score uploaded successfully' };
    } catch (error) {
        console.error('❌ Error uploading score to Steam:', error);
        return { success: false, message: error.message, fallback: true };
    }
});

// Handler to fetch leaderboard rankings from Steam
ipcMain.handle('get-steam-leaderboard', async (event, { leaderboardName }) => {
    if (!issteamInitialized || !steamClient) {
        console.log('⚠ Steam not initialized. Returning empty leaderboard.');
        return { global: [], friends: [], error: 'Steam not initialized' };
    }

    try {
        const leaderboard = steamClient.findLeaderboard(leaderboardName);
        if (!leaderboard) {
            console.warn(`Leaderboard "${leaderboardName}" not found on Steam.`);
            return { global: [], friends: [], error: 'Leaderboard not found' };
        }

        // Fetch Global scores (top 10)
        const globalScores = steamClient.downloadLeaderboardEntriesForUsers(
            leaderboard,
            steamClient.getLeaderboardEntriesByRankRange(1, 10)
        );

        // Fetch Friends scores
        const friendsScores = steamClient.downloadLeaderboardEntriesForUsers(
            leaderboard,
            steamClient.getLeaderboardEntriesForFriends()
        );

        // Parse and format scores
        const formatScore = (entry) => ({
            rank: entry.rank,
            username: steamClient.getPersonaName(entry.steamID),
            score: entry.score,
            timestamp: entry.details || Date.now()
        });

        const globalData = globalScores ? globalScores.map(formatScore) : [];
        const friendsData = friendsScores ? friendsScores.map(formatScore) : [];

        console.log(`✓ Retrieved ${globalData.length} global and ${friendsData.length} friends leaderboard entries`);

        return { global: globalData, friends: friendsData };
    } catch (error) {
        console.error('❌ Error fetching leaderboard from Steam:', error);
        return { global: [], friends: [], error: error.message };
    }
});

// Handler to get current Steam user info
ipcMain.handle('get-steam-user-info', async (event) => {
    if (!issteamInitialized || !steamClient) {
        return { name: 'Offline User', steamID: null };
    }

    try {
        const username = steamClient.getPersonaName();
        const steamID = steamClient.getSteamID();
        return { name: username, steamID };
    } catch (error) {
        console.error('Error getting Steam user info:', error);
        return { name: 'Unknown User', steamID: null, error: error.message };
    }
});

// ========== END STEAMWORKS IPC HANDLERS ==========

// App lifecycle
app.whenReady().then(() => {
    // Initialize Steamworks
    if (greenworks) {
        try {
            // Initialize with AppID 480 (Spacewar - test app)
            greenworks.init(4588740);
            steamClient = greenworks;
            issteamInitialized = true;
            console.log('✓ Steamworks initialized successfully (AppID: 4588740)');
        } catch (error) {
            console.log('⚠ Steamworks initialization failed:', error.message);
            console.log('  Steam may not be running or AppID may be invalid.');
            console.log('  Game will run in offline mode. Leaderboards will use local storage.');
        }
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
    globalShortcut.unregisterAll();
});
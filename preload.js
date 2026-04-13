const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Existing APIs
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
    quitGame: () => ipcRenderer.send('quit-game'),
    isElectron: true,

    // ========== STEAMWORKS APIS ==========
    
    /**
     * Upload a score to Steam leaderboard
     * @param {string} leaderboardName - Name of the Steam leaderboard
     * @param {number} score - Score to upload
     * @returns {Promise<{success: boolean, message: string, fallback?: boolean}>}
     */
    uploadSteamScore: async (leaderboardName, score) => {
        try {
            return await ipcRenderer.invoke('upload-steam-score', { leaderboardName, score });
        } catch (error) {
            console.error('Error in uploadSteamScore:', error);
            return { success: false, message: error.message, fallback: true };
        }
    },

    /**
     * Fetch leaderboard rankings from Steam (Global and Friends)
     * @param {string} leaderboardName - Name of the Steam leaderboard
     * @returns {Promise<{global: Array, friends: Array, error?: string}>}
     */
    getSteamLeaderboard: async (leaderboardName) => {
        try {
            return await ipcRenderer.invoke('get-steam-leaderboard', { leaderboardName });
        } catch (error) {
            console.error('Error in getSteamLeaderboard:', error);
            return { global: [], friends: [], error: error.message };
        }
    },

    /**
     * Get current Steam user information
     * @returns {Promise<{name: string, steamID: string|null, error?: string}>}
     */
    getSteamUserInfo: async () => {
        try {
            return await ipcRenderer.invoke('get-steam-user-info');
        } catch (error) {
            console.error('Error in getSteamUserInfo:', error);
            return { name: 'Unknown User', steamID: null, error: error.message };
        }
    }

    // ========== END STEAMWORKS APIS ==========
});

// Expose a simpler steamAPI namespace for direct score uploads
contextBridge.exposeInMainWorld('steamAPI', {
    // ONLY send the score, no object wrappers!
    uploadScore: (score) => ipcRenderer.invoke('upload-steam-score', score),
    getUserInfo: () => ipcRenderer.invoke('get-steam-user-info'),
    getLeaderboard: () => ipcRenderer.invoke('get-steam-leaderboard')
});


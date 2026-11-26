const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Provide Firebase configuration from firebase-applet-config.json or environment variables
app.get('/api/firebase-config', (req, res) => {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (fileConfig && fileConfig.apiKey && fileConfig.projectId) {
        return res.json({
          configured: true,
          config: fileConfig
        });
      }
    } catch (err) {
      console.error('Failed to read firebase-applet-config.json:', err.message);
    }
  }

  const apiKey = process.env.FIREBASE_API_KEY || '';
  if (!apiKey) {
    return res.json({ configured: false });
  }
  return res.json({
    configured: true,
    config: {
      apiKey,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
    }
  });
});

// Route alias for labyrinth-game (hyphenated link compatibility) -> labyrinth_game
app.use('/labyrinth-game', express.static(path.join(__dirname, 'labyrinth_game')));
app.use('/arcade-hub/retro-snake-game', express.static(path.join(__dirname, 'retro-snake-game')));
app.use('/arcade-hub/labyrinth-game', express.static(path.join(__dirname, 'labyrinth_game')));
app.use('/arcade-hub/labyrinth_game', express.static(path.join(__dirname, 'labyrinth_game')));

// Serve static files from repository root
app.use(express.static(__dirname));

app.listen(PORT, HOST, () => {
  console.log(`Arcade Hub server listening on http://${HOST}:${PORT}`);
});

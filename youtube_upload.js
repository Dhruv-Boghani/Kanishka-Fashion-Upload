const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

// Replace with your actual credentials
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Load token.json
function loadSavedCredentials() {
  const tokenPath = path.join(__dirname, 'token.json');
  const token = JSON.parse(fs.readFileSync(tokenPath));
  oauth2Client.setCredentials(token);
  return oauth2Client;
}

async function uploadShortToYouTube(videoPath) {
  try {
    const auth = loadSavedCredentials();
    const youtube = google.youtube({ version: 'v3', auth });

    const title = process.env.YOUTUBE_TITLE || 'Untitled';
    const description = process.env.YOUTUBE_DESCRIPTION || '';

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      notifySubscribers: true,
      requestBody: {
        snippet: {
          title,
          description,
          tags: [
            'Fashion',
            'Indian Fashion',
            'Ethnic Wear',
            'Saree Styling',
            'Designer Sarees',
            'Traditional Wear',
            'Latest Saree Trends',
            'Women Fashion',
            'Ethnic Outfit Ideas',
            'Fashion Reels',
            'Trending Fashion',
            'Indian Ethnic Wear',
            'Wedding Outfit',
            'Party Wear Saree',
            'Occasion Wear',
            'Gujarati Fashion',
            'Saree Draping',
            'Bridal Wear',
            'Lehenga Choli',
            'Salwar Suit',
            'Indo Western',
            'Fashion Shorts',
            'Shorts',
            'Reels',
            'Trending Shorts',
            'Viral Fashion Video',
            'Festive Fashion',
            'Kurti Designs',
            'Beautiful Outfit',
            'Lookbook'
          ],
          categoryId: '19', // 'Travel & Events'
        },
        status: {
          privacyStatus: 'public',
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    console.log('📤 YouTube Shorts uploaded:', res.data.id);
    return res.data.id;
  } catch (err) {
    console.error('❌ YouTube upload failed:', err.message || err);
    return null;
  }
}

module.exports = { uploadShortToYouTube };

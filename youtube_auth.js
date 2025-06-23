const fs = require('fs');
const { google } = require('googleapis');
const readline = require('readline');
const open = require('open'); // Corrected line
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function generateToken() {
  const TOKEN_PATH = 'token.json';

  if (fs.existsSync(TOKEN_PATH)) {
    console.log('✅ token.json already exists.');
    return;
  }

  const authUrl = getAuthUrl();
  console.log('Authorize this app by visiting this URL:\n', authUrl);
  // await open(authUrl); // ✅ Will now work correctly

  const code = await askQuestion('🔑 Enter the code from that page here: ');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('✅ Token stored to', TOKEN_PATH);
  } catch (error) {
    console.error('❌ Error retrieving access token', error);
  }
}

generateToken();

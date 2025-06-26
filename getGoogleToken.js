// קובץ: getGoogleToken.js

const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost'
);

function getAccessToken() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('🔗 Please visit this URL to authorize the app:', authUrl);
  console.log('\n📋 Instructions:');
  console.log('1. Click the link above');
  console.log('2. Sign in and authorize the app');
  console.log('3. You will be redirected to localhost (this is normal)');
  console.log('4. Copy the FULL URL from your browser address bar');
  console.log('5. Paste it below\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('📥 Paste the full redirect URL here: ', (url) => {
    rl.close();
    try {
      const urlParams = new URL(url);
      const code = urlParams.searchParams.get('code');
      
      if (!code) {
        console.error('❌ Could not find authorization code in URL');
        return;
      }

      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('❌ Error retrieving access token:', err);
        console.log('\n✅ Your refresh token:');
        console.log(token.refresh_token);
        console.log('\n📝 Add this to your .env file as GOOGLE_REFRESH_TOKEN');
      });
    } catch (error) {
      console.error('❌ Invalid URL format:', error.message);
    }
  });
}

getAccessToken();

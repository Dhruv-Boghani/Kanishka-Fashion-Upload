const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const { uploadShortToYouTube } = require('./youtube_upload'); // Your existing YouTube upload function
require('dotenv').config();
const { uploadFileToDriveAndGetPublicUrl } = require('./uploadToDrive');
const { google } = require('googleapis');

const router = express.Router();

const serviceAccountPath = fs.existsSync('/etc/secrets/service_account.json')
    ? '/etc/secrets/service_account.json'
    : path.join(__dirname, 'service_account.json');
const SERVICE_ACCOUNT = require(serviceAccountPath);

const auth = new google.auth.GoogleAuth({
  credentials: SERVICE_ACCOUNT,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// Environment Variables
const IG_USER_ID = process.env.IG_USER_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const txtFileDriveId = process.env.TXT_FILE_DRIVE_ID;

// Multer Setup for File Upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, 'uploaded_video' + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Serve HTML (GET)
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload Route (POST)
router.post('/upload', upload.single('video'), async (req, res) => {
    const videoPath = req.file.path;
    const caption = req.body.instagram_caption;
    const youtubeTitle = req.body.youtube_title;
    const youtubeDescription = req.body.youtube_description;

    const finalCaption = `${caption} \n\n\n ${process.env.ENV_CAPTION}`
    const finalDescription = `${youtubeTitle} \n\n\n ${youtubeDescription} \n\n\n ${process.env.ENV_YOUTUBE_DESCRIPTION}`

    console.log('✅ Form Data Received:');
    console.log('Caption:', caption);
    console.log('YouTube Title:', youtubeTitle);
    console.log('YouTube Description:', youtubeDescription);
    console.log('Uploaded File:', videoPath);

    try {
        await downloadFileFromDrive('token.json');

        // 3️⃣ Upload to Instagram (needs public URL - provide from Drive/S3)
        const publicUrl = await uploadFileToDriveAndGetPublicUrl(videoPath);
        console.log(publicUrl);
        await uploadReelToInstagram(publicUrl, finalCaption);

        // 1️⃣ Upload to Facebook
        await uploadReelToFacebook(videoPath, finalCaption);

        // 2️⃣ Upload to YouTube Shorts
        const youtubeVideoId = await uploadShortToYouTube(videoPath, youtubeTitle, finalDescription);
        console.log(`🎬 YouTube Uploaded: https://www.youtube.com/watch?v=${youtubeVideoId}`);

        if (fs.existsSync('token.json')) await uploadOrUpdateFile('token.json', 'token.json');
        res.send('🎉 Uploaded to Instagram, Facebook, YouTube successfully!');

    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).send('Upload failed: ' + error.message);
    } finally {
        // 4️⃣ Delete the uploaded file after processing
        fs.unlink(videoPath, (err) => {
            if (err) {
                console.error('❌ Error deleting file:', err);
            } else {
                console.log('🧹 Uploaded file deleted from server:', videoPath);
            }
        });
    }
});

// Facebook Upload
async function uploadReelToFacebook(videoPath, caption) {
    try {
        const form = new FormData();
        form.append('source', fs.createReadStream(videoPath));
        form.append('description', caption);

        const response = await axios.post(
            `https://graph-video.facebook.com/v19.0/${FB_PAGE_ID}/videos`,
            form,
            {
                headers: form.getHeaders(),
                params: { access_token: PAGE_ACCESS_TOKEN },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        console.log("📺 Uploaded to Facebook Page:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Facebook upload failed:", error.response?.data || error.message);
        throw error;
    }
}

// Instagram Upload (needs public URL)
async function uploadReelToInstagram(publicUrl, caption) {
    try {
        const containerRes = await axios.post(
            `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
            {
                media_type: 'REELS',
                video_url: publicUrl,
                caption,
            },
            { params: { access_token: INSTAGRAM_ACCESS_TOKEN } }
        );

        const creationId = containerRes.data.id;
        console.log('📦 Instagram container created:', creationId);

        // Wait before publishing
        await new Promise(resolve => setTimeout(resolve, 50000));

        const publishRes = await axios.post(
            `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
            { creation_id: creationId },
            { params: { access_token: INSTAGRAM_ACCESS_TOKEN } }
        );

        console.log('🚀 Reel published on Instagram:', publishRes.data);
        return publishRes.data;
    } catch (error) {
        console.error('❌ Instagram upload failed:', error.response?.data || error.message);
        throw error;
    }
}

// ✅ Upload new version of file
async function uploadOrUpdateFile(localFilePath, fileName) {
  const res = await drive.files.list({
    q: `'${txtFileDriveId}' in parents and name = '${fileName}' and trashed = false`,
    fields: "files(id, name)",
  });

  const existingFile = res.data.files[0];
  if (existingFile) {
    await drive.files.delete({ fileId: existingFile.id });
    console.log(`🗑️ Deleted old ${fileName} from Drive.`);
  }

  await drive.files.create({
    resource: { name: fileName, parents: [txtFileDriveId] },
    media: { mimeType: "text/plain", body: fs.createReadStream(localFilePath) },
    fields: "id",
  });

  console.log(`✅ Uploaded ${fileName} to Drive.`);
}

// ✅ Download links.txt from Drive
async function downloadFileFromDrive(fileName) {
  const res = await drive.files.list({
    q: `'${txtFileDriveId}' in parents and name = '${fileName}' and trashed = false`,
    fields: "files(id, name)",
  });

  const file = res.data.files[0];
  if (!file) {
    console.error(`❌ '${fileName}' not found in Drive folder.`);
    return null;
  }

  const dest = fs.createWriteStream(fileName);
  await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "stream" })
    .then(res => new Promise((resolve, reject) => {
      res.data.on("end", resolve).on("error", reject).pipe(dest);
    }));

  console.log(`✅ ${fileName} downloaded from Drive.`);
  return file.id;
}

module.exports = router;

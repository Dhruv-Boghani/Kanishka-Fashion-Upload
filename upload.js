const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const { uploadShortToYouTube } = require('./youtube_upload'); // Your existing YouTube upload function
require('dotenv').config();
const { uploadFileToDriveAndGetPublicUrl } = require('./uploadToDrive');

const router = express.Router();

// Environment Variables
const IG_USER_ID = process.env.IG_USER_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

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

    console.log('✅ Form Data Received:');
    console.log('Caption:', caption);
    console.log('YouTube Title:', youtubeTitle);
    console.log('YouTube Description:', youtubeDescription);
    console.log('Uploaded File:', videoPath);

    try {
        // 1️⃣ Upload to Facebook
        await uploadReelToFacebook(videoPath, caption);

        // 2️⃣ Upload to YouTube Shorts
        const youtubeVideoId = await uploadShortToYouTube(videoPath, youtubeTitle, youtubeDescription);
        console.log(`🎬 YouTube Uploaded: https://www.youtube.com/watch?v=${youtubeVideoId}`);

        // 3️⃣ Upload to Instagram (needs public URL - provide from Drive/S3)
        const publicUrl = await uploadFileToDriveAndGetPublicUrl(videoPath);
        console.log(publicUrl);
        await uploadReelToInstagram(publicUrl, caption);

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


module.exports = router;

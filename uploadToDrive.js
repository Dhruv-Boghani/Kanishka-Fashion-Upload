const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const mime = require('mime-types');
require('dotenv').config();

const DRIVE_FOLDER_ID = process.env.DRIVE_ID;
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// use serviceAccount like normal
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Clear the Drive folder (remove old files)
async function clearDriveFolder(folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
  });

  const files = res.data.files;
  for (const file of files) {
    await drive.files.delete({ fileId: file.id });
    console.log(`🗑️ Deleted: ${file.name} in Drive`);
  }
}

// Upload the provided file to Drive and make it public
async function uploadFileToDriveAndGetPublicUrl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("❌ File not found: " + filePath);
  }

  const fileName = path.basename(filePath);
  const mimeType = mime.lookup(filePath);

  // 1. Clear previous files
  await clearDriveFolder(DRIVE_FOLDER_ID);

  // 2. Upload new file
  const fileMeta = {
    name: fileName,
    parents: [DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  const file = await drive.files.create({
    resource: fileMeta,
    media,
    fields: 'id',
  });

  // 3. Make file public
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  const publicUrl = `https://drive.google.com/uc?id=${file.data.id}&export=download`;
  console.log(`🌍 Public URL: ${publicUrl}`);
  return publicUrl;
}

module.exports = { uploadFileToDriveAndGetPublicUrl };

/**
 * ==============================================================================
 * SHREEJI HEALTHCARE - GOOGLE APPS SCRIPT WEBHOOK ENGINE
 * 100% Free, Zero-OAuth2 Google Drive Cloud Backup & 1-Click Gmail Dispatcher
 * ==============================================================================
 * 
 * INSTRUCTIONS TO DEPLOY (Takes 1 Minute):
 * 1. Open https://script.google.com in your browser with your Google Account.
 * 2. Click "New project" and name it "Shreeji Healthcare Cloud Bridge".
 * 3. Replace all existing code with this file's code.
 * 4. Change DEFAULT_API_KEY below to your chosen secret key (e.g. "SHREEJI_SECRET_KEY_2026").
 * 5. Click "Deploy" -> "New deployment".
 * 6. Under "Select type" (gear icon), select "Web app".
 * 7. Set:
 *      - Description: "Shreeji Drive & Gmail Webhook"
 *      - Execute as: "Me (your email)"
 *      - Who has access: "Anyone"
 * 8. Click "Deploy" and authorize permissions when prompted.
 * 9. Copy the Web app URL (ends with "/exec") and paste it into Shreeji Settings.
 * ==============================================================================
 */

// Secret API Key - Change this or set in Project Settings -> Script properties
var DEFAULT_API_KEY = "SHREEJI_SECRET_KEY_2026";
var BACKUP_FOLDER_NAME = "Shreeji_Healthcare_Backups";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Empty request payload" }, 400);
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: "Invalid JSON payload" }, 400);
    }

    // 1. Verify Secret API Key
    var configuredKey = PropertiesService.getScriptProperties().getProperty("SHREEJI_API_KEY") || DEFAULT_API_KEY;
    if (!data.apiKey || data.apiKey !== configuredKey) {
      return jsonResponse({ success: false, error: "Unauthorized: Invalid or missing API Key" }, 403);
    }

    var action = data.action;

    // 2. Route Actions
    switch (action) {
      case "upload_backup":
        return handleUploadBackup(data);

      case "list_backups":
        return handleListBackups(data);

      case "download_backup":
        return handleDownloadBackup(data);

      case "send_email":
        return handleSendEmail(data);

      case "test_connection":
        return jsonResponse({
          success: true,
          message: "Google Apps Script Webhook is active and responding!",
          account: Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(),
          timestamp: new Date().toISOString()
        });

      default:
        return jsonResponse({ success: false, error: "Unknown action: " + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

function doGet(e) {
  return jsonResponse({
    status: "online",
    service: "Shreeji Healthcare Drive & Gmail Webhook",
    message: "Use POST requests with valid apiKey and action.",
    timestamp: new Date().toISOString()
  });
}

// ------------------------------------------------------------------------------
// ACTION 1: Upload Backup to Google Drive
// ------------------------------------------------------------------------------
function handleUploadBackup(data) {
  var filename = data.filename || ("backup_" + Utilities.formatDate(new Date(), "GMT+5:30", "yyyyMMdd_HHmmss") + ".json");
  var content = data.content;
  var isBase64 = data.isBase64 || false;
  var folderName = data.folderName || BACKUP_FOLDER_NAME;
  var mimeType = data.mimeType || "application/octet-stream";

  if (!content) {
    return jsonResponse({ success: false, error: "Missing content for backup" }, 400);
  }

  var folder = getOrCreateFolder(folderName);
  var blob;

  if (isBase64) {
    var decodedBytes = Utilities.base64Decode(content);
    blob = Utilities.newBlob(decodedBytes, mimeType, filename);
  } else {
    blob = Utilities.newBlob(content, mimeType, filename);
  }

  var file = folder.createFile(blob);
  
  return jsonResponse({
    success: true,
    message: "Backup saved to Google Drive successfully",
    fileId: file.getId(),
    fileName: file.getName(),
    size: file.getSize(),
    webViewLink: file.getUrl(),
    createdTime: file.getDateCreated().toISOString()
  });
}

// ------------------------------------------------------------------------------
// ACTION 2: List Backups in Google Drive
// ------------------------------------------------------------------------------
function handleListBackups(data) {
  var folderName = data.folderName || BACKUP_FOLDER_NAME;
  var folder = getOrCreateFolder(folderName);
  var filesIterator = folder.getFiles();
  var files = [];

  while (filesIterator.hasNext()) {
    var file = filesIterator.next();
    files.push({
      id: file.getId(),
      name: file.getName(),
      size: file.getSize(),
      createdTime: file.getDateCreated().toISOString(),
      webViewLink: file.getUrl()
    });
  }

  // Sort descending by createdTime (newest first)
  files.sort(function(a, b) {
    return new Date(b.createdTime) - new Date(a.createdTime);
  });

  return jsonResponse({
    success: true,
    folderName: folderName,
    count: files.length,
    files: files
  });
}

// ------------------------------------------------------------------------------
// ACTION 3: Download Backup File from Google Drive
// ------------------------------------------------------------------------------
function handleDownloadBackup(data) {
  var fileId = data.fileId;
  if (!fileId) {
    return jsonResponse({ success: false, error: "Missing fileId" }, 400);
  }

  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var base64Content = Utilities.base64Encode(blob.getBytes());

  return jsonResponse({
    success: true,
    name: file.getName(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    content: base64Content,
    isBase64: true
  });
}

// ------------------------------------------------------------------------------
// ACTION 4: 1-Click Send Email via Gmail
// ------------------------------------------------------------------------------
function handleSendEmail(data) {
  var to = data.to;
  var subject = data.subject || "Shreeji Healthcare Notification";
  var bodyHtml = data.bodyHtml || ("<p>" + (data.body || "") + "</p>");
  var attachmentsList = data.attachments || [];

  if (!to) {
    return jsonResponse({ success: false, error: "Recipient email (to) is required." }, 400);
  }

  var mailAttachments = [];
  for (var i = 0; i < attachmentsList.length; i++) {
    var item = attachmentsList[i];
    if (item.content && item.filename) {
      var blob;
      if (item.isBase64) {
        blob = Utilities.newBlob(Utilities.base64Decode(item.content), item.mimeType || "application/octet-stream", item.filename);
      } else {
        blob = Utilities.newBlob(item.content, item.mimeType || "text/plain", item.filename);
      }
      mailAttachments.push(blob);
    }
  }

  var options = {
    htmlBody: bodyHtml,
    name: "Shreeji Healthcare"
  };

  if (mailAttachments.length > 0) {
    options.attachments = mailAttachments;
  }

  if (data.cc) options.cc = data.cc;
  if (data.bcc) options.bcc = data.bcc;
  if (data.replyTo) options.replyTo = data.replyTo;

  var plainBody = bodyHtml.replace(/<[^>]+>/g, " ");
  GmailApp.sendEmail(to, subject, plainBody, options);

  return jsonResponse({
    success: true,
    message: "Email sent successfully to " + to,
    timestamp: new Date().toISOString()
  });
}

// ------------------------------------------------------------------------------
// UTILITY: Get or Create Drive Folder
// ------------------------------------------------------------------------------
function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, HelpCircle, Code, ShieldCheck, Zap } from 'lucide-react';

interface WebhookHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * SHREEJI HEALTHCARE - GOOGLE APPS SCRIPT WEBHOOK ENGINE
 * 100% Free, Zero-OAuth2 Google Drive Cloud Backup & 1-Click Gmail Dispatcher
 * ==============================================================================
 */

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

    var configuredKey = PropertiesService.getScriptProperties().getProperty("SHREEJI_API_KEY") || DEFAULT_API_KEY;
    if (!data.apiKey || data.apiKey !== configuredKey) {
      return jsonResponse({ success: false, error: "Unauthorized: Invalid or missing API Key" }, 403);
    }

    var action = data.action;
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
`;

export const WebhookHelpModal: React.FC<WebhookHelpModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">
                How to Get Google Webhook URL? (વેબહુક URL મેળવવાની રીત)
              </h3>
              <p className="text-xs text-blue-200/90 font-medium">
                100% Free, Zero-OAuth2 Google Drive Cloud Backup & 1-Click Gmail Sync (1 મિનિટમાં સેટઅપ)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700 text-xs">
          {/* Quick Steps Card */}
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
            <h4 className="font-extrabold text-blue-950 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Easy 5-Step Deployment Guide (સરળ 5 સ્ટેપ માર્ગદર્શન)</span>
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-xs font-semibold text-slate-800 leading-relaxed">
              <li>
                <span className="font-bold">Google Apps Script ખોલો:</span> બ્રાઉઝરમાં{' '}
                <a
                  href="https://script.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 underline font-bold hover:text-blue-800"
                >
                  <span>https://script.google.com</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>{' '}
                ખોલો અને તમારા જીમેલ એકાઉન્ટથી લૉગિન કરો.
              </li>
              <li>
                <span className="font-bold">New Project બનાવો:</span> "<strong>+ New project</strong>" પર ક્લિક કરો અને પ્રોજેક્ટનું નામ "<strong>Shreeji Healthcare Cloud Bridge</strong>" આપો.
              </li>
              <li>
                <span className="font-bold">કોડ પેસ્ટ કરો:</span> નીચે આપેલું "<strong>Copy Complete Script</strong>" બટન દબાવો, અને સ્ક્રિપ્ટ એડિટરમાં જૂનો કોડ ડિલીટ કરી આ કોડ પેસ્ટ (Ctrl+V) કરો.
              </li>
              <li>
                <span className="font-bold">Deploy Web App:</span> ઉપર જમણી બાજુ "<strong>Deploy</strong>" → "<strong>New deployment</strong>" પર ક્લિક કરો:
                <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-slate-600 font-normal">
                  <li>ગિયર આઇકોન (Select type) પર ક્લિક કરી <strong>Web app</strong> પસંદ કરો.</li>
                  <li>Execute as: <strong>Me (your email)</strong></li>
                  <li>Who has access: <strong className="text-emerald-700">Anyone</strong> (કોઈપણ વ્યક્તિ)</li>
                </ul>
              </li>
              <li>
                <span className="font-bold">URL કોપી કરી સેટિંગ્સમાં પેસ્ટ કરો:</span> "<strong>Deploy</strong>" બટન દબાવો, ગૂગલ પરમિશન મંજૂર (Authorize) કરો, અને જે વેબ એપ URL મળે (જેના છેડે <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">/exec</code> હોય) તેને કોપી કરી આ સેટિંગ્સ પેજમાં પેસ્ટ કરો!
              </li>
            </ol>
          </div>

          {/* Script Copy Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                <Code className="w-4 h-4 text-indigo-600" />
                <span>Google Apps Script Code (GoogleSyncWebhook.gs):</span>
              </label>
              <button
                type="button"
                onClick={handleCopyScript}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition-all shadow-xs ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Code Copied! (કોપી થઈ ગયું)' : 'Copy Complete Script (કોડ કોપી કરો)'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className="max-h-60 overflow-y-auto p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed border border-slate-800">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
          <span className="text-[11px] text-slate-500 font-medium">
            Stored locally in <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">scripts/google/GoogleSyncWebhook.gs</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Close Guide (બંધ કરો)
          </button>
        </div>
      </div>
    </div>
  );
};

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}

const storage = new Storage();
const PORT = Number(process.env.PORT || 8080);
const ADMIN_UID = String(process.env.ADMIN_UID || '').trim();
const STORAGE_BUCKET = String(process.env.STORAGE_BUCKET || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (!ADMIN_UID || !STORAGE_BUCKET) {
  console.warn('ADMIN_UID ou STORAGE_BUCKET manquant : le service ne pourra pas convertir.');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origine non autorisée'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'quizlive-pptx-converter' });
});

async function requireAdmin(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Authentification Firebase requise' });
      return;
    }

    const decoded = await getAuth().verifyIdToken(match[1]);
    if (decoded.uid !== ADMIN_UID) {
      res.status(403).json({ error: 'Accès administrateur requis' });
      return;
    }

    req.firebaseUser = decoded;
    next();
  } catch (error) {
    console.error('Erreur de vérification Firebase :', error);
    res.status(401).json({ error: 'Jeton Firebase invalide ou expiré' });
  }
}

function safeBaseName(filename) {
  return String(filename || 'presentation')
    .replace(/\.pptx$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'presentation';
}

async function uploadImage(bucket, localPath, remotePath) {
  const token = uuidv4();
  await bucket.upload(localPath, {
    destination: remotePath,
    resumable: false,
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(remotePath)}?alt=media&token=${token}`;
}

app.post('/convert', requireAdmin, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Fichier PowerPoint manquant' });
    return;
  }

  if (!file.originalname.toLowerCase().endsWith('.pptx')) {
    res.status(400).json({ error: 'Seuls les fichiers .pptx sont acceptés' });
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quizlive-pptx-'));
  const inputPath = path.join(workDir, 'presentation.pptx');
  const outputDir = path.join(workDir, 'output');
  const imagesDir = path.join(workDir, 'images');

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(inputPath, file.buffer);

    await execFileAsync('libreoffice', [
      '--headless',
      '--nologo',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ], { timeout: 240000, maxBuffer: 10 * 1024 * 1024 });

    const pdfPath = path.join(outputDir, 'presentation.pdf');
    await fs.access(pdfPath);

    const imagePrefix = path.join(imagesDir, 'slide');
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', '160',
      pdfPath,
      imagePrefix
    ], { timeout: 240000, maxBuffer: 10 * 1024 * 1024 });

    const imageFiles = (await fs.readdir(imagesDir))
      .filter(name => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!imageFiles.length) {
      throw new Error('Aucune slide n’a été générée');
    }

    const bucket = storage.bucket(STORAGE_BUCKET);
    const conversionId = uuidv4();
    const baseName = safeBaseName(file.originalname);
    const slides = [];

    for (let index = 0; index < imageFiles.length; index += 1) {
      const localPath = path.join(imagesDir, imageFiles[index]);
      const remotePath = `converted-slides/${req.firebaseUser.uid}/${conversionId}/slide-${String(index + 1).padStart(3, '0')}.png`;
      const imageData = await uploadImage(bucket, localPath, remotePath);
      slides.push({
        type: 'slide',
        name: `${baseName} — Slide ${index + 1}`,
        imageData,
        storagePath: remotePath,
        createdAt: Date.now() + index
      });
    }

    res.json({
      ok: true,
      count: slides.length,
      conversionId,
      slides
    });
  } catch (error) {
    console.error('Échec conversion PowerPoint :', error);
    res.status(500).json({
      error: 'La conversion PowerPoint a échoué',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  console.error('Erreur serveur :', error);
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Le fichier dépasse la limite de 50 Mo' });
    return;
  }
  res.status(500).json({ error: error?.message || 'Erreur interne' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QuizLive PPTX converter listening on port ${PORT}`);
});

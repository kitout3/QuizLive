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
import { getDatabase } from 'firebase-admin/database';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
if (!getApps().length) initializeApp({ credential: applicationDefault() });

const storage = new Storage();
const PORT = Number(process.env.PORT || 8080);
const STORAGE_BUCKET = String(process.env.STORAGE_BUCKET || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({ origin(origin, cb) { if (!origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) cb(null, true); else cb(new Error('Origine non autorisée')); }, methods:['GET','POST','OPTIONS'], allowedHeaders:['Authorization','Content-Type'] }));
app.get('/health', (_req,res) => res.json({ok:true,service:'quizlive-pptx-converter'}));

async function requireOrganizer(req,res,next) {
  try {
    const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({error:'Authentification Firebase requise'});
    const decoded = await getAuth().verifyIdToken(match[1]);
    const profile = (await getDatabase().ref(`organizers/${decoded.uid}`).get()).val();
    if (!profile || profile.role !== 'organizer' || profile.active === false) return res.status(403).json({error:'Compte organisateur actif requis'});
    req.firebaseUser = decoded; next();
  } catch (error) { console.error(error); res.status(401).json({error:'Jeton Firebase invalide ou expiré'}); }
}

function safeBaseName(filename) { return String(filename || 'presentation').replace(/\.pptx$/i,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'presentation'; }

async function uploadImage(bucket, localPath, remotePath) {
  const token = uuidv4();
  await bucket.upload(localPath,{destination:remotePath,resumable:false,metadata:{contentType:'image/png',cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:token}}});
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(remotePath)}?alt=media&token=${token}`;
}

app.post('/convert', requireOrganizer, upload.single('file'), async (req,res) => {
  const file = req.file;
  if (!file) return res.status(400).json({error:'Fichier PowerPoint manquant'});
  if (!file.originalname.toLowerCase().endsWith('.pptx')) return res.status(400).json({error:'Seuls les fichiers .pptx sont acceptés'});
  if (!STORAGE_BUCKET) return res.status(500).json({error:'Firebase Storage non configuré'});

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(),'quizlive-pptx-'));
  const inputPath = path.join(workDir,'presentation.pptx');
  const outputDir = path.join(workDir,'output');
  const imagesDir = path.join(workDir,'images');
  try {
    await fs.mkdir(outputDir,{recursive:true}); await fs.mkdir(imagesDir,{recursive:true}); await fs.writeFile(inputPath,file.buffer);
    await execFileAsync('libreoffice',['--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',outputDir,inputPath],{timeout:240000,maxBuffer:10*1024*1024});
    const pdfPath = path.join(outputDir,'presentation.pdf'); await fs.access(pdfPath);
    await execFileAsync('pdftoppm',['-png','-r','160',pdfPath,path.join(imagesDir,'slide')],{timeout:240000,maxBuffer:10*1024*1024});
    const imageFiles = (await fs.readdir(imagesDir)).filter(n=>/^slide-\d+\.png$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if (!imageFiles.length) throw new Error('Aucune slide générée');
    const bucket = storage.bucket(STORAGE_BUCKET); const conversionId = uuidv4(); const baseName = safeBaseName(file.originalname); const slides=[];
    for (let i=0;i<imageFiles.length;i++) {
      const remotePath=`converted-slides/${req.firebaseUser.uid}/${conversionId}/slide-${String(i+1).padStart(3,'0')}.png`;
      const imageData=await uploadImage(bucket,path.join(imagesDir,imageFiles[i]),remotePath);
      slides.push({type:'slide',name:`${baseName} — Slide ${i+1}`,imageData,storagePath:remotePath,createdAt:Date.now()+i});
    }
    res.json({ok:true,count:slides.length,conversionId,slides});
  } catch(error) { console.error(error); res.status(500).json({error:'La conversion PowerPoint a échoué',details:process.env.NODE_ENV==='production'?undefined:error.message}); }
  finally { await fs.rm(workDir,{recursive:true,force:true}).catch(()=>{}); }
});

app.use((error,_req,res,_next)=>{ if(error?.code==='LIMIT_FILE_SIZE') return res.status(413).json({error:'Le fichier dépasse 50 Mo'}); res.status(500).json({error:error?.message || 'Erreur interne'}); });
app.listen(PORT,'0.0.0.0',()=>console.log(`QuizLive converter on ${PORT}`));
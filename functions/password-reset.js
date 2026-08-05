const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const PASSWORD_RESET_FROM = defineString('PASSWORD_RESET_FROM', {
  default: 'QuizLive <onboarding@resend.dev>'
});
const QUIZLIVE_APP_URL = defineString('QUIZLIVE_APP_URL', {
  default: 'https://kitout3.github.io/QuizLive'
});

const EMAIL_COOLDOWN_MS = 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_REQUESTS = 12;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLanguage(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function requestIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || request.ip || request.socket?.remoteAddress || 'unknown';
}

async function acquireEmailCooldown(email) {
  const key = sha256(email);
  const ref = getDatabase().ref(`security/passwordResetRateLimits/email/${key}`);
  const now = Date.now();

  const result = await ref.transaction(current => {
    const lastAt = Number(current?.lastAt || 0);
    if (lastAt && now - lastAt < EMAIL_COOLDOWN_MS) return;
    return {
      lastAt: now,
      expiresAt: now + (24 * 60 * 60 * 1000)
    };
  }, undefined, false);

  return result.committed;
}

async function acquireIpAllowance(ip) {
  const key = sha256(ip);
  const token = crypto.randomUUID();
  const ref = getDatabase().ref(`security/passwordResetRateLimits/ip/${key}`);
  const now = Date.now();

  const result = await ref.transaction(current => {
    const windowStart = Number(current?.windowStart || 0);
    const expired = !windowStart || now - windowStart >= IP_WINDOW_MS;

    if (expired) {
      return {
        windowStart: now,
        count: 1,
        lastToken: token,
        expiresAt: now + IP_WINDOW_MS
      };
    }

    const count = Number(current?.count || 0);
    if (count >= IP_MAX_REQUESTS) return current;

    return {
      ...current,
      count: count + 1,
      lastToken: token,
      expiresAt: windowStart + IP_WINDOW_MS
    };
  }, undefined, false);

  return result.committed && result.snapshot.val()?.lastToken === token;
}

function customResetUrl(firebaseLink, language) {
  let source = new URL(firebaseLink);
  const nestedLink = source.searchParams.get('link');

  if (nestedLink) {
    try {
      source = new URL(nestedLink);
    } catch (_) {
      // Le lien Firebase direct reste la source.
    }
  }

  const target = new URL(`${QUIZLIVE_APP_URL.value().replace(/\/$/, '')}/reset-password-action.html`);
  const allowedParameters = ['mode', 'oobCode', 'apiKey', 'continueUrl', 'tenantId'];

  for (const name of allowedParameters) {
    const value = source.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }

  target.searchParams.set('mode', 'resetPassword');
  target.searchParams.set('lang', language);
  return target.toString();
}

function emailContent({ language, displayName, resetUrl }) {
  const safeName = escapeHtml(displayName || '');
  const safeUrl = escapeHtml(resetUrl);

  if (language === 'en') {
    return {
      subject: 'Reset your QuizLive password',
      text: [
        safeName ? `Hello ${displayName},` : 'Hello,',
        '',
        'A password reset was requested for your QuizLive account.',
        'Choose a new password using this secure link:',
        resetUrl,
        '',
        'If you did not request this change, you can ignore this email.',
        '',
        'The QuizLive team'
      ].join('\n'),
      html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#08091a;font-family:Arial,sans-serif;color:#ffffff">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">Choose a new password for your QuizLive account.</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#08091a">
      <tr><td align="center" style="padding:38px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#15172f;border:1px solid #2a2d50;border-radius:22px;overflow:hidden">
          <tr><td style="padding:27px 32px;background:linear-gradient(135deg,#625df5,#d83f9d);font-size:25px;font-weight:700">⚡ QuizLive</td></tr>
          <tr><td style="padding:36px 32px">
            <h1 style="margin:0 0 18px;font-size:27px;line-height:1.25">Reset your password</h1>
            <p style="margin:0 0 16px;color:#c8cae2;line-height:1.65">${safeName ? `Hello ${safeName},` : 'Hello,'}</p>
            <p style="margin:0 0 26px;color:#c8cae2;line-height:1.65">A password reset was requested for your QuizLive account. Click the button below to choose a new password.</p>
            <a href="${safeUrl}" style="display:inline-block;padding:15px 23px;border-radius:12px;background:linear-gradient(135deg,#625df5,#d83f9d);color:#fff;text-decoration:none;font-weight:700">Choose a new password</a>
            <p style="margin:28px 0 8px;color:#8f93b2;font-size:13px;line-height:1.55">If the button does not work, copy this address into your browser:</p>
            <p style="margin:0;word-break:break-all;color:#aaaee0;font-size:12px;line-height:1.55">${safeUrl}</p>
            <p style="margin:30px 0 0;color:#8f93b2;font-size:13px;line-height:1.55">If you did not request this change, you can safely ignore this email.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #2a2d50;color:#777c9f;font-size:12px">The QuizLive team</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
    };
  }

  return {
    subject: 'Réinitialisez votre mot de passe QuizLive',
    text: [
      safeName ? `Bonjour ${displayName},` : 'Bonjour,',
      '',
      'Une demande de réinitialisation a été effectuée pour votre compte QuizLive.',
      'Choisissez un nouveau mot de passe avec ce lien sécurisé :',
      resetUrl,
      '',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.',
      '',
      'L’équipe QuizLive'
    ].join('\n'),
    html: `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#08091a;font-family:Arial,sans-serif;color:#ffffff">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">Choisissez un nouveau mot de passe pour votre compte QuizLive.</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#08091a">
      <tr><td align="center" style="padding:38px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#15172f;border:1px solid #2a2d50;border-radius:22px;overflow:hidden">
          <tr><td style="padding:27px 32px;background:linear-gradient(135deg,#625df5,#d83f9d);font-size:25px;font-weight:700">⚡ QuizLive</td></tr>
          <tr><td style="padding:36px 32px">
            <h1 style="margin:0 0 18px;font-size:27px;line-height:1.25">Réinitialisez votre mot de passe</h1>
            <p style="margin:0 0 16px;color:#c8cae2;line-height:1.65">${safeName ? `Bonjour ${safeName},` : 'Bonjour,'}</p>
            <p style="margin:0 0 26px;color:#c8cae2;line-height:1.65">Une demande de réinitialisation a été effectuée pour votre compte QuizLive. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
            <a href="${safeUrl}" style="display:inline-block;padding:15px 23px;border-radius:12px;background:linear-gradient(135deg,#625df5,#d83f9d);color:#fff;text-decoration:none;font-weight:700">Choisir un nouveau mot de passe</a>
            <p style="margin:28px 0 8px;color:#8f93b2;font-size:13px;line-height:1.55">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
            <p style="margin:0;word-break:break-all;color:#aaaee0;font-size:12px;line-height:1.55">${safeUrl}</p>
            <p style="margin:30px 0 0;color:#8f93b2;font-size:13px;line-height:1.55">Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #2a2d50;color:#777c9f;font-size:12px">L’équipe QuizLive</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  };
}

function genericResponse(language) {
  return language === 'en'
    ? 'If an account matches this address, a secure reset email has been sent.'
    : 'Si un compte correspond à cette adresse, un e-mail sécurisé de réinitialisation a été envoyé.';
}

exports.requestPasswordReset = onRequest({
  region: 'europe-west1',
  cors: [
    'https://kitout3.github.io',
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
  ],
  secrets: [RESEND_API_KEY],
  timeoutSeconds: 30,
  maxInstances: 10
}, async (request, response) => {
  const language = normalizeLanguage(request.body?.language);
  const message = genericResponse(language);

  response.set('Cache-Control', 'no-store');
  response.set('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, message: 'Method not allowed.' });
    return;
  }

  const email = normalizeEmail(request.body?.email);
  const honeypot = String(request.body?.website || '').trim();

  if (honeypot) {
    response.status(200).json({ ok: true, message });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    response.status(400).json({
      ok: false,
      message: language === 'en' ? 'Enter a valid email address.' : 'Renseignez une adresse e-mail valide.'
    });
    return;
  }

  try {
    const ipAllowed = await acquireIpAllowance(requestIp(request));
    const emailAllowed = await acquireEmailCooldown(email);

    if (!ipAllowed || !emailAllowed) {
      response.status(429).json({
        ok: false,
        message: language === 'en'
          ? 'A request was recently sent. Wait one minute before trying again.'
          : 'Une demande a été envoyée récemment. Attendez une minute avant de réessayer.'
      });
      return;
    }

    let user;
    try {
      user = await getAuth().getUserByEmail(email);
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        await new Promise(resolve => setTimeout(resolve, 250));
        response.status(200).json({ ok: true, message });
        return;
      }
      throw error;
    }

    const firebaseLink = await getAuth().generatePasswordResetLink(email);
    const resetUrl = customResetUrl(firebaseLink, language);
    const content = emailContent({
      language,
      displayName: user.displayName || '',
      resetUrl
    });

    const actionUrl = new URL(resetUrl);
    const oobCode = actionUrl.searchParams.get('oobCode') || crypto.randomUUID();

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `password-reset-${sha256(oobCode).slice(0, 32)}`
      },
      body: JSON.stringify({
        from: PASSWORD_RESET_FROM.value(),
        to: [email],
        subject: content.subject,
        html: content.html,
        text: content.text,
        headers: {
          'X-Entity-Ref-ID': sha256(oobCode).slice(0, 24)
        }
      })
    });

    const result = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      throw new Error(result.message || result.error || `Resend HTTP ${resendResponse.status}`);
    }

    console.info('E-mail de réinitialisation envoyé.', {
      uid: user.uid,
      providerMessageId: result.id || null,
      language
    });

    response.status(200).json({ ok: true, message });
  } catch (error) {
    console.error('Envoi du mot de passe QuizLive impossible :', error);
    response.status(503).json({
      ok: false,
      message: language === 'en'
        ? 'The reset service is temporarily unavailable. Please try again later.'
        : 'Le service de réinitialisation est temporairement indisponible. Réessayez plus tard.'
    });
  }
});

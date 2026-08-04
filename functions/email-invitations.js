const { onValueCreated } = require('firebase-functions/v2/database');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getDatabase } = require('firebase-admin/database');

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const RESEND_FROM = defineString('RESEND_FROM', {
  default: 'QuizLive <onboarding@resend.dev>'
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

exports.sendEnterpriseInvitation = onValueCreated({
  ref: '/emailQueue/{queueId}',
  instance: 'quizlive-app-default-rtdb',
  region: 'europe-west1',
  secrets: [RESEND_API_KEY],
  retry: false,
  maxInstances: 10
}, async event => {
  const queueId = event.params.queueId;
  const queueRef = event.data.ref;
  const job = event.data.val() || {};

  if (job.type !== 'enterprise_invitation' || job.status !== 'pending') {
    return null;
  }

  try {
    const required = ['to', 'organizationId', 'organizationName', 'groupName', 'requestedBy', 'joinUrl'];
    for (const field of required) {
      if (!job[field]) throw new Error(`Champ obligatoire manquant : ${field}`);
    }

    const ownerSnap = await getDatabase()
      .ref(`organizations/${job.organizationId}/ownerUid`)
      .once('value');

    if (ownerSnap.val() !== job.requestedBy) {
      throw new Error('La demande ne provient pas du propriétaire de l’organisation.');
    }

    const organizationName = escapeHtml(job.organizationName);
    const groupName = escapeHtml(job.groupName);
    const joinUrl = escapeHtml(job.joinUrl);

    const html = `
      <!doctype html>
      <html lang="fr">
        <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr><td align="center" style="padding:32px 16px">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(20,32,60,.08)">
                <tr><td style="padding:28px 32px;background:linear-gradient(135deg,#5b5cf0,#8146e8);color:#fff">
                  <div style="font-size:24px;font-weight:700">⚡ QuizLive</div>
                </td></tr>
                <tr><td style="padding:34px 32px">
                  <h1 style="margin:0 0 18px;font-size:26px">Invitation à rejoindre ${organizationName}</h1>
                  <p style="margin:0 0 14px;line-height:1.6">Vous avez été invité à rejoindre le groupe <strong>${groupName}</strong> sur QuizLive.</p>
                  <p style="margin:0 0 26px;line-height:1.6">Connectez-vous ou créez votre compte avec cette adresse e-mail. Votre accès au groupe sera activé automatiquement.</p>
                  <a href="${joinUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#5b5cf0;color:#fff;text-decoration:none;font-weight:700">Rejoindre l’organisation</a>
                  <p style="margin:28px 0 0;color:#6d7588;font-size:13px;line-height:1.5">Cette invitation est personnelle. Si vous ne connaissez pas cette organisation, ignorez ce message.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `enterprise-invite-${queueId}`
      },
      body: JSON.stringify({
        from: RESEND_FROM.value(),
        to: [String(job.to).trim().toLowerCase()],
        subject: `${job.organizationName} vous invite sur QuizLive`,
        html
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || result.error || `Resend HTTP ${response.status}`);
    }

    await queueRef.update({
      status: 'sent',
      provider: 'resend',
      providerMessageId: result.id || null,
      sentAt: Date.now(),
      error: null
    });

    return result;
  } catch (error) {
    console.error('Envoi invitation Enterprise impossible :', error);
    await queueRef.update({
      status: 'error',
      error: String(error.message || error).slice(0, 1000),
      failedAt: Date.now()
    });
    return null;
  }
});

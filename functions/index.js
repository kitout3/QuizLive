const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const Stripe = require('stripe');

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });
initializeApp();

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const STRIPE_PRICE_PRO = defineString('STRIPE_PRICE_PRO');
const STRIPE_PRICE_BUSINESS = defineString('STRIPE_PRICE_BUSINESS');
const STRIPE_PRICE_ENTERPRISE = defineString('STRIPE_PRICE_ENTERPRISE');
const APP_URL = defineString('APP_URL', { default: 'https://kitout3.github.io/QuizLive' });

const PLAN_LIMITS = Object.freeze({
  free: 10,
  pro: 50,
  business: 200,
  enterprise: 500
});

function stripeClient() {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

function priceForPlan(plan) {
  const map = {
    pro: STRIPE_PRICE_PRO.value(),
    business: STRIPE_PRICE_BUSINESS.value(),
    enterprise: STRIPE_PRICE_ENTERPRISE.value()
  };
  return map[plan] || '';
}

async function findUidByCustomer(customerId) {
  const snap = await getDatabase().ref('stripeCustomers').child(customerId).once('value');
  return snap.val()?.uid || null;
}

async function writeSubscription(uid, data) {
  const plan = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, data.plan) ? data.plan : 'free';
  const participantLimit = PLAN_LIMITS[plan];
  const now = Date.now();
  const updates = {};
  updates[`subscriptions/${uid}`] = {
    plan,
    status: data.status || 'inactive',
    participantLimit,
    stripeCustomerId: data.stripeCustomerId || null,
    stripeSubscriptionId: data.stripeSubscriptionId || null,
    priceId: data.priceId || null,
    currentPeriodEnd: data.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    updatedAt: now
  };
  updates[`organizers/${uid}/plan`] = plan;
  updates[`organizers/${uid}/participantLimit`] = participantLimit;
  updates[`organizers/${uid}/subscriptionStatus`] = data.status || 'inactive';
  updates[`organizers/${uid}/updatedAt`] = now;
  await getDatabase().ref().update(updates);

  await getAuth().setCustomUserClaims(uid, {
    plan,
    participantLimit,
    subscriber: ['active', 'trialing'].includes(data.status)
  });
}

exports.createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion organisateur requise.');

  const plan = String(request.data?.plan || '').toLowerCase();
  if (!['pro', 'business', 'enterprise'].includes(plan)) {
    throw new HttpsError('invalid-argument', 'Abonnement invalide.');
  }

  const priceId = priceForPlan(plan);
  if (!priceId) throw new HttpsError('failed-precondition', `Le tarif Stripe ${plan} n’est pas configuré.`);

  const stripe = stripeClient();
  const user = await getAuth().getUser(uid);
  const customerSnap = await getDatabase().ref(`subscriptions/${uid}/stripeCustomerId`).once('value');
  let customerId = customerSnap.val();

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: user.displayName || undefined,
      metadata: { firebaseUid: uid }
    });
    customerId = customer.id;
    await getDatabase().ref().update({
      [`stripeCustomers/${customerId}`]: { uid, createdAt: Date.now() },
      [`subscriptions/${uid}/stripeCustomerId`]: customerId
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: uid,
    metadata: { firebaseUid: uid, plan },
    subscription_data: { metadata: { firebaseUid: uid, plan } },
    success_url: `${APP_URL.value()}/index.html?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL.value()}/index.html?billing=cancelled`
  });

  return { url: session.url };
});

exports.createBillingPortalSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion organisateur requise.');

  const snap = await getDatabase().ref(`subscriptions/${uid}/stripeCustomerId`).once('value');
  const customerId = snap.val();
  if (!customerId) throw new HttpsError('failed-precondition', 'Aucun abonnement Stripe trouvé.');

  const portal = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL.value()}/index.html`
  });
  return { url: portal.url };
});

exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(
      req.rawBody,
      req.headers['stripe-signature'],
      STRIPE_WEBHOOK_SECRET.value()
    );
  } catch (error) {
    res.status(400).send(`Webhook invalide: ${error.message}`);
    return;
  }

  try {
    const object = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const uid = object.client_reference_id || object.metadata?.firebaseUid;
      if (uid && object.customer) {
        await getDatabase().ref(`stripeCustomers/${object.customer}`).set({ uid, createdAt: Date.now() });
      }
    }

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = object;
      const customerId = String(subscription.customer);
      const uid = subscription.metadata?.firebaseUid || await findUidByCustomer(customerId);
      if (uid) {
        const plan = subscription.metadata?.plan || 'free';
        const active = ['active', 'trialing'].includes(subscription.status);
        await writeSubscription(uid, {
          plan: active ? plan : 'free',
          status: subscription.status,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          priceId: subscription.items?.data?.[0]?.price?.id || null,
          currentPeriodEnd: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end
        });
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const customerId = String(object.customer);
      const uid = await findUidByCustomer(customerId);
      if (uid) {
        await getDatabase().ref(`subscriptions/${uid}`).update({
          status: 'past_due',
          updatedAt: Date.now()
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erreur de traitement du webhook.');
  }
});

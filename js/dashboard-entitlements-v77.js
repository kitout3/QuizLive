// QuizLive — droits effectifs du compte et du tableau de bord.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const PLAN_KEYS = new Set(['free', 'pro', 'business', 'enterprise']);
  const PLAN_LIMITS = { free: 10, pro: 50, business: 200, enterprise: 500 };
  const INVALID_STATUSES = new Set(['inactive', 'canceled', 'cancelled', 'expired', 'unpaid']);
  const cache = new Map();

  const emptyResult = user => ({
    uid: user?.uid || '',
    subscription: {},
    subscriptionExists: false,
    subscriptionValid: false,
    subscribedPlan: 'free',
    effectivePlan: 'free',
    participantLimit: PLAN_LIMITS.free,
    hasEnterpriseWorkspace: false,
    organizationId: '',
    groupIds: [],
    organizationLink: {},
    membership: {},
    groups: []
  });

  const normalize = value => String(value || '').trim().toLowerCase();

  function subscriptionIsValid(subscription) {
    if (!subscription || typeof subscription !== 'object' || !Object.keys(subscription).length) return false;
    const plan = normalize(subscription.plan);
    const status = normalize(subscription.status);
    return PLAN_KEYS.has(plan) && !INVALID_STATUSES.has(status);
  }

  function idsFrom(value) {
    const ids = new Set();
    if (value?.groupId) ids.add(String(value.groupId));
    Object.entries(value?.groupIds || {}).forEach(([id, enabled]) => {
      if (enabled === true) ids.add(String(id));
    });
    return ids;
  }

  async function resolveWorkspace(user, links) {
    const entries = Object.entries(links || {});

    for (const [organizationId, reverseLink] of entries) {
      try {
        // La lecture de sa propre adhésion réussit uniquement lorsque le lien
        // d’organisation est encore réellement autorisé par les règles Firebase.
        const membershipSnap = await db
          .ref(`organizationMembers/${organizationId}/${user.uid}`)
          .once('value');
        const membership = membershipSnap.val() || {};
        if (!membershipSnap.exists()) continue;

        const candidateIds = idsFrom(reverseLink);
        idsFrom(membership).forEach(id => candidateIds.add(id));

        const isOwner = membership.role === 'owner' || reverseLink?.role === 'owner';
        let groups = [];

        if (isOwner) {
          const groupsSnap = await db.ref(`organizationGroups/${organizationId}`).once('value');
          groups = Object.entries(groupsSnap.val() || {})
            .map(([id, value]) => ({ id, ...value }))
            .filter(group => group.active !== false);
        } else {
          const snapshots = await Promise.all(
            Array.from(candidateIds).map(async groupId => {
              try {
                const snap = await db.ref(`organizationGroups/${organizationId}/${groupId}`).once('value');
                const value = snap.val();
                return value && value.active !== false ? { id: groupId, ...value } : null;
              } catch (_) {
                return null;
              }
            })
          );
          groups = snapshots.filter(Boolean);
        }

        if (!groups.length) continue;

        return {
          hasEnterpriseWorkspace: true,
          organizationId,
          groupIds: groups.map(group => group.id),
          organizationLink: reverseLink || {},
          membership,
          groups
        };
      } catch (_) {
        // Un lien inverse périmé ne doit ni afficher l’espace entreprise,
        // ni produire un permission_denied dans l’interface.
      }
    }

    return {
      hasEnterpriseWorkspace: false,
      organizationId: '',
      groupIds: [],
      organizationLink: {},
      membership: {},
      groups: []
    };
  }

  async function synchronizeProfile(user, result) {
    try {
      const updates = {
        plan: result.effectivePlan,
        enterpriseMember: result.hasEnterpriseWorkspace,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };

      if (result.hasEnterpriseWorkspace) updates.defaultOrganizationId = result.organizationId;
      else updates.defaultOrganizationId = null;

      await db.ref(`organizers/${user.uid}`).update(updates);
    } catch (error) {
      console.warn('Synchronisation du plan effectif impossible :', error);
    }
  }

  async function resolve(user = auth.currentUser, force = false) {
    if (!user || user.isAnonymous) return emptyResult(user);
    if (!force && cache.has(user.uid)) return cache.get(user.uid);

    const pending = (async () => {
      const [subscriptionSnap, linksSnap] = await Promise.all([
        db.ref(`subscriptions/${user.uid}`).once('value'),
        db.ref(`userOrganizations/${user.uid}`).once('value')
      ]);

      const subscription = subscriptionSnap.val() || {};
      const subscriptionValid = subscriptionIsValid(subscription);
      const subscribedPlan = subscriptionValid ? normalize(subscription.plan) : 'free';
      const workspace = await resolveWorkspace(user, linksSnap.val() || {});

      // Un membre d’un groupe Enterprise hérite de l’offre Enterprise.
      // Sans groupe Enterprise valide, un ancien profil ou un abonnement Enterprise
      // isolé ne suffit pas. Pro et Business exigent un abonnement valide.
      let effectivePlan = 'free';
      if (workspace.hasEnterpriseWorkspace) effectivePlan = 'enterprise';
      else if (subscriptionValid && subscribedPlan !== 'enterprise') effectivePlan = subscribedPlan;

      const result = {
        uid: user.uid,
        subscription,
        subscriptionExists: subscriptionSnap.exists(),
        subscriptionValid,
        subscribedPlan,
        effectivePlan,
        participantLimit: PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.free,
        ...workspace
      };

      synchronizeProfile(user, result);
      return result;
    })();

    cache.set(user.uid, pending);
    try {
      const result = await pending;
      cache.set(user.uid, Promise.resolve(result));
      return result;
    } catch (error) {
      cache.delete(user.uid);
      console.warn('Résolution des droits du compte impossible :', error);
      return emptyResult(user);
    }
  }

  function clear(userId) {
    if (userId) cache.delete(userId);
    else cache.clear();
  }

  function applyEnterpriseNavigation(entitlements) {
    const visible = entitlements?.hasEnterpriseWorkspace === true;
    document
      .querySelectorAll('[data-section="organization"], [data-stage3-section="organization"]')
      .forEach(button => {
        button.hidden = !visible;
        button.style.display = visible ? '' : 'none';
        button.setAttribute('aria-hidden', String(!visible));
        button.tabIndex = visible ? 0 : -1;
      });
    return visible;
  }

  window.QuizLiveEntitlements = {
    version: '77',
    resolve,
    clear,
    applyEnterpriseNavigation,
    limitForPlan: plan => PLAN_LIMITS[normalize(plan)] || PLAN_LIMITS.free
  };

  window.addEventListener('quizlive-enterprise-membership-ready', () => clear(auth.currentUser?.uid));
})();

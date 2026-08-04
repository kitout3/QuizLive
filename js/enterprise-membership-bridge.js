(() => {
  'use strict';
  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    try {
      const organizations = await database.ref(`userOrganizations/${user.uid}`).once('value');
      const enterpriseMembership = Object.values(organizations.val() || {}).some(item => item?.plan === 'enterprise');
      if (!enterpriseMembership) return;
      const profile = await database.ref(`organizers/${user.uid}`).once('value');
      if (profile.child('plan').val() !== 'enterprise') {
        await database.ref(`organizers/${user.uid}`).update({
          plan: 'enterprise',
          enterpriseMember: true,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch (error) {
      console.warn('Synchronisation espace entreprise impossible :', error);
    }
  });
})();
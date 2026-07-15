/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Import and configure the Firebase SDK inside the service worker
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDrJ-P7Dp4T5ayraUs9Nev-rU08JI6RvRg",
  authDomain: "pagarbook-b7ad8.firebaseapp.com",
  projectId: "pagarbook-b7ad8",
  storageBucket: "pagarbook-b7ad8.firebasestorage.app",
  messagingSenderId: "94603138361",
  appId: "1:94603138361:web:428261179814fd217384e8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || 'સનશાઇન પગાર બુક';
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://img.icons8.com/color/192/ledger.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

const API_URL = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || '') : '';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BPIqG4zf_oqPqUVNUlBxzKioQEdqhlNrfuoP2DuzvyJezEi2jXhyIgSIzq7FYn7kknvv_c7qBmzx682NOprC38Q';

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported. If on iOS, please update your OS.');
  }
  if (!('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser. If on iOS, please install this app to your Home Screen using the Share button first.');
  }

  const registration = await navigator.serviceWorker.register('/service-worker.js');
  
  const subscribeOptions = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  };

  const pushSubscription = await registration.pushManager.subscribe(subscribeOptions);
  
  const token = localStorage.getItem('dekho_token');
  
  await fetch(`${API_URL}/api/v1/push/subscribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(pushSubscription)
  });

  return pushSubscription;
}

export async function getNotifications() {
  const token = localStorage.getItem('dekho_token');
  const res = await fetch(`${API_URL}/api/v1/notifications`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(id: string) {
  const token = localStorage.getItem('dekho_token');
  const res = await fetch(`${API_URL}/api/v1/notifications/${id}/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to mark read');
  return res.json();
}

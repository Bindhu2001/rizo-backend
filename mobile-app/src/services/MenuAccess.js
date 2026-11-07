import { useEffect, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';

// The Requests / Approvals menus, from newapp/allocate_menus `menus` — the same on both servers (OVH legacy menus,
// DigitalOcean rizo-revamp menus), one state per menu key:
//   Y  = on for this employee
//   N  = switched off for this employee (Menu Allocation), or no team to approve for
//   NA = this company's server has no such menu
// Kept per user in AsyncStorage so the tabs come up the same offline. An older server sends only `data` (the two
// approval menus); every request menu then stays open, as it always has been.

const cacheKey = (userId) => `menu_access_${userId}`;

let current = { userId: null, menus: null };
const listeners = new Set();

const publish = (userId, menus) => {
  current = { userId, menus };
  listeners.forEach((l) => l(current));
};

const menusOf = (body) => {
  if (body?.menus) return body.menus;
  const data = body?.data || {};
  return {
    'approvals.leave': data['Team Leave Requests'] === 'Y' ? 'Y' : 'N',
    'approvals.regularisation': data['Approve/Reject Regularisation'] === 'Y' ? 'Y' : 'N',
  };
};

export const loadMenuAccess = async (userId) => {
  if (!userId) return;
  if (current.userId !== userId) {
    let cached = null;
    try { cached = JSON.parse((await AsyncStorage.getItem(cacheKey(userId))) || 'null'); } catch (_) {}
    publish(userId, cached);
  }
  try {
    const res = await axios.post(API_ENDPOINTS.ALLOCATE_MENUS, { user_id: userId }, { timeout: 12000 });
    if (res.data && (res.data.success == 1 || res.data.success === true)) {
      const menus = menusOf(res.data);
      publish(userId, menus);
      try { await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(menus)); } catch (_) {}
    }
  } catch (_) { /* offline — keep the cached menus */ }
};

// The menus of this user, updated whenever any screen reloads them (null until known)
export const useMenuAccess = (userId) => {
  const [menus, setMenus] = useState(current.userId === userId ? current.menus : null);
  useEffect(() => {
    const listener = (c) => { if (c.userId === userId) setMenus(c.menus); };
    listeners.add(listener);
    if (current.userId === userId) setMenus(current.menus);
    return () => { listeners.delete(listener); };
  }, [userId]);
  return menus;
};

// What the app does with a menu item: 'on' opens it; 'soon' (no screen in this app version, or not on this
// server) and 'off' (switched off for this employee) show it blurred. Not known yet: request menus stay open,
// approval menus wait for the server.
export const menuStatus = (menus, item) => {
  if (!item.route) return 'soon';
  const state = menus?.[item.key];
  if (state === 'Y') return 'on';
  if (state === 'N') return 'off';
  if (state === 'NA') return 'soon';
  return item.key.startsWith('approvals.') ? 'off' : 'on';
};

export const BLURRED_MESSAGE = {
  soon: { title: 'Coming soon', message: 'This will be available in the next version of the app.' },
  off: { title: 'Not enabled', message: 'This menu is not enabled for you. Please contact HR.' },
};

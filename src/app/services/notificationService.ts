import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from './mockDb';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'approval' | 'rejection' | 'feedback' | 'assignment' | 'info';
  read: boolean;
  created_at: string;
  entry_id?: string;
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch {
    const db = getMockDb();
    if (!db.notifications) db.notifications = [];
    return db.notifications
      .filter((n: any) => n.user_id === userId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
    return count || 0;
  } catch {
    const db = getMockDb();
    if (!db.notifications) return 0;
    return db.notifications.filter((n: any) => n.user_id === userId && !n.read).length;
  }
}

export async function markAsRead(notificationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    if (error) throw error;
  } catch {
    const db = getMockDb();
    if (!db.notifications) return;
    const idx = db.notifications.findIndex((n: any) => n.id === notificationId);
    if (idx !== -1) { db.notifications[idx].read = true; saveMockDb(db); }
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
  } catch {
    const db = getMockDb();
    if (!db.notifications) return;
    db.notifications.forEach((n: any) => { if (n.user_id === userId) n.read = true; });
    saveMockDb(db);
  }
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'] = 'info',
  entryId?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({ user_id: userId, title, message, type, read: false, entry_id: entryId || null });
    if (error) throw error;
  } catch {
    const db = getMockDb();
    if (!db.notifications) db.notifications = [];
    db.notifications.push({
      id: 'notif-' + Date.now(),
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
      entry_id: entryId,
    });
    saveMockDb(db);
  }
}

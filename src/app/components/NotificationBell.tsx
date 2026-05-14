import { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, MessageSquare, UserPlus, Info, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, Notification } from '../services/notificationService';

const typeIcons: Record<string, any> = {
  approval: CheckCircle,
  rejection: XCircle,
  feedback: MessageSquare,
  assignment: UserPlus,
  info: Info,
};

const typeColors: Record<string, string> = {
  approval: 'text-green-600',
  rejection: 'text-red-600',
  feedback: 'text-blue-600',
  assignment: 'text-purple-600',
  info: 'text-gray-600',
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) loadNotifications();
    const interval = setInterval(() => { if (user) loadNotifications(); }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  async function loadNotifications() {
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(user.id),
        getUnreadCount(user.id),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch { /* silent fail */ }
  }

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    await loadNotifications();
  }

  async function handleMarkAllRead() {
    await markAllAsRead(user.id);
    await loadNotifications();
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-medium text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 20).map((notif) => {
                const Icon = typeIcons[notif.type] || Info;
                const color = typeColors[notif.type] || 'text-gray-600';
                return (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => handleMarkRead(notif.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.read ? 'font-medium' : ''}`}>{notif.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{timeAgo(notif.created_at)}</p>
                      </div>
                      {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

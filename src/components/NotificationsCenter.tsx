import React from "react";
import { 
  X, 
  Bell, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Search, 
  RefreshCw, 
  Trash2, 
  CheckCheck,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { AppNotification, ReportStatus } from "../types";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

interface NotificationsCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onClearAll?: () => void;
}

export default function NotificationsCenter({
  isOpen,
  onClose,
  notifications,
  onClearAll
}: NotificationsCenterProps) {
  if (!isOpen) return null;

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), {
        read: true
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const deleteNotification = async (notifId: string) => {
    try {
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const getStatusIcon = (status?: ReportStatus) => {
    switch (status) {
      case "seen":
        return <Eye className="w-4 h-4 text-sky-400" />;
      case "under_review":
        return <Search className="w-4 h-4 text-purple-400" />;
      case "processing":
        return <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />;
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      default:
        return <Bell className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] bg-[#0b0e1e] border border-white/15 rounded-3xl p-5 sm:p-6 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Notifications</h3>
              <p className="text-[10px] font-mono text-slate-400">
                {notifications.length} {notifications.length === 1 ? "Update" : "Updates"} from Admin
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar max-h-[55vh]">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto text-slate-600 mb-1" />
              <p className="text-xs font-bold text-slate-300">No notifications yet</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                When you submit a report or an admin updates your report status, notifications will show up here in real time!
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => !notif.read && markAsRead(notif.id)}
                className={`p-4 rounded-2xl border transition-all relative ${
                  notif.read
                    ? "bg-white/[0.02] border-white/5 opacity-80"
                    : "bg-cyan-500/[0.06] border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                }`}
              >
                {!notif.read && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                )}

                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getStatusIcon(notif.status as ReportStatus)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {notif.title}
                    </h4>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {notif.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                      <span>{new Date(notif.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.createdAt || Date.now()).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/10 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

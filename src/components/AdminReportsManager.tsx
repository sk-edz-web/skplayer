import React, { useState, useRef, useEffect } from "react";
import { 
  ReportItem, 
  ReportStatus 
} from "../types";
import { db } from "../firebase";
import { collection, addDoc, doc, deleteDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Crown,
  User as UserIcon,
  MoreVertical,
  CheckCircle2,
  Clock,
  Eye,
  Search,
  MessageSquare,
  Send,
  Trash2,
  Filter,
  Check,
  X,
  ExternalLink,
  Music,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Layers,
  ChevronRight,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Sliders,
  CheckCheck,
  Bell,
  Phone,
  PhoneCall,
  MessageCircle,
  Copy,
  Mail,
  CheckSquare,
  Square
} from "lucide-react";

interface AdminReportsManagerProps {
  reports: ReportItem[];
  loading: boolean;
  onUpdateStatus: (
    report: ReportItem,
    newStatus: ReportStatus,
    customReply?: string,
    notes?: string
  ) => Promise<void>;
  onDeleteReport: (reportId: string) => Promise<void>;
  onBulkDeleteReports?: (reportIds: string[]) => Promise<void>;
  isUpdating: boolean;
  isDeletingId: string | null;
  onShowToast: (text: string, type?: "success" | "info" | "error") => void;
}

export default function AdminReportsManager({
  reports,
  loading,
  onUpdateStatus,
  onDeleteReport,
  onBulkDeleteReports,
  isUpdating,
  isDeletingId,
  onShowToast
}: AdminReportsManagerProps) {
  // Filter and Search States
  const [subTab, setSubTab] = useState<"priority" | "normal" | "contacts" | "all">("priority");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Multi-Selection and Bulk Delete States
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
    count: number;
  } | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    onShowToast(`Copied ${label} to clipboard! 📋`, "info");
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Modal and Dropdown States
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [modalNewStatus, setModalNewStatus] = useState<ReportStatus>("open");
  const [adminReplyText, setAdminReplyText] = useState<string>("");
  const [adminNotesText, setAdminNotesText] = useState<string>("");

  // Direct Notification Dialog States
  const [directNotifReport, setDirectNotifReport] = useState<ReportItem | null>(null);
  const [directNotifTitle, setDirectNotifTitle] = useState<string>("");
  const [directNotifMessage, setDirectNotifMessage] = useState<string>("");
  const [isSendingNotif, setIsSendingNotif] = useState<boolean>(false);

  const NOTIF_PRESETS = [
    {
      id: "audio_fixed",
      label: "🎧 Audio Glitch Fixed",
      title: "Audio Issue Resolved 🎧",
      message: "The sound glitch/audio quality on your reported track has been resolved! High-fidelity 320kbps audio is now live in the player."
    },
    {
      id: "song_added",
      label: "🎵 Song Added to Library",
      title: "Song Added to skplayer 🎵",
      message: "Your requested song has been successfully added to our track library! Search and enjoy streaming anytime."
    },
    {
      id: "vip_activated",
      label: "👑 VIP Gold Status Activated",
      title: "VIP Gold Access Active 👑",
      message: "Your VIP Gold pass has been verified and applied to your account. Enjoy exclusive subwoofer bass boost & lossless sound!"
    },
    {
      id: "issue_done",
      label: "✅ Issue Resolved",
      title: "Report Resolved ✅",
      message: "Thank you for reporting this issue. Our administrator has investigated and successfully deployed the fix!"
    },
    {
      id: "in_progress",
      label: "⚙️ Currently Working On It",
      title: "We are on it! ⚙️",
      message: "Administrator is actively investigating and working on the fix for the issue you reported."
    }
  ];

  // Long press timer ref
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".report-dropdown-wrapper")) {
        setActiveDropdownId(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // When selected report changes, update modal inputs
  useEffect(() => {
    if (selectedReport) {
      setModalNewStatus(selectedReport.status || "open");
      setAdminReplyText(selectedReport.adminReply || "");
      setAdminNotesText(selectedReport.adminNotes || "");
    }
  }, [selectedReport]);

  // Priority detection: VIP user or explicitly tagged VIP priority
  const isVipReport = (report: ReportItem): boolean => {
    return Boolean(
      report.isVIP === true || 
      report.priority === "vip" || 
      (report.proKey && report.proKey.trim().length > 0) ||
      (report.userEmail && (
        report.userEmail.toLowerCase().includes("vip") ||
        report.userEmail.toLowerCase().includes("gold") ||
        report.userEmail.toLowerCase().includes("pro")
      )) ||
      (report.userName && (
        report.userName.toLowerCase().includes("vip") ||
        report.userName.toLowerCase().includes("gold")
      ))
    );
  };

  // Open Direct Notification Modal
  const handleOpenDirectNotif = (report: ReportItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveDropdownId(null);
    setDirectNotifReport(report);
    const isVip = isVipReport(report);
    setDirectNotifTitle(`Update regarding your ${report.category || "issue"} report 🔔`);
    setDirectNotifMessage(
      `Hello ${report.userName || (isVip ? "VIP Member" : "Listener")}! We have reviewed your report "${report.title || report.category || "Issue"}".`
    );
  };

  // Dispatch Direct Notification ONLY to this specific User
  const handleSendDirectNotification = async () => {
    if (!directNotifReport) return;
    const targetUserId = directNotifReport.userId;
    if (!targetUserId) {
      onShowToast("Cannot send notification: Report has no user ID associated.", "error");
      return;
    }
    if (!directNotifMessage.trim()) {
      onShowToast("Please enter a notification message.", "error");
      return;
    }

    setIsSendingNotif(true);
    try {
      await addDoc(collection(db, "notifications"), {
        userId: targetUserId,
        reportId: directNotifReport.id,
        title: directNotifTitle.trim() || "Admin Notification 🔔",
        message: directNotifMessage.trim(),
        status: directNotifReport.status || "open",
        type: "report_update",
        read: false,
        createdAt: Date.now()
      });

      onShowToast(`Notification dispatched directly to ${directNotifReport.userName || "User"}! 🚀`, "success");
      setDirectNotifReport(null);
    } catch (err: any) {
      console.error("Failed to send direct notification:", err);
      onShowToast(`Failed to send notification: ${err.message || "Error"}`, "error");
    } finally {
      setIsSendingNotif(false);
    }
  };

  // Bulk Selection Helpers
  const handleToggleSelectReport = (reportId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedReportIds((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredReports.map((r) => r.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedReportIds.includes(id));
    if (areAllSelected) {
      setSelectedReportIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedReportIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleDeselectAll = () => {
    setSelectedReportIds([]);
  };

  // Execute Bulk Delete
  const executeBulkDelete = async (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (onBulkDeleteReports) {
        await onBulkDeleteReports(idsToDelete);
      } else {
        const promises = idsToDelete.map((id) => deleteDoc(doc(db, "reports", id)));
        await Promise.all(promises);
        onShowToast(`Successfully deleted ${idsToDelete.length} reports! 🗑️`, "success");
      }
      setSelectedReportIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      setConfirmDeleteModal(null);
    } catch (err: any) {
      console.error("Bulk delete failed:", err);
      onShowToast(`Failed to delete reports: ${err.message || "Error"}`, "error");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Trigger Modal for Selected Delete
  const requestDeleteSelected = () => {
    if (selectedReportIds.length === 0) return;
    setConfirmDeleteModal({
      open: true,
      title: "Delete Selected Reports",
      description: `Are you sure you want to permanently delete ${selectedReportIds.length} selected report(s)? This action cannot be undone.`,
      count: selectedReportIds.length,
      action: () => executeBulkDelete(selectedReportIds)
    });
  };

  // Trigger Modal for All Resolved (Done) Delete
  const requestDeleteAllResolved = () => {
    const resolvedIds = reports.filter((r) => r.status === "done").map((r) => r.id);
    if (resolvedIds.length === 0) {
      onShowToast("No resolved (Done) reports found to delete.", "info");
      return;
    }
    setConfirmDeleteModal({
      open: true,
      title: "Delete All Resolved Reports",
      description: `Are you sure you want to permanently delete all ${resolvedIds.length} resolved (Done) reports?`,
      count: resolvedIds.length,
      action: () => executeBulkDelete(resolvedIds)
    });
  };

  // Trigger Modal for All Reports Delete
  const requestDeleteAllReports = () => {
    if (reports.length === 0) {
      onShowToast("No reports found to delete.", "info");
      return;
    }
    setConfirmDeleteModal({
      open: true,
      title: "Delete ALL Reports in Database",
      description: `WARNING: This will permanently delete ALL ${reports.length} report documents from Firestore. Are you sure you want to clear everything?`,
      count: reports.length,
      action: () => executeBulkDelete(reports.map((r) => r.id))
    });
  };

  // Helper to check if a report is a contact/call/message request or has phone
  const isContactRequest = (r: ReportItem) => {
    return !!r.userPhone || r.requestType === "call_request" || r.requestType === "message_request" || !!r.contactPreference;
  };

  // Filter reports
  const filteredReports = reports.filter((r) => {
    const isVip = isVipReport(r);
    const isContact = isContactRequest(r);

    // Sub-tab filter (Priority vs Normal vs Contacts vs All)
    if (subTab === "priority" && !isVip) return false;
    if (subTab === "normal" && isVip) return false;
    if (subTab === "contacts" && !isContact) return false;

    // Status filter
    if (statusFilter !== "all" && r.status !== statusFilter) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchEmail = (r.userEmail || "").toLowerCase().includes(q);
      const matchPhone = (r.userPhone || "").toLowerCase().includes(q);
      const matchName = (r.userName || "").toLowerCase().includes(q);
      const matchDesc = (r.description || "").toLowerCase().includes(q);
      const matchTitle = (r.title || "").toLowerCase().includes(q);
      const matchSong = (r.songTitle || "").toLowerCase().includes(q);
      const matchCat = (r.category || "").toLowerCase().includes(q);
      const matchId = (r.id || "").toLowerCase().includes(q);
      if (!matchEmail && !matchPhone && !matchName && !matchDesc && !matchTitle && !matchSong && !matchCat && !matchId) {
        return false;
      }
    }

    return true;
  });

  // Calculate statistics
  const totalCount = reports.length;
  const vipCount = reports.filter(isVipReport).length;
  const normalCount = reports.filter((r) => !isVipReport(r)).length;
  const contactsCount = reports.filter(isContactRequest).length;
  const openCount = reports.filter((r) => r.status === "open").length;
  const seenCount = reports.filter((r) => r.status === "seen").length;
  const underReviewCount = reports.filter((r) => r.status === "under_review").length;
  const processingCount = reports.filter((r) => r.status === "processing").length;
  const doneCount = reports.filter((r) => r.status === "done").length;

  // Status appearance helpers
  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case "open":
        return {
          label: "Open",
          labelEnglish: "Open",
          className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: Clock
        };
      case "seen":
        return {
          label: "Seen",
          labelEnglish: "Seen",
          className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
          icon: Eye
        };
      case "under_review":
        return {
          label: "Under Review",
          labelEnglish: "Under Review",
          className: "bg-purple-500/15 text-purple-300 border-purple-500/30",
          icon: Search
        };
      case "processing":
        return {
          label: "Processing",
          labelEnglish: "Processing",
          className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse",
          icon: RefreshCw
        };
      case "done":
        return {
          label: "Done",
          labelEnglish: "Resolved",
          className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          icon: CheckCircle2
        };
      default:
        return {
          label: "Open",
          labelEnglish: "Open",
          className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
          icon: Clock
        };
    }
  };

  // Long press gesture listeners
  const handleTouchStart = (report: ReportItem) => {
    isLongPressActiveRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setSelectedReport(report);
      if (navigator.vibrate) {
        try { navigator.vibrate(60); } catch (_) {}
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (report: ReportItem) => {
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }
    setSelectedReport(report);
  };

  // Quick Action Click Handler from 3-dot menu or card
  const handleQuickStatusChange = async (
    e: React.MouseEvent,
    report: ReportItem,
    status: ReportStatus
  ) => {
    e.stopPropagation();
    setActiveDropdownId(null);
    await onUpdateStatus(report, status);
  };

  // Modal Save Handler
  const handleModalSave = async () => {
    if (!selectedReport) return;
    await onUpdateStatus(
      selectedReport,
      modalNewStatus,
      adminReplyText,
      adminNotesText
    );
    // Keep updated or close
    setSelectedReport((prev) => prev ? {
      ...prev,
      status: modalNewStatus,
      adminReply: adminReplyText,
      adminNotes: adminNotesText,
      updatedAt: Date.now()
    } : null);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* 1. Header Overview & Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
        {/* Total */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Reports</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-white">{totalCount}</span>
            <span className="text-[10px] font-mono text-slate-500">All Time</span>
          </div>
        </div>

        {/* Contact & Call Requests */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between shadow-[0_0_20px_rgba(16,185,129,0.1)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">📞 Calls / Msg</span>
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-emerald-300">{contactsCount}</span>
            <span className="text-[10px] font-mono text-emerald-400/80">User Requests</span>
          </div>
        </div>

        {/* VIP Priority */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between shadow-[0_0_20px_rgba(245,158,11,0.1)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">👑 VIP Priority</span>
            <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-amber-300">{vipCount}</span>
            <span className="text-[10px] font-mono text-amber-400/80">VIP Users</span>
          </div>
        </div>

        {/* Open */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">📩 Open / New</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-amber-400">{openCount}</span>
            <span className="text-[10px] font-mono text-slate-500">Pending</span>
          </div>
        </div>

        {/* Seen */}
        <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider">👀 Seen</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-sky-300">{seenCount}</span>
            <span className="text-[10px] font-mono text-slate-500">Acknowledged</span>
          </div>
        </div>

        {/* In Review / Processing */}
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">⚙️ Processing</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-cyan-300">{underReviewCount + processingCount}</span>
            <span className="text-[10px] font-mono text-slate-500">In Progress</span>
          </div>
        </div>

        {/* Resolved */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 backdrop-blur-xl flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">✅ Resolved</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-black text-emerald-400">{doneCount}</span>
            <span className="text-[10px] font-mono text-slate-500">Done</span>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Controls: Sub-Tabs & Filters */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-2xl space-y-6">
        
        {/* Priority vs Normal vs Contacts vs All Sub-Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div className="flex flex-wrap gap-2 p-1.5 bg-black/30 border border-white/10 rounded-2xl">
            {/* VIP Priority Tab */}
            <button
              onClick={() => setSubTab("priority")}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
                subTab === "priority"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-[1.02]"
                  : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>👑 VIP Priority</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                subTab === "priority" ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-300"
              }`}>
                {vipCount}
              </span>
            </button>

            {/* Contact & Call Requests Tab */}
            <button
              onClick={() => setSubTab("contacts")}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
                subTab === "contacts"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-[1.02]"
                  : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>📞 Contact Requests</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                subTab === "contacts" ? "bg-white/20 text-white" : "bg-emerald-500/20 text-emerald-300"
              }`}>
                {contactsCount}
              </span>
            </button>

            {/* Normal / Non-VIP Tab */}
            <button
              onClick={() => setSubTab("normal")}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
                subTab === "normal"
                  ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] scale-[1.02]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Normal Reports</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                subTab === "normal" ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"
              }`}>
                {normalCount}
              </span>
            </button>

            {/* All Reports Tab */}
            <button
              onClick={() => setSubTab("all")}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
                subTab === "all"
                  ? "bg-white/15 text-white shadow-md border border-white/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>All ({totalCount})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user, issue, song..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-white/10 focus:border-cyan-400/60 rounded-xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-400/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-mono text-slate-400 uppercase flex items-center space-x-1.5 mr-2">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Status:</span>
          </span>

          {[
            { id: "all", label: "All Statuses", count: subTab === "priority" ? vipCount : subTab === "normal" ? normalCount : totalCount },
            { id: "open", label: "Open 📩", count: openCount },
            { id: "seen", label: "Seen 👀", count: seenCount },
            { id: "under_review", label: "Under Review 🔍", count: underReviewCount },
            { id: "processing", label: "Processing ⚙️", count: processingCount },
            { id: "done", label: "Done ✅", count: doneCount }
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all flex items-center space-x-1.5 ${
                statusFilter === chip.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                  : "bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10"
              }`}
            >
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Reports List Container */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-cyan-400" />
              <span>
                {subTab === "priority"
                  ? "VIP Priority Reports Queue"
                  : subTab === "normal"
                  ? "Standard User Reports"
                  : subTab === "contacts"
                  ? "Call & Contact Requests"
                  : "All Incident Reports"}
              </span>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                {filteredReports.length} {filteredReports.length === 1 ? "Report" : "Reports"}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select reports for bulk actions, click cards for full details, or use instant delete on any item.
            </p>
          </div>

          {/* Quick Bulk Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {doneCount > 0 && (
              <button
                type="button"
                onClick={requestDeleteAllResolved}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all"
                title="Delete all resolved reports marked as Done"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Clear Done ({doneCount})</span>
              </button>
            )}

            {reports.length > 0 && (
              <button
                type="button"
                onClick={requestDeleteAllReports}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all"
                title="Delete all reports from database"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All ({reports.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Bulk Selection Management Bar */}
        {filteredReports.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[0.02] border border-white/10 rounded-2xl">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="flex items-center space-x-2 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
              >
                {filteredReports.length > 0 && filteredReports.every((r) => selectedReportIds.includes(r.id)) ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
                <span>
                  {filteredReports.every((r) => selectedReportIds.includes(r.id))
                    ? "Deselect All Filtered"
                    : `Select All Filtered (${filteredReports.length})`}
                </span>
              </button>

              {selectedReportIds.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold">
                  {selectedReportIds.length} Selected
                </span>
              )}
            </div>

            {selectedReportIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-mono transition-all"
                >
                  Clear Selection
                </button>

                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={requestDeleteSelected}
                  className="px-4 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] disabled:opacity-50"
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({selectedReportIds.length})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
            <p className="text-sm font-mono text-slate-400">Loading and syncing reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3 text-slate-500">
              <CheckCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">No reports found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {searchQuery
                ? `No reports match your search query "${searchQuery}".`
                : subTab === "priority"
                ? "No VIP priority reports in the queue right now. Great job!"
                : "No standard reports match this filter."}
            </p>
          </div>
        ) : (
          /* Report Cards Grid */
          <div className="grid grid-cols-1 gap-4">
            {filteredReports.map((report) => {
              const isVip = isVipReport(report);
              const badge = getStatusBadge(report.status || "open");
              const StatusIcon = badge.icon;
              const isDropdownOpen = activeDropdownId === report.id;
              const isSelected = selectedReportIds.includes(report.id);

              return (
                <div
                  key={report.id}
                  onTouchStart={() => handleTouchStart(report)}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={() => handleTouchStart(report)}
                  onMouseUp={handleTouchEnd}
                  onClick={() => handleCardClick(report)}
                  className={`relative rounded-2xl p-5 border transition-all duration-300 cursor-pointer select-none group ${
                    isSelected
                      ? "bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                      : isVip
                      ? "bg-gradient-to-br from-amber-500/[0.07] via-yellow-600/[0.03] to-transparent border-amber-500/30 hover:border-amber-400 shadow-[0_4px_25px_rgba(245,158,11,0.08)] hover:translate-y-[-2px]"
                      : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-cyan-400/40 hover:translate-y-[-2px]"
                  }`}
                >
                  {/* Top Bar: User details, VIP tag, Status, and 3-Dot Button */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      
                      {/* Checkbox for Bulk Selection */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleSelectReport(report.id, e)}
                        className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title={isSelected ? "Deselect report" : "Select report for bulk action"}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 border ${
                        isVip ? "border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "border-white/10 bg-white/5"
                      }`}>
                        {report.userPhoto ? (
                          <img
                            src={report.userPhoto}
                            alt="User"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : isVip ? (
                          <Crown className="w-5 h-5 text-amber-400 animate-pulse" />
                        ) : (
                          <UserIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      {/* Name, Email, VIP Badge */}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-bold text-slate-100 truncate">
                            {report.userName || report.userEmail?.split("@")[0] || "Anonymous Listener"}
                          </h4>
                          
                          {isVip ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black text-[9px] font-black font-mono shadow-[0_0_10px_rgba(245,158,11,0.4)] uppercase">
                              <Crown className="w-2.5 h-2.5" />
                              <span>VIP GOLD</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400 text-[9px] font-mono uppercase">
                              Standard
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 truncate font-mono">
                          {report.userEmail || (report.userId ? `UID: ${report.userId.substring(0, 10)}...` : "Guest / Direct Report")}
                        </p>
                      </div>
                    </div>

                    {/* Right side: Status Tag, Direct Delete & 3-Dot Dropdown */}
                    <div className="flex items-center space-x-2 flex-shrink-0 report-dropdown-wrapper">
                      {/* Current Status Pill */}
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold border ${badge.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        <span>{badge.labelEnglish}</span>
                      </span>

                      {/* Instant Delete Button for Individual Report ("tani tani yavum") */}
                      <button
                        type="button"
                        disabled={isDeletingId === report.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteReport(report.id);
                        }}
                        className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 flex items-center justify-center transition-all"
                        title="Delete this single report"
                      >
                        {isDeletingId === report.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 3-Dot Action Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownId(isDropdownOpen ? null : report.id);
                          }}
                          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all"
                          title="Report Actions Menu"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* 3-Dot Context Menu Popup */}
                        {isDropdownOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-10 w-56 bg-[#0e1122]/95 border border-white/20 rounded-2xl p-2 backdrop-blur-2xl shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150 space-y-1 font-sans"
                          >
                            <div className="px-3 py-1.5 text-[10px] font-mono text-cyan-400 uppercase tracking-wider border-b border-white/10 mb-1">
                              Action Menu
                            </div>

                            {/* 1. Open */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDropdownId(null);
                                setSelectedReport(report);
                              }}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-white hover:bg-white/10 transition-colors font-medium text-left"
                            >
                              <ExternalLink className="w-4 h-4 text-cyan-400" />
                              <span>Open Details</span>
                            </button>

                            {/* 2. Seen */}
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatusChange(e, report, "seen")}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-sky-300 hover:bg-sky-500/10 transition-colors font-medium text-left"
                            >
                              <Eye className="w-4 h-4 text-sky-400" />
                              <span>Mark as Seen</span>
                            </button>

                            {/* 3. Under Review */}
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatusChange(e, report, "under_review")}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-purple-300 hover:bg-purple-500/10 transition-colors font-medium text-left"
                            >
                              <Search className="w-4 h-4 text-purple-400" />
                              <span>Set Under Review</span>
                            </button>

                            {/* 4. Processing */}
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatusChange(e, report, "processing")}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors font-medium text-left"
                            >
                              <RefreshCw className="w-4 h-4 text-cyan-400" />
                              <span>Set as Processing</span>
                            </button>

                            {/* 5. Done */}
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatusChange(e, report, "done")}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors font-medium text-left"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Mark as Done</span>
                            </button>

                            {/* Divider */}
                            <div className="border-t border-white/10 my-1"></div>

                            {/* 5.5 Send Direct Notification to User */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenDirectNotif(report, e)}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors font-medium text-left"
                            >
                              <Bell className="w-4 h-4 text-amber-400" />
                              <span>Send In-App Notification</span>
                            </button>

                            {/* 6. Delete */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownId(null);
                                onDeleteReport(report.id);
                              }}
                              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium text-left"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                              <span>Delete Report</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Report Issue & Problem Statement */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-3.5 mb-3">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-white/10 text-cyan-400 text-[10px] font-mono font-bold uppercase">
                        {report.category || "Issue"}
                      </span>
                      {report.title && (
                        <h5 className="text-xs font-bold text-slate-200">{report.title}</h5>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-3">
                      {report.description}
                    </p>
                  </div>

                  {/* User Contact Actions (Call / WhatsApp / Email) */}
                  {(report.userPhone || report.userEmail || report.contactPreference) && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 mb-3"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                          <PhoneCall className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 text-xs font-mono">
                          {report.userPhone && (
                            <div className="flex items-center space-x-1.5 text-emerald-300 font-bold">
                              <span>📞 {report.userPhone}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(report.userPhone!, "Phone")}
                                className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 transition-colors"
                                title="Copy Phone Number"
                              >
                                {copiedField === "Phone" ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          {report.contactPreference && (
                            <span className="text-[10px] text-emerald-400/80 font-sans block">
                              Preferred: <strong className="capitalize">{report.contactPreference}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contact Buttons */}
                      <div className="flex items-center space-x-1.5">
                        {report.userPhone && (
                          <>
                            {/* WhatsApp Button */}
                            <a
                              href={`https://wa.me/${report.userPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                                `Hello ${report.userName || "Music Fan"}! Regarding your request on skplayer (${report.title || "Support"})...`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center space-x-1 transition-all shadow-sm"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>

                            {/* Direct Phone Call Button */}
                            <a
                              href={`tel:${report.userPhone}`}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold flex items-center space-x-1 transition-all shadow-sm"
                              title="Direct Phone Call"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                          </>
                        )}

                        {report.userEmail && (
                          <a
                            href={`mailto:${report.userEmail}?subject=${encodeURIComponent(
                              `skplayer Support: ${report.title || "Your Request"}`
                            )}&body=${encodeURIComponent(`Hello ${report.userName || "User"},\n\nRegarding your request:\n`)}`}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-medium flex items-center space-x-1 transition-all"
                            title="Send Email"
                          >
                            <Mail className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="hidden sm:inline">Mail</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Song Details if connected */}
                  {report.songTitle && (
                    <div className="flex items-center space-x-2.5 px-3 py-1.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-cyan-300 mb-3 font-mono">
                      <Music className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="truncate">Related Song: <strong>{report.songTitle}</strong> {report.songArtist ? `by ${report.songArtist}` : ""}</span>
                    </div>
                  )}

                  {/* Admin Reply preview if exists */}
                  {report.adminReply && (
                    <div className="flex items-start space-x-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 mb-3">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-indigo-400 font-bold block uppercase">Admin Sent Reply:</span>
                        <p className="text-[11px] text-slate-300 font-sans italic line-clamp-2">"{report.adminReply}"</p>
                      </div>
                    </div>
                  )}

                  {/* Card Bottom Meta & Quick Status Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5 text-[11px] text-slate-400 font-mono">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(report.createdAt || Date.now()).toLocaleString()}</span>
                      {report.deviceInfo && (
                        <span className="text-[10px] text-slate-500 hidden md:inline">
                          • {report.deviceInfo}
                        </span>
                      )}
                    </div>

                    {/* Quick 1-tap Status Pills and Direct Send Notification button */}
                    <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
                      <button
                        type="button"
                        onClick={(e) => handleOpenDirectNotif(report, e)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-200 transition-all flex items-center space-x-1"
                        title="Send in-app notification to this user"
                      >
                        <Bell className="w-3 h-3 text-amber-400" />
                        <span>Notify</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleQuickStatusChange(e, report, "seen")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                          report.status === "seen"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-sky-300"
                        }`}
                        title="Mark as Seen"
                      >
                        Seen
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleQuickStatusChange(e, report, "under_review")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                          report.status === "under_review"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                            : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-purple-300"
                        }`}
                        title="Mark as Under Review"
                      >
                        Review
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleQuickStatusChange(e, report, "processing")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                          report.status === "processing"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                            : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-300"
                        }`}
                        title="Mark as Processing"
                      >
                        Process
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleQuickStatusChange(e, report, "done")}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                          report.status === "done"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-emerald-300"
                        }`}
                        title="Mark as Done"
                      >
                        Done ✅
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Full Report Details Modal (`Open`) */}
      {selectedReport && (
        <div
          onClick={() => setSelectedReport(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] bg-[#0b0e1e] border border-white/15 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl overflow-y-auto space-y-6 relative custom-scrollbar"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded uppercase">
                    REPORT ID: {selectedReport.id.slice(0, 10)}
                  </span>
                  
                  {isVipReport(selectedReport) ? (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black text-[10px] font-bold font-mono shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                      <Crown className="w-3 h-3" />
                      <span>👑 VIP PRIORITY REPORT</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 text-slate-400 text-[10px] font-mono">
                      Normal User Report
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-black text-white tracking-tight">
                  {selectedReport.title || `${selectedReport.category || "Issue"} Report Details`}
                </h3>
              </div>

              {/* Close button */}
              <button
                onClick={() => setSelectedReport(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Profile Card */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 border ${
                  isVipReport(selectedReport) ? "border-amber-400 bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "border-white/10 bg-white/5"
                }`}>
                  {selectedReport.userPhoto ? (
                    <img
                      src={selectedReport.userPhoto}
                      alt="User"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-white">
                      {selectedReport.userName || "skplayer User"}
                    </h4>
                    {isVipReport(selectedReport) && (
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{selectedReport.userEmail || "No email provided"}</p>
                  {selectedReport.userId && (
                    <p className="text-[10px] text-slate-500 font-mono">UID: {selectedReport.userId}</p>
                  )}
                </div>
              </div>

              {selectedReport.proKey && (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-right sm:self-center">
                  <span className="text-[9px] font-mono text-amber-400 block uppercase font-bold">Activated VIP Key</span>
                  <span className="text-xs font-mono font-black text-amber-300">{selectedReport.proKey}</span>
                </div>
              )}
            </div>

            {/* Direct User Contact Information Card (Call / WhatsApp / Email) */}
            {(selectedReport.userPhone || selectedReport.userEmail || selectedReport.contactPreference) && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <PhoneCall className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider font-mono">
                      User Contact Information & Direct Action
                    </span>
                  </div>
                  {selectedReport.contactPreference && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase font-mono">
                      Prefers: {selectedReport.contactPreference}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {selectedReport.userPhone && (
                    <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-mono block">PHONE / WHATSAPP NUMBER</span>
                        <span className="text-sm font-bold text-emerald-300 font-mono">{selectedReport.userPhone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedReport.userPhone!, "Phone")}
                        className="p-2 hover:bg-emerald-500/20 rounded-lg text-emerald-400 transition-colors"
                        title="Copy Phone"
                      >
                        {copiedField === "Phone" ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}

                  {selectedReport.userEmail && (
                    <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-mono block">USER EMAIL</span>
                        <span className="text-xs font-bold text-slate-200 font-mono truncate block">{selectedReport.userEmail}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedReport.userEmail!, "Email")}
                        className="p-2 hover:bg-emerald-500/20 rounded-lg text-emerald-400 transition-colors"
                        title="Copy Email"
                      >
                        {copiedField === "Email" ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Direct 1-Click Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedReport.userPhone && (
                    <>
                      <a
                        href={`https://wa.me/${selectedReport.userPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                          `Hello ${selectedReport.userName || "skplayer listener"}! Regarding your request on skplayer (${selectedReport.title || "Support issue"})...`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Chat on WhatsApp</span>
                      </a>

                      <a
                        href={`tel:${selectedReport.userPhone}`}
                        className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-teal-600/20 transition-all hover:scale-[1.02]"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Call Phone Directly</span>
                      </a>
                    </>
                  )}

                  {selectedReport.userEmail && (
                    <a
                      href={`mailto:${selectedReport.userEmail}?subject=${encodeURIComponent(
                        `skplayer Support: ${selectedReport.title || "Your Request"}`
                      )}&body=${encodeURIComponent(`Hello ${selectedReport.userName || "User"},\n\nRegarding your request on skplayer:\n`)}`}
                      className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all hover:scale-[1.02]"
                    >
                      <Mail className="w-4 h-4 text-cyan-400" />
                      <span>Send Email</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Song Details if connected */}
            {selectedReport.songTitle && (
              <div className="p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase flex items-center space-x-1.5">
                  <Music className="w-3.5 h-3.5" />
                  <span>Reported Song Information</span>
                </span>
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold text-white">{selectedReport.songTitle}</h5>
                    <p className="text-xs text-slate-400">{selectedReport.songArtist || "Unknown Artist"}</p>
                  </div>
                  {selectedReport.songId && (
                    <span className="text-[10px] font-mono text-slate-500 bg-black/30 px-2 py-1 rounded">
                      ID: {selectedReport.songId}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Problem Description */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Reported Issue & Description
              </label>
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedReport.description}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                <span>Submitted: {new Date(selectedReport.createdAt || Date.now()).toLocaleString()}</span>
                {selectedReport.deviceInfo && <span>Device/Browser: {selectedReport.deviceInfo}</span>}
              </div>
            </div>

            {/* Status Selector Radios */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Update Status (Changes trigger in-app notification to user)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: "open", label: "Open 📩", color: "amber" },
                  { id: "seen", label: "Seen 👀", color: "sky" },
                  { id: "under_review", label: "Review 🔍", color: "purple" },
                  { id: "processing", label: "Process ⚙️", color: "cyan" },
                  { id: "done", label: "Done ✅", color: "emerald" }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setModalNewStatus(s.id as ReportStatus)}
                    className={`py-3 px-2 rounded-2xl text-xs font-bold font-mono transition-all flex flex-col items-center justify-center space-y-1 border ${
                      modalNewStatus === s.id
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] scale-[1.03]"
                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Admin Reply to User (Sent via In-App Notification) */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between font-mono">
                <span>Admin Reply / Resolution Message (User sees this in app)</span>
                <span className="text-cyan-400 text-[10px]">Real-time Notification 🔔</span>
              </label>
              <textarea
                rows={3}
                placeholder="Type response to user (e.g. 'Thank you for reporting! We fixed the audio quality issue. Enjoy!')..."
                value={adminReplyText}
                onChange={(e) => setAdminReplyText(e.target.value)}
                className="w-full p-3.5 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-2xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-400/30"
              />
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                disabled={isDeletingId === selectedReport.id}
                onClick={() => onDeleteReport(selectedReport.id)}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 font-bold text-xs transition-all flex items-center justify-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Report Document</span>
              </button>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="w-1/2 sm:w-auto px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold transition-all"
                >
                  Close
                </button>

                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleModalSave}
                  className="w-1/2 sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Save & Notify User 🚀</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct User In-App Notification Modal Dialog */}
      {directNotifReport && (
        <div 
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => !isSendingNotif && setDirectNotifReport(null)}
        >
          <div 
            className="w-full max-w-xl bg-[#0e1322] border border-amber-500/30 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)] space-y-5 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>Send Notification to User</span>
                    {isVipReport(directNotifReport) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span>VIP</span>
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Recipient: <strong className="text-slate-200">{directNotifReport.userName || "User"}</strong> ({directNotifReport.userEmail || directNotifReport.userId})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDirectNotifReport(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Templates */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Select Quick Template / Preset
              </label>
              <div className="flex flex-wrap gap-2">
                {NOTIF_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setDirectNotifTitle(preset.title);
                      setDirectNotifMessage(preset.message);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 text-slate-300 hover:text-amber-200 transition-all font-medium"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification Title Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Notification Title
              </label>
              <input
                type="text"
                value={directNotifTitle}
                onChange={(e) => setDirectNotifTitle(e.target.value)}
                placeholder="Notification Title (e.g. Issue Resolved 🎧)"
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 focus:border-amber-500/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none transition-all"
              />
            </div>

            {/* Notification Message Textarea */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Direct Message for this User only
              </label>
              <textarea
                rows={4}
                value={directNotifMessage}
                onChange={(e) => setDirectNotifMessage(e.target.value)}
                placeholder="Write your custom message here..."
                className="w-full p-4 bg-black/40 border border-white/10 focus:border-amber-500/60 rounded-2xl text-xs text-slate-100 placeholder-slate-500 outline-none transition-all leading-relaxed"
              />
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-300/90 flex items-start space-x-2">
              <span className="text-amber-400 text-sm">💡</span>
              <span>
                This notification is <strong>targeted strictly to User ID: <code>{directNotifReport.userId}</code></strong> and will appear in their Player App 🔔 Notification Bell real-time.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDirectNotifReport(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingNotif || !directNotifMessage.trim()}
                onClick={handleSendDirectNotification}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingNotif ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-black" />
                    <span>Send Notification to User 🚀</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk / Batch Deletion Confirmation Modal Dialog */}
      {confirmDeleteModal && (
        <div
          className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => !isBulkDeleting && setConfirmDeleteModal(null)}
        >
          <div
            className="w-full max-w-md bg-[#0e1122] border border-red-500/40 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] space-y-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-red-400">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{confirmDeleteModal.title}</h3>
                <p className="text-xs text-red-300 font-mono">
                  {confirmDeleteModal.count} document{confirmDeleteModal.count === 1 ? "" : "s"} will be deleted
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-black/40 p-3.5 rounded-xl border border-white/10">
              {confirmDeleteModal.description}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={() => setConfirmDeleteModal(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={confirmDeleteModal.action}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center space-x-2 disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting documents...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm & Delete Permanently 🗑️</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

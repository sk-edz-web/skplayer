import React, { useState } from "react";
import { 
  X, 
  Send, 
  AlertTriangle, 
  Music, 
  Crown, 
  CheckCircle2, 
  Loader2,
  Phone,
  MessageSquare,
  Mail,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { Song, UserProfile } from "../types";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  userProfile: UserProfile | null;
  isVIP: boolean;
  song?: Song | null;
  onSuccess?: (reportId: string) => void;
}

export default function ReportModal({
  isOpen,
  onClose,
  user,
  userProfile,
  isVIP,
  song,
  onSuccess
}: ReportModalProps) {
  const [requestMode, setRequestMode] = useState<"issue" | "contact_request">("issue");
  const [category, setCategory] = useState<string>("Audio Glitch / Sound Issue");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [userPhone, setUserPhone] = useState<string>(() => localStorage.getItem("skplayer_saved_phone") || "");
  const [userEmailInput, setUserEmailInput] = useState<string>(() => user?.email || userProfile?.email || "");
  const [contactPreference, setContactPreference] = useState<"call" | "message" | "whatsapp" | "email">("whatsapp");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (!isOpen) return null;

  const categories = [
    "Audio Glitch / Sound Issue",
    "Wrong Song / Broken Link",
    "Request Call / Message from Admin 📞",
    "Subscription / VIP Key Help (₹99 / ₹199 Plan) 👑",
    "Player / Equalizer Bug",
    "VIP Access / Key Issue",
    "UI / Display Problem",
    "Feature Request / Suggestion",
    "Other Issue"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg("Please provide a description or message.");
      return;
    }

    if (requestMode === "contact_request" && !userPhone.trim() && !userEmailInput.trim()) {
      setErrorMsg("Please enter your Phone / WhatsApp Number or Email so the admin can contact you.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      if (userPhone.trim()) {
        localStorage.setItem("skplayer_saved_phone", userPhone.trim());
      }

      const isUserVIP = Boolean(
        isVIP || 
        userProfile?.isPro || 
        (userProfile as any)?.isGold ||
        (userProfile as any)?.tier === "gold" || 
        (userProfile as any)?.tier === "pro" || 
        (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()) ||
        (userProfile?.proKey && userProfile.proKey.trim().length > 0) ||
        localStorage.getItem("skplayer_gold_pro_unlocked") === "true" ||
        localStorage.getItem("skplayer_vip_pass") === "true" ||
        localStorage.getItem("skplayer_is_pro") === "true"
      );

      let activeUserId = user?.uid;
      if (!activeUserId) {
        activeUserId = localStorage.getItem("skplayer_device_user_id") || "";
        if (!activeUserId) {
          activeUserId = "user_" + Math.random().toString(36).substring(2, 10);
          localStorage.setItem("skplayer_device_user_id", activeUserId);
        }
      }

      const deviceInfo = `${navigator.userAgent.slice(0, 100)}`;
      const finalEmail = userEmailInput.trim() || user?.email || userProfile?.email || (isUserVIP ? "vip@skplayer.app" : "listener@skplayer.app");

      const reportPayload = {
        userId: activeUserId,
        userEmail: finalEmail,
        userName: userProfile?.displayName || user?.displayName || (isUserVIP ? "VIP Gold Member" : "skplayer Listener"),
        userPhoto: userProfile?.photoURL || user?.photoURL || "",
        userPhone: userPhone.trim(),
        contactPreference: contactPreference,
        requestType: requestMode === "contact_request" ? "call_request" : "report",
        isVIP: isUserVIP,
        priority: isUserVIP ? "vip" : "normal",
        proKey: userProfile?.proKey || localStorage.getItem("skplayer_activated_key") || (isUserVIP ? "VIP_PASS_ACTIVE" : ""),
        category: requestMode === "contact_request" ? "Request Call / Message 📞" : category,
        title: title.trim() || (requestMode === "contact_request" ? `Call/Message Request (${contactPreference.toUpperCase()})` : `${category} Report`),
        description: description.trim(),
        songId: song?.id || "",
        songTitle: song?.title || "",
        songArtist: song?.artist || "",
        deviceInfo: deviceInfo,
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, "reports"), reportPayload);
      setIsSuccess(true);
      if (onSuccess) {
        onSuccess(docRef.id);
      }
      setTimeout(() => {
        setIsSuccess(false);
        setTitle("");
        setDescription("");
        onClose();
      }, 2200);
    } catch (err: any) {
      console.error("Failed to submit report:", err);
      setErrorMsg(err.message || "Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0b0e1e] border border-white/15 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        {/* Ambient glow */}
        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${
          isVIP ? "bg-amber-500/15" : "bg-cyan-500/10"
        }`}></div>

        {/* Modal Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider">
                Support & Issue Tracking
              </span>
              {isVIP && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-mono font-bold">
                  <Crown className="w-2.5 h-2.5" />
                  <span>VIP Priority Queue</span>
                </span>
              )}
            </div>
            <h3 className="text-xl font-black text-white flex items-center space-x-2">
              <AlertTriangle className={`w-5 h-5 ${isVIP ? "text-amber-400" : "text-cyan-400"}`} />
              <span>{requestMode === "contact_request" ? "Request Call / Message 📞" : "Report an Issue"}</span>
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 border border-white/10 rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => setRequestMode("issue")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              requestMode === "issue"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Report Bug / Issue</span>
          </button>
          <button
            type="button"
            onClick={() => setRequestMode("contact_request")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              requestMode === "contact_request"
                ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Request Call / Message 📞</span>
          </button>
        </div>

        {isSuccess ? (
          <div className="py-10 text-center space-y-3 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">
              {requestMode === "contact_request" ? "Contact Request Received!" : "Report Submitted Successfully!"}
            </h4>
            <p className="text-xs text-slate-300 max-w-sm mx-auto font-sans">
              Our Admin will review your submission and contact you via your preferred channel ({contactPreference.toUpperCase()}) or resolve the reported issue!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Connected Song Banner if applicable */}
            {song && (
              <div className="flex items-center space-x-3 p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                <Music className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-cyan-400 font-bold block uppercase">Reporting Track:</span>
                  <p className="font-bold text-white truncate">{song.title} <span className="text-slate-400 font-normal">by {song.artist}</span></p>
                </div>
              </div>
            )}

            {/* Category Selector (Issue mode) */}
            {requestMode === "issue" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block font-mono">
                  Issue Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-xl text-slate-100 text-xs outline-none transition-all"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#0b0e1e] text-slate-200">
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Contact Details Grid (Phone & Email) */}
            <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider font-mono flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Contact Information</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400">ADMIN CAN CALL/CHAT</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block font-mono mb-1">
                    Phone / WhatsApp Number {requestMode === "contact_request" && "*"}
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-xl text-slate-100 placeholder-slate-600 text-xs outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-mono mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      placeholder="e.g. listener@gmail.com"
                      value={userEmailInput}
                      onChange={(e) => setUserEmailInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-xl text-slate-100 placeholder-slate-600 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Preferred Contact Mode */}
              <div>
                <label className="text-[10px] text-slate-400 block font-mono mb-1.5">
                  Preferred Contact Method:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setContactPreference("whatsapp")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center space-x-1 ${
                      contactPreference === "whatsapp" || contactPreference === "message"
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-emerald-400" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setContactPreference("call")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center space-x-1 ${
                      contactPreference === "call"
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Phone className="w-3 h-3 text-amber-400" />
                    <span>Direct Call</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setContactPreference("email")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center space-x-1 ${
                      contactPreference === "email"
                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                        : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Mail className="w-3 h-3 text-indigo-400" />
                    <span>Email</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Title / Summary */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block font-mono">
                {requestMode === "contact_request" ? "Request Topic / Reason" : "Short Summary (Optional)"}
              </label>
              <input
                type="text"
                placeholder={requestMode === "contact_request" ? "e.g. Need subscription key or audio problem help" : "e.g. Bass distortion on track, player stuttering..."}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all"
              />
            </div>

            {/* Detailed Description */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block font-mono">
                {requestMode === "contact_request" ? "Message for Admin *" : "Detailed Problem Description *"}
              </label>
              <textarea
                rows={3}
                required
                placeholder={requestMode === "contact_request" ? "Please let the admin know what time you're available or what plan/feature you need assistance with..." : "Explain the problem clearly (e.g. what happened, song timestamp, how to reproduce)..."}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3.5 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all resize-none"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-mono">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center space-x-2 shadow-lg disabled:opacity-40 hover:scale-[1.02] active:scale-[0.98] ${
                  isVIP
                    ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-amber-500/25"
                    : "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-cyan-500/25"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{requestMode === "contact_request" ? "Send Contact Request 📞" : "Submit Report 🚀"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

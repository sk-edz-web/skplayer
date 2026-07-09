import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { 
  User, 
  Mail, 
  Lock, 
  Sparkles, 
  Loader2, 
  Eye, 
  EyeOff, 
  Music, 
  LogIn 
} from "lucide-react";

interface AuthPanelProps {
  onSuccess: () => void;
}

export default function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Sign In
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save User Profile to Firestore
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: displayName || email.split("@")[0],
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
          createdAt: Date.now()
        });
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Save Google User Profile to Firestore with default isPro: false
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || "googleuser@skplayer.app",
        displayName: user.displayName || user.email?.split("@")[0] || "Google Listener",
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
        createdAt: Date.now()
      }, { merge: true });
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
      {/* Decorative ambient gradients */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-400/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="text-center mb-8 relative z-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-400 to-yellow-600 shadow-[0_0_25px_rgba(245,158,11,0.5)] flex items-center justify-center mx-auto mb-4 overflow-hidden border border-amber-400/20">
          <img 
            src="https://i.ibb.co/fd4wBk6f/Picsart-26-07-09-00-40-05-863.jpg" 
            alt="sk edz Logo" 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
          {isLogin ? "Welcome back" : "Create skplayer account"}
        </h2>
        <p className="text-slate-400 text-xs mt-1.5 font-sans">
          {isLogin ? "Sign in to access your custom playlists & profile" : "Register to start building your personal music tracks library"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        {/* Display Name - Only for Registration */}
        {!isLogin && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Your Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                placeholder="Sarath"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm"
              />
            </div>
          </div>
        )}

        {/* Email Address */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Password</label>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-11 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(6,182,212,0.25)] text-sm"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>{isLogin ? "Sign In" : "Register Now"}</span>
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/10 p-3 rounded-xl text-center font-mono">
            {error}
          </p>
        )}
      </form>

      {/* Google Login Separator */}
      <div className="relative flex py-3 items-center my-4 z-10">
        <div className="flex-grow border-t border-white/10"></div>
        <span className="flex-shrink mx-4 text-xs font-mono text-slate-500">OR</span>
        <div className="flex-grow border-t border-white/10"></div>
      </div>

      {/* Google Login Button */}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center space-x-2.5 py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm mb-6 z-10 hover:border-cyan-500/20"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#EA4335"
            d="M12 5.04c1.74 0 3.3.6 4.53 1.78l3.39-3.39C17.85 1.54 15.11 1 12 1 7.24 1 3.22 3.73 1.35 7.7l3.87 3C6.13 7.6 8.84 5.04 12 5.04z"
          />
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.46h6.44c-.28 1.47-1.11 2.71-2.35 3.54v2.94h3.8c2.22-2.05 3.6-5.07 3.6-8.59z"
          />
          <path
            fill="#FBBC05"
            d="M5.22 14.3c-.22-.66-.35-1.37-.35-2.1s.13-1.44.35-2.1L1.35 7.1C.49 8.83 0 10.77 0 12.8s.49 3.97 1.35 5.7l3.87-3.2z"
          />
          <path
            fill="#34A853"
            d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.8-2.94c-1.05.71-2.4 1.13-4.16 1.13-3.16 0-5.87-2.56-6.82-5.96L1.35 15.5C3.22 19.47 7.24 22 12 22z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      {/* Toggle mode */}
      <div className="text-center relative z-10">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-xs font-medium text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors"
        >
          {isLogin ? "Need an account? Sign Up" : "Already have an account? Log In"}
        </button>
      </div>
    </div>
  );
}

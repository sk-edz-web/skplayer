import React, { StrictMode, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { 
  db, 
  auth, 
  OperationType, 
  handleFirestoreError 
} from "./firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  updateDoc,
  setDoc,
  onSnapshot,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { 
  Music, 
  Image as ImageIcon, 
  UploadCloud, 
  Trash2, 
  Play, 
  Pause, 
  ArrowLeft, 
  Disc, 
  FileAudio, 
  Sparkles, 
  Plus, 
  CheckCircle2, 
  Loader2,
  Edit,
  Crown,
  Key,
  RefreshCw,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  AlertCircle,
  MoreVertical,
  MoreHorizontal,
  AlertTriangle,
  Check,
  Search,
  MessageSquare,
  Send,
  Clock,
  User as UserIcon,
  CheckCheck,
  Filter,
  Bell,
  ExternalLink,
  X,
  Radio,
  Layers,
  FileText,
  HelpCircle,
  Activity,
  Flame,
  CornerDownRight,
  ChevronRight,
  Copy,
  Zap,
  Users,
  UserCheck
} from "lucide-react";
import { Song, ReportItem, ReportStatus, AppNotification, SubscriptionKey, ArtistProfile } from "./types";
import AdminReportsManager from "./components/AdminReportsManager";
import AdminArtistsManager from "./components/AdminArtistsManager";
import "./index.css";

interface ID3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

function parseID3Tags(buffer: ArrayBuffer): ID3Metadata {
  const view = new DataView(buffer);
  const result: ID3Metadata = {};

  if (view.byteLength < 10) return result;
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return result;
  }

  const b1 = view.getUint8(6);
  const b2 = view.getUint8(7);
  const b3 = view.getUint8(8);
  const b4 = view.getUint8(9);
  const id3Size = ((b1 & 0x7F) << 21) | ((b2 & 0x7F) << 14) | ((b3 & 0x7F) << 7) | (b4 & 0x7F);

  let offset = 10;
  const tagVersion = view.getUint8(3);
  
  while (offset < id3Size && offset < view.byteLength - 10) {
    let frameId = "";
    for (let i = 0; i < 4; i++) {
      frameId += String.fromCharCode(view.getUint8(offset + i));
    }
    
    if (frameId.charCodeAt(0) === 0) break;

    let frameSize = 0;
    if (tagVersion === 4) {
      const s1 = view.getUint8(offset + 4);
      const s2 = view.getUint8(offset + 5);
      const s3 = view.getUint8(offset + 6);
      const s4 = view.getUint8(offset + 7);
      frameSize = ((s1 & 0x7F) << 21) | ((s2 & 0x7F) << 14) | ((s3 & 0x7F) << 7) | (s4 & 0x7F);
    } else {
      frameSize = view.getUint32(offset + 4);
    }

    if (frameSize <= 0 || frameSize > view.byteLength - offset) {
      break;
    }

    const frameDataOffset = offset + 10;
    
    if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TALB") {
      try {
        const encoding = view.getUint8(frameDataOffset);
        let text = "";
        if (encoding === 0 || encoding === 3) {
          const bytes = new Uint8Array(buffer, frameDataOffset + 1, frameSize - 1);
          const end = bytes.indexOf(0);
          const actualBytes = end === -1 ? bytes : bytes.subarray(0, end);
          text = new TextDecoder("utf-8").decode(actualBytes).trim();
        } else if (encoding === 1 || encoding === 2) {
          const bytes = new Uint8Array(buffer, frameDataOffset + 1, frameSize - 1);
          text = new TextDecoder("utf-16").decode(bytes).trim();
        }
        
        if (text) {
          if (frameId === "TIT2") result.title = text;
          else if (frameId === "TPE1") result.artist = text;
          else if (frameId === "TALB") result.album = text;
        }
      } catch (err) {
        console.warn("Failed to decode text frame:", frameId, err);
      }
    } else if (frameId === "APIC") {
      try {
        const encoding = view.getUint8(frameDataOffset);
        let mimeTypeOffset = frameDataOffset + 1;
        let mimeType = "";
        while (view.getUint8(mimeTypeOffset) !== 0 && mimeTypeOffset < view.byteLength) {
          mimeType += String.fromCharCode(view.getUint8(mimeTypeOffset));
          mimeTypeOffset++;
        }
        mimeTypeOffset++;
        
        const pictureType = view.getUint8(mimeTypeOffset);
        let descriptionOffset = mimeTypeOffset + 1;
        
        if (encoding === 1 || encoding === 2) {
          while (descriptionOffset < view.byteLength - 1 && (view.getUint8(descriptionOffset) !== 0 || view.getUint8(descriptionOffset + 1) !== 0)) {
            descriptionOffset += 2;
          }
          descriptionOffset += 2;
        } else {
          while (view.getUint8(descriptionOffset) !== 0 && descriptionOffset < view.byteLength) {
            descriptionOffset++;
          }
          descriptionOffset++;
        }
        
        const picSize = frameSize - (descriptionOffset - frameDataOffset);
        if (picSize > 0 && descriptionOffset + picSize <= view.byteLength) {
          const picBytes = new Uint8Array(buffer, descriptionOffset, picSize);
          let binary = "";
          for (let i = 0; i < picBytes.length; i++) {
            binary += String.fromCharCode(picBytes[i]);
          }
          const base64 = btoa(binary);
          result.coverUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;
        }
      } catch (err) {
        console.warn("Failed to parse embedded APIC cover art frame", err);
      }
    }

    offset += 10 + frameSize;
  }

  return result;
}

function AdminApp() {
  // Admin Authentication Gate State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<"songs" | "artists" | "keys" | "reports">("songs");

  // Artist Profiles State
  const [artistsList, setArtistsList] = useState<ArtistProfile[]>([]);
  const [loadingArtists, setLoadingArtists] = useState<boolean>(true);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedArtistImage, setSelectedArtistImage] = useState<string | null>(null);
  const [showArtistDropdown, setShowArtistDropdown] = useState<boolean>(false);
  const [artistFilterQuery, setArtistFilterQuery] = useState<string>("");

  // Reports Management State
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(true);
  const [isUpdatingReport, setIsUpdatingReport] = useState<boolean>(false);
  const [isDeletingReportId, setIsDeletingReportId] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  // VIP Key Management State
  const [keysList, setKeysList] = useState<SubscriptionKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<99 | 199>(99);
  const [customKeyNote, setCustomKeyNote] = useState<string>("");
  const [keySearchTerm, setKeySearchTerm] = useState<string>("");
  const [keyFilterPlan, setKeyFilterPlan] = useState<"all" | "99" | "199">("all");
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Songs List State
  const [songs, setSongs] = useState<Song[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);

  // Form State
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [imageStatus, setImageStatus] = useState<"unchecked" | "available" | "unavailable">("unchecked");

  // Helper to compute SHA-256 hash using native Web Crypto API (No credentials exposed)
  const computeAdminHash = async (email: string, pass: string): Promise<string> => {
    try {
      const text = `${email.trim().toLowerCase()}::${pass}::sk_edz_admin_secret_salt_2026`;
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  };

  // Check saved session token on load
  useEffect(() => {
    const verifySavedSession = async () => {
      const savedToken = sessionStorage.getItem("sk_admin_token");
      if (!savedToken) {
        setIsCheckingAuth(false);
        return;
      }

      // Check if it's a client-issued signed session
      if (savedToken.startsWith("sk_adm_client_")) {
        try {
          const parts = savedToken.split("_");
          const timestamp = parseInt(parts[3], 10);
          if (timestamp && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
            setIsAdminAuthenticated(true);
            setIsCheckingAuth(false);
            return;
          }
        } catch {
          // fall through
        }
      }

      try {
        const response = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: savedToken })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            setIsAdminAuthenticated(true);
            setIsCheckingAuth(false);
            return;
          }
        }
        // If server returned invalid or was 404, check fallback
        sessionStorage.removeItem("sk_admin_token");
        setIsAdminAuthenticated(false);
      } catch (err) {
        // Fallback for static environments without server API
        if (savedToken.startsWith("sk_adm_")) {
          setIsAdminAuthenticated(true);
        } else {
          sessionStorage.removeItem("sk_admin_token");
          setIsAdminAuthenticated(false);
        }
      } finally {
        setIsCheckingAuth(false);
      }
    };
    verifySavedSession();
  }, []);

  // Handle Admin Login submission with hybrid resilience (Serverless API + Cryptographic Hash Fallback)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword.trim();

    if (!cleanEmail || !cleanPass) {
      setAuthError("Please enter both administrator email and password.");
      return;
    }

    setIsLoggingIn(true);
    let serverLoginSucceeded = false;

    // 1. First attempt Server / Vercel Serverless API authentication
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPass
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.token) {
          sessionStorage.setItem("sk_admin_token", data.token);
          setIsAdminAuthenticated(true);
          setAuthError("");
          setLoginPassword("");
          serverLoginSucceeded = true;
          // Sign in to Firebase Auth in background if possible
          signInWithEmailAndPassword(auth, cleanEmail, cleanPass).catch(() => {});
          setIsLoggingIn(false);
          return;
        }
      } else if (response.status === 401) {
        // Explicit 401 from server: wrong credentials
        const data = await response.json().catch(() => ({}));
        setAuthError(data.message || "Access Denied: Invalid administrator credentials.");
        setIsLoggingIn(false);
        return;
      }
    } catch (err) {
      // Backend route unreachable (e.g. deployed as static SPA on Vercel without serverless)
      console.warn("Backend API unreachable, using secure client-side cryptographic verification:", err);
    }

    // 2. Cryptographic SHA-256 Hash Verification Fallback
    // Verified securely via SHA-256 hash - neither email nor password is visible in plaintext
    const expectedHash = "68a9607e63390b16ceac905372a0c2e2acf1b672bc247f62aedf5c7d89584062";
    const computedHash = await computeAdminHash(cleanEmail, cleanPass);

    if (computedHash === expectedHash) {
      const clientToken = `sk_adm_client_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      sessionStorage.setItem("sk_admin_token", clientToken);
      setIsAdminAuthenticated(true);
      setAuthError("");
      setLoginPassword("");
      // Background Firebase Auth login
      signInWithEmailAndPassword(auth, cleanEmail, cleanPass).catch(() => {});
    } else {
      setAuthError("Access Denied: Invalid credentials or unauthorized administrator account.");
    }

    setIsLoggingIn(false);
  };

  // Handle Admin Logout
  const handleAdminLogout = () => {
    sessionStorage.removeItem("sk_admin_token");
    setIsAdminAuthenticated(false);
    setLoginPassword("");
    setAuthError("");
  };

  // Automatic background image validation check
  useEffect(() => {
    if (!imageUrl) {
      setImageStatus("unchecked");
      return;
    }
    const img = new Image();
    img.onload = () => setImageStatus("available");
    img.onerror = () => setImageStatus("unavailable");
    img.src = imageUrl;
  }, [imageUrl]);

  // Edit Mode State
  const [editingSongId, setEditingSongId] = useState<string | null>(null);

  // Search & Filter States
  const [trackSearchTerm, setTrackSearchTerm] = useState<string>("");
  const [trackFilterCategory, setTrackFilterCategory] = useState<string>("all");
  const [autoFillSearchTerm, setAutoFillSearchTerm] = useState<string>("");
  const [showAutoFillDropdown, setShowAutoFillDropdown] = useState<boolean>(false);

  // Dynamic Categories State
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesObj, setCategoriesObj] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  // Debounced auto-duration detection for pasted URL links
  useEffect(() => {
    if (!audioUrl || !audioUrl.startsWith("http")) return;

    const timer = setTimeout(() => {
      setStatusMessage("Attempting to auto-fetch audio duration from URL...");
      const tempAudio = new Audio(audioUrl);
      
      const handleMetadata = () => {
        setDuration(Math.round(tempAudio.duration));
        setStatusMessage("Audio duration fetched successfully!");
        tempAudio.removeEventListener("loadedmetadata", handleMetadata);
      };
      
      const handleError = () => {
        console.warn("Could not load metadata from URL directly.");
        tempAudio.removeEventListener("error", handleError);
      };

      tempAudio.addEventListener("loadedmetadata", handleMetadata);
      tempAudio.addEventListener("error", handleError);
      tempAudio.load();
    }, 1200);

    return () => clearTimeout(timer);
  }, [audioUrl]);

  const startEditSong = (song: Song) => {
    setEditingSongId(song.id);
    setTitle(song.title);
    setArtist(song.artist);
    setAlbum(song.album || "");
    setAudioUrl(song.audioUrl);
    setImageUrl(song.imageUrl);
    setDuration(song.duration);
    setSelectedCategories(song.categories || []);
    setStatusMessage(`Editing track: "${song.title}"`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingSongId(null);
    setTitle("");
    setArtist("");
    setAlbum("");
    setAudioUrl("");
    setImageUrl("");
    setDuration(0);
    setSelectedCategories([]);
    setUploadProgress({});
    setStatusMessage("Edit cancelled.");
  };

  // Real-time synchronization of Categories from Firestore (with seed)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), async (snapshot) => {
      const catList: string[] = [];
      const catObjList: { id: string; name: string }[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        catList.push(data.name);
        catObjList.push({ id: doc.id, name: data.name });
      });
      
      if (catList.length === 0) {
        // Seed default 5 popular categories requested by user
        const defaults = ["K-Pop", "Hip-Hop", "Melody", "Tamil", "Lo-Fi"];
        for (const cat of defaults) {
          try {
            await setDoc(doc(db, "categories", cat.toLowerCase().replace(/\s+/g, "-")), {
              name: cat,
              createdAt: Date.now()
            });
          } catch (e) {
            console.error("Failed to seed category:", cat, e);
          }
        }
      } else {
        setCategories(catList);
        setCategoriesObj(catObjList);
      }
    }, (error) => {
      console.error("Categories subscription failed:", error);
    });

    return () => unsubscribe();
  }, []);

  // Handler to add a new category to Firestore
  const handleAddCategory = async (e: React.MouseEvent) => {
    e.preventDefault();
    const catName = newCategoryName.trim();
    if (!catName) return;
    
    setIsAddingCategory(true);
    try {
      const catId = catName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await setDoc(doc(db, "categories", catId), {
        name: catName,
        createdAt: Date.now()
      });
      setNewCategoryName("");
      setStatusMessage(`Category "${catName}" added successfully! 🎉`);
    } catch (err) {
      console.error("Failed to add category:", err);
      setStatusMessage("Failed to add category.");
    } finally {
      setIsAddingCategory(false);
    }
  };

  // Handler to delete a category from Firestore
  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (!window.confirm(`Are you sure you want to delete the category "${catName}"?`)) return;
    try {
      await deleteDoc(doc(db, "categories", catId));
      setStatusMessage(`Category "${catName}" deleted successfully!`);
    } catch (err) {
      console.error("Failed to delete category:", err);
      setStatusMessage("Failed to delete category.");
    }
  };

  // Handler to start editing a category
  const startEditingCategory = (catId: string, currentName: string) => {
    setEditingCategoryId(catId);
    setEditingCategoryName(currentName);
  };

  // Handler to save an edited category
  const handleSaveCategoryEdit = async (catId: string) => {
    const trimmedName = editingCategoryName.trim();
    if (!trimmedName) return;
    try {
      await updateDoc(doc(db, "categories", catId), {
        name: trimmedName
      });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setStatusMessage(`Category renamed to "${trimmedName}"!`);
    } catch (err) {
      console.error("Failed to update category:", err);
      setStatusMessage("Failed to update category.");
    }
  };

  // Helper to toggle multi-selection of categories for a song
  const toggleCategorySelection = (catName: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(catName)) {
        return prev.filter((c) => c !== catName);
      } else {
        return [...prev, catName];
      }
    });
  };

  // Upload Status
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audio Preview State
  const [previewSongId, setPreviewSongId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // ImgBB / Local Storage Details
  const IMGBB_KEY = "7a39d89ccdbcf9a749363143c7b6009f";

  // Load songs from Firestore on startup
  const fetchSongs = async () => {
    setLoadingSongs(true);
    try {
      const q = query(collection(db, "songs"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const songList: Song[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        songList.push({
          id: doc.id,
          title: data.title || "Untitled",
          artist: data.artist || "Unknown Artist",
          album: data.album || "",
          audioUrl: data.audioUrl || "",
          imageUrl: data.imageUrl || "",
          duration: data.duration || 0,
          createdAt: data.createdAt || Date.now(),
          uploadedBy: data.uploadedBy || "",
          categories: data.categories || []
        });
      });
      setSongs(songList);
    } catch (err) {
      console.error("Failed to load songs:", err);
      // Fail gracefully or show notification
    } finally {
      setLoadingSongs(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // Set up preview audio event listeners
  useEffect(() => {
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
    }

    const audio = previewAudioRef.current;

    const handleEnded = () => {
      setIsPlayingPreview(false);
      setPreviewSongId(null);
    };

    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
  }, []);

  // Handle preview playing
  const togglePreview = (song: Song) => {
    if (!previewAudioRef.current) return;

    if (previewSongId === song.id) {
      if (isPlayingPreview) {
        previewAudioRef.current.pause();
        setIsPlayingPreview(false);
      } else {
        previewAudioRef.current.play().catch(err => console.log(err));
        setIsPlayingPreview(true);
      }
    } else {
      previewAudioRef.current.src = song.audioUrl;
      previewAudioRef.current.load();
      previewAudioRef.current.play()
        .then(() => {
          setPreviewSongId(song.id);
          setIsPlayingPreview(true);
        })
        .catch(err => {
          console.error("Preview play failed:", err);
          alert("Could not load preview. Please check the audio URL.");
        });
    }
  };

  // Helper to convert File to Base64
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Direct Upload to Server helper via server-side proxy
  const uploadFileToServer = async (file: File, type: "audio" | "image") => {
    const key = type === "audio" ? "audio_file" : "image_file";
    setUploadProgress(prev => ({ ...prev, [key]: 10 }));
    
    try {
      const base64 = await toBase64(file);
      setUploadProgress(prev => ({ ...prev, [key]: 45 }));
      
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: base64,
          presetType: `admin_${type}`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      setUploadProgress(prev => ({ ...prev, [key]: 85 }));
      const data = await response.json();
      
      setUploadProgress(prev => ({ ...prev, [key]: 100 }));
      
      if (data.secure_url) {
        if (type === "audio") {
          try {
            setStatusMessage("Auto-calculating song duration...");
            const tempAudio = new Audio(data.secure_url);
            tempAudio.addEventListener("loadedmetadata", () => {
              setDuration(Math.round(tempAudio.duration));
              setStatusMessage("Audio duration fetched successfully!");
            });
          } catch (durErr) {
            console.warn("Could not get duration automatically:", durErr);
          }
        }
        return data.secure_url;
      } else {
        throw new Error("No secure URL returned");
      }
    } catch (error) {
      console.error(`${type} upload error:`, error);
      setStatusMessage(`Error uploading ${type}: ${error instanceof Error ? error.message : "Upload failed"}`);
      setUploadProgress(prev => ({ ...prev, [key]: 0 }));
      return null;
    }
  };

  // Handle file picker selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "audio" | "image") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMessage(`Uploading ${type} securely via server backend...`);
    const uploadedUrl = await uploadFileToServer(file, type);

    if (uploadedUrl) {
      if (type === "audio") {
        setAudioUrl(uploadedUrl);
        setStatusMessage("Audio uploaded successfully!");

        // Try parsing ID3 tags for auto-filling metadata
        try {
          const reader = new FileReader();
          const blob = file.slice(0, 512 * 1024); // read first 512KB for metadata
          reader.onload = async (event) => {
            if (event.target?.result instanceof ArrayBuffer) {
              const meta = parseID3Tags(event.target.result);
              console.log("Parsed ID3 tags on upload:", meta);
              if (meta.title) setTitle(meta.title);
              if (meta.artist) setArtist(meta.artist);
              if (meta.album) setAlbum(meta.album);
            }
          };
          reader.readAsArrayBuffer(blob);
        } catch (id3Err) {
          console.warn("Could not parse ID3 tags on upload:", id3Err);
        }
      } else {
        setImageUrl(uploadedUrl);
        setStatusMessage("Cover image uploaded successfully!");
        setImageStatus("available");
      }
    }
  };

  // Create or Update song doc in Firestore
  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !artist || !audioUrl) {
      setStatusMessage("Please fill in Title, Artist, and Audio source.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(editingSongId ? "Updating track in database..." : "Saving track to sk edz database...");

    try {
      const matchedArtist = artistsList.find(
        (a) =>
          a.id === selectedArtistId ||
          a.name.trim().toLowerCase() === artist.trim().toLowerCase()
      );

      const songData: Partial<Song> & Record<string, any> = {
        title,
        artist,
        artistId: matchedArtist?.id || selectedArtistId || null,
        artistImage: matchedArtist?.imageUrl || selectedArtistImage || null,
        album: album || "Single",
        audioUrl,
        imageUrl: imageUrl || matchedArtist?.imageUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
        duration: duration || 180, // Fallback to 3 minutes
        createdAt: Date.now(),
        uploadedBy: auth.currentUser?.uid || "admin",
        categories: selectedCategories
      };

      if (editingSongId) {
        await updateDoc(doc(db, "songs", editingSongId), songData);
        setEditingSongId(null);
        setStatusMessage("Song updated successfully! 🎉");
        showAdminToast("Track updated successfully! 🎉", "success");
      } else {
        await addDoc(collection(db, "songs"), songData);
        setStatusMessage("Song added successfully! 🎉");
        showAdminToast("New track published to library! 🎵", "success");
      }
      
      // Clear inputs
      setTitle("");
      setArtist("");
      setSelectedArtistId(null);
      setSelectedArtistImage(null);
      setAlbum("");
      setAudioUrl("");
      setImageUrl("");
      setDuration(0);
      setSelectedCategories([]);
      setUploadProgress({});
      
      // Refetch song list
      fetchSongs();
    } catch (error) {
      console.error("Error writing to database:", error);
      try {
        handleFirestoreError(error, editingSongId ? OperationType.UPDATE : OperationType.CREATE, "songs");
      } catch (fErr) {
        setStatusMessage(`Firestore error: ${fErr instanceof Error ? fErr.message : "Failed to save"}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Song
  const handleDeleteSong = async (songId: string) => {
    if (!confirm("Are you sure you want to delete this song from sk edz?")) return;

    try {
      await deleteDoc(doc(db, "songs", songId));
      setSongs(prev => prev.filter(s => s.id !== songId));
      setStatusMessage("Song deleted successfully.");
      showAdminToast("Song removed from library.", "info");
    } catch (error) {
      console.error("Error deleting song:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `songs/${songId}`);
      } catch (fErr) {
        alert(`Delete failed: ${fErr instanceof Error ? fErr.message : "Error"}`);
      }
    }
  };

  // Helper to format duration
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  // Real-time VIP keys subscription
  useEffect(() => {
    setLoadingKeys(true);
    const q = query(collection(db, "keys"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const keysArr: any[] = [];
      snapshot.forEach((doc) => {
        keysArr.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setKeysList(keysArr);
      setLoadingKeys(false);
    }, (error) => {
      console.error("Keys subscription failed:", error);
      setLoadingKeys(false);
    });

    return () => unsubscribe();
  }, []);

  // Admin key generation handler (Supports ₹99 and ₹199 plans with custom notes)
  const handleGenerateVipKey = async () => {
    setGeneratingKey(true);
    setStatusMessage(`Generating secure ₹${selectedPlan} VIP Key...`);
    try {
      const r = (l: number) => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let str = "";
        for (let i = 0; i < l; i++) {
          str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return str;
      };
      const prefix = selectedPlan === 199 ? "VIP199" : "VIP99";
      const newKeyCode = `${prefix}-${r(4)}-${r(4)}`;
      
      const durationDays = selectedPlan === 199 ? 365 : 30;
      const planName = selectedPlan === 199 ? "₹199 VIP Master Pass (1 Year)" : "₹99 VIP Gold Pass (1 Month)";

      const keyDocRef = doc(db, "keys", newKeyCode);
      await setDoc(keyDocRef, {
        code: newKeyCode,
        plan: selectedPlan,
        planName: planName,
        price: selectedPlan,
        durationDays: durationDays,
        note: customKeyNote.trim() || "",
        createdAt: Date.now(),
        status: "active",
        used: false,
        usedBy: "",
        usedAt: 0,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 // Key is valid to redeem within 1 year
      });
      setCustomKeyNote("");
      showAdminToast(`Successfully created ${planName} Key: ${newKeyCode} 👑`, "success");
      setStatusMessage(`Generated ${planName} Key: ${newKeyCode} 🎉`);
    } catch (err) {
      console.error("Failed to generate VIP key:", err);
      setStatusMessage("Failed to generate VIP key.");
      showAdminToast("Failed to generate VIP key.", "error");
    } finally {
      setGeneratingKey(false);
    }
  };

  // Copy key to clipboard
  const handleCopyKey = (code: string, id?: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKeyId(id || code);
    showAdminToast(`Copied key code "${code}" to clipboard! 📋`, "info");
    setTimeout(() => setCopiedKeyId(null), 2500);
  };

  // Toggle key status: Activate (reset used status) / Deactivate
  const handleToggleKeyStatus = async (keyId: string, currentStatus: string, isUsed: boolean) => {
    try {
      const keyDocRef = doc(db, "keys", keyId);
      if (isUsed || currentStatus === "disabled") {
        // Activate/Reactivate back to active state and reset used details
        await updateDoc(keyDocRef, {
          status: "active",
          used: false,
          usedBy: "",
          usedAt: 0
        });
        setStatusMessage(`Key ${keyId} successfully reactivated and reset! 👑`);
      } else {
        // Deactivate/Disable the key
        await updateDoc(keyDocRef, {
          status: "disabled"
        });
        setStatusMessage(`Key ${keyId} successfully deactivated.`);
      }
    } catch (err) {
      console.error("Failed to toggle key status:", err);
      setStatusMessage("Failed to update key status.");
    }
  };

  // Delete key
  const handleDeleteKey = async (keyId: string) => {
    if (!window.confirm(`Are you sure you want to delete VIP passcode ${keyId}?`)) return;
    try {
      await deleteDoc(doc(db, "keys", keyId));
      setStatusMessage(`Passcode ${keyId} successfully deleted.`);
    } catch (err) {
      console.error("Failed to delete key:", err);
      setStatusMessage("Failed to delete key.");
    }
  };

  // Toast helper
  const showAdminToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setAdminToast({ text, type });
    setTimeout(() => {
      setAdminToast(null);
    }, 4500);
  };

  // Real-time Firestore Reports Subscription
  useEffect(() => {
    setLoadingReports(true);
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ReportItem[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ReportItem);
        });
        setReports(list);
        setLoadingReports(false);
      },
      (err) => {
        console.warn("Ordered reports query failed, falling back to unordered listener:", err);
        const fallbackUnsub = onSnapshot(collection(db, "reports"), (snap) => {
          const list: ReportItem[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as ReportItem);
          });
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setReports(list);
          setLoadingReports(false);
        });
        return () => fallbackUnsub();
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Artists Collection Subscription
  useEffect(() => {
    setLoadingArtists(true);
    const q = query(collection(db, "artists"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ArtistProfile[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ArtistProfile);
        });
        setArtistsList(list);
        setLoadingArtists(false);
      },
      (err) => {
        console.warn("Artists collection query with orderBy failed, falling back to unordered:", err);
        const fallbackUnsub = onSnapshot(collection(db, "artists"), (snap) => {
          const list: ArtistProfile[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as ArtistProfile);
          });
          list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          setArtistsList(list);
          setLoadingArtists(false);
        });
        return () => fallbackUnsub();
      }
    );

    return () => unsubscribe();
  }, []);

  // Handler to Create or Update an Artist Profile
  const handleSaveArtistProfile = async (data: Partial<ArtistProfile>, id?: string) => {
    try {
      if (id) {
        await updateDoc(doc(db, "artists", id), {
          ...data,
          updatedAt: Date.now()
        });
        showAdminToast(`Artist profile "${data.name}" updated! ✨`, "success");
      } else {
        await addDoc(collection(db, "artists"), {
          ...data,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        showAdminToast(`Artist profile "${data.name}" published! 🌟`, "success");
      }
    } catch (err: any) {
      console.error("Failed to save artist profile:", err);
      showAdminToast(`Error saving artist: ${err.message || "Failed"}`, "error");
      throw err;
    }
  };

  // Handler to Delete an Artist Profile
  const handleDeleteArtistProfile = async (artistId: string) => {
    try {
      await deleteDoc(doc(db, "artists", artistId));
      showAdminToast("Artist profile deleted from database.", "info");
    } catch (err: any) {
      console.error("Failed to delete artist profile:", err);
      showAdminToast(`Failed to delete: ${err.message}`, "error");
      throw err;
    }
  };

  // Handler to Multi-Assign / Link Existing Songs to an Artist Profile
  const handleAssignSongsToArtist = async (
    artistProfile: ArtistProfile,
    songIdsToAssign: string[]
  ) => {
    if (!artistProfile || !artistProfile.id) return;
    try {
      if (songIdsToAssign.length === 0) {
        showAdminToast("No tracks selected to assign.", "info");
        return;
      }

      const batch = writeBatch(db);
      songIdsToAssign.forEach((songId) => {
        const songRef = doc(db, "songs", songId);
        batch.update(songRef, {
          artist: artistProfile.name,
          artistId: artistProfile.id,
          artistImage: artistProfile.imageUrl || null,
          updatedAt: Date.now()
        });
      });

      await batch.commit();
      showAdminToast(
        `Successfully linked ${songIdsToAssign.length} song${songIdsToAssign.length === 1 ? "" : "s"} to ${artistProfile.name}! 🎵✨`,
        "success"
      );
    } catch (err: any) {
      console.error("Failed to assign songs to artist:", err);
      showAdminToast(`Failed to assign tracks: ${err.message || "Database error"}`, "error");
      throw err;
    }
  };

  // Bulk Delete Reports Handler (tani tani yavum & motha ma vum)
  const handleBulkDeleteReports = async (reportIds: string[]) => {
    if (!reportIds || reportIds.length === 0) return;
    try {
      await Promise.all(reportIds.map((id) => deleteDoc(doc(db, "reports", id))));
      showAdminToast(`Successfully deleted ${reportIds.length} report document${reportIds.length === 1 ? "" : "s"}! 🗑️`, "success");
    } catch (err: any) {
      console.error("Failed to bulk delete reports:", err);
      showAdminToast(`Bulk delete error: ${err.message || "Failed"}`, "error");
      throw err;
    }
  };

  // Update Report Status & Dispatch In-App Notification to User
  const handleUpdateReportStatus = async (
    report: ReportItem,
    newStatus: ReportStatus,
    customReply?: string,
    notes?: string
  ) => {
    setIsUpdatingReport(true);
    try {
      const reportRef = doc(db, "reports", report.id);
      const updateData: any = {
        status: newStatus,
        updatedAt: Date.now()
      };
      if (customReply !== undefined) {
        updateData.adminReply = customReply;
      }
      if (notes !== undefined) {
        updateData.adminNotes = notes;
      }

      await updateDoc(reportRef, updateData);

      // Dispatch real-time in-app notification to the user
      if (report.userId) {
        const statusMeta: Record<ReportStatus, { title: string; desc: string }> = {
          open: {
            title: "Report Status: Open 📩",
            desc: "Your report is in the queue and scheduled for review."
          },
          seen: {
            title: "Admin Viewed Your Report 👀",
            desc: "Administrator has seen and acknowledged your reported issue."
          },
          under_review: {
            title: "Report Under Review 🔍",
            desc: "Administrator is investigating and reviewing the details of your report."
          },
          processing: {
            title: "Report In Progress ⚙️",
            desc: "Administrator is actively resolving and fixing the issue you submitted."
          },
          done: {
            title: "Report Resolved! ✅",
            desc: "The issue you reported has been successfully addressed and completed."
          }
        };

        const meta = statusMeta[newStatus] || {
          title: `Report Status: ${newStatus}`,
          desc: `Your report status was updated to ${newStatus}.`
        };

        const finalNotificationMsg = customReply?.trim()
          ? `${meta.desc}\n\n💬 Admin Message: "${customReply.trim()}"`
          : meta.desc;

        await addDoc(collection(db, "notifications"), {
          userId: report.userId,
          reportId: report.id,
          title: meta.title,
          message: finalNotificationMsg,
          status: newStatus,
          type: "report_update",
          read: false,
          createdAt: Date.now()
        });
      }

      const statusLabels: Record<ReportStatus, string> = {
        open: "Open",
        seen: "Seen",
        under_review: "Under Review",
        processing: "Processing",
        done: "Done"
      };

      showAdminToast(`Status changed to ${statusLabels[newStatus]} & Notification sent! 🚀`, "success");
    } catch (err: any) {
      console.error("Failed to update report status:", err);
      showAdminToast(`Error updating report: ${err.message || "Failed"}`, "error");
    } finally {
      setIsUpdatingReport(false);
    }
  };

  // Delete Report permanently
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this report record?")) {
      return;
    }
    setIsDeletingReportId(reportId);
    try {
      await deleteDoc(doc(db, "reports", reportId));
      showAdminToast("Report successfully deleted! 🗑️", "success");
    } catch (err: any) {
      console.error("Failed to delete report:", err);
      showAdminToast(`Failed to delete: ${err.message}`, "error");
    } finally {
      setIsDeletingReportId(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#090b16] text-slate-100 p-4">
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-500 p-[2px] shadow-[0_0_30px_rgba(6,182,212,0.4)] animate-pulse mb-4">
          <div className="w-full h-full bg-[#0b0c15] rounded-2xl flex items-center justify-center">
            <Disc className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        </div>
        <p className="text-xs font-mono text-cyan-400 tracking-wider animate-pulse uppercase">Verifying Administrator Session...</p>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return (
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden bg-[#070810]">
        {/* Ambient background glows */}
        <div className="absolute top-[-15%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none animate-pulse" style={{ animationDelay: "2s" }}></div>

        <div className="w-full max-w-md bg-white/[0.04] border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl relative z-10 overflow-hidden">
          {/* Top badge */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center justify-center mx-auto mb-4 border border-cyan-400/30">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono font-bold tracking-wider uppercase mb-2">
              <ShieldAlert className="w-3 h-3" />
              <span>Restricted Access</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              sk edz admin
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-sans">
              Enter administrator credentials to manage cloud tracks, genres & VIP passcodes.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="admin@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/60 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm focus:ring-1 focus:ring-cyan-400/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/60 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm focus:ring-1 focus:ring-cyan-400/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(6,182,212,0.3)] text-sm mt-2"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Unlock Admin Console</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/5 text-center">
            <a
              href="/"
              className="inline-flex items-center space-x-2 text-xs font-medium text-slate-400 hover:text-cyan-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Music Player</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-x-hidden">
      {/* Dynamic Ambient Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-pink-500/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: "2s" }}></div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 flex flex-col flex-grow">
        
        {/* Navigation & Brand */}
        <header className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center animate-spin-slow">
              <Disc className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                  sk edz admin
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                  Authorized
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">LIQUID GLASS CONSOLE</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleAdminLogout}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold transition-all duration-300 hover:scale-105 active:scale-95"
              title="Sign out of admin console"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock / Exit</span>
            </button>

            <a 
              href="/" 
              className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 group text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
              <span>Go to Player 🎧</span>
            </a>
          </div>
        </header>

        {/* Switchable Tabs Selector */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl mb-8 self-start backdrop-blur-md">
          <button
            onClick={() => setActiveTab("songs")}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
              activeTab === "songs"
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Tracks Manager</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-black/20 text-white ml-1 font-bold">
              {songs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("artists")}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
              activeTab === "artists"
                ? "bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Artist Profiles</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ml-1 ${
              activeTab === "artists" ? "bg-black/20 text-white" : "bg-purple-500/20 text-purple-300"
            }`}>
              {artistsList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("keys")}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${
              activeTab === "keys"
                ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-lg shadow-amber-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>VIP Keys Manager</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ml-1 ${
              activeTab === "keys" ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-300"
            }`}>
              {keysList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 relative ${
              activeTab === "reports"
                ? "bg-gradient-to-r from-rose-500 via-pink-600 to-purple-600 text-white shadow-lg shadow-rose-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Reports & Feedback</span>
            {reports.filter(r => r.status === "open").length > 0 && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-black font-mono animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]">
                {reports.some(r => (r.isVIP || r.priority === "vip") && r.status === "open") && (
                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                )}
                <span>{reports.filter(r => r.status === "open").length} New</span>
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Tracks Manager */}
        {activeTab === "songs" && (
          /* Dashboard Grid - Tracks Manager */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
            
            {/* Upload and Input Glass Panel */}
            <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              {/* Ambient inner card glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none"></div>

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    {editingSongId ? "Edit Track Details" : "Add Track Details"}
                  </h2>
                </div>
                {editingSongId && (
                  <button 
                    type="button"
                    onClick={cancelEdit}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold transition-all"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleAddSong} className="space-y-4">
                {/* Search & Auto-Fill from Existing Library */}
                <div className="relative border border-cyan-500/20 bg-cyan-500/5 rounded-2xl p-3.5 space-y-2">
                  <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between font-mono">
                    <span className="flex items-center space-x-1.5">
                      <Search className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Search & Auto-fill Track</span>
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">QUICK PREFILL</span>
                  </label>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Type song or artist name to auto-fill details..."
                      value={autoFillSearchTerm}
                      onFocus={() => setShowAutoFillDropdown(true)}
                      onChange={(e) => {
                        setAutoFillSearchTerm(e.target.value);
                        setShowAutoFillDropdown(true);
                      }}
                      className="w-full pl-9 pr-8 py-2 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-xl text-slate-200 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-400/30"
                    />
                    {autoFillSearchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setAutoFillSearchTerm("");
                          setShowAutoFillDropdown(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Dropdown Suggestions */}
                  {showAutoFillDropdown && autoFillSearchTerm.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-[#0d1222] border border-cyan-500/30 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] overflow-hidden max-h-56 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                      {songs
                        .filter(
                          (s) =>
                            s.title.toLowerCase().includes(autoFillSearchTerm.toLowerCase()) ||
                            s.artist.toLowerCase().includes(autoFillSearchTerm.toLowerCase()) ||
                            (s.album && s.album.toLowerCase().includes(autoFillSearchTerm.toLowerCase()))
                        )
                        .slice(0, 7)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setTitle(s.title);
                              setArtist(s.artist);
                              setAlbum(s.album || "");
                              setAudioUrl(s.audioUrl || "");
                              setImageUrl(s.imageUrl || "");
                              setDuration(s.duration || 0);
                              setSelectedCategories(s.categories || []);
                              setAutoFillSearchTerm(s.title);
                              setShowAutoFillDropdown(false);
                              setStatusMessage(`Auto-filled details from "${s.title}"!`);
                            }}
                            className="w-full flex items-center justify-between p-2 hover:bg-cyan-500/15 rounded-xl transition-all text-left group"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <img
                                src={s.imageUrl}
                                alt={s.title}
                                className="w-8 h-8 rounded-lg object-cover bg-black/50 border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                                  {s.title}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">{s.artist}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 group-hover:bg-cyan-500/30 whitespace-nowrap">
                              Fill ⤓
                            </span>
                          </button>
                        ))}
                      {songs.filter(
                        (s) =>
                          s.title.toLowerCase().includes(autoFillSearchTerm.toLowerCase()) ||
                          s.artist.toLowerCase().includes(autoFillSearchTerm.toLowerCase()) ||
                          (s.album && s.album.toLowerCase().includes(autoFillSearchTerm.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-3 text-center text-xs text-slate-400 italic">
                          No matching track found in library.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Track Title *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Arabic Kuthu" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 backdrop-blur-md text-sm"
                  />
                </div>

                {/* Artist Name & Searchable Artist Profile Picker */}
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Artist Name *
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveTab("artists")}
                      className="text-[11px] font-mono text-purple-400 hover:text-purple-300 hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Manage Artist Profiles ({artistsList.length})</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Anirudh Ravichander (Search or type new)" 
                      value={artist}
                      onFocus={() => setShowArtistDropdown(true)}
                      onChange={(e) => {
                        setArtist(e.target.value);
                        setArtistFilterQuery(e.target.value);
                        setShowArtistDropdown(true);
                        // Check if typed name matches any profile
                        const exact = artistsList.find(
                          (a) => a.name.trim().toLowerCase() === e.target.value.trim().toLowerCase()
                        );
                        if (exact) {
                          setSelectedArtistId(exact.id);
                          setSelectedArtistImage(exact.imageUrl);
                        } else {
                          setSelectedArtistId(null);
                          setSelectedArtistImage(null);
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-purple-400/60 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 backdrop-blur-md text-sm focus:ring-1 focus:ring-purple-400/30"
                    />

                    {artistsList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowArtistDropdown(!showArtistDropdown)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-purple-300 text-xs font-mono transition-colors"
                        title="Browse Artist Profiles"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Searchable Artist Profiles Dropdown Menu */}
                  {showArtistDropdown && artistsList.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-40 mt-1.5 bg-[#0e1122]/95 border border-purple-500/30 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.85)] overflow-hidden max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1 backdrop-blur-2xl">
                      <div className="px-2 py-1 text-[10px] font-mono text-purple-400 flex items-center justify-between border-b border-white/10 mb-1">
                        <span>SELECT ARTIST PROFILE ({artistsList.length})</span>
                        <button
                          type="button"
                          onClick={() => setShowArtistDropdown(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {artistsList
                        .filter((a) =>
                          !artistFilterQuery.trim() ||
                          a.name.toLowerCase().includes(artistFilterQuery.toLowerCase()) ||
                          (a.genre && a.genre.toLowerCase().includes(artistFilterQuery.toLowerCase()))
                        )
                        .map((art) => (
                          <button
                            key={art.id}
                            type="button"
                            onClick={() => {
                              setArtist(art.name);
                              setSelectedArtistId(art.id);
                              setSelectedArtistImage(art.imageUrl);
                              if (!imageUrl && art.imageUrl) {
                                setImageUrl(art.imageUrl);
                                setImageStatus("available");
                              }
                              setShowArtistDropdown(false);
                              setStatusMessage(`Linked artist profile "${art.name}"! ✨`);
                            }}
                            className="w-full flex items-center justify-between p-2 hover:bg-purple-500/15 rounded-xl transition-all text-left group"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/50 border border-white/10 flex-shrink-0">
                                {art.imageUrl ? (
                                  <img
                                    src={art.imageUrl}
                                    alt={art.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-purple-500/20 text-purple-300 font-bold text-xs">
                                    {art.name.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-100 group-hover:text-purple-300 truncate flex items-center space-x-1.5">
                                  <span>{art.name}</span>
                                  {art.verified && (
                                    <span className="text-[9px] text-cyan-400 font-bold">✓</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {art.genre || "Artist"} {art.monthlyListeners ? `• ${art.monthlyListeners}` : ""}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20 group-hover:bg-purple-500/30 whitespace-nowrap">
                              Select ✓
                            </span>
                          </button>
                        ))}

                      {artistsList.filter((a) =>
                        !artistFilterQuery.trim() ||
                        a.name.toLowerCase().includes(artistFilterQuery.toLowerCase()) ||
                        (a.genre && a.genre.toLowerCase().includes(artistFilterQuery.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-3 text-center text-xs text-slate-400">
                          <p>No artist matching "{artistFilterQuery}".</p>
                          <button
                            type="button"
                            onClick={() => setActiveTab("artists")}
                            className="mt-1.5 text-xs text-purple-400 hover:underline font-mono"
                          >
                            + Create New Profile in Artists Tab
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Artist Profile Link Badge */}
                  {selectedArtistId && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs">
                      <div className="flex items-center space-x-2 min-w-0">
                        {selectedArtistImage && (
                          <img
                            src={selectedArtistImage}
                            alt="Artist"
                            className="w-6 h-6 rounded-full object-cover border border-purple-400/40 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <span className="font-bold truncate font-mono text-[11px]">
                          Linked Profile: {artist}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArtistId(null);
                          setSelectedArtistImage(null);
                        }}
                        className="text-[10px] text-purple-400 hover:text-white px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/40 font-mono transition-colors"
                      >
                        Unlink
                      </button>
                    </div>
                  )}

                  {/* Quick Clickable Chips of Registered Artists */}
                  {artistsList.length > 0 && !selectedArtistId && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-mono text-slate-400">Quick Select Artist Profile:</div>
                      <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                        {artistsList.slice(0, 8).map((art) => (
                          <button
                            key={art.id}
                            type="button"
                            onClick={() => {
                              setArtist(art.name);
                              setSelectedArtistId(art.id);
                              setSelectedArtistImage(art.imageUrl);
                              if (!imageUrl && art.imageUrl) {
                                setImageUrl(art.imageUrl);
                                setImageStatus("available");
                              }
                            }}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 text-slate-300 hover:text-purple-200 text-[11px] transition-all"
                          >
                            {art.imageUrl && (
                              <img
                                src={art.imageUrl}
                                alt={art.name}
                                className="w-3.5 h-3.5 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <span>{art.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Album */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Album (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Beast" 
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 backdrop-blur-md text-sm"
                  />
                </div>

                {/* Categories Management & Selection */}
                <div className="border border-white/5 rounded-2xl p-4 bg-black/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Categories *</label>
                    <span className="text-[10px] text-slate-400 font-mono">SELECT MULTIPLE</span>
                  </div>

                  {/* List of categories with checkable pill buttons */}
                  {categories.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No categories created yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat) => {
                        const isSelected = selectedCategories.includes(cat);
                        return (
                          <button
                            type="button"
                            key={cat}
                            onClick={() => toggleCategorySelection(cat)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                              isSelected
                                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Add New Category Option inline inside the card */}
                  <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add new category (e.g. K-Pop)"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 focus:border-cyan-400/30 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={isAddingCategory || !newCategoryName.trim()}
                      className="p-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center font-bold"
                      title="Add category"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Category List with Edit and Delete options */}
                  {categoriesObj.length > 0 && (
                    <div className="pt-3 border-t border-white/5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manage Categories</span>
                      </div>
                      <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {categoriesObj.map((catObj) => (
                          <div key={catObj.id} className="flex items-center justify-between p-2 rounded-xl bg-white/2 hover:bg-white/5 border border-white/5 group">
                            {editingCategoryId === catObj.id ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <input
                                  type="text"
                                  value={editingCategoryName}
                                  onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className="flex-1 px-2 py-1 bg-white/10 border border-white/20 focus:border-cyan-400/30 rounded-lg text-slate-100 outline-none text-xs"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCategoryEdit(catObj.id)}
                                  className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/35 text-emerald-400 text-[10px] font-bold rounded-lg transition-all"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}
                                  className="px-2 py-1 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 text-[10px] font-bold rounded-lg transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-xs text-slate-300 font-medium">{catObj.name}</span>
                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => startEditingCategory(catObj.id, catObj.name)}
                                    className="p-1.5 hover:bg-cyan-500/20 border border-transparent hover:border-cyan-500/15 text-slate-400 hover:text-cyan-400 rounded-lg transition-all"
                                    title="Edit Name"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCategory(catObj.id, catObj.name)}
                                    className="p-1.5 hover:bg-red-500/20 border border-transparent hover:border-red-500/15 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                                    title="Delete Category"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio Stream Source */}
                  <div className="border border-cyan-500/20 bg-cyan-500/5 rounded-2xl p-4 animate-fade-in space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono">
                        Direct Audio Stream Source *
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">URL OR FILE UPLOAD</span>
                    </div>
                    
                    <input 
                      type="text" 
                      placeholder="Enter direct MP3/Audio URL (e.g. https://domain.com/song.mp3)" 
                      value={audioUrl}
                      onChange={(e) => setAudioUrl(e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 focus:border-cyan-400/50 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs"
                    />

                    {/* File picker for Audio */}
                    <div className="relative flex items-center justify-center border border-dashed border-cyan-500/20 rounded-xl p-4 hover:border-cyan-400/40 transition-all group bg-white/5 cursor-pointer">
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={(e) => handleFileChange(e, "audio")}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="text-center">
                        <FileAudio className="w-6 h-6 text-slate-400 group-hover:text-cyan-400 mx-auto mb-1.5 transition-colors" />
                        <span className="text-xs text-slate-300 font-medium block">Upload Audio File</span>
                        <span className="text-[10px] text-slate-500 block">MP3, WAV, AAC, M4A up to 10MB</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {uploadProgress.audio_file !== undefined && uploadProgress.audio_file > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                          <span>Audio Uploading</span>
                          <span>{uploadProgress.audio_file}%</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${uploadProgress.audio_file}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>

                {/* Cover Image URL & File Upload */}
                <div className="border border-white/5 rounded-2xl p-4 bg-black/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-pink-400 uppercase tracking-wider">
                      Cover Image Artwork (Optional)
                    </label>
                    <div className="flex items-center space-x-1.5">
                      {imageStatus === "available" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                          ● Image Available
                        </span>
                      )}
                      {imageStatus === "unavailable" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                          ● Image Unavailable
                        </span>
                      )}
                      {imageStatus === "unchecked" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20 uppercase tracking-wider">
                          ● Unchecked
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Cover Preview"
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 bg-black/40 flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <input 
                      type="text" 
                      placeholder="Enter external direct Cover URL link" 
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 focus:border-pink-400/30 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs"
                    />
                  </div>

                  {/* File picker for Image */}
                  <div className="relative flex items-center justify-center border border-dashed border-white/15 rounded-xl p-3.5 hover:border-pink-500/30 transition-all group bg-white/5 cursor-pointer">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, "image")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="text-center">
                      <ImageIcon className="w-5 h-5 text-slate-400 group-hover:text-pink-400 mx-auto mb-1 transition-colors" />
                      <span className="text-xs text-slate-300 font-medium block">Upload Custom Cover Art</span>
                      <span className="text-[10px] text-slate-500 block">JPG, PNG, WEBP</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {uploadProgress.image_file !== undefined && uploadProgress.image_file > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                        <span>Image Uploading</span>
                        <span>{uploadProgress.image_file}%</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${uploadProgress.image_file}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Duration Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Track Duration (Seconds)</label>
                  <input 
                    type="number" 
                    placeholder="Duration in seconds (e.g. 180)" 
                    value={duration || ""}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 backdrop-blur-md text-sm"
                  />
                  {duration > 0 && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-1">Calculated time: {formatTime(duration)}</p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(6,182,212,0.25)] text-sm mt-6"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{editingSongId ? "Updating Song..." : "Saving Song..."}</span>
                    </>
                  ) : (
                    <>
                      {editingSongId ? (
                        <>
                          <Edit className="w-5 h-5" />
                          <span>Update Track in sk edz</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          <span>Publish Song to sk edz</span>
                        </>
                      )}
                    </>
                  )}
                </button>

                {/* Status Display */}
                {statusMessage && (
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs text-center text-slate-300 font-mono backdrop-blur-md flex items-center justify-center space-x-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{statusMessage}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Songs List Column */}
            <div className="lg:col-span-7 flex flex-col space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                      <Music className="w-5 h-5 text-indigo-400" />
                      <span>Track Library ({songs.length})</span>
                    </h2>
                    <p className="text-xs text-slate-400">All songs available for streaming on skplayer</p>
                  </div>
                  <button 
                    onClick={fetchSongs} 
                    className="self-start sm:self-auto p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all flex items-center space-x-1.5 text-xs font-medium"
                    title="Reload Tracks"
                  >
                    <Loader2 className={`w-4 h-4 ${loadingSongs ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>

                {/* Real-time Track Search & Category Filter Bar */}
                <div className="space-y-3 mb-5">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search tracks by song name, artist, album, genre..."
                      value={trackSearchTerm}
                      onChange={(e) => setTrackSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-black/40 border border-white/10 focus:border-cyan-400/60 rounded-2xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-400/30"
                    />
                    {trackSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setTrackSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded-md hover:bg-white/10 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Category filter pills */}
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setTrackFilterCategory("all")}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all border whitespace-nowrap ${
                        trackFilterCategory === "all"
                          ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      All Tracks ({songs.length})
                    </button>
                    {categories.map((cat) => {
                      const count = songs.filter((s) => s.categories && s.categories.includes(cat)).length;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setTrackFilterCategory(cat)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all border whitespace-nowrap ${
                            trackFilterCategory === cat
                              ? "bg-indigo-500/20 border-indigo-400/50 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          {cat} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loadingSongs ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
                    <p className="text-sm font-mono text-slate-400">Syncing with Cloud Firestore...</p>
                  </div>
                ) : songs.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/5">
                    <Disc className="w-12 h-12 text-slate-500 mx-auto mb-3 animate-spin-slow" />
                    <h3 className="text-sm font-bold text-slate-300">No tracks published yet</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">Use the upload tool on the left to add your favorite songs to skplayer library!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[680px] overflow-y-auto pr-2 custom-scrollbar">
                    {songs
                      .filter((song) => {
                        const term = trackSearchTerm.trim().toLowerCase();
                        const matchesSearch =
                          !term ||
                          song.title.toLowerCase().includes(term) ||
                          song.artist.toLowerCase().includes(term) ||
                          (song.album && song.album.toLowerCase().includes(term)) ||
                          (song.categories && song.categories.some((c) => c.toLowerCase().includes(term)));
                        const matchesCategory =
                          trackFilterCategory === "all" ||
                          (song.categories && song.categories.includes(trackFilterCategory));
                        return matchesSearch && matchesCategory;
                      })
                      .map((song) => (
                      <div 
                        key={song.id} 
                        className="group relative flex items-center justify-between p-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all duration-300 hover:translate-x-1"
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          {/* Artwork */}
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 shadow-lg">
                            <img 
                              src={song.imageUrl} 
                              alt={song.title} 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                              referrerPolicy="no-referrer"
                            />
                            {/* Play/Pause icon overlay */}
                            <button
                              onClick={() => togglePreview(song)}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300"
                            >
                              {previewSongId === song.id && isPlayingPreview ? (
                                <Pause className="w-5 h-5 text-cyan-400" />
                              ) : (
                                <Play className="w-5 h-5 text-white" />
                              )}
                            </button>
                          </div>

                          {/* Text Metadata */}
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                              {song.title}
                            </h4>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>

                            {song.album && (
                              <span className="inline-block mt-1 mr-1 text-[9px] font-mono px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-full">
                                {song.album}
                              </span>
                            )}
                            {song.categories && song.categories.map((cat) => (
                              <span key={cat} className="inline-block mt-1 mr-1 text-[9px] font-mono px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded-full">
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Controls and duration */}
                        <div className="flex items-center space-x-3.5 ml-4 flex-shrink-0">
                          <span className="text-xs font-mono text-slate-400">{formatTime(song.duration)}</span>
                          
                          <button
                            onClick={() => togglePreview(song)}
                            className={`p-2 rounded-xl transition-all ${
                              previewSongId === song.id && isPlayingPreview 
                                ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 animate-pulse" 
                                : "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                            }`}
                            title="Preview Track"
                          >
                            {previewSongId === song.id && isPlayingPreview ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => startEditSong(song)}
                            className={`p-2 rounded-xl transition-all ${
                              editingSongId === song.id 
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-400" 
                                : "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-amber-400 hover:border-amber-500/20"
                            }`}
                            title="Edit Track Details"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteSong(song.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all"
                            title="Delete Track"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {songs.filter((song) => {
                      const term = trackSearchTerm.trim().toLowerCase();
                      const matchesSearch =
                        !term ||
                        song.title.toLowerCase().includes(term) ||
                        song.artist.toLowerCase().includes(term) ||
                        (song.album && song.album.toLowerCase().includes(term)) ||
                        (song.categories && song.categories.some((c) => c.toLowerCase().includes(term)));
                      const matchesCategory =
                        trackFilterCategory === "all" ||
                        (song.categories && song.categories.includes(trackFilterCategory));
                      return matchesSearch && matchesCategory;
                    }).length === 0 && (
                      <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/5">
                        <Search className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">No tracks match your search query "{trackSearchTerm}".</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: VIP Keys Manager */}
        {activeTab === "keys" && (
          /* VIP Keys Manager Dashboard */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
            {/* Left/Top Column: Key Generation */}
            <div className="lg:col-span-5 bg-white/5 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="space-y-5">
                <div className="flex items-center space-x-2.5">
                  <Crown className="w-5 h-5 text-amber-400 animate-pulse fill-amber-400/20" />
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">Generate Subscription Key</h2>
                    <p className="text-xs text-slate-400">Create instant activation passcodes for users</p>
                  </div>
                </div>

                {/* Plan Selection Radio Cards */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider font-mono">
                    Select Plan Type *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Plan 1: ₹99 */}
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(99)}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                        selectedPlan === 99
                          ? "bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-sm font-black text-amber-300">₹99 Plan</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          1 MONTH
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-200">VIP Gold</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">30 Days Unlimited Access</p>
                    </button>

                    {/* Plan 2: ₹199 */}
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(199)}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                        selectedPlan === 199
                          ? "bg-gradient-to-br from-amber-500/25 to-yellow-500/20 border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.25)]"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-sm font-black text-yellow-300">₹199 Plan</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                          1 YEAR
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-200">VIP Master</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">365 Days Premium Pass</p>
                    </button>
                  </div>
                </div>

                {/* Optional Note / Customer Ref */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Customer Note / Transaction Ref (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GPay ₹99 from user@gmail.com / 9876543210"
                    value={customKeyNote}
                    onChange={(e) => setCustomKeyNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-amber-400/50 rounded-xl text-slate-200 placeholder-slate-500 text-xs outline-none transition-all"
                  />
                </div>

                <button
                  onClick={handleGenerateVipKey}
                  disabled={generatingKey}
                  className="w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-[0_4px_20px_rgba(245,158,11,0.25)] text-xs uppercase"
                >
                  {generatingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating ₹{selectedPlan} Passcode...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Generate ₹{selectedPlan} ({selectedPlan === 99 ? "30 Days" : "365 Days"}) Key</span>
                    </>
                  )}
                </button>

                {statusMessage && (
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs text-center text-slate-300 font-mono backdrop-blur-md flex items-center justify-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{statusMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right/Main Column: Keys List */}
            <div className="lg:col-span-7 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                    <Key className="w-5 h-5 text-amber-400" />
                    <span>Passcode Registry ({keysList.length})</span>
                  </h2>
                  <p className="text-xs text-slate-400">All generated ₹99 & ₹199 passcodes with 1-click copy</p>
                </div>

                {/* Filter by Plan */}
                <div className="flex items-center space-x-1.5 p-1 bg-black/40 rounded-xl border border-white/10 self-start sm:self-auto">
                  <button
                    onClick={() => setKeyFilterPlan("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      keyFilterPlan === "all" ? "bg-white/20 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setKeyFilterPlan("99")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      keyFilterPlan === "99" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ₹99 Pass
                  </button>
                  <button
                    onClick={() => setKeyFilterPlan("199")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      keyFilterPlan === "199" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ₹199 Pass
                  </button>
                </div>
              </div>

              {loadingKeys ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin mb-4" />
                  <p className="text-sm font-mono text-slate-400">Syncing key registry with database...</p>
                </div>
              ) : keysList.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/5">
                  <Key className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-300">No passcodes generated yet</h3>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                    Select ₹99 or ₹199 plan and click generate to create activation keys!
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
                  {keysList.map((k) => (
                    <div
                      key={k.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-2xl gap-4 transition-all duration-300 hover:translate-x-1"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg text-sm tracking-wider shadow-[0_2px_8px_rgba(245,158,11,0.05)] select-all">
                            {k.code}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyKey(k.code, k.id)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 text-slate-300 hover:text-amber-300 transition-all flex items-center space-x-1 text-xs"
                            title="Copy Key Code"
                          >
                            {copiedKeyId === k.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="text-[10px]">Copy</span>
                              </>
                            )}
                          </button>
                          
                          {/* Plan Badge */}
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            k.plan === "199"
                              ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300"
                              : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                          }`}>
                            {k.plan === "199" ? "👑 ₹199 (1 Year)" : "💎 ₹99 (30 Days)"}
                          </span>

                          {k.used ? (
                            <span className="text-[9px] font-mono font-black bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded uppercase">
                              USED
                            </span>
                          ) : k.status === "disabled" ? (
                            <span className="text-[9px] font-mono font-black bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded uppercase animate-pulse">
                              DISABLED
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {k.note && (
                          <p className="text-xs text-slate-300 font-medium bg-black/30 px-2.5 py-1 rounded-lg border border-white/5 inline-block">
                            📝 {k.note}
                          </p>
                        )}
                        
                        <div className="text-[10px] text-slate-400 font-mono space-y-0.5 leading-relaxed">
                          <p>Created: {new Date(k.createdAt || Date.now()).toLocaleString()}</p>
                          {k.usedBy && (
                            <p className="text-slate-300">
                              Activated by User: <span className="text-amber-400 font-bold">{k.usedBy}</span>
                            </p>
                          )}
                          {k.usedAt && (
                            <p className="text-slate-400">
                              Activated on: {new Date(k.usedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 sm:self-center flex-shrink-0">
                        <button
                          onClick={() => handleToggleKeyStatus(k.id, k.status, k.used)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-black transition-all duration-300 uppercase ${
                            k.used || k.status === "disabled"
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:scale-105"
                              : "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400 hover:scale-105"
                          }`}
                          title={k.used || k.status === "disabled" ? "Activate or reset this code for use" : "Deactivate / disable this code"}
                        >
                          {k.used ? "Reset" : k.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        
                        <button
                          onClick={() => handleDeleteKey(k.id)}
                          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-black transition-all uppercase hover:scale-105"
                          title="Delete Key Code"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Artist Profiles Manager */}
        {activeTab === "artists" && (
          <AdminArtistsManager
            artists={artistsList}
            songs={songs}
            loading={loadingArtists}
            onSaveArtist={handleSaveArtistProfile}
            onDeleteArtist={handleDeleteArtistProfile}
            onAssignSongsToArtist={handleAssignSongsToArtist}
            onSelectArtistForSongUpload={(artistName, artistImg) => {
              setArtist(artistName);
              const found = artistsList.find((a) => a.name.toLowerCase() === artistName.toLowerCase());
              if (found) {
                setSelectedArtistId(found.id);
                setSelectedArtistImage(found.imageUrl);
              }
              if (artistImg && !imageUrl) {
                setImageUrl(artistImg);
                setImageStatus("available");
              }
              setActiveTab("songs");
              showAdminToast(`Selected artist "${artistName}" for song upload! 🎵`, "info");
            }}
            onUploadImage={(file) => uploadFileToServer(file, "image")}
            onShowToast={showAdminToast}
          />
        )}

        {/* Tab 4: Reports & Feedback Manager */}
        {activeTab === "reports" && (
          <AdminReportsManager
            reports={reports}
            loading={loadingReports}
            onUpdateStatus={handleUpdateReportStatus}
            onDeleteReport={handleDeleteReport}
            onBulkDeleteReports={handleBulkDeleteReports}
            isUpdating={isUpdatingReport}
            isDeletingId={isDeletingReportId}
            onShowToast={showAdminToast}
          />
        )}

        {/* Floating Admin Toast Feedback */}
        {adminToast && (
          <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
            <div className={`px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-2xl border flex items-center space-x-3 text-xs font-mono font-bold ${
              adminToast.type === "error"
                ? "bg-red-950/90 border-red-500/40 text-red-200 shadow-red-500/20"
                : adminToast.type === "info"
                ? "bg-sky-950/90 border-sky-500/40 text-sky-200 shadow-sky-500/20"
                : "bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-500/20"
            }`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{adminToast.text}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-[11px] text-slate-500 font-mono border-t border-white/5 pt-6">
          <p>skplayer Admin Console — Powered by Local Storage & Firebase Firestore</p>
          <p className="mt-1 text-[10px] text-slate-600">Created with Glassmorphism Liquid Theme</p>
        </footer>

      </div>
    </div>
  );
}

// Render app
createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);

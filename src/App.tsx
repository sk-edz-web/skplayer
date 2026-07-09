import React, { useState, useEffect, useRef } from "react";
import { 
  db, 
  auth, 
  OperationType, 
  handleFirestoreError 
} from "./firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy 
} from "firebase/firestore";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { 
  Music, 
  Search, 
  ListMusic, 
  User as UserIcon, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Shuffle, 
  Repeat, 
  Plus, 
  Disc, 
  FolderPlus, 
  Sliders, 
  Check, 
  UserCheck, 
  LogOut, 
  Upload,
  UploadCloud, 
  Trash2, 
  Sparkles,
  ExternalLink,
  Loader2,
  ChevronRight,
  ChevronDown,
  Info,
  FolderOpen,
  FileAudio,
  Crown,
  Key,
  Download,
  DownloadCloud,
  Settings,
  Paintbrush,
  X
} from "lucide-react";
import { Song, Playlist, UserProfile } from "./types";
import AuthPanel from "./components/AuthPanel";
import MobilePlayerOverlay from "./components/MobilePlayerOverlay";
import EqualizerModal, { EqSettings } from "./components/EqualizerModal";
import { saveLocalSong, getLocalSongs, deleteLocalSong, clearLocalSongs } from "./lib/localDb";

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

export default function App() {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<"home" | "search" | "playlist" | "account" | "local">("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [genreFilter, setGenreFilter] = useState("All");

  // Authentication State
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Upgrade popup state and logic
  const [isUpgradePopupOpen, setIsUpgradePopupOpen] = useState(false);
  const [upgradePopupMessage, setUpgradePopupMessage] = useState("");

  const isGoldActive = !!(userProfile?.isPro && userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());

  const triggerUpgradePopup = (message: string) => {
    const hidePopupSetting = localStorage.getItem("skplayer_hide_upgrade_popup");
    if (hidePopupSetting === "true") {
      console.log("Upgrade popup suppressed by user preference.");
      return;
    }
    setUpgradePopupMessage(message);
    setIsUpgradePopupOpen(true);
  };

  // Database Music State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistDeleteConfirmId, setPlaylistDeleteConfirmId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);

  // Playback States
  const [currentQueue, setCurrentQueue] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"normal" | "loop-one" | "loop-all" | "shuffle">("normal");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Interactive Overlays/Modals
  const [isMobileOverlayOpen, setIsMobileOverlayOpen] = useState(false);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [eqSettings, setEqSettings] = useState<EqSettings>(() => {
    try {
      const saved = localStorage.getItem("skplayer_eq_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          preset: parsed.preset || "Normal",
          bands: parsed.bands || { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 },
          goldBassActive: parsed.goldBassActive !== undefined ? parsed.goldBassActive : false
        };
      }
    } catch (e) {}
    return {
      preset: "Normal",
      bands: { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 },
      goldBassActive: false
    };
  });
  const [playlistDropdownOpen, setPlaylistDropdownOpen] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistThumbnail, setNewPlaylistThumbnail] = useState("");
  const [pfpProgress, setPfpProgress] = useState(0);
  const [pfpMessage, setPfpMessage] = useState("");
  const [pfpUrlInput, setPfpUrlInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // VIP Key Activation State
  const [proKeyInput, setProKeyInput] = useState("");
  const [proKeyLoading, setProKeyLoading] = useState(false);
  const [proKeyError, setProKeyError] = useState("");
  const [proKeySuccess, setProKeySuccess] = useState("");

  // System Configuration, PWA & Swipe States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedSettingCategory, setExpandedSettingCategory] = useState<"theme" | "audio" | "app" | "account" | null>("theme");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() => {
    return localStorage.getItem("skplayer_pwa_installed") === "true" || 
           (typeof window !== "undefined" && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  });

  // Setup PWA Installation prompt listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  // Custom Themes & Quality Settings States
  const [selectedTheme, setSelectedTheme] = useState<"default" | "dark" | "gold" | "liquid">(() => {
    const saved = localStorage.getItem("skplayer_theme");
    if (saved === "light") return "default";
    return (saved as any) || "default";
  });
  const [glassEffectEnabled, setGlassEffectEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("skplayer_glass_effect");
    return saved !== "false";
  });
  const [goldUiStyle, setGoldUiStyle] = useState<"royal" | "metallic">(() => {
    return (localStorage.getItem("skplayer_gold_ui_style") as any) || "royal";
  });
  const [audioQuality, setAudioQuality] = useState<"128" | "320">("128");
  const [settingsSubTab, setSettingsSubTab] = useState<"theme" | "audio" | "account">("theme");

  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Gold specific customization options
  const [goldGlitterEnabled, setGoldGlitterEnabled] = useState<boolean>(() => {
    return localStorage.getItem("skplayer_gold_glitter") !== "false";
  });
  const [goldBordersEnabled, setGoldBordersEnabled] = useState<boolean>(() => {
    return localStorage.getItem("skplayer_gold_borders") !== "false";
  });
  const [goldTextAccentsEnabled, setGoldTextAccentsEnabled] = useState<boolean>(() => {
    return localStorage.getItem("skplayer_gold_text_accents") !== "false";
  });

  // Helper to convert File to Base64
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // ImgBB direct file upload function via server-side proxy
  const uploadToImgBB = async (file: File): Promise<string> => {
    try {
      const base64 = await toBase64(file);
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: base64,
          presetType: "playlist",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload image via server proxy.");
      }
      
      const data = await response.json();
      return data.secure_url;
    } catch (err: any) {
      console.error("ImgBB proxy upload failed:", err);
      throw err;
    }
  };

  // Persist settings
  useEffect(() => {
    localStorage.setItem("skplayer_theme", selectedTheme);
  }, [selectedTheme]);



  useEffect(() => {
    localStorage.setItem("skplayer_glass_effect", String(glassEffectEnabled));
  }, [glassEffectEnabled]);

  useEffect(() => {
    localStorage.setItem("skplayer_gold_ui_style", goldUiStyle);
  }, [goldUiStyle]);

  useEffect(() => {
    localStorage.setItem("skplayer_gold_glitter", String(goldGlitterEnabled));
  }, [goldGlitterEnabled]);

  useEffect(() => {
    localStorage.setItem("skplayer_gold_borders", String(goldBordersEnabled));
  }, [goldBordersEnabled]);

  useEffect(() => {
    localStorage.setItem("skplayer_gold_text_accents", String(goldTextAccentsEnabled));
  }, [goldTextAccentsEnabled]);

  // Local File Player State
  const [localSongs, setLocalSongs] = useState<Song[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  // Local files processing
  const handleLocalFilesSelect = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: File[] = [];
    if ("files" in e && e.files) {
      files = Array.from(e.files);
    } else if ("target" in e && e.target && "files" in e.target && e.target.files) {
      files = Array.from(e.target.files);
    } else if ("dataTransfer" in e && e.dataTransfer) {
      files = Array.from(e.dataTransfer.files);
    }
    
    if (files.length === 0) return;
    setLoadingLocal(true);

    const loadedSongs: Song[] = [];

    for (const file of files) {
      if (!file.type.startsWith("audio/")) continue;

      // Create local blob URL
      const audioUrl = URL.createObjectURL(file);
      
      // Attempt to read audio duration
      let audioDuration = 180; // Default 3 minutes fallback
      try {
        audioDuration = await new Promise<number>((resolve) => {
          const audio = new Audio();
          audio.src = audioUrl;
          audio.addEventListener("loadedmetadata", () => {
            resolve(audio.duration);
          });
          audio.addEventListener("error", () => {
            resolve(180);
          });
          setTimeout(() => resolve(180), 4000);
        });
      } catch (err) {
        console.warn("Failed to get duration:", err);
      }

      // Read ID3 metadata
      let meta: ID3Metadata = {};
      try {
        const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          const slice = file.slice(0, 512 * 1024);
          reader.readAsArrayBuffer(slice);
        });
        meta = parseID3Tags(buffer);
      } catch (err) {
        console.warn("Failed to parse file array buffer", err);
      }

      const songTitle = meta.title || file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const songArtist = meta.artist || "Device Audio File";
      const songAlbum = meta.album || "Local Storage";
      const songImageUrl = meta.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80";
      const songId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const newSong: Song = {
        id: songId,
        title: songTitle,
        artist: songArtist,
        album: songAlbum,
        audioUrl: audioUrl,
        imageUrl: songImageUrl,
        duration: audioDuration,
        createdAt: Date.now()
      };

      // Save to IndexedDB for offline persistence
      try {
        await saveLocalSong({
          id: songId,
          title: songTitle,
          artist: songArtist,
          album: songAlbum,
          duration: audioDuration,
          file: file,
          imageUrl: songImageUrl,
          createdAt: newSong.createdAt
        });
      } catch (err) {
        console.error("Failed to save local song to IndexedDB:", err);
      }

      loadedSongs.push(newSong);
    }

    if (loadedSongs.length > 0) {
      setLocalSongs((prev) => [...prev, ...loadedSongs]);
      // Also automatically set queue if queue is empty or if we want to play them
      setCurrentQueue((prev) => {
        if (prev.length === 0) return loadedSongs;
        return prev;
      });
    }
    setLoadingLocal(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleLocalFilesSelect(e);
  };

  const removeLocalSong = async (id: string) => {
    setLocalSongs((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      // Revoke the object URL to free browser memory
      const song = prev.find((s) => s.id === id);
      if (song && song.audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(song.audioUrl);
      }
      return updated;
    });
    try {
      await deleteLocalSong(id);
    } catch (err) {
      console.error("Failed to delete local song from IndexedDB:", err);
    }
  };

  const clearAllLocalSongs = async () => {
    localSongs.forEach((song) => {
      if (song.audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(song.audioUrl);
      }
    });
    setLocalSongs([]);
    try {
      await clearLocalSongs();
    } catch (err) {
      console.error("Failed to clear local songs from IndexedDB:", err);
    }
  };

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Web Audio Equalizer Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const goldenBassFilterRef = useRef<BiquadFilterNode | null>(null);
  const goldenBassPeakingRef = useRef<BiquadFilterNode | null>(null);
  const preampNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  
  // Synchronized refs to allow persistent Audio element listener to access fresh states without teardown
  const currentQueueRef = useRef<Song[]>([]);
  const currentSongIndexRef = useRef<number>(-1);
  const playbackModeRef = useRef<"normal" | "loop-one" | "loop-all" | "shuffle">("normal");
  const activeAudioIdRef = useRef<string | null>(null);

  // Sync EQ Settings and Audio Quality with Web Audio API filters & localStorage
  useEffect(() => {
    localStorage.setItem("skplayer_eq_settings", JSON.stringify(eqSettings));
    
    if (filtersRef.current.length === 5) {
      try {
        const ctx = audioContextRef.current;
        if (ctx) {
          const now = ctx.currentTime;
          
          // Apply Audio Quality adjustments
          // 320kbps has crisp highs and deep bass. 128kbps is flatter and slightly muffled
          const qualityBassBoost = audioQuality === "320" ? 3.5 : -1.0;
          const qualityTrebleBoost = audioQuality === "320" ? 3.0 : -3.5;
          const qualityPreamp = audioQuality === "320" ? 1.15 : 0.85;

          filtersRef.current[0].gain.setTargetAtTime(eqSettings.bands.hz60 + qualityBassBoost, now, 0.02);
          filtersRef.current[1].gain.setTargetAtTime(eqSettings.bands.hz230, now, 0.02);
          filtersRef.current[2].gain.setTargetAtTime(eqSettings.bands.hz910, now, 0.02);
          filtersRef.current[3].gain.setTargetAtTime(eqSettings.bands.hz4k, now, 0.02);
          filtersRef.current[4].gain.setTargetAtTime(eqSettings.bands.hz14k + qualityTrebleBoost, now, 0.02);
          
          const activeGoldBass = isGoldActive && eqSettings.goldBassActive;

          const maxBoost = Math.max(
            0,
            eqSettings.bands.hz60,
            eqSettings.bands.hz230,
            eqSettings.bands.hz910,
            eqSettings.bands.hz4k,
            eqSettings.bands.hz14k
          );
          
          let basePreamp = 1.0;
          if (activeGoldBass) {
            basePreamp = 0.08; // Headroom optimized for massive sub-bass boost
          } else if (maxBoost > 0) {
            basePreamp = Math.max(0.25, 1 / (1 + (maxBoost * 0.18)));
          }

          if (goldenBassFilterRef.current) {
            const baseBass = activeGoldBass ? 20.0 : 0.0; // Extreme gold subwoofer boost
            goldenBassFilterRef.current.gain.setTargetAtTime(baseBass + (audioQuality === "320" ? 2.0 : 0.0), now, 0.03);
          }
          if (goldenBassPeakingRef.current) {
            const basePeak = activeGoldBass ? 15.5 : 0.0; // Heavy punchy kick bass
            goldenBassPeakingRef.current.gain.setTargetAtTime(basePeak + (audioQuality === "320" ? 1.5 : 0.0), now, 0.03);
          }
          if (preampNodeRef.current) {
            // Lower preamp smoothly when active to prevent any crackling/distortion, scaled by audio quality
            preampNodeRef.current.gain.setTargetAtTime(basePreamp * qualityPreamp, now, 0.03);
          }
        } else {
          // Fallback if context is not active yet
          const qualityBassBoost = audioQuality === "320" ? 3.5 : -1.0;
          const qualityTrebleBoost = audioQuality === "320" ? 3.0 : -3.5;
          const qualityPreamp = audioQuality === "320" ? 1.15 : 0.85;

          filtersRef.current[0].gain.value = eqSettings.bands.hz60 + qualityBassBoost;
          filtersRef.current[1].gain.value = eqSettings.bands.hz230;
          filtersRef.current[2].gain.value = eqSettings.bands.hz910;
          filtersRef.current[3].gain.value = eqSettings.bands.hz4k;
          filtersRef.current[4].gain.value = eqSettings.bands.hz14k + qualityTrebleBoost;
          
          const activeGoldBass = isGoldActive && eqSettings.goldBassActive;

          const maxBoost = Math.max(
            0,
            eqSettings.bands.hz60,
            eqSettings.bands.hz230,
            eqSettings.bands.hz910,
            eqSettings.bands.hz4k,
            eqSettings.bands.hz14k
          );
          
          let basePreamp = 1.0;
          if (activeGoldBass) {
            basePreamp = 0.14;
          } else if (maxBoost > 0) {
            basePreamp = Math.max(0.25, 1 / (1 + (maxBoost * 0.18)));
          }

          if (goldenBassFilterRef.current) {
            goldenBassFilterRef.current.gain.value = (activeGoldBass ? 12.0 : 0.0) + (audioQuality === "320" ? 2.0 : 0.0);
          }
          if (goldenBassPeakingRef.current) {
            goldenBassPeakingRef.current.gain.value = (activeGoldBass ? 9.5 : 0.0) + (audioQuality === "320" ? 1.5 : 0.0);
          }
          if (preampNodeRef.current) {
            preampNodeRef.current.gain.value = basePreamp * qualityPreamp;
          }
        }
      } catch (e) {
        console.warn("Failed to set filter gain value:", e);
      }
    }
  }, [eqSettings, audioQuality, isGoldActive]);

  const initAudioContext = () => {
    if (audioContextRef.current) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    try {
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      
      if (audioRef.current) {
        // Set crossOrigin to anonymous to route external streams through AudioContext if permitted
        audioRef.current.crossOrigin = "anonymous";
        
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        
        const frequencies = [60, 230, 910, 4000, 14000];
        const filters = frequencies.map((freq, index) => {
          const filter = ctx.createBiquadFilter();
          if (index === 0) {
            filter.type = "lowshelf";
          } else if (index === frequencies.length - 1) {
            filter.type = "highshelf";
          } else {
            filter.type = "peaking";
          }
          filter.frequency.value = freq;
          filter.Q.value = 1.0;
          return filter;
        });
        
        filtersRef.current = filters;
        
        // Connect Source -> Preamp -> GoldBassLowshelf -> GoldBassPeaking -> F0 -> F1 -> F2 -> F3 -> F4 -> Compressor -> Destination
        const isGoldBassFilterActive = isGoldActive && eqSettings.goldBassActive;

        const preampNode = ctx.createGain();
        preampNode.gain.value = isGoldBassFilterActive ? 0.08 : 1.0;
        preampNodeRef.current = preampNode;

        const goldBassFilter = ctx.createBiquadFilter();
        goldBassFilter.type = "lowshelf";
        goldBassFilter.frequency.value = 55; // Deep rumble sub-bass
        goldBassFilter.Q.value = 1.0;
        goldBassFilter.gain.value = isGoldBassFilterActive ? 20.0 : 0.0;
        goldenBassFilterRef.current = goldBassFilter;

        const goldenBassPeaking = ctx.createBiquadFilter();
        goldenBassPeaking.type = "peaking";
        goldenBassPeaking.frequency.value = 70; // Punchy kick bass
        goldenBassPeaking.Q.value = 1.0;
        goldenBassPeaking.gain.value = isGoldBassFilterActive ? 15.5 : 0.0;
        goldenBassPeakingRef.current = goldenBassPeaking;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18.0; // Professional headroom prevents digital clipping completely
        compressor.knee.value = 30.0; // Ultra-smooth soft knee
        compressor.ratio.value = 8.0; // Strong limiter ratio to prevent volume crackling
        compressor.attack.value = 0.005; // 5ms attack to catch sharp sub-bass waves instantly
        compressor.release.value = 0.150; // 150ms release prevents pumping/crackling and recovers audio smoothly
        compressorRef.current = compressor;

        // Chain the connections
        source.connect(preampNode);
        preampNode.connect(goldBassFilter);
        goldBassFilter.connect(goldenBassPeaking);
        
        let lastNode: AudioNode = goldenBassPeaking;
        filters.forEach(filter => {
          lastNode.connect(filter);
          lastNode = filter;
        });
        
        lastNode.connect(compressor);
        compressor.connect(ctx.destination);
        
        // Sync the initial gains
        filters[0].gain.value = eqSettings.bands.hz60;
        filters[1].gain.value = eqSettings.bands.hz230;
        filters[2].gain.value = eqSettings.bands.hz910;
        filters[3].gain.value = eqSettings.bands.hz4k;
        filters[4].gain.value = eqSettings.bands.hz14k;
      }
    } catch (err) {
      console.warn("Could not setup audio context / equalizer:", err);
    }
  };

  const resumeAudioContext = async () => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch (e) {
        console.warn("Could not resume audio context:", e);
      }
    }
  };

  useEffect(() => {
    currentQueueRef.current = currentQueue;
  }, [currentQueue]);

  useEffect(() => {
    currentSongIndexRef.current = currentSongIndex;
  }, [currentSongIndex]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  // Listen to Auth State
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        // Fetch/sync user profile in real-time
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
            } else {
              // Create default profile if missing
              const profile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || "",
                displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "Listener",
                photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`,
                createdAt: Date.now()
              };
              await setDoc(userDocRef, profile);
              setUserProfile(profile);
            }
          }, (err) => {
            console.error("User profile sync error:", err);
          });
        } catch (err) {
          console.error("Error setting up user profile observer:", err);
        }
      } else {
        setUserProfile(null);
      }
      setLoadingAuth(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Load local offline songs from IndexedDB on mount
  useEffect(() => {
    const loadPersistedLocalSongs = async () => {
      setLoadingLocal(true);
      try {
        const persisted = await getLocalSongs();
        const loaded: Song[] = persisted.map(item => {
          // Recreate blob URL for the file
          const audioUrl = URL.createObjectURL(item.file);
          return {
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album,
            audioUrl: audioUrl,
            imageUrl: item.imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
            duration: item.duration,
            createdAt: item.createdAt
          };
        });
        setLocalSongs(loaded);
      } catch (err) {
        console.error("Failed to load persisted offline songs:", err);
      } finally {
        setLoadingLocal(false);
      }
    };
    loadPersistedLocalSongs();
  }, []);

  // Prevent body scrolling when a full-screen modal or overlay is open
  useEffect(() => {
    const isModalOpen = isMobileOverlayOpen || isSettingsOpen || isEqualizerOpen || isCreatingPlaylist;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOverlayOpen, isSettingsOpen, isEqualizerOpen, isCreatingPlaylist]);

  // Listen to Database Songs (Real-time sync!)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "songs"), (snapshot) => {
      const songList: Song[] = [];
      snapshot.forEach((doc) => {
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
      // Sort newest first
      songList.sort((a, b) => b.createdAt - a.createdAt);
      setSongs(songList);
      setLoadingSongs(false);

      // If playing queue is empty and we loaded songs, initialize queue with all songs
      if (currentQueue.length === 0 && songList.length > 0) {
        setCurrentQueue(songList);
      }
    }, (error) => {
      console.error("Songs subscription failed:", error);
      handleFirestoreError(error, OperationType.LIST, "songs");
    });

    return () => unsubscribe();
  }, [currentQueue.length]);

  // Listen to Database Categories (Real-time sync!)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), async (snapshot) => {
      const catList: string[] = [];
      snapshot.forEach((doc) => {
        catList.push(doc.data().name);
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
      }
    }, (error) => {
      console.error("Categories subscription failed:", error);
    });

    return () => unsubscribe();
  }, []);

  // Listen to Database Playlists (Real-time sync!)
  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      return;
    }

    const q = query(collection(db, "playlists"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playlistList: Playlist[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        playlistList.push({
          id: doc.id,
          name: data.name || "My Playlist",
          userId: data.userId || "",
          songIds: data.songIds || [],
          thumbnailUrl: data.thumbnailUrl || null,
          createdAt: data.createdAt || Date.now()
        });
      });
      setPlaylists(playlistList);
    }, (error) => {
      console.error("Playlists subscription failed:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Audio Player Initialization & Events
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onEnded = () => {
      const q = currentQueueRef.current;
      const idx = currentSongIndexRef.current;
      const mode = playbackModeRef.current;

      if (q.length === 0) return;

      if (mode === "loop-one") {
        audio.currentTime = 0;
        audio.play().catch(err => console.log(err));
        return;
      }

      let nextIndex = idx + 1;

      if (mode === "shuffle") {
        nextIndex = Math.floor(Math.random() * q.length);
      } else if (nextIndex >= q.length) {
        if (mode === "loop-all") {
          nextIndex = 0;
        } else {
          setIsPlaying(false);
          return; // Stop at end of list
        }
      }

      playSong(nextIndex, q, true);
    };

    const onWaiting = () => {
      setIsBuffering(true);
    };

    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onCanPlay = () => {
      setIsBuffering(false);
    };

    const onLoadStart = () => {
      setIsBuffering(true);
    };

    const onError = (e: any) => {
      console.warn("Audio element loading/streaming error:", e);
      
      // If we failed with CORS anonymous mode on an external stream, re-attempt playback without equalizer route
      if (audio.crossOrigin === "anonymous") {
        console.log("CORS block or secure playback fail. Re-attempting playback directly without equalizer routing...");
        audio.removeAttribute("crossOrigin");
        audio.load();
        audio.play().catch(err => console.warn("Recovery playback fail:", err));
        return;
      }

      setIsBuffering(false);
      setIsPlaying(false);
      
      let errorMsg = "Failed to load audio source. Please check the song's link or your internet connection.";
      if (audio && audio.error) {
        const code = audio.error.code;
        if (code === 1) errorMsg = "Playback aborted by user or browser.";
        else if (code === 2) errorMsg = "Network error while downloading audio.";
        else if (code === 3) errorMsg = "Audio decoding failed. Unsupported format.";
        else if (code === 4) errorMsg = "The audio source is not supported or link is broken.";
      }
      setPlaybackError(errorMsg);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("error", onError);

    // Initial volume
    audio.volume = volume;

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, []);

  // Volume synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Handle song selection and playback triggers
  const playSong = (index: number, queue: Song[] = songs, forceRestart: boolean = false) => {
    if (queue.length === 0 || index < 0 || index >= queue.length) return;

    const song = queue[index];
    setPlaybackError(null);

    // Toggle play/pause if the same song is selected and clicked from grid, unless force-skipping
    const activeSong = currentSongIndex !== -1 ? currentQueue[currentSongIndex] : null;
    if (!forceRestart && activeSong && activeSong.id === song.id) {
      handleTogglePlay();
      return;
    }

    // Instantly reset the current time state to 0 for a clean timeline jump
    setCurrentTime(0);

    setCurrentQueue(queue);
    setCurrentSongIndex(index);
    setIsPlaying(true);
    setIsBuffering(true);

    if (audioRef.current) {
      // Lazy initialize Web Audio Equalizer on user action
      initAudioContext();
      resumeAudioContext();
      // Only set source if the track ID has changed (prevent redundant loads and abort stuttering)
      if (activeAudioIdRef.current !== song.id) {
        activeAudioIdRef.current = song.id;
        audioRef.current.src = song.audioUrl;
        audioRef.current.load(); // Standard practice: explicitly trigger load to reset decoding pipeline and load new src
        try {
          audioRef.current.currentTime = 0;
        } catch (e) {
          console.warn("Could not set currentTime to 0 immediately on source change:", e);
        }
      } else if (forceRestart) {
        try {
          audioRef.current.currentTime = 0;
        } catch (e) {}
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Ignore AbortError when a load/play request overrides a previous one
          if (err.name !== "AbortError") {
            console.warn("Autoplay prevention or stream error:", err);
            setIsPlaying(false);
            setIsBuffering(false);
          }
        });
      }
    }
  };

  const handleTogglePlay = () => {
    setPlaybackError(null);
    if (currentSongIndex === -1 && songs.length > 0) {
      // Start playing first song if nothing is playing
      playSong(0, songs);
      return;
    }

    if (!audioRef.current) return;

    // Lazy initialize Web Audio Equalizer on user action
    initAudioContext();
    resumeAudioContext();

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const activeSong = currentSongIndex !== -1 ? currentQueue[currentSongIndex] : null;
      if (activeSong && activeAudioIdRef.current !== activeSong.id) {
        activeAudioIdRef.current = activeSong.id;
        audioRef.current.src = activeSong.audioUrl;
        audioRef.current.load(); // Explicitly load the source
        try {
          audioRef.current.currentTime = 0;
        } catch (e) {}
        setCurrentTime(0);
      }

      setIsBuffering(true);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch(err => {
        if (err.name !== "AbortError") {
          console.error("Play toggle error:", err);
          setIsPlaying(false);
          setIsBuffering(false);
        }
      });
    }
  };

  const handleSkipNext = () => {
    if (currentQueue.length === 0) return;

    if (playbackMode === "loop-one") {
      // Repeat same song
      setCurrentTime(0);
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
        } catch (e) {}
        audioRef.current.play().catch(err => console.log(err));
      }
      return;
    }

    let nextIndex = currentSongIndex + 1;

    if (playbackMode === "shuffle") {
      nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else if (nextIndex >= currentQueue.length) {
      if (playbackMode === "loop-all") {
        nextIndex = 0;
      } else {
        setIsPlaying(false);
        return; // Stop at end of list
      }
    }

    playSong(nextIndex, currentQueue, true);
  };

  const handleSkipPrev = () => {
    if (currentQueue.length === 0) return;

    let prevIndex = currentSongIndex - 1;

    if (playbackMode === "shuffle") {
      prevIndex = Math.floor(Math.random() * currentQueue.length);
    } else if (prevIndex < 0) {
      if (playbackMode === "loop-all") {
        prevIndex = currentQueue.length - 1;
      } else {
        prevIndex = 0; // Stick to first
      }
    }

    playSong(prevIndex, currentQueue, true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const changePlaybackMode = () => {
    const modes: ("normal" | "loop-one" | "loop-all" | "shuffle")[] = ["normal", "loop-one", "loop-all", "shuffle"];
    const currIdx = modes.indexOf(playbackMode);
    const nextIdx = (currIdx + 1) % modes.length;
    setPlaybackMode(modes[nextIdx]);
  };

  // Profile Picture Direct Upload to ImgBB via server proxy
  const handlePfpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setPfpMessage("Uploading avatar via server backend...");
    setPfpProgress(15);

    try {
      const base64 = await toBase64(file);
      setPfpProgress(45);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: base64,
          presetType: "avatar",
        }),
      });

      if (!res.ok) throw new Error("ImgBB proxy upload failed");

      setPfpProgress(75);
      const data = await res.json();
      const secureUrl = data.secure_url;

      if (secureUrl) {
        await updateProfilePicture(secureUrl);
        setPfpProgress(100);
        setPfpMessage("Profile picture updated successfully! ✨");
      }
    } catch (err: any) {
      console.error(err);
      setPfpMessage(`Upload failed: ${err.message}`);
      setPfpProgress(0);
    }
  };

  // Save manual avatar URL or handle uploaded URL
  const updateProfilePicture = async (url: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { photoURL: url });
      
      // Update local state
      setUserProfile(prev => prev ? { ...prev, photoURL: url } : null);
      setPfpUrlInput("");
    } catch (err) {
      console.error("Failed to update profile pic in database:", err);
      alert("Profile update failed in Firestore.");
    }
  };

  // Create Playlist
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !user) return;

    try {
      const playlistData = {
        name: newPlaylistName.trim(),
        userId: user.uid,
        songIds: [],
        thumbnailUrl: newPlaylistThumbnail.trim() || null,
        createdAt: Date.now()
      };

      await addDoc(collection(db, "playlists"), playlistData);
      setNewPlaylistName("");
      setNewPlaylistThumbnail("");
      setIsCreatingPlaylist(false);
    } catch (err) {
      console.error("Playlist creation failed:", err);
    }
  };

  // Update Playlist Thumbnail cover image
  const handleUpdatePlaylistThumbnail = async (playlistId: string, url: string) => {
    try {
      const playlistRef = doc(db, "playlists", playlistId);
      await updateDoc(playlistRef, { thumbnailUrl: url.trim() || null });
      
      // Update local state for immediate feedback
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, thumbnailUrl: url.trim() || undefined } : p));
      if (selectedPlaylist && selectedPlaylist.id === playlistId) {
        setSelectedPlaylist(prev => prev ? { ...prev, thumbnailUrl: url.trim() || undefined } : null);
      }
    } catch (err) {
      console.error("Failed to update playlist cover image:", err);
    }
  };

  // Delete Playlist
  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      await deleteDoc(doc(db, "playlists", playlistId));
      if (selectedPlaylist && selectedPlaylist.id === playlistId) {
        setSelectedPlaylist(null);
        setActiveTab("playlist");
      }
      setPlaylistDeleteConfirmId(null);
    } catch (err) {
      console.error("Playlist delete failed:", err);
    }
  };

  // Add song to playlist
  const addSongToPlaylist = async (songOrId: string | Song, playlist: Playlist) => {
    setPlaylistDropdownOpen(null);
    const songId = typeof songOrId === "string" ? songOrId : songOrId.id;

    if (playlist.songIds.includes(songId)) {
      alert("Song is already in this playlist.");
      return;
    }

    try {
      const playlistRef = doc(db, "playlists", playlist.id);
      const updatedIds = [...playlist.songIds, songId];
      await updateDoc(playlistRef, { songIds: updatedIds });
      
      // Sync detailed viewer if active
      if (selectedPlaylist && selectedPlaylist.id === playlist.id) {
        setSelectedPlaylist({ ...selectedPlaylist, songIds: updatedIds });
      }

      // Quick visual notification
      alert(`Track added to ${playlist.name}! 🎵`);
    } catch (err) {
      console.error("Add song to playlist failed:", err);
    }
  };

  // Remove song from playlist
  const removeSongFromPlaylist = async (songId: string, playlist: Playlist) => {
    try {
      const playlistRef = doc(db, "playlists", playlist.id);
      const updatedIds = playlist.songIds.filter(id => id !== songId);
      await updateDoc(playlistRef, { songIds: updatedIds });

      if (selectedPlaylist && selectedPlaylist.id === playlist.id) {
        setSelectedPlaylist({ ...selectedPlaylist, songIds: updatedIds });
      }
    } catch (err) {
      console.error("Remove song from playlist failed:", err);
    }
  };

  // VIP Key Verification & Activation Handler
  const handleActivateProKey = async () => {
    if (!proKeyInput.trim() || !user) return;
    setProKeyLoading(true);
    setProKeyError("");
    setProKeySuccess("");

    try {
      const trimmedKey = proKeyInput.trim().toUpperCase();
      const keyDocRef = doc(db, "keys", trimmedKey);

      // Auto-seed key if it's our test key so the user has a working key in Firestore out of the box
      if (trimmedKey === "SARATHI-GOLD") {
        const checkSnap = await getDoc(keyDocRef);
        if (!checkSnap.exists()) {
          await setDoc(keyDocRef, {
            status: "active",
            used: false,
            createdAt: Date.now()
          });
        }
      }

      const keySnap = await getDoc(keyDocRef);

      if (!keySnap.exists()) {
        setProKeyError("Invalid VIP key. Please enter a valid activated key.");
        setProKeyLoading(false);
        return;
      }

      const keyData = keySnap.data();
      if (keyData.status !== "active" || keyData.used === true) {
        setProKeyError("This key is disabled or has already been used.");
        setProKeyLoading(false);
        return;
      }

      // Update Key Status to used
      await updateDoc(keyDocRef, {
        status: "used",
        used: true,
        usedBy: user.uid,
        usedAt: Date.now()
      });

      // Update User Profile Doc to activate Pro status for 30 days
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        isPro: true,
        proKey: trimmedKey,
        proActivatedAt: Date.now(),
        proExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days of validity
      });

      setProKeySuccess("👑 VIP Gold Activated Successfully! All premium features unlocked.");
      setProKeyInput("");
    } catch (err) {
      console.error("VIP activation failure:", err);
      setProKeyError("Activation failed. Please check your connection and try again.");
    } finally {
      setProKeyLoading(false);
    }
  };
  // Format Time Helper
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  // Get active song object
  const currentSong = currentSongIndex !== -1 ? currentQueue[currentSongIndex] : null;

  // Search filter
  const filteredSongs = songs.filter(song => {
    const matchesSearch = song.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          song.artist.toLowerCase().includes(searchQuery.toLowerCase());
    if (genreFilter === "All") return matchesSearch;
    
    // Check if song has categories and matches the filter
    if (song.categories && Array.isArray(song.categories)) {
      return matchesSearch && song.categories.includes(genreFilter);
    }
    
    // Fallback for older songs
    return matchesSearch && (
      song.album?.toLowerCase().includes(genreFilter.toLowerCase()) || 
      song.title.toLowerCase().includes(genreFilter.toLowerCase())
    );
  });

  useEffect(() => {
    const savedQuality = localStorage.getItem("skplayer_audio_quality");
    if (savedQuality === "128" || savedQuality === "320") {
      setAudioQuality(savedQuality);
    } else {
      setAudioQuality("320");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("skplayer_audio_quality", audioQuality);
  }, [audioQuality]);

  const themeAccents = {
    default: {
      text: "text-cyan-400",
      textHover: "hover:text-cyan-300",
      textMuted: "text-slate-400",
      bg: "bg-cyan-500",
      bgHover: "hover:bg-cyan-400",
      bgLight: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      borderActive: "border-cyan-400/50",
      focusBorder: "focus:border-cyan-400/50",
      glow: "shadow-[0_0_15px_rgba(6,182,212,0.3)]",
      pulseGlow: "shadow-cyan-500/20",
      gradient: "from-cyan-400 to-indigo-600",
      accentIcon: "text-cyan-400"
    },
    dark: {
      text: "text-purple-400",
      textHover: "hover:text-purple-300",
      textMuted: "text-slate-400",
      bg: "bg-purple-600",
      bgHover: "hover:bg-purple-500",
      bgLight: "bg-purple-500/10",
      border: "border-purple-500/20",
      borderActive: "border-purple-400/50",
      focusBorder: "focus:border-purple-400/50",
      glow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]",
      pulseGlow: "shadow-purple-500/20",
      gradient: "from-purple-500 to-indigo-700",
      accentIcon: "text-purple-400"
    },
    gold: {
      text: "text-amber-400",
      textHover: "hover:text-amber-300",
      textMuted: "text-slate-400",
      bg: "bg-gradient-to-r from-amber-500 to-yellow-600",
      bgHover: "hover:from-amber-400 hover:to-yellow-500",
      bgLight: "bg-amber-500/10",
      border: "border-amber-500/20",
      borderActive: "border-amber-400/50",
      focusBorder: "focus:border-amber-400/50",
      glow: "shadow-[0_0_15px_rgba(245,158,11,0.3)]",
      pulseGlow: "shadow-amber-500/20",
      gradient: "from-amber-400 to-yellow-600",
      accentIcon: "text-amber-400"
    },
    liquid: {
      text: "text-pink-400",
      textHover: "hover:text-pink-300",
      textMuted: "text-slate-300",
      bg: "bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600",
      bgHover: "hover:from-pink-400 hover:to-indigo-500",
      bgLight: "bg-pink-500/15",
      border: "border-pink-500/20",
      borderActive: "border-pink-400/50",
      focusBorder: "focus:border-pink-400/50",
      glow: "shadow-[0_0_18px_rgba(236,72,153,0.35)]",
      pulseGlow: "shadow-pink-500/25",
      gradient: "from-pink-400 via-purple-500 to-indigo-500",
      accentIcon: "text-pink-400"
    }
  };

  const getGlassClass = (additionalClasses = "") => {
    let style = "";
    if (glassEffectEnabled) {
      switch (selectedTheme) {
        case "dark":
          style = "bg-black/45 backdrop-blur-3xl border border-white/12 shadow-[0_16px_50px_rgba(0,0,0,0.65)] text-slate-100 hover:border-purple-500/30 hover:shadow-purple-500/10 transition-all duration-300 rounded-3xl";
          break;
        case "gold":
          if (goldUiStyle === "royal") {
            style = `bg-amber-950/15 backdrop-blur-3xl border ${goldBordersEnabled ? "border-amber-400/50" : "border-white/12"} shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-amber-100 hover:border-amber-400/60 hover:shadow-amber-500/15 transition-all duration-300 rounded-3xl`;
          } else {
            style = `bg-zinc-950/70 backdrop-blur-3xl border ${goldBordersEnabled ? "border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "border-white/12"} shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-amber-50 hover:border-amber-400/50 transition-all duration-300 rounded-3xl`;
          }
          break;
        case "liquid":
          style = "bg-gradient-to-br from-pink-500/8 via-purple-500/8 to-indigo-500/8 backdrop-blur-3xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.6)] text-slate-100 hover:border-pink-500/40 hover:shadow-pink-500/15 transition-all duration-300 rounded-3xl";
          break;
        default:
          style = "bg-black/45 backdrop-blur-3xl border border-white/12 shadow-[0_16px_45px_rgba(0,0,0,0.55)] text-slate-100 hover:border-cyan-400/40 hover:shadow-cyan-500/15 transition-all duration-300 rounded-3xl";
          break;
      }
    } else {
      switch (selectedTheme) {
        case "dark":
          style = "bg-[#0b0b0e] border border-zinc-800 text-slate-100 shadow-md";
          break;
        case "gold":
          if (goldUiStyle === "royal") {
            style = `bg-[#130f06] border ${goldBordersEnabled ? "border-amber-600/35" : "border-zinc-800"} text-amber-100 shadow-md`;
          } else {
            style = `bg-[#171510] border ${goldBordersEnabled ? "border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]" : "border-zinc-800"} text-amber-50 shadow-md`;
          }
          break;
        case "liquid":
          style = "bg-[#1a0f2e] border border-pink-500/30 text-slate-100 shadow-lg";
          break;
        default:
          style = "bg-[#0f1123] border border-slate-800 text-slate-100 shadow-lg";
          break;
      }
    }

    // Apply global Gold Borders overlay across ALL themes
    if (goldBordersEnabled && selectedTheme !== "gold") {
      style = style.replace(/border-[^\s]+/g, "");
      style += " border border-amber-400/55 shadow-[0_0_12px_rgba(245,158,11,0.25)]";
    }

    return `${style} ${additionalClasses}`;
  };

  const currentThemeActive = themeAccents[selectedTheme] || themeAccents.default;

  const getBodyBgStyle = () => {
    switch (selectedTheme) {
      case "dark":
        return "bg-[#030305] text-slate-100";
      case "gold":
        if (goldUiStyle === "royal") {
          return "bg-[#080602] text-amber-100";
        } else {
          return "bg-[#090805] text-amber-50";
        }
      case "liquid":
        return "bg-[#05010a] text-slate-100";
      default:
        return "bg-[#070811] text-slate-100";
    }
  };

  const getBackgroundBlobs = () => {
    switch (selectedTheme) {
      case "dark":
        return (
          <>
            <div className="absolute top-[-20%] left-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob bg-purple-950/25"></div>
            <div className="absolute bottom-[-10%] right-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob bg-indigo-950/30" style={{ animationDelay: "-5s" }}></div>
          </>
        );
      case "gold":
        return (
          <>
            <div className={`absolute top-[-20%] left-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob ${goldGlitterEnabled ? "bg-amber-600/20" : "bg-amber-600/8"}`}></div>
            <div className={`absolute bottom-[-10%] right-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob ${goldGlitterEnabled ? "bg-yellow-600/20" : "bg-yellow-600/8"}`} style={{ animationDelay: "-5s" }}></div>
          </>
        );
      case "liquid":
        return (
          <>
            <div className="absolute top-[-20%] left-[-15%] w-[65vw] h-[65vw] rounded-full blur-[140px] pointer-events-none animate-blob bg-pink-500/18"></div>
            <div className="absolute bottom-[-10%] right-[-15%] w-[65vw] h-[65vw] rounded-full blur-[140px] pointer-events-none animate-blob bg-purple-600/18" style={{ animationDelay: "-4s" }}></div>
            <div className="absolute top-[30%] left-[40%] w-[35vw] h-[35vw] rounded-full blur-[120px] pointer-events-none animate-blob bg-indigo-500/12" style={{ animationDelay: "-8s" }}></div>
          </>
        );
      default:
        return (
          <>
            <div className="absolute top-[-20%] left-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob bg-cyan-600/12"></div>
            <div className="absolute bottom-[-10%] right-[-15%] w-[60vw] h-[60vw] rounded-full blur-[130px] pointer-events-none animate-blob bg-fuchsia-600/12" style={{ animationDelay: "-5s" }}></div>
          </>
        );
    }
  };

  const handleDownloadSong = async (song: Song) => {
    if (!isGoldActive) {
      alert("👑 Song Downloading is a premium Golden VIP effect! Activate your 30-day VIP Pro Key in the Profile tab to unlock instant high-fidelity downloads.");
      return;
    }
    try {
      const response = await fetch(song.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${song.title} - ${song.artist}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.warn("Failed to download song directly. Opening in tab...", error);
      const a = document.createElement("a");
      a.href = song.audioUrl;
      a.target = "_blank";
      a.download = `${song.title} - ${song.artist}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className={`relative min-h-screen w-full flex flex-col ${getBodyBgStyle()} overflow-x-hidden ${isGoldActive ? "gold-theme" : ""} transition-all duration-500`}>
      
      {/* Background Floating Blobs */}
      {getBackgroundBlobs()}

      {/* Dynamic Glitter Particles Ambiance */}
      {goldGlitterEnabled && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {[...Array(15)].map((_, i) => {
            const left = `${(i * 7) % 95 + 2.5}%`;
            const delay = `${i * 0.65}s`;
            const duration = `${11 + (i % 4) * 2.5}s`;
            const size = `${3 + (i % 3) * 2}px`;
            return (
              <div
                key={`gold-glitter-${i}`}
                className="absolute bg-gradient-to-t from-amber-400 to-yellow-200 rounded-full animate-float opacity-30 shadow-[0_0_8px_rgba(245,158,11,0.85)]"
                style={{
                  left,
                  bottom: "-20px",
                  width: size,
                  height: size,
                  animationDelay: delay,
                  animationDuration: duration,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Primary Layout Wrapper */}
      <div className={`flex flex-col flex-1 w-full max-w-7xl mx-auto relative z-10 px-4 md:px-6 py-4 md:py-6 gap-6 ${
        currentSong ? "mb-36 md:mb-28" : "mb-20 md:mb-24"
      }`}>
        
        {/* Unified Glass Header Navigation */}
        <header className="flex items-center justify-between p-4 md:p-5 glass-card rounded-[28px] border border-white/10 relative overflow-hidden shadow-2xl">
          {/* Glass Sheen / Reflective Highlight Line */}
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/25 to-transparent rounded-t-[28px] pointer-events-none"></div>
          
          {/* Logo Brand */}
          <div className="flex items-center space-x-3.5 relative z-10">
            <div className="p-[3px] rounded-2xl bg-white/10 backdrop-blur-md shadow-[0_4px_20px_rgba(255,255,255,0.12)] border border-white/20 overflow-hidden w-11 h-11 flex items-center justify-center transform hover:scale-110 hover:rotate-3 transition-all duration-300 cursor-pointer">
              <img 
                src="https://i.ibb.co/fd4wBk6f/Picsart-26-07-09-00-40-05-863.jpg" 
                alt="sk edz Logo" 
                className="w-full h-full object-cover rounded-xl" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base md:text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-white to-fuchsia-400 bg-clip-text text-transparent">sk edz</span>
                
                {/* Micro bounce visualizer next to title */}
                <div className="flex items-end space-x-0.5 h-3 px-1 mb-0.5">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={`header-eq-${i}`} 
                      className={`w-0.5 bg-cyan-400 transition-all duration-300 ${isPlaying ? "animate-audio-bar" : "h-1"}`}
                      style={{ 
                        animationDelay: `${i * 0.2}s`, 
                        animationDuration: "0.6s",
                        height: isPlaying ? "auto" : "3px"
                      }}
                    ></div>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                <span>Liquid Glass Audio</span>
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping"></span>
                <span className="text-cyan-400 font-bold">Premium</span>
              </p>
            </div>
          </div>

          {/* PC Header Tabs with ultra-clean active indicators */}
          <nav className="hidden md:flex items-center space-x-2 relative z-10">
            <button 
              onClick={() => { setActiveTab("home"); setSelectedPlaylist(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl transition-all duration-300 text-xs font-black border ${
                activeTab === "home" && !selectedPlaylist
                  ? `bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ${currentThemeActive.text} ${currentThemeActive.borderActive}` 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Discover</span>
            </button>
 
            <button 
              onClick={() => { setActiveTab("search"); setSelectedPlaylist(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl transition-all duration-300 text-xs font-black border ${
                activeTab === "search" 
                  ? `bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ${currentThemeActive.text} ${currentThemeActive.borderActive}` 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Search Bar</span>
            </button>
 
            <button 
              onClick={() => { setActiveTab("playlist"); setSelectedPlaylist(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl transition-all duration-300 text-xs font-black border ${
                activeTab === "playlist" 
                  ? `bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ${currentThemeActive.text} ${currentThemeActive.borderActive}` 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
              }`}
            >
              <ListMusic className="w-4 h-4" />
              <span>My Playlists</span>
            </button>
 
            <button 
              onClick={() => { setActiveTab("local"); setSelectedPlaylist(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl transition-all duration-300 text-xs font-black border ${
                activeTab === "local" 
                  ? `bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ${currentThemeActive.text} ${currentThemeActive.borderActive}` 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Local Songs</span>
            </button>
 
            <button 
              onClick={() => { setActiveTab("account"); setSelectedPlaylist(null); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl transition-all duration-300 text-xs font-black border ${
                activeTab === "account" 
                  ? `bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] ${currentThemeActive.text} ${currentThemeActive.borderActive}` 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Account</span>
            </button>
          </nav>

          {/* User Profile Card / Settings Trigger */}
          <div 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-2.5 p-1.5 pr-3 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-cyan-500/20 backdrop-blur-md shadow-lg transition-all duration-300 cursor-pointer relative z-10"
            title="Click to open application settings"
          >
            <div className="w-7 h-7 rounded-xl overflow-hidden bg-black/40 border border-white/10 relative flex-shrink-0">
              <img 
                src={userProfile?.photoURL || (user ? `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` : `https://api.dicebear.com/7.x/bottts/svg?seed=guest`)} 
                alt="Profile Avatar" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-black animate-pulse"></div>
            </div>
            
            <div className="text-left hidden sm:block">
              <span className="block text-xs font-black text-white truncate max-w-[100px]">
                {userProfile?.displayName || (user ? "skplayer Listener" : "Guest Listener")}
              </span>
              <span className="block text-[8px] font-mono text-slate-400 leading-none">
                {isGoldActive ? "👑 VIP GOLD" : "Standard"}
              </span>
            </div>
            
            <Settings className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-400 transition-colors flex-shrink-0" />
          </div>
        </header>

        {/* Main Scrolling Viewport */}
        <main className="flex-1 min-w-0">

          {/* 1. DISCOVER / HOME VIEW */}
          {activeTab === "home" && !selectedPlaylist && (
            <div className="space-y-6 animate-fade-in">
              {/* New Releases Section (Replaced Trending and removed play counts) */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                      <Music className="w-4 h-4 text-cyan-400" />
                      <span>New Songs</span>
                    </h2>
                    <p className="text-[11px] text-slate-400 font-sans">The latest additions to our music library</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {loadingSongs ? (
                    [...Array(4)].map((_, i) => (
                      <div key={i} className="animate-pulse bg-white/5 border border-white/5 rounded-2xl p-4 h-28 flex flex-col justify-between">
                        <div className="w-8 h-8 rounded-lg bg-white/10"></div>
                        <div className="space-y-2">
                          <div className="h-3 w-3/4 rounded bg-white/10"></div>
                          <div className="h-2.5 w-1/2 rounded bg-white/10"></div>
                        </div>
                      </div>
                    ))
                  ) : songs.length === 0 ? (
                    <div className="col-span-2 lg:col-span-4 p-8 text-center border border-dashed border-white/10 rounded-2xl text-xs text-slate-500 bg-white/5">
                      No cloud tracks found. Load local files or publish some cloud tracks.
                    </div>
                  ) : (
                    songs.slice(0, 4).map((song, idx) => (
                      <div 
                        key={`new-release-${song.id}`}
                        className={getGlassClass("group relative overflow-hidden transition-all duration-300 p-3.5 flex flex-col justify-between h-32 md:h-36 shadow-lg cursor-pointer hover:scale-[1.01]")}
                        onClick={() => playSong(songs.indexOf(song), songs)}
                      >
                        {/* Artwork backdrop glow */}
                        <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl group-hover:opacity-100 transition-all"></div>
                        
                        <div className="flex items-start justify-between relative z-10">
                          <div className="relative w-11 h-11 md:w-14 md:h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0">
                            <img 
                              src={song.imageUrl} 
                              alt={song.title} 
                              className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" 
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                            </div>
                          </div>

                          {/* New Badge */}
                          <span className={`text-[8px] font-mono font-black ${currentThemeActive.text} ${currentThemeActive.bgLight} border ${currentThemeActive.border} px-2 py-0.5 rounded-md uppercase tracking-wider`}>
                            New Song
                          </span>
                        </div>

                        <div className="min-w-0 mt-3 relative z-10">
                          <h4 className="text-xs md:text-sm font-bold text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
                            {song.title}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{song.artist}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[9px] font-mono text-slate-500">{formatTime(song.duration)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Main Content Area: Music Grid */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                      <Disc className="w-5 h-5 text-cyan-400 animate-spin-slow" />
                      <span>Cloud Track Library</span>
                    </h2>
                    <p className="text-xs text-slate-400">All uploaded tracks synced in real-time</p>
                  </div>
                </div>

                {loadingSongs ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-3" />
                    <span className="text-xs font-mono text-slate-400">Syncing with skplayer cloud...</span>
                  </div>
                ) : songs.length === 0 ? (
                  <div className="p-8 border border-dashed border-white/10 rounded-3xl bg-white/5 text-center">
                    <Info className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-300">Your cloud song library is empty</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                      No cloud tracks have been published yet. You can play your local offline songs instantly by selecting them from your device.
                    </p>
                    <button 
                      onClick={() => setActiveTab("local")}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-cyan-500 text-black font-bold text-xs hover:scale-105 active:scale-95 transition-all"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>Open Local File Player</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {songs.map((song, idx) => (
                      <div 
                        key={song.id}
                        className="group flex items-center justify-between p-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all duration-300 relative"
                      >
                        <button 
                          type="button"
                          onClick={() => playSong(idx, songs)}
                          className="flex items-center space-x-3.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                        >
                          {/* Image Hover Play state overlay */}
                          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 shadow-md">
                            <img 
                              src={song.imageUrl} 
                              alt={song.title} 
                              className="w-full h-full object-cover group-hover:scale-115 transition-transform duration-500" 
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              {currentSong?.id === song.id ? (
                                isBuffering ? (
                                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                                ) : isPlaying ? (
                                  <Pause className="w-5 h-5 text-cyan-400" />
                                ) : (
                                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                                )
                              ) : (
                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                              )}
                            </div>
                            {currentSong?.id === song.id && (isPlaying || isBuffering) && (
                              <div className={`absolute bottom-0 inset-x-0 h-1 bg-cyan-400 ${isBuffering ? "animate-pulse" : ""}`}></div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-100 truncate group-hover:text-cyan-400 transition-colors">
                              {song.title}
                            </h4>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-mono text-slate-500">{formatTime(song.duration)}</span>
                              {song.categories && song.categories.map((cat) => (
                                <span key={cat} className="text-[8px] font-mono px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-full">
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>

                        {/* Interactive Add to Playlist Trigger and Premium Download */}
                        <div className="flex items-center space-x-1.5 ml-2 flex-shrink-0 relative">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSong(song);
                            }}
                            className={`p-2 rounded-xl border transition-all active:scale-95 ${
                              isGoldActive 
                                ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400 hover:text-amber-300"
                                : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-400 hover:text-slate-300"
                            }`}
                            title={isGoldActive ? "Download HQ MP3 Offline" : "VIP Gold Download Option"}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <div className="relative">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlaylistDropdownOpen(playlistDropdownOpen === song.id ? null : song.id);
                              }}
                              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-cyan-400 transition-all active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Quick Add to Playlist Dropdown */}
                            {playlistDropdownOpen === song.id && (
                              <div className="absolute right-0 mt-2 w-48 bg-[#0b0d19] border border-white/10 rounded-2xl p-2 shadow-2xl z-20 backdrop-blur-xl animate-fade-in">
                                <p className="text-[10px] font-semibold text-slate-500 px-3 py-1.5 uppercase tracking-wider border-b border-white/5">Add to Playlist</p>
                                {playlists.length === 0 ? (
                                  <button 
                                    onClick={() => { setActiveTab("playlist"); setPlaylistDropdownOpen(null); }}
                                    className="w-full text-left text-xs text-cyan-400 hover:bg-white/5 px-3 py-2 rounded-xl mt-1 font-medium"
                                  >
                                    + Create a Playlist
                                  </button>
                                ) : (
                                  <div className="max-h-36 overflow-y-auto mt-1 custom-scrollbar">
                                    {playlists.map((pl) => (
                                      <button
                                        key={pl.id}
                                        onClick={() => addSongToPlaylist(song.id, pl)}
                                        className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-white/5 px-3 py-2 rounded-xl truncate block"
                                      >
                                        {pl.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. SEARCH BAR VIEW */}
          {activeTab === "search" && !selectedPlaylist && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-white">Find Your Sound</h2>
                <p className="text-xs text-slate-400">Search for tracks, artists, or genres</p>
              </div>

              {/* Glassy Input */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Type song title, movie, or artist..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm backdrop-blur-md"
                />
              </div>

              {/* Filter tags / Chips */}
              <div className="flex flex-wrap gap-2">
                {["All", ...categories].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setGenreFilter(chip)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                      genreFilter === chip 
                        ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-md shadow-cyan-500/20" 
                        : "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Filtered songs list */}
              <div className="space-y-3">
                {filteredSongs.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 border border-dashed border-white/10 rounded-2xl">
                    <p className="text-sm">No songs match your query or category.</p>
                    <p className="text-xs text-slate-500 mt-1">Try searching for keywords like "Single" or other artist tags.</p>
                  </div>
                ) : (
                  filteredSongs.map((song) => {
                    const idxInAll = songs.findIndex(s => s.id === song.id);
                    return (
                      <div 
                        key={song.id}
                        className="group flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all"
                      >
                        <button 
                          type="button"
                          onClick={() => playSong(idxInAll, songs)}
                          className="flex items-center space-x-3.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                        >
                          <img 
                            src={song.imageUrl} 
                            alt={song.title} 
                            className="w-12 h-12 rounded-xl object-cover border border-white/10" 
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-200 group-hover:text-cyan-400 truncate">{song.title}</h4>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {song.categories && song.categories.map((cat) => (
                                <span key={cat} className="text-[8px] font-mono px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-full">
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center space-x-3.5">
                          <span className="text-xs font-mono text-slate-400">{formatTime(song.duration)}</span>
                          
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlaylistDropdownOpen(playlistDropdownOpen === song.id ? null : song.id);
                            }}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-all"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 3. PLAYLIST VIEW */}
          {activeTab === "playlist" && !selectedPlaylist && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Your Custom Playlists</h2>
                  <p className="text-xs text-slate-400">Organize your music tracks into custom compilation albums</p>
                </div>
                
                <button
                  onClick={() => setIsCreatingPlaylist(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>New Playlist</span>
                </button>
              </div>

              {/* Create Playlist Modal Dialog */}
              {isCreatingPlaylist && (
                <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                  <form 
                    onSubmit={handleCreatePlaylist}
                    className="w-full max-w-sm bg-[#0e1124] border border-white/10 rounded-3xl p-6 shadow-2xl relative"
                  >
                    <h3 className="text-base font-bold text-white mb-4 flex items-center space-x-2">
                      <FolderPlus className="w-5 h-5 text-cyan-400" />
                      <span>Create Custom Playlist</span>
                    </h3>
                    
                    <div className="space-y-3 mb-5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Playlist Name</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. My Gym Beats, Lofi Study" 
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Playlist Thumbnail</label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <label className="flex-1 flex items-center justify-center border border-dashed border-white/20 hover:border-cyan-400/50 bg-white/5 hover:bg-white/8 p-3 rounded-2xl cursor-pointer transition-all text-xs font-semibold text-slate-300">
                              <Upload className="w-4 h-4 mr-2 text-cyan-400 animate-pulse" />
                              <span>{uploadingImage ? "Uploading to ImgBB..." : "Upload Cover Image"}</span>
                              <input 
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingImage}
                                onChange={async (e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setUploadingImage(true);
                                    try {
                                      const url = await uploadToImgBB(e.target.files[0]);
                                      if (url) {
                                        setNewPlaylistThumbnail(url);
                                      }
                                    } catch (err) {
                                      console.error("ImgBB upload failed", err);
                                      alert("ImgBB upload failed.");
                                    } finally {
                                      setUploadingImage(false);
                                    }
                                  }
                                }}
                              />
                            </label>
                          </div>
                          
                          <div className="relative flex items-center">
                            <span className="text-[9px] text-slate-500 absolute left-3 pointer-events-none uppercase font-black">OR</span>
                            <input 
                              type="url" 
                              placeholder="Paste cover image link/URL..." 
                              value={newPlaylistThumbnail}
                              onChange={(e) => setNewPlaylistThumbnail(e.target.value)}
                              className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 text-xs"
                            />
                          </div>

                          {newPlaylistThumbnail && (
                            <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 mx-auto mt-1 bg-black/40">
                              <img src={newPlaylistThumbnail} alt="Preview" className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => setNewPlaylistThumbnail("")}
                                className="absolute inset-0 bg-black/65 opacity-0 hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-red-400 transition-opacity"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={() => setIsCreatingPlaylist(false)}
                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-semibold text-slate-300 border border-white/10 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-2xl text-xs font-bold text-black shadow-lg shadow-cyan-500/20 transition-all"
                      >
                        Create Now
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Playlists grid - Bento / Album-style visual cards */}
              {!user ? (
                <div className="p-8 border border-dashed border-white/10 rounded-3xl bg-white/5 text-center">
                  <Info className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-300">Login to Create Playlists</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                    Playlists require a secure account. Please sign in or log in using the Account Profile tab!
                  </p>
                  <button 
                    onClick={() => setActiveTab("account")}
                    className="px-5 py-2.5 rounded-2xl bg-cyan-500 text-black font-bold text-xs"
                  >
                    Go to Account Profile
                  </button>
                </div>
              ) : playlists.length === 0 ? (
                <div className="p-12 text-center text-slate-400 border border-dashed border-white/10 rounded-3xl bg-white/5">
                  <ListMusic className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-300">You haven't created any playlists yet</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Click "New Playlist" to create your first music compilation!</p>
                  <button
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-cyan-400"
                  >
                    Create Playlist
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  {playlists.map((pl) => (
                    <div 
                      key={pl.id}
                      className="group bg-[#090b16]/70 hover:bg-[#0f1224]/80 border border-white/5 rounded-3xl p-3.5 transition-all duration-300 flex flex-col justify-between hover:scale-[1.02] shadow-xl hover:shadow-cyan-500/5 cursor-pointer"
                      onClick={() => setSelectedPlaylist(pl)}
                    >
                      <div>
                        {/* Square Album Cover Image on Top */}
                        <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-gradient-to-br from-cyan-950 to-indigo-950 border border-white/8 shadow-inner flex items-center justify-center flex-shrink-0">
                          {pl.thumbnailUrl ? (
                            <img 
                              src={pl.thumbnailUrl} 
                              alt={pl.name} 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-cyan-400/60 p-4 text-center">
                              <ListMusic className="w-10 h-10 mb-2 animate-pulse" />
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Custom Mix</span>
                            </div>
                          )}
                          
                          {/* Play Hover Button Overlay */}
                          {pl.songIds.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const playlistTracks = songs.filter(s => pl.songIds.includes(s.id));
                                playSong(0, playlistTracks);
                              }}
                              className="absolute bottom-3 right-3 p-3 bg-cyan-500 text-black font-bold rounded-full opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-cyan-500/25 hover:scale-110 active:scale-95"
                              title="Play entire compilation"
                            >
                              <Play className="w-4 h-4 fill-black" />
                            </button>
                          )}
                        </div>

                        {/* Name and Song Count below */}
                        <div className="mt-3.5 px-0.5">
                          <h3 className="text-sm font-extrabold text-slate-100 truncate group-hover:text-cyan-400 transition-colors">{pl.name}</h3>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">{pl.songIds.length} songs saved</p>
                        </div>
                      </div>

                      {/* Cover Edit & Delete Controls */}
                      <div className="flex items-center justify-between border-t border-white/5 mt-4 pt-3 px-0.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <label className="text-[10px] font-bold font-mono text-cyan-400 hover:text-cyan-300 transition-all bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg cursor-pointer inline-flex items-center space-x-1">
                            <Upload className="w-3 h-3" />
                            <span>{uploadingImage ? "Uploading..." : "Edit Cover"}</span>
                            <input 
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingImage}
                              onChange={async (e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setUploadingImage(true);
                                  try {
                                    const url = await uploadToImgBB(e.target.files[0]);
                                    if (url) {
                                      await handleUpdatePlaylistThumbnail(pl.id, url);
                                    }
                                  } catch (err) {
                                    console.error("ImgBB playlist cover upload failed:", err);
                                    alert("ImgBB upload failed.");
                                  } finally {
                                    setUploadingImage(false);
                                  }
                                }
                              }}
                            />
                          </label>
                        </div>
                        
                        {playlistDeleteConfirmId === pl.id ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[8px] font-mono font-bold text-red-400 uppercase select-none">Delete?</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePlaylist(pl.id);
                              }}
                              className="text-[9px] font-extrabold font-mono text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded-md transition-all uppercase"
                            >
                              Yes
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlaylistDeleteConfirmId(null);
                              }}
                              className="text-[9px] font-extrabold font-mono text-slate-300 bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md transition-all uppercase"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlaylistDeleteConfirmId(pl.id);
                            }}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                            title="Delete Playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PLAYLIST DETAIL SUB-VIEW */}
          {selectedPlaylist && (
            <div className="space-y-6 animate-fade-in">
              {/* Back button */}
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                <span>Back to Playlists</span>
              </button>

              {/* Playlist Header card */}
              <div className="p-6 bg-gradient-to-br from-indigo-950/25 to-black/30 border border-white/5 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">
                <div className="flex items-center space-x-4">
                  <label className="relative group w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-cyan-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/10 flex-shrink-0 cursor-pointer">
                    {selectedPlaylist.thumbnailUrl ? (
                      <img 
                        src={selectedPlaylist.thumbnailUrl} 
                        alt={selectedPlaylist.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <ListMusic className="w-8 h-8" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Upload className="w-4 h-4 text-cyan-400" />
                    </div>
                    <input 
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadingImage(true);
                          try {
                            const url = await uploadToImgBB(e.target.files[0]);
                            if (url) {
                              await handleUpdatePlaylistThumbnail(selectedPlaylist.id, url);
                            }
                          } catch (err) {
                            console.error("ImgBB playlist cover upload failed:", err);
                            alert("ImgBB upload failed.");
                          } finally {
                            setUploadingImage(false);
                          }
                        }
                      }}
                    />
                  </label>
                  <div>
                    <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase">CUSTOM COMPILATION</span>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{selectedPlaylist.name}</h2>
                    <p className="text-xs text-slate-400">{selectedPlaylist.songIds.length} songs saved</p>
                  </div>
                </div>

                {/* Playlist actions */}
                {selectedPlaylist.songIds.length > 0 && (
                  <div className="flex space-x-2 flex-wrap gap-y-2">
                    <button
                      onClick={() => {
                        const playlistTracks = songs.filter(s => selectedPlaylist.songIds.includes(s.id));
                        playSong(0, playlistTracks);
                      }}
                      className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
                    >
                      Play Playlist 🎧
                    </button>
                    
                    {/* Playlist Random/Shuffle Option */}
                    <button
                      onClick={() => {
                        const playlistTracks = songs.filter(s => selectedPlaylist.songIds.includes(s.id));
                        if (playlistTracks.length === 0) return;
                        
                        // Fisher-Yates array shuffle algorithm
                        const shuffled = [...playlistTracks];
                        for (let i = shuffled.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        }
                        
                        // Play from index 0 in shuffle mode
                        playSong(0, shuffled, true);
                        setPlaybackMode("shuffle");
                      }}
                      className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold text-xs rounded-xl shadow-md flex items-center space-x-1.5 transition-all active:scale-95"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>Random Shuffle</span>
                    </button>

                    {playlistDeleteConfirmId === selectedPlaylist.id ? (
                      <div className="flex items-center space-x-1 bg-red-950/20 border border-red-500/10 p-1 rounded-xl">
                        <span className="text-[9px] font-mono font-bold text-red-400 uppercase px-2 select-none">Delete Playlist?</span>
                        <button
                          onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                          className="px-3 py-1.5 text-[10px] font-extrabold font-mono text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all uppercase"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setPlaylistDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-[10px] font-extrabold font-mono text-slate-300 bg-white/10 hover:bg-white/20 rounded-lg transition-all uppercase"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPlaylistDeleteConfirmId(selectedPlaylist.id)}
                        className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all"
                        title="Delete Playlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* List of Playlist Songs */}
              <div className="space-y-3">
                {selectedPlaylist.songIds.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 border border-dashed border-white/10 rounded-3xl bg-white/5">
                    <p className="text-sm">This playlist is currently empty.</p>
                    <p className="text-xs text-slate-500 mt-1">Go to Discover, search, click "+", and select this playlist to add songs!</p>
                  </div>
                ) : (
                  songs.filter(s => selectedPlaylist.songIds.includes(s.id)).map((song, pIdx, filteredArr) => (
                    <div 
                      key={song.id}
                      className="group flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all"
                    >
                      <button 
                        type="button"
                        onClick={() => playSong(pIdx, filteredArr)}
                        className="flex items-center space-x-3.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                      >
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 shadow-md">
                          <img 
                            src={song.imageUrl} 
                            alt={song.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            {currentSong?.id === song.id ? (
                              isBuffering ? (
                                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                              ) : isPlaying ? (
                                <Pause className="w-5 h-5 text-cyan-400" />
                              ) : (
                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                              )
                            ) : (
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            )}
                          </div>
                          {currentSong?.id === song.id && (isPlaying || isBuffering) && (
                            <div className={`absolute bottom-0 inset-x-0 h-1 bg-cyan-400 ${isBuffering ? "animate-pulse" : ""}`}></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-200 group-hover:text-cyan-400 truncate">{song.title}</h4>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>
                        </div>
                      </button>

                      <div className="flex items-center space-x-3.5 ml-4">
                        <span className="text-xs font-mono text-slate-400">{formatTime(song.duration)}</span>
                        
                        <button
                          onClick={() => removeSongFromPlaylist(song.id, selectedPlaylist)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-xl"
                          title="Remove from playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 5. LOCAL FILES PLAYER VIEW */}
          {activeTab === "local" && !selectedPlaylist && (
            <div className="space-y-6 animate-fade-in" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <FolderOpen className="w-6 h-6 text-cyan-400" />
                  <span>Device Local Songs</span>
                </h2>
                <p className="text-xs text-slate-400">Access and stream music files stored directly on your phone or computer</p>
              </div>

              {/* Drag and Drop Zone / File Picker */}
              <div 
                className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300 ${
                  isDragging 
                    ? "border-cyan-400 bg-cyan-500/10 scale-[1.02]" 
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <input 
                  type="file" 
                  multiple 
                  accept="audio/*" 
                  onChange={handleLocalFilesSelect} 
                  className="hidden" 
                  id="local-audio-file-input" 
                />
                
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 inline-flex items-center justify-center text-cyan-400">
                    <FileAudio className="w-8 h-8 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Drag & drop your music files here</h3>
                    <p className="text-xs text-slate-400 mt-1">Supports MP3, WAV, OGG, M4A, FLAC, and other standard formats</p>
                  </div>
                  <div>
                    <label 
                      htmlFor="local-audio-file-input"
                      className="px-5 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs cursor-pointer shadow-lg shadow-cyan-500/20 inline-block transition-all hover:scale-105 active:scale-95"
                    >
                      Access File Manager
                    </label>
                  </div>
                </div>

                {isDragging && (
                  <div className="absolute inset-0 bg-black/60 rounded-3xl flex items-center justify-center backdrop-blur-sm">
                    <span className="text-cyan-400 font-bold text-sm">Drop audio files to play instantly! 🎵</span>
                  </div>
                )}
              </div>

              {/* Local Songs List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <div>
                    <h3 className="text-sm font-bold text-slate-300">Session Queue ({localSongs.length} Tracks)</h3>
                    <p className="text-[10px] text-slate-500">In-memory local audio clips. Revoked on page refresh.</p>
                  </div>
                  {localSongs.length > 0 && (
                    <button 
                      onClick={clearAllLocalSongs}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 px-3 py-1.5 rounded-xl"
                    >
                      Clear Memory
                    </button>
                  )}
                </div>

                {localSongs.length > 0 && (
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Search within imported device songs..." 
                      value={localSearchQuery}
                      onChange={(e) => setLocalSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/5 focus:border-cyan-400/30 rounded-xl text-slate-100 outline-none transition-all placeholder-slate-600 text-xs"
                    />
                  </div>
                )}

                {loadingLocal ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
                    <span className="text-xs text-slate-400 font-mono">Parsing local metadata...</span>
                  </div>
                ) : localSongs.length === 0 ? (
                  <div className="p-10 text-center border border-dashed border-white/5 rounded-2xl bg-white/2">
                    <FileAudio className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-medium">No device tracks imported yet.</p>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto">Use the file selector above or drag files from your computer to construct your private local track queue!</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {localSongs
                      .filter(s => s.title.toLowerCase().includes(localSearchQuery.toLowerCase()))
                      .map((song, lIdx, filteredArr) => (
                        <div 
                          key={song.id}
                          className="group flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all"
                        >
                          <button 
                            type="button"
                            onClick={() => playSong(lIdx, filteredArr)}
                            className="flex items-center space-x-3.5 min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                          >
                            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-900/30 to-indigo-900/30 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
                              <FileAudio className="w-5 h-5" />
                              {currentSong?.id === song.id && (
                                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                                  {isBuffering ? (
                                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                                  ) : isPlaying ? (
                                    <Pause className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                                  ) : (
                                    <Play className="w-4 h-4 text-cyan-400 fill-cyan-400 ml-0.5" />
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-slate-200 group-hover:text-cyan-400 truncate">{song.title}</h4>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{formatTime(song.duration)} • Local Audio</p>
                            </div>
                          </button>

                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => playSong(lIdx, filteredArr)}
                              className="p-2 bg-white/5 hover:bg-cyan-500/20 border border-white/5 text-slate-300 hover:text-cyan-400 rounded-xl transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </button>
                            <button 
                              onClick={() => removeLocalSong(song.id)}
                              className="p-2 bg-white/5 hover:bg-red-500/20 border border-white/5 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                              title="Remove from session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. ACCOUNT / PROFILE VIEW */}
          {activeTab === "account" && !selectedPlaylist && (
            <div className="space-y-6 animate-fade-in">
              {!user ? (
                <div className="flex justify-center items-center py-10">
                  <AuthPanel onSuccess={() => {}} />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Profile Details displayed directly */}
                  <div className="space-y-6 animate-fade-in">
                      {/* Profile Header card */}
                      <div className={getGlassClass("p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden")}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

                        {/* Avatar Display */}
                        <div className="relative w-24 h-24 rounded-3xl overflow-hidden border border-white/20 bg-black/40 shadow-xl flex-shrink-0">
                          <img 
                            src={userProfile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} 
                            alt="Profile" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        {/* Meta details */}
                        <div className="space-y-1.5 text-center md:text-left flex-1 min-w-0">
                          <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                            <UserCheck className="w-3 h-3" />
                            <span>LOGGED IN</span>
                          </div>
                          <h2 className="text-2xl font-bold text-white truncate tracking-tight">{userProfile?.displayName || "skplayer Listener"}</h2>
                          <p className="text-xs text-slate-400 truncate">{userProfile?.email}</p>
                          <p className="text-[10px] text-slate-500 font-mono">USER UID: {user.uid.slice(0, 8)}...</p>
                        </div>

                        {/* Sign out */}
                        <button
                          onClick={() => signOut(auth)}
                          className="px-5 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 font-bold text-xs transition-all flex items-center space-x-2"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Log Out</span>
                        </button>
                      </div>

                      {/* VIP Membership Panel */}
                      <div className="glass-card rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-yellow-600/5 to-transparent border border-amber-500/20 relative overflow-hidden">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
                        
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Crown className="w-5 h-5 text-amber-400 animate-pulse fill-amber-400/20" />
                              <h3 className="text-lg font-bold text-amber-400 tracking-tight">VIP GOLD Membership</h3>
                            </div>
                            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                              Elevate your skplayer experience. Activates custom golden layout accents, full-screen enhancements, and unlocks the high-fidelity deep-sub-bass <span className="text-amber-300 font-semibold">"Bass Gold"</span> equalizer preset.
                            </p>
                          </div>

                          {isGoldActive ? (
                            <div className="flex flex-col items-start md:items-end space-y-1.5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 min-w-[200px]">
                              <span className="text-[10px] font-bold text-amber-400 font-mono flex items-center space-x-1 uppercase">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-1"></span>
                                PRO ACTIVE
                              </span>
                              <span className="text-xs font-mono text-slate-300">Pass validity: 30 Days</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Expires: {userProfile?.proExpiresAt ? new Date(userProfile.proExpiresAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col space-y-2.5 w-full md:w-auto md:min-w-[320px]">
                              <span className="text-[10px] font-mono font-bold text-amber-400/80">ACTIVATE WITH VIP KEY (Use: SARATHI-GOLD)</span>
                              <div className="flex items-center space-x-2">
                                <div className="relative flex-1">
                                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                  <input 
                                    type="text"
                                    placeholder="Enter your key"
                                    value={proKeyInput}
                                    onChange={(e) => setProKeyInput(e.target.value.toUpperCase())}
                                    className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 hover:border-amber-500/20 focus:border-amber-400/50 rounded-xl text-slate-200 outline-none text-xs font-mono tracking-wider transition-all"
                                  />
                                </div>
                                <button
                                  onClick={handleActivateProKey}
                                  disabled={proKeyLoading || !proKeyInput.trim()}
                                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold text-xs shadow-[0_4px_12px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 flex-shrink-0"
                                >
                                  {proKeyLoading ? "..." : "Activate"}
                                </button>
                              </div>

                              {proKeyError && (
                                <p className="text-[10px] font-mono text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/10">
                                  ⚠️ {proKeyError}
                                </p>
                              )}
                              {proKeySuccess && (
                                <p className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border-amber-500/20">
                                  👑 {proKeySuccess}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Direct Profile Pic Upload Panel (ImgBB) */}
                      <div className="glass-card rounded-3xl p-6 space-y-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                            <UploadCloud className="w-5 h-5 text-cyan-400" />
                            <span>Customize Avatar</span>
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Upload a photo to ImgBB or set a direct image URL link</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* ImgBB File Picker */}
                          <div className="border border-white/5 rounded-2xl p-4 bg-black/10 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-mono text-cyan-400 font-bold block mb-2">IMGBB DIRECT UPLOAD</span>
                              <div className="relative border border-dashed border-white/15 rounded-xl p-6 hover:border-cyan-500/30 transition-all text-center cursor-pointer bg-white/5">
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  onChange={handlePfpUpload}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <UploadCloud className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                                <span className="text-xs font-semibold text-slate-300 block">Select Avatar Image</span>
                                <span className="text-[10px] text-slate-500">JPG, PNG, WEBP</span>
                              </div>
                            </div>

                            {/* Progress indicator */}
                            {pfpProgress > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                                  <span>Uploading...</span>
                                  <span>{pfpProgress}%</span>
                                </div>
                                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                  <div className="h-full bg-cyan-400 transition-all" style={{ width: `${pfpProgress}%` }}></div>
                                </div>
                              </div>
                            )}

                            {pfpMessage && (
                              <p className="text-[10px] font-mono text-center mt-2 text-slate-300 bg-[#0c0f1e] p-2.5 rounded-xl border border-white/5">
                                {pfpMessage}
                              </p>
                            )}
                          </div>

                          {/* Direct URL input */}
                          <div className="border border-white/5 rounded-2xl p-4 bg-black/10 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-mono text-pink-400 font-bold block mb-2">PASTE DIRECT IMAGE URL</span>
                              <input 
                                type="url" 
                                placeholder="https://example.com/photo.jpg" 
                                value={pfpUrlInput}
                                onChange={(e) => setPfpUrlInput(e.target.value)}
                                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 focus:border-cyan-400/30 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs"
                              />
                            </div>
                            <button
                              onClick={() => pfpUrlInput && updateProfilePicture(pfpUrlInput)}
                              disabled={!pfpUrlInput}
                              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 mt-4"
                            >
                              Save Avatar Link
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Settings / Navigation helper */}

                    </div>
                  </div>
                )}
              </div>
            )}

        </main>
      </div>

      {/* Playback Error Toast Notification */}
      {playbackError && (
        <div className="fixed bottom-28 md:bottom-28 left-4 right-4 md:left-auto md:right-6 max-w-sm glass-card border border-rose-500/30 bg-rose-950/20 backdrop-blur-xl p-4 rounded-2xl shadow-[0_10px_30px_rgba(244,63,94,0.15)] flex items-start space-x-3 z-40 animate-fade-in">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
            <Info className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-rose-300">Playback Notification</h5>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-normal">{playbackError}</p>
          </div>
          <button 
            onClick={() => setPlaybackError(null)}
            className="text-slate-400 hover:text-white text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white/5 rounded-lg border border-white/5 transition-all active:scale-95 flex-shrink-0"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* PERSISTENT PLAYBAR CONTROLLER (FLOATING PREMIUM GLASS COCKPIT) */}
      {currentSong && (
        <div className="fixed bottom-[84px] md:bottom-6 left-4 right-4 md:left-6 md:right-6 md:max-w-6xl md:mx-auto bg-black/60 backdrop-blur-2xl border border-white/12 py-3.5 px-4 md:px-8 z-30 select-none shadow-[0_24px_60px_rgba(0,0,0,0.85)] rounded-3xl transition-all duration-300 hover:border-cyan-500/20 overflow-hidden">
          {/* Glass top reflection */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-3xl pointer-events-none"></div>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            
            {/* Song Cover Details - Trigger Immersive Full-Screen Player on click */}
            <div 
              onClick={() => setIsMobileOverlayOpen(true)}
              className="flex items-center space-x-3.5 min-w-0 flex-1 md:flex-initial cursor-pointer hover:opacity-85 transition-opacity duration-300"
              title="Click to open full-screen player"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden bg-black/40 border border-white/15 shadow-md flex-shrink-0">
                <img 
                  src={currentSong.imageUrl} 
                  alt={currentSong.title} 
                  className={`w-full h-full object-cover rounded-full ${isPlaying ? "animate-spin-slow" : ""}`} 
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-100 truncate tracking-tight">{currentSong.title}</h4>
                <p className="text-xs text-slate-400 truncate mt-0.5">{currentSong.artist}</p>
              </div>
            </div>

            {/* Middle Controls (Play, Prev, Next, Slider) - PC only */}
            <div className="hidden md:flex flex-col items-center flex-1 max-w-xl px-4">
              {/* Top controls row */}
              <div className="flex items-center space-x-5 mb-1.5">
                <button 
                  onClick={changePlaybackMode}
                  className={`p-1.5 rounded-lg transition-all ${
                    playbackMode !== "normal" 
                      ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title={`Playback Mode: ${playbackMode}`}
                >
                  {playbackMode === "shuffle" ? (
                    <Shuffle className="w-4 h-4" />
                  ) : playbackMode === "loop-one" ? (
                    <div className="relative">
                      <Repeat className="w-4 h-4 text-cyan-400" />
                      <span className="absolute -top-1.5 -right-1 text-[7px] font-bold px-0.5 bg-cyan-500 text-black rounded font-mono">1</span>
                    </div>
                  ) : playbackMode === "loop-all" ? (
                    <Repeat className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Repeat className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <button onClick={handleSkipPrev} className="text-slate-300 hover:text-white transition-colors">
                  <SkipBack className="w-5 h-5 fill-slate-300" />
                </button>

                <button 
                  onClick={handleTogglePlay} 
                  className="p-2.5 bg-white hover:scale-105 active:scale-95 text-black rounded-full transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] flex items-center justify-center w-10 h-10"
                >
                  {isBuffering ? (
                    <Loader2 className="w-5 h-5 text-black animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5 fill-black" />
                  ) : (
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  )}
                </button>

                <button onClick={handleSkipNext} className="text-slate-300 hover:text-white transition-colors">
                  <SkipForward className="w-5 h-5 fill-slate-300" />
                </button>

                {/* Ambient visualizer line */}
                <div className="flex space-x-0.5 items-end h-4 w-6 px-1">
                  {[...Array(4)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-0.5 bg-cyan-400 transition-all ${isPlaying ? "animate-audio-bar" : "h-1"}`}
                      style={{ animationDelay: `${i * 0.15}s` }}
                    ></div>
                  ))}
                </div>
              </div>

              {/* Slider scrubber row */}
              <div className="w-full flex items-center space-x-3">
                <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{formatTime(currentTime)}</span>
                <input 
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-white/10 rounded-full accent-cyan-400 outline-none cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-8">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Volume Control Sliders - PC only */}
            <div className="hidden md:flex items-center space-x-3.5">
              <button 
                onClick={() => setIsEqualizerOpen(true)}
                className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-cyan-400 hover:text-cyan-300 transition-all flex items-center justify-center"
                title="Open Equalizer & Bass Boost"
              >
                <Sliders className="w-4 h-4" />
              </button>
              <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-300" />
                )}
              </button>
              <input 
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 accent-cyan-400 cursor-pointer h-1"
              />
            </div>

            {/* Mobile Touch Play Actions - Compact mobile trigger */}
            <div className="flex md:hidden items-center space-x-3.5">
              <button 
                onClick={handleTogglePlay}
                className="p-3 bg-white text-black rounded-full flex items-center justify-center w-10 h-10"
              >
                {isBuffering ? (
                  <Loader2 className="w-4 h-4 text-black animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black ml-0.5" />
                )}
              </button>
              <button 
                onClick={handleSkipNext}
                className="p-2 text-slate-300 hover:text-white"
              >
                <SkipForward className="w-5 h-5 fill-slate-300" />
              </button>
            </div>

          </div>

          {/* Miniature Touch Scrubber Line for Mobile Bottom panel */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-white/5 md:hidden">
            <div 
              className="h-full bg-cyan-400 transition-all duration-150" 
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION (Tab selectors) */}
      <nav className="fixed bottom-4 inset-x-4 bg-[#0a0c16]/75 backdrop-blur-3xl border border-white/10 py-3 px-6 flex md:hidden justify-between items-center z-20 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.7)]">
        {/* Glass top sheen */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl pointer-events-none"></div>
        <button 
          onClick={() => { setActiveTab("home"); setSelectedPlaylist(null); }}
          className={`flex flex-col items-center space-y-1 transition-colors ${
            activeTab === "home" && !selectedPlaylist ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <Music className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Discover</span>
        </button>

        <button 
          onClick={() => { setActiveTab("search"); setSelectedPlaylist(null); }}
          className={`flex flex-col items-center space-y-1 transition-colors ${
            activeTab === "search" ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Search</span>
        </button>

        <button 
          onClick={() => { setActiveTab("playlist"); setSelectedPlaylist(null); }}
          className={`flex flex-col items-center space-y-1 transition-colors ${
            activeTab === "playlist" ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <ListMusic className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Playlists</span>
        </button>

        <button 
          onClick={() => { setActiveTab("local"); setSelectedPlaylist(null); }}
          className={`flex flex-col items-center space-y-1 transition-colors ${
            activeTab === "local" ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <FolderOpen className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Local</span>
        </button>

        <button 
          onClick={() => { setActiveTab("account"); setSelectedPlaylist(null); }}
          className={`flex flex-col items-center space-y-1 transition-colors ${
            activeTab === "account" ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Account</span>
        </button>
      </nav>

      {/* Full screen Immersive Mobile Overlay */}
      <MobilePlayerOverlay 
        isOpen={isMobileOverlayOpen}
        onClose={() => setIsMobileOverlayOpen(false)}
        currentSong={currentSong}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        onTogglePlay={handleTogglePlay}
        onSkipNext={handleSkipNext}
        onSkipPrev={handleSkipPrev}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        playbackMode={playbackMode}
        onChangePlaybackMode={changePlaybackMode}
        formatTime={formatTime}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        playlists={playlists}
        onAddSongToPlaylist={addSongToPlaylist}
      />

      {/* Pro Audio Equalizer Modal */}
      <EqualizerModal
        isOpen={isEqualizerOpen}
        onClose={() => setIsEqualizerOpen(false)}
        eqSettings={eqSettings}
        onChangeEq={setEqSettings}
        isPro={isGoldActive}
        onUpgradeRequired={triggerUpgradePopup}
      />

      {/* Premium Upgrade Modal Popup */}
      {isUpgradePopupOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-[#1c1404] via-[#090703] to-[#040407] shadow-[0_20px_50px_rgba(245,158,11,0.25)] flex flex-col p-6 text-center select-none">
            {/* Ambient Background glow */}
            <div className="absolute top-[-30%] left-[-30%] w-64 h-64 rounded-full bg-amber-500/10 blur-[80px] pointer-events-none"></div>
            
            <div className="flex justify-end">
              <button
                onClick={() => setIsUpgradePopupOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center mt-2 space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-bounce">
                <Crown className="w-8 h-8 fill-amber-400/10" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-black text-amber-400 tracking-tight uppercase">You Need to Upgrade</h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm px-2">
                  {upgradePopupMessage || "This is a premium Golden VIP exclusive feature! Unlock professional acoustic quality, custom liquid layouts, and deeper gold bass."}
                </p>
              </div>

              {/* Action Button to activate or close */}
              <div className="w-full pt-4 flex flex-col space-y-3.5">
                <button
                  onClick={() => {
                    setIsUpgradePopupOpen(false);
                    setActiveTab("account");
                    setSettingsSubTab("theme"); // Go to account settings
                  }}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs transition-all tracking-wider uppercase shadow-[0_0_20px_rgba(245,158,11,0.35)] active:scale-95"
                >
                  Activate VIP Key
                </button>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <button
                    onClick={() => {
                      localStorage.setItem("skplayer_hide_upgrade_popup", "true");
                      setIsUpgradePopupOpen(false);
                    }}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors underline font-medium"
                  >
                    Don't show me this again
                  </button>

                  <button
                    onClick={() => setIsUpgradePopupOpen(false)}
                    className="text-[10px] text-slate-400 hover:text-white font-bold transition-all px-3 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Premium Categorized Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[32px] border border-white/10 bg-[#070913]/90 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] select-none">
            
            {/* Header */}
            <div className="p-5 md:p-6 border-b border-white/10 flex items-center justify-between bg-black/20 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sliders className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-white tracking-tight">skplayer Control Center</h3>
                  <p className="text-[10px] md:text-xs text-slate-400">Manage theme preferences, acoustics, and PWA setup.</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Scrollable Categories Accordion */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-h-[60vh] scrollbar-thin">
              
              {/* Category 1: Themes & Styling */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/5 transition-all">
                <button
                  onClick={() => setExpandedSettingCategory(expandedSettingCategory === "theme" ? null : "theme")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors focus:outline-none"
                >
                  <div className="flex items-center space-x-3">
                    <Paintbrush className="w-4.5 h-4.5 text-cyan-400" />
                    <div>
                      <span className="text-xs md:text-sm font-bold text-white block">🎨 Theme & Visual Layout</span>
                      <span className="text-[10px] text-slate-400">Select application skins and exclusive gold layouts.</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${expandedSettingCategory === "theme" ? "rotate-180" : ""}`} />
                </button>

                {expandedSettingCategory === "theme" && (
                  <div className="p-4 border-t border-white/10 bg-black/40 space-y-4 animate-fade-in">
                    {/* Theme Buttons Grid */}
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-2.5">
                      {/* Default Theme */}
                      <button
                        onClick={() => setSelectedTheme("default")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedTheme === "default"
                            ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-bold text-cyan-400"
                            : "border-white/5 bg-black/20 hover:border-white/10 text-slate-300"
                        }`}
                      >
                        <span className="text-xs block">Default Slate</span>
                        <div className="flex space-x-1 items-center mt-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-cyan-500 block border border-white/20"></span>
                          <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 block border border-white/20"></span>
                        </div>
                      </button>

                      {/* Dark Theme */}
                      <button
                        onClick={() => setSelectedTheme("dark")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedTheme === "dark"
                            ? "border-purple-400 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.15)] font-bold text-purple-400"
                            : "border-white/5 bg-black/20 hover:border-white/10 text-slate-300"
                        }`}
                      >
                        <span className="text-xs block">Deep Charcoal</span>
                        <div className="flex space-x-1 items-center mt-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-purple-600 block border border-white/20"></span>
                          <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 block border border-white/20"></span>
                        </div>
                      </button>

                      {/* Gold VIP Theme */}
                      <button
                        onClick={() => {
                          if (!isGoldActive) {
                            triggerUpgradePopup("👑 The Luxurious Golden VIP layout is a VIP Pro exclusive! Activate your VIP key in the Account tab to unlock this gorgeous golden aesthetic.");
                            return;
                          }
                          setSelectedTheme("gold");
                        }}
                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                          selectedTheme === "gold"
                            ? "border-amber-400 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-bold text-amber-400"
                            : "border-amber-500/10 bg-amber-500/5 hover:border-amber-500/20 text-slate-300"
                        }`}
                      >
                        {!isGoldActive && (
                          <div className="absolute top-1 right-1">
                            <Crown className="w-3 h-3 text-amber-500 fill-amber-500/20" />
                          </div>
                        )}
                        <span className="text-xs block flex items-center gap-1">VIP Gold 👑</span>
                        <div className="flex space-x-1 items-center mt-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 block border border-white/20"></span>
                          <span className="w-3.5 h-3.5 rounded-full bg-yellow-400 block border border-white/20"></span>
                        </div>
                      </button>

                      {/* Liquid Glass Theme */}
                      <button
                        onClick={() => {
                          if (!isGoldActive) {
                            triggerUpgradePopup("👑 The premium Fluid Liquid Glass layout is a VIP Pro exclusive! Activate your VIP key in the Account tab to unlock this premium aesthetic.");
                            return;
                          }
                          setSelectedTheme("liquid");
                        }}
                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                          selectedTheme === "liquid"
                            ? "border-pink-400 bg-pink-500/10 shadow-[0_0_12px_rgba(236,72,153,0.2)] font-bold text-pink-400"
                            : "border-pink-500/10 bg-pink-500/5 hover:border-pink-500/20 text-slate-300"
                        }`}
                      >
                        {!isGoldActive && (
                          <div className="absolute top-1 right-1">
                            <Crown className="w-3 h-3 text-pink-500" />
                          </div>
                        )}
                        <span className="text-xs block flex items-center gap-1">Liquid 🧪</span>
                        <div className="flex space-x-1 items-center mt-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-pink-500 block border border-white/20"></span>
                          <span className="w-3.5 h-3.5 rounded-full bg-purple-600 block border border-white/20"></span>
                        </div>
                      </button>
                    </div>

                    {/* Glass backdrop Toggle */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Frosted Glass Effect</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Applies beautiful layered blur shadows</span>
                      </div>
                      <button
                        onClick={() => setGlassEffectEnabled(!glassEffectEnabled)}
                        className={`w-10 h-5.5 rounded-full relative transition-colors duration-300 ${
                          glassEffectEnabled ? "bg-cyan-500" : "bg-white/15"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 bg-black rounded-full absolute top-1 transition-all duration-300 ${
                          glassEffectEnabled ? "right-1" : "left-1"
                        }`} />
                      </button>
                    </div>

                    {/* Gold Custom Panels */}
                    {isGoldActive && (
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2.5">
                        <span className="text-[9px] font-mono text-amber-400 font-bold tracking-wider block">👑 EXCLUSIVE GOLD CONTROLS</span>
                        
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-300">Gold Accent borders</span>
                          <button
                            onClick={() => setGoldBordersEnabled(!goldBordersEnabled)}
                            className={`w-8 h-4.5 rounded-full relative transition-colors ${
                              goldBordersEnabled ? "bg-amber-500" : "bg-white/10"
                            }`}
                          >
                            <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all ${
                              goldBordersEnabled ? "right-1" : "left-1"
                            }`} />
                          </button>
                        </div>

                        <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                          <span className="text-slate-300">Golden text highlights</span>
                          <button
                            onClick={() => setGoldTextAccentsEnabled(!goldTextAccentsEnabled)}
                            className={`w-8 h-4.5 rounded-full relative transition-colors ${
                              goldTextAccentsEnabled ? "bg-amber-500" : "bg-white/10"
                            }`}
                          >
                            <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all ${
                              goldTextAccentsEnabled ? "right-1" : "left-1"
                            }`} />
                          </button>
                        </div>

                        <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                          <span className="text-slate-300">Glitter background effect</span>
                          <button
                            onClick={() => setGoldGlitterEnabled(!goldGlitterEnabled)}
                            className={`w-8 h-4.5 rounded-full relative transition-colors ${
                              goldGlitterEnabled ? "bg-amber-500" : "bg-white/10"
                            }`}
                          >
                            <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all ${
                              goldGlitterEnabled ? "right-1" : "left-1"
                            }`} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category 2: Audio Settings */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/5 transition-all">
                <button
                  onClick={() => setExpandedSettingCategory(expandedSettingCategory === "audio" ? null : "audio")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors focus:outline-none"
                >
                  <div className="flex items-center space-x-3">
                    <Volume2 className="w-4.5 h-4.5 text-cyan-400" />
                    <div>
                      <span className="text-xs md:text-sm font-bold text-white block">🔊 Audio Quality & EQ</span>
                      <span className="text-[10px] text-slate-400">Stream bitrates, dynamic compressor and EQ preset setup.</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${expandedSettingCategory === "audio" ? "rotate-180" : ""}`} />
                </button>

                {expandedSettingCategory === "audio" && (
                  <div className="p-4 border-t border-white/10 bg-black/40 space-y-4 animate-fade-in">
                    
                    {/* Stream Bitrate Selector */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setAudioQuality("128")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          audioQuality === "128"
                            ? "border-cyan-400 bg-cyan-500/10 text-cyan-400 font-bold"
                            : "border-white/5 bg-black/20 hover:border-white/10 text-slate-300"
                        }`}
                      >
                        <span className="text-xs block">128kbps Standard</span>
                        <span className="text-[9px] text-slate-400 block mt-1 leading-tight">Optimized for stable network loads.</span>
                      </button>

                      <button
                        onClick={() => {
                          if (!isGoldActive) {
                            triggerUpgradePopup("👑 Lossless ultra 320kbps acoustics streaming is exclusive to VIP Gold pass holders! Activate pass in the Account tab.");
                            return;
                          }
                          setAudioQuality("320");
                        }}
                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                          audioQuality === "320"
                            ? "border-amber-400 bg-amber-500/10 text-amber-400 font-bold"
                            : "border-white/5 bg-black/20 hover:border-white/10 text-slate-300"
                        }`}
                      >
                        {!isGoldActive && <Crown className="w-3 h-3 text-amber-500 absolute top-1 right-1" />}
                        <span className="text-xs block">320kbps Master HQ 👑</span>
                        <span className="text-[9px] text-slate-400 block mt-1 leading-tight">Dynamic studio resolution acoustics.</span>
                      </button>
                    </div>

                    {/* Equalizer Quick launcher */}
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Pro Acoustics Equalizer</span>
                        <span className="text-[10px] text-slate-400">Deep sub-bass booster, limiter, mids control.</span>
                      </div>
                      <button
                        onClick={() => {
                          setIsSettingsOpen(false);
                          setIsEqualizerOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-[10px] rounded-xl active:scale-95 transition-all"
                      >
                        Launch EQ
                      </button>
                    </div>

                  </div>
                )}
              </div>

              {/* Category 3: App PWA Installation */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/5 transition-all">
                <button
                  onClick={() => setExpandedSettingCategory(expandedSettingCategory === "app" ? null : "app")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors focus:outline-none"
                >
                  <div className="flex items-center space-x-3">
                    <DownloadCloud className="w-4.5 h-4.5 text-cyan-400" />
                    <div>
                      <span className="text-xs md:text-sm font-bold text-white block">📲 Download App (PWA)</span>
                      <span className="text-[10px] text-slate-400">Install web app natively to your mobile or desktop screen.</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${expandedSettingCategory === "app" ? "rotate-180" : ""}`} />
                </button>

                {expandedSettingCategory === "app" && (
                  <div className="p-4 border-t border-white/10 bg-black/40 space-y-4 animate-fade-in">
                    
                    {isAppInstalled ? (
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                        <div className="p-2 w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                          <Check className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-emerald-300 block">Application Installed successfully!</span>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          The app is already added to your home screen natively. You can launch it directly from your device now without using a web browser.
                        </p>
                        <button
                          onClick={() => {
                            setIsAppInstalled(false);
                            localStorage.setItem("skplayer_pwa_installed", "false");
                          }}
                          className="text-[9px] text-slate-500 hover:text-slate-300 underline font-mono block mx-auto pt-1"
                        >
                          Reset Installation State (Show install button again)
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Add <strong>sk edz Player</strong> natively to your phone's home screen or computer's desktop. It launches in a full standalone fullscreen window like a real native app!
                        </p>

                        <button
                          onClick={() => {
                            if (deferredPrompt) {
                              deferredPrompt.prompt();
                              deferredPrompt.userChoice.then((choiceResult: any) => {
                                if (choiceResult.outcome === 'accepted') {
                                  setIsAppInstalled(true);
                                  localStorage.setItem("skplayer_pwa_installed", "true");
                                }
                              });
                            } else {
                              // If beforeinstallprompt didn't trigger yet or browser doesn't support, we show general instructions
                              alert("To install: Tap the share button in your browser address bar and select 'Add to Home Screen' or 'Install App'.");
                            }
                          }}
                          className="w-full py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(6,182,212,0.15)] flex items-center justify-center space-x-2"
                        >
                          <DownloadCloud className="w-4.5 h-4.5 text-black" />
                          <span>INSTALL APP ON DEVICE</span>
                        </button>

                        <p className="text-[9px] font-mono text-slate-500 text-center leading-normal">
                          *Supports Android (Chrome, Edge), iOS Safari (tap Share &gt; Add to Home), and Desktop (Chrome, Edge, Brave, Opera).
                        </p>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* Category 5: VIP Pass & Account */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/5 transition-all">
                <button
                  onClick={() => setExpandedSettingCategory(expandedSettingCategory === "account" ? null : "account")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors focus:outline-none"
                >
                  <div className="flex items-center space-x-3">
                    <UserIcon className="w-4.5 h-4.5 text-cyan-400" />
                    <div>
                      <span className="text-xs md:text-sm font-bold text-white block">👤 Account & VIP Pass</span>
                      <span className="text-[10px] text-slate-400">Current listener profile info, sign out and VIP activation.</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${expandedSettingCategory === "account" ? "rotate-180" : ""}`} />
                </button>

                {expandedSettingCategory === "account" && (
                  <div className="p-4 border-t border-white/10 bg-black/40 space-y-4 animate-fade-in">
                    
                    {!user ? (
                      <div className="p-3 text-center border border-dashed border-white/10 rounded-xl bg-black/20">
                        <span className="text-xs text-slate-400 block mb-2">You are currently logged in as Guest.</span>
                        <button
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setActiveTab("account");
                          }}
                          className="px-4 py-1.5 bg-white text-black text-[10px] font-bold rounded-xl"
                        >
                          Sign In / Register
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3 p-2 bg-white/5 rounded-xl border border-white/5">
                          <img 
                            src={userProfile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} 
                            alt="Profile" 
                            className="w-9 h-9 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-black text-white block truncate">{userProfile?.displayName || "skplayer Listener"}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{userProfile?.email}</span>
                          </div>
                        </div>

                        {/* Sign out */}
                        <button
                          onClick={() => {
                            signOut(auth);
                            setIsSettingsOpen(false);
                          }}
                          className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out Account</span>
                        </button>
                      </div>
                    )}

                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 text-center relative z-10 flex justify-between items-center px-6">
              <span className="text-[9px] font-mono text-slate-500">v3.5.2 • liquid glass system</span>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/5 transition-all"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

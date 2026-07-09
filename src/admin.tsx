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
  onSnapshot
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
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
  RefreshCw
} from "lucide-react";
import { Song } from "./types";
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
  // Tab State
  const [activeTab, setActiveTab] = useState<"songs" | "keys">("songs");

  // VIP Key Management State
  const [keysList, setKeysList] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);

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
        // If audio, try to auto-calculate duration using an audio element
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

        // Try parsing ID3 tags for auto-filling and cover detection
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
              if (meta.coverUrl) {
                try {
                  setStatusMessage("Uploading embedded ID3 cover art to ImgBB...");
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file: meta.coverUrl, presetType: "admin_image" })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setImageUrl(data.secure_url);
                    setStatusMessage("Audio and embedded cover art uploaded successfully!");
                    setImageStatus("available");
                  } else {
                    setImageStatus("unavailable");
                  }
                } catch (covErr) {
                  console.error("Embedded cover upload failed:", covErr);
                  setImageStatus("unavailable");
                }
              } else {
                setImageStatus("unavailable");
              }
            }
          };
          reader.readAsArrayBuffer(blob);
        } catch (id3Err) {
          console.warn("Could not parse ID3 tags on upload:", id3Err);
        }
      } else {
        setImageUrl(uploadedUrl);
        setStatusMessage("Cover image uploaded successfully!");
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
      const songData = {
        title,
        artist,
        album: album || "Single",
        audioUrl,
        imageUrl: imageUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
        duration: duration || 180, // Fallback to 3 minutes
        createdAt: Date.now(),
        uploadedBy: auth.currentUser?.uid || "admin",
        categories: selectedCategories
      };

      if (editingSongId) {
        await updateDoc(doc(db, "songs", editingSongId), songData);
        setEditingSongId(null);
        setStatusMessage("Song updated successfully! 🎉");
      } else {
        await addDoc(collection(db, "songs"), songData);
        setStatusMessage("Song added successfully! 🎉");
      }
      
      // Clear inputs
      setTitle("");
      setArtist("");
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

  // Admin key generation handler (Generates 30-day single-use key)
  const handleGenerateVipKey = async () => {
    setGeneratingKey(true);
    setStatusMessage("Generating secure VIP Gold Key...");
    try {
      const r = (l: number) => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let str = "";
        for (let i = 0; i < l; i++) {
          str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return str;
      };
      const newKeyCode = `${r(3)}-${r(3)}-${r(3)}`;
      
      const keyDocRef = doc(db, "keys", newKeyCode);
      await setDoc(keyDocRef, {
        code: newKeyCode,
        createdAt: Date.now(),
        status: "active",
        used: false,
        usedBy: "",
        usedAt: 0,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // Key itself is valid to activate anytime
      });
      setStatusMessage(`Successfully generated VIP Key: ${newKeyCode} 🎉`);
    } catch (err) {
      console.error("Failed to generate VIP key:", err);
      setStatusMessage("Failed to generate VIP key.");
    } finally {
      setGeneratingKey(false);
    }
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
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                sk edz admin
              </h1>
              <p className="text-xs text-slate-400 font-mono">LIQUID GLASS CONSOLE</p>
            </div>
          </div>
          
          <a 
            href="/" 
            className="flex items-center space-x-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 group text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
            <span>Go to Player 🎧</span>
          </a>
        </header>

        {/* Switchable Tabs Selector */}
        <div className="flex space-x-2 p-1 bg-white/5 border border-white/10 rounded-2xl mb-8 self-start backdrop-blur-md">
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
          </button>
        </div>

        {activeTab === "songs" ? (
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

                {/* Artist */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Artist Name *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Anirudh Ravichander" 
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-cyan-400/50 rounded-2xl text-slate-100 outline-none transition-all placeholder-slate-500 backdrop-blur-md text-sm"
                  />
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

                {/* Audio URL & Direct Upload */}
                <div className="border border-white/5 rounded-2xl p-4 bg-black/20">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider">Audio Stream Source *</label>
                    <span className="text-[10px] text-slate-400 font-mono">URL OR UPLOAD</span>
                  </div>
                  
                  <input 
                    type="url" 
                    placeholder="Enter external direct MP3 URL" 
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 focus:border-cyan-400/30 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs mb-3"
                  />

                  {/* File picker for Audio */}
                  <div className="relative flex items-center justify-center border border-dashed border-white/15 rounded-xl p-4 hover:border-cyan-500/30 transition-all group bg-white/5 cursor-pointer">
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
                    <div className="mt-3">
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

                {/* Cover Image URL & Direct Upload */}
                <div className="border border-white/5 rounded-2xl p-4 bg-black/20">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-pink-400 uppercase tracking-wider">Cover Image (Optional)</label>
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

                  <input 
                    type="url" 
                    placeholder="Enter external direct Cover URL" 
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 focus:border-pink-400/30 rounded-xl text-slate-200 outline-none transition-all placeholder-slate-600 text-xs mb-3"
                  />

                  {/* File picker for Image */}
                  <div className="relative flex items-center justify-center border border-dashed border-white/15 rounded-xl p-4 hover:border-pink-500/30 transition-all group bg-white/5 cursor-pointer">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, "image")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="text-center">
                      <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-pink-400 mx-auto mb-1.5 transition-colors" />
                      <span className="text-xs text-slate-300 font-medium block">Upload Cover Art</span>
                      <span className="text-[10px] text-slate-500 block">JPG, PNG, WEBP, GIF</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {uploadProgress.image_file !== undefined && uploadProgress.image_file > 0 && (
                    <div className="mt-3">
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
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                      <Music className="w-5 h-5 text-indigo-400" />
                      <span>Track Library ({songs.length})</span>
                    </h2>
                    <p className="text-xs text-slate-400">All songs available for streaming on skplayer</p>
                  </div>
                  <button 
                    onClick={fetchSongs} 
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all"
                    title="Reload Tracks"
                  >
                    <Loader2 className={`w-4 h-4 ${loadingSongs ? "animate-spin" : ""}`} />
                  </button>
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
                    {songs.map((song) => (
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
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          /* VIP Keys Manager Dashboard */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
            {/* Left/Top Column: Key Generation */}
            <div className="lg:col-span-4 bg-white/5 border border-amber-500/15 rounded-3xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Crown className="w-5 h-5 text-amber-400 animate-pulse fill-amber-400/20" />
                  <h2 className="text-lg font-bold text-slate-100">VIP Gold Keys</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Generate secure single-use passcodes. When activated, these passcodes grant 30 days of premium VIP Gold status to any user.
                </p>

                <button
                  onClick={handleGenerateVipKey}
                  disabled={generatingKey}
                  className="w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-black transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-[0_4px_20px_rgba(245,158,11,0.25)] text-xs uppercase"
                >
                  {generatingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Passcode...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Generate VIP Gold Key</span>
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
            <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                    <Key className="w-5 h-5 text-amber-400" />
                    <span>Passcode Registry ({keysList.length})</span>
                  </h2>
                  <p className="text-xs text-slate-400">Real-time status tracking and key reactivation deck</p>
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
                    Click "Generate VIP Gold Key" on the left to create secure premium access codes!
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
                  {keysList.map((k) => (
                    <div
                      key={k.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-2xl gap-4 transition-all duration-300 hover:translate-x-1"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-3.5">
                          <span className="font-mono font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg text-base tracking-wider shadow-[0_2px_8px_rgba(245,158,11,0.05)]">
                            {k.code}
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

                      <div className="flex items-center space-x-2.5 sm:self-center">
                        <button
                          onClick={() => handleToggleKeyStatus(k.id, k.status, k.used)}
                          className={`px-3.5 py-2 rounded-xl border text-xs font-black transition-all duration-300 uppercase ${
                            k.used || k.status === "disabled"
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:scale-105"
                              : "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400 hover:scale-105"
                          }`}
                          title={k.used || k.status === "disabled" ? "Activate or reset this code for use" : "Deactivate / disable this code"}
                        >
                          {k.used ? "Reactivate (Reset)" : k.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        
                        <button
                          onClick={() => handleDeleteKey(k.id)}
                          className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-black transition-all uppercase hover:scale-105"
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

        {/* Footer */}
        <footer className="mt-12 text-center text-[11px] text-slate-500 font-mono border-t border-white/5 pt-6">
          <p>skplayer Admin Console — Powered by ImgBB, Local Storage & Firebase Firestore</p>
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

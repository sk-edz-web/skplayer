import React, { useState, useMemo } from "react";
import { ArtistProfile, Song } from "../types";
import { 
  User, 
  Search, 
  Plus, 
  Trash2, 
  Edit, 
  Image as ImageIcon, 
  Music, 
  Sparkles, 
  Check, 
  X, 
  Loader2, 
  Upload, 
  ExternalLink,
  Users,
  Mic2,
  Globe,
  Radio,
  CheckSquare,
  Square,
  ListMusic,
  CheckCircle2,
  Filter,
  Layers,
  Disc,
  Clock,
  ArrowRight
} from "lucide-react";

interface AdminArtistsManagerProps {
  artists: ArtistProfile[];
  songs: Song[];
  loading: boolean;
  onSaveArtist: (artistData: Partial<ArtistProfile>, id?: string) => Promise<void>;
  onDeleteArtist: (artistId: string) => Promise<void>;
  onAssignSongsToArtist?: (artist: ArtistProfile, songIds: string[]) => Promise<void>;
  onSelectArtistForSongUpload?: (artistName: string, artistImageUrl?: string) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onShowToast: (text: string, type?: "success" | "info" | "error") => void;
}

export default function AdminArtistsManager({
  artists,
  songs,
  loading,
  onSaveArtist,
  onDeleteArtist,
  onAssignSongsToArtist,
  onSelectArtistForSongUpload,
  onUploadImage,
  onShowToast
}: AdminArtistsManagerProps) {
  // Form States
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [genre, setGenre] = useState("");
  const [instagram, setInstagram] = useState("");
  const [spotify, setSpotify] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // UI States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenreFilter, setSelectedGenreFilter] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Multi-Song Selector / Assign Modal State
  const [assignModalArtist, setAssignModalArtist] = useState<ArtistProfile | null>(null);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [assignSongSearch, setAssignSongSearch] = useState("");
  const [assignFilterTab, setAssignFilterTab] = useState<"all" | "selected" | "matched" | "other">("all");
  const [isAssigningSongs, setIsAssigningSongs] = useState(false);

  // Common quick genres
  const QUICK_GENRES = [
    "Tamil Cinema",
    "Melody",
    "Kuthu / Dance",
    "EDM / Electronic",
    "Pop",
    "Hip-Hop / Rap",
    "Carnatic / Classical",
    "Rock",
    "Folk",
    "Indie"
  ];

  // Start editing artist
  const handleStartEdit = (art: ArtistProfile) => {
    setEditingId(art.id);
    setName(art.name);
    setImageUrl(art.imageUrl || "");
    setBio(art.bio || "");
    setGenre(art.genre || "");
    setInstagram(art.instagram || "");
    setSpotify(art.spotify || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setImageUrl("");
    setBio("");
    setGenre("");
    setInstagram("");
    setSpotify("");
  };

  // Image Upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    onShowToast("Uploading artist profile picture...", "info");
    
    try {
      const url = await onUploadImage(file);
      if (url) {
        setImageUrl(url);
        onShowToast("Profile picture uploaded successfully! 📸", "success");
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      onShowToast("Failed to upload image.", "error");
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Save / Update Artist
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      onShowToast("Please enter artist name.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveArtist(
        {
          name: cleanName,
          imageUrl: imageUrl.trim() || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop",
          bio: bio.trim(),
          genre: genre.trim(),
          instagram: instagram.trim(),
          spotify: spotify.trim()
        },
        editingId || undefined
      );

      handleCancelEdit();
    } catch (err: any) {
      console.error("Error saving artist profile:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count tracks per artist in library
  const getTrackCountForArtist = (artist: ArtistProfile) => {
    const norm = (artist.name || "").toLowerCase().trim();
    return songs.filter(
      (s) => (s.artistId && s.artistId === artist.id) || (s.artist && s.artist.toLowerCase().trim() === norm)
    ).length;
  };

  // Open Assign Existing Songs Modal
  const handleOpenAssignModal = (art: ArtistProfile) => {
    setAssignModalArtist(art);
    setAssignSongSearch("");
    setAssignFilterTab("all");

    // Pre-populate with all songs already matching this artist
    const norm = (art.name || "").toLowerCase().trim();
    const alreadyMatchedIds = songs
      .filter((s) => (s.artistId && s.artistId === art.id) || (s.artist && s.artist.toLowerCase().trim() === norm))
      .map((s) => s.id);

    setSelectedSongIds(alreadyMatchedIds);
  };

  // Toggle selection for a song in modal
  const handleToggleSongSelect = (songId: string) => {
    setSelectedSongIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]
    );
  };

  // Select all currently filtered songs
  const handleSelectAllFilteredSongs = (filteredList: Song[]) => {
    const filteredIds = filteredList.map((s) => s.id);
    const allSelected = filteredIds.every((id) => selectedSongIds.includes(id));

    if (allSelected) {
      // Deselect all filtered
      setSelectedSongIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      // Union of currently selected and filtered
      const nextSet = new Set([...selectedSongIds, ...filteredIds]);
      setSelectedSongIds(Array.from(nextSet));
    }
  };

  // Execute Batch Assignment to Database
  const handleSaveSongAssignments = async () => {
    if (!assignModalArtist) return;

    if (selectedSongIds.length === 0) {
      onShowToast("Please select at least 1 song to link with this artist.", "info");
      return;
    }

    setIsAssigningSongs(true);
    try {
      if (onAssignSongsToArtist) {
        await onAssignSongsToArtist(assignModalArtist, selectedSongIds);
      } else {
        onShowToast(`Linked ${selectedSongIds.length} tracks to ${assignModalArtist.name}!`, "success");
      }
      setAssignModalArtist(null);
    } catch (err: any) {
      console.error("Failed to assign songs:", err);
      onShowToast(`Error assigning songs: ${err.message || "Failed"}`, "error");
    } finally {
      setIsAssigningSongs(false);
    }
  };

  // Filtered artists list
  const filteredArtists = artists.filter((art) => {
    const matchSearch =
      !searchTerm.trim() ||
      art.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (art.genre && art.genre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (art.bio && art.bio.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchGenre =
      selectedGenreFilter === "all" ||
      (art.genre && art.genre.toLowerCase() === selectedGenreFilter.toLowerCase());

    return matchSearch && matchGenre;
  });

  // Extract unique genres for filtering
  const allArtistGenres = Array.from(
    new Set(artists.map((a) => a.genre).filter(Boolean))
  ) as string[];

  // Filtered songs inside the Assign Modal
  const modalFilteredSongs = useMemo(() => {
    if (!assignModalArtist) return [];
    const normArtistName = (assignModalArtist.name || "").toLowerCase().trim();

    return songs.filter((song) => {
      // 1. Text search filter
      const query = assignSongSearch.toLowerCase().trim();
      const matchesSearch =
        !query ||
        song.title.toLowerCase().includes(query) ||
        (song.artist && song.artist.toLowerCase().includes(query)) ||
        (song.album && song.album.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // 2. Tab filter
      const isCurrentlyMatched =
        (song.artistId && song.artistId === assignModalArtist.id) ||
        (song.artist && song.artist.toLowerCase().trim() === normArtistName);
      const isSelected = selectedSongIds.includes(song.id);

      if (assignFilterTab === "selected") return isSelected;
      if (assignFilterTab === "matched") return isCurrentlyMatched;
      if (assignFilterTab === "other") return !isCurrentlyMatched;

      return true;
    });
  }, [songs, assignModalArtist, assignSongSearch, assignFilterTab, selectedSongIds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
      
      {/* 1. Left Column: Add / Edit Artist Profile Card */}
      <div className="lg:col-span-5 bg-white/5 border border-purple-500/20 rounded-3xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <Mic2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                {editingId ? "Edit Artist Profile" : "Add Artist Profile"}
              </h2>
              <p className="text-xs text-slate-400">Manage singer & music director profiles</p>
            </div>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all text-xs flex items-center space-x-1"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Artist Profile Image Preview & Upload */}
          <div className="flex items-center space-x-4 p-3 bg-black/40 rounded-2xl border border-white/5">
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-purple-500/20 border border-purple-400/30 flex-shrink-0 shadow-lg group/img">
              {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-purple-300 font-bold text-xl">
                  {name ? name.charAt(0).toUpperCase() : <User className="w-6 h-6 text-purple-400" />}
                </div>
              )}

              {isUploadingImage && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Artist Photo / Avatar
              </label>
              <div className="flex items-center space-x-2">
                <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-purple-200 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploadingImage}
                  />
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="p-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 text-xs transition-colors"
                    title="Remove Photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Or Paste Direct Image URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Or Image URL
            </label>
            <div className="relative">
              <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-black/40 border border-white/10 focus:border-purple-400/50 rounded-xl text-slate-200 placeholder-slate-600 text-xs outline-none transition-all"
              />
            </div>
          </div>

          {/* Artist Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Artist / Singer Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="e.g. Anirudh Ravichander, Sid Sriram, A.R. Rahman"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-black/40 border border-white/10 focus:border-purple-400/60 rounded-xl text-slate-100 placeholder-slate-500 text-sm font-semibold outline-none transition-all focus:ring-1 focus:ring-purple-400/30"
              />
            </div>
          </div>

          {/* Genre / Style */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Primary Genre / Style (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Tamil Cinema, EDM, Melody, Composer"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-purple-400/50 rounded-xl text-slate-200 placeholder-slate-600 text-xs outline-none transition-all"
            />

            {/* Quick Genre Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_GENRES.slice(0, 6).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenre(g)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all border ${
                    genre.toLowerCase() === g.toLowerCase()
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-white/5 text-slate-400 hover:text-slate-200 border-white/5"
                  }`}
                >
                  +{g}
                </button>
              ))}
            </div>
          </div>

          {/* Bio / Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Artist Bio / Info (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Short bio, awards, or description..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-purple-400/50 rounded-xl text-slate-200 placeholder-slate-600 text-xs outline-none transition-all resize-none"
            />
          </div>

          {/* Social Links (Instagram / Spotify) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                Instagram (Optional)
              </label>
              <input
                type="text"
                placeholder="@username"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/10 focus:border-purple-400/50 rounded-xl text-slate-200 placeholder-slate-600 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                Spotify / Link (Optional)
              </label>
              <input
                type="text"
                placeholder="Spotify URL"
                value={spotify}
                onChange={(e) => setSpotify(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/10 focus:border-purple-400/50 rounded-xl text-slate-200 placeholder-slate-600 text-xs outline-none"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-[0_4px_25px_rgba(168,85,247,0.3)] text-xs uppercase font-mono"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Artist Profile...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>{editingId ? "Update Artist Profile" : "Save Artist Profile"}</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 2. Right Column: Artists Directory & Search */}
      <div className="lg:col-span-7 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl space-y-6">
        
        {/* Header & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Users className="w-5 h-5 text-purple-400" />
              <span>Artist Profiles ({artists.length})</span>
            </h2>
            <p className="text-xs text-slate-400">
              Select any artist to link already uploaded songs with 1-click batch update
            </p>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px] sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search artist by name or genre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-7 py-2 bg-black/40 border border-white/10 focus:border-purple-400/60 rounded-xl text-slate-200 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-purple-400/30"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Genre Filter Chips if available */}
        {allArtistGenres.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
            <span className="text-[10px] font-mono text-slate-400 uppercase mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setSelectedGenreFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                selectedGenreFilter === "all"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              All ({artists.length})
            </button>
            {allArtistGenres.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGenreFilter(g)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                  selectedGenreFilter.toLowerCase() === g.toLowerCase()
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Artists Grid / List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-purple-400 animate-spin mb-4" />
            <p className="text-sm font-mono text-slate-400">Loading artist profiles...</p>
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-300">
              {searchTerm ? "No matching artists found" : "No artist profiles created yet"}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
              {searchTerm
                ? `Try another search keyword for "${searchTerm}".`
                : "Add your first artist profile on the left to start organizing songs by artist!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[580px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredArtists.map((art) => {
              const trackCount = getTrackCountForArtist(art);

              return (
                <div
                  key={art.id}
                  className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-purple-500/30 transition-all duration-300 flex flex-col justify-between space-y-3 group hover:translate-y-[-2px] shadow-sm"
                >
                  {/* Top info */}
                  <div className="flex items-start space-x-3">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden border border-purple-400/30 bg-purple-500/20 flex-shrink-0 shadow-md">
                      <img
                        src={art.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop"}
                        alt={art.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-100 group-hover:text-purple-300 transition-colors truncate">
                        {art.name}
                      </h4>

                      {art.genre && (
                        <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/25 text-purple-300 mt-1">
                          {art.genre}
                        </span>
                      )}

                      {art.bio && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                          {art.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom Stats & Actions */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5 text-slate-400 font-mono text-[11px]">
                        <Music className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          <strong className="text-slate-200">{trackCount}</strong> {trackCount === 1 ? "track" : "tracks"} linked
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1">
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(art)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 text-slate-300 hover:text-purple-300 transition-all"
                          title="Edit Artist Profile"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => onDeleteArtist(art.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 transition-all"
                          title="Delete Artist Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Song Assignment & Upload Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {/* Main Feature: Select & Add from already uploaded songs list */}
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(art)}
                        className="py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_12px_rgba(168,85,247,0.15)] group/btn"
                        title="Multi-select already uploaded songs to link to this artist"
                      >
                        <ListMusic className="w-3.5 h-3.5 text-purple-400 group-hover/btn:scale-110 transition-transform" />
                        <span>Add Songs 🎵</span>
                      </button>

                      {/* Shortcut to upload new song */}
                      {onSelectArtistForSongUpload && (
                        <button
                          type="button"
                          onClick={() => onSelectArtistForSongUpload(art.name, art.imageUrl)}
                          className="py-1.5 px-2 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-all flex items-center justify-center space-x-1"
                          title="Upload a new song for this artist"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Upload New</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. MULTI-SONG ASSIGNMENT MODAL (Select from already uploaded songs & Batch Update Database) */}
      {assignModalArtist && (
        <div
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => !isAssigningSongs && setAssignModalArtist(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] bg-[#0c0f1d] border border-purple-500/40 rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-white/10 bg-gradient-to-r from-purple-900/30 via-indigo-950/20 to-transparent flex items-center justify-between">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-purple-400/40 bg-purple-500/20 flex-shrink-0 shadow-lg">
                  <img
                    src={assignModalArtist.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop"}
                    alt={assignModalArtist.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base sm:text-lg font-bold text-white truncate">
                      Add Songs to {assignModalArtist.name}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Artist Profile
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select multiple songs from your uploaded library below. Clicking <strong className="text-purple-300">Done</strong> will automatically link them in the database!
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isAssigningSongs}
                onClick={() => setAssignModalArtist(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Controls: Search Bar & Filter Tabs */}
            <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search uploaded tracks by title, album, or current singer..."
                  value={assignSongSearch}
                  onChange={(e) => setAssignSongSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-black/50 border border-white/15 focus:border-purple-400/60 rounded-2xl text-slate-100 placeholder-slate-500 text-xs outline-none transition-all focus:ring-1 focus:ring-purple-400/30"
                />
                {assignSongSearch && (
                  <button
                    type="button"
                    onClick={() => setAssignSongSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Tabs & Bulk Select Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAssignFilterTab("all")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                      assignFilterTab === "all"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    All Songs ({songs.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignFilterTab("selected")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center space-x-1 ${
                      assignFilterTab === "selected"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>Selected</span>
                    <span className="px-1.5 py-0.2 rounded-md bg-black/30 text-purple-200 text-[10px]">
                      {selectedSongIds.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignFilterTab("matched")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                      assignFilterTab === "matched"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    Linked to {assignModalArtist.name}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignFilterTab("other")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                      assignFilterTab === "other"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    Other Tracks
                  </button>
                </div>

                {/* Quick Select All Filtered button */}
                {modalFilteredSongs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectAllFilteredSongs(modalFilteredSongs)}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all"
                  >
                    {modalFilteredSongs.every((s) => selectedSongIds.includes(s.id)) ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                        <span>Deselect All Filtered</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-purple-400" />
                        <span>Select All Filtered ({modalFilteredSongs.length})</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Songs List Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 custom-scrollbar max-h-[420px]">
              {modalFilteredSongs.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <Music className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-300">No songs match current filters</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {assignSongSearch ? `Try clearing "${assignSongSearch}" search query` : "No uploaded songs available"}
                  </p>
                </div>
              ) : (
                modalFilteredSongs.map((song) => {
                  const isSelected = selectedSongIds.includes(song.id);
                  const isAlreadyLinked =
                    (song.artistId && song.artistId === assignModalArtist.id) ||
                    (song.artist && song.artist.toLowerCase().trim() === (assignModalArtist.name || "").toLowerCase().trim());

                  return (
                    <div
                      key={song.id}
                      onClick={() => handleToggleSongSelect(song.id)}
                      className={`p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group select-none ${
                        isSelected
                          ? "bg-purple-600/15 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                          : "bg-white/[0.02] hover:bg-white/[0.06] border-white/5 hover:border-white/15"
                      }`}
                    >
                      {/* Left: Checkbox + Artwork + Title info */}
                      <div className="flex items-center space-x-3.5 min-w-0">
                        {/* Checkbox Icon */}
                        <div className="flex-shrink-0 text-purple-400">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-lg bg-purple-600 flex items-center justify-center text-white shadow-sm">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-lg border border-slate-600 group-hover:border-purple-400 transition-colors bg-black/30" />
                          )}
                        </div>

                        {/* Cover Image */}
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/50 border border-white/10 flex-shrink-0">
                          <img
                            src={song.imageUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop"}
                            alt={song.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        {/* Song Details */}
                        <div className="min-w-0">
                          <p className={`text-xs sm:text-sm font-bold truncate transition-colors ${
                            isSelected ? "text-purple-200 font-semibold" : "text-slate-100 group-hover:text-purple-300"
                          }`}>
                            {song.title}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate flex items-center space-x-1.5 mt-0.5">
                            <span>{song.album || "Single"}</span>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-300">Artist: {song.artist || "Unknown"}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right side: Status Tag */}
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {isAlreadyLinked && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-mono">
                            Currently Linked
                          </span>
                        )}

                        {isSelected && !isAlreadyLinked && (
                          <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold">
                            + Will Link
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Bottom Sticky Footer: Summary & Done Button */}
            <div className="p-4 sm:p-5 border-t border-white/10 bg-black/60 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-xs text-slate-300 font-mono">
                <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold">
                  {selectedSongIds.length} Selected
                </span>
                <span>will be updated to <strong className="text-white">{assignModalArtist.name}</strong></span>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isAssigningSongs}
                  onClick={() => setAssignModalArtist(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isAssigningSongs}
                  onClick={handleSaveSongAssignments}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold font-mono transition-all shadow-[0_0_25px_rgba(168,85,247,0.4)] flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isAssigningSongs ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Done - Save & Update Database ({selectedSongIds.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

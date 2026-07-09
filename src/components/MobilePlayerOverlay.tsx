import React, { useEffect, useRef, useState } from "react";
import { 
  X, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Repeat, 
  Volume2, 
  VolumeX, 
  Disc, 
  ListMusic, 
  ChevronDown,
  Sparkles,
  Sliders,
  Loader2,
  Plus
} from "lucide-react";
import { Song } from "../types";

interface MobilePlayerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  isBuffering?: boolean;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrev: () => void;
  currentTime: number;
  duration: number;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  volume: number;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  playbackMode: "normal" | "loop-one" | "loop-all" | "shuffle";
  onChangePlaybackMode: () => void;
  formatTime: (secs: number) => string;
  onOpenEqualizer: () => void;
  playlists: any[];
  onAddSongToPlaylist: (songId: string, playlist: any) => void;
}

export default function MobilePlayerOverlay({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  isBuffering = false,
  onTogglePlay,
  onSkipNext,
  onSkipPrev,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  playbackMode,
  onChangePlaybackMode,
  formatTime,
  onOpenEqualizer,
  playlists,
  onAddSongToPlaylist,
}: MobilePlayerOverlayProps) {
  if (!isOpen || !currentSong) return null;

  const [isVinylSlidOut, setIsVinylSlidOut] = useState(true);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [swipeAction, setSwipeAction] = useState<"left" | "right" | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  // Prevent background body scroll when the player overlay is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const triggerSwipe = (dir: "left" | "right", action: () => void) => {
    setSwipeAction(dir);
    setTimeout(() => {
      action();
      // Reset swipeAction so the next song enters with a sleek slide-in transition!
      setSwipeAction(null);
    }, 250);
  };

  const isDragging = useRef<boolean>(false);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - touchStartX.current;
    const diffY = endY - touchStartY.current;
    
    // Swipe left (next), Swipe right (prev)
    // Predominantly horizontal swipe and exceeds threshold (45px)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
      if (diffX < 0) {
        // Finger swiped left -> Go to NEXT
        triggerSwipe("left", onSkipNext);
      } else {
        // Finger swiped right -> Go to PREV
        triggerSwipe("right", onSkipPrev);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left-click drags
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const endX = e.clientX;
    const endY = e.clientY;
    const diffX = endX - dragStartX.current;
    const diffY = endY - dragStartY.current;

    // Swipe left (next), Swipe right (prev)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
      if (diffX < 0) {
        triggerSwipe("left", onSkipNext);
      } else {
        triggerSwipe("right", onSkipPrev);
      }
    }
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  const onClickCenterpiece = (e: React.MouseEvent) => {
    // If a swipe drag happened, don't toggle open/close of vinyl!
    const diffX = Math.abs(e.clientX - dragStartX.current);
    const diffY = Math.abs(e.clientY - dragStartY.current);
    if (diffX > 8 || diffY > 8) {
      return;
    }
    setIsVinylSlidOut(!isVinylSlidOut);
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center select-none overflow-hidden cursor-grab active:cursor-grabbing"
    >
      {/* Centered Glass Player Card on Desktop, Full Screen on Mobile */}
      <div className="relative w-full h-full md:max-h-[92vh] md:h-[92vh] md:max-w-md bg-[#070811]/95 md:border md:border-white/10 rounded-none md:rounded-[32px] p-6 flex flex-col justify-between overflow-y-auto shadow-2xl animate-slide-up custom-scrollbar">
        
        {/* Organic Background Blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-cyan-500/15 blur-[80px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/3 left-1/3 w-72 h-72 rounded-full bg-indigo-500/10 blur-[90px] pointer-events-none animate-pulse" style={{ animationDelay: "1.5s" }}></div>

      {/* Top Bar with stacking context priority */}
      <div className="relative z-30 flex justify-between items-center">
        <button 
          onClick={onClose}
          className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-slate-300"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-bold">PLAYING FROM LIBRARY</span>
          <h3 className="text-xs font-medium text-slate-400 truncate max-w-[150px]">{currentSong.album || "skplayer"}</h3>
        </div>
        
        {/* Dropdown Save to Playlist Button replacing empty placeholder */}
        <div className="relative">
          <button 
            type="button"
            onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
            className={`p-3 border rounded-full transition-all active:scale-95 ${
              showPlaylistMenu 
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" 
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            }`}
            title="Add Currently Playing Song to Playlist"
          >
            <Plus className="w-5 h-5" />
          </button>
          
          {showPlaylistMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#0b0c16]/95 border border-white/12 rounded-2xl p-2 shadow-2xl z-40 backdrop-blur-2xl animate-fade-in text-left">
              <p className="text-[10px] font-bold text-cyan-400 px-3 py-1.5 uppercase tracking-wider border-b border-white/5 select-none">Save to Playlist</p>
              {playlists.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-[10px] text-slate-500">No playlists found. Create one first!</p>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto mt-1 custom-scrollbar space-y-0.5">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        onAddSongToPlaylist(currentSong.id, pl);
                        setShowPlaylistMenu(false);
                      }}
                      className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-xl truncate block font-medium"
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

      {/* Custom CD Pack Sleeve Centerpiece - Tapping toggles open/close */}
      <div 
        className="relative z-10 my-4 flex flex-col items-center justify-center w-full cursor-pointer"
        onClick={onClickCenterpiece}
      >
        <div className={`relative flex items-center justify-center h-[260px] md:h-[300px] w-full max-w-sm overflow-visible transition-all duration-300 ease-out ${
          swipeAction === "left" 
            ? "-translate-x-[150%] opacity-0 rotate-[-12deg]" 
            : swipeAction === "right" 
              ? "translate-x-[150%] opacity-0 rotate-[12deg]" 
              : "translate-x-0 opacity-100 rotate-0"
        }`}>
          
          {/* Glowing Ambient Outer Ring behind the CD Pack */}
          <div className="absolute w-72 h-72 bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          
          {/* 1. CD SLEEVE / COVER BOX (Left Side) */}
          <div 
            className={`absolute w-52 h-52 md:w-60 md:h-60 bg-[#0e1124] rounded-2xl border border-white/12 shadow-2xl overflow-hidden z-20 transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${
              isVinylSlidOut 
                ? "-translate-x-14 md:-translate-x-16 rotate-[-2deg] shadow-[0_20px_50px_rgba(0,0,0,0.7)]" 
                : "translate-x-0 shadow-[0_15px_35px_rgba(0,0,0,0.5)]"
            }`}
          >
            {/* Cover photo */}
            <img 
              src={currentSong.imageUrl} 
              alt={currentSong.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            {/* CD Pack spine decoration */}
            <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-black/40 border-r border-white/10 flex flex-col items-center justify-center py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
            </div>
            
            {/* Interactive "TAP TO OPEN/CLOSE" banner */}
            <div className="absolute bottom-0 inset-x-0 bg-black/65 backdrop-blur-sm py-1.5 px-3 text-center border-t border-white/5">
              <span className="text-[9px] font-mono tracking-wider text-cyan-400 font-extrabold uppercase">
                {isVinylSlidOut ? "Tap to Close Box" : "Tap to Open CD"}
              </span>
            </div>
          </div>

          {/* 2. VINYL DISC / ROUND CD (Sliding out to the right) */}
          <div 
            className={`absolute w-48 h-48 md:w-56 md:h-56 rounded-full bg-[#080808] border-[8px] border-neutral-900 shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${
              isVinylSlidOut 
                ? "translate-x-16 md:translate-x-20 z-10 rotate-[12deg]" 
                : "translate-x-0 scale-95 opacity-50 z-10"
            } ${isVinylSlidOut && isPlaying ? "animate-spin-slow" : ""}`}
            style={{
              boxShadow: "0 10px 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(255,255,255,0.05)"
            }}
          >
            {/* Grooves */}
            <div className="absolute inset-2 border border-neutral-800 rounded-full opacity-40"></div>
            <div className="absolute inset-8 border border-neutral-800 rounded-full opacity-40"></div>
            <div className="absolute inset-14 border border-neutral-800 rounded-full opacity-40"></div>
            <div className="absolute inset-20 border border-neutral-800 rounded-full opacity-40"></div>

            {/* Inner Cover Photo */}
            <div className="relative w-22 h-22 md:w-26 md:h-26 rounded-full overflow-hidden border-4 border-neutral-950 shadow-inner">
              <img 
                src={currentSong.imageUrl} 
                alt={currentSong.title} 
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
              {/* Spindle hole in center */}
              <div className="absolute inset-0 m-auto w-4.5 h-4.5 bg-black border-2 border-slate-700 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]"></div>
            </div>
          </div>

        </div>

        {/* Swipe instruction tooltip */}
        <div className="text-center mt-1 z-10 pointer-events-none select-none">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-cyan-500/5 border border-cyan-500/10 text-[9px] font-mono tracking-wider text-cyan-400 uppercase font-black">
            <span>← Swipe Left (Next)</span>
            <span className="text-slate-600">•</span>
            <span>Swipe Right (Prev) →</span>
          </span>
        </div>

        {/* Dynamic Visualizer Indicator */}
        <div className="flex space-x-1 items-end h-8 mt-4">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i} 
              className={`w-1 rounded-full bg-gradient-to-t from-cyan-400 to-indigo-500 transition-all duration-300 ${
                isPlaying ? "animate-audio-bar" : "h-1"
              }`}
              style={{ 
                animationDelay: `${i * 0.12}s`,
                height: isPlaying ? `${Math.floor(Math.random() * 24) + 6}px` : "3px"
              }}
            ></div>
          ))}
        </div>
      </div>

      {/* Media Details */}
      <div className="relative z-10 px-2 mt-auto">
        <div className="flex justify-between items-center">
          <div className="min-w-0 pr-4">
            <h1 className="text-xl font-bold text-slate-100 truncate tracking-tight">{currentSong.title}</h1>
            <p className="text-sm text-slate-400 truncate mt-1">{currentSong.artist}</p>
          </div>
          <button 
            type="button"
            onClick={onOpenEqualizer}
            className="p-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-full text-cyan-400 active:scale-90 transition-all"
            title="Open Equalizer"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar and Scrubber */}
        <div className="mt-6">
          <input 
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={onSeek}
            className="w-full accent-cyan-400 h-1.5 rounded-lg bg-white/10 cursor-pointer outline-none transition-all"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Controls */}
        <div className="flex justify-between items-center mt-6 px-4">
          
          {/* Shuffle/Loop */}
          <button 
            onClick={onChangePlaybackMode}
            className={`p-2.5 rounded-full transition-all ${
              playbackMode !== "normal" 
                ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {playbackMode === "shuffle" ? (
              <Shuffle className="w-5 h-5" />
            ) : playbackMode === "loop-one" ? (
              <div className="relative">
                <Repeat className="w-5 h-5 text-cyan-400" />
                <span className="absolute -top-1.5 -right-1 text-[8px] font-bold font-mono px-0.5 bg-cyan-500 text-black rounded">1</span>
              </div>
            ) : playbackMode === "loop-all" ? (
              <Repeat className="w-5 h-5 text-cyan-400" />
            ) : (
              <Repeat className="w-5 h-5 text-slate-400" />
            )}
          </button>

          {/* Previous Track */}
          <button 
            onClick={onSkipPrev}
            className="p-3 bg-white/5 hover:bg-white/10 active:scale-90 rounded-full border border-white/10 text-slate-200 transition-all"
          >
            <SkipBack className="w-5 h-5 fill-slate-200" />
          </button>

          {/* Play/Pause Trigger */}
          <button 
            onClick={onTogglePlay}
            className="p-5 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:scale-105 active:scale-95 rounded-full shadow-[0_0_25px_rgba(6,182,212,0.4)] text-black transition-all flex items-center justify-center w-[68px] h-[68px]"
          >
            {isBuffering ? (
              <Loader2 className="w-7 h-7 text-black animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7 text-black fill-black" />
            ) : (
              <Play className="w-7 h-7 text-black fill-black ml-0.5" />
            )}
          </button>

          {/* Next Track */}
          <button 
            onClick={onSkipNext}
            className="p-3 bg-white/5 hover:bg-white/10 active:scale-90 rounded-full border border-white/10 text-slate-200 transition-all"
          >
            <SkipForward className="w-5 h-5 fill-slate-200" />
          </button>

          {/* Mute/Volume Trigger */}
          <button 
            onClick={onToggleMute}
            className="p-2.5 text-slate-400 hover:text-slate-200 transition-all"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-5 h-5 text-red-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-slate-300" />
            )}
          </button>
        </div>

        {/* Volume Scrubber bar on Mobile Panel */}
        <div className="flex items-center space-x-3 mt-6 mb-4 px-6 opacity-80">
          <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          <input 
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={onVolumeChange}
            className="w-full accent-cyan-400 h-1 rounded bg-white/10 cursor-pointer outline-none"
          />
          <Volume2 className="w-3.5 h-3.5 text-slate-300" />
        </div>
      </div>
    </div>
  </div>
  );
}

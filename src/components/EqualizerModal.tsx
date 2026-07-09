import React, { useRef } from "react";
import { Sliders, Download, Upload, X, Check, Sparkles, Crown } from "lucide-react";

export interface EqSettings {
  preset: string;
  bands: {
    hz60: number;
    hz230: number;
    hz910: number;
    hz4k: number;
    hz14k: number;
  };
  goldBassActive?: boolean;
}

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eqSettings: EqSettings;
  onChangeEq: (settings: EqSettings) => void;
  isPro?: boolean;
  onUpgradeRequired?: (msg: string) => void;
}

export const PRESETS: { name: string; bands: EqSettings["bands"]; isGold?: boolean }[] = [
  {
    name: "Normal",
    bands: { hz60: 0, hz230: 0, hz910: 0, hz4k: 0, hz14k: 0 },
  },
  {
    name: "Bass Boost",
    bands: { hz60: 8, hz230: 4, hz910: 0, hz4k: 0, hz14k: 0 },
  },
  {
    name: "Vocal Booster",
    bands: { hz60: -2, hz230: 1, hz910: 4, hz4k: 5, hz14k: 2 },
  },
  {
    name: "Rock",
    bands: { hz60: 5, hz230: 2, hz910: -1, hz4k: 3, hz14k: 5 },
  },
  {
    name: "Pop",
    bands: { hz60: -1, hz230: 2, hz910: 3, hz4k: 2, hz14k: -1 },
  },
  {
    name: "Classical",
    bands: { hz60: 4, hz230: 3, hz910: 1, hz4k: 2, hz14k: 4 },
  },
];

export default function EqualizerModal({
  isOpen,
  onClose,
  eqSettings,
  onChangeEq,
  isPro = false,
  onUpgradeRequired,
}: EqualizerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [vipMessage, setVipMessage] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleBandChange = (band: keyof EqSettings["bands"], value: number) => {
    // If they try to manually drag sliders to high-fidelity values, let them, but clear any VIP message
    setVipMessage(null);
    const updatedBands = {
      ...eqSettings.bands,
      [band]: value,
    };

    // Check if this matches an existing preset, otherwise set to Custom
    let matchedPreset = "Custom";
    for (const p of PRESETS) {
      const match =
        p.bands.hz60 === updatedBands.hz60 &&
        p.bands.hz230 === updatedBands.hz230 &&
        p.bands.hz910 === updatedBands.hz910 &&
        p.bands.hz4k === updatedBands.hz4k &&
        p.bands.hz14k === updatedBands.hz14k;
      if (match) {
        matchedPreset = p.name;
        break;
      }
    }

    onChangeEq({
      preset: matchedPreset,
      bands: updatedBands,
      goldBassActive: eqSettings.goldBassActive,
    });
  };

  const selectPreset = (presetName: string, bands: EqSettings["bands"], isGoldPreset?: boolean) => {
    if (isGoldPreset && !isPro) {
      if (onUpgradeRequired) {
        onUpgradeRequired("👑 Bass Gold is a premium Golden VIP preset! Activate your VIP Key in the Account tab to unlock deep, smooth sub-bass enhancement.");
      } else {
        setVipMessage("👑 Bass Gold is a premium Golden VIP preset! Activate your 30-day VIP Pro Key in the Profile tab to unlock deep, smooth sub-bass enhancement and the exclusive golden app theme.");
      }
      return;
    }
    setVipMessage(null);
    onChangeEq({
      preset: presetName,
      bands: { ...bands },
      goldBassActive: eqSettings.goldBassActive,
    });
  };

  const handleBackupDownload = () => {
    const dataStr = JSON.stringify(eqSettings, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `skplayer_eq_settings_${eqSettings.preset.toLowerCase().replace(/\s+/g, "_")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (
          imported &&
          typeof imported.preset === "string" &&
          imported.bands &&
          typeof imported.bands.hz60 === "number" &&
          typeof imported.bands.hz230 === "number" &&
          typeof imported.bands.hz910 === "number" &&
          typeof imported.bands.hz4k === "number" &&
          typeof imported.bands.hz14k === "number"
        ) {
          // Clamp values between -12 and 12
          const clamp = (val: number) => Math.max(-12, Math.min(12, val));
          const validatedSettings: EqSettings = {
            preset: imported.preset,
            bands: {
              hz60: clamp(imported.bands.hz60),
              hz230: clamp(imported.bands.hz230),
              hz910: clamp(imported.bands.hz910),
              hz4k: clamp(imported.bands.hz4k),
              hz14k: clamp(imported.bands.hz14k),
            },
            goldBassActive: imported.goldBassActive !== undefined ? !!imported.goldBassActive : false,
          };
          onChangeEq(validatedSettings);
        } else {
          alert("Invalid EQ settings file format.");
        }
      } catch (err) {
        console.error("Failed to parse imported EQ file:", err);
        alert("Could not load backup. Make sure it is a valid JSON file.");
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = "";
  };

  // Build the coordinates of the visualizer SVG curve
  // Width: 400, Height: 80
  // Left: 60Hz, Mid-Left: 230Hz, Mid: 910Hz, Mid-Right: 4kHz, Right: 14kHz
  const getCurvePath = () => {
    const values = [
      eqSettings.bands.hz60,
      eqSettings.bands.hz230,
      eqSettings.bands.hz910,
      eqSettings.bands.hz4k,
      eqSettings.bands.hz14k,
    ];
    // Map gains from [-12, 12] to [65, 15] range in height
    const points = values.map((val, idx) => {
      const x = 40 + idx * 80;
      // Normal/Flat (0dB) maps to centerY = 40
      const y = 40 - (val / 12) * 30;
      return { x, y };
    });

    // Create bezier curve representation
    let path = `M 0 40 L ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + 40;
      const cpY1 = p0.y;
      const cpX2 = p1.x - 40;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    path += ` L 400 40`;
    return path;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden glass-card rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh]">
        
        {/* Dynamic Glowing Accents */}
        <div className="absolute top-[-20%] left-[-20%] w-64 h-64 rounded-full bg-cyan-500/10 blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-64 h-64 rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none"></div>

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sliders className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                Pro Equalizer <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">FINE-TUNE YOUR LIQUID GLASS AUDIO</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="relative z-10 p-5 overflow-y-auto space-y-6 flex-1">
          
          {/* VIP Gold Bass Enhancer Toggle */}
          <div className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
            (isPro && eqSettings.goldBassActive) 
              ? "bg-gradient-to-br from-amber-500/15 via-yellow-600/10 to-transparent border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]" 
              : "bg-white/5 border-white/5 hover:border-amber-500/25"
          }`}>
            <div className="absolute top-[-50%] right-[-10%] w-32 h-32 rounded-full bg-amber-500/5 blur-[30px] pointer-events-none"></div>
            
            <div className="flex items-center justify-between gap-4 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <Crown className="w-4 h-4 text-amber-400 fill-amber-400/10" />
                  <span className="text-xs font-bold text-amber-400 tracking-wide uppercase">VIP Gold Bass Enhancer</span>
                  {!isPro && <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/20 font-bold">LOCKED</span>}
                </div>
                <p className="text-[10px] text-slate-300 max-w-xs leading-relaxed">
                  Adds high-fidelity 45Hz sub-bass depth that can run <span className="text-amber-300 font-semibold font-mono">on top of any equalizer preset</span>. Protected by a safety limiter to prevent audio breaking/distortion.
                </p>
              </div>

              <div className="flex flex-col items-end justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (!isPro) {
                      if (onUpgradeRequired) {
                        onUpgradeRequired("👑 VIP Gold Bass Enhancer is a premium Golden VIP effect! Activate your VIP Key in the Account tab to unlock deep, smooth sub-bass enhancement.");
                      } else {
                        setVipMessage("👑 VIP Gold Bass Enhancer is a premium Golden VIP effect! Activate your 30-day VIP Pro Key in the Profile tab to unlock deep, smooth sub-bass enhancement and the exclusive golden app theme.");
                      }
                      return;
                    }
                    setVipMessage(null);
                    onChangeEq({
                      ...eqSettings,
                      goldBassActive: !eqSettings.goldBassActive,
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    (isPro && eqSettings.goldBassActive) ? "bg-amber-500" : "bg-zinc-800"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      (isPro && eqSettings.goldBassActive) ? "translate-x-5 bg-amber-100" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-[8px] font-mono text-amber-400/80 mt-1 uppercase font-bold tracking-wider">
                  {(isPro && eqSettings.goldBassActive) ? "Active" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* Preset Buttons Grid */}
          <div className="space-y-2.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Presets</label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const isActive = eqSettings.preset === p.name;
                
                let buttonStyle = isActive
                  ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-400 border-cyan-500/30 font-bold"
                  : "bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:text-slate-100";

                return (
                  <button
                    key={p.name}
                    onClick={() => selectPreset(p.name, p.bands, p.isGold)}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all active:scale-95 flex items-center justify-center space-x-1 ${buttonStyle}`}
                  >
                    {isActive && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {vipMessage && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-medium flex flex-col space-y-1 animate-fade-in shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <div className="flex items-start space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
                <span className="leading-relaxed">{vipMessage}</span>
              </div>
            </div>
          )}

          {/* Interactive EQ Curve Visualizer */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center relative overflow-hidden">
            <div className="absolute top-1 right-2 text-[9px] font-mono text-slate-500 select-none">EQ CURVE PREVIEW</div>
            <svg
              viewBox="0 0 400 80"
              className="w-full h-16 text-cyan-400/80 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]"
            >
              {/* Horizontal center line (0dB) */}
              <line x1="0" y1="40" x2="400" y2="40" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
              {/* Guide lines for each band */}
              {[40, 120, 200, 280, 360].map((x) => (
                <line key={x} x1={x} y1="10" x2={x} y2="70" stroke="rgba(255,255,255,0.03)" />
              ))}
              {/* Equalizer Curve Path */}
              <path d={getCurvePath()} fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
            <div className="w-full flex justify-between px-6 text-[8px] font-mono text-slate-500 mt-1 select-none">
              <span>60Hz</span>
              <span>230Hz</span>
              <span>910Hz</span>
              <span>4kHz</span>
              <span>14kHz</span>
            </div>
          </div>

          {/* 5 Band Sliders */}
          <div className="space-y-4">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">Manual Frequency Gains</label>
            
            {/* 60Hz */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4">
              <div className="w-16">
                <div className="text-xs font-bold text-slate-200">60 Hz</div>
                <div className="text-[9px] text-slate-500 font-mono">Bass</div>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqSettings.bands.hz60}
                onChange={(e) => handleBandChange("hz60", parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg outline-none"
              />
              <div className="w-12 text-right text-xs font-mono font-bold text-cyan-400">
                {eqSettings.bands.hz60 > 0 ? `+${eqSettings.bands.hz60}` : eqSettings.bands.hz60} dB
              </div>
            </div>

            {/* 230Hz */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4">
              <div className="w-16">
                <div className="text-xs font-bold text-slate-200">230 Hz</div>
                <div className="text-[9px] text-slate-500 font-mono">Mid-Bass</div>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqSettings.bands.hz230}
                onChange={(e) => handleBandChange("hz230", parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg outline-none"
              />
              <div className="w-12 text-right text-xs font-mono font-bold text-cyan-400">
                {eqSettings.bands.hz230 > 0 ? `+${eqSettings.bands.hz230}` : eqSettings.bands.hz230} dB
              </div>
            </div>

            {/* 910Hz */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4">
              <div className="w-16">
                <div className="text-xs font-bold text-slate-200">910 Hz</div>
                <div className="text-[9px] text-slate-500 font-mono">Mids</div>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqSettings.bands.hz910}
                onChange={(e) => handleBandChange("hz910", parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg outline-none"
              />
              <div className="w-12 text-right text-xs font-mono font-bold text-cyan-400">
                {eqSettings.bands.hz910 > 0 ? `+${eqSettings.bands.hz910}` : eqSettings.bands.hz910} dB
              </div>
            </div>

            {/* 4kHz */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4">
              <div className="w-16">
                <div className="text-xs font-bold text-slate-200">4 kHz</div>
                <div className="text-[9px] text-slate-500 font-mono">Presence</div>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqSettings.bands.hz4k}
                onChange={(e) => handleBandChange("hz4k", parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg outline-none"
              />
              <div className="w-12 text-right text-xs font-mono font-bold text-cyan-400">
                {eqSettings.bands.hz4k > 0 ? `+${eqSettings.bands.hz4k}` : eqSettings.bands.hz4k} dB
              </div>
            </div>

            {/* 14kHz */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4">
              <div className="w-16">
                <div className="text-xs font-bold text-slate-200">14 kHz</div>
                <div className="text-[9px] text-slate-500 font-mono">Brilliance</div>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqSettings.bands.hz14k}
                onChange={(e) => handleBandChange("hz14k", parseInt(e.target.value))}
                className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg outline-none"
              />
              <div className="w-12 text-right text-xs font-mono font-bold text-cyan-400">
                {eqSettings.bands.hz14k > 0 ? `+${eqSettings.bands.hz14k}` : eqSettings.bands.hz14k} dB
              </div>
            </div>

          </div>

          {/* Backup Actions */}
          <div className="border-t border-white/5 pt-5 flex items-center justify-between gap-4">
            <div className="text-[10px] text-slate-400 font-mono font-bold">BACKUP & FILE UTILITIES</div>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <button
                type="button"
                onClick={handleImportClick}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center space-x-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import EQ</span>
              </button>
              <button
                type="button"
                onClick={handleBackupDownload}
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all text-xs flex items-center space-x-1.5 shadow-md shadow-cyan-500/10"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export EQ</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

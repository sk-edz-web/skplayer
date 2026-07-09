export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  audioUrl: string;
  imageUrl: string;
  duration: number; // in seconds
  createdAt: number;
  uploadedBy?: string;
  categories?: string[];
}

export interface Playlist {
  id: string;
  name: string;
  userId: string;
  songIds: string[];
  createdAt: number;
  thumbnailUrl?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: number;
  isPro?: boolean;
  proKey?: string;
  proActivatedAt?: number;
  proExpiresAt?: number;
}

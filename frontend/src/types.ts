export interface UserProfile {
  name: string;
  id: string;
  imageUrl: string;
  confidence?: number; // <--- ADDED THIS (Optional)
}

export interface AccessLog {
  id: string;
  time: string;
  status: 'granted' | 'denied' | 'in' | 'out'; // <--- Add 'in' and 'out'
  isUnknown: boolean;
  user: {
      name: string;
      id: string;
      imageUrl: string;
      confidence: number;
  };
}

export interface CameraStats {
  fps: number;
  latencyMs: number;
  encoderName: string;
}

// You can delete the separate 'User' interface if it's unused, 
// or keep it as an alias if other files need it.
export type User = UserProfile;
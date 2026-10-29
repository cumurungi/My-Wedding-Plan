export type User = { id: number; name: string; email: string; role: 'couple' | 'admin' };

export type WeddingProfile = {
  budgetRwf?: number | null;
  guestCount?: number | null;
  contactPhone?: string | null;
  budgetStatus?: 'pending' | 'proposed' | 'approved' | 'changes_requested' | null;
  weddingDate?: string | null;
  location?: string | null;
  style?: string | null;
  specialRequirements?: string | null;
  otherCostsDescription?: string | null;
  weddingFormat?: 'traditional_church_reception' | 'church_reception' | 'traditional_only' | 'other' | null;
  vendorNeeds?: string[];
};

export type WeddingDetails = {
  budgetRwf: number;
  guestCount: number;
  contactPhone: string;
  weddingDate: string;
  location: string;
  style: string;
  specialRequirements: string;
  otherCostsDescription: string;
  weddingFormat: 'traditional_church_reception' | 'church_reception' | 'traditional_only' | 'other';
  vendorNeeds: string[];
};

export function hasWeddingBasics(profile: WeddingProfile | null | undefined): boolean {
  return Boolean(profile?.budgetRwf && profile.guestCount && profile.location?.trim());
}

export const budgetCategories = [
  { category: 'Venue', percent: 4 },
  { category: 'Catering', percent: 40 },
  { category: 'Decoration', percent: 25 },
  { category: 'Florist & Flowers', percent: 2 },
  { category: 'Photography & Video', percent: 5 },
  { category: 'Makeup Artist', percent: 1 },
  { category: 'Hair Stylist', percent: 2 },
  { category: 'Transport', percent: 1 },
  { category: 'Cake', percent: 2 },
  { category: 'Traditional Dancers', percent: 1 },
  { category: 'Sound System', percent: 1 },
  { category: 'Music Band', percent: 1 },
  { category: 'DJ', percent: 2 },
  { category: 'MC', percent: 1 },
  { category: 'Wedding Services & Protocol', percent: 2 },
  { category: 'Drinks & Beverage Service', percent: 2 },
  { category: 'Lighting, Screens & Stage', percent: 2 },
  { category: 'Rings, Gifts & Souvenirs', percent: 2 },
  { category: 'Stationery & Invitations', percent: 1 },
  { category: 'Other Costs', percent: 2 },
  { category: 'Emergency Reserve', percent: 1 },
] as const;

export type PriceVendor = { id: number; businessName: string; category: string; priceFromRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest' };
export type PlannedAllocation = {
  category: string;
  percent: number;
  targetAmountRwf: number;
  plannedAmountRwf: number;
  vendorId: number | null;
  vendorName: string | null;
  verifiedPriceFromRwf: number | null;
  vendorEstimateRwf: number | null;
  pricingBasis: 'fixed' | 'per_guest';
  priceSource: 'verified_vendor' | 'budget_allocation' | 'reserve';
};

export function generateAllocations(budget: number, guestCount: number, vendors: PriceVendor[], selectedVendorIds?: Record<string, number | null>) {
  const allocations: PlannedAllocation[] = budgetCategories.map(({ category, percent }) => {
    const targetAmountRwf = Math.round(budget * percent / 100);
    let vendor: PriceVendor | undefined;
    if (category !== 'Emergency Reserve') {
      const selectedId = selectedVendorIds?.[category];
      if (selectedId != null) {
        vendor = vendors.find((candidate) => candidate.id === selectedId && candidate.category.toLocaleLowerCase() === category.toLocaleLowerCase());
      }
    }
    const verifiedPriceFromRwf = vendor?.priceFromRwf == null ? null : Number(vendor.priceFromRwf);
    const pricingBasis = vendor?.pricingBasis ?? 'fixed';
    const vendorEstimateRwf = verifiedPriceFromRwf == null ? null : verifiedPriceFromRwf * (pricingBasis === 'per_guest' ? guestCount : 1);
    return {
      category,
      percent,
      targetAmountRwf,
      plannedAmountRwf: vendorEstimateRwf ?? 0,
      vendorId: vendor?.id ?? null,
      vendorName: vendor?.businessName ?? null,
      verifiedPriceFromRwf,
      vendorEstimateRwf,
      pricingBasis,
      priceSource: category === 'Emergency Reserve' ? 'reserve' as const : vendorEstimateRwf !== null ? 'verified_vendor' as const : 'budget_allocation' as const,
    };
  });
  const plannedTotalRwf = allocations.reduce((total, allocation) => total + allocation.plannedAmountRwf, 0);
  return {
    allocations,
    plannedTotalRwf,
    isOverBudget: plannedTotalRwf > budget,
    missingPriceCategories: allocations.filter((item) => item.priceSource === 'budget_allocation').map((item) => item.category),
  };
}

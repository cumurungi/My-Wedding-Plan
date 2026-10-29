export const packagePlans = [
  {
    code: 'basic',
    name: 'Basic Plan',
    priceRwf: 200_000,
    description: 'Budget allocation and recommended vendors.',
    features: ['Budget allocation', 'Recommended vendors'],
  },
  {
    code: 'standard',
    name: 'Standard Plan',
    priceRwf: 400_000,
    description: 'A complete budget with vendor recommendations and personalized adjustments.',
    features: ['Everything in Basic', 'Personalized budget adjustments'],
  },
  {
    code: 'premium',
    name: 'Premium Plan',
    priceRwf: 1_000_000,
    description: 'Personalized planning assistance and ongoing coordination.',
    features: ['Everything in Standard', 'Personalized planning assistance', 'Ongoing coordination'],
  },
  {
    code: 'event_short',
    name: 'Short Event Plan',
    priceRwf: 100_000,
    description: 'A practical plan and vendor recommendations for a shorter event.',
    features: ['Event budget allocation', 'Recommended vendors', 'No ongoing coordination'],
  },
] as const;

export const packageCheckoutClaimStorageKey = 'my-wedding-plan-package-claim';
export type PackageCode = (typeof packagePlans)[number]['code'];
export type EventType = 'wedding' | 'birthday' | 'bridal_shower' | 'baby_shower' | 'meeting' | 'anniversary' | 'graduation' | 'other';
export const eventTypeLabels: Record<EventType, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  bridal_shower: 'Bridal shower',
  baby_shower: 'Baby shower',
  meeting: 'Meeting',
  anniversary: 'Anniversary',
  graduation: 'Graduation',
  other: 'Other event',
};
export type PackageOrderStatus = 'pending' | 'successful' | 'failed';
export type PackageOrderView = {
  id: number;
  code: PackageCode;
  name: string;
  priceRwf: number;
  status: PackageOrderStatus;
  paymentMethod: 'mtn_momo' | 'bank_transfer';
  phone?: string;
  payerReference?: string | null;
};
export type BankTransferDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
};
export type CouplePackageView = {
  plans: typeof packagePlans;
  activePackage: PackageOrderView | null;
  pendingOrder: PackageOrderView | null;
  paymentMethods: {
    mtnMomo: boolean;
    bankTransfer: BankTransferDetails | null;
  };
};

export function getPackagePlan(code: string) {
  return packagePlans.find((plan) => plan.code === code);
}
